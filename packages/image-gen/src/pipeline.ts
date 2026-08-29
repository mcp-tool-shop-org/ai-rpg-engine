// Portrait generation pipeline — prompt → generate → store

import type { AssetStore, AssetMetadata } from '@ai-rpg-engine/asset-registry';
import type { PortraitRequest, ImageProvider, GenerationOptions, GenerationFailure } from './types.js';
import { buildPromptPair, buildNegativePrompt, sanitize } from './prompt-builder.js';
import { PlaceholderProvider } from './placeholder-provider.js';

/**
 * Typed error thrown by the pipeline when a provider reports a failure.
 * Carries the provider's stable failure `code` and optional recovery `hint`
 * so callers can branch (retry, degrade, surface) without string-matching —
 * and so a flaky daemon surfaces as one named error type instead of a raw
 * fetch `TypeError` from deep inside the pipeline.
 */
export class ImageGenError extends Error {
  readonly code: GenerationFailure['code'];
  readonly hint?: string;

  constructor(failure: GenerationFailure) {
    // Fold the recovery hint into the message (v2.6 Stage C F-72a9c4d0):
    // consumers that log err.message — and every uncaught-exception display —
    // otherwise show only 'ComfyUI request failed: fetch failed' while the
    // actionable 'Is ComfyUI running at ...?' hint is dropped at the last hop.
    // The structured `.hint` field is kept for callers that branch on it.
    super(failure.hint ? `${failure.error} — ${failure.hint}` : failure.error);
    this.name = 'ImageGenError';
    this.code = failure.code;
    this.hint = failure.hint;
  }
}

/** What the pipeline knows about a provider degradation it is about to make. */
export type ResolveProviderFallbackInfo = {
  /** Name of the provider that was skipped. */
  preferred: string;
  /** Name of the provider selected instead. */
  fallback: string;
  /** Why the preferred provider was skipped. */
  reason: string;
};

export type ResolveProviderOptions = {
  onFallback?: (info: ResolveProviderFallbackInfo) => void;
};

function defaultOnFallback(info: ResolveProviderFallbackInfo): void {
  console.error(
    `[image-gen] provider "${info.preferred}" unavailable (${info.reason}); `
    + `falling back to "${info.fallback}"`,
  );
}

/**
 * Pick a usable image provider, degrading to a fallback when the preferred one
 * is offline.
 *
 * `generatePortrait`/`ensurePortrait` call `provider.generate()` unconditionally;
 * if you hand them, say, a {@link ComfyUIProvider} whose server is down, the
 * pipeline throws a typed {@link ImageGenError} (code `'network'`). That is a
 * likely consumer mistake (forgetting that a local generator may not be
 * running), so per the engine's warn-and-degrade contract this helper turns it
 * into a safe fallback instead of an error: it awaits `preferred.isAvailable()`
 * (treating a thrown availability check as "unavailable") and returns
 * `fallback` — the always-on {@link PlaceholderProvider} by default — when the
 * preferred provider is not reachable.
 *
 * Use it at the seam where you choose a provider:
 * ```ts
 * const provider = await resolveProvider(new ComfyUIProvider());
 * await generatePortrait(req, provider, store); // never throws on offline ComfyUI
 * ```
 *
 * @param preferred The provider you would like to use (e.g. ComfyUI).
 * @param fallback  Used when `preferred` is unavailable. Defaults to a new
 *                  {@link PlaceholderProvider}, which is always available.
 * @param opts      `onFallback` observes the degradation. The engine contract
 *                  is warn-AND-degrade: the default emits a one-line stderr
 *                  breadcrumb naming the skipped provider, why, and the
 *                  fallback (v2.6 Stage C F-6c3d9a48 — the swap used to be
 *                  fully silent). Pass a no-op to silence it, or your own
 *                  hook to route it elsewhere.
 * @returns `preferred` if available, otherwise `fallback`.
 */
