<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/ai-rpg-engine/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

# @ai-rpg-engine/starter-bounty-hunter

> **Composition Example** — This starter demonstrates how to build a game whose loop is pursuit, and whose real currency is which half of a city will still open a door to you. It is an example to learn from, not a template to copy. See the [Composition Guide](../../docs/handbook/57-composition-guide.md) to build your own game.

**Hue and Cry** — You are a thief-taker in a city with no police force and no wish for one. There is no law here. There is a price, and there is you.

Part of the [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) starter pack catalog.

## Theme

*Hue and cry* is the real institution: the legal duty of every bystander to join a pursuit once it has been raised. It is also, exactly, this engine's heat doctrine in period language — **heat decides whether the world is paying attention right now; standing decides whether it remembers afterward.** The pack is authored with that doctrine rather than around it. It adds no second pursuit clock.

The city has two halves that both pay for names. The bounty office pays by the head and lends you the legal cover to take one. The underworld pays for silence, for stolen plate, and for a man who does not testify. Jonathan Quill — who calls himself Thief-Taker General — discovered you can run both at once. He is the boss of this pack, and he is not a monster; he is you, four years further down the same road.

## Quick Start

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

## Patterns Demonstrated

- **A pursuit loop with no second clock** — `pursuitState` is a pure derivation over the engine's own `player_heat` and faction alert. `HUNTED_HEAT` *is* world-tick's `HEAT_ESCALATION_THRESHOLD`, so the player never has two numbers that disagree about whether they are being hunted.
- **A two-sided reputation as the pack's pressure** — `warrant` is legal cover; `infamy` is the underworld's read of you. Working one raises it and spends the other. Neither is a ruin meter; there is no losing value, only a side you are drifting toward.
- **Refusal as a mechanic** — `collar` requires legal cover *and* a mark already beaten down, and says why when it refuses. A taking that verifies nothing is a damage roll with a payout attached.
- **The doctrine as a player verb** — `lay-low` makes the quiet the engine already rewards into something you choose, and refuses when nobody is looking, because a verb that always works teaches nothing.
- **Content authored backwards from the spawn rules** — Clerk Hesper is allied-and-greedy because that is the only NPC shape the engine's `contract` rule will offer work from. The Rookery is authored poor and uncontrolled because that is what the district rules read.
- **A pack-local module** — `pursuit-core` lives inside the starter rather than in `@ai-rpg-engine/modules`, because it has exactly one consumer. Promote at the second.

## Unique Mechanics

| Verb | What it does |
|------|--------------|
| `collar` | Takes a mark **alive** under warrant. Requires legal cover and a mark already worn down; refuses otherwise, with the reason. Produces a record, not a payment. |
| `impeach` | Testifies against a mark you hold. Converts the taking into a conviction: warrant up, infamy down. The office trusts a thief-taker who follows through. |
| `informant` | Buys a mark's whereabouts. Price is a printed function of your own standing with the street — strangers pay double — and asking is itself a signal, so infamy rises. |
| `post-bounty` | Puts your own price on a name, spending the office's credit to do it. Your grudge becomes other people's work. |
| `fence` | Moves recovered goods through the crooked market. Needs a **person**, not a menu. Pays badly on purpose: you are not here for the coin. |
| `lay-low` | Spends a day out of sight and lets the cry die down. Refused when nobody is looking. |

**The pursuit state** is `COLD` / `SEARCHED` / `HUNTED`, and every state carries the number that caused it. A faction at alert 60 or above hunts you through a quiet week, because alert is memory and heat is attention — which is the doctrine, stated in the pack's own vocabulary.

## Content

- **7 zones** across 3 districts: the Ward (office and sessions), the Shambles (market and the dead wall), and the Rookery — poor, uncontrolled, and measurably harder to get a straight answer in
- **4 NPCs** — Clerk Hesper, Mother Slack, Sergeant Pike (recruitable), the Scrivener
- **3 hostiles + 1 boss** — Jonathan Quill does not get stronger as he loses. He gets more candid.
- **3 quests** — The First Ticket, Blood Money, The Thief-Taker General
- **6 items**, including the Tyburn Ticket: a real, transferable certificate that was historically worth more than the reward it was given for

## Stats & Resources

| Stat | Role |
|------|------|
| `grip` | What you can do to a man who does not want to be taken |
| `nose` | Reading a room, a ledger, a lie — the thief-taker's real trade |
| `authority` | Whether the room believes you have the right to be doing this |

| Resource | Behaviour |
|----------|-----------|
| `hp` | 32 max — you take people for a living |
| `stamina` | What a pursuit costs. Fighting spends it; `lay-low` restores it |
| `coin` | What informants want |
| `warrant` | Legal cover. Spent by `collar` and `post-bounty`, restored by `impeach` |
| `infamy` | The other half of the city's read of you. **Not** a ruin meter |

Combat maps `attack → grip`, `precision → nose`, `resolve → authority`. Violence is not forbidden here — it is **loud**, and it spends the stamina you need for the next collar.

## What to Borrow

The pursuit-state derivation, if your game has a chase: three words, deterministic, every transition naming its trigger, and no state the engine does not already own. The two-sided reputation, if your game has factions that want incompatible things from the same person. And `anti-inert.test.ts` — every pack-native verb gets a row proving it changes something *and* a row proving its refusal is a structured rejection rather than silence.

## License

MIT
