<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.md">English</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="300" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@ai-rpg-engine/presentation"><img src="https://img.shields.io/npm/v/@ai-rpg-engine/presentation.svg" alt="npm"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
</p>

# @ai-rpg-engine/presentation

Schéma de plan de narration, contrats de rendu et types d'état de présentation pour le [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

Fait partie de **Immersion Runtime** — le pipeline de présentation multimodal qui transforme l'état du jeu en expériences audio-visuelles structurées.

## Installation

```bash
npm install @ai-rpg-engine/presentation
```

## Fonctionnalités

Au lieu de produire du texte brut, le narrateur génère un **NarrationPlan** — une recette structurée décrivant le texte, les effets sonores, les ambiances, les musiques, les effets d'interface utilisateur et les paramètres de synthèse vocale.

Toute interface utilisateur (terminal, web, Electron) implémente l'interface `PresentationRenderer` pour recevoir et exécuter ces plans.

## Types Clés

| Type | Fonction |
|------|---------|
| `NarrationPlan` | Recette de narration structurée (texte + effets sonores + ambiance + musique + interface utilisateur) |
| `SpeakerCue` | Paramètres de synthèse vocale (ID de la voix, émotion, vitesse) |
| `SfxCue` | Déclencheur d'effet sonore (ID de l'effet, timing, intensité) |
| `AmbientCue` | Contrôle de la couche d'ambiance (démarrage, arrêt, fondu) |
| `MusicCue` | Contrôle de la musique de fond (lecture, arrêt, intensification, atténuation) |
| `UiEffect` | Effets visuels sur le terminal/écran (clignotement, tremblement, fondu) |
| `VoiceProfile` | Configuration vocale pour la synthèse vocale |
| `PresentationRenderer` | Contrat de rendu — toute interface utilisateur implémente ceci |

## Utilisation

```typescript
import type { NarrationPlan, PresentationRenderer } from '@ai-rpg-engine/presentation';
import { validateNarrationPlan, isValidNarrationPlan } from '@ai-rpg-engine/presentation';

// Validate a plan from Claude's output
const errors = validateNarrationPlan(planFromClaude);
if (errors.length === 0) {
  // Plan is valid, execute it
}

// Type guard
if (isValidNarrationPlan(data)) {
  console.log(data.sceneText);
}
```

## Fait partie de AI RPG Engine

Ce paquet fait partie du dépôt monorepo [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine). Consultez le fichier README principal pour l'architecture complète.

## Licence

MIT
