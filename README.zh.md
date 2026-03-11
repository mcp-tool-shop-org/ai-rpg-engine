<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/ai-rpg-engine/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

# AI 角色扮演游戏引擎

一个用于构建确定性角色扮演游戏模拟的 TypeScript 工具集。 您可以定义属性，选择模块，连接战斗系统，并创建内容。 引擎负责处理状态、事件、随机数生成、行动解析以及人工智能决策。 每次运行的结果都是可重复的。

这是一款**组合引擎**，而不是一个完整的游戏。 提供的 10 个入门世界是示例，它们是可分解的模式，您可以从中学习并进行修改。 您的游戏可以使用引擎的任何子集。

---

## 这是一款什么

- 一个**模块库**：包含 27 多个模块，涵盖战斗、感知、认知、派系、传闻、探索、同伴等。
- 一个**组合工具集**：`buildCombatStack()` 函数可以在大约 7 行代码中连接战斗系统；`new Engine({ modules })` 用于启动游戏。
- 一个**模拟运行时**：具有确定性的时间步进、可重播的行动日志和带种子的随机数生成。
- 一个**人工智能设计工作室**（可选）：提供脚手架、评估、平衡分析、调优以及通过 Ollama 进行实验。

## 这不是什么

- 这不是一个开箱即用的可玩游戏——您需要使用模块和内容进行组合。
- 这不是一个视觉引擎——它输出的是结构化的事件，而不是像素。
- 这不是一个故事生成器——它模拟世界，叙事是从机制中产生的。

---

## 当前状态 (v2.3.0)

**已测试且功能完善的部分：**
- 核心运行时：世界状态、事件、行动、时间步进、重播——自 v1.0 以来稳定。
- 战斗系统：5 个行动、4 种战斗状态、4 种交战状态、同伴干预、失败流程、人工智能战术——1099 个测试用例。
- 技能：成本、冷却时间、属性检查、类型化效果、状态词汇表、人工智能感知选择。
- 统一决策层：战斗和技能评分合并为一个调用 (`selectBestAction`)。
- 10 个入门世界，具有属性差异化的敌人和完整的战斗集成。
- `buildCombatStack()` 函数可以消除每个世界约 40 行的战斗设置代码。
- 内容创作的标签分类和验证工具。
- 带跨阶段标签跟踪的 Boss 阶段验证。

**粗糙或未完成的部分：**
- 人工智能世界构建工具（Ollama 层）可以工作，但与模拟相比，测试程度较低。
- CLI 命令行界面工具可以工作，但尚未完善。
- 只有 10 个入门世界中的 1 个使用了 `buildCombatStack()` 函数（Weird West）；其他世界使用冗长的手动连接方式。
- 尚未实现配置文件系统——世界是独立的，不能从共享的配置文件中组合。
- 文档非常详细（57 个章节），但并非所有章节都反映了最新的 API。

---

## 快速入门

```typescript
import { Engine } from '@ai-rpg-engine/core';
import { buildCombatStack, createTraversalCore, createDialogueCore } from '@ai-rpg-engine/modules';

// Define your stat mapping
const combat = buildCombatStack({
  statMapping: { attack: 'might', precision: 'agility', resolve: 'will' },
  playerId: 'hero',
  biasTags: ['undead', 'beast'],
});

// Wire the engine
const engine = new Engine({
  manifest: myManifest,
  modules: [...combat.modules, createTraversalCore(), createDialogueCore(myDialogues)],
});

// Submit player actions
engine.submitAction('attack', { targetIds: ['skeleton-1'] });

// Submit AI entity actions
engine.submitActionAs('guard-captain', 'attack', { targetIds: ['player'] });
```

请参阅 [组合指南](docs/handbook/57-composition-guide.md)，了解完整的流程。

---

## 架构

| 层级 | 角色 |
|-------|------|
| **Core Runtime** | 确定性引擎——世界状态、事件、行动、时间步进、随机数生成、重播。 |
| **Modules** | 27 多个可组合系统——战斗、感知、认知、派系、探索、同伴等。 |
| **Content** | 实体、区域、对话、物品、技能、状态——由作者创建。 |
| **AI Studio** | 可选的 Ollama 层——脚手架、评估、平衡分析、调优、实验。 |

