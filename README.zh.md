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

一个用于构建确定性 RPG 模拟的 TypeScript 工具包。你可以定义属性、选择模块、配置战斗流程，并创建内容。该引擎处理状态、事件、随机数生成器 (RNG)、行动决策和 AI 决策。每次运行都是可重复的。

这是一个**组合引擎**，而不是一个完整的游戏。10 个初始世界只是示例——你可以从中学习并重新组合的可分解模式。你的游戏可以使用你需要的引擎的任何子集。

---

## 这是什么

- 一个**模块库**——30 多个引擎模块，涵盖战斗、感知、认知、派系、谣言、移动、伙伴等
- 一个**组合工具包**——`buildCombatStack()` 在大约 7 行代码中配置战斗；`new Engine({ modules })` 启动游戏
- 一个**模拟运行时**——确定性时间步进，可重放的行动日志，种子随机数生成器 (RNG)
- 一个**AI 设计工作室**（可选）——脚手架、评论、平衡分析、调整、通过 Ollama 进行实验

## 这不是什么

- 不是一个完整的游戏——它提供 10 个可玩初始世界，你可以立即运行作为示例，并且该引擎是你用来构建*自己的*游戏的工具包
- 不是一个视觉引擎——它输出结构化事件，而不是像素
- 不是一个故事生成器——它模拟世界；叙事是从机制中产生的

---

## 当前状态 (v2.6.0)

**哪些功能已经实现并经过测试：**
- 核心运行时：世界状态、事件、行动、时间步进、重放——自 v1.0 起稳定；确定性字节级重放（每个实例的 ID 计数器，种子随机数生成器）
- 战斗系统：5 个行动，4 种战斗状态，4 种交战状态，伙伴拦截，失败流程，AI 策略
- 能力：成本、冷却时间、属性检查、类型化效果、11 标签的状态词汇表，AI 感知的选择
- **队伍战斗 (v2.4)：** 盟友目标（治疗/增益/复活），朋友/敌人区域影响过滤，目标选择器——一个治疗者可以治疗队友；敌人的区域影响不会伤害盟友
- **状态效果 (v2.4)：** 被动属性修改会影响战斗，确定性的持续伤害/持续治疗基于时间步进计数器，深度限制的反应触发（荆棘/反射）
- **插件配置文件——每个实体的规则解析 (v2.5)：** 一个“力量”战士和一个“意志”神秘者在一个战斗中解决问题，每个实体都通过自己的映射读取属性。`RuleProfile` + `WorldState.ruleProfiles` + `EntityState.ruleProfileId`；`applyProfile()` 附加一个配置文件（属性映射、资源池、每个实体的能力）；`buildProfile()`、`validateProfileSet()`（拒绝重复的 ID），10 个基于初始世界的模板，以及一个 `profile` CLI 命令
- **可玩 `run` 循环 (v2.6)：** 终端游戏是真实的，而不是演示——敌人根据自己的 AI 意图配置文件（“积极”/“谨慎”/“领地意识”/“计算”）行动，战斗以胜利或失败结束，你可以保存并恢复，能力和经验值都在行动菜单中。`run <path>` 加载你构建的游戏。由一个易于查看的 HUD 和可访问的颜色组成的终端 UI（尊重 `NO_COLOR`/非 TTY）。
- **AI 设计工作室作为其自身的 `ai` 命令发布 (v2.6)：** `npm install -g @ai-rpg-engine/ollama` → `ai chat`——构建、评论和平衡内容，并与本地 Ollama 模型进行比较。
- 统一的决策层：战斗 + 能力评分合并到一个调用中 (`selectBestAction`)
- 所有 10 个初始世界都使用 `buildCombatStack()`——经过验证的组合骨干
- 认知配置 API (`cognition: CognitionCoreConfig | false`) 用于每个初始 AI 的调整
- 内容创作的标签分类法和验证实用程序
- `ai-rpg-engine create-starter <name>`——构建一个新的游戏（独立，在 monorepo 之外运行）；`validate` + `scaffold` 内容命令；从 JSON 加载包
- 在 npm 上发布了初始模板 (`@ai-rpg-engine/starter-template`)
- 完整的测试套件：**4292 个测试**（在重复运行中具有确定性；覆盖率强制执行于 CI 中）

**哪些功能还不完善或不完整：**
- AI 世界构建工作室（Ollama 层）的测试不如模拟核心充分，并且需要一个本地 Ollama 守护进程；它完全是可选的——引擎和 `run` 循环不需要网络。
- 叙事/音频堆栈构建确定性的音频命令，但**没有终端音频后端**——没有任何东西会播放声音；这些命令是一个集成钩子，用于 GUI/Web 嵌入器。
- 多人游戏（两个人类玩家共享一个世界）**尚未**构建——这是一个网络层，故意超出范围；配置文件今天针对单个控制器。
- 文档很全面，但并非每个手册页面都反映了最新的 API。

