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

# @ai-rpg-engine/starter-zombie

**Ashfall Dead** — un mondo di esempio per giochi di sopravvivenza a tema zombie, progettato per AI RPG Engine.

## Installazione

```bash
npm install @ai-rpg-engine/starter-zombie
```

## Cosa imparerai

Questo esempio dimostra l'intera struttura del motore attraverso uno scenario di sopravvivenza:

| Caratteristiche | Cosa mostra lo zombie |
|---|---|
| **Rulesets** | `zombieMinimalRuleset` — statistiche (forma fisica/intelligenza/coraggio), risorse (punti vita/energia/infezione), verbi, formule. |
| **Zones & traversal** | 5 zone in 3 ambienti, con adiacenze, livelli di illuminazione, elementi interattivi e pericoli. |
| **Districts** | Il rifugio (fazione dei sopravvissuti) contro la zona infestata (ostile, non-morta). |
| **Dialogue** | Conversazione ramificata con un medico, con una missione secondaria per recuperare rifornimenti ospedalieri. |
| **Combat** | Zombie lenti e resistenti (Shambler) e zombie veloci e fragili (Runner), con intelligenza artificiale aggressiva. |
| **Cognition & perception** | Decadimento della memoria, filtro percettivo, regola di presentazione della fame degli zombie. |
| **Progression** | Albero di sopravvivenza con 3 livelli, con ricompense di esperienza per ogni nemico sconfitto. |
| **Environment** | Zombie erranti che consumano energia, zone a rischio di infezione che aumentano il livello di infezione. |
| **Factions** | Fazione dei sopravvissuti con medico, saccheggiatore e leader militare. |
| **Belief provenance** | Diffusione di voci con ritardo, tracciamento delle credenze. |
| **Inventory** | Antibiotici con effetto di utilizzo programmato che riduce l'infezione. |
| **Simulation inspector** | Sistema di analisi completo per la revisione delle partite. |

## Cosa è incluso

- **5 zone** — Lobby del rifugio, stazione di servizio abbandonata, strada invasa, ala est dell'ospedale, tetto dell'ospedale.
- **3 PNG** — Dott. Chen (medico), Rook (saccheggiatore), Sergente Marsh (leader militare).
- **2 nemici** — Shambler (non-morto lento e resistente), Runner (non-morto veloce e fragile).
- **1 oggetto** — Antibiotici (riducono l'infezione del 25%).
- **1 albero di progressione** — Sopravvivenza (Scrapper → Cool-Headed → Last One Standing).
- **1 regola di presentazione** — Gli zombie percepiscono tutti gli esseri viventi come prede.
- **15 moduli collegati** — movimento, stato, combattimento, inventario, dialogo, cognizione, percezione, progressione, ambiente, fazioni, voci, distretti, credenze, presentazione dell'osservatore, ispettore.

## Utilizzo

```typescript
import { createGame } from '@ai-rpg-engine/starter-zombie';

// One line — all 15 modules, content, and ruleset pre-wired
const engine = createGame(42);

// Or import pieces individually:
import { manifest, zombieMinimalRuleset, survivalTree } from '@ai-rpg-engine/starter-zombie';
```

## Documentazione

- [Manuale](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

Creato da <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
