export type {
  SoundPackManifest,
  SoundEntry,
  SoundDomain,
  SoundIntensity,
  DurationClass,
  SoundSource,
  SoundQuery,
} from './types.js';

export {
  SoundRegistry,
  type LoadResult,
  type LoadOptions,
  type LoadWarning,
} from './registry.js';
export { CORE_SOUND_PACK } from './core-pack.js';
export {
  resolveSoundCue,
  extendCueMap,
  cueMapTargetIds,
  cueMapIsCoveredBy,
  EXACT_CUE_MAP,
  NAMESPACE_CUE_MAP,
  FALLBACK_CUE,
  KNOWN_EVENT_SOUND_CUES,
  type ResolvedSfxCue,
  type SfxCueTiming,
  type CueMatchTier,
} from './cue-map.js';
export {
  validateManifest,
  isValidManifest,
  type ManifestError,
} from './validate.js';
