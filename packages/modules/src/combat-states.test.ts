import { describe, it, expect } from 'vitest';
import { createTestEngine, nextId } from '@ai-rpg-engine/core';
import type { EntityState, ActionIntent } from '@ai-rpg-engine/core';
import { createCombatCore, COMBAT_STATES } from './combat-core.js';
import { statusCore, hasStatus, applyStatus } from './status-core.js';
import {
  createCognitionCore,
  getCognition,
  setBelief,
  selectIntent,
  aggressiveProfile,
  cautiousProfile,
} from './cognition-core.js';

const makeEntity = (id: string, name: string, zoneId: string, overrides?: Partial<EntityState>): EntityState => ({
  id,
  blueprintId: id,
  type: 'enemy',
  name,
  tags: ['enemy'],
  stats: { vigor: 5, instinct: 5, will: 3 },
  resources: { hp: 20, stamina: 5 },
  statuses: [],
  zoneId,
  ...overrides,
});

const makePlayer = (zoneId: string, overrides?: Partial<EntityState>): EntityState => ({
  id: 'player',
  blueprintId: 'player',
  type: 'player',
  name: 'Hero',
  tags: ['player'],
  stats: { vigor: 5, instinct: 5, will: 3 },
  resources: { hp: 20, stamina: 5 },
  statuses: [],
  zoneId,
  ...overrides,
});

/** Build a full ActionIntent for NPC actions */
function npcAction(verb: string, actorId: string, tick: number, opts?: { targetIds?: string[] }): ActionIntent {
  return {
    id: nextId('action'),
    actorId,
    verb,
    targetIds: opts?.targetIds,
    source: 'ai',
    issuedAtTick: tick,
  };
}

describe('attack/guard/disengage validation', () => {
  it('guard rejects when actor has no stamina', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore()],
      entities: [makePlayer('a', { resources: { hp: 20, stamina: 0 } })],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    const events = engine.submitAction('guard');
    expect(events.some(e => e.type === 'action.rejected' && e.payload.reason === 'not enough stamina')).toBe(true);
  });

  it('guard rejects when actor is defeated', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore()],
      entities: [makePlayer('a', { resources: { hp: 0, stamina: 5 } })],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    const events = engine.submitAction('guard');
    expect(events.some(e => e.type === 'action.rejected' && e.payload.reason === 'actor is defeated')).toBe(true);
  });

  it('guard applies guarded status and costs stamina', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore()],
      entities: [makePlayer('a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    const events = engine.submitAction('guard');
    expect(events.some(e => e.type === 'combat.guard.start')).toBe(true);
    expect(events.some(e => e.type === 'resource.changed' && e.payload.resource === 'stamina')).toBe(true);
    expect(hasStatus(engine.world.entities.player, COMBAT_STATES.GUARDED)).toBe(true);
    expect(engine.world.entities.player.resources.stamina).toBe(4);
  });

  it('disengage rejects when no exit exists', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore()],
      entities: [makePlayer('a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    const events = engine.submitAction('disengage');
    expect(events.some(e => e.type === 'action.rejected' && e.payload.reason === 'no exit from current zone')).toBe(true);
  });

  it('disengage rejects when actor has no stamina', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore()],
      entities: [makePlayer('a', { resources: { hp: 20, stamina: 0 } })],
      zones: [
        { id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: ['b'] },
        { id: 'b', roomId: 'test', name: 'B', tags: [], neighbors: ['a'] },
      ],
    });

    const events = engine.submitAction('disengage');
    expect(events.some(e => e.type === 'action.rejected' && e.payload.reason === 'not enough stamina')).toBe(true);
  });
});

