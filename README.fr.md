<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.md">English</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/ai-rpg-engine/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

<p align="center">A simulation-first terminal RPG engine for worlds shaped by perception, cognition, and consequence.</p>

---

## Ce qu'est

AI RPG Engine est un moteur de jeu de rôle modulaire qui permet de créer des jeux pour terminaux. Dans ce type de jeu, les actions génèrent des informations, ces informations sont déformées, et les conséquences découlent de ce que les personnages croient s'être passé.

Ce moteur maintient une vérité objective du monde tout en permettant une narration peu fiable, des différences de perception entre les personnages et une narration en plusieurs niveaux. Il est indépendant du genre : le même noyau peut être utilisé pour des jeux de fantasy, de cyberpunk ou tout autre univers, grâce à des ensembles de règles interchangeables.

## Installation

```bash
npm install @ai-rpg-engine/core @ai-rpg-engine/modules @ai-rpg-engine/content-schema
```

## Démarrage rapide

```typescript
import { Engine } from '@ai-rpg-engine/core';
import {
  combatCore, dialogueCore, inventoryCore, traversalCore,
  statusCore, environmentCore, cognitionCore, perceptionFilter,
} from '@ai-rpg-engine/modules';

const engine = new Engine({
  manifest: {
    id: 'my-game', title: 'My Game', version: '1.0.0',
    engineVersion: '1.0.0', ruleset: 'fantasy',
    modules: ['combat-core', 'dialogue-core', 'cognition-core'],
    contentPacks: [],
  },
  seed: 42,
  modules: [
    combatCore(), dialogueCore(), inventoryCore(),
    traversalCore(), statusCore(), environmentCore(),
    cognitionCore(), perceptionFilter(),
  ],
});

// Submit an action
const events = engine.submitAction('attack', {
  targetIds: ['guard-01'],
});

// Every action produces structured events
for (const event of events) {
  console.log(event.type, event.payload);
}
```

## Architecture

```
Engine
  WorldStore      — entities, zones, quests, factions, RNG, event log
  ActionDispatcher — verb handlers, validators
  ModuleManager   — modules, formulas, rules, persistence
  Presentation    — channels that route (and can distort) events
```

Chaque changement d'état passe par un seul pipeline :

```
action --> validation --> resolution --> events --> presentation
```

## Paquets

| Paquet | Objectif |
|---------|---------|
| `@ai-rpg-engine/core` | État, entités, actions, événements, règles, générateur de nombres aléatoires, persistance |
| `@ai-rpg-engine/modules` | 17 modules de simulation intégrés |
| `@ai-rpg-engine/content-schema` | Schémas et validateurs de contenu |
| `@ai-rpg-engine/terminal-ui` | Rendu pour terminaux et couche d'entrée |
| `@ai-rpg-engine/cli` | CLI pour les développeurs : exécution, relecture, inspection |
| `@ai-rpg-engine/starter-fantasy` | The Chapel Threshold (démo de fantasy) |
| `@ai-rpg-engine/starter-cyberpunk` | Neon Lockbox (démo de cyberpunk) |

## Modules intégrés

| Module | Ce qu'il fait |
|--------|-------------|
| combat-core | Attaque/défense, dégâts, défaite, endurance |
| dialogue-core | Arbres de dialogue basés sur des graphes, avec des conditions |
| inventory-core | Objets, équipement, utilisation/équipement/déséquipement |
| traversal-core | Déplacement et validation de la sortie des zones |
| status-core | Effets de statut avec durée et accumulation |
| environment-core | Propriétés dynamiques des zones, dangers, dégradation |
| cognition-core | Croyances, intentions, moral, mémoire de l'IA |
| perception-filter | Canaux sensoriels, clarté, audition inter-zones |
| narrative-authority | Vérité vs présentation, dissimulation, distorsion |
| progression-core | Progression basée sur la monnaie, arbres de compétences |
| faction-cognition | Croyances des factions, confiance, connaissance inter-factions |
| rumor-propagation | Propagation de l'information avec diminution de la confiance |
| knowledge-decay | Érosion de la confiance basée sur le temps |
| district-core | Mémoire spatiale, métriques des zones, seuils d'alerte |
| belief-provenance | Reconstruction de la provenance des croyances à travers la perception, la cognition et les rumeurs |
| observer-presentation | Filtrage des événements par observateur, suivi des divergences |
| simulation-inspector | Inspection en cours d'exécution, vérifications de l'état de santé, diagnostics |

## Décisions de conception clés

- **La vérité de la simulation est sacrée** : le moteur maintient un état objectif. Les couches de présentation peuvent mentir, mais la vérité du monde est canonique.
- **Les actions génèrent des événements** : aucun changement d'état significatif ne se produit silencieusement. Tout émet des événements structurés et interrogeables.
- **Relecture déterministe** : le générateur de nombres aléatoires initialisé et le pipeline d'actions garantissent des résultats identiques à partir des mêmes entrées.
- **Le contenu est des données** : les pièces, les entités, les dialogues et les objets sont définis comme des données, et non comme du code.
- **Le genre appartient aux ensembles de règles** : le moteur n'a pas d'opinion sur les épées par rapport aux lasers.

## Sécurité et confiance

AI RPG Engine est une **bibliothèque de simulation locale uniquement**.

- **Données manipulées :** uniquement l'état du jeu en mémoire. Les fichiers de sauvegarde sont écrits dans le répertoire `.ai-rpg-engine/` lorsque la commande de sauvegarde de l'interface en ligne de commande est utilisée.
- **Données NON manipulées :** aucun accès au système de fichiers en dehors des fichiers de sauvegarde, aucun réseau, aucune variable d'environnement, aucune ressource système.
- **Aucune télémétrie.** Aucune donnée n'est collectée ou envoyée.
- **Aucun secret.** Le moteur ne lit, ne stocke ni ne transmet d'informations d'identification.

Consultez le fichier [SECURITY.md](SECURITY.md) pour connaître la politique de sécurité complète.

## Prérequis

- Node.js >= 20
- TypeScript (modules ESM)

## Documentation

- [Manuel](docs/handbook/index.md) — 25 chapitres + 4 annexes
- [Aperçu de la conception](docs/DESIGN.md) — analyse approfondie de l'architecture
- [Journal des modifications](CHANGELOG.md)

## Licence

[MIT](LICENSE)

---

Créé par <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
