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

# @ai-rpg-engine/starter-vampire

**Crimson Court** — Un manoir aristocratique en ruine, théâtre d'un bal masqué. Trois familles de vampires rivalisent pour la domination, tandis que la soif menace de vous consumer.

Fait partie du catalogue de kits de démarrage [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Thème

Horreur gothique + intrigues politiques au sein de la cour des vampires. La soif augmente à chaque instant ; si elle atteint 100, le joueur perd le contrôle. Se nourrir réduit la soif, mais coûte en humanité. Les vampires perçoivent les humains comme des "récipients de chaleur".

## Démarrage rapide

```typescript
import { createGame } from '@ai-rpg-engine/starter-vampire';

const engine = createGame();
engine.start();
```

## Contenu

- **5 zones :** Grande salle de bal, Galerie Est, Cave à vin, Jardin éclairé par la lune, Tour du clocher.
- **3 PNJ :** Duchesse Morvaine (vampire âgée), Cassius (jeune vampire rival), Servante Elara (humaine).
- **2 ennemis :** Chasseur de sorcières, Esclave sauvage.
- **1 arbre de dialogue :** Audience avec la duchesse sur les intrigues politiques et le contrôle de la soif.
- **1 arbre de progression :** Maîtrise du sang (Volonté de fer → Enchanteur → Prédateur ultime).
- **1 objet :** Flacon de sang (réduit la soif de 15).

## Mécanismes uniques

| Verbe | Description |
|------|-------------|
| `enthrall` | Domination sociale surnaturelle grâce à la présence. |
| `feed` | Boire le sang pour réduire la soif, au prix de l'humanité. |

## Statistiques et ressources

| Statut | Rôle |
|------|------|
| Présence | Domination sociale, autorité surnaturelle. |
| Vitalité | Force physique, efficacité de l'alimentation. |
| Ruse | Duperie, perception, intrigues de cour. |

| Ressource | Portée | Notes |
|----------|-------|-------|
| HP | 0–30 | Santé standard |
| Soif | 0–100 | Pression inverse — augmente à chaque instant, perte de contrôle à 100. |
| Humanité | 0–30 | Ancre morale — en dessous de 10, certaines options de dialogue sont verrouillées. |

## Licence

MIT
