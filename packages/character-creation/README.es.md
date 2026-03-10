<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.md">English</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/character-creation

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/character-creation)](https://www.npmjs.com/package/@ai-rpg-engine/character-creation)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

Sistema de creación de personajes sin interfaz — arquetipos, orígenes, rasgos, especialización múltiple y validación de la configuración para [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Instalación

```bash
npm install @ai-rpg-engine/character-creation
```

## ¿Qué hace?

Los personajes no son hojas de cálculo; son identidades. Este paquete gestiona la fusión estructurada del arquetipo principal, el origen, los rasgos de personalidad y la disciplina secundaria opcional en una entidad de jugador validada. Cada combinación de arquetipo + disciplina produce un título que sintetiza la identidad del personaje, en lugar de simplemente sumar números.

## Uso

### Validar una configuración

```typescript
import { validateBuild } from '@ai-rpg-engine/character-creation';
import { content, buildCatalog } from '@ai-rpg-engine/starter-fantasy';

const build = {
  name: 'Aldric',
  archetypeId: 'penitent-knight',
  backgroundId: 'oath-breaker',
  traitIds: ['iron-frame', 'cursed-blood'],
  disciplineId: 'occultist',
  statAllocations: { vigor: 2, instinct: 1 },
};

const result = validateBuild(build, buildCatalog, content.ruleset);
// result.ok === true
// result.resolvedTitle === 'Grave Warden'
// result.finalStats === { vigor: 8, instinct: 6, will: 1 }
// result.resolvedTags includes 'martial', 'oath-broken', 'curse-touched', 'grave-warden'
```

### Convertir a EntityState

```typescript
import { resolveEntity } from '@ai-rpg-engine/character-creation';

const entity = resolveEntity(build, buildCatalog, content.ruleset);
// Full EntityState ready for the engine:
// entity.id === 'player'
// entity.blueprintId === 'penitent-knight'
// entity.stats, entity.resources, entity.tags, entity.inventory all computed
// entity.custom === { archetypeId, backgroundId, disciplineId, title, portraitRef }
```

### Explorar las opciones disponibles

```typescript
import {
  getAvailableArchetypes,
  getAvailableBackgrounds,
  getAvailableTraits,
  getAvailableDisciplines,
  getStatBudgetRemaining,
} from '@ai-rpg-engine/character-creation';

const archetypes = getAvailableArchetypes(buildCatalog);
const backgrounds = getAvailableBackgrounds(buildCatalog);
const traits = getAvailableTraits(buildCatalog, ['iron-frame']); // filters incompatible
const disciplines = getAvailableDisciplines(buildCatalog, 'penitent-knight', ['martial']);
const remaining = getStatBudgetRemaining(build, buildCatalog); // points left to allocate
```

### Serializar para archivos de guardado

```typescript
import { serializeBuild, deserializeBuild, validateSerializedBuild } from '@ai-rpg-engine/character-creation';

const json = serializeBuild(build);
const restored = deserializeBuild(json);
const check = validateSerializedBuild(json); // { ok: true, errors: [] }
```

## Conceptos

| Concepto | Descripción |
|---------|-------------|
| **Archetype** | Clase principal: estadísticas base, etiquetas iniciales, árbol de progresión. |
| **Background** | Historia de origen: modificadores de estadísticas, etiquetas iniciales, inventario opcional. |
| **Trait** | Ventaja o desventaja: efectos en estadísticas, recursos, etiquetas, verbos o facciones. |
| **Discipline** | Clase secundaria: 1 verbo otorgado, 1 efecto pasivo, 1 desventaja. |
| **Cross-Title** | Identidad sintetizada a partir del arquetipo + disciplina (por ejemplo, "Guardián de la Tumba"). |
| **Entanglement** | Efecto de fricción de ciertas combinaciones de arquetipo + disciplina. |
| **Build Catalog** | Menú específico del paquete con todas las opciones de personaje. |

## Especialización múltiple

El sistema utiliza la fusión estructurada de la identidad, no la suma aditiva:

- El **arquetipo principal** define la identidad central (estadísticas base, árbol de progresión, etiquetas iniciales).
- La **disciplina secundaria** es compacta: 1 verbo, 1 efecto pasivo, 1 desventaja.
- Cada combinación produce un **título de disciplina cruzada** ("Pistola Hex", "Cirujano Sináptico", "Mariscal de Cuarentena").
- Algunas combinaciones crean **entrelazamientos**: efectos narrativos de fricción.

## Efectos de los rasgos

| Tipo | Ejemplo |
|------|---------|
| modificador de estadística | `{ stat: 'dex', amount: 1 }` |
| modificador de recurso | `{ resource: 'hp', amount: -3 }` |
| otorgar etiqueta | `{ tag: 'curse-touched' }` |
| acceso a verbo | `{ verb: 'steal' }` |
| modificador de facción | `{ faction: 'guard', amount: -10 }` |

## Catálogos de configuraciones

Todos los 7 paquetes iniciales exportan un `buildCatalog` con opciones específicas del paquete. Cada catálogo incluye 3 arquetipos, 3 orígenes, 4 rasgos (2 ventajas + 2 desventajas), 2 disciplinas y 6 títulos de disciplina cruzada.

## Parte de AI RPG Engine

Este paquete es parte del monorepositorio [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine). Depende únicamente de `@ai-rpg-engine/core` para las importaciones de tipos; no tiene dependencia de tiempo de ejecución del motor.

## Licencia

MIT