export async function resolveProvider(
  preferred: ImageProvider,
  fallback: ImageProvider = new PlaceholderProvider(),
  opts?: ResolveProviderOptions,
): Promise<ImageProvider> {
  const onFallback = opts?.onFallback ?? defaultOnFallback;
  let available = false;
  let reason = 'isAvailable() returned false';
  try {
    available = await preferred.isAvailable();
  } catch (err) {
    // A throwing availability probe (e.g. DNS failure) counts as unavailable;
    // never let provider selection itself crash the caller.
    available = false;
    reason = `availability check threw: ${err instanceof Error ? err.message : String(err)}`;
  }
  if (!available) {
    onFallback({ preferred: preferred.name, fallback: fallback.name, reason });
    return fallback;
  }
  return preferred;
}

export type PipelineOptions = {
  /** Override generation options. */
  generation?: GenerationOptions;
  /**
   * Additional tags to attach to the stored asset. Never used as identity
   * keys — engine-owned prefixes (`char:`, `provider:`) and the
   * `placeholder` tag are stripped (F-525d6bb6).
   */
  extraTags?: string[];
};

const ENGINE_OWNED_EXACT = new Set(['placeholder', 'player']);
const ENGINE_OWNED_PREFIXES = ['char:', 'provider:'] as const;

function isEngineOwnedTag(tag: string): boolean {
  if (ENGINE_OWNED_EXACT.has(tag)) return true;
  return ENGINE_OWNED_PREFIXES.some((prefix) => tag.startsWith(prefix));
}

function callerTags(tags: readonly string[] | undefined): string[] {
  if (!tags || tags.length === 0) return [];
  return tags.filter((t) => !isEngineOwnedTag(t));
}

