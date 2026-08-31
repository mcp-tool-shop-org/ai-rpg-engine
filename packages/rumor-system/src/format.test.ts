import { describe, test, expect } from 'vitest';
import { formatRumorForPlayer, formatRumorBoard } from './format.js';
import type { Rumor } from './types.js';

function rumor(overrides: Partial<Rumor> = {}): Rumor {
  return {
    id: 'rum_1',
    claim: 'player killed merchant_1',
    subject: 'player',
    key: 'killed_merchant',
    value: true,
    originalValue: true,
    sourceId: 'guard_1',
    originTick: 42,
    confidence: 0.9,
    emotionalCharge: -0.7,
    spreadPath: ['guard_1'],
    mutationCount: 0,
    factionUptake: [],
    status: 'spreading',
    lastSpreadTick: 42,
    ...overrides,
  };
}

describe('formatRumorForPlayer (F-9d1fac77)', () => {
  test('unmutated claim is spoken with humanized ids, raw claim stays the sim record', () => {
    const r = rumor();
    const view = formatRumorForPlayer(r);
    expect(view.spoken).toBe('Player killed merchant');
    expect(view.status).toBe('spreading');
    expect(view.confidencePct).toBe(90);
    expect(view.charge).toBe(-0.7);
    expect(view.hops).toBe(0);
    expect(view.mutated).toBe(false);
    expect(r.claim).toBe('player killed merchant_1');
  });

  test('exaggerated numeric value interpolates into the README slaughter line', () => {
    const r = rumor({
      value: 5,
      originalValue: 1,
      mutationCount: 1,
    });
    const view = formatRumorForPlayer(r, {
      resolveName: (id) => (id === 'player' ? 'The player' : id === 'merchant_1' ? 'merchant' : id),
    });
    expect(view.spoken).toBe('The player slaughtered five merchants');
    expect(view.mutated).toBe(true);
    expect(r.claim).toBe('player killed merchant_1');
  });

  test('minimize rewrites killed to fought with the mutated quantity', () => {
    const r = rumor({ value: 3, originalValue: 5, mutationCount: 1 });
    const view = formatRumorForPlayer(r);
    expect(view.spoken).toBe('Player fought three merchants');
  });

  test('inverted boolean flips killed to spared', () => {
    const r = rumor({ value: false, originalValue: true, mutationCount: 1 });
    const view = formatRumorForPlayer(r);
    expect(view.spoken).toBe('Player spared merchant');
    expect(view.mutated).toBe(true);
  });

  test('numeric token in the claim is replaced with the mutated value', () => {
    const r = rumor({
      claim: 'he dealt 10 damage',
      value: 15,
      originalValue: 10,
      mutationCount: 1,
    });
    const view = formatRumorForPlayer(r);
    expect(view.spoken).toBe('He dealt 15 damage');
  });

  test('reports hops, factions, and clone-safe arrays', () => {
    const r = rumor({
      spreadPath: ['guard_1', 'guard_2', 'player'],
      factionUptake: ['town_guard'],
      confidence: 0.42,
    });
    const view = formatRumorForPlayer(r);
    expect(view.hops).toBe(2);
    expect(view.factions).toEqual(['town_guard']);
    expect(view.confidencePct).toBe(42);
    view.factions.push('spies');
    expect(r.factionUptake).toEqual(['town_guard']);
  });
});

describe('formatRumorBoard (F-823e0edf)', () => {
  test('collapses (subject, key) to the highest-confidence row with witness count', () => {
    const low = rumor({
      id: 'rum_low',
      confidence: 0.4,
      sourceId: 'guard_1',
      spreadPath: ['guard_1'],
    });
    const high = rumor({
      id: 'rum_high',
      confidence: 0.9,
      sourceId: 'priest_1',
      spreadPath: ['priest_1', 'innkeep'],
    });
    const other = rumor({
      id: 'rum_other',
      subject: 'merchant',
      key: 'missing',
      claim: 'merchant_1 fled town',
      sourceId: 'beggar',
      spreadPath: ['beggar'],
      confidence: 0.5,
    });
    const board = formatRumorBoard([low, high, other]);
    expect(board).toHaveLength(2);
    const killed = board.find((line) => line.key === 'killed_merchant');
    expect(killed?.spoken).toBe('Player killed merchant');
    expect(killed?.witnessCount).toBe(3);
    expect(killed?.denied).toBe(false);
    expect(killed?.denialLine).toBeUndefined();
    expect(killed?.confidencePct).toBe(90);
  });

  test('sets denied + denialLine when the winning value is inverted', () => {
    const denied = rumor({
      value: false,
      originalValue: true,
      mutationCount: 1,
      spreadPath: ['guard_1', 'priest_1'],
    });
    const board = formatRumorBoard([denied], {
      resolveName: (id) => (id === 'player' ? 'The player' : id === 'merchant_1' ? 'merchant' : id),
    });
    expect(board).toHaveLength(1);
    expect(board[0].denied).toBe(true);
    expect(board[0].spoken).toBe('The player spared merchant');
    expect(board[0].denialLine).toBe('The player spared merchant');
    expect(board[0].witnessCount).toBe(2);
  });

  test('omits dead rumors unless includeDead, then flags them as denied', () => {
    const live = rumor({ id: 'live', status: 'spreading' });
    const dead = rumor({
      id: 'dead',
      status: 'dead',
      key: 'cursed',
      claim: 'player is cursed',
      sourceId: 'priest_1',
      spreadPath: ['priest_1'],
    });
    expect(formatRumorBoard([live, dead])).toHaveLength(1);
    const withDead = formatRumorBoard([live, dead], { includeDead: true });
    expect(withDead).toHaveLength(2);
    const cursed = withDead.find((line) => line.key === 'cursed');
    expect(cursed?.denied).toBe(true);
    expect(cursed?.denialLine).toBe('Player is cursed');
    expect(cursed?.status).toBe('dead');
  });

  test('attaches believed/doubted stance for an entity (F-959f6ee9)', () => {
    const high = rumor({ id: 'rum_high', confidence: 0.9 });
    const other = rumor({
      id: 'rum_other',
      subject: 'merchant',
      key: 'missing',
      claim: 'merchant_1 fled town',
      confidence: 0.5,
    });
    const board = formatRumorBoard([high, other], {
      entityId: 'player',
      stances: { rum_high: 'believe', rum_other: 'doubt' },
    });
    const killed = board.find((line) => line.key === 'killed_merchant');
    const missing = board.find((line) => line.key === 'missing');
    expect(killed?.stance).toBe('believe');
    expect(killed?.believed).toBe(true);
    expect(killed?.doubted).toBe(false);
    expect(missing?.stance).toBe('doubt');
    expect(missing?.believed).toBe(false);
    expect(missing?.doubted).toBe(true);
  });
});
