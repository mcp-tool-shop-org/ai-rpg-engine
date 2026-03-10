// status-resistance tests — resistance-aware apply-status effect handler
// Proves: immune blocks, resistant halves duration, vulnerable doubles, normal passes through

import { describe, it, expect, beforeEach } from 'vitest';
import type { AbilityDefinition, StatusDefinition } from '@ai-rpg-engine/content-schema';
import type { EntityState, ActionIntent, WorldState } from '@ai-rpg-engine/core';
import { resolveEffects } from './ability-effects.js';
import {
  registerStatusDefinitions,
  clearStatusRegistry,
} from './status-semantics.js';

// --- Fixtures ---

const mesmerizedDef: StatusDefinition = {
  id: 'mesmerized',
  name: 'Mesmerized',
  tags: ['control', 'supernatural', 'debuff'],
  stacking: 'replace',
  duration: { type: 'ticks', value: 3 },
};

const terrifiedDef: StatusDefinition = {
  id: 'terrified',
  name: 'Terrified',
  tags: ['fear', 'supernatural', 'debuff'],
  stacking: 'replace',
  duration: { type: 'ticks', value: 2 },
};

const mesmerizeAbility: AbilityDefinition = {
  id: 'mesmerize',
  name: 'Mesmerize',
  verb: 'use-ability',
  tags: ['supernatural', 'debuff'],
  costs: [{ resourceId: 'stamina', amount: 3 }],
  target: { type: 'single' },
  checks: [],
  effects: [
    { type: 'apply-status', target: 'target', params: { statusId: 'mesmerized', duration: 3, stacking: 'replace' } },
  ],
  cooldown: 4,
};

const terrorAbility: AbilityDefinition = {
  id: 'terror',
  name: 'Terror',
  verb: 'use-ability',
  tags: ['supernatural', 'debuff'],
  costs: [{ resourceId: 'stamina', amount: 2 }],
  target: { type: 'single' },
  checks: [],
  effects: [
    { type: 'apply-status', target: 'target', params: { statusId: 'terrified', duration: 4, stacking: 'replace' } },
  ],
  cooldown: 3,
};

function makeEntity(overrides?: Partial<EntityState>): EntityState {
  return {
    id: 'actor',
    blueprintId: 'actor',
    type: 'enemy',
    name: 'Actor',
    tags: ['enemy'],
    stats: { presence: 5, vitality: 5, cunning: 5 },
    resources: { hp: 20, stamina: 10 },
    statuses: [],
    ...overrides,
  };
}

function makeAction(actorId: string): ActionIntent {
  return {
    id: 'action-1',
    actorId,
    verb: 'use-ability',
    targetIds: ['target'],
    source: 'ai',
    issuedAtTick: 1,
  };
}

function makeWorld(entities: EntityState[]): WorldState {
  const map: Record<string, EntityState> = {};
  for (const e of entities) map[e.id] = e;
  return {
    meta: { worldId: 'w', gameId: 'g', saveVersion: '1', tick: 1, seed: 42, activeRuleset: 'test', activeModules: [] },
    playerId: 'player',
    locationId: 'zone-1',
    entities: map,
    zones: {},
    quests: {},
    factions: {},
    globals: {},
    modules: {},
    eventLog: [],
    pending: [],
  };
}

// --- Tests ---

beforeEach(() => {
  clearStatusRegistry();
  registerStatusDefinitions([mesmerizedDef, terrifiedDef]);
});

