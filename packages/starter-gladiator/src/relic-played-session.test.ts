// THE RELIC-GROWTH PLAYED-SESSION PROOF — the anti-inert gate.
//
// chronicle-core.test.ts proves the producer against hand-built engines and
// synthetic payloads. That is necessary and not sufficient: a mechanism can be
// unit-green and still never fire on shipped content, which is exactly the trap
// the v3.0 Phase-9 audit caught twice (a headline wired, tested, and inert in
// the packs that ship). This file closes that gap for relic growth — a REAL
// `createGame()` run on the shipped iron-colosseum pack, driven only through
// `submitAction` with the verbs a player has, ending with the retiarius trident
// carrying a name it did not start with.
//
// Two defects were found BY writing this proof, both invisible to the unit
// suite because its fixtures were authored to match the code rather than to
// match the packs:
//
//   1. `boss-kill` was unreachable. Every shipped pack tags its boss
//      `role:boss`; the producer checked `tags.includes('boss')`, which is
//      exact membership and matches none of them.
//   2. `recognized` was unreachable, and with it `recognition-count`, and with
//      THAT all armor growth (DEFAULT_ARMOR_MILESTONES is only age +
//      recognition-count). The producer skipped onlookers with no `faction`,
//      and no entity in any of the ten shipped packs sets `EntityState.faction`.
//
// Both are fixed in chronicle-core.ts and pinned below against the real pack,
// so neither can regress back into a green-but-inert state.

import { describe, it, expect } from 'vitest';
import type { Engine } from '@ai-rpg-engine/core';
import {
  getItemChronicle,
  getRelicSummary,
  getEntityLoadout,
  ITEM_CHRONICLE_STATE_KEY,
} from '@ai-rpg-engine/equipment';
import { createGame } from './setup.js';

/** The retiarius' authored starting weapon (content.ts: `inventory: ['trident-and-net']`). */
const TRIDENT = 'trident-and-net';
const TRIDENT_NAME = 'Trident & Net';

/** The three combatants the shipped pack places on `arena-floor`. */
const WAR_BEAST = 'war-beast';
const CHAMPION = 'arena-champion';
const OVERLORD = 'arena-overlord'; // tags: ['enemy','gladiator','role:boss']

/**
 * Swing until the target drops. Stamina is topped up as scaffolding so the
 * attrition loop never gates on the resource economy — the same device
 * quests.test.ts uses, and for the same reason. The kill itself is a real
 * `combat.entity.defeated` off the dispatcher; nothing here writes chronicle
 * or combat state directly.
 */
function killByAttrition(engine: Engine, targetId: string, maxSwings = 400): void {
  for (let i = 0; i < maxSwings; i++) {
    if ((engine.world.entities[targetId]?.resources.hp ?? 0) <= 0) return;
    engine.submitAction('attack', { targetIds: [targetId] });
    const hero = engine.world.entities[engine.world.playerId];
    if (hero) hero.resources.stamina = 20;
  }
  throw new Error(`${targetId} still standing after ${maxSwings} swings`);
}

/**
 * One full scripted session: ready the trident, walk to the sand, and take all
 * three opponents. Only player verbs — `equip`, `move`, `attack`.
 */
function playArenaRun(seed: number): Engine {
  const engine = createGame(seed);

  engine.submitAction('equip'); // sole carried equippable -> auto-resolves
  engine.submitAction('move', { targetIds: ['armory'] });
  engine.submitAction('move', { targetIds: ['patron-gallery'] });
  engine.submitAction('move', { targetIds: ['arena-floor'] });

  killByAttrition(engine, WAR_BEAST);
  killByAttrition(engine, CHAMPION);
  killByAttrition(engine, OVERLORD);

  return engine;
}

const killEntries = (engine: Engine, itemId: string) =>
  (getItemChronicle(engine.world)[itemId] ?? []).filter((e) => e.event === 'used-in-kill');

