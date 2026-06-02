// Audio Director — cue scheduling with priority, cooldowns, and ducking

import type { NarrationPlan } from '@ai-rpg-engine/presentation';
import { validateNarrationPlan } from '@ai-rpg-engine/presentation';
import type {
  AudioCommand,
  AudioDomain,
  AudioDirectorConfig,
  CooldownEntry,
  DuckingRule,
  ScheduleWarning,
} from './types.js';
import { DEFAULT_DOMAIN_PRIORITIES, DEFAULT_DUCKING_RULES } from './types.js';
import { scheduleAll } from './scheduler.js';

/**
 * Deterministic audio cue scheduling engine.
 *
 * Time is an explicit input: callers pass `now` (a monotonic ms timestamp from
 * the game clock) to {@link schedule} and {@link isOnCooldown}. The class never
 * reads the wall clock, so identical inputs + identical `now` always produce the
 * identical command stream — a requirement of the engine's determinism contract.
 */
export class AudioDirector {
  private cooldowns = new Map<string, CooldownEntry>();
  private activeLayers = new Map<string, { domain: AudioDomain; resourceId: string }>();
  private duckingRules: DuckingRule[];
  private domainPriorities: Record<AudioDomain, number>;
  private defaultCooldownMs: number;
  private cooldownOverrides: Record<string, number>;
  private onWarn?: (warning: ScheduleWarning) => void;
  private lastWarnings: ScheduleWarning[] = [];

  constructor(config?: AudioDirectorConfig) {
    this.defaultCooldownMs = config?.defaultCooldownMs ?? 2000;
    this.cooldownOverrides = config?.cooldownMs ?? {};
    this.duckingRules = config?.duckingRules ?? [...DEFAULT_DUCKING_RULES];
    this.domainPriorities = config?.domainPriorities ?? { ...DEFAULT_DOMAIN_PRIORITIES };
    this.onWarn = config?.onWarn;
  }

  /** Resolve the cooldown for a resource: per-resource override, else the default. */
  private cooldownFor(resourceId: string): number {
    const override = this.cooldownOverrides[resourceId];
    return typeof override === 'number' ? override : this.defaultCooldownMs;
  }

  /**
   * Convert a NarrationPlan into sequenced AudioCommands, applying cooldowns and ducking.
   *
   * @param plan The narration plan to schedule.
   * @param now  Current time in ms from the caller's clock. Explicit (not wall
   *             time) so scheduling stays deterministic and replayable.
   */
  schedule(plan: NarrationPlan, now: number): AudioCommand[] {
    this.lastWarnings = [];

    // Guard the untrusted-input boundary. scheduleAll() reads plan.sceneText.split,
    // plan.sfx.map, plan.ambientLayers.map with no checks, so a plan a consumer
    // built by hand (missing a field) would crash with a raw ".map of undefined".
    const errors = validateNarrationPlan(plan);
    if (errors.length > 0) {
      // A non-object plan (null/undefined/primitive) has nothing schedulable and
      // would otherwise throw a raw TypeError downstream — hard-throw a structured
      // error instead, matching the engine's "invalid input that would crash anyway"
      // rule.
      const rootError = errors.find((e) => e.field === 'root');
      if (rootError) {
        throw new Error(
          `[audio-director] schedule() received an invalid NarrationPlan: ${rootError.message}. ` +
            `Pass a NarrationPlan object (see @ai-rpg-engine/presentation).`,
        );
      }

      // Otherwise it is an incomplete-but-object plan (a likely consumer mistake).
      // Degrade: surface each problem as a structured, actionable warning naming
      // the field, and return no commands rather than crashing on a missing array.
      for (const e of errors) {
        const warning: ScheduleWarning = {
          field: e.field,
          message: `${e.message} (audio-director skipped scheduling this plan; fix the field above)`,
        };
        this.lastWarnings.push(warning);
        this.onWarn?.(warning);
      }
      return [];
    }

    const raw = scheduleAll(plan, this.domainPriorities);

    // Filter out cooled-down resources
    const filtered = raw.filter((cmd) => {
      if (cmd.action !== 'play') return true;
      return !this.isOnCooldown(cmd.resourceId, now);
    });

    // Add ducking commands for active triggers
    const ducking = this.buildDuckingCommands(filtered);

    // Update cooldowns for played resources
    for (const cmd of filtered) {
      if (cmd.action === 'play' && cmd.domain === 'sfx') {
        this.cooldowns.set(cmd.resourceId, {
          resourceId: cmd.resourceId,
          lastPlayedMs: now,
          cooldownMs: this.cooldownFor(cmd.resourceId),
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

  /**
   * Check whether a resource is on cooldown at time `now`.
   *
   * @param resourceId The resource to check.
   * @param now        Current time in ms from the caller's clock (explicit, not
   *                   wall time) so the check is deterministic.
   */
  isOnCooldown(resourceId: string, now: number): boolean {
    const entry = this.cooldowns.get(resourceId);
    if (!entry) return false;
    return now - entry.lastPlayedMs < entry.cooldownMs;
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

  /**
   * Warnings raised by the most recent {@link schedule} call. Empty when the
   * last plan scheduled cleanly. Lets consumers that did not supply an `onWarn`
   * callback still inspect why an incomplete plan produced no commands.
   */
  getLastWarnings(): ScheduleWarning[] {
    return [...this.lastWarnings];
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
