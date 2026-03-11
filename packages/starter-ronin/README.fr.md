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

# @ai-rpg-engine/starter-ronin

**Exemple de conception** — Cet exemple illustre comment câbler le moteur pour un jeu de type "mystère féodal". Il s'agit d'un exemple à étudier, et non d'un modèle à copier. Consultez le [Guide de conception](../../docs/handbook/57-composition-guide.md) pour créer votre propre jeu.

**Jade Veil** — Un château féodal pendant un sommet politique tendu. Un seigneur a été empoisonné. Trouvez le coupable avant que l'honneur ne soit perdu.

Fait partie du catalogue de kits de démarrage [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Thème

Mystère féodal + intrigues de cour. L'honneur est fragile : les fausses accusations ont un coût élevé et sont presque impossibles à réparer. Chaque question a son importance, chaque accusation a des conséquences. Les assassins perçoivent le ronin comme "une lame sans maître, imprévisible".

## Démarrage rapide

```typescript
import { createGame } from '@ai-rpg-engine/starter-ronin';

const engine = createGame();
engine.start();
```

## Exemples illustrés

| Fonctionnalité | Ce que Ronin montre |
|---------|------------------|
| **Engagement** | Rôles de protecteur multiples (garde du corps + samouraï), passages secrets. |
| **Resources** | Double système : ki (régénération) vs honneur (fragile, difficile à restaurer). |
| **Social** | Enquête avec conséquences : les fausses accusations coûtent de l'honneur. |
| **Cognition** | Règle de perception de l'assassin ciblant les ronin non affiliés. |

## Contenu

- **5 zones :** Porte du château, Grande salle, Jardin de thé, Chambre du seigneur, Passage secret
- **3 PNJ :** Seigneur Takeda (seigneur empoisonné), Dame Himiko (suspecte), Magistrat Sato (enquêteur)
- **2 ennemis :** Assassin de l'ombre, Samouraï corrompu
- **1 arbre de dialogue :** Briefing du magistrat sur l'empoisonnement et les suspects de la cour
- **1 arbre de progression :** Voie de la lame (Mains stables → Calme intérieur → Fureur juste)
- **1 objet :** Kit d'encens (restaure 5 ki)

## Mécanismes uniques

| Verbe | Description |
|------|-------------|
| `duel` | Défi martial formel utilisant la discipline. |
| `meditate` | Restaure le ki et le calme au prix d'un tour. |

## Statistiques et ressources

| Statut | Rôle |
|------|------|
| discipline | Compétence martiale, technique de la lame, concentration. |
| perception | Conscience, déduction, lecture des intentions. |
| composure | Maîtrise sociale, contrôle émotionnel. |

| Ressource | Portée | Notes |
|----------|-------|-------|
| HP | 0–30 | Santé standard |
| Honneur | 0–30 | Fragile : les fausses accusations coûtent -5, difficile à récupérer. |
| Ki | 0–20 | Énergie spirituelle, régénère 2 par tick. |

## Ce que vous pouvez adapter

Rôles de protecteur multiples (garde du corps + samouraï) et ressources à double couche (ki + honneur). Étudiez comment deux rôles de protecteur avec des conditions de déclenchement différentes créent une défense en plusieurs niveaux, et comment le système ki (régénération) vs honneur (fragile, difficile à restaurer) impose des styles de jeu différents en combat et en enquête.

## Licence

MIT
