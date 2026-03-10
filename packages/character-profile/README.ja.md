<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/character-profile

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/character-profile)](https://www.npmjs.com/package/@ai-rpg-engine/character-profile)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

[AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) 用の、成長、負傷、マイルストーン、およびセーブ/ロード機能を備えた、永続的なキャラクタープロフィール機能。

## インストール

```bash
npm install @ai-rpg-engine/character-profile
```

## 機能概要

キャラクターのビルド、リアルタイムのステータス、装備、経験値/レベルアップ、負傷、マイルストーン、および派閥の評判を、セッションを越えて永続的に保持される単一のプロフィールに統合します。セーブファイル用のシリアライゼーション機能も含まれています。

## 使い方

### プロフィールの作成

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

### 経験値とレベルアップ

```typescript
import { grantXp, advanceArchetypeRank } from '@ai-rpg-engine/character-profile';

const { profile: leveled, leveledUp } = grantXp(profile, 100);
// leveledUp === true, leveled.progression.level === 2

const { profile: ranked } = advanceArchetypeRank(leveled);
// ranked.progression.archetypeRank === 2
```

### 負傷

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

### マイルストーンと評判

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

### セーブ/ロード

```typescript
import { serializeProfile, deserializeProfile } from '@ai-rpg-engine/character-profile';

const json = serializeProfile(profile);
const { profile: loaded, errors } = deserializeProfile(json);
```

## 成長システム

| レベル | 必要な経験値 |
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

アーキタイプの上限レベル: 5。専門の上限レベル: 3。

## AI RPG Engine の一部

このパッケージは、[AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) のモノレポの一部です。`@ai-rpg-engine/character-creation` および `@ai-rpg-engine/equipment` に依存しています。

## ライセンス

MIT
