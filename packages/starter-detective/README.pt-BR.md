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

# @ai-rpg-engine/starter-detective

**Gaslight Detective** — Um mundo inicial de mistério vitoriano para o AI RPG Engine.

## Instalação

```bash
npm install @ai-rpg-engine/starter-detective
```

## O que você vai aprender

Este mundo inicial demonstra toda a estrutura do motor através de um cenário de investigação:

| Características | O que o "Detective" demonstra |
|---|---|
| **Rulesets** | `detectiveMinimalRuleset` — estatísticas (percepção/eloquência/resiliência), recursos (pontos de vida/compostura), verbos, fórmulas. |
| **Zones & traversal** | 5 zonas em 2 ambientes, com adjacências, níveis de luz, elementos interativos e perigos. |
| **Districts** | Ashford Estate (aristocracia) vs. Dockyards (facção dos estivadores). |
| **Dialogue** | Interrogatório ramificado com a viúva, com coleta de evidências e efeitos de "flag" global. |
| **Combat** | Estivador com perfil de IA agressivo e objetivos territoriais. |
| **Cognition & perception** | Decaimento da memória, filtro de percepção, regra de apresentação da paranoia do suspeito. |
| **Progression** | Árvore de "Deduction Mastery" com 3 níveis, com recompensas de XP ao derrotar entidades. |
| **Environment** | Perigo de beco escuro que drena a compostura ao entrar na zona. |
| **Factions** | Facção dos estivadores com configuração de coesão. |
| **Belief provenance** | Propagação de rumores com atraso, rastreamento da crença. |
| **Inventory** | Amônia (restaura a compostura) com efeito de uso de item programado. |
| **Simulation inspector** | Inspeção completa para análise de repetição. |

## O que está incluído

- **5 zonas** — O Estudo (cena do crime), Salão, Salão dos Empregados, Entrada Frontal, Beco.
- **3 NPCs** — Lady Ashford (viúva/suspeita), Sargento Pike (polícia), Sra. Calloway (empregada/testemunha).
- **1 inimigo** — Estivador (IA agressiva, territorial).
- **1 item** — Amônia (restaura 6 de compostura).
- **1 árvore de progressão** — Dedução (Olhar Aguçado → Língua Prateada → Nervos de Aço).
- **1 regra de apresentação** — Os suspeitos percebem a investigação como uma ameaça.
- **15 módulos conectados** — travessia, status, combate, inventário, diálogo, cognição, percepção, progressão, ambiente, facções, rumores, distritos, crença, apresentação do observador, inspetor.

## Uso

```typescript
import { createGame } from '@ai-rpg-engine/starter-detective';

// One line — all 15 modules, content, and ruleset pre-wired
const engine = createGame(42);

// Or import pieces individually:
import { manifest, detectiveMinimalRuleset, deductionMasteryTree } from '@ai-rpg-engine/starter-detective';
```

## Documentação

- [Manual](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

Criado por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
