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
  diffAmbientLayers,
  type LoadResult,
  type LoadOptions,
  type LoadWarning,
  type AmbientLayerDiff,
} from './registry.js';
export { CORE_SOUND_PACK } from './core-pack.js';
export {
  resolveSoundCue,
  extendCueMap,
  cueMapTargetIds,
  cueMapIsCoveredBy,
  cueMapCoverage,
  EXACT_CUE_MAP,
  NAMESPACE_CUE_MAP,
  FALLBACK_CUE,
  KNOWN_EVENT_SOUND_CUES,
  SCENE_BED_MAP,
  NAMESPACE_BED_MAP,
  resolveAmbientBed,
  sceneBedTargetIds,
  type ResolvedSfxCue,
  type SfxCueTiming,
  type CueMatchTier,
  type CueMapCoverage,
} from './cue-map.js';
export {
  validateManifest,
  isValidManifest,
  type ManifestError,
} from './validate.js';
export {
  loadJson,
  loadFile,
  scaffoldManifest,
  type LoadJsonOptions,
  type ScaffoldManifestOptions,
} from './authoring.js';
export {
  ingestFilePack,
  type AudioAssetSink,
  type IngestError,
  type IngestFilePackOptions,
  type IngestResult,
} from './ingest.js';
