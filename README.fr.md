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

- Aucun jeu complet disponible : il propose 10 mondes de départ jouables que vous pouvez utiliser dès aujourd’hui à titre d’exemple, et le moteur est l’ensemble d’outils à partir duquel vous créez *votre propre* jeu.
- Pas un moteur graphique : il génère des événements structurés, pas des pixels.
- Pas un générateur d’histoires : il simule des mondes ; la narration émerge de la mécanique du jeu.

---

## État actuel (v2.8.0)

**Ce qui fonctionne et est testé :**
- Noyau d’exécution : état du monde, événements, actions, cycles de jeu, relecture — stable depuis la v1.0 ; relecture déterministe avec des octets identiques (compteur d’ID par instance, générateur de nombres aléatoires initialisé)
- Système de combat : 5 actions, 4 états de combat, 4 états d’engagement, interception des compagnons, déroulement en cas de défaite, tactiques de l’IA
- Capacités : coûts, délais de récupération, vérifications de statistiques, effets typés, vocabulaire de statut à 11 balises, sélection consciente de l’IA
- **Combat de groupe (v2.4) :** ciblage des alliés (soin/amélioration/résurrection), filtrage AoE ami/ennemi, sélecteurs de cibles — un soigneur peut soigner un coéquipier ; les attaques AoE ennemies épargnent les alliés
- **Effets de statut (v2.4) :** les modificateurs de statistiques passifs affectent le combat, DoT/HoT déterministes basés sur le compteur de cycles, déclencheurs réactifs à profondeur limitée (épines/réflexion)
- **Profils de plug-in — résolution des règles par entité (v2.5) :** un combattant « might » et un mystique « will » résolvent le combat en une seule fois, chacun lisant les statistiques via son propre mappage. `RuleProfile` + `WorldState.ruleProfiles` + `EntityState.ruleProfileId` ; `applyProfile()` attache un profil (mappage des statistiques, pools de ressources, capacités par entité) ; `buildProfile()`, `validateProfileSet()` (les ID en double sont rejetés), 10 modèles dérivés pour commencer, et une commande CLI « profile »
- **Boucle de jeu « run » (v2.6) :** le jeu final est réel, pas une démo — les ennemis agissent selon leurs propres profils d’intention d’IA (« agressif »/« prudent »/« territorial »/« calculateur »), un combat se termine par une victoire ou une défaite, vous pouvez enregistrer et reprendre, et les capacités et l’XP sont disponibles dans le menu d’action. `run <path>` charge un jeu que vous avez préparé. Interface utilisateur finale composée avec un HUD clair et des couleurs accessibles (prend en compte `NO_COLOR` / non-TTY)
- **L’atelier de conception d’IA est fourni sous forme de sa propre commande « ai » (v2.6) :** `npm install -g @ai-rpg-engine/ollama` → `ai chat` — prépare, critique et équilibre le contenu par rapport à un modèle Ollama local
- Couche de décision unifiée : le combat + la notation des capacités sont fusionnés en un seul appel (`selectBestAction`)
- Les 10 mondes initiaux utilisent `buildCombatStack()` — l’ossature de composition éprouvée
- API de configuration de la cognition (`cognition: CognitionCoreConfig | false`) pour ajuster l’IA par monde initial
- Taxonomie des balises et utilitaires de validation pour la création de contenu
- **Le monde réagit (v2.7) :** les éliminations accumulent de la chaleur et érodent la sécurité du district ; un cycle de jeu mondial par tour génère des pressions cachées qui se manifestent sous forme de rumeurs (« Des murmures parviennent à vos oreilles… »), s’intensifient et disparaissent avec des conséquences ; les ~30 compositions d’événements créés sont déclenchées lors de l’entrée dans la zone dans les 10 mondes initiaux — déterministe par graine, les districts plus dangereux en génèrent davantage, les éléments clés du boss sont protégés
- **Une raison de revenir (v2.7) :** une boucle de quête minimale sur le schéma déjà déployé depuis longtemps — les quêtes sont proposées lors des déclencheurs, suivent les objectifs d’élimination/d’atteinte/de progression et versent l’XP et les objets exactement une fois ; quatre quêtes créées, un écran « Journal », des moments de quête dans la narration du cycle
- **L’équipement affecte le combat (v2.7) :** `equip`/`unequip` modifie les valeurs réelles à travers la couche de statut que les formules de combat lisent déjà — aucun changement dans le code de combat ; le trident et le filet du gladiateur sont connectés de bout en bout avec un delta de chance de toucher testé
- **Exécutions basées sur une graine (v2.7) :** chaque nouvelle session affiche sa graine avec la commande de relecture exacte ; `--seed <n>` reproduit une session octet par octet ; le combat, la résistance, les capacités et les lancers tactiques utilisent tous la graine du monde — et les fins lisent l’exécution que vous avez réellement jouée (chaleur en direct, pressions, accumulations de factions, niveau du joueur)
- **`buildWorldStack()` (v2.7) :** l’ossature de composition stratégique à côté de `buildCombatStack()` — un seul appel assemble l’environnement, les factions, les rumeurs, les districts, les conséquences de la défaite, les événements et les quêtes ; plus l’écran de stratégie « Director’s Ledger », un inspecteur de simulation avec `AI_RPG_DEBUG=1`, `inspect-save` protégé par les mêmes autorités que Continuer, et une jonction de migration d’enregistrement du module sur le chemin de restauration déployé
- **Agir sur l’économie vivante (v2.8) :** `createEconomyCore` initialise une économie par district lors du chargement du pack et la fait évoluer à chaque tour ; un nouveau verbe « sell » fixe les prix des butins via `computeItemValue` (rareté / faction / provenance / contrebande) et modifie l’offre locale. Un seul fil d’écriture a permis de faire fonctionner cinq systèmes qui étaient auparavant inactifs dans la v2.7 — le résumé du marché + la notation des factions du directeur, l’arc du marchand-prince en fin de partie et le déclencheur d’effondrement, et quatre types de pression économique. **Vente uniquement ce cycle** (achat → v2.9)
- **Compagnons (v2.8) :** un verbe « recruit » crée un groupe — état, balises et faction, afin qu’un compagnon se batte *avec* vous ; le combat des compagnons s’appuie sur la mécanique d’interception du noyau de combat (inactif jusqu’à ce que `isAlly` soit défini), les compagnons réagissent avec leur moral et peuvent partir, et le recrutement active sept consommateurs en attente — l’appel des COMPAGNONS de la finale, le ciblage du groupe, les objectifs d’agence PNJ, les quêtes de faveur et la section PARTY du directeur. **Interception passive ce cycle** (tours indépendants → v2.9)
- **Le directeur examine l’ensemble du tableau (v2.8) :** une nouvelle section ÉQUIPEMENT dans le Ledger (en fonction de la dépendance cli→provenance de l’équipement), une bande-annonce finale RÉSUMÉ DU DIRECTEUR, les sections VUE D’ENSEMBLE DU MARCHÉ + GROUPE sont désormais alimentées par des producteurs en direct, et la stabilité du district + la tonalité économique dans la section DISTRICTS de la finale
- `ai-rpg-engine create-starter <name>` — prépare un nouveau jeu (autonome, s’exécute en dehors du monorepo) ; commandes « validate » + « scaffold » pour le contenu ; charge les packs à partir de JSON
- Modèle initial publié sur npm (`@ai-rpg-engine/starter-template`)
- Suite de tests complète : **4975 tests** (déterministe lors d’exécutions répétées ; les fichiers de test sont vérifiés par type dans CI ; le seuil de couverture est appliqué)

