// companion-core contract tests (PM-2 coverage)
//
// Party state, cohesion math, and ability-modifier stacking. Pure functions —
// pins immutability, the party-size gate, and the modifier combination rules.

import { describe, it, expect } from 'vitest';
import type { EntityState } from '@ai-rpg-engine/core';
import type { CompanionState } from './companion-core.js';
import {
  createPartyState,
  addCompanion,
  removeCompanion,
  getCompanion,
  isCompanion,
  getActiveCompanions,
  setCompanionActive,
  adjustCompanionMorale,
  computePartyCohesion,
  computePartyAbilities,
  isCompanionRecruitable,
  computeAbilityModifiers,
  formatPartyStatusLine,
  formatPartyForDirector,
} from './companion-core.js';

function makeCompanion(npcId: string, overrides?: Partial<CompanionState>): CompanionState {
  return {
    npcId,
    role: 'fighter',
    joinedAtTick: 0,
    abilityTags: [],
    morale: 60,
    active: true,
    ...overrides,
  };
}

describe('party management', () => {
  it('creates an empty party with default max size 3', () => {
    expect(createPartyState()).toEqual({ companions: [], maxSize: 3, cohesion: 0 });
    expect(createPartyState(5).maxSize).toBe(5);
  });

  it('addCompanion adds, recomputes cohesion, and does not mutate the input', () => {
    const empty = createPartyState();
    const party = addCompanion(empty, makeCompanion('mira', { morale: 80 })).party;

    expect(party.companions).toHaveLength(1);
    expect(party.cohesion).toBe(80);
    expect(empty.companions).toHaveLength(0); // immutability
    expect(isCompanion(party, 'mira')).toBe(true);
    expect(getCompanion(party, 'mira')?.npcId).toBe('mira');
  });

  it('rejects duplicates and enforces the party-size cap', () => {
    let party = createPartyState(2);
    party = addCompanion(party, makeCompanion('a')).party;
    const dupe = addCompanion(party, makeCompanion('a'));
    expect(dupe.success).toBe(false);
    expect(dupe.reason).toBe('already-present');
    expect(dupe.party).toBe(party); // unchanged reference — no-op

    party = addCompanion(party, makeCompanion('b')).party;
    const overflow = addCompanion(party, makeCompanion('c'));
    expect(overflow.success).toBe(false);
    expect(overflow.reason).toBe('party-full');
    expect(overflow.party.companions.map((c) => c.npcId)).toEqual(['a', 'b']);
  });

  it('removeCompanion returns the removed companion and recomputes cohesion', () => {
    let party = createPartyState();
    party = addCompanion(party, makeCompanion('a', { morale: 100 })).party;
    party = addCompanion(party, makeCompanion('b', { morale: 50 })).party;
    expect(party.cohesion).toBe(75);

    const { party: after, removed } = removeCompanion(party, 'a');
    expect(removed?.npcId).toBe('a');
    expect(after.cohesion).toBe(50);

    const missing = removeCompanion(after, 'ghost');
    expect(missing.removed).toBeUndefined();
    expect(missing.party).toBe(after);
  });

  it('cohesion averages ACTIVE companions only (0 with none active)', () => {
    let party = createPartyState();
    party = addCompanion(party, makeCompanion('a', { morale: 100 })).party;
    party = addCompanion(party, makeCompanion('b', { morale: 20 })).party;
    expect(computePartyCohesion(party)).toBe(60);

    party = setCompanionActive(party, 'b', false);
    expect(party.cohesion).toBe(100);
    expect(getActiveCompanions(party).map((c) => c.npcId)).toEqual(['a']);

    party = setCompanionActive(party, 'a', false);
    expect(party.cohesion).toBe(0);
  });

  it('adjustCompanionMorale clamps to 0-100', () => {
    let party = addCompanion(createPartyState(), makeCompanion('a', { morale: 95 })).party;
    party = adjustCompanionMorale(party, 'a', +20);
    expect(getCompanion(party, 'a')?.morale).toBe(100);
    party = adjustCompanionMorale(party, 'a', -150);
    expect(getCompanion(party, 'a')?.morale).toBe(0);
  });

  it('computePartyAbilities unions active companions and dedups tags', () => {
    let party = createPartyState();
    party = addCompanion(party, makeCompanion('a', { abilityTags: ['medical-support', 'trade-advantage'] })).party;
    party = addCompanion(party, makeCompanion('b', { abilityTags: ['medical-support'] })).party;
    party = addCompanion(party, makeCompanion('c', { abilityTags: ['rumor-suppression'], active: false })).party;

    const abilities = computePartyAbilities(party);
    expect(abilities.sort()).toEqual(['medical-support', 'trade-advantage']);
  });

  // F-f0ca0e51: addCompanion used to silently return the unchanged `party`
  // object (no signal of any kind) when the party was already at maxSize or
  // the companion was already present — a caller couldn't distinguish
  // "companion added" from "nothing happened" without separately comparing
  // party.companions.length before and after, unlike every comparable
  // state-changing operation elsewhere in this package (UnlockResult,
  // resolveCraft/resolveRepair/resolveModify, LeverageResolution, ...).
  describe('addCompanion result', () => {
    it('returns { success: true } and the updated party when the add succeeds', () => {
      const result = addCompanion(createPartyState(), makeCompanion('mira'));
      expect(result.success).toBe(true);
      expect(result.reason).toBeUndefined();
      expect(result.party.companions).toHaveLength(1);
    });

    it('returns { success: false, reason: "party-full" } when the party is at maxSize, with the party reference unchanged', () => {
      const full = addCompanion(createPartyState(1), makeCompanion('a')).party;
      const result = addCompanion(full, makeCompanion('b'));
      expect(result.success).toBe(false);
      expect(result.reason).toBe('party-full');
      expect(result.party).toBe(full);
    });

    it('returns { success: false, reason: "already-present" } for a duplicate npcId, with the party reference unchanged', () => {
      const withA = addCompanion(createPartyState(), makeCompanion('a')).party;
      const result = addCompanion(withA, makeCompanion('a'));
      expect(result.success).toBe(false);
      expect(result.reason).toBe('already-present');
      expect(result.party).toBe(withA);
    });
  });

  it('isCompanionRecruitable keys off recruitable/companion-ready tags', () => {
    const makeNpc = (tags: string[]): EntityState => ({
      id: 'npc', blueprintId: 'npc', type: 'npc', name: 'NPC', tags,
      stats: {}, resources: { hp: 10 }, statuses: [],
    });
    expect(isCompanionRecruitable(makeNpc(['recruitable']))).toBe(true);
    expect(isCompanionRecruitable(makeNpc(['companion-ready']))).toBe(true);
    expect(isCompanionRecruitable(makeNpc(['hostile']))).toBe(false);
  });
});

