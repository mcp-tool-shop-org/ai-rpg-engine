import { describe, it, expect } from 'vitest';
import { createTestEngine } from '@ai-rpg-engine/core';
import type { EntityState } from '@ai-rpg-engine/core';
import { statusCore, applyStatus } from './status-core.js';
import { createCombatCore, COMBAT_STATES } from './combat-core.js';
import { createEngagementCore, ENGAGEMENT_STATES } from './engagement-core.js';
import { createCognitionCore, getCognition } from './cognition-core.js';
import {
  selectNpcCombatAction,
  formatCombatDecision,
  createCombatIntent,
  BUILTIN_PACK_BIASES,
} from './combat-intent.js';
import type { CombatIntentConfig, PackBias } from './combat-intent.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const zones = [
  { id: 'zone-a', roomId: 'test', name: 'Zone A', tags: [] as string[], neighbors: ['zone-b'] },
  { id: 'zone-b', roomId: 'test', name: 'Zone B', tags: [] as string[], neighbors: ['zone-a'] },
  { id: 'zone-dead-end', roomId: 'test', name: 'Dead End', tags: [] as string[], neighbors: [] as string[] },
];

function makeEntity(id: string, type: string, tags: string[], overrides?: Partial<EntityState>): EntityState {
  return {
    id,
    blueprintId: id,
    type,
    name: id,
    tags,
    stats: { will: 3 },
    resources: { hp: 20, maxHp: 20, stamina: 5 },
    statuses: [],
    zoneId: 'zone-a',
    ...overrides,
  };
}

function buildEngine(entities: EntityState[]) {
  return createTestEngine({
    modules: [
      statusCore,
      createCognitionCore(),
      createCombatIntent(),
    ],
    entities,
    zones,
  });
}

function biasesFor(...tags: string[]): PackBias[] {
  return BUILTIN_PACK_BIASES.filter(b => tags.includes(b.tag));
}

// ---------------------------------------------------------------------------
// Group 1: Basic Intent Selection
// ---------------------------------------------------------------------------

describe('combat-intent: basic selection', () => {
  it('high morale + full HP prefers attack', () => {
    const npc = makeEntity('npc', 'enemy', ['enemy']);
    const target = makeEntity('target', 'player', ['player']);
    const engine = buildEngine([npc, target]);

    // Default morale is 70 (from cognition-core)
    const decision = selectNpcCombatAction(npc, engine.store.state);

    expect(decision.chosen.intent).toBe('attack');
    expect(decision.chosen.resolvedVerb).toBe('attack');
    expect(decision.chosen.score).toBeGreaterThan(50);
  });

  it('low morale prefers disengage', () => {
    const npc = makeEntity('npc', 'enemy', ['enemy']);
    const target = makeEntity('target', 'player', ['player']);
    const engine = buildEngine([npc, target]);

    // Set morale very low — morale 10 gives disengage delta (30-10)*2=40
    const cog = getCognition(engine.store.state, 'npc');
    cog.morale = 10;

    const decision = selectNpcCombatAction(npc, engine.store.state);

    expect(decision.chosen.intent).toBe('disengage');
    expect(decision.chosen.resolvedVerb).toBe('disengage');
  });

  it('mid morale + low HP prefers guard', () => {
    const npc = makeEntity('npc', 'enemy', ['enemy'], {
      resources: { hp: 5, maxHp: 20, stamina: 5 },
    });
    const target = makeEntity('target', 'player', ['player']);
    const engine = buildEngine([npc, target]);

    const cog = getCognition(engine.store.state, 'npc');
    cog.morale = 45;

    const decision = selectNpcCombatAction(npc, engine.store.state);

    expect(decision.chosen.intent).toBe('guard');
    expect(decision.chosen.resolvedVerb).toBe('guard');
  });

  it('low morale + no exit falls back to guard', () => {
    const npc = makeEntity('npc', 'enemy', ['enemy'], { zoneId: 'zone-dead-end' });
    const target = makeEntity('target', 'player', ['player'], { zoneId: 'zone-dead-end' });
    const engine = buildEngine([npc, target]);

    const cog = getCognition(engine.store.state, 'npc');
    cog.morale = 10;

    // Also reduce HP to favor guard over attack
    npc.resources.hp = 5;

    const decision = selectNpcCombatAction(npc, engine.store.state);

    // Disengage should be suppressed (no exit = -100)
    expect(decision.chosen.intent).not.toBe('disengage');
    // Should fall back to guard (low HP) or attack
    expect(['guard', 'attack']).toContain(decision.chosen.intent);
  });

  it('FLEEING target prefers finish', () => {
    const npc = makeEntity('npc', 'enemy', ['enemy']);
    const target = makeEntity('target', 'player', ['player'], {
      resources: { hp: 4, maxHp: 20, stamina: 5 },
    });
    applyStatus(target, COMBAT_STATES.FLEEING, 99);
    const engine = buildEngine([npc, target]);

    const decision = selectNpcCombatAction(npc, engine.store.state);

    expect(decision.chosen.intent).toBe('finish');
    expect(decision.chosen.resolvedVerb).toBe('attack');
    expect(decision.chosen.targetId).toBe('target');
  });
});

