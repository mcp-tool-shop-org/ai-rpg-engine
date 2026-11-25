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

哪些方法有效且经过验证？
- **不再拒绝“世界工坊”资源包（v3.12.2）：**加载程序会声明“世界工坊”导出的 13 个顶级键（`connections`、`spawnPoints`、`playerTemplate`以及另外十个）为已知但未加载，因此，包含这些键的有效资源包将被加载，并且加载报告会列出每个键，并显示为已卸载。 即使密钥拼写错误，系统仍然会拒绝该密钥。 哈希值未发生变化。
- **Godot 主机（v3.12）：** sidecar `capabilities.audio` 传输一个 `felt` 数据包（包括提示 ID、叠加效果、语音文本、UI 效果），该数据包不会进行哈希处理——通过协商进行增量更新，并在禁用该功能时完全省略，因此，完全匹配的客户端可以保持字节级的稳定性。 [`ai-rpg-stage`](https://github.com/mcp-tool-shop-org/ai-rpg-stage) 是 Godot 4 中的用户界面元素：它采用 2:1 比例的等距视图 TileMapLayer，使用 Foundry 字体，并采用点击单元格的方式进行呈现，`move` 仍然用于命名相邻区域。 手册：[视觉客户端](site/src/content/docs/handbook/66-visual-clients.md)。
- **调整和深度（v3.11）：** `bounty` 再次针对已创作的内容进行处理（v3.10 监听器的清理操作使“黑旗”的两次海军战果间隔了 36 个回合；热效应的优势在于这种可测量的间隔，即使间隔开，仍然是两次战果）。 一场因有人逃跑而结束的战斗，说明了：`combat.encounter.cleared` 承载着 `outcome: 'victory' | 'retreat'` ——它不是一次次要事件，也不是一次微不足道的胜利，更不是一次值得记录的成功。 阵营成员资格有三个可靠的来源：`entity.faction`，即个人信息；一个保存的登记册，它会从中获取信息并继续记录额外信息；以及`CompanionState.originFaction`，这样他们所属的公会仍然可以接收信息。 区域音乐每 `zoneId` 播放一次；音效会遵守冷却时间；`/build` 中的分阶段写入操作可以避免程序崩溃；新的命令行界面会话会发出“进入起始区域”事件，因此关键时刻会显示最初的情绪。 进行了 8356 次测试。
——**信息传递给玩家（v3.10）：** 经过两个周期，信息最终传递到玩家的感官。 所有八个旁白提示都会生效——NPC的形象和所属阵营会影响说话者的呈现方式，语气提示会影响说话者的表达方式，队伍成员的存在、世界局势以及潜在机会会以旁白的形式结束对话，而区域氛围和事件报告则会添加到事件日志中。 抬头显示器始终保持开启状态，并显示最新的官方信息。 真正的战斗诚实性体现在一个实际事件中：当最后一个敌方单位被击败时，代码 `combat.encounter.cleared` 将被精确执行一次（双方同时被击杀会被视为失败，同伴的死亡不再意味着胜利，并且之前在每次击杀时都会播放欢呼声的九个初始监听器也将停止）。此事件与每回合呈现器关联，从而触发胜利音效。 区域进入时，系统会处理并呈现具有语调变化的音乐——一个阴暗的区域确实会发出阴暗的声音——并且语音输出的合同是真实的：`NarrationPlan.asides` 精确地传输对话片段一次，`SpeakerCue.emotion` 完整地传输语调提示，以便用于文本转语音（TTS）嵌入。 Sidecar 客户端在 `initialize` 上看到数据包接收情况 `dropped[]`/`advisories`，每个批次都按照 `/build` 的指导完成每个步骤（批处理同意，具有 CREATE 感知的撤销功能，以及一种无法绕过限制的拒绝功能），分层结构得以保留 `emit-pack`，并且分层身份从实体自身创建的 `faction` 中解析，无需再使用注册表，也不需要已发送的数据包来填充——从而实现对区域入侵者的追踪和对谣言传播的抑制。 一次游戏会话会将整个表面逐帧固定，确保每个帧的 e2e 字节完全相同，即 NO_COLOR。
- **您编写的资源包就是您玩的游戏（v3.9）：**现在，工作室负责编写引擎启动时所需的一切内容——`create-ruleset`、`create-rule-profile`和`create-item-placement`加入了框架中的动词，并且无论是`/build`计划还是`ai scaffold-and-critique`，最终都会通过输出`content/pack.json`来完成。 `applyContentPack` 会从单人游戏包中提取 `playerId`/`locationId`，设置阵营声望基准值和规则配置文件注册表（合并，且不会删除主机上的数据），并将游戏包的清单和规则集传递到 `extractSessionContent`——经过记录的 JSON 启动脚本已得到修正，并通过端到端测试进行固定。 对话变得更加生动：一个非玩家角色提到了桌子上实际存在的合同，或者说，当他带着同伴到达阴暗的区域时，对话会呈现出不同的情景；游戏中的顾问也会说出一些面向玩家的台词。 战役记忆日志伴侣会保存并记录制作出的物品，图像变体将保留其身份标识（支持 LoRA），谣言的影响会逐渐消失，并且胜利音效不再会影响区域主题。 进行了 8042 次测试。
- **宿主表面位于引擎（v3.8.1）中：** `hash`、`present`、`preview`、`getAvailableActions`、`advanceRound`、侧边栏 `listActions` + 保存/加载功能、工作室 `emit-pack`、JSON 数据包目录以及 `ruleProfiles`。 Godot 引擎的附加功能和 JSON `--content` 启动程序不再复制命令行界面 (CLI) 的内部结构，从而避免了人为地创建接口。
- 核心运行时：世界状态、事件、动作、时间步、重放——自v1.0版本以来保持稳定；确定性的字节级重放（每个实例的 ID 计数器、带种子的随机数生成器）
- 战斗系统：5 种行动方式，4 种战斗状态，4 种交战状态，伙伴拦截，失败流程，人工智能战术。
——能力：包括费用、冷却时间、属性检定、效果类型、11种状态标签词汇以及人工智能辅助选择。
- **团队战斗（v2.4）：** 针对盟友（治疗/增益/复活），区分友方/敌方AoE，目标选择器——治疗者可以治疗队友；敌人AoE不会攻击盟友。
- **状态效果（v2.4）：**被动属性修正值会影响战斗，确定性的DoT/HoT会从倒计时器中扣除，具有深度的反应性触发器（例如：带刺/反射）。
- **插件配置——按实体进行规则解析（v2.5）：**一个`might`战士和一个`will`神秘主义者在一场战斗中进行对战，双方各自读取自己的属性数据。 `RuleProfile` + `WorldState.ruleProfiles` + `EntityState.ruleProfileId`；`applyProfile()` 用于附加配置（状态映射、资源池、每个实体的能力）；`buildProfile()`、`validateProfileSet()`（拒绝重复的 ID），10 个基于初始配置的模板，以及一个 `profile` 命令行工具。
- **可玩循环 `run`（v2.6）：** 这是一款完整的游戏，而不是演示版——敌人会根据自身的 AI 行为模式（`aggressive`/`cautious`/`territorial`/`calculating`；现在有六种内置模式，以及 `passive` 和 `follower`）采取行动，战斗以胜利或失败告终，您可以保存并继续游戏，技能和经验值都可以在操作菜单中找到。 `run <path>` 加载您预先构建的游戏。 设计简洁的终端用户界面，配备一目了然的抬头显示器 (HUD) 和可访问的色彩方案（支持 `NO_COLOR` / 非 TTY）。
- **人工智能设计工作室以其自身的 `ai` 命令形式发布（v2.6）：** `npm install -g @ai-rpg-engine/ollama` → `ai chat` ——利用本地 Ollama 模型，对内容进行初步构建、评估和调整，以达到平衡。
- 统一的决策层：将战斗和能力评分合并到一个函数调用中（`selectBestAction`）。
——所有 12 个初始世界都使用了 `buildCombatStack()`，这是一种经过验证的、可靠的基础架构。
- 用于每个启动器的 AI 调优的认知配置 API (`cognition: CognitionCoreConfig | false`)
- 用于内容创作的标签分类和验证工具。
- **世界会做出反应（v2.7）：** 敌人的数量会增加热度，降低区域的安全性；每一轮游戏都会触发隐藏的事件，这些事件会以谣言的形式出现（“你听到了耳语……”），并逐渐升级，最终以某种后果结束；大约有 30 种精心设计的遭遇战，会在玩家进入区域时触发，并且在所有 10 个起始区域中都会发生——这些遭遇战是确定性的，并且会根据种子值进行变化；敌人数越多、区域越危险，就会出现更多的遭遇战；Boss 战场景受到保护。
- **返回的理由（v2.7）：** 在已发布的游戏框架中，提供一个简单的任务循环——任务会在特定触发条件下出现，跟踪玩家的击杀、到达或进度目标，并且只奖励一次经验值和物品；包含四个精心设计的任务，一个“日志”界面，以及在游戏回合叙事中穿插的任务节点。
- **装备进入战斗状态（v2.7）：** `equip`/`unequip` 将实际数值传递到状态层，以便战斗公式读取——无需更改任何战斗代码；角斗士的三叉戟和渔网从一端到另一端都连接在一起，并使用测试引脚来调整命中几率。
- **基于种子值的运行（v2.7）：**每次新的游戏会话都会打印其种子值以及确切的重放命令；`--seed <n>`可以完全重现一次游戏会话；战斗、抵抗、能力和战术掷骰都会消耗世界种子值——并且结局会反映您实际玩过的游戏（包括实时热度、压力、派系积累、玩家等级）。
- **`buildWorldStack()` (v2.7)：** 位于`buildCombatStack()`旁边的战略构架核心——一次调用即可整合环境、派系、谣言、区域、失败后果、遭遇和任务；此外，还包括**导演日志**战略界面、一个`AI_RPG_DEBUG=1`模拟检查器、一个与“继续”功能由相同权限控制的`inspect-save`模块，以及一个用于已发布版本的恢复路径的模块保存-迁移接口。
- **模拟真实经济（v2.8）：** `createEconomyCore`会在每个区域内启动一个经济系统，并在每个回合中对其进行调整；一个新的`sell`动词会根据`computeItemValue`（稀缺性/派系/来源/走私品）来确定战利品的价值，并调整当地的供应情况。 通过一个“写入-线路”功能，激活了五个系统，这些系统最初在v2.7中处于未激活状态——包括“总监的市场概览 + 派系”评分系统、游戏结局中的商人王子剧情和崩溃触发机制，以及四种经济压力类型。 **本周期仅限出售**（购买 → v2.9）
- **伙伴（v2.8）：**一个`recruit`动词用于构建队伍——包括状态、标签和阵营，因此伙伴会*与*你一同战斗；伙伴战斗会触发战斗核心的拦截机制（在`isAlly`设置之前处于隐藏状态），伙伴会根据士气做出反应，并且可以离开；招募伙伴会激活七个等待中的消费者——最终阶段的伙伴名单、队伍目标、NPC行动目标、好感任务以及导演的“队伍”部分。 **本回合的被动拦截**（独立回合 → v2.9）
- **导演查看整个流程图（v2.8）：**新增“设备记录”部分（位于命令行界面与设备来源依赖关系之后），“导演总结”结尾预告片，现在从实时制作方获取数据的“市场概览”和“活动”部分，以及结尾部分的“区域”中显示的区域稳定性和经济状况。
- **经济的另一半（v2.9）：**一个`buy`动词完成了整个流程——即，按区域和供应类别细分，提供商库存，供应级别就是补货信号，价格通过与`sell`相同的`computeItemValue`流水线确定，再加上买入/卖出价差，从而不存在无风险的循环交易。 制作过程变得生动起来：`createCraftingCore`会在已编写的配方表中注册`salvage`/`craft`/`repair`/`modify`，从而点亮“导演”部分的“材料 + 配方”栏，此前该栏一直处于未激活状态。
- **伙伴轮流行动（v2.9）：**来自v2.8的被动拦截层变为天花板——招募的伙伴在每一轮中通过之前未使用的`selectBestAction`顾问独立行动，每个角色都有不同的战斗倾向，因此战士和学者的战斗方式不同，伙伴之间进行拦截，并且队伍的生命值显示在导演的队伍行中。 不包含伴侣的包仍然保持字节级别的完全一致（空包门电路保留了种子 0 的历史回放功能）。
- **社交层，端到端连接（v2.9）：**四个关键动词——`bribe`、`intimidate`、`petition`、`seed`（谣言）——用于编写真实的声誉/警报/热度全局变量，这些变量会影响价格和阵营关系，并且已经读取。此外，`seed`会激活整个玩家谣言模块，以及总监的“关于你的谣言”部分。 为他们提供资金的“杠杆经济”体系也得到了完善：现在完成一项任务就能获得它一直以来所承诺的收益，因此，在游戏中，这些行动确实能够带来实际的回报。
- **机会，涵盖整个生命周期（v2.9）：** 每轮都会生成新的合约/任务/请求，这些合约/任务/请求的评分会根据当前的游戏世界状态进行调整；您`accept`，然后`complete`或`abandon`；现在，如果忽略某个合约/任务/请求，直到其截止日期，将会产生后果（过期影响），而完成一个伙伴的请求则会提升该伙伴的士气。 在游戏后期，随着新兴势力的崛起和商人贵族的兴起，玩家会发现自己实际上已经解决了许多问题。
- **所有十个初始世界的内容保持一致（v2.9）：**包括装备配置、任务、可招募的伙伴，以及初始金币余额。所有缺少这些内容的初始世界都已更新，现在这十个世界共享一个统一且功能完善的游戏界面（之前装备仅限于角斗士世界；任务仅限于奇幻/僵尸世界；五个世界最初发布时没有可招募的伙伴`recruit`）。 此外，还增加了一个结构化内容验证器，它可以检测所有引用界面中是否存在拼写错误的条目 ID，并提供具有 `--checkpoint`/`--list-checkpoints` 的多检查点保存槽。
- **栩栩如生的 NPC，真正具有生命力（v3.0）：** 持续存在的 NPC 代理生成器点亮了导演的“人物”部分——命名的 NPC（每个起始角色对应一个故事人物，加上你招募的每个伙伴）都拥有目标、信任/恐惧/贪婪/忠诚关系、义务记录以及后果链。 `runNpcAgencyTick` 在每一轮中运行，并设置了限制，以确保没有命名 NPC 的世界与旧版本的存档完全相同。 除了照亮制作人之外，还照亮了同伴、好感度下降、任务结束等关键节点，以及两个休眠的事件触发规则（NPC目标 + 义务），还有游戏结局的 npcProfiles/npcObligations。虽然测试时发现该环节正常，但在发布的内容中却不起作用，直到在第九阶段的审核中发现了问题，因此修复方案是在每个起始关卡中添加一个预先设定的、有名字的 NPC。
- **完整的社交界面（v3.0）：**四个关键动词扩展为二十五个——外交和破坏小组注册（新增 21 个子动词），从而激活了之前未激活的`leverage-diplomacy`/`leverage-sabotage`相关反应；另外十九个选项出现在编号菜单中（受“可承受性”+“冷却时间”+“声望”的限制）。 对话条件和效果现在会读取并写入社交状态（影响力/声望/与 NPC 的关系）。 被动杠杆收益（`tickLeverage` / `computeLeverageGains`）会通过声誉产生影响力，并从经验值和里程碑中获得优势/施加压力/提升合法性——因此，社交层可以在不同机会之间获益，而不仅仅是在完成任务时。
- **具有风格化的经济系统 (v3.0)：** 商人的商品和制作配方现在会根据每个起始角色的风格表进行调整（十个起始角色中有七个带有独特的风格内容；另外三个则使用通用的内容——说实话）。这种调整贯穿于购买/制作机制、编号菜单显示以及导演的“配方”部分，所有这些都来自相同的规则集，因此显示和机制保持一致。 `repair` 和 `modify` 现在是带有编号的菜单行（物品与配方配对），并且在危险区域的保护性旅行门处会随机出现 `escort` 个机会。
——**游戏结局会读取你所获得的优势（v3.0）：**即 `victory`、`puppet-master` 和 `quiet-retirement` 这三个战役结局——它们原本需要通过影响力、勒索或合法性等方式才能解锁，而游戏结局阶段会将这些视为硬编码的零值——现在可以通过游戏中真实的优势系统来解锁，而这个优势系统则反映了整个社会经济体系。 通过非玩家角色（NPC）的行动触发点和士气下限机制，也可以实现同伴的离队。
- **`audit-content` 开发命令行界面 (v3.0)：** 一条开发者内容审核命令（与`validate`相关，但与面向玩家的“导演日志”不同），它会对一个内容包中的六个遭遇战/Boss战/战斗导演进行格式化处理。
- **具有特定风格的《起始物资》——v3.0的开局，通过（v3.1）提供：** `economyGenre`将每个起始套装的核心规则通过`buildWorldStack`→`createEconomyCore`进行串联，因此，每个区域现在都会根据其风格来设定`GENRE_SUPPLY_DEFAULTS`（例如，赛博朋克风格强调组件/走私品，奇幻风格强调稀缺的药品），而不是采用统一的通用基准——这决定了总监的市场基调，并且已经确定了游戏结局所需的要素。 在十名首发球员中，有七名球员具备某种特定风格；另外三名球员的表现则相对平平。 与`tradeGenre`/`craftingGenre`分开的字段，以便这三个字段以后可以各自独立发展。
- **社交界面，已完成（v3.1）：** `deny`和`bury-scandal`——这是一对针对现有谣言的谣言操纵程序，它们通过谣言目标配对维度来访问编号菜单，而不是针对某个派系，从而关闭了包含二十一个动词的界面（从19个界面扩展到21个界面）。
- **`obligation-exists` 对话，通过线路连接并可访问（v3.1）：**对话条件读取一个已命名的 NPC 的持久性义务记录（`getPersistedNpcObligations`）——例如，在奇幻故事中，当“艾德里克兄弟”通过常规 NPC 互动方式欠你一次人情时，会解锁一个 `call-in-favor` 选项——一个真正的关卡，在那里 v3.0 留下了一个始终为真的隐藏代码（一次“第九阶段”游戏会话审计证明，在实际游戏中可以访问该代码，而不仅仅是在测试环境中）。
- **具有类型风格的修复（v3.1）：**每种具有特定类型特征的初始作者都会在其类型表中编写一份独特的`repair`配方（例如，奇幻`repair-rune-mend`、赛博朋克`repair-nanite-weld`……），并通过`getAvailableRecipes`进行呈现——修复现在具有了类型风格，而不仅仅是通用的。
- **选择加入 XRPL 分账账本结算（v3.2）：**一个新的可选 `@ai-rpg-engine/ledger-adapter` 包将玩家拥有的可交易层绑定在一起——`coin` 变为 IOU，消耗品变为可替代的令牌，检查点的净 `buy`/`sell` 差额变为已结算的 **XLS-85 令牌质押**——并将其绑定到 **XRPL 测试网络**，完全置于确定性核心之外。 在 `core`/`modules` 中没有任何内容会导入它，并且无论是否包含它，程序的运行结果在字节级别上都是完全相同的（这一点已在真实的盗版 `createGame()` 交易循环中得到验证）。 仅在测试网上运行，并采用一种在主网上无法通过代码实现的保护机制，同时使用 Git 忽略的密钥文件、安全的重试机制、链上备忘录验证以及未锚定的回退方案；已在测试网上进行了完整的端到端测试（通过令牌托管的方式进行结算 → `reconcile`，与链上余额和备忘录进行比对）。 NFT 独有的装备已发布到 v3.3（如下所示）。 请参阅 [XRPL 分账本适配器](#xrpl-分账本适配器可选)。
- **独特的装备以 NFT 形式存在（v3.3）：** `@ai-rpg-engine/ledger-adapter` 将 `equipment` 数据包中的独特装备——来自 v3.2 的延迟“后续部分”——绑定到 XRPL NFT：每个独特的物品都会在某个检查点铸造为 **XLS-20 NFToken**（`tfMutable`，不可销毁——真正的玩家所有权），并通过 **XLS-46 `NFTokenModify`** 方式，在原位更新可变 NFT 的元数据，同时，一个 `reconcile()` 所有权家族会在账本上验证 `account_nfts`。 它提供了一种与设备配置不同的读取路径，并与可互换层协同工作——具有相同的确定性防火墙，无论是否启用该层，其结果都是完全相同的。 已在实际的`starter-gladiator`游戏环节中得到验证，在测试网上进行（将装备的`trident-and-net`铸造成 NFT，在链上拥有它，进行对账，世界不受影响）。
- **值得铭记的装备（v3.4）：**“遗物”机制自v3.3版本起就已存在，但此前从未在游戏过程中生效——游戏中没有任何物品会记录其“遗物”状态，因此每件物品的“遗物”版本都会永久地设置为`0`。 现在，游戏中的“记录方”已推出：一个**可选模块**`item-chronicle-core`，它会记录实际游戏中的`acquired`/`used-in-kill`/`recognized`数据，并将其通过`starter-gladiator`传输——赢得三场竞技场战斗，你将获得**染血的三叉戟与渔网**，并在整个游戏过程中使用，同时会在 HUD 和导演日志中显示。 这也有助于**完成 NFT 流程**：一个检查点确认了增长，使其成为一个真实的**XLS-46 `NFTokenModify`**，同时推进链上 URI，并保留 NFTokenID。 在修复过程中：发现所有已发布的版本中，`boss-kill`和`recognized`都无法访问（一个简单的`boss`标签检查，用于验证内容是否包含`role:boss`标签，以及一个派系保护机制，用于防止内容中没有实体设置标签的情况）。此外，后者还悄无声息地阻止了*所有*盔甲的升级。 通过构建方式选择启用：一个不包含任何代码的软件包，其字节级结构与在它出现之前发布的软件包引擎完全相同。
——**留下深刻印记的后果（v3.8）：**战略层面在v3.7之后被触发——引发了一系列事件，问题得到了解决，叙述者可以讲述结果——然后世界就忘记了这件事。 `applyOpportunityFallout` 声明了**十四**种影响类型，并保留了**六**种：一种未在任何账簿中记录的义务，一种没有传播给任何人的谣言，以及一种没有授予任何人的头衔。 这十四个机制现在都还在使用，每个机制都通过其所属系统的专属编写程序来运作，其中两个机制形成了“闭环反馈”——一种通过“沉淀”方式产生的义务会影响忠诚度阈值，从而决定 NPC 下次会提供什么，而通过“沉淀”方式获得的信任则会开启读取这些信息的通道。 事实证明，三种效果类型会在缺少接收器时提前一个级别失效（`materials`和`spawn-opportunity`实际上没有任何来源；每个`spawn-pressure`生产者都处于一个无法被任何已发布路径访问的分辨状态），因此，循环实际上是创建了生产者，而不是构建了永远无法触发的保护机制。 `betray` 操作作为第四个过渡环节出现，并激活了**六个义务点、三个谣言点以及所有三个最初的生成压力点**，这些点此前已在之前的版本中创建，但之前没有任何方式可以到达。 随后，对整个会话进行了**账本审计**，结果发现压力测试应用程序中还有另外三个未被标记的漏洞——而双向比对正是比单次扫描更有优势的地方。 而第十二个故事，**《喧嚣与呐喊》**，是从结果层面反向构思的：故事讲述了一位在没有警察的城市里追捕小偷的人，并且在评分标准上获得了满分（7/7）。
——**战略层面，光照（v3.7）：**这是高于瞬时动词的层面——在这里，机会出现，伙伴会产生被动影响，区域拥有不同的氛围——这个层面半明半暗，没有任何东西能够看清它。 一个新的全局目录探测程序会启动所有十一个数据包，并通过与交互式命令行界面（CLI）使用的相同驱动程序（NPC回合、伙伴回合，然后是世界时钟）执行**四十个完整回合**。这是因为`runWorldTick`是一个每回合执行的函数，而不是一个动词，并且仅由`submitAction`构建的探测程序只会永久执行半个回合。 它衡量了**八种机会类型**中，实际应用于已发布内容的一种。 现在，所有**八个活动**都已启动，每个活动都附带了已完成的活动记录，以证明奖励确实已发放——还有一个活动是故意拖延时间，以便证明，如果活动过期，会产生哪些实际后果（例如，声誉受损，某个地区的人们会更加不满），这些后果都是基于实际情况而非假设。 真正的问题从来都不是规则：`contract`需要一个既是盟友又是贪婪的 NPC，而断点表使得它与`favorable`相互排斥；`relations['player-trust']`在整个目录中只被创建过一次；区域经济体在约 15 轮内，通过将每个类别都调整到通用的 50，从而抹去了自身独特的类型和标签特征；`world.factions[].reputation`——即引擎明确合并的初始设定——没有被任何模组设定，因此每个世界都从一个完全相同的零点开始。 **节奏**的调整是基于已知的特定发现，而非个人喜好。每个发现都与相应的常数相关联（例如，选择过载、任务变化、放松阶段、重复强调、预约动态），并且受到确定性回归的约束。 **十三项中的十二项**伴随属性和区域修饰符字段现在都通过参数接口实现分辨率功能，每项都包含一个带有名称的贡献值，以便用户界面可以显示“谁”提供了帮助——从用户体验的角度来看，经过计算但未呈现的修饰符与没有修饰符的效果是相同的。 `use`**停止静默地破坏内容**：89/90，目录中的所有已发布内容都被一个没有实际效果的动词处理，然后被从系统中移除，系统报告操作成功。 所有十一支队伍都声明了`statusTags`协议，但实际上没有任何一支队伍遵守，该协议仍然有效——最初，声明的范围扩大到已发布的事实，然后又进行了限制。
- **该工具启动了目录（v3.6）：** 最初用于使用账本的程序包，现在被有目的地运行，用作引擎优化工具。 一次全面的“动词可访问性审计”会启动所有十一个包，并将每个动词提交给实际的引擎进行测试，以确定启动后的环境中是否存在任何目标能够接受该动词——这是一个现有的任何检查都无法通过或失败的关卡，因为“动词一致性”检查会将帮助表与已注册的处理程序进行比较，而不会检查内容。 在进行任何修复之前运行此程序，它检测到 `recruit`，该问题在《盐路账本》中被提及，但游戏中没有任何可招募的 NPC（这是 v2.9 缺陷，再次出现），并且 `use` 在整个游戏包中都无法正常工作。 `give` 作为引擎中的**第一个实体到实体物品转移**机制发布——它具有原子性、结构化拒绝机制，并以事件时间戳记录，从而弥补了之前存在的漏洞，即某个程序包可以使物品变得可获取，但没有任何机制可以将该物品传递给任何人。 另外两个剩余的适配轴，它们原本是带有“零行为读取”配置标志，现在变成了行为：`diary` 模式（已见证，但未托管——每个检查点只有一个锚点，没有信任线，对账会验证锚链），以及`issuerMode: 'persistent'`（一个比运行周期更长久的交易市场）。 已在实际的 XRPL 测试网上进行了验证，结果为 **15/15**。
——**一款以债务为核心机制的游戏（v3.5）：**《盐路账本》是本期推出的第十一部游戏，也是第一款从系统而非类型出发进行设计的游戏——你扮演一个利用他人资本进行交易的因素，五个商业动词（`appraise`/`haggle`/`consign`/`underwrite`/`audit`）推动游戏进程，而战斗则被视为一种惩罚（资源配置中存在一个空的`gains`数组——没有任何机制奖励暴力行为）。 在目录中，`consign` 是唯一一个其离线语义与结算原语之间存在一一对应关系的动词，这使得它成为账本适配器的参考包，并且**不依赖于该账本适配器**。 该游戏包含`mercantile`类型，并具有商人经济模式，且在评分标准中获得了 7/7 的高分。 相同的循环使两个长期处于非活动状态的适配器轴得以实现——即备忘录字段 `VERB:`（声明时没有成员可以被调用）和 `config.settlement`（声明时在任何地方都没有读取操作），并且对新软件包的已播放会话进行审计，发现有六个机制已连接、模式有效、单元测试通过且已停用。
- `ai-rpg-engine create-starter <name>` — 创建一个新的游戏项目（独立项目，在 monorepo 之外运行）；`validate` + `scaffold` 内容管理命令；从 JSON 文件加载资源包。
- 在 npm 上发布了入门模板（`@ai-rpg-engine/starter-template`）。
- 完整的测试套件：**8368 个测试**（多次运行结果一致；测试文件在持续集成环境中进行类型检查；并强制执行代码覆盖率）。

**哪些部分存在缺陷或不完整：**
- AI 世界构建工作室（Ollama 层）的测试不如模拟核心充分，需要本地 Ollama 守护进程；它是完全可选的——引擎和 `run` 循环不需要网络。
- 叙事/音频堆栈构建确定性的音频命令，但**没有终端音频后端**——在 `run` 中没有任何东西会发出声音。Godot 阶段是第一个实际播放 `felt` 提示 ID（混音器 + 可选的 TTS）的主机。叠加音效不应替换区域音轨。
- 多人游戏（两个人类玩家共享一个世界）**没有**构建——它是一个网络层，有意不在设计范围内；目前的配置目标是单个控制器。
- `replay --replay` 恢复存档，而不是重新模拟——并且在 v2.9 之后，这就是**既定的**方向，而不是推迟：`Engine.serialize()` 已经是一个经过验证的完整状态快照，而重新模拟必须跟踪存在于操作日志之外的世界时间/遭遇状态。v2.9 在该经过验证的恢复路径上提供了多检查点存档槽；真正的基于事件的重新模拟尚未计划。
- v3.1 关闭了 v3.0 的三个命名天花板——游戏**起始资源**、特定类型的*修复*配方，以及 `deny` / `bury-scandal` 菜单界面现在都已发布。剩下的唯一的天花板是：这些新的游戏修复配方包含一个作者编写的 `statDelta`（一个小的属性加成），而 `resolveRepair` 尚未应用——修复*恢复*，`modify` *升级*——因此，修复即升级的功能在代码中标记，并**推迟到 v3.2/v3.3**，作为一种有意的机制调用，而不是一个静默的、不活跃的字段。并且 `obligation-exists` 包含一个作者编写的演示（阿尔德里克修士）；该条件已激活，供内容作者用于控制更多对话。
- 文档内容丰富，但并非每个手册页面都反映了最新的 API。

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

**最近的发布阶段（v2.4.0–v3.0.0）：**
- v2.4.0——队伍战斗（盟友目标/治疗/增益/复活，友方-敌方AoE），状态效果系统（修改器 + DoT/HoT + 反应触发器），插件配置阶段 1，内容`validate`/`scaffold` CLI。
- v2.5.0——每个实体的规则解析（混合游戏风格的战斗），`applyProfile`加载器 + 每个实体的能力，配置模板 + `profile` CLI，以及完整的健康状态检查。
- v2.6.0——`run`命令成为一个真正的游戏：敌人根据自己的 AI 配置采取行动，胜利/失败，保存/恢复，能力和经验值在菜单中显示，`ai`工作室资源库，以及叙事堆栈。
- v2.7.0——世界会做出反应，并且有理由再次返回：热度 → 压力 → 叙述性的后果，区域入口遭遇，任务循环 + 日记，战斗中的装备，可重放的种子运行，实时最终游戏输入，`buildWorldStack`，导演日志，以及保存迁移接口。
- v2.8.0——在您所生活的世界中采取行动：一个实时的交易经济 + `sell`动词，您可以招募并与您并肩作战的伙伴，以及一个导演日志，它会读取整个面板——每个系统都有一个写入线，大约有 12 个消费者，这些消费者在发布时是隐藏的。
- v2.9.0——闭环：`buy` + 商店库存和制作完成经济系统；伙伴采取独立的行动；四种社交动词（贿赂/恐吓/请愿/播种）在由机会奖励资助的杠杆经济中运行；机会在到期时解决，并产生好感度下降的后果；装备、任务、可招募对象和起始资金均匀地分配给所有十个初始设置。
- **v3.0.0——使世界“活”起来：NPC 代理生成器点亮命名 NPC（目标/关系/义务日志/后果链），以及每个初始设置中都有一个故事 NPC；社交表面扩展到 25 种动词（外交 + 破坏），具有被动杠杆收入和读取社交状态的对话；每个初始设置都有类型化的库存 + 配方；杠杆结局（胜利/傀儡大师/安静的退休）变得可以实现；修复/修改菜单行，护送机会，以及一个`audit-content`开发 CLI——通过第 9 阶段的审核，该审核发现了绿色测试套件隐藏的两个死线。**

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
