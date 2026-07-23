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

- 一个**模块库**——包含 30 多个引擎模块，涵盖战斗、感知、认知、派系、谣言、移动、伙伴等。
- 一个**组合工具包**——`buildCombatStack()` 函数用大约 7 行代码将战斗功能整合在一起；`new Engine({ modules })` 用于启动游戏。
- 一个**模拟运行时环境**——确定性时间步进，可重放的操作日志，基于种子的随机数生成器。
- 一个**可选的 AI 设计工作室**——提供框架、评估、平衡分析、调整和实验功能，通过 Ollama 实现。
- 一个**可选的链上层**——`@ai-rpg-engine/ledger-adapter` 使用真实的 XRPL **测试网络**令牌来支持游戏中的货币和可交易物品，并在检查点处进行结算，完全独立于确定性核心（可选；不使用时，运行结果在字节级别上是相同的）。

## 这不是什么

- 不是一个完整的游戏——它包含 10 个可玩初始世界，你可以今天就运行它们作为示例，并且该引擎是你用来构建*自己的*游戏的工具包
- 不是一个视觉引擎——它输出结构化事件，而不是像素
- 不是一个故事生成器——它模拟世界；叙事是从机制中产生的

---

## 当前状态 (v3.2.0)

**哪些功能已经实现并经过测试：**

