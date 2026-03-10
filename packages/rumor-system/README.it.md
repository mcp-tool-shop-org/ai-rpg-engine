<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/rumor-system

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/rumor-system)](https://www.npmjs.com/package/@ai-rpg-engine/rumor-system)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

Motore per la gestione del ciclo di vita delle voci, con meccanismi di mutazione, tracciamento della diffusione e adozione da parte delle fazioni, per [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Installazione

```bash
npm install @ai-rpg-engine/rumor-system
```

## Funzionalità

Le voci si modificano man mano che si diffondono. "Il giocatore ha ucciso un mercante" può diventare "Il giocatore ha massacrato cinque mercanti" dopo alcuni passaggi attraverso guardie in preda al panico. Il motore tiene traccia della perdita di credibilità, dell'intensità emotiva, dei percorsi di diffusione, del numero di mutazioni e dell'adozione da parte delle fazioni, trasformando il pettegolezzo dei PNG in un sistema di simulazione, e non in una semplice copia e incolla.

## Utilizzo

### Creazione e diffusione di voci

```typescript
import { RumorEngine } from '@ai-rpg-engine/rumor-system';

const engine = new RumorEngine();

// A guard witnesses a killing
const rumor = engine.create({
  claim: 'player killed merchant_1',
  subject: 'player',
  key: 'killed_merchant',
  value: true,
  sourceId: 'guard_1',
  originTick: 42,
  confidence: 0.9,
  emotionalCharge: -0.7,
});

// The rumor spreads — mutations may apply
const spread = engine.spread(rumor.id, {
  spreaderId: 'guard_1',
  spreaderFactionId: 'town_guard',
  receiverId: 'guard_2',
  receiverFactionId: 'town_guard',
  environmentInstability: 0.3,
  hopCount: 1,
});

// Track which factions absorbed the rumor
engine.recordFactionUptake(rumor.id, 'town_guard');
```

### Regole di mutazione

Cinque mutazioni predefinite vengono applicate probabilisticamente durante ogni passaggio di diffusione:

| Mutazione | Probabilità | Effetto |
|----------|------------|--------|
| **exaggerate** | 15% | Valori numerici aumentano del 20-50% |
| **minimize** | 10% | Valori numerici diminuiscono |
| **invert** | 5% | Valori booleani si invertono (raramente, con effetti drammatici) |
| **attribute-shift** | 8% | Attribuzione cambia all'entità che diffonde la voce |
| **embellish** | 20% | Intensità emotiva aumenta |

L'instabilità ambientale moltiplica tutte le probabilità.

### Ciclo di vita delle voci

```
spreading → established → fading → dead
```

- **diffusione** — la voce è attivamente trasmessa tra le entità
- **consolidata** — la voce ha raggiunto il numero massimo di passaggi (maxHops) ed è ampiamente conosciuta
- **in declino** — nessun nuovo passaggio di diffusione per un numero di tick pari a fadingThreshold
- **inattiva** — nessuna attività per un numero di tick pari a deathThreshold

```typescript
// Update lifecycle statuses
engine.tick(currentTick);

// Query active rumors
const activeRumors = engine.query({ status: 'spreading', minConfidence: 0.5 });
const playerRumors = engine.aboutSubject('player');
```

### Configurazione

```typescript
const engine = new RumorEngine({
  maxHops: 5,              // Transitions to 'established' after this
  confidenceDecayPerHop: 0.1,
  fadingThreshold: 10,     // Ticks inactive → 'fading'
  deathThreshold: 30,      // Ticks inactive → 'dead'
  mutations: customRules,  // Replace default mutations
});
```

### Mutazioni personalizzate

```typescript
import type { MutationRule } from '@ai-rpg-engine/rumor-system';

const panicMutation: MutationRule = {
  id: 'panic',
  type: 'exaggerate',
  probability: 0.30,
  apply: (rumor, ctx) => ({
    ...rumor,
    emotionalCharge: Math.max(-1, rumor.emotionalCharge - 0.3),
    mutationCount: rumor.mutationCount + 1,
  }),
};
```

## Serializzazione

`RumorEngine` supporta `serialize()` e `RumorEngine.deserialize()` per la persistenza dei dati.

## Parte di AI RPG Engine

Questo pacchetto fa parte del monorepo [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine). Può essere utilizzato autonomamente o integrato con i sistemi di cognizione e di fazioni del motore.

## Licenza

MIT
