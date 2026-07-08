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

# AI RPG 引擎

用于构建确定性 RPG 模拟的 TypeScript 工具包。您可以定义属性、选择模块、配置战斗流程，并创建内容。该引擎处理状态、事件、随机数生成器 (RNG)、行动决策和 AI 决策。每次运行都是可重复的。

这是一个**组合引擎**，而不是一个完整的游戏。10 个初始世界只是示例——您可以从中学习和重新组合的可分解模式。您的游戏可以使用您需要的引擎的任何子集。

---

## 这是什么

- 一个**模块库**——30 多个引擎模块，涵盖战斗、感知、认知、派系、谣言、移动、伙伴等
- 一个**组合工具包**——`buildCombatStack()` 在大约 7 行代码中配置战斗；`new Engine({ modules })` 启动游戏
- 一个**模拟运行时**——确定性时间步进，可重放的行动日志，种子随机数生成器
- 一个**AI 设计工作室**（可选）——脚手架、评论、平衡分析、调整、通过 Ollama 进行实验

## 这不是什么

- 不是一个开箱即用的可玩游戏——您需要从模块和内容中组合出一个游戏
- 不是一个视觉引擎——它输出结构化事件，而不是像素
- 不是一个故事生成器——它模拟世界；叙事是从机制中产生的

---

## 当前状态 (v2.5.0)

**哪些功能正常且经过测试：**
- 核心运行时：世界状态、事件、行动、时间步进、重放——自 v1.0 起稳定；确定性字节级重放（每个实例的 ID 计数器，种子随机数生成器）
- 战斗系统：5 个行动，4 种战斗状态，4 种交战状态，伙伴拦截，失败流程，AI 策略
- 能力：成本、冷却时间、属性检查、类型化效果、11 标签的状态词汇表，AI 感知的选择
- **队伍战斗 (v2.4)：** 盟友目标（治疗/增益/复活），友方/敌方 AoE 过滤，目标选择器——一个治疗者可以治疗队友；敌人 AoE 不会伤害盟友
- **状态效果 (v2.4)：** 被动属性修改影响战斗，确定性的 DoT/HoT 基于时间步进计数器，深度限制的反应触发（荆棘/反射）
- **插件配置文件——每个实体的规则解析 (v2.5)：** 一个“力量”战士和一个“意志”神秘者在一个战斗中解决问题，每个实体都通过自己的映射读取属性。`RuleProfile` + `WorldState.ruleProfiles` + `EntityState.ruleProfileId`；`applyProfile()` 附加一个配置文件（属性映射、资源池、每个实体的能力）；`buildProfile()`、`validateProfileSet()`（拒绝重复的 ID），10 个基于初始模板，以及一个 `profile` CLI 命令
- 统一决策层：战斗 + 能力评分合并到一个调用中 (`selectBestAction`)
- 所有 10 个初始世界都使用 `buildCombatStack()`——经过验证的组合骨干
- 认知配置 API (`cognition: CognitionCoreConfig | false`) 用于每个初始 AI 的调整
- 内容创作的标签分类和验证工具
- `ai-rpg-engine create-starter <name>`——创建一个新的游戏；`validate` + `scaffold` 内容命令；从 JSON 加载包
- 在 npm 上发布了初始模板 (`@ai-rpg-engine/starter-template`)
- 完整的测试套件：**193 个文件中共有 3613 个测试**（在重复运行中具有确定性；覆盖率强制执行于 CI 中）

**哪些功能还不完善或不完整：**
- AI 世界构建工具（Ollama 层）的测试不如模拟核心严格——尽管 v2.5 添加了结构化错误处理、可配置/可观察的重试循环，以及对生成内容的自愿 `--validate` 门控
- 多人游戏（两个人类玩家共享一个世界）**尚未**构建——这是一个网络层，故意超出范围；配置文件目前针对单个控制器
- 文档内容丰富，但并非每个手册页面都反映了最新的 API

---

## 快速入门