describe('guarded reduces incoming damage', () => {
  it('guarded target takes reduced damage and clears guard', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore()],
      entities: [
        makePlayer('a'),
        makeEntity('enemy1', 'Thug', 'a'),
      ],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    // Guard the player
    engine.submitAction('guard');
    expect(hasStatus(engine.world.entities.player, COMBAT_STATES.GUARDED)).toBe(true);

    // Enemy attacks guarded player — try multiple ticks to find a hit
    let absorbed = false;
    for (let tick = 2; tick <= 30; tick++) {
      if (!hasStatus(engine.world.entities.player, COMBAT_STATES.GUARDED)) {
        engine.submitAction('guard');
        tick++;
      }
      const events = engine.processAction(npcAction('attack', 'enemy1', tick, { targetIds: ['player'] }));
      if (events.some(e => e.type === 'combat.guard.absorbed')) {
        absorbed = true;
        const absorbEvent = events.find(e => e.type === 'combat.guard.absorbed')!;
        expect(absorbEvent.payload.reducedDamage).toBeLessThan(absorbEvent.payload.originalDamage as number);
        expect(hasStatus(engine.world.entities.player, COMBAT_STATES.GUARDED)).toBe(false);
        break;
      }
    }
    expect(absorbed).toBe(true);
  });

  it('guard.absorbed event includes correct damage values', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore()],
      entities: [
        makePlayer('a'),
        makeEntity('enemy1', 'Thug', 'a', { stats: { vigor: 10, instinct: 10 } }),
      ],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    engine.submitAction('guard');

    for (let tick = 2; tick <= 40; tick++) {
      if (!hasStatus(engine.world.entities.player, COMBAT_STATES.GUARDED)) {
        engine.submitAction('guard');
        tick++;
      }
      const events = engine.processAction(npcAction('attack', 'enemy1', tick, { targetIds: ['player'] }));
      const absorbEvt = events.find(e => e.type === 'combat.guard.absorbed');
      if (absorbEvt) {
        expect(absorbEvt.payload.originalDamage).toBe(10);
        expect(absorbEvt.payload.reducedDamage).toBe(5); // floor(10 * 0.5)
        return;
      }
    }
    expect.unreachable('expected at least one guarded hit');
  });
});

describe('disengage success/failure deterministic', () => {
  it('disengage outcomes are deterministic across replays', () => {
    const makeSetup = () => createTestEngine({
      modules: [statusCore, createCombatCore()],
      entities: [makePlayer('a')],
      zones: [
        { id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: ['b'] },
        { id: 'b', roomId: 'test', name: 'B', tags: [], neighbors: ['a'] },
      ],
    });

    const results1: string[] = [];
    const results2: string[] = [];

    for (const results of [results1, results2]) {
      const engine = makeSetup();
      for (let tick = 1; tick <= 10; tick++) {
        engine.world.entities.player.zoneId = 'a';
        engine.world.entities.player.resources.stamina = 5;
        engine.world.entities.player.statuses = [];
        const events = engine.submitAction('disengage');
        if (events.some(e => e.type === 'combat.disengage.success')) {
          results.push('success');
        } else if (events.some(e => e.type === 'combat.disengage.fail')) {
          results.push('fail');
        }
      }
    }

    expect(results1).toEqual(results2);
    expect(results1.length).toBeGreaterThan(0);
  });

  it('successful disengage moves entity to neighbor zone', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore()],
      entities: [makePlayer('a')],
      zones: [
        { id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: ['b'] },
        { id: 'b', roomId: 'test', name: 'B', tags: [], neighbors: ['a'] },
      ],
    });

    for (let tick = 1; tick <= 30; tick++) {
      engine.world.entities.player.zoneId = 'a';
      engine.world.entities.player.resources.stamina = 5;
      engine.world.entities.player.statuses = [];
      const events = engine.submitAction('disengage');
      if (events.some(e => e.type === 'combat.disengage.success')) {
        expect(engine.world.entities.player.zoneId).toBe('b');
        expect(hasStatus(engine.world.entities.player, COMBAT_STATES.FLEEING)).toBe(true);
        return;
      }
    }
    expect.unreachable('expected at least one successful disengage');
  });

  it('failed disengage applies exposed status', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore()],
      entities: [makePlayer('a')],
      zones: [
        { id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: ['b'] },
        { id: 'b', roomId: 'test', name: 'B', tags: [], neighbors: ['a'] },
      ],
    });

    for (let tick = 1; tick <= 30; tick++) {
      engine.world.entities.player.zoneId = 'a';
      engine.world.entities.player.resources.stamina = 5;
      engine.world.entities.player.statuses = [];
      const events = engine.submitAction('disengage');
      if (events.some(e => e.type === 'combat.disengage.fail')) {
        expect(engine.world.entities.player.zoneId).toBe('a');
        expect(hasStatus(engine.world.entities.player, COMBAT_STATES.EXPOSED)).toBe(true);
        return;
      }
    }
    expect.unreachable('expected at least one failed disengage');
  });
});

