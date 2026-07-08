import { describe, test, expect } from 'vitest';
import { NpcMemoryBank } from './memory-bank.js';
import { applyRelationshipEffect, DEFAULT_RELATIONSHIP_EFFECTS } from './relationship-effects.js';
import type { CampaignRecord, NpcMemoryState } from './types.js';
import { CAMPAIGN_MEMORY_VERSION } from './types.js';

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

  // CA-06: deserialize must guard malformed state with a clear, actionable message
  // instead of producing a half-built bank that throws a raw TypeError later.
  test('deserialize throws a clear error on null state', () => {
    expect(() => NpcMemoryBank.deserialize(null as any)).toThrowError(/object|state/i);
  });

  test('deserialize throws a clear error when entityId is missing', () => {
    expect(() => NpcMemoryBank.deserialize({ subjects: {} } as any)).toThrowError(/entityId/i);
  });

  test('deserialize throws a clear error when subjects is not an object', () => {
    expect(() =>
      NpcMemoryBank.deserialize({ entityId: 'g', subjects: [] } as any),
    ).toThrowError(/subjects/i);
  });

  test('deserialize accepts a minimal valid state with no subjects', () => {
    const bank = NpcMemoryBank.deserialize({ entityId: 'lonely', subjects: {} });
    expect(bank.entityId).toBe('lonely');
    expect(bank.knownSubjects()).toHaveLength(0);
  });
});

// CM-02: the bank save format carries a schema version (mirroring
// character-profile's PROFILE_VERSION) and deserialize validates every
// subject entry's substructure — relationship axes, memory fragments,
// interaction counters — so a corrupt save fails AT THE BOUNDARY with an
// error naming the offending subject/field, instead of surfacing later as a
// raw TypeError inside recall()/consolidate().
describe('NpcMemoryBank schema versioning + substructure guards (CM-02)', () => {
  /** A fully valid serialized state to mutate per test. */
  function makeState(): NpcMemoryState {
    const bank = new NpcMemoryBank('guard_1');
    bank.remember(makeRecord({ id: 'cr_1', actorId: 'player', targetId: 'guard_1' }), 0.8, -0.5);
    bank.adjustRelationship('player', { trust: -0.4, fear: 0.3 });
    return bank.serialize();
  }

  test('serialize stamps the current schema version', () => {
    expect(makeState().version).toBe(CAMPAIGN_MEMORY_VERSION);
  });

  test('serialize -> deserialize -> serialize is byte-stable', () => {
    const once = makeState();
    const twice = NpcMemoryBank.deserialize(once).serialize();
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });

  test('legacy load: a pre-versioning save (no version field) still deserializes', () => {
    const legacy = makeState();
    delete legacy.version; // saves written before versioning have no stamp
    const bank = NpcMemoryBank.deserialize(legacy);
    expect(bank.recall({ aboutEntity: 'player' })).toHaveLength(1);
    // Re-serializing a legacy save upgrades it to the versioned format.
    expect(bank.serialize().version).toBe(CAMPAIGN_MEMORY_VERSION);
  });

  test('rejects a state from a NEWER schema version with an actionable error', () => {
    const future = { ...makeState(), version: CAMPAIGN_MEMORY_VERSION + 1 };
    expect(() => NpcMemoryBank.deserialize(future)).toThrowError(/newer|version/i);
    expect(() => NpcMemoryBank.deserialize(future)).toThrowError(
      new RegExp(`${CAMPAIGN_MEMORY_VERSION + 1}`),
    );
  });

  test('rejects a state whose version is not a number', () => {
    const bad = { ...makeState(), version: 'two' } as any;
    expect(() => NpcMemoryBank.deserialize(bad)).toThrowError(/version/i);
  });

  test('corrupt subject: memories: null is rejected at the boundary, naming the subject', () => {
    // Before CM-02 this passed the top-level guard and blew up later inside
    // recall()/consolidate() — the exact failure CA-06's comment claims to prevent.
    const state = makeState() as any;
    state.subjects['player'].memories = null;
    expect(() => NpcMemoryBank.deserialize(state)).toThrowError(/memories/i);
    expect(() => NpcMemoryBank.deserialize(state)).toThrowError(/player/);
  });

  test('corrupt subject: non-numeric relationship axis is rejected', () => {
    const state = makeState() as any;
    state.subjects['player'].relationship.trust = 'high';
    expect(() => NpcMemoryBank.deserialize(state)).toThrowError(/trust/i);
  });

  test('corrupt subject: missing relationship object is rejected', () => {
    const state = makeState() as any;
    delete state.subjects['player'].relationship;
    expect(() => NpcMemoryBank.deserialize(state)).toThrowError(/relationship/i);
  });

  test('corrupt fragment: out-of-range salience is rejected, naming the fragment', () => {
    const state = makeState() as any;
    state.subjects['player'].memories[0].salience = 7;
    expect(() => NpcMemoryBank.deserialize(state)).toThrowError(/salience/i);
  });

  test('corrupt subject: non-numeric interactionCount is rejected', () => {
    const state = makeState() as any;
    state.subjects['player'].interactionCount = 'many';
    expect(() => NpcMemoryBank.deserialize(state)).toThrowError(/interactionCount/i);
  });

  test('corrupt subject: entry that is not an object is rejected', () => {
    const state = makeState() as any;
    state.subjects['ghost'] = 42;
    expect(() => NpcMemoryBank.deserialize(state)).toThrowError(/ghost/);
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
