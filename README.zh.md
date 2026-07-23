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
- 一个**模拟运行时**——确定性循环，可重放的行动日志，种子随机数生成器 (RNG)
- 一个**AI 设计工作室**（可选）——脚手架、评论、平衡分析、调整、通过 Ollama 进行实验

## 这不是什么

- 不是一个完整的游戏——它包含 10 个可玩初始世界，你可以今天就运行它们作为示例，并且该引擎是你用来构建*自己的*游戏的工具包
- 不是一个视觉引擎——它输出结构化事件，而不是像素
- 不是一个故事生成器——它模拟世界；叙事是从机制中产生的

---

## 当前状态（v3.1.0）

**哪些功能已经实现并经过测试：**

*   核心运行时环境：世界状态、事件、动作、时间流逝、重播——自 v1.0 版本以来一直稳定；确定性的字节级重播（每个实例的 ID 计数器，种子随机数生成器）
*   战斗系统：5 个动作，4 种战斗状态，4 种交战状态，伙伴拦截，失败流程，AI 策略
*   技能：消耗、冷却时间、属性检查、类型化效果、11 标签的状态词汇表，AI 感知的选择
*   **队伍战斗（v2.4）：** 盟友目标选择（治疗/增益/复活）、友方/敌方区域效果过滤、目标选择器——一个治疗者可以治疗队友；敌方区域效果不会伤害盟友
*   **状态效果（v2.4）：** 被动属性修正影响战斗，确定性的持续伤害/持续治疗效果基于时间流逝计数器，深度限制的反应触发器（荆棘/反射）
*   **插件配置文件——每个实体的规则解析（v2.5）：** 一个“力量”战士和一个“意志”神秘者在一个战斗中解决冲突，各自读取通过自己的映射表中的属性。`RuleProfile` + `WorldState.ruleProfiles` + `EntityState.ruleProfileId`；`applyProfile()` 附加一个配置文件（属性映射、资源池、每个实体的技能）；`buildProfile()`、`validateProfileSet()`（拒绝重复的 ID），10 个初始模板，以及一个 `profile` CLI 命令
*   **可玩“运行”循环（v2.6）：** 最终游戏是真实的，而不是演示——敌人根据自己的 AI 意图配置文件（“积极”、“谨慎”、“领地意识”、“计算”）行动，战斗以胜利或失败结束，您可以保存并恢复进度，技能和经验值显示在动作菜单中。`run <path>` 加载您创建的游戏。由一个易于查看的 HUD 和可访问的颜色方案组成的终端 UI（支持 `NO_COLOR`/非 TTY）。
*   **AI 设计工作室以其自身的 `ai` 命令形式提供（v2.6）：** `npm install -g @ai-rpg-engine/ollama` → `ai chat`——创建、评估和平衡内容，并与本地 Ollama 模型进行比较。
*   统一的决策层：战斗 + 技能评分合并到一个调用中 (`selectBestAction`)
*   所有 10 个初始世界都使用 `buildCombatStack()`——经过验证的组合框架
*   认知配置 API (`cognition: CognitionCoreConfig | false`)，用于每个初始 AI 的调整
*   内容创作的标签分类和验证工具
*   **世界会做出反应（v2.7）：** 击杀会增加热度并降低区域安全性；每回合的世界时间流逝会产生隐藏的压力，这些压力会以谣言的形式出现（“你听到了一些耳语……”），升级，并在一段时间后消失，从而产生后果；在所有 10 个初始世界中，大约有 30 个已创作的遭遇组合会在进入区域时触发——基于种子的确定性，更危险的区域会产生更多，Boss 的场景受到保护。
*   **一个回归的理由（v2.7）：** 在长期发布的架构上有一个最小的任务循环——任务在触发时提供，跟踪击杀/到达/进度目标，并一次性奖励经验值和物品；四个已创作的任务、一个“日志”屏幕，以及回合叙述中的任务环节。
*   **装备影响战斗（v2.7）：** `equip`/`unequip` 会将实际数值传递到状态层，而战斗公式已经读取了这些数值——无需更改任何战斗代码；角斗士的三叉戟和渔网从头到尾都与一个经过测试的命中率差异相关联。
*   **基于种子的运行（v2.7）：** 每个新的会话都会打印其种子以及确切的重播命令；`--seed <n>` 会逐字节地重现一个会话；战斗、抗性、技能和策略掷骰子都使用世界种子——并且结局会读取您实际玩过的游戏（实时的热度、压力、派系积累、玩家等级）。
*   **`buildWorldStack()`（v2.7）：** 战略组合框架，与 `buildCombatStack()` 并行——一个调用组装环境、派系、谣言、区域、失败后果、遭遇和任务；此外还有“总监日志”策略屏幕、一个 `AI_RPG_DEBUG=1` 模拟检查器、由与继续相同的权限控制的 `inspect-save`，以及已发布恢复路径上的模块保存迁移接口。
*   **影响活生生的经济（v2.8）：** `createEconomyCore` 在加载包时为每个区域创建一个经济体系，并在每个回合中对其进行更新；一个新的“出售”动词通过 `computeItemValue` 对战利品进行定价（稀缺性/派系/来源/走私品），并改变当地的供应。一个编写代码的行为启动了五个在 v2.7 中未发布的功能——总监的市场概览 + 派系评分、最终商人王子剧情和崩溃触发器，以及四种经济压力类型。“本周期仅限出售”（购买→v2.9）。
*   **伙伴（v2.8）：** 一个“招募”动词构建一个队伍——状态、标签和派系，因此伙伴会 *与您一起* 战斗；伙伴战斗利用核心战斗的拦截机制（在 `isAlly` 设置之前一直处于休眠状态），伙伴会对士气做出反应并可能离开，招募启动了七个等待使用的功能——最终的“伙伴”名单、队伍目标选择、NPC 代理目标、恩惠任务以及总监的“队伍”部分。“本周期被动拦截”（独立回合→v2.9）。
*   **总监可以查看整个棋盘（v2.8）：** 一个新的装备日志部分（基于 CLI 到装备来源的依赖关系），一个总监总结最终预告片，市场概览 + 队伍部分现在从实时生产者获取数据，以及区域稳定性和经济基调在最终的“区域”部分中显示。
*   **经济的另一半（v2.9）：** 一个“购买”动词完成了循环——每个区域提供的商人库存按供应类别细分（供应水平 *是* 补货信号），价格通过与“出售”相同的 `computeItemValue` 管道确定，并加上买卖价差，以避免无风险的往返交易。此外，制作也变得活跃：`createCraftingCore` 在已创作的配方表中注册了“回收/制作/修理/修改”，从而启动了总监的“材料 + 配方”部分（这些部分在发布时一直处于休眠状态）。
*   **伙伴可以执行自己的回合（v2.9）：** v2.8 中的被动拦截机制成为上限——招募的伙伴会在每个回合中通过先前未使用的 `selectBestAction` 顾问独立行动，并具有基于角色的战斗偏好，因此战士和学者会以不同的方式战斗，伙伴之间的拦截以及队伍生命值显示在总监的“队伍”部分中。没有伙伴的包仍然是字节级的（空队伍门控保留了种子 0 的旧版重播）。
*   **完整的社交层，从头到尾连接（v2.9）：** 四个杠杆动词——“贿赂”、“恐吓”、“请愿”、“散布”（谣言）——写入实际的声望/警报/热度全局变量，这些变量会影响定价和派系门控，并且“散布”启动了整个玩家-谣言模块以及总监的“关于你的谣言”部分。支持它们的“杠杆经济”也已连接：完成一个机会现在会授予它一直以来所描述的杠杆，因此动词在游戏中可以真正地获得。
*   **机会，完整的生命周期（v2.9）：** 每个回合的生成器都会提供根据实时世界状态评分的合同/赏金/恩惠；您“接受”，然后“完成”或“放弃”；忽略一个机会直到其截止日期现在会产生后果（过期影响），并且完成伙伴的恩惠会改变该伙伴的士气。最终游戏中不断增长的力量和商人王子剧情会读取您实际解决的机会。
*   **所有十个初始世界的内容一致性（v2.9）：** 装备连接、任务、可招募的伙伴以及起始金币余额已扩展到每个缺少这些内容的世界——现在，这十个世界共享一个统一且完全启动的功能表面（装备仅限于角斗士；任务仅限于奇幻/僵尸；五个世界发布了“招募”，但没有可以招募的人）。此外还有一个结构化内容验证器，它可以捕获所有引用表面中拼写错误的物品 ID，以及带有 `--checkpoint`/`--list-checkpoints` 的多检查点保存槽。
*   **活生生的 NPC，真正地活着（v3.0）：** 持久的 NPC 代理生产者启动了总监的“人物”部分——命名的 NPC（每个初始世界都有一个已创作的故事角色，以及您招募的每个伙伴）都具有目标、信任/恐惧/贪婪/忠诚关系、义务记录和后果链。`runNpcAgencyTick` 在每个回合中运行，并进行门控，因此没有命名 NPC 的世界仍然与旧版重播字节级一致。启动生产者还启动了伙伴恩惠失败的离开断点，两个休眠的机会生成规则（NPC 目标 + 义务），以及最终游戏中 npcProfiles/npcObligations——该连接在已发布的内容中经过测试并且处于绿色状态，但在第 9 阶段审计中被发现，因此修复程序会为每个初始世界添加一个已创作的命名 NPC。
*   **完整的社交表面（v3.0）：** 四个杠杆动词变为二十五个——外交和破坏组注册（另外 21 个子动词），启动了先前处于休眠状态的 `leverage-diplomacy` / `leverage-sabotage` 伙伴反应；其中十九个显示在编号菜单上（负担 + 冷却时间 + 声望门控）。对话条件和效果现在会读取和写入社交状态（杠杆/声望/NPC 关系）。并且被动杠杆收入 (`tickLeverage` / `computeLeverageGains`) 会从声望中滴漏影响力，并从经验值和里程碑中授予恩惠/勒索/合法性——因此，社交层在机会之间获得收益，而不仅仅是在完成时。
*   **具有流派风格的经济（v3.0）：** 商人库存和制作配方现在会根据每个初始世界的流派表进行解析（十个初始世界中有七个包含已创作的流派内容；另外三个回退到通用模式），在购买/制作机制、编号菜单显示以及总监的“配方”部分中，所有这些都来自相同的规则集密钥，因此显示和机制一致。`repair` 和 `modify` 现在是编号菜单中的行（物品×配方配对），并且“护送”机会会在危险区域中进行保护性旅行时生成。
*   **最终游戏会读取您获得的杠杆（v3.0）：** “胜利”、“傀儡大师”和“安静的退休”战役结局——长期以来，这些结局都依赖于最终游戏中读取为硬编码零的影响力/勒索/合法性——现在可以通过整个社交经济写入的实际杠杆存储来实现。通过 NPC 代理断点和一个士气下限回退，伙伴离开也可以实现。
*   **`audit-content` 开发 CLI（v3.0）：** 一个开发人员内容审计命令（与 `validate` 同级，不同于玩家面对的总监日志），该命令在一个包上运行六个遭遇/Boss/战斗总监格式化程序。
*   `ai-rpg-engine create-starter <name>`——创建一个新的游戏（独立，在单仓库外部运行）；“验证”+“创建”内容命令；从 JSON 加载包。
*   已发布的初始模板在 npm 上 (`@ai-rpg-engine/starter-template`)
*   完整的测试套件：**5494 个测试**（在重复运行中具有确定性；测试文件在 CI 中进行类型检查；覆盖率强制执行）。

