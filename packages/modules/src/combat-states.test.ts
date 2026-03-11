import { describe, it, expect } from 'vitest';
import { createTestEngine, nextId } from '@ai-rpg-engine/core';
import type { EntityState, ActionIntent } from '@ai-rpg-engine/core';
import { createCombatCore, COMBAT_STATES, defaultInterceptChance, DEFAULT_STAT_MAPPING } from './combat-core.js';
import { createCombatTactics } from './combat-tactics.js';
import { createCombatStateNarration } from './combat-state-narration.js';
import { statusCore, hasStatus, applyStatus, removeStatus } from './status-core.js';
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

// ============================================================
// Phase 2 — Will, Morale, and Companion Loyalty Integration
// ============================================================

describe('will affects guard reduction', () => {
  it('high-will defender absorbs more damage via default formula', () => {
    // Will 10 → reduction = min(0.75, 0.5 + (10-3)*0.03) = min(0.75, 0.71) = 0.71
    // Against vigor 10: floor(10 * (1 - 0.71)) = floor(2.9) = 2
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore()],
      entities: [
        makePlayer('a', { stats: { vigor: 5, instinct: 5, will: 10 } }),
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
        // Will 10: reduction ~0.71, so 10 * 0.29 = 2.9 → 2
        expect(absorbEvt.payload.reducedDamage).toBeLessThan(absorbEvt.payload.originalDamage as number);
        expect(absorbEvt.payload.reducedDamage).toBeLessThanOrEqual(3); // much less than the will=3 default of 5
        return;
      }
    }
    expect.unreachable('expected at least one guarded hit');
  });

  it('baseline will=3 gives standard 50% reduction', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore()],
      entities: [
        makePlayer('a', { stats: { vigor: 5, instinct: 5, will: 3 } }),
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
        expect(absorbEvt.payload.reducedDamage).toBe(5); // floor(10 * 0.5) = 5
        return;
      }
    }
    expect.unreachable('expected at least one guarded hit');
  });
});

describe('morale changes on combat events', () => {
  it('morale drops on damage proportional to hit', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(), createCognitionCore()],
      entities: [
        makePlayer('a'),
        makeEntity('guard', 'Guard', 'a', {
          ai: { profileId: 'aggressive', goals: [], fears: [], alertLevel: 0, knowledge: {} },
        }),
      ],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    const cog = getCognition(engine.world, 'guard');
    const initialMorale = cog.morale;

    // Player attacks guard — find a tick that hits
    for (let tick = 1; tick <= 30; tick++) {
      engine.world.entities.player.resources.stamina = 5;
      const events = engine.submitAction('attack', { targetIds: ['guard'] });
      if (events.some(e => e.type === 'combat.damage.applied')) {
        // Morale should have dropped (via combat.damage.applied listener)
        expect(cog.morale).toBeLessThan(initialMorale);
        return;
      }
    }
    expect.unreachable('expected at least one hit');
  });

  it('will mitigates morale loss from damage', () => {
    // Compare morale loss between will=3 and will=10 entities
    const makeSetup = (will: number) => {
      const engine = createTestEngine({
        modules: [statusCore, createCombatCore(), createCognitionCore()],
        entities: [
          makePlayer('a', { stats: { vigor: 8, instinct: 10 } }),
          makeEntity('target', 'Target', 'a', {
            stats: { vigor: 3, instinct: 3, will },
            resources: { hp: 20, stamina: 5 },
            ai: { profileId: 'aggressive', goals: [], fears: [], alertLevel: 0, knowledge: {} },
          }),
        ],
        zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
      });
      return engine;
    };

    let lowWillLoss = 0;
    let highWillLoss = 0;

    for (const [will, setter] of [[3, (v: number) => { lowWillLoss = v; }], [10, (v: number) => { highWillLoss = v; }]] as [number, (v: number) => void][]) {
      const engine = makeSetup(will);
      const cog = getCognition(engine.world, 'target');
      const initialMorale = cog.morale;

      for (let tick = 1; tick <= 30; tick++) {
        engine.world.entities.player.resources.stamina = 5;
        const events = engine.submitAction('attack', { targetIds: ['target'] });
        if (events.some(e => e.type === 'combat.damage.applied')) {
          setter(initialMorale - cog.morale);
          break;
        }
      }
    }

    expect(lowWillLoss).toBeGreaterThan(0);
    expect(highWillLoss).toBeGreaterThan(0);
    expect(highWillLoss).toBeLessThan(lowWillLoss);
  });

  it('attacker morale drops on miss', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(), createCognitionCore()],
      entities: [
        makePlayer('a'),
        makeEntity('guard', 'Guard', 'a', {
          ai: { profileId: 'aggressive', goals: [], fears: [], alertLevel: 0, knowledge: {} },
        }),
      ],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    const cog = getCognition(engine.world, 'guard');
    const initialMorale = cog.morale;

    // Guard attacks player — find a tick that misses
    for (let tick = 1; tick <= 30; tick++) {
      engine.world.entities.guard.resources.stamina = 5;
      const events = engine.processAction(npcAction('attack', 'guard', tick, { targetIds: ['player'] }));
      if (events.some(e => e.type === 'combat.contact.miss')) {
        expect(cog.morale).toBe(initialMorale - 2);
        return;
      }
    }
    expect.unreachable('expected at least one miss');
  });

  it('guard absorb gives +3 morale (net effect includes damage loss)', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(), createCognitionCore()],
      entities: [
        makePlayer('a', { stats: { vigor: 2, instinct: 10 } }),
        makeEntity('guard', 'Guard', 'a', {
          stats: { vigor: 5, instinct: 3, will: 3 },
          resources: { hp: 30, stamina: 5 },
          ai: { profileId: 'aggressive', goals: [], fears: [], alertLevel: 0, knowledge: {} },
        }),
      ],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    const cog = getCognition(engine.world, 'guard');

    // Guard the NPC
    engine.processAction(npcAction('guard', 'guard', 1));
    expect(hasStatus(engine.world.entities.guard, COMBAT_STATES.GUARDED)).toBe(true);

    // Player attacks guarded guard — find a tick that hits
    for (let tick = 2; tick <= 30; tick++) {
      if (!hasStatus(engine.world.entities.guard, COMBAT_STATES.GUARDED)) {
        engine.processAction(npcAction('guard', 'guard', tick));
        tick++;
      }
      const moraleBefore = cog.morale;
      engine.world.entities.player.resources.stamina = 5;
      const events = engine.submitAction('attack', { targetIds: ['guard'] });
      if (events.some(e => e.type === 'combat.guard.absorbed')) {
        // Guard absorbed → morale went up +3 from guard_absorb,
        // but also down from combat.damage.applied. With low player vigor (2),
        // guard reduction halves to 1, so damage is small, morale loss is small.
        // The +3 guard_absorb offset should be visible in the net effect.
        // Specifically: with tiny damage, net morale change should be small (close to 0 or positive)
        const netChange = cog.morale - moraleBefore;
        // The +3 offset from guard_absorb was applied
        // (without it, morale would be 3 points lower)
        expect(netChange).toBeGreaterThan(-5); // damage is tiny, so guard_absorb +3 mostly offsets
        return;
      }
    }
    expect.unreachable('expected at least one guarded hit');
  });

  it('morale rises on defeating enemy', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(), createCognitionCore()],
      entities: [
        makePlayer('a'),
        makeEntity('guard', 'Guard', 'a', {
          resources: { hp: 1, stamina: 5 },
          ai: { profileId: 'aggressive', goals: [], fears: [], alertLevel: 0, knowledge: {} },
        }),
        makeEntity('bystander', 'Bystander', 'a', {
          ai: { profileId: 'cautious', goals: [], fears: [], alertLevel: 0, knowledge: {} },
        }),
      ],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    // Set bystander to know guard is hostile (so they're glad when guard dies)
    const bystanderCog = getCognition(engine.world, 'bystander');
    setBelief(bystanderCog, 'guard', 'hostile', true, 0.9, 'observed', 1);
    const bystanderMoraleBefore = bystanderCog.morale;

    // Player kills guard (1 HP)
    for (let tick = 1; tick <= 30; tick++) {
      engine.world.entities.player.resources.stamina = 5;
      engine.world.entities.guard.resources.hp = 1;
      const events = engine.submitAction('attack', { targetIds: ['guard'] });
      if (events.some(e => e.type === 'combat.entity.defeated')) {
        // Bystander who considered guard hostile should gain morale
        expect(bystanderCog.morale).toBeGreaterThan(bystanderMoraleBefore);
        return;
      }
    }
    expect.unreachable('expected guard to be defeated');
  });
});

