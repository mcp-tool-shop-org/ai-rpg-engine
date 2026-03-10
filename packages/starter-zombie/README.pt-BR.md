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

# @ai-rpg-engine/starter-zombie

**Ashfall Dead** — um mundo inicial de sobrevivência contra zumbis para o AI RPG Engine.

## Instalação

```bash
npm install @ai-rpg-engine/starter-zombie
```

## O que você vai aprender

Este modelo demonstra toda a estrutura do motor através de um cenário de sobrevivência:

| Características | O que o zumbi demonstra |
|---|---|
| **Rulesets** | `zombieMinimalRuleset` — estatísticas (condição física/inteligência/nervos), recursos (pontos de vida/resistência/infecção), verbos, fórmulas. |
| **Zones & traversal** | 5 zonas em 3 ambientes, com adjacências, níveis de iluminação, elementos interativos e perigos. |
| **Districts** | O Refúgio (facção dos sobreviventes) vs. Zona Morta (hostil, mortos-vivos). |
| **Dialogue** | Diálogo ramificado com um médico, com uma missão secundária para buscar suprimentos no hospital. |
| **Combat** | Zumbis lentos e resistentes (Shambler) e zumbis rápidos e frágeis (Runner), com inteligência artificial agressiva. |
| **Cognition & perception** | Decaimento da memória, filtro de percepção, regra de apresentação da fome dos zumbis. |
| **Progression** | Árvore de sobrevivência com 3 níveis, com recompensas de experiência ao derrotar entidades. |
| **Environment** | Mortos-vivos que se movem, drenando a resistência, zonas de risco de infecção que aumentam a infecção. |
| **Factions** | Facção dos sobreviventes, com um médico, um saqueador e um líder militar. |
| **Belief provenance** | Propagação de rumores com atraso, rastreamento da crença. |
| **Inventory** | Antibióticos com efeito de uso programado que reduzem a infecção. |
| **Simulation inspector** | Inspeção completa para análise de repetições. |

## O que está incluído

- **5 zonas** — Hall do Refúgio, Posto de Gasolina Abandonado, Rua Invadida, Ala Leste do Hospital, Terraço do Hospital.
- **3 NPCs** — Dra. Chen (médica), Rook (saqueador), Sargento Marsh (líder militar).
- **2 inimigos** — Shambler (morto-vivo lento e resistente), Runner (morto-vivo rápido e frágil).
- **1 item** — Antibióticos (reduz a infecção em 25).
- **1 árvore de progressão** — Sobrevivência (Scrapper → Cool-Headed → Last One Standing).
- **1 regra de apresentação** — zumbis percebem todos os seres vivos como presas.
- **15 módulos conectados** — movimentação, status, combate, inventário, diálogo, cognição, percepção, progressão, ambiente, facções, rumores, distritos, crença, apresentação do observador, inspetor.

## Uso

```typescript
import { createGame } from '@ai-rpg-engine/starter-zombie';

// One line — all 15 modules, content, and ruleset pre-wired
const engine = createGame(42);

// Or import pieces individually:
import { manifest, zombieMinimalRuleset, survivalTree } from '@ai-rpg-engine/starter-zombie';
```

## Documentação

- [Manual](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

Criado por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
