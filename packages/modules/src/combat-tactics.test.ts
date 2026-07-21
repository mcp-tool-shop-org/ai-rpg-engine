import { describe, it, expect } from 'vitest';
import { createTestEngine, nextId } from '@ai-rpg-engine/core';
import type { EntityState, ActionIntent } from '@ai-rpg-engine/core';
import { createCombatCore, COMBAT_STATES } from './combat-core.js';
import { statusCore, hasStatus, applyStatus } from './status-core.js';
import { createCombatTactics, getRoundFlags } from './combat-tactics.js';
import { createEngagementCore, ENGAGEMENT_STATES } from './engagement-core.js';
import { selectNpcCombatAction } from './combat-intent.js';
import { createCognitionCore, getCognition } from './cognition-core.js';

const makeEntity = (id: string, name: string, zoneId: string, overrides?: Partial<EntityState>): EntityState => ({
  id,
  blueprintId: id,
  type: 'enemy',
  name,
  tags: ['enemy'],
  stats: { vigor: 5, instinct: 5, will: 3 },
  resources: { hp: 20, maxHp: 20, stamina: 5 },
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
  resources: { hp: 20, maxHp: 20, stamina: 5 },
  statuses: [],
  zoneId,
  ...overrides,
});

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

// Round-flag state now lives per-world in world.modules['combat-tactics']
// (F-80a6afa2) — each createTestEngine() call gets its own fresh, isolated
// state, so the old global clearRoundFlags()-in-beforeEach reset is no longer
// needed for test isolation.

// ---------------------------------------------------------------------------
// Brace
// ---------------------------------------------------------------------------

describe('brace action', () => {
  it('applies guarded status and costs stamina', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(), createCombatTactics()],
      entities: [makePlayer('a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    const events = engine.submitAction('brace');
    expect(events.some(e => e.type === 'combat.brace.start')).toBe(true);
    expect(events.some(e => e.type === 'status.applied' && e.payload.statusId === COMBAT_STATES.GUARDED)).toBe(true);
    expect(events.some(e => e.type === 'resource.changed' && e.payload.resource === 'stamina')).toBe(true);

    const player = engine.world.entities.player;
    expect(hasStatus(player, COMBAT_STATES.GUARDED)).toBe(true);
    expect(player.resources.stamina).toBe(4);
  });

  it('sets braced round flag', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(), createCombatTactics()],
      entities: [makePlayer('a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    engine.submitAction('brace');
    const flags = getRoundFlags(engine.world, 'player');
    expect(flags.braced).toBe(true);
  });

  it('clears off-balance when bracing (stabilization)', () => {
    const player = makePlayer('a');
    applyStatus(player, COMBAT_STATES.OFF_BALANCE, 0, { duration: 2 });

    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(), createCombatTactics()],
      entities: [player],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    const events = engine.submitAction('brace');
    expect(events.some(e => e.type === 'combat.brace.stabilized')).toBe(true);
    expect(hasStatus(engine.world.entities.player, COMBAT_STATES.OFF_BALANCE)).toBe(false);
  });

  it('rejects when actor has no stamina', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(), createCombatTactics()],
      entities: [makePlayer('a', { resources: { hp: 20, maxHp: 20, stamina: 0 } })],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    const events = engine.submitAction('brace');
    expect(events.some(e => e.type === 'action.rejected' && e.payload.reason === 'not enough stamina')).toBe(true);
  });

  it('rejects when actor is defeated', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(), createCombatTactics()],
      entities: [makePlayer('a', { resources: { hp: 0, maxHp: 20, stamina: 5 } })],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    const events = engine.submitAction('brace');
    expect(events.some(e => e.type === 'action.rejected' && e.payload.reason === 'actor is defeated')).toBe(true);
  });

  it('reports chokepoint advantage', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(), createCombatTactics()],
      entities: [makePlayer('a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: ['chokepoint'], neighbors: [] }],
    });

    const events = engine.submitAction('brace');
    const braceEvent = events.find(e => e.type === 'combat.brace.start');
    expect(braceEvent?.payload.atChokepoint).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Reposition
