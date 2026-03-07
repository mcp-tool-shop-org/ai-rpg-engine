<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/ai-rpg-engine/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

<p align="center">A simulation-first terminal RPG engine for worlds shaped by perception, cognition, and consequence.</p>

---

## Cosa è

AI RPG Engine è un motore di runtime modulare per la creazione di giochi di ruolo testuali, in cui le azioni generano informazioni, le informazioni vengono distorte e le conseguenze derivano da ciò che i personaggi credono sia accaduto.

Il motore mantiene la verità oggettiva del mondo, supportando al contempo narrazioni inaffidabili, differenze di percezione tra i personaggi e una narrazione a più livelli. È indipendente dal genere: lo stesso nucleo può essere utilizzato per giochi fantasy, cyberpunk o qualsiasi altro scenario, tramite set di regole personalizzabili.

## Installazione

```bash
npm install @ai-rpg-engine/core @ai-rpg-engine/modules @ai-rpg-engine/content-schema
```

## Guida rapida

```typescript
import { Engine } from '@ai-rpg-engine/core';
import {
  combatCore, dialogueCore, inventoryCore, traversalCore,
  statusCore, environmentCore, cognitionCore, perceptionFilter,
} from '@ai-rpg-engine/modules';

const engine = new Engine({
  manifest: {
    id: 'my-game', title: 'My Game', version: '1.0.0',
    engineVersion: '1.0.0', ruleset: 'fantasy',
    modules: ['combat-core', 'dialogue-core', 'cognition-core'],
    contentPacks: [],
  },
  seed: 42,
  modules: [
    combatCore(), dialogueCore(), inventoryCore(),
    traversalCore(), statusCore(), environmentCore(),
    cognitionCore(), perceptionFilter(),
  ],
});

// Submit an action
const events = engine.submitAction('attack', {
  targetIds: ['guard-01'],
});

// Every action produces structured events
for (const event of events) {
  console.log(event.type, event.payload);
}
```

## Architettura

```
Engine
  WorldStore      — entities, zones, quests, factions, RNG, event log
  ActionDispatcher — verb handlers, validators
  ModuleManager   — modules, formulas, rules, persistence
  Presentation    — channels that route (and can distort) events
```

Ogni cambiamento di stato passa attraverso un'unica pipeline:

```
action --> validation --> resolution --> events --> presentation
```

## Pacchetti

| Pacchetto | Scopo |
|---------|---------|
| `@ai-rpg-engine/core` | Stato, entità, azioni, eventi, regole, RNG (generatore di numeri casuali), persistenza |
| `@ai-rpg-engine/modules` | 17 moduli di simulazione integrati |
| `@ai-rpg-engine/content-schema` | Schemi e validatori di contenuto |
| `@ai-rpg-engine/terminal-ui` | Renderizzatore per terminale e livello di input |
| `@ai-rpg-engine/cli` | CLI per sviluppatori: esecuzione, replay, ispezione |
| `@ai-rpg-engine/starter-fantasy` | The Chapel Threshold (demo fantasy) |
| `@ai-rpg-engine/starter-cyberpunk` | Neon Lockbox (demo cyberpunk) |

## Moduli integrati

| Modulo | Cosa fa |
|--------|-------------|
| combat-core | Attacco/difesa, danno, sconfitta, resistenza |
| dialogue-core | Alberi di dialogo basati su grafi con condizioni |
| inventory-core | Oggetti, equipaggiamento, utilizzo/equipaggiamento/disequipaggiamento |
| traversal-core | Movimento e validazione dell'uscita dalle zone |
| status-core | Effetti di stato con durata e accumulo |
| environment-core | Proprietà dinamiche delle zone, pericoli, decadimento |
| cognition-core | Credenze, intenzioni, morale, memoria dell'IA |
| perception-filter | Canali sensoriali, chiarezza, udito inter-zona |
| narrative-authority | Verità vs presentazione, occultamento, distorsione |
| progression-core | Progressione basata su valuta, alberi di abilità |
| faction-cognition | Credenze delle fazioni, fiducia, conoscenza inter-fazioni |
| rumor-propagation | Diffusione di informazioni con decadimento della fiducia |
| knowledge-decay | Erosione della fiducia basata sul tempo |
| district-core | Memoria spaziale, metriche delle zone, soglie di allarme |
| belief-provenance | Ricostruzione della provenienza delle credenze attraverso percezione/cognizione/pettegolezzo |
| observer-presentation | Filtraggio degli eventi per osservatore, tracciamento delle divergenze |
| simulation-inspector | Ispezione del runtime, controlli di salute, diagnostica |

## Decisioni di progettazione chiave

- **La verità della simulazione è sacra** — il motore mantiene lo stato oggettivo. I livelli di presentazione possono mentire, ma la verità del mondo è canonica.
- **Le azioni generano eventi** — nessun cambiamento di stato significativo avviene silenziosamente. Tutto emette eventi strutturati e interrogabili.
- **Replay deterministico** — l'RNG (generatore di numeri casuali) con seed e la pipeline delle azioni garantiscono risultati identici da input identici.
- **Il contenuto è dati** — stanze, entità, dialoghi, oggetti sono definiti come dati, non come codice.
- **Il genere appartiene ai set di regole** — il motore non ha una preferenza per spade o laser.

## Sicurezza e affidabilità

AI RPG Engine è una **libreria di simulazione esclusivamente locale**.

- **Dati accessibili:** solo lo stato del gioco in memoria. I file di salvataggio vengono scritti nella directory `.ai-rpg-engine/` quando viene utilizzata la funzione di salvataggio della CLI.
- **Dati NON accessibili:** nessun accesso al file system oltre ai file di salvataggio, nessuna connessione di rete, nessuna variabile d'ambiente, nessuna risorsa di sistema.
- **Nessuna telemetria.** Nessun dato viene raccolto o inviato da nessuna parte.
- **Nessun segreto.** Il motore non legge, memorizza o trasmette credenziali.

Consultare il file [SECURITY.md](SECURITY.md) per la politica di sicurezza completa.

## Requisiti

- Node.js >= 20
- TypeScript (moduli ESM)

## Documentazione

- [Manuale](docs/handbook/index.md) — 25 capitoli + 4 appendici
- [Panoramica del design](docs/DESIGN.md) — analisi approfondita dell'architettura
- [Registro delle modifiche](CHANGELOG.md)

## Licenza

[MIT](LICENSE)

---

Creato da <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
