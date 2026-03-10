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

# @ai-rpg-engine/starter-fantasy

**O Limiar da Capela** — um mundo de fantasia sombria para o AI RPG Engine.

## Instalação

```bash
npm install @ai-rpg-engine/starter-fantasy
```

## O que você aprenderá

Este projeto de exemplo demonstra toda a estrutura do motor em um mundo compacto:

| Características | O que a Capela demonstra |
|---|---|
| **Rulesets** | `fantasyMinimalRuleset` — atributos (vigor/instinto/vontade), recursos (pontos de vida/energia), verbos, fórmulas |
| **Zones & traversal** | 5 zonas em 2 ambientes, com adjacências, níveis de luz, elementos interativos e perigos. |
| **Districts** | Terreno da Capela (sagrado) versus Profundezas da Cripta (amaldiçoado, controlado por facção). |
| **Dialogue** | Diálogo ramificado com um peregrino, com 3 caminhos e efeitos de "flag" global. |
| **Combat** | Ghoul de Cinzas com perfil de IA agressivo, tags de "medo" e objetivo de "guardião". |
| **Cognition & perception** | Decaimento da memória, filtro de percepção, regra de apresentação de mortos-vivos. |
| **Progression** | Árvore de "Domínio de Combate" com 3 níveis, com recompensas de experiência ao derrotar entidades. |
| **Environment** | Perigo de "chão instável" que drena energia ao entrar na zona. |
| **Factions** | Facção de mortos-vivos da Capela com configuração de coesão. |
| **Belief provenance** | Propagação de rumores com atraso, rastreamento de crenças. |
| **Inventory** | Poção de cura com efeito de uso programado que restaura 8 pontos de vida. |
| **Simulation inspector** | Inspeção completa para análise de repetição. |

## O que está incluído

- **5 zonas** — Entrada da Capela em Ruínas, Nave, Recanto Sombrio, Passagem da Sacristia, Antessala da Cripta.
- **1 NPC** — Peregrino Suspeito (diálogo ramificado, 3 caminhos de conversa).
- **1 inimigo** — Ghoul de Cinzas (IA agressiva, medo de fogo e de coisas sagradas).
- **1 item** — Poção de Cura (efeito de uso programado que restaura 8 pontos de vida).
- **1 árvore de progressão** — Domínio de Combate (Endurecido → Olhar Aguçado → Fúria de Batalha).
- **1 regra de apresentação** — Mortos-vivos percebem todos os seres vivos como ameaças.
- **15 módulos conectados** — travessia, status, combate, inventário, diálogo, cognição, percepção, progressão, ambiente, facções, rumores, distritos, crença, apresentação do observador, inspetor.

## Uso

```typescript
import { createGame } from '@ai-rpg-engine/starter-fantasy';

// One line — all 15 modules, content, and ruleset pre-wired
const engine = createGame(42);

// Or import pieces individually:
import { manifest, zones, pilgrimDialogue, fantasyMinimalRuleset } from '@ai-rpg-engine/starter-fantasy';
```

## Documentação

- [O Limiar da Capela (Cap. 20)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/20-chapel-threshold/)
- [Manual](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

Criado por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
