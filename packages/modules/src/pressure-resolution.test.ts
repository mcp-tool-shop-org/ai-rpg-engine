// pressure-resolution contract tests (PM-2 coverage)
//
// The universal + genre fallout tables feed reputation/economy/chain-pressure
// mutations. Pins representative table entries, the resolution metadata, the
// unknown-kind/genre loudness (PM-5), and determinism.

import { describe, it, expect } from 'vitest';
import type { WorldPressure, PressureKind } from './pressure-system.js';
import {
  computeFallout,
  formatFalloutForDirector,
  formatFalloutForNarrator,
} from './pressure-resolution.js';

function makePressure(kind: PressureKind, overrides?: Partial<WorldPressure>): WorldPressure {
  return {
    id: 'p1',
    kind,
    sourceFactionId: 'watch',
    description: 'test pressure',
    triggeredBy: 'test',
    urgency: 0.5,
    visibility: 'known',
    turnsRemaining: 3,
    potentialOutcomes: [],
    tags: [],
    createdAtTick: 0,
    ...overrides,
  };
}

const ctx = { resolvedBy: 'player', currentTick: 42, playerDistrictId: 'market' };

describe('computeFallout — universal table', () => {
  it('bounty-issued resolved-by-player: rep +20, heroic rumor, title trigger', () => {
    const fallout = computeFallout(makePressure('bounty-issued'), 'resolved-by-player', 'fantasy', ctx);

    expect(fallout.effects).toContainEqual({ type: 'reputation', factionId: 'watch', delta: 20 });
    expect(fallout.effects).toContainEqual({
      type: 'rumor', claim: 'cleared the bounty', valence: 'heroic', spreadTo: ['watch'],
    });
    expect(fallout.effects).toContainEqual({ type: 'title-trigger', tag: 'bounty-survivor' });
    expect(fallout.warnings).toBeUndefined();
  });

  it('bounty-issued expired-ignored: rep -10, alert +10, chains a revenge-attempt', () => {
    const fallout = computeFallout(makePressure('bounty-issued'), 'expired-ignored', 'fantasy', ctx);

    expect(fallout.effects).toContainEqual({ type: 'reputation', factionId: 'watch', delta: -10 });
    expect(fallout.effects).toContainEqual({ type: 'alert', factionId: 'watch', delta: 10 });
    const chain = fallout.effects.find((e) => e.type === 'spawn-pressure');
    expect(chain).toMatchObject({ kind: 'revenge-attempt', sourceFactionId: 'watch', urgency: 0.6 });
  });

  it('investigation-opened escalated: chains a bounty and raises alert', () => {
    const fallout = computeFallout(makePressure('investigation-opened'), 'escalated', 'fantasy', ctx);
    const chain = fallout.effects.find((e) => e.type === 'spawn-pressure');
    expect(chain).toMatchObject({ kind: 'bounty-issued' });
    expect(fallout.effects).toContainEqual({ type: 'alert', factionId: 'watch', delta: 15 });
  });

  it('supply-crisis resolved-by-player restores district economy', () => {
    const fallout = computeFallout(makePressure('supply-crisis'), 'resolved-by-player', 'fantasy', ctx);
    expect(fallout.effects).toContainEqual({
      type: 'economy-shift', districtId: 'market', category: 'food', delta: 15, cause: 'crisis resolved',
    });
    expect(fallout.effects).toContainEqual({
      type: 'economy-shift', districtId: 'market', category: 'medicine', delta: 10, cause: 'crisis resolved',
    });
  });

  it('district effects are skipped without playerDistrictId (graceful degradation)', () => {
    const fallout = computeFallout(makePressure('supply-crisis'), 'expired-ignored', 'fantasy', {
      resolvedBy: 'expiry', currentTick: 42,
    });
    expect(fallout.effects.filter((e) => e.type === 'district' || e.type === 'economy-shift')).toEqual([]);
  });
});

