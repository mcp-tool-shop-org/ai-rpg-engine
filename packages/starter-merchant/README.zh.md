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

# @ai-rpg-engine/starter-merchant

> **示例构成**——这个入门模板展示了如何构建一个游戏，其核心循环是义务而非战斗。它是一个可以学习的例子，而不是一个可以直接复制的模板。请参阅[构成指南](../../docs/handbook/57-composition-guide.md)，以构建您自己的游戏。

**盐路账本**——你是一家小型贸易公司的负责人。你不拥有你运输的货物；你欠着债务。你所拥有的每一枚硬币，都是别人手中的一把刀。

[AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine)入门包目录的一部分。

## 主题

商业压力，起初是讽刺，最终会带来毁灭。盐路上没有什么东西是稀缺的——真正的限制在于你所承诺的事情。`liquidity`是你可以在不引发债务的情况下部署的东西；当无法做到时，`lien`就会累积，并且在达到70时，评估公会会没收已委托的资产。在90时，它会没收你的印章。

战斗存在，并且有意地被设计成一种**糟糕的交易**。HP上限为24点，这是整个目录中最低的数值，并且战斗资源配置有一个空的`gains`数组——没有任何行奖励暴力行为。攻击会消耗流动性，受到伤害会减少流动性，而胜利还会进一步减少5点，因为你刚刚损坏了别人的财产。

## 快速上手

```typescript
import { createGame } from '@ai-rpg-engine/starter-merchant';

const engine = createGame(71);

// Register with the Assay Guild — the seal is what makes consignment possible
engine.submitAction('speak', { targetIds: ['assay-master-corvane'] });
engine.submitAction('choose', { parameters: { choiceId: 'register' } });

// Read the goods, contest the terms, then hand them over
engine.submitAction('appraise', { parameters: { itemId: 'bale-of-flax' } });
engine.submitAction('move', { targetIds: ['long-quay'] });
engine.submitAction('move', { targetIds: ['crooked-stair'] });
engine.submitAction('haggle', { targetIds: ['broker-inaya'] });
engine.submitAction('consign', { parameters: { itemId: 'bale-of-flax' }, targetIds: ['broker-inaya'] });

// Reconcile your own books
engine.submitAction('audit');
```

## 展示的模式

- **非战斗的主要循环**——五个商业动词驱动着游戏；战斗堆栈已配置，但价格被设定为一种惩罚。
- **反向资源配置**——`CombatResourceProfile`没有`gains`，因此AI会推动低流动性角色采取退出策略。
- **包本地模块**——`contract-core`位于入门模板内部，而不是在`@ai-rpg-engine/modules`中，因为它只有一个消费者。在第二个阶段进行推广。
- **注入操作，而不是新的依赖项**——状态机制和识别评估器被传入，这是`createEquipmentCore`使用的相同接口。
- **控制机制而非属性的工具**——公会印章授予`consign`，账本授予`audit`，因此没收会移除一个动词。
- **不受控制的区域作为一种机制**——沃伦区没有控制派系，这使得它成为唯一一个没有担保和补救措施的地方。

## 独特的机制

| 动词 | 它的作用 |
|------|--------------|
| `appraise` | 根据要求价格评估真实价值、稀有度和来源。更好的`ledger`会缩小范围。 |
| `haggle` | 竞争价格。消耗流动性；赢得的利润会被存入与该对手方的账户中，并用于你下次与他们的交互中的`consign`。 |
| `consign` | 将货物交付以换取未来的付款，从而创建一个具有到期时间的义务。货物会立即离开你的库存——这种差距就是所有的风险。 |
| `underwrite` | 承担另一方的风险，收取费用。现在有流动性；如果保证的方违约，索赔就会触发，并且留置权将生效。 |
| `audit` | 对账并报告差异。需要账本——你不能仅凭记忆进行审计。 |

**义务时钟**基于移动而不是计时器运行。逾期委托的货物会累积`overdueTicks × value ÷ 10`的留置权。在达到70的留置权时，将没收物品ID排序最低的义务——这是确定性的，绝不会有随机性。

## 内容

- **4个区域**分布在8个区中：盐门（合法的市场）、码头区（关税和延误）、沃伦区（现金交易）以及高级会计处。
- **4个NPC**——评估大师科瓦内、港务长德雷尔、经纪人伊纳亚、财务主管努尔。
- **3个敌对角色+1个Boss**——“常态账户”不是一种生物，而是一种结算，其阶段与你到达时的负担程度有关。
- **3个任务**——打开账本、迟到的商队、常态账户。
- **14件物品**分为可替代的贸易品和五种独特的工具。

## 属性和资源

| 属性 | 作用 |
|------|------|
| `ledger` | 算术、记忆、欺诈检测 |
| `tongue` | 谈判和误导 |
| `standing` | 谁为你担保 |

| 资源 | 行为 |
|----------|-----------|
| `hp` | 24点上限——这是整个目录中最低的。 |
| `stamina` | 标准行动经济 |
| `coin` | 你所拥有的东西 |
| `liquidity` | 你可以在不引发债务的情况下部署的东西 |
| `lien` | **反向**——从空开始，并随着没收而增加。 |

战斗地图`attack → tongue`、`precision → ledger`、`resolve → standing`：一个最终选择挥拳的角色是通过恐吓和后退而不是通过蛮力来做到这一点的。

## 账本游戏（可选）

这是`@ai-rpg-engine/ledger-adapter`的参考包。它不依赖于它——一个测试表明它永远不会这样做——但它的机制是适配器构建以满足的机制：`consign`是一种带有情节元素的结算原语，`audit`是外部验证器作为可玩动词，而留置权没收是在虚构中出现的命名燃烧补偿器。请参阅[第60章](../../docs/handbook/60-xrpl-ledger-adapter.md)和[第61章](../../docs/handbook/61-xrpl-nft-gear.md)。

## 可以借鉴的内容

如果你的游戏中有债务，请借鉴义务生命周期。如果你的包需要一个系统而无需引入依赖项，请借鉴注入操作模式。并且借鉴`anti-inert.test.ts`中的反惯性审计——它追踪了每个主要机制在实际游戏中运行的情况，并发现了六个已配置、符合规范、单元测试通过但实际上无效的机制。

## 许可

MIT
