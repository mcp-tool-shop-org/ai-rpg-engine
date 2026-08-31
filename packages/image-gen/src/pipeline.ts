// Portrait generation pipeline — prompt → generate → store

import type { AssetStore, AssetMetadata } from '@ai-rpg-engine/asset-registry';
import type { PortraitRequest, SceneRequest, IconRequest, ImageProvider, GenerationOptions, GenerationFailure } from './types.js';
import {
  buildPromptPair,
  buildNegativePrompt,
  buildScenePrompt,
  buildSceneNegativePrompt,
  buildIconPrompt,
  buildIconNegativePrompt,
  sanitize,
  resolvedPortraitStyle,
  resolvedSceneStyle,
  resolvedIconStyle,
} from './prompt-builder.js';
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
const ENGINE_OWNED_PREFIXES = ['char:', 'provider:', 'model:', 'zone:', 'item:', 'variant:'] as const;

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
function resolveGenerationBase(
  generation: GenerationOptions | undefined,
  defaults: { width: number; height: number; negativePrompt: string },
): GenerationOptions {
  const resolved: GenerationOptions = {
    width: finiteOr(generation?.width, defaults.width) ?? defaults.width,
    height: finiteOr(generation?.height, defaults.height) ?? defaults.height,
    steps: finiteOr(generation?.steps, 20) ?? 20,
    cfgScale: finiteOr(generation?.cfgScale, 7) ?? 7,
    negativePrompt: generation?.negativePrompt !== undefined
      ? generation.negativePrompt
      : defaults.negativePrompt,
  };
  const seed = finiteOr(generation?.seed, null);
  if (seed !== null) resolved.seed = seed;
  const model = generation?.model;
  if (typeof model === 'string' && model.length > 0) resolved.model = model;
  const denoise = finiteOr(generation?.denoise, null);
  if (denoise !== null) resolved.denoise = denoise;
  if (generation?.initImage) resolved.initImage = generation.initImage;
  return resolved;
}

function resolveGeneration(
  request: PortraitRequest,
  generation?: GenerationOptions,
): GenerationOptions {
  return resolveGenerationBase(generation, {
    width: 512,
    height: 512,
    negativePrompt: buildNegativePrompt(request),
  });
}

/** Checkpoint/model the provider will actually sample with (F-b36de2d4). */
function resolveProviderModel(provider: ImageProvider, generation?: GenerationOptions): string {
  const fromGen = generation?.model;
  if (typeof fromGen === 'string' && fromGen.length > 0) return fromGen;
  const fromProvider = provider.model;
  if (typeof fromProvider === 'string' && fromProvider.length > 0) return fromProvider;
  return '';
}

function matchesProviderModel(meta: AssetMetadata, providerName: string, model: string): boolean {
  if (!meta.tags.includes(`provider:${providerName}`)) return false;
  if (!model) return !meta.tags.some((t) => t.startsWith('model:'));
  return meta.tags.includes(`model:${model}`);
}

/** True when the stored blob is present and still matches its content address. */
async function readableMeta(store: AssetStore, meta: AssetMetadata): Promise<AssetMetadata | undefined> {
  const bytes = await store.get(meta.hash, { verify: true });
  return bytes ? meta : undefined;
}

/**
 * Delimiter-safe portrait identity tag (F-525d6bb6, F-930e6b5b, F-e9ea394a,
 * F-a623fcff, F-5cafb6fc). JSON-encodes every prompt-affecting field plus every
 * generation field that reaches the provider (width/height/seed/steps/cfgScale/
 * negativePrompt) so `Alice::Mage` + `Wizard` cannot collide with `Alice` +
 * `Mage::Wizard`, Queen vs Beggar cannot share a hash, and steps:20 vs
 * steps:50 cannot return the other render. Name/title/discipline/background/
 * traits/style go through the same sanitize() as the generation prompt, so
 * `Alice` and `Alice:` (or `Alice()`) share one identity key matching the
 * bytes that actually land in the provider. Style is the resolved provider
 * string (omitted falls through to the genre preset; empty-string is a real
 * override), so chargen `style:''` cannot reuse the preset-painted bytes.
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
    resolvedPortraitStyle(request),
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
  const model = resolveProviderModel(provider, genOpts);
  if (model && genOpts.model === undefined) genOpts.model = model;

  const result = await provider.generate(prompt, genOpts);
  if (!result.ok) throw new ImageGenError(result);

  // Mark WHO produced this asset (v2.6 Stage C F-6c3d9a48): without a
  // registry-level tell, a degraded placeholder was indistinguishable from a
  // real render, and ensurePortrait would treat it as final forever. The
  // 'placeholder' tag is what lets a later real render replace it.
  // Written only for the engine PlaceholderProvider (F-541dc81c) — a real
  // SVG illustrator must not be tagged degraded just because its mime is svg.
  const isPlaceholderResult = provider.name === 'placeholder';

  // Engine-owned tags (`char:`, `provider:`, `placeholder`) are written here
  // only. Caller tags and extraTags that use those prefixes are stripped so
  // they cannot poison identity matching (F-525d6bb6). Genre lives inside
  // the char: JSON — never as a free-form tag — so genre:'placeholder'
  // cannot mark a real PNG as degraded (F-a55397ab).
  const tags = [
    'portrait',
    portraitIdentityTag(request, opts?.generation),
    `provider:${provider.name}`,
    ...(model ? [`model:${model}`] : []),
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
 * Fallback for assets stored before tagging existed: SVG with no
 * non-placeholder `provider:` tag (F-541dc81c — a tagged vector-art SVG
 * is a real render and must not re-queue).
 */
