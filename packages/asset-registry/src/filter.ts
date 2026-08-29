// Shared filter / tag-merge helpers for asset stores

import type { AssetMetadata, AssetFilter } from './types.js';

/**
 * Union incoming tags onto an existing list, preserving existing order.
 * Returns null when there is nothing new to add (F-930e6b5b).
 */
export function unionTags(
  existing: readonly string[],
  incoming: readonly string[] | undefined,
): string[] | null {
  if (!incoming || incoming.length === 0) return null;
  const seen = new Set(existing);
  const extra = incoming.filter((t) => !seen.has(t));
  if (extra.length === 0) return null;
  return [...existing, ...extra];
}

/** Copy metadata so callers cannot mutate a stored handle (F-b2b8a190). */
export function cloneMetadata(m: AssetMetadata): AssetMetadata {
  return { ...m, tags: [...m.tags] };
}

/** Check if metadata matches a filter. */
export function matchesFilter(meta: AssetMetadata, filter: AssetFilter): boolean {
  if (filter.kind && meta.kind !== filter.kind) return false;
  if (filter.tag && !meta.tags.includes(filter.tag)) return false;
  if (filter.mimeType && meta.mimeType !== filter.mimeType) return false;
  if (filter.minSize !== undefined && meta.sizeBytes < filter.minSize) return false;
  if (filter.maxSize !== undefined && meta.sizeBytes > filter.maxSize) return false;
  return true;
}
