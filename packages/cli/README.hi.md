<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.md">English</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

एआई आरपीजी इंजन के लिए डेवलपर कमांड-लाइन इंटरफेस (सीएलआई) — अपने टर्मिनल से सिमुलेशन सत्रों को चलाएं, सत्यापित करें, पुनः चलाएं और जांचें।

## इंस्टॉलेशन

```bash
npm install -g @ai-rpg-engine/cli
```

## कमांड

```
ai-rpg-engine run [content-pack]   Start an interactive session
ai-rpg-engine validate <path>      Validate a content pack
ai-rpg-engine replay <save-file>   Replay a saved session deterministically
ai-rpg-engine inspect <save-file>  Inspect world state from a save
```

## शुरुआत कैसे करें

```bash
# Run the built-in fantasy starter
ai-rpg-engine run

# Validate your custom content
ai-rpg-engine validate ./my-world/

# Replay a saved session
ai-rpg-engine replay .ai-rpg-engine/save.json
```

## दस्तावेज़

- [सीएलआई संदर्भ (परिशिष्ट डी)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/appendix-d-cli-reference/)
- [शुरुआत कैसे करें (अध्याय 3)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/03-quick-start/)
- [निर्देशिका](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

यह <a href="https://mcp-tool-shop.github.io/">एमसीपी टूल शॉप</a> द्वारा बनाया गया है।