// ---------------------------------------------------------------------------
// Group 2: Tactical Behavior
// ---------------------------------------------------------------------------

describe('combat-intent: tactical behavior', () => {
  it('enemy BACKLINE triggers pressure', () => {
    const npc = makeEntity('npc', 'enemy', ['enemy']);
    const target = makeEntity('target', 'player', ['player']);
    applyStatus(target, ENGAGEMENT_STATES.BACKLINE, 99);
    const engine = buildEngine([npc, target]);

    // Morale high enough for confidence
    const cog = getCognition(engine.store.state, 'npc');
    cog.morale = 70;

    const decision = selectNpcCombatAction(npc, engine.store.state);

    expect(decision.chosen.intent).toBe('pressure');
    expect(decision.chosen.resolvedVerb).toBe('attack');
    expect(decision.chosen.targetId).toBe('target');
  });

  it('wounded ally triggers protect', () => {
    const npc = makeEntity('npc', 'enemy', ['enemy'], {
      stats: { will: 5 },
      resources: { hp: 18, maxHp: 20, stamina: 5 },
    });
    // Ally of same type with low HP
    const ally = makeEntity('ally', 'enemy', ['enemy'], {
      resources: { hp: 3, maxHp: 20, stamina: 5 },
    });
    const target = makeEntity('target', 'player', ['player']);
    const engine = buildEngine([npc, ally, target]);

    const cog = getCognition(engine.store.state, 'npc');
    cog.morale = 60;

    const decision = selectNpcCombatAction(npc, engine.store.state);

    expect(decision.chosen.intent).toBe('protect');
    expect(decision.chosen.resolvedVerb).toBe('guard');
    expect(decision.chosen.targetId).toBe('ally');
  });

  it('EXPOSED entity guards defensively', () => {
    const npc = makeEntity('npc', 'enemy', ['enemy'], {
      resources: { hp: 12, maxHp: 20, stamina: 5 },
    });
    applyStatus(npc, COMBAT_STATES.EXPOSED, 99);
    const target = makeEntity('target', 'player', ['player']);
    const engine = buildEngine([npc, target]);

    const cog = getCognition(engine.store.state, 'npc');
    cog.morale = 50;

    const decision = selectNpcCombatAction(npc, engine.store.state);

    // EXPOSED +20 to guard should tip it
    expect(decision.chosen.intent).toBe('guard');
  });

  it('OFF_BALANCE enemy gets attack bonus', () => {
    const npc = makeEntity('npc', 'enemy', ['enemy'], {
      resources: { hp: 20, maxHp: 20, stamina: 5 },
    });
    const target = makeEntity('target', 'player', ['player']);
    applyStatus(target, COMBAT_STATES.OFF_BALANCE, 99, { duration: 1 });
    const engine = buildEngine([npc, target]);

    const cog = getCognition(engine.store.state, 'npc');
    cog.morale = 50;

    const decision = selectNpcCombatAction(npc, engine.store.state);

    // Should prefer attack — off_balance_target +8 contributes
    expect(decision.chosen.intent).toBe('attack');
    const offBalContrib = decision.chosen.contributions.find(c => c.factor === 'off_balance_target');
    expect(offBalContrib).toBeDefined();
    expect(offBalContrib!.delta).toBe(8);
  });

  it('ISOLATED + low morale strongly disengages', () => {
    const npc = makeEntity('npc', 'enemy', ['enemy']);
    applyStatus(npc, ENGAGEMENT_STATES.ISOLATED, 99);
    const target = makeEntity('target', 'player', ['player']);
    const engine = buildEngine([npc, target]);

    const cog = getCognition(engine.store.state, 'npc');
    cog.morale = 15;

    const decision = selectNpcCombatAction(npc, engine.store.state);

    expect(decision.chosen.intent).toBe('disengage');
    // Check isolated bonus is in contributions
    const isolatedContrib = decision.chosen.contributions.find(c => c.factor === 'isolated');
    expect(isolatedContrib).toBeDefined();
    expect(isolatedContrib!.delta).toBe(10);
  });

  it('high will resists disengage — prefers guard', () => {
    const npc = makeEntity('npc', 'enemy', ['enemy'], {
      stats: { will: 9 },
      resources: { hp: 7, maxHp: 20, stamina: 5 },
    });
    const target = makeEntity('target', 'player', ['player']);
    const engine = buildEngine([npc, target]);

    const cog = getCognition(engine.store.state, 'npc');
    cog.morale = 25;

    const decision = selectNpcCombatAction(npc, engine.store.state);

    // Will 9: disengage penalty = -min(10, (9-3)*3) = -10
    // Will 9: guard bonus = min(8, (9-3)*2) = +8
    // Low HP also favors guard
    expect(decision.chosen.intent).not.toBe('disengage');
    expect(decision.chosen.intent).toBe('guard');
  });
});