describe('exposed modifies attack outcomes', () => {
  it('exposed target receives bonus damage', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore()],
      entities: [
        makePlayer('a'),
        makeEntity('enemy1', 'Thug', 'a'),
      ],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    for (let tick = 1; tick <= 30; tick++) {
      applyStatus(engine.world.entities.player, COMBAT_STATES.EXPOSED, tick, { duration: 5 });
      engine.world.entities.player.resources.hp = 20;
      const events = engine.processAction(npcAction('attack', 'enemy1', tick, { targetIds: ['player'] }));
      const dmgEvt = events.find(e => e.type === 'combat.damage.applied');
      if (dmgEvt) {
        expect(dmgEvt.payload.damage).toBe(7); // 5 base + 2 exposed bonus
        return;
      }
    }
    expect.unreachable('expected at least one hit on exposed target');
  });

  it('attacking clears own guarded status', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore()],
      entities: [
        makePlayer('a'),
        makeEntity('enemy1', 'Thug', 'a'),
      ],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    engine.submitAction('guard');
    expect(hasStatus(engine.world.entities.player, COMBAT_STATES.GUARDED)).toBe(true);

    engine.submitAction('attack', { targetIds: ['enemy1'] });
    expect(hasStatus(engine.world.entities.player, COMBAT_STATES.GUARDED)).toBe(false);
  });

  it('fleeing target has increased hit chance', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore()],
      entities: [
        makePlayer('a'),
        makeEntity('enemy1', 'Thug', 'a'),
      ],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    // Count hits without fleeing
    let hitsNormal = 0;
    for (let tick = 1; tick <= 50; tick++) {
      engine.world.entities.player.resources.hp = 20;
      engine.world.entities.enemy1.resources.stamina = 5;
      const events = engine.processAction(npcAction('attack', 'enemy1', tick, { targetIds: ['player'] }));
      if (events.some(e => e.type === 'combat.contact.hit')) hitsNormal++;
    }

    // Count hits with fleeing
    let hitsFleeing = 0;
    for (let tick = 51; tick <= 100; tick++) {
      engine.world.entities.player.resources.hp = 20;
      engine.world.entities.enemy1.resources.stamina = 5;
      applyStatus(engine.world.entities.player, COMBAT_STATES.FLEEING, tick, { duration: 5 });
      const events = engine.processAction(npcAction('attack', 'enemy1', tick, { targetIds: ['player'] }));
      if (events.some(e => e.type === 'combat.contact.hit')) hitsFleeing++;
    }

    expect(hitsFleeing).toBeGreaterThanOrEqual(hitsNormal);
  });
});

