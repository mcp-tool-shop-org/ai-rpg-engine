<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.md">English</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português</a>
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

Boîte à outils native pour la simulation, permettant de créer, analyser et équilibrer des mondes de jeux de rôle.

AI RPG Engine combine un moteur de simulation déterministe avec un studio de conception assisté par IA, permettant aux auteurs de construire des mondes, de les tester par simulation et de les améliorer sur la base de preuves plutôt que de suppositions.

> Les outils traditionnels vous aident à écrire des histoires.
> AI RPG Engine vous aide à **tester des mondes**.

---

## Ce qu'il fait

```
build → critique → simulate → analyze → tune → experiment
```

Vous pouvez générer du contenu pour le monde, évaluer les conceptions, exécuter des simulations déterministes, analyser le comportement des parties, ajuster les mécaniques, mener des expériences sur de nombreuses graines aléatoires et comparer les résultats. Chaque résultat est reproductible, inspectable et explicable.

---

## Fonctionnalités principales

### Simulation déterministe

Un moteur de simulation basé sur des cycles pour les mondes de jeux de rôle. État du monde, système d'événements, couches de perception et de cognition, propagation des croyances des factions, systèmes de rumeurs, métriques des districts avec dérivation de l'humeur, agentivité des PNJ avec seuils de loyauté et chaînes de conséquences, compagnons avec moral et risque de départ, levier du joueur et action politique, analyse stratégique de la carte, conseiller de déplacement, reconnaissance d'objets et provenance de l'équipement, jalons de croissance des reliques, opportunités émergentes (contrats, primes, faveurs, missions de ravitaillement, enquêtes) générées à partir des conditions du monde, détection d'arcs de campagne (10 types d'arcs dérivés de l'état accumulé), détection de déclencheurs de fin de partie (8 classes de résolution) et rendu déterministe du final avec épilogue structuré. Journaux d'actions reproductibles et générateur de nombres aléatoires déterministe. Chaque exécution peut être rejouée exactement.

### Conception de mondes assistée par IA

Couche d'IA optionnelle qui génère des salles, des factions, des quêtes et des districts à partir d'un thème. Elle évalue les conceptions, normalise les erreurs de schéma, propose des améliorations et guide les processus de conception de mondes en plusieurs étapes. L'IA ne modifie jamais directement l'état de la simulation — elle génère uniquement du contenu ou des suggestions.

### Flux de travail de conception guidés

Des flux de travail contextuels et axés sur la planification pour la création de mondes, les boucles d'évaluation, l'itération de la conception, la construction guidée et les plans d'ajustement structurés. Combine des outils déterministes avec une assistance IA.

### Analyse de simulation

Analyse des parties rejouées qui explique pourquoi certains événements se sont produits, où les mécaniques échouent, quels déclencheurs ne s'activent jamais et quels systèmes créent de l'instabilité. Les résultats structurés alimentent directement l'ajustement.

### Ajustement guidé

Les résultats de l'équilibrage génèrent des plans d'ajustement structurés avec des corrections proposées, l'impact attendu, des estimations de confiance et des modifications prévisualisées. Appliqués étape par étape avec une traçabilité complète.

### Expériences de scénarios

Exécutez des lots de simulations sur différentes graines aléatoires pour comprendre le comportement typique. Extrayez les métriques des scénarios, détectez les variations, balayez les paramètres et comparez les mondes ajustés aux mondes de référence. Transforme la conception de mondes en un processus testable.

### Studio en ligne de commande

Studio de conception en ligne de commande avec tableaux de bord de projet, navigation des problèmes, inspection des expériences, historique des sessions, intégration guidée et découverte de commandes contextuelle. Un espace de travail pour créer et tester des mondes.

---

## Démarrage rapide