- 核心运行时：世界状态、事件、动作、时间流逝、重播——自 v1.0 版本以来一直稳定；确定性的字节级重播（每个实例的 ID 计数器，种子随机数生成器）
- 战斗系统：5 个动作，4 种战斗状态，4 种交战状态，伙伴拦截，失败流程，AI 策略
- 能力：消耗、冷却时间、属性检查、类型化效果、11 标签的状态词汇表，AI 感知的选择
- **队伍战斗（v2.4）：** 盟友目标选择（治疗/增益/复活）、敌我区分的范围效果过滤、目标选择器——一个治疗者可以治疗队友；敌人范围攻击不会伤害盟友
- **状态效果（v2.4）：** 被动属性修正影响战斗，确定性的 DoT/HoT 基于时间流逝计数器，深度限制的反应触发器（荆棘/反射）
- **插件配置文件——每个实体的规则解析（v2.5）：** 一个“力量”战士和一个“意志”神秘者在一个战斗中解决冲突，各自读取通过自己的映射表中的属性。`RuleProfile` + `WorldState.ruleProfiles` + `EntityState.ruleProfileId`；`applyProfile()` 附加一个配置文件（属性映射、资源池、每个实体的能力）；`buildProfile()`、`validateProfileSet()`（拒绝重复的 ID），10 个基于初始模板的配置，以及一个 `profile` CLI 命令
- **可运行的“run”循环（v2.6）：** 最终游戏是真实的，而不是演示——敌人根据自己的 AI 意图配置文件（“积极”、“谨慎”、“领地意识”、“计算”）行动，战斗以胜利或失败结束，你可以保存并恢复进度，能力和经验值显示在动作菜单中。`run <path>` 加载你构建的游戏。由一个易于查看的 HUD 和可访问的颜色方案组成的终端 UI（支持 `NO_COLOR`/非 TTY）。
- **AI 设计工作室以其自身的“ai”命令形式提供（v2.6）：** `npm install -g @ai-rpg-engine/ollama` → `ai chat`——构建、评估和平衡内容，并与本地 Ollama 模型进行比较。
- 统一的决策层：战斗 + 能力评分合并到一个调用中（`selectBestAction`）
- 所有 10 个初始世界都使用 `buildCombatStack()`——经过验证的组合框架
- 用于每个初始 AI 调整的认知配置 API (`cognition: CognitionCoreConfig | false`)
- 内容创作的标签分类和验证工具
- **世界会做出反应（v2.7）：** 击杀会增加热度并降低区域安全性；每回合的世界时间流逝会产生隐藏的压力，这些压力会以谣言的形式出现（“你听到了一些耳语……”），升级，并在一段时间后消失，从而产生后果；在所有 10 个初始世界中，大约有 30 个已编写好的遭遇组合会在进入区域时触发——基于种子的确定性，更危险的区域会产生更多敌人，Boss 的场景受到保护。
- **再次返回的理由（v2.7）：** 在长期存在的架构上构建了一个最小的任务循环——任务在触发器处提供，跟踪击杀/到达/进度目标，并准确地一次性奖励经验值和物品；四个已编写好的任务、一个“日志”屏幕，以及回合叙述中的任务节点。
- **装备影响战斗（v2.7）：** `equip`/`unequip` 会将实际数值传递到状态层，而战斗公式已经读取了这些数据——无需更改任何战斗代码；角斗士的三叉戟和渔网从头到尾都与一个经过测试的命中率差异相关联。
- **基于种子的运行（v2.7）：** 每次新的会话都会打印其种子以及确切的重播命令；`--seed <n>` 会逐字节地重现一次会话；战斗、抗性、能力和策略掷骰子都使用世界种子——并且结局会读取你实际玩过的游戏（实时的热度、压力、派系积累、玩家等级）。
- **`buildWorldStack()`（v2.7）：** 战略组合框架，与 `buildCombatStack()` 并行——一个调用组装环境、派系、谣言、区域、失败后果、遭遇和任务；此外还有“总监日志”策略屏幕、一个 `AI_RPG_DEBUG=1` 模拟检查器、以及由与继续功能相同的权限控制的 `inspect-save`。
- **作用于动态经济（v2.8）：** `createEconomyCore` 在加载包时为每个区域创建一个经济系统，并在每回合中对其进行更新；一个新的“出售”动词通过 `computeItemValue` 对战利品进行定价（稀缺性/派系/来源/走私品），并改变当地的供应。一个编写好的代码点亮了五个在 v2.7 版本中处于隐藏状态的系统——总监的市场概览 + 派系评分、最终商人王子弧线和崩溃触发器，以及四种经济压力类型。“本周期仅允许出售”（购买→v2.9）。
- **伙伴（v2.8）：** 一个“招募”动词构建一个队伍——状态、标签和派系，因此伙伴会*与你*一起战斗；伙伴的战斗依赖于战斗核心的拦截机制（在 `isAlly` 设置之前处于隐藏状态），伙伴会对士气做出反应并可能离开，并且招募会激活七个等待使用的功能——最终的“伙伴”名单、队伍目标选择、NPC 代理目标、恩惠任务以及总监的“队伍”部分。“本周期被动拦截”（独立的回合→v2.9）。
- **总监可以查看整个棋盘（v2.8）：** 一个新的装备日志部分（基于 CLI 到装备来源的依赖关系），一个总监总结最终预告片，市场概览 + 队伍部分现在从实时生成器中获取数据，以及区域稳定性和经济基调在最终的“区域”部分中显示。
- **经济的另一半（v2.9）：** 一个“购买”动词完成了循环——每个区域提供的商人库存以供应类别为粒度（供应水平*是*补货信号），价格通过与“出售”相同的 `computeItemValue` 管道确定，并加上买卖价差，因此不存在无风险的循环交易。并且制作功能也开始运行：`createCraftingCore` 在已编写好的配方表中注册了“回收/制作/修理/修改”，从而点亮了总监的“材料 + 配方”部分，这些部分在之前处于隐藏状态。
- **伙伴拥有自己的回合（v2.9）：** v2.8 版本中的被动拦截机制成为上限——招募的伙伴会在每个回合中通过先前未使用的 `selectBestAction` 顾问独立行动，并具有基于角色的战斗偏好，因此战士和学者会以不同的方式战斗，伙伴之间的拦截以及队伍生命值显示在总监的“队伍”部分。没有伙伴的包仍然是字节级的（空队伍门控保留了种子 0 的旧重播）。
- **完整的社交层面，从头到尾连接起来（v2.9）：** 四个杠杆动词——“贿赂”、“恐吓”、“请愿”、“散布”（谣言）——写入实际的声誉/警报/热度全局变量，这些变量会影响已经读取定价和派系门控的因素，并且“散布”点亮了整个玩家-谣言模块以及总监的“关于你的谣言”部分。支持它们的“杠杆经济”也连接起来：完成一个机会现在会授予它一直以来所叙述的杠杆，因此这些动词可以在游戏中真正获得。
- **机会，完整的生命周期（v2.9）：** 每个回合的生成器都会提供根据实时世界状态评分的合同/赏金/恩惠；你“接受”，然后“完成”或“放弃”；忽略一个机会直到其截止日期现在会产生后果（过期影响），并且完成伙伴的恩惠会改变该伙伴的士气。最终游戏中不断增长的力量和商人王子弧线会读取你实际解决的机会。
- **所有十个初始世界的内容一致性（v2.9）：** 装备连接、任务、可招募的伙伴以及起始金币余额已扩展到每个缺少这些内容的初始世界——现在这十个世界共享一个统一且完全点亮的功能表面（装备仅限于角斗士；任务仅限于奇幻/僵尸；五个世界都提供了“招募”，但没有可以招募的人）。此外还有一个结构化内容验证器，它可以捕获跨所有引用表面的拼写错误的项目 ID，以及带有 `--checkpoint`/`--list-checkpoints` 的多检查点保存槽。
- **活着的 NPC，真正活着（v3.0）：** 持久的 npc 代理生成器点亮了总监的“人物”部分——命名的 NPC（每个初始世界都有一个已编写的故事角色，以及你招募的每个伙伴）都具有目标、信任/恐惧/贪婪/忠诚关系、义务记录和后果链。`runNpcAgencyTick` 在每个回合中运行，并进行门控，因此没有命名 NPC 的世界仍然与旧重播字节级一致。点亮生成器还点亮了伙伴恩惠-失败离开的断点，两个休眠的机会生成规则（NPC 目标 + 义务），以及最终游戏中 npcProfiles/npcObligations——该连接在已发布的内容中经过测试并且处于绿色状态，但在第 9 阶段审计中发现它处于非活动状态，因此修复程序会在每个初始世界中添加一个已编写的命名 NPC。
- **完整的社交层面（v3.0）：** 四个杠杆动词变为二十五个——外交和破坏组注册（另外 21 个子动词），点亮了先前隐藏的 `leverage-diplomacy`/`leverage-sabotage` 伙伴反应；十九个出现在编号菜单上（负担 + 冷却 + 声誉门控）。对话条件和效果现在读取并写入社交状态（杠杆/声誉/NPC 关系）。并且被动杠杆收入 (`tickLeverage`/`computeLeverageGains`) 会从声誉中滴漏影响力，并从经验值和里程碑中授予恩惠/勒索/合法性——因此社交层面会在机会之间获得收益，而不仅仅是在完成时。
- **具有风格的经济（v3.0）：** 商人库存和制作配方现在会解析每个初始世界的类型表（十个初始世界中有七个包含已编写的类型内容；三个回退到通用），跨购买/制作机制、编号菜单显示以及总监的“配方”部分，所有这些都来自相同的规则集密钥，因此显示和机制一致。`repair` 和 `modify` 现在是编号菜单行（项目×配方配对），并且“护送”机会会在危险区域中进行保护性旅行时生成。
- **最终游戏会读取你获得的杠杆（v3.0）：** “胜利”、“傀儡大师”和“安静的退休”战役结局——长期以来，这些结局都依赖于影响力/勒索/合法性，而最终游戏层将其作为硬编码的零来读取——现在可以通过整个社交经济写入的实际杠杆存储来实现。伙伴离开也可以通过 NPC 代理断点和士气下限回退来实现。
- **`audit-content` 开发 CLI（v3.0）：** 一个开发人员内容审计命令（与 `validate` 同级，不同于面向玩家的总监日志），它会在一个包上运行六个遭遇/Boss/战斗总监格式化程序。
- **具有风格的*起始供应*——v3.0 的开场白，已交付（v3.1）：** `economyGenre` 将每个初始世界的裸规则集密钥传递到 `buildWorldStack` → `createEconomyCore`，因此一个区域现在会播种其类型的 `GENRE_SUPPLY_DEFAULTS` 配置文件（赛博朋克风格的物品供应量高/走私品，奇幻风格的药品稀缺），而不是通用的基线——总监的市场基调和最终游戏输入已经读取了起始供应。十个初始世界中有七个包含类型配置文件；三个回退到基线，这是诚实的做法。与 `tradeGenre`/`craftingGenre` 分开的一个字段，以便这三个可以在以后发生变化。
- **完整的社交层面（v3.1）：** “否认”和“掩盖丑闻”——谣言操作对，它通过 ID 锁定现有的谣言而不是派系——到达编号菜单，通过一个谣言目标配对维度，从而关闭了二十一个动词的表面（从 19 个增加到 21 个）。
- **`obligation-exists` 对话，已连接并可访问（v3.1）：** 该对话条件读取命名 NPC 持有的义务记录 (`getPersistedNpcObligations`)——奇幻风格中的阿尔德里克兄弟，一旦他通过普通的 NPC 代理玩法欠你一份恩情，就会解锁一个“呼叫恩惠”选项——这是一个真正的门控，而 v3.0 版本中留下了一个始终为真的静默存根（第 9 阶段的已玩会话审计证明它可以在实际游戏中访问，而不仅仅是在单元测试中）。
- **具有风格的修理（v3.1）：** 每个包含类型的初始世界都会在其类型表中编写一个签名“修理”配方（奇幻风格的“修复符文”，赛博朋克风格的“修复纳米焊接”），并通过 `getAvailableRecipes` 进行显示——现在修理也具有风格，而不仅仅是通用的。
- **可选的 XRPL 账本结算（v3.2）：** 一个新的可选 `@ai-rpg-engine/ledger-adapter` 包将玩家拥有的可交易层绑定在一起——“硬币”→ IOU，消耗品→可替代代币，检查点的净“购买/出售”差异→已结算的 **XLS-85 代币托管** 到 **XRPL 测试网**，完全独立于确定性核心。`core`/`modules` 中的任何内容都不会导入它，并且运行与否在字节级别上都是相同的（在实际的海盗 `createGame()` 商人循环中得到了证明）。仅限测试网，通过代码中不可能实现的保护措施进行保护，具有被忽略的秘密侧文件、安全的重试、链上备忘录验证和未锚定的回退；已在测试网上进行了端到端的实时测试（通过代币托管结算→与链上余额 + 备忘录对账）。NFT 独特的装备是一个有意的后续切片。请参阅[XRPL 账本适配器](#the-xrpl-ledger-adapter-opt-in)。
- `ai-rpg-engine create-starter <name>`——构建一个新的游戏（独立，在单仓库外部运行）；`validate` + `scaffold` 内容命令；从 JSON 加载包。
- 已发布的初始模板在 npm 上 (`@ai-rpg-engine/starter-template`)
- 完整的测试套件：**5633 个测试**（跨重复运行的确定性；测试文件在 CI 中进行类型检查；覆盖率强制执行）。

**哪些部分存在缺陷或不完整：**
- 人工智能世界构建工作室（Ollama 层）的测试不如模拟核心充分，需要一个本地 Ollama 守护进程；它是完全可选的——引擎和 `run` 循环不需要网络连接。
- 叙事/音频堆栈会生成确定性的音频命令，但**没有终端音频后端**——没有任何东西会发出声音；这些命令是 GUI/Web 集成的一个接口。
- 多人游戏（两个人类玩家共享一个世界）**尚未构建**——它是一个网络层，有意不在设计范围内；目前的配置针对单个控制器。
- `replay --replay` 会恢复存档而不是重新模拟——并且在 v2.9 之后，这就是**既定的**方向，而不是推迟：`Engine.serialize()` 已经是一种经过验证的完整状态快照，而重新模拟则需要跟踪存在于操作日志之外的世界时间/遭遇状态。v2.9 版本通过这种经过验证的恢复路径提供了多检查点存档插槽；真正的基于事件的重新模拟尚未计划。
- v3.1 关闭了 v3.0 的三个既定限制——游戏**起始资源**、特定类型的*修复*配方，以及 `deny`/`bury-scandal` 菜单界面现在都已发布。剩下的唯一限制是：新的游戏修复配方包含一个作者编写的 `statDelta`（一个小幅属性加成），而 `resolveRepair` 函数尚未应用——修复*恢复*，`modify` *升级*——因此，将修复作为升级的功能在代码中标记并**推迟到 v3.2/v3.3 版本**，这是一种有意的机制调用，而不是一个静默的、不活跃的字段。并且 `obligation-exists` 附带了一个作者编写的演示示例（Brother Aldric）；该条件已激活，供内容创作者用于控制更多对话。
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

## XRPL 分账本适配器（可选）

`@ai-rpg-engine/ledger-adapter` 是一个**可选**包，它将游戏的
**玩家拥有的可交易层**——`coin` 余额和消耗品库存，这些是 `trade-core` 的 `buy`/`sell` 命令已经处理的——绑定到 **XRPL 测试网络**，以便
这些资产可以由实际的分账本令牌支持，并在检查点处结算。
如果缺少适配器，则会得到今天发布的离线引擎。

**确定性不变性（最重要的）。** 适配器是一个*侧通道*，
它永远不会是模拟的一部分：

- 它**绝不会在确定性循环内部被调用**——而仅在**检查点**处（存档、城镇/市场入口、章节结束）被调用。
- `@ai-rpg-engine/core` 或 `@ai-rpg-engine/modules` 中没有任何内容会导入它（它唯一的引擎依赖项是编译时的 `import type`）。
- **无论是否使用它，运行结果都是完全相同的。** 防火墙测试会在两个引擎上运行真实的 `starter-pirate` `createGame()` 商家循环——一个启用了适配器并在检查点处结算，另一个没有启用——并断言这两个世界是深度相等的。种子 0 的重放操作不受影响。

**集成级别——游戏可以根据其设计需求尽可能深入地将其整合。**
防火墙是一个*确定性*边界，而不是一个反集成规则；上述不变性在所有级别都成立：

| 级别 | 哪些部分依赖于适配器 | 适用情况 |
|-------|-----------------------------|------|
| **L0 — External observer** | 游戏内部没有任何内容；适配器从外部在检查点处连接，并且游戏对此一无所知。 | 对现有游戏进行改造（发布的盗贼演示）。 |
| **L1——游戏驱动的检查点** | 游戏自身的存档/城镇/元进度流程会在定义的时刻调用适配器。 | 一个想要有意的分账本时刻的游戏。 |
| **L2 — Ledger-native design** | 游戏的经济或身份是围绕链上所有权（持久的发行者、真实的交易市场）设计的。 | 一个以分账本为先导的商家游戏。 |

保持重放操作安全的关键区别**不是**“哪个包导入了适配器”，而是“调用是否在循环内部”。 游戏包可以自由地导入和驱动适配器，只要每个调用都在种子驱动的重放循环之外的检查点处进行即可。

**三种游戏模式。** `offline`（默认——没有链，即发布的引擎）· `ledger`（硬币/物品由测试网络余额支持，并在检查点处结算）· `diary`（离线游玩，然后将运行状态哈希值锚定在分账本上，以获得防篡改的收据）。

**哪些内容位于分账本上。** `coin` → 针对信任线路发行的货币 IOU；消耗品 → 可替代的令牌；检查点的净交易差额 → 通过 **XLS-85 令牌托管** 进行结算的转账。作为 NFT 的独特装备是一种有意的后续扩展。抽象区域经济（`economy-core`）*不会*受到影响——它仍然是一个纯模拟。

**安全保障。**仅限测试网络，并具有一个**在代码中不可能实现的主网**结构保护（而不是配置标志）；钱包种子位于 git 忽略的 secrets 侧文件，绝不在存档文件中；结算是幂等的，并且在重试路径上可以保证资源守恒；证明会验证**真实的分账本备忘录**（而不是引擎自身的字符串）；如果无法访问链，则运行将继续进行，并标记为*未锚定*。

**经过实际测试。** 一个真实的 `starter-pirate` 商家运行——出售一把弯刀，购买一枚炮弹——通过令牌托管在 XRPL 测试网络上结算，然后 `reconcile()` 会将分账本余额和备忘录与引擎的经济系统进行确认（对于每个令牌都保证资源守恒）。 分账本是一个与引擎不同的系统家族，因此引擎无法伪造它——对账是一种真正的外部验证器。仅限测试网络；资产是游戏范围内的收据，而不是证券。

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
| [`@ai-rpg-engine/ledger-adapter`](packages/ledger-adapter) | **可选**——选择加入 XRPL 测试网络结算，用于玩家拥有的可交易层（硬币/库存/交易），通过在检查点处使用 XLS-85 令牌托管进行结算，完全位于确定性核心之外。 |

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
| [XRPL Ledger Adapter](site/src/content/docs/handbook/60-xrpl-ledger-adapter.md) | 选择加入分账本结算——确定性防火墙、L0/L1/L2 集成级别、游戏模式、安全保障以及经过实际测试的盗贼演示。 |
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

核心引擎是一个**仅本地运行的模拟库**：不收集遥测数据，不使用网络，不涉及任何敏感信息。保存文件只会应明确请求时才存储到`.ai-rpg-engine/`目录中。两个**可选**层添加了向外连接路径，并且只有在你调用它们时才会生效：

- AI 层（`@ai-rpg-engine/ollama`）与一个**本地** Ollama 守护进程通信；其选择性启用的 `webfetch` 功能（用于 RAG）受到 SSRF 防护的限制（阻止回环地址、链路本地地址、CGNAT、云元数据以及 IPv6 隧道等）。
- 分账本层（`@ai-rpg-engine/ledger-adapter`）连接到**XRPL 测试网络**——并且仅连接到测试网络：一个**代码中明确禁止连接到主网**的结构性防护机制（而不是配置标志），在构建时会拒绝任何非测试网络的宿主机。钱包种子存储在一个被 git 忽略的单独文件中，绝不会存储在保存文件中，并且确定性的核心引擎永远不会导入该适配器。

详情请参阅 [SECURITY.md](SECURITY.md)。

## 要求

- Node.js >= 20
- TypeScript（ESM 模块）

## 许可协议

[MIT](LICENSE)

---

由 <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a> 构建。