describe('computeAbilityModifiers', () => {
  it('returns neutral modifiers for no abilities', () => {
    expect(computeAbilityModifiers([])).toEqual({
      leverageCostDiscount: 0,
      hpRecoveryBonus: 0,
      rumorSpreadScale: 1.0,
      reputationBonus: {},
      commerceGainBonus: 0,
      rumorSuppressionChance: 0,
      perceptionBonus: 0,
    });
  });

  it('stacks additive discounts across abilities', () => {
    const mods = computeAbilityModifiers(['intimidation-backup', 'smuggling-contact']);
    expect(mods.leverageCostDiscount).toBe(2);
  });

  it('combines rumor suppression as probabilities, not addition', () => {
    const mods = computeAbilityModifiers(['rumor-suppression', 'rumor-suppression']);
    // 1 - (1-0.3)(1-0.3) = 0.51
    expect(mods.rumorSuppressionChance).toBeCloseTo(0.51, 10);
  });

  it('multiplies rumor spread scale', () => {
    const mods = computeAbilityModifiers(['witness-calming', 'witness-calming']);
    expect(mods.rumorSpreadScale).toBeCloseTo(0.49, 10);
  });

  it('faction-route grants +10 reputation per companion faction', () => {
    const mods = computeAbilityModifiers(['faction-route'], { mira: 'watch', tobin: 'watch', sable: null });
    expect(mods.reputationBonus).toEqual({ watch: 20 });
  });
});

describe('formatting', () => {
  it('status line lists active companions with cohesion, undefined when solo', () => {
    expect(formatPartyStatusLine(createPartyState(), {})).toBeUndefined();

    const party = addCompanion(createPartyState(), makeCompanion('mira', { morale: 70 })).party;
    const line = formatPartyStatusLine(party, { mira: 'Mira' });
    expect(line).toContain('Mira (fighter, morale 70)');
    expect(line).toContain('Cohesion: 70');
  });

  it('director view renders roster details and departure risks', () => {
    const party = addCompanion(createPartyState(), makeCompanion('mira', {
      morale: 25, abilityTags: ['medical-support'], personalGoal: 'Find her brother',
    })).party;
    const text = formatPartyForDirector(
      party,
      [{ npcId: 'mira', name: 'Mira', breakpoint: 'wavering', goals: [{ label: 'Repay debt', priority: 0.7 }] }],
      { mira: { risk: 'medium', reason: 'Morale low, relationship wavering' } },
    );
    expect(text).toContain('Mira (mira)');
    expect(text).toContain('medical-support');
    expect(text).toContain('Departure risk: medium');
    expect(text).toContain('Personal goal: Find her brother');
  });
});
