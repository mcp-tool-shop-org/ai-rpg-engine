<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

# @ai-rpg-engine/image-gen

[![npm](https://img.shields.io/npm/v/@ai-rpg-engine/image-gen)](https://www.npmjs.com/package/@ai-rpg-engine/image-gen)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE)

用于 [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) 的无头人物肖像生成流水线，具有提供商抽象功能。

## 安装

```bash
npm install @ai-rpg-engine/image-gen
```

## 功能

将角色元数据（原型、背景、特征、专长）转换为生成提示，将其发送到可插拔的图像提供商，并将结果存储在资源注册表中。 包含一个零依赖的占位符提供商和一个用于本地 GPU 生成的 ComfyUI 提供商。

## 用法

### 生成肖像（占位符）

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

### 使用 ComfyUI（本地 GPU）生成

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

### 手动构建提示

```typescript
import { buildPortraitPrompt, buildNegativePrompt } from '@ai-rpg-engine/image-gen';

const prompt = buildPortraitPrompt(request);
// "Portrait of Aldric, Grave Warden, Penitent Knight and Occultist, Oath-Breaker origin, known for being Iron Frame and Cursed Blood, dark fantasy oil painting, dramatic lighting..."

const negative = buildNegativePrompt(request);
// "modern clothing, technology, cartoon, anime, blurry, deformed"
```

### 确保肖像（去重）

```typescript
import { ensurePortrait } from '@ai-rpg-engine/image-gen';

// Generates only if no matching portrait exists in the store
const meta = await ensurePortrait(request, provider, store);
```

## 提供商

| 提供商 | 后端 | 依赖项 | 使用场景 |
|----------|---------|------|----------|
| `PlaceholderProvider` | 带有首字母的 SVG | 无 | 测试、开发 |
| `ComfyUIProvider` | ComfyUI HTTP API | ComfyUI 服务器 | 本地 GPU 生成 |

### 自定义提供商

实现 `ImageProvider` 接口：

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

## 风格预设

内置 9 个类型的风格预设：

| 类型 | 风格 |
|-------|-------|
| 奇幻 | 黑暗奇幻油画，戏剧性光照 |
| 赛博朋克 | 霓虹灯，铬合金和皮革，高对比度 |
| 神秘 | 维多利亚时代黑色电影，煤气灯氛围，雾气和阴影 |
| 海盗 | 黄金时代的航海，风化的纹理 |
| 恐怖 | 黑暗插图，柔和的、饱和度低的调色板 |
| 西部 | 怪异西部油画，尘土飞扬的边境 |
| 科幻 | 概念艺术，未来主义的场景，电影感 |
| 后末日 | 废弃的城市，生存装备，粗糙的纹理 |
| 历史 | 符合时代，经典的构图 |

## 集成

与 [comfy-headless](https://github.com/mcp-tool-shop-org/comfy-headless) 配合使用，可增强提示智能，并在您的本地 GPU 上进行视频生成。

## AI RPG Engine 的一部分

此软件包是 [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) 单一代码仓库的一部分。 依赖于 `@ai-rpg-engine/asset-registry` 进行存储。

## 许可证

MIT
