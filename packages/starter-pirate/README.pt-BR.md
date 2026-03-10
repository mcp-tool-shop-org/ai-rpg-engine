<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.md">English</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/ai-rpg-engine/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

# @ai-rpg-engine/starter-pirate

**Black Flag Requiem** — Um mundo inicial de piratas para o AI RPG Engine, ambientado em alto mar.

## Instalação

```bash
npm install @ai-rpg-engine/starter-pirate
```

## O que você aprenderá

Este mundo inicial demonstra toda a estrutura do motor através de uma aventura de piratas:

| Características | O que o "Pirata" demonstra: |
|---|---|
| **Rulesets** | `pirateMinimalRuleset` — estatísticas (força/astúcia/habilidade marítima), recursos (pontos de vida/moral), verbos, fórmulas. |
| **Zones & traversal** | 5 zonas em 3 áreas, com adjacências, níveis de luz, elementos interativos e perigos. |
| **Districts** | Port Haven (facção da marinha colonial) vs. Cursed Waters (mar perigoso). |
| **Dialogue** | Diálogo ramificado com o cartógrafo, com ganchos de missão e efeitos de "global-flag". |
| **Combat** | Marinheiro da marinha (agressivo) e Guardião Afogado (criatura marinha amaldiçoada). |
| **Cognition & perception** | Decaimento da memória, filtro de percepção, regra de apresentação do guardião amaldiçoado. |
| **Progression** | Árvore de "Habilidade Marítima" com 3 níveis, com recompensas de experiência ao derrotar entidades. |
| **Environment** | Ondas que drenam a moral, pressão da água que causa dano. |
| **Factions** | Facção da Marinha Colonial com governador e marinheiros. |
| **Belief provenance** | Propagação de rumores com atraso, rastreamento da crença. |
| **Inventory** | Barril de rum com efeito de uso de item programado que restaura a moral. |
| **Simulation inspector** | Inspeção completa para análise de repetição. |

## O que está incluído

- **5 zonas** — Convés do Navio, O Âncora Enferrujada (taberna), Fortaleza do Governador, Águas Abertas, Santuário Submerso.
- **3 NPCs** — Coveiro Bly (tripulação), Mara, a Cartógrafa (neutra), Governador Vane (autoridade colonial).
- **2 inimigos** — Marinheiro da Marinha (agressivo), Guardião Afogado (criatura marinha amaldiçoada).
- **1 item** — Barril de Rum (restaura 8 de moral).
- **1 árvore de progressão** — Habilidade Marítima (Endurecido pelo Mar → Implacável → Capitão Temido).
- **1 regra de apresentação** — Criaturas amaldiçoadas percebem todos os visitantes como invasores.
- **15 módulos conectados** — travessia, status, combate, inventário, diálogo, cognição, percepção, progressão, ambiente, facções, rumores, distritos, crença, apresentação do observador, inspetor.

## Uso

```typescript
import { createGame } from '@ai-rpg-engine/starter-pirate';

// One line — all 15 modules, content, and ruleset pre-wired
const engine = createGame(42);

// Or import pieces individually:
import { manifest, pirateMinimalRuleset, seamanshipTree } from '@ai-rpg-engine/starter-pirate';
```

## Documentação

- [Manual](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

Criado por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
