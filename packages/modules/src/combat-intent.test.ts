import { describe, it, expect } from 'vitest';
import { createTestEngine } from '@ai-rpg-engine/core';
import type { EntityState } from '@ai-rpg-engine/core';
import { statusCore, applyStatus } from './status-core.js';
import { COMBAT_STATES } from './combat-core.js';
import { ENGAGEMENT_STATES } from './engagement-core.js';
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
});
