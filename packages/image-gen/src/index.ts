// @ai-rpg-engine/image-gen — headless portrait generation pipeline

export type {
  PortraitRequest,
  SceneRequest,
  IconRequest,
  GenerationOptions,
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
  portraitIdentityTag,
  sceneIdentityTag,
  iconIdentityTag,
  portraitVariantIdentityTag,
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
  isPortraitBatchFailure,
} from './batch.js';
export type {
  PortraitBatchOptions,
  PortraitBatchProgress,
  PortraitBatchFailure,
  PortraitBatchItem,
  PortraitBatchResult,
} from './batch.js';