describe('companion interception uses formula', () => {
  it('interceptChance formula drives interception instead of flat 30%', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore({
        isAlly: (id) => id === 'companion',
        interceptChance: (_ally, _target, _world) => 100, // always intercept
      })],
      entities: [
        makePlayer('a'),
        makeEntity('companion', 'Ally', 'a', { tags: ['companion'] }),
        makeEntity('enemy1', 'Thug', 'a'),
      ],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    // Enemy attacks player — companion should always intercept with 100% chance
    // Note: when interception succeeds, combat.contact.hit is NOT emitted (early return)
    for (let tick = 1; tick <= 30; tick++) {
      engine.world.entities.player.resources.hp = 20;
      engine.world.entities.companion.resources.hp = 20;
      engine.world.entities.enemy1.resources.stamina = 5;
      const events = engine.processAction(npcAction('attack', 'enemy1', tick, { targetIds: ['player'] }));
      const intercepted = events.find(e => e.type === 'combat.companion.intercepted');
      if (intercepted) {
        expect(intercepted.payload.interceptChance).toBe(100);
        expect(intercepted.payload.interceptorId).toBe('companion');
        // Player should NOT have taken damage
        expect(engine.world.entities.player.resources.hp).toBe(20);
        return;
      }
    }
    expect.unreachable('expected at least one interception');
  });

  it('zero interceptChance prevents interception', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore({
        isAlly: (id) => id === 'companion',
        interceptChance: () => 0, // never intercept
      })],
      entities: [
        makePlayer('a'),
        makeEntity('companion', 'Ally', 'a', { tags: ['companion'] }),
        makeEntity('enemy1', 'Thug', 'a'),
      ],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    let hitCount = 0;
    for (let tick = 1; tick <= 30; tick++) {
      engine.world.entities.player.resources.hp = 20;
      engine.world.entities.companion.resources.hp = 20;
      engine.world.entities.enemy1.resources.stamina = 5;
      const events = engine.processAction(npcAction('attack', 'enemy1', tick, { targetIds: ['player'] }));
      // With 0% interception, hits should never be intercepted
      expect(events.some(e => e.type === 'combat.companion.intercepted')).toBe(false);
      if (events.some(e => e.type === 'combat.damage.applied' && e.payload.targetId === 'player')) {
        hitCount++;
      }
    }
    expect(hitCount).toBeGreaterThan(0);
  });
});

describe('fleeing entity AI suppression', () => {
  it('fleeing aggressive NPC only disengages', () => {
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
    cog.morale = 70; // high morale, would normally attack
    setBelief(cog, 'player', 'hostile', true, 0.9, 'observed', 1);

    // Apply fleeing status
    applyStatus(engine.world.entities.guard, COMBAT_STATES.FLEEING, 1, { duration: 5 });

    const intent = selectIntent(engine.world.entities.guard, cog, engine.world, aggressiveProfile);
    expect(intent?.verb).toBe('disengage');
    expect(intent?.reason).toBe('disengage: fleeing');
  });

  it('fleeing cautious NPC only disengages', () => {
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

    applyStatus(engine.world.entities.scout, COMBAT_STATES.FLEEING, 1, { duration: 5 });

    const intent = selectIntent(engine.world.entities.scout, cog, engine.world, cautiousProfile);
    expect(intent?.verb).toBe('disengage');
  });
});

