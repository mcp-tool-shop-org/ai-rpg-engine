<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/character-profile

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/character-profile)](https://www.npmjs.com/package/@ai-rpg-engine/character-profile)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

用于 [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) 的持久角色档案，包含成长、伤势、里程碑以及保存/加载功能。

## 安装

```bash
npm install @ai-rpg-engine/character-profile
```

## 功能

将角色构建、实时属性、装备配置、经验值/等级提升、伤势、里程碑以及派系声望整合到一个持久的档案中，该档案可以在不同游戏会话中保持有效。包含序列化功能，用于保存文件。

## 用法

### 创建档案

```typescript
import { createProfile } from '@ai-rpg-engine/character-profile';

const profile = createProfile(
  build,       // CharacterBuild from character-creation
  { vigor: 7, instinct: 4, will: 1 },  // resolved stats
  { hp: 25, stamina: 8 },               // resolved resources
  ['martial', 'oath-broken'],            // resolved tags
  'chapel-threshold',                    // pack ID
);
```

### 经验值和等级提升

```typescript
import { grantXp, advanceArchetypeRank } from '@ai-rpg-engine/character-profile';

const { profile: leveled, leveledUp } = grantXp(profile, 100);
// leveledUp === true, leveled.progression.level === 2

const { profile: ranked } = advanceArchetypeRank(leveled);
// ranked.progression.archetypeRank === 2
```

### 伤势

```typescript
import { addInjury, healInjury, computeInjuryPenalties } from '@ai-rpg-engine/character-profile';

let wounded = addInjury(profile, {
  name: 'Broken Arm',
  description: 'Fractured in combat.',
  statPenalties: { vigor: -2 },
  resourcePenalties: {},
  grantedTags: ['injured'],
  sustainedAt: 'turn-10',
});

const penalties = computeInjuryPenalties(wounded);
// penalties.statPenalties.vigor === -2
```

### 里程碑和声望

```typescript
import { recordMilestone, adjustReputation, getReputation } from '@ai-rpg-engine/character-profile';

let updated = recordMilestone(profile, {
  label: 'Chapel Entered',
  description: 'First entered the ruined chapel.',
  at: 'turn-1',
  tags: ['exploration'],
});

updated = adjustReputation(updated, 'chapel-undead', -10);
// getReputation(updated, 'chapel-undead') === -10
```

### 保存/加载

```typescript
import { serializeProfile, deserializeProfile } from '@ai-rpg-engine/character-profile';

const json = serializeProfile(profile);
const { profile: loaded, errors } = deserializeProfile(json);
```

## 成长系统

| 等级 | 所需经验值 |
|-------|------------|
| 1 | 0 |
| 2 | 100 |
| 3 | 250 |
| 4 | 500 |
| 5 | 1,000 |
| 6 | 2,000 |
| 7 | 4,000 |
| 8 | 7,000 |
| 9 | 11,000 |
| 10 | 16,000 |

原型最高等级：5。 专长最高等级：3。

## AI RPG Engine 的一部分

此包是 [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) 单仓库项目的一部分。 依赖于 `@ai-rpg-engine/character-creation` 和 `@ai-rpg-engine/equipment`。

## 许可证

MIT