**存在缺陷或不完整之处：**
- 人工智能世界构建工作室（Ollama 层）的测试不如模拟核心充分，并且需要本地 Ollama 守护进程；它是完全可选的——引擎和 `run` 循环不需要网络连接。
- 叙事/音频堆栈会生成确定性的音频命令，但**没有终端音频后端**——没有任何东西会发出声音；这些命令是用于 GUI/Web 集成的接口。
- 多人模式（两个人类玩家共享一个世界）尚未**构建**——它是一个网络层，有意不在本次开发范围内；目前的配置针对单个控制器。
- `replay --replay` 会恢复存档而不是重新模拟——并且在 v2.9 之后，这就是**既定的**方向，而不是推迟：`Engine.serialize()` 已经是一种经过验证的完整状态快照，而重新模拟则需要追溯世界时间/遭遇状态，这些状态存在于操作日志之外。v2.9 版本通过这种经过验证的恢复路径提供了多检查点存档插槽；真正的事件源式重模拟尚未计划。
- v3.1 结束了 v3.0 中的三个既定目标——类型**起始资源**、特定类型的*修复*配方，以及 `deny` / `bury-scandal` 菜单界面现在都已发布。剩下的唯一限制是：新的类型修复配方包含一个作者编写的 `statDelta`（一个小数值加成），而 `resolveRepair` 函数尚未应用——修复会*恢复*，`modify` 会*升级*——因此，将修复作为升级的功能在代码中标记，并**推迟到 v3.2/v3.3 版本**，作为一个明确的机制调用，而不是一个静默且无用的字段。并且 `obligation-exists` 附带了一个作者编写的演示示例（Brother Aldric）；该条件已激活，供内容创作者用于控制更多对话。
- 文档非常详尽，但并非每个手册页面都反映了最新的 API。

