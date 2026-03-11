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

Une boîte à outils TypeScript pour créer des simulations de jeux de rôle (RPG) déterministes. Vous définissez les statistiques, choisissez des modules, assemblez un système de combat et créez du contenu. Le moteur gère l'état, les événements, le générateur de nombres aléatoires, la résolution des actions et la prise de décision de l'IA. Chaque exécution est reproductible.

Il s'agit d'un **moteur de composition**, et non d'un jeu complet. Les 10 mondes de démarrage sont des exemples : des modèles modulaires à partir desquels vous pouvez apprendre et créer vos propres jeux. Votre jeu utilise l'ensemble des modules du moteur dont vous avez besoin.

---

## Ce que c'est

- Une **bibliothèque de modules** : plus de 27 modules couvrant le combat, la perception, la cognition, les factions, les rumeurs, le déplacement, les compagnons, et plus encore.
- Une **boîte à outils de composition** : `buildCombatStack()` assemble le système de combat en environ 7 lignes ; `new Engine({ modules })` lance le jeu.
- Un **environnement d'exécution de simulation** : exécution déterministe, journaux d'actions reproductibles, générateur de nombres aléatoires initialisé.
- Un **studio de conception d'IA** (facultatif) : outils de création, d'évaluation, d'analyse de l'équilibre, de réglage et d'expérimentation via Ollama.

## Ce que ce n'est pas

- Ce n'est pas un jeu jouable prêt à l'emploi : vous le créez à partir de modules et de contenu.
- Ce n'est pas un moteur graphique : il génère des événements structurés, pas des pixels.
- Ce n'est pas un générateur d'histoires : il simule des mondes ; le récit émerge des mécanismes.

---

## État actuel (v2.3.0)

**Ce qui fonctionne et est testé :**
- Noyau de l'environnement d'exécution : état du monde, événements, actions, exécution, relecture - stable depuis la version 1.0.
- Système de combat : 5 actions, 4 états de combat, 4 états d'engagement, interception des compagnons, gestion des défaites, tactiques de l'IA - 1099 tests.
- Capacités : coûts, temps de recharge, vérifications de statistiques, effets typés, vocabulaire des états, sélection tenant compte de l'IA.
- Couche de décision unifiée : le score de combat et des capacités est fusionné en un seul appel (`selectBestAction`).
- 10 mondes de démarrage avec des ennemis aux statistiques différentes et une intégration complète du combat.
- `buildCombatStack()` élimine environ 40 lignes de configuration du combat par monde.
- Taxonomie des balises et utilitaires de validation pour la création de contenu.
- Validation des phases de boss avec suivi des balises entre les phases.

**Ce qui est rudimentaire ou incomplet :**
- Les outils de création de monde pour l'IA (couche Ollama) fonctionnent, mais sont moins testés que la simulation.
- L'environnement de ligne de commande est fonctionnel, mais pas optimisé.
- Seul 1 des 10 mondes de démarrage utilise `buildCombatStack` (Weird West) ; les autres utilisent une configuration manuelle détaillée.
- Il n'y a pas encore de système de profil : les mondes sont autonomes et ne peuvent pas être composés à partir de profils partagés.
- La documentation est extensive (57 chapitres), mais tous les chapitres ne reflètent pas les dernières API.

---

## Démarrage rapide

```typescript
import { Engine } from '@ai-rpg-engine/core';
import { buildCombatStack, createTraversalCore, createDialogueCore } from '@ai-rpg-engine/modules';

// Define your stat mapping
const combat = buildCombatStack({
  statMapping: { attack: 'might', precision: 'agility', resolve: 'will' },
  playerId: 'hero',
  biasTags: ['undead', 'beast'],
});

// Wire the engine
const engine = new Engine({
  manifest: myManifest,
  modules: [...combat.modules, createTraversalCore(), createDialogueCore(myDialogues)],
});

// Submit player actions
engine.submitAction('attack', { targetIds: ['skeleton-1'] });

// Submit AI entity actions
engine.submitActionAs('guard-captain', 'attack', { targetIds: ['player'] });
```

Consultez le [Guide de composition](docs/handbook/57-composition-guide.md) pour connaître le flux de travail complet.

---

## Architecture

