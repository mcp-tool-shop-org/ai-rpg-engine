<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/rumor-system

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/rumor-system)](https://www.npmjs.com/package/@ai-rpg-engine/rumor-system)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

[AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) 用の、変容メカニズム、伝播追跡、および派閥への浸透機能を備えた噂ライフサイクルエンジンです。

## インストール

```bash
npm install @ai-rpg-engine/rumor-system
```

## 機能概要

噂は伝播するにつれて変容します。「プレイヤーが商人殺した」という噂が、数回の間を置いてパニックに陥った警備兵によって伝えられると、「プレイヤーが5人の商人殺害した」という噂に変わる可能性があります。このエンジンは、信頼度の低下、感情的な影響、伝播経路、変容回数、および派閥への浸透を追跡します。これにより、NPCの噂話はコピー＆ペーストではなく、シミュレーションシステムとして機能します。

## 使い方

### 噂の作成と伝播

```typescript
import { RumorEngine } from '@ai-rpg-engine/rumor-system';

const engine = new RumorEngine();

// A guard witnesses a killing
const rumor = engine.create({
  claim: 'player killed merchant_1',
  subject: 'player',
  key: 'killed_merchant',
  value: true,
  sourceId: 'guard_1',
  originTick: 42,
  confidence: 0.9,
  emotionalCharge: -0.7,
});

// The rumor spreads — mutations may apply
const spread = engine.spread(rumor.id, {
  spreaderId: 'guard_1',
  spreaderFactionId: 'town_guard',
  receiverId: 'guard_2',
  receiverFactionId: 'town_guard',
  environmentInstability: 0.3,
  hopCount: 1,
});

// Track which factions absorbed the rumor
engine.recordFactionUptake(rumor.id, 'town_guard');
```

### 変容ルール

伝播のたびに、確率的に5つの組み込み変容が適用されます。

| 変容 | 確率 | 効果 |
|----------|------------|--------|
| **exaggerate** | 15% | 数値が増加 (20〜50%) |
| **minimize** | 10% | 数値が減少 |
| **invert** | 5% | 真偽値が反転 (まれ、劇的な変化) |
| **attribute-shift** | 8% | 情報源が伝播者に変更される |
| **embellish** | 20% | 感情的な影響が強まる |

環境の不安定さが、すべての確率を乗算します。

### 噂のライフサイクル

```
spreading → established → fading → dead
```

- **spreading (伝播中)**：エンティティ間で積極的に伝達されている状態
- **established (確立)**：最大伝播回数に達し、広く知られている状態
- **fading (衰退)**：`fadingThreshold` ティックの間、新しい伝播がない状態
- **dead (消滅)**：`deathThreshold` ティックの間、活動がない状態

```typescript
// Update lifecycle statuses
engine.tick(currentTick);

// Query active rumors
const activeRumors = engine.query({ status: 'spreading', minConfidence: 0.5 });
const playerRumors = engine.aboutSubject('player');
```

### 設定

```typescript
const engine = new RumorEngine({
  maxHops: 5,              // Transitions to 'established' after this
  confidenceDecayPerHop: 0.1,
  fadingThreshold: 10,     // Ticks inactive → 'fading'
  deathThreshold: 30,      // Ticks inactive → 'dead'
  mutations: customRules,  // Replace default mutations
});
```

### カスタム変容

```typescript
import type { MutationRule } from '@ai-rpg-engine/rumor-system';

const panicMutation: MutationRule = {
  id: 'panic',
  type: 'exaggerate',
  probability: 0.30,
  apply: (rumor, ctx) => ({
    ...rumor,
    emotionalCharge: Math.max(-1, rumor.emotionalCharge - 0.3),
    mutationCount: rumor.mutationCount + 1,
  }),
};
```

## シリアライズ

`RumorEngine` は、永続化のために `serialize()` と `RumorEngine.deserialize()` をサポートしています。

## AI RPG Engine の一部

このパッケージは、[AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) のモノレポの一部です。スタンドアロンで使用することも、エンジンの認知システムや派閥システムと統合することもできます。

## ライセンス

MIT
