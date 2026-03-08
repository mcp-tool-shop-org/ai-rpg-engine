<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/ai-rpg-engine/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

# AI RPG Engine

RPGの世界を構築・分析し、バランスを調整するための、シミュレーションネイティブなツールキット。

AI RPG Engineは、決定論的なシミュレーション実行環境とAI支援デザインスタジオを組み合わせることで、作者が世界を構築し、シミュレーションを通じてテストし、推測ではなくエビデンスに基づいて改善できるようにします。

> 従来のツールは物語を書くことを支援します。
> AI RPG Engineは**世界をテストすること**を支援します。

---

## 機能概要

```
build → critique → simulate → analyze → tune → experiment
```

世界のコンテンツを生成し、デザインを批評し、決定論的シミュレーションを実行し、リプレイの挙動を分析し、メカニクスを調整し、多数のシードで実験を行い、結果を比較できます。すべての結果は再現可能で、検証可能で、説明可能です。

---

## コア機能

### 決定論的シミュレーション

RPG世界のためのティックベースシミュレーションエンジン。世界の状態管理、イベントシステム、知覚・認知レイヤー、派閥の信念伝播、噂システム、ムード導出を含む地区メトリクス、忠誠度の閾値と結果連鎖を持つNPCの自律行動、士気と離脱リスクを持つ仲間システム、プレイヤーの影響力と政治的行動、戦略マップ分析、行動アドバイザー、アイテム認識と装備の来歴、レリック成長マイルストーン、世界の状況から生成される創発的機会（契約、賞金首、依頼、補給任務、調査）、蓄積された状態から導出されるキャンペーンアーク検出（10種類のアーク）、エンドゲームトリガー検出（8種類の解決クラス）、構造化されたエピローグを持つ決定論的フィナーレ描画。リプレイ可能なアクションログと決定論的RNG。すべての実行は正確に再現可能です。

### AI支援による世界構築

テーマから部屋、派閥、クエスト、地区を自動生成するオプションのAIレイヤー。デザインを批評し、スキーマエラーを正規化し、改善案を提示し、段階的な世界構築ワークフローをガイドします。AIがシミュレーションの状態を直接変更することはなく、コンテンツや提案の生成のみを行います。

### ガイド付きデザインワークフロー

世界の構築、批評ループ、デザインの反復、ガイド付きビルド、構造化された調整計画のための、セッション対応・計画優先型のワークフロー。決定論的ツールとAI支援を組み合わせます。

### シミュレーション分析

イベントが発生した理由、メカニクスがどこで破綻しているか、どのトリガーが発火しないか、どのシステムが不安定を引き起こしているかを説明するリプレイ分析。構造化された分析結果は調整に直接反映されます。

### ガイド付き調整

バランス分析の結果から、提案される修正、予想される影響、信頼度の見積もり、プレビューされた変更を含む構造化された調整計画が生成されます。完全なトレーサビリティを備え、段階的に適用されます。

### シナリオ実験

多数のシードでシミュレーションをバッチ実行し、典型的な挙動を把握します。シナリオメトリクスの抽出、分散の検出、パラメータのスイープ、調整済みの世界とベースラインの世界の比較を行います。世界のデザインをテスト可能なプロセスに変えます。

### スタジオシェル

プロジェクトダッシュボード、課題ブラウジング、実験のインスペクション、セッション履歴、ガイド付きオンボーディング、コンテキスト対応のコマンド発見機能を備えたCLIデザインスタジオ。世界を構築しテストするためのワークスペースです。

---

## クイックスタート

```bash
# CLIをインストール
npm install -g @ai-rpg-engine/cli

# インタラクティブスタジオを起動
ai chat

# オンボーディングを実行
/onboard

# 最初のコンテンツを作成
create-room haunted chapel

# シミュレーションを実行
simulate

# 結果を分析
analyze-balance

# デザインを調整
tune paranoia

# 実験を実行
experiment run --runs 50
```

---

## ワークフロー例

```bash
ai chat

/onboard
create-location-pack haunted chapel district
critique-content
simulate
analyze-balance
tune rumor propagation
experiment run --runs 50
compare-replays
```

世界を構築し、シミュレーションのエビデンスに基づいて改善します。

---

## アーキテクチャ

このシステムは4つのレイヤーで構成されています。

| レイヤー | 役割 |
|-------|------|
| **Simulation** | 決定論的エンジン — 世界の状態、イベント、アクション、知覚、認知、派閥、噂の伝播、地区メトリクス、リプレイ |
| **Authoring** | コンテンツ生成 — スキャフォールディング、批評、正規化、修復ループ、パックジェネレーター |
| **AI Cognition** | オプションのAI支援 — チャットシェル、コンテキストルーティング、検索、メモリ整形、ツールオーケストレーション |
| **Studio UX** | CLIデザイン環境 — ダッシュボード、課題追跡、実験ブラウジング、セッション履歴、ガイド付きワークフロー |

