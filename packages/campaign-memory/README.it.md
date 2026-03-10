<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/campaign-memory

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/campaign-memory)](https://www.npmjs.com/package/@ai-rpg-engine/campaign-memory)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

Memoria persistente dei personaggi non giocanti (PNG), relazioni multidimensionali e diario di campagna per [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Installazione

```bash
npm install @ai-rpg-engine/campaign-memory
```

## Funzionalità

I PNG ricordano ciò che è successo. Non solo "ostile: true" — tracciano fiducia, paura, ammirazione e familiarità in ogni interazione. I ricordi svaniscono nel tempo: vividi → sbiaditi → deboli → dimenticati. Il diario di campagna registra eventi significativi tra le sessioni.

## Utilizzo

### Diario di campagna

```typescript
import { CampaignJournal } from '@ai-rpg-engine/campaign-memory';

const journal = new CampaignJournal();

// Record a significant event
const record = journal.record({
  tick: 42,
  category: 'kill',
  actorId: 'player',
  targetId: 'merchant_1',
  zoneId: 'market',
  description: 'Player killed the merchant during a robbery',
  significance: 0.9,
  witnesses: ['guard_1', 'bystander_2'],
  data: { weapon: 'dagger' },
});

// Query the journal
const playerActions = journal.query({ actorId: 'player', category: 'kill' });
const merchantHistory = journal.getInvolving('merchant_1');
```

### Banca di memoria dei PNG

```typescript
import { NpcMemoryBank, applyRelationshipEffect } from '@ai-rpg-engine/campaign-memory';

const guardMemory = new NpcMemoryBank('guard_1');

// Guard witnesses the player killing a merchant
guardMemory.remember(record, 0.9, -0.8);      // high salience, very negative
applyRelationshipEffect(guardMemory, record, 'witness');

// Check how the guard feels about the player
const rel = guardMemory.getRelationship('player');
// { trust: -0.15, fear: 0.25, admiration: -0.05, familiarity: 0 }

// Later, memories fade
guardMemory.consolidate(currentTick);
const memories = guardMemory.recall({ aboutEntity: 'player', minSalience: 0.5 });
```

### Assi di relazione

| Asse | Intervallo | Significato |
|------|-------|---------|
| fiducia | -1 a 1 | Sfida → Fiducia |
| paura | 0 a 1 | Non spaventato → Terrorizzato |
| ammirazione | -1 a 1 | Disprezzo → Ammirazione |
| familiarità | 0 a 1 | Sconosciuto → Intimo |

### Categorie di registrazione

`azione` · `combattimento` · `uccisione` · `tradimento` · `regalo` · `furto` · `debito` · `scoperta` · `alleanza` · `insulto` · `salvataggio` · `morte`

Ogni categoria ha effetti predefiniti sulle relazioni. Un salvataggio aumenta la fiducia (+0.4) e l'ammirazione (+0.3). Un tradimento distrugge la fiducia (-0.5).

### Consolidamento della memoria

I ricordi decadono nel tempo attraverso tre fasi:

- **vivido** — alta rilevanza, formato di recente
- **sbiadito** — la rilevanza è scesa al di sotto della soglia di sbiadimento
- **debole** — a malapena ricordato, sul punto di essere dimenticato

Configurare i tassi di decadimento per ogni PNG o a livello globale.

## Serializzazione

Sia `CampaignJournal` che `NpcMemoryBank` supportano `serialize()` e `deserialize()` per la persistenza tra le sessioni.

## Parte di AI RPG Engine

Questo pacchetto fa parte del monorepo [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine). Può essere utilizzato autonomamente o integrato con i sistemi di cognizione e di voci di corridoio del motore.

## Licenza

MIT
