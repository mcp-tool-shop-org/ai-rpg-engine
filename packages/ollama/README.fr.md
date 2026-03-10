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

# @ai-rpg-engine/ollama

Studio de conception IA pour le moteur de jeu de rôle IA — structure de base, critiques, flux de travail guidés, réglages, expériences et expérience utilisateur du studio.

Se connecte à une instance locale de [Ollama](https://ollama.ai). Ne modifie jamais directement la réalité de la simulation ; toute la sortie est envoyée vers la sortie standard par défaut.

## Installation

```bash
npm install @ai-rpg-engine/ollama
```

## Contenu

- **Structure de base du contenu** — génère des salles, des factions, des quêtes, des districts, des ensembles de lieux, des ensembles d'événements à partir d'un thème.
- **Critique et correction** — valide le contenu généré par rapport aux schémas du moteur, corrige automatiquement les erreurs.
- **Interface de conversation** — session de conception interactive avec routage contextuel, orchestration d'outils et mémoire.
- **Constructions guidées** — flux de travail de construction de monde multi-étapes, adaptés à la session et basés sur une planification préalable.
- **Analyse de la simulation** — analyse des simulations avec identification structurée des problèmes d'équilibre.
- **Réglages guidés** — plans de réglages structurés basés sur les problèmes d'équilibre, avec exécution étape par étape.
- **Expériences de scénarios** — exécutions de simulations en lot, détection de la variance, exploration des paramètres, comparaison avant/après.
- **Expérience utilisateur du studio** — tableaux de bord, navigation des problèmes, inspection des expériences, historique des sessions, découverte des commandes, intégration.

## Utilisation

```typescript
import { translateMarkdown, ChatEngine, createSession } from '@ai-rpg-engine/ollama';

// Start a design session
const session = createSession('haunted-chapel');

// Use the chat engine
const engine = new ChatEngine({ session });
const response = await engine.chat('scaffold a haunted chapel district');
```

## Documentation

- [Guide de construction de mondes IA](AI_WORLDBUILDING.md) — documentation complète du flux de travail.
- [Manuel](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

Créé par <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>.
