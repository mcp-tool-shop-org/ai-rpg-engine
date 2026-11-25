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

一个用于构建确定性角色扮演游戏模拟的 TypeScript 工具包。您可以定义属性、选择模块、连接战斗流程，并创建内容。该引擎处理状态、事件、随机数生成器、行动解析和 AI 决策。每次运行都是可重复的。

这是一个**组合引擎**，而不是一个完整的游戏。12 个初始世界只是示例——您可以从中学习并重新组合的可分解模式。您的游戏可以使用引擎中您需要的任何子集。

---

## 这是什么

- 一个**模块库**——30 多个引擎模块，涵盖战斗、感知、认知、派系、谣言、移动、伙伴等
- 一个**组合工具包**——`buildCombatStack()` 用大约 7 行代码连接战斗；`new Engine({ modules })` 启动游戏
- 一个**模拟运行时**——确定性时间步长、可重放的行动日志、种子随机数生成器
- 一个**AI 设计工作室**（可选）——提供框架、评估、平衡分析、调整，并通过 Ollama 进行实验
- 一个**可选的链上层**——`@ai-rpg-engine/ledger-adapter` 使用真实的 XRPL **测试网** 令牌来支持游戏中的货币和可交易物品，并在检查点处结算，完全独立于确定性核心（可选；如果没有它，一次运行的字节将完全相同）
- 一个**可选的视觉主机**——`@ai-rpg-engine/sidecar` 加上 Godot 4 客户端 [`ai-rpg-stage`](https://github.com/mcp-tool-shop-org/ai-rpg-stage)。该引擎仍然不输出像素。舞台绘制一个 2:1 的等距港口，并播放 `felt` 音频。占用仍然是区域 ID。

## 这不是什么

- 它不是一个完成的游戏——它附带 12 个可玩的入门世界，今天就可以用 `run` 作为示例运行，而引擎是你用来组合*自己*游戏的工具包
- 它不是可视化引擎——它输出结构化事件，而不是像素。绘制画面是宿主的工作（终端或 Godot）
- 它不是故事生成器——它模拟世界；叙事从机制中涌现

---

## 当前状态（v3.12.2）

**可用且经过测试的部分：**
- 模拟核心：确定性的 tick、带种子的 RNG、逐字节一致的回放，以及存档和继续
- 队伍战斗：以队友为目标、状态效果、不伤及队友的范围攻击，以及按照各自 AI 意图配置行动的敌人
- 会作出反应的世界：派系、传闻、贸易经济、同伴、拥有自己目标的具名 NPC，以及你行为的后果
- 全部 12 个入门世界，今天就可以用 `run` 游玩
- World Forge 包，作为内容加载
- Godot 4 宿主 [`ai-rpg-stage`](https://github.com/mcp-tool-shop-org/ai-rpg-stage)，通过 sidecar 运行，支持 `felt` 音频提示
- 可选的 XRPL 测试网账本层

**尚不完善或未完成的部分：**
- AI 设计工作室（Ollama）是可选的，测试程度低于模拟核心
- 没有终端音频后端：只有 Godot 舞台会播放声音
- 多人游戏（两名人类玩家共享一个世界）尚未构建
- `replay --replay` 会恢复存档而不是重新模拟，这是有意的设计
- 部分手册页面落后于最新的 API

完整的发布历史见 [CHANGELOG.md](CHANGELOG.md)。

---

## 它看起来是什么样子

捆绑的终端 UI 将每个回合分解为带有标签的部分——场景、状态、日志和动作——并提供一目了然的 HUD。默认情况下，输出为纯文本，并在 TTY 上添加语义颜色（伤害为红色，治疗为绿色，拒绝为黄色），同时保留 `NO_COLOR` 和非 TTY 管道；每个提示都包含在文本中，而不是单独使用颜色。

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

## 安装和游玩

在终端中游玩一个入门游戏，或构建你自己的游戏：

```bash
npm install -g @ai-rpg-engine/cli

ai-rpg-engine run                    # pick a starter, build a character, play
ai-rpg-engine create-starter my-game # scaffold a new game you can edit and run
ai-rpg-engine run ./my-game          # run a game you scaffolded
```

`run` 循环是一个真实的基于回合的游戏：敌人根据其自身的 AI 配置文件进行操作，能力和经验值显示在菜单中，你可以保存和恢复，并且战斗以胜利或失败结束。每个游戏都是确定性的，并且可以重复游玩。

可选地，AI 设计工作室可以作为其自身的命令进行安装：

```bash
npm install -g @ai-rpg-engine/ollama
ai chat                              # scaffold, critique, and balance content
                                     # against a local Ollama model (see Ch. 36)
```

该工作室与本地 [Ollama](https://ollama.com) 守护进程进行通信——首先运行 `ollama serve` 和 `ollama pull qwen2.5-coder`。它是完全可选的；引擎和 `run` 循环不需要网络。

一个容器镜像已发布到 GHCR，地址为 `ghcr.io/mcp-tool-shop-org/ai-rpg-engine`，用于 CI 和沙盒运行。

---

## 快速入门

你更喜欢在代码中构建你自己的游戏吗？从模块中组合引擎：

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

请参阅 [组合指南](site/src/content/docs/handbook/57-composition-guide.md)，了解完整的流程，或者构建一个新的入门游戏：

```bash
npx @ai-rpg-engine/cli create-starter my-game
```

---

## 架构

| 层 | 角色 |
|-------|------|
| **Core Runtime** | 确定性引擎——世界状态、事件、动作、时间、RNG、重播 |
| **Modules** | 30 多个可组合的系统——战斗、感知、认知、派系、移动、伙伴等。 |
| **Content** | 实体、区域、对话、物品、能力、状态——由作者创建。 |
| **AI Studio** | 可选的 Ollama 层——构建、评论、平衡分析、调整、实验。 |

---

## XRPL 分账本适配器（可选）

`@ai-rpg-engine/ledger-adapter` 是一个**可选**包，它将游戏的**玩家拥有的可交易层**——即 `coin` 余额和消耗品库存，而 `trade-core` 的 `buy`/`sell` 动词已经可以移动这些物品——绑定到 **XRPL 测试网络**，以便这些资产可以由实际的链上令牌支持，并在检查点处结算。如果不存在适配器，则就是今天发布的离线引擎。

**确定性不变性（整个目的）。**适配器是一个*侧通道*，绝不属于模拟的一部分：

- 它**绝不在确定性循环内被调用**——而仅在**检查点**（保存、城镇/市场入口、章节中断）时被调用。
- `@ai-rpg-engine/core` 或 `@ai-rpg-engine/modules` 中的任何内容都不会导入它（它唯一的引擎依赖项是编译时的 `import type`）。
- **无论有或没有它，运行都是字节级别的相同。**防火墙测试在两个引擎上运行真实的 `starter-pirate` `createGame()` 商人循环——一个启用了适配器并在检查点处结算，另一个没有启用——并断言这两个世界是深度相等的。种子 0 重播不受影响。

**集成级别——游戏可以根据其设计尽可能深入地集成它。**防火墙是一个*确定性*边界，而不是一个反集成规则；上述不变性在每个级别都成立：

| 级别 | 依赖适配器的内容 | 是否适用 |
|-------|-----------------------------|------|
| **L0 — External observer** | 游戏内部没有；适配器从外部在检查点处连接，游戏对此一无所知。 | 重构现有游戏（发布的盗版演示）。 |
| **L1——游戏驱动的检查点** | 游戏自身的保存/城镇/元进度流程在定义的时刻调用适配器。 | 一个想要有意的链上时刻的游戏。 |
| **L2 — Ledger-native design** | 游戏经济或身份的设计围绕链上所有权（持久发行者、真实市场）。 | 一个以分账本为先的商人游戏。 |

保持重播安全的关键区别**不是**“哪个包导入了适配器”，而是“调用是否在循环内”。游戏包可以自由导入和驱动适配器，只要每个调用都在种子驱动的重播循环之外的检查点处进行。

**三种游戏模式。** `offline`（默认——无链，即发布的引擎）· `ledger`（硬币/物品由测试网络余额支持，并在检查点处结算）· `diary`（离线游玩，然后将运行的状态哈希锚定在链上，以获得防篡改的收据）。

**账本上的内容。** `coin` → 一种基于信任关系的已发行货币借据；
消耗品 → 可替代的令牌；一个检查点的净交易差额 → 通过 **XLS-85 令牌托管** 进行结算的转账。独特的装备以 **XLS-20 NFT**（v3.3）的形式出现，通过 **XLS-46 `NFTokenModify`** 推进遗物成长，从而在原地修改可变 NFT 的元数据——这取决于从 v3.4 开始的实际游戏过程。抽象的区域经济（`economy-core`）*不会*受到影响——它仍然是一个纯粹的模拟。

**安全保障。** 仅限测试网络，具有一种**在代码中无法绕过的**结构性保护（而不是配置标志）；钱包种子存储在 git 忽略的单独文件中，绝不在存档文件中；结算是幂等的，并且在重试路径上是安全的；证明验证**真实的链上备注**（而不是引擎自身的字符串）；如果无法访问链，则运行将继续进行，并标记为*未锚定*。

**已验证的实际应用。** 一次真实的 `starter-pirate` 商家运行——出售一把弯刀，购买一枚炮弹——通过令牌托管在 XRPL 测试网上进行结算，然后 `reconcile()` 确认账本上的余额和备注与引擎的经济系统是否一致（每个令牌都符合保存规则）。账本是一个与引擎不同的系统，因此引擎无法伪造数据——对账是一个真正的外部验证器。仅限测试网络；资产是游戏范围内的收据，而不是证券。

---

## 战斗系统

五个动作（攻击、防御、脱离、准备、重新定位），四种战斗状态（防御、失去平衡、暴露、逃跑），四种交战状态（交战、保护、后排、孤立）。三个统计维度驱动每个公式，因此快速的决斗者与强壮的战士或沉稳的哨兵的玩法不同。

AI 对手使用统一的决策评分——战斗动作和能力在一个单一的评估中竞争，并具有可配置的阈值，以防止边缘能力过度使用。

包作者使用 `buildCombatStack()` 将战斗与统计映射、资源配置文件和偏差标签连接起来。请参阅[战斗概述](site/src/content/docs/handbook/49a-combat-overview.md)和[包作者指南](site/src/content/docs/handbook/55-combat-pack-guide.md)。

---

## 能力

具有成本、统计检查、冷却时间和类型化效果（伤害、治疗、状态应用、清除）的特定类型的能力系统。状态效果使用具有抵抗/脆弱性配置的 11 标签语义词汇。AI 感知的选择评分用于自我/AoE/单目标路径。

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
| [`@ai-rpg-engine/core`](packages/core) | 确定性模拟运行时——世界状态、事件、RNG、刻度、动作解析 |
| [`@ai-rpg-engine/modules`](packages/modules) | 30 多个可组合的模块——战斗、感知、认知、派系、谣言、移动、伙伴、NPC 代理、战略地图、物品识别、新兴机会、弧线检测、最终游戏触发器 |
| [`@ai-rpg-engine/content-schema`](packages/content-schema) | 用于世界内容的规范模式和验证器 |
| [`@ai-rpg-engine/character-profile`](packages/character-profile) | 角色发展、受伤、里程碑、声望 |
| [`@ai-rpg-engine/character-creation`](packages/character-creation) | 原型选择、构建生成、初始装备 |
| [`@ai-rpg-engine/equipment`](packages/equipment) | 装备类型、物品来源和遗物成长——包括 `item-chronicle-core`，这是一个可选模块，它记录来自实际游戏的装备历史，以便物品获得称号和等级 |
| [`@ai-rpg-engine/campaign-memory`](packages/campaign-memory) | 跨会话记忆、关系效果、战役状态 |
| [`@ai-rpg-engine/rumor-system`](packages/rumor-system) | 谣言生命周期、变异机制、传播跟踪 |
| [`@ai-rpg-engine/presentation`](packages/presentation) | 叙事计划模式、渲染合同、语音配置文件 |
| [`@ai-rpg-engine/audio-director`](packages/audio-director) | 提示调度、优先级、静音、冷却逻辑 |
| [`@ai-rpg-engine/soundpack-core`](packages/soundpack-core) | 音效包清单、基于内容的注册表 |
| [`@ai-rpg-engine/pack-registry`](packages/pack-registry) | 包注册、评分标准、包发现 |
| [`@ai-rpg-engine/asset-registry`](packages/asset-registry) | 用于肖像、图标、媒体的基于内容的存储 |
| [`@ai-rpg-engine/image-gen`](packages/image-gen) | 具有可插拔提供程序的无头肖像生成 |
| [`@ai-rpg-engine/ollama`](packages/ollama) | 可选的 AI 创作——脚手架、评论、引导工作流程、调整、实验 |
| [`@ai-rpg-engine/cli`](packages/cli) | CLI：运行游戏、搭建初始项目、检查存档 |
| [`@ai-rpg-engine/terminal-ui`](packages/terminal-ui) | 终端渲染器和输入层 |
| [`@ai-rpg-engine/starter-merchant`](packages/starter-merchant) | 商业启动器——账本适配器的参考包，不依赖于它 |
| [`@ai-rpg-engine/starter-bounty-hunter`](packages/starter-bounty-hunter) | 盗贼启动器——以追逐为循环，并确定哪个城市的一半会为你打开一扇门 |
| [`@ai-rpg-engine/ledger-adapter`](packages/ledger-adapter) | **可选**——用于玩家拥有的可交易层（货币/物品/交易）的 XRPL 测试网络结算，通过 XLS-85 令牌托管在检查点处进行，完全独立于确定性核心 |

### 启动示例

这 12 个启动世界是**组合示例**——它们演示了如何将引擎模块组合成完整的游戏。每个示例都展示了不同的模式（统计映射、资源配置文件、交战配置、能力集）。请参阅每个启动器的 README 文件，了解“演示的模式”和“可以借鉴的内容”。

| 启动器 | 类型 | 关键模式 |
|---------|-------|-------------|
| [`starter-fantasy`](packages/starter-fantasy) | 黑暗奇幻 | 最小的战斗，对话驱动 |
| [`starter-cyberpunk`](packages/starter-cyberpunk) | 赛博朋克 | 资源、交战角色 |
| [`starter-detective`](packages/starter-detective) | 维多利亚时代的神秘 | 首先关注社交，侧重于感知 |
| [`starter-pirate`](packages/starter-pirate) | 海盗 | 海军 + 近战，多区域 |
| [`starter-zombie`](packages/starter-zombie) | 僵尸生存 | 稀缺性，感染资源 |
| [`starter-weird-west`](packages/starter-weird-west) | 怪异西部 | 包偏差，安全区恢复 |
| [`starter-colony`](packages/starter-colony) | 科幻殖民地 | 瓶颈，伏击区 |
| [`starter-ronin`](packages/starter-ronin) | 封建日本 | 隐藏通道，多个保护者角色 |
| [`starter-merchant`](packages/starter-merchant) | 商业 | 义务作为循环，战斗价格定为惩罚 |
| [`starter-bounty-hunter`](packages/starter-bounty-hunter) | 追逐 | 为了金钱而追捕人；暴力是响亮的，而不是被禁止的 |
| [`starter-vampire`](packages/starter-vampire) | 吸血鬼恐怖 | 血液资源，社会操纵 |
| [`starter-gladiator`](packages/starter-gladiator) | 历史角斗士 | 竞技场战斗，人群的青睐 |

---

## 文档

| 资源 | 描述 |
|----------|-------------|
| [Create Your Own Starter](site/src/content/docs/handbook/58-create-your-own-starter.md) | 搭建一个新游戏——CLI 或手动模板路线 |
| [Composition Guide](site/src/content/docs/handbook/57-composition-guide.md) | 通过组合引擎模块来构建你自己的游戏。 |
| [Plug-in Profiles](site/src/content/docs/handbook/59-plugin-profiles.md) | 每个实体的规则解析——混合游戏风格的战斗，`applyProfile`，配置模板，`profile` CLI。 |
| [XRPL Ledger Adapter](site/src/content/docs/handbook/60-xrpl-ledger-adapter.md) | 可选的链上结算——确定性防火墙，L0/L1/L2集成级别，游戏模式，安全保障，以及经过实际验证的海盗演示。 |
| [Combat Overview](site/src/content/docs/handbook/49a-combat-overview.md) | 六大战斗支柱，五种动作，一目了然的状态。 |
| [Pack Author Guide](site/src/content/docs/handbook/55-combat-pack-guide.md) | 逐步的buildCombatStack，属性映射，资源配置。 |
| [Visual Clients](site/src/content/docs/handbook/66-visual-clients.md) | 辅助进程，感觉负载，Godot等距港口——呈现方式可能存在偏差，占用仍然是一个区域 ID。 |
| [Handbook](site/src/content/docs/handbook/index.md) | 综合手册——每个系统，以及 4 个附录。 |
| [Composition Model](docs/composition-model.md) | 6 个可重用的层以及它们的组合方式。 |
| [Examples](docs/examples/) | 可运行的TypeScript示例（经过类型检查并在 CI 中进行了行为测试）——每个实体的混合队伍，共享配置，跨世界，从零开始。 |
| [Design Document](docs/DESIGN.md) | 深入的架构分析——动作流水线，真实与呈现。 |
| [Philosophy](PHILOSOPHY.md) | 确定性世界，基于证据的设计，AI 作为助手。 |
| [Changelog](CHANGELOG.md) | 发布历史。 |

---

## 路线图

### 我们目前的进展

两个组合骨干已完成——**388 个文件中的 8368 个测试**，所有 12 个初始设置都已在`buildCombatStack`和`buildWorldStack`上完成，在打印的种子下实现了确定性的字节级完全一致的重放，完整的 AI 决策评分，以及一个可以生成、运行、验证和检查的 CLI。v3.x阶段使世界“活”起来（命名 NPC、25 种动作的社交表面、类型经济——v3.0–v3.1），将玩家拥有的资产放在 XRPL 测试网上，作为可选的辅助通道（v3.2–v3.4），创建了两个以系统为先的初始设置，并将它们转变为引擎优化工具（v3.5–v3.6），完善并强化了战略层，直到后果产生实际影响（v3.7–v3.8），为宿主提供了 Engine 表面所需的 Godot 连接（v3.8.1），关闭了创作循环，因此一个工作室会话或一个简单的 JSON 数据包就可以生成一个完整的可玩世界（v3.9），将整个战略层置于玩家的感官之上（v3.10），调整了这些感官现在能够触及的深度（v3.11），并**为绘图宿主赋予了“感觉”——第一个像素客户端，一个 Godot 4 等距港口，在该合约上运行（v3.12）**。

完整的发布历史见 [CHANGELOG.md](CHANGELOG.md)。

### 下一步

v3.12完成了“感觉”合约和第一个绘图宿主。剩下的都是后期循环的工作，而不是这个循环的剩余部分：

- 一个繁荣家庭的背景环境（语气桥梁和每个区域的滚动发布；核心仍然没有繁荣的支柱）。
- 多人游戏——两个*人类*玩家共享一个世界（一个网络层，故意推迟；共享配置的单控制器今天就可以使用，即[`shared-profiles.ts`](docs/examples/shared-profiles.ts)）。
- 可序列化的公式覆盖——每个配置的公式调整（受公式 DSL 的限制；配置今天携带属性映射，而不是闭包）。

### 目标：插件配置

引擎的最终目标是**用户定义的配置**——可移植的包，可以插入任何游戏。一个配置将属性映射、资源行为、AI 偏差标签和能力打包成一个可导入的单元。截至v2.5，一个世界中的实体可以各自携带自己的配置，并按每个实体解析战斗——一个`might`战士和一个`will`神秘主义者共享一个队伍，每个队员都带来自己的游戏风格。

架构、`applyProfile`加载器、每个实体的能力解析和跨配置验证都已经发布。剩下的就是多人游戏——让两个*人类*玩家（而不仅仅是两个实体）共享一个世界——这是一个网络层。有关设计，请参阅[配置路线图](docs/profile-roadmap.md)和[feature-architecture.md](docs/feature-architecture.md)。

---

## 理念

AI RPG 引擎建立在三个理念之上：

1. **确定性世界**——模拟结果必须是可重现的。
2. **基于证据的设计**——世界机制应该通过模拟进行测试。
3. **AI 作为助手，而不是权威**——AI 工具帮助生成和评估设计，但不取代确定性系统。

请参阅 [PHILOSOPHY.md](PHILOSOPHY.md) 以获取完整说明。

---

## 安全性

核心引擎是一个**仅本地运行的模拟库**：不收集遥测数据，不使用网络，不存储任何敏感信息。保存文件仅在明确请求时才会保存到 `.ai-rpg-engine/`。两个**可选**层添加了向外连接的路径，并且只有在您调用它们时才会连接：

- AI 层（`@ai-rpg-engine/ollama`）与**本地** Ollama 守护进程通信；其选择加入 `webfetch`（用于 RAG）受到 SSRF 保护的限制（阻止回环/链路本地/CGNAT/云元数据以及 IPv6-tunnelled 等效地址）。
- 分账本层（`@ai-rpg-engine/ledger-adapter`）连接到 **XRPL 测试网络**——并且仅连接到测试网络：一个**在代码中无法连接到主网络**的结构性保护（而不是配置标志），在构建时拒绝任何非测试网络主机。钱包种子存储在 git 忽略的单独文件中，绝不在保存文件中，并且确定性核心绝不会导入适配器。

有关详细信息，请参阅 [SECURITY.md](SECURITY.md)。

## 要求

- Node.js >= 20
- TypeScript（ESM 模块）

## 许可

[MIT](LICENSE)

---

由 <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a> 构建