function isPlaceholderAsset(m: AssetMetadata): boolean {
  if (m.tags?.includes('placeholder')) return true;
  if (m.mimeType !== 'image/svg+xml') return false;
  const providerTag = (m.tags ?? []).find((t) => t.startsWith('provider:'));
  if (providerTag && providerTag !== 'provider:placeholder') return false;
  return true;
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
  const model = resolveProviderModel(provider, opts?.generation);
  const matches = await store.list({
    kind: 'portrait',
    tag: characterKey,
  });

  const reals = matches.filter((m) => !isPlaceholderAsset(m));
  if (provider.name !== 'placeholder') {
    // Same-named providers with different checkpoints must not reuse each
    // other's bytes (F-b36de2d4). Provider+model tags, not the char: JSON,
    // so a real render still wins when a later call is handed a placeholder
    // (F-6c3d9a48).
    const keyed = reals.filter((m) => matchesProviderModel(m, provider.name, model));
    for (const m of keyed) {
      const hit = await readableMeta(store, m);
      if (hit) return hit;
    }
  } else {
    for (const m of reals) {
      const hit = await readableMeta(store, m);
      if (hit) return hit;
    }
  }

  // Only a placeholder is cached. Reuse it when this call would just make
  // another placeholder; regenerate when a real provider is available.
  // F-88cc4bdd: a sidecar without bytes is not a finished portrait — fall
  // through to generatePortrait rather than returning unreadable metadata.
  const cachedPlaceholder = matches.find((m) => isPlaceholderAsset(m));
  if (cachedPlaceholder && provider.name === 'placeholder') {
    const hit = await readableMeta(store, cachedPlaceholder);
    if (hit) return hit;
  }

  return generatePortrait(request, provider, store, opts);
}

export function sceneIdentityTag(
  request: SceneRequest,
  generation?: GenerationOptions,
): string {
  const g = resolveGenerationBase(generation, {
    width: 768,
    height: 512,
    negativePrompt: buildSceneNegativePrompt(request),
  });
  return `zone:${JSON.stringify([
    sanitize(request.zoneId),
    sanitize(request.locationName ?? ''),
    sanitize(request.description),
    request.genre,
    resolvedSceneStyle(request),
    g.width,
    g.height,
    g.seed ?? null,
    g.steps,
    g.cfgScale,
    g.negativePrompt ?? '',
  ])}`;
}

export function iconIdentityTag(
  request: IconRequest,
  generation?: GenerationOptions,
): string {
  const g = resolveGenerationBase(generation, {
    width: 256,
    height: 256,
    negativePrompt: buildIconNegativePrompt(request),
  });
  return `item:${JSON.stringify([
    sanitize(request.itemId),
    sanitize(request.name),
    sanitize(request.description ?? ''),
    request.genre,
    resolvedIconStyle(request),
    g.width,
    g.height,
    g.seed ?? null,
    g.steps,
    g.cfgScale,
    g.negativePrompt ?? '',
  ])}`;
}

export function portraitVariantIdentityTag(
  baseHash: string,
  variant: string,
  request: PortraitRequest,
  generation?: GenerationOptions,
): string {
  const g = resolveGeneration(request, generation);
  return `variant:${JSON.stringify([
    baseHash,
    sanitize(variant),
    portraitIdentityTag(request, generation),
    g.denoise ?? null,
  ])}`;
}

async function putGenerated(
  kind: 'portrait' | 'background' | 'icon',
  identityTag: string,
  requestTags: readonly string[] | undefined,
  provider: ImageProvider,
  store: AssetStore,
  prompt: string,
  genOpts: GenerationOptions,
  extraTags?: readonly string[],
): Promise<AssetMetadata> {
  const model = resolveProviderModel(provider, genOpts);
  if (model && genOpts.model === undefined) genOpts.model = model;
  const result = await provider.generate(prompt, genOpts);
  if (!result.ok) throw new ImageGenError(result);
  const isPlaceholderResult = provider.name === 'placeholder';
  const tags = [
    kind,
    identityTag,
    `provider:${provider.name}`,
    ...(model ? [`model:${model}`] : []),
    ...(isPlaceholderResult ? ['placeholder'] : []),
    ...callerTags(requestTags),
    ...callerTags(extraTags),
  ];
  return store.put(result.image, {
    kind,
    mimeType: result.mimeType,
    width: result.width,
    height: result.height,
    tags,
    source: result.prompt,
  });
}

