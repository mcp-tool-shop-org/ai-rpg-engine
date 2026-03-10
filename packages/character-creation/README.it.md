<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/character-creation

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/character-creation)](https://www.npmjs.com/package/@ai-rpg-engine/character-creation)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

Sistema di creazione del personaggio headless: archetipi, background, tratti, multiclasse e convalida della build per [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Installazione

```bash
npm install @ai-rpg-engine/character-creation
```

## Cosa fa

I personaggi non sono semplici fogli di calcolo, ma identità. Questo pacchetto gestisce la fusione strutturata di archetipo primario, origine, tratti della personalità e disciplina secondaria opzionale, creando un'entità giocatore validata. Ogni combinazione di archetipo + disciplina produce un titolo che sintetizza l'identità del personaggio, invece di limitarsi a sommare numeri.

## Utilizzo

### Convalida di una build

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

### Conversione in EntityState

```typescript
import { resolveEntity } from '@ai-rpg-engine/character-creation';

const entity = resolveEntity(build, buildCatalog, content.ruleset);
// Full EntityState ready for the engine:
// entity.id === 'player'
// entity.blueprintId === 'penitent-knight'
// entity.stats, entity.resources, entity.tags, entity.inventory all computed
// entity.custom === { archetypeId, backgroundId, disciplineId, title, portraitRef }
```

### Esplorazione delle opzioni disponibili

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

### Serializzazione per i file di salvataggio

```typescript
import { serializeBuild, deserializeBuild, validateSerializedBuild } from '@ai-rpg-engine/character-creation';

const json = serializeBuild(build);
const restored = deserializeBuild(json);
const check = validateSerializedBuild(json); // { ok: true, errors: [] }
```

## Concetti

| Concetto | Descrizione |
|---------|-------------|
| **Archetype** | Classe primaria: statistiche di base, tag iniziali, albero di progressione. |
| **Background** | Storia di origine: modificatori delle statistiche, tag iniziali, inventario opzionale. |
| **Trait** | Vantaggio o svantaggio: effetti sulle statistiche, risorse, tag, verbi o fazioni. |
| **Discipline** | Classe secondaria: 1 verbo, 1 effetto passivo, 1 svantaggio. |
| **Cross-Title** | Identità sintetizzata dall'archetipo + disciplina (ad esempio, "Guardiano della Tomba"). |
| **Entanglement** | Effetto di "attrito" derivante da determinate combinazioni di archetipo + disciplina. |
| **Build Catalog** | Menu specifico del pacchetto con tutte le opzioni per la creazione del personaggio. |

## Multiclasse

Il sistema utilizza la fusione strutturata dell'identità, non una semplice somma:

- L'**archetipo primario** definisce l'identità di base (statistiche di base, albero di progressione, tag iniziali).
- La **disciplina secondaria** è compatta: 1 verbo, 1 effetto passivo, 1 svantaggio.
- Ogni combinazione produce un **titolo che unisce diverse discipline** (ad esempio, "Pistolero Esoterico", "Chirurgo Sinaptico", "Guardia della Quarantena").
- Alcune combinazioni creano **"entanglements"**, ovvero effetti narrativi di "attrito".

## Effetti dei Tratti

| Tipo | Esempio |
|------|---------|
| modificatore di statistica | `{ stat: 'dex', amount: 1 }` |
| modificatore di risorsa | `{ resource: 'hp', amount: -3 }` |
| assegnazione di tag | `{ tag: 'curse-touched' }` |
| accesso a verbi | `{ verb: 'steal' }` |
| modificatore di fazione | `{ faction: 'guard', amount: -10 }` |

## Cataloghi delle Build

Tutti i 7 pacchetti iniziali esportano un `buildCatalog` con opzioni specifiche del pacchetto. Ogni catalogo include 3 archetipi, 3 background, 4 tratti (2 vantaggi + 2 svantaggi), 2 discipline e 6 titoli che uniscono diverse discipline.

## Parte di AI RPG Engine

Questo pacchetto fa parte del monorepo [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine). Dipende solo da `@ai-rpg-engine/core` per le importazioni di tipo: non ci sono dipendenze di runtime dal motore.

## Licenza

MIT