---

## 它看起来是什么样子的

捆绑的终端 UI 将每个回合组合成带有标签的部分——场景、状态、日志和行动——并带有一个易于查看的 HUD。默认情况下，输出是纯文本，并在 TTY 上添加语义颜色（伤害为红色，治疗为绿色，拒绝为黄色），尊重 `NO_COLOR` 和非 TTY 管道；每个提示都在文本中，而不是仅仅通过颜色来传递。

```text
── The Crypt Gate ──────────────────────────────────────────
  [dark, unhallowed]

  ! Crypt Warden · HP 6/14 · Off Balance
  ! Bone Thrall · defeated
  + Mira · HP 11/16

  * rusted portcullis winch

  Exits: Ossuary, Churchyard

── Status ──────────────────────────────────────────────────
  HP 9/20 [#####-----]  Stamina 4/10
  Status: Guarded
  Items: healing-draught, grave-key

── Log ─────────────────────────────────────────────────────
  > Ash takes a guarded stance.
  > Hit!  4 damage dealt (HP: 6)
  > Bone Thrall defeated!
  > You can't do that: not enough stamina

── Actions ─────────────────────────────────────────────────
  [ 1] Move to Ossuary      [ 3] Attack Crypt Warden
  [ 2] Move to Churchyard   [ 4] Inspect Crypt Warden
────────────────────────────────────────────────────────────
```

---

## 安装和玩耍

从终端运行一个初始游戏，或者构建你自己的游戏：

```bash
npm install -g @ai-rpg-engine/cli

ai-rpg-engine run                    # pick a starter, build a character, play
ai-rpg-engine create-starter my-game # scaffold a new game you can edit and run
ai-rpg-engine run ./my-game          # run a game you scaffolded
```

`run` 循环是一个真实的基于回合的会话：敌人根据他们自己的 AI 配置文件行动，能力和经验值都在菜单中，你可以保存并恢复，并且战斗以胜利或失败结束。每个游戏都是确定性的并且可以重放。

可选地，AI 设计工作室可以作为其自身的命令安装：

```bash
npm install -g @ai-rpg-engine/ollama
ai chat                              # scaffold, critique, and balance content
                                     # against a local Ollama model (see Ch. 36)
```