Ce qui est imparfait ou incomplet :
- L’atelier de création de mondes IA (couche Ollama) est moins testé que le moteur de simulation principal et nécessite un démon Ollama local ; il est entièrement facultatif ; le moteur et la boucle « run » n’ont pas besoin de réseau.
- La pile de narration/audio crée des commandes audio déterministes, mais il **n’y a pas de backend audio terminal** ; rien ne produit de son ; les commandes sont un point d’intégration pour un intégrateur GUI/web.
- Le multijoueur (deux joueurs humains partageant un même monde) n’est **pas** intégré ; il s’agit d’une couche réseau, délibérément hors du champ d’application ; les profils ciblent aujourd’hui un seul contrôleur.
- `replay --replay` restaure l’enregistrement au lieu de resimuler : la resimulation n’est pas fiable avec les modules d’état du monde (les cycles du monde et les événements générés évoluent en dehors du journal des actions) ; la parité est un travail pour la version 2.8.
- Les quêtes sont lancées dans les mondes de départ fantastiques et zombies, et la boucle d’équipement est connectée dans le monde du gladiateur ; la mécanique est présente dans tout le moteur ; le déploiement du contenu est délibéré.
- La documentation est complète, mais toutes les pages du manuel ne reflètent pas les dernières API.

---

## À quoi cela ressemble

L’interface utilisateur terminal fournie compose chaque tour en sections étiquetées : scène, statut, journal et actions, avec un HUD clair. La sortie est du texte brut par défaut et ajoute une couleur sémantique sur un TTY (rouge pour les dégâts, vert pour les soins, jaune pour les rejets), tout en respectant `NO_COLOR` et les canaux non-TTY ; chaque indice est également présent dans le texte, et pas seulement dans la couleur.

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

Lancez un jeu de démonstration ou créez votre propre jeu à partir du terminal :

```bash
npm install -g @ai-rpg-engine/cli

ai-rpg-engine run                    # pick a starter, build a character, play
ai-rpg-engine create-starter my-game # scaffold a new game you can edit and run
ai-rpg-engine run ./my-game          # run a game you scaffolded
```

