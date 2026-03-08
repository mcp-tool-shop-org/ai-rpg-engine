import { describe, it, expect } from 'vitest';
import {
  recordItemEvent,
  getItemHistory,
  getItemKillCount,
  getItemAge,
  hasItemEvent,
} from './item-chronicle.js';

describe('recordItemEvent', () => {
  it('adds an event to an empty chronicle', () => {
    const result = recordItemEvent({}, 'sword-1', {
      event: 'acquired',
      detail: 'Found in dungeon',
      zoneId: 'zone-1',
    }, 10);

    expect(result['sword-1']).toHaveLength(1);
    expect(result['sword-1'][0]).toEqual({
      event: 'acquired',
      tick: 10,
      detail: 'Found in dungeon',
      zoneId: 'zone-1',
    });
  });

  it('appends to existing chronicle', () => {
    const existing = {
      'sword-1': [{ event: 'acquired' as const, tick: 5, detail: 'Found' }],
    };
    const result = recordItemEvent(existing, 'sword-1', {
      event: 'used-in-kill',
      detail: 'Slew a goblin',
    }, 15);

    expect(result['sword-1']).toHaveLength(2);
    expect(result['sword-1'][1].event).toBe('used-in-kill');
    expect(result['sword-1'][1].tick).toBe(15);
  });

  it('does not mutate original chronicle', () => {
    const original = { 'sword-1': [{ event: 'acquired' as const, tick: 1, detail: 'Found' }] };
    const result = recordItemEvent(original, 'sword-1', {
      event: 'used-in-kill',
      detail: 'Kill',
    }, 10);

    expect(original['sword-1']).toHaveLength(1);
    expect(result['sword-1']).toHaveLength(2);
  });

  it('adds events for different items independently', () => {
    let chronicle = recordItemEvent({}, 'sword-1', { event: 'acquired', detail: 'A' }, 1);
    chronicle = recordItemEvent(chronicle, 'shield-1', { event: 'acquired', detail: 'B' }, 2);

    expect(chronicle['sword-1']).toHaveLength(1);
    expect(chronicle['shield-1']).toHaveLength(1);
  });
});

describe('getItemHistory', () => {
  it('returns empty array for unknown items', () => {
    expect(getItemHistory({}, 'missing')).toEqual([]);
  });

  it('returns all entries for an item', () => {
    const chronicle = {
      'sword-1': [
        { event: 'acquired' as const, tick: 1, detail: 'Found' },
        { event: 'used-in-kill' as const, tick: 5, detail: 'Kill 1' },
      ],
    };
    expect(getItemHistory(chronicle, 'sword-1')).toHaveLength(2);
  });
});

describe('getItemKillCount', () => {
  it('returns 0 for items with no kills', () => {
    const chronicle = {
      'sword-1': [{ event: 'acquired' as const, tick: 1, detail: 'Found' }],
    };
    expect(getItemKillCount(chronicle, 'sword-1')).toBe(0);
  });

  it('counts only used-in-kill events', () => {
    const chronicle = {
      'sword-1': [
        { event: 'acquired' as const, tick: 1, detail: 'Found' },
        { event: 'used-in-kill' as const, tick: 5, detail: 'Kill 1' },
        { event: 'recognized' as const, tick: 8, detail: 'Noticed' },
        { event: 'used-in-kill' as const, tick: 10, detail: 'Kill 2' },
        { event: 'used-in-kill' as const, tick: 15, detail: 'Kill 3' },
      ],
    };
    expect(getItemKillCount(chronicle, 'sword-1')).toBe(3);
  });
});

describe('getItemAge', () => {
  it('returns 0 for items with no acquired event', () => {
    expect(getItemAge({}, 'sword-1', 100)).toBe(0);
  });

  it('computes age from first acquired event', () => {
    const chronicle = {
      'sword-1': [
        { event: 'acquired' as const, tick: 20, detail: 'Found' },
        { event: 'used-in-kill' as const, tick: 50, detail: 'Kill' },
      ],
    };
    expect(getItemAge(chronicle, 'sword-1', 100)).toBe(80);
  });
});

describe('hasItemEvent', () => {
  it('returns false for missing items', () => {
    expect(hasItemEvent({}, 'missing', 'acquired')).toBe(false);
  });

  it('returns true when event exists', () => {
    const chronicle = {
      'sword-1': [
        { event: 'acquired' as const, tick: 1, detail: 'Found' },
        { event: 'cursed' as const, tick: 10, detail: 'Cursed by witch' },
      ],
    };
    expect(hasItemEvent(chronicle, 'sword-1', 'cursed')).toBe(true);
    expect(hasItemEvent(chronicle, 'sword-1', 'acquired')).toBe(true);
  });

  it('returns false when event type is absent', () => {
    const chronicle = {
      'sword-1': [{ event: 'acquired' as const, tick: 1, detail: 'Found' }],
    };
    expect(hasItemEvent(chronicle, 'sword-1', 'used-in-kill')).toBe(false);
  });
});