describe('resistance-aware apply-status', () => {
  it('applies status normally when target has no resistances', () => {
    const actor = makeEntity({ id: 'actor' });
    const target = makeEntity({ id: 'target', name: 'Target' });
    const world = makeWorld([actor, target]);
    const action = makeAction('actor');

    const events = resolveEffects(mesmerizeAbility, actor, [target], world, 1, action, true);

    // Status should be applied
    expect(target.statuses.some(s => s.statusId === 'mesmerized')).toBe(true);
    const applied = target.statuses.find(s => s.statusId === 'mesmerized')!;
    expect(applied.expiresAtTick).toBe(4); // tick 1 + duration 3

    // No resistance events
    const immuneEvents = events.filter(e => e.type === 'ability.status.immune');
    const resistedEvents = events.filter(e => e.type === 'ability.status.resisted');
    expect(immuneEvents).toHaveLength(0);
    expect(resistedEvents).toHaveLength(0);
  });

  it('blocks status when target is immune', () => {
    const actor = makeEntity({ id: 'actor' });
    const target = makeEntity({
      id: 'target',
      name: 'Target',
      resistances: { control: 'immune' },
    });
    const world = makeWorld([actor, target]);
    const action = makeAction('actor');

    const events = resolveEffects(mesmerizeAbility, actor, [target], world, 1, action, true);

    // Status should NOT be applied
    expect(target.statuses.some(s => s.statusId === 'mesmerized')).toBe(false);

    // Should have immune event
    const immuneEvents = events.filter(e => e.type === 'ability.status.immune');
    expect(immuneEvents).toHaveLength(1);
    expect(immuneEvents[0].payload.statusId).toBe('mesmerized');
    expect(immuneEvents[0].payload.resistance).toBe('immune');

    // Should NOT have applied event
    const appliedEvents = events.filter(e => e.type === 'ability.status.applied');
    expect(appliedEvents).toHaveLength(0);
  });

  it('halves duration when target is resistant', () => {
    const actor = makeEntity({ id: 'actor' });
    const target = makeEntity({
      id: 'target',
      name: 'Target',
      resistances: { supernatural: 'resistant' },
    });
    const world = makeWorld([actor, target]);
    const action = makeAction('actor');

    const events = resolveEffects(mesmerizeAbility, actor, [target], world, 1, action, true);

    // Status should be applied with halved duration
    expect(target.statuses.some(s => s.statusId === 'mesmerized')).toBe(true);
    const applied = target.statuses.find(s => s.statusId === 'mesmerized')!;
    // Original duration 3, halved = floor(3/2) = 1, tick 1 + 1 = 2
    expect(applied.expiresAtTick).toBe(2);

    // Should have resisted event
    const resistedEvents = events.filter(e => e.type === 'ability.status.resisted');
    expect(resistedEvents).toHaveLength(1);
    expect(resistedEvents[0].payload.baseDuration).toBe(3);
    expect(resistedEvents[0].payload.adjustedDuration).toBe(1);
  });

  it('doubles duration when target is vulnerable', () => {
    const actor = makeEntity({ id: 'actor' });
    const target = makeEntity({
      id: 'target',
      name: 'Target',
      resistances: { fear: 'vulnerable' },
    });
    const world = makeWorld([actor, target]);
    const action = makeAction('actor');

    const events = resolveEffects(terrorAbility, actor, [target], world, 1, action, true);

    // Status should be applied with doubled duration
    expect(target.statuses.some(s => s.statusId === 'terrified')).toBe(true);
    const applied = target.statuses.find(s => s.statusId === 'terrified')!;
    // Original duration 4, doubled = 8, tick 1 + 8 = 9
    expect(applied.expiresAtTick).toBe(9);

    // Should have vulnerable event
    const vulnerableEvents = events.filter(e => e.type === 'ability.status.vulnerable');
    expect(vulnerableEvents).toHaveLength(1);
    expect(vulnerableEvents[0].payload.baseDuration).toBe(4);
    expect(vulnerableEvents[0].payload.adjustedDuration).toBe(8);
  });

  it('immune tag on any status tag blocks entirely', () => {
    const actor = makeEntity({ id: 'actor' });
    // mesmerized has tags: control, supernatural, debuff
    // immune to debuff should block even though not immune to control/supernatural
    const target = makeEntity({
      id: 'target',
      name: 'Target',
      resistances: { debuff: 'immune' },
    });
    const world = makeWorld([actor, target]);
    const action = makeAction('actor');

    const events = resolveEffects(mesmerizeAbility, actor, [target], world, 1, action, true);

    expect(target.statuses.some(s => s.statusId === 'mesmerized')).toBe(false);
    const immuneEvents = events.filter(e => e.type === 'ability.status.immune');
    expect(immuneEvents).toHaveLength(1);
  });

  it('preserves stacking mode through resistance check', () => {
    const stackAbility: AbilityDefinition = {
      ...mesmerizeAbility,
      id: 'stack-test',
      effects: [
        { type: 'apply-status', target: 'target', params: { statusId: 'mesmerized', duration: 4, stacking: 'stack', maxStacks: 3 } },
      ],
    };

    const actor = makeEntity({ id: 'actor' });
    const target = makeEntity({
      id: 'target',
      name: 'Target',
      resistances: { supernatural: 'resistant' },
    });
    const world = makeWorld([actor, target]);
    const action = makeAction('actor');

    // Apply once
    resolveEffects(stackAbility, actor, [target], world, 1, action, true);
    expect(target.statuses.some(s => s.statusId === 'mesmerized')).toBe(true);

    // Apply again — should stack
    const events2 = resolveEffects(stackAbility, actor, [target], world, 2, action, true);
    const stackEvents = events2.filter(e => e.type === 'status.stacked');
    expect(stackEvents).toHaveLength(1);
  });

  it('works with unregistered status (no resistance check, normal apply)', () => {
    const unknownAbility: AbilityDefinition = {
      ...mesmerizeAbility,
      id: 'unknown-status',
      effects: [
        { type: 'apply-status', target: 'target', params: { statusId: 'unknown-xyz', duration: 3, stacking: 'replace' } },
      ],
    };

    const actor = makeEntity({ id: 'actor' });
    const target = makeEntity({
      id: 'target',
      name: 'Target',
      resistances: { control: 'immune' }, // Won't matter — unknown status has no tags
    });
    const world = makeWorld([actor, target]);
    const action = makeAction('actor');

    resolveEffects(unknownAbility, actor, [target], world, 1, action, true);

    // Status should still be applied (no tags to resist against)
    expect(target.statuses.some(s => s.statusId === 'unknown-xyz')).toBe(true);
  });

  it('emits ability.status.applied with resistance info', () => {
    const actor = makeEntity({ id: 'actor' });
    const target = makeEntity({
      id: 'target',
      name: 'Target',
      resistances: { supernatural: 'resistant' },
    });
    const world = makeWorld([actor, target]);
    const action = makeAction('actor');

    const events = resolveEffects(mesmerizeAbility, actor, [target], world, 1, action, true);

    const appliedEvents = events.filter(e => e.type === 'ability.status.applied');
    expect(appliedEvents).toHaveLength(1);
    expect(appliedEvents[0].payload.resistance).toBe('resistant');
    expect(appliedEvents[0].payload.baseDuration).toBe(3);
    expect(appliedEvents[0].payload.duration).toBe(1); // halved
  });
});

