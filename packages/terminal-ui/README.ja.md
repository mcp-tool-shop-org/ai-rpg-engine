<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/ai-rpg-engine/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

# @ai-rpg-engine/terminal-ui

AI RPG Engine のターミナルレンダラーおよび入力レイヤー。イベントストリームを読みやすいターミナル出力に変換します。

## インストール

```bash
npm install @ai-rpg-engine/terminal-ui
```

## 構成要素

- **イベントレンダラー**: エンジンのイベントを整形されたターミナルテキストに変換します。
- **入力パーサー**: プレイヤーのコマンドをエンジンアクションに変換します。
- **カラーテーマ**: さまざまなゲームジャンル向けの ANSI カラーパレット。
- **レイアウトヘルパー**: ステータスバー、部屋の説明、エンティティリストなど。

## 使い方

```typescript
import { TerminalRenderer, InputParser } from '@ai-rpg-engine/terminal-ui';

const renderer = new TerminalRenderer();
const parser = new InputParser();

// Render engine events
for (const event of events) {
  renderer.render(event);
}

// Parse player input into actions
const action = parser.parse('attack guard');
```

## ドキュメント

- [ハンドブック](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

作成者: <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
