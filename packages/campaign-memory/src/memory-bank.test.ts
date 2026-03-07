import { describe, test, expect } from 'vitest';
import { NpcMemoryBank } from './memory-bank.js';
import { applyRelationshipEffect, DEFAULT_RELATIONSHIP_EFFECTS } from './relationship-effects.js';
import type { CampaignRecord } from './types.js';

function makeRecord(overrides: Partial<CampaignRecord> = {}): CampaignRecord {
  return {
    id: `cr_${Math.floor(Math.random() * 10000)}`,
    tick: 10,
    category: 'combat',
    actorId: 'player',
    targetId: 'guard_1',
    zoneId: 'hall',
    description: 'Player attacked the guard',
    significance: 0.7,
    witnesses: [],
    data: {},
    ...overrides,
  };
}

describe('NpcMemoryBank', () => {
  test('remember stores a memory fragment', () => {
    const bank = new NpcMemoryBank('guard_1');
    const record = makeRecord({ actorId: 'player', targetId: 'guard_1' });

    bank.remember(record, 0.8, -0.5);

    const memories = bank.recall({ aboutEntity: 'player' });
    expect(memories).toHaveLength(1);
    expect(memories[0].salience).toBe(0.8);
    expect(memories[0].emotionalCharge).toBe(-0.5);
    expect(memories[0].consolidation).toBe('vivid');
  });

  test('remember determines subject from perspective', () => {
    const bank = new NpcMemoryBank('guard_1');
    // Guard is the target, so subject should be the actor (player)
    bank.remember(makeRecord({ actorId: 'player', targetId: 'guard_1' }), 0.7, -0.3);
    expect(bank.knownSubjects()).toEqual(['player']);

    // Guard is the actor, so subject should be the target
    const bank2 = new NpcMemoryBank('guard_1');
    bank2.remember(makeRecord({ actorId: 'guard_1', targetId: 'merchant' }), 0.5, 0.1);
    expect(bank2.knownSubjects()).toEqual(['merchant']);
  });

  test('getRelationship returns default for unknown entity', () => {
    const bank = new NpcMemoryBank('guard_1');
    const rel = bank.getRelationship('unknown');
    expect(rel.trust).toBe(0);
    expect(rel.fear).toBe(0);
    expect(rel.admiration).toBe(0);
    expect(rel.familiarity).toBe(0);
  });

  test('adjustRelationship modifies axes and clamps values', () => {
    const bank = new NpcMemoryBank('guard_1');
    bank.adjustRelationship('player', { trust: -0.3, fear: 0.5 });

    const rel = bank.getRelationship('player');
    expect(rel.trust).toBeCloseTo(-0.3);
    expect(rel.fear).toBeCloseTo(0.5);

    // Clamp test — push past bounds
    bank.adjustRelationship('player', { trust: -2.0, fear: 2.0 });
    const clamped = bank.getRelationship('player');
    expect(clamped.trust).toBe(-1);
    expect(clamped.fear).toBe(1);
  });

  test('recall filters by minSalience', () => {
    const bank = new NpcMemoryBank('guard_1');
    bank.remember(makeRecord({ id: 'r1', actorId: 'player', targetId: 'guard_1' }), 0.9, -0.5);
    bank.remember(makeRecord({ id: 'r2', actorId: 'player', targetId: 'guard_1' }), 0.2, -0.1);

    const vivid = bank.recall({ aboutEntity: 'player', minSalience: 0.5 });
    expect(vivid).toHaveLength(1);
    expect(vivid[0].salience).toBe(0.9);
  });

  test('strongestMemory returns highest salience', () => {
    const bank = new NpcMemoryBank('guard_1');
    bank.remember(makeRecord({ id: 'r1', actorId: 'player', targetId: 'guard_1' }), 0.3, -0.1);
    bank.remember(makeRecord({ id: 'r2', actorId: 'player', targetId: 'guard_1' }), 0.9, -0.8);
    bank.remember(makeRecord({ id: 'r3', actorId: 'player', targetId: 'guard_1' }), 0.5, -0.3);

    const strongest = bank.strongestMemory('player');
    expect(strongest?.salience).toBe(0.9);
  });

  test('consolidate decays salience and updates consolidation', () => {
    const bank = new NpcMemoryBank('guard_1', { decayRate: 0.1, fadeThreshold: 0.5, dimThreshold: 0.2 });
    bank.remember(makeRecord({ id: 'r1', actorId: 'player', targetId: 'guard_1', tick: 0 }), 0.8, -0.5);

    // After 5 ticks with 0.1 decay rate: salience = 0.8 - 0.1 * 5 = 0.3
    bank.consolidate(5);

    const memories = bank.recall({ aboutEntity: 'player' });
    expect(memories).toHaveLength(1);
    expect(memories[0].salience).toBeCloseTo(0.3);
    expect(memories[0].consolidation).toBe('faded');
  });

  test('consolidate removes fully forgotten memories', () => {
    const bank = new NpcMemoryBank('guard_1', { decayRate: 0.1, dimThreshold: 0.05 });
    bank.remember(makeRecord({ id: 'r1', actorId: 'player', targetId: 'guard_1', tick: 0 }), 0.3, -0.1);

    // After 10 ticks: salience = 0.3 - 0.1 * 10 = -0.7 → clamped to 0
    bank.consolidate(10);

    const memories = bank.recall({ aboutEntity: 'player' });
    expect(memories).toHaveLength(0);
  });

  test('remembers checks if a specific record is remembered', () => {
    const bank = new NpcMemoryBank('guard_1');
    const record = makeRecord({ actorId: 'player', targetId: 'guard_1' });
    bank.remember(record, 0.7, -0.3);

    expect(bank.remembers(record.id)).toBe(true);
    expect(bank.remembers('nonexistent')).toBe(false);
  });

  test('enforces maxMemoriesPerSubject', () => {
    const bank = new NpcMemoryBank('guard_1', { maxMemoriesPerSubject: 3 });

    for (let i = 0; i < 5; i++) {
      bank.remember(
        makeRecord({ id: `r${i}`, actorId: 'player', targetId: 'guard_1' }),
        i * 0.2, // salience: 0, 0.2, 0.4, 0.6, 0.8
        0,
      );
    }

    const memories = bank.recall({ aboutEntity: 'player' });
    expect(memories).toHaveLength(3);
    // Should keep highest salience
    expect(memories[0].salience).toBe(0.8);
  });

  test('serialize and deserialize roundtrip', () => {
    const bank = new NpcMemoryBank('guard_1');
    bank.remember(makeRecord({ actorId: 'player', targetId: 'guard_1' }), 0.8, -0.5);
    bank.adjustRelationship('player', { trust: -0.4, fear: 0.3 });

    const state = bank.serialize();
    const restored = NpcMemoryBank.deserialize(state);

    expect(restored.entityId).toBe('guard_1');
    expect(restored.recall({ aboutEntity: 'player' })).toHaveLength(1);
    const rel = restored.getRelationship('player');
    expect(rel.trust).toBeCloseTo(-0.4);
    expect(rel.fear).toBeCloseTo(0.3);
  });
});

