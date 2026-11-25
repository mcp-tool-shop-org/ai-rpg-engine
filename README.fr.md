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

**Ce qui fonctionne et a été testé :**
- **Les packs World Forge ne sont plus rejetés (v3.12.2) :** le système de chargement indique que les 13 principales clés d’un pack World Forge (`connections`, `spawnPoints`, `playerTemplate` et dix autres) sont connues, mais pas incluses. Ainsi, un pack valide qui les contient se charge et le rapport de chargement indique que chacune a été supprimée. Une clé mal orthographiée est toujours rejetée. Les hachages restent inchangés.
- **Hôte Godot (v3.12) :** le module complémentaire `capabilities.audio` inclut une charge utile `felt` (ID de séquences, éléments de superposition, lignes parlées, effets d’interface utilisateur) qui n’est jamais hachée. Elle est négociée et ajoutée, et entièrement omise lorsque la fonctionnalité est désactivée. Ainsi, un client parfaitement compatible reste stable en termes d’octets. [`ai-rpg-stage`](https://github.com/mcp-tool-shop-org/ai-rpg-stage) est le client Godot 4 : 2:1 dimétrique TileMapLayer, personnages Foundry à 8 directions, présentation par clic sur une cellule, `move` désigne toujours une zone voisine. Manuel : [Clients visuels](site/src/content/docs/handbook/66-visual-clients.md).
- **Réglages et profondeur (v3.11) :** `bounty` se déclenche à nouveau sur le contenu créé (le nettoyage de l’écouteur v3.10 a permis de séparer de 36 rounds les deux navires noirs ; la marge de sécurité est cet intervalle mesuré, et les deux navires sont toujours présents). Un combat qui se termine parce que quelqu’un s’est enfui l’indique : `combat.encounter.cleared` contient `outcome: 'victory' | 'retreat'` (pas un deuxième événement, pas une indication de victoire, pas une victoire enregistrée). L’adhésion à une faction comporte trois emplacements valides : `entity.faction` sur la personne, un registre conservé qui s’enrichit à partir de celui-ci et qui inclut toujours des éléments supplémentaires, et `CompanionState.originFaction`, de sorte que la guilde d’où ils viennent continue de l’écouter. La musique de la zone est diffusée par `zoneId` ; les indications respectent les délais de recharge ; `/build`, les écritures séquentielles survivent à un plantage ; une nouvelle session CLI émet l’événement d’entrée dans la zone de départ, de sorte que les MOMENTS CLÉS permettent de voir la première ambiance. 8 356 tests.
- **Le monde atteint le joueur (v3.10) :** deux cycles de producteurs se terminent finalement sur les sens du joueur. Les huit indices de la voix du narrateur sont rendus. La texture du PNJ et les préjugés de la faction encadrent l’orateur, l’indice de manière est associé à la ligne de l’orateur, la présence du groupe/la pression du monde/les opportunités ouvertes ferment le cadre du dialogue sous forme d’apartés, et l’ambiance et les rapports sur la situation du district s’ajoutent au journal des événements. Le HUD, toujours actif, affiche la ligne du groupe. L’honnêteté du combat se manifeste comme un événement réel : `combat.encounter.cleared` se déclenche exactement une fois lorsque le dernier ennemi tombe (une mort mutuelle est interprétée comme une défaite, la mort d’un compagnon n’entraîne plus de triomphe, et les neuf premiers auditeurs qui ont salué chaque mort ont disparu), et est associée à l’indication de victoire via le présentateur par tour. La résolution de l’entrée dans la zone tient compte de la musique : un district sinistre sonne réellement sinistre, et le contrat de sortie vocale est réel : `NarrationPlan.asides` contient des fragments de dialogue exactement une fois, `SpeakerCue.emotion` contient l’indice de manière tel quel, prêt à être intégré dans un système de synthèse vocale. Les clients du module complémentaire voient l’apport du pack `dropped[]`/`advisories` sur `initialize`, les lots guidés `/build` mettent en scène chaque étape derrière un consentement unifié (avec une annulation prenant en compte la création et un refus qui ne peut pas vider le système), les factions structurées survivent à `emit-pack`, et l’identité de la faction est déterminée à partir de l’élément `faction` créé par l’entité, partout où un registre n’était auparavant pas inclus dans le pack. Une session jouée e2e fixe toute la surface image par image, NO_COLOR, octet par octet.
- **Le pack que vous créez est le jeu auquel vous jouez (v3.9) :** le studio crée désormais tout ce que le moteur démarre : `create-ruleset`, `create-rule-profile` et `create-item-placement` rejoignent les verbes structuraux, et les deux plans `/build` et `ai scaffold-and-critique` se terminent par l’émission de `content/pack.json`. `applyContentPack` tamponne `playerId`/`locationId` à partir d’un pack à un seul joueur, inclut les bases de la réputation de la faction et les registres de profils de règles (fusionnés, sans jamais effacer ceux de l’hôte), et inclut le manifeste et l’ensemble de règles du pack via `extractSessionContent`. La recette de démarrage JSON documentée est corrigée et fixée par un test de bout en bout. Le dialogue acquiert une texture en direct : un PNJ mentionne le contrat qui est réellement sur la table, et son arrivée avec des compagnons ou dans un district sinistre le reflète, et le conseiller de déplacement prononce une ligne adressée au joueur. La mémoire de la campagne enregistre les sauvegardes des compagnons et les objets créés, les variantes d’images conservent leurs verrous d’identité (avec le support LoRA), les positions de rumeur s’estompent et une indication de victoire ne tue plus le thème de la zone. 8 042 tests.
- **La surface de l’hôte est sur le moteur (v3.8.1) :** `hash`, `present`, `preview`, `getAvailableActions`, `advanceRound`, le module complémentaire `listActions` + sauvegarde/chargement, le studio `emit-pack`, les catalogues de packs JSON et `ruleProfiles`. L’attachement à Godot et le démarrage JSON `--content` ne copient plus les éléments internes de la CLI pour créer ces points de jonction.
- Noyau d’exécution : état du monde, événements, actions, cycles, relecture : stable depuis v1.0 ; relecture déterministe octet par octet (compteur d’ID par instance, générateur de nombres aléatoires initialisé)
- Système de combat : 5 actions, 4 états de combat, 4 états d’engagement, interception des compagnons, déroulement de la défaite, tactiques d’IA
- Capacités : coûts, délais de recharge, vérifications de statistiques, effets typés, vocabulaire de statut à 11 balises, sélection prenant en compte l’IA
- **Combat de groupe (v2.4) :** ciblage des alliés (soin/buff/réanimation), filtrage ami/ennemi AoE, sélecteurs de cibles : un soigneur peut soigner un coéquipier ; un ennemi AoE épargne les alliés
- **Effets de statut (v2.4) :** les modificateurs de statistiques passifs atteignent le combat, DoT/HoT déterministes déclenchés par le compteur de cycles, déclencheurs réactifs à profondeur limitée (épines/réflexion)
- **Profils de module d’extension : résolution des règles par entité (v2.5) :** un combattant `might` et un mystique `will` résolvent le combat dans un seul combat, chacun lisant les statistiques via son propre mappage. `RuleProfile` + `WorldState.ruleProfiles` + `EntityState.ruleProfileId` ; `applyProfile()` attache un profil (mappage des statistiques, réserves de ressources, capacités par entité) ; `buildProfile()`, `validateProfileSet()` (les ID dupliqués sont rejetés), 10 modèles dérivés de départ et une commande CLI `profile`
- **Boucle de jeu (`run`) (v2.6) :** le jeu final est réel, et non une démo : les ennemis agissent en fonction de leurs profils d’IA (`aggressive`/`cautious`/`territorial`/`calculating` ; six profils intégrés, avec `passive` et `follower`), un combat se termine par une victoire ou une défaite, vous pouvez sauvegarder et reprendre, et les capacités et l’expérience sont disponibles dans le menu d’action. `run <path>` charge un jeu que vous avez structuré. Interface utilisateur terminale composée avec un HUD clair et accessible et une couleur respectueuse (respecte `NO_COLOR` / non-TTY)
- **Le studio de conception de l’IA est livré sous forme de sa propre commande `ai` (v2.6) :** `npm install -g @ai-rpg-engine/ollama` → `ai chat` : structure, critique et équilibre du contenu par rapport à un modèle Ollama local
- Couche de décision unifiée : le combat + le score des capacités sont fusionnés en un seul appel (`selectBestAction`)
- Les 12 mondes de départ utilisent `buildCombatStack()` : l’ossature de composition éprouvée
- API de configuration de la cognition (`cognition: CognitionCoreConfig | false`) pour le réglage de l’IA par monde de départ
- Taxonomie des balises et utilitaires de validation pour la création de contenu
- **Le monde réagit (v2.7) :** les morts accumulent de la chaleur et érodent la sécurité du district ; un cycle mondial par tour génère des pressions cachées qui se manifestent sous forme de rumeurs (« Des murmures vous parviennent… »), s’intensifient et s’estompent avec des conséquences ; les ~30 compositions d’événements créées se déclenchent à l’entrée de la zone dans les 10 mondes de départ, de manière déterministe par graine, les districts les plus sanglants en génèrent davantage, et les pièces maîtresses sont protégées.
- **Une raison de revenir (v2.7) :** une boucle de quête minimale sur le schéma déjà publié : les quêtes sont proposées au déclenchement, suivent les objectifs de tuer/atteindre/progresser et versent de l’expérience et des objets exactement une fois ; quatre quêtes créées, un écran « Journal », des étapes de quête dans le récit du tour.
- **L’équipement atteint le combat (v2.7) :** `equip`/`unequip` font passer de vrais chiffres dans la couche de statut que les formules de combat lisent déjà : zéro modification du code de combat ; le trident et le filet du gladiateur sont connectés de bout en bout avec un delta de chance de coup testé.
- **Exécutions avec graines (v2.7) :** chaque nouvelle session affiche sa graine avec la commande de relecture exacte ; `--seed <n>` reproduit une session octet par octet ; le combat, la résistance, les capacités et les lancers de tactique utilisent tous la graine du monde, et les fins lisent l’exécution que vous avez réellement effectuée (chaleur en direct, pressions, accumulations de faction, niveau du joueur).
- **`buildWorldStack()` (v2.7) :** l’ossature de composition stratégique à côté de `buildCombatStack()` : un seul appel assemble l’environnement, les factions, les rumeurs, les districts, les conséquences de la défaite, les rencontres et les quêtes ; plus l’écran de stratégie « Ledger du directeur », un inspecteur de simulation `AI_RPG_DEBUG=1`, `inspect-save`, protégé par les mêmes autorités que Continuer, et une jonction de migration de sauvegarde sur le chemin de restauration publié.
- **Agir sur l’économie vivante (v2.8) :** `createEconomyCore` initialise une économie par district au chargement du pack et la fait évoluer à chaque tour ; un nouveau verbe `sell` fixe le prix du butin via `computeItemValue` (rareté/faction/provenance/contrebande) et modifie l’offre locale. Un seul fil a permis de faire fonctionner cinq systèmes qui étaient inactifs dans v2.7 : l’aperçu du marché + le score des factions du directeur, l’arc du marchand-prince de fin de partie et le déclencheur d’effondrement, et quatre types de pression économique. **Vente uniquement ce cycle** (achat → v2.9).
- **Compagnons (v2.8) :** un verbe `recruit` construit un groupe : état, balises et faction, de sorte qu’un compagnon combat *avec* vous ; le combat des compagnons s’appuie sur le mécanisme d’interception du noyau de combat (inactif jusqu’à `isAlly`), les compagnons réagissent avec le moral et peuvent partir, et le recrutement allume sept consommateurs en attente : l’appel des compagnons de la finale, le ciblage du groupe, les objectifs d’agence des PNJ, les quêtes de faveur et la section du groupe du directeur. **Interception passive ce cycle** (tours indépendants → v2.9).
- **Le directeur voit l’ensemble du tableau (v2.8) :** une nouvelle section du Ledger de l’équipement (derrière la dépendance cli→provenance de l’équipement), une bande-annonce de la finale du RÉSUMÉ DU DIRECTEUR, les sections MARCHÉ et GROUPE sont désormais alimentées par des producteurs en direct, et la stabilité du district + l’ambiance économique dans la section DISTRICTS de la finale.
- **L’autre moitié de l’économie (v2.9) :** un verbe `buy` complète la boucle : le stock du marchand offert par district en fonction de la granularité de la catégorie d’approvisionnement (le niveau d’approvisionnement *est* le signal de réapprovisionnement), dont le prix est fixé par le même pipeline `computeItemValue` que `sell`, plus une marge d’achat/vente afin qu’il n’y ait pas de transaction sans risque. Et l’artisanat prend vie : `createCraftingCore` enregistre `salvage`/`craft`/`repair`/`modify` par rapport aux tables de recettes créées, ce qui allume les sections MATÉRIAUX + RECETTES du directeur qui étaient inactives.
- **Les compagnons effectuent leurs propres tours (v2.9) :** le seuil d’interception passive de v2.8 devient le plafond : les compagnons recrutés agissent indépendamment à chaque tour via le conseiller `selectBestAction` auparavant inutilisé, avec un biais de combat par rôle, de sorte qu’un combattant et un érudit se battent différemment, l’interception compagnon-compagnon et les points de vie du groupe sur la ligne du groupe du directeur. Les packs sans compagnons restent octet par octet (la porte du groupe vide préserve la relecture de la graine 0).
- **La surface sociale, connectée de bout en bout (v2.9) :** quatre verbes de levier : `bribe`, `intimidate`, `petition`, `seed` (rumeur) : ils écrivent de vrais éléments globaux de réputation/alerte/chaleur qui sont lus par les prix et les portes de faction, et `seed` allume le module de rumeurs du joueur et la section RUMEURS SUR VOUS du directeur. L’économie du levier qui les finance est également connectée : la réalisation d’une opportunité accorde désormais le levier qu’elle a toujours annoncé, de sorte que les verbes sont réellement gagnables pendant le jeu.
- **Opportunités, cycle de vie complet (v2.9) :** un générateur par tour propose des contrats/primes/faveurs en fonction de l’état du monde en direct ; vous `accept`, puis `complete` ou `abandon` ; l’ignorance d’une opportunité jusqu’à sa date limite a désormais des conséquences (conséquences de l’expiration), et la réalisation d’une faveur de compagnon fait progresser le moral de ce compagnon. Les arcs de montée en puissance et de marchand-prince de la fin du jeu tiennent compte des opportunités que vous avez réellement résolues.
- **Parité du contenu dans les dix mondes de départ (v2.9) :** le câblage de l’équipement, les quêtes, les compagnons recrutables et un solde de départ ont été déployés dans chaque monde de départ qui ne les avait pas : les dix mondes partagent désormais une surface de fonctionnalités uniforme et entièrement éclairée (l’équipement était réservé aux gladiateurs ; les quêtes étaient réservées aux mondes fantastiques/zombies ; cinq mondes ont été lancés avec `recruit` sans personne à recruter). De plus, un validateur de contenu structurel détecte une erreur de frappe dans l’ID d’un élément sur toutes les surfaces de référence, et des emplacements de sauvegarde à plusieurs points de contrôle avec `--checkpoint`/`--list-checkpoints`.
- **PNJ vivants, réellement vivants (v3.0) :** le producteur d’agence des PNJ persistants allume la section **PERSONNES** du directeur : les PNJ nommés (un personnage d’histoire créé par monde de départ, plus tous les compagnons que vous recrutez) ont des objectifs, des relations de confiance/peur/avidité/loyauté, un registre des obligations et des chaînes de conséquences. `runNpcAgencyTick` s’exécute à chaque tour, de sorte qu’un monde sans PNJ nommés reste octet par octet par rapport à la relecture existante. L’allumage du producteur a également allumé les points de rupture de départ de la chute du moral des compagnons, deux règles de génération d’opportunités dormantes (objectif du PNJ + obligation) et les éléments npcProfiles/npcObligations de la fin du jeu : le fil a été testé et s’est avéré fonctionnel, mais inactif dans le contenu publié jusqu’à ce qu’un audit de la phase 9 le détecte, de sorte que la correction publie un PNJ nommé créé dans chaque monde de départ.
- **La surface sociale complète (v3.0) :** les quatre verbes de levier deviennent vingt-cinq : les groupes de diplomatie et de sabotage s’enregistrent (21 autres sous-verbes), ce qui allume les éléments `leverage-diplomacy`/`leverage-sabotage` précédemment inactifs des réactions des compagnons ; dix-neuf sont affichés dans le menu numéroté (abordable + délai de recharge + réputation). Les conditions et les effets du dialogue lisent et écrivent désormais l’état social (levier/réputation/relation avec les PNJ). Et le revenu de levier passif (`tickLeverage`/`computeLeverageGains`) fait couler l’influence de la réputation et accorde la faveur/le chantage/la légitimité à partir de l’expérience et des étapes importantes, de sorte que la couche sociale est gagnée entre les opportunités, et pas seulement à leur achèvement.
- **Économie à saveur de genre (v3.0) :** le stock du marchand et les recettes d’artisanat résolvent désormais les tables de genre par monde de départ (sept des dix mondes de départ contiennent du contenu de genre créé ; les trois autres utilisent un contenu universel), dans les mécanismes d’achat/d’artisanat, l’affichage du menu numéroté et la section RECETTES du directeur, le tout étant lié à la même clé de l’ensemble de règles afin que l’affichage et les mécanismes soient en accord. `repair` et `modify` sont désormais des lignes du menu numéroté (appariement article × recette), et `escort`, les opportunités se présentent sur une porte de protection lors d’un voyage dans un district dangereux.
- **La fin du jeu tient compte du levier que vous avez gagné (v3.0) :** les fins de campagne `victory`, `puppet-master` et `quiet-retirement`, qui étaient auparavant bloquées sur l’influence/le chantage/la légitimité que la couche de fin de jeu lisait comme étant un zéro codé en dur, sont désormais accessibles grâce au véritable magasin de levier que l’ensemble de l’économie sociale écrit. Le départ des compagnons est également accessible, via les points de rupture de l’agence des PNJ et une marge de sécurité du moral.
- **CLI de développement `audit-content` (v3.0) :** une commande d’audit de contenu pour les développeurs (frère de `validate`, distincte du Ledger du directeur auquel le joueur a accès) qui exécute les six formateurs de directeur d’événements/boss/combat sur un pack.
- **Économie de départ à saveur de genre : v3.0, lancée (v3.1) :** `economyGenre` fait passer la clé de l’ensemble de règles de chaque monde de départ à travers `buildWorldStack` → `createEconomyCore`, de sorte qu’un district génère désormais son profil de genre `GENRE_SUPPLY_DEFAULTS` (la science-fiction est très axée sur les composants/la contrebande, la fantaisie est axée sur la médecine), au lieu d’une base universelle plate : l’offre de départ que le ton du MARCHÉ du directeur et les entrées de la fin du jeu lisent déjà. Sept des dix mondes de départ contiennent un profil de genre ; les trois autres reviennent à la base, honnêtement. Un champ distinct de `tradeGenre`/`craftingGenre`, de sorte que les trois peuvent diverger ultérieurement.
- **La surface sociale, complète (v3.1) :** `deny` et `bury-scandal` : la paire de manipulation des rumeurs qui cible une rumeur existante par ID plutôt qu’une faction, atteignent le menu numéroté via une dimension d’appariement des rumeurs cibles, ce qui ferme la surface des vingt-et-un verbes (19 → 21 affichés).
- **Dialogue `obligation-exists`, câblé et accessible (v3.1) :** la condition de dialogue lit le registre des obligations persistantes d’un PNJ nommé (`getPersistedNpcObligations`) : Frère Aldric, dans le monde fantastique, une fois qu’il vous doit une faveur grâce à une agence de PNJ ordinaire, débloque un choix `call-in-favor` : une porte réelle où v3.0 avait laissé un stub toujours vrai (un audit de session joué de la phase 9 a prouvé qu’il était accessible dans une exécution réelle, et pas seulement dans des tests unitaires).
- **Réparation à saveur de genre (v3.1) :** chaque monde de départ contenant un genre crée une recette de signature `repair` dans sa table de genre (fantaisie `repair-rune-mend`, science-fiction `repair-nanite-weld`, …), affichée via `getAvailableRecipes` : la réparation a désormais une saveur, et n’est plus uniquement universelle.
- **Règlement facultatif du registre XRPL (v3.2) :** un nouveau package facultatif `@ai-rpg-engine/ledger-adapter` lie la couche échangeable appartenant au joueur : `coin` → un billet à ordre, les consommables → des jetons fongibles, le delta net d’un point de contrôle `buy`/`sell` → un **jeton en dépôt XLS-85** sur le **testnet XRPL**, entièrement en dehors du noyau déterministe. Rien dans `core`/`modules` ne l’importe et une exécution est octet par octet avec ou sans celui-ci (prouvé sur la boucle de pirate réelle `createGame()`). Uniquement sur le testnet derrière un garde impossible à coder sur le réseau principal, avec un sidecar de secrets ignoré par Git, des nouvelles tentatives en toute sécurité, une vérification des mémos en chaîne et une solution de repli non ancrée ; prouvé en direct de bout en bout sur le testnet (régler via un dépôt de jetons → `reconcile` par rapport aux soldes et mémos sur le registre). L’équipement NFT unique se trouve dans v3.3 (ci-dessous). Voir [L’adaptateur du registre XRPL](#ladaptateur-du-registre-xrpl-facultatif).
- **Équipement NFT unique (v3.3) :** le `@ai-rpg-engine/ledger-adapter` lie l’équipement unique du package `equipment` (la « tranche ultérieure » de v3.2) aux NFT XRPL : chaque article unique est créé en tant que **NFT XLS-20 NFToken** (`tfMutable`, jamais destructible : véritable propriété du joueur) à un point de contrôle, la croissance des reliques faisant progresser les métadonnées d’un NFT mutable en place via **XLS-46 `NFTokenModify`**, et une famille de propriété `reconcile()` vérifiant l’existence sur le registre `account_nfts`. Un chemin de lecture distinct par rapport à l’équipement, transporté avec la couche fongible : le même pare-feu de déterminisme, octet par octet avec ou sans celui-ci. Prouvé sur la session jouée réelle `starter-gladiator`, en direct sur le testnet (créer l’équipement `trident-and-net` en tant que NFT, le posséder sur le registre, le réconcilier, le monde n’est pas perturbé).
- **L’équipement gagne un nom (v3.4) :** la croissance des reliques existe depuis v3.3, mais ne s’est jamais déclenchée pendant le jeu : rien n’a rempli une chronique d’article dans un jeu en cours, de sorte que la version de la relique de chaque article était définitivement `0`. Le côté d’écriture est désormais disponible : un module **facultatif `item-chronicle-core`** enregistre `acquired`/`used-in-kill`/`recognized` à partir d’un jeu réel, et `starter-gladiator` le connecte : gagner trois combats d’arène et le trident retiarius devient le **Trident et filet ensanglantés** pour le reste de l’exécution, affiché dans le HUD et le Ledger du directeur. Cela **ferme également la boucle NFT** : un point de contrôle règle cette croissance en tant que **NFT XLS-46 `NFTokenModify`** réel, en faisant progresser l’URI sur le registre tout en préservant NFTokenID. Corrigé en même temps : `boss-kill` et `recognized` étaient tous deux inaccessibles sur chaque pack publié (une vérification de balise `boss` vide par rapport au contenu qui balise `role:boss`, et un garde de faction par rapport au contenu où aucune entité ne définit une faction) : et ce dernier bloquait silencieusement *toute* la croissance de l’armure. Facultatif par construction : un pack qui ne le connecte pas est octet par octet par rapport au moteur qui a été publié avant son existence.
- **Les conséquences laissent de vraies marques (v3.8) :** la couche stratégique s’est déclenchée après v3.7 : les opportunités se sont présentées, résolues et le narrateur a pu prononcer le résultat, puis le monde l’a oublié. `applyOpportunityFallout` a déclaré **quatorze** types d’effets et a conservé **six** : une obligation annoncée et entrée dans aucun registre, une rumeur qui ne s’est pas propagée à personne, un titre qui n’a titré personne. Les quatorze persistent désormais, chacun via l’écrivain de son propre système, et deux d’entre eux **ferment des boucles de rétroaction** : une obligation écrite dans le registre fait progresser le point de rupture de la loyauté qui détermine ce qu’un PNJ vous offre ensuite, et la confiance déplacée dans le registre ouvre la porte à travers laquelle les offres sont lues. Il s’est avéré que trois types d’effets étaient morts un niveau plus tôt qu’un registre manquant (`materials` et `spawn-opportunity` étaient émis par rien du tout ; chaque producteur `spawn-pressure` était assis sur une résolution qu’aucun chemin publié ne pouvait atteindre), de sorte que le cycle a créé des producteurs plutôt que de construire des gardes qui ne pourraient jamais se déclencher. L’opération `betray` se termine en tant que quatrième transition et allume **six sites d’obligation, trois rumeurs et les trois producteurs de pression initiaux** qui avaient été créés dans les versions précédentes et auxquels on ne pouvait pas accéder. Un audit du registre à l’échelle de la session a ensuite trouvé trois registres supplémentaires sur l’applicateur de pression que personne n’avait identifiés, ce qui est ce que la réconciliation dans les deux sens apporte par rapport à un balayage orphelin. Et le douzième monde de départ, **Hue and Cry**, est créé à l’envers à partir de la couche des conséquences : un chasseur de voleurs dans une ville sans police, 7/7 sur la grille du pack.
- **La couche stratégique, allumée (v3.7) :** la couche au-dessus des verbes de l’instant, où les opportunités se présentent, où les compagnons comptent passivement et où les districts ont des ambiances, était à moitié sombre, et rien ne pouvait la voir. Une nouvelle sonde à l’échelle du catalogue démarre les onze packs et exécute **quarante tours complets** à travers le même moteur que la CLI interactive utilise (tours des PNJ, tours des compagnons, puis le cycle du monde), car `runWorldTick` est une fonction par tour plutôt qu’un verbe, et une sonde construite à partir de `submitAction` seul ne voit qu’un demi-tour pour toujours. Elle a mesuré **un des huit types d’opportunités** qui se déclenchent sur le contenu publié. Les **huit se déclenchent désormais**, chacun avec une preuve de session jouée que la récompense a réellement été accordée, et l’un d’eux exécute délibérément le temps, de sorte qu’une conséquence de l’expiration (réputation perdue, un district plus affamé) est prouvée sur un contenu réel plutôt que supposée. Ce qui se dressait sur le chemin n’était pas les règles : `contract` avait besoin d’un PNJ à la fois allié ET avide, ce que le tableau des points de rupture rend mutuellement exclusif avec `favorable`, et `relations['player-trust']` avait été créé exactement une fois dans l’ensemble du catalogue ; les économies des districts effaçaient leur propre caractère de genre et de balise en ~15 tours en faisant dériver chaque catégorie vers un 50 universel ; `world.factions[].reputation`, la base créée que le moteur fusionne explicitement, n’était définie par aucun pack, de sorte que chaque monde commençait à zéro avec tout le monde. Le **rythme** est réglé en fonction des découvertes nommées plutôt que du goût, chacune étant citée à la constante qu’elle régit (surcharge de choix, variance des quêtes, vallées de détente, répétition rayonnante, dynamique des rendez-vous), et protégée par une régression déterministe. **Douze des treize** champs de modification des compagnons et des districts atteignent désormais une fonction de résolution via une jonction de paramètres, chacun avec une contribution nommée dans la charge utile, de sorte qu’une interface utilisateur puisse indiquer QUI a aidé : un modificateur calculé mais non rendu est expérimentalement identique à l’absence de modificateur. `use` **arrête de détruire silencieusement des choses** : 89/90 a créé des éléments dans l’ensemble du catalogue qui ont été consommés par un verbe qui n’a trouvé aucun effet et les a supprimés du sac, tout en signalant le succès. Et le contrat `statusTags`, déclaré par les onze packs et appliqué par aucun, est lié : les déclarations sont élargies vers la vérité publiée en premier, puis protégées.
- **L’instrument est activé sur le catalogue (v3.6) :** le pack conçu pour UTILISER le registre est désormais exécuté délibérément en tant qu’instrument de polissage du moteur. Un audit de l’accessibilité des verbes à l’échelle du catalogue démarre les onze packs et SOUMET chaque verbe au moteur réel, en demandant si un objectif dans le monde démarré l’accepte : une porte qu’aucune vérification existante ne pouvait passer ou échouer, car l’honnêteté du verbe compare la table d’aide aux gestionnaires enregistrés et n’examine jamais le contenu. Exécuté avant toute correction, il a détecté `recruit` annoncé dans Salt Road Ledger avec zéro PNJ recrutables (le défaut v2.9, réintroduit) et `use` inactif dans l’ensemble du catalogue du pack. `give` est lancé en tant que **première opération de transfert d’éléments d’une entité à une autre** du moteur : atomique, rejet structuré, horodaté par un événement, ce qui comble une lacune où un pack pouvait rendre un article accessible et n’avait rien qui puisse le transmettre à qui que ce soit. Et les deux axes d’adaptateur restants qui étaient des indicateurs de configuration avec **zéro lecture comportementale** sont devenus des comportements : `diary` mode (témoin, non dépositaire : un seul point d’ancrage par point de contrôle, pas de lignes de confiance, la réconciliation vérifie la chaîne d’ancrage) et `issuerMode: 'persistent'` (un marché qui survit à l’exécution). Prouvé **15/15 sur le testnet XRPL en direct**.
- **Un jeu dont la boucle est la dette (v3.5) :** le onzième monde de départ, **Salt Road Ledger**, est le premier créé à partir d’un système plutôt que d’un genre : vous jouez un facteur qui échange sur le capital de quelqu’un d’autre, et cinq verbes de commerce (`appraise`/`haggle`/`consign`/`underwrite`/`audit`) font avancer le jeu tandis que le combat est considéré comme une pénalité (le profil des ressources a un tableau `gains` vide : rien ne récompense la violence). `consign` est le seul verbe dans le catalogue dont la sémantique hors ligne correspond à une primitive de règlement un à un, ce qui en fait le pack de référence pour l’adaptateur du registre tout en n’ayant **aucune dépendance à celui-ci**. Livré avec le genre `mercantile` et un profil d’économie marchande, et 7/7 sur la grille du pack. Le même cycle a rendu réels les deux axes d’adaptateur inactifs : le champ de mémo `VERB:` (déclaré avec des membres qu’aucun site d’appel ne pouvait émettre) et `config.settlement` (déclaré avec zéro lecture nulle part), et un audit de session jouée du nouveau pack a révélé six mécanismes qui étaient câblés, valides en termes de schéma, valides en termes d’unités et inactifs.
- `ai-rpg-engine create-starter <name>` : structure d’un nouveau jeu (autonome, s’exécute en dehors du monorepositoire) ; `validate` + `scaffold`, commandes de contenu ; chargement des packs à partir de JSON.
- Modèle de départ publié sur npm (`@ai-rpg-engine/starter-template`).
- Suite de tests complète : **8 368 tests** (déterministe lors d’exécutions répétées ; les fichiers de test sont vérifiés par type dans CI ; le taux de couverture est appliqué).

**Ce qui est imparfait ou incomplet :**
- L’atelier de création de mondes par IA (couche Ollama) est moins testé que le noyau de simulation et nécessite un démon Ollama local ; il est entièrement facultatif — le moteur et la boucle `run` n’ont besoin d’aucun réseau.
- La pile de narration/audio génère des commandes audio déterministes, mais il n’y a **pas de backend audio terminal** — rien ne produit de son dans `run`. La scène Godot est le premier environnement qui lit réellement les identifiants de signaux `felt` (mélangeur + synthèse vocale optionnelle). Les effets sonores de superposition ne doivent pas remplacer la musique d’ambiance de la zone.
- Le mode multijoueur (deux joueurs humains partageant un même monde) n’est **pas** intégré ; il s’agit d’une couche réseau, délibérément exclue du champ d’application ; les profils actuels ciblent un seul contrôleur.
- `replay --replay` restaure la sauvegarde au lieu de simuler à nouveau — et après v2.9, c’est la **direction** choisie, et non un report : `Engine.serialize()` est déjà un instantané complet et éprouvé de l’état, alors qu’une resimulation devrait suivre l’état du monde/de la rencontre qui se trouve en dehors du journal des actions. v2.9 propose des emplacements de sauvegarde multi-points de contrôle sur ce chemin de restauration éprouvé ; une resimulation basée sur des événements n’est pas prévue.
- v3.1 a supprimé les trois plafonds nommés de v3.0 — le **stock de départ** du genre, les recettes de *réparation* spécifiques au genre et la surface du menu `deny` / `bury-scandal` sont désormais inclus. Le seul plafond qui reste : ces nouvelles recettes de réparation de genre incluent un `statDelta` (un petit bonus de statistiques) que `resolveRepair` n’applique pas encore — la réparation *restaure*, `modify` *améliore* — la réparation en tant qu’amélioration est donc marquée dans le code et **reportée à v3.2/v3.3** en tant que mécanique délibérée, et non un champ inerte silencieux. Et `obligation-exists` est livré avec une démonstration créée (Frère Aldric) ; la condition est active pour que les créateurs de contenu puissent limiter davantage les dialogues.
- La documentation est complète, mais toutes les pages du manuel ne reflètent pas les dernières API.

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

**Arc de la dernière version (v2.4.0–v3.0.0) :**
- v2.4.0 — Combat de groupe (ciblage des alliés / soin / amélioration / réanimation, ami-ennemi AoE), système d’effets de statut (modificateurs + DoT/HoT + déclencheurs réactifs), phase 1 des profils plug-in, contenu `validate`/`scaffold` CLI.
- v2.5.0 — Résolution des règles par entité (combat avec styles de jeu mixtes), le chargeur `applyProfile` + capacités par entité, modèles de profil + `profile` CLI et un passage de santé complet.
- v2.6.0 — La commande `run` est devenue un véritable jeu : les ennemis agissent en fonction de leurs propres profils d’IA, victoire/défaite, sauvegarde/reprise, capacités et XP dans le menu, le conteneur de studio `ai` et la pile de narration.
- v2.7.0 — Le monde réagit et il y a une raison de revenir : chaleur → pressions → conséquences narrées, rencontres à l’entrée de la zone, boucle de quête + journal, équipement au combat, exécutions rejouables avec des graines, entrées de fin de partie en direct, `buildWorldStack`, le registre du directeur et une couture de migration de sauvegarde.
- v2.8.0 — Agissez sur le monde dans lequel vous vivez : une économie commerciale en direct + `sell` verbes, des compagnons que vous recrutez et avec lesquels vous vous battez, et un registre du directeur qui lit l’ensemble du tableau — un fil d’écriture par système éclairé ~12 consommateurs qui ont été lancés en mode sombre.
- v2.9.0 — Fermez les boucles : `buy` + stock du marchand et l’artisanat complètent l’économie ; les compagnons effectuent des tours indépendants ; quatre verbes sociaux (corruption / intimidation / requête / amorce) s’exécutent sur une économie de levier financée par des récompenses d’opportunité ; les opportunités se résolvent avec une expiration + une conséquence de perte de faveur ; et l’équipement, les quêtes, les recrues et la monnaie de départ sont distribués uniformément à tous les dix éléments de départ.
- **v3.0.0 — Donnez vie au monde : le producteur d’agence PNJ allume les PNJ nommés (objectifs / relations / registres d’obligations / chaînes de conséquences) plus un PNJ d’histoire dans chaque élément de départ ; la surface sociale passe à 25 verbes (diplomatie + sabotage) avec un revenu de levier passif et un dialogue qui lit l’état social ; stock et recettes de genre par élément de départ ; les fins de levier (victoire / maître marionnettiste / retraite tranquille) deviennent accessibles ; lignes de menu de réparation/modification, opportunités d’escorte et une CLI de développement `audit-content` — livrées via un audit de la phase 9 qui a détecté deux fils morts que la suite de tests verte a cachés.**

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
