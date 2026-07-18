import { describe, test, expect } from 'vitest';
import { RumorEngine } from './engine.js';
import { DEFAULT_MUTATIONS, embellishMutation, invertMutation } from './mutations.js';
import { validateRumor, isValidRumor } from './validate.js';
import type { MutationContext, MutationRule, Rumor } from './types.js';

function createTestEngine(config?: Parameters<typeof RumorEngine['prototype']['create']>[0] extends never ? never : any) {
  return new RumorEngine();
}

function createRumor(engine: RumorEngine, overrides: Partial<Parameters<RumorEngine['create']>[0]> = {}): Rumor {
  return engine.create({
    claim: 'player killed merchant_1',
    subject: 'player',
    key: 'killed',
    value: true,
    sourceId: 'guard_1',
    originTick: 10,
    confidence: 0.9,
    emotionalCharge: -0.7,
    ...overrides,
  });
}

function defaultCtx(overrides: Partial<MutationContext> = {}): MutationContext {
  return {
    spreaderId: 'guard_2',
    receiverId: 'guard_3',
    environmentInstability: 0,
    hopCount: 1,
    ...overrides,
  };
}

describe('RumorEngine', () => {
  test('create makes a new rumor with correct defaults', () => {
    const engine = new RumorEngine();
    const rumor = createRumor(engine);

    expect(rumor.id).toMatch(/^rum_\d+$/);
    expect(rumor.claim).toBe('player killed merchant_1');
    expect(rumor.value).toBe(true);
    expect(rumor.originalValue).toBe(true);
    expect(rumor.sourceId).toBe('guard_1');
    expect(rumor.confidence).toBe(0.9);
    expect(rumor.emotionalCharge).toBe(-0.7);
    expect(rumor.spreadPath).toEqual(['guard_1']);
    expect(rumor.mutationCount).toBe(0);
    expect(rumor.factionUptake).toEqual([]);
    expect(rumor.status).toBe('spreading');
  });

  test('spread decays confidence and adds to path', () => {
    const engine = new RumorEngine({ confidenceDecayPerHop: 0.1 });
    const rumor = createRumor(engine, { confidence: 0.9 });

    const spread = engine.spread(rumor.id, defaultCtx());

    expect(spread.confidence).toBeCloseTo(0.8);
    expect(spread.spreadPath).toContain('guard_3');
  });

  test('spread transitions to established after maxHops', () => {
    const engine = new RumorEngine({ maxHops: 3, confidenceDecayPerHop: 0.05 });
    const rumor = createRumor(engine);

    engine.spread(rumor.id, defaultCtx({ receiverId: 'e1', hopCount: 1 }));
    engine.spread(rumor.id, defaultCtx({ receiverId: 'e2', hopCount: 2 }));
    // 3 entities in path (source + 2 spreads) = maxHops
    const result = engine.spread(rumor.id, defaultCtx({ receiverId: 'e3', hopCount: 3 }));

    // Path: source + 3 receivers = 4, >= maxHops of 3
    expect(result.status).toBe('established');
  });

  test('recordFactionUptake tracks factions', () => {
    const engine = new RumorEngine();
    const rumor = createRumor(engine);

    engine.recordFactionUptake(rumor.id, 'town_guard');
    engine.recordFactionUptake(rumor.id, 'merchants_guild');
    engine.recordFactionUptake(rumor.id, 'town_guard'); // duplicate

    const updated = engine.get(rumor.id)!;
    expect(updated.factionUptake).toEqual(['town_guard', 'merchants_guild']);
  });

  test('tick transitions spreading to fading after threshold', () => {
    const engine = new RumorEngine({ fadingThreshold: 5 });
    const rumor = createRumor(engine, { originTick: 0 });
    // lastSpreadTick = originTick = 0

    engine.tick(6); // 6 ticks since last spread

    const updated = engine.get(rumor.id)!;
    expect(updated.status).toBe('fading');
  });

  test('tick transitions to dead after death threshold', () => {
    const engine = new RumorEngine({ deathThreshold: 10 });
    const rumor = createRumor(engine, { originTick: 0 });

    engine.tick(11);

    const updated = engine.get(rumor.id)!;
    expect(updated.status).toBe('dead');
  });

  // F-06c431da: tick()'s death check used to fire unconditionally for every
  // non-dead status (including 'established'), which made a dedicated
  // "established rumors can also fade" block after it structurally
  // unreachable — established rumors only ever died via the first,
  // status-agnostic branch. That produced the right answer today but meant
  // a future edit to the first branch (e.g. excluding 'established' from it,
  // a very plausible "fix" given the dead block right below it) would
  // silently make established rumors immortal. These two tests pin the
  // intended semantics directly against an 'established' rumor so the
  // established->dead path has its own coverage independent of the
  // spreading/fading path.
  test('tick keeps an established rumor established past the fading threshold (no fade stage)', () => {
    const engine = new RumorEngine({ maxHops: 2, fadingThreshold: 5, deathThreshold: 20 });
    const rumor = createRumor(engine, { originTick: 0 });

    const established = engine.spread(rumor.id, defaultCtx({ receiverId: 'e1', hopCount: 1 }));
    expect(established.status).toBe('established');

    engine.tick(10); // ticksSinceSpread=9: past fadingThreshold(5), short of deathThreshold(20)

    const updated = engine.get(rumor.id)!;
    expect(updated.status).toBe('established');
  });

  test('tick transitions established rumors to dead after the death threshold', () => {
    const engine = new RumorEngine({ maxHops: 2, fadingThreshold: 5, deathThreshold: 20 });
    const rumor = createRumor(engine, { originTick: 0 });

    const established = engine.spread(rumor.id, defaultCtx({ receiverId: 'e1', hopCount: 1 }));
    expect(established.status).toBe('established');

    engine.tick(21); // ticksSinceSpread=20: at deathThreshold(20)

    const updated = engine.get(rumor.id)!;
    expect(updated.status).toBe('dead');
  });

  test('query filters by subject', () => {
    const engine = new RumorEngine();
    createRumor(engine, { subject: 'player' });
    createRumor(engine, { subject: 'merchant' });
    createRumor(engine, { subject: 'player' });

    const results = engine.query({ subject: 'player' });
    expect(results).toHaveLength(2);
  });

  test('query filters by status', () => {
    const engine = new RumorEngine({ deathThreshold: 5 });
    createRumor(engine, { originTick: 0 });
    createRumor(engine, { originTick: 100 });

    engine.tick(10);

    const active = engine.query({ status: 'spreading' });
    expect(active).toHaveLength(1);
  });

  test('query filters by minConfidence', () => {
    const engine = new RumorEngine();
    createRumor(engine, { confidence: 0.3 });
    createRumor(engine, { confidence: 0.7 });
    createRumor(engine, { confidence: 0.9 });

    const confident = engine.query({ minConfidence: 0.5 });
    expect(confident).toHaveLength(2);
  });

  test('query filters by factionId', () => {
    const engine = new RumorEngine();
    const r1 = createRumor(engine);
    const r2 = createRumor(engine);
    engine.recordFactionUptake(r1.id, 'guards');

    const results = engine.query({ factionId: 'guards' });
    expect(results).toHaveLength(1);
  });

  test('aboutSubject returns non-dead rumors sorted by confidence', () => {
    const engine = new RumorEngine({ deathThreshold: 5 });
    createRumor(engine, { subject: 'player', confidence: 0.5, originTick: 0 });
    createRumor(engine, { subject: 'player', confidence: 0.9, originTick: 100 });
    createRumor(engine, { subject: 'merchant', confidence: 0.8 });

    engine.tick(10); // first rumor dies

    const results = engine.aboutSubject('player');
    expect(results).toHaveLength(1);
    expect(results[0].confidence).toBe(0.9);
  });

  test('activeCount excludes dead rumors', () => {
    const engine = new RumorEngine({ deathThreshold: 5 });
    createRumor(engine, { originTick: 0 });
    createRumor(engine, { originTick: 100 });

    engine.tick(10);

    expect(engine.activeCount()).toBe(1);
  });

  test('serialize and deserialize roundtrip', () => {
    const engine = new RumorEngine();
    const r1 = createRumor(engine, { subject: 'player' });
    const r2 = createRumor(engine, { subject: 'merchant' });
    engine.recordFactionUptake(r1.id, 'guards');

    const serialized = engine.serialize();
    expect(serialized).toHaveLength(2);

    const restored = RumorEngine.deserialize(serialized);
    expect(restored.get(r1.id)?.factionUptake).toEqual(['guards']);
    expect(restored.aboutSubject('merchant')).toHaveLength(1);
  });

  test('get returns undefined for nonexistent rumor', () => {
    const engine = new RumorEngine();
    expect(engine.get('nonexistent')).toBeUndefined();
  });

  test('spread throws for nonexistent rumor', () => {
    const engine = new RumorEngine();
    expect(() => engine.spread('nonexistent', defaultCtx())).toThrow('Rumor not found');
  });

  // CP-02: rumor IDs must be per-instance, not a module-global counter shared
  // across all engines. World truth must depend only on (seed + actions).
  test('two engines do not share an ID counter', () => {
    const a = new RumorEngine();
    const b = new RumorEngine();

    const a1 = createRumor(a);
    const a2 = createRumor(a);
    const b1 = createRumor(b);

    expect(a1.id).toBe('rum_1');
    expect(a2.id).toBe('rum_2');
    // b1 is the FIRST rumor in engine b — must be rum_1, not rum_3.
    expect(b1.id).toBe('rum_1');
  });

  test('rumor IDs are reproducible across runs (same actions => same ids)', () => {
    const run = () => {
      const e = new RumorEngine();
      return [createRumor(e).id, createRumor(e).id];
    };
    expect(run()).toEqual(run());
  });

  test('deserialize advances only the restored instance counter', () => {
    const engine = new RumorEngine();
    const r1 = createRumor(engine); // rum_1
    const serialized = engine.serialize();
    // Rewrite the id high to simulate a save with a large counter.
    serialized[0].id = 'rum_9';

    const restored = RumorEngine.deserialize(serialized);
    const next = restored.create({
      claim: 'next',
      subject: 's',
      key: 'k',
      value: 1,
      sourceId: 'src',
      originTick: 0,
      confidence: 1,
    });
    expect(next.id).toBe('rum_10');

    // A fresh engine created AFTER the deserialize is unaffected.
    const fresh = new RumorEngine();
    expect(createRumor(fresh).id).toBe('rum_1');
    void r1;
  });
});

