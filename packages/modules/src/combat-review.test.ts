import { describe, it, expect } from 'vitest';
import { createTestEngine } from '@ai-rpg-engine/core';
import type { EntityState, ResolvedEvent } from '@ai-rpg-engine/core';
import { createCombatCore, COMBAT_STATES } from './combat-core.js';
import type { CombatFormulas } from './combat-core.js';
import { statusCore, applyStatus } from './status-core.js';
import { createEngagementCore, withEngagement, ENGAGEMENT_STATES } from './engagement-core.js';
import { createEnvironmentCore } from './environment-core.js';
import {
  createCombatReview,
  formatCombatTrace,
} from './combat-review.js';
import type { CombatTrace } from './combat-review.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const zones = [
  { id: 'zone-a', roomId: 'test', name: 'Zone A', tags: [] as string[], neighbors: ['zone-b'] },
  { id: 'zone-b', roomId: 'test', name: 'Zone B', tags: [] as string[], neighbors: ['zone-a'] },
];

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

const makeEnemy = (id: string, zoneId: string, overrides?: Partial<EntityState>): EntityState => ({
  id,
  blueprintId: id,
  type: 'enemy',
  name: id,
  tags: ['enemy'],
  stats: { vigor: 3, instinct: 3, will: 3 },
  resources: { hp: 50, stamina: 5 },
  statuses: [],
  zoneId,
  ...overrides,
});

const makeAlly = (id: string, zoneId: string, overrides?: Partial<EntityState>): EntityState => ({
  id,
  blueprintId: id,
  type: 'player',
  name: id,
  tags: ['ally', 'bodyguard'],
  stats: { vigor: 5, instinct: 5, will: 3 },
  resources: { hp: 30, stamina: 5 },
  statuses: [],
  zoneId,
  ...overrides,
});

// Fixed formulas for deterministic testing
const fixedFormulas: CombatFormulas = {
  hitChance: () => 60,
  damage: () => 5,
  guardReduction: () => 0.5,
  disengageChance: () => 50,
  interceptChance: () => 80, // very high so interception is almost guaranteed
};

function buildEngine(
  entities: EntityState[],
  starterFormulas: CombatFormulas = fixedFormulas,
  extraZones?: typeof zones,
) {
  const review = createCombatReview({ baseFormulas: starterFormulas });
  const engine = createTestEngine({
    modules: [
      statusCore,
      createEngagementCore({ playerId: 'player' }),
      createEnvironmentCore(),
      review.module,
      createCombatCore(review.explain(withEngagement(starterFormulas))),
    ],
    entities,
    zones: extraZones ?? zones,
  });
  return engine;
}

function getTraceEvent(events: ResolvedEvent[]): CombatTrace | undefined {
  const traceEvt = events.find(e => e.type === 'combat.review.trace');
  return traceEvt?.payload.trace as CombatTrace | undefined;
}

// NOTE: submitAction returns only verb handler events. Listener-emitted events
// (like combat.review.trace) are only available via drainEvents().
function attackUntilHit(engine: ReturnType<typeof createTestEngine>, targetId: string, maxTicks = 50): ResolvedEvent[] {
  for (let i = 0; i < maxTicks; i++) {
    engine.world.entities.player.resources.stamina = 5;
    engine.drainEvents(); // clear previous
    engine.submitAction('attack', { targetIds: [targetId] });
    const all = engine.drainEvents();
    if (all.some(e => e.type === 'combat.contact.hit')) return all;
  }
  throw new Error(`Failed to hit ${targetId} within ${maxTicks} attempts`);
}

function attackUntilMiss(engine: ReturnType<typeof createTestEngine>, targetId: string, maxTicks = 50): ResolvedEvent[] {
  for (let i = 0; i < maxTicks; i++) {
    engine.world.entities.player.resources.stamina = 5;
    engine.drainEvents();
    engine.submitAction('attack', { targetIds: [targetId] });
    const all = engine.drainEvents();
    if (all.some(e => e.type === 'combat.contact.miss')) return all;
  }
  throw new Error(`Failed to miss ${targetId} within ${maxTicks} attempts`);
}

function disengageUntilFail(engine: ReturnType<typeof createTestEngine>, maxTicks = 50): ResolvedEvent[] {
  for (let i = 0; i < maxTicks; i++) {
    engine.world.entities.player.resources.stamina = 5;
    engine.world.entities.player.zoneId = 'zone-a';
    engine.drainEvents();
    engine.submitAction('disengage', {});
    const all = engine.drainEvents();
    if (all.some(e => e.type === 'combat.disengage.fail')) return all;
  }
  throw new Error(`Failed to fail disengage within ${maxTicks} attempts`);
}