该工作室与本地 [Ollama](https://ollama.com) 守护进程通信——首先运行 `ollama serve` 和 `ollama pull qwen2.5-coder`。它完全是可选的；引擎和 `run` 循环不需要网络。

容器镜像发布到 GHCR，地址为 `ghcr.io/mcp-tool-shop-org/ai-rpg-engine`，用于 CI 和沙盒运行。

---

## 快速开始

更喜欢用代码构建你自己的游戏吗？从模块中组合引擎：

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

请参阅[组合指南](site/src/content/docs/handbook/57-composition-guide.md)，了解完整的流程，或者创建一个新的起始项目：

```bash
npx @ai-rpg-engine/cli create-starter my-game
```

---

## 架构

| 层级 | 角色 |
|-------|------|
| **Core Runtime** | 确定性引擎——世界状态、事件、动作、回合、随机数生成器 (RNG)、重播 |
| **Modules** | 30 多个可组合的系统——战斗、感知、认知、派系、移动、伙伴等。 |
| **Content** | 实体、区域、对话、物品、能力、状态——由作者创建。 |
| **AI Studio** | 可选 Ollama 层——框架搭建、评估、平衡分析、调整、实验。 |

---

## 战斗系统

五种动作（攻击、防御、脱离、准备、重新定位），四种战斗状态（防御、失去平衡、暴露、逃跑），四种交战状态（交战、保护、后排、孤立）。三种统计维度驱动每个公式，因此快速的决斗者与重型战士或沉稳的哨兵在游戏方式上有所不同。

AI 对手使用统一的决策评分——战斗动作和能力在一个单一的评估中竞争，并具有可配置的阈值，以防止对次要能力的过度使用。

包作者使用 `buildCombatStack()` 将战斗与统计映射、资源配置文件和偏差标签连接起来。请参阅[战斗概述](site/src/content/docs/handbook/49a-combat-overview.md)和[包作者指南](site/src/content/docs/handbook/55-combat-pack-guide.md)。

---

## 能力

具有成本、统计值检查、冷却时间和类型化效果（伤害、治疗、状态应用、清除）的符合游戏设定的能力系统。状态效果使用 11 个标签的语义词汇，并具有抗性/脆弱性配置文件。AI 感知的选择评分会考虑自我/范围/单目标路径。

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
| [`@ai-rpg-engine/core`](packages/core) | 确定性模拟运行时——世界状态、事件、RNG、回合、动作解析。 |
| [`@ai-rpg-engine/modules`](packages/modules) | 30 多个可组合的模块——战斗、感知、认知、派系、谣言、移动、伙伴、NPC 行为、战略地图、物品识别、新兴机会、剧情检测、最终游戏触发器。 |
| [`@ai-rpg-engine/content-schema`](packages/content-schema) | 用于世界内容的规范模式和验证器。 |
| [`@ai-rpg-engine/character-profile`](packages/character-profile) | 角色发展、受伤、里程碑、声望。 |
| [`@ai-rpg-engine/character-creation`](packages/character-creation) | 原型选择、构建生成、起始装备。 |
| [`@ai-rpg-engine/equipment`](packages/equipment) | 装备类型、物品来源、遗物成长。 |
| [`@ai-rpg-engine/campaign-memory`](packages/campaign-memory) | 跨会话记忆、关系效果、战役状态。 |
| [`@ai-rpg-engine/rumor-system`](packages/rumor-system) | 谣言生命周期、变异机制、传播跟踪。 |
| [`@ai-rpg-engine/presentation`](packages/presentation) | 叙事计划模式、渲染协议、语音配置文件。 |
| [`@ai-rpg-engine/audio-director`](packages/audio-director) | 提示调度、优先级、静音、冷却逻辑。 |
| [`@ai-rpg-engine/soundpack-core`](packages/soundpack-core) | 声音包清单、基于内容的寻址注册表。 |
| [`@ai-rpg-engine/pack-registry`](packages/pack-registry) | 包注册、评分标准、包发现。 |
| [`@ai-rpg-engine/asset-registry`](packages/asset-registry) | 用于肖像、图标和媒体的基于内容的存储。 |
| [`@ai-rpg-engine/image-gen`](packages/image-gen) | 具有可插拔提供程序的无头肖像生成。 |
| [`@ai-rpg-engine/ollama`](packages/ollama) | 可选 AI 创作——框架搭建、评估、引导式工作流程、调整、实验。 |
| [`@ai-rpg-engine/cli`](packages/cli) | CLI：运行游戏、构建起始项目、检查存档。 |
| [`@ai-rpg-engine/terminal-ui`](packages/terminal-ui) | 终端渲染器和输入层。 |

### 起始示例

这 10 个起始世界是**组合示例**——它们展示了如何将引擎模块组合成完整的游戏。每个示例都显示不同的模式（统计映射、资源配置文件、交战配置、能力集）。请参阅每个起始项目的 README 文件，了解“演示的模式”和“可以借鉴的内容”。

| 起始项目 | 类型 | 关键模式 |
|---------|-------|-------------|
| [`starter-fantasy`](packages/starter-fantasy) | 黑暗奇幻 | 最少的战斗，以对话为驱动。 |
| [`starter-cyberpunk`](packages/starter-cyberpunk) | 赛博朋克 | 资源、交战角色。 |
| [`starter-detective`](packages/starter-detective) | 维多利亚时代的神秘故事 | 首先关注社交互动，并注重感知能力。 |
| [`starter-pirate`](packages/starter-pirate) | 海盗 | 海军 + 近战，多区域。 |
| [`starter-zombie`](packages/starter-zombie) | 僵尸生存 | 稀缺性、感染资源。 |
| [`starter-weird-west`](packages/starter-weird-west) | 怪异西部 | 包偏差、安全区恢复。 |
| [`starter-colony`](packages/starter-colony) | 科幻殖民地 | 瓶颈点、伏击区域。 |
| [`starter-ronin`](packages/starter-ronin) | 封建日本 | 隐藏通道、多个保护者角色。 |
| [`starter-vampire`](packages/starter-vampire) | 吸血鬼恐怖 | 血液资源、社会操纵。 |
| [`starter-gladiator`](packages/starter-gladiator) | 历史上的角斗士 | 竞技场战斗、人群的喜爱。 |

---

## 文档

| 资源 | 描述 |
|----------|-------------|
| [Create Your Own Starter](site/src/content/docs/handbook/58-create-your-own-starter.md) | 构建新的游戏——CLI 或手动模板方法。 |
| [Composition Guide](site/src/content/docs/handbook/57-composition-guide.md) | 通过组合引擎模块来构建自己的游戏。 |
| [Plug-in Profiles](site/src/content/docs/handbook/59-plugin-profiles.md) | 每个实体的规则解析——混合风格的战斗、`applyProfile`、配置文件模板、`profile` CLI。 |
| [Combat Overview](site/src/content/docs/handbook/49a-combat-overview.md) | 六个战斗支柱、五个动作，状态一览。 |
| [Pack Author Guide](site/src/content/docs/handbook/55-combat-pack-guide.md) | 逐步构建 `buildCombatStack`、统计映射、资源配置文件。 |
| [Handbook](site/src/content/docs/handbook/index.md) | 全面的手册——每个系统，以及 4 个附录。 |
| [Composition Model](docs/composition-model.md) | 6 个可重用的层及其组合方式。 |
| [Examples](docs/examples/) | 可运行的 TypeScript 示例（类型检查 + 在 CI 中进行行为测试）——每个实体的混合队伍、共享配置文件、跨世界、从头开始。 |
| [Design Document](docs/DESIGN.md) | 架构深入分析——动作流水线、事实与呈现。 |
| [Philosophy](PHILOSOPHY.md) | 确定性世界、基于证据的设计、AI 作为助手。 |
| [Changelog](CHANGELOG.md) | 发布历史 |

---

## 路线图

### 我们目前的进展

模拟运行时、战斗组合框架和初始创作路径已完成——共进行 193 个文件中的 3613 次测试，所有 10 个初始设置均在 `buildCombatStack` 中，实现确定性的字节级回放、完整的 AI 决策评分以及一个 CLI 脚手架命令。**v2.5 版本实现了按实体规则解析——重点推出的“插件配置文件”功能：一个“力量型”战士和一个“意志型”神秘者在一场战斗中共同参与，各自通过自己的映射读取属性。**

**最近的发布周期（v2.3.3–v2.6.0）：**
- v2.3.3–v2.3.7 — 消费者制品验证、战斗组合框架强化、所有 10 个初始设置均在 `buildCombatStack` 中，已发布初始模板、`create-starter` CLI。
- v2.4.0 — 团队战斗（针对盟友/治疗/增益/复活，友方-敌方范围攻击）、状态效果系统（修正器 + DoT/HoT + 反应触发器）、插件配置文件第一阶段、内容 `validate`/`scaffold` CLI。
- **v2.5.0 — 按实体规则解析（混合游戏风格的战斗），`applyProfile` 加载器 + 按实体的能力，配置文件模板 + `profile` CLI，以及完整的健康状态调整（字节级回放修复、正确性强化、质量控制措施得以实现）。**

### 下一步

- 多人游戏——两个*人类*玩家共享一个世界（网络层，有意延迟；单控制器共享配置文件今天发布，即 [`shared-profiles.ts`](docs/examples/shared-profiles.ts)）。
- 可序列化的公式覆盖——按配置文件的公式调整（受限于公式 DSL；配置文件现在包含属性映射，而不是闭包）。
- API 文档同步——确保每个手册页面都反映了 v2.5 的 API。

### 目标：插件配置文件

该引擎的最终目标是**用户定义的配置文件**——可移植的软件包，可以插入到任何游戏中。一个配置文件将属性映射、资源行为、AI 偏差标签和能力打包成一个单一的可导入单元。从 v2.5 版本开始，在一个世界中的实体都可以拥有自己的配置文件并按实体解析战斗——一个“力量型”战士和一个“意志型”神秘者组成一个团队，各自带来自己的游戏风格。

架构、`applyProfile` 加载器、按实体的能力解析和跨配置文件的验证都已经发布。剩下的就是多人游戏——让两个*人类*玩家（而不仅仅是两个实体）共享一个世界——这需要一个网络层。请参阅 [配置文件路线图](docs/profile-roadmap.md) 和 [feature-architecture.md](docs/feature-architecture.md)，了解设计方案。

---

## 理念

AI RPG 引擎基于三个核心思想：

1. **确定性世界**——模拟结果必须是可重现的。
2. **循证设计**——应该通过模拟来测试世界机制。
3. **AI 作为助手，而不是权威**——AI 工具可以帮助生成和评估设计，但不能取代确定性系统。

有关完整说明，请参阅 [PHILOSOPHY.md](PHILOSOPHY.md)。

---

## 安全性

核心引擎是一个**仅本地模拟库**：没有遥测数据、没有网络连接、没有秘密信息。保存文件只会存储在 `.ai-rpg-engine/` 目录中，并且需要明确请求才能进行。可选的 AI 层 (`@ai-rpg-engine/ollama`) 与**本地** Ollama 守护进程通信；其选择加入的 `webfetch`（用于 RAG）是唯一的外部网络路径，并受到 SSRF 防护的限制（阻止回环地址/链路本地地址/CGNAT/云元数据以及 IPv6 隧道等效地址），除非您主动调用它，否则您无法访问它。有关详细信息，请参阅 [SECURITY.md](SECURITY.md)。

## 要求

- Node.js >= 20
- TypeScript（ESM 模块）

## 许可证

[MIT](LICENSE)

---

由 <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a> 构建。