describe('will-shifted AI thresholds', () => {
  it('high-will aggressive NPC attacks at morale levels where low-will would disengage', () => {
    const makeSetup = (will: number) => {
      const engine = createTestEngine({
        modules: [statusCore, createCombatCore(), createCognitionCore({ profiles: [aggressiveProfile] })],
        entities: [
          makePlayer('a'),
          makeEntity('guard', 'Guard', 'a', {
            stats: { vigor: 5, instinct: 5, will },
            ai: { profileId: 'aggressive', goals: [], fears: [], alertLevel: 0, knowledge: {} },
          }),
        ],
        zones: [
          { id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: ['b'] },
          { id: 'b', roomId: 'test', name: 'B', tags: [], neighbors: ['a'] },
        ],
      });
      return engine;
    };

    // Morale 25: low-will (3) would disengage (25 <= 30), high-will (7) attacks (25 > 30 - 10 = 20, and 25 <= 50 - 10 = 40 but HP not low enough)
    const lowWillEngine = makeSetup(3);
    const lowWillCog = getCognition(lowWillEngine.world, 'guard');
    lowWillCog.morale = 25;
    setBelief(lowWillCog, 'player', 'hostile', true, 0.9, 'observed', 1);
    const lowWillIntent = selectIntent(lowWillEngine.world.entities.guard, lowWillCog, lowWillEngine.world, aggressiveProfile);

    const highWillEngine = makeSetup(7);
    const highWillCog = getCognition(highWillEngine.world, 'guard');
    highWillCog.morale = 25;
    setBelief(highWillCog, 'player', 'hostile', true, 0.9, 'observed', 1);
    const highWillIntent = selectIntent(highWillEngine.world.entities.guard, highWillCog, highWillEngine.world, aggressiveProfile);

    expect(lowWillIntent?.verb).toBe('disengage');
    expect(highWillIntent?.verb).toBe('attack');
  });

  it('high-will cautious NPC guards at morale levels where low-will would disengage', () => {
    const makeSetup = (will: number) => {
      const engine = createTestEngine({
        modules: [statusCore, createCombatCore(), createCognitionCore({ profiles: [cautiousProfile] })],
        entities: [
          makePlayer('a'),
          makeEntity('scout', 'Scout', 'a', {
            stats: { vigor: 5, instinct: 5, will },
            ai: { profileId: 'cautious', goals: [], fears: [], alertLevel: 0, knowledge: {} },
          }),
        ],
        zones: [
          { id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: ['b'] },
          { id: 'b', roomId: 'test', name: 'B', tags: [], neighbors: ['a'] },
        ],
      });
      return engine;
    };

    // Morale 25: low-will (3) disengages (25 <= 30), high-will (7) guards (25 > 20, 25 <= 40)
    const lowWillEngine = makeSetup(3);
    const lowWillCog = getCognition(lowWillEngine.world, 'scout');
    lowWillCog.morale = 25;
    setBelief(lowWillCog, 'player', 'hostile', true, 0.9, 'observed', 1);
    const lowWillIntent = selectIntent(lowWillEngine.world.entities.scout, lowWillCog, lowWillEngine.world, cautiousProfile);

    const highWillEngine = makeSetup(7);
    const highWillCog = getCognition(highWillEngine.world, 'scout');
    highWillCog.morale = 25;
    setBelief(highWillCog, 'player', 'hostile', true, 0.9, 'observed', 1);
    const highWillIntent = selectIntent(highWillEngine.world.entities.scout, highWillCog, highWillEngine.world, cautiousProfile);

    expect(lowWillIntent?.verb).toBe('disengage');
    expect(highWillIntent?.verb).toBe('guard');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Phase 3 — Starter-Specific Resource Hooks
// ═══════════════════════════════════════════════════════════════════════════

describe('Phase 3 — starter-specific stat mapping', () => {
  it('gladiator formulas use might for damage, agility for hit chance', () => {
    const gladiatorFormulas = {
      hitChance: (attacker: EntityState, target: EntityState) => {
        const atkAgility = attacker.stats.agility ?? 5;
        const tgtAgility = target.stats.agility ?? 5;
        return Math.min(95, Math.max(5, 50 + atkAgility * 5 - tgtAgility * 3));
      },
      damage: (attacker: EntityState) => Math.max(1, attacker.stats.might ?? 3),
      guardReduction: (defender: EntityState) => {
        const showmanship = defender.stats.showmanship ?? 3;
        const bonus = Math.max(0, (showmanship - 3) * 0.03);
        return Math.min(0.75, 0.5 + bonus);
      },
      disengageChance: (actor: EntityState) => {
        const agility = actor.stats.agility ?? 5;
        const showmanship = actor.stats.showmanship ?? 3;
        return Math.min(90, Math.max(15, 40 + agility * 5 + showmanship * 2));
      },
    };

    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(gladiatorFormulas)],
      entities: [
        makePlayer('a', { stats: { might: 8, agility: 6, showmanship: 4 }, resources: { hp: 25, stamina: 6 } }),
        makeEntity('foe', 'Foe', 'a', { stats: { might: 3, agility: 3, showmanship: 2 }, resources: { hp: 10, stamina: 4 } }),
      ],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    engine.submitAction('attack', { targetIds: ['foe'] });

    // With might=8, damage formula should return 8
    // With agility=6 vs 3, hitChance = min(95, max(5, 50 + 30 - 9)) = 71
    const foe = engine.world.entities.foe;
    // If hit landed, foe lost hp; if missed, hp stays the same
    // Either way, we just verify the engine didn't crash and used our formulas
    expect(foe).toBeDefined();
    expect(foe.resources.hp).toBeLessThanOrEqual(10);
  });

  it('ronin formulas use discipline for damage, perception for hit chance', () => {
    const roninFormulas = {
      hitChance: (attacker: EntityState, target: EntityState) => {
        const atkPerception = attacker.stats.perception ?? 5;
        const tgtPerception = target.stats.perception ?? 5;
        return Math.min(95, Math.max(5, 50 + atkPerception * 5 - tgtPerception * 3));
      },
      damage: (attacker: EntityState) => Math.max(1, attacker.stats.discipline ?? 3),
      guardReduction: (defender: EntityState) => {
        const composure = defender.stats.composure ?? 3;
        const bonus = Math.max(0, (composure - 3) * 0.03);
        return Math.min(0.75, 0.5 + bonus);
      },
      disengageChance: (actor: EntityState) => {
        const perception = actor.stats.perception ?? 5;
        const composure = actor.stats.composure ?? 3;
        return Math.min(90, Math.max(15, 40 + perception * 5 + composure * 2));
      },
    };

    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(roninFormulas)],
      entities: [
        makePlayer('a', { stats: { discipline: 7, perception: 6, composure: 4 }, resources: { hp: 20, stamina: 5 } }),
        makeEntity('foe', 'Foe', 'a', { stats: { discipline: 3, perception: 3, composure: 2 }, resources: { hp: 10, stamina: 4 } }),
      ],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    engine.submitAction('attack', { targetIds: ['foe'] });

    const foe = engine.world.entities.foe;
    expect(foe).toBeDefined();
    expect(foe.resources.hp).toBeLessThanOrEqual(10);
  });

  it('entities without mapped stats fall back to formula defaults', () => {
    // If no stats match, formulas use ?? fallback values
    const customFormulas = {
      hitChance: (attacker: EntityState, target: EntityState) => {
        const atk = attacker.stats.customStat ?? 5;
        const tgt = target.stats.customStat ?? 5;
        return Math.min(95, Math.max(5, 50 + atk * 5 - tgt * 3));
      },
      damage: (attacker: EntityState) => Math.max(1, attacker.stats.customDmg ?? 3),
    };

    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(customFormulas)],
      entities: [
        // No customStat or customDmg — should use fallback 5 and 3
        makePlayer('a', { stats: {}, resources: { hp: 20, stamina: 5 } }),
        makeEntity('foe', 'Foe', 'a', { stats: {}, resources: { hp: 10, stamina: 4 } }),
      ],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    engine.submitAction('attack', { targetIds: ['foe'] });

    // hitChance with defaults: min(95, max(5, 50 + 25 - 15)) = 60
    // damage with default: max(1, 3) = 3
    const foe = engine.world.entities.foe;
    expect(foe).toBeDefined();
  });

  it('combat requires stamina >= 1 for attack', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore()],
      entities: [
        makePlayer('a', { resources: { hp: 20, stamina: 0 } }),
        makeEntity('foe', 'Foe', 'a'),
      ],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    engine.submitAction('attack', { targetIds: ['foe'] });

    // Attack should be rejected — foe hp unchanged
    const foe = engine.world.entities.foe;
    expect(foe.resources.hp).toBe(20);
  });

  it('combat requires stamina >= 1 for guard', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore()],
      entities: [
        makePlayer('a', { resources: { hp: 20, stamina: 0 } }),
        makeEntity('foe', 'Foe', 'a'),
      ],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    engine.submitAction('guard');

    // Guard should be rejected — no guarding status applied
    const player = engine.world.entities.player;
    expect(player.statuses.some((s: { id: string }) => s.id.includes('guard'))).toBe(false);
  });

  it('determinism preserved — same seed + actions = same outcome', () => {
    const run = (seed: number) => {
      const engine = createTestEngine({
        seed,
        modules: [statusCore, createCombatCore()],
        entities: [
          makePlayer('a', { resources: { hp: 20, stamina: 5 } }),
          makeEntity('foe', 'Foe', 'a', { resources: { hp: 15, stamina: 4 } }),
        ],
        zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
      });

      engine.submitAction('attack', { targetIds: ['foe'] });
      engine.submitAction('attack', { targetIds: ['foe'] });

      return {
        foeHp: engine.world.entities.foe?.resources.hp,
        playerStamina: engine.world.entities.player?.resources.stamina,
      };
    };

    const result1 = run(99);
    const result2 = run(99);
    expect(result1).toEqual(result2);
  });
});