---

## 战斗系统

五个行动（攻击、防御、撤退、格挡、调整位置），四种战斗状态（防御、失衡、暴露、逃离），四种交战状态（交战、保护、后卫、孤立）。 三个属性维度驱动每个公式，因此一个快速的剑士与一个笨重的战士或一个沉稳的哨兵的玩法截然不同。

人工智能对手使用统一的决策评分——战斗行动和技能在单个评估中竞争，并具有可配置的阈值，以防止边缘技能的滥用。

打包作者使用 `buildCombatStack()` 函数，通过属性映射、资源配置文件和偏好标签来连接战斗系统。 请参阅 [战斗概述](docs/handbook/49a-combat-overview.md) 和 [打包作者指南](docs/handbook/55-combat-pack-guide.md)。

---

## 技能

具有成本、属性检查、冷却时间和类型效果（伤害、治疗、状态附加、清除）的、特定游戏类型的能力系统。状态效果使用包含11个标签的语义词汇表，并具有抗性和易受性属性。人工智能会根据选择，评估自身、范围攻击和单体攻击的优劣。

```typescript
const warCry: AbilityDefinition = {
  id: 'war-cry', name: 'War Cry', verb: 'use-ability',
  tags: ['combat', 'debuff', 'aoe'],
  costs: [{ resourceId: 'stamina', amount: 3 }],
  target: { type: 'all-enemies' },
  checks: [{ stat: 'nerve', difficulty: 6, onFail: 'abort' }],
  effects: [
    { type: 'apply-status', target: 'target', params: { statusId: 'rattled', duration: 2 } },
  ],
  cooldown: 4,
};
```

---

## 包

| 包 | 目的 |
|---------|---------|
| [`@ai-rpg-engine/core`](packages/core) | 确定性模拟运行时：世界状态、事件、随机数生成器、时间步长、动作解析。 |
| [`@ai-rpg-engine/modules`](packages/modules) | 27多个可组合模块，包括战斗、感知、认知、派系、传闻、探索、同伴、NPC行为、战略地图、物品识别、新兴机会、剧情发展检测、游戏后期触发。 |
| [`@ai-rpg-engine/content-schema`](packages/content-schema) | 用于世界内容的规范模式和验证器。 |
| [`@ai-rpg-engine/character-profile`](packages/character-profile) | 角色成长状态、伤势、里程碑、声望。 |
| [`@ai-rpg-engine/character-creation`](packages/character-creation) | 原型选择、构建生成、初始装备。 |
| [`@ai-rpg-engine/equipment`](packages/equipment) | 装备类型、物品来源、遗物成长。 |
| [`@ai-rpg-engine/campaign-memory`](packages/campaign-memory) | 跨会话记忆、关系效果、战役状态。 |
| [`@ai-rpg-engine/ollama`](packages/ollama) | 可选的 AI 内容创作：框架、评论、引导式工作流程、调优、实验。 |
| [`@ai-rpg-engine/cli`](packages/cli) | 命令行设计工作室。 |
| [`@ai-rpg-engine/terminal-ui`](packages/terminal-ui) | 终端渲染器和输入层。 |

### 入门示例

这10个入门世界是**组合示例**，它们展示了如何将引擎模块组合成完整的游戏。每个示例都展示了不同的模式（属性映射、资源配置、互动设置、能力集）。请参阅每个入门示例的README文件，了解“演示模式”和“可借鉴内容”。

