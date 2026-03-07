// Shared filter logic for asset stores

import type { AssetMetadata, AssetFilter } from './types.js';

/** Check if metadata matches a filter. */
export function matchesFilter(meta: AssetMetadata, filter: AssetFilter): boolean {
  if (filter.kind && meta.kind !== filter.kind) return false;
  if (filter.tag && !meta.tags.includes(filter.tag)) return false;
  if (filter.mimeType && meta.mimeType !== filter.mimeType) return false;
  if (filter.minSize !== undefined && meta.sizeBytes < filter.minSize) return false;
  if (filter.maxSize !== undefined && meta.sizeBytes > filter.maxSize) return false;
  return true;
}
