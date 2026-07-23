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
- Un **ensemble d’outils de composition** — `buildCombatStack()` permet de configurer les combats en environ 7 lignes ; `new Engine({ modules })` lance le jeu
- Un **environnement d’exécution pour la simulation** — cycles déterministes, journaux d’actions rejouables, générateur de nombres aléatoires avec amorçage
- Un **studio de conception d’IA** (facultatif) — structure de base, évaluation, analyse de l’équilibre, réglages, expériences via Ollama
- Une **couche facultative sur la chaîne de blocs** — `@ai-rpg-engine/ledger-adapter` prend en charge les pièces et les objets échangeables d’un jeu avec de véritables jetons XRPL du **réseau de test**, qui sont validés à des points de contrôle, entièrement en dehors du noyau déterministe (facultatif ; une exécution est identique au niveau octet sans cette couche)

## Ce que ce n’est pas

- Aucun jeu complet disponible : il propose 10 mondes de départ jouables que vous pouvez utiliser dès aujourd’hui à titre d’exemple, et le moteur est l’ensemble d’outils à partir duquel vous créez *votre propre* jeu.
- Pas un moteur graphique : il génère des événements structurés, pas des pixels.
- Pas un générateur d’histoires : il simule des mondes ; la narration émerge de la mécanique du jeu.

---

## État actuel (version 3.3.0)

**Ce qui fonctionne et a été testé :**

