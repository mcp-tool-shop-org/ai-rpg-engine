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

# @ai-rpg-engine/starter-fantasy

**Le Seuil de la Chapelle** — un monde de fantasy sombre pour le moteur de jeu de rôle IA.

## Installation

```bash
npm install @ai-rpg-engine/starter-fantasy
```

## Ce que vous apprendrez

Ce modèle de démarrage illustre l'ensemble des fonctionnalités du moteur dans un monde compact :

| Fonctionnalités | Ce que "La Chapelle" montre |
|---|---|
| **Rulesets** | `fantasyMinimalRuleset` — statistiques (vitalité/instinct/volonté), ressources (points de vie/endurance), verbes, formules. |
| **Zones & traversal** | 5 zones réparties sur 2 pièces, avec adjacence, niveaux de luminosité, éléments interactifs et dangers. |
| **Districts** | Terrain de la chapelle (sacré) contre profondeurs de la crypte (maudites, contrôlées par une faction). |
| **Dialogue** | Conversation avec un pèlerin, avec 3 voies possibles et effets sur un indicateur global. |
| **Combat** | Goule de cendres avec un profil d'IA agressive, étiquettes de peur et objectif de garde. |
| **Cognition & perception** | Dégradation de la mémoire, filtre de perception, règle de présentation des morts-vivants. |
| **Progression** | Arbre de maîtrise du combat en 3 niveaux, avec récompenses d'expérience à la défaite d'une entité. |
| **Environment** | Danger de sol instable qui draine l'endurance à l'entrée d'une zone. |
| **Factions** | Faction des morts-vivants de la chapelle avec paramètre de cohésion. |
| **Belief provenance** | Propagation de rumeurs avec délai, suivi des croyances. |
| **Inventory** | Potion de soin avec effet d'utilisation scripté, restaurant 8 points de vie. |
| **Simulation inspector** | Inspection complète pour l'analyse des parties. |

## Contenu

- **5 zones** — Entrée de la chapelle en ruine, Née, Alcôve ombragée, Passage de la sacristie, Antichambre de la crypte.
- **1 PNJ** — Pèlerin suspect (dialogue ramifié, 3 voies de conversation).
- **1 ennemi** — Goule de cendres (IA agressive, peur du feu et du sacré).
- **1 objet** — Potion de soin (effet d'utilisation scripté, restaure 8 points de vie).
- **1 arbre de progression** — Maîtrise du combat (Endurci → Œil perçant → Fureur au combat).
- **1 règle de présentation** — Les morts-vivants perçoivent tous les êtres vivants comme des menaces.
- **15 modules intégrés** — déplacement, état, combat, inventaire, dialogue, cognition, perception, progression, environnement, factions, rumeurs, districts, croyance, présentation de l'observateur, inspecteur.

## Utilisation

```typescript
import { createGame } from '@ai-rpg-engine/starter-fantasy';

// One line — all 15 modules, content, and ruleset pre-wired
const engine = createGame(42);

// Or import pieces individually:
import { manifest, zones, pilgrimDialogue, fantasyMinimalRuleset } from '@ai-rpg-engine/starter-fantasy';
```

## Documentation

- [Le Seuil de la Chapelle (Chap. 20)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/20-chapel-threshold/)
- [Manuel](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

Créé par <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
