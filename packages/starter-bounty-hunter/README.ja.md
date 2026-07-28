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

# @ai-rpg-engine/スターター・バウンティハンター

**構成の例** — このスターターは、追跡を基本とするゲームループと、都市のどちらの部分がまだあなたに門を開いてくれるのかという要素を実際のゲーム内通貨として扱う方法を示しています。これはあくまで参考となるものであり、そのままコピーして使用するテンプレートではありません。独自のゲームを作成するには、[構成ガイド](../../docs/handbook/57-composition-guide.md)を参照してください。

**ヒュー・アンド・クライ**――あなたは、警察が存在しない街で、また誰も警察を望んでいない街で、盗みを専門とする「捕吏」だ。ここでは法など存在しない。代償があり、そしてあなたがいる。

「AI RPGエンジン」のスターターパックカタログの一部。

## テーマ

「騒ぎ立てて追跡する」という行為こそが、真の制度である。それは、誰かが追跡を開始したら、傍観者全員がそれに加わる法的義務を意味する。また、まさにそれが、当時の言葉で言えば、「熱」の原理に基づいたものであり、**今この瞬間に世界が注意を払うかどうかは「熱」によって決まり、そして、その後もそれを記憶し続けるかどうかは、その時の状況（立場）によって決まる**のである。このパックは、そうした原理に基づいて構成されており、単にそれを取り囲んでいるわけではない。また、追跡の時間を二重にカウントすることもない。

この街には、それぞれが金で動く二つの勢力がある。賞金稼ぎの組織は、一人につき報酬を支払い、お前が獲物を捕らえるための法的根拠を与えてくれる。そして、裏社会は沈黙、盗まれた品物、証言しない男のために金を払う。ジョナサン・クイル――自らを「犯罪者狩りの総司令官」と呼ぶ男――は、この二つの勢力を同時に利用できることに気づいた。彼はこの組織のボスであり、怪物ではない。ただのお前だ、4年後の同じ道を歩むお前だ。

## クイックスタートガイド

```typescript
import { createGame, pursuitState, formatPursuitForNarrator } from '@ai-rpg-engine/starter-bounty-hunter';

const engine = createGame(71);

// Sign for a ticket — the office now owns what you do next
engine.submitAction('speak', { targetIds: ['clerk-hesper'] });
engine.submitAction('choose', { parameters: { choiceId: 'sign' } });

// Buy a word, walk it down, take him breathing
engine.submitAction('informant', { targetIds: ['nightman'] });
engine.submitAction('move', { targetIds: ['shambles'] });
engine.submitAction('move', { targetIds: ['rookery'] });
engine.submitAction('collar', { targetIds: ['rookery-runner'] });

// Then choose a side, for today
engine.submitAction('impeach', { targetIds: ['rookery-runner'] });  // the office
// ...or take the other road entirely
engine.submitAction('fence', { toolId: 'stolen-plate' });           // the ward

console.log(formatPursuitForNarrator(engine.world));
// [SEARCHED] Somebody raised the cry. Faces turn when you pass. (heat 12 — 10+ and the cry is up)
```

## 実演されたパターン

- **2つ目の時計を持たない追跡ループ** — `pursuitState`は、ゲームエンジン自身の`player_heat`と勢力アラートに基づいて完全に導き出される。`HUNTED_HEAT`はワールドティックの`HEAT_ESCALATION_THRESHOLD`であるため、プレイヤーが追われているかどうかについて矛盾する2つの数値を持つことはない。
- **集団からの圧力という二面性のある評判** — `warrant`は合法的な保護であり、`infamy`はアンダーワールドにおけるあなたの評価である。どちらか一方を強化すると、もう一方を消費することになる。どちらも「失墜度」を示すものではなく、価値が減少するわけではなく、単にあなたが傾きつつある方向を示すだけだ。
- **拒否というメカニズム** — `collar`は、合法的な保護と、すでに打ち負かされたターゲットの両方を必要とし、拒否する場合の理由を説明する。何も検証しない行為は、報酬が伴うダメージロールとなる。
- **教義をプレイヤーの行動として表現** — `lay-low`は、ゲームエンジンが既に評価している「静けさ」を、あなたが選択できるものに変え、誰も見ていないときは拒否する。常に機能する行動は何も教えてくれないからだ。
- **生成ルールに基づいて逆算して作成されたコンテンツ** — クラーク・ヘスペルは、同盟関係にあり貪欲である。なぜなら、それがゲームエンジンの`contract`ルールが提供できる唯一のNPCの形だからだ。「ザ・ルーカリー」は貧しく制御されていない状態で作成されている。それは、地区のルールで定められていることによる。
- **集団固有のモジュール** — `pursuit-core`は、`@ai-rpg-engine/modules`ではなく、スターターの中に存在する。なぜなら、それには正確に1つの消費者しかいないからだ。2回目の段階で強化する。

