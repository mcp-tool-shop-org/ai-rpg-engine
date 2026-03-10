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

# @ai-rpg-engine/cli

Interface de linha de comando (CLI) para o AI RPG Engine — execute, valide, repita e inspecione sessões de simulação a partir do seu terminal.

## Instalação

```bash
npm install -g @ai-rpg-engine/cli
```

## Comandos

```
ai-rpg-engine run [content-pack]   Start an interactive session
ai-rpg-engine validate <path>      Validate a content pack
ai-rpg-engine replay <save-file>   Replay a saved session deterministically
ai-rpg-engine inspect <save-file>  Inspect world state from a save
```

## Primeiros Passos

```bash
# Run the built-in fantasy starter
ai-rpg-engine run

# Validate your custom content
ai-rpg-engine validate ./my-world/

# Replay a saved session
ai-rpg-engine replay .ai-rpg-engine/save.json
```

## Documentação

- [Referência da CLI (Apêndice D)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/appendix-d-cli-reference/)
- [Primeiros Passos (Cap. 3)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/03-quick-start/)
- [Manual](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

Desenvolvido por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
