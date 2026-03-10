<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/image-gen

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/image-gen)](https://www.npmjs.com/package/@ai-rpg-engine/image-gen)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

[AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) 用の、プロバイダー抽象化を備えたヘッドレスポートレート生成パイプライン。

## インストール

```bash
npm install @ai-rpg-engine/image-gen
```

## 機能

キャラクターのメタデータ（アーキタイプ、背景、特性、専門分野）を生成プロンプトに変換し、プラグイン可能な画像プロバイダーに送信し、結果をアセットレジストリに保存します。 依存関係のないプレースホルダープロバイダーと、ローカルGPUでの生成に使用できるComfyUIプロバイダーが付属しています。

## 使い方

### ポートレートの生成（プレースホルダー）

```typescript
import { PlaceholderProvider, generatePortrait, buildPortraitPrompt } from '@ai-rpg-engine/image-gen';
import { MemoryAssetStore } from '@ai-rpg-engine/asset-registry';

const provider = new PlaceholderProvider();
const store = new MemoryAssetStore();

const meta = await generatePortrait({
  characterName: 'Aldric',
  archetypeName: 'Penitent Knight',
  backgroundName: 'Oath-Breaker',
  traits: ['Iron Frame', 'Cursed Blood'],
  title: 'Grave Warden',
  tags: ['martial', 'oath-broken', 'curse-touched'],
  genre: 'fantasy',
}, provider, store);

// meta.hash is the portraitRef for CharacterBuild
console.log(meta.hash);  // SHA-256 content address
```

### ComfyUIを使用した生成（ローカルGPU）

```typescript
import { ComfyUIProvider, generatePortrait } from '@ai-rpg-engine/image-gen';
import { FileAssetStore } from '@ai-rpg-engine/asset-registry';

const provider = new ComfyUIProvider({
  baseUrl: 'http://localhost:8188',
  checkpoint: 'sd_xl_base_1.0.safetensors',
});

if (await provider.isAvailable()) {
  const store = new FileAssetStore('./assets');
  const meta = await generatePortrait(request, provider, store, {
    generation: { width: 512, height: 512, steps: 20, cfgScale: 7 },
  });
}
```

### プロンプトを手動で作成

```typescript
import { buildPortraitPrompt, buildNegativePrompt } from '@ai-rpg-engine/image-gen';

const prompt = buildPortraitPrompt(request);
// "Portrait of Aldric, Grave Warden, Penitent Knight and Occultist, Oath-Breaker origin, known for being Iron Frame and Cursed Blood, dark fantasy oil painting, dramatic lighting..."

const negative = buildNegativePrompt(request);
// "modern clothing, technology, cartoon, anime, blurry, deformed"
```

### ポートレートの重複排除

```typescript
import { ensurePortrait } from '@ai-rpg-engine/image-gen';

// Generates only if no matching portrait exists in the store
const meta = await ensurePortrait(request, provider, store);
```

## プロバイダー

| プロバイダー | バックエンド | 依存関係 | ユースケース |
|----------|---------|------|----------|
| `PlaceholderProvider` | イニシャル付きのSVG | なし | テスト、開発 |
| `ComfyUIProvider` | ComfyUI HTTP API | ComfyUIサーバー | ローカルGPUでの生成 |

### カスタムプロバイダー

`ImageProvider`インターフェースを実装します。

```typescript
import type { ImageProvider, GenerationResult, GenerationOptions } from '@ai-rpg-engine/image-gen';

class MyProvider implements ImageProvider {
  readonly name = 'my-provider';

  async generate(prompt: string, opts?: GenerationOptions): Promise<GenerationResult> {
    // Your generation logic here
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}
```

## ジャンルスタイルプリセット

9つのジャンル向けの組み込みスタイルプリセット：

| ジャンル | スタイル |
|-------|-------|
| ファンタジー | ダークファンタジーの油絵、ドラマチックな照明 |
| サイバーパンク | ネオン照明、クロムとレザー、ハイコントラスト |
| ミステリー | ヴィクトリア朝のノワール、ガス灯の雰囲気、霧と影 |
| 海賊 | 黄金時代の海洋、風化したテクスチャ |
| ホラー | ダークなイラスト、彩度の低いパレット |
| 西部劇 | ワイルドウェストの油絵、埃っぽいフロンティア |
| SF | コンセプトアート、未来的な設定、映画のような |
| 終末世界 | 廃墟となった都市、サバイバルギア、粗いテクスチャ |
| 歴史 | 時代考証に基づいた、古典的な構図 |

## 連携

ローカルGPUでの高度なプロンプトインテリジェンスとビデオ生成のために、[comfy-headless](https://github.com/mcp-tool-shop-org/comfy-headless) と連携します。

## AI RPG Engineの一部

このパッケージは、[AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) のモノレポの一部です。 データの保存には `@ai-rpg-engine/asset-registry` が必要です。

## ライセンス

MIT
