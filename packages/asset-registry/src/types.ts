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
  /** Origin: generation prompt, URL, file path, or 'manual'. */
  source?: string;
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
  /** Store bytes and metadata. Returns the content-addressed metadata. Deduplicates by hash. */
  put(data: Uint8Array, input: AssetInput): Promise<AssetMetadata>;
  /** Retrieve raw bytes by hash. Returns null if not found, if `hash` is malformed, or (with `verify`) on an integrity mismatch. */
  get(hash: string, opts?: AssetGetOptions): Promise<Uint8Array | null>;
  /** Retrieve metadata by hash. Returns null if not found or `hash` is malformed. */
  getMeta(hash: string): Promise<AssetMetadata | null>;
  /** Check if an asset exists by hash. Malformed hashes are never "present". */
  has(hash: string): Promise<boolean>;
  /** List all assets matching an optional filter. */
  list(filter?: AssetFilter): Promise<AssetMetadata[]>;
  /** Remove an asset by hash. Returns true if it existed; false for malformed hashes. */
  delete(hash: string): Promise<boolean>;
  /** Total number of stored assets. */
  count(): Promise<number>;
}
