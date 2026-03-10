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

# Moteur de jeu de rôle basé sur l'IA

Un ensemble d'outils conçu pour la simulation, permettant de créer, d'analyser et d'équilibrer des mondes de jeux de rôle.

Le moteur de jeu de rôle basé sur l'IA combine un environnement de simulation déterministe avec un studio de conception assisté par l'IA, permettant aux créateurs de construire des mondes, de les tester par simulation et de les améliorer sur la base de données plutôt que par simple intuition.

> Les outils traditionnels vous aident à écrire des histoires.
> Le moteur de jeu de rôle basé sur l'IA vous aide à **tester des mondes**.

---

## Ce qu'il fait

```
build → critique → simulate → analyze → tune → experiment
```

Vous pouvez générer du contenu pour le monde, évaluer les conceptions, exécuter des simulations déterministes, analyser le comportement des parties, ajuster les mécanismes, effectuer des expériences sur de nombreuses configurations, et comparer les résultats. Chaque résultat est reproductible, vérifiable et explicable.

---

## Fonctionnalités principales

### Simulation déterministe

Un moteur de simulation basé sur des cycles pour les mondes de jeux de rôle. Il comprend l'état du monde, le système d'événements, les couches de perception et de cognition, la propagation des croyances des factions, les systèmes de rumeurs, les indicateurs des districts avec dérivation de l'humeur, l'autonomie des PNJ avec des seuils de loyauté et des chaînes de conséquences, les compagnons avec le moral et le risque de départ, l'influence du joueur et les actions politiques, l'analyse de la carte stratégique, un conseiller de déplacement, la reconnaissance des objets et la provenance de l'équipement, les étapes clés de l'évolution des reliques, les opportunités émergentes (contrats, primes, faveurs, approvisionnements, enquêtes) générées à partir des conditions du monde, la détection des arcs narratifs (10 types d'arcs dérivés de l'état accumulé), la détection des déclencheurs de fin de partie (8 classes de résolution), et le rendu déterministe de la fin avec des épilogues structurés. Les journaux d'actions sont reproductibles et le générateur de nombres aléatoires est déterministe. Chaque exécution peut être rejouée exactement.

### Conception de monde assistée par l'IA

Une couche d'IA optionnelle qui crée des salles, des factions, des quêtes et des districts à partir d'un thème. Elle évalue les conceptions, corrige les erreurs de schéma, propose des améliorations et guide les flux de travail de conception complexes. L'IA ne modifie jamais directement l'état de la simulation ; elle génère uniquement du contenu ou des suggestions.

### Flux de travail de conception guidés

Des flux de travail sensibles aux sessions et axés sur la planification pour la création de mondes, les boucles d'évaluation, l'itération de la conception, la création guidée et les plans d'ajustement structurés. Combine des outils déterministes avec une assistance de l'IA.

### Capacités et pouvoirs

Système de capacités intrinsèques au genre, avec une couverture inter-genre regroupant 10 éléments. Les capacités ont des coûts, des tests de statistiques, des temps de recharge et des effets de type (dommages, soins, application de statut, purification). Les effets de statut utilisent un vocabulaire sémantique avec 11 étiquettes, ainsi que des profils de résistance/vulnérabilité pour les entités. Le système de sélection des capacités, conscient de l'IA, évalue les options de dégâts directs/de zone/ciblés, en tenant compte de la résistance et de l'efficacité de la purification. Des outils d'audit de l'équilibre et de résumé des ensembles permettent de détecter les anomalies lors de la création.

```typescript
const warCry: AbilityDefinition = {
  id: 'war-cry', name: 'War Cry', verb: 'use-ability',
  tags: ['combat', 'debuff', 'aoe'],
  costs: [{ resourceId: 'stamina', amount: 3 }, { resourceId: 'infection', amount: 5 }],
  target: { type: 'all-enemies' },
  checks: [{ stat: 'nerve', difficulty: 6, onFail: 'abort' }],
  effects: [
    { type: 'apply-status', target: 'target', params: { statusId: 'rattled', duration: 2 } },
  ],
  cooldown: 4,
};
```

### Analyse de simulation

Une analyse des parties qui explique pourquoi certains événements se sont produits, où les mécanismes ne fonctionnent pas, quels déclencheurs ne se déclenchent jamais et quels systèmes créent de l'instabilité. Les résultats structurés sont directement intégrés aux ajustements.

### Ajustements guidés

Les résultats de l'équilibrage génèrent des plans d'ajustement structurés avec des corrections proposées, l'impact attendu, des estimations de confiance et des modifications prévues. Ils sont appliqués étape par étape avec une traçabilité complète.

### Expériences de scénarios

Exécutez des lots de simulations sur différentes configurations pour comprendre le comportement typique. Extrayez les indicateurs des scénarios, détectez les variations, ajustez les paramètres et comparez les mondes ajustés aux mondes de référence. Transforme la conception du monde en un processus testable.

### Environnement de développement