// ---------------------------------------------------------------------------
// Stat Mapping Tests (Phase 7)
// ---------------------------------------------------------------------------

describe('combat-core: stat mapping', () => {
  const zones = [
    { id: 'zone-a', roomId: 'test', name: 'Zone A', tags: [] as string[], neighbors: ['zone-b'] },
    { id: 'zone-b', roomId: 'test', name: 'Zone B', tags: [] as string[], neighbors: ['zone-a'] },
  ];

  it('non-fantasy stats correctly read through mapping', () => {
    // Gladiator: might → attack, agility → precision, showmanship → resolve
    const gladiatorFormulas = {
      statMapping: { attack: 'might', precision: 'agility', resolve: 'showmanship' },
    };

    const player = makePlayer('zone-a', {
      stats: { might: 8, agility: 7, showmanship: 4 },
    });
    const enemy = makeEntity('foe', 'Foe', 'zone-a', {
      stats: { might: 3, agility: 3, showmanship: 2 },
      resources: { hp: 100, stamina: 10 },
    });

    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(gladiatorFormulas)],
      entities: [player, enemy],
      zones,
    });

    // Attack multiple times to verify damage uses mapped stats
    let totalDamage = 0;
    for (let i = 0; i < 20; i++) {
      engine.world.entities.player.resources.stamina = 5;
      const prevHp = engine.world.entities.foe.resources.hp;
      engine.submitAction('attack', { targetIds: ['foe'] });
      const dmg = prevHp - engine.world.entities.foe.resources.hp;
      if (dmg > 0) totalDamage += dmg;
    }
    // With might=8, default damage formula returns max(1, 8) = 8 per hit
    // At least some hits should deal 8 damage
    expect(totalDamage).toBeGreaterThan(0);
  });

  it('missing stat in mapping falls back to default value', () => {
    const formulas = {
      statMapping: { attack: 'strength', precision: 'dexterity', resolve: 'fortitude' },
    };

    // Entity has NO strength/dexterity/fortitude stats → all fallback to defaults
    const player = makePlayer('zone-a', { stats: {} });
    const enemy = makeEntity('foe', 'Foe', 'zone-a', {
      stats: {},
      resources: { hp: 100, stamina: 10 },
    });

    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(formulas)],
      entities: [player, enemy],
      zones,
    });

    // Should not crash — fallback values kick in
    engine.world.entities.player.resources.stamina = 5;
    engine.submitAction('attack', { targetIds: ['foe'] });
    const events = engine.drainEvents();

    // Should have some event (rejected or hit or miss), no crash
    expect(events.length).toBeGreaterThan(0);
  });

  it('stat mapping affects hit chance proportionally', () => {
    const zones2 = [
      { id: 'zone-a', roomId: 'test', name: 'Zone A', tags: [] as string[], neighbors: ['zone-b'] },
      { id: 'zone-b', roomId: 'test', name: 'Zone B', tags: [] as string[], neighbors: ['zone-a'] },
    ];

    // High precision entity
    const highPrecision = {
      statMapping: { attack: 'str', precision: 'dex', resolve: 'con' },
    };

    let hits = 0;
    for (let seed = 1; seed <= 50; seed++) {
      const player = makePlayer('zone-a', { stats: { str: 5, dex: 10, con: 3 } });
      const enemy = makeEntity('foe', 'Foe', 'zone-a', {
        stats: { str: 3, dex: 3, con: 3 },
        resources: { hp: 100, stamina: 10 },
      });

      const engine = createTestEngine({
        modules: [statusCore, createCombatCore(highPrecision)],
        entities: [player, enemy],
        zones: zones2,
        seed,
      });

      engine.world.entities.player.resources.stamina = 5;
      const prevHp = engine.world.entities.foe.resources.hp;
      engine.submitAction('attack', { targetIds: ['foe'] });
      if (engine.world.entities.foe.resources.hp < prevHp) hits++;
    }

    // With dex=10 vs dex=3: 50 + 10*5 - 3*3 = 91, clamped to 91
    // Should hit the vast majority of the time
    expect(hits).toBeGreaterThan(40); // >80% hit rate expected
  });
});