---

## パッケージ

| パッケージ | 目的 |
|---------|---------|
| [`@ai-rpg-engine/core`](packages/core) | 決定論的シミュレーション実行環境 — 世界の状態、イベント、RNG、ティック、アクション解決 |
| [`@ai-rpg-engine/modules`](packages/modules) | 29の組み込みモジュール — 戦闘、知覚、認知、派閥、噂、地区、NPCの自律行動、仲間、プレイヤーの影響力、戦略マップ、行動アドバイザー、アイテム認識、創発的機会、アーク検出、エンドゲームトリガー |
| [`@ai-rpg-engine/content-schema`](packages/content-schema) | 世界コンテンツの標準スキーマとバリデーター |
| [`@ai-rpg-engine/character-profile`](packages/character-profile) | キャラクターの成長状態、負傷、マイルストーン、評判 |
| [`@ai-rpg-engine/character-creation`](packages/character-creation) | アーキタイプの選択、ビルド生成、初期装備 |
| [`@ai-rpg-engine/equipment`](packages/equipment) | 装備の種類、アイテムの来歴、レリック成長、アイテム年代記 |
| [`@ai-rpg-engine/campaign-memory`](packages/campaign-memory) | クロスセッションメモリ、関係性の影響、キャンペーン状態 |
| [`@ai-rpg-engine/ollama`](packages/ollama) | オプションのAIオーサリング — スキャフォールディング、批評、ガイド付きワークフロー、調整、実験 |
| [`@ai-rpg-engine/cli`](packages/cli) | コマンドラインデザインスタジオ — チャットシェル、ワークフロー、実験ツール |
| [`@ai-rpg-engine/terminal-ui`](packages/terminal-ui) | ターミナルレンダラーと入力レイヤー |
| [`@ai-rpg-engine/starter-fantasy`](packages/starter-fantasy) | The Chapel Threshold — ファンタジーのスターターワールド |
| [`@ai-rpg-engine/starter-cyberpunk`](packages/starter-cyberpunk) | Neon Lockbox — サイバーパンクのスターターワールド |
| [`@ai-rpg-engine/starter-detective`](packages/starter-detective) | Gaslight Detective — ヴィクトリア朝ミステリーのスターターワールド |
| [`@ai-rpg-engine/starter-pirate`](packages/starter-pirate) | Black Flag Requiem — 海賊のスターターワールド |
| [`@ai-rpg-engine/starter-zombie`](packages/starter-zombie) | Ashfall Dead — ゾンビサバイバルのスターターワールド |
| [`@ai-rpg-engine/starter-weird-west`](packages/starter-weird-west) | Dust Devil's Bargain — ウィアードウェストのスターターワールド |
| [`@ai-rpg-engine/starter-colony`](packages/starter-colony) | Signal Loss — SFコロニーのスターターワールド |

---

## ドキュメント

| リソース | 説明 |
|----------|-------------|
| [Handbook](docs/handbook/index.md) | すべてのシステムを網羅する43章と4つの付録 |
| [Design Document](docs/DESIGN.md) | アーキテクチャの詳細解説 — アクションパイプライン、真実と表現、シミュレーションレイヤー |
| [AI Worldbuilding Guide](packages/ollama/AI_WORLDBUILDING.md) | スキャフォールド、診断、調整、実験のワークフロー |
| [Philosophy](PHILOSOPHY.md) | 決定論的な世界、エビデンス駆動設計、AIをアシスタントとして活用する理由 |
| [Changelog](CHANGELOG.md) | リリース履歴 |

---

## フィロソフィー

AI RPG Engineは3つの理念に基づいて構築されています。

1. **決定論的な世界** — シミュレーションの結果は再現可能でなければなりません。
2. **エビデンス駆動設計** — 世界のメカニクスはシミュレーションを通じてテストされるべきです。
3. **AIはアシスタントであり、権威ではない** — AIツールはデザインの生成と批評を支援しますが、決定論的システムに取って代わるものではありません。

詳細については [PHILOSOPHY.md](PHILOSOPHY.md) を参照してください。

---

## セキュリティ

AI RPG Engineは**ローカル専用のシミュレーションライブラリ**です。テレメトリ、ネットワーク通信、機密情報は一切ありません。セーブファイルは明示的に要求された場合にのみ `.ai-rpg-engine/` に保存されます。詳細は [SECURITY.md](SECURITY.md) を参照してください。

## 要件

- Node.js >= 20
- TypeScript (ESM モジュール)

## ライセンス

[MIT](LICENSE)

---

<a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a> が開発
