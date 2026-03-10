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

# @ai-rpg-engine/starter-pirate

**Black Flag Requiem** — un mondo di partenza a tema pirata, ambientato in mare aperto, per il motore AI RPG Engine.

## Installazione

```bash
npm install @ai-rpg-engine/starter-pirate
```

## Cosa imparerai

Questo esempio dimostrativo mostra l'intera struttura del motore attraverso un'avventura piratesca:

| Caratteristiche | Cosa mostra l'esempio del pirata |
|---|---|
| **Rulesets** | `pirateMinimalRuleset` — statistiche (forza/astuzia/abilità marinara), risorse (punti vita/morale), verbi, formule. |
| **Zones & traversal** | 5 zone in 3 ambienti, con adiacenze, livelli di illuminazione, elementi interattivi e pericoli. |
| **Districts** | Port Haven (fazione della marina coloniale) contro Cursed Waters (mare pericoloso). |
| **Dialogue** | Conversazione ramificata con un cartografo, con una missione e effetti su flag globali. |
| **Combat** | Marinaio della marina (aggressivo) e Guardiano Annegato (mostro marino maledetto). |
| **Cognition & perception** | Decadimento della memoria, filtro percettivo, regola di presentazione del guardiano maledetto. |
| **Progression** | Albero di abilità di "abilità marinara" con 3 livelli, con ricompense di esperienza per la sconfitta dei nemici. |
| **Environment** | Onde di tempesta che riducono il morale, pressione dell'acqua che infligge danni. |
| **Factions** | Fazione della marina coloniale con governatore e marinai. |
| **Belief provenance** | Diffusione di voci con ritardo, tracciamento delle credenze. |
| **Inventory** | Barile di rum con effetto di utilizzo programmato che ripristina il morale. |
| **Simulation inspector** | Ispezione completa per l'analisi delle partite. |

## Cosa c'è all'interno

- **5 zone:** Ponte della nave, La Rusty Anchor (taverna), Fortezza del governatore, Acque aperte, Santuario sommerso.
- **3 PNG:** Quartermaster Bly (equipaggio), Mara la cartografa (neutrale), Governatore Vane (autorità coloniale).
- **2 nemici:** Marinaio della marina (aggressivo), Guardiano Annegato (mostro marino maledetto).
- **1 oggetto:** Barile di rum (ripristina 8 punti morale).
- **1 albero di progressione:** Abilità marinara (Indurito dal mare → Spietato → Capitano temuto).
- **1 regola di presentazione:** Le creature maledette percepiscono tutti i visitatori come intrusi.
- **15 moduli collegati:** movimento, stato, combattimento, inventario, dialogo, cognizione, percezione, progressione, ambiente, fazioni, voci, distretti, credenze, presentazione dell'osservatore, ispettore.

## Utilizzo

```typescript
import { createGame } from '@ai-rpg-engine/starter-pirate';

// One line — all 15 modules, content, and ruleset pre-wired
const engine = createGame(42);

// Or import pieces individually:
import { manifest, pirateMinimalRuleset, seamanshipTree } from '@ai-rpg-engine/starter-pirate';
```

## Documentazione

- [Manuale](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

Creato da <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
