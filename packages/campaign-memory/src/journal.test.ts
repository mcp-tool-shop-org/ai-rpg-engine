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
});
