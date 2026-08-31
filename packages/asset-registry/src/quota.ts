// Store quota helpers — shared by MemoryAssetStore and FileAssetStore (F-158910cc)

import type { AssetMetadata, QuotaPolicy, StoreQuota } from './types.js';

/**
 * Typed failure when a put would exceed StoreQuota under policy `'reject'`,
 * or when `'evict-oldest'` still cannot free enough room for the incoming blob.
 */
export class OverQuotaError extends Error {
  readonly code = 'over_quota' as const;
  readonly sizeBytes: number;
  readonly count: number;
  readonly quota: StoreQuota;

  constructor(info: { sizeBytes: number; count: number; quota: StoreQuota }) {
    const limits: string[] = [];
    if (info.quota.maxBytes !== undefined) limits.push(`maxBytes=${info.quota.maxBytes}`);
    if (info.quota.maxCount !== undefined) limits.push(`maxCount=${info.quota.maxCount}`);
    super(
      `[asset-registry] store over quota (${limits.join(', ') || 'no limits'}): ` +
        `count=${info.count}, sizeBytes=${info.sizeBytes}. ` +
        (info.quota.policy === 'reject'
          ? 'policy=reject — delete assets or raise the quota.'
          : `policy=${info.quota.policy} could not free enough room for this put.`),
    );
    this.name = 'OverQuotaError';
    this.sizeBytes = info.sizeBytes;
    this.count = info.count;
    this.quota = info.quota;
  }
}

/** True when adding `extraCount` / `extraBytes` would exceed the quota ceilings. */
export function wouldExceedQuota(
  count: number,
  bytes: number,
  quota: StoreQuota | undefined,
  extraCount: number,
  extraBytes: number,
): boolean {
  if (!quota) return false;
  if (quota.maxCount !== undefined && count + extraCount > quota.maxCount) return true;
  if (quota.maxBytes !== undefined && bytes + extraBytes > quota.maxBytes) return true;
  return false;
}

/** True when quota eviction must skip this asset (F-0b108b56). */
export function isProtectedAsset(
  meta: AssetMetadata,
  keepHashes?: ReadonlySet<string>,
): boolean {
  if (meta.pinned === true || meta.keep === true) return true;
  if (meta.tags.includes('pinned') || meta.tags.includes('keep')) return true;
  if (keepHashes?.has(meta.hash)) return true;
  return false;
}

/** Recency key for LRU: last show, else createdAt (legacy sidecars). */
function recencyKey(meta: AssetMetadata): string {
  return meta.accessedAt ?? meta.createdAt;
}

/**
 * Oldest-first so evictUntil is deterministic across backends.
 * Pinned/keep assets and `keepHashes` are omitted so eviction cannot drop them.
 * `'evict-lru'` orders by `accessedAt` then `createdAt` then hash (F-caad5a4d);
 * every other policy keeps createdAt FIFO.
 */
export function sortOldestFirst(
  metas: readonly AssetMetadata[],
  keepHashes?: readonly string[],
  policy?: QuotaPolicy,
): AssetMetadata[] {
  const keep = keepHashes && keepHashes.length > 0 ? new Set(keepHashes) : undefined;
  const lru = policy === 'evict-lru';
  return metas
    .filter((m) => !isProtectedAsset(m, keep))
    .sort((a, b) => {
      if (lru) {
        const recency = recencyKey(a).localeCompare(recencyKey(b));
        if (recency !== 0) return recency;
      }
      return a.createdAt.localeCompare(b.createdAt) || a.hash.localeCompare(b.hash);
    });
}

/** Apply or clear pin/keep flags and the matching tags (F-0b108b56). */
export function applyPinFlags(meta: AssetMetadata, pinned: boolean): AssetMetadata {
  const tags = pinned
    ? (meta.tags.includes('pinned') ? [...meta.tags] : [...meta.tags, 'pinned'])
    : meta.tags.filter((t) => t !== 'pinned' && t !== 'keep');
  const next: AssetMetadata = { ...meta, tags };
  if (pinned) {
    next.pinned = true;
    next.keep = true;
  } else {
    delete next.pinned;
    delete next.keep;
  }
  return next;
}

/** First-write pin when the caller already tagged the asset `pinned`/`keep`. */
export function tagsRequestPin(tags: readonly string[] | undefined): boolean {
  return Boolean(tags?.includes('pinned') || tags?.includes('keep'));
}

/**
 * Ceilings that leave room for one incoming put of `incomingBytes`.
 * Used by evict-oldest put: shrink the live store first, then write.
 */
export function reserveQuota(quota: StoreQuota, incomingBytes: number): StoreQuota {
  return {
    policy: quota.policy,
    maxBytes: quota.maxBytes !== undefined ? Math.max(0, quota.maxBytes - incomingBytes) : undefined,
    maxCount: quota.maxCount !== undefined ? Math.max(0, quota.maxCount - 1) : undefined,
  };
}

/** True when a put should shrink the store before writing. */
export function isEvictingPolicy(policy: QuotaPolicy): boolean {
  return policy === 'evict-oldest' || policy === 'evict-lru';
}

/** Stamp last-access time (F-caad5a4d). */
export function stampAccessed(meta: AssetMetadata, at: string): AssetMetadata {
  return { ...meta, accessedAt: at };
}
