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

# @ai-rpg-engine/terminal-ui

Module de rendu et de saisie pour le moteur de jeu de rôle IA — transforme les flux d'événements en affichage lisible dans le terminal.

## Installation

```bash
npm install @ai-rpg-engine/terminal-ui
```

## Contenu

- **Rendu des événements** — convertit les événements du moteur en texte formaté pour le terminal.
- **Analyseur de commandes** — interprète les commandes du joueur en actions pour le moteur.
- **Thèmes de couleurs** — palettes de couleurs ANSI pour différents genres de jeux.
- **Outils de mise en page** — barres d'état, descriptions de pièces, listes d'entités.

## Utilisation

```typescript
import { TerminalRenderer, InputParser } from '@ai-rpg-engine/terminal-ui';

const renderer = new TerminalRenderer();
const parser = new InputParser();

// Render engine events
for (const event of events) {
  renderer.render(event);
}

// Parse player input into actions
const action = parser.parse('attack guard');
```

## Documentation

- [Manuel](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

Créé par <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
