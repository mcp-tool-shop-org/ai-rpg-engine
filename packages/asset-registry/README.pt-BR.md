<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.md">English</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/asset-registry

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/asset-registry)](https://www.npmjs.com/package/@ai-rpg-engine/asset-registry)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

Registro de ativos endereçado por conteúdo para retratos, ícones e mídia no [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Instalação

```bash
npm install @ai-rpg-engine/asset-registry
```

## O que ele faz

Os ativos são armazenados por seu hash de conteúdo SHA-256 — bytes idênticos sempre correspondem ao mesmo endereço. Isso torna a desduplicação automática, as referências portáteis e o cache trivial. Dois backends de armazenamento estão incluídos: na memória (para testes e sessões temporárias) e sistema de arquivos (para armazenamento local persistente com diretórios de fragmentação).

## Uso

### Armazenar e recuperar ativos

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

### Persistência no sistema de arquivos

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

### Filtrar e pesquisar

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

### Endereçamento por conteúdo

```typescript
import { hashBytes, isValidHash } from '@ai-rpg-engine/asset-registry';

const hash = hashBytes(someBytes);       // SHA-256 hex digest
const valid = isValidHash(hash);          // true
const invalid = isValidHash('not-a-hash'); // false
```

## Tipos de ativos

| Tipo | Descrição |
|------|-------------|
| retrato | Retratos de personagens (jogador, NPC) |
| ícone | Ícones de interface do usuário, sprites de itens |
| fundo | Fundos de cenas, arte de zonas |
| áudio | Efeitos sonoros, trechos de música |
| documento | Arquivos de texto, modelos |

## Backends de armazenamento

| Backend | Caso de uso | Persistência |
|---------|----------|-------------|
| `MemoryAssetStore` | Testes, sessões temporárias | Nenhum (no processo) |
| `FileAssetStore` | Jogos locais, desenvolvimento | Sistema de arquivos |

Ambos os backends implementam a interface `AssetStore`, portanto, são intercambiáveis.

## Integração com a criação de personagens

O campo `portraitRef` em `CharacterBuild` armazena um hash de ativo. Use o registro para resolvê-lo:

```typescript
import { resolveEntity } from '@ai-rpg-engine/character-creation';

const entity = resolveEntity(build, catalog, ruleset);
const portraitHash = entity.custom?.portraitRef as string;

if (portraitHash) {
  const bytes = await store.get(portraitHash);
  // Render the portrait in your UI
}
```

## Parte do AI RPG Engine

Este pacote faz parte do monorepository [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine). Ele não possui dependências — funciona de forma independente ou se integra com os sistemas de criação e apresentação de personagens.

## Licença

MIT