async function ensureByIdentity(
  kind: 'portrait' | 'background' | 'icon',
  identityTag: string,
  provider: ImageProvider,
  store: AssetStore,
  generate: () => Promise<AssetMetadata>,
  generation?: GenerationOptions,
): Promise<AssetMetadata> {
  const model = resolveProviderModel(provider, generation);
  const matches = await store.list({ kind, tag: identityTag });
  const reals = matches.filter((m) => !isPlaceholderAsset(m));
  if (provider.name !== 'placeholder') {
    const keyed = reals.filter((m) => matchesProviderModel(m, provider.name, model));
    for (const m of keyed) {
      const hit = await readableMeta(store, m);
      if (hit) return hit;
    }
  } else {
    for (const m of reals) {
      const hit = await readableMeta(store, m);
      if (hit) return hit;
    }
  }
  const cachedPlaceholder = matches.find((m) => isPlaceholderAsset(m));
  if (cachedPlaceholder && provider.name === 'placeholder') {
    const hit = await readableMeta(store, cachedPlaceholder);
    if (hit) return hit;
  }
  return generate();
}

/** Generate a zone background and store it as kind `'background'`. */
export async function generateBackground(
  request: SceneRequest,
  provider: ImageProvider,
  store: AssetStore,
  opts?: PipelineOptions,
): Promise<AssetMetadata> {
  const genOpts = resolveGenerationBase(opts?.generation, {
    width: 768,
    height: 512,
    negativePrompt: buildSceneNegativePrompt(request),
  });
  return putGenerated(
    'background',
    sceneIdentityTag(request, opts?.generation),
    request.tags,
    provider,
    store,
    buildScenePrompt(request),
    genOpts,
    opts?.extraTags,
  );
}

/** Generate only if no matching zone background exists. */
export async function ensureBackground(
  request: SceneRequest,
  provider: ImageProvider,
  store: AssetStore,
  opts?: PipelineOptions,
): Promise<AssetMetadata> {
  return ensureByIdentity(
    'background',
    sceneIdentityTag(request, opts?.generation),
    provider,
    store,
    () => generateBackground(request, provider, store, opts),
    opts?.generation,
  );
}

/** Generate an item icon and store it as kind `'icon'`. */
export async function generateIcon(
  request: IconRequest,
  provider: ImageProvider,
  store: AssetStore,
  opts?: PipelineOptions,
): Promise<AssetMetadata> {
  const genOpts = resolveGenerationBase(opts?.generation, {
    width: 256,
    height: 256,
    negativePrompt: buildIconNegativePrompt(request),
  });
  return putGenerated(
    'icon',
    iconIdentityTag(request, opts?.generation),
    request.tags,
    provider,
    store,
    buildIconPrompt(request),
    genOpts,
    opts?.extraTags,
  );
}

/** Generate only if no matching item icon exists. */
export async function ensureIcon(
  request: IconRequest,
  provider: ImageProvider,
  store: AssetStore,
  opts?: PipelineOptions,
): Promise<AssetMetadata> {
  return ensureByIdentity(
    'icon',
    iconIdentityTag(request, opts?.generation),
    provider,
    store,
    () => generateIcon(request, provider, store, opts),
    opts?.generation,
  );
}

export type VariantPipelineOptions = PipelineOptions & {
  /** Variant slot (e.g. `'scarred'`, `'aged'`, `'disguise'`, `'dead'`). */
  variant: string;
};

/**
 * Img2img portrait variant keyed by `baseHash` + variant slot (F-9daede34).
 * Loads the base asset as `initImage` unless the caller already supplied one.
 */
export async function ensurePortraitVariant(
  baseHash: string,
  request: PortraitRequest,
  provider: ImageProvider,
  store: AssetStore,
  opts: VariantPipelineOptions,
): Promise<AssetMetadata> {
  const identity = portraitVariantIdentityTag(baseHash, opts.variant, request, opts.generation);
  const existing = await ensureByIdentity(
    'portrait',
    identity,
    provider,
    store,
    async () => {
      const generation: GenerationOptions = { ...opts.generation };
      if (!generation.initImage) {
        const base = await store.get(baseHash, { verify: true });
        if (!base) {
          throw new Error(`[image-gen] ensurePortraitVariant: no asset at hash ${baseHash}`);
        }
        generation.initImage = base;
      }
      if (generation.denoise === undefined) generation.denoise = 0.55;
      const genOpts = resolveGeneration(request, generation);
      const { prompt } = buildPromptPair(request);
      const meta = await putGenerated(
        'portrait',
        identity,
        request.tags,
        provider,
        store,
        prompt,
        genOpts,
        opts.extraTags,
      );
      return meta;
    },
    opts.generation,
  );
  return existing;
}
