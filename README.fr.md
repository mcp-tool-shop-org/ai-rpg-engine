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

# Moteur de RPG basé sur l’IA

Une boîte à outils TypeScript pour créer des simulations de RPG déterministes. Vous définissez les statistiques, choisissez des modules, configurez une séquence de combats et créez du contenu. Le moteur gère l’état, les événements, le générateur de nombres aléatoires (RNG), la résolution des actions et la prise de décision par l’IA. Chaque exécution est reproductible.

Il s’agit d’un **moteur de composition**, et non d’un jeu fini. Les 10 mondes de départ sont des exemples : des modèles décomposables à partir desquels vous pouvez apprendre et créer de nouvelles choses. Votre jeu utilise la partie du moteur dont vous avez besoin.

---

## Ce que c’est

- Une **bibliothèque de modules** — plus de 30 modules pour le moteur, couvrant les combats, la perception, la cognition, les factions, les rumeurs, le déplacement, les compagnons, etc.
- Une **boîte à outils de composition** — `buildCombatStack()` configure les combats en environ 7 lignes ; `new Engine({ modules })` lance le jeu
- Un **environnement d’exécution de simulation** — cycles déterministes, journaux d’actions rejouables, RNG avec amorçage
- Un **studio de conception d’IA** (facultatif) — échafaudage, critique, analyse de l’équilibre, réglages, expériences via Ollama

## Ce que ce n’est pas

- Pas un seul jeu terminé — il propose 10 mondes de départ jouables que vous pouvez utiliser dès aujourd'hui à titre d’exemple, et le moteur est l’ensemble d’outils à partir duquel vous créez *votre propre* jeu.
- Pas un moteur graphique — il génère des événements structurés, pas des pixels.
- Pas un générateur d’histoires — il simule des mondes ; la narration émerge de la mécanique du jeu.

---

## État actuel (v2.6.0)

**Ce qui fonctionne et a été testé :**
- Noyau d’exécution : état du monde, événements, actions, cycles de jeu, relecture — stable depuis la version 1.0 ; relecture déterministe avec des octets identiques (compteur d’ID par instance, générateur de nombres aléatoires initialisé).
- Système de combat : 5 actions, 4 états de combat, 4 états d’engagement, interception des compagnons, déroulement en cas de défaite, tactiques d’IA.
- Capacités : coûts, délais de récupération, vérifications de statistiques, effets typés, vocabulaire de statut à 11 étiquettes, sélection consciente de l’IA.
- **Combat de groupe (v2.4) :** ciblage des alliés (soin/amélioration/résurrection), filtrage AoE ami/ennemi, sélecteurs de cibles — un soigneur peut soigner un coéquipier ; les attaques AoE ennemies épargnent les alliés.
- **Effets de statut (v2.4) :** les modificateurs de statistiques passifs affectent le combat, DoT/HoT déterministes basés sur le compteur de cycles, déclencheurs réactifs à profondeur limitée (épines/réflexion).
- **Profils plug-in — résolution des règles par entité (v2.5) :** un combattant « puissant » et un mystique « volontaire » résolvent le combat en une seule fois, chacun lisant les statistiques via son propre mappage. `RuleProfile` + `WorldState.ruleProfiles` + `EntityState.ruleProfileId` ; `applyProfile()` attache un profil (mappage des statistiques, pools de ressources, capacités par entité) ; `buildProfile()`, `validateProfileSet()` (les ID en double sont rejetés), 10 modèles dérivés pour commencer, et une commande CLI `profile`.
- **Boucle de jeu jouable (`run`) (v2.6) :** le jeu final est réel, pas une démo — les ennemis agissent selon leurs propres profils d’intention d’IA (`agressif`/`prudent`/`territorial`/`calculateur`), un combat se termine par une victoire ou une défaite, vous pouvez enregistrer et reprendre, et les capacités et l’XP sont disponibles dans le menu des actions. `run <path>` charge un jeu que vous avez préparé. Interface utilisateur terminal composée avec un HUD clair et des couleurs accessibles (prend en compte `NO_COLOR` / non-TTY).
- **L’atelier de conception d’IA est fourni sous forme de sa propre commande `ai` (v2.6) :** `npm install -g @ai-rpg-engine/ollama` → `ai chat` — prépare, critique et équilibre le contenu par rapport à un modèle Ollama local.
- Couche de décision unifiée : le combat + la notation des capacités sont fusionnés en un seul appel (`selectBestAction`).
- Les 10 mondes de départ utilisent `buildCombatStack()` — l’ossature de composition éprouvée.
- API de configuration de la cognition (`cognition: CognitionCoreConfig | false`) pour le réglage de l’IA par monde de départ.
- Taxonomie des étiquettes et utilitaires de validation pour la création de contenu.
- `ai-rpg-engine create-starter <name>` — prépare un nouveau jeu (autonome, s’exécute en dehors du monorepositoire) ; commandes de contenu `validate` + `scaffold` ; charge les paquets à partir de JSON.
- Modèle de départ publié sur npm (`@ai-rpg-engine/starter-template`).
- Suite de tests complète : **4292 tests** (déterministe lors d’exécutions répétées ; le respect des exigences de couverture est appliqué dans l’intégration continue).

