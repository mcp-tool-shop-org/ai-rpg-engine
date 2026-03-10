<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.md">English</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

# @ai-rpg-engine/starter-weird-west

**L'accord du Diable de Poussière** — Une ville frontalière cache un culte qui invoque quelque chose depuis le plateau rouge.

Fait partie du catalogue de kits de démarrage [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Thème

Western + surnaturel. Tireurs, esprits de poussière et un culte du plateau. La ressource "Poussière" s'accumule avec le temps ; lorsqu'elle atteint 100, le personnage est emporté par le désert.

## Démarrage rapide

```typescript
import { createGame } from '@ai-rpg-engine/starter-weird-west';

const engine = createGame();
engine.start();
```

## Contenu

- **5 zones :** Carrefour du Vagabond, Saloon, Bureau du Shérif, Sentier du Plateau Rouge, Clairière des Esprits
- **2 PNJ :** Bartender Silas, Shérif Hale
- **2 ennemis :** Revenant de Poussière, Araignée du Plateau
- **1 arbre de dialogue :** Informations du barman sur le culte du plateau
- **1 arbre de progression :** Voie du Tireur (Main Rapide → Volonté de Fer → Œil de Faucon)
- **1 objet :** Bouquet de Sauge (réduit la Poussière de 20)

## Mécanismes Uniques

| Verbe | Description |
|------|-------------|
| `draw` | Duel de rapidité — concours de réflexes |
| `commune` | Parler aux esprits en utilisant les connaissances. |

## Statistiques et Ressources

| Statut | Rôle |
|------|------|
| résilience | Robustesse et volonté |
| vitesse de tir | Réflexes et temps de réaction |
| connaissances | Connaissances surnaturelles |

| Ressource | Portée | Notes |
|----------|-------|-------|
| HP | 0–30 | Santé standard |
| Volonté | 0–20 | Force mentale, régénère 1 par tick |
| Poussière | 0–100 | **Pression inverse** — s'accumule, 100 = mort |

## Licence

MIT