| Couche | Rôle |
|-------|------|
| **Core Runtime** | Moteur déterministe : état du monde, événements, actions, exécution, générateur de nombres aléatoires, relecture. |
| **Modules** | Plus de 27 systèmes modulaires : combat, perception, cognition, factions, déplacement, compagnons, etc. |
| **Content** | Entités, zones, dialogues, objets, capacités, états - créés par l'utilisateur. |
| **AI Studio** | Couche Ollama facultative : outils de création, d'évaluation, d'analyse de l'équilibre, de réglage et d'expérimentation. |

---

## Système de combat

Cinq actions (attaque, défense, désengagement, parade, repositionnement), quatre états de combat (en garde, déséquilibré, exposé, en fuite), quatre états d'engagement (engagé, protégé, arrière-garde, isolé). Trois dimensions de statistiques influencent chaque formule, ce qui signifie qu'un duelliste rapide joue différemment d'un combattant lourd ou d'un sentinelle posé.

Les adversaires de l'IA utilisent un système de score de décision unifié : les actions de combat et les capacités sont évaluées ensemble, avec des seuils configurables pour éviter le spam de capacités marginales.

Les auteurs de packs utilisent `buildCombatStack()` pour intégrer le système de combat en environ 7 lignes : mappage des statistiques, profil des ressources et étiquettes de biais. Consultez la [Vue d'ensemble du combat](docs/handbook/49a-combat-overview.md) et le [Guide de l'auteur de pack](docs/handbook/55-combat-pack-guide.md).

---

## Capacités

