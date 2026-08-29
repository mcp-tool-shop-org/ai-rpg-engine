import { describe, test, expect } from 'vitest';
import { CampaignJournal } from './journal.js';
import type { CampaignRecord } from './types.js';
import { CAMPAIGN_MEMORY_VERSION } from './types.js';

function makeRecord(overrides: Partial<Omit<CampaignRecord, 'id'>> = {}): Omit<CampaignRecord, 'id'> {
  return {
    tick: 10,
    category: 'combat',
    actorId: 'player',
    targetId: 'guard_1',
    zoneId: 'hall',
    description: 'Player attacked the guard',
    significance: 0.7,
    witnesses: ['bystander_1'],
    data: { damage: 15 },
    ...overrides,
  };
}

describe('CampaignJournal', () => {
  test('record creates entry with generated ID', () => {
    const journal = new CampaignJournal();
    const record = journal.record(makeRecord());
    expect(record.id).toMatch(/^cr_\d+$/);
    expect(record.actorId).toBe('player');
    expect(journal.size()).toBe(1);
  });

  test('get retrieves by ID', () => {
    const journal = new CampaignJournal();
    const record = journal.record(makeRecord());
    expect(journal.get(record.id)).toBe(record);
    expect(journal.get('nonexistent')).toBeUndefined();
  });

  test('query filters by actorId', () => {
    const journal = new CampaignJournal();
    journal.record(makeRecord({ actorId: 'player' }));
    journal.record(makeRecord({ actorId: 'guard_1' }));
    journal.record(makeRecord({ actorId: 'player' }));

    const results = journal.query({ actorId: 'player' });
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.actorId === 'player')).toBe(true);
  });

  test('query filters by category', () => {
    const journal = new CampaignJournal();
    journal.record(makeRecord({ category: 'combat' }));
    journal.record(makeRecord({ category: 'gift' }));
    journal.record(makeRecord({ category: 'combat' }));

    const results = journal.query({ category: 'gift' });
    expect(results).toHaveLength(1);
    expect(results[0].category).toBe('gift');
  });

  test('query filters by minSignificance', () => {
    const journal = new CampaignJournal();
    journal.record(makeRecord({ significance: 0.2 }));
    journal.record(makeRecord({ significance: 0.5 }));
    journal.record(makeRecord({ significance: 0.9 }));

    const results = journal.query({ minSignificance: 0.5 });
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.significance >= 0.5)).toBe(true);
  });

  test('query filters by afterTick', () => {
    const journal = new CampaignJournal();
    journal.record(makeRecord({ tick: 5 }));
    journal.record(makeRecord({ tick: 10 }));
    journal.record(makeRecord({ tick: 15 }));

    const results = journal.query({ afterTick: 10 });
    expect(results).toHaveLength(1);
    expect(results[0].tick).toBe(15);
  });

  test('query combines multiple filters', () => {
    const journal = new CampaignJournal();
    journal.record(makeRecord({ actorId: 'player', category: 'combat', significance: 0.8 }));
    journal.record(makeRecord({ actorId: 'player', category: 'gift', significance: 0.9 }));
    journal.record(makeRecord({ actorId: 'guard', category: 'combat', significance: 0.9 }));

    const results = journal.query({ actorId: 'player', category: 'combat' });
    expect(results).toHaveLength(1);
  });

  test('getInvolving returns records where entity is actor or target', () => {
    const journal = new CampaignJournal();
    journal.record(makeRecord({ actorId: 'player', targetId: 'guard_1' }));
    journal.record(makeRecord({ actorId: 'guard_1', targetId: 'merchant' }));
    journal.record(makeRecord({ actorId: 'merchant', targetId: 'thief' }));

    const results = journal.getInvolving('guard_1');
    expect(results).toHaveLength(2);
  });

  test('serialize and deserialize roundtrip', () => {
    const journal = new CampaignJournal();
    journal.record(makeRecord({ tick: 5 }));
    journal.record(makeRecord({ tick: 10 }));

    const serialized = journal.serialize();
    expect(serialized.version).toBe(CAMPAIGN_MEMORY_VERSION);
    expect(serialized.records).toHaveLength(2);

    const restored = CampaignJournal.deserialize(serialized);
    expect(restored.size()).toBe(2);
    expect(restored.get(serialized.records[0].id)).toBeDefined();
  });

  // F-33569a8d: serialize/deserialize is the persistence boundary. Returning
  // live Map values (or storing the envelope's objects on restore) aliases
  // the running chronicle to the snapshot — mutating a "copy" rewrites
  // description/significance/witnesses/data in the live journal.
  test('mutating serialize().records leaves the live journal unchanged (F-33569a8d)', () => {
    const journal = new CampaignJournal();
    const recorded = journal.record(
      makeRecord({
        significance: 0.7,
        description: 'Player attacked the guard',
        witnesses: ['bystander_1'],
        data: { damage: 15 },
      }),
    );

    const ser = journal.serialize();
    expect(ser.records[0]).not.toBe(journal.get(recorded.id));

    ser.records[0].significance = 1;
    ser.records[0].description = 'rewritten';
    ser.records[0].witnesses.push('spy');
    ser.records[0].data.damage = 99;

    const live = journal.get(recorded.id)!;
    expect(live.significance).toBe(0.7);
    expect(live.description).toBe('Player attacked the guard');
    expect(live.witnesses).toEqual(['bystander_1']);
    expect(live.data).toEqual({ damage: 15 });
  });

  test('two deserialize()s of one envelope do not share record refs (F-33569a8d)', () => {
    const journal = new CampaignJournal();
    journal.record(makeRecord({ significance: 0.7 }));
    const envelope = journal.serialize();
    const id = envelope.records[0].id;

    const a = CampaignJournal.deserialize(envelope);
    const b = CampaignJournal.deserialize(envelope);

    expect(a.get(id)).not.toBe(b.get(id));
    expect(a.get(id)).not.toBe(envelope.records[0]);
    expect(b.get(id)).not.toBe(envelope.records[0]);

    a.get(id)!.significance = 1;
    a.get(id)!.description = 'rewritten';
    a.get(id)!.witnesses.push('spy');
    a.get(id)!.data.damage = 99;

    expect(b.get(id)!.significance).toBe(0.7);
    expect(b.get(id)!.description).toBe('Player attacked the guard');
    expect(b.get(id)!.witnesses).toEqual(['bystander_1']);
    expect(b.get(id)!.data).toEqual({ damage: 15 });
    expect(envelope.records[0].significance).toBe(0.7);
    expect(journal.get(id)!.significance).toBe(0.7);
  });

  // F-36f53181: record() is the write-path ingest. A shallow spread of
  // entry aliases caller-owned witnesses[] / data — mutating those after
  // record() rewrote the running chronicle and the next serialize().
  test('mutating record() input witnesses/data does not write the journal (F-36f53181)', () => {
    const journal = new CampaignJournal();
    const witnesses = ['bystander_1'];
    const data: Record<string, unknown> = { weapon: 'dagger' };
    const recorded = journal.record(makeRecord({ witnesses, data }));

    expect(journal.get(recorded.id)).toBe(recorded);
    expect(recorded.witnesses).not.toBe(witnesses);
    expect(recorded.data).not.toBe(data);

    witnesses.push('spy');
    data.weapon = 'hacked';

    const live = journal.get(recorded.id)!;
    expect(live.witnesses).toEqual(['bystander_1']);
    expect(live.data).toEqual({ weapon: 'dagger' });
    expect(journal.serialize().records[0].witnesses).toEqual(['bystander_1']);
    expect(journal.serialize().records[0].data).toEqual({ weapon: 'dagger' });
  });

  test('results are sorted by tick', () => {
    const journal = new CampaignJournal();
    journal.record(makeRecord({ tick: 20 }));
    journal.record(makeRecord({ tick: 5 }));
    journal.record(makeRecord({ tick: 15 }));

    const results = journal.query({});
    expect(results[0].tick).toBe(5);
    expect(results[1].tick).toBe(15);
    expect(results[2].tick).toBe(20);
  });

  // CP-01: record IDs must be per-instance (depend only on seed+actions), not a
  // module-global counter shared across all journals.
  test('two journals do not share an ID counter', () => {
    const a = new CampaignJournal();
    const b = new CampaignJournal();

    const a1 = a.record(makeRecord());
    const a2 = a.record(makeRecord());
    const b1 = b.record(makeRecord());

    // Each journal numbers from 1 independently.
    expect(a1.id).toBe('cr_1');
    expect(a2.id).toBe('cr_2');
    // b1 is the FIRST record in journal b — must be cr_1, not cr_3.
    expect(b1.id).toBe('cr_1');
  });

  test('record IDs are reproducible across runs (same actions => same ids)', () => {
    const run = () => {
      const j = new CampaignJournal();
      return [j.record(makeRecord()).id, j.record(makeRecord()).id];
    };
    expect(run()).toEqual(run());
  });

  test('interleaving journal record calls does not affect per-instance ids', () => {
    const a = new CampaignJournal();
    const b = new CampaignJournal();
    // Interleave: a, b, a, b
    const a1 = a.record(makeRecord());
    const b1 = b.record(makeRecord());
    const a2 = a.record(makeRecord());
    const b2 = b.record(makeRecord());
    expect(a1.id).toBe('cr_1');
    expect(a2.id).toBe('cr_2');
    expect(b1.id).toBe('cr_1');
    expect(b2.id).toBe('cr_2');
  });

  test('deserialize advances only the restored instance counter', () => {
    const restored = CampaignJournal.deserialize([
      { id: 'cr_7', ...makeRecord() },
      { id: 'cr_3', ...makeRecord() },
    ]);
    // Next record on the restored instance is cr_8 (max + 1).
    const next = restored.record(makeRecord());
    expect(next.id).toBe('cr_8');

    // A fresh, independent journal is unaffected by the deserialize above.
    const fresh = new CampaignJournal();
    expect(fresh.record(makeRecord()).id).toBe('cr_1');
  });

  // CA-06: deserialize must guard malformed input with a clear, actionable message
  // instead of letting a raw TypeError escape (e.g. "records is not iterable").
  test('deserialize throws a clear error on a non-array (null)', () => {
    expect(() => CampaignJournal.deserialize(null as any)).toThrowError(/array/i);
  });

  test('deserialize throws a clear error on a non-array (object)', () => {
    expect(() => CampaignJournal.deserialize({} as any)).toThrowError(/array/i);
  });

  test('deserialize throws a clear error naming the bad element index', () => {
    expect(() =>
      CampaignJournal.deserialize([{ id: 'cr_1', ...makeRecord() }, null as any]),
    ).toThrowError(/\[1\]/);
  });

  test('deserialize throws a clear error when an element is missing its id', () => {
    const noId = { ...makeRecord() } as any; // no id field
    expect(() => CampaignJournal.deserialize([noId])).toThrowError(/id/i);
  });

  test('deserialize accepts a valid empty array', () => {
    const j = CampaignJournal.deserialize([]);
    expect(j.size()).toBe(0);
  });
});

