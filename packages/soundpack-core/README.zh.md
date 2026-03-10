<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="300" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@ai-rpg-engine/soundpack-core"><img src="https://img.shields.io/npm/v/@ai-rpg-engine/soundpack-core.svg" alt="npm"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
</p>

# @ai-rpg-engine/soundpack-core

用于[AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine)的、基于内容寻址的音效注册表和打包规范。

它是**Immersion Runtime**的一部分，用于管理带有标签和可查询功能的音频资源集合。

## 安装

```bash
npm install @ai-rpg-engine/soundpack-core
```

## 功能

音效包是可加载的音频条目集合（音效、环境循环、音乐、语音），包含丰富的元数据，方便查找。该注册表支持基于标签的查询、强度过滤和情绪匹配。

自带一个**核心音效包**，与[voice-soundboard](https://github.com/mcp-tool-shop-org/original_voice-soundboard)程序化效果相关联。

## 用法

```typescript
import { SoundRegistry, CORE_SOUND_PACK } from '@ai-rpg-engine/soundpack-core';

const registry = new SoundRegistry();
registry.load(CORE_SOUND_PACK);

// Query by domain
const ambient = registry.query({ domain: 'ambient' });

// Query by tags + mood
const tenseSfx = registry.query({ tags: ['alert'], mood: ['dread'] });

// Get specific entry
const entry = registry.get('ui_success');
console.log(entry?.voiceSoundboardEffect); // "chime_success"
```

## 核心音效包

13个条目，与voice-soundboard程序化效果相关联：

| ID | 效果 | 领域 | 标签 |
|----|--------|--------|------|
| `ui_notification` | `chime_notification` | sfx | ui, 提示 |
| `ui_success` | `chime_success` | sfx | ui, 积极 |
| `ui_error` | `chime_error` | sfx | ui, 消极 |
| `ui_click` | `click` | sfx | ui, 输入 |
| `ui_pop` | `pop` | sfx | ui, 光 |
| `ui_whoosh` | `whoosh` | sfx | ui, 转换 |
| `alert_warning` | `warning` | sfx | 提示, 注意 |
| `alert_critical` | `critical` | sfx | 提示, 危险 |
| `alert_info` | `info` | sfx | 提示, 信息 |
| `ambient_rain` | `rain` | 环境 | 天气, 平静 |
| `ambient_white_noise` | `white_noise` | 环境 | 背景 |
| `ambient_drone` | `drone` | 环境 | 黑暗, 紧张 |

## 自定义音效包

通过提供`SoundPackManifest`文件，您可以创建自己的音效包：

```typescript
import type { SoundPackManifest } from '@ai-rpg-engine/soundpack-core';

const myPack: SoundPackManifest = {
  name: 'medieval-tavern',
  version: '1.0.0',
  description: 'Tavern ambience and interaction sounds',
  author: 'your-name',
  entries: [
    {
      id: 'tavern_chatter',
      tags: ['ambient', 'social'],
      domain: 'ambient',
      intensity: 'low',
      mood: ['calm', 'social'],
      durationClass: 'long-loop',
      cooldownMs: 0,
      variants: ['tavern_chatter_01.wav'],
      source: 'file',
    },
  ],
};

registry.load(myPack);
```

## AI RPG Engine的一部分

此软件包是[AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine)单仓库的一部分。请参阅根目录的README文件以获取完整的架构信息。

## 许可证

MIT