describe('applyRelationshipEffect', () => {
  test('applies target perspective deltas for combat', () => {
    const bank = new NpcMemoryBank('guard_1');
    const record = makeRecord({ actorId: 'player', targetId: 'guard_1', category: 'combat' });

    applyRelationshipEffect(bank, record, 'target');

    const rel = bank.getRelationship('player');
    expect(rel.trust).toBeCloseTo(-0.1);
    expect(rel.fear).toBeCloseTo(0.2);
  });

  test('applies witness perspective with 50% scaling', () => {
    const bank = new NpcMemoryBank('bystander');
    const record = makeRecord({ actorId: 'player', targetId: 'guard_1', category: 'kill' });

    applyRelationshipEffect(bank, record, 'witness');

    const rel = bank.getRelationship('player');
    // kill: trust -0.3, fear 0.5, admiration -0.1 → halved for witness
    expect(rel.trust).toBeCloseTo(-0.15);
    expect(rel.fear).toBeCloseTo(0.25);
  });

  test('actor perspective increases familiarity', () => {
    const bank = new NpcMemoryBank('player');
    const record = makeRecord({ actorId: 'player', targetId: 'guard_1', category: 'gift' });

    applyRelationshipEffect(bank, record, 'actor');

    const rel = bank.getRelationship('guard_1');
    // gift: trust 0.2, admiration 0.1, familiarity 0.1 + 0.05 actor bonus
    expect(rel.trust).toBeCloseTo(0.2);
    expect(rel.familiarity).toBeCloseTo(0.15);
  });

  test('rescue has strong positive effects', () => {
    const bank = new NpcMemoryBank('merchant');
    const record = makeRecord({ actorId: 'player', targetId: 'merchant', category: 'rescue' });

    applyRelationshipEffect(bank, record, 'target');

    const rel = bank.getRelationship('player');
    expect(rel.trust).toBeCloseTo(0.4);
    expect(rel.admiration).toBeCloseTo(0.3);
    expect(rel.fear).toBe(0); // clamped to 0 (fear range: 0-1)
  });
});
