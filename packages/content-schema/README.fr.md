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

# @ai-rpg-engine/content-schema

Schémas de contenu et validateurs pour le moteur de jeu de rôle IA — définissez les pièces, les entités, les dialogues, les objets et les quêtes sous forme de données.

## Installation

```bash
npm install @ai-rpg-engine/content-schema
```

## Contenu

- **Schémas des pièces** — zones définies par des sorties, des propriétés et un état environnemental.
- **Schémas des entités** — définitions des personnages non joueurs (PNJ), des créatures et des personnages jouables.
- **Schémas des dialogues** — arbres de dialogue basés sur des graphes, avec des conditions et des effets.
- **Schémas des objets** — équipements, consommables, objets de quête, avec des modificateurs de statistiques.
- **Chargeur de paquets de contenu** — validation et chargement des paquets de contenu JSON/TypeScript.
- **Schémas des compétences** — définitions des compétences, des états, et validation des paquets avec des avertissements concernant l'équilibre du jeu.
- **Validateurs de schémas** — validation en temps réel avec des messages d'erreur structurés.

## Utilisation

```typescript
import { validateContentPack, RoomSchema, EntitySchema } from '@ai-rpg-engine/content-schema';

const result = validateContentPack(myContentData);
if (!result.valid) {
  console.error(result.errors);
}
```

## Documentation

- [Fichiers de contenu (Chapitre 13)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/13-content-files/) — création de paquets de contenu.
- [Manuel](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

Créé par <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
