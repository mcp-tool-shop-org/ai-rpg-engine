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

# @ai-rpg-engine/starter-cyberpunk

**Neon Lockbox** — un monde de démarrage cyberpunk pour le moteur de jeu de rôle IA.

## Installation

```bash
npm install @ai-rpg-engine/starter-cyberpunk
```

## Ce que vous apprendrez

Ce modèle de démarrage illustre la flexibilité du genre : la même pile logicielle avec un modèle de statistiques complètement différent.

| Fonctionnalités | Ce que propose le Lockbox |
|---|---|
| **Rulesets** | `cyberpunkMinimalRuleset` — statistiques (chrome/réflexes/piratage), ressources (points de vie/pare-feu/bande passante), 8 actions, dont `pirater` et `se connecter`. |
| **Zones & traversal** | 3 zones (rue → salle serveur → coffre-fort) avec éclairage, dangers et éléments interactifs. |
| **Districts** | Quartier de rue illuminé (public) contre complexe de coffre-fort (sécurisé, contrôlé par une faction). |
| **Dialogue** | Briefing d'un intermédiaire avec 3 branches et effets globaux. |
| **Combat** | Sentinelle ICE avec une IA agressive, objectif : protéger le coffre-fort. |
| **Cognition & perception** | Décroissance et instabilité plus élevées, perception basée sur les "réflexes" avec la statistique de "sens du piratage". |
| **Progression** | Arbre de compétences de piratage en 3 niveaux (Sniffer de paquets → Renforcement du pare-feu → Amplification neuronale). |
| **Environment** | Danger de câbles dénudés infligeant 2 points de dégâts. |
| **Factions** | Faction du pare-feu du coffre-fort avec une cohésion de 0,95. |
| **Belief provenance** | Propagation plus rapide des rumeurs (délai=1) avec une distorsion de 3% par étape. |
| **Inventory** | Programme de brise-pare-feu — réduit le pare-feu cible de 8. |
| **Presentation rules** | Les agents ICE signalent toutes les entités non-ICE comme une intrusion. |

### Fantasy vs Cyberpunk — même moteur, règles différentes

| | Chapel Threshold | Neon Lockbox |
|---|---|---|
| Statistiques | vitalité / instinct / volonté | chrome / réflexes / piratage |
| Ressources | points de vie, endurance | points de vie, pare-feu, bande passante |
| Actions uniques | — | pirater, se connecter |
| Perception | par défaut | basée sur les réflexes + sens du piratage |
| Décroissance cognitive | 0,02 (base) | 0,03 (base), 0,8 (instabilité) |
| Propagation des rumeurs | délai=2, sans distorsion | délai=1, 3% de distorsion |

## Ce qu'il contient

- **3 zones** — Rue au niveau du sol, Salle serveur abandonnée, Coffre-fort de données.
- **1 PNJ** — Kira l'intermédiaire (dialogue de briefing, 3 voies de conversation).
- **1 ennemi** — Sentinelle ICE (IA agressive, objectif : protéger le coffre-fort).
- **1 objet** — Programme de brise-pare-feu (réduit la ressource pare-feu cible).
- **1 arbre de progression** — Compétences de piratage (Sniffer de paquets → Renforcement du pare-feu → Amplification neuronale).
- **1 règle de présentation** — Les agents ICE signalent toutes les entités non-ICE comme une intrusion.
- **15 modules câblés** — La même pile complète que Chapel Threshold, mais avec une configuration différente.

## Utilisation

```typescript
import { createGame } from '@ai-rpg-engine/starter-cyberpunk';

// One line — all 15 modules, content, and ruleset pre-wired
const engine = createGame(77);

// Or import pieces individually:
import { manifest, zones, fixerDialogue, cyberpunkMinimalRuleset } from '@ai-rpg-engine/starter-cyberpunk';
```

## Documentation

- [Neon Lockbox (Chap. 21)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/21-neon-lockbox/)
- [Manuel](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

Créé par <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
