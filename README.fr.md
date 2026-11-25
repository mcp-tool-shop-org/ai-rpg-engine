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

# Moteur de jeu de rôle basé sur l’IA

Une boîte à outils TypeScript pour créer des simulations de jeu de rôle déterministes. Vous définissez les statistiques, choisissez des modules, configurez une pile de combat et créez du contenu. Le moteur gère l’état, les événements, le générateur de nombres aléatoires, la résolution des actions et la prise de décision par l’IA. Chaque exécution est reproductible.

Il s’agit d’un **moteur de composition**, et non d’un jeu fini. Les 12 mondes de départ sont des exemples : des modèles décomposables à partir desquels vous pouvez apprendre et créer de nouvelles choses. Votre jeu utilise le sous-ensemble du moteur dont vous avez besoin.

---

## Ce que c’est

- Une **bibliothèque de modules** : plus de 30 modules pour le moteur, couvrant le combat, la perception, la cognition, les factions, les rumeurs, le déplacement, les compagnons, etc.
- Une **boîte à outils de composition** : `buildCombatStack()` permet de configurer le combat en environ 7 lignes ; `new Engine({ modules })` lance le jeu
- Un **environnement d’exécution de simulation** : cycles déterministes, journaux d’actions rejouables, générateur de nombres aléatoires avec amorçage
- Un **studio de conception d’IA** (facultatif) : échafaudage, évaluation, analyse de l’équilibre, réglage, expériences via Ollama
- Une **couche facultative sur la chaîne de blocs** : `@ai-rpg-engine/ledger-adapter` permet de garantir la valeur d’une monnaie et d’objets échangeables d’un jeu à l’aide de jetons XRPL **testnet** réels, réglés à des points de contrôle, entièrement en dehors du noyau déterministe (facultatif ; une exécution est identique au niveau des octets sans cela)
- Un **hôte visuel facultatif** : `@ai-rpg-engine/sidecar` plus le client Godot 4 [`ai-rpg-stage`](https://github.com/mcp-tool-shop-org/ai-rpg-stage). Le moteur ne génère toujours pas d’images. La scène dessine un port dimétrique 2:1 et diffuse `felt` audio. L’occupation reste un identifiant de zone.

## Ce que ce n’est pas

- Ce n’est pas un jeu fini unique : il propose 12 mondes de départ jouables que vous pouvez `run` dès aujourd’hui à titre d’exemple, et le moteur est la boîte à outils à partir de laquelle vous composez *votre propre* jeu.
- Ce n’est pas un moteur visuel : il génère des événements structurés, et non des images. Le rendu est l’affaire d’un hôte (terminal ou Godot).
- Ce n’est pas un générateur d’histoires : il simule des mondes ; la narration émerge des mécanismes.

---

## État actuel (v3.12.2)

**Ce qui fonctionne et est testé :**
- Le cœur de simulation : ticks déterministes, RNG à graine, rejeu identique octet pour octet, et sauvegarde et reprise
- Le combat en groupe : ciblage des alliés, effets de statut, attaques de zone qui épargnent les alliés, et ennemis qui agissent selon leurs propres profils d'intention d'IA
- Un monde qui réagit : factions, rumeurs, économie marchande, compagnons, PNJ nommés avec leurs propres objectifs, et conséquences de vos actes
- Les 12 mondes de départ, jouables dès aujourd'hui avec `run`
- Les packs World Forge, chargés comme contenu
- L'hôte Godot 4 [`ai-rpg-stage`](https://github.com/mcp-tool-shop-org/ai-rpg-stage), via le sidecar, avec les signaux audio `felt`
- La couche optionnelle de registre sur le testnet XRPL

**Ce qui est encore brut ou incomplet :**
- Le studio de conception IA (Ollama) est optionnel et moins testé que le cœur de simulation
- Il n'y a pas de backend audio dans le terminal : seule la scène Godot joue du son
- Le multijoueur (deux joueurs humains dans un même monde) n'est pas construit
- `replay --replay` restaure la sauvegarde au lieu de re-simuler, par choix de conception
- Certaines pages du manuel sont en retard sur les API les plus récentes

L'historique complet des versions se trouve dans [CHANGELOG.md](CHANGELOG.md).

---

## À quoi cela ressemble

L’interface utilisateur terminal intégrée compose chaque tour en sections étiquetées — scène, état, journal et actions — avec un HUD facile à consulter. Par défaut, la sortie est du texte brut et ajoute une couleur sémantique sur un TTY (rouge pour les dégâts, vert pour les soins, jaune pour les rejets), en respectant `NO_COLOR` et les canaux non-TTY ; chaque signal est également inclus dans le texte, et non uniquement la couleur.

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

Lancez une partie de démonstration ou créez votre propre jeu à partir du terminal :

```bash
npm install -g @ai-rpg-engine/cli

ai-rpg-engine run                    # pick a starter, build a character, play
ai-rpg-engine create-starter my-game # scaffold a new game you can edit and run
ai-rpg-engine run ./my-game          # run a game you scaffolded
```

La boucle `run` est une véritable session au tour par tour : les ennemis agissent en fonction de leurs propres profils d’IA, les capacités et l’expérience sont disponibles dans le menu, vous pouvez sauvegarder et reprendre, et un combat se termine par une victoire ou une défaite. Chaque partie est déterministe et rejouable.

Facultativement, l’atelier de conception d’IA s’installe en tant que commande distincte :

```bash
npm install -g @ai-rpg-engine/ollama
ai chat                              # scaffold, critique, and balance content
                                     # against a local Ollama model (see Ch. 36)
```

L’atelier communique avec un démon [Ollama](https://ollama.com) local — exécutez `ollama serve` et `ollama pull qwen2.5-coder` en premier. C’est entièrement facultatif ; le moteur et la boucle `run` n’ont besoin d’aucun réseau.

Une image de conteneur est publiée sur GHCR en tant que `ghcr.io/mcp-tool-shop-org/ai-rpg-engine` pour les exécutions CI et en environnement isolé.

---

## Démarrage rapide

Préférez-vous créer votre propre jeu en utilisant du code ? Composez le moteur à partir de modules :

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

Consultez le [Guide de composition](site/src/content/docs/handbook/57-composition-guide.md) pour connaître le flux de travail complet, ou créez une nouvelle partie de démonstration :

```bash
npx @ai-rpg-engine/cli create-starter my-game
```

---

## Architecture

| Couche | Rôle |
|-------|------|
| **Core Runtime** | Moteur déterministe — état du monde, événements, actions, cycles, RNG, relecture |
| **Modules** | Plus de 30 systèmes composables — combat, perception, cognition, factions, déplacement, compagnons, etc. |
| **Content** | Entités, zones, dialogues, objets, capacités, états — créés par l’auteur |
| **AI Studio** | Couche Ollama facultative — création de prototypes, critique, analyse de l’équilibre, réglage, expériences |

---

## L’adaptateur du registre XRPL (facultatif)

`@ai-rpg-engine/ledger-adapter` est un package **facultatif** qui lie la **couche échangeable et détenue par le joueur** d’un jeu — le solde `coin` et l’inventaire consommable que les verbes `buy`/`sell` de `trade-core` gèrent déjà — au **testnet XRPL**, de sorte que ces actifs peuvent être adossés à de véritables jetons du registre et réglés aux points de contrôle. Un adaptateur absent est exactement le moteur hors ligne qui est livré aujourd’hui.

**L’invariant du déterminisme (le but principal).** L’adaptateur est un *canal secondaire*, qui ne fait jamais partie de la simulation :

- Il n’est **jamais invoqué à l’intérieur du cycle déterministe** — uniquement aux **points de contrôle** (sauvegarde, entrée dans une ville/un marché, fin de chapitre).
- Rien dans `@ai-rpg-engine/core` ou `@ai-rpg-engine/modules` ne l’importe (sa seule dépendance au moteur est une `import type` au moment de la compilation).
- **Une exécution est identique, avec ou sans lui.** Un test de pare-feu exécute la boucle marchande réelle `starter-pirate` `createGame()` sur deux moteurs — l’un avec l’adaptateur activé et réglant aux points de contrôle — et affirme que les deux mondes sont profondément égaux. La relecture avec la graine 0 n’est pas affectée.

**Niveaux d’intégration — un jeu l’intègre aussi profondément que son design le souhaite.** Le pare-feu est une *frontière de déterminisme*, et non une règle anti-intégration ; l’invariant ci-dessus est valable à tous les niveaux :

| Niveau | Ce qui dépend de l’adaptateur | Convient |
|-------|-----------------------------|------|
| **L0 — External observer** | Rien à l’intérieur du jeu ; l’adaptateur se connecte de l’extérieur aux points de contrôle et le jeu n’en a pas conscience. | Intégration à un jeu existant (la démo du pirate expédiée). |
| **L1 — Points de contrôle pilotés par le jeu** | Le flux de sauvegarde/ville/progression méta propre au jeu appelle l’adaptateur à des moments définis. | Un jeu qui souhaite des moments délibérés sur le registre. |
| **L2 — Ledger-native design** | L’économie ou l’identité du jeu est conçue *autour* de la propriété sur la chaîne (émetteur persistant, marchés réels). | Un jeu de commerce axé sur le registre. |

La distinction qui garantit la sécurité de la relecture n’est **pas** « quel package importe l’adaptateur », mais « l’appel se fait-il à l’intérieur du cycle ». Un package de jeu peut importer et piloter l’adaptateur librement, à condition que chaque appel se produise à un point de contrôle en dehors de la boucle de relecture pilotée par la graine.

**Trois modes de jeu.** `offline` (par défaut — pas de chaîne, le moteur tel qu’il est livré) · `ledger` (pièces/objets adossés aux soldes du testnet, réglés aux points de contrôle) · `diary` (jouer hors ligne, puis ancrer le hachage de l’état de l’exécution sur le registre pour un reçu inviolable).

**Ce qui figure dans le grand livre.** `coin` → une promesse de paiement en devise émise sur une ligne de confiance ;
articles consommables → jetons fongibles ; le delta net des transactions d’un point de contrôle → un transfert validé via un **dépositaire de jetons XLS-85**. Les équipements uniques sont fournis sous forme de **NFT XLS-20** (v3.3), et l’évolution des reliques fait progresser les métadonnées d’un NFT modifiable en place via **XLS-46 `NFTokenModify`** — ce qui est basé sur un jeu réel à partir de v3.4. L’économie du district abstrait (`economy-core`) n’est *pas* affectée ; elle reste une simulation pure.

**Mesures de sécurité.** Uniquement pour le testnet, avec une protection structurelle **impossible en code sur le mainnet** (et non un simple indicateur de configuration) ; les clés de portefeuille sont stockées dans un fichier secondaire de secrets ignoré par Git, et non dans le fichier d’enregistrement ; la validation est idempotente et sécurisée en termes de conservation lors de la tentative de relance ; les preuves vérifient le **vrai mémo sur la chaîne** (et non la chaîne de caractères propre au moteur) ; et si la chaîne est inaccessible, l’exécution se poursuit simplement, en étant marquée comme *non ancrée*.

**Résultats concrets.** Une véritable simulation d’un marchand `starter-pirate` : vente d’un coutelas, achat d’un obus ; les transactions sont validées sur le testnet XRPL via un dépositaire de jetons, puis `reconcile()` confirme les soldes et les mémos dans le grand livre par rapport à l’économie du moteur (la conservation est assurée pour chaque jeton). Le grand livre est un système différent du moteur, de sorte que le moteur ne peut pas le falsifier ; la réconciliation est une vérification externe authentique. Uniquement pour le testnet ; les actifs sont des reçus spécifiques au jeu, et non des titres financiers.

---

## Système de combat

Cinq actions (attaque, garde, désengagement, préparation, repositionnement), quatre états de combat (protégé, déséquilibré, exposé, en fuite), quatre états d’engagement (engagé, protégé, en ligne arrière, isolé). Trois dimensions statistiques déterminent chaque formule, de sorte qu’un duelliste rapide joue différemment d’un combattant lourd ou d’un sentinelle calme.

Les adversaires IA utilisent un système de notation unifié pour la prise de décision : les actions et les capacités de combat sont comparées dans une seule évaluation, avec des seuils configurables pour éviter l’utilisation excessive de capacités marginales.

Les créateurs de packs utilisent `buildCombatStack()` pour définir le combat à partir d’une cartographie des statistiques, d’un profil de ressources et d’étiquettes de biais. Voir la section [Aperçu du combat](site/src/content/docs/handbook/49a-combat-overview.md) et le [Guide du créateur de packs](site/src/content/docs/handbook/55-combat-pack-guide.md).

---

## Capacités

Système de capacités natif du genre, avec des coûts, des vérifications de statistiques, des temps de recharge et des effets typés (dégâts, soins, application d’état, suppression). Les effets d’état utilisent un vocabulaire sémantique de 11 étiquettes, avec des profils de résistance/vulnérabilité. Les scores de sélection tenant compte de l’IA évaluent les chemins auto/AoE/cible unique.

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
| [`@ai-rpg-engine/core`](packages/core) | Environnement de simulation déterministe : état du monde, événements, générateur de nombres aléatoires, cycles, résolution des actions |
| [`@ai-rpg-engine/modules`](packages/modules) | Plus de 30 modules composables : combat, perception, cognition, factions, rumeurs, déplacement, compagnons, autonomie des PNJ, carte stratégique, reconnaissance des objets, opportunités émergentes, détection d’arcs narratifs, déclencheurs de fin de partie |
| [`@ai-rpg-engine/content-schema`](packages/content-schema) | Schémas et validateurs canoniques pour le contenu du monde |
| [`@ai-rpg-engine/character-profile`](packages/character-profile) | Progression du personnage, blessures, étapes importantes, réputation |
| [`@ai-rpg-engine/character-creation`](packages/character-creation) | Sélection d’archétypes, génération de builds, équipement de départ |
| [`@ai-rpg-engine/equipment`](packages/equipment) | Types d’équipement, provenance des objets et évolution des reliques, y compris `item-chronicle-core`, le module optionnel qui enregistre l’historique de l’équipement à partir d’un jeu réel, de sorte que les objets obtiennent des épithètes et des niveaux |
| [`@ai-rpg-engine/campaign-memory`](packages/campaign-memory) | Mémoire intersessions, effets relationnels, état de la campagne |
| [`@ai-rpg-engine/rumor-system`](packages/rumor-system) | Cycle de vie des rumeurs, mécanismes de mutation, suivi de la propagation |
| [`@ai-rpg-engine/presentation`](packages/presentation) | Schéma du plan narratif, contrats de rendu, profils vocaux |
| [`@ai-rpg-engine/audio-director`](packages/audio-director) | Planification des signaux, priorité, atténuation, logique de temps de recharge |
| [`@ai-rpg-engine/soundpack-core`](packages/soundpack-core) | Manifestes des packs de sons, registre adressable par contenu |
| [`@ai-rpg-engine/pack-registry`](packages/pack-registry) | Enregistrement des packs, notation rubriques, découverte des packs |
| [`@ai-rpg-engine/asset-registry`](packages/asset-registry) | Stockage adressé par contenu pour les portraits, les icônes, les médias |
| [`@ai-rpg-engine/image-gen`](packages/image-gen) | Génération de portraits sans interface, avec des fournisseurs modulables |
| [`@ai-rpg-engine/ollama`](packages/ollama) | Création d’IA optionnelle : échafaudage, critique, flux de travail guidés, réglage, expériences |
| [`@ai-rpg-engine/cli`](packages/cli) | CLI : exécution de jeux, création d’ébauches, inspection des enregistrements |
| [`@ai-rpg-engine/terminal-ui`](packages/terminal-ui) | Moteur de rendu terminal et couche d’entrée |
| [`@ai-rpg-engine/starter-merchant`](packages/starter-merchant) | Départ commercial : le pack de référence pour l’adaptateur du grand livre, qui n’en dépend pas |
| [`@ai-rpg-engine/starter-bounty-hunter`](packages/starter-bounty-hunter) | Départ voleur : la poursuite est au cœur du jeu, et quelle moitié de la ville vous ouvrira une porte |
| [`@ai-rpg-engine/ledger-adapter`](packages/ledger-adapter) | **Optionnel** : validation optionnelle sur le testnet XRPL pour la couche échangeable appartenant au joueur (pièce/inventaire/échange), via un dépositaire de jetons XLS-85 aux points de contrôle, entièrement en dehors du noyau déterministe |

### Exemples de départ

Les 12 mondes de départ sont des **exemples de composition** : ils montrent comment combiner les modules du moteur pour créer des jeux complets. Chacun d’eux présente des modèles différents (cartographies des statistiques, profils de ressources, configurations d’engagement, ensembles de capacités). Voir la section README de chaque monde de départ pour connaître les « Modèles présentés » et « Ce qu’il faut emprunter ».

| Monde de départ | Genre | Principaux modèles |
|---------|-------|-------------|
| [`starter-fantasy`](packages/starter-fantasy) | Fantasy sombre | Combat minimal, axé sur le dialogue |
| [`starter-cyberpunk`](packages/starter-cyberpunk) | Cyberpunk | Ressources, rôles d’engagement |
| [`starter-detective`](packages/starter-detective) | Mystère victorien | Axé sur l’aspect social, lourd sur la perception |
| [`starter-pirate`](packages/starter-pirate) | Pirate | Naval + mêlée, multi-zones |
| [`starter-zombie`](packages/starter-zombie) | Survie aux zombies | Pénurie, ressource d’infection |
| [`starter-weird-west`](packages/starter-weird-west) | Western étrange | Biais des packs, récupération dans une zone sûre |
| [`starter-colony`](packages/starter-colony) | Colonie de science-fiction | Points d’étranglement, zones d’embuscade |
| [`starter-ronin`](packages/starter-ronin) | Japon féodal | Passages cachés, plusieurs rôles de protecteur |
| [`starter-merchant`](packages/starter-merchant) | Commercial | L’obligation est au cœur du jeu, le combat est considéré comme une pénalité |
| [`starter-bounty-hunter`](packages/starter-bounty-hunter) | Poursuite | Chasse aux gens pour gagner de l’argent ; la violence est bruyante, mais pas interdite |
| [`starter-vampire`](packages/starter-vampire) | Horreur vampirique | Ressource sanguine, manipulation sociale |
| [`starter-gladiator`](packages/starter-gladiator) | Gladiateur historique | Combat d’arène, faveur de la foule |

---

## Documentation

| Ressource | Description |
|----------|-------------|
| [Create Your Own Starter](site/src/content/docs/handbook/58-create-your-own-starter.md) | Création d’un nouveau jeu : via la CLI ou en utilisant un modèle manuel |
| [Composition Guide](site/src/content/docs/handbook/57-composition-guide.md) | Créez votre propre jeu en assemblant des modules de moteur. |
| [Plug-in Profiles](site/src/content/docs/handbook/59-plugin-profiles.md) | Résolution des règles par entité — combat avec styles de jeu mixtes, `applyProfile`, modèles de profil, l’interface en ligne de commande `profile`. |
| [XRPL Ledger Adapter](site/src/content/docs/handbook/60-xrpl-ledger-adapter.md) | Règlement sur le registre, sur demande — pare-feu de déterminisme, niveaux d’intégration L0/L1/L2, modes de jeu, mesures de sécurité et démonstration de pirate testée en direct. |
| [Combat Overview](site/src/content/docs/handbook/49a-combat-overview.md) | Six piliers de combat, cinq actions, états en un coup d’œil. |
| [Pack Author Guide](site/src/content/docs/handbook/55-combat-pack-guide.md) | buildCombatStack étape par étape, cartographie des statistiques, profils de ressources. |
| [Visual Clients](site/src/content/docs/handbook/66-visual-clients.md) | Hôtes secondaires, charge utile, port dimétrique Godot — la présentation peut être trompeuse, l’occupation reste un ID de zone. |
| [Handbook](site/src/content/docs/handbook/index.md) | Manuel complet — tous les systèmes, plus 4 annexes. |
| [Composition Model](docs/composition-model.md) | Les 6 couches réutilisables et leur composition. |
| [Examples](docs/examples/) | Exemples TypeScript exécutables (vérifiés par type et testés en termes de comportement dans CI) — groupe mixte par entité, profils partagés, inter-mondes, à partir de zéro. |
| [Design Document](docs/DESIGN.md) | Analyse approfondie de l’architecture — pipeline d’action, vérité par rapport à la présentation. |
| [Philosophy](PHILOSOPHY.md) | Mondes déterministes, conception basée sur des preuves, IA en tant qu’assistant. |
| [Changelog](CHANGELOG.md) | Historique des versions. |

---

## Feuille de route

### Où nous en sommes aujourd’hui

Les deux axes de composition sont terminés — **8368 tests sur 388 fichiers**, tous les 12 éléments de départ sur `buildCombatStack` **et** `buildWorldStack`, relecture déterministe et identique au niveau des octets sous des graines imprimées, évaluation complète des décisions de l’IA et une interface en ligne de commande qui crée, exécute, valide et inspecte. L’arc v3.x a rendu le monde actif (PNJ nommés, la surface sociale à 25 verbes, économies de genre — v3.0–v3.1), a placé les actifs appartenant aux joueurs sur le testnet XRPL en tant que canal secondaire sur demande (v3.2–v3.4), a créé deux éléments de départ axés sur le système et les a transformés en instruments d’amélioration du moteur (v3.5–v3.6), a éclairé et renforcé la couche stratégique jusqu’à ce que les conséquences laissent des marques réelles (v3.7–v3.8), a donné aux hôtes la surface du moteur dont Godot a besoin pour s’y attacher (v3.8.1), a fermé la boucle d’auteur afin qu’une session de studio ou un simple pack JSON produise un monde jouable de bout en bout (v3.9), a placé toute la couche stratégique sur les sens du joueur (v3.10), a affiné la profondeur que ces sens atteignent maintenant (v3.11) et **a donné à un hôte de dessin le sentiment d’un tic — le premier client pixel, un port dimétrique Godot 4, s’exécute sur ce contrat (v3.12)**.

L'historique complet des versions se trouve dans [CHANGELOG.md](CHANGELOG.md).

### Suivant

v3.12 a clos le contrat et le premier hôte de dessin. Ce qui reste est un travail de cycle ultérieur, et non des restes de celui-ci :

- Un lit ambiant de famille prospère (le pont tonal et le déploiement par zone ; CORE n’a toujours pas de tige prospère).
- Multijoueur — deux joueurs *humains* partageant un monde (une couche de mise en réseau, délibérément différée ; les profils partagés à un seul contrôleur sont disponibles aujourd’hui sous la forme de [`shared-profiles.ts`](docs/examples/shared-profiles.ts)).
- Substitutions de formules sérialisables — réglage de la formule par profil (bloqué sur un DSL de formule ; les profils contiennent aujourd’hui des cartographies de statistiques, et non des fermetures).

### Destination : profils plug-in

L’objectif final du moteur est les **profils définis par l’utilisateur** — des ensembles portables qui s’insèrent dans n’importe quel jeu. Un profil regroupe une cartographie de statistiques, un comportement de ressources, des balises de biais d’IA et des capacités dans une seule unité importable. À partir de v2.5, les entités d’un monde peuvent chacune avoir leur propre profil et résoudre le combat par entité — un combattant `might` et un mystique `will` partagent un groupe, chacun apportant son propre style de jeu.

Le schéma, le chargeur `applyProfile`, la résolution des capacités par entité et la validation inter-profils sont tous disponibles. Ce qui reste est le multijoueur — en permettant à deux joueurs *humains* (et non seulement à deux entités) de partager un monde — ce qui est une couche de mise en réseau. Voir [Feuille de route du profil](docs/profile-roadmap.md) et [feature-architecture.md](docs/feature-architecture.md) pour la conception.

---

## Philosophie

L’AI RPG Engine est construit autour de trois idées :

1. **Mondes déterministes** — les résultats de la simulation doivent être reproductibles.
2. **Conception basée sur des preuves** — les mécanismes du monde doivent être testés par le biais de simulations.
3. **IA en tant qu’assistant, et non autorité** — les outils d’IA aident à générer et à critiquer les conceptions, mais ne remplacent pas les systèmes déterministes.

Consultez le fichier [PHILOSOPHY.md](PHILOSOPHY.md) pour une explication complète.

---

## Sécurité

Le moteur principal est une **bibliothèque de simulation locale uniquement** : pas de télémétrie, pas de réseau, pas de données sensibles. Les fichiers de sauvegarde sont enregistrés uniquement dans `.ai-rpg-engine/` lorsqu’une demande explicite est faite. Deux **couches optionnelles** ajoutent une voie de communication sortante, et ce uniquement lorsque vous les activez :

- La couche d’IA (`@ai-rpg-engine/ollama`) communique avec un démon Ollama **local** ; son option d’activation `webfetch` (pour RAG) est limitée par une protection contre les attaques SSRF (qui bloque les adresses de loopback/link-local/CGNAT/cloud-metadata et les équivalents IPv6-tunnelled).
- La couche de registre (`@ai-rpg-engine/ledger-adapter`) accède au **testnet XRPL** — et uniquement au testnet : une protection structurelle **impossible en code sur le mainnet** (et non un simple indicateur de configuration) rejette tout hôte autre que le testnet lors de sa création. Les clés de portefeuille sont stockées dans un fichier secondaire ignoré par Git, jamais dans un fichier de sauvegarde, et le noyau déterministe n’importe jamais l’adaptateur.

Consultez le fichier [SECURITY.md](SECURITY.md) pour plus de détails.

## Prérequis

- Node.js >= 20
- TypeScript (modules ESM)

## Licence

[MIT](LICENSE)

---

Développé par <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