| 入门。 | 游戏类型。 | 关键模式。 |
|---------|-------|-------------|
| [`starter-fantasy`](packages/starter-fantasy) | 黑暗奇幻。 | 战斗较少，以对话为主。 |
| [`starter-cyberpunk`](packages/starter-cyberpunk) | 赛博朋克。 | 资源、互动角色。 |
| [`starter-detective`](packages/starter-detective) | 维多利亚时期悬疑。 | 以社交为中心，注重感知。 |
| [`starter-pirate`](packages/starter-pirate) | 海盗。 | 水上战斗+近战，多区域。 |
| [`starter-zombie`](packages/starter-zombie) | 僵尸生存。 | 资源稀缺、感染。 |
| [`starter-weird-west`](packages/starter-weird-west) | 西部怪谈。 | `buildCombatStack` 引用，打包偏好。 |
| [`starter-colony`](packages/starter-colony) | 科幻殖民地。 | 狭窄通道、伏击区域。 |
| [`starter-ronin`](packages/starter-ronin) | 日本封建时代。 | 隐藏通道、多种保护角色。 |
| [`starter-vampire`](packages/starter-vampire) | 吸血鬼恐怖。 | 血资源、社会操纵。 |
| [`starter-gladiator`](packages/starter-gladiator) | 历史角斗士。 | 竞技场战斗、观众欢呼。 |

---

## 文档

| 资源 | 描述 |
|----------|-------------|
| [Composition Guide](docs/handbook/57-composition-guide.md) | 通过组合引擎模块来构建您自己的游戏——从这里开始。 |
| [Combat Overview](docs/handbook/49a-combat-overview.md) | 六个战斗核心要素，五个动作，一目了然的状态。 |
| [Pack Author Guide](docs/handbook/55-combat-pack-guide.md) | 逐步构建`buildCombatStack`，属性映射，资源配置。 |
| [Handbook](docs/handbook/index.md) | 43 个章节 + 4 个附录，涵盖所有系统。 |
| [Composition Model](docs/composition-model.md) | 6个可重用层及其组合方式。 |
| [Examples](docs/examples/) | 可运行的TypeScript示例，包括混合队伍、跨世界、从零开始。 |
| [Design Document](docs/DESIGN.md) | 架构深入分析——动作流水线，真实与表现。 |
| [Philosophy](PHILOSOPHY.md) | 为什么是确定性世界、基于证据的设计以及 AI 作为助手。 |
| [Changelog](CHANGELOG.md) | 发布历史 |

---

## 路线图

### 我们目前的状态

模拟运行时和战斗系统已经稳定——2661个测试用例，10个游戏类型示例，可重复的确定性回放，完整的AI决策评分。引擎作为一个组合工具包工作：选择模块，定义属性，连接，创建内容。文档涵盖所有系统，但需要进行API同步，以包含最新的更新。

### 未来几周

- 将剩余的9个入门示例迁移到`buildCombatStack`（西部怪谈是参考）。
- API文档同步——`submitActionAs`、`selectBestAction`、`resourceCaps`、标签分类。
- 入门示例README文件优化——更清晰的“可借鉴内容”和“可重用指南”。
- 交叉链接——README、组合指南、示例和手册相互关联。

### 目标：插件配置文件

引擎的最终目标是**用户定义的配置文件**，这些是可移植的捆绑包，可以嵌入到任何游戏中。一个配置文件将属性映射、资源行为、AI偏好标签、能力和遭遇钩子打包成一个可导入的单元。两个具有不同配置文件的玩家可以共享一个世界，每个人都带来自己的游戏风格。

配置文件建立在组合（已实现）和统一的决策层（在v2.3.0中发布）的基础上。剩余的工作是定义配置文件模式，构建加载器，并验证跨配置文件的交互。请参阅[配置文件路线图](docs/profile-roadmap.md)，了解完整计划。

---

## 哲学

AI RPG Engine 的构建基于以下三个理念：

1. **确定性世界**：模拟结果必须可重现。
2. **基于证据的设计**：世界机制应通过模拟进行测试。
3. **AI 作为助手，而非权威**：AI 工具用于帮助生成和评估设计，但不能替代确定性系统。

请参阅 [PHILOSOPHY.md](PHILOSOPHY.md) 以获取完整说明。

---

## 安全

AI RPG Engine 是一个**仅本地运行的模拟库**。没有遥测数据，没有网络连接，没有敏感信息。保存文件仅在明确请求时才会保存到 `.ai-rpg-engine/` 目录。详情请参阅 [SECURITY.md](SECURITY.md)。

## 要求

- Node.js >= 20
- TypeScript (ESM 模块)

## 许可证

[MIT](LICENSE)

---

由 <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a> 构建。
