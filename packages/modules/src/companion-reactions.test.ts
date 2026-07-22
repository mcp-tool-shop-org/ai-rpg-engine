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
  REACTION_TRIGGER_STATUS,
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

// ---------------------------------------------------------------------------
// REACTION_TRIGGER_STATUS (F-6be920bd audit) — a static, testable accounting
// of which of the 16 REACTION_TABLE triggers have a real production producer
// today. companion-reactions.ts has no callers of its own — every trigger's
// reachability is decided by world-tick.ts / player-leverage.ts, so this
// ledger can only ever be as fresh as the last audit; the completeness check
// below at least guarantees it can't silently drift out of sync with
// REACTION_TABLE itself (a 17th trigger added there without a matching
// status entry here fails loudly, not silently).
// ---------------------------------------------------------------------------

describe('REACTION_TRIGGER_STATUS (F-6be920bd audit)', () => {
  it('has exactly one status entry per known trigger — no more, no less', () => {
    const statusKeys = Object.keys(REACTION_TRIGGER_STATUS).sort();
    expect(statusKeys).toEqual([...KNOWN_REACTION_TRIGGERS]);
  });

  it('every note is non-empty (no unexplained status)', () => {
    for (const [trigger, status] of Object.entries(REACTION_TRIGGER_STATUS)) {
      expect(status.note.length, `${trigger} has an empty note`).toBeGreaterThan(0);
    }
  });

  it('matches the audited totals: 9 reachable, 1 wired-unreachable, 6 dark', () => {
    const values = Object.values(REACTION_TRIGGER_STATUS);
    expect(values.filter((v) => v.reachability === 'reachable')).toHaveLength(9);
    expect(values.filter((v) => v.reachability === 'wired-unreachable')).toHaveLength(1);
    expect(values.filter((v) => v.reachability === 'dark')).toHaveLength(6);
  });

  it('the wave-2 sources (leverage-social/leverage-rumor, district-grim/district-prosperous) are reachable, alongside the earlier combat/pressure sources', () => {
    const reachable: readonly string[] = [
      'combat-won', 'combat-lost', 'pressure-resolved-badly',
      'district-grim', 'district-prosperous', 'leverage-social', 'leverage-rumor',
    ];
    for (const trigger of reachable) {
      expect(REACTION_TRIGGER_STATUS[trigger as keyof typeof REACTION_TRIGGER_STATUS].reachability).toBe('reachable');
    }
  });

  it('V3-SV-3: leverage-diplomacy and leverage-sabotage flipped from dark to reachable in v3.0 wave 1 "social-verbs" — a real diplomacy/sabotage verb now produces each trigger', () => {
    expect(REACTION_TRIGGER_STATUS['leverage-diplomacy'].reachability).toBe('reachable');
    expect(REACTION_TRIGGER_STATUS['leverage-diplomacy'].note).toMatch(/diplomacy/);
    expect(REACTION_TRIGGER_STATUS['leverage-sabotage'].reachability).toBe('reachable');
    expect(REACTION_TRIGGER_STATUS['leverage-sabotage'].note).toMatch(/sabotage/);
  });

  it('pressure-resolved-well is wired but unreachable (dead branch — the one production call site always passes a different literal)', () => {
    expect(REACTION_TRIGGER_STATUS['pressure-resolved-well'].reachability).toBe('wired-unreachable');
  });

  it('the 6 explicitly-deferred-to-v3.0 triggers (betrayal-witnessed, obligation-betrayed, item-*-recognized) are all dark, not force-wired', () => {
    const dark: readonly string[] = [
      'betrayal-witnessed', 'obligation-betrayed',
      'item-faction-recognized', 'item-stolen-recognized', 'item-cursed-recognized', 'item-trophy-recognized',
    ];
    for (const trigger of dark) {
      expect(REACTION_TRIGGER_STATUS[trigger as keyof typeof REACTION_TRIGGER_STATUS].reachability).toBe('dark');
    }
  });
});
