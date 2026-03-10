<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/pack-registry

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/pack-registry)](https://www.npmjs.com/package/@ai-rpg-engine/pack-registry)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

Catalogo, sistema di scoperta, filtri e griglia di valutazione per i pacchetti di [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Installazione

```bash
npm install @ai-rpg-engine/pack-registry
```

## Funzionalità

Il registro dei pacchetti è un catalogo a runtime dei pacchetti di avvio. Permette di registrare i pacchetti, sfogliarli per genere/difficoltà/tono e validarli in base a una griglia di valutazione di 7 dimensioni.  Fornisce le interfacce utente per la selezione dei pacchetti e garantisce che ogni mondo di avvio soddisfi un livello minimo di qualità.

## Utilizzo

### Registrazione e scoperta dei pacchetti

```typescript
import { registerPack, getAllPacks, filterPacks, getPackSummaries } from '@ai-rpg-engine/pack-registry';
import { content, createGame, packMeta } from '@ai-rpg-engine/starter-fantasy';

// Register a pack
registerPack({
  meta: packMeta,
  manifest: content.manifest,
  ruleset: content.ruleset,
  createGame,
});

// Browse all registered packs
const summaries = getPackSummaries();
// [{ id: 'chapel-threshold', name: 'The Chapel Threshold', tagline: '...', genres: ['fantasy'], difficulty: 'beginner' }]

// Filter by genre, difficulty, or tone
const darkPacks = filterPacks({ tone: 'dark' });
const beginnerPacks = filterPacks({ difficulty: 'beginner' });
```

### Metadati del pacchetto

Ogni pacchetto di avvio esporta un `packMeta: PackMetadata` con campi strutturati:

| Campo | Tipo | Descrizione |
|-------|------|-------------|
| id | stringa | Identificativo univoco (corrisponde a manifest.id) |
| nome | stringa | Nome leggibile |
| tagline | stringa | Slogan di marketing in una sola riga |
| generi | PackGenre[] | Tag di genere per il filtraggio |
| difficoltà | PackDifficulty | principiante, intermedio o avanzato |
| toni | PackTone[] | Descrittori del tono narrativo |
| tag | stringa[] | Tag liberi per la ricerca |
| engineVersion | stringa | Versione minima del motore (semver) |
| narratorTone | stringa | Tono per il narratore |

### Griglia di valutazione

Valuta i pacchetti in base a 7 dimensioni di originalità:

```typescript
import { validatePackRubric } from '@ai-rpg-engine/pack-registry';

const result = validatePackRubric(packEntry);
// result.ok === true (score >= 5/7)
// result.score === 7
// result.checks === [{ dimension: 'distinct-verbs', passed: true, detail: '...' }, ...]
```

| Dimensione | Cosa viene verificato |
|-----------|---------------|
| distinct-verbs | Il pacchetto ha verbi unici oltre al set base |
| distinct-resource-pressure | Le meccaniche delle risorse creano una tensione significativa |
| distinct-faction-topology | La struttura delle fazioni differisce da altri pacchetti |
| distinct-presentation-rule | La percezione/narrazione ha un tocco unico |
| distinct-audio-palette | Il design audio supporta il genere |
| distinct-failure-mode | Il fallimento sembra diverso dagli altri pacchetti |
| distinct-narrative-fantasy | La fantasia principale è unica |

Punteggio >= 5/7 per qualificarsi come pacchetto di avvio.

### Tipi disponibili

```typescript
import type {
  PackGenre,        // 'fantasy' | 'sci-fi' | 'cyberpunk' | 'horror' | ...
  PackDifficulty,   // 'beginner' | 'intermediate' | 'advanced'
  PackTone,         // 'dark' | 'gritty' | 'heroic' | 'noir' | ...
  PackMetadata,     // Full pack metadata
  PackEntry,        // Registry entry (meta + manifest + ruleset + createGame)
  PackSummary,      // Compact display format
  PackFilter,       // Filter criteria
  RubricResult,     // Quality rubric output
} from '@ai-rpg-engine/pack-registry';
```

## Parte di AI RPG Engine

Questo pacchetto fa parte del monorepo [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine). Può essere utilizzato autonomamente per la scoperta dei pacchetti o integrato con claude-rpg per l'interfaccia utente di selezione dei pacchetti.

## Licenza

MIT
