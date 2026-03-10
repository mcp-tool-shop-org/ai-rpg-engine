<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.md">English</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/asset-registry

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/asset-registry)](https://www.npmjs.com/package/@ai-rpg-engine/asset-registry)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

Registro de recursos direccionado por contenido para retratos, iconos y medios en [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Instalación

```bash
npm install @ai-rpg-engine/asset-registry
```

## ¿Qué hace?

Los recursos se almacenan mediante su hash de contenido SHA-256; los mismos bytes siempre se mapean a la misma dirección. Esto hace que la deduplicación sea automática, las referencias sean portátiles y el almacenamiento en caché sea sencillo. Se incluyen dos sistemas de almacenamiento: en memoria (para pruebas y sesiones temporales) y sistema de archivos (para almacenamiento local persistente con directorios de particiones).

## Uso

### Almacenar y recuperar recursos

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

### Persistencia en el sistema de archivos

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

### Filtrado y búsqueda

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

### Direccionamiento por contenido

```typescript
import { hashBytes, isValidHash } from '@ai-rpg-engine/asset-registry';

const hash = hashBytes(someBytes);       // SHA-256 hex digest
const valid = isValidHash(hash);          // true
const invalid = isValidHash('not-a-hash'); // false
```

## Tipos de recursos

| Tipo | Descripción |
|------|-------------|
| retrato | Retratos de personajes (jugador, NPC) |
| icono | Iconos de la interfaz de usuario, sprites de objetos |
| fondo | Fondos de escenas, arte de zonas |
| audio | Efectos de sonido, fragmentos de música |
| documento | Archivos de texto, plantillas |

## Sistemas de almacenamiento

| Sistema | Caso de uso | Persistencia |
|---------|----------|-------------|
| `MemoryAssetStore` | Pruebas, sesiones temporales | Ninguno (en proceso) |
| `FileAssetStore` | Juegos locales, desarrollo | Sistema de archivos |

Ambos sistemas de almacenamiento implementan la interfaz `AssetStore`, por lo que son intercambiables.

## Integración con la creación de personajes

El campo `portraitRef` en `CharacterBuild` almacena un hash de recurso. Utilice el registro para resolverlo:

```typescript
import { resolveEntity } from '@ai-rpg-engine/character-creation';

const entity = resolveEntity(build, catalog, ruleset);
const portraitHash = entity.custom?.portraitRef as string;

if (portraitHash) {
  const bytes = await store.get(portraitHash);
  // Render the portrait in your UI
}
```

## Parte de AI RPG Engine

Este paquete es parte del monorepositorio [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine). No tiene dependencias; funciona de forma independiente o se integra con los sistemas de creación y presentación de personajes.

## Licencia

MIT
