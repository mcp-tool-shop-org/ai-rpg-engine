<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

Developer CLI for AI RPG Engine — run, author, scaffold, and inspect simulation sessions from your terminal.

## Install

```bash
npm install -g @ai-rpg-engine/cli
```

## Commands

```
ai-rpg-engine run                     Start an interactive session (pick a starter, create a character)
ai-rpg-engine validate <file.json>    Validate a content pack file (errors + advisories)
ai-rpg-engine scaffold <kind> <name>  Write a minimal valid content stub (ability|zone|quest|status|dialogue)
ai-rpg-engine profile <sub> ...       Validate a profile/profile-set JSON, or scaffold a starter profile
ai-rpg-engine create-starter <name>   Scaffold a new starter game from the template
ai-rpg-engine replay [--replay]       Load the save in ./.ai-rpg-engine/ and restore its state
ai-rpg-engine inspect-save            Show a summary of the save in ./.ai-rpg-engine/
ai-rpg-engine version                 Print the version
ai-rpg-engine help                    Show help
```

Saves live at `./.ai-rpg-engine/save.json` in the current directory — `replay`
and `inspect-save` read that path; they do not take a file argument. Pass
`--replay` to re-simulate the recorded action log instead of restoring state
directly.

## Quick Start

```bash
# Run a starter (choose a world, build a character)
ai-rpg-engine run

# Validate a content pack file
ai-rpg-engine validate ./my-world/content.json

# Scaffold your own starter, then inspect a save you made
ai-rpg-engine create-starter my-world
ai-rpg-engine inspect-save
```

## Documentation

- [CLI Reference (Appendix D)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/appendix-d-cli-reference/)
- [Quick Start (Ch. 3)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/03-quick-start/)
- [Handbook](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