// CM-01: the journal save format carries a schema version (mirroring
// character-profile's PROFILE_VERSION) and deserialize validates every record's
// substructure — not just top-level shape — so a corrupt or future-format save
// fails AT THE BOUNDARY with an actionable error instead of NaN-sorting or
// throwing a raw TypeError deep inside query()/buildFinaleOutline().
describe('CampaignJournal schema versioning + substructure guards (CM-01)', () => {
  test('serialize stamps the current schema version', () => {
    const journal = new CampaignJournal();
    journal.record(makeRecord());
    const saved = journal.serialize();
    expect(saved.version).toBe(CAMPAIGN_MEMORY_VERSION);
    expect(Array.isArray(saved.records)).toBe(true);
  });

  test('serialize -> deserialize -> serialize is byte-stable', () => {
    const journal = new CampaignJournal();
    journal.record(makeRecord({ tick: 5 }));
    journal.record(makeRecord({ tick: 12, category: 'gift' }));
    const once = journal.serialize();
    const twice = CampaignJournal.deserialize(once).serialize();
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });

  test('legacy load: a pre-versioning raw array save still deserializes', () => {
    // Saves written before CAMPAIGN_MEMORY_VERSION existed are bare arrays.
    const legacy: CampaignRecord[] = [
      { id: 'cr_1', ...makeRecord({ tick: 3 }) },
      { id: 'cr_2', ...makeRecord({ tick: 9 }) },
    ];
    const restored = CampaignJournal.deserialize(legacy);
    expect(restored.size()).toBe(2);
    // Re-serializing a legacy save upgrades it to the versioned envelope.
    expect(restored.serialize().version).toBe(CAMPAIGN_MEMORY_VERSION);
  });

  test('rejects an envelope from a NEWER schema version with an actionable error', () => {
    const future = {
      version: CAMPAIGN_MEMORY_VERSION + 1,
      records: [] as CampaignRecord[],
    };
    expect(() => CampaignJournal.deserialize(future)).toThrowError(/newer|version/i);
    expect(() => CampaignJournal.deserialize(future)).toThrowError(
      new RegExp(`${CAMPAIGN_MEMORY_VERSION + 1}`),
    );
  });

  test('rejects an envelope whose version is not a number', () => {
    expect(() =>
      CampaignJournal.deserialize({ version: '1', records: [] } as any),
    ).toThrowError(/version/i);
  });

  test('rejects an envelope whose records is not an array', () => {
    expect(() =>
      CampaignJournal.deserialize({ version: CAMPAIGN_MEMORY_VERSION, records: {} } as any),
    ).toThrowError(/records|array/i);
  });

  test('corrupt substructure: record with a missing tick is rejected at the boundary', () => {
    // Before CM-01 this built a journal whose query() sorted on undefined
    // (NaN comparisons) — the exact failure the CA-06 comment claims to prevent.
    const bad = { ...makeRecord(), id: 'cr_1' } as any;
    delete bad.tick;
    expect(() => CampaignJournal.deserialize([bad])).toThrowError(/tick/i);
    expect(() => CampaignJournal.deserialize([bad])).toThrowError(/\[0\]/);
  });

  test('corrupt substructure: out-of-range significance is rejected', () => {
    const bad = { ...makeRecord(), id: 'cr_1', significance: 7 } as any;
    expect(() => CampaignJournal.deserialize([bad])).toThrowError(/significance/i);
  });

  test('corrupt substructure: unknown category is rejected', () => {
    const bad = { ...makeRecord(), id: 'cr_1', category: 'not-a-category' } as any;
    expect(() => CampaignJournal.deserialize([bad])).toThrowError(/category/i);
  });

  test('corrupt substructure: non-array witnesses is rejected', () => {
    const bad = { ...makeRecord(), id: 'cr_1', witnesses: 'everyone' } as any;
    expect(() => CampaignJournal.deserialize([bad])).toThrowError(/witnesses/i);
  });

  test('substructure guards apply on the versioned-envelope path too', () => {
    const bad = { ...makeRecord(), id: 'cr_1' } as any;
    delete bad.tick;
    expect(() =>
      CampaignJournal.deserialize({ version: CAMPAIGN_MEMORY_VERSION, records: [bad] }),
    ).toThrowError(/tick/i);
  });
});
