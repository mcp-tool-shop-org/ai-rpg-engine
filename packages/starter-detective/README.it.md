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

# @ai-rpg-engine/starter-detective

**Gaslight Detective** — un mondo di partenza a tema mistero vittoriano per il motore di giochi di ruolo AI.

## Installazione

```bash
npm install @ai-rpg-engine/starter-detective
```

## Cosa imparerai

Questo esempio dimostrativo mostra l'intera struttura del motore attraverso uno scenario investigativo:

| Caratteristiche | Cosa mostra "The Detective" |
|---|---|
| **Rulesets** | `detectiveMinimalRuleset` — statistiche (percezione/eloquenza/tenacia), risorse (punti ferita/compostezza), verbi, formule. |
| **Zones & traversal** | 5 zone in 2 stanze, con adiacenze, livelli di illuminazione, elementi interattivi e pericoli. |
| **Districts** | La tenuta di Ashford (aristocratica) contro i cantieri navali (fazione dei lavoratori portuali). |
| **Dialogue** | Interrogatorio ramificato con la vedova, con raccolta di prove ed effetti su flag globali. |
| **Combat** | Un teppista dei cantieri con un profilo di intelligenza artificiale aggressivo e obiettivi territoriali. |
| **Cognition & perception** | Decadimento della memoria, filtro percettivo, regola di presentazione della paranoia dei sospetti. |
| **Progression** | Albero di abilità "Deduction Mastery" con 3 nodi e ricompense di esperienza (XP) per la sconfitta dei nemici. |
| **Environment** | Un pericolo nel vicolo buio che riduce la compostezza all'ingresso nella zona. |
| **Factions** | La fazione dei lavoratori portuali con impostazione di coesione. |
| **Belief provenance** | Diffusione di voci con ritardo e tracciamento delle credenze. |
| **Inventory** | Ammoniaca (ripristina 6 punti di compostezza) con effetto di utilizzo programmato. |
| **Simulation inspector** | Ispezione completa predisposta per l'analisi delle partite. |

## Cosa c'è all'interno

- **5 zone** — Lo studio (scena del crimine), Salotto, Sala dei servitori, Ingresso principale, Vicolo posteriore.
- **3 PNG** — Lady Ashford (vedova/sospetta), Constable Pike (poliziotto), Mrs Calloway (servitrice/testimone).
- **1 nemico** — Teppista dei cantieri (intelligenza artificiale aggressiva, territoriale).
- **1 oggetto** — Ammoniaca (ripristina 6 punti di compostezza).
- **1 albero di progressione** — Deduction Mastery (Occhio Acuto → Lingua d'Argento → Nervi d'Acciaio).
- **1 regola di presentazione** — i sospetti percepiscono l'indagine come una minaccia.
- **15 moduli collegati** — movimento, stato, combattimento, inventario, dialogo, cognizione, percezione, progressione, ambiente, fazioni, voci, distretti, credenze, presentazione dell'osservatore, ispettore.

## Utilizzo

```typescript
import { createGame } from '@ai-rpg-engine/starter-detective';

// One line — all 15 modules, content, and ruleset pre-wired
const engine = createGame(42);

// Or import pieces individually:
import { manifest, detectiveMinimalRuleset, deductionMasteryTree } from '@ai-rpg-engine/starter-detective';
```

## Documentazione

- [Manuale](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

Creato da <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