- Noyau d'exécution : état du monde, événements, actions, cycles, relecture — stable depuis la version 1.0 ; relecture déterministe avec des octets identiques (compteur d'ID par instance, générateur de nombres aléatoires initialisé).
- Système de combat : 5 actions, 4 états de combat, 4 états d'engagement, interception du compagnon, déroulement en cas de défaite, tactiques de l'IA.
- Capacités : coûts, délais de récupération, vérifications des statistiques, effets typés, vocabulaire de statut à 11 balises, sélection consciente de l'IA.
- **Combat de groupe (v2.4) :** ciblage des alliés (soin / amélioration / réanimation), filtrage AoE ami/ennemi, sélecteurs de cible — un soigneur peut soigner un coéquipier ; les attaques AoE ennemies épargnent les alliés.
- **Effets de statut (v2.4) :** les modificateurs de statistiques passifs affectent le combat, DoT/HoT déterministes basés sur le compteur de cycles, déclencheurs réactifs à profondeur limitée (épines / réflexion).
- **Profils de modules complémentaires — résolution des règles par entité (v2.5) :** un combattant « puissant » et un mystique « volontaire » résolvent le combat en une seule fois, chacun lisant les statistiques via son propre mappage. `RuleProfile` + `WorldState.ruleProfiles` + `EntityState.ruleProfileId`; `applyProfile()` attache un profil (mappage des statistiques, pools de ressources, capacités par entité) ; `buildProfile()`, `validateProfileSet()` (les ID en double sont rejetés), 10 modèles dérivés pour commencer, et une commande CLI « profile ».
- **Boucle de jeu jouable (« run ») (v2.6) :** le jeu final est réel, pas une démo — les ennemis agissent selon leurs propres profils d'intention d'IA (« agressif » / « prudent » / « territorial » / « calculateur »), un combat se termine par une victoire ou une défaite, vous pouvez sauvegarder et reprendre, et les capacités et l’XP sont disponibles dans le menu des actions. `run <chemin>` charge un jeu que vous avez préparé. Interface utilisateur terminale composée avec un HUD clair et accessible (respecte `NO_COLOR` / non-TTY).
- **Studio de conception d'IA intégré en tant que commande « ai » distincte (v2.6) :** `npm install -g @ai-rpg-engine/ollama` → `ai chat` — prépare, critique et équilibre le contenu par rapport à un modèle Ollama local.
- Couche de décision unifiée : combat + évaluation des capacités fusionnés en un seul appel (`selectBestAction`).
- Les 10 mondes initiaux utilisent `buildCombatStack()` — la base de composition éprouvée.
- API de configuration de la cognition (`cognition: CognitionCoreConfig | false`) pour l'ajustement de l'IA par monde initial.
- Taxonomie des balises et utilitaires de validation pour la création de contenu.
- **Le monde réagit (v2.7) :** les éliminations accumulent de la chaleur et érodent la sécurité du district ; un cycle mondial par tour génère des pressions cachées qui se manifestent sous forme de rumeurs (« Des murmures parviennent à vos oreilles… »), s'intensifient et expirent avec des conséquences ; les ~30 compositions d'événements créés se déclenchent lors de l'entrée dans une zone dans les 10 mondes initiaux — déterministe par graine, les districts plus dangereux en génèrent davantage, les éléments clés du boss sont protégés.
- **Une raison de revenir (v2.7) :** une boucle de quête minimale sur le schéma déjà déployé depuis longtemps — les quêtes offrent des déclencheurs, suivent les objectifs d'élimination/d’atteinte/de progression et versent l’XP et les objets exactement une fois ; quatre quêtes créées, un écran « Journal », éléments de quête dans la narration du tour.
- **L'équipement affecte le combat (v2.7) :** `equip`/`unequip` modifie des valeurs réelles à travers la couche de statut que les formules de combat lisent déjà — aucun changement dans le code de combat ; le trident et le filet du gladiateur sont connectés de bout en bout avec un delta de chance de toucher testé.
- **Exécutions basées sur une graine (v2.7) :** chaque nouvelle session affiche sa graine avec la commande de relecture exacte ; `--seed <n>` reproduit une session octet par octet ; le combat, la résistance, les capacités et les lancers tactiques utilisent tous la graine du monde — et les fins lisent l'exécution que vous avez réellement jouée (chaleur en direct, pressions, accumulations de factions, niveau du joueur).
- **`buildWorldStack()` (v2.7) :** la base de composition stratégique à côté de `buildCombatStack()` — un seul appel assemble l'environnement, les factions, les rumeurs, les districts, les conséquences de la défaite, les événements et les quêtes ; plus l'écran « Ledger du directeur », un inspecteur de simulation avec `AI_RPG_DEBUG=1`, `inspect-save` protégé par les mêmes autorités que Continuer, et une jonction de migration des modules sur le chemin de restauration déployé.
- **Agir sur l'économie vivante (v2.8) :** `createEconomyCore` initialise une économie par district lors du chargement du pack et la fait évoluer à chaque tour ; un nouveau verbe « sell » fixe les prix des butins via `computeItemValue` (rareté / faction / provenance / contrebande) et modifie l'offre locale. Un seul fil de code a permis d'activer cinq systèmes qui étaient inactifs dans la version 2.7 — le résumé du marché + le score des factions du directeur, l'arc du marchand-prince en fin de partie et son déclencheur d'effondrement, et quatre types de pression économique. **Vente uniquement ce cycle** (achat → v2.9).
- **Compagnons (v2.8) :** un verbe « recruit » crée une équipe — état, balises et faction, afin qu'un compagnon se batte *avec* vous ; le combat des compagnons s'appuie sur la mécanique d'interception du noyau de combat (inactif jusqu'à ce que `isAlly` soit défini), les compagnons réagissent avec leur moral et peuvent partir, et le recrutement active sept consommateurs en attente — l'appel des COMPAGNONS à la fin, le ciblage de groupe, les objectifs d'agence PNJ, les quêtes de faveur et la section PARTY du directeur. **Interception passive ce cycle** (tours indépendants → v2.9).
- **Le directeur voit tout le tableau (v2.8) :** une nouvelle section EQUIPMENT dans le Ledger (derrière la dépendance cli→provenance de l'équipement), une bande-annonce finale du RÉSUMÉ DU DIRECTEUR, les sections MARCHÉ et PARTY sont désormais alimentées par des producteurs en direct, et la stabilité du district + la tonalité économique dans la section DISTRICTS à la fin.
- **L'autre moitié de l'économie (v2.9) :** un verbe « buy » complète la boucle — le stock du marchand est proposé par district au niveau de granularité de la catégorie d'approvisionnement (le niveau d'approvisionnement *est* le signal de réapprovisionnement), avec des prix fixés via le même pipeline `computeItemValue` que « sell », ainsi qu'une marge d'achat/vente afin qu'il n'y ait pas de transaction sans risque. Et l'artisanat prend vie : `createCraftingCore` enregistre les actions `salvage`/`craft`/`repair`/`modify` sur les tables de recettes créées, ce qui active les sections MATÉRIAUX + RECETTES du directeur qui étaient inactives.
- **Les compagnons effectuent leurs propres tours (v2.9) :** le seuil d'interception passive de la version 2.8 devient le plafond — les compagnons recrutés agissent indépendamment à chaque tour via l'assistant `selectBestAction` précédemment inutilisé, avec un biais de combat par rôle afin qu'un combattant et un érudit se battent différemment, l'interception compagnon-compagnon et la santé du groupe sur la ligne PARTY du directeur. Les packs sans compagnons restent identiques (la porte de la fête vide préserve le reliquat de relecture à partir de la graine 0).
- **La couche sociale, connectée de bout en bout (v2.9) :** quatre verbes d'influence — `bribe`, `intimidate`, `petition`, `seed` (rumeur) — écrivent des valeurs globales réelles de réputation / alerte / chaleur qui affectent les prix et les portes de faction déjà lus, et `seed` active tout le module rumeur-joueur + la section RUMEURS SUR VOUS du directeur. L'« économie » d'influence qui les finance est également connectée : l'exécution d'une opportunité accorde désormais l'influence qu'elle a toujours décrite, de sorte que les verbes sont réellement disponibles pendant le jeu.
- **Opportunités, cycle de vie complet (v2.9) :** un générateur par tour propose des contrats/primes/faveurs évalués en fonction de l'état du monde actuel ; vous `acceptez`, puis `complétez` ou `abandonnez`; ignorer une opportunité jusqu'à sa date limite a désormais des conséquences (conséquences de l'expiration), et la réalisation d'une faveur de compagnon modifie le moral de ce compagnon. Les arcs de pouvoir croissant et de marchand-prince en fin de partie lisent les opportunités que vous avez réellement résolues.
- **Parité du contenu dans les dix mondes initiaux (v2.9) :** câblage de l'équipement, quêtes, compagnons recrutables et solde de départ déployés vers chaque monde qui en manquait — les dix mondes partagent désormais une surface de fonctionnalités uniforme et entièrement éclairée (l'équipement était réservé aux gladiateurs ; les quêtes étaient uniquement fantastiques/zombies ; cinq mondes ont été lancés avec `recruit` sans personne à recruter). De plus, un validateur de contenu structurel qui détecte une erreur typographique dans l'ID d'un élément sur toutes les surfaces de référence, et des emplacements de sauvegarde multi-points de contrôle avec `--checkpoint`/`--list-checkpoints`.
- **PNJ vivants, réellement vivants (v3.0) :** le producteur d'agence PNJ persistant active la section **PERSONNES** du directeur — les PNJ nommés (un personnage d'histoire créé par monde initial, plus chaque compagnon que vous recrutez) ont des objectifs, des relations de confiance/peur/avidité/loyauté, un registre des obligations et des chaînes de conséquences. `runNpcAgencyTick` s'exécute à chaque tour, protégé de sorte qu'un monde sans PNJ nommés reste identique au reliquat. L'activation du producteur a également activé les points d'arrêt de départ de la faveur du compagnon et deux règles de génération d'opportunités dormantes (objectif PNJ + obligation), ainsi que les profils/obligations des PNJ en fin de partie — le câblage a été testé avec succès mais était inerte dans le contenu déployé jusqu'à ce qu'un audit de la phase 9 l'ait détecté, de sorte que la correction déploie un PNJ nommé créé dans chaque monde initial.
- **La surface sociale complète (v3.0) :** les quatre verbes d'influence deviennent vingt-cinq — les groupes de diplomatie et de sabotage s'enregistrent (21 autres sous-verbes), ce qui active les réactions `leverage-diplomacy` / `leverage-sabotage` précédemment inactives ; dix-neuf apparaissent sur le menu numéroté (abordable + délai de récupération + réputation limitée). Les conditions et les effets du dialogue lisent et écrivent désormais l'état social (influence / réputation / relation PNJ). Et un revenu d'influence passif (`tickLeverage` / `computeLeverageGains`) déverse de l'influence à partir de la réputation et accorde une faveur / un chantage / une légitimité à partir de l'XP et des jalons — de sorte que la couche sociale rapporte *entre* les opportunités, et pas seulement lors de leur achèvement.
- **Économie au goût du genre (v3.0) :** le stock du marchand et les recettes d'artisanat résolvent désormais les tables de genre par monde initial (sept des dix mondes initiaux contiennent du contenu de genre créé ; trois reviennent à un contenu universel), dans les mécanismes d'achat/d'artisanat, l'affichage du menu numéroté et la section RECETTES du directeur, le tout lié à la même clé de règle afin que l'affichage et les mécanismes soient en accord. `repair` et `modify` sont désormais des lignes du menu numéroté (appariement article × recette), et les opportunités d'`escort` apparaissent sur une porte de voyage protecteur dans un district dangereux.
- **La fin du jeu lit l'influence que vous avez gagnée (v3.0) :** les fins de campagne `victory`, `puppet-master` et `quiet-retirement` — longtemps limitées par l'influence / le chantage / la légitimité que la couche de fin de partie lisait comme étant un zéro codé en dur — sont désormais accessibles grâce au véritable stock d'influence que toute l'économie sociale écrit. Le départ du compagnon est également accessible, via les points d'arrêt de l'agence PNJ et une limite inférieure de moral.
- **CLI de développement `audit-content` (v3.0) :** une commande d'audit de contenu pour développeurs (frère de `validate`, distinct du Ledger du directeur auquel le joueur a accès) qui exécute les six formateurs de directeur d'événement / boss / combat sur un pack.
- **Goût du genre *dans l'offre de départ* — l'ouverture de la version 3.0, livrée (v3.1) :** `economyGenre` lie chaque clé de règle de monde initial à `buildWorldStack` → `createEconomyCore`, de sorte qu'un district initialise désormais son profil `GENRE_SUPPLY_DEFAULTS` du genre (la science-fiction a beaucoup de composants / de contrebande, la fantaisie a peu de médicaments) au lieu d'une base universelle plate — l'offre de départ que le ton du MARCHÉ du directeur et les entrées de fin de partie lisent déjà. Sept des dix mondes initiaux contiennent un profil de genre ; trois reviennent à une base, honnêtement. Un champ distinct de `tradeGenre` / `craftingGenre` afin que les trois puissent diverger ultérieurement.
- **La surface sociale, complète (v3.1) :** `deny` et `bury-scandal` — la paire de manipulation des rumeurs qui cible une rumeur existante par ID plutôt qu'une faction — atteignent le menu numéroté via une dimension d'appariement de la cible de la rumeur, ce qui ferme la surface des vingt-et-un verbes (19 → 21 affichés).
- **Dialogue `obligation-exists`, câblé et accessible (v3.1) :** la condition de dialogue lit le registre d'obligations persistant d'un PNJ nommé (`getPersistedNpcObligations`) — Frère Aldric dans la fantaisie, une fois qu'il vous doit une faveur grâce au jeu normal de l'agence PNJ, débloque un choix `call-in-favor` — une véritable porte où la version 3.0 avait laissé un stub toujours vrai silencieux (un audit de session joué en phase 9 a prouvé qu'il était accessible dans une exécution réelle, et pas seulement vert dans les tests).
- **Réparation au goût du genre (v3.1) :** chaque monde initial contenant un genre crée une recette `repair` signature dans sa table de genre (fantaisie `repair-rune-mend`, science-fiction `repair-nanite-weld`, …), affichée via `getAvailableRecipes` — la réparation est désormais personnalisée, et pas seulement universelle.
- **Règlement facultatif du registre XRPL (v3.2) :** un nouveau package facultatif `@ai-rpg-engine/ledger-adapter` lie la couche échangeable appartenant au joueur — `coin` → une reconnaissance de dette, les consommables → des jetons fongibles, le delta net `buy`/`sell` d'un point de contrôle → un **escrow de jeton XLS-85** — au **testnet XRPL**, entièrement en dehors du noyau déterministe. Rien dans `core`/`modules` ne l'importe et une exécution est identique avec ou sans celui-ci (prouvé sur la boucle marchande pirate réelle `createGame()`). Uniquement pour le testnet derrière un garde impossible à coder dans le réseau principal, avec un fichier de secrets ignoré par Git, des nouvelles tentatives sûres en termes de conservation, une vérification du mémo en chaîne et une solution de repli non ancrée ; prouvé en direct de bout en bout sur le testnet (règlement via un escrow de jeton → `reconcile` par rapport aux soldes et mémos sur le registre). L'équipement NFT unique est une tranche ultérieure délibérée. Voir [L'adaptateur du registre XRPL](#l-adaptateur-du-registre-xrpl-facultatif).
- `ai-rpg-engine create-starter <name>` — prépare un nouveau jeu (autonome, s'exécute en dehors du monorepo) ; commandes de contenu `validate` + `scaffold`; charge les packs à partir de JSON.
- Modèle initial publié sur npm (`@ai-rpg-engine/starter-template`).
- Suite de tests complète : **5633 tests** (déterministe lors d'exécutions répétées ; les fichiers de test sont vérifiés par type dans CI ; le seuil de couverture est appliqué).

**Ce qui est incomplet ou imparfait :**
- Le studio de création d’univers par IA (couche Ollama) est moins testé que le noyau de simulation et nécessite un démon Ollama local ; il est entièrement facultatif — le moteur et la boucle `run` n’ont besoin d’aucun réseau.
- La pile de narration/audio génère des commandes audio déterministes, mais il n’y a **pas de module audio final** — aucun son n’est émis ; les commandes servent d’interface d’intégration pour une interface graphique ou un module web.
- Le mode multijoueur (deux joueurs humains partageant un même monde) n’est **pas** intégré ; il s’agit d’une couche réseau, délibérément exclue du champ d’application ; les profils actuels ciblent un seul contrôleur.
- `replay --replay` restaure la sauvegarde au lieu de relancer la simulation — et après la version 2.9, c’est la **direction choisie**, et non une simple option : `Engine.serialize()` est déjà un instantané complet et éprouvé de l’état, tandis qu’une nouvelle simulation devrait suivre l’évolution du monde/l’état des rencontres qui se déroulent en dehors du journal d’événements. La version 2.9 propose plusieurs emplacements de sauvegarde sur ce chemin de restauration éprouvé ; une véritable resimulation basée sur les événements n’est pas prévue.
- La version 3.1 a supprimé les trois limites définies de la version 3.0 — le **niveau de départ** du genre, les recettes de *réparation* spécifiques au genre et l’interface du menu `deny` / `bury-scandal`. Toutes ces fonctionnalités sont désormais disponibles. La limite honnête qui reste : ces nouvelles recettes de réparation de genre incluent un `statDelta` défini (un petit bonus de statistiques) que `resolveRepair` n’applique pas encore — la *réparation* restaure, `modify` *améliore* — donc la réparation en tant qu’amélioration est marquée dans le code et **reportée à la version 3.2/3.3** en tant que mécanique délibérée, et non comme un champ inerte silencieux. De plus, `obligation-exists` est livré avec une démonstration définie (Frère Aldric) ; la condition est active pour permettre aux créateurs de contenu d’ajouter davantage de dialogues.
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

## L’adaptateur de registre XRPL (optionnel)

`@ai-rpg-engine/ledger-adapter` est un package **facultatif** qui lie la **couche échangeable appartenant au joueur** d’un jeu — le solde `coin` et l’inventaire consommable — aux **testnets XRPL**, de sorte que ces actifs puissent être adossés à des jetons réels enregistrés et réglés lors des points de contrôle. L’absence d’adaptateur correspond exactement au moteur hors ligne disponible aujourd’hui.

**L’invariant du déterminisme (le but ultime).** L’adaptateur est un *canal secondaire*, qui ne fait jamais partie de la simulation :

- Il n’est **jamais invoqué à l’intérieur du cycle déterministe**, mais uniquement aux **points de contrôle** (sauvegarde, entrée dans une ville/un marché, fin de chapitre).
- Rien dans `@ai-rpg-engine/core` ou `@ai-rpg-engine/modules` ne l’importe (sa seule dépendance au moteur est un `import type` lors de la compilation).
- **Une exécution est identique en octets avec ou sans lui.** Un test de pare-feu exécute la boucle du marchand `starter-pirate` `createGame()` sur deux moteurs — l’un avec l’adaptateur activé et réglant les transactions à un point de contrôle — et vérifie que les deux mondes sont profondément égaux. La sauvegarde 0 est inchangée.

**Niveaux d’intégration : un jeu l’intègre aussi profondément que son design le souhaite.** Le pare-feu est une *frontière du déterminisme*, et non une règle anti-intégration ; l’invariant ci-dessus s’applique à tous les niveaux :

| Niveau | Ce qui dépend de l’adaptateur | S’adapte |
|-------|-----------------------------|------|
| **L0 — External observer** | Rien dans le jeu ; l’adaptateur se connecte depuis l’extérieur aux points de contrôle et le jeu n’en a pas conscience. | Intégration à un jeu existant (la démo du pirate disponible). |
| **Niveau 1 : Points de contrôle pilotés par le jeu.** | Le flux de sauvegarde/ville/progression méta propre au jeu appelle l’adaptateur à des moments définis. | Un jeu qui souhaite des moments d’enregistrement délibérés. |
| **L2 — Ledger-native design** | L’économie ou l’identité du jeu est conçue *autour* de la propriété enregistrée en chaîne (émetteur persistant, marchés réels). | Un jeu de marchand axé sur le registre. |

La distinction qui garantit la sécurité de la sauvegarde n’est **pas** « quel package importe l’adaptateur », mais « l’appel se fait-il à l’intérieur du cycle ». Un package de jeu peut importer et piloter librement l’adaptateur, tant que chaque appel a lieu à un point de contrôle en dehors de la boucle de relecture pilotée par les graines.

**Trois modes de jeu.** `offline` (par défaut — pas de chaîne, le moteur tel qu’il est livré) · `ledger` (pièces/objets adossés aux soldes du testnet, réglés aux points de contrôle) · `diary` (jouer hors ligne, puis ancrer le hachage de l’état de l’exécution sur le registre pour obtenir un reçu inviolable).

**Ce qui se trouve dans le registre.** `coin` → une promesse d’une devise émise par le biais d’une ligne de confiance ; objets consommables → jetons fongibles ; le delta net des transactions à un point de contrôle → un transfert réglé via l’**escrow de jetons XLS-85**. Les équipements uniques sous forme de NFT sont une extension ultérieure délibérée. L’économie du district abstrait (`economy-core`) n’est *pas* modifiée ; elle reste une simulation pure.

**Mesures de sécurité.** Uniquement le testnet, avec une protection structurelle **impossible en code sur le réseau principal** (et non un simple indicateur de configuration) ; les graines du portefeuille se trouvent dans un fichier secondaire ignoré par Git, et non dans le fichier de sauvegarde ; le règlement est idempotent et sûr en cas de nouvelle tentative ; les preuves vérifient le **mémo réel sur la chaîne** (et non la propre chaîne de caractères du moteur) ; et si la chaîne est inaccessible, l’exécution se poursuit simplement, marquée comme *non ancrée*.

**Déjà prouvé en direct.** Une véritable exécution du marchand `starter-pirate` — vendre une coutelle, acheter un obus — règle les transactions sur le testnet XRPL via l’escrow de jetons, puis `reconcile()` confirme les soldes et les mémos enregistrés par rapport à l’économie du moteur (la conservation est maintenue pour chaque jeton). Le registre est une famille de systèmes différente du moteur, de sorte que le moteur ne peut pas le falsifier — la réconciliation est un vérificateur externe authentique. Uniquement le testnet ; les actifs sont des reçus spécifiques au jeu, et non des titres financiers.

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
| [`@ai-rpg-engine/ledger-adapter`](packages/ledger-adapter) | **Facultatif** — intégration facultative du règlement sur le testnet XRPL pour la couche échangeable appartenant au joueur (pièces/inventaire/échanges), via l’escrow de jetons XLS-85 aux points de contrôle, entièrement en dehors du noyau déterministe. |

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
| [XRPL Ledger Adapter](site/src/content/docs/handbook/60-xrpl-ledger-adapter.md) | Intégration facultative sur le registre — le pare-feu du déterminisme, les niveaux d’intégration L0/L1/L2, les modes de jeu, les mesures de sécurité et la démo du pirate déjà prouvée en direct. |
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

Les deux structures de composition sont complètes : 5494 tests sur 280 fichiers, tous les 10 éléments de départ dans `buildCombatStack` **et** `buildWorldStack`, relecture déterministe et identique au niveau des octets avec les valeurs initiales imprimées, évaluation complète des décisions de l’IA et une interface en ligne de commande qui crée le squelette, exécute, valide et inspecte. La **version 3.0 donne vie au monde : les PNJ nommés prennent vie avec des objectifs, des relations de confiance/peur/avidité/loyauté, des registres d’obligations et des chaînes de conséquences ; la couche sociale génère passivement des revenus et dépense sur vingt-et-un nouveaux verbes de diplomatie/sabotage ; l’économie est adaptée à chaque genre en fonction du profil de départ ; et les avantages que vous obtenez atteignent enfin les fins de campagne qu’ils ouvrent. Un audit de la phase 9 a détecté un élément essentiel qui était présent dans le contenu, mais inactif — la correction consiste à inclure un PNJ nommé dans chaque profil de départ.**

**Dernière série de versions (v2.4.0–v3.0.0) :**
*   v2.4.0 — Combat en groupe (ciblage des alliés / soin / amélioration / réanimation, système d’effets de statut (modificateurs + DoT/HoT + déclencheurs réactifs), phase 1 des profils plug-in, commandes CLI `validate`/`scaffold` pour le contenu.
*   v2.5.0 — Résolution des règles par entité (combat avec styles de jeu mixtes), chargeur `applyProfile` + capacités par entité, modèles de profil + commande CLI `profile`, et une vérification complète de la santé.
*   v2.6.0 — La commande `run` est devenue un véritable jeu : les ennemis agissent en fonction de leurs propres profils d’IA, victoire/défaite, sauvegarde/reprise, capacités et XP dans le menu, le module `ai`, et la pile de narration.
*   v2.7.0 — Le monde réagit et il y a une raison de revenir : chaleur → pressions → conséquences narrées, rencontres à l’entrée des zones, boucle de quête + journal, équipement en combat, exécutions rejouables avec valeurs initiales, entrées d’événements finaux dynamiques, `buildWorldStack`, le registre du directeur et une transition de sauvegarde.
*   v2.8.0 — Agissez sur le monde dans lequel vous vivez : une économie commerciale dynamique + verbe `sell`, des compagnons que vous recrutez et avec lesquels vous combattez, et un registre du directeur qui analyse l’ensemble du tableau — un seul fil de communication par système allumé, environ 12 consommateurs qui étaient inactifs.
*   v2.9.0 — Fermez les boucles : `buy` + stock du marchand et artisanat complètent l’économie ; les compagnons effectuent des tours indépendants ; quatre verbes sociaux (corruption / intimidation / requête / amorce) fonctionnent sur une économie de levier financée par des récompenses d’opportunité ; les opportunités se résolvent avec une date d’expiration + conséquences liées à la faveur ; et l’équipement, les quêtes, les recrues et la monnaie de départ sont distribués uniformément aux dix profils de départ.
*   **v3.0.0 — Donnez vie au monde : le producteur d’agence des PNJ met en scène des PNJ nommés (objectifs / relations / registres d’obligations / chaînes de conséquences) ainsi qu’un PNJ narratif dans chaque profil de départ ; la surface sociale s’étend à 25 verbes (diplomatie + sabotage) avec un revenu de levier passif et des dialogues qui lisent l’état social ; stock et recettes spécifiques au genre par profil de départ ; les fins de levier (victoire / maître marionnettiste / retraite tranquille) deviennent accessibles ; lignes de menu de réparation/modification, opportunités d’escorte et une commande CLI `audit-content` — le tout est intégré dans un audit de la phase 9 qui a détecté deux fils morts que la suite de tests verts avait masqués.**

### Prochain (la structure v2.8)

- **PNJ vivants** — le producteur d’agents PNJ persistants qui active la section « PERSONNES » du directeur : PNJ nommés avec des objectifs, des points de rupture relationnels, des registres d’obligations et des chaînes de conséquences, ainsi que l’influence sur le moral des compagnons et le cheminement des risques de départ que le système de réaction prend déjà en compte.
- Stocks marchands et recettes d’artisanat thématiques (ajout de filtres par thème pour chaque profil au lieu du remplacement universel actuel), et l’interface `repair`/`modify`.
- La prochaine couche de l’économie d’influence — revenus passifs au-delà des récompenses des opportunités, et verbes sociaux qui vont au-delà des quatre actuellement disponibles (diplomatie / groupes de sabotage) — ainsi que le vocabulaire des conditions/effets du dialogue qui analyse le nouveau statut social.
- Multijoueur — deux joueurs *humains* partageant un même monde (une couche réseau, délibérément reportée ; les profils partagés pour un seul contrôleur sont disponibles aujourd’hui sous la forme de [`shared-profiles.ts`](docs/examples/shared-profiles.ts)).
- Remplacement des formules sérialisables — réglage des formules par profil (bloqué en attendant un DSL pour les formules ; les profils contiennent aujourd’hui des mappages de statistiques, et non des fermetures).
- Synchronisation de la documentation de l’API — s’assurer que toutes les pages du manuel reflètent les dernières API.

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

Le moteur principal est une **bibliothèque de simulation locale** : aucune télémétrie, aucun réseau, aucun secret. Les fichiers sont enregistrés uniquement dans le dossier `.ai-rpg-engine/` lorsqu’on le demande explicitement. Deux **couches optionnelles** ajoutent un chemin de sortie, et ce seulement lorsque vous les activez :

- La couche d’IA (`@ai-rpg-engine/ollama`) communique avec un démon Ollama **local** ; son option `webfetch` (pour RAG) est limitée par une protection contre les attaques SSRF (qui bloque les adresses de boucle locale, les adresses locales liées, CGNAT, les métadonnées du cloud et leurs équivalents IPv6).
- La couche de registre (`@ai-rpg-engine/ledger-adapter`) accède au **testnet XRPL** — et uniquement au testnet : une protection structurelle **impossible en code sur le mainnet** (et non un simple indicateur de configuration) rejette tout hôte autre que le testnet lors de sa création. Les clés privées du portefeuille sont stockées dans un fichier secret ignoré par Git, jamais dans un fichier d’enregistrement, et le noyau déterministe n’importe jamais l’adaptateur.

Pour plus de détails, consultez le fichier [SECURITY.md](SECURITY.md).

## Prérequis

- Node.js >= 20
- TypeScript (modules ESM)

## Licence

[MIT](LICENSE)

---

Créé par <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
