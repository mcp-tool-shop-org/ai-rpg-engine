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

# @ai-rpg-engine/starter-cyberpunk

**Neon Lockbox** — um mundo inicial cyberpunk para o AI RPG Engine.

## Instalação

```bash
npm install @ai-rpg-engine/starter-cyberpunk
```

## O que você vai aprender

Este exemplo demonstra a flexibilidade do gênero — a mesma estrutura do motor com um modelo de atributos completamente diferente:

| Características | O que o Lockbox mostra |
|---|---|
| **Rulesets** | `cyberpunkMinimalRuleset` — atributos (chrome/reflexo/netrunning), recursos (hp/ice/largura de banda), 8 verbos, incluindo `hack` e `jack-in`. |
| **Zones & traversal** | 3 zonas (rua → sala de servidores → cofre) com iluminação, perigos e elementos interativos. |
| **Districts** | Rua cyberpunk (pública) vs. Complexo do Cofre (seguro, controlado por facção). |
| **Dialogue** | Briefing do Fixer com 3 ramificações e efeitos globais. |
| **Combat** | Sentinela ICE com IA agressiva, objetivo de proteger o cofre. |
| **Cognition & perception** | Decaimento e instabilidade mais altos, percepção baseada em `reflexo` com a estatística de `netrunning`. |
| **Progression** | Árvore de habilidades de Netrunning com 3 nós (Packet Sniffer → ICE Hardening → Neural Boost). |
| **Environment** | Perigo de fiação exposta que causa 2 de dano em HP ao entrar na zona. |
| **Factions** | Facção Vault-ICE com 95% de coesão. |
| **Belief provenance** | Propagação de rumores mais rápida (delay=1) com 3% de distorção por salto. |
| **Inventory** | Programa ICE Breaker — reduz o ICE alvo em 8. |
| **Presentation rules** | Agentes ICE marcam todos os elementos não-ICE como intrusão. |

### Fantasia vs. Cyberpunk — o mesmo motor, conjuntos de regras diferentes

| | Chapel Threshold | Neon Lockbox |
|---|---|---|
| Atributos | vigor / instinto / vontade | chrome / reflexo / netrunning |
| Recursos | hp, stamina | hp, ice, largura de banda |
| Verbos únicos | — | hack, jack-in |
| Percepção | padrão | baseado em reflexo + senso de netrunning |
| Decaimento da cognição | 0,02 (base) | 0,03 (base), 0,8 de instabilidade |
| Propagação de rumores | delay=2, sem distorção | delay=1, 3% de distorção |

## O que está incluído

- **3 zonas** — Rua no Nível da Rua Neon, Sala de Servidores Abandonada, Cofre de Dados.
- **1 NPC** — Kira, a Fixer (diálogo de briefing, 3 caminhos de conversa).
- **1 inimigo** — Sentinela ICE (IA agressiva, objetivo de proteger o cofre).
- **1 item** — Programa ICE Breaker (reduz o recurso ICE alvo).
- **1 árvore de progressão** — Habilidades de Netrunning (Packet Sniffer → ICE Hardening → Neural Boost).
- **1 regra de apresentação** — Agentes ICE marcam todas as entidades não-ICE como intrusão.
- **15 módulos conectados** — a mesma estrutura completa do Chapel Threshold, com configuração diferente.

## Uso

```typescript
import { createGame } from '@ai-rpg-engine/starter-cyberpunk';

// One line — all 15 modules, content, and ruleset pre-wired
const engine = createGame(77);

// Or import pieces individually:
import { manifest, zones, fixerDialogue, cyberpunkMinimalRuleset } from '@ai-rpg-engine/starter-cyberpunk';
```

## Documentação

- [Neon Lockbox (Cap. 21)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/21-neon-lockbox/)
- [Manual](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

Criado por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
