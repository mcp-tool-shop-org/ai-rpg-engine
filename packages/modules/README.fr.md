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

# @ai-rpg-engine/modules

17 modules de simulation composables pour le moteur de jeu de rôle IA — combat, dialogue, cognition, perception, factions, et plus encore.

## Installation

```bash
npm install @ai-rpg-engine/modules
```

## Modules

| Module | Description |
|--------|-------------|
| `combatCore` | Attaque/défense, dégâts, défaite, endurance, garde, désengagement |
| `dialogueCore` | Arbres de dialogue basés sur des graphes, avec conditions |
| `inventoryCore` | Objets, équipement, utilisation/équipement/déséquipement |
| `traversalCore` | Déplacement et validation de sortie des zones |
| `statusCore` | Effets de statut avec durée et cumul |
| `environmentCore` | Propriétés dynamiques des zones, dangers, dégradation |
| `cognitionCore` | Croyances, intentions, moral, mémoire de l'IA |
| `perceptionFilter` | Canaux sensoriels, clarté, audition inter-zones |
| `narrativeAuthority` | Vérité vs présentation, dissimulation, distorsion |
| `progressionCore` | Progression basée sur la monnaie, arbres de compétences |
| `factionCognition` | Croyances des factions, confiance, connaissances inter-factions |
| `rumorPropagation` | Propagation de l'information avec diminution de la confiance |
| `knowledgeDecay` | Érosion de la confiance basée sur le temps |
| `districtCore` | Mémoire spatiale, métriques des zones, seuils d'alerte |
| `beliefProvenance` | Reconstruction de la trace à travers la perception/cognition/rumeur |
| `observerPresentation` | Filtrage des événements par observateur, suivi des divergences |
| `simulationInspector` | Inspection en temps réel, vérifications de santé, diagnostics |
| `combatIntent` | Biais de prise de décision de l'IA, moral, logique de fuite |
| `engagementCore` | Positionnement en première/dernière ligne, interception des gardes du corps |
| `combatRecovery` | Statuts de blessures après le combat, guérison dans les zones sûres |
| `combatReview` | Explication des formules, décomposition des chances de toucher |
| `defeatFallout` | Conséquences pour les factions après le combat, changements de réputation |
| `bossPhaseListener` | Transitions de phase basées sur les seuils de points de vie du boss |

### Création de combats (fonctions pures)

| Exportation | Objectif |
|--------|---------|
| `combat-roles` | 8 modèles de rôles, types de composition d'événements, niveau de danger, définitions de boss |
| `encounter-library` | 5 usines de création d'archétypes d'événements, 3 usines de création de modèles de boss, audit des groupes |
| `combat-summary` | Requête, audit, formatage et inspection du contenu des combats |

## Utilisation

```typescript
import { Engine } from '@ai-rpg-engine/core';
import { combatCore, dialogueCore, cognitionCore, perceptionFilter } from '@ai-rpg-engine/modules';

const engine = new Engine({
  manifest: { /* ... */ },
  seed: 42,
  modules: [combatCore(), dialogueCore(), cognitionCore(), perceptionFilter()],
});
```

## Documentation

- [Modules (Chap. 6)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/06-modules/)
- [Cognition de l'IA (Chap. 8)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/08-ai-cognition/)
- [Perception (Chap. 9)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/09-perception-layers/)
- [Système de combat (Chap. 47)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/47-combat-system/)
- [Manuel](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

Créé par <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
