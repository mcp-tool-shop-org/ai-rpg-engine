<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="300" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@ai-rpg-engine/presentation"><img src="https://img.shields.io/npm/v/@ai-rpg-engine/presentation.svg" alt="npm"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
</p>

# @ai-rpg-engine/presentation

用于[AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine)的叙述计划模式、渲染协议以及呈现状态类型。

它是**沉浸式运行时**的一部分，该运行时是一个多模态的呈现流水线，可以将游戏状态转换为结构化的视听体验。

## 安装

```bash
npm install @ai-rpg-engine/presentation
```

## 其功能

与直接输出原始文本不同，叙述器会生成一个**叙述计划**，这是一个结构化的配方，描述了文本、音效、环境音、音乐提示、UI效果以及语音合成参数。

任何前端（终端、网页、Electron）都实现`PresentationRenderer`接口，以接收和执行这些计划。

## 主要类型

| 类型 | 用途 |
|------|---------|
| `NarrationPlan` | 结构化的叙述配方（文本 + 音效 + 环境音 + 音乐 + UI） |
| `SpeakerCue` | 语音合成参数（语音ID、情感、速度） |
| `SfxCue` | 音效触发器（音效ID、时间、强度） |
| `AmbientCue` | 环境音控制（开始、停止、淡入淡出） |
| `MusicCue` | 背景音乐控制（播放、停止、增强、减弱） |
| `UiEffect` | 终端/屏幕视觉效果（闪烁、摇晃、淡出） |
| `VoiceProfile` | 语音配置，用于语音合成 |
| `PresentationRenderer` | 渲染协议——任何前端都必须实现此协议 |

## 用法

```typescript
import type { NarrationPlan, PresentationRenderer } from '@ai-rpg-engine/presentation';
import { validateNarrationPlan, isValidNarrationPlan } from '@ai-rpg-engine/presentation';

// Validate a plan from Claude's output
const errors = validateNarrationPlan(planFromClaude);
if (errors.length === 0) {
  // Plan is valid, execute it
}

// Type guard
if (isValidNarrationPlan(data)) {
  console.log(data.sceneText);
}
```

## AI RPG Engine 的一部分

此包是 [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) 单仓库的一部分。请参阅根目录的 README 文件以获取完整的架构信息。

## 许可证

MIT