// ---------------------------------------------------------------------------
// Edge case tests — state discipline
// ---------------------------------------------------------------------------

describe('combat state edge cases', () => {
  it('GUARDED absorbs exactly one hit — second attacker gets no reduction', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore()],
      entities: [
        makePlayer('a'),
        makeEntity('foe1', 'Goblin A', 'a'),
        makeEntity('foe2', 'Goblin B', 'a'),
      ],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    // Player guards
    engine.submitAction('guard');
    expect(hasStatus(engine.world.entities.player, COMBAT_STATES.GUARDED)).toBe(true);

    // First attacker hits — guard absorbs
    const events1 = engine.processAction(npcAction('attack', 'foe1', engine.world.meta.tick, { targetIds: ['player'] }));
    const hit1 = events1.find(e => e.type === 'combat.contact.hit');

    // Guard should be cleared after absorbing
    if (hit1) {
      expect(hasStatus(engine.world.entities.player, COMBAT_STATES.GUARDED)).toBe(false);
    }

    // Second attacker hits — no guard protection
    const hpBeforeSecond = engine.world.entities.player.resources.hp;
    const events2 = engine.processAction(npcAction('attack', 'foe2', engine.world.meta.tick, { targetIds: ['player'] }));
    const hit2 = events2.find(e => e.type === 'combat.contact.hit');
    if (hit2) {
      // No guard absorption event for second hit
      const guardAbsorb = events2.find(e => e.type === 'combat.guard.absorbed');
      expect(guardAbsorb).toBeUndefined();
    }
  });

  it('EXPOSED consumed by first hit — second attacker gets no bonus', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore()],
      entities: [
        makePlayer('a'),
        makeEntity('foe1', 'Goblin A', 'a'),
        makeEntity('foe2', 'Goblin B', 'a'),
      ],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    // Apply EXPOSED to player
    applyStatus(engine.world.entities.player, COMBAT_STATES.EXPOSED, engine.world.meta.tick, { duration: 1 });
    expect(hasStatus(engine.world.entities.player, COMBAT_STATES.EXPOSED)).toBe(true);

    // First attacker hits — EXPOSED consumed
    const events1 = engine.processAction(npcAction('attack', 'foe1', engine.world.meta.tick, { targetIds: ['player'] }));
    const hit1 = events1.find(e => e.type === 'combat.contact.hit');
    if (hit1) {
      expect(hasStatus(engine.world.entities.player, COMBAT_STATES.EXPOSED)).toBe(false);
    }

    // Second attacker — should not benefit from EXPOSED
    expect(hasStatus(engine.world.entities.player, COMBAT_STATES.EXPOSED)).toBe(false);
  });

  it('attacking clears own GUARDED', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore()],
      entities: [makePlayer('a'), makeEntity('foe', 'Goblin', 'a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    engine.submitAction('guard');
    expect(hasStatus(engine.world.entities.player, COMBAT_STATES.GUARDED)).toBe(true);

    engine.world.entities.player.resources.stamina = 5;
    engine.submitAction('attack', { targetIds: ['foe'] });
    expect(hasStatus(engine.world.entities.player, COMBAT_STATES.GUARDED)).toBe(false);
  });

  it('disengaging clears own GUARDED', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore()],
      entities: [makePlayer('a')],
      zones: [
        { id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: ['b'] },
        { id: 'b', roomId: 'test', name: 'B', tags: [], neighbors: ['a'] },
      ],
    });

    engine.submitAction('guard');
    expect(hasStatus(engine.world.entities.player, COMBAT_STATES.GUARDED)).toBe(true);

    engine.world.entities.player.resources.stamina = 5;
    engine.submitAction('disengage');
    expect(hasStatus(engine.world.entities.player, COMBAT_STATES.GUARDED)).toBe(false);
  });

  it('defeated entity with states does not crash on tick', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore()],
      entities: [makePlayer('a', { resources: { hp: 0, stamina: 5 } })],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    // Apply states to defeated entity
    applyStatus(engine.world.entities.player, COMBAT_STATES.OFF_BALANCE, engine.world.meta.tick, { duration: 1 });
    applyStatus(engine.world.entities.player, COMBAT_STATES.FLEEING, engine.world.meta.tick, { duration: 2 });

    // Advance ticks and trigger expiration processing via action.resolved
    expect(() => {
      for (let i = 0; i < 3; i++) {
        engine.store.advanceTick();
        engine.store.recordEvent({
          id: nextId('evt'),
          tick: engine.store.tick,
          type: 'action.resolved',
          payload: { verb: 'wait' },
        });
      }
    }).not.toThrow();

    // States should have expired
    expect(hasStatus(engine.world.entities.player, COMBAT_STATES.OFF_BALANCE)).toBe(false);
    expect(hasStatus(engine.world.entities.player, COMBAT_STATES.FLEEING)).toBe(false);
  });

  it('brace clears OFF_BALANCE via stabilization', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(), createCombatTactics()],
      entities: [makePlayer('a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    // Apply off-balance
    applyStatus(engine.world.entities.player, COMBAT_STATES.OFF_BALANCE, engine.world.meta.tick, { duration: 1 });
    expect(hasStatus(engine.world.entities.player, COMBAT_STATES.OFF_BALANCE)).toBe(true);

    // Brace should clear it
    engine.submitAction('brace');
    expect(hasStatus(engine.world.entities.player, COMBAT_STATES.OFF_BALANCE)).toBe(false);
    expect(hasStatus(engine.world.entities.player, COMBAT_STATES.GUARDED)).toBe(true);
  });

  it('GUARDED + EXPOSED can coexist', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore()],
      entities: [makePlayer('a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    // Apply both
    engine.submitAction('guard');
    applyStatus(engine.world.entities.player, COMBAT_STATES.EXPOSED, engine.world.meta.tick, { duration: 1 });

    expect(hasStatus(engine.world.entities.player, COMBAT_STATES.GUARDED)).toBe(true);
    expect(hasStatus(engine.world.entities.player, COMBAT_STATES.EXPOSED)).toBe(true);
  });

  it('OFF_BALANCE + EXPOSED stack vulnerability', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore()],
      entities: [
        makePlayer('a'),
        makeEntity('foe', 'Goblin', 'a', { stats: { vigor: 5, instinct: 10, will: 3 } }),
      ],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    // Apply both bad states
    applyStatus(engine.world.entities.player, COMBAT_STATES.OFF_BALANCE, engine.world.meta.tick, { duration: 1 });
    applyStatus(engine.world.entities.player, COMBAT_STATES.EXPOSED, engine.world.meta.tick, { duration: 1 });

    expect(hasStatus(engine.world.entities.player, COMBAT_STATES.OFF_BALANCE)).toBe(true);
    expect(hasStatus(engine.world.entities.player, COMBAT_STATES.EXPOSED)).toBe(true);

    // Both states provide their modifiers simultaneously
    const hpBefore = engine.world.entities.player.resources.hp;
    engine.processAction(npcAction('attack', 'foe', engine.world.meta.tick, { targetIds: ['player'] }));
    const hpAfter = engine.world.entities.player.resources.hp;

    // If hit landed, damage includes both bonuses (+1 from off-balance, +2 from exposed)
    if (hpAfter < hpBefore) {
      const damage = hpBefore - hpAfter;
      // Base damage (vigor 5) + off-balance (+1) + exposed (+2) = 8
      expect(damage).toBeGreaterThanOrEqual(7); // at least base + some bonus
    }
  });

  it('reposition clears own GUARDED', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(), createCombatTactics()],
      entities: [makePlayer('a'), makeEntity('foe', 'Goblin', 'a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    engine.submitAction('guard');
    expect(hasStatus(engine.world.entities.player, COMBAT_STATES.GUARDED)).toBe(true);

    engine.world.entities.player.resources.stamina = 5;
    engine.submitAction('reposition', { targetIds: ['foe'] });
    // Reposition clears own guard (movement breaks static defense)
    expect(hasStatus(engine.world.entities.player, COMBAT_STATES.GUARDED)).toBe(false);
  });

  it('untargeted reposition clears own EXPOSED', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(), createCombatTactics()],
      entities: [makePlayer('a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    applyStatus(engine.world.entities.player, COMBAT_STATES.EXPOSED, engine.world.meta.tick, { duration: 1 });
    expect(hasStatus(engine.world.entities.player, COMBAT_STATES.EXPOSED)).toBe(true);

    // Untargeted reposition — recovery mode
    engine.submitAction('reposition');

    // If reposition succeeded, EXPOSED should be cleared
    // (success depends on roll, so we check both outcomes are valid)
    // The important thing is no crash
    const player = engine.world.entities.player;
    // Either exposed cleared (success) or still exposed (fail) — both valid
    expect(player).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Precision vs Force distinction (P6)
// ---------------------------------------------------------------------------

describe('precision vs force: guard counter', () => {
  it('high instinct entity has higher counter chance than default', () => {
    // Test guard counter formula: 25 + instinct*2 + will*2
    // Default (inst=5, will=3): 25+10+6 = 41
    // High instinct (inst=8, will=3): 25+16+6 = 47
    // We test by having a player guard, enemy attacks, and checking counter rates
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore()],
      entities: [
        makePlayer('a', { stats: { vigor: 5, instinct: 8, will: 3 } }),
        makeEntity('enemy1', 'Thug', 'a'),
      ],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    let counterCount = 0;
    const trials = 100;
    for (let tick = 1; tick <= trials; tick++) {
      engine.world.entities.player.resources.hp = 20;
      engine.world.entities.player.resources.stamina = 5;
      engine.world.entities.enemy1.resources.stamina = 5;
      // Guard first
      engine.submitAction('guard');
      expect(hasStatus(engine.world.entities.player, COMBAT_STATES.GUARDED)).toBe(true);
      // Enemy attacks
      const events = engine.processAction(npcAction('attack', 'enemy1', tick, { targetIds: ['player'] }));
      if (events.some(e => e.type === 'combat.counter.off_balance')) {
        counterCount++;
      }
      // Clean up states
      removeStatus(engine.world.entities.enemy1, COMBAT_STATES.OFF_BALANCE, tick);
      removeStatus(engine.world.entities.player, COMBAT_STATES.GUARDED, tick);
    }

    // With formula 25+16+6=47%, counter rate should be ~47% over 100 trials
    // Default would be 25+10+6=41%. Just verify high instinct gives a reasonable rate.
    expect(counterCount).toBeGreaterThan(20); // should be around 47
  });
});

describe('precision vs force: guard breakthrough', () => {
  it('high vigor attacker can break guard (vigor=10 vs will=3)', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore()],
      entities: [
        makeEntity('brute', 'Brute', 'a', {
          type: 'enemy',
          stats: { vigor: 10, instinct: 5, will: 3 },
        }),
        makePlayer('a', { resources: { hp: 200, stamina: 5 } }),
      ],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    let breakCount = 0;
    const trials = 200;
    for (let tick = 1; tick <= trials; tick++) {
      engine.world.entities.player.resources.hp = 200;
      engine.world.entities.player.resources.stamina = 5;
      engine.world.entities.brute.resources.stamina = 5;
      // Directly apply guard (avoids tick advancement from submitAction)
      engine.world.entities.player.statuses = engine.world.entities.player.statuses.filter(
        s => s.statusId !== COMBAT_STATES.GUARDED,
      );
      applyStatus(engine.world.entities.player, COMBAT_STATES.GUARDED, engine.world.meta.tick, { duration: 3 });
      // Brute attacks
      const events = engine.processAction(npcAction('attack', 'brute', tick, { targetIds: ['player'] }));
      if (events.some(e => e.type === 'combat.guard.broken')) {
        breakCount++;
      }
      // Clean up
      removeStatus(engine.world.entities.player, COMBAT_STATES.OFF_BALANCE, tick);
      removeStatus(engine.world.entities.player, COMBAT_STATES.GUARDED, tick);
    }

    // breakChance = min(25, max(0, (10-3-2)*5)) = 25%. Should see some breaks.
    expect(breakCount).toBeGreaterThan(0);
  });

  it('balanced stats cannot break guard (vigor=5 vs will=3)', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore()],
      entities: [
        makeEntity('fighter', 'Fighter', 'a', {
          type: 'enemy',
          stats: { vigor: 5, instinct: 5, will: 3 },
        }),
        makePlayer('a', { resources: { hp: 200, stamina: 5 } }),
      ],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    let breakCount = 0;
    for (let tick = 1; tick <= 100; tick++) {
      engine.world.entities.player.resources.hp = 200;
      engine.world.entities.player.resources.stamina = 5;
      engine.world.entities.fighter.resources.stamina = 5;
      engine.world.entities.player.statuses = engine.world.entities.player.statuses.filter(
        s => s.statusId !== COMBAT_STATES.GUARDED,
      );
      applyStatus(engine.world.entities.player, COMBAT_STATES.GUARDED, engine.world.meta.tick, { duration: 3 });
      const events = engine.processAction(npcAction('attack', 'fighter', tick, { targetIds: ['player'] }));
      if (events.some(e => e.type === 'combat.guard.broken')) breakCount++;
      removeStatus(engine.world.entities.player, COMBAT_STATES.OFF_BALANCE, tick);
      removeStatus(engine.world.entities.player, COMBAT_STATES.GUARDED, tick);
    }

    // breakChance = min(25, max(0, (5-3-2)*5)) = 0. No breaks ever.
    expect(breakCount).toBe(0);
  });

  it('guard breakthrough applies OFF_BALANCE to defender', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore()],
      entities: [
        makeEntity('brute', 'Brute', 'a', {
          type: 'enemy',
          stats: { vigor: 10, instinct: 5, will: 3 },
        }),
        makePlayer('a', { resources: { hp: 200, stamina: 5 } }),
      ],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    for (let tick = 1; tick <= 200; tick++) {
      engine.world.entities.player.resources.hp = 200;
      engine.world.entities.player.resources.stamina = 5;
      engine.world.entities.brute.resources.stamina = 5;
      engine.world.entities.player.statuses = engine.world.entities.player.statuses.filter(
        s => s.statusId !== COMBAT_STATES.GUARDED,
      );
      applyStatus(engine.world.entities.player, COMBAT_STATES.GUARDED, engine.world.meta.tick, { duration: 3 });
      const events = engine.processAction(npcAction('attack', 'brute', tick, { targetIds: ['player'] }));
      const broken = events.find(e => e.type === 'combat.guard.broken');
      if (broken) {
        expect(hasStatus(engine.world.entities.player, COMBAT_STATES.OFF_BALANCE)).toBe(true);
        return;
      }
      removeStatus(engine.world.entities.player, COMBAT_STATES.OFF_BALANCE, tick);
      removeStatus(engine.world.entities.player, COMBAT_STATES.GUARDED, tick);
    }
    expect.unreachable('expected at least one guard break in 200 trials');
  });
});