Un environnement de développement en ligne de commande avec des tableaux de bord de projet, la navigation des problèmes, l'inspection des expériences, l'historique des sessions, l'intégration guidée et la découverte de commandes contextuelles. Un espace de travail pour créer et tester des mondes.

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
| **Simulation** | Moteur déterministe — état du monde, événements, actions, perception, cognition, factions, propagation des rumeurs, indicateurs des districts, rejouabilité |
| **Authoring** | Génération de contenu — création de structures, évaluation, normalisation, boucles de réparation, générateurs de packs |
| **AI Cognition** | Assistance de l'IA optionnelle — interface de discussion, routage contextuel, récupération, formation de la mémoire, orchestration des outils |
| **Studio UX** | Environnement de développement en ligne de commande — tableaux de bord, suivi des problèmes, navigation des expériences, historique des sessions, flux de travail guidés |

---

## Paquets

| Paquet | Objectif |
|---------|---------|
| [`@ai-rpg-engine/core`](packages/core) | Durée de simulation déterministe : état du monde, événements, générateur de nombres aléatoires, cycles, résolution des actions. |
| [`@ai-rpg-engine/modules`](packages/modules) | 29 modules intégrés : combat, perception, cognition, factions, rumeurs, districts, actions des PNJ, compagnons, influence du joueur, carte stratégique, conseiller de déplacement, reconnaissance des objets, opportunités émergentes, détection des arcs narratifs, déclencheurs de fin de partie. |
| [`@ai-rpg-engine/content-schema`](packages/content-schema) | Schémas et validateurs canoniques pour le contenu du monde. |
| [`@ai-rpg-engine/character-profile`](packages/character-profile) | État de progression du personnage, blessures, étapes importantes, réputation. |
| [`@ai-rpg-engine/character-creation`](packages/character-creation) | Sélection d'archétypes, génération de personnages, équipement de départ. |
| [`@ai-rpg-engine/equipment`](packages/equipment) | Types d'équipement, origine des objets, évolution des reliques, chroniques des objets. |
| [`@ai-rpg-engine/campaign-memory`](packages/campaign-memory) | Mémoire entre les sessions, effets des relations, état de la campagne. |
| [`@ai-rpg-engine/ollama`](packages/ollama) | Création d'IA optionnelle : structure de base, critique, flux de travail guidés, réglages, expérimentations. |
| [`@ai-rpg-engine/cli`](packages/cli) | Studio de conception en ligne de commande : interface de discussion, flux de travail, outils d'expérimentation. |
| [`@ai-rpg-engine/terminal-ui`](packages/terminal-ui) | Rendu pour terminaux et couche d'entrée |
| [`@ai-rpg-engine/starter-fantasy`](packages/starter-fantasy) | Chapel Threshold : monde de départ fantastique. |
| [`@ai-rpg-engine/starter-cyberpunk`](packages/starter-cyberpunk) | Neon Lockbox : monde de départ cyberpunk. |
| [`@ai-rpg-engine/starter-detective`](packages/starter-detective) | Gaslight Detective : monde de départ mystère victorien. |
| [`@ai-rpg-engine/starter-pirate`](packages/starter-pirate) | Black Flag Requiem : monde de départ pirate. |
| [`@ai-rpg-engine/starter-zombie`](packages/starter-zombie) | Ashfall Dead : monde de départ de survie aux zombies. |
| [`@ai-rpg-engine/starter-weird-west`](packages/starter-weird-west) | Dust Devil's Bargain : monde de départ western étrange. |
| [`@ai-rpg-engine/starter-colony`](packages/starter-colony) | Signal Loss : monde de départ de colonie de science-fiction. |

---

## Documentation

| Ressource | Description |
|----------|-------------|
| [Handbook](docs/handbook/index.md) | 43 chapitres + 4 annexes couvrant tous les systèmes. |
| [Design Document](docs/DESIGN.md) | Analyse approfondie de l'architecture : pipeline d'actions, distinction entre vérité et présentation, couches de simulation. |
| [AI Worldbuilding Guide](packages/ollama/AI_WORLDBUILDING.md) | Flux de travail de structuration, de diagnostic, de réglage et d'expérimentation. |
| [Philosophy](PHILOSOPHY.md) | Pourquoi des mondes déterministes, une conception basée sur des preuves et une IA comme assistant. |
| [Changelog](CHANGELOG.md) | Historique des versions |

---

## Philosophie

Le moteur de RPG IA est construit autour de trois idées :

1. **Mondes déterministes** : les résultats de la simulation doivent être reproductibles.
2. **Conception basée sur des preuves** : les mécanismes du monde doivent être testés par simulation.
3. **L'IA comme assistant, et non comme autorité** : les outils d'IA aident à générer et à critiquer les conceptions, mais ne remplacent pas les systèmes déterministes.

Consultez [PHILOSOPHY.md](PHILOSOPHY.md) pour une explication complète.

---

## Sécurité

Le moteur de RPG IA est une **bibliothèque de simulation locale uniquement**. Aucune télémétrie, aucun réseau, aucun secret. Les fichiers de sauvegarde sont enregistrés uniquement dans le dossier `.ai-rpg-engine/` lorsqu'ils sont explicitement demandés. Consultez [SECURITY.md](SECURITY.md) pour plus de détails.

## Prérequis

- Node.js >= 20
- TypeScript (modules ESM)

## Licence

[MIT](LICENSE)

---

Créé par <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
