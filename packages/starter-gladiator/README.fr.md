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

# @ai-rpg-engine/starter-gladiator

**Exemple de conception** — Cet exemple illustre comment câbler le moteur pour les combats en arène. Il s'agit d'un exemple à étudier, et non d'un modèle à copier. Consultez le [Guide de conception](../../docs/handbook/57-composition-guide.md) pour créer votre propre jeu.

**Iron Colosseum** — Une arène de gladiateurs souterraine située sous un empire en déclin. Combattez pour la liberté, gagnez le soutien de mécènes et survivez au jugement de la foule.

Fait partie du catalogue de kits de démarrage [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Thème

Combats d'arène romains + politique de mécénat. L'approbation de la foule fluctue énormément en fonction du spectacle. Une forte approbation débloque des cadeaux des mécènes, une faible approbation signifie une sentence de mort. Les mécènes voient les gladiateurs comme des "investissements dans le sang et le spectacle".

## Démarrage rapide

```typescript
import { createGame } from '@ai-rpg-engine/starter-gladiator';

const engine = createGame();
engine.start();
```

## Exemples de réalisations

| Fonctionnalité | Ce que "Gladiator" propose |
|---------|----------------------|
| **Resources** | Une ressource méta volatile (l'approbation du public) motivée par le spectacle, et non par l'efficacité. |
| **Combat** | Une conception de boss en trois phases avec des changements dynamiques au cours du combat. |
| **Custom verbs** | Des actions de combat non offensives, comme les provocations et les démonstrations, qui affectent les ressources. |
| **Social** | Un système de patronage conditionné par les seuils d'approbation du public. |

## Contenu

- **5 zones :** Cellules de détention, Arène, Galerie des mécènes, Armurerie, Sortie du tunnel
- **3 PNJ :** Lanista Brutus (maître d'arène), Domina Valeria (mécène), Nerva (allié vétéran)
- **2 ennemis :** Champion de l'arène, Bête de guerre
- **1 arbre de dialogue :** Audience des mécènes sur le parrainage et la politique de l'arène
- **1 arbre de progression :** Gloire de l'arène (Faveur de la foule → Endurance de fer → Combattant pour la liberté)
- **1 objet :** Jetons de mécène (augmente la faveur de la foule de 10)

## Mécanismes uniques

| Verbe | Description |
|------|-------------|
| `taunt` | Provoquez les ennemis et émerveillez la foule. |
| `showboat` | Sacrifiez l'efficacité au profit du spectacle et de la faveur. |

## Statistiques et ressources

| Statistique | Rôle |
|------|------|
| Puissance | Puissance brute, coups lourds. |
| Agilité | Vitesse, esquive, précision. |
| Spectaculaire | Manipulation de la foule, combat théâtral. |

| Ressource | Portée | Notes |
|----------|-------|-------|
| HP | 0–40 | Santé standard |
| Fatigue | 0–50 | Pression inverse : augmente au combat, se régénère à -2 par tick. |
| Faveur de la foule | 0–100 | Volatile : >75 débloque des cadeaux des mécènes, <25 signifie la mort. |

## Ce que vous pouvez adapter

L'économie de ressources basée sur la performance (l'approbation du public) et la conception de boss en trois phases. Étudiez comment l'approbation du public agit comme une ressource méta volatile qui dépend du spectacle plutôt que de l'efficacité, et comment le combat contre le champion de l'arène utilise les transitions de phase pour modifier la dynamique du combat au cours de l'affrontement.

## Licence

MIT