describe('relic growth — played session on the shipped iron-colosseum pack', () => {
  it('the trident earns a name over three real arena kills', () => {
    const engine = playArenaRun(11);

    // The weapon is genuinely in the slot the kill is attributed through.
    expect(getEntityLoadout(engine.world, engine.world.playerId)?.equipped.weapon).toBe(TRIDENT);

    // Three real defeats, each credited to the trident.
    const kills = killEntries(engine, TRIDENT);
    expect(kills.length).toBe(3);

    // The engine-computed summary reflects growth.
    const summary = getRelicSummary(engine.world, TRIDENT);
    expect(summary).toBeDefined();
    expect(summary!.milestoneCount).toBeGreaterThanOrEqual(1);
    expect(summary!.tier).toBeGreaterThanOrEqual(1);

    // The kill-count milestone at 3 is the one this run is built to cross.
    expect(summary!.displayName).toContain('Bloodied');

    // And it is NOT the name it started with — the player-visible payoff.
    expect(summary!.displayName).not.toBe(TRIDENT_NAME);
  });

  it('the boss kill is recorded as a boss — the role:boss convention shipped content uses', () => {
    const engine = playArenaRun(11);

    const bossKills = killEntries(engine, TRIDENT).filter((e) =>
      e.detail.toLowerCase().includes('boss'),
    );

    // Exactly one of the three is the Overlord. This is the assertion that
    // would have failed before `isBoss` learned the `role:` prefix, and it is
    // what makes relic-growth's `boss-kill` trigger reachable on real content
    // (it counts entries whose detail contains "boss").
    expect(bossKills).toHaveLength(1);
    expect(bossKills[0].detail).toContain('The Overlord');
  });

  it('recognition fires on shipped content, where no entity has a faction', () => {
    // Every entity in every shipped pack leaves `EntityState.faction` unset, so
    // this asserts the producer does NOT require one. The gladiator's holding
    // cell is shared with Nerva, and the catalog carries flag-bearing
    // provenance (`iron-manacles` is flags:['trophy'], `patron-token` is
    // factionId:'patron-circle' + heirloom) — the flag and notoriety paths of
    // evaluateItemRecognition need no faction match at all.
    const engine = createGame(11);
    const player = engine.world.entities[engine.world.playerId];

    // Nobody in this world has a faction — the precondition under test.
    expect(Object.values(engine.world.entities).every((e) => !e.faction)).toBe(true);

    // Give the gladiator a flag-bearing accessory and wear it in company.
    player.inventory = [...(player.inventory ?? []), 'iron-manacles'];
    engine.submitAction('equip', { targetIds: ['iron-manacles'] });

    const recognized = (getItemChronicle(engine.world)['iron-manacles'] ?? []).filter(
      (e) => e.event === 'recognized',
    );
    expect(recognized.length).toBeGreaterThanOrEqual(1);
  });

  it('same-seed runs stay byte-identical with the chronicle live', () => {
    // The pack now opts in, so its serialization differs from the pre-chronicle
    // engine by design (a director-approved shift). What must NOT drift is
    // determinism: the same seed and the same script still produce the same
    // world, byte for byte — including the chronicle namespace, whose summaries
    // are rebuilt on every write and emitted in sorted key order precisely so
    // this holds.
    const a = playArenaRun(11);
    const b = playArenaRun(11);

    expect(a.serialize()).toBe(b.serialize());
  });

  it('a pack that does not wire the producer never materializes the namespace', () => {
    // The opt-in gate, proven from the consumer side: iron-colosseum opts in,
    // so it HAS the namespace after play. The counterfactual — a world where
    // the module was never registered — is covered in chronicle-core.test.ts;
    // here we only pin that opting in is what creates it, so the namespace is
    // never an unconditional scaffold.
    const played = playArenaRun(11);
    expect(played.world.modules[ITEM_CHRONICLE_STATE_KEY]).toBeDefined();

    // A fresh, unplayed world has nothing chronicled yet — no equip, no kill,
    // so no namespace, even though the module IS registered.
    const untouched = createGame(11);
    expect(untouched.world.modules[ITEM_CHRONICLE_STATE_KEY]).toBeUndefined();
  });
});