La boucle `run` est une véritable session au tour par tour : les ennemis agissent en fonction de leurs propres profils d’IA. Les compétences et l’expérience sont disponibles dans le menu, vous pouvez sauvegarder et reprendre la partie, et un combat se termine par une victoire ou une défaite. Chaque jeu est déterministe et peut être rejoué.

Facultativement, l’atelier de conception d’IA s’installe en tant que commande distincte :

```bash
npm install -g @ai-rpg-engine/ollama
ai chat                              # scaffold, critique, and balance content
                                     # against a local Ollama model (see Ch. 36)
```

L’atelier communique avec un démon [Ollama](https://ollama.com) local. Exécutez d’abord `ollama serve` et `ollama pull qwen2.5-coder`. C’est entièrement facultatif ; le moteur et la boucle `run` n’ont besoin d’aucune connexion réseau.

Une image de conteneur est publiée sur GHCR sous le nom `ghcr.io/mcp-tool-shop-org/ai-rpg-engine` pour les exécutions CI et en environnement isolé.

---

## Démarrage rapide

Préférez-vous créer votre propre jeu en utilisant du code ? Assemblez le moteur à partir de modules :

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
| [Plug-in Profiles](site/src/content/docs/handbook/59-plugin-profiles.md) | Résolution des règles par entité — combat avec styles de jeu mixtes, `applyProfile`, modèles de profil, l’interface de ligne de commande `profile`. |
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

Les deux ossatures de composition sont complètes — 4975 tests répartis sur 273 fichiers, les 10 mondes initiaux utilisent `buildCombatStack` **et** `buildWorldStack`, relecture déterministe avec des octets identiques sous les graines affichées, notation complète des décisions de l’IA et une CLI qui prépare, exécute, valide et inspecte. **La v2.8 vous permet d’agir sur le monde vivant construit par la v2.7 : une économie commerciale avec laquelle vous interagissez via un verbe « sell », des compagnons que vous recrutez et avec lesquels vous combattez, et un Ledger du directeur qui examine l’ensemble du tableau — chaque système étant un seul fil d’écriture qui a activé des consommateurs auparavant inactifs.**

**Dernière série de versions (v2.4.0 à v2.8.0) :**
- v2.4.0 — Combats en groupe (ciblage des alliés / soin / amélioration / réanimation, zone d’effet sur les amis et les ennemis), système d’effets de statut (modificateurs + DoT/HoT + déclencheurs réactifs), phase 1 des profils plug-in, commandes CLI `validate`/`scaffold` pour le contenu
- v2.5.0 — Résolution des règles par entité (combats avec styles de jeu mixtes), chargeur `applyProfile` + capacités par entité, modèles de profil + commande CLI `profile`, et une vérification complète de la santé
- v2.6.0 — La commande `run` est devenue un véritable jeu : les ennemis agissent en fonction de leurs propres profils d’IA, victoire/défaite, sauvegarde/reprise, capacités et XP dans le menu, le fichier binaire `ai` du studio, et la pile narrative
- v2.7.0 — Le monde réagit et il y a une raison de revenir : chaleur → pressions → conséquences narratives, rencontres à l’entrée des zones, boucle de quête + journal, équipement en combat, exécutions rejouables prédéfinies, entrées d’arrière-plan en direct, `buildWorldStack`, le registre du directeur et un point de transition pour la migration des sauvegardes
- **v2.8.0 — Agissez sur le monde dans lequel vous vivez : une économie commerciale en temps réel + verbe `sell`, compagnons que vous recrutez et avec lesquels vous combattez, et un registre du directeur qui analyse l’ensemble du jeu – un fil de communication par système éclairé, environ 12 consommateurs qui ont été livrés dans une version sombre**

### Prochain (la structure v2.8)

- Achat et stocks des marchands (monnaie + inventaire du magasin) et boucles d’artisanat / récupération — l’autre moitié de l’économie commerciale
- Tours complètes des compagnons (action indépendante, pas seulement interception) et verbes sociaux — corruption / intimidation / diffusion de rumeurs via le système de levier
- Les producteurs d’opportunités et d’agents PNJ qui alimentent la section PERSONNES du registre du directeur et l’évolution du moral des compagnons ; contenu d’équipement au-delà des gladiateurs
- Parité de re-simulation avec `--replay` et modules d’état du monde, ainsi que les surfaces restantes du formateur du directeur
- Multijoueur — deux joueurs *humains* partageant un même monde (couche réseau, intentionnellement reportée ; les profils partagés contrôlés par une seule personne sont disponibles dès aujourd’hui sous la forme de [`shared-profiles.ts`](docs/examples/shared-profiles.ts))
- Substitutions de formules sérialisables — réglage des formules par profil (bloqué sur un DSL de formules ; les profils contiennent aujourd’hui des mappages de statistiques, et non des fermetures)
- Synchronisation de la documentation de l’API — s’assurer que chaque page du manuel reflète les API v2.7

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
