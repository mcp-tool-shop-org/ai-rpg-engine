import { describe, test, expect } from 'vitest';
import { formatRumorForPlayer } from './format.js';
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
