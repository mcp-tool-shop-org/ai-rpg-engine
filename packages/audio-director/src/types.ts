// Audio director types

export type AudioDomain = 'voice' | 'sfx' | 'ambient' | 'music';

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
  duckingRules?: DuckingRule[];
  domainPriorities?: Record<AudioDomain, number>;
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
