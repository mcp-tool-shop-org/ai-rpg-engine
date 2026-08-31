// Asset registry types — content-addressed storage for game media

/** Supported asset categories. */
export type AssetKind = 'portrait' | 'icon' | 'background' | 'audio' | 'document';

export const VALID_ASSET_KINDS: AssetKind[] = [
  'portrait', 'icon', 'background', 'audio', 'document',
];

/** Metadata stored alongside asset bytes. Hash is the content address. */
export type AssetMetadata = {
  /** SHA-256 hex digest of the raw bytes — the content address. */
  hash: string;
  /** Asset category. */
  kind: AssetKind;
  /** MIME type (e.g. 'image/png', 'audio/ogg'). */
  mimeType: string;
  /** Image width in pixels (images only). */
  width?: number;
  /** Image height in pixels (images only). */
  height?: number;
  /** Raw byte size. */
  sizeBytes: number;
  /** Free-form tags for filtering. */
  tags: string[];
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /**
   * ISO 8601 last-access timestamp (F-caad5a4d). Stamped by {@link AssetStore.get}
   * and {@link AssetStore.touch}. Quota policy `'evict-lru'` sorts on this so a
   * last-shown unpinned portrait survives later batch junk. Pin still forever.
   */
  accessedAt?: string;
  /** Origin: generation prompt, URL, file path, or 'manual'. */
  source?: string;
  /**
   * Quota pin (F-0b108b56). When true, evict-oldest / {@link AssetStore.evictUntil}
   * skip this asset so a first portrait or live zone background is not dropped
   * for later batch junk. Hash identity is unchanged.
   */
  pinned?: boolean;
  /** Alias of {@link AssetMetadata.pinned} — hosts may set either. */
  keep?: boolean;
};

/** Lightweight reference to an asset — just hash + kind. */
export type AssetRef = {
  hash: string;
  kind: AssetKind;
};

/** Filter criteria for listing assets. */
export type AssetFilter = {
  kind?: AssetKind;
  tag?: string;
  mimeType?: string;
  minSize?: number;
  maxSize?: number;
};

/** Input for storing a new asset (hash and size computed automatically). */
export type AssetInput = {
  kind: AssetKind;
  mimeType: string;
  width?: number;
  height?: number;
  tags?: string[];
  source?: string;
};

/** Options for {@link AssetStore.get}. */
export type AssetGetOptions = {
  /**
   * Re-hash the bytes on read and return null on mismatch, proving the bytes
   * still match their content address (bit-rot / swapped-file detection).
   * Default: false — skip the extra hash on hot paths.
   */
  verify?: boolean;
  /**
   * Stamp `accessedAt` on a successful read (F-caad5a4d). Default: true.
   * Hash-hit put paths pass false so a CAS identity check is not a "show".
   */
  touch?: boolean;
};

/**
 * Capacity limit for an {@link AssetStore} backend (F-158910cc).
 * `maxBytes` / `maxCount` omitted means that axis is unbounded.
 * CAS hash identity is unchanged — a hash-hit put never consumes quota.
 */
export type QuotaPolicy = 'reject' | 'evict-oldest' | 'evict-lru';

export type StoreQuota = {
  maxBytes?: number;
  maxCount?: number;
  policy: QuotaPolicy;
};

/**
 * Abstract storage backend. All methods are async to support remote backends.
 *
 * Hash contract: `hash` parameters are SHA-256 hex digests (`/^[a-f0-9]{64}$/`).
 * Implementations MUST treat anything else as "not found" (null/false no-op) —
 * a malformed hash must never reach path construction or any other backend
 * addressing scheme.
 */
export interface AssetStore {
  /**
   * Store bytes and metadata. Returns the content-addressed metadata.
   * Deduplicates by hash. On a hash hit, unions incoming tags into the stored
   * metadata (F-930e6b5b); other fields stay first-writer-wins.
   */
  put(data: Uint8Array, input: AssetInput): Promise<AssetMetadata>;
  /** Retrieve raw bytes by hash. Returns null if not found, if `hash` is malformed, or (with `verify`) on an integrity mismatch. */
  get(hash: string, opts?: AssetGetOptions): Promise<Uint8Array | null>;
  /** Retrieve metadata by hash. Returns null if not found, `hash` is malformed, or the stored metadata is corrupt/wrong-shaped. */
  getMeta(hash: string): Promise<AssetMetadata | null>;
  /**
   * Check if an asset's BYTES exist by hash. Malformed hashes are never
   * "present". Guarantees the blob only — metadata may still be missing or
   * corrupt, so `has(h) === true` does not imply `getMeta(h) !== null`.
   */
  has(hash: string): Promise<boolean>;
  /** List all assets matching an optional filter. */
  list(filter?: AssetFilter): Promise<AssetMetadata[]>;
  /** Remove an asset by hash. Returns true if it existed; false for malformed hashes. */
  delete(hash: string): Promise<boolean>;
  /** Total number of stored assets. */
  count(): Promise<number>;
  /** Sum of stored `sizeBytes` (blob lengths). */
  totalBytes(): Promise<number>;
  /**
   * Delete oldest assets until the store is within `quota.maxBytes` /
   * `quota.maxCount`. `'evict-oldest'` orders by `createdAt` then hash;
   * `'evict-lru'` orders by `accessedAt` then `createdAt` then hash (F-caad5a4d).
   * Returns how many assets were removed. File backends delete blob + sidecar;
   * memory backends drop both maps. Pinned / keep assets and `keepHashes` are
   * never deleted (F-0b108b56).
   */
  evictUntil(quota: StoreQuota, keepHashes?: readonly string[]): Promise<number>;
  /**
   * Mark an asset as pinned/keep so quota eviction skips it (F-0b108b56).
   * Returns false when the hash is missing or malformed.
   */
  pin(hash: string): Promise<boolean>;
  /** Clear the pin/keep flags (and the `pinned`/`keep` tags). */
  unpin(hash: string): Promise<boolean>;
  /**
   * Stamp `accessedAt` so `'evict-lru'` can keep last-shown portraits (F-caad5a4d).
   * Returns false when the hash is missing or malformed.
   */
  touch(hash: string): Promise<boolean>;
  /** Stamp many hashes; returns how many were updated. */
  touch(hashes: readonly string[]): Promise<number>;
}
