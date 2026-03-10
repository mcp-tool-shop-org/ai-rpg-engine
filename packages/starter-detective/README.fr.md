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

# @ai-rpg-engine/starter-detective

**Gaslight Detective** — Un monde de base pour jeux de rôle avec IA, se déroulant à l'époque victorienne.

## Installation

```bash
npm install @ai-rpg-engine/starter-detective
```

## Ce que vous apprendrez

Ce modèle de base illustre l'ensemble du moteur à travers un scénario d'enquête :

| Fonctionnalités | Ce que "The Detective" présente |
|---|---|
| **Rulesets** | `detectiveMinimalRuleset` — statistiques (perception/éloquence/résilience), ressources (points de vie/maîtrise de soi), verbes, formules. |
| **Zones & traversal** | 5 zones réparties dans 2 pièces, avec adjacence, niveaux de luminosité, éléments interactifs, dangers. |
| **Districts** | Domaine d'Ashford (aristocratique) contre les docks (faction des dockers). |
| **Dialogue** | Interrogatoire de la veuve avec embranchements, collecte de preuves et effets sur les drapeaux globaux. |
| **Combat** | Un voyou des docks avec un profil d'IA agressif et des objectifs territoriaux. |
| **Cognition & perception** | Dégradation de la mémoire, filtre de perception, règle de présentation de la paranoïa des suspects. |
| **Progression** | Arbre de maîtrise de la déduction à 3 niveaux, avec récompenses d'XP à la défaite des entités. |
| **Environment** | Danger de ruelle sombre qui réduit la maîtrise de soi à l'entrée de la zone. |
| **Factions** | Faction des dockers avec paramètre de cohésion. |
| **Belief provenance** | Propagation de rumeurs avec délai, suivi des croyances. |
| **Inventory** | Ammoniaque (restaure la maîtrise de soi) avec effet d'utilisation de l'objet scripté. |
| **Simulation inspector** | Inspection complète pour l'analyse des parties. |

## Ce qu'il contient

- **5 zones** — Le bureau (scène de crime), le salon, la salle des domestiques, l'entrée principale, la ruelle.
- **3 PNJ** — Lady Ashford (veuve/suspecte), le constable Pike (police), Mrs Calloway (domestique/témoin).
- **1 ennemi** — Un voyou des docks (IA agressive, territorial).
- **1 objet** — Ammoniaque (restaure 6 points de maîtrise de soi).
- **1 arbre de progression** — Maîtrise de la déduction (Œil perçant → Langue d'argent → Nerves d'acier).
- **1 règle de présentation** — Les suspects perçoivent l'enquête comme une menace.
- **15 modules intégrés** — déplacement, état, combat, inventaire, dialogue, cognition, perception, progression, environnement, factions, rumeurs, quartiers, croyances, présentation de l'observateur, inspecteur.

## Utilisation

```typescript
import { createGame } from '@ai-rpg-engine/starter-detective';

// One line — all 15 modules, content, and ruleset pre-wired
const engine = createGame(42);

// Or import pieces individually:
import { manifest, detectiveMinimalRuleset, deductionMasteryTree } from '@ai-rpg-engine/starter-detective';
```

## Documentation

- [Manuel](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

Créé par <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