**Ce qui est encore en développement ou incomplet :**
- L’atelier de création de mondes par IA (couche Ollama) est moins testé que le noyau de simulation et nécessite un démon Ollama local ; il est entièrement facultatif — le moteur et la boucle `run` n’ont pas besoin de réseau.
- La pile de narration/audio génère des commandes audio déterministes, mais il **n’y a pas de backend audio terminal** — aucun son n’est émis ; les commandes sont un point d’intégration pour une interface graphique/un module Web.
- Le mode multijoueur (deux joueurs humains partageant un même monde) **n’est pas implémenté** — il s’agit d’une couche réseau, délibérément hors de portée ; les profils actuels ciblent un seul contrôleur.
- La documentation est complète, mais toutes les pages du manuel ne reflètent pas les dernières API.

---

## À quoi cela ressemble

L’interface utilisateur terminal intégrée compose chaque tour en sections étiquetées — scène, statut, journal et actions — avec un HUD clair. La sortie est par défaut du texte brut et ajoute des couleurs sémantiques sur un TTY (rouge pour les dégâts, vert pour les soins, jaune pour les rejets), tout en respectant `NO_COLOR` et les flux non-TTY ; chaque indication est également transmise dans le texte, jamais uniquement par la couleur.

```text
── The Crypt Gate ──────────────────────────────────────────
  [dark, unhallowed]

  ! Crypt Warden · HP 6/14 · Off Balance
  ! Bone Thrall · defeated
  + Mira · HP 11/16

  * rusted portcullis winch

  Exits: Ossuary, Churchyard

── Status ──────────────────────────────────────────────────
  HP 9/20 [#####-----]  Stamina 4/10
  Status: Guarded
  Items: healing-draught, grave-key

── Log ─────────────────────────────────────────────────────
  > Ash takes a guarded stance.
  > Hit!  4 damage dealt (HP: 6)
  > Bone Thrall defeated!
  > You can't do that: not enough stamina

── Actions ─────────────────────────────────────────────────
  [ 1] Move to Ossuary      [ 3] Attack Crypt Warden
  [ 2] Move to Churchyard   [ 4] Inspect Crypt Warden
────────────────────────────────────────────────────────────
```

---

## Installation et lancement

Lancez un monde de départ ou préparez votre propre jeu à partir du terminal :

```bash
npm install -g @ai-rpg-engine/cli

ai-rpg-engine run                    # pick a starter, build a character, play
ai-rpg-engine create-starter my-game # scaffold a new game you can edit and run
ai-rpg-engine run ./my-game          # run a game you scaffolded
```

