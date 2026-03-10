<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

**霓虹色保险箱** — 一个用于 AI RPG 引擎的赛博朋克入门世界。

## 安装

```bash
npm install @ai-rpg-engine/starter-cyberpunk
```

## 您将学到的内容

这个入门示例展示了引擎的灵活性——使用相同的引擎架构，但具有完全不同的属性模型：

| 特性 | “霓虹色保险箱”展示的内容 |
|---|---|
| **Rulesets** | `cyberpunkMinimalRuleset` — 属性（铬/反射/网络入侵），资源（生命值/防火墙/带宽），8 个动词，包括“入侵”和“接入”。 |
| **Zones & traversal** | 3 个区域（街道 → 服务器机房 → 保险库），包含光照、危险和可交互元素。 |
| **Districts** | 霓虹街道区域（公共）与保险库区域（安全，由派系控制）。 |
| **Dialogue** | “掮客”的简报，包含 3 个分支和全局标志效果。 |
| **Combat** | 具有攻击性 AI 的 ICE 哨兵，目标是守卫保险库。 |
| **Cognition & perception** | 更高的衰减 + 不稳定性，基于“反射”的感知，以及“网络入侵”感应属性。 |
| **Progression** | 3 节点网络入侵技能树（数据包嗅探器 → 防火墙强化 → 神经增强）。 |
| **Environment** | 暴露的电线，进入区域时会造成 2 点生命值伤害。 |
| **Factions** | 保险库防火墙派系，凝聚力为 0.95。 |
| **Belief provenance** | 更快的谣言传播速度（延迟=1），每跳 3% 的失真。 |
| **Inventory** | ICE 破解程序 — 减少目标 ICE 的数值 8。 |
| **Presentation rules** | ICE 代理将所有非 ICE 实体标记为入侵。 |

### 奇幻与赛博朋克 — 相同的引擎，不同的规则集

| | 圣殿阈值 | 霓虹色保险箱 |
|---|---|---|
| 属性 | 活力 / 意志 / 反应 | 铬 / 反射 / 网络入侵 |
| 资源 | 生命值，体力 | 生命值，防火墙，带宽 |
| 独特的动词 | — | 入侵，接入 |
| 感知 | 默认 | 基于反射 + 网络入侵感应 |
| 认知衰减 | 基础值 0.02 | 基础值 0.03，不稳定性 0.8 |
| 谣言传播 | 延迟=2，无失真 | 延迟=1，3% 失真 |

## 内容

- **3 个区域** — 霓虹街道，废弃服务器机房，数据保险库
- **1 个 NPC** — 掮客“基拉”（简报对话，3 种对话路径）
- **1 个敌人** — ICE 哨兵（具有攻击性 AI，守卫保险库的目标）
- **1 个物品** — ICE 破解程序（减少目标 ICE 资源）
- **1 棵技能树** — 网络入侵技能（数据包嗅探器 → 防火墙强化 → 神经增强）
- **1 条规则** — ICE 代理将所有非 ICE 实体标记为入侵
- **15 个模块已连接** — 与圣殿阈值相同，但配置不同

## 使用方法

```typescript
import { createGame } from '@ai-rpg-engine/starter-cyberpunk';

// One line — all 15 modules, content, and ruleset pre-wired
const engine = createGame(77);

// Or import pieces individually:
import { manifest, zones, fixerDialogue, cyberpunkMinimalRuleset } from '@ai-rpg-engine/starter-cyberpunk';
```

## 文档

- [霓虹色保险箱 (第 21 章)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/21-neon-lockbox/)
- [手册](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

由 <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a> 构建。
