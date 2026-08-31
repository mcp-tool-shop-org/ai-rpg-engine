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
  SoundLookup,
} from './types.js';
import { DEFAULT_DOMAIN_PRIORITIES, DEFAULT_DUCKING_RULES } from './types.js';
import { scheduleAll, compareAudioCommands } from './scheduler.js';

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
  /** Current music stem resourceId (resolved hash or logical trackId). */
  private activeMusicId: string | null = null;
  private duckingRules: DuckingRule[];
  private domainPriorities: Record<AudioDomain, number>;
  private defaultCooldownMs: number;
  private cooldownOverrides: Record<string, number>;
  private onWarn?: (warning: ScheduleWarning) => void;
  private lastWarnings: ScheduleWarning[] = [];
  private soundRegistry?: SoundLookup;
  private variantRoll: number;

  constructor(config?: AudioDirectorConfig) {
    this.defaultCooldownMs = config?.defaultCooldownMs ?? 2000;
    this.cooldownOverrides = config?.cooldownMs ?? {};
    this.duckingRules = config?.duckingRules ?? [...DEFAULT_DUCKING_RULES];
    this.domainPriorities = config?.domainPriorities ?? { ...DEFAULT_DOMAIN_PRIORITIES };
    this.onWarn = config?.onWarn;
    this.soundRegistry = config?.soundRegistry;
    const roll = config?.variantRoll;
    this.variantRoll = typeof roll === 'number' && Number.isFinite(roll) ? roll : 0;
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
    const resolved = this.soundRegistry
      ? raw.map((cmd) => this.resolveCommand(cmd))
      : raw;

    // Filter out cooled-down resources
    const filtered = resolved.filter((cmd) => {
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

    // Music stem: a new play/crossfade stops the previous track with the
    // incoming fadeMs, then plays the new one (F-c53caff0). Cooldown clock
    // is not touched (OPEN F-a360ad62).
    const crossfadeStops: AudioCommand[] = [];
    for (const cmd of filtered) {
      if (cmd.domain !== 'music') continue;
      if (cmd.action === 'stop') {
        this.activeLayers.delete(cmd.resourceId);
        if (this.activeMusicId === cmd.resourceId) this.activeMusicId = null;
        continue;
      }
      if (cmd.action === 'play' || cmd.action === 'crossfade') {
        if (this.activeMusicId && this.activeMusicId !== cmd.resourceId) {
          this.activeLayers.delete(this.activeMusicId);
          const fadeMs = typeof cmd.params.fadeMs === 'number' ? cmd.params.fadeMs : 0;
          crossfadeStops.push({
            domain: 'music',
            action: 'stop',
            resourceId: this.activeMusicId,
            priority: cmd.priority,
            timing: cmd.timing,
            params: { fadeMs, reason: 'crossfade' },
          });
        }
        this.activeMusicId = cmd.resourceId;
        this.activeLayers.set(cmd.resourceId, {
          domain: 'music',
          resourceId: cmd.resourceId,
        });
      }
    }

    const all = [...crossfadeStops, ...filtered, ...ducking];
    all.sort(compareAudioCommands);
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

  /** Current music stem resourceId, or null when nothing is playing. */
  getActiveMusic(): string | null {
    return this.activeMusicId;
  }

  /**
   * Play a music sting — a short one-shot overlay (victory fanfare, defeat
   * stinger) that layers over whatever stem is already playing (F-fa44e956).
   *
   * Deliberately NOT routed through {@link schedule}'s NarrationPlan
   * pipeline: that music-domain loop owns the single-slot `activeMusicId`
   * bookkeeping (lines ~136-166) — any play/crossfade there stops the
   * previous track. A sting must never do that, so this method never reads
   * or writes `activeMusicId` / `activeLayers` at all. The returned command
   * carries a distinct `action: 'sting'` (never `'play'`/`'crossfade'`/
   * `'stop'`) so a host renderer can tell at a glance that this is a
   * fire-and-forget overlay, not a stem replacement.
   *
   * Resolves a file-source `resourceId` to its ingested hash via
   * `soundRegistry`, same as a normal play command. Does not touch the music
   * cooldown clock — matching the existing loop-stem gap (still OPEN
   * F-a360ad62, noted above `schedule`'s crossfade-stop block).
   *
   * @param resourceId A `domain: 'music'`, `durationClass: 'oneshot'` sound
   *                    id (e.g. a CORE_SOUND_PACK sting, or the result of
   *                    `SoundRegistry.pickMusicSting`).
   * @param opts        `priority` (default: the configured music domain
   *                     priority) and `fadeMs` (forwarded to the renderer for
   *                     a soft fade-in over the mix).
   */
  scheduleSting(resourceId: string, opts?: { priority?: number; fadeMs?: number }): AudioCommand {
    const raw: AudioCommand = {
      domain: 'music',
      action: 'play',
      resourceId,
      priority: opts?.priority ?? this.domainPriorities.music,
      timing: 0,
      params: opts?.fadeMs !== undefined ? { fadeMs: opts.fadeMs } : {},
    };
    const resolved = this.resolveCommand(raw);
    return { ...resolved, action: 'sting' };
  }

  /**
   * Insert a music sting into an already-scheduled AudioCommand array,
   * preserving {@link schedule}'s timing/priority ordering contract
   * (F-b4f0d758 / F-6d29e174).
   *
   * A bare `commands.push(director.scheduleSting(id))` — the only production
   * call site was doing exactly this (packages/terminal-ui/src/
   * presentation.ts's `TurnPresenter.present()`) — appends the sting AFTER
   * an array `schedule()` already sorted by `(timing, priority)`. Since a
   * sting always carries `timing: 0` (see {@link scheduleSting}, above), a
   * bare push silently puts it LAST whenever every other command in the
   * turn has a strictly later timing (any 'with-text' or 'after-text' sfx,
   * e.g. the real `combat.victory` cue, which soundpack-core's
   * EXACT_CUE_MAP marks 'after-text' — several seconds out for a typical
   * turn) — breaking the "ordered AudioCommands" contract every consumer of
   * `schedule()`'s return value relies on.
   *
   * This method is the correct merge seam: build the sting via
   * {@link scheduleSting}, push it into `commands`, then re-sort with the
   * SAME comparator ({@link compareAudioCommands}) `schedule()` itself uses.
   * `commands` is mutated in place AND returned, so a caller holding
   * `const audioCommands = director.schedule(...)` can swap a bare
   * `audioCommands.push(director.scheduleSting(id))` for
   * `director.scheduleStingInto(audioCommands, id)` as a single-line,
   * ordering-safe replacement — the array reference the caller already
   * holds stays valid without needing to consume a return value.
   *
   * @param commands   The AudioCommand array to insert into — typically the
   *                    return value of {@link schedule}. Mutated in place.
   * @param resourceId Forwarded to {@link scheduleSting}.
   * @param opts       Forwarded to {@link scheduleSting}.
   */
  scheduleStingInto(
    commands: AudioCommand[],
    resourceId: string,
    opts?: { priority?: number; fadeMs?: number },
  ): AudioCommand[] {
    const sting = this.scheduleSting(resourceId, opts);
    commands.push(sting);
    commands.sort(compareAudioCommands);
    return commands;
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

  /**
   * Rewrite a play command's resourceId from a logical effectId to an ingested
   * audio hash (or variant filename) when a file-source entry exists.
   */
  private resolveCommand(cmd: AudioCommand): AudioCommand {
    const registry = this.soundRegistry;
    if (!registry) return cmd;
    if (cmd.action !== 'play' && cmd.action !== 'crossfade' && cmd.action !== 'start') return cmd;
    if (
      cmd.domain !== 'sfx' &&
      cmd.domain !== 'ambient' &&
      cmd.domain !== 'music' &&
      cmd.domain !== 'voice'
    ) return cmd;
    const entry = registry.get(cmd.resourceId);
    if (!entry || entry.source !== 'file') return cmd;
    const variant = registry.pickVariant(cmd.resourceId, this.variantRoll);
    const hash = variant && entry.hashes ? entry.hashes[variant] : undefined;
    const resourceId = hash ?? variant ?? cmd.resourceId;
    if (resourceId === cmd.resourceId) return cmd;
    return {
      ...cmd,
      resourceId,
      params: {
        ...cmd.params,
        effectId: cmd.resourceId,
        ...(variant ? { variant } : {}),
        ...(hash ? { hash } : {}),
      },
    };
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