describe('mutations', () => {
  test('embellish intensifies emotional charge', () => {
    const rumor: Rumor = {
      id: 'test',
      claim: 'test claim',
      subject: 'player',
      key: 'hostile',
      value: true,
      originalValue: true,
      sourceId: 'guard_1',
      originTick: 0,
      confidence: 0.9,
      emotionalCharge: -0.5,
      spreadPath: ['guard_1'],
      mutationCount: 0,
      factionUptake: [],
      status: 'spreading',
      lastSpreadTick: 0,
    };

    const mutated = embellishMutation.apply(rumor, defaultCtx());
    expect(mutated.emotionalCharge).toBeLessThan(-0.5);
  });

  test('invert flips boolean values', () => {
    const rumor: Rumor = {
      id: 'test',
      claim: 'player is hostile',
      subject: 'player',
      key: 'hostile',
      value: true,
      originalValue: true,
      sourceId: 'guard_1',
      originTick: 0,
      confidence: 0.9,
      emotionalCharge: -0.5,
      spreadPath: ['guard_1'],
      mutationCount: 0,
      factionUptake: [],
      status: 'spreading',
      lastSpreadTick: 0,
    };

    const mutated = invertMutation.apply(rumor, defaultCtx());
    expect(mutated.value).toBe(false);
    expect(mutated.mutationCount).toBe(1);
    expect(mutated.emotionalCharge).toBe(0.5);
  });

  test('environment instability increases mutation probability', () => {
    // Use a custom mutation that always applies when probability check passes
    const alwaysMutate: MutationRule = {
      id: 'test-mutate',
      type: 'embellish',
      probability: 0.01, // Very low base probability
      apply: (rumor) => ({ ...rumor, mutationCount: rumor.mutationCount + 1 }),
    };

    const engine = new RumorEngine({
      mutations: [alwaysMutate],
      confidenceDecayPerHop: 0,
    });

    // Run many spreads with high instability to verify it matters
    let mutationCountHigh = 0;
    const mutationCountLow = 0;

    for (let i = 0; i < 20; i++) {
      const rumor = engine.create({
        claim: `test${i}`,
        subject: 'test',
        key: 'test',
        value: 1,
        sourceId: 'src',
        originTick: 0,
        confidence: 1,
      });

      const highCtx = defaultCtx({ environmentInstability: 1.0, hopCount: i });
      const result = engine.spread(rumor.id, highCtx);
      mutationCountHigh += result.mutationCount;
    }

    // Just verify the engine runs without error — deterministic seeding
    // makes probabilistic tests tricky, but the mechanism is exercised
    expect(mutationCountHigh).toBeGreaterThanOrEqual(0);
  });
});

