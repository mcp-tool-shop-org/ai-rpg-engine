<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/character-creation

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/character-creation)](https://www.npmjs.com/package/@ai-rpg-engine/character-creation)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

无头角色创建系统，包括原型、背景、特性、多职业选择以及角色构建验证，适用于 [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine)。

## 安装

```bash
npm install @ai-rpg-engine/character-creation
```

## 功能

角色不是简单的表格，而是身份。这个包处理主要原型、背景、性格特征以及可选的辅助技能的结构化融合，从而创建一个经过验证的玩家角色。每个原型+技能的组合会生成一个跨领域的称号，它概括了角色的身份，而不仅仅是堆叠数值。

## 用法

### 验证角色构建

```typescript
import { validateBuild } from '@ai-rpg-engine/character-creation';
import { content, buildCatalog } from '@ai-rpg-engine/starter-fantasy';

const build = {
  name: 'Aldric',
  archetypeId: 'penitent-knight',
  backgroundId: 'oath-breaker',
  traitIds: ['iron-frame', 'cursed-blood'],
  disciplineId: 'occultist',
  statAllocations: { vigor: 2, instinct: 1 },
};

const result = validateBuild(build, buildCatalog, content.ruleset);
// result.ok === true
// result.resolvedTitle === 'Grave Warden'
// result.finalStats === { vigor: 8, instinct: 6, will: 1 }
// result.resolvedTags includes 'martial', 'oath-broken', 'curse-touched', 'grave-warden'
```

### 转换为实体状态

```typescript
import { resolveEntity } from '@ai-rpg-engine/character-creation';

const entity = resolveEntity(build, buildCatalog, content.ruleset);
// Full EntityState ready for the engine:
// entity.id === 'player'
// entity.blueprintId === 'penitent-knight'
// entity.stats, entity.resources, entity.tags, entity.inventory all computed
// entity.custom === { archetypeId, backgroundId, disciplineId, title, portraitRef }
```

### 浏览可用选项

```typescript
import {
  getAvailableArchetypes,
  getAvailableBackgrounds,
  getAvailableTraits,
  getAvailableDisciplines,
  getStatBudgetRemaining,
} from '@ai-rpg-engine/character-creation';

const archetypes = getAvailableArchetypes(buildCatalog);
const backgrounds = getAvailableBackgrounds(buildCatalog);
const traits = getAvailableTraits(buildCatalog, ['iron-frame']); // filters incompatible
const disciplines = getAvailableDisciplines(buildCatalog, 'penitent-knight', ['martial']);
const remaining = getStatBudgetRemaining(build, buildCatalog); // points left to allocate
```

### 序列化以用于保存文件

```typescript
import { serializeBuild, deserializeBuild, validateSerializedBuild } from '@ai-rpg-engine/character-creation';

const json = serializeBuild(build);
const restored = deserializeBuild(json);
const check = validateSerializedBuild(json); // { ok: true, errors: [] }
```

## 概念

| 概念 | 描述 |
|---------|-------------|
| **Archetype** | 主要职业：基础属性、起始标签、成长树 |
| **Background** | 起源故事：属性修正、起始标签、可选的物品 |
| **Trait** | 优点或缺点：对属性、资源、标签、动词或派系的影响 |
| **Discipline** | 辅助职业：授予一个动词、一个被动效果、一个缺点 |
| **Cross-Title** | 原型+技能组合产生的综合身份（例如：“墓地守卫”） |
| **Entanglement** | 某些原型+技能组合产生的摩擦效果 |
| **Build Catalog** | 特定包的包含所有角色选项的菜单 |

## 多职业选择

该系统采用结构化身份融合，而不是简单的叠加：

- **主要原型**定义核心身份（基础属性、成长树、起始标签）
- **辅助技能**非常简洁：一个动词、一个被动效果、一个缺点
- 每种组合都会生成一个**跨领域称号**（例如：“附魔手枪”、“神经外科医生”、“隔离执法官”）
- 某些组合会产生**纠葛**，即叙事上的摩擦效果

## 特性效果

| 类型 | 示例 |
|------|---------|
| 属性修正 | `{ stat: 'dex', amount: 1 }` |
| 资源修正 | `{ resource: 'hp', amount: -3 }` |
| 授予标签 | `{ tag: 'curse-touched' }` |
| 动词权限 | `{ verb: 'steal' }` |
| 派系修正 | `{ faction: 'guard', amount: -10 }` |

## 角色构建目录

所有 7 个启动包都导出了一个 `buildCatalog`，其中包含特定于该包的选项。每个目录包括 3 个原型、3 个背景、4 个特性（2 个优点 + 2 个缺点）、2 个技能以及 6 个跨领域称号。

## AI RPG Engine 的一部分

这个包是 [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) 单一代码仓库的一部分。它仅依赖 `@ai-rpg-engine/core` 进行类型导入，不依赖于引擎的运行时环境。

## 许可证

MIT