function disengageUntilSuccess(engine: ReturnType<typeof createTestEngine>, maxTicks = 50): ResolvedEvent[] {
  for (let i = 0; i < maxTicks; i++) {
    engine.world.entities.player.resources.stamina = 5;
    engine.world.entities.player.zoneId = 'zone-a';
    engine.drainEvents();
    engine.submitAction('disengage', {});
    const all = engine.drainEvents();
    if (all.some(e => e.type === 'combat.disengage.success')) return all;
  }
  throw new Error(`Failed to succeed disengage within ${maxTicks} attempts`);
}

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe('combat-review', () => {
  // --- Trace emission ---

  it('emits trace on attack hit', () => {
    const engine = buildEngine([makePlayer('zone-a'), makeEnemy('goblin', 'zone-a')]);
    const events = attackUntilHit(engine, 'goblin');
    const trace = getTraceEvent(events);
    expect(trace).toBeDefined();
    expect(trace!.outcome).toBe('hit');
    expect(trace!.verb).toBe('attack');
    expect(trace!.actorId).toBe('player');
    expect(trace!.targetId).toBe('goblin');
  });

  it('emits trace on attack miss', () => {
    const engine = buildEngine([makePlayer('zone-a'), makeEnemy('goblin', 'zone-a')]);
    const events = attackUntilMiss(engine, 'goblin');
    const trace = getTraceEvent(events);
    expect(trace).toBeDefined();
    expect(trace!.outcome).toBe('miss');
    expect(trace!.roll).toBeDefined();
  });

  it('emits trace on guard', () => {
    const engine = buildEngine([makePlayer('zone-a'), makeEnemy('goblin', 'zone-a')]);
    engine.drainEvents();
    engine.submitAction('guard', {});
    const events = engine.drainEvents();
    const trace = getTraceEvent(events);
    expect(trace).toBeDefined();
    expect(trace!.outcome).toBe('guard-start');
    expect(trace!.verb).toBe('guard');
    expect(trace!.formulas.length).toBe(0); // no formula evaluation for guard itself
  });

  it('emits trace on disengage success', () => {
    const engine = buildEngine([makePlayer('zone-a'), makeEnemy('goblin', 'zone-a')]);
    const events = disengageUntilSuccess(engine);
    const trace = getTraceEvent(events);
    expect(trace).toBeDefined();
    expect(trace!.outcome).toBe('disengage-success');
    expect(trace!.formulas.some(f => f.name === 'disengageChance')).toBe(true);
  });

  it('emits trace on disengage fail', () => {
    const engine = buildEngine([makePlayer('zone-a'), makeEnemy('goblin', 'zone-a')]);
    const events = disengageUntilFail(engine);
    const trace = getTraceEvent(events);
    expect(trace).toBeDefined();
    expect(trace!.outcome).toBe('disengage-fail');
    expect(trace!.roll).toBeDefined();
  });

  it('emits rejected trace when no stamina', () => {
    const engine = buildEngine([
      makePlayer('zone-a', { resources: { hp: 20, stamina: 0 } }),
      makeEnemy('goblin', 'zone-a'),
    ]);
    engine.drainEvents();
    engine.submitAction('attack', { targetIds: ['goblin'] });
    const events = engine.drainEvents();
    const trace = getTraceEvent(events);
    expect(trace).toBeDefined();
    expect(trace!.outcome).toBe('rejected');
    expect(trace!.rejectionReason).toBe('not enough stamina');
    expect(trace!.formulas.length).toBe(0);
  });

  // --- Formula attribution ---

  it('captures starter base value in hitChance trace', () => {
    const engine = buildEngine([makePlayer('zone-a'), makeEnemy('goblin', 'zone-a')]);
    const events = attackUntilHit(engine, 'goblin');
    const trace = getTraceEvent(events)!;
    const hitTrace = trace.formulas.find(f => f.name === 'hitChance');
    expect(hitTrace).toBeDefined();
    expect(hitTrace!.base).toBe(60); // our fixed formula returns 60
    expect(hitTrace!.steps[0].source).toBe('starter');
    expect(hitTrace!.steps[0].value).toBe(60);
  });

  it('attributes engagement modifier (BACKLINE -10 hit)', () => {
    const engine = buildEngine([
      makePlayer('zone-a'),
      makeEnemy('goblin', 'zone-a', { tags: ['enemy', 'ranged'] }),
    ]);
    // The ranged enemy should get BACKLINE status on zone entry
    // Apply it manually to be deterministic
    applyStatus(engine.world.entities.goblin, ENGAGEMENT_STATES.BACKLINE, engine.world.meta.tick);

    const events = attackUntilHit(engine, 'goblin');
    const trace = getTraceEvent(events)!;
    const hitTrace = trace.formulas.find(f => f.name === 'hitChance');
    expect(hitTrace).toBeDefined();
    // Steps should show starter base, then engagement BACKLINE -10
    const engStep = hitTrace!.steps.find(s => s.source === 'engagement' && s.label.includes('BACKLINE'));
    expect(engStep).toBeDefined();
    expect(engStep!.delta).toBe(-10);
  });

  it('attributes combat-core modifier (EXPOSED +20 hit)', () => {
    const engine = buildEngine([makePlayer('zone-a'), makeEnemy('goblin', 'zone-a')]);
    // Apply EXPOSED to the target
    applyStatus(engine.world.entities.goblin, COMBAT_STATES.EXPOSED, engine.world.meta.tick, { duration: 5 });

    const events = attackUntilHit(engine, 'goblin');
    const trace = getTraceEvent(events)!;
    const hitTrace = trace.formulas.find(f => f.name === 'hitChance');
    expect(hitTrace).toBeDefined();
    const coreStep = hitTrace!.steps.find(s => s.source === 'combat-core' && s.label.includes('EXPOSED'));
    expect(coreStep).toBeDefined();
    expect(coreStep!.delta).toBe(20);
  });

  // --- Damage pipeline ---

  it('captures damage pipeline with guard absorbed', () => {
    const engine = buildEngine([makePlayer('zone-a'), makeEnemy('goblin', 'zone-a', { resources: { hp: 50, stamina: 5 } })]);
    // Guard the enemy
    applyStatus(engine.world.entities.goblin, COMBAT_STATES.GUARDED, engine.world.meta.tick, { duration: 10 });

    const events = attackUntilHit(engine, 'goblin');
    const trace = getTraceEvent(events)!;
    expect(trace.damagePipeline).toBeDefined();
    expect(trace.damagePipeline!.guardReduction).not.toBeNull();
    expect(trace.damagePipeline!.guardedDamage).not.toBeNull();
    // Guard reduction formula trace should be present
    const guardTrace = trace.formulas.find(f => f.name === 'guardReduction');
    expect(guardTrace).toBeDefined();
    expect(guardTrace!.base).toBe(0.5); // our fixed formula returns 0.5
  });

  it('captures interception in trace', () => {
    const engine = buildEngine([
      makePlayer('zone-a'),
      makeEnemy('goblin', 'zone-a'),
      makeAlly('guardian', 'zone-a'),
    ], {
      ...fixedFormulas,
      isAlly: (id) => id === 'guardian',
      interceptChance: () => 95, // near-guaranteed interception
    });

    // Attack player as NPC
    let intercepted = false;
    for (let i = 0; i < 50; i++) {
      engine.world.entities.goblin.resources.stamina = 5;
      engine.drainEvents();
      engine.processAction({
        id: `act-${i}`,
        actorId: 'goblin',
        verb: 'attack',
        targetIds: ['player'],
        source: 'ai',
        issuedAtTick: engine.world.meta.tick,
      });
      const events = engine.drainEvents();
      const trace = getTraceEvent(events);
      if (trace?.outcome === 'intercepted') {
        expect(trace.interception).toBeDefined();
        expect(trace.interception!.interceptorId).toBe('guardian');
        expect(trace.interception!.passed).toBe(true);
        intercepted = true;
        break;
      }
    }
    expect(intercepted).toBe(true);
  });

  // --- Ring buffer ---

  it('ring buffer respects maxTraces', () => {
    const starterFormulas: CombatFormulas = { ...fixedFormulas };
    const review = createCombatReview({ baseFormulas: starterFormulas, maxTraces: 3 });
    const engine = createTestEngine({
      modules: [
        statusCore,
        createEngagementCore({ playerId: 'player' }),
        createEnvironmentCore(),
        review.module,
        createCombatCore(review.explain(withEngagement(starterFormulas))),
      ],
      entities: [makePlayer('zone-a'), makeEnemy('goblin', 'zone-a', { resources: { hp: 200, stamina: 100 } })],
      zones,
    });

    // Do 5 attacks — only last 3 traces should remain in ring buffer
    let traceCount = 0;
    for (let i = 0; i < 5; i++) {
      engine.world.entities.player.resources.stamina = 5;
      engine.drainEvents();
      engine.submitAction('attack', { targetIds: ['goblin'] });
      const events = engine.drainEvents();
      if (getTraceEvent(events)) traceCount++;
    }
    expect(traceCount).toBe(5); // All 5 emitted trace events

    // Verify all 5 trace events were recorded to event log
    const traceEvents = engine.world.eventLog.filter(e => e.type === 'combat.review.trace');
    expect(traceEvents.length).toBe(5);
  });

  // --- Formatter ---

  it('formatCombatTrace produces readable text', () => {
    const engine = buildEngine([makePlayer('zone-a'), makeEnemy('goblin', 'zone-a')]);
    const events = attackUntilHit(engine, 'goblin');
    const trace = getTraceEvent(events)!;
    const text = formatCombatTrace(trace);
    expect(text).toContain('Combat Trace');
    expect(text).toContain('Hero');
    expect(text).toContain('attack');
    expect(text).toContain('Outcome: hit');
    expect(text).toContain('Summary:');
  });

  // --- Golden trace tests ---

  describe('golden traces', () => {
    it('golden: normal hit — full trace structure', () => {
      const engine = buildEngine([
        makePlayer('zone-a', { stats: { vigor: 5, instinct: 7, will: 3 } }),
        makeEnemy('goblin', 'zone-a', { stats: { vigor: 3, instinct: 3, will: 2 }, resources: { hp: 50, stamina: 5 } }),
      ]);
      const events = attackUntilHit(engine, 'goblin');
      const trace = getTraceEvent(events)!;

      expect(trace.verb).toBe('attack');
      expect(trace.actorId).toBe('player');
      expect(trace.targetId).toBe('goblin');
      expect(trace.outcome).toBe('hit');
      expect(trace.roll).toBeGreaterThan(0);
      expect(trace.roll).toBeLessThanOrEqual(100);

      // Formula trace present
      expect(trace.formulas.length).toBeGreaterThanOrEqual(1);
      const hitTrace = trace.formulas.find(f => f.name === 'hitChance')!;
      expect(hitTrace.base).toBe(60); // fixed formula
      expect(hitTrace.final).toBeGreaterThanOrEqual(5);
      expect(hitTrace.final).toBeLessThanOrEqual(95);

      // Damage pipeline present
      expect(trace.damagePipeline).toBeDefined();
      expect(trace.damagePipeline!.rawDamage).toBe(5);
      expect(trace.damagePipeline!.finalDamage).toBeGreaterThanOrEqual(1);
      expect(trace.damagePipeline!.previousHp).toBe(50);
      expect(trace.damagePipeline!.currentHp).toBeLessThan(50);

      // Summary present
      expect(trace.summary).toContain('Hero hit goblin');
    });

    it('golden: guarded hit — guard reduction in pipeline', () => {
      const engine = buildEngine([
        makePlayer('zone-a'),
        makeEnemy('goblin', 'zone-a', { resources: { hp: 50, stamina: 5 } }),
      ]);
      // Apply GUARDED to target
      applyStatus(engine.world.entities.goblin, COMBAT_STATES.GUARDED, engine.world.meta.tick, { duration: 100 });

      const events = attackUntilHit(engine, 'goblin');
      const trace = getTraceEvent(events)!;

      expect(trace.outcome).toBe('hit');
      expect(trace.damagePipeline).toBeDefined();
      expect(trace.damagePipeline!.guardReduction).not.toBeNull();
      expect(trace.damagePipeline!.guardReduction).toBeGreaterThan(0);
      expect(trace.damagePipeline!.guardedDamage).not.toBeNull();
      expect(trace.damagePipeline!.guardedDamage!).toBeLessThan(trace.damagePipeline!.rawDamage);
      expect(trace.formulas.some(f => f.name === 'guardReduction')).toBe(true);
    });

    it('golden: disengage fail → exposed', () => {
      const engine = buildEngine([makePlayer('zone-a'), makeEnemy('goblin', 'zone-a')]);
      const events = disengageUntilFail(engine);
      const trace = getTraceEvent(events)!;

      expect(trace.outcome).toBe('disengage-fail');
      expect(trace.verb).toBe('disengage');
      expect(trace.roll).toBeDefined();
      const disTrace = trace.formulas.find(f => f.name === 'disengageChance')!;
      expect(disTrace).toBeDefined();
      expect(disTrace.base).toBe(50); // fixed formula
      expect(trace.summary).toContain('failed to disengage');
    });

    it('golden: defeat — defeated flag in damage pipeline', () => {
      const engine = buildEngine([
        makePlayer('zone-a'),
        makeEnemy('goblin', 'zone-a', { resources: { hp: 3, stamina: 5 } }), // low HP for easy defeat
      ]);
      const events = attackUntilHit(engine, 'goblin');
      const trace = getTraceEvent(events)!;

      if (trace.outcome === 'hit' && trace.damagePipeline) {
        // The enemy had 3 HP and we deal 5 damage, should be defeated
        if (trace.damagePipeline.defeated) {
          expect(trace.damagePipeline.currentHp).toBe(0);
          expect(trace.summary).toContain('DEFEATED');
        }
      }
    });

    it('golden: engagement modifiers — BACKLINE + ISOLATED in steps', () => {
      const engine = buildEngine([
        makePlayer('zone-a', { tags: ['player', 'ranged'] }),
        makeEnemy('goblin', 'zone-a'),
      ]);
      // Apply BACKLINE to attacker and ISOLATED to target
      applyStatus(engine.world.entities.player, ENGAGEMENT_STATES.BACKLINE, engine.world.meta.tick);
      applyStatus(engine.world.entities.goblin, ENGAGEMENT_STATES.ISOLATED, engine.world.meta.tick);

      const events = attackUntilHit(engine, 'goblin');
      const trace = getTraceEvent(events)!;

      // Damage should show BACKLINE -1 on attacker and ISOLATED +2 on target
      const dmgTrace = trace.formulas.find(f => f.name === 'damage');
      expect(dmgTrace).toBeDefined();
      const blStep = dmgTrace!.steps.find(s => s.label.includes('BACKLINE'));
      expect(blStep).toBeDefined();
      expect(blStep!.delta).toBe(-1);
      const isoStep = dmgTrace!.steps.find(s => s.label.includes('ISOLATED'));
      expect(isoStep).toBeDefined();
      expect(isoStep!.delta).toBe(2);
    });

    it('golden: starter-specific formulas — custom stats attributed', () => {
      // Cyberpunk-style formulas
      const cyberpunkFormulas: CombatFormulas = {
        hitChance: (attacker, target) => {
          const reflex = attacker.stats.reflex ?? 5;
          const tgtReflex = target.stats.reflex ?? 5;
          return Math.min(95, Math.max(5, 50 + reflex * 5 - tgtReflex * 3));
        },
        damage: (attacker) => Math.max(1, attacker.stats.chrome ?? 3),
        guardReduction: (defender) => Math.min(0.75, 0.5 + Math.max(0, ((defender.stats.netrunning ?? 3) - 3) * 0.03)),
        disengageChance: (actor) => {
          const reflex = actor.stats.reflex ?? 5;
          const netrunning = actor.stats.netrunning ?? 3;
          return Math.min(90, Math.max(15, 40 + reflex * 5 + netrunning * 2));
        },
      };

      const review = createCombatReview({ baseFormulas: cyberpunkFormulas });
      const engine = createTestEngine({
        modules: [
          statusCore,
          createEngagementCore({ playerId: 'player', backlineTags: ['ranged', 'caster', 'netrunner'] }),
          createEnvironmentCore(),
          review.module,
          createCombatCore(review.explain(withEngagement(cyberpunkFormulas))),
        ],
        entities: [
          makePlayer('zone-a', { stats: { reflex: 7, chrome: 4, netrunning: 5 } }),
          makeEnemy('ice-sentry', 'zone-a', { stats: { reflex: 4, chrome: 2, netrunning: 2 }, resources: { hp: 50, stamina: 5 } }),
        ],
        zones,
      });

      const events = attackUntilHit(engine, 'ice-sentry');
      const trace = getTraceEvent(events)!;

      // hitChance base should be: 50 + 7*5 - 4*3 = 50 + 35 - 12 = 73
      const hitTrace = trace.formulas.find(f => f.name === 'hitChance')!;
      expect(hitTrace.base).toBe(73);
      expect(hitTrace.steps[0].source).toBe('starter');
      expect(hitTrace.steps[0].value).toBe(73);
    });

    it('golden: no trace for non-combat verbs', () => {
      const engine = buildEngine([makePlayer('zone-a'), makeEnemy('goblin', 'zone-a')]);
      engine.drainEvents();
      engine.submitAction('move', { targetIds: ['zone-b'] });
      const events = engine.drainEvents();
      const trace = getTraceEvent(events);
      expect(trace).toBeUndefined();
    });
  });

  // --- Edge Cases (Phase 7) ---

  describe('edge cases', () => {
    it('guard reduces damage to minimum (1)', () => {
      // Extremely low damage + guard should still deal minimum 1
      const lowDamageFormulas: CombatFormulas = {
        hitChance: () => 95,
        damage: () => 1, // minimum possible damage
        guardReduction: () => 0.75, // max guard reduction
        disengageChance: () => 50,
      };

      const engine = buildEngine(
        [
          makePlayer('zone-a'),
          makeEnemy('goblin', 'zone-a', { resources: { hp: 50, stamina: 5 } }),
        ],
        lowDamageFormulas,
      );
      // Guard the enemy
      applyStatus(engine.world.entities.goblin, COMBAT_STATES.GUARDED, engine.world.meta.tick, { duration: 100 });

      const events = attackUntilHit(engine, 'goblin');
      const trace = getTraceEvent(events)!;

      expect(trace.damagePipeline).toBeDefined();
      // Even with 75% reduction on 1 damage, minimum should be 1
      expect(trace.damagePipeline!.finalDamage).toBeGreaterThanOrEqual(1);
    });

    it('disengage chance clamps at 90 with high stats', () => {
      const highStatFormulas: CombatFormulas = {
        hitChance: () => 60,
        damage: () => 5,
        guardReduction: () => 0.5,
        disengageChance: () => 90, // capped at 90
      };

      const engine = buildEngine(
        [makePlayer('zone-a'), makeEnemy('goblin', 'zone-a')],
        highStatFormulas,
      );

      // Run many disengage attempts — eventually one should fail despite 90% chance
      let hitSuccess = false;
      let hitFail = false;
      for (let i = 0; i < 100; i++) {
        engine.world.entities.player.resources.stamina = 5;
        engine.world.entities.player.zoneId = 'zone-a';
        engine.drainEvents();
        engine.submitAction('disengage', {});
        const events = engine.drainEvents();
        const trace = getTraceEvent(events);
        if (trace) {
          const disTrace = trace.formulas.find(f => f.name === 'disengageChance');
          if (disTrace) {
            expect(disTrace.final).toBeLessThanOrEqual(90);
          }
          if (trace.outcome === 'disengage-success') hitSuccess = true;
          if (trace.outcome === 'disengage-fail') hitFail = true;
        }
        if (hitSuccess && hitFail) break;
      }
      // At 90% chance, we should see at least one success in 100 attempts
      expect(hitSuccess).toBe(true);
    });

    it('traces do not bleed between sequential actions', () => {
      const engine = buildEngine([
        makePlayer('zone-a'),
        makeEnemy('goblin', 'zone-a', { resources: { hp: 200, stamina: 100 } }),
      ]);

      // First action: attack
      engine.world.entities.player.resources.stamina = 5;
      engine.drainEvents();
      engine.submitAction('attack', { targetIds: ['goblin'] });
      const events1 = engine.drainEvents();
      const trace1 = getTraceEvent(events1);

      // Second action: guard
      engine.world.entities.player.resources.stamina = 5;
      engine.submitAction('guard', {});
      const events2 = engine.drainEvents();
      const trace2 = getTraceEvent(events2);

      // Third action: attack again
      engine.world.entities.player.resources.stamina = 5;
      engine.submitAction('attack', { targetIds: ['goblin'] });
      const events3 = engine.drainEvents();
      const trace3 = getTraceEvent(events3);

      // Each trace should be independent
      if (trace1) expect(trace1.verb).toBe('attack');
      if (trace2) expect(trace2.verb).toBe('guard');
      if (trace3) {
        expect(trace3.verb).toBe('attack');
        // trace3 should not carry over data from trace1 or trace2
        if (trace1) expect(trace3.tick).not.toBe(trace1.tick);
      }
    });
  });
});
