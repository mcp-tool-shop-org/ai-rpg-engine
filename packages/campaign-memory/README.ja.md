<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/campaign-memory

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/campaign-memory)](https://www.npmjs.com/package/@ai-rpg-engine/campaign-memory)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

[AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) 用の、NPCの記憶、多次元の関係性、およびキャンペーンジャーナル機能を提供します。

## インストール

```bash
npm install @ai-rpg-engine/campaign-memory
```

## 機能概要

NPCは、起こったことを記憶します。単に「敵対的：true」というだけでなく、信頼、恐怖、尊敬、親しみといった感情を、あらゆるインタラクションを通じて記録します。記憶は時間とともに薄れていきます。鮮明 → 薄れ → 曖昧 → 忘れ去られる。キャンペーンジャーナルは、重要なイベントをセッション間で保持します。

## 使い方

### キャンペーンジャーナル

```typescript
import { CampaignJournal } from '@ai-rpg-engine/campaign-memory';

const journal = new CampaignJournal();

// Record a significant event
const record = journal.record({
  tick: 42,
  category: 'kill',
  actorId: 'player',
  targetId: 'merchant_1',
  zoneId: 'market',
  description: 'Player killed the merchant during a robbery',
  significance: 0.9,
  witnesses: ['guard_1', 'bystander_2'],
  data: { weapon: 'dagger' },
});

// Query the journal
const playerActions = journal.query({ actorId: 'player', category: 'kill' });
const merchantHistory = journal.getInvolving('merchant_1');
```

### NPCの記憶バンク

```typescript
import { NpcMemoryBank, applyRelationshipEffect } from '@ai-rpg-engine/campaign-memory';

const guardMemory = new NpcMemoryBank('guard_1');

// Guard witnesses the player killing a merchant
guardMemory.remember(record, 0.9, -0.8);      // high salience, very negative
applyRelationshipEffect(guardMemory, record, 'witness');

// Check how the guard feels about the player
const rel = guardMemory.getRelationship('player');
// { trust: -0.15, fear: 0.25, admiration: -0.05, familiarity: 0 }

// Later, memories fade
guardMemory.consolidate(currentTick);
const memories = guardMemory.recall({ aboutEntity: 'player', minSalience: 0.5 });
```

### 関係性の軸

| 軸 | 範囲 | 意味 |
|------|-------|---------|
| 信頼 | -1から1 | 不信 → 信頼 |
| 恐怖 | 0から1 | 無恐怖 → 極度の恐怖 |
| 尊敬 | -1から1 | 軽蔑 → 尊敬 |
| 親しみ | 0から1 | 見知らぬ人 → 親密な関係 |

### 記録カテゴリ

`action` (行動) · `combat` (戦闘) · `kill` (殺害) · `betrayal` (裏切り) · `gift` (贈り物) · `theft` (盗み) · `debt` (借金) · `discovery` (発見) · `alliance` (同盟) · `insult` (侮辱) · `rescue` (救出) · `death` (死亡)

各カテゴリには、デフォルトの関係性への影響があります。救出は、信頼 (+0.4) と尊敬 (+0.3) を高めます。裏切りは、信頼を大きく損ないます (-0.5)。

### 記憶の固定化

記憶は、以下の3つの段階で時間とともに薄れていきます。

- **鮮明 (vivid)**：重要度が高く、最近形成された記憶
- **薄れ (faded)**：重要度が、薄れの閾値を下回った記憶
- **曖昧 (dim)**：ほとんど記憶に残っておらず、忘れ去られようとしている記憶

各NPCまたはグローバルに、記憶の減衰率を設定できます。

## シリアライズ

`CampaignJournal` と `NpcMemoryBank` は、セッション間でデータを保持するために、`serialize()` および `deserialize()` をサポートしています。

## AI RPG Engine の一部

このパッケージは、[AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) のモノレポの一部です。スタンドアロンで使用することも、エンジン内の認知システムや噂システムと統合することもできます。

## ライセンス

MIT
