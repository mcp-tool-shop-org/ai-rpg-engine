<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.md">English</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/ai-rpg-engine/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

# @ai-rpg-engine/starter-merchant

> **Exemple de composition** — Ce module de démarrage illustre comment créer un jeu dont la boucle principale est basée sur l’obligation plutôt que sur le combat. Il s’agit d’un exemple à partir duquel il faut tirer des enseignements, et non d’un modèle à copier. Consultez le [Guide de composition](../../docs/handbook/57-composition-guide.md) pour créer votre propre jeu.

**Registre de la route du sel** — Vous êtes un agent d’une petite maison de commerce. Vous n’êtes pas propriétaire des marchandises que vous transportez ; vous les devez. Chaque pièce que l’on vous doit est un couteau que quelqu’un d’autre tient.

Fait partie du catalogue de modules de démarrage de [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Thème

Pression commerciale, d’abord subtile, puis destructrice. Rien sur la route du sel n’est rare : la contrainte réside dans ce que vous avez promis. `liquidity` est ce que vous pouvez déployer sans contracter de dette ; `lien` s’accumule lorsque vous ne le pouvez pas, et à 70, la Guilde d’essai saisit un actif en consignation. À 90, elle prend votre sceau.

Le combat existe et est délibérément une **mauvaise affaire**. Les points de vie sont limités à 24, le plafond le plus bas du catalogue, et le profil des ressources de combat présente un tableau `gains` vide : aucune ligne n’encourage la violence. L’attaque réduit les liquidités, subir des dégâts les diminue davantage, et gagner en coûte encore 5, car vous venez d’endommager la propriété de quelqu’un.

## Démarrage rapide

```typescript
import { createGame } from '@ai-rpg-engine/starter-merchant';

const engine = createGame(71);

// Register with the Assay Guild — the seal is what makes consignment possible
engine.submitAction('speak', { targetIds: ['assay-master-corvane'] });
engine.submitAction('choose', { parameters: { choiceId: 'register' } });

// Read the goods, contest the terms, then hand them over
engine.submitAction('appraise', { parameters: { itemId: 'bale-of-flax' } });
engine.submitAction('move', { targetIds: ['long-quay'] });
engine.submitAction('move', { targetIds: ['crooked-stair'] });
engine.submitAction('haggle', { targetIds: ['broker-inaya'] });
engine.submitAction('consign', { parameters: { itemId: 'bale-of-flax' }, targetIds: ['broker-inaya'] });

// Reconcile your own books
engine.submitAction('audit');
```

## Modèles illustrés

- **Une boucle principale non basée sur le combat** — cinq verbes commerciaux font avancer le jeu ; le système de combat est intégré, mais son coût est considéré comme une pénalité.
- **Un profil de ressources inversé** — `CombatResourceProfile` sans `gains`, ce qui incite l’IA à pousser un agent aux faibles liquidités vers la désengagement.
- **Un module local au pack** — `contract-core` se trouve dans le module de démarrage plutôt que dans `@ai-rpg-engine/modules`, car il n’a qu’un seul utilisateur. Il sera promu lors du deuxième cycle.
- **Des opérations injectées au lieu de nouvelles dépendances** — les mécanismes d’état et l’évaluateur de reconnaissance sont transmis, en utilisant la même approche que `createEquipmentCore`.
- **Des instruments qui régulent les mécaniques, pas les statistiques** — le sceau de la Guilde accorde `consign` et le livre du registre accorde `audit` ; par conséquent, une saisie supprime un verbe.
- **Un district non contrôlé en tant que mécanique** — les Warrens n’ont aucune faction dirigeante, ce qui en fait le seul endroit où il n’y a ni cautionnement ni recours possible.

## Mécaniques uniques

| Verbe | Ce qu’il fait |
|------|--------------|
| `appraise` | Évalue la valeur réelle, la rareté et l’origine par rapport au prix demandé. Un meilleur `ledger` réduit la fourchette. |
| `haggle` | Conteste un prix. Cela coûte des liquidités ; la marge gagnée est enregistrée pour ce contrepartie et consommée lors de votre prochaine interaction `consign` avec lui. |
| `consign` | Remet des marchandises en échange d’un paiement futur, créant ainsi une obligation avec une date d’échéance. Les marchandises quittent immédiatement votre inventaire ; cet écart représente tout le risque. |
| `underwrite` | Prend en charge les risques d’une autre partie moyennant des frais. Liquidités immédiates ; si la partie que vous avez garantie fait défaut, la réclamation est déclenchée et le privilège s’applique. |
| `audit` | Rapproche vos comptes et signale les écarts. Nécessite le livre du registre : vous ne pouvez pas effectuer d’audit de mémoire. |

**Le chronomètre des obligations** fonctionne en fonction des déplacements plutôt que d’un minuteur. Les consignations non respectées entraînent l’application d’un privilège à `overdueTicks × value ÷ 10`. La saisie au niveau du privilège 70 prend l’obligation dont l’ID de l’article est le plus bas — déterministe, jamais aléatoire.

## Contenu

- **8 zones** réparties dans 4 districts : Saltgate (le marché légal), Dockward (droits et délais), les Warrens (paiement immédiat) et la High Counting House.
- **4 PNJ** — Maître d’essai Corvane, Capitaine de port Drell, Courtier Inaya, Trésorier Null.
- **3 ennemis + 1 boss** — Le compte permanent n’est pas une créature, mais un règlement, avec des phases liées à la quantité d’équipement que vous transportez.
- **3 quêtes** — Ouvrez les livres, La caravane en retard, Le compte permanent.
- **14 objets** répartis entre des biens de commerce fongibles et cinq instruments uniques.

## Statistiques et ressources

| Statistique | Rôle |
|------|------|
| `ledger` | Arithmétique, mémoire, détection de fraude |
| `tongue` | Négociation et tromperie |
| `standing` | Qui témoigne en votre faveur |

| Ressource | Comportement |
|----------|-----------|
| `hp` | 24 maximum — le plus bas du catalogue |
| `stamina` | Économie d’action standard |
| `coin` | Ce que vous possédez |
| `liquidity` | Ce que vous pouvez déployer sans contracter de dette |
| `lien` | **Inverse** — commence vide et se remplit jusqu’à la saisie |

Les cartes de combat `attack → tongue`, `precision → ledger`, `resolve → standing` : un agent qui finit par se battre le fait en intimidant et en faisant pression, jamais en dominant physiquement quelqu’un.

## Jeu sur registre (facultatif)

Il s’agit du pack de référence pour `@ai-rpg-engine/ledger-adapter`. Il ne comporte aucune dépendance à celui-ci — un test affirme qu’il n’en aura jamais — mais ses mécanismes sont ceux pour lesquels l’adaptateur a été conçu : `consign` est une primitive de règlement déguisée en élément d’intrigue, `audit` est le vérificateur externe sous forme de verbe jouable, et la saisie d’un privilège est le mécanisme de compensation nommé qui se manifeste dans la fiction. Voir [Chapitre 60](../../docs/handbook/60-xrpl-ledger-adapter.md) et [Chapitre 61](../../docs/handbook/61-xrpl-nft-gear.md).

## Ce qu’il faut emprunter

Le cycle de vie des obligations, si votre jeu comporte des dettes. Le modèle d’opérations injectées, si votre pack a besoin d’un système sans dépendance. Et l’audit anti-inertie dans `anti-inert.test.ts` : il retrace chaque mécanique principale au cours d’une session de jeu réelle et a révélé six éléments qui étaient intégrés, valides sur le plan du schéma, validés par des tests unitaires et inactifs.

## Licence

MIT