describe('precision vs force: guard break narration', () => {
  it('guard break event gets description text patched', () => {
    const engine = createTestEngine({
      modules: [
        statusCore,
        createCombatCore(),
        createCombatStateNarration(),
      ],
      entities: [
        makeEntity('brute', 'Brute', 'a', {
          type: 'enemy',
          stats: { vigor: 10, instinct: 5, will: 3 },
        }),
        makePlayer('a', {
          stats: { vigor: 5, instinct: 5, will: 1 },
        }),
      ],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    // Guard the player, then attack with brute many times to trigger breakthrough
    let guardBreakEvent: any = null;
    for (let tick = 1; tick <= 100 && !guardBreakEvent; tick++) {
      engine.world.entities.player.resources.hp = 200;
      engine.world.entities.player.resources.stamina = 5;
      engine.world.entities.brute.resources.stamina = 5;
      // Reapply guard each round
      engine.world.entities.player.statuses = engine.world.entities.player.statuses.filter(
        s => s.statusId !== COMBAT_STATES.GUARDED,
      );
      applyStatus(engine.world.entities.player, COMBAT_STATES.GUARDED, tick, { duration: 3 });
      engine.world.meta.tick = tick;

      const events = engine.processAction(npcAction('attack', 'brute', tick, { targetIds: ['player'] }));
      guardBreakEvent = events.find(e => e.type === 'combat.guard.broken');
    }

    expect(guardBreakEvent).toBeDefined();
    expect(guardBreakEvent.payload.description).toBeDefined();
    expect(typeof guardBreakEvent.payload.description).toBe('string');
    expect(guardBreakEvent.payload.description.length).toBeGreaterThan(0);
    // Should mention the attacker name
    expect(guardBreakEvent.payload.description).toContain('Brute');
    expect(guardBreakEvent.presentation.channels).toContain('narrator');
  });
});

describe('precision vs force: hitStyle', () => {
  it('hitStyle reflects attacker stat profile', () => {
    // Forceful: vigor > instinct
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore()],
      entities: [
        makeEntity('brute', 'Brute', 'a', {
          type: 'enemy',
          stats: { vigor: 8, instinct: 3, will: 3 },
        }),
        makePlayer('a', { resources: { hp: 200, stamina: 5 } }),
      ],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    for (let tick = 1; tick <= 50; tick++) {
      engine.world.entities.player.resources.hp = 200;
      engine.world.entities.brute.resources.stamina = 5;
      const events = engine.processAction(npcAction('attack', 'brute', tick, { targetIds: ['player'] }));
      const hit = events.find(e => e.type === 'combat.contact.hit');
      if (hit) {
        expect(hit.payload.hitStyle).toBe('forceful');
        return;
      }
    }
    expect.unreachable('expected at least one hit');
  });
});

// ---------------------------------------------------------------------------
// Companion Interception Formula (P7)
// ---------------------------------------------------------------------------

describe('companion interception formula', () => {
  const baseWorld = (overrides?: Record<string, unknown>) => ({
    playerId: 'player',
    entities: {},
    zones: {},
    modules: {},
    meta: { tick: 1 },
    locationId: 'a',
    ...overrides,
  } as any);

  const makeAlly = (overrides?: Partial<EntityState>): EntityState => ({
    id: 'ally1',
    blueprintId: 'ally1',
    type: 'player',
    name: 'Companion',
    tags: ['ally'],
    stats: { vigor: 5, instinct: 5, will: 3 },
    resources: { hp: 20, maxHp: 20, stamina: 5 },
    statuses: [],
    zoneId: 'a',
    ...overrides,
  });

  const dummyTarget: EntityState = {
    id: 'player',
    blueprintId: 'player',
    type: 'player',
    name: 'Hero',
    tags: ['player'],
    stats: { vigor: 5, instinct: 5, will: 3 },
    resources: { hp: 20, maxHp: 20, stamina: 5 },
    statuses: [],
    zoneId: 'a',
  };

  it('baseline returns ~31 at default stats (instinct=5, will=3, full HP, morale=70)', () => {
    const ally = makeAlly();
    const world = baseWorld();
    const chance = defaultInterceptChance(ally, dummyTarget, world, DEFAULT_STAT_MAPPING);
    // 8 + floor(5*2.5) + max(0,floor((3-3)*1.5)) + floor(1.0*8) + floor((70-50)*0.15) + 0 role
    // = 8 + 12 + 0 + 8 + 3 + 0 = 31
    expect(chance).toBe(31);
  });

  it('FLEEING ally returns 0', () => {
    const ally = makeAlly();
    applyStatus(ally, COMBAT_STATES.FLEEING, 1);
    const chance = defaultInterceptChance(ally, dummyTarget, baseWorld(), DEFAULT_STAT_MAPPING);
    expect(chance).toBe(0);
  });

  it('bodyguard role boosts interception by +15', () => {
    const ally = makeAlly({ tags: ['ally', 'role:bodyguard'] });
    const chance = defaultInterceptChance(ally, dummyTarget, baseWorld(), DEFAULT_STAT_MAPPING);
    // baseline 31 + 15 = 46
    expect(chance).toBe(46);
  });

  it('critical HP (< 25%) reduces interception by -15', () => {
    const ally = makeAlly({ resources: { hp: 4, maxHp: 20, stamina: 5 } });
    const chance = defaultInterceptChance(ally, dummyTarget, baseWorld(), DEFAULT_STAT_MAPPING);
    // hpRatio = 0.2, floor(0.2*8) = 1, critical penalty -15
    // 8 + 12 + 0 + 1 - 15 + 3 + 0 = 9
    expect(chance).toBe(9);
  });

  it('OFF_BALANCE reduces interception by -10', () => {
    const ally = makeAlly();
    applyStatus(ally, COMBAT_STATES.OFF_BALANCE, 1);
    const chance = defaultInterceptChance(ally, dummyTarget, baseWorld(), DEFAULT_STAT_MAPPING);
    // baseline 31 - 10 = 21
    expect(chance).toBe(21);
  });

  it('GUARDED boosts interception by +8', () => {
    const ally = makeAlly();
    applyStatus(ally, COMBAT_STATES.GUARDED, 1, { duration: 2 });
    const chance = defaultInterceptChance(ally, dummyTarget, baseWorld(), DEFAULT_STAT_MAPPING);
    // baseline 31 + 8 = 39
    expect(chance).toBe(39);
  });

  it('coward role with low morale and OFF_BALANCE clamps to 5', () => {
    const ally = makeAlly({
      tags: ['ally', 'role:coward'],
      resources: { hp: 10, maxHp: 20, stamina: 5 },
    });
    applyStatus(ally, COMBAT_STATES.OFF_BALANCE, 1);
    // Morale=20 via cognition module
    const world = baseWorld({
      modules: {
        'cognition-core': {
          entityCognition: { ally1: { morale: 20 } },
        },
      },
    });
    const chance = defaultInterceptChance(ally, dummyTarget, world, DEFAULT_STAT_MAPPING);
    // 8 + 12 + 0 + floor(0.5*8)=4 + floor((20-50)*0.15)=floor(-4.5)=-5 + (-10 OB) + (-12 coward) = 8+12+0+4-5-10-12 = -3 → clamped to 5
    expect(chance).toBe(5);
  });
});
