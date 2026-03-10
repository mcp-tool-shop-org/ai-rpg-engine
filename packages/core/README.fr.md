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

# @ai-rpg-engine/core

La base du moteur de jeu de rôle IA : état du monde, entités, actions, événements, règles, générateur de nombres aléatoires initialisé et persistance.

## Installation

```bash
npm install @ai-rpg-engine/core
```

## Contenu

- **Moteur** — boucle de simulation basée sur des cycles avec relecture déterministe.
- **État du monde** — pièces, entités, drapeaux globaux, compteur de cycles.
- **État de l'entité** — ressources, inventaire, effets de statut, croyances, souvenirs.
- **Pipeline d'actions** — validation → prétraitement → résolution → post-traitement → validation.
- **Bus d'événements** — événements structurés avec type, source, cibles, charge utile.
- **Générateur de nombres aléatoires initialisé** — aléatoire reproductible à partir d'une seule valeur initiale.
- **Système de modules** — enregistrement/composition de modules de simulation.
- **Environnement de test** — outils pour les tests de modules déterministes.

## Démarrage rapide

```typescript
import { Engine } from '@ai-rpg-engine/core';

const engine = new Engine({
  manifest: {
    id: 'my-game', title: 'My Game',
    version: '1.0.0', engineVersion: '1.0.0',
    ruleset: 'fantasy', modules: [],
    contentPacks: [],
  },
  seed: 42,
  modules: [],
});

const state = engine.getState();
```

## Documentation

- [Manuel](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/) — 25 chapitres + 4 annexes.
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

Créé par <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>.