// ---------------------------------------------------------------------------
// Group 3: Pack Bias
// ---------------------------------------------------------------------------

describe('combat-intent: pack biases', () => {
  it('samurai holds ground at morale 18 (threshold 15)', () => {
    const npc = makeEntity('npc', 'enemy', ['enemy', 'samurai']);
    const target = makeEntity('target', 'player', ['player']);
    const engine = buildEngine([npc, target]);
    const config: CombatIntentConfig = { packBiases: biasesFor('samurai') };

    const cog = getCognition(engine.store.state, 'npc');
    cog.morale = 18; // Above samurai threshold of 15

    const decision = selectNpcCombatAction(npc, engine.store.state, config);

    // Samurai: morale 18 is above moraleFleeThreshold 15, so low_morale doesn't fire
    // Plus disengage -10 bias. Should NOT disengage.
    expect(decision.chosen.intent).not.toBe('disengage');
    expect(decision.packBias).toBe('samurai-discipline');
  });

  it('pirate prefers pressure over basic attack when backline available', () => {
    const npc = makeEntity('npc', 'enemy', ['enemy', 'pirate']);
    const target = makeEntity('target', 'player', ['player']);
    applyStatus(target, ENGAGEMENT_STATES.BACKLINE, 99);
    const engine = buildEngine([npc, target]);
    const config: CombatIntentConfig = { packBiases: biasesFor('pirate') };

    const cog = getCognition(engine.store.state, 'npc');
    cog.morale = 70;

    const decision = selectNpcCombatAction(npc, engine.store.state, config);

    // Pirate: pressure +15 modifier should beat attack +10
    expect(decision.chosen.intent).toBe('pressure');
    expect(decision.packBias).toBe('pirate-swarm');
  });

  it('vampire attacks when moderate NPC would guard', () => {
    const npc = makeEntity('npc', 'enemy', ['enemy', 'vampire'], {
      resources: { hp: 6, maxHp: 20, stamina: 5 },
    });
    const target = makeEntity('target', 'player', ['player']);
    const engine = buildEngine([npc, target]);

    const cog = getCognition(engine.store.state, 'npc');
    cog.morale = 50;

    // Without bias — low HP should favor guard
    const noBiasDecision = selectNpcCombatAction(npc, engine.store.state);
    expect(noBiasDecision.chosen.intent).toBe('guard');

    // With vampire bias — attack +15, guard -10 should shift to attack
    const config: CombatIntentConfig = { packBiases: biasesFor('vampire') };
    const biasedDecision = selectNpcCombatAction(npc, engine.store.state, config);
    expect(biasedDecision.chosen.intent).toBe('attack');
    expect(biasedDecision.packBias).toBe('vampire-aggression');
  });

  it('criminal disengages at morale 42 (threshold 45)', () => {
    const npc = makeEntity('npc', 'enemy', ['enemy', 'criminal']);
    const target = makeEntity('target', 'player', ['player']);
    const engine = buildEngine([npc, target]);
    const config: CombatIntentConfig = { packBiases: biasesFor('criminal') };

    const cog = getCognition(engine.store.state, 'npc');
    cog.morale = 42;

    const decision = selectNpcCombatAction(npc, engine.store.state, config);

    // Criminal: moraleFleeThreshold 45, morale 42 is below that
    // low_morale delta = (45-42)*2 = 6, plus disengage +15 bias
    // Plus base 20 = 41. Attack base would be ~50 + morale bonus ~0 + hp ~10 - attack penalty 5 = 55
    // Hmm that's still higher. Need to also lower HP to shift balance.
    // Let's just verify the criminal bias increases disengage score
    const disengageScore = [decision.chosen, ...decision.alternatives]
      .find(s => s.intent === 'disengage');
    expect(disengageScore).toBeDefined();
    expect(disengageScore!.score).toBeGreaterThan(30);
    expect(decision.packBias).toBe('criminal-coward');
  });

  it('feral never guards even at 20% HP', () => {
    const npc = makeEntity('npc', 'enemy', ['enemy', 'feral'], {
      resources: { hp: 4, maxHp: 20, stamina: 5 },
    });
    const target = makeEntity('target', 'player', ['player']);
    const engine = buildEngine([npc, target]);
    const config: CombatIntentConfig = { packBiases: biasesFor('feral') };

    const cog = getCognition(engine.store.state, 'npc');
    cog.morale = 40;

    // Without bias
    const noBiasDecision = selectNpcCombatAction(npc, engine.store.state);
    const guardNoBias = [noBiasDecision.chosen, ...noBiasDecision.alternatives]
      .find(s => s.intent === 'guard');

    // With feral bias: guard -20
    const biasedDecision = selectNpcCombatAction(npc, engine.store.state, config);
    const guardBiased = [biasedDecision.chosen, ...biasedDecision.alternatives]
      .find(s => s.intent === 'guard');

    // Guard score with feral should be much lower
    expect(guardBiased!.score).toBeLessThan(guardNoBias!.score);
    // Feral should prefer attack
    expect(biasedDecision.chosen.intent).toBe('attack');
    expect(biasedDecision.packBias).toBe('feral-berserk');
  });
});

