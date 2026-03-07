// Image generation types — provider abstraction and portrait requests

/** What the caller provides to generate a portrait. */
export type PortraitRequest = {
  /** Character name. */
  characterName: string;
  /** Primary archetype name (e.g. 'Penitent Knight'). */
  archetypeName: string;
  /** Background origin name (e.g. 'Oath-Breaker'). */
  backgroundName: string;
  /** Trait names (e.g. ['Iron Frame', 'Cursed Blood']). */
  traits: string[];
  /** Secondary discipline name, if any. */
  disciplineName?: string;
  /** Cross-discipline title, if any (e.g. 'Grave Warden'). */
  title?: string;
  /** Resolved character tags. */
  tags: string[];
  /** Genre from pack metadata (e.g. 'fantasy', 'cyberpunk'). */
  genre: string;
  /** Art style override (e.g. 'oil painting', 'pixel art'). */
  style?: string;
};

/** Options for image generation. */
export type GenerationOptions = {
  /** Image width in pixels. Default: 512. */
  width?: number;
  /** Image height in pixels. Default: 512. */
  height?: number;
  /** RNG seed for reproducibility. */
  seed?: number;
  /** Negative prompt (things to avoid). */
  negativePrompt?: string;
  /** Sampling steps (diffusion models). */
  steps?: number;
  /** Classifier-free guidance scale (diffusion models). */
  cfgScale?: number;
};

/** Result from an image provider. */
export type GenerationResult = {
  /** Raw image bytes. */
  image: Uint8Array;
  /** MIME type of the generated image. */
  mimeType: string;
  /** Image width in pixels. */
  width: number;
  /** Image height in pixels. */
  height: number;
  /** The prompt that was used for generation. */
  prompt: string;
  /** Negative prompt if used. */
  negativePrompt?: string;
  /** RNG seed used. */
  seed?: number;
  /** Model name/identifier used. */
  model?: string;
  /** Generation time in milliseconds. */
  durationMs: number;
};

/** Abstract image generation provider. */
export interface ImageProvider {
  /** Provider name (e.g. 'placeholder', 'comfyui', 'stable-diffusion'). */
  readonly name: string;
  /** Generate an image from a text prompt. */
  generate(prompt: string, opts?: GenerationOptions): Promise<GenerationResult>;
  /** Check if this provider is currently available. */
  isAvailable(): Promise<boolean>;
}

/** Style presets for common genres. */
export type StylePreset = {
  genre: string;
  style: string;
  negativePrompt: string;
};