```typescript
import { Engine } from '@ai-rpg-engine/core';
import { buildCombatStack, traversalCore, statusCore, createDialogueCore } from '@ai-rpg-engine/modules';

// Define your stat mapping
const combat = buildCombatStack({
  statMapping: { attack: 'might', precision: 'agility', resolve: 'will' },
  playerId: 'hero',
  biasTags: ['undead', 'beast'],
});

// Wire the engine
const engine = new Engine({
  manifest: myManifest,
  modules: [statusCore, ...combat.modules, traversalCore, createDialogueCore(myDialogues)],
});

// Submit player actions
engine.submitAction('attack', { targetIds: ['skeleton-1'] });

// Submit AI entity actions
engine.submitActionAs('guard-captain', 'attack', { targetIds: ['player'] });
```

请参阅 [组合指南](docs/handbook/57-composition-guide.md)，了解完整的流程，或者创建一个新的初始游戏：

```bash
npx @ai-rpg-engine/cli create-starter my-game
```

---

## 架构

| 层级 | 角色 |
|-------|------|
| **Core Runtime** | 确定性引擎——世界状态、事件、行动、时间步进、RNG、重放 |
| **Modules** | 30 多个可组合的系统——战斗、感知、认知、派系、移动、伙伴等 |
| **Content** | 实体、区域、对话、物品、能力、状态——由作者创建 |
| **AI Studio** | 可选的 Ollama 层——脚手架、评论、平衡分析、调整、实验 |

---

## 战斗系统

五种行动（攻击、防御、脱离、准备、重新定位），四种战斗状态（防御、失去平衡、暴露、逃跑），四种交战状态（交战、保护、后排、孤立）。三种属性维度驱动每个公式，因此快速的决斗者与重型蛮兵或沉稳的哨兵玩起来的方式不同。

AI 对手使用统一的决策评分——战斗行动和能力在一个单一的评估中竞争，并具有可配置的阈值，以防止边缘能力的过度使用。

包作者使用 `buildCombatStack()` 从属性映射、资源配置文件和偏差标签来配置战斗。请参阅 [战斗概述](docs/handbook/49a-combat-overview.md) 和 [包作者指南](docs/handbook/55-combat-pack-guide.md)。

---

## 能力

具有成本、属性检查、冷却时间和类型化效果（伤害、治疗、状态应用、清除）的流派原生能力系统。状态效果使用 11 个标签的语义词汇表，并具有抗性/脆弱性配置文件。AI 感知的选择会评估自我/AoE/单目标路径。

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
| [`@ai-rpg-engine/core`](packages/core) | 确定性模拟运行时——世界状态、事件、RNG、时间步进、行动决策 |
| [`@ai-rpg-engine/modules`](packages/modules) | 30 多个可组合的模块——战斗、感知、认知、派系、谣言、移动、伙伴、NPC 代理、战略地图、物品识别、新兴机会、弧线检测、最终游戏触发器 |
| [`@ai-rpg-engine/content-schema`](packages/content-schema) | 用于世界内容的规范模式和验证器 |
| [`@ai-rpg-engine/character-profile`](packages/character-profile) | 角色成长、受伤情况、重要里程碑、声誉。 |
| [`@ai-rpg-engine/character-creation`](packages/character-creation) | 原型选择、模型生成、初始装备。 |
| [`@ai-rpg-engine/equipment`](packages/equipment) | 设备类型、物品来源、文物生长情况。 |
| [`@ai-rpg-engine/campaign-memory`](packages/campaign-memory) | 跨会话记忆、关系效应、活动状态。 |
| [`@ai-rpg-engine/rumor-system`](packages/rumor-system) | 谣言的传播周期、变异机制和传播追踪。 |
| [`@ai-rpg-engine/presentation`](packages/presentation) | 旁白方案框架、渲染合同、配音资料。 |
| [`@ai-rpg-engine/audio-director`](packages/audio-director) | 提示调度、优先级设置、音量降低处理、冷却时间逻辑。 |
| [`@ai-rpg-engine/soundpack-core`](packages/soundpack-core) | 音效包清单，基于内容的注册表。 |
| [`@ai-rpg-engine/pack-registry`](packages/pack-registry) | 注册团队、评分标准、发现团队 |
| [`@ai-rpg-engine/asset-registry`](packages/asset-registry) | 用于存储头像、图标和媒体文件的基于内容的寻址系统。 |
| [`@ai-rpg-engine/image-gen`](packages/image-gen) | 支持插件的无头人像生成。 |
| [`@ai-rpg-engine/ollama`](packages/ollama) | 可选的 AI 辅助写作功能——包括提供写作框架、进行评论和修改、引导写作流程、调整内容以及进行实验。 |
| [`@ai-rpg-engine/cli`](packages/cli) | 命令行界面：运行游戏、创建项目模板、检查存档。 |
| [`@ai-rpg-engine/terminal-ui`](packages/terminal-ui) | 终端渲染器和输入层。 |