```bash
# Installer le CLI
npm install -g @ai-rpg-engine/cli

# Lancer le studio interactif
ai chat

# Lancer l'intégration
/onboard

# Créer votre premier contenu
create-room haunted chapel

# Exécuter une simulation
simulate

# Analyser les résultats
analyze-balance

# Ajuster la conception
tune paranoia

# Lancer une expérience
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

Créez un monde et améliorez-le grâce aux preuves issues de la simulation.

---

## Architecture

Le système comporte quatre couches.

| Couche | Rôle |
|-------|------|
| **Simulation** | Moteur déterministe — état du monde, événements, actions, perception, cognition, factions, propagation des rumeurs, métriques des districts, relecture |
| **Authoring** | Génération de contenu — création de modèles, évaluation, normalisation, boucles de réparation, générateurs de packs |
| **AI Cognition** | Assistance IA optionnelle — interface de discussion, routage contextuel, récupération, formation de la mémoire, orchestration des outils |
| **Studio UX** | Environnement de conception en ligne de commande — tableaux de bord, suivi des problèmes, navigation des expériences, historique des sessions, flux de travail guidés |

---

## Paquets

| Paquet | Objectif |
|---------|---------|
| [`@ai-rpg-engine/core`](packages/core) | Exécution de simulation déterministe — état du monde, événements, générateur de nombres aléatoires, cycles, résolution des actions |
| [`@ai-rpg-engine/modules`](packages/modules) | 29 modules intégrés — combat, perception, cognition, factions, rumeurs, districts, agentivité des PNJ, compagnons, levier du joueur, carte stratégique, conseiller de déplacement, reconnaissance d'objets, opportunités émergentes, détection d'arcs, déclencheurs de fin de partie |
| [`@ai-rpg-engine/content-schema`](packages/content-schema) | Schémas et validateurs canoniques pour le contenu du monde |
| [`@ai-rpg-engine/character-profile`](packages/character-profile) | État de progression du personnage, blessures, jalons, réputation |
| [`@ai-rpg-engine/character-creation`](packages/character-creation) | Sélection d'archétype, génération de build, équipement de départ |
| [`@ai-rpg-engine/equipment`](packages/equipment) | Types d'équipement, provenance des objets, croissance des reliques, chroniques d'objets |
| [`@ai-rpg-engine/campaign-memory`](packages/campaign-memory) | Mémoire inter-sessions, effets relationnels, état de campagne |
| [`@ai-rpg-engine/ollama`](packages/ollama) | Création de contenu assistée par IA optionnelle — modèles, évaluation, flux de travail guidés, ajustement, expériences |
| [`@ai-rpg-engine/cli`](packages/cli) | Studio de conception en ligne de commande — interface de discussion, flux de travail, outils d'expérimentation |
| [`@ai-rpg-engine/terminal-ui`](packages/terminal-ui) | Rendu pour terminal et couche d'entrée |
| [`@ai-rpg-engine/starter-fantasy`](packages/starter-fantasy) | The Chapel Threshold — monde de démarrage fantastique |
| [`@ai-rpg-engine/starter-cyberpunk`](packages/starter-cyberpunk) | Neon Lockbox — monde de démarrage cyberpunk |
| [`@ai-rpg-engine/starter-detective`](packages/starter-detective) | Gaslight Detective — monde de démarrage mystère victorien |
| [`@ai-rpg-engine/starter-pirate`](packages/starter-pirate) | Black Flag Requiem — monde de démarrage pirate |
| [`@ai-rpg-engine/starter-zombie`](packages/starter-zombie) | Ashfall Dead — monde de démarrage survie zombie |
| [`@ai-rpg-engine/starter-weird-west`](packages/starter-weird-west) | Dust Devil's Bargain — monde de démarrage western étrange |
| [`@ai-rpg-engine/starter-colony`](packages/starter-colony) | Signal Loss — monde de démarrage colonie sci-fi |

---

## Documentation

| Ressource | Description |
|----------|-------------|
| [Handbook](docs/handbook/index.md) | 43 chapitres + 4 annexes couvrant chaque système |
| [Design Document](docs/DESIGN.md) | Analyse approfondie de l'architecture — pipeline d'actions, vérité vs présentation, couches de simulation |
| [AI Worldbuilding Guide](packages/ollama/AI_WORLDBUILDING.md) | Flux de travail pour la création de modèles, le diagnostic, l'ajustement et l'expérimentation |
| [Philosophy](PHILOSOPHY.md) | Pourquoi des mondes déterministes, une conception basée sur les preuves et l'IA comme assistant |
| [Changelog](CHANGELOG.md) | Historique des versions |

---

## Philosophie

AI RPG Engine est construit autour de trois idées :

1. **Mondes déterministes** — les résultats de la simulation doivent être reproductibles.
2. **Conception basée sur les preuves** — les mécaniques du monde doivent être testées par simulation.
3. **L'IA comme assistant, et non comme autorité** — les outils d'IA aident à générer et à évaluer les conceptions, mais ne remplacent pas les systèmes déterministes.

Consultez [PHILOSOPHY.md](PHILOSOPHY.md) pour l'explication complète.

---

## Sécurité

AI RPG Engine est une **bibliothèque de simulation locale uniquement**. Aucune télémétrie, aucun réseau, aucun secret. Les fichiers de sauvegarde sont enregistrés dans `.ai-rpg-engine/` uniquement sur demande explicite. Consultez [SECURITY.md](SECURITY.md) pour plus de détails.

## Prérequis

- Node.js >= 20
- TypeScript (modules ESM)

## Licence

[MIT](LICENSE)

---

Créé par <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