/** Finite number, else `fallback`. `undefined` and NaN/Infinity both miss. */
function finiteOr(value: number | undefined, fallback: number | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Generation options that actually reach the provider (F-a623fcff).
 * Matches generatePortrait's merge: width/height 512, steps 20, cfgScale 7,
 * negativePrompt from buildNegativePrompt when omitted. Non-finite numbers
 * coerce to those defaults so JSON.stringify cannot collapse NaN/Infinity
 * onto `null` while the provider still sees the raw non-finite value.
 */
function resolveGeneration(
  request: PortraitRequest,
  generation?: GenerationOptions,
): GenerationOptions {
  const resolved: GenerationOptions = {
    width: finiteOr(generation?.width, 512) ?? 512,
    height: finiteOr(generation?.height, 512) ?? 512,
    steps: finiteOr(generation?.steps, 20) ?? 20,
    cfgScale: finiteOr(generation?.cfgScale, 7) ?? 7,
    negativePrompt: generation?.negativePrompt !== undefined
      ? generation.negativePrompt
      : buildNegativePrompt(request),
  };
  const seed = finiteOr(generation?.seed, null);
  if (seed !== null) resolved.seed = seed;
  return resolved;
}

/**
 * Delimiter-safe portrait identity tag (F-525d6bb6, F-930e6b5b, F-e9ea394a,
 * F-a623fcff). JSON-encodes every prompt-affecting field plus every generation
 * field that reaches the provider (width/height/seed/steps/cfgScale/
 * negativePrompt) so `Alice::Mage` + `Wizard` cannot collide with `Alice` +
 * `Mage::Wizard`, Queen vs Beggar cannot share a hash, and steps:20 vs
 * steps:50 cannot return the other render. Name/title/discipline/background/
 * traits/style go through the same sanitize() as the generation prompt, so
 * `Alice` and `Alice:` (or `Alice()`) share one identity key matching the
 * bytes that actually land in the provider.
 */
export function portraitIdentityTag(
  request: PortraitRequest,
  generation?: GenerationOptions,
): string {
  const g = resolveGeneration(request, generation);
  return `char:${JSON.stringify([
    sanitize(request.characterName),
    sanitize(request.archetypeName),
    request.genre,
    request.title ? sanitize(request.title) : '',
    request.disciplineName ? sanitize(request.disciplineName) : '',
    sanitize(request.backgroundName),
    request.traits.map(sanitize),
    sanitize(request.style ?? ''),
    g.width,
    g.height,
    g.seed ?? null,
    g.steps,
    g.cfgScale,
    g.negativePrompt ?? '',
  ])}`;
}

/**
 * Generate a portrait and store it in the asset registry.
 * Returns the content-addressed metadata (hash is the portraitRef).
 */
export async function generatePortrait(
  request: PortraitRequest,
  provider: ImageProvider,
  store: AssetStore,
  opts?: PipelineOptions,
): Promise<AssetMetadata> {
  const { prompt } = buildPromptPair(request);
  const genOpts = resolveGeneration(request, opts?.generation);

  const result = await provider.generate(prompt, genOpts);
  if (!result.ok) throw new ImageGenError(result);

  // Mark WHO produced this asset (v2.6 Stage C F-6c3d9a48): without a
  // registry-level tell, a degraded placeholder was indistinguishable from a
  // real render, and ensurePortrait would treat it as final forever. The
  // 'placeholder' tag is what lets a later real render replace it.
  const isPlaceholderResult = provider.name === 'placeholder'
    || result.mimeType === 'image/svg+xml';

  // Engine-owned tags (`char:`, `provider:`, `placeholder`) are written here
  // only. Caller tags and extraTags that use those prefixes are stripped so
  // they cannot poison identity matching (F-525d6bb6). Genre lives inside
  // the char: JSON — never as a free-form tag — so genre:'placeholder'
  // cannot mark a real PNG as degraded (F-a55397ab).
  const tags = [
    'portrait',
    portraitIdentityTag(request, opts?.generation),
    `provider:${provider.name}`,
    ...(isPlaceholderResult ? ['placeholder'] : []),
    ...callerTags(request.tags),
    ...callerTags(opts?.extraTags),
  ];

  const metadata = await store.put(result.image, {
    kind: 'portrait',
    mimeType: result.mimeType,
    width: result.width,
    height: result.height,
    tags,
    source: result.prompt,
  });

  return metadata;
}

/**
 * True when a stored asset is a degraded placeholder, not a real render.
 * Primary signal: the 'placeholder' tag written by {@link generatePortrait}.
 * Fallback signal for assets stored before tagging existed: the
 * PlaceholderProvider is the pipeline's only SVG producer, so
 * `image/svg+xml` identifies legacy placeholders too.
 */
function isPlaceholderAsset(m: AssetMetadata): boolean {
  return (m.tags?.includes('placeholder') ?? false) || m.mimeType === 'image/svg+xml';
}

/**
 * Generate a portrait only if one doesn't already exist for this character.
 * Checks the store for an existing portrait with matching tags.
 * Returns existing metadata if found, otherwise generates a new one.
 *
 * Placeholder-poisoning guard (v2.6 Stage C F-6c3d9a48): a placeholder cached
 * during a provider outage is NOT treated as final. It is reused only while
 * the caller's provider would produce another placeholder anyway; as soon as
 * a real provider is passed, the portrait is regenerated and the real render
 * becomes the preferred match from then on. Without this, one ComfyUI outage
 * permanently filled the registry with initials-on-a-color-square SVGs that
 * no code path would ever regenerate.
 */
export async function ensurePortrait(
  request: PortraitRequest,
  provider: ImageProvider,
  store: AssetStore,
  opts?: PipelineOptions,
): Promise<AssetMetadata> {
  // Look for an existing portrait with this identity. Filter by the char:
  // tag (not genre) so a genre of 'placeholder' cannot collide with the
  // engine-owned placeholder marker (F-a55397ab).
  const characterKey = portraitIdentityTag(request, opts?.generation);
  const matches = await store.list({
    kind: 'portrait',
    tag: characterKey,
  });

  // A real render always wins.
  const real = matches.find((m) => !isPlaceholderAsset(m));
  if (real) return real;

  // Only a placeholder is cached. Reuse it when this call would just make
  // another placeholder; regenerate when a real provider is available.
  const cachedPlaceholder = matches[0];
  if (cachedPlaceholder && provider.name === 'placeholder') {
    return cachedPlaceholder;
  }

  return generatePortrait(request, provider, store, opts);
}