// --- Cleanse / remove-status-by-tag tests ---

describe('remove-status-by-tag (cleanse)', () => {
  const cleanseAbility: AbilityDefinition = {
    id: 'purify',
    name: 'Purify',
    verb: 'use-ability',
    tags: ['support', 'cleanse'],
    costs: [{ resourceId: 'stamina', amount: 2 }],
    target: { type: 'self' },
    checks: [],
    effects: [
      { type: 'remove-status-by-tag', target: 'actor', params: { tags: 'control,fear' } },
    ],
    cooldown: 3,
  };

  const singleTagCleanse: AbilityDefinition = {
    ...cleanseAbility,
    id: 'anti-fear',
    effects: [
      { type: 'remove-status-by-tag', target: 'actor', params: { tag: 'fear' } },
    ],
  };

  it('removes statuses matching specified tags', () => {
    const actor = makeEntity({
      id: 'actor',
      statuses: [
        { id: 's1', statusId: 'mesmerized', stacks: 1, appliedAtTick: 0, expiresAtTick: 5 },
        { id: 's2', statusId: 'terrified', stacks: 1, appliedAtTick: 0, expiresAtTick: 5 },
      ],
    });
    const world = makeWorld([actor]);
    const action = makeAction('actor');

    const events = resolveEffects(cleanseAbility, actor, [actor], world, 1, action, true);

    // Both should be removed (mesmerized=control, terrified=fear)
    expect(actor.statuses).toHaveLength(0);

    const removeEvents = events.filter(e => e.type === 'ability.status.removed');
    expect(removeEvents).toHaveLength(2);
  });

  it('removes statuses matching a single tag param', () => {
    const actor = makeEntity({
      id: 'actor',
      statuses: [
        { id: 's1', statusId: 'mesmerized', stacks: 1, appliedAtTick: 0, expiresAtTick: 5 },
        { id: 's2', statusId: 'terrified', stacks: 1, appliedAtTick: 0, expiresAtTick: 5 },
      ],
    });
    const world = makeWorld([actor]);
    const action = makeAction('actor');

    resolveEffects(singleTagCleanse, actor, [actor], world, 1, action, true);

    // Only terrified removed (fear tag), mesmerized stays (control tag, not cleansed)
    expect(actor.statuses).toHaveLength(1);
    expect(actor.statuses[0].statusId).toBe('mesmerized');
  });

  it('skips statuses that do not match tags', () => {
    const actor = makeEntity({
      id: 'actor',
      statuses: [
        { id: 's1', statusId: 'holy-fire', stacks: 1, appliedAtTick: 0, expiresAtTick: 5 },
      ],
    });
    const world = makeWorld([actor]);
    const action = makeAction('actor');

    resolveEffects(cleanseAbility, actor, [actor], world, 1, action, true);

    // holy-fire has tags [holy, debuff] — not in cleanse tags [control, fear]
    expect(actor.statuses).toHaveLength(1);
    expect(actor.statuses[0].statusId).toBe('holy-fire');
  });

  it('is a no-op when no statuses match (no error)', () => {
    const actor = makeEntity({ id: 'actor', statuses: [] });
    const world = makeWorld([actor]);
    const action = makeAction('actor');

    const events = resolveEffects(cleanseAbility, actor, [actor], world, 1, action, true);

    const removeEvents = events.filter(e => e.type === 'ability.status.removed');
    expect(removeEvents).toHaveLength(0);
  });

  it('emits matched tags in removal event', () => {
    const actor = makeEntity({
      id: 'actor',
      statuses: [
        { id: 's1', statusId: 'mesmerized', stacks: 1, appliedAtTick: 0, expiresAtTick: 5 },
      ],
    });
    const world = makeWorld([actor]);
    const action = makeAction('actor');

    const events = resolveEffects(cleanseAbility, actor, [actor], world, 1, action, true);

    const removeEvents = events.filter(e => e.type === 'ability.status.removed');
    expect(removeEvents).toHaveLength(1);
    expect(removeEvents[0].payload.removedByTag).toBe(true);
    expect(removeEvents[0].payload.matchedTags).toEqual(['control']);
    expect(removeEvents[0].tags).toContain('cleanse');
  });

  it('emits status.removed core event for each removal', () => {
    const actor = makeEntity({
      id: 'actor',
      statuses: [
        { id: 's1', statusId: 'mesmerized', stacks: 1, appliedAtTick: 0, expiresAtTick: 5 },
        { id: 's2', statusId: 'terrified', stacks: 1, appliedAtTick: 0, expiresAtTick: 5 },
      ],
    });
    const world = makeWorld([actor]);
    const action = makeAction('actor');

    const events = resolveEffects(cleanseAbility, actor, [actor], world, 1, action, true);

    const coreRemoveEvents = events.filter(e => e.type === 'status.removed');
    expect(coreRemoveEvents).toHaveLength(2);
  });
});
