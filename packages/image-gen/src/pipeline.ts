// Portrait generation pipeline — prompt → generate → store

import type { AssetStore, AssetMetadata } from '@ai-rpg-engine/asset-registry';
import type { PortraitRequest, ImageProvider, GenerationOptions } from './types.js';
import { buildPromptPair } from './prompt-builder.js';
import { PlaceholderProvider } from './placeholder-provider.js';

/**
 * Pick a usable image provider, degrading to a fallback when the preferred one
 * is offline.
 *
 * `generatePortrait`/`ensurePortrait` call `provider.generate()` unconditionally;
 * if you hand them, say, a {@link ComfyUIProvider} whose server is down, the
 * pipeline throws `fetch failed` deep in the call stack. That is a likely
 * consumer mistake (forgetting that a local generator may not be running), so
 * per the engine's warn-and-degrade contract this helper turns it into a safe
 * fallback instead of a crash: it awaits `preferred.isAvailable()` (treating a
 * thrown availability check as "unavailable") and returns `fallback` — the
 * always-on {@link PlaceholderProvider} by default — when the preferred provider
 * is not reachable.
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
 * @returns `preferred` if available, otherwise `fallback`.
 */
export async function resolveProvider(
  preferred: ImageProvider,
  fallback: ImageProvider = new PlaceholderProvider(),
): Promise<ImageProvider> {
  let available = false;
  try {
    available = await preferred.isAvailable();
  } catch {
    // A throwing availability probe (e.g. DNS failure) counts as unavailable;
    // never let provider selection itself crash the caller.
    available = false;
  }
  return available ? preferred : fallback;
}

export type PipelineOptions = {
  /** Override generation options. */
  generation?: GenerationOptions;
  /** Additional tags to attach to the stored asset. */
  extraTags?: string[];
};

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
  const { prompt, negativePrompt } = buildPromptPair(request);

  const genOpts: GenerationOptions = {
    width: 512,
    height: 512,
    negativePrompt,
    ...opts?.generation,
  };

  const result = await provider.generate(prompt, genOpts);

  const characterKey = `${request.characterName}::${request.archetypeName}`;

  const tags = [
    'portrait',
    request.genre,
    `char:${characterKey}`,
    ...request.tags.filter((t) => t !== 'player'),
    ...(opts?.extraTags ?? []),
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
 * Generate a portrait only if one doesn't already exist for this character.
 * Checks the store for an existing portrait with matching tags.
 * Returns existing metadata if found, otherwise generates a new one.
 */
export async function ensurePortrait(
  request: PortraitRequest,
  provider: ImageProvider,
  store: AssetStore,
  opts?: PipelineOptions,
): Promise<AssetMetadata> {
  // Look for an existing portrait with matching character tags
  const existing = await store.list({
    kind: 'portrait',
    tag: request.genre,
  });

  const characterKey = `char:${request.characterName}::${request.archetypeName}`;
  const match = existing.find(
    (m) => m.tags?.includes(characterKey),
  );

  if (match) return match;

  return generatePortrait(request, provider, store, opts);
}
