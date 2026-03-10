<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="300" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@ai-rpg-engine/audio-director"><img src="https://img.shields.io/npm/v/@ai-rpg-engine/audio-director.svg" alt="npm"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
</p>

# @ai-rpg-engine/audio-director

用于[AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine)的确定性音频提示调度引擎。

它是**Immersion Runtime**的一部分，用于将叙述计划转换为定时、优先级的音频指令。

## 安装

```bash
npm install @ai-rpg-engine/audio-director
```

## 功能

Audio Director 接收一个`NarrationPlan`，并生成有序的`AudioCommand[]`，这些指令可以由任何音频后端执行。它负责：

- **优先级**: 语音 > 音效 > 音乐 > 环境音 (可配置)
- **音量降低**: 当语音播放时，环境音/音乐会自动降低音量
- **冷却时间**: 防止音效过度播放 (每个资源可配置)
- **时间同步**: 将提示与语音时长相关联
- **分层跟踪**: 了解哪些环境音层处于活动状态

## 用法

```typescript
import { AudioDirector } from '@ai-rpg-engine/audio-director';
import type { NarrationPlan } from '@ai-rpg-engine/presentation';

const director = new AudioDirector({
  defaultCooldownMs: 2000,
});

// Schedule commands from a narration plan
const commands = director.schedule(plan);

// Execute commands through your audio backend
for (const cmd of commands) {
  await audioBackend.execute(cmd);
}

// Check cooldowns
director.isOnCooldown('alert_warning'); // true if recently played

// Clear cooldowns on scene change
director.clearCooldowns();
```

## 默认音量降低规则

| 触发器 | 目标 | 降低音量 |
|---------|--------|-----------|
| 语音 | 环境音 | 30% 音量 |
| 语音 | 音乐 | 40% 音量 |
| 音效 | 环境音 | 60% 音量 |

## AI RPG Engine 的一部分

此软件包是 [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) 单一代码仓库的一部分。请参阅根目录下的 README 文件以获取完整的架构信息。

## 许可证

MIT