## 独自のメカニズム

| 動詞 | その機能は何か。 |
|------|--------------|
| `collar` | 令状に基づいて、まだ使用可能な状態の印鑑を採取する。そのためには、法的根拠と、すでに摩耗している印鑑が必要であり、それ以外の場合は拒否し、その理由を説明する。記録を作成するものであり、支払いとは関係ない。 |
| `impeach` | あなたが所有する商標に反する証言をする。不正行為を立件へとつなげる：捜査令状の発行、悪評の低下。当局は、最後まで任務を遂行する犯罪者逮捕担当者を信頼している。 |
| `informant` | ある人物の居場所を買う。その価格は、路上での自分の評判によって決まり、見知らぬ人には二倍の値段になる。そして、尋ねること自体が合図となり、悪評が広まっていく。 |
| `post-bounty` | 自分の権限で価格を決め、会社の予算を使ってそれを実行する。個人的な恨みが、他の人の仕事になるのだ。 |
| `fence` | 不正な市場を通じて、回収した商品を流通させている。必要なのは**人材**であり、単なるメニューではない。わざと低賃金で支払う：あなたは金のためにここにいるのではない。 |
| `lay-low` | 姿を隠して一日過ごし、騒ぎが収まるのを待つ。誰も見ていないときに拒否する。 |

**追跡状態**は、`COLD`／`SEARCHED`／`HUNTED`のいずれかであり、各状態にはその原因となった数値が記録されます。警戒レベルが60以上の勢力が、静かな一週間をかけてあなたを追い詰めます。これは、警戒レベルが記憶を表し、熱（活動）が注意を表すという教義に基づいています。この教義は、組織独自の用語で説明されています。

## コンテンツ

- **3つの地区にまたがる7つのエリア**: ワード（役所と会議場）、シャンブルズ（市場と死者の壁）、ルークリー——貧しく、管理されておらず、率直な答えを得るのがより困難。

- **4人のNPC**: 事務員ヘスペル、マザー・スラック、ピーク軍曹（仲間として加えることができる）、書記官

- **3体の敵＋1体のボス**: ジョナサン・クイルは負けるほど強くなるのではなく、より率直になる。

- **3つのクエスト**: ファーストチケット、ブラッドマネー、シーフテイカー将軍

- **6つのアイテム**: タイバーンチケットを含む。これは実際に譲渡可能な証明書であり、歴史的には与えられた報酬よりも価値があった。

## 統計データとリソース

| 統計データ | 役割 |
|------|------|
| `grip` | 相手にされたくないと思っている男性に対して、あなたは何ができるでしょうか。 |
| `nose` | 状況を察知する、帳簿を読む、嘘を見抜く——それが盗みを専門とする者の真の腕の見せどころだ。 |
| `authority` | この件に関して、皆さんは私がそうする権利を持っていると考えるかどうか。 |

| リソース | 行動 |
|----------|-----------|
| `hp` | 最高気温は32度——あなたは人をだまして生計を立てているのでしょう。 |
| `stamina` | ある目的を追求するには、それなりの代償が伴う。戦いはその代償を消費し、`lay-low`はそれを回復させる。 |
| `coin` | 情報提供者が何を求めているか。 |
| `warrant` | 法的保護。`collar`と`post-bounty`によって消費され、`impeach`によって回復される。 |
| `infamy` | 街のもう半分は、あなたを別の形で評価するでしょう。それは「廃墟度」を示すものではありません。 |

戦闘マップは、`attack → grip`、`precision → nose`、`resolve → authority`です。ここでは暴力が禁止されていません。むしろ、**激しい**戦いが繰り広げられ、次の段階に進むために必要なスタミナを消費します。

## 何を借りるか

ゲームに追いかけっこ要素がある場合、状態遷移の定義は次のようになります。3つの要件を満たす必要があります。1つ目は、決定論的であること。2つ目は、すべての状態遷移において、そのトリガーを明確に示すこと。3つ目は、エンジンがすでに所有していない状態が存在しないこと。ゲームに互いに相容れないものを求める複数の勢力がある場合、両者の関係性を考慮する必要があります。そして、`anti-inert.test.ts`です。これは、パック内のすべての動詞について、何らかの変化をもたらすことを証明する行と、その拒否が単なる沈黙ではなく、構造化された拒否であることを証明する行を用意することを意味します。

## ライセンス

MIT
