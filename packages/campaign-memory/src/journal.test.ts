import { describe, test, expect } from 'vitest';
import { CampaignJournal } from './journal.js';
import type { CampaignRecord } from './types.js';

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
    expect(serialized).toHaveLength(2);

    const restored = CampaignJournal.deserialize(serialized);
    expect(restored.size()).toBe(2);
    expect(restored.get(serialized[0].id)).toBeDefined();
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
});
