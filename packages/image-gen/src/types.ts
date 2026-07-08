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
  /**
   * RNG seed actually used. Providers that sample with a seed (ComfyUI) always
   * report the effective value — caller-supplied or the deterministically
   * derived default — so the image can be reproduced. Providers with no RNG
   * (placeholder) echo the caller's seed, which may be undefined.
   */
  seed?: number;
  /** Model name/identifier used. */
  model?: string;
  /** Generation time in milliseconds. */
  durationMs: number;
};

/**
 * Typed failure returned by providers instead of throwing raw network errors.
 * Mirrors the discriminated-union contract of the ollama client
 * (`packages/ollama/src/client.ts`): the network boundary reports failures as
 * values, so a flaky external daemon can never hang the caller or leak a raw
 * fetch `TypeError` / `SyntaxError` up the stack.
 */
export type GenerationFailure = {
  ok: false;
  /** Stable machine-readable failure category. */
  code: 'timeout' | 'http_error' | 'invalid_response' | 'network' | 'not_an_image' | 'image_too_large';
  /** Human-readable description of what went wrong. */
  error: string;
  /** Actionable recovery hint, when one exists. */
  hint?: string;
};

/** Successful generation — the result payload plus the `ok` discriminant. */
export type GenerationSuccess = { ok: true } & GenerationResult;

/** Discriminated union resolved by {@link ImageProvider.generate}. */
export type GenerationOutcome = GenerationSuccess | GenerationFailure;

/** Abstract image generation provider. */
export interface ImageProvider {
  /** Provider name (e.g. 'placeholder', 'comfyui', 'stable-diffusion'). */
  readonly name: string;
  /**
   * Generate an image from a text prompt.
   *
   * Contract: resolves to a discriminated union and MUST NOT throw or hang on
   * provider failure (offline daemon, timeout, malformed response) — report
   * `{ok: false}` with a stable `code` instead.
   */
  generate(prompt: string, opts?: GenerationOptions): Promise<GenerationOutcome>;
  /** Check if this provider is currently available. */
  isAvailable(): Promise<boolean>;
}

/** Style presets for common genres. */
export type StylePreset = {
  genre: string;
  style: string;
  negativePrompt: string;
};
