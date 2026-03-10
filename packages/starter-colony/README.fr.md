<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.md">English</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

# @ai-rpg-engine/starter-colony

**Perte de signal** — Une colonie lointaine perd le contact avec la Terre. Quelque chose vit dans les cavernes situées en dessous.

Fait partie du catalogue de kits de démarrage [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Thème

Gestion d'une colonie de science-fiction + contact avec des extraterrestres. L'énergie est une ressource partagée par la colonie ; lorsqu'elle diminue, les systèmes tombent en panne en cascade. La présence extraterrestre perçoit les colons comme des "schémas de résonance perturbateurs".

## Démarrage rapide

```typescript
import { createGame } from '@ai-rpg-engine/starter-colony';

const engine = createGame();
engine.start();
```

## Contenu

- **5 zones :** Module de commandement, Baie hydroponique, Clôture périmétrique, Tour de signalisation, Caverne extraterrestre
- **2 PNJ :** Dr. Vasquez (scientifique), Chef Okafor (sécurité)
- **2 ennemis :** Drone compromis, Entité de résonance
- **1 arbre de dialogue :** Dr. Vasquez expose la situation concernant le signal extraterrestre et la politique de la colonie
- **1 arbre de progression :** Voie du commandant (Ingénieur de terrain → Capteurs affûtés → Inébranlable)
- **1 objet :** Cellule d'urgence (restaure 20 d'énergie)

## Mécanismes uniques

| Verbe | Description |
|------|-------------|
| `scan` | Analyse par capteurs en utilisant la perception |
| `allocate` | Redistribuer l'énergie entre les systèmes de la colonie |

## Statistiques et ressources

| Statut | Rôle |
|------|------|
| ingénierie | Réparer et construire des systèmes |
| commandement | Leadership et moral de l'équipage |
| perception | Capteurs et perception |

| Ressource | Portée | Notes |
|----------|-------|-------|
| HP | 0–25 | Santé standard |
| Énergie | 0–100 | Ressource partagée par la colonie, se régénère à 2 par cycle |
| Moral | 0–30 | Cohésion de l'équipage |

## Licence

MIT