---

## 它看起来是什么样？

捆绑的终端 UI 将每个回合分解为带有标签的部分——场景、状态、日志和行动——并提供一目了然的 HUD。默认输出是纯文本，并在 TTY 上添加语义颜色（伤害显示红色，治疗显示绿色，拒绝显示黄色），同时遵守 `NO_COLOR` 环境变量和非 TTY 流；所有提示信息都包含在文本中，绝不会单独使用颜色。

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

## 安装与运行

从终端运行一个示例世界，或构建你自己的游戏：

```bash
npm install -g @ai-rpg-engine/cli

ai-rpg-engine run                    # pick a starter, build a character, play
ai-rpg-engine create-starter my-game # scaffold a new game you can edit and run
ai-rpg-engine run ./my-game          # run a game you scaffolded
```

`run` 循环是一个真实的基于回合的游戏会话：敌人根据其自身的 AI 配置行动；属性、技能和经验值都可以在菜单中找到，你可以保存并恢复进度，并且战斗以胜利或失败结束。每个游戏都是确定性的，可以重复进行。

可选地，AI 设计工作室可以作为独立的命令安装：

```bash
npm install -g @ai-rpg-engine/ollama
ai chat                              # scaffold, critique, and balance content
                                     # against a local Ollama model (see Ch. 36)
```

