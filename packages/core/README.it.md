<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/ai-rpg-engine/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

# @ai-rpg-engine/core

La base di AI RPG Engine: stato del mondo, entità, azioni, eventi, regole, generatore di numeri casuali con seme e persistenza.

## Installazione

```bash
npm install @ai-rpg-engine/core
```

## Cosa c'è all'interno

- **Engine** (Motore) — ciclo di simulazione basato su tick con replay deterministico.
- **WorldState** (Stato del mondo) — stanze, entità, flag globali, contatore di tick.
- **EntityState** (Stato dell'entità) — risorse, inventario, effetti di stato, credenze, ricordi.
- **Action Pipeline** (Pipeline delle azioni) — convalida → pre-elaborazione → risoluzione → post-elaborazione → commit.
- **Event Bus** (Bus degli eventi) — eventi strutturati con tipo, origine, destinatari, payload.
- **Seeded RNG** (Generatore di numeri casuali con seme) — casualità riproducibile a partire da un singolo seme.
- **Module System** (Sistema di moduli) — registrazione/composizione di moduli di simulazione.
- **Test Harness** (Ambiente di test) — strumenti di supporto per il test deterministico dei moduli.

## Guida rapida

```typescript
import { Engine } from '@ai-rpg-engine/core';

const engine = new Engine({
  manifest: {
    id: 'my-game', title: 'My Game',
    version: '1.0.0', engineVersion: '1.0.0',
    ruleset: 'fantasy', modules: [],
    contentPacks: [],
  },
  seed: 42,
  modules: [],
});

const state = engine.getState();
```

## Documentazione

- [Manuale](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/) — 25 capitoli + 4 appendici.
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

Creato da <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
