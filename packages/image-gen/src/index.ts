// @ai-rpg-engine/image-gen — headless portrait generation pipeline

export type {
  PortraitRequest,
  GenerationOptions,
  GenerationResult,
  GenerationFailure,
  GenerationSuccess,
  GenerationOutcome,
  ImageProvider,
  StylePreset,
} from './types.js';

export { buildPortraitPrompt, buildNegativePrompt, buildPromptPair } from './prompt-builder.js';
export { STYLE_PRESETS, getStylePreset } from './styles.js';
export { PlaceholderProvider } from './placeholder-provider.js';
export { ComfyUIProvider } from './comfyui-provider.js';
export type { ComfyUIProviderOptions } from './comfyui-provider.js';
export { generatePortrait, ensurePortrait, resolveProvider, ImageGenError } from './pipeline.js';
export type {
  PipelineOptions,
  ResolveProviderOptions,
  ResolveProviderFallbackInfo,
} from './pipeline.js';
