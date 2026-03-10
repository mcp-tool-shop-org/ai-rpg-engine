<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.md">English</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

**Black Flag Requiem** — Un monde de départ sur le thème de la piraterie, conçu pour le moteur de jeu de rôle IA.

## Installation

```bash
npm install @ai-rpg-engine/starter-pirate
```

## Ce que vous apprendrez

Ce modèle de départ illustre l'ensemble du moteur à travers une aventure de pirates :

| Fonctionnalités | Ce que le thème de la piraterie présente : |
|---|---|
| **Rulesets** | `pirateMinimalRuleset` — statistiques (force/ruse/habileté maritime), ressources (points de vie/moral), verbes, formules. |
| **Zones & traversal** | 5 zones réparties en 3 pièces, avec adjacence, niveaux de luminosité, éléments interactifs et dangers. |
| **Districts** | Port Haven (faction de la marine coloniale) contre Cursed Waters (mers dangereuses). |
| **Dialogue** | Conversation avec le cartographe avec embranchements, quête et effets sur les drapeaux globaux. |
| **Combat** | Marin de la marine (agressif) et Gardien des profondeurs (bête marine maudite). |
| **Cognition & perception** | Dégradation de la mémoire, filtre de perception, règle de présentation du gardien maudit. |
| **Progression** | Arbre de compétences en navigation en 3 niveaux, avec récompenses d'expérience lors de la défaite des entités. |
| **Environment** | Vague de tempête réduisant le moral, pression de submersion infligeant des dégâts. |
| **Factions** | Faction de la marine coloniale avec gouverneur et marins. |
| **Belief provenance** | Propagation des rumeurs avec délai, suivi des croyances. |
| **Inventory** | Fût de rhum avec effet d'utilisation de l'objet scripté, restaurant le moral. |
| **Simulation inspector** | Inspection complète pour l'analyse des parties. |

## Contenu

- **5 zones** — Pont du navire, La Rusty Anchor (taverne), Fort du gouverneur, Eau libre, Sanctuaire englouti.
- **3 PNJ** — Quartermaster Bly (équipage), Mara la cartographe (neutre), Gouverneur Vane (autorité coloniale).
- **2 ennemis** — Marin de la marine (agressif), Gardien des profondeurs (bête marine maudite).
- **1 objet** — Fût de rhum (restaure 8 points de moral).
- **1 arbre de progression** — Navigation (Endurci par la mer → Impitoyable → Capitaine redouté).
- **1 règle de présentation** — Les créatures maudites perçoivent tous les visiteurs comme des intrus.
- **15 modules connectés** — déplacement, état, combat, inventaire, dialogue, cognition, perception, progression, environnement, factions, rumeurs, districts, croyance, présentation de l'observateur, inspecteur.

## Utilisation

```typescript
import { createGame } from '@ai-rpg-engine/starter-pirate';

// One line — all 15 modules, content, and ruleset pre-wired
const engine = createGame(42);

// Or import pieces individually:
import { manifest, pirateMinimalRuleset, seamanshipTree } from '@ai-rpg-engine/starter-pirate';
```

## Documentation

- [Manuel](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

Créé par <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