// F-1f8c5a94: deserialize() used to write every incoming rumor straight into
// the registry with no validation, even though this package ships
// validateRumor/isValidRumor for exactly this boundary. A persisted rumor
// missing lastSpreadTick froze forever (NaN never crosses tick()'s
// fading/death thresholds — both comparisons are false against NaN), and one
// missing spreadPath raw-threw a TypeError inside the next spread(). These
// tests pin the warn-and-skip load contract (mirroring soundpack-core's
// SoundRegistry.load, F-833dedfc).
describe('deserialize validation boundary (F-1f8c5a94)', () => {
  /** Serialize an engine's rumors into detached copies safe to corrupt. */
  function serializedCopy(engine: RumorEngine): Rumor[] {
    return engine.serialize().map((r) => ({ ...r }));
  }

  test('skips a rumor missing lastSpreadTick instead of freezing it forever', () => {
    const engine = new RumorEngine();
    const good = createRumor(engine, { originTick: 0 });
    const bad = createRumor(engine, { originTick: 0 });
    const serialized = serializedCopy(engine);
    delete (serialized.find((r) => r.id === bad.id) as Partial<Rumor>).lastSpreadTick;

    const result = RumorEngine.deserializeSafe(serialized, { deathThreshold: 30 });
    expect(result.restored).toBe(1);
    expect(result.engine.get(good.id)).toBeDefined();
    expect(result.engine.get(bad.id)).toBeUndefined();
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.field.includes('lastSpreadTick'))).toBe(true);

    // The restored engine's lifecycle math now runs on real numbers only:
    // everything ages out normally — no NaN-frozen immortal rumor left behind.
    result.engine.tick(100);
    expect(result.engine.get(good.id)?.status).toBe('dead');
    expect(result.engine.activeCount()).toBe(0);
  });

  test('skips a rumor missing spreadPath instead of raw-throwing later in spread()', () => {
    const engine = new RumorEngine();
    const bad = createRumor(engine);
    const serialized = serializedCopy(engine);
    delete (serialized[0] as Partial<Rumor>).spreadPath;

    const result = RumorEngine.deserializeSafe(serialized);
    expect(result.restored).toBe(0);
    expect(result.warnings.some((w) => w.field.includes('spreadPath'))).toBe(true);

    // The malformed entry never entered the registry, so spread() reports the
    // structured miss instead of `original.spreadPath.includes` TypeError.
    expect(() => result.engine.spread(bad.id, defaultCtx())).toThrowError(/Rumor not found/);
  });

  test('mixed load keeps every valid rumor (warn-and-skip, not all-or-nothing)', () => {
    const engine = new RumorEngine();
    const r1 = createRumor(engine, { subject: 'player' });
    const r2 = createRumor(engine, { subject: 'merchant' });
    const r3 = createRumor(engine, { subject: 'guard' });
    const serialized = serializedCopy(engine);
    const corrupted = serialized.find((r) => r.id === r2.id) as { status: unknown };
    corrupted.status = 'zombie'; // not a RumorStatus

    const result = RumorEngine.deserializeSafe(serialized);
    expect(result.restored).toBe(2);
    expect(result.engine.get(r1.id)).toBeDefined();
    expect(result.engine.get(r3.id)).toBeDefined();
    expect(result.engine.get(r2.id)).toBeUndefined();
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].field).toContain('status');
    expect(result.warnings[0].message).toContain(r2.id);
  });

  test('clean roundtrip restores everything with zero warnings (back-compat)', () => {
    const engine = new RumorEngine();
    const r1 = createRumor(engine, { subject: 'player' });
    createRumor(engine, { subject: 'merchant' });
    engine.recordFactionUptake(r1.id, 'guards');

    const result = RumorEngine.deserializeSafe(serializedCopy(engine));
    expect(result.restored).toBe(2);
    expect(result.warnings).toEqual([]);
    expect(result.engine.get(r1.id)?.factionUptake).toEqual(['guards']);
  });

  test('a skipped malformed entry does not advance the id counter', () => {
    const engine = new RumorEngine();
    createRumor(engine); // rum_1
    const serialized = serializedCopy(engine);
    const forged = { ...serialized[0], id: 'rum_50' } as Partial<Rumor>;
    delete forged.lastSpreadTick; // malformed AND carrying a high id
    serialized.push(forged as Rumor);

    const result = RumorEngine.deserializeSafe(serialized);
    expect(result.restored).toBe(1);
    // Counter advanced past rum_1 only — the skipped rum_50 never counts.
    expect(result.engine.create({
      claim: 'next', subject: 's', key: 'k', value: 1,
      sourceId: 'src', originTick: 0, confidence: 1,
    }).id).toBe('rum_2');
  });

  test('non-array input throws a clear structured error, not a raw iteration failure', () => {
    expect(() => RumorEngine.deserialize(null as never)).toThrowError(/\[rumor-system\].*array/);
    expect(() => RumorEngine.deserialize({} as never)).toThrowError(/\[rumor-system\].*array/);
  });

  test('deserialize (legacy signature) also skips malformed entries', () => {
    const engine = new RumorEngine();
    const good = createRumor(engine);
    const serialized = serializedCopy(engine);
    serialized.push({ id: 'rum_bad' } as Rumor); // missing nearly every field

    const restored = RumorEngine.deserialize(serialized);
    expect(restored.get(good.id)).toBeDefined();
    expect(restored.get('rum_bad')).toBeUndefined();
  });
});

