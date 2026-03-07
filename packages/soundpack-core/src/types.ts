// Sound pack manifest and registry types

/** A loadable collection of sound assets. */
export type SoundPackManifest = {
  name: string;
  version: string;
  description: string;
  author: string;
  entries: SoundEntry[];
};

/** A single sound asset in the registry. */
export type SoundEntry = {
  id: string;
  tags: string[];
  domain: SoundDomain;
  intensity: SoundIntensity;
  mood: string[];
  durationClass: DurationClass;
  cooldownMs: number;
  variants: string[];
  source: SoundSource;
  /** Maps to a voice-soundboard procedural effect name. */
  voiceSoundboardEffect?: string;
};

export type SoundDomain = 'sfx' | 'ambient' | 'music' | 'voice';
export type SoundIntensity = 'low' | 'medium' | 'high';
export type DurationClass = 'oneshot' | 'short-loop' | 'long-loop';
export type SoundSource = 'file' | 'procedural' | 'voice-soundboard';

/** Query for finding sounds in the registry. */
export type SoundQuery = {
  tags?: string[];
  domain?: SoundDomain;
  intensity?: SoundIntensity;
  mood?: string[];
};
