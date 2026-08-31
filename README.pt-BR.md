<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.md">English</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/ai-rpg-engine/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

# Motor de RPG com IA

Um conjunto de ferramentas TypeScript para criar simulações de RPG determinísticas. Você define atributos, escolhe módulos, configura uma sequência de combate e cria conteúdo. O motor gerencia o estado, os eventos, o gerador de números aleatórios (RNG), a resolução de ações e a tomada de decisões da IA. Cada execução é reproduzível.

Este é um **motor de composição**, não um jogo completo. Os 12 mundos iniciais são exemplos — padrões que podem ser decompostos, dos quais você pode aprender e remixar. Seu jogo usa qualquer subconjunto do motor que você precisar.

---

## O que é

- Uma **biblioteca de módulos** — mais de 30 módulos do motor que abrangem combate, percepção, cognição, facções, rumores, deslocamento, companheiros e muito mais
- Um **conjunto de ferramentas de composição** — `buildCombatStack()` configura o combate em cerca de 7 linhas; `new Engine({ modules })` inicia o jogo
- Um **ambiente de execução de simulação** — ciclos determinísticos, registros de ações reproduzíveis, RNG com sementes
- Um **estúdio de design de IA** (opcional) — estrutura, crítica, análise de equilíbrio, ajuste, experimentos via Ollama
- Uma **camada opcional na blockchain** — `@ai-rpg-engine/ledger-adapter` garante que a moeda e os itens negociáveis de um jogo sejam respaldados por tokens reais da **testnet** XRPL, liquidados em pontos de verificação, totalmente fora do núcleo determinístico (opcional; uma execução é idêntica em termos de bytes sem ela)

## O que não é

- Não é um único jogo completo — ele oferece 12 mundos iniciais jogáveis que você pode `run` hoje como exemplos, e o motor é o conjunto de ferramentas a partir do qual você compõe seu *próprio* jogo
- Não é um motor visual — ele gera eventos estruturados, não pixels
- Não é um gerador de histórias — ele simula mundos; a narrativa emerge da mecânica

---

## Status atual (v3.8.1)

