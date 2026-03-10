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

# @ai-rpg-engine/core

A base do AI RPG Engine — estado do mundo, entidades, ações, eventos, regras, gerador de números aleatórios com semente e persistência.

## Instalação

```bash
npm install @ai-rpg-engine/core
```

## O que está incluído

- **Engine** — loop de simulação baseado em "ticks" com reprodução determinística.
- **WorldState** — salas, entidades, flags globais, contador de "ticks".
- **EntityState** — recursos, inventário, efeitos de status, crenças, memórias.
- **Action Pipeline** — validação → pré-processamento → resolução → pós-processamento → confirmação.
- **Event Bus** — eventos estruturados com tipo, origem, alvos e dados.
- **Seeded RNG** — aleatoriedade reproduzível a partir de uma única semente.
- **Sistema de Módulos** — registro/composição de módulos de simulação.
- **Test Harness** — ferramentas para testes determinísticos de módulos.

## Início Rápido

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

## Documentação

- [Manual](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/) — 25 capítulos + 4 apêndices.
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

Desenvolvido por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>.
