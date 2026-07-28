// `use` on an item nobody taught the verb about.
//
// The old behaviour was success-shaped destruction: the effect was looked up,
// found missing, and the item was spliced out of the inventory anyway with
// `item.used { consumed: true }`. Measured across the real catalog before
// changing anything (RFC 9413 Thomson & Schinazi 2023 — retire leniency by
// MEASUREMENT, not assumption): 89 of the 90 authored items across all eleven
// shipped packs took that path, and they are cutlasses, armour, deeds and
// signet rings. Not one was a legitimate reliance on silent consumption.
//
// The tell that it was untested: flipping the behaviour broke NOTHING in a
// 6,118-test suite. So these are the tests that should have existed.

import { describe, it, expect } from 'vitest';
import { Engine, type ActionIntent, type ResolvedEvent, type RulesetDefinition } from '@ai-rpg-engine/core';
import { createInventoryCore } from './inventory-core.js';
import { makeEvent } from './make-event.js';

const RULESET: RulesetDefinition = {
  id: 'use-honesty',
  name: 'use honesty',
  stats: [],
  resources: [{ id: 'hp', name: 'HP', min: 0, max: 20, default: 10 }],
  verbs: [{ id: 'use', name: 'Use' }],
} as unknown as RulesetDefinition;

const REAL_EFFECT = {
  itemId: 'healing-draught',
  use: (action: ActionIntent): ResolvedEvent[] => [
    makeEvent(action, 'item.effect.healed', { amount: 5 }),
  ],
};

/**
 * The FLAVOR-CONSUMABLE escape hatch, as a pack would author it: an explicit
 * one-line effect whose whole job is to say "this is meant to be drunk". The
 * NetHack pattern — even a zero-effect quaff prints a message, and the message
 * is itself information. Intent lives in the content, where a reader can see
 * it, instead of falling out of an absent map entry.
 */
const FLAVOR_EFFECT = {
  itemId: 'cheap-rum',
  use: (action: ActionIntent): ResolvedEvent[] => [
    makeEvent(action, 'item.consumed.flavor', {
      itemId: 'cheap-rum',
      narratorHint: 'It burns going down, and changes nothing.',
    }),
  ],
};

function makeWorld(effects: Array<typeof REAL_EFFECT>, inventory: string[]): Engine {
  const engine = new Engine({
    manifest: {
      id: 'use-honesty', title: 'Use Honesty', version: '1.0.0', engineVersion: '0.1.0',
      ruleset: 'use-honesty', modules: [], contentPacks: [],
    },
    seed: 71,
    ruleset: RULESET,
    modules: [createInventoryCore(effects)],
  });
  engine.store.addEntity({
    id: 'hero', blueprintId: 'hero', type: 'player', name: 'Hero',
    tags: [], stats: {}, resources: { hp: 10 }, statuses: [], inventory: [...inventory],
  });
  engine.store.state.playerId = 'hero';
  return engine;
}

function inventoryOf(engine: Engine): string[] {
  return engine.world.entities['hero'].inventory ?? [];
}

describe('`use` on an item with no registered effect', () => {
  it('REJECTS with a structured reason and a hint — and the item SURVIVES', () => {
    const engine = makeWorld([REAL_EFFECT], ['deed-of-title']);

    const events = engine.submitAction('use', { toolId: 'deed-of-title' });

    const rejection = events.find((e) => e.type === 'action.rejected');
    expect(rejection, `use was not rejected — events: ${events.map((e) => e.type).join(', ')}`).toBeDefined();
    expect(String(rejection!.payload?.reason)).toContain('deed-of-title');
    expect(String(rejection!.payload?.hint).length).toBeGreaterThan(0);
    expect(rejection!.payload?.itemId).toBe('deed-of-title');

    // The whole point. Before this, the deed was gone.
    expect(inventoryOf(engine), 'the item was consumed by a REJECTED action').toEqual(['deed-of-title']);
    expect(events.some((e) => e.type === 'item.used')).toBe(false);
  });

  it('MUTATION CONTROL: registering an effect for that exact item makes it usable again', () => {
    // Proves the guard is reading the effect map and nothing else — the same
    // world, the same item, one line of content different.
    const engine = makeWorld(
      [REAL_EFFECT, { itemId: 'deed-of-title', use: FLAVOR_EFFECT.use }],
      ['deed-of-title'],
    );

    const events = engine.submitAction('use', { toolId: 'deed-of-title' });

    expect(events.some((e) => e.type === 'action.rejected')).toBe(false);
    expect(events.some((e) => e.type === 'item.used')).toBe(true);
    expect(inventoryOf(engine)).toEqual([]);
  });
});

describe('`use` on an item that HAS an effect is unchanged', () => {
  it('runs the effect, consumes the item, and reports it consumed', () => {
    const engine = makeWorld([REAL_EFFECT], ['healing-draught', 'deed-of-title']);

    const events = engine.submitAction('use', { toolId: 'healing-draught' });

    expect(events.some((e) => e.type === 'action.rejected')).toBe(false);
    const used = events.find((e) => e.type === 'item.used');
    expect(used?.payload?.consumed).toBe(true);
    expect(events.some((e) => e.type === 'item.effect.healed')).toBe(true);
    expect(inventoryOf(engine)).toEqual(['deed-of-title']);
  });
});

describe('the flavor-consumable pattern (authored, never accidental)', () => {
  it('a pack that WANTS an item drunk registers one line, and it is consumed with a message', () => {
    const engine = makeWorld([FLAVOR_EFFECT], ['cheap-rum']);

    const events = engine.submitAction('use', { toolId: 'cheap-rum' });

    expect(events.some((e) => e.type === 'action.rejected')).toBe(false);
    const flavor = events.find((e) => e.type === 'item.consumed.flavor');
    expect(
      flavor,
      'the escape hatch does not work — a pack cannot express "this is meant to be drunk"',
    ).toBeDefined();
    expect(String(flavor!.payload?.narratorHint).length).toBeGreaterThan(0);
    expect(inventoryOf(engine)).toEqual([]);
  });

  it('and the difference from the rejected case is ONE registered effect, nothing else', () => {
    // The two worlds differ by exactly one entry in the effect map. Same item
    // id, same inventory, same seed — so the outcome difference is
    // attributable to the authoring decision and to nothing about the item.
    const authored = makeWorld([FLAVOR_EFFECT], ['cheap-rum']);
    const unauthored = makeWorld([], ['cheap-rum']);

    expect(authored.submitAction('use', { toolId: 'cheap-rum' }).some((e) => e.type === 'item.used')).toBe(true);
    expect(unauthored.submitAction('use', { toolId: 'cheap-rum' }).some((e) => e.type === 'action.rejected')).toBe(true);
    expect(inventoryOf(unauthored)).toEqual(['cheap-rum']);
  });
});
