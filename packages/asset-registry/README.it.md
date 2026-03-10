<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/asset-registry

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/asset-registry)](https://www.npmjs.com/package/@ai-rpg-engine/asset-registry)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

Registro di risorse indirizzato per contenuto, per ritratti, icone e media, utilizzato in [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Installazione

```bash
npm install @ai-rpg-engine/asset-registry
```

## Funzionalità

Le risorse sono memorizzate utilizzando l'hash SHA-256 del loro contenuto: byte identici corrispondono sempre allo stesso indirizzo. Questo rende la deduplicazione automatica, i riferimenti portabili e la memorizzazione nella cache estremamente semplice. Sono inclusi due sistemi di archiviazione: uno in memoria (per test e sessioni temporanee) e uno basato sul filesystem (per l'archiviazione locale persistente, con directory separate).

## Utilizzo

### Memorizzazione e recupero delle risorse

```typescript
import { MemoryAssetStore } from '@ai-rpg-engine/asset-registry';

const store = new MemoryAssetStore();

// Store portrait bytes
const pngBytes = await readFile('portrait.png');
const meta = await store.put(pngBytes, {
  kind: 'portrait',
  mimeType: 'image/png',
  width: 512,
  height: 512,
  tags: ['character', 'fantasy', 'knight'],
  source: 'generated',
});

console.log(meta.hash);  // 'a3f2b8c1...' (SHA-256 hex)

// Retrieve by hash
const bytes = await store.get(meta.hash);
const info = await store.getMeta(meta.hash);
```

### Persistenza tramite filesystem

```typescript
import { FileAssetStore } from '@ai-rpg-engine/asset-registry';

const store = new FileAssetStore('./assets');

// Directory layout:
//   assets/
//     a3/
//       a3f2b8c1...64chars.bin   — raw bytes
//       a3f2b8c1...64chars.json  — metadata sidecar

const meta = await store.put(bytes, { kind: 'portrait', mimeType: 'image/png' });
```

### Filtro e ricerca

```typescript
// List all portraits
const portraits = await store.list({ kind: 'portrait' });

// Filter by tag
const fantasy = await store.list({ tag: 'fantasy' });

// Filter by size range
const large = await store.list({ minSize: 100_000 });

// Filter by MIME type
const pngs = await store.list({ mimeType: 'image/png' });
```

### Indirizzamento basato sul contenuto

```typescript
import { hashBytes, isValidHash } from '@ai-rpg-engine/asset-registry';

const hash = hashBytes(someBytes);       // SHA-256 hex digest
const valid = isValidHash(hash);          // true
const invalid = isValidHash('not-a-hash'); // false
```

## Tipi di risorse

| Tipo | Descrizione |
|------|-------------|
| ritratto | Ritratti dei personaggi (giocatore, PNG) |
| icona | Icone dell'interfaccia utente, sprite degli oggetti |
| sfondo | Sfondi delle scene, elementi grafici delle zone |
| audio | Effetti sonori, clip musicali |
| documento | File di testo, modelli |

## Sistemi di archiviazione

| Sistema | Caso d'uso | Persistenza |
|---------|----------|-------------|
| `MemoryAssetStore` | Test, sessioni temporanee | Nessuno (in-process) |
| `FileAssetStore` | Giochi locali, sviluppo | Filesystem |

Entrambi i sistemi di archiviazione implementano l'interfaccia `AssetStore`, quindi sono intercambiabili.

## Integrazione con la creazione dei personaggi

Il campo `portraitRef` in `CharacterBuild` memorizza un hash della risorsa. Utilizzare il registro per risolverlo:

```typescript
import { resolveEntity } from '@ai-rpg-engine/character-creation';

const entity = resolveEntity(build, catalog, ruleset);
const portraitHash = entity.custom?.portraitRef as string;

if (portraitHash) {
  const bytes = await store.get(portraitHash);
  // Render the portrait in your UI
}
```

## Parte di AI RPG Engine

Questo pacchetto fa parte del monorepo [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine). Non ha dipendenze esterne e può essere utilizzato in modo autonomo o integrato con i sistemi di creazione e presentazione dei personaggi.

## Licenza

MIT