该工作室与本地 [Ollama](https://ollama.com) 守护进程通信——首先运行 `ollama serve` 和 `ollama pull qwen2.5-coder`。它是完全可选的；引擎和 `run` 循环不需要网络连接。

容器镜像已发布到 GHCR，地址为 `ghcr.io/mcp-tool-shop-org/ai-rpg-engine`，用于 CI 和沙盒运行。

---

## 快速入门

如果你想用代码构建自己的游戏？从模块中组合引擎：

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

请参阅 [组合指南](site/src/content/docs/handbook/57-composition-guide.md)，了解完整的流程，或者创建一个新的示例世界：

```bash
npx @ai-rpg-engine/cli create-starter my-game
```

---

## 架构

| 层级 | 角色 |
|-------|------|
| **Core Runtime** | 确定性引擎——世界状态、事件、行动、时间流逝、随机数生成器、重放功能。 |
| **Modules** | 30 多个可组合的系统——战斗、感知、认知、派系、移动、伙伴等。 |
| **Content** | 实体、区域、对话、物品、技能、状态——由作者创建。 |
| **AI Studio** | 可选的 Ollama 层——构建原型、提供反馈、平衡分析、调整参数、进行实验。 |

---

## 战斗系统

五种行动（攻击、防御、撤退、准备、重新定位），四种战斗状态（防御、失去平衡、暴露、逃跑），四种交战状态（交战、保护、后排、孤立）。三种属性维度驱动每个公式，因此快速的决斗者与强壮的重击者或沉稳的哨兵玩起来的方式不同。

AI 对手使用统一的决策评分——战斗行动和技能在一个单一的评估中竞争，并具有可配置的阈值，以防止过度使用次要技能。

包作者使用 `buildCombatStack()` 从属性映射、资源配置文件和偏差标签构建战斗系统。请参阅 [战斗概述](site/src/content/docs/handbook/49a-combat-overview.md) 和 [包作者指南](site/src/content/docs/handbook/55-combat-pack-guide.md)。

---

## 技能

具有成本、属性检定、冷却时间和类型化效果（伤害、治疗、状态应用、清除）的特定于游戏类型的技能系统。状态效果使用 11 个标签的语义词汇，并具有抗性和脆弱性配置文件。AI 感知的选择评分会考虑自我/范围/单目标路径。

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
| [`@ai-rpg-engine/core`](packages/core) | 确定性模拟运行时——世界状态、事件、随机数生成器、时间流逝、行动解析。 |
| [`@ai-rpg-engine/modules`](packages/modules) | 30 多个可组合的模块——战斗、感知、认知、派系、谣言、移动、伙伴、NPC 行为、战略地图、物品识别、突发机会、剧情检测、最终游戏触发器。 |
| [`@ai-rpg-engine/content-schema`](packages/content-schema) | 用于世界内容的规范模式和验证器。 |
| [`@ai-rpg-engine/character-profile`](packages/character-profile) | 角色发展、受伤、里程碑、声望。 |
| [`@ai-rpg-engine/character-creation`](packages/character-creation) | 原型选择、构建生成、起始装备。 |
| [`@ai-rpg-engine/equipment`](packages/equipment) | 装备类型、物品来源、圣物成长。 |
| [`@ai-rpg-engine/campaign-memory`](packages/campaign-memory) | 跨会话记忆、关系效果、战役状态。 |
| [`@ai-rpg-engine/rumor-system`](packages/rumor-system) | 谣言生命周期、变异机制、传播跟踪。 |
| [`@ai-rpg-engine/presentation`](packages/presentation) | 叙事计划模式、渲染协议、语音配置文件。 |
| [`@ai-rpg-engine/audio-director`](packages/audio-director) | 提示调度、优先级、静音处理、冷却逻辑。 |
| [`@ai-rpg-engine/soundpack-core`](packages/soundpack-core) | 声音包清单、基于内容的注册表。 |
| [`@ai-rpg-engine/pack-registry`](packages/pack-registry) | 包注册、评分标准、包发现。 |
| [`@ai-rpg-engine/asset-registry`](packages/asset-registry) | 用于存储肖像、图标和媒体的基于内容寻址的存储。 |
| [`@ai-rpg-engine/image-gen`](packages/image-gen) | 具有可插拔提供程序的无头肖像生成。 |
| [`@ai-rpg-engine/ollama`](packages/ollama) | 可选的 AI 创作——构建原型、提供反馈、引导工作流程、调整参数、进行实验。 |
| [`@ai-rpg-engine/cli`](packages/cli) | CLI：运行游戏、构建示例世界、检查存档。 |
| [`@ai-rpg-engine/terminal-ui`](packages/terminal-ui) | 终端渲染器和输入层。 |

### 示例世界

这 10 个示例世界是**组合示例**——它们演示了如何将引擎模块组合成完整的游戏。每个示例都展示了不同的模式（属性映射、资源配置文件、交战配置、技能集）。请参阅每个示例世界的 README 文件，了解“已演示的模式”和“可以借鉴的内容”。

| 入门 | 类型 | 关键模式 |
|---------|-------|-------------|
| [`starter-fantasy`](packages/starter-fantasy) | 黑暗奇幻 | 减少战斗，注重对话 |
| [`starter-cyberpunk`](packages/starter-cyberpunk) | 赛博朋克 | 资源、参与角色 |
| [`starter-detective`](packages/starter-detective) | 维多利亚时代的神秘故事 | 以社交为先，强调感知 |
| [`starter-pirate`](packages/starter-pirate) | 海盗 | 海军 + 近战，多区域 |
| [`starter-zombie`](packages/starter-zombie) | 僵尸生存 | 稀缺性、感染资源 |
| [`starter-weird-west`](packages/starter-weird-west) | 怪异西部 | 阵营偏见，安全区恢复 |
| [`starter-colony`](packages/starter-colony) | 科幻殖民地 | 瓶颈点、伏击区域 |
| [`starter-ronin`](packages/starter-ronin) | 封建日本 | 隐藏通道、多个保护角色 |
| [`starter-vampire`](packages/starter-vampire) | 吸血鬼恐怖 | 血液资源，社交操控 |
| [`starter-gladiator`](packages/starter-gladiator) | 历史上的角斗士 | 竞技场战斗，观众的喜爱 |

---

## 文档

| 资源 | 描述 |
|----------|-------------|
| [Create Your Own Starter](site/src/content/docs/handbook/58-create-your-own-starter.md) | 搭建新的游戏——使用 CLI 或手动模板方式 |
| [Composition Guide](site/src/content/docs/handbook/57-composition-guide.md) | 通过组合引擎模块来构建你自己的游戏 |
| [Plug-in Profiles](site/src/content/docs/handbook/59-plugin-profiles.md) | 每个实体的规则解析——混合战斗风格，`applyProfile`、配置文件模板、`profile` CLI |
| [Combat Overview](site/src/content/docs/handbook/49a-combat-overview.md) | 六个战斗支柱，五个动作，一目了然的状态 |
| [Pack Author Guide](site/src/content/docs/handbook/55-combat-pack-guide.md) | 逐步构建 `buildCombatStack`，状态映射，资源配置 |
| [Handbook](site/src/content/docs/handbook/index.md) | 全面的手册——包含所有系统，以及 4 个附录 |
| [Composition Model](docs/composition-model.md) | 6 个可重用的层及其组合方式 |
| [Examples](docs/examples/) | 可运行的 TypeScript 示例（类型检查 + 在 CI 中进行行为测试）——每个实体的混合队伍、共享配置文件、跨世界、从零开始 |
| [Design Document](docs/DESIGN.md) | 架构深入分析——动作流水线，真相与呈现 |
| [Philosophy](PHILOSOPHY.md) | 确定性世界，基于证据的设计，AI 作为助手 |
| [Changelog](CHANGELOG.md) | 发布历史 |

---

## 路线图

### 我们目前的进展

两个主要框架均已完成——共有 5494 个测试，涵盖 280 个文件，所有 10 个起始角色都在 `buildCombatStack` **和** `buildWorldStack` 中；在打印的种子下进行确定性的字节级重复播放，完整的 AI 决策评分，以及一个可以构建、运行、验证和检查的 CLI。**v3.0 使世界栩栩如生：命名的 NPC 拥有目标、信任/恐惧/贪婪/忠诚关系、义务记录和后果链；社交层被动地获得收益并在二十一个新的外交/破坏动词中进行支出；经济根据起始角色具有类型特征；并且你获得的优势最终可以达到它所控制的战役结局。在第 9 阶段审计中发现，已发布的某些内容虽然存在但实际上没有起作用——修复方案是在每个起始角色中添加了一个命名的 NPC。**

**最近的发布周期（v2.4.0–v3.0.0）：**
- v2.4.0 — 团队战斗（针对盟友/治疗/强化/复活，友方-敌方范围攻击），状态效果系统（修改器 + DoT/HoT + 反应触发器），插件配置文件第 1 阶段，内容 `validate`/`scaffold` CLI。
- v2.5.0 — 每个实体的规则解析（混合游戏风格的战斗），`applyProfile` 加载器 + 每个实体的能力，配置文件模板 + `profile` CLI，以及完整的健康状态检查。
- v2.6.0 — `run` 命令成为一个真正的游戏：敌人根据自己的 AI 配置文件行动，胜利/失败，保存/恢复，菜单中的能力和经验值，AI 工作室 bin，以及叙事堆栈。
- v2.7.0 — 世界会做出反应，并且有理由再次返回：热度 → 压力 → 叙述的后果，区域入口遭遇，任务循环 + 日记，战斗中的装备，可重复播放的运行，实时的游戏结局输入，`buildWorldStack`，导演记录，以及存档迁移接口。
- v2.8.0 — 对你所处的世界采取行动：一个实时的贸易经济 + `sell` 动词，你可以招募并与你一起战斗的伙伴，以及一个阅读整个局势的导演记录——每个系统都有一个写入线，大约有 12 个消费者，但已发布的版本中存在一些问题。
- v2.9.0 — 完成循环：`buy` + 商人库存和制作完成经济；伙伴可以独立行动；四个社交动词（贿赂/恐吓/请愿/播种）在由机会奖励资助的杠杆经济上运行；机会会随着过期 + 好感度下降而解决；装备、任务、可招募角色和起始资金均匀地分配给所有十个起始角色。
- **v3.0.0 — 使世界栩栩如生：NPC 代理生成器激活命名的 NPC（目标/关系/义务记录/后果链），以及每个起始角色中的一个故事 NPC；社交界面扩展到 25 个动词（外交 + 破坏），具有被动的杠杆收入和读取社会状态的对话；每个起始角色的类型特征库存 + 配方；杠杆结局（胜利/傀儡大师/平静的退休）变得可以实现；修理/修改菜单行，护送机会，以及一个 `audit-content` 开发 CLI——通过第 9 阶段审计发布，该审计发现了两个在绿色测试套件中隐藏的问题。**

### 下一步（v2.8 的框架）

- **活着的 NPC** — 持久化的 NPC 代理生成器，它激活了导演日志中的“PEOPLE”部分：具有目标、关系断点、义务记录和后果链的命名 NPC，以及伙伴士气好感度下降和反应系统已经具备的离开风险路径。
- 具有特定风格的商人库存和制作配方（每个启动器的特定风格线程，而不是今天发布的通用回退），以及“修理”/“修改”菜单界面。
- 杠杆经济的下一层——超出机会奖励的被动收入，以及超过已发布四个命令的社交动词（外交/破坏小组），以及读取新的社会状态的对话条件/效果词汇。
- 多人游戏——两个*人类*玩家共享一个世界（网络层，有意推迟；单个控制器共享配置文件今天以 [`shared-profiles.ts`](docs/examples/shared-profiles.ts) 的形式发布）。
- 可序列化的公式覆盖——每个配置文件的公式调整（受限于公式 DSL；配置文件今天包含状态映射，而不是闭包）。
- API 文档同步——确保每个手册页面都反映了最新的 API。

### 目标：插件配置文件

引擎的最终目标是 **用户定义的配置文件**——可移植的软件包，可以插入任何游戏。配置文件将状态映射、资源行为、AI 偏差标签和能力打包到一个可导入的单元中。从 v2.5 开始，一个世界中的实体都可以携带自己的配置文件并按每个实体解析战斗——“力量”战士和一个“意志”神秘主义者共享一个队伍，每个人都带来自己的游戏风格。

架构、`applyProfile` 加载器、每个实体的能力解析以及跨配置文件的验证都已经发布。剩下的就是多人游戏——让两个 *人类* 玩家（而不仅仅是两个实体）共享一个世界——这是一个网络层。请参阅 [配置文件路线图](docs/profile-roadmap.md) 和 [feature-architecture.md](docs/feature-architecture.md)，了解设计。

---

## 理念

AI RPG 引擎建立在三个想法之上：

1. **确定性世界**——模拟结果必须是可重现的。
2. **基于证据的设计**——应该通过模拟来测试世界机制。
3. **AI 作为助手，而不是权威**——AI 工具可以帮助生成和评估设计，但不能取代确定性系统。

有关完整说明，请参阅 [PHILOSOPHY.md](PHILOSOPHY.md)。

---

## 安全性

核心引擎是一个**仅在本地运行的模拟库**：不收集遥测数据，不使用网络，不涉及任何敏感信息。保存文件只会应明确请求时才存储到 `.ai-rpg-engine/` 目录中。**可选的** AI 层 (`@ai-rpg-engine/ollama`) 与一个**本地** Ollama 守护进程进行通信；其选择性启用的 `webfetch`（用于 RAG）是唯一的外部网络路径，并且受到 SSRF 防护机制的限制（阻止回环地址、链路本地地址、CGNAT、云元数据以及 IPv6 隧道等），除非您主动调用它，否则您无法访问它。有关详细信息，请参阅 [SECURITY.md](SECURITY.md)。

## 要求

- Node.js >= 20
- TypeScript（ESM 模块）

## 许可协议

[MIT](LICENSE)

---

由 <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a> 构建。
