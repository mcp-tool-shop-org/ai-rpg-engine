<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.md">English</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/ai-rpg-engine/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

# AI RPG Engine

Une boîte à outils conçue pour la simulation, permettant de créer, d'analyser et d'équilibrer des mondes de jeux de rôle.

L'AI RPG Engine combine un moteur de simulation déterministe avec un studio de conception assisté par l'IA, permettant aux créateurs de construire des mondes, de les tester par simulation et de les améliorer sur la base de données plutôt que de suppositions.

> Les outils traditionnels vous aident à écrire des histoires.
> L'AI RPG Engine vous aide à **tester des mondes**.

---

## Ce qu'il fait

```
build → critique → simulate → analyze → tune → experiment
```

Vous pouvez générer du contenu pour le monde, évaluer les conceptions, exécuter des simulations déterministes, analyser le comportement des parties, ajuster les mécanismes, effectuer des expériences sur de nombreuses configurations et comparer les résultats. Chaque résultat est reproductible, inspectable et explicable.

---

## Fonctionnalités principales

### Simulation déterministe

Un moteur de simulation basé sur des cycles pour les mondes de jeux de rôle. Il comprend l'état du monde, le système d'événements, les couches de perception et de cognition, la propagation des croyances des factions, les systèmes de rumeurs, les métriques des districts, les journaux d'actions reproductibles et un générateur de nombres aléatoires déterministe. Chaque exécution peut être rejouée exactement.

### Conception de mondes assistée par l'IA

Une couche d'IA optionnelle qui crée des salles, des factions, des quêtes et des districts à partir d'un thème. Elle évalue les conceptions, corrige les erreurs de schéma, propose des améliorations et guide les processus de conception de mondes en plusieurs étapes. L'IA ne modifie jamais directement l'état de la simulation ; elle génère uniquement du contenu ou des suggestions.

### Flux de travail de conception guidés

Des flux de travail sensibles aux sessions et axés sur la planification pour la création de mondes, les boucles d'évaluation, l'itération de la conception, la création guidée et les plans d'ajustement structurés. Combine des outils déterministes avec une assistance de l'IA.

### Analyse de simulation

Analyse des parties qui explique pourquoi certains événements se sont produits, où les mécanismes ne fonctionnent pas, quels déclencheurs ne se déclenchent jamais et quels systèmes créent de l'instabilité. Les résultats structurés sont directement intégrés à l'ajustement.

### Ajustement guidé

Les résultats de l'équilibrage génèrent des plans d'ajustement structurés avec des corrections proposées, l'impact attendu, des estimations de confiance et des modifications prévues. Appliqués étape par étape avec une traçabilité complète.

### Expériences de scénarios

Exécutez des lots de simulations sur différentes configurations pour comprendre le comportement typique. Extrayez les métriques des scénarios, détectez les variations, ajustez les paramètres et comparez les mondes optimisés aux mondes de référence. Transforme la conception de mondes en un processus testable.

### Studio en ligne de commande

Studio de conception en ligne de commande avec des tableaux de bord de projet, la navigation des problèmes, l'inspection des expériences, l'historique des sessions, l'intégration guidée et la découverte de commandes contextuelle. Un espace de travail pour créer et tester des mondes.

---

## Démarrage rapide

```bash
# Install the CLI
npm install -g @ai-rpg-engine/cli

# Start the interactive studio
ai chat

# Run onboarding
/onboard

# Create your first content
create-room haunted chapel

# Run a simulation
simulate

# Analyze the results
analyze-balance

# Tune the design
tune paranoia

# Run an experiment
experiment run --runs 50
```

---

## Flux de travail typique

```bash
ai chat

/onboard
create-location-pack haunted chapel district
critique-content
simulate
analyze-balance
tune rumor propagation
experiment run --runs 50
compare-replays
```

Créez un monde et améliorez-le grâce aux données issues de la simulation.

---

## Architecture

Le système comporte quatre couches.

| Couche | Rôle |
|-------|------|
| **Simulation** | Moteur déterministe — état du monde, événements, actions, perception, cognition, factions, propagation des rumeurs, métriques des districts, relecture |
| **Authoring** | Génération de contenu — création de modèles, évaluation, normalisation, boucles de réparation, générateurs de packs |
| **AI Cognition** | Assistance de l'IA optionnelle — interface de discussion, routage contextuel, récupération, formation de la mémoire, orchestration des outils |
| **Studio UX** | Environnement de conception en ligne de commande — tableaux de bord, suivi des problèmes, navigation des expériences, historique des sessions, flux de travail guidés |

---

## Paquets

| Paquet | Objectif |
|---------|---------|
| [`@ai-rpg-engine/core`](packages/core) | Exécution de simulation déterministe — état du monde, événements, générateur de nombres aléatoires, cycles, résolution des actions |
| [`@ai-rpg-engine/modules`](packages/modules) | 17 modules intégrés — combat, perception, cognition, factions, rumeurs, districts |
| [`@ai-rpg-engine/content-schema`](packages/content-schema) | Schémas et validateurs canoniques pour le contenu du monde |
| [`@ai-rpg-engine/ollama`](packages/ollama) | Création de contenu assistée par l'IA optionnelle — création de modèles, évaluation, flux de travail guidés, ajustement, expériences |
| [`@ai-rpg-engine/cli`](packages/cli) | Studio de conception en ligne de commande — interface de discussion, flux de travail, outils d'expérimentation |
| [`@ai-rpg-engine/terminal-ui`](packages/terminal-ui) | Rendu pour terminaux et couche d'entrée |
| [`@ai-rpg-engine/starter-fantasy`](packages/starter-fantasy) | The Chapel Threshold — monde de démarrage fantastique |
| [`@ai-rpg-engine/starter-cyberpunk`](packages/starter-cyberpunk) | Neon Lockbox — monde de démarrage cyberpunk |

---

## Documentation

| Ressource | Description |
|----------|-------------|
| [Handbook](docs/handbook/index.md) | 26 chapitres + 4 annexes couvrant tous les systèmes. |
| [Design Document](docs/DESIGN.md) | Analyse approfondie de l'architecture : pipeline d'actions, distinction entre données et présentation, couches de simulation. |
| [AI Worldbuilding Guide](packages/ollama/AI_WORLDBUILDING.md) | Flux de travail pour la création de prototypes, le diagnostic, l'optimisation et l'expérimentation. |
| [Philosophy](PHILOSOPHY.md) | Pourquoi des mondes déterministes, une conception basée sur des preuves et l'IA comme assistant. |
| [Changelog](CHANGELOG.md) | Historique des versions |

---

## Philosophie

Le moteur AI RPG est construit autour de trois idées :

1. **Mondes déterministes** : les résultats de la simulation doivent être reproductibles.
2. **Conception basée sur des preuves** : les mécanismes du monde doivent être testés par simulation.
3. **L'IA comme assistant, et non comme autorité** : les outils d'IA aident à générer et à évaluer les conceptions, mais ne remplacent pas les systèmes déterministes.

Consultez [PHILOSOPHY.md](PHILOSOPHY.md) pour une explication complète.

---

## Sécurité

Le moteur AI RPG est une **bibliothèque de simulation locale uniquement**. Aucune télémétrie, aucun réseau, aucun secret. Les fichiers de sauvegarde sont enregistrés dans le dossier `.ai-rpg-engine/` uniquement lorsqu'ils sont explicitement demandés. Consultez [SECURITY.md](SECURITY.md) pour plus de détails.

## Prérequis

- Node.js >= 20
- TypeScript (modules ESM)

## Licence

[MIT](LICENSE)

---

Créé par <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
