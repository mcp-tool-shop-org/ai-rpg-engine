<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.md">English</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/asset-registry

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/asset-registry)](https://www.npmjs.com/package/@ai-rpg-engine/asset-registry)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

Registre d'actifs adressé par contenu pour les portraits, les icônes et les médias, utilisé dans [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Installation

```bash
npm install @ai-rpg-engine/asset-registry
```

## Fonctionnalités

Les actifs sont stockés en fonction de leur hachage SHA-256. Des octets identiques correspondent toujours à la même adresse. Cela permet une déduplication automatique, des références portables et une mise en cache simplifiée. Deux systèmes de stockage sont inclus : en mémoire (pour les tests et les sessions temporaires) et système de fichiers (pour le stockage local persistant avec des répertoires de fragments).

## Utilisation

### Stockage et récupération des actifs

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

### Persistance sur le système de fichiers

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

### Filtrage et recherche

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

### Adressage par contenu

```typescript
import { hashBytes, isValidHash } from '@ai-rpg-engine/asset-registry';

const hash = hashBytes(someBytes);       // SHA-256 hex digest
const valid = isValidHash(hash);          // true
const invalid = isValidHash('not-a-hash'); // false
```

## Types d'actifs

| Type | Description |
|------|-------------|
| portrait | Portraits de personnages (joueur, PNJ) |
| icon | Icônes d'interface utilisateur, sprites d'objets |
| background | Arrières-plans de scènes, illustrations de zones |
| audio | Effets sonores, extraits musicaux |
| document | Fichiers texte, modèles |

## Systèmes de stockage

| Système | Cas d'utilisation | Persistance |
|---------|----------|-------------|
| `MemoryAssetStore` | Tests, sessions temporaires | Aucun (en mémoire) |
| `FileAssetStore` | Jeux locaux, développement | Système de fichiers |

Les deux systèmes de stockage implémentent l'interface `AssetStore`, ils sont donc interchangeables.

## Intégration avec la création de personnages

Le champ `portraitRef` dans `CharacterBuild` stocke un hachage d'actif. Utilisez le registre pour le résoudre :

```typescript
import { resolveEntity } from '@ai-rpg-engine/character-creation';

const entity = resolveEntity(build, catalog, ruleset);
const portraitHash = entity.custom?.portraitRef as string;

if (portraitHash) {
  const bytes = await store.get(portraitHash);
  // Render the portrait in your UI
}
```

## Fait partie de AI RPG Engine

Ce paquet fait partie du dépôt monorepo [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine). Il n'a aucune dépendance et peut être utilisé de manière autonome ou intégré aux systèmes de création et de présentation de personnages.

## Licence

MIT
