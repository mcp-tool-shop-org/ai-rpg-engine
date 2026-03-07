// Audio Director — cue scheduling with priority, cooldowns, and ducking

import type { NarrationPlan } from '@ai-rpg-engine/presentation';
import type {
  AudioCommand,
  AudioDomain,
  AudioDirectorConfig,
  CooldownEntry,
  DuckingRule,
} from './types.js';
import { DEFAULT_DOMAIN_PRIORITIES, DEFAULT_DUCKING_RULES } from './types.js';
import { scheduleAll } from './scheduler.js';

/** Deterministic audio cue scheduling engine. */
export class AudioDirector {
  private cooldowns = new Map<string, CooldownEntry>();
  private activeLayers = new Map<string, { domain: AudioDomain; resourceId: string }>();
  private duckingRules: DuckingRule[];
  private domainPriorities: Record<AudioDomain, number>;
  private defaultCooldownMs: number;

  constructor(config?: AudioDirectorConfig) {
    this.defaultCooldownMs = config?.defaultCooldownMs ?? 2000;
    this.duckingRules = config?.duckingRules ?? [...DEFAULT_DUCKING_RULES];
    this.domainPriorities = config?.domainPriorities ?? { ...DEFAULT_DOMAIN_PRIORITIES };
  }

  /** Convert a NarrationPlan into sequenced AudioCommands, applying cooldowns and ducking. */
  schedule(plan: NarrationPlan): AudioCommand[] {
    const now = Date.now();
    const raw = scheduleAll(plan, this.domainPriorities);

    // Filter out cooled-down resources
    const filtered = raw.filter((cmd) => {
      if (cmd.action !== 'play') return true;
      return !this.isOnCooldown(cmd.resourceId);
    });

    // Add ducking commands for active triggers
    const ducking = this.buildDuckingCommands(filtered);

    // Update cooldowns for played resources
    for (const cmd of filtered) {
      if (cmd.action === 'play' && cmd.domain === 'sfx') {
        this.cooldowns.set(cmd.resourceId, {
          resourceId: cmd.resourceId,
          lastPlayedMs: now,
          cooldownMs: this.defaultCooldownMs,
        });
      }
    }

    // Track active ambient layers
    for (const cmd of filtered) {
      if (cmd.domain === 'ambient') {
        if (cmd.action === 'stop') {
          this.activeLayers.delete(cmd.resourceId);
        } else {
          this.activeLayers.set(cmd.resourceId, {
            domain: 'ambient',
            resourceId: cmd.resourceId,
          });
        }
      }
    }

    const all = [...filtered, ...ducking];
    all.sort((a, b) => a.timing - b.timing || b.priority - a.priority);
    return all;
  }

  /** Check if a resource is currently on cooldown. */
  isOnCooldown(resourceId: string): boolean {
    const entry = this.cooldowns.get(resourceId);
    if (!entry) return false;
    return Date.now() - entry.lastPlayedMs < entry.cooldownMs;
  }

  /** Register a ducking rule. */
  addDuckingRule(rule: DuckingRule): void {
    this.duckingRules.push(rule);
  }

  /** Get currently active audio layers. */
  getActiveLayers(): Map<string, { domain: AudioDomain; resourceId: string }> {
    return new Map(this.activeLayers);
  }

  /** Clear all cooldowns (e.g. on scene change). */
  clearCooldowns(): void {
    this.cooldowns.clear();
  }

  /** Build ducking commands based on active triggers. */
  private buildDuckingCommands(commands: AudioCommand[]): AudioCommand[] {
    const ducking: AudioCommand[] = [];
    const triggerDomains = new Set(commands.filter((c) => c.action === 'play').map((c) => c.domain));

    for (const rule of this.duckingRules) {
      if (triggerDomains.has(rule.trigger)) {
        ducking.push({
          domain: rule.target,
          action: 'duck',
          resourceId: '__all__',
          priority: this.domainPriorities[rule.trigger],
          timing: 0,
          params: { duckLevel: rule.duckLevel, fadeMs: rule.fadeMs },
        });
      }
    }

    return ducking;
  }
}