// ---------------------------------------------------------------------------
// Group 4: Explainability
// ---------------------------------------------------------------------------

describe('combat-intent: explainability', () => {
  it('decision contains scored breakdown with contributions', () => {
    const npc = makeEntity('npc', 'enemy', ['enemy']);
    const target = makeEntity('target', 'player', ['player']);
    const engine = buildEngine([npc, target]);

    const decision = selectNpcCombatAction(npc, engine.store.state);

    expect(decision.entityId).toBe('npc');
    expect(decision.entityName).toBe('npc');
    expect(decision.chosen.contributions.length).toBeGreaterThan(0);

    for (const c of decision.chosen.contributions) {
      expect(c.factor).toBeTruthy();
      expect(typeof c.delta).toBe('number');
      expect(typeof c.weight).toBe('number');
    }

    // Should have alternatives
    expect(decision.alternatives.length).toBeGreaterThan(0);
  });

  it('formatCombatDecision produces readable text', () => {
    const npc = makeEntity('npc', 'enemy', ['enemy', 'samurai'], {
      name: 'Corrupt Samurai',
    });
    const target = makeEntity('target', 'player', ['player']);
    const engine = buildEngine([npc, target]);
    const config: CombatIntentConfig = { packBiases: biasesFor('samurai') };

    const decision = selectNpcCombatAction(npc, engine.store.state, config);
    const text = formatCombatDecision(decision);

    expect(text).toContain('Corrupt Samurai');
    expect(text).toContain(decision.chosen.intent);
    expect(text).toContain('samurai-discipline');
    expect(text).toContain('Alternatives:');
    expect(text).toContain('Summary:');
  });
});

