// Portrait generation pipeline — prompt → generate → store

import type { AssetStore, AssetMetadata } from '@ai-rpg-engine/asset-registry';
import type { PortraitRequest, ImageProvider, GenerationOptions } from './types.js';
import { buildPromptPair } from './prompt-builder.js';

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