describe('computeFallout — genre tables', () => {
  it('fantasy heresy-whisper expired-ignored chains a chapel-sanction', () => {
    const fallout = computeFallout(makePressure('heresy-whisper'), 'expired-ignored', 'fantasy', ctx);
    const chain = fallout.effects.find((e) => e.type === 'spawn-pressure');
    expect(chain).toMatchObject({ kind: 'chapel-sanction', sourceFactionId: 'watch' });
    expect(fallout.warnings).toBeUndefined();
  });

  it('horror and post-apocalyptic share the horror table', () => {
    const horror = computeFallout(makePressure('camp-panic'), 'resolved-by-player', 'horror', ctx);
    const postApoc = computeFallout(makePressure('camp-panic'), 'resolved-by-player', 'post-apocalyptic', ctx);
    expect(horror.effects).toEqual(postApoc.effects);
    expect(horror.effects).toContainEqual({ type: 'milestone-tag', tag: 'leader' });
  });

  it('cyberpunk corp-manhunt resolved-by-player grants the ghost title', () => {
    const fallout = computeFallout(makePressure('corp-manhunt'), 'resolved-by-player', 'cyberpunk', ctx);
    expect(fallout.effects).toContainEqual({ type: 'title-trigger', tag: 'ghost' });
  });
});

describe('computeFallout — loud no-op guard (PM-5)', () => {
  it('warns when a genre kind resolves under a TYPO genre (fallout would silently vanish)', () => {
    const fallout = computeFallout(makePressure('heresy-whisper'), 'expired-ignored', 'fantsy', ctx);
    expect(fallout.effects).toEqual([]);
    expect(fallout.warnings).toBeDefined();
    expect(fallout.warnings![0]).toContain("'heresy-whisper'");
    expect(fallout.warnings![0]).toContain("'fantsy'");
    expect(fallout.warnings![0]).toContain('zero effects');
  });

  it('warns when a genre kind resolves under the WRONG genre table', () => {
    const fallout = computeFallout(makePressure('mutiny-brewing'), 'resolved-by-player', 'mystery', ctx);
    expect(fallout.effects).toEqual([]);
    expect(fallout.warnings).toBeDefined();
  });

  it('does NOT warn when a universal kind resolves under an unknown genre (universal covers it)', () => {
    const fallout = computeFallout(makePressure('bounty-issued'), 'resolved-by-player', 'western', ctx);
    expect(fallout.effects.length).toBeGreaterThan(0);
    expect(fallout.warnings).toBeUndefined();
  });

  it('does NOT warn for a known kind whose resolution type intentionally maps to nothing', () => {
    // bounty-issued has a universal entry; 'transformed' just has no effects.
    const fallout = computeFallout(makePressure('bounty-issued'), 'transformed', 'fantasy', ctx);
    expect(fallout.effects).toEqual([]);
    expect(fallout.warnings).toBeUndefined();
  });
});

describe('resolution metadata + formatting + determinism', () => {
  it('carries pressure id, kind, resolver, tick, and visibility (with override)', () => {
    const fallout = computeFallout(makePressure('faction-summons'), 'resolved-by-player', 'fantasy', {
      ...ctx, resolutionVisibility: 'public',
    });
    expect(fallout.resolution).toEqual({
      pressureId: 'p1',
      pressureKind: 'faction-summons',
      resolutionType: 'resolved-by-player',
      resolvedBy: 'player',
      resolvedAtTick: 42,
      resolutionVisibility: 'public',
    });
    // Without the override, the pressure's own visibility flows through.
    const plain = computeFallout(makePressure('faction-summons'), 'resolved-by-player', 'fantasy', ctx);
    expect(plain.resolution.resolutionVisibility).toBe('known');
  });

  it('builds a human summary per resolution type', () => {
    expect(computeFallout(makePressure('trade-war'), 'expired-ignored', 'fantasy', ctx).summary)
      .toBe('trade war expired without resolution');
    expect(computeFallout(makePressure('trade-war'), 'resolved-by-faction', 'fantasy', ctx).summary)
      .toBe('trade war resolved by watch');
  });

  it('director + narrator formatters render every effect kind without throwing', () => {
    const fallout = computeFallout(makePressure('bounty-issued'), 'expired-ignored', 'fantasy', ctx);
    const director = formatFalloutForDirector(fallout);
    expect(director).toContain('[bounty-issued]');
    expect(director).toContain('Effects:');
    expect(formatFalloutForNarrator(fallout)).toContain('bounty-issued expired-ignored');
  });

  it('is deterministic — identical inputs produce identical fallout', () => {
    const a = computeFallout(makePressure('camp-panic'), 'expired-ignored', 'horror', ctx);
    const b = computeFallout(makePressure('camp-panic'), 'expired-ignored', 'horror', ctx);
    expect(a).toEqual(b);
  });
});
