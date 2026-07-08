// companion-reactions contract tests (PM-2 coverage)
//
// Role-based morale responses drive whether companions stay or leave. Pins the
// reaction table contract, departure thresholds, hint determinism, and the
// unknown-trigger loudness (PM-5).

import { describe, it, expect } from 'vitest';
import type { CompanionState } from './companion-core.js';
import type { LoyaltyBreakpoint } from './npc-agency.js';
import {
  evaluateCompanionReactions,
  evaluateDepartureRisk,
  isKnownReactionTrigger,
  KNOWN_REACTION_TRIGGERS,
} from './companion-reactions.js';

function makeCompanion(overrides?: Partial<CompanionState>): CompanionState {
  return {
    npcId: 'mira',
    role: 'fighter',
    joinedAtTick: 0,
    abilityTags: [],
    morale: 50,
    active: true,
    ...overrides,
  };
}

describe('evaluateCompanionReactions', () => {
  it('applies role-specific deltas from the reaction table', () => {
    const companions = [
      makeCompanion({ npcId: 'mira', role: 'fighter' }),
      makeCompanion({ npcId: 'sable', role: 'diplomat' }),
    ];
    const reactions = evaluateCompanionReactions(companions, 'leverage-sabotage', { tick: 1 });

    // fighter delta is 0 → no reaction emitted; diplomat -5 → emitted.
    expect(reactions).toHaveLength(1);
    expect(reactions[0]).toMatchObject({ npcId: 'sable', trigger: 'leverage-sabotage', moraleDelta: -5 });
    expect(reactions[0].narratorHint.length).toBeGreaterThan(0);
  });

  it('skips inactive companions', () => {
    const reactions = evaluateCompanionReactions(
      [makeCompanion({ active: false, role: 'fighter' })],
      'combat-won',
      { tick: 1 },
    );
    expect(reactions).toEqual([]);
  });

  it('marks departure when projected morale ≤ 10 and the breakpoint is hostile/wavering', () => {
    const breakpoints = new Map<string, LoyaltyBreakpoint>([
      ['mira', 'hostile'],
      ['sable', 'wavering'],
      ['tobin', 'favorable'],
    ]);
    const companions = [
      makeCompanion({ npcId: 'mira', role: 'diplomat', morale: 12 }),  // 12 - 8 = 4 → departs
      makeCompanion({ npcId: 'sable', role: 'diplomat', morale: 12 }), // wavering → departs
      makeCompanion({ npcId: 'tobin', role: 'diplomat', morale: 12 }), // favorable → stays
    ];
    const reactions = evaluateCompanionReactions(companions, 'betrayal-witnessed', { tick: 3, breakpoints });

    const byId = Object.fromEntries(reactions.map((r) => [r.npcId, r]));
    expect(byId.mira.departure).toBe(true);
    expect(byId.mira.departureReason).toBe('lost all faith in you');
    expect(byId.sable.departure).toBe(true);
    expect(byId.sable.departureReason).toBe('can no longer follow this path');
    expect(byId.tobin.departure).toBeUndefined();
  });

  it('no departure when morale stays above 10 even with a hostile breakpoint', () => {
    const breakpoints = new Map<string, LoyaltyBreakpoint>([['mira', 'hostile']]);
    const reactions = evaluateCompanionReactions(
      [makeCompanion({ npcId: 'mira', role: 'fighter', morale: 60 })],
      'combat-lost',
      { tick: 1, breakpoints },
    );
    expect(reactions[0].departure).toBeUndefined();
  });

  it('picks hints deterministically from tick + npc id, positive vs negative pools', () => {
    const companion = makeCompanion({ npcId: 'mira', role: 'scholar' });
    const a = evaluateCompanionReactions([companion], 'pressure-resolved-well', { tick: 7 });
    const b = evaluateCompanionReactions([companion], 'pressure-resolved-well', { tick: 7 });
    expect(a).toEqual(b);
    expect(a[0].moraleDelta).toBeGreaterThan(0);

    const negative = evaluateCompanionReactions([companion], 'pressure-resolved-badly', { tick: 7 });
    expect(negative[0].moraleDelta).toBeLessThan(0);
  });

  it('returns [] AND reports through onWarning for an unknown trigger (PM-5 loud no-op)', () => {
    const warnings: string[] = [];
    const reactions = evaluateCompanionReactions(
      [makeCompanion()],
      'combat-win', // typo for 'combat-won'
      { tick: 1, onWarning: (m) => warnings.push(m) },
    );

    expect(reactions).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("'combat-win'");
    expect(warnings[0]).toContain('combat-won'); // the known list names the fix
  });

  it('does not warn for known triggers', () => {
    const warnings: string[] = [];
    evaluateCompanionReactions([makeCompanion()], 'combat-won', { tick: 1, onWarning: (m) => warnings.push(m) });
    expect(warnings).toEqual([]);
  });
});

describe('trigger registry', () => {
  it('KNOWN_REACTION_TRIGGERS is sorted and matches the predicate', () => {
    expect(KNOWN_REACTION_TRIGGERS.length).toBeGreaterThanOrEqual(16);
    expect([...KNOWN_REACTION_TRIGGERS]).toEqual([...KNOWN_REACTION_TRIGGERS].sort());
    for (const trigger of KNOWN_REACTION_TRIGGERS) {
      expect(isKnownReactionTrigger(trigger)).toBe(true);
    }
    expect(isKnownReactionTrigger('combat-won')).toBe(true);
    expect(isKnownReactionTrigger('combat-win')).toBe(false);
    expect(isKnownReactionTrigger('')).toBe(false);
  });
});

describe('evaluateDepartureRisk thresholds', () => {
  it('none above morale 50', () => {
    expect(evaluateDepartureRisk(makeCompanion({ morale: 51 }))).toEqual({ risk: 'none' });
  });

  it('high at critical morale with a hostile or wavering breakpoint', () => {
    expect(evaluateDepartureRisk(makeCompanion({ morale: 10 }), 'hostile').risk).toBe('high');
    expect(evaluateDepartureRisk(makeCompanion({ morale: 5 }), 'wavering').risk).toBe('high');
  });

  it('medium at critical morale without a bad breakpoint', () => {
    expect(evaluateDepartureRisk(makeCompanion({ morale: 10 })).risk).toBe('medium');
  });

  it('medium at low morale with a bad breakpoint, low otherwise', () => {
    expect(evaluateDepartureRisk(makeCompanion({ morale: 25 }), 'wavering').risk).toBe('medium');
    expect(evaluateDepartureRisk(makeCompanion({ morale: 25 })).risk).toBe('low');
  });

  it('low in the 30-50 band only when hostile', () => {
    expect(evaluateDepartureRisk(makeCompanion({ morale: 40 }), 'hostile').risk).toBe('low');
    expect(evaluateDepartureRisk(makeCompanion({ morale: 40 })).risk).toBe('none');
  });
});