La boucle `run` est une session de jeu au tour par tour réelle : les ennemis agissent en fonction de leurs propres profils d’IA, les capacités et l’XP sont disponibles dans le menu, vous pouvez enregistrer et reprendre, et un combat se termine par une victoire ou une défaite. Chaque jeu est déterministe et rejouable.

Facultativement, l’atelier de conception d’IA s’installe sous forme de sa propre commande :

```bash
npm install -g @ai-rpg-engine/ollama
ai chat                              # scaffold, critique, and balance content
                                     # against a local Ollama model (see Ch. 36)
```

L’atelier communique avec un démon [Ollama](https://ollama.com) local — exécutez `ollama serve` et `ollama pull qwen2.5-coder` en premier. Il est entièrement facultatif ; le moteur et la boucle `run` n’ont pas besoin de réseau.

Une image conteneur est publiée sur GHCR sous l’adresse `ghcr.io/mcp-tool-shop-org/ai-rpg-engine` pour l’intégration continue et les exécutions en environnement isolé.

---

## Démarrage rapide

Préférez-vous créer votre propre jeu en code ? Composez le moteur à partir de modules :

```typescript
import { Engine } from '@ai-rpg-engine/core';
import { buildCombatStack, traversalCore, statusCore, createDialogueCore } from '@ai-rpg-engine/modules';

// Define your stat mapping
const combat = buildCombatStack({
  statMapping: { attack: 'might', precision: 'agility', resolve: 'will' },
  playerId: 'hero',
  biasTags: ['undead', 'beast'],
});

// Wire the engine
const engine = new Engine({
  manifest: myManifest,
  modules: [statusCore, ...combat.modules, traversalCore, createDialogueCore(myDialogues)],
});

// Submit player actions
engine.submitAction('attack', { targetIds: ['skeleton-1'] });

// Submit AI entity actions
engine.submitActionAs('guard-captain', 'attack', { targetIds: ['player'] });
```

Consultez le [Guide de composition](docs/handbook/57-composition-guide.md) pour connaître l’ensemble du processus, ou créez un nouveau monde de départ :

```bash
npx @ai-rpg-engine/cli create-starter my-game
```

---

## Architecture

| Couche | Rôle |
|-------|------|
| **Core Runtime** | Moteur déterministe — état du monde, événements, actions, cycles, RNG, relecture |
| **Modules** | Plus de 30 systèmes composables — combat, perception, cognition, factions, déplacement, compagnons, etc. |
| **Content** | Entités, zones, dialogues, objets, capacités, statuts — créés par l’auteur |
| **AI Studio** | Couche Ollama facultative — échafaudage, critique, analyse de l’équilibre, réglages, expériences |

---

## Système de combat

Cinq actions (attaque, garde, désengagement, préparation, repositionnement), quatre états de combat (gardé, déséquilibré, exposé, en fuite), quatre états d’engagement (engagé, protégé, ligne arrière, isolé). Trois dimensions statistiques déterminent chaque formule, ce qui fait qu’un duelliste rapide joue différemment d’un combattant lourd ou d’un sentinelle calme.

Les adversaires IA utilisent une évaluation de décision unifiée : les actions de combat et les capacités sont en concurrence dans une seule évaluation, avec des seuils configurables pour éviter le spam d’actions marginales.

Les auteurs de packs utilisent `buildCombatStack()` pour configurer le combat à partir d’un mappage des statistiques, d’un profil de ressources et de balises de biais. Consultez la [Vue d’ensemble du combat](docs/handbook/49a-combat-overview.md) et le [Guide de l’auteur de packs](docs/handbook/55-combat-pack-guide.md).

---

## Capacités

Système de capacités natif du genre, avec coûts, vérifications de statistiques, délais de récupération et effets typés (dégâts, soin, application/suppression de statut). Les effets de statut utilisent un vocabulaire sémantique à 11 balises, avec des profils de résistance/vulnérabilité. La sélection consciente de l’IA évalue les chemins auto/AoE/cible unique.

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

## Packs

| Pack | Objectif |
|---------|---------|
| [`@ai-rpg-engine/core`](packages/core) | Environnement d’exécution de simulation déterministe — état du monde, événements, RNG, cycles, résolution des actions |
| [`@ai-rpg-engine/modules`](packages/modules) | Plus de 30 modules composables — combat, perception, cognition, factions, rumeurs, déplacement, compagnons, autonomie des PNJ, carte stratégique, reconnaissance d’objets, opportunités émergentes, détection d’arc narratif, déclencheurs de fin de partie |
| [`@ai-rpg-engine/content-schema`](packages/content-schema) | Schémas et validateurs canoniques pour le contenu du monde |
| [`@ai-rpg-engine/character-profile`](packages/character-profile) | Évolution du personnage, blessures, étapes importantes, réputation. |
| [`@ai-rpg-engine/character-creation`](packages/character-creation) | Sélection de l’archétype, création du personnage, équipement de départ. |
| [`@ai-rpg-engine/equipment`](packages/equipment) | Types d’équipement, origine des objets, évolution des reliques. |
| [`@ai-rpg-engine/campaign-memory`](packages/campaign-memory) | Mémoire intersessions, effets relationnels, état de la campagne |
| [`@ai-rpg-engine/rumor-system`](packages/rumor-system) | Cycle de vie des rumeurs, mécanismes de propagation et de transformation, suivi de la diffusion. |
| [`@ai-rpg-engine/presentation`](packages/presentation) | Schéma du plan narratif, contrats de prestation, profils vocaux. |
| [`@ai-rpg-engine/audio-director`](packages/audio-director) | Planification des déclencheurs, gestion des priorités, fonction d’atténuation du son, logique de temporisation. |
| [`@ai-rpg-engine/soundpack-core`](packages/soundpack-core) | Liste des fichiers audio, registre indexé par contenu. |
| [`@ai-rpg-engine/pack-registry`](packages/pack-registry) | Inscription aux activités, évaluation par grille de notation, découverte des activités |
| [`@ai-rpg-engine/asset-registry`](packages/asset-registry) | Système de stockage basé sur le contenu pour les photos de profil, les icônes et les fichiers multimédias. |
| [`@ai-rpg-engine/image-gen`](packages/image-gen) | Génération de portraits sans tête grâce à des modules d’extension interchangeables. |
| [`@ai-rpg-engine/ollama`](packages/ollama) | Fonctionnalités d’IA optionnelles pour la création de contenu : assistance à la rédaction, évaluation, processus guidés, optimisation, expérimentation. |
| [`@ai-rpg-engine/cli`](packages/cli) | Interface en ligne de commande : lancez des jeux, utilisez des modèles de démarrage, examinez les fichiers d’enregistrement. |
| [`@ai-rpg-engine/terminal-ui`](packages/terminal-ui) | Module de rendu terminal et couche d’entrée. |

### Exemples de plats d’entrée

Les 10 mondes de départ sont des **exemples de composition** : ils illustrent comment combiner les différents modules du moteur pour créer des jeux complets. Chacun d’eux présente différentes configurations (correspondances statistiques, profils de ressources, paramètres d’interaction, ensembles de compétences). Consultez le fichier README de chaque monde de départ pour connaître les « configurations présentées » et ce que vous pouvez en reprendre.

| Entrée | Genre | Principales tendances. |
|---------|-------|-------------|
| [`starter-fantasy`](packages/starter-fantasy) | Fantasy sombre | Peu de combats, l’accent mis sur les dialogues. |
| [`starter-cyberpunk`](packages/starter-cyberpunk) | Cyberpunk | Ressources, fonctions liées à la participation et à l’implication |
| [`starter-detective`](packages/starter-detective) | Mystère à la manière victorienne. | Priorité aux réseaux sociaux, importance de l’image et de la perception. |
| [`starter-pirate`](packages/starter-pirate) | Piraté / Pirate | Combats navals et au corps à corps, sur plusieurs zones. |
| [`starter-zombie`](packages/starter-zombie) | Survie face aux zombies | Pénurie, source d’infection. |
| [`starter-weird-west`](packages/starter-weird-west) | Far West étrange / Western insolite | Corriger les biais de l’emballage, rétablir la protection optimale. |
| [`starter-colony`](packages/starter-colony) | Colonie de science-fiction | Points de passage étroits, zones d’embuscade. |
| [`starter-ronin`](packages/starter-ronin) | Le Japon féodal | Passages secrets, différents rôles de protection. |
| [`starter-vampire`](packages/starter-vampire) | Film d’horreur sur les vampires | Ressources sanguines, manipulation sociale |
| [`starter-gladiator`](packages/starter-gladiator) | Gladiateur historique | Combats dans l’arène, soutien du public. |

---

## Documentation

| Ressource | Description |
|----------|-------------|
| [Create Your Own Starter](site/src/content/docs/handbook/58-create-your-own-starter.md) | Créez la structure de base d’un nouveau jeu : utilisez l’interface en ligne de commande ou un modèle manuel. |
| [Composition Guide](site/src/content/docs/handbook/57-composition-guide.md) | Créez votre propre jeu en assemblant différents modules du moteur de jeu. |
| [Plug-in Profiles](site/src/content/docs/handbook/59-plugin-profiles.md) | Résolution des règles par entité — combat avec styles de jeu mixtes, `applyProfile`, modèles de profil, la commande CLI `profile`. |
| [Combat Overview](site/src/content/docs/handbook/49a-combat-overview.md) | Six axes stratégiques, cinq mesures concrètes, une vue d’ensemble de la situation. |
| [Pack Author Guide](site/src/content/docs/handbook/55-combat-pack-guide.md) | Instructions détaillées pour créer un ensemble de combats, définition des statistiques et profils des ressources. |
| [Handbook](site/src/content/docs/handbook/index.md) | Manuel complet – il couvre tous les systèmes et comprend quatre annexes. |
| [Composition Model](docs/composition-model.md) | Les six couches réutilisables et leur composition. |
| [Examples](docs/examples/) | Exemples de code TypeScript fonctionnels (vérifiés par le système de types et testés en matière de comportement dans un environnement d’intégration continue) : gestion mixte des entités, profils partagés, interactions entre différents mondes, création à partir de zéro. |
| [Design Document](docs/DESIGN.md) | Analyse approfondie de l’architecture : processus opérationnel, réalité par rapport à la présentation. |
| [Philosophy](PHILOSOPHY.md) | Mondes déterministes, conception fondée sur des données probantes, IA en tant qu’assistant. |
| [Changelog](CHANGELOG.md) | Historique des versions. |

---

## Feuille de route

### Où nous en sommes maintenant

La durée de la simulation, la structure de composition des combats et le parcours initial de création sont terminés : 3 613 tests sur 193 fichiers, les 10 combattants initiaux sur « buildCombatStack », relecture déterministe avec octets identiques, évaluation complète des décisions de l’IA et une commande d’échafaudage en ligne de commande. **La version 2.5 introduit la résolution des règles par entité – la fonctionnalité phare des profils de modules complémentaires : un combattant « might » et un mystique « will » règlent le combat en une seule manche, chacun accédant aux statistiques via son propre système de correspondance.**

**Dernière série de versions (v2.3.3–v2.6.0) :**
- v2.3.3–v2.3.7 — Preuve de concept pour l’artefact consommateur, renforcement du Combat Stack, les 10 mondes de départ utilisent `buildCombatStack`, modèle de départ publié, commande CLI `create-starter`.
- v2.4.0 — Combat de groupe (ciblage des alliés / soin / amélioration / résurrection, AoE ami/ennemi), système d’effets de statut (modificateurs + DoT/HoT + déclencheurs réactifs), phase 1 des profils plug-in, commandes CLI `validate`/`scaffold` pour le contenu.
- **v2.5.0 — Résolution des règles par entité (combat avec styles de jeu mixtes), le chargeur `applyProfile` + capacités par entité, modèles de profil + commande CLI `profile`, et une révision complète (correction du problème de relecture avec octets identiques, renforcement de la correction, application réelle des contrôles qualité).**

### Suivant

- Mode multijoueur : deux joueurs *humains* partagent le même monde (une couche réseau, dont l’implémentation est délibérément reportée ; les profils partagés contrôlés par une seule manette sont disponibles dès aujourd’hui dans [`shared-profiles.ts`](docs/examples/shared-profiles.ts)).
- Possibilité de modifier des formules sérialisables : réglage des formules pour chaque profil (en attente d’un langage spécifique aux formules ; les profils contiennent désormais des mappages de statistiques, et non des fonctions).
- Synchronisation de la documentation de l’API : s’assurer que chaque page du manuel reflète les API de la version 2.5.

### Destination : Profils des appareils connectés

L’objectif ultime du moteur est de permettre la création de **profils définis par l’utilisateur**, c’est-à-dire des ensembles portables qui peuvent être intégrés à n’importe quel jeu. Un profil regroupe une configuration des statistiques, le comportement des ressources, les balises de biais de l’IA et les capacités dans une seule unité importable. À partir de la version 2.5, chaque entité d’un monde peut avoir son propre profil et gérer les combats individuellement : un combattant doté de la caractéristique « force » et un mystique doté de la caractéristique « volonté » peuvent faire partie du même groupe, chacun apportant son propre style de jeu.

Le schéma, le module de chargement « applyProfile », la résolution des capacités par entité et la validation inter-profil sont tous intégrés. Il ne reste plus qu’à implémenter le mode multijoueur, qui permettra à deux joueurs *humains* (et non pas seulement à deux entités) de partager un monde. Cela nécessite une couche réseau. Pour en savoir plus sur la conception, consultez les documents [Feuille de route du profil](docs/profile-roadmap.md) et [Architecture des fonctionnalités](docs/feature-architecture.md).

---

## Philosophie

Le moteur de jeu de rôle basé sur l’IA repose sur trois idées principales :

1. **Mondes déterministes** : les résultats de la simulation doivent être reproductibles.
2. **Conception basée sur des preuves** : les mécanismes du monde doivent être testés par le biais de simulations.
3. **L’IA en tant qu’assistant, et non autorité** : les outils d’IA aident à générer et à évaluer les conceptions, mais ne remplacent pas les systèmes déterministes.

Pour une explication complète, consultez le fichier [PHILOSOPHY.md](PHILOSOPHY.md).

---

## Sécurité

Le moteur principal est une **bibliothèque de simulation locale uniquement** : pas de télémétrie, pas de réseau, pas d’informations sensibles. Les fichiers sont enregistrés dans le dossier `.ai-rpg-engine/` uniquement lorsqu’on le demande explicitement. La couche d’IA **facultative** (`@ai-rpg-engine/ollama`) communique avec un démon Ollama **local** ; son option `webfetch` (pour RAG) est la seule connexion réseau sortante et est protégée par une protection contre les attaques SSRF (qui bloque le retour à la boucle, les adresses locales, CGNAT, les métadonnées du cloud et leurs équivalents IPv6) : vous n’y accédez jamais, sauf si vous l’activez. Pour plus de détails, consultez le fichier [SECURITY.md](SECURITY.md).

## Prérequis

- Node.js >= 20
- TypeScript (modules ESM)

## Licence

[MIT](LICENSE)

---

Créé par <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
