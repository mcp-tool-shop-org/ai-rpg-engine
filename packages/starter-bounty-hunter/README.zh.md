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

# @ai-rpg-engine/starter-bounty-hunter

> **示例构成**——本入门包演示了如何构建一个游戏，其核心循环是追捕，而真正的货币则是这座城市中哪一半会继续向你敞开大门。这是一个可以学习的例子，而不是一个可以直接复制的模板。请参阅[构成指南](../../docs/handbook/57-composition-guide.md)，以构建您自己的游戏。

**声势浩大的追捕**——你是一个赏金猎人，在一个没有警察且也不需要警察的城市里活动。这里没有法律。只有价格，以及你。

[AI RPG 引擎](https://github.com/mcp-tool-shop-org/ai-rpg-engine)入门包目录的一部分。

## 主题

*声势浩大的追捕*是真正的制度：每个旁观者都有法律义务加入追捕行动，一旦该行动开始。它也是本引擎在特定语境下的核心原则——**热度决定了世界是否正在关注；立场决定了它之后是否会记住。** 本包的设计基于这一原则，而不是围绕它进行设计。它没有添加第二个追捕时钟。

这座城市有两个部分，它们都为名声买单。赏金办公室按人头支付报酬，并为你提供合法的行动依据。地下世界则为沉默、被盗物品以及一个不作证的人支付报酬。乔纳森·奎尔——自称“赏金猎人总管”——发现你可以同时进行这两项活动。他是这个包的核心人物，他不是怪物；他就是你，只是在同一条道路上走了四年。

## 快速上手

```typescript
import { createGame, pursuitState, formatPursuitForNarrator } from '@ai-rpg-engine/starter-bounty-hunter';

const engine = createGame(71);

// Sign for a ticket — the office now owns what you do next
engine.submitAction('speak', { targetIds: ['clerk-hesper'] });
engine.submitAction('choose', { parameters: { choiceId: 'sign' } });

// Buy a word, walk it down, take him breathing
engine.submitAction('informant', { targetIds: ['nightman'] });
engine.submitAction('move', { targetIds: ['shambles'] });
engine.submitAction('move', { targetIds: ['rookery'] });
engine.submitAction('collar', { targetIds: ['rookery-runner'] });

// Then choose a side, for today
engine.submitAction('impeach', { targetIds: ['rookery-runner'] });  // the office
// ...or take the other road entirely
engine.submitAction('fence', { toolId: 'stolen-plate' });           // the ward

console.log(formatPursuitForNarrator(engine.world));
// [SEARCHED] Somebody raised the cry. Faces turn when you pass. (heat 12 — 10+ and the cry is up)
```

## 演示的模式

- **一个没有第二个时钟的追捕循环**——`pursuitState`是对引擎自身`player_heat`和派系警报的一种纯粹的衍生。`HUNTED_HEAT`*就是*世界时钟的`HEAT_ESCALATION_THRESHOLD`，因此玩家永远不会有两个数字对他们是否被追捕产生不同的结果。
- **双重声誉作为包的核心压力**——`warrant`是合法的行动依据；`infamy`是地下世界对你的看法。加强一项会削弱另一项。两者都不是“失败计量器”；没有失去价值，只有你正在偏离的方向。
- **拒绝作为一种机制**——`collar`需要合法的行动依据*以及*一个已经被击倒的目标，并且会说明为什么拒绝。一次无法验证的追捕是一种带有收益的伤害判定。
- **原则作为玩家行为**——`lay-low`将引擎已经奖励的安静状态转化为你可以选择的行为，并在没有人关注时拒绝，因为一种始终有效的行为并不能教会你任何东西。
- **内容从生成规则向后设计**——书记员赫斯珀是盟友和贪婪者，因为这是引擎的`contract`规则所能提供的唯一NPC形式。贫民窟被设计成贫穷且不受控制，因为这就是区域规则所反映的内容。
- **一个包本地模块**——`pursuit-core`存在于入门包中，而不是在`@ai-rpg-engine/modules`中，因为它只有一个消费者。在第二个包中使用。

## 独特机制

| 行为 | 它所做的事情 |
|------|--------------|
| `collar` | 以合法授权的形式**活捉**目标。需要合法的行动依据和一个已经被削弱的目标；否则会拒绝，并说明原因。产生记录，而不是支付报酬。 |
| `impeach` | 对你抓捕的目标作证。将追捕转化为定罪：增加授权，减少恶名。办公室信任一个能够完成任务的赏金猎人。 |
| `informant` | 购买目标的下落。价格是根据你与街头关系的印刷函数——陌生人支付双倍的价格——并且询问本身就是一个信号，因此恶名会增加。 |
| `post-bounty` | 为目标设定自己的价格，并花费办公室的信用额度来做到这一点。你的不满变成了其他人要做的事情。 |
| `fence` | 通过黑市转移回收的物品。需要一个**人**，而不是菜单。故意支付较少的报酬：你不是为了钱而来。 |
| `lay-low` | 花一天时间躲起来，让追捕声息渐止。当没有人关注时会拒绝。 |

**追捕状态**是`COLD`/`SEARCHED`/`HUNTED`，并且每个状态都携带导致它的数字。一个派系在警报达到60或以上时会追捕你，即使是在安静的一周里，因为警报是记忆，而热度是关注——这就是本包的原则，用包自身的词汇表达。

## 内容

- **7个区域**分布在3个街区：行政区（办公室和法庭）、杂乱区（市场和死墙）以及贫民窟——贫穷、不受控制，并且更难获得明确的答案。
- **4个NPC**——书记员赫斯珀、母亲斯拉克、警长派克（可招募）、抄写员。
- **3个敌对角色+1个Boss**——乔纳森·奎尔在失去力量时不会变得更强。他会变得更加坦诚。
- **3个任务**——第一张票、血钱、赏金猎人总管。
- **6件物品**，包括泰伯恩票：一张真实的、可转让的证书，历史上其价值高于它所提供的奖励。

## 属性和资源

| 属性 | 作用 |
|------|------|
| `grip` | 你可以对一个不想被抓捕的人做什么 |
| `nose` | 阅读房间、账簿、谎言——赏金猎人的真正技能。 |
| `authority` | 房间是否认为你有权这样做 |

| 资源 | 行为 |
|----------|-----------|
| `hp` | 最大值为32——你靠抓捕人生存。 |
| `stamina` | 追捕的成本。战斗会消耗它；`lay-low`会恢复它。 |
| `coin` | 线人想要的东西。 |
| `warrant` | 合法的行动依据。由`collar`和`post-bounty`消耗，由`impeach`恢复。 |
| `infamy` | 城市另一半对你的看法。**不是**失败计量器。 |

战斗地图`attack → grip`、`precision → nose`、`resolve → authority`。暴力在这里并不被禁止——它只是**嘈杂**，并且会消耗你用于下一次抓捕的体力。

## 可以借鉴的内容

如果你的游戏中有追逐机制，那么“状态转移”应该遵循以下原则：三个关键词——确定性、每个状态转移都应明确其触发条件，并且所有状态都应该是引擎已经存在的。如果你的游戏中存在不同派系，且这些派系对同一人物有不同的诉求，则需要考虑“双向声誉”。还有 `anti-inert.test.ts` ——每一种游戏内置的动词都需要有一行代码来证明它会改变某些东西，以及另一行代码来证明其拒绝是一种结构化的否定，而不是简单的沉默。

## 许可协议

MIT