### 入门示例

这十个初始世界是**示例组合**，它们展示了如何将游戏引擎模块组合成完整的游戏。每个世界都呈现不同的模式（包括数值映射、资源配置、互动设置和技能组合）。请查看每个初始世界的“自述文件”，了解其所演示的“模式”以及可以借鉴的内容。

| 开胃菜；启动器。 | 类型。 | 主要模式。 |
|---------|-------|-------------|
| [`starter-fantasy`](packages/starter-fantasy) | 黑暗奇幻。 | 战斗场景较少，侧重对话。 |
| [`starter-cyberpunk`](packages/starter-cyberpunk) | 赛博朋克 | 资源、参与角色。 |
| [`starter-detective`](packages/starter-detective) | 维多利亚时代的悬疑故事。 | 以社交媒体为先，注重用户感知。 |
| [`starter-pirate`](packages/starter-pirate) | 海盗 | 海军战舰与近距离格斗，多区域作战。 |
| [`starter-zombie`](packages/starter-zombie) | 僵尸生存 | 稀缺性，感染资源。 |
| [`starter-weird-west`](packages/starter-weird-west) | 怪诞西部。 | 消除偏见，确保安全环境的恢复。 |
| [`starter-colony`](packages/starter-colony) | 科幻殖民地。 | 战略要地、伏击区域。 |
| [`starter-ronin`](packages/starter-ronin) | 日本的封建时代。 | 隐藏的通道，多种保护角色。 |
| [`starter-vampire`](packages/starter-vampire) | 吸血鬼恐怖片。 | 血液资源，社会操控。 |
| [`starter-gladiator`](packages/starter-gladiator) | 历史上的角斗士。 | 竞技场对战，观众欢呼。 |

---

## 文档

| 资源。 | 描述。 |
|----------|-------------|
| [Create Your Own Starter](site/src/content/docs/handbook/58-create-your-own-starter.md) | 为新游戏搭建框架——选择命令行界面（CLI）或手动模板方式。 |
| [Composition Guide](site/src/content/docs/handbook/57-composition-guide.md) | 通过组合引擎模块来构建你自己的游戏。 |
| [Combat Overview](docs/handbook/49a-combat-overview.md) | 六大作战支柱，五项行动要点，一目了然。 |
| [Pack Author Guide](docs/handbook/55-combat-pack-guide.md) | 逐步构建战斗堆栈，进行属性映射，创建资源配置。 |
| [Handbook](docs/handbook/index.md) | 全面手册——包含所有系统，另附带四个附录。 |
| [Composition Model](docs/composition-model.md) | 这六层可重复使用的材料及其构成方式。 |
| [Examples](docs/examples/) | 可运行的 TypeScript 代码示例（经过类型检查，并在持续集成环境中进行了行为测试），包括：每个实体的混合派对、共享资料、跨世界交互以及从零开始构建。 |
| [Design Document](docs/DESIGN.md) | 深入探讨架构——行动流水线、真实数据与呈现数据的区别。 |
| [Philosophy](PHILOSOPHY.md) | 可预测的世界、基于证据的设计、人工智能作为辅助工具。 |
| [Changelog](CHANGELOG.md) | 发布历史 |

---

## 路线图；发展规划

### 我们现在在哪里

