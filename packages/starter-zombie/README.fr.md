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

# @ai-rpg-engine/starter-zombie

**Ashfall Dead** — Un monde de démarrage pour les jeux de rôle avec IA, axé sur la survie contre les zombies.

## Installation

```bash
npm install @ai-rpg-engine/starter-zombie
```

## Ce que vous apprendrez

Ce modèle de démarrage illustre l'ensemble des fonctionnalités du moteur à travers un scénario de survie :

| Fonctionnalités | Ce que le zombie démontre |
|---|---|
| **Rulesets** | `zombieMinimalRuleset` — statistiques (condition physique/intelligence/sang-froid), ressources (points de vie/endurance/infection), verbes, formules. |
| **Zones & traversal** | 5 zones réparties en 3 pièces, avec adjacence, niveaux de luminosité, éléments interactifs, dangers. |
| **Districts** | Le refuge (faction des survivants) contre la zone infestée (hostile, morts-vivants). |
| **Dialogue** | Dialogue avec le médecin, avec une quête secondaire pour récupérer des fournitures à l'hôpital. |
| **Combat** | Zombie traînant (lent, robuste) et zombie coureur (rapide, fragile), avec une IA agressive. |
| **Cognition & perception** | Dégradation de la mémoire, filtre de perception, règle de présentation de la faim des zombies. |
| **Progression** | Arbre de compétences de survie à 3 niveaux, avec récompenses d'expérience à l'élimination des entités. |
| **Environment** | Morts-vivants errants qui drainent l'endurance, zones à risque d'infection qui augmentent l'infection. |
| **Factions** | Faction des survivants avec un médecin, un récupérateur et un chef militaire. |
| **Belief provenance** | Propagation des rumeurs avec un délai, suivi des croyances. |
| **Inventory** | Antibiotiques avec un effet scripté d'utilisation qui réduit l'infection. |
| **Simulation inspector** | Inspection complète pour l'analyse des parties. |

## Contenu

- **5 zones** — Hall d'entrée du refuge, station-service abandonnée, rue envahie, aile est de l'hôpital, toit de l'hôpital.
- **3 PNJ** — Dr. Chen (médecin), Rook (récupérateur), Sergent Marsh (chef militaire).
- **2 ennemis** — Zombie traînant (mort-vivant lent et robuste), zombie coureur (mort-vivant rapide et fragile).
- **1 objet** — Antibiotiques (réduit l'infection de 25).
- **1 arbre de progression** — Survie (Récupérateur → Calme → Le dernier survivant).
- **1 règle de présentation** — Les zombies perçoivent tous les êtres vivants comme des proies.
- **15 modules intégrés** — déplacement, état, combat, inventaire, dialogue, cognition, perception, progression, environnement, factions, rumeurs, quartiers, croyances, présentation de l'observateur, inspecteur.

## Utilisation

```typescript
import { createGame } from '@ai-rpg-engine/starter-zombie';

// One line — all 15 modules, content, and ruleset pre-wired
const engine = createGame(42);

// Or import pieces individually:
import { manifest, zombieMinimalRuleset, survivalTree } from '@ai-rpg-engine/starter-zombie';
```

## Documentation

- [Manuel](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

Créé par <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