describe('AI prefers appropriate verb by morale bucket', () => {
  it('aggressive NPC with morale > 50 prefers attack', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(), createCognitionCore({ profiles: [aggressiveProfile] })],
      entities: [
        makePlayer('a'),
        makeEntity('guard', 'Guard', 'a', {
          ai: { profileId: 'aggressive', goals: [], fears: [], alertLevel: 0, knowledge: {} },
        }),
      ],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: ['b'] }],
    });

    const cog = getCognition(engine.world, 'guard');
    cog.morale = 70;
    setBelief(cog, 'player', 'hostile', true, 0.9, 'observed', 1);

    const intent = selectIntent(engine.world.entities.guard, cog, engine.world, aggressiveProfile);
    expect(intent?.verb).toBe('attack');
  });

  it('aggressive NPC with morale <= 30 prefers disengage', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(), createCognitionCore({ profiles: [aggressiveProfile] })],
      entities: [
        makePlayer('a'),
        makeEntity('guard', 'Guard', 'a', {
          ai: { profileId: 'aggressive', goals: [], fears: [], alertLevel: 0, knowledge: {} },
        }),
      ],
      zones: [
        { id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: ['b'] },
        { id: 'b', roomId: 'test', name: 'B', tags: [], neighbors: ['a'] },
      ],
    });

    const cog = getCognition(engine.world, 'guard');
    cog.morale = 20;
    setBelief(cog, 'player', 'hostile', true, 0.9, 'observed', 1);

    const intent = selectIntent(engine.world.entities.guard, cog, engine.world, aggressiveProfile);
    expect(intent?.verb).toBe('disengage');
  });

  it('aggressive NPC with moderate morale and low HP prefers guard', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(), createCognitionCore({ profiles: [aggressiveProfile] })],
      entities: [
        makePlayer('a'),
        makeEntity('guard', 'Guard', 'a', {
          resources: { hp: 5, stamina: 5, maxHp: 30 },
          ai: { profileId: 'aggressive', goals: [], fears: [], alertLevel: 0, knowledge: {} },
        }),
      ],
      zones: [
        { id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: ['b'] },
        { id: 'b', roomId: 'test', name: 'B', tags: [], neighbors: ['a'] },
      ],
    });

    const cog = getCognition(engine.world, 'guard');
    cog.morale = 40;
    setBelief(cog, 'player', 'hostile', true, 0.9, 'observed', 1);

    const intent = selectIntent(engine.world.entities.guard, cog, engine.world, aggressiveProfile);
    expect(intent?.verb).toBe('guard');
  });

  it('cautious NPC with morale <= 30 prefers disengage', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(), createCognitionCore({ profiles: [cautiousProfile] })],
      entities: [
        makePlayer('a'),
        makeEntity('scout', 'Scout', 'a', {
          ai: { profileId: 'cautious', goals: [], fears: [], alertLevel: 0, knowledge: {} },
        }),
      ],
      zones: [
        { id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: ['b'] },
        { id: 'b', roomId: 'test', name: 'B', tags: [], neighbors: ['a'] },
      ],
    });

    const cog = getCognition(engine.world, 'scout');
    cog.morale = 25;
    setBelief(cog, 'player', 'hostile', true, 0.9, 'observed', 1);

    const intent = selectIntent(engine.world.entities.scout, cog, engine.world, cautiousProfile);
    expect(intent?.verb).toBe('disengage');
  });

  it('cautious NPC with morale 31-50 prefers guard', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(), createCognitionCore({ profiles: [cautiousProfile] })],
      entities: [
        makePlayer('a'),
        makeEntity('scout', 'Scout', 'a', {
          ai: { profileId: 'cautious', goals: [], fears: [], alertLevel: 0, knowledge: {} },
        }),
      ],
      zones: [
        { id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: ['b'] },
        { id: 'b', roomId: 'test', name: 'B', tags: [], neighbors: ['a'] },
      ],
    });

    const cog = getCognition(engine.world, 'scout');
    cog.morale = 40;
    setBelief(cog, 'player', 'hostile', true, 0.9, 'observed', 1);

    const intent = selectIntent(engine.world.entities.scout, cog, engine.world, cautiousProfile);
    expect(intent?.verb).toBe('guard');
  });

  it('cautious NPC with morale > 50 and confident hostile prefers attack', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(), createCognitionCore({ profiles: [cautiousProfile] })],
      entities: [
        makePlayer('a'),
        makeEntity('scout', 'Scout', 'a', {
          ai: { profileId: 'cautious', goals: [], fears: [], alertLevel: 0, knowledge: {} },
        }),
      ],
      zones: [
        { id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: ['b'] },
        { id: 'b', roomId: 'test', name: 'B', tags: [], neighbors: ['a'] },
      ],
    });

    const cog = getCognition(engine.world, 'scout');
    cog.morale = 70;
    setBelief(cog, 'player', 'hostile', true, 0.9, 'observed', 1);

    const intent = selectIntent(engine.world.entities.scout, cog, engine.world, cautiousProfile);
    expect(intent?.verb).toBe('attack');
  });
});