Système de capacités spécifique au genre, avec coûts, vérifications de statistiques, temps de recharge et effets typés (dommages, soins, application d'état, purification). Les effets d'état utilisent un vocabulaire sémantique avec 11 balises et des profils de résistance/vulnérabilité. La sélection tenant compte de l'IA évalue les chemins auto/AoE/cible unique.

```typescript
const warCry: AbilityDefinition = {
  id: 'war-cry', name: 'War Cry', verb: 'use-ability',
  tags: ['combat', 'debuff', 'aoe'],
  costs: [{ resourceId: 'stamina', amount: 3 }],
  target: { type: 'all-enemies' },
  checks: [{ stat: 'nerve', difficulty: 6, onFail: 'abort' }],
  effects: [
    { type: 'apply-status', target: 'target', params: { statusId: 'rattled', duration: 2 } },
  ],
  cooldown: 4,
};
```

---

## Paquets

| Paquet | Objectif |
|---------|---------|
| [`@ai-rpg-engine/core`](packages/core) | Durée de simulation déterministe : état du monde, événements, générateur de nombres aléatoires, cycles, résolution des actions. |
| [`@ai-rpg-engine/modules`](packages/modules) | 27+ modules composables — combat, perception, cognition, factions, rumeurs, exploration, compagnons, autonomie des PNJ, carte stratégique, reconnaissance d'objets, opportunités émergentes, détection d'arcs narratifs, déclencheurs de fin de partie. |
| [`@ai-rpg-engine/content-schema`](packages/content-schema) | Schémas et validateurs canoniques pour le contenu du monde. |
| [`@ai-rpg-engine/character-profile`](packages/character-profile) | État de progression du personnage, blessures, étapes importantes, réputation. |
| [`@ai-rpg-engine/character-creation`](packages/character-creation) | Sélection d'archétypes, génération de personnages, équipement de départ. |
| [`@ai-rpg-engine/equipment`](packages/equipment) | Types d'équipements, origine des objets, évolution des reliques. |
| [`@ai-rpg-engine/campaign-memory`](packages/campaign-memory) | Mémoire entre les sessions, effets des relations, état de la campagne. |
| [`@ai-rpg-engine/ollama`](packages/ollama) | Création d'IA optionnelle : structure de base, critique, flux de travail guidés, réglages, expérimentations. |
| [`@ai-rpg-engine/cli`](packages/cli) | Studio de conception en ligne de commande. |
| [`@ai-rpg-engine/terminal-ui`](packages/terminal-ui) | Rendu pour terminaux et couche d'entrée |

### Exemples de démarrage

Les 10 mondes de démarrage sont des **exemples de composition** — ils illustrent comment combiner les modules du moteur pour créer des jeux complets. Chacun présente des schémas différents (mappages de statistiques, profils de ressources, configurations d'engagement, ensembles de compétences). Consultez le fichier README de chaque exemple de démarrage pour connaître les "schémas illustrés" et "ce que vous pouvez emprunter".

| Débutant | Genre | Schémas clés |
|---------|-------|-------------|
| [`starter-fantasy`](packages/starter-fantasy) | Fantasy sombre | Combat minimal, axé sur le dialogue. |
| [`starter-cyberpunk`](packages/starter-cyberpunk) | Cyberpunk | Ressources, rôles d'engagement. |
| [`starter-detective`](packages/starter-detective) | Mystère victorien | Priorité aux interactions sociales, forte importance de la perception. |
| [`starter-pirate`](packages/starter-pirate) | Pirate | Combat naval et rapproché, plusieurs zones. |
| [`starter-zombie`](packages/starter-zombie) | Survie contre les zombies | Pénurie, ressource "infection". |
| [`starter-weird-west`](packages/starter-weird-west) | Far West étrange | Référence buildCombatStack, biais des paquets. |
| [`starter-colony`](packages/starter-colony) | Colonie spatiale | Points de passage, zones d'embuscade. |
| [`starter-ronin`](packages/starter-ronin) | Japon féodal | Passages secrets, multiples rôles de protecteur. |
| [`starter-vampire`](packages/starter-vampire) | Horreur des vampires | Ressource "sang", manipulation sociale. |
| [`starter-gladiator`](packages/starter-gladiator) | Gladiateur historique | Combat en arène, faveur du public. |

---

## Documentation

| Ressource | Description |
|----------|-------------|
| [Composition Guide](docs/handbook/57-composition-guide.md) | Créez votre propre jeu en composant des modules du moteur — commencez ici. |
| [Combat Overview](docs/handbook/49a-combat-overview.md) | Six piliers du combat, cinq actions, aperçu des états. |
| [Pack Author Guide](docs/handbook/55-combat-pack-guide.md) | Construction pas à pas de buildCombatStack, mappage des statistiques, profils de ressources. |
| [Handbook](docs/handbook/index.md) | 43 chapitres + 4 annexes couvrant tous les systèmes. |
| [Composition Model](docs/composition-model.md) | Les 6 couches réutilisables et leur composition. |
| [Examples](docs/examples/) | Exemples en TypeScript exécutables — groupe mixte, entre les mondes, à partir de zéro. |
| [Design Document](docs/DESIGN.md) | Analyse approfondie de l'architecture — pipeline d'actions, vérité vs présentation. |
| [Philosophy](PHILOSOPHY.md) | Pourquoi des mondes déterministes, une conception basée sur des preuves et une IA comme assistant. |
| [Changelog](CHANGELOG.md) | Historique des versions |

---

## Feuille de route

### Où nous en sommes actuellement

Le moteur de simulation et le système de combat sont solides — 2661 tests, 10 exemples de genres, relecture déterministe, notation complète des décisions de l'IA. Le moteur fonctionne comme une boîte à outils de composition : sélectionnez des modules, définissez les statistiques, connectez-les, créez du contenu. La documentation couvre tous les systèmes, mais nécessite une synchronisation de l'API pour les dernières additions.

### Les prochaines semaines

- Migrer les 9 exemples de démarrage restants vers `buildCombatStack` (le Far West étrange est la référence).
- Synchronisation de la documentation de l'API — `submitActionAs`, `selectBestAction`, `resourceCaps`, taxonomie des balises.
- Amélioration des fichiers README des exemples de démarrage — "ce que vous pouvez emprunter" et conseils de remixage plus clairs.
- Passage de liaison croisée — README, guide de composition, exemples et manuel liés ensemble.

### Objectif : Profils de plugins

L'objectif ultime du moteur est de proposer des **profils définis par l'utilisateur** — des ensembles portables qui peuvent être intégrés à n'importe quel jeu. Un profil regroupe un mappage de statistiques, un comportement des ressources, des balises de biais de l'IA, des compétences et des points de connexion d'événements en une seule unité importable. Deux joueurs avec des profils différents peuvent partager un monde, chacun apportant son propre style de jeu.

Les profils s'appuient sur la composition (déjà en place) et la couche de décision unifiée (intégrée dans la version 2.3.0). Le travail restant consiste à définir le schéma du profil, à créer le chargeur et à valider les interactions entre les profils. Consultez la [feuille de route des profils](docs/profile-roadmap.md) pour connaître le plan complet.

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
