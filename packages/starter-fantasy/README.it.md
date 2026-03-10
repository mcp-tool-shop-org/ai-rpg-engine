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

# @ai-rpg-engine/starter-fantasy

**La Soglia della Cappella** — un mondo di fantasia oscura per il motore di giochi di ruolo AI.

## Installazione

```bash
npm install @ai-rpg-engine/starter-fantasy
```

## Cosa imparerai

Questo esempio dimostra l'intera struttura del motore in un mondo compatto:

| Caratteristiche | Cosa mostra la Cappella |
|---|---|
| **Rulesets** | `fantasyMinimalRuleset` — statistiche (vigore/istinto/volontà), risorse (punti ferita/stamina), verbi, formule. |
| **Zones & traversal** | 5 zone in 2 stanze, con adiacenze, livelli di illuminazione, elementi interattivi e pericoli. |
| **Districts** | Terreno della Cappella (sacro) contro le Profondità della Cripta (maledette, controllate da una fazione). |
| **Dialogue** | Conversazione con un pellegrino con diramazioni, 3 percorsi e effetti su flag globali. |
| **Combat** | Ghoul di Cenere con profilo di intelligenza artificiale aggressivo, tag di "paura" e obiettivo di guardia. |
| **Cognition & perception** | Decadimento della memoria, filtro percettivo, regola di presentazione per i non morti. |
| **Progression** | Albero di Maestria del Combattimento con 3 nodi e ricompense di esperienza alla sconfitta dell'entità. |
| **Environment** | Pericolo di pavimento instabile che consuma stamina all'ingresso nella zona. |
| **Factions** | Fazione dei non morti della Cappella con impostazione di coesione. |
| **Belief provenance** | Diffusione di voci con ritardo, tracciamento delle credenze. |
| **Inventory** | Pozione curativa con effetto di utilizzo programmato che ripristina 8 punti ferita. |
| **Simulation inspector** | Ispezione completa per l'analisi delle partite. |

## Cosa c'è all'interno

- **5 zone** — Ingresso della Cappella in rovina, Navata, Nicchia Ombrata, Corridoio della Sagrestia, Anticamera della Cripta.
- **1 PNG** — Pellegrino Sospetto (dialogo con diramazioni, 3 percorsi di conversazione).
- **1 nemico** — Ghoul di Cenere (intelligenza artificiale aggressiva, paura del fuoco e del sacro).
- **1 oggetto** — Pozione Curativa (effetto di utilizzo programmato che ripristina 8 punti ferita).
- **1 albero di progressione** — Maestria del Combattimento (Indurito → Occhio Acuto → Furia in Battaglia).
- **1 regola di presentazione** — i non morti percepiscono tutti gli esseri viventi come minacce.
- **15 moduli collegati** — movimento, stato, combattimento, inventario, dialogo, cognizione, percezione, progressione, ambiente, fazioni, voci, distretti, credenze, presentazione dell'osservatore, ispettore.

## Utilizzo

```typescript
import { createGame } from '@ai-rpg-engine/starter-fantasy';

// One line — all 15 modules, content, and ruleset pre-wired
const engine = createGame(42);

// Or import pieces individually:
import { manifest, zones, pilgrimDialogue, fantasyMinimalRuleset } from '@ai-rpg-engine/starter-fantasy';
```

## Documentazione

- [La Soglia della Cappella (Cap. 20)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/20-chapel-threshold/)
- [Manuale](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

Creato da <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
