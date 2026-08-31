// @ai-rpg-engine/image-gen — headless portrait generation pipeline

export type {
  PortraitRequest,
  SceneRequest,
  IconRequest,
  GenerationOptions,
  ControlNetType,
  GenerationResult,
  GenerationFailure,
  GenerationSuccess,
  GenerationOutcome,
  ImageProvider,
  StylePreset,
} from './types.js';

export {
  buildPortraitPrompt,
  buildNegativePrompt,
  buildPromptPair,
  buildScenePrompt,
  buildIconPrompt,
  buildSceneNegativePrompt,
  buildIconNegativePrompt,
} from './prompt-builder.js';
export { STYLE_PRESETS, getStylePreset, getSceneStylePreset, getIconStylePreset } from './styles.js';
export { PlaceholderProvider } from './placeholder-provider.js';
export { ComfyUIProvider } from './comfyui-provider.js';
export type { ComfyUIProviderOptions } from './comfyui-provider.js';
export {
  generatePortrait,
  ensurePortrait,
  generateBackground,
  ensureBackground,
  generateIcon,
  ensureIcon,
  ensurePortraitVariant,
  ensureBackgroundVariant,
  ensureIconVariant,
  portraitIdentityTag,
  sceneIdentityTag,
  iconIdentityTag,
  portraitVariantIdentityTag,
  sceneIdentityVariantTag,
  iconIdentityVariantTag,
  resolveProvider,
  ImageGenError,
} from './pipeline.js';
export type {
  PipelineOptions,
  VariantPipelineOptions,
  ResolveProviderOptions,
  ResolveProviderFallbackInfo,
} from './pipeline.js';
export {
  generatePortraits,
  ensurePortraits,
  generateBackgrounds,
  ensureBackgrounds,
  generateIcons,
  ensureIcons,
  ensurePortraitVariants,
  ensureBackgroundVariants,
  ensureIconVariants,
  isPortraitBatchFailure,
  isSceneBatchFailure,
  isIconBatchFailure,
  isBatchFailure,
} from './batch.js';
export type {
  BatchOptions,
  BatchProgress,
  BatchFailure,
  BatchItem,
  BatchResult,
  PortraitBatchOptions,
  PortraitBatchProgress,
  PortraitBatchFailure,
  PortraitBatchItem,
  PortraitBatchResult,
  SceneBatchOptions,
  SceneBatchFailure,
  SceneBatchItem,
  SceneBatchResult,
  IconBatchOptions,
  IconBatchFailure,
  IconBatchItem,
  IconBatchResult,
  VariantJob,
  PortraitVariantJob,
  SceneVariantJob,
  IconVariantJob,
  PortraitVariantBatchResult,
  SceneVariantBatchResult,
  IconVariantBatchResult,
} from './batch.js';
