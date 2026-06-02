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
  validateManifest,
  isValidManifest,
  type ManifestError,
} from './validate.js';