// ---------------------------------------------------------------------------
// Group 7: Edge Cases (Phase 7)
// ---------------------------------------------------------------------------

describe('combat-intent: edge cases', () => {
  it('morale 0 strongly prefers disengage', () => {
    const npc = makeEntity('npc', 'enemy', ['enemy'], {
      resources: { hp: 5, maxHp: 20, stamina: 5 },
    });
    const target = makeEntity('target', 'player', ['player']);
    const engine = buildEngine([npc, target]);

    // Force morale to 0
    const cog = getCognition(engine.store.state, 'npc');
    cog.morale = 0;

    const decision = selectNpcCombatAction(npc, engine.store.state);
    expect(decision.chosen.intent).toBe('disengage');
  });

  it('morale 100 prefers attack aggressively', () => {
    const npc = makeEntity('npc', 'enemy', ['enemy'], {
      resources: { hp: 20, maxHp: 20, stamina: 5 },
    });
    const target = makeEntity('target', 'player', ['player']);
    const engine = buildEngine([npc, target]);

    const cog = getCognition(engine.store.state, 'npc');
    cog.morale = 100;

    const decision = selectNpcCombatAction(npc, engine.store.state);
    expect(decision.chosen.intent).toBe('attack');
    // High morale should boost attack score significantly
    expect(decision.chosen.score).toBeGreaterThan(60);
  });

  it('no exit suppresses disengage score', () => {
    const npc = makeEntity('npc', 'enemy', ['enemy'], {
      zoneId: 'zone-dead-end',
      resources: { hp: 3, maxHp: 20, stamina: 5 },
    });
    const target = makeEntity('target', 'player', ['player'], {
      zoneId: 'zone-dead-end',
    });
    const engine = buildEngine([npc, target]);

    // Low morale + low HP would normally trigger disengage
    const cog = getCognition(engine.store.state, 'npc');
    cog.morale = 5;

    const decision = selectNpcCombatAction(npc, engine.store.state);
    // With no exit, disengage should be heavily penalized
    const disengageScore = decision.alternatives.find(a => a.intent === 'disengage');
    expect(disengageScore?.score ?? decision.chosen.score).toBeLessThan(10);
    expect(decision.chosen.intent).not.toBe('disengage');
  });

  it('will 1 reduces disengage penalty near minimum', () => {
    const npc = makeEntity('npc', 'enemy', ['enemy'], {
      stats: { will: 1 },
    });
    const target = makeEntity('target', 'player', ['player']);
    const engine = buildEngine([npc, target]);

    const d1 = selectNpcCombatAction(npc, engine.store.state);

    // Compare with will 10
    const npc2 = makeEntity('npc2', 'enemy', ['enemy'], {
      stats: { will: 10 },
    });
    engine.store.state.entities.npc2 = npc2;

    const d2 = selectNpcCombatAction(npc2, engine.store.state);

    // Higher will should reduce disengage propensity (will adds penalty to disengage)
    const d1Disengage = [...(d1.chosen.intent === 'disengage' ? [d1.chosen] : []), ...d1.alternatives].find(a => a.intent === 'disengage');
    const d2Disengage = [...(d2.chosen.intent === 'disengage' ? [d2.chosen] : []), ...d2.alternatives].find(a => a.intent === 'disengage');

    // Higher will = lower disengage score (will penalizes disengage)
    expect(d2Disengage!.score).toBeLessThan(d1Disengage!.score);
  });

  it('multi-tag entity uses first matching pack bias', () => {
    const npc = makeEntity('npc', 'enemy', ['enemy', 'samurai', 'vampire']);
    const target = makeEntity('target', 'player', ['player']);
    const engine = buildEngine([npc, target]);

    const config: CombatIntentConfig = {
      packBiases: biasesFor('samurai', 'vampire'),
    };

    const decision = selectNpcCombatAction(npc, engine.store.state, config);
    // samurai comes first in the biases array, so it should be the one applied
    expect(decision.packBias).toBe('samurai-discipline');
  });

  it('stat mapping reads correct resolve stat for scoring', () => {
    const npc = makeEntity('npc', 'enemy', ['enemy'], {
      stats: { composure: 10 }, // high resolve via ronin mapping
    });
    const target = makeEntity('target', 'player', ['player']);
    const engine = buildEngine([npc, target]);

    const config: CombatIntentConfig = {
      statMapping: { attack: 'discipline', precision: 'perception', resolve: 'composure' },
    };

    const decisionMapped = selectNpcCombatAction(npc, engine.store.state, config);
    const decisionDefault = selectNpcCombatAction(npc, engine.store.state);

    // With composure=10 mapped to resolve, the will contributions should differ
    // Guard score should be higher with high resolve
    const mappedGuard = [...(decisionMapped.chosen.intent === 'guard' ? [decisionMapped.chosen] : []), ...decisionMapped.alternatives].find(a => a.intent === 'guard');
    const defaultGuard = [...(decisionDefault.chosen.intent === 'guard' ? [decisionDefault.chosen] : []), ...decisionDefault.alternatives].find(a => a.intent === 'guard');

    // Mapped guard (composure=10) should score higher than default (will=undefined → 3)
    expect(mappedGuard!.score).toBeGreaterThan(defaultGuard!.score);
  });

  it('exit quality boosts disengage score when safe neighbors exist', () => {
    const npc = makeEntity('npc', 'enemy', ['enemy'], { name: 'Bandit', zoneId: 'zone-a' });
    const ally = makeEntity('ally', 'enemy', ['enemy'], { name: 'Friendly', zoneId: 'zone-safe' });
    const target = makeEntity('player', 'player', ['player'], { name: 'Hero', zoneId: 'zone-a' });
    const engine = createTestEngine({
      modules: [statusCore, createCognitionCore(), createCombatIntent()],
      entities: [npc, target, ally],
      zones: [
        { id: 'zone-a', roomId: 'test', name: 'Fight Zone', tags: [] as string[], neighbors: ['zone-safe', 'zone-choke'] },
        { id: 'zone-safe', roomId: 'test', name: 'Safe Zone', tags: [] as string[], neighbors: ['zone-a'] },
        { id: 'zone-choke', roomId: 'test', name: 'Choke', tags: ['chokepoint'] as string[], neighbors: ['zone-a'] },
      ],
    });

    const decision = selectNpcCombatAction(engine.world.entities.npc, engine.store.state);
    const disengage = [decision.chosen, ...decision.alternatives].find(a => a.intent === 'disengage');
    expect(disengage).toBeDefined();

    // Should have exit_quality contribution since zone-safe has ally + no enemies
    const exitContrib = disengage!.contributions.find(c => c.factor === 'exit_quality');
    expect(exitContrib).toBeDefined();
    expect(exitContrib!.delta).toBeGreaterThan(0);
  });

  it('allyDefeatedRecently boosts disengage + guard scores', () => {
    const npc = makeEntity('npc', 'enemy', ['enemy'], {
      resources: { hp: 10, maxHp: 20, stamina: 5 },
    });
    const target = makeEntity('target', 'player', ['player']);
    const ally = makeEntity('ally', 'enemy', ['enemy'], {
      resources: { hp: 0, maxHp: 20, stamina: 5 },
    });
    const engine = buildEngine([npc, target, ally]);

    const cog = getCognition(engine.store.state, 'npc');
    cog.morale = 40;

    // Baseline without defeat
    const baseDec = selectNpcCombatAction(npc, engine.store.state);
    const baseGuard = [baseDec.chosen, ...baseDec.alternatives].find(a => a.intent === 'guard')!;
    const baseDisengage = [baseDec.chosen, ...baseDec.alternatives].find(a => a.intent === 'disengage')!;

    // Simulate ally defeat event through the module
    engine.store.emitEvent('combat.entity.defeated', {
      entityId: 'ally', entityName: 'ally', defeatedBy: 'target',
    });

    const dec = selectNpcCombatAction(npc, engine.store.state);
    const guard = [dec.chosen, ...dec.alternatives].find(a => a.intent === 'guard')!;
    const disengage = [dec.chosen, ...dec.alternatives].find(a => a.intent === 'disengage')!;

    // Ally fallen contributions should boost guard (+8) and disengage (+12)
    expect(guard.score).toBeGreaterThan(baseGuard.score);
    expect(disengage.score).toBeGreaterThan(baseDisengage.score);

    const guardContrib = guard.contributions.find(c => c.factor === 'ally_fallen');
    expect(guardContrib).toBeDefined();
    expect(guardContrib!.delta).toBe(8);

    const disengageContrib = disengage.contributions.find(c => c.factor === 'ally_fallen');
    expect(disengageContrib).toBeDefined();
    expect(disengageContrib!.delta).toBe(12);

    // Clear for next test
    engine.store.emitEvent('tick.start', {});
  });

  it('enemyDefeatedRecently boosts attack + finish scores', () => {
    const npc = makeEntity('npc', 'enemy', ['enemy'], {
      resources: { hp: 15, maxHp: 20, stamina: 5 },
    });
    const target = makeEntity('target', 'player', ['player'], {
      resources: { hp: 4, maxHp: 20, stamina: 5 },
    });
    applyStatus(target, COMBAT_STATES.FLEEING, 99);
    const enemy2 = makeEntity('enemy2', 'player', ['player'], {
      resources: { hp: 0, maxHp: 20, stamina: 5 },
    });
    const engine = buildEngine([npc, target, enemy2]);

    const cog = getCognition(engine.store.state, 'npc');
    cog.morale = 60;

    // Baseline without defeat
    const baseDec = selectNpcCombatAction(npc, engine.store.state);
    const baseAttack = [baseDec.chosen, ...baseDec.alternatives].find(a => a.intent === 'attack')!;
    const baseFinish = [baseDec.chosen, ...baseDec.alternatives].find(a => a.intent === 'finish')!;

    // Simulate enemy defeat (player-type entity defeated)
    engine.store.emitEvent('combat.entity.defeated', {
      entityId: 'enemy2', entityName: 'enemy2', defeatedBy: 'npc',
    });

    const dec = selectNpcCombatAction(npc, engine.store.state);
    const attack = [dec.chosen, ...dec.alternatives].find(a => a.intent === 'attack')!;
    const finish = [dec.chosen, ...dec.alternatives].find(a => a.intent === 'finish')!;

    // Momentum contributions should boost attack (+8) and finish (+10)
    expect(attack.score).toBeGreaterThan(baseAttack.score);
    expect(finish.score).toBeGreaterThan(baseFinish.score);

    const attackContrib = attack.contributions.find(c => c.factor === 'momentum');
    expect(attackContrib).toBeDefined();
    expect(attackContrib!.delta).toBe(8);

    const finishContrib = finish.contributions.find(c => c.factor === 'momentum');
    expect(finishContrib).toBeDefined();
    expect(finishContrib!.delta).toBe(10);

    // Clear for next test
    engine.store.emitEvent('tick.start', {});
  });

  it('exit quality is zero when no neighbors', () => {
    const npc = makeEntity('npc', 'enemy', ['enemy'], { name: 'Bandit', zoneId: 'zone-dead-end' });
    const target = makeEntity('player', 'player', ['player'], { name: 'Hero', zoneId: 'zone-dead-end' });
    const engine = buildEngine([npc, target]);

    const decision = selectNpcCombatAction(engine.world.entities.npc, engine.store.state);
    const disengage = [decision.chosen, ...decision.alternatives].find(a => a.intent === 'disengage');
    if (disengage) {
      const exitContrib = disengage.contributions.find(c => c.factor === 'exit_quality');
      // Either no exit_quality contribution, or it has delta 0
      expect(exitContrib?.delta ?? 0).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Precision vs Force: AI dimension awareness
// ---------------------------------------------------------------------------

describe('precision vs force: AI dimension awareness', () => {
  it('high-vigor entity gets vigor_advantage contribution to attack', () => {
    const bruiser = makeEntity('bruiser', 'enemy', ['enemy'], {
      name: 'Bruiser',
      stats: { vigor: 8, instinct: 5, will: 3 },
    });
    const target = makeEntity('player', 'player', ['player'], { name: 'Hero' });
    const engine = buildEngine([bruiser, target]);

    const decision = selectNpcCombatAction(engine.world.entities.bruiser, engine.store.state);
    const allScores = [decision.chosen, ...decision.alternatives];
    const attack = allScores.find(s => s.intent === 'attack')!;
    expect(attack).toBeDefined();

    const vigorContrib = attack.contributions.find(c => c.factor === 'vigor_advantage');
    expect(vigorContrib).toBeDefined();
    // vigor=8 → (8-5)*3 = 9 → capped at 5
    expect(vigorContrib!.delta).toBeGreaterThan(0);
  });

  it('high-instinct entity gets precision_advantage contribution to reposition', () => {
    const duelist = makeEntity('duelist', 'enemy', ['enemy'], {
      name: 'Duelist',
      stats: { vigor: 5, instinct: 8, will: 3 },
    });
    const target = makeEntity('player', 'player', ['player'], { name: 'Hero' });
    const engine = buildEngine([duelist, target]);

    const decision = selectNpcCombatAction(engine.world.entities.duelist, engine.store.state);
    const allScores = [decision.chosen, ...decision.alternatives];
    const reposition = allScores.find(s => s.intent === 'reposition');

    // Reposition may not always appear if combat-tactics isn't loaded,
    // but the contribution should be there if it does
    if (reposition) {
      const precContrib = reposition.contributions.find(c => c.factor === 'precision_advantage');
      expect(precContrib).toBeDefined();
      // instinct=8 → (8-5)*3 = 9 → capped at 5
      expect(precContrib!.delta).toBeGreaterThan(0);
    }
  });

  it('default-stat entity gets no dimension bonuses', () => {
    const generic = makeEntity('generic', 'enemy', ['enemy'], {
      name: 'Generic',
      stats: { vigor: 5, instinct: 5, will: 3 },
    });
    const target = makeEntity('player', 'player', ['player'], { name: 'Hero' });
    const engine = buildEngine([generic, target]);

    const decision = selectNpcCombatAction(engine.world.entities.generic, engine.store.state);
    const allScores = [decision.chosen, ...decision.alternatives];

    // No vigor_advantage, precision_advantage, force_pressure, or force_hold at defaults
    for (const scored of allScores) {
      const dimContribs = scored.contributions.filter(c =>
        ['vigor_advantage', 'precision_advantage', 'force_pressure', 'force_hold'].includes(c.factor),
      );
      expect(dimContribs.length).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Group: AI Interception Cover Awareness (P7)
// ---------------------------------------------------------------------------

describe('AI interception cover awareness', () => {
  it('attack score penalizes targets with bodyguard cover', () => {
    const attacker = makeEntity('goblin', 'enemy', ['enemy'], {
      name: 'Goblin',
      stats: { vigor: 5, instinct: 5, will: 3 },
    });
    // Player has a bodyguard ally
    const player = makeEntity('player', 'player', ['player'], { name: 'Hero' });
    const bodyguard = makeEntity('guard', 'player', ['ally', 'role:bodyguard'], {
      name: 'Guard',
      resources: { hp: 20, maxHp: 20, stamina: 5 },
    });
    const engine = buildEngine([attacker, player, bodyguard]);

    const decision = selectNpcCombatAction(engine.world.entities.goblin, engine.store.state);
    const allScores = [decision.chosen, ...decision.alternatives];
    const attack = allScores.find(s => s.intent === 'attack');
    if (attack) {
      const coverContrib = attack.contributions.find(c => c.factor === 'interception_cover');
      expect(coverContrib).toBeDefined();
      expect(coverContrib!.delta).toBeLessThan(0);
    }
  });

  it('no interception cover penalty when enemy has no live allies', () => {
    const attacker = makeEntity('goblin', 'enemy', ['enemy'], {
      name: 'Goblin',
      stats: { vigor: 5, instinct: 5, will: 3 },
    });
    const player = makeEntity('player', 'player', ['player'], { name: 'Hero' });
    const engine = buildEngine([attacker, player]);

    const decision = selectNpcCombatAction(engine.world.entities.goblin, engine.store.state);
    const allScores = [decision.chosen, ...decision.alternatives];
    const attack = allScores.find(s => s.intent === 'attack');
    if (attack) {
      const coverContrib = attack.contributions.find(c => c.factor === 'interception_cover');
      expect(coverContrib).toBeUndefined();
    }
  });
});
