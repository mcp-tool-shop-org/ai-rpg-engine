// Audio director types

export type AudioDomain = 'voice' | 'sfx' | 'ambient' | 'music';

/**
 * A structured, actionable warning surfaced when {@link AudioDirector.schedule}
 * receives a plan it cannot fully schedule (e.g. a missing array field).
 */
export type ScheduleWarning = {
  /** The offending field (e.g. `sfx`, `ambientLayers`). */
  field: string;
  /** What is wrong and how to fix it. */
  message: string;
};

/** A scheduled audio command to be executed by the renderer. */
export type AudioCommand = {
  domain: AudioDomain;
  action: string;
  resourceId: string;
  priority: number;
  timing: number;
  params: Record<string, unknown>;
};

/** Rule for ducking one domain when another plays. */
export type DuckingRule = {
  trigger: AudioDomain;
  target: AudioDomain;
  duckLevel: number;
  fadeMs: number;
};

/** Tracks cooldown for a resource to prevent spamming. */
export type CooldownEntry = {
  resourceId: string;
  lastPlayedMs: number;
  cooldownMs: number;
};

/** Configuration for the AudioDirector. */
export type AudioDirectorConfig = {
  defaultCooldownMs?: number;
  /**
   * Per-resource cooldown overrides keyed by resourceId. A resource not listed
   * here falls back to `defaultCooldownMs`. Lets distinct sounds (e.g. a 200ms
   * UI click vs a 5000ms critical alert) carry their own cooldown — mirrors
   * `SoundEntry.cooldownMs` from soundpack-core without coupling the packages.
   */
  cooldownMs?: Record<string, number>;
  duckingRules?: DuckingRule[];
  domainPriorities?: Record<AudioDomain, number>;
  /**
   * Optional sink for structured warnings raised during {@link AudioDirector.schedule}
   * (e.g. an incomplete plan). Lets dev tooling surface the warning without the
   * director writing to a console — keeping it deterministic. Warnings are also
   * always retrievable via `getLastWarnings()`.
   */
  onWarn?: (warning: ScheduleWarning) => void;
};

/** Default domain priorities (higher number = higher priority). */
export const DEFAULT_DOMAIN_PRIORITIES: Record<AudioDomain, number> = {
  voice: 100,
  sfx: 75,
  music: 50,
  ambient: 25,
};

/** Default ducking rules. */
export const DEFAULT_DUCKING_RULES: DuckingRule[] = [
  { trigger: 'voice', target: 'ambient', duckLevel: 0.3, fadeMs: 300 },
  { trigger: 'voice', target: 'music', duckLevel: 0.4, fadeMs: 300 },
  { trigger: 'sfx', target: 'ambient', duckLevel: 0.6, fadeMs: 150 },
];
