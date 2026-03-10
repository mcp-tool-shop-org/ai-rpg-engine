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

# @ai-rpg-engine/terminal-ui

Renderizador para terminal e camada de entrada para o AI RPG Engine — converte fluxos de eventos em saída legível para o terminal.

## Instalação

```bash
npm install @ai-rpg-engine/terminal-ui
```

## O que está incluído

- **Renderizador de Eventos** — converte eventos do motor em texto formatado para o terminal.
- **Analisador de Entrada** — analisa os comandos do jogador em ações para o motor.
- **Temas de Cores** — paletas de cores ANSI para diferentes gêneros de jogos.
- **Auxiliares de Layout** — barras de status, descrições de salas, listas de entidades.

## Uso

```typescript
import { TerminalRenderer, InputParser } from '@ai-rpg-engine/terminal-ui';

const renderer = new TerminalRenderer();
const parser = new InputParser();

// Render engine events
for (const event of events) {
  renderer.render(event);
}

// Parse player input into actions
const action = parser.parse('attack guard');
```

## Documentação

- [Manual](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

Desenvolvido por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