模拟运行环境、战斗配置框架和初始创作流程已完成——共进行 3613 次测试，涉及 193 个文件；所有 10 个初始设置均在 `buildCombatStack` 中得到应用；实现了确定性的字节级完全重现功能；完成了完整的 AI 决策评分；并提供了一个命令行脚手架命令。**v2.5 版本提供了针对每个实体的规则解析功能——这是最重要的插件配置文件功能：一个“力量型”战士和一个“意志型”神秘者在一场战斗中共同参与，各自通过自己的映射读取属性。**

**近期发布版本（v2.3.3–v2.5.0）：**
- v2.3.3–v2.3.7 — 完成消费者端原型验证，强化战斗堆栈，将所有10个初始角色添加到`buildCombatStack`中，发布初始模板，以及`create-starter`命令行工具。
- v2.4.0 — 实现队伍战斗（针对盟友/治疗/增益/复活，友方/敌方范围攻击），状态效果系统（修正值 + 持续伤害/持续治疗 + 反应触发器），插件配置阶段1，以及内容`validate`/`scaffold`命令行工具。
- **v2.5.0 — 实现每个实体的规则解析（混合战斗风格），`applyProfile`加载器 + 每个实体的能力，配置文件模板 + `profile`命令行工具，并进行全面健康检查（修复字节级完全一致的回放问题，强化正确性，实现质量控制）。**

### 下一步；接下来

- 多人游戏——两名玩家共享同一个游戏世界（网络层，暂时搁置；今天发布支持单个控制器共享配置的功能，文件名为[`shared-profiles.ts`](docs/examples/shared-profiles.ts)）。
- 可序列化的公式覆盖——针对每个配置调整公式（受限于公式领域特定语言；目前配置中包含状态映射，而非闭包）。
- API 文档同步——确保每页手册都反映了 v2.5 版本的 API。

### 目的地：插件配置文件

引擎的最终目标是**用户自定义的角色档案**——这些是可以导入任何游戏中的可移植数据包。一个角色档案将属性映射、资源行为、人工智能偏好标签和技能整合到一个可以导入的单元中。从版本 2.5 开始，在一个世界中的每个实体都可以携带自己的角色档案，并根据每个实体的特性进行战斗计算——例如，一个“力量型”战士和一个“意志型”神秘者可以组成一个队伍，各自发挥自己的游戏风格。

架构、`applyProfile` 加载器、按实体进行的能力解析以及跨配置文件的验证都已经完成。剩下的就是多人游戏功能——让两名*真人*玩家（而不仅仅是两个实体）共享一个世界，这涉及到网络层。有关设计详情，请参阅[配置方案路线图](docs/profile-roadmap.md)和[功能架构.md](docs/feature-architecture.md)。

---

## 哲学

人工智能角色扮演游戏引擎的设计理念基于以下三个核心要素：

1. **确定性世界**——模拟结果必须可重复。
2. **基于证据的设计**——应通过模拟来测试世界机制。
3. **人工智能作为助手，而非权威**——人工智能工具可以帮助生成和评估设计方案，但不能取代确定性系统。

完整的解释请参见 [PHILOSOPHY.md](PHILOSOPHY.md)。

---

## 安全性

核心引擎是一个**仅本地运行的模拟库**：不收集遥测数据，没有网络连接，不存储任何敏感信息。保存文件只会根据明确的要求保存在 `.ai-rpg-engine/` 目录中。**可选的**人工智能层（`@ai-rpg-engine/ollama`）与**本地**Ollama守护进程进行通信；其选择加入的 `webfetch` 功能（用于检索增强生成，RAG）是唯一的外部网络路径，并且受到 SSRF 防护机制的限制（阻止回环地址、链路本地地址、CGNAT、云元数据以及 IPv6 隧道等），除非您主动调用它，否则您永远无法访问它。有关详细信息，请参见 [SECURITY.md](SECURITY.md)。

## 要求

- Node.js >= 20
- TypeScript（ESM 模块）

## 许可协议

[MIT](LICENSE)

---

由 <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a> 构建。