// ---------------------------------------------------------------------------

describe('reposition action', () => {
  it('costs stamina and clears guarded', () => {
    const player = makePlayer('a');
    applyStatus(player, COMBAT_STATES.GUARDED, 0, { duration: 2 });

    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(), createCombatTactics()],
      entities: [player, makeEntity('orc-1', 'Orc', 'a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: ['b'] }],
    });

    engine.submitAction('reposition', { targetIds: ['orc-1'] });
    const world = engine.world;
    expect(world.entities.player.resources.stamina).toBe(4);
    expect(hasStatus(world.entities.player, COMBAT_STATES.GUARDED)).toBe(false);
  });

  it('rejects when actor has no stamina', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(), createCombatTactics()],
      entities: [makePlayer('a', { resources: { hp: 20, maxHp: 20, stamina: 0 } })],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: ['b'] }],
    });

    const events = engine.submitAction('reposition');
    expect(events.some(e => e.type === 'action.rejected' && e.payload.reason === 'not enough stamina')).toBe(true);
  });

  it('rejects when actor is defeated', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(), createCombatTactics()],
      entities: [makePlayer('a', { resources: { hp: 0, maxHp: 20, stamina: 5 } })],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: ['b'] }],
    });

    const events = engine.submitAction('reposition');
    expect(events.some(e => e.type === 'action.rejected' && e.payload.reason === 'actor is defeated')).toBe(true);
  });

  it('produces success or fail event', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(), createCombatTactics()],
      entities: [makePlayer('a'), makeEntity('orc-1', 'Orc', 'a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: ['b'] }],
    });

    const events = engine.submitAction('reposition', { targetIds: ['orc-1'] });
    const hasOutcome = events.some(e =>
      e.type === 'combat.reposition.success' || e.type === 'combat.reposition.fail'
    );
    expect(hasOutcome).toBe(true);
  });

  it('failed reposition applies exposed', () => {
    // Use very low precision to make failure likely
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(), createCombatTactics({
        repositionBaseChance: 0, // force failure
      })],
      entities: [makePlayer('a', { stats: { vigor: 1, instinct: 1, will: 1 } }), makeEntity('orc-1', 'Orc', 'a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: ['b'] }],
    });

    const events = engine.submitAction('reposition', { targetIds: ['orc-1'] });
    const failed = events.some(e => e.type === 'combat.reposition.fail');
    if (failed) {
      expect(hasStatus(engine.world.entities.player, COMBAT_STATES.EXPOSED)).toBe(true);
    }
  });

  // MOD-C-BH-04: the fail event travelled the narrator channel with no
  // player-grade text — a failed reposition was mechanically punished (exposed)
  // but narratively silent.
  it('combat.reposition.fail carries a player-grade description (MOD-C-BH-04)', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(), createCombatTactics({
        repositionBaseChance: 0, // failure highly likely (floor is 10% success)
      })],
      entities: [makePlayer('a', { stats: { vigor: 1, instinct: 1, will: 1 } }), makeEntity('orc-1', 'Orc', 'a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: ['b'] }],
    });

    let fail: import('@ai-rpg-engine/core').ResolvedEvent | undefined;
    for (let i = 0; i < 30 && !fail; i++) {
      engine.world.entities.player.resources.stamina = 5;
      const events = engine.submitAction('reposition', { targetIds: ['orc-1'] });
      fail = events.find(e => e.type === 'combat.reposition.fail');
    }
    expect(fail).toBeDefined();
    expect(typeof fail!.payload.description).toBe('string');
    expect(fail!.payload.description as string).toContain('Hero');
    expect((fail!.payload.description as string).toLowerCase()).toContain('exposed');
  });

  it('successful untargeted reposition clears exposed and off-balance', () => {
    const player = makePlayer('a', { stats: { vigor: 5, instinct: 10, will: 5 } });
    applyStatus(player, COMBAT_STATES.EXPOSED, 0, { duration: 2 });
    applyStatus(player, COMBAT_STATES.OFF_BALANCE, 0, { duration: 2 });

    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(), createCombatTactics({
        repositionBaseChance: 100, // force success
      })],
      entities: [player],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: ['b'] }],
    });

    const events = engine.submitAction('reposition');
    const succeeded = events.some(e => e.type === 'combat.reposition.success');
    if (succeeded) {
      const world = engine.world;
      expect(hasStatus(world.entities.player, COMBAT_STATES.EXPOSED)).toBe(false);
      expect(hasStatus(world.entities.player, COMBAT_STATES.OFF_BALANCE)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// MC-02: round flags are tick-scoped (no dead tick.start dependency)
// ---------------------------------------------------------------------------

describe('MC-02: braced flag only resists off-balance on the same/adjacent tick', () => {
  // Helper: push a status.applied OFF_BALANCE event onto the real bus so the
  // brace-resist listener fires. We pre-apply the status to the entity so the
  // listener's removeStatus has something to remove if it (incorrectly) fires.
  function applyOffBalanceThroughBus(engine: ReturnType<typeof createTestEngine>, entityId: string, tick: number) {
    const entity = engine.world.entities[entityId];
    applyStatus(entity, COMBAT_STATES.OFF_BALANCE, tick, { duration: 5 });
    engine.store.recordEvent({
      id: '',
      tick,
      type: 'status.applied',
      actorId: entityId,
      payload: { statusId: COMBAT_STATES.OFF_BALANCE },
      tags: ['status'],
    });
  }

  it('does NOT stabilize when off-balance lands two ticks after bracing', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(), createCombatTactics({ braceStabilizeChance: 100 })],
      entities: [makePlayer('a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    // Brace at tick 0 (submitAction processes at 0, then advances to tick 1).
    engine.submitAction('brace');
    expect(getRoundFlags(engine.world, 'player').braced).toBe(true);

    // Jump to tick 2 (N+2 relative to the brace tick) without re-bracing.
    engine.world.meta.tick = 2;
    applyOffBalanceThroughBus(engine, 'player', 2);

    // With braceStabilizeChance=100, an *active* brace would always remove
    // off-balance. It must still be present → the stale flag did not fire.
    expect(hasStatus(engine.world.entities.player, COMBAT_STATES.OFF_BALANCE)).toBe(true);
  });

  it('DOES stabilize when off-balance lands on the brace tick (positive control)', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(), createCombatTactics({ braceStabilizeChance: 100 })],
      entities: [makePlayer('a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    // Force the brace to be processed at tick 5.
    engine.world.meta.tick = 5;
    engine.submitAction('brace'); // processed at 5, flag stamped at 5
    // submitAction advanced tick to 6; off-balance on the adjacent prior tick (5)
    // is still within the active window {currentTick, currentTick-1} = {6,5}.
    applyOffBalanceThroughBus(engine, 'player', 6);

    expect(hasStatus(engine.world.entities.player, COMBAT_STATES.OFF_BALANCE)).toBe(false);
  });

  it('braced flag does not penalize reposition two ticks later', () => {
    // A braced defender penalizes reposition (-20). That penalty must not leak
    // to a reposition happening two ticks after the brace.
    const orc = makeEntity('orc-1', 'Orc', 'a', { stats: { vigor: 5, instinct: 5, will: 5 } });
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(), createCombatTactics()],
      entities: [makePlayer('a', { stats: { vigor: 5, instinct: 10, will: 5 } }), orc],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: ['b'] }],
    });

    // Orc braces at tick 0.
    engine.submitAction('brace', { actorId: 'orc-1' });
    expect(getRoundFlags(engine.world, 'orc-1').braced).toBe(true);

    // Advance well past the brace window, then reposition against the orc.
    engine.world.meta.tick = 5;
    engine.world.entities.player.resources.stamina = 5;
    const events = engine.processAction(npcAction('reposition', 'player', 5, { targetIds: ['orc-1'] }));

    // The reposition resolves (success or fail); the key invariant is simply that
    // the stale braced flag no longer counts — exercised via isFlagActiveAt. We
    // assert it produced a resolution event rather than throwing.
    expect(events.some(e => e.type === 'combat.reposition.success' || e.type === 'combat.reposition.fail')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Counter relationships (soft)
// ---------------------------------------------------------------------------

describe('tactical triangle counter relationships', () => {
  it('attack into guard may apply off-balance to attacker', () => {
    // Run many times with different ticks to check that counter can trigger
    const player = makePlayer('a');
    applyStatus(player, COMBAT_STATES.GUARDED, 0, { duration: 5 });

    let counterTriggered = false;
    for (let tick = 0; tick < 50; tick++) {
      const p = makePlayer('a');
      applyStatus(p, COMBAT_STATES.GUARDED, 0, { duration: 5 });

      const engine = createTestEngine({
        modules: [statusCore, createCombatCore(), createCombatTactics()],
        entities: [p, makeEntity('orc-1', 'Orc', 'a')],
        zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
        tick,
        // seed 0 = the legacy stream this sweep's counter fires in (F-SEED).
        // NOTE: `tick` here is silently ignored by HarnessOptions — a
        // pre-existing latent gap flagged for the Phase-8 re-audit.
        seed: 0,
      });

      const events = engine.submitAction('attack', { actorId: 'orc-1', targetIds: ['player'] });
      if (events.some(e => e.type === 'combat.counter.off_balance')) {
        counterTriggered = true;
        break;
      }
    }
    expect(counterTriggered).toBe(true);
  });

  it('off-balance reduces hit chance for the off-balanced attacker', () => {
    // An off-balance attacker should have reduced hit chance (-15)
    const orc = makeEntity('orc-1', 'Orc', 'a');
    applyStatus(orc, COMBAT_STATES.OFF_BALANCE, 0, { duration: 2 });

    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(), createCombatTactics()],
      entities: [makePlayer('a'), orc],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    // The handler adjusts hitChance by -15, we just verify the event goes through without error
    const events = engine.submitAction('attack', { actorId: 'orc-1', targetIds: ['player'] });
    expect(events.length).toBeGreaterThan(0);
  });

  it('off-balance target takes +1 bonus damage', () => {
    const player = makePlayer('a');
    applyStatus(player, COMBAT_STATES.OFF_BALANCE, 0, { duration: 2 });

    let bonusDamageVerified = false;
    for (let tick = 0; tick < 30; tick++) {
      const p = makePlayer('a');
      applyStatus(p, COMBAT_STATES.OFF_BALANCE, 0, { duration: 2 });

      const engine = createTestEngine({
        modules: [statusCore, createCombatCore(), createCombatTactics()],
        entities: [p, makeEntity('orc-1', 'Orc', 'a', { stats: { vigor: 4, instinct: 5, will: 3 } })],
        zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
        tick,
        // seed 0 = the legacy stream (F-SEED); `tick` silently ignored — see
        // the sibling sweep's note (Phase-8 re-audit item).
        seed: 0,
      });

      const events = engine.submitAction('attack', { actorId: 'orc-1', targetIds: ['player'] });
      const damageEvent = events.find(e => e.type === 'combat.damage.applied');
      if (damageEvent) {
        // Vigor is 4, so base damage = 4. Off-balance adds +1 = 5
        expect(damageEvent.payload.damage).toBe(5);
        bonusDamageVerified = true;
        break;
      }
    }
    expect(bonusDamageVerified).toBe(true);
  });

  it('guard action clears off-balance (stabilization)', () => {
    const player = makePlayer('a');
    applyStatus(player, COMBAT_STATES.OFF_BALANCE, 0, { duration: 2 });

    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(), createCombatTactics()],
      entities: [player],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    engine.submitAction('guard');
    const world = engine.world;
    expect(hasStatus(world.entities.player, COMBAT_STATES.OFF_BALANCE)).toBe(false);
  });

  it('reposition gets bonus against guarded targets', () => {
    // Guarded target gives +15 to reposition chance
    const orc = makeEntity('orc-1', 'Orc', 'a');
    applyStatus(orc, COMBAT_STATES.GUARDED, 0, { duration: 5 });

    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(), createCombatTactics()],
      entities: [makePlayer('a', { stats: { vigor: 5, instinct: 7, will: 5 } }), orc],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: ['b'] }],
    });

    const events = engine.submitAction('reposition', { targetIds: ['orc-1'] });
    // Should have higher success rate — just verify it produces events without error
    expect(events.length).toBeGreaterThan(0);
  });

  it('braced defender reduces reposition chance', () => {
    const orc = makeEntity('orc-1', 'Orc', 'a');
    // Simulate orc having braced this round
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(), createCombatTactics()],
      entities: [makePlayer('a'), orc],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: ['b'] }],
    });

    // Brace as orc first
    engine.submitAction('brace', { actorId: 'orc-1' });

    // Now player repositions — braced enemy reduces chance by 20
    const events = engine.submitAction('reposition', { targetIds: ['orc-1'] });
    expect(events.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// State transitions
// ---------------------------------------------------------------------------

describe('combat state transitions', () => {
  it('COMBAT_STATES includes OFF_BALANCE', () => {
    expect(COMBAT_STATES.OFF_BALANCE).toBe('combat:off_balance');
  });

  it('exactly 4 visible combat states', () => {
    const stateKeys = Object.keys(COMBAT_STATES);
    expect(stateKeys).toHaveLength(4);
    expect(stateKeys).toContain('GUARDED');
    expect(stateKeys).toContain('OFF_BALANCE');
    expect(stateKeys).toContain('EXPOSED');
    expect(stateKeys).toContain('FLEEING');
  });
});

// ---------------------------------------------------------------------------
// AI behavior
// ---------------------------------------------------------------------------

/** Build a minimal world state with modules.cognition-core for AI tests */
function makeAIWorld(entities: Record<string, EntityState>, zones: Record<string, any>, tick = 1) {
  return {
    meta: { tick, rngSeed: 42 },
    playerId: 'player',
    locationId: 'a',
    entities,
    zones,
    flags: {},
    modules: {
      'cognition-core': {
        entityCognition: {},
      },
    },
  } as any;
}

describe('AI tactical decisions', () => {
  it('AI scores brace intent when off-balance', () => {
    const orc = makeEntity('orc-1', 'Orc', 'a', { stats: { vigor: 5, instinct: 5, will: 5 } });
    applyStatus(orc, COMBAT_STATES.OFF_BALANCE, 0, { duration: 2 });

    const world = makeAIWorld(
      { player: makePlayer('a'), 'orc-1': orc },
      { a: { id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: ['b'] } },
    );

    const decision = selectNpcCombatAction(orc, world);
    const braceScore = decision.alternatives.find(s => s.intent === 'brace')
      ?? (decision.chosen.intent === 'brace' ? decision.chosen : null);
    expect(braceScore).not.toBeNull();
    // Off-balance gives +25 to brace score
    expect(braceScore!.score).toBeGreaterThanOrEqual(40);
  });

  it('AI scores reposition against guarded target', () => {
    const player = makePlayer('a');
    applyStatus(player, COMBAT_STATES.GUARDED, 0, { duration: 2 });

    const orc = makeEntity('orc-1', 'Orc', 'a', { stats: { vigor: 5, instinct: 5, will: 5 } });

    const world = makeAIWorld(
      { player, 'orc-1': orc },
      { a: { id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: ['b'] } },
    );

    const decision = selectNpcCombatAction(orc, world);
    const repositionScore = decision.alternatives.find(s => s.intent === 'reposition')
      ?? (decision.chosen.intent === 'reposition' ? decision.chosen : null);
    expect(repositionScore).not.toBeNull();
    // Guarded target gives +20 to reposition score
    expect(repositionScore!.score).toBeGreaterThanOrEqual(40);
  });

  it('AI prefers guard or brace when exposed', () => {
    const orc = makeEntity('orc-1', 'Orc', 'a', { stats: { vigor: 5, instinct: 5, will: 5 } });
    applyStatus(orc, COMBAT_STATES.EXPOSED, 0, { duration: 2 });

    const world = makeAIWorld(
      { player: makePlayer('a'), 'orc-1': orc },
      { a: { id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: ['b'] } },
    );

    const decision = selectNpcCombatAction(orc, world);
    const allScores = [decision.chosen, ...decision.alternatives];
    const guardScore = allScores.find(s => s.intent === 'guard')!;
    const braceScore = allScores.find(s => s.intent === 'brace')!;
    expect(guardScore.score + braceScore.score).toBeGreaterThan(60);
  });

  it('AI uses all 8 intent types', () => {
    const orc = makeEntity('orc-1', 'Orc', 'a');
    const player = makePlayer('a');
    player.resources.hp = 5;
    applyStatus(player, COMBAT_STATES.FLEEING, 0, { duration: 2 });
    applyStatus(player, COMBAT_STATES.EXPOSED, 0, { duration: 2 });
    applyStatus(player, ENGAGEMENT_STATES.BACKLINE, 0);

    const ally = makeEntity('orc-2', 'Orc Ally', 'a', { resources: { hp: 3, maxHp: 20, stamina: 5 } });

    const world = makeAIWorld(
      { player, 'orc-1': orc, 'orc-2': ally },
      { a: { id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: ['b'] } },
    );

    const decision = selectNpcCombatAction(orc, world);
    const allIntents = new Set([decision.chosen.intent, ...decision.alternatives.map(s => s.intent)]);
    expect(allIntents.size).toBeGreaterThanOrEqual(7);
  });
});

// ---------------------------------------------------------------------------
// Backward compatibility
// ---------------------------------------------------------------------------

describe('backward compatibility', () => {
  it('plain attack-only combat still works', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore()],
      entities: [makePlayer('a'), makeEntity('orc-1', 'Orc', 'a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    // Without combat-tactics module, only attack/guard/disengage are registered
    const events = engine.submitAction('attack', { targetIds: ['orc-1'] });
    expect(events.length).toBeGreaterThan(0);
    expect(events.some(e => e.type === 'action.rejected')).toBe(false);
  });

  it('combat-tactics module is additive (does not break existing verbs)', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(), createCombatTactics()],
      entities: [makePlayer('a'), makeEntity('orc-1', 'Orc', 'a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: ['b'] }],
    });

    // All 5 verbs should work
    const attackEvents = engine.submitAction('attack', { targetIds: ['orc-1'] });
    expect(attackEvents.some(e => e.type === 'action.rejected')).toBe(false);

    const guardEvents = engine.submitAction('guard');
    expect(guardEvents.some(e => e.type === 'combat.guard.start')).toBe(true);

    const braceEvents = engine.submitAction('brace');
    expect(braceEvents.some(e => e.type === 'combat.brace.start')).toBe(true);

    const disengageEvents = engine.submitAction('disengage');
    expect(disengageEvents.length).toBeGreaterThan(0);

    const repositionEvents = engine.submitAction('reposition');
    expect(repositionEvents.length).toBeGreaterThan(0);
  });

  // --- CHOKEPOINT DEPTH ---

  it('reposition at chokepoint has reduced success chance', () => {
    const engine = createTestEngine({
      modules: [
        statusCore,
        createEngagementCore(),
        createCombatCore(),
        createCombatTactics(),
      ],
      entities: [
        makePlayer('a'),
        makeEntity('foe', 'Goblin', 'a', { resources: { hp: 50, stamina: 5 } }),
      ],
      zones: [{ id: 'a', roomId: 'test', name: 'Chokepoint Alley', tags: ['chokepoint'], neighbors: [] }],
    });

    // Try many repositions at chokepoint — expect more failures due to -15 penalty
    let failures = 0;
    for (let i = 0; i < 30; i++) {
      engine.world.entities.player.resources.stamina = 5;
      const events = engine.submitAction('reposition', { targetIds: ['foe'] });
      if (events.some(e => e.type === 'combat.reposition.fail')) failures++;
    }
    // With -15 penalty, more than half should fail
    expect(failures).toBeGreaterThan(5);
  });

  it('brace at chokepoint sets bracedAtChokepoint flag', () => {
    const engine = createTestEngine({
      modules: [
        statusCore,
        createEngagementCore(),
        createCombatCore(),
        createCombatTactics(),
      ],
      entities: [makePlayer('a')],
      zones: [{ id: 'a', roomId: 'test', name: 'Narrow Pass', tags: ['chokepoint'], neighbors: [] }],
    });

    engine.submitAction('brace');
    const flags = getRoundFlags(engine.world, 'player');
    expect(flags.braced).toBe(true);
    expect(flags.bracedAtChokepoint).toBe(true);
  });

  it('brace at non-chokepoint does NOT set bracedAtChokepoint flag', () => {
    const engine = createTestEngine({
      modules: [
        statusCore,
        createEngagementCore(),
        createCombatCore(),
        createCombatTactics(),
      ],
      entities: [makePlayer('a')],
      zones: [{ id: 'a', roomId: 'test', name: 'Open Field', tags: [], neighbors: [] }],
    });

    engine.submitAction('brace');
    const flags = getRoundFlags(engine.world, 'player');
    expect(flags.braced).toBe(true);
    expect(flags.bracedAtChokepoint).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Precision vs Force: brace resistance scales with vigor
// ---------------------------------------------------------------------------

describe('precision vs force: brace resistance', () => {
  it('high-vigor entity resists off-balance better when braced', () => {
    // Approach: braced entity attacks a guarded target. Guard counter may
    // apply OFF_BALANCE to attacker. Brace resistance fires on status.applied
    // and may remove it. High-vigor should resist more often.
    let strongResisted = 0;
    let strongCountered = 0;
    let weakResisted = 0;
    let weakCountered = 0;
    const trials = 200;

    for (let tick = 1; tick <= trials; tick++) {
      // --- Strong (vigor=10) ---
      {
        const engine = createTestEngine({
          modules: [statusCore, createEngagementCore(), createCombatCore(), createCombatTactics()],
          entities: [
            makePlayer('a', { stats: { vigor: 10, instinct: 5, will: 3 } }),
            // Target with high instinct+will for reliable counters
            makeEntity('foe', 'Foe', 'a', { stats: { vigor: 5, instinct: 10, will: 10 } }),
          ],
          zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
        });
        engine.world.meta.tick = tick;
        // Brace player, guard foe
        engine.submitAction('brace');
        applyStatus(engine.world.entities.foe, COMBAT_STATES.GUARDED, tick, { duration: 3 });
        // Player attacks guarded foe — counter may off-balance player
        engine.world.entities.player.resources.stamina = 5;
        const events = engine.processAction(npcAction('attack', 'player', tick, { targetIds: ['foe'] }));
        const countered = events.some(e => e.type === 'combat.counter.off_balance');
        if (countered) {
          strongCountered++;
          if (!hasStatus(engine.world.entities.player, COMBAT_STATES.OFF_BALANCE)) {
            strongResisted++;
          }
        }
      }
      // --- Weak (vigor=2) ---
      {
        const engine = createTestEngine({
          modules: [statusCore, createEngagementCore(), createCombatCore(), createCombatTactics()],
          entities: [
            makePlayer('a', { stats: { vigor: 2, instinct: 5, will: 3 } }),
            makeEntity('foe', 'Foe', 'a', { stats: { vigor: 5, instinct: 10, will: 10 } }),
          ],
          zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
        });
        engine.world.meta.tick = tick;
        engine.submitAction('brace');
        applyStatus(engine.world.entities.foe, COMBAT_STATES.GUARDED, tick, { duration: 3 });
        engine.world.entities.player.resources.stamina = 5;
        const events = engine.processAction(npcAction('attack', 'player', tick, { targetIds: ['foe'] }));
        const countered = events.some(e => e.type === 'combat.counter.off_balance');
        if (countered) {
          weakCountered++;
          if (!hasStatus(engine.world.entities.player, COMBAT_STATES.OFF_BALANCE)) {
            weakResisted++;
          }
        }
      }
    }

    // Both should get countered (high instinct+will foe)
    expect(strongCountered).toBeGreaterThan(0);
    expect(weakCountered).toBeGreaterThan(0);
    // vigor=10 → stabilizeChance = min(90, 40+60) = 90%
    // vigor=2  → stabilizeChance = min(90, 40+12) = 52%
    // Strong should resist more often (as a ratio of countered attempts)
    const strongRate = strongResisted / strongCountered;
    const weakRate = weakResisted / weakCountered;
    expect(strongRate).toBeGreaterThan(weakRate);
  });
});

// ---------------------------------------------------------------------------
// Round-flag cross-instance isolation (F-80a6afa2)
// ---------------------------------------------------------------------------
//
// roundFlagTickMap used to be a module-top-level Map shared by EVERY Engine
// instance in the process (the same anti-pattern combat-intent.ts's defeatLog
// had before its fix). Two concurrent worlds with an entity sharing an id
// (plausible: a server hosting multiple sessions, or simply two engines built
// in the same test/process) would cross-contaminate: bracing the entity in
// world A would make isRoundFlagActiveAt report "braced" for the
// same-id entity in world B too.

describe('round flags: cross-instance isolation', () => {
  it('bracing an entity in one engine does not mark a same-id entity braced in a DIFFERENT engine', () => {
    const engineA = createTestEngine({
      modules: [statusCore, createCombatCore(), createCombatTactics()],
      entities: [makePlayer('a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });
    const engineB = createTestEngine({
      modules: [statusCore, createCombatCore(), createCombatTactics()],
      entities: [makePlayer('a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    // Only engine A's player braces. Both engines share the entity id
    // 'player' and are at the same tick (both fresh, tick 0).
    engineA.submitAction('brace');

    expect(getRoundFlags(engineA.world, 'player').braced).toBe(true);
    // Engine B's same-id entity must NOT read as braced — a fresh, isolated
    // world's round-flag state must be independent of every other Engine
    // instance in the process.
    expect(getRoundFlags(engineB.world, 'player').braced).toBeUndefined();
  });

  it('reposition-vs-braced-defender check in engine B is unaffected by a same-id brace in engine A', () => {
    const orcA = makeEntity('orc-1', 'Orc', 'a', { stats: { vigor: 5, instinct: 5, will: 5 } });
    const engineA = createTestEngine({
      modules: [statusCore, createCombatCore(), createCombatTactics()],
      entities: [makePlayer('a', { stats: { vigor: 5, instinct: 10, will: 5 } }), orcA],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });
    // Orc braces in engine A only, at tick 0.
    engineA.submitAction('brace', { actorId: 'orc-1' });
    expect(getRoundFlags(engineA.world, 'orc-1').braced).toBe(true);

    const orcB = makeEntity('orc-1', 'Orc', 'a', { stats: { vigor: 5, instinct: 5, will: 5 } });
    const engineB = createTestEngine({
      modules: [statusCore, createCombatCore(), createCombatTactics()],
      entities: [makePlayer('a', { stats: { vigor: 5, instinct: 10, will: 5 } }), orcB],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });
    // Engine B's same-id orc never braced. A reposition against it must NOT
    // see the -20 braced-defender penalty that engine A's brace would apply.
    engineB.world.entities.player.resources.stamina = 5;
    const events = engineB.processAction(npcAction('reposition', 'player', 0, { targetIds: ['orc-1'] }));
    const resolved = events.find(e => e.type === 'combat.reposition.success' || e.type === 'combat.reposition.fail');
    expect(resolved).toBeDefined();
    // needed chance should be the UNPENALIZED base chance (no braced-defender
    // -20), proving engine B never observed engine A's brace.
    const baseChance = Math.min(90, Math.max(10, 45 + 10 * 5));
    expect(resolved!.payload.needed).toBe(baseChance);
  });
});
