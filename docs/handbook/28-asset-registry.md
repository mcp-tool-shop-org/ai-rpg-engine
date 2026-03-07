# Chapter 28 — Asset Registry

> Part VII — Systems

Content-addressed storage for portraits, icons, and media assets.

## Package

`@ai-rpg-engine/asset-registry` — standalone, zero dependencies.

```bash
npm install @ai-rpg-engine/asset-registry
```

## Content Addressing

Every asset is identified by its SHA-256 hash. Identical bytes always map to the same address, making deduplication automatic and references portable. There are no filenames to manage — the content is the identity.

## Storage Backends

| Backend | Use Case | Persistence |
|---------|----------|-------------|
| `MemoryAssetStore` | Testing, ephemeral sessions | None |
| `FileAssetStore` | Local games, development | Filesystem |

Both implement the `AssetStore` interface:

```typescript
interface AssetStore {
  put(data: Uint8Array, input: AssetInput): Promise<AssetMetadata>;
  get(hash: string): Promise<Uint8Array | null>;
  getMeta(hash: string): Promise<AssetMetadata | null>;
  has(hash: string): Promise<boolean>;
  list(filter?: AssetFilter): Promise<AssetMetadata[]>;
  delete(hash: string): Promise<boolean>;
  count(): Promise<number>;
}
```

## Asset Kinds

| Kind | Description |
|------|-------------|
| portrait | Character portraits (player, NPC) |
| icon | UI icons, item sprites |
| background | Scene backgrounds, zone art |
| audio | Sound effects, music clips |
| document | Text files, templates |

## Filesystem Layout

`FileAssetStore` uses 2-character shard directories to avoid OS limits on files per directory:

```
assets/
  a3/
    a3f2b8c1...64chars.bin    — raw bytes
    a3f2b8c1...64chars.json   — metadata sidecar
  f7/
    f7e9d041...64chars.bin
    f7e9d041...64chars.json
```

## Filtering

List assets by kind, tag, MIME type, or size range:

```typescript
const portraits = await store.list({ kind: 'portrait' });
const fantasy = await store.list({ tag: 'fantasy' });
const large = await store.list({ minSize: 100_000 });
```

## Integration with Character Creation

The `portraitRef` field on `CharacterBuild` stores an asset hash. After resolving a character entity, the UI layer fetches the actual image bytes from the store using the hash.

```typescript
const entity = resolveEntity(build, catalog, ruleset);
const hash = entity.custom?.portraitRef as string;
const bytes = hash ? await store.get(hash) : null;
```