**What works and is tested:**
- **The host surface is on the Engine (v3.8.1):** `hash`, `present`, `preview`, `getAvailableActions`, `advanceRound`, sidecar `listActions` + save/load, studio `emit-pack`, JSON pack catalogs and `ruleProfiles`. A Godot attach and a JSON `--content` boot no longer copy CLI internals to invent those seams. 7893 tests.
- Core runtime: world state, events, actions, ticks, replay — stable since v1.0; deterministic byte-identical replay (per-instance id counter, seeded RNG)
- Combat system: 5 actions, 4 combat states, 4 engagement states, companion interception, defeat flow, AI tactics
- Abilities: costs, cooldowns, stat checks, typed effects, 11-tag status vocabulary, AI-aware selection
- **Party combat (v2.4):** ally-targeting (heal / buff / revive), friend/foe AoE filtering, target selectors — a healer can heal a teammate; enemy AoE spares allies
- **Status effects (v2.4):** passive stat modifiers reach combat, deterministic DoT/HoT off the tick counter, depth-capped reactive triggers (thorns/reflect)
- **Plug-in Profiles — per-entity rule resolution (v2.5):** a `might` fighter and a `will` mystic resolve combat in one fight, each reading stats through its own mapping. `RuleProfile` + `WorldState.ruleProfiles` + `EntityState.ruleProfileId`; `applyProfile()` attaches a profile (stat mapping, resource pools, per-entity abilities); `buildProfile()`, `validateProfileSet()` (duplicate ids rejected), 10 starter-derived templates, and a `profile` CLI command
- **Playable `run` loop (v2.6):** the terminal game is real, not a demo — enemies act on their own AI intent profiles (`aggressive`/`cautious`/`territorial`/`calculating`), a fight ends in victory or defeat, you can save and resume, and abilities and XP are on the action menu. `run <path>` loads a game you scaffolded. Composed terminal UI with a glance-able HUD and accessible color (honors `NO_COLOR` / non-TTY)
- **AI design studio ships as its own `ai` command (v2.6):** `npm install -g @ai-rpg-engine/ollama` → `ai chat` — scaffold, critique, and balance content against a local Ollama model
- Unified decision layer: combat + ability scoring merged into one call (`selectBestAction`)
- All 12 starter worlds use `buildCombatStack()` — the proven composition spine
- Cognition config API (`cognition: CognitionCoreConfig | false`) for per-starter AI tuning
- Tag taxonomy and validation utilities for content authoring
- **The world reacts (v2.7):** kills accrue heat and erode district safety; a per-round world tick spawns hidden pressures that surface as rumors ("Whispers reach you…"), escalate, and expire with consequences; the ~30 authored encounter compositions fire on zone entry in all 10 starters — deterministic per-seed, bloodier districts spawn more, boss set-pieces protected
- **A reason to return (v2.7):** a minimal quest loop on the long-shipped schema — quests offer on triggers, track kill/reach/progress objectives, and pay XP and items exactly once; four authored quests, a **Journal** screen, quest beats in the round's narration
- **Equipment reaches combat (v2.7):** `equip`/`unequip` move real numbers through the status layer the combat formulas already read — zero combat-code changes; gladiator's trident-and-net is wired end-to-end with a test-pinned hit-chance delta
- **Seeded runs (v2.7):** every fresh session prints its seed with the exact replay command; `--seed <n>` reproduces a session byte-for-byte; combat, resist, ability, and tactics rolls all consume the world seed — and endings read the run you actually played (live heat, pressures, faction accruals, player level)
- **`buildWorldStack()` (v2.7):** the strategic composition spine beside `buildCombatStack()` — one call assembles environment, factions, rumors, districts, defeat fallout, encounters, and quests; plus the **Director's Ledger** strategy screen, an `AI_RPG_DEBUG=1` simulation inspector, `inspect-save` gated by the same authorities as Continue, and a module save-migration seam on the shipped restore path
- **Act on the living economy (v2.8):** `createEconomyCore` seeds a per-district economy at pack-load and ticks it each round; a new `sell` verb prices loot through `computeItemValue` (scarcity / faction / provenance / contraband) and shifts local supply. One write-wire lit five systems that shipped dark in v2.7 — the Director's MARKET OVERVIEW + FACTIONS scoring, the endgame merchant-prince arc and collapse trigger, and four economy pressure kinds. **Sell-only this cycle** (buying → v2.9)
- **Companions (v2.8):** a `recruit` verb builds a party — state, tags, and faction, so a companion fights *with* you; companion combat rides combat-core's interception mechanic (dark until `isAlly` got set), companions react with morale and can depart, and recruiting lights seven waiting consumers — the finale's COMPANIONS roll-call, party targeting, npc-agency goals, favor-quests, and the Director's PARTY section. **Passive interception this cycle** (independent turns → v2.9)
- **The Director reads the whole board (v2.8):** a new EQUIPMENT Ledger section (behind the cli→equipment provenance dependency), a DIRECTOR'S SUMMARY finale trailer, the MARKET OVERVIEW + PARTY sections now fed from live producers, and district stability + economic tone in the finale's DISTRICTS section
- **The economy's other half (v2.9):** a `buy` verb completes the loop — merchant stock offered per district at supply-category granularity (supply level *is* the restock signal), priced through the same `computeItemValue` pipeline as `sell` plus a buy/sell spread so there's no riskless round-trip. And crafting comes alive: `createCraftingCore` registers `salvage`/`craft`/`repair`/`modify` over the authored recipe tables, lighting the Director's MATERIALS + RECIPES sections that shipped dark
- **Companions take their own turns (v2.9):** the passive-interception floor from v2.8 becomes the ceiling — recruited companions act independently each round through the previously-unused `selectBestAction` advisor, with a per-role combat bias so a fighter and a scholar fight differently, companion-on-companion interception, and party HP on the Director's PARTY line. Companion-less packs stay byte-identical (the empty-party gate preserves seed-0 legacy replay)
- **The social layer, connected end to end (v2.9):** four leverage verbs — `bribe`, `intimidate`, `petition`, `seed` (rumor) — write real reputation / alert / heat globals that trade pricing and faction gates already read, and `seed` lights the whole player-rumor module + the Director's RUMORS ABOUT YOU section. The leverage *economy* that funds them is wired too: completing an opportunity now grants the leverage it always narrated, so the verbs are genuinely earnable in play
- **Opportunities, the full lifecycle (v2.9):** a per-round spawner offers contracts/bounties/favors scored against live world state; you `accept`, then `complete` or `abandon`; ignoring one to its deadline now has consequences (expiry fallout), and completing a companion favor moves that companion's morale. The endgame's rising-power and merchant-prince arcs read the opportunities you actually resolved
- **Content parity across all ten starters (v2.9):** equipment wiring, quests, recruitable companions, and a starting coin balance rolled out to every starter that lacked them — the ten worlds now share a uniform, fully-lit feature surface (equipment was gladiator-only; quests were fantasy/zombie-only; five worlds shipped `recruit` with no one to recruit). Plus a structural content validator that catches a typo'd item id across every reference surface, and multi-checkpoint save slots with `--checkpoint`/`--list-checkpoints`
- **Living NPCs, actually alive (v3.0):** the persisted npc-agency producer lights the Director's **PEOPLE** section — named NPCs (one authored story character per starter, plus every companion you recruit) carry goals, trust/fear/greed/loyalty relationships, an obligation ledger, and consequence chains. `runNpcAgencyTick` runs each round, gated so a world with no named NPCs stays byte-identical to legacy replay. Lighting the producer also lit companion favor-fallout departure breakpoints, two dormant opportunity spawn rules (npc-goal + obligation), and the endgame's npcProfiles/npcObligations — the wire was tested green but inert in shipped content until a Phase-9 audit caught it, so the fix ships an authored named NPC in every starter
- **The full social surface (v3.0):** the four leverage verbs become twenty-five — the diplomacy and sabotage groups register (21 more sub-verbs), lighting the previously-dark `leverage-diplomacy` / `leverage-sabotage` companion reactions; nineteen surface on the numbered menu (afford + cooldown + reputation gated). Dialogue conditions and effects now read and write social state (leverage / reputation / npc-relationship). And passive leverage income (`tickLeverage` / `computeLeverageGains`) drips influence from reputation and grants favor / blackmail / legitimacy from XP and milestones — so the social layer earns *between* opportunities, not only on completion
- **Genre-flavored economy (v3.0):** merchant stock and crafting recipes now resolve per-starter genre tables (seven of ten starters carry authored genre content; three fall back to universal, honestly) — across the buy/craft mechanics, the numbered-menu display, and the Director's RECIPES section, all threaded from the same ruleset key so display and mechanics agree. `repair` and `modify` are numbered menu rows now (item×recipe pairing), and `escort` opportunities spawn on a protective-travel-in-a-dangerous-district gate
- **The endgame reads the leverage you earned (v3.0):** the `victory`, `puppet-master`, and `quiet-retirement` campaign endings — long gated on influence / blackmail / legitimacy that the endgame layer read as hardcoded zero — are reachable now through the real leverage store the whole social economy writes. Companion departure is reachable too, via npc-agency breakpoints and a morale-floor fallback
- **`audit-content` dev CLI (v3.0):** a developer content-audit command (sibling of `validate`, distinct from the player-facing Director's Ledger) that runs the six encounter / boss / combat director formatters over a pack
- **Genre-flavored *starting supply* — v3.0's opener, delivered (v3.1):** `economyGenre` threads each starter's bare ruleset key through `buildWorldStack` → `createEconomyCore`, so a district now seeds its genre's `GENRE_SUPPLY_DEFAULTS` profile (cyberpunk runs high on components / contraband, fantasy runs medicine scarce) instead of a flat universal baseline — the starting supply the Director's MARKET tone and the endgame inputs already read. Seven of ten starters carry a genre profile; three fall back to baseline, honestly. A field separate from `tradeGenre` / `craftingGenre` so the three can diverge later
- **The social surface, complete (v3.1):** `deny` and `bury-scandal` — the rumor-manipulation pair that targets an existing rumor by id rather than a faction — reach the numbered menu through a rumor-target pairing dimension, closing the twenty-one-verb surface (19 → 21 surfaced)
- **`obligation-exists` dialogue, wired and reachable (v3.1):** the dialogue condition reads a named NPC's persisted obligation ledger (`getPersistedNpcObligations`) — fantasy's Brother Aldric, once he owes you a favor through ordinary npc-agency play, unlocks a `call-in-favor` choice — a real gate where v3.0 left a silent always-true stub (a Phase-9 played-session audit proved it reachable in a real run, not just unit-green)
- **Genre-flavored repair (v3.1):** every genre-carrying starter authors a signature `repair` recipe in its genre table (fantasy `repair-rune-mend`, cyberpunk `repair-nanite-weld`, …), surfaced through `getAvailableRecipes` — repair is flavored now, not only universal
- **Opt-in XRPL ledger settlement (v3.2):** a new optional `@ai-rpg-engine/ledger-adapter` package binds the player-owned tradeable layer — `coin` → an IOU, consumables → fungible tokens, a checkpoint's net `buy`/`sell` delta → a settled **XLS-85 token escrow** — to the **XRPL testnet**, entirely outside the deterministic core. Nothing in `core`/`modules` imports it and a run is byte-identical with or without it (proven on the real pirate `createGame()` merchant loop). Testnet-only behind a mainnet-impossible-in-code guard, with a gitignored secrets sidecar, conservation-safe retries, on-chain memo verification, and an unanchored fallback; proven live end-to-end on testnet (settle via token escrow → `reconcile` against on-ledger balances + memos). NFT unique gear lands in v3.3 (below). See [The XRPL ledger adapter](#the-xrpl-ledger-adapter-opt-in)
- **Unique gear as NFTs (v3.3):** the `@ai-rpg-engine/ledger-adapter` binds the `equipment` package's unique gear — the deferred "later slice" from v3.2 — to XRPL NFTs: each unique item minted as an **XLS-20 NFToken** (`tfMutable`, never burnable — true player ownership) at a checkpoint, relic growth advancing a mutable NFT's metadata in place via **XLS-46 `NFTokenModify`**, and a `reconcile()` ownership family verifying on-ledger `account_nfts`. A distinct read path over the equipment loadout, carried alongside the fungible layer — same determinism firewall, byte-identical with or without it. Proven on the real `starter-gladiator` played session, live on testnet (mint the equipped `trident-and-net` as an NFT, own it on-ledger, reconcile, world unperturbed)
- **Gear that earns a name (v3.4):** relic growth has existed since v3.3 but had never fired during play — nothing populated an item-chronicle in a running game, so every item's relic version was permanently `0`. The write side ships now: an **opt-in `item-chronicle-core`** module records `acquired` / `used-in-kill` / `recognized` from real play, and `starter-gladiator` wires it — win three arena fights and the retiarius trident is the **Bloodied Trident & Net** for the rest of the run, shown in the HUD and the Director's ledger. This also **closes the NFT loop**: a checkpoint settles that growth as a real **XLS-46 `NFTokenModify`**, advancing the on-ledger URI while preserving the NFTokenID. Fixed along the way: `boss-kill` and `recognized` were both unreachable on every shipped pack (a bare-`boss` tag check against content that tags `role:boss`, and a faction guard against content where no entity sets one) — and the latter had been silently blocking *all* armor growth. Opt-in by construction: a pack that does not wire it is byte-identical to the engine that shipped before it existed
- **Consequences that leave real marks (v3.8):** the strategic layer FIRED after v3.7 — offers spawned, resolved, and the narrator could speak the result — and then the world forgot it. `applyOpportunityFallout` declared **fourteen** effect types and persisted **six**: an obligation announced and entered in no ledger, a rumor that spread to nobody, a title that titled no one. All fourteen persist now, each through the owning system's own writer, and two of them **close feedback loops** — a sink-written obligation moves the loyalty breakpoint that decides what an NPC offers you next, and sink-moved trust opens the gate those offers are read through. Three effect types turned out to be dead one level EARLIER than a missing sink (`materials` and `spawn-opportunity` were emitted by nothing at all; every `spawn-pressure` producer sat on a resolution no shipped path could reach), so the cycle authored producers rather than building guards that could never fire. The `betray` op lands as the fourth transition and lights **six obligation sites, three rumors and all three original spawn-pressure producers** that had been authored across earlier releases and reached by nothing. A session-wide **ledger audit** then found three MORE sinks on the pressure applier nobody had indicted — which is what reconciling in both directions buys over an orphan scan. And the twelfth starter, **Hue and Cry**, is authored backwards from the consequence layer: a thief-taker in a city with no police force, 7/7 on the pack rubric
- **The strategic layer, lit (v3.7):** the tier above moment-to-moment verbs — where opportunities spawn, companions passively matter, and districts have moods — was half-dark, and nothing could see it. A new catalog-wide probe boots all eleven packs and drives **forty full rounds** through the same driver the interactive CLI uses (NPC turns, companion turns, then the world tick), because `runWorldTick` is a per-round function rather than a verb and a probe built from `submitAction` alone sees half a round forever. It measured **one of eight opportunity kinds** ever firing on shipped content. All **eight fire now**, each with a played-session proof that the reward actually landed — and one that deliberately runs out the clock, so an expiry's authored fallout (reputation lost, a district gone hungrier) is proven on real content rather than assumed. What was in the way was never the rules: `contract` needed an NPC both allied AND greedy, which the breakpoint table makes mutually exclusive with `favorable`, and `relations['player-trust']` had been authored exactly ONCE in the entire catalog; district economies erased their own genre-and-tag character within ~15 rounds by drifting every category to a universal 50; `world.factions[].reputation` — the authored baseline the engine explicitly merges — was set by no pack, so every world began at a flat zero with everyone. **Pacing** is tuned against named findings rather than taste, each cited at the constant it governs (choice-overload, quest-variance, relax valleys, radiant repetition, appointment dynamics), and guarded by a deterministic regression. **Twelve of the thirteen** companion and district modifier fields now reach a resolution function through a parameter seam, each with a named contribution in the payload so a UI can say WHO helped — a computed-but-unrendered modifier is experientially identical to no modifier. `use` **stops silently destroying things**: 89 of 90 authored items across the catalog were consumed by a verb that found no effect and spliced them out of the bag anyway, reporting success. And the `statusTags` contract, declared by all eleven packs and enforced by none, is bound — declarations widened to shipped truth first, then gated
- **The instrument turned on the catalog (v3.6):** the pack built to USE the ledger is now run deliberately as an engine-polishing instrument. A catalog-wide **verb-reachability audit** boots all eleven packs and SUBMITS each verb through the real engine, asking whether any target in the booted world accepts it — a gate no existing check could pass or fail, because verb-honesty compares the help table against registered handlers and never looks at the content. Run before any fix, it caught `recruit` advertised in Salt Road Ledger with zero recruitable NPCs (the v2.9 defect, re-introduced) and `use` inert across the pack's entire catalog. `give` ships as the engine's **first entity-to-entity item transfer** — atomic, structured-rejecting, chronicle-stamped by event — closing a gap where a pack could make an item obtainable and have nothing able to hand it to anyone. And the two remaining adapter axes that were config flags with **zero behavioral reads** became behaviours: `diary` mode (witnessed, not custodied — one anchor per checkpoint, no trust lines, reconcile verifies the anchor chain) and `issuerMode: 'persistent'` (a market that outlives the run). Proven **15/15 on live XRPL testnet**
- **A game whose loop is debt (v3.5):** the eleventh starter, **Salt Road Ledger**, is the first authored backwards from a system rather than a genre — you play a factor trading on someone else's capital, and five commerce verbs (`appraise` / `haggle` / `consign` / `underwrite` / `audit`) carry the game while combat is priced as a penalty (the resource profile has an empty `gains` array — nothing rewards violence). `consign` is the only verb in the catalog whose offline semantics match a settlement primitive one-to-one, which makes it the reference pack for the ledger adapter while carrying **no dependency on it**. Ships with the `mercantile` genre and a merchant economy profile, and 7/7 on the pack rubric. The same cycle made two long-inert adapter axes real — the memo `VERB:` field (declared with members no call site could emit) and `config.settlement` (declared with zero reads anywhere) — and a played-session audit of the new pack found six mechanics that were wired, schema-valid, unit-green and dead
- `ai-rpg-engine create-starter <name>` — scaffold a new game (standalone, runs outside the monorepo); `validate` + `scaffold` content commands; load packs from JSON
- Published starter template on npm (`@ai-rpg-engine/starter-template`)
- Full test suite: **7893 tests** (deterministic across repeated runs; test files typechecked in CI; coverage ratchet-enforced)

**O que é incompleto ou inacabado:**
- O estúdio de criação de mundos de IA (camada Ollama) é testado de forma menos rigorosa do que o núcleo de simulação e precisa de um daemon Ollama local; é totalmente opcional — o motor e o loop `run` não precisam de rede.
- A pilha de narração/áudio cria comandos de áudio determinísticos, mas não há **nenhum backend de áudio terminal** — nada emite som; os comandos são um ponto de integração para um incorporador de GUI/web.
- O modo multijogador (dois jogadores humanos compartilhando um mundo) **não** está implementado — é uma camada de rede, intencionalmente fora do escopo; os perfis atuais têm como alvo um único controlador.
- `replay --replay` restaura o arquivo salvo em vez de ress simular — e, após a v2.9, essa é a **direção** definida, não um adiamento: `Engine.serialize()` já é um snapshot completo e comprovado do estado, enquanto a ress simulação teria que rastrear o estado do mundo/encontro que existe fora do registro de ações. A v2.9 oferece slots de salvamento com vários pontos de verificação nesse caminho de restauração comprovado; a ress simulação baseada em eventos não está planejada.
- A v3.1 encerrou os três limites nomeados da v3.0 — **fornecimento inicial** do gênero, receitas de *reparo* específicas do gênero e a superfície do menu `deny` / `bury-scandal`, tudo isso agora está disponível. O limite real que permanece: essas novas receitas de reparo de gênero carregam um `statDelta` criado (um pequeno bônus de estatística) que `resolveRepair` ainda não aplica — o reparo *restaura*, `modify` *melhora* — então, o reparo como melhoria é marcado no código e **adiado para a v3.2/v3.3** como uma mecânica deliberada, não um campo inerte silencioso. E `obligation-exists` é lançado com uma demonstração criada (Irmão Aldric); a condição está ativa para que os criadores de conteúdo adicionem mais diálogos.
- A documentação é extensa, mas nem todas as páginas do manual refletem as APIs mais recentes.

---

## Como é

A interface de usuário terminal incluída compõe cada turno em seções rotuladas — cena, status, registro e ações — com uma interface HUD de fácil visualização. Por padrão, a saída é texto simples e adiciona cor semântica em um TTY (dano em vermelho, cura em verde, rejeições em amarelo), respeitando `NO_COLOR` e pipes não-TTY; cada indicação é transmitida no texto também, nunca apenas com cor.

```text
── The Crypt Gate ──────────────────────────────────────────
  [dark, unhallowed]

  ! Crypt Warden · HP 6/14 · Off Balance
  ! Bone Thrall · defeated
  + Mira · HP 11/16

  * rusted portcullis winch

  Exits: Ossuary, Churchyard

── Status ──────────────────────────────────────────────────
  HP 9/20 [#####-----]  Stamina 4/10
  Status: Guarded
  Items: healing-draught, grave-key

── Log ─────────────────────────────────────────────────────
  > Ash takes a guarded stance.
  > Hit!  4 damage dealt (HP: 6)
  > Bone Thrall defeated!
  > You can't do that: not enough stamina

── Actions ─────────────────────────────────────────────────
  [ 1] Move to Ossuary      [ 3] Attack Crypt Warden
  [ 2] Move to Churchyard   [ 4] Inspect Crypt Warden
────────────────────────────────────────────────────────────
```

---

## Instalar e jogar

Jogue um jogo inicial ou crie o seu próprio a partir do terminal:

```bash
npm install -g @ai-rpg-engine/cli

ai-rpg-engine run                    # pick a starter, build a character, play
ai-rpg-engine create-starter my-game # scaffold a new game you can edit and run
ai-rpg-engine run ./my-game          # run a game you scaffolded
```

O loop `run` é uma sessão real baseada em turnos: os inimigos agem com base em seus próprios perfis de IA, as habilidades e o XP estão no menu, você pode salvar e retomar, e uma luta termina em vitória ou derrota. Cada jogo é determinístico e pode ser reproduzido.

Opcionalmente, o estúdio de design de IA é instalado como um comando separado:

```bash
npm install -g @ai-rpg-engine/ollama
ai chat                              # scaffold, critique, and balance content
                                     # against a local Ollama model (see Ch. 36)
```

O estúdio se comunica com um daemon [Ollama](https://ollama.com) local — execute `ollama serve` e `ollama pull qwen2.5-coder` primeiro. É totalmente opcional; o motor e o loop `run` não precisam de rede.

Uma imagem de contêiner é publicada no GHCR como `ghcr.io/mcp-tool-shop-org/ai-rpg-engine` para CI e execuções em sandbox.

---

## Início rápido

Prefere criar seu próprio jogo no código? Compile o motor a partir de módulos:

```typescript
import { Engine } from '@ai-rpg-engine/core';
import { buildCombatStack, traversalCore, statusCore, createDialogueCore } from '@ai-rpg-engine/modules';

// Define your stat mapping
const combat = buildCombatStack({
  statMapping: { attack: 'might', precision: 'agility', resolve: 'will' },
  playerId: 'hero',
  biasTags: ['undead', 'beast'],
});

// Wire the engine
const engine = new Engine({
  manifest: myManifest,
  modules: [statusCore, ...combat.modules, traversalCore, createDialogueCore(myDialogues)],
});

// Submit player actions
engine.submitAction('attack', { targetIds: ['skeleton-1'] });

// Submit AI entity actions
engine.submitActionAs('guard-captain', 'attack', { targetIds: ['player'] });
```

Consulte o [Guia de composição](site/src/content/docs/handbook/57-composition-guide.md) para obter o fluxo de trabalho completo ou crie um novo jogo inicial:

```bash
npx @ai-rpg-engine/cli create-starter my-game
```

---

## Arquitetura

| Camada | Função |
|-------|------|
| **Core Runtime** | Motor determinístico — estado do mundo, eventos, ações, ticks, RNG, reprodução |
| **Modules** | Mais de 30 sistemas compostos — combate, percepção, cognição, facções, travessia, companheiros, etc. |
| **Content** | Entidades, zonas, diálogos, itens, habilidades, status — criados pelo autor |
| **AI Studio** | Camada Ollama opcional — criação de protótipos, crítica, análise de equilíbrio, ajuste, experimentos |

---

## O adaptador do livro-razão XRPL (opcional)

`@ai-rpg-engine/ledger-adapter` é um pacote **opcional** que vincula a **camada comercial negociável de propriedade do jogador** de um jogo — o saldo `coin` e o inventário de itens consumíveis que os verbos `trade-core` `buy`/`sell` já movem — para a **testnet XRPL**, para que esses ativos possam ser respaldados por tokens reais no livro-razão e liquidados em pontos de verificação. Um adaptador ausente é exatamente o motor offline que é lançado hoje.

**A invariante do determinismo (o objetivo principal).** O adaptador é um *canal lateral*, nunca parte da simulação:

- Ele **nunca é invocado dentro do tick determinístico** — apenas em **pontos de verificação** (salvar, entrada na cidade/mercado, quebra de capítulo).
- Nada em `@ai-rpg-engine/core` ou `@ai-rpg-engine/modules` o importa (sua única dependência do motor é um `import type` em tempo de compilação).
- **Uma execução é idêntica em bytes com ou sem ele.** Um teste de firewall executa o loop de comerciante `starter-pirate` `createGame()` real em dois motores — um com o adaptador habilitado e liquidando em um ponto de verificação — e afirma que os dois mundos são profundamente iguais. A reprodução da semente 0 não é afetada.

**Níveis de integração — um jogo o incorpora tão profundamente quanto seu design desejar.** O firewall é uma *fronteira de determinismo*, não uma regra anti-integração; a invariante acima se mantém em todos os níveis:

| Nível | O que depende do adaptador | Se encaixa |
|-------|-----------------------------|------|
| **L0 — External observer** | Nada dentro do jogo; o adaptador se anexa externamente em pontos de verificação e o jogo não tem conhecimento disso. | Retrofit de um jogo existente (a demonstração de pirata lançada). |
| **Nível 1 — Pontos de verificação acionados pelo jogo** | O próprio fluxo de salvamento/cidade/progressão meta do jogo chama o adaptador em momentos definidos. | Um jogo que deseja momentos de livro-razão deliberados. |
| **L2 — Ledger-native design** | A economia ou identidade do jogo é projetada *em torno* da propriedade na cadeia (emissor persistente, mercados reais). | Um jogo de comerciante com foco no livro-razão. |

A distinção que mantém a reprodução segura **não** é "qual pacote importa o adaptador", mas "a chamada está dentro do tick". Um pacote de jogo pode importar e acionar o adaptador livremente, desde que cada chamada ocorra em um ponto de verificação fora do loop de reprodução baseado em sementes.

**Três modos de jogo.** `offline` (padrão — sem cadeia, o motor como é lançado) · `ledger` (moedas/itens respaldados por saldos da testnet, liquidados em pontos de verificação) · `diary` (jogue offline e, em seguida, ancore o hash do estado da execução no livro-razão para um recibo à prova de adulteração).

**O que está no livro-razão.** `coin` → um título de dívida em moeda emitida em uma linha de confiança;
itens consumíveis → tokens fungíveis; o saldo líquido de uma transação em um ponto de controle → uma transferência liquidada por meio do **escrow de token XLS-85**. Equipamentos exclusivos são enviados como **NFTs XLS-20**
(v3.3), com o crescimento de relíquias avançando os metadados de um NFT mutável no local por meio de
**XLS-46 `NFTokenModify`** — impulsionado por jogabilidade real a partir da v3.4. A economia abstrata do distrito (`economy-core`) *não* é afetada — permanece uma simulação pura.

**Medidas de segurança.** Apenas para testnet, com uma proteção estrutural **impossível na mainnet** (não uma flag de configuração); as chaves da carteira ficam em um arquivo secundário ignorado pelo Git, nunca no arquivo de salvamento; o liquidação é idempotente e segura em termos de conservação no caminho de repetição; as provas verificam o **memo real na cadeia** (não a string do próprio motor); e, se a cadeia estiver inacessível, a execução simplesmente continua, marcada como *não ancorada*.

**Comprovadamente funcional.** Uma execução real de um comerciante `starter-pirate` — venda de um sabre, compra de uma bala de canhão — é liquidada na testnet XRPL por meio de um escrow de token e, em seguida, `reconcile()` confirma os saldos e os memos no livro-razão em relação à economia do motor (a conservação é mantida para cada token). O livro-razão é uma família de sistemas diferente do motor, portanto, o motor não pode falsificá-lo — a reconciliação é um verificador externo genuíno. Apenas para testnet; os ativos são recibos com escopo de jogo, não títulos.

---

## Sistema de Combate

Cinco ações (atacar, defender, desengajar, preparar, reposicionar), quatro estados de combate (defendido, desequilibrado, exposto, fugindo), quatro estados de engajamento (engajado, protegido, retaguarda, isolado). Três dimensões de atributos impulsionam todas as fórmulas, de modo que um duelista rápido joga de forma diferente de um lutador pesado ou um sentinela composto.

Os oponentes de IA usam pontuação de decisão unificada — as ações e habilidades de combate competem em uma única avaliação, com limites configuráveis para evitar o uso excessivo de habilidades marginais.

Os autores de pacotes usam `buildCombatStack()` para conectar o combate a um mapeamento de atributos, perfil de recursos e tags de viés. Consulte a [Visão Geral do Combate](site/src/content/docs/handbook/49a-combat-overview.md) e o [Guia do Autor de Pacotes](site/src/content/docs/handbook/55-combat-pack-guide.md).

---

## Habilidades

Sistema de habilidades nativo do gênero, com custos, verificações de atributos, tempos de recarga e efeitos tipados (dano, cura, aplicação de status, limpeza). Os efeitos de status usam um vocabulário semântico de 11 tags com perfis de resistência/vulnerabilidade. As pontuações de seleção com reconhecimento de IA avaliam caminhos de auto/AoE/alvo único.

```typescript
const warCry: AbilityDefinition = {
  id: 'war-cry', name: 'War Cry', verb: 'use-ability',
  tags: ['combat', 'debuff', 'aoe'],
  costs: [{ resourceId: 'stamina', amount: 3 }],
  target: { type: 'all-enemies' },
  checks: [{ stat: 'nerve', difficulty: 6, onFail: 'abort' }],
  effects: [
    { type: 'apply-status', target: 'target', params: { statusId: 'rattled', duration: 2 } },
  ],
  cooldown: 4,
};
```

---

## Pacotes

| Pacote | Propósito |
|---------|---------|
| [`@ai-rpg-engine/core`](packages/core) | Tempo de execução de simulação determinística — estado do mundo, eventos, RNG, ticks, resolução de ações |
| [`@ai-rpg-engine/modules`](packages/modules) | Mais de 30 módulos compostos — combate, percepção, cognição, facções, rumores, travessia, companheiros, agência de NPC, mapa estratégico, reconhecimento de itens, oportunidades emergentes, detecção de arco, gatilhos de fim de jogo |
| [`@ai-rpg-engine/content-schema`](packages/content-schema) | Esquemas e validadores canônicos para conteúdo do mundo |
| [`@ai-rpg-engine/character-profile`](packages/character-profile) | Progressão do personagem, ferimentos, marcos, reputação |
| [`@ai-rpg-engine/character-creation`](packages/character-creation) | Seleção de arquétipo, geração de construção, equipamento inicial |
| [`@ai-rpg-engine/equipment`](packages/equipment) | Tipos de equipamento, proveniência de itens e crescimento de relíquias — incluindo `item-chronicle-core`, o módulo opcional que registra o histórico do equipamento da jogabilidade real para que os itens obtenham epítetos e níveis |
| [`@ai-rpg-engine/campaign-memory`](packages/campaign-memory) | Memória entre sessões, efeitos de relacionamento, estado da campanha |
| [`@ai-rpg-engine/rumor-system`](packages/rumor-system) | Ciclo de vida do rumor, mecânicas de mutação, rastreamento de disseminação |
| [`@ai-rpg-engine/presentation`](packages/presentation) | Esquema do plano de narração, contratos de renderização, perfis de voz |
| [`@ai-rpg-engine/audio-director`](packages/audio-director) | Agendamento de dicas, prioridade, atenuação, lógica de tempo de recarga |
| [`@ai-rpg-engine/soundpack-core`](packages/soundpack-core) | Manifestos de pacotes de som, registro endereçável por conteúdo |
| [`@ai-rpg-engine/pack-registry`](packages/pack-registry) | Registro de pacotes, pontuação de rubrica, descoberta de pacotes |
| [`@ai-rpg-engine/asset-registry`](packages/asset-registry) | Armazenamento endereçado por conteúdo para retratos, ícones, mídia |
| [`@ai-rpg-engine/image-gen`](packages/image-gen) | Geração de retrato sem interface com provedores plugáveis |
| [`@ai-rpg-engine/ollama`](packages/ollama) | Autoria de IA opcional — estrutura, crítica, fluxos de trabalho guiados, ajuste, experimentos |
| [`@ai-rpg-engine/cli`](packages/cli) | CLI: execute jogos, crie modelos iniciais, inspecione salvamentos |
| [`@ai-rpg-engine/terminal-ui`](packages/terminal-ui) | Renderizador de terminal e camada de entrada |
| [`@ai-rpg-engine/starter-merchant`](packages/starter-merchant) | Início mercantil — o pacote de referência para o adaptador do livro-razão, sem dependência dele |
| [`@ai-rpg-engine/starter-bounty-hunter`](packages/starter-bounty-hunter) | Início de ladrão — perseguição como o ciclo e qual metade da cidade abrirá uma porta para você |
| [`@ai-rpg-engine/ledger-adapter`](packages/ledger-adapter) | **Opcional** — liquidação opcional na testnet XRPL para a camada comercial de propriedade do jogador (moeda/inventário/comércio), por meio de um escrow de token XLS-85 em pontos de controle, totalmente fora do núcleo determinístico |

### Exemplos de Início

Os 12 mundos iniciais são **exemplos de composição** — eles demonstram como combinar módulos do motor em jogos completos. Cada um mostra padrões diferentes (mapeamentos de atributos, perfis de recursos, configurações de engajamento, conjuntos de habilidades). Consulte o README de cada início para obter "Padrões Demonstrados" e "O que Copiar".

| Início | Gênero | Padrões Principais |
|---------|-------|-------------|
| [`starter-fantasy`](packages/starter-fantasy) | Fantasia sombria | Combate mínimo, orientado ao diálogo |
| [`starter-cyberpunk`](packages/starter-cyberpunk) | Cyberpunk | Recursos, funções de engajamento |
| [`starter-detective`](packages/starter-detective) | Mistério vitoriano | Socialmente orientado, com foco na percepção |
| [`starter-pirate`](packages/starter-pirate) | Pirata | Naval + combate corpo a corpo, multi-zona |
| [`starter-zombie`](packages/starter-zombie) | Sobrevivência de zumbis | Escassez, recurso de infecção |
| [`starter-weird-west`](packages/starter-weird-west) | Faroeste estranho | Viés do pacote, recuperação de zona segura |
| [`starter-colony`](packages/starter-colony) | Colônia de ficção científica | Gargalos, zonas de emboscada |
| [`starter-ronin`](packages/starter-ronin) | Japão feudal | Passagens escondidas, múltiplas funções de protetor |
| [`starter-merchant`](packages/starter-merchant) | Mercantil | Obrigação como o ciclo, combate com preço como uma penalidade |
| [`starter-bounty-hunter`](packages/starter-bounty-hunter) | Perseguição | Caça de pessoas por dinheiro; a violência é alta, não proibida |
| [`starter-vampire`](packages/starter-vampire) | Horror de vampiros | Recurso de sangue, manipulação social |
| [`starter-gladiator`](packages/starter-gladiator) | Gladiador histórico | Combate na arena, favor da multidão |

---

## Documentação

| Recurso | Descrição |
|----------|-------------|
| [Create Your Own Starter](site/src/content/docs/handbook/58-create-your-own-starter.md) | Crie um novo jogo — CLI ou modelo manual |
| [Composition Guide](site/src/content/docs/handbook/57-composition-guide.md) | Crie seu próprio jogo combinando módulos do motor |
| [Plug-in Profiles](site/src/content/docs/handbook/59-plugin-profiles.md) | Resolução de regras por entidade — combate de estilo de jogo misto, `applyProfile`, modelos de perfil, a CLI `profile` |
| [XRPL Ledger Adapter](site/src/content/docs/handbook/60-xrpl-ledger-adapter.md) | Integração opcional no livro-razão — o firewall de determinismo, níveis de integração L0/L1/L2, modos de jogo, mecanismos de segurança e a demonstração de pirata testada ao vivo |
| [Combat Overview](site/src/content/docs/handbook/49a-combat-overview.md) | Seis pilares de combate, cinco ações, estados em resumo |
| [Pack Author Guide](site/src/content/docs/handbook/55-combat-pack-guide.md) | Construa passo a passo o combatStack, mapeamento de estatísticas, perfis de recursos |
| [Handbook](site/src/content/docs/handbook/index.md) | Manual abrangente — todos os sistemas, mais 4 apêndices |
| [Composition Model](docs/composition-model.md) | As 6 camadas reutilizáveis e como elas se combinam |
| [Examples](docs/examples/) | Exemplos executáveis em TypeScript (verificados por tipo + testados em comportamento no CI) — festa mista por entidade, perfis compartilhados, entre mundos, do zero |
| [Design Document](docs/DESIGN.md) | Análise aprofundada da arquitetura — pipeline de ação, verdade versus apresentação |
| [Philosophy](PHILOSOPHY.md) | Mundos determinísticos, design orientado por evidências, IA como assistente |
| [Changelog](CHANGELOG.md) | Histórico de lançamentos |

---

## Roteiro

### Onde estamos agora

Ambas as estruturas de composição estão completas — 6412 testes em 326 arquivos, todos os 12 iniciadores em `buildCombatStack` **e** `buildWorldStack`, reprodução determinística e idêntica em bytes sob sementes impressas, pontuação completa das decisões da IA e uma CLI que cria, executa, valida e inspeciona. **A v3.0 torna o mundo vivo: NPCs nomeados ganham vida com objetivos, relacionamentos de confiança/medo/ganância/lealdade, livros-razão de obrigação e cadeias de consequências; a camada social ganha passivamente e gasta em vinte e um novos verbos de diplomacia/sabotagem; a economia é personalizada por gênero para cada iniciador; e a vantagem que você ganha finalmente alcança os finais da campanha que ela controla. Uma auditoria da Fase 9 detectou um problema que estava presente no conteúdo lançado, mas inativo — a correção lança um NPC nomeado em cada iniciador.**

**Ciclo de lançamento recente (v2.4.0–v3.0.0):**
- v2.4.0 — Combate em grupo (ataque/cura/buff/revive em aliados, efeito de status (modificadores + DoT/HoT + gatilhos reativos), Fase 1 dos Perfis plug-in, conteúdo CLI `validate`/`scaffold`
- v2.5.0 — Resolução de regras por entidade (combate de estilo de jogo misto), o carregador `applyProfile` + habilidades por entidade, modelos de perfil + CLI `profile` e uma passagem completa de saúde
- v2.6.0 — O comando `run` se tornou um jogo real: os inimigos agem com base em seus próprios perfis de IA, vitória/derrota, salvar/retomar, habilidades e XP no menu, o binário do estúdio `ai` e a pilha de narração
- v2.7.0 — O mundo reage e há uma razão para retornar: calor → pressões → consequências narradas, encontros de entrada de zona, um loop de missão + Diário, equipamento em combate, execuções reproduzíveis com sementes, entradas de fim de jogo ao vivo, `buildWorldStack`, o Livro-Razão do Diretor e uma junção de migração de salvamento
- v2.8.0 — Aja no mundo em que você vive: uma economia comercial ao vivo + verbo `sell`, companheiros que você recruta e luta ao lado e um Livro-Razão do Diretor que lê todo o tabuleiro — um fio de escrita por sistema acendeu ~12 consumidores que foram lançados em modo inativo
- v2.9.0 — Feche os ciclos: `buy` + estoque de mercador e artesanato completam a economia; os companheiros fazem jogadas independentes; quatro verbos sociais (suborno / intimidação / petição / semente) são executados em uma economia de vantagem financiada por recompensas de oportunidade; as oportunidades são resolvidas com expiração + consequência de queda de favor; e equipamento, missões, recrutáveis e moeda inicial são distribuídos uniformemente para todos os dez iniciadores
- **v3.0.0 — Torne o mundo vivo: o produtor de agência de NPC acende NPCs nomeados (objetivos / relacionamentos / livros-razão de obrigação / cadeias de consequências) mais um NPC de história em cada iniciador; a superfície social cresce para 25 verbos (diplomacia + sabotagem) com renda passiva de vantagem e diálogo que lê o estado social; estoque e receitas personalizadas por gênero para cada iniciador; os finais de vantagem (vitória / mestre de marionetes / aposentadoria tranquila) se tornam alcançáveis; linhas de menu de reparo/modificação, oportunidades de escolta e uma CLI de desenvolvimento `audit-content` — lançados por meio de uma auditoria da Fase 9 que detectou dois fios mortos que o conjunto de testes verde ocultou**

### Próximo (a estrutura da v3.0)

- **NPCs vivos** — o produtor de agência de NPC persistente que acende a seção PEOPLE do Diretor: NPCs nomeados com objetivos, pontos de interrupção de relacionamento, livros-razão de obrigação e cadeias de consequências, mais favor-queda de moral do companheiro e o caminho de risco de partida que o sistema de reação já carrega
- Estoque de mercador e receitas de artesanato personalizados por gênero (por iniciador, com base na opção padrão universal que é lançada hoje) e a superfície do menu `repair`/`modify`
- A próxima camada da economia de vantagem — renda passiva além das recompensas de oportunidade e verbos sociais além dos quatro lançados (grupos de diplomacia / sabotagem) — mais o vocabulário de condição/efeito de diálogo que lê o novo estado social
- Multijogador — dois jogadores *humanos* compartilhando um mundo (uma camada de rede, deliberadamente adiada; perfis compartilhados de controlador único são lançados hoje como [`shared-profiles.ts`](docs/examples/shared-profiles.ts))
- Substituições de fórmula serializáveis — ajuste de fórmula por perfil (bloqueado em uma DSL de fórmula; os perfis carregam mapeamentos de estatísticas hoje, não closures)
- Sincronização da documentação da API — garantir que cada página do manual reflita as APIs mais recentes

### Destino: Perfis plug-in

O objetivo final do motor são **perfis definidos pelo usuário** — pacotes portáteis que se encaixam em qualquer jogo. Um perfil empacota um mapeamento de estatísticas, comportamento de recurso, tags de viés de IA e habilidades em uma única unidade importável. A partir da v2.5, as entidades em um mundo podem ter seus próprios perfis e resolver o combate por entidade — um lutador `might` e um místico `will` compartilham um grupo, cada um trazendo seu próprio estilo de jogo.

O esquema, o carregador `applyProfile`, a resolução de habilidades por entidade e a validação entre perfis são todos lançados. O que resta é o multijogador — permitir que dois jogadores *humanos* (não apenas duas entidades) compartilhem um mundo — que é uma camada de rede. Consulte [Roteiro do Perfil](docs/profile-roadmap.md) e [feature-architecture.md](docs/feature-architecture.md) para o design.

---

## Filosofia

O motor de RPG com IA é construído em torno de três ideias:

1. **Mundos determinísticos** — os resultados da simulação devem ser reproduzíveis.
2. **Design orientado por evidências** — a mecânica do mundo deve ser testada por meio de simulação.
3. **IA como assistente, não como autoridade** — as ferramentas de IA ajudam a gerar e avaliar projetos, mas não substituem os sistemas determinísticos.

Consulte [PHILOSOPHY.md](PHILOSOPHY.md) para obter a explicação completa.

---

## Segurança

O motor principal é uma **biblioteca de simulação apenas local**: sem telemetria, sem rede, sem segredos. Os arquivos de salvamento são armazenados em `.ai-rpg-engine/` apenas quando solicitado explicitamente. Duas camadas **opcionais** adicionam um caminho de saída, e apenas quando você as invoca:

- A camada de IA (`@ai-rpg-engine/ollama`) se comunica com um daemon Ollama **local**; sua opção de adesão `webfetch` (para RAG) é restrita por um protetor SSRF (bloqueia loopback/link-local/CGNAT/metadados da nuvem e equivalentes IPv6 tunelados).
- A camada de registro (`@ai-rpg-engine/ledger-adapter`) acessa a **testnet XRPL** — e apenas a testnet: um protetor estrutural **impossível na rede principal no código** (não uma flag de configuração) rejeita qualquer host que não seja da testnet durante a construção. As sementes da carteira são armazenadas em um arquivo de segredos ignorado pelo Git, nunca em um arquivo de salvamento, e o núcleo determinístico nunca importa o adaptador.

Consulte [SECURITY.md](SECURITY.md) para obter detalhes.

## Requisitos

- Node.js >= 20
- TypeScript (módulos ESM)

## Licença

[MIT](LICENSE)

---

Criado por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
