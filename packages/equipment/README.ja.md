<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/equipment

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/equipment)](https://www.npmjs.com/package/@ai-rpg-engine/equipment)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

[AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) 用の装備スロット、アイテム定義、および装備管理機能。

## インストール

```bash
npm install @ai-rpg-engine/equipment
```

## 機能

5つのスロット（武器、防具、アクセサリー、ツール、装飾品）にまたがるキャラクターの装備を、アイテムカタログ、装備操作、タグベースの要件、および集計効果計算を使用して管理します。すべての操作は不変です。

## 使用方法

### 作成と装備

```typescript
import {
  createEmptyLoadout,
  equipItem,
  computeLoadoutEffects,
} from '@ai-rpg-engine/equipment';
import type { ItemCatalog } from '@ai-rpg-engine/equipment';

const catalog: ItemCatalog = {
  items: [
    {
      id: 'iron-sword',
      name: 'Iron Sword',
      description: 'A sturdy blade.',
      slot: 'weapon',
      rarity: 'common',
      statModifiers: { str: 2 },
      grantedTags: ['armed'],
      grantedVerbs: ['slash'],
    },
  ],
};

let loadout = createEmptyLoadout();
const result = equipItem(loadout, 'iron-sword', catalog, []);
// result.loadout.equipped.weapon === 'iron-sword'
// result.errors === []

const effects = computeLoadoutEffects(result.loadout, catalog);
// effects.statModifiers.str === 2
// effects.grantedTags === ['armed']
```

### インベントリ管理

```typescript
import { addToInventory, removeFromInventory } from '@ai-rpg-engine/equipment';

let loadout = createEmptyLoadout();
loadout = addToInventory(loadout, 'healing-potion');
const { loadout: updated, removed } = removeFromInventory(loadout, 'healing-potion');
```

### 検証

```typescript
import { validateLoadout } from '@ai-rpg-engine/equipment';

const result = validateLoadout(loadout, catalog, characterTags);
// result.ok, result.errors
```

## スロット

| スロット | 目的 |
|------|---------|
| `weapon` | 主な攻撃アイテム |
| `armor` | 防御装備 |
| `accessory` | 指輪、アミュレット、強化アイテム |
| `tool` | ユーティリティアイテム（ピッキングツール、スキャナー） |
| `trinket` | チャーム、バッジ、パッシブアイテム |

## アイテムのレア度

`common` | `uncommon` | `rare` | `legendary`

## レリック成長 — 名前を獲得する装備

何らかの行動を起こしたアイテムは、その履歴を蓄積し、その履歴が名前となります。3人の命を奪ったカットラスは、**血染めのカットラス**になります。成長はアイテムの記録から計算され、手動で作成されることはありません。

`evaluateRelicGrowth` は読み取り側であり、記録をティアとエピタフに変換します。

```typescript
import { evaluateRelicGrowth } from '@ai-rpg-engine/equipment';

const relic = evaluateRelicGrowth(item, chronicle, currentTick);
// -> { currentEpithet: 'Bloodied Cutlass', milestonesReached: [...], tier: 1 }
```

5つのトリガーがこれを駆動します — `kill-count`（キル数）、`age`（経過時間）、`recognition-count`（認識された回数）、`faction-kills`（派閥のキル数）、`boss-kill`（ボスを倒した回数）— これらはすべて記録からカウントされます。武器はデフォルトで `DEFAULT_WEAPON_MILESTONES` を、それ以外のアイテムは `DEFAULT_ARMOR_MILESTONES` を使用します。パック全体でアイテムごとにオーバーライドできます。

`createItemChronicleCore` は書き込み側であり、実際のゲームプレイから履歴を記録する **オプションの** `EngineModule` です。

```typescript
import { createItemChronicleCore, getItemDisplayName } from '@ai-rpg-engine/equipment';
import { evaluateItemRecognition } from '@ai-rpg-engine/modules';

// add to your engine's module list
createItemChronicleCore({
  catalog: itemCatalog,
  recognition: { evaluate: evaluateItemRecognition }, // optional
})

getItemDisplayName(world, 'cutlass', 'Cutlass'); // 'Bloodied Cutlass'
```

これは、`acquired`（最初の取得または装備）、`used-in-kill`（キラーが装備した武器にクレジットされる）、および `recognized`（ゾーン内の誰かがあなたの出自に反応した場合）を記録します。`recognition` はインポートするのではなく注入されます。これは、このパッケージが `@ai-rpg-engine/modules` にランタイム依存関係を持たないためです。成長は、`getItemDisplayName`、`getRelicSummary`、`getItemChronicle` を使用して読み戻すか、必要に応じて `refreshRelicSummaries` を使用して再計算できます。

記録は決定論的であり、イベント駆動型で、`event.tick` に基づき、壁時計や乱数ジェネレーターは使用しません。モジュールを追加しないゲームは、モジュールが存在する前に構築されたものとバイト単位で同一であり、モジュールはデフォルトのネームスペースを登録しないため、何も記録されない世界では、状態がまったく生成されることはありません。

## AI RPG Engine の一部

このパッケージは、[AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) モノリポの一部です。

## ライセンス

MIT