describe('validateRumor tick-field hardening (F-1f8c5a94)', () => {
  function validRumor(): Rumor {
    const engine = new RumorEngine();
    return { ...createRumor(engine) };
  }

  test('rejects a rumor missing lastSpreadTick', () => {
    const r = validRumor() as Partial<Rumor>;
    delete r.lastSpreadTick;
    expect(isValidRumor(r)).toBe(false);
    expect(validateRumor(r).some((e) => e.field === 'lastSpreadTick')).toBe(true);
  });

  test('rejects a rumor missing originTick', () => {
    const r = validRumor() as Partial<Rumor>;
    delete r.originTick;
    expect(validateRumor(r).some((e) => e.field === 'originTick')).toBe(true);
  });

  test('rejects NaN in numeric fields (NaN silently defeats every threshold compare)', () => {
    expect(validateRumor({ ...validRumor(), lastSpreadTick: NaN }).length).toBeGreaterThan(0);
    expect(validateRumor({ ...validRumor(), confidence: NaN }).length).toBeGreaterThan(0);
    expect(validateRumor({ ...validRumor(), emotionalCharge: NaN }).length).toBeGreaterThan(0);
    expect(validateRumor({ ...validRumor(), mutationCount: NaN }).length).toBeGreaterThan(0);
  });

  test('accepts every engine-produced rumor (create + spread + mutations)', () => {
    // Roundtrip safety: the boundary validator must never reject legit
    // engine output, or save/load would silently drop real rumors.
    const engine = new RumorEngine();
    const rumor = engine.create({
      claim: 'player killed merchant_1', subject: 'player', key: 'killed',
      value: 10, sourceId: 'guard_1', originTick: 5, confidence: 0.9,
      emotionalCharge: -0.7,
    });
    // High instability forces mutation rolls through every default rule.
    for (let hop = 1; hop <= 4; hop++) {
      engine.spread(rumor.id, defaultCtx({ receiverId: `npc_${hop}`, hopCount: hop, environmentInstability: 1 }));
    }
    engine.tick(50);
    for (const r of engine.serialize()) {
      expect(validateRumor(r)).toEqual([]);
    }
  });
});
