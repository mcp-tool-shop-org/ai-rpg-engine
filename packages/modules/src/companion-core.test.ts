// companion-core contract tests (PM-2 coverage)
//
// Party state, cohesion math, and ability-modifier stacking. Pure functions —
// pins immutability, the party-size gate, and the modifier combination rules.

import { describe, it, expect } from 'vitest';
import { createTestEngine } from '@ai-rpg-engine/core';
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
  createCompanionCore,
  getPartyState,
  COMPANION_TAG,
  companionRoleTag,
  deriveCompanionRole,
  removeCompanionTags,
  refreshCompanionAbilityStatus,
  COMPANION_HP_RECOVERY_STATUS,
} from './companion-core.js';
import { statusCore } from './status-core.js';
import { affiliationOf } from './targeting.js';
import { classifyTag } from './tag-taxonomy.js';

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

// ---------------------------------------------------------------------------
// The recruit verb (F-7d5c3e28 / F-834d0485 / F-cf1ddc9f / F-2fe4be26 /
// F-66cd1cd0) — the write-wire. RED-PROOF: before this wave, NOTHING called
// isCompanionRecruitable/addCompanion in production (grep showed only this
// file's own tests) — an NPC standing next to the player and tagged
// 'recruitable' had no command that added them to the party. These tests
// exercise the real dispatcher (createTestEngine + submitAction), not the
// pure functions directly, so they prove the VERB — not just the library
// underneath it.
// ---------------------------------------------------------------------------

const makePlayer = (overrides?: Partial<EntityState>): EntityState => ({
  id: 'player',
  blueprintId: 'player',
  type: 'player',
  name: 'Hero',
  tags: ['player'],
  stats: { vigor: 5 },
  resources: { hp: 10, stamina: 5 },
  statuses: [],
  zoneId: 'a',
  ...overrides,
});

const makeRecruitable = (id: string, name: string, extraTags: string[], overrides?: Partial<EntityState>): EntityState => ({
  id,
  blueprintId: id,
  type: 'npc',
  name,
  tags: ['npc', 'recruitable', ...extraTags],
  stats: {},
  resources: { hp: 10 },
  statuses: [],
  zoneId: 'a',
  ...overrides,
});

const zones = [
  { id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: ['b'] },
  { id: 'b', roomId: 'test', name: 'B', tags: [], neighbors: ['a'] },
];

describe('createCompanionCore — the recruit verb', () => {
  it('recruits: adds to party (flat namespace), tags companion + companion:<role>, sets a shared faction on both sides', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCompanionCore()],
      entities: [makePlayer(), makeRecruitable('maren', 'Sister Maren', ['healer'])],
      zones,
    });

    const events = engine.submitAction('recruit', { targetIds: ['maren'] });
    expect(events.some((e) => e.type === 'companion.recruited')).toBe(true);
    expect(events.some((e) => e.type === 'action.rejected')).toBe(false);

    // (a) party state — flat, no `party:` wrapper (F-834d0485). This is the
    // EXACT shape director.test.ts / endgame.test.ts already construct.
    const partyNs = engine.world.modules['companion-core'] as { companions: CompanionState[] };
    expect(Array.isArray(partyNs.companions)).toBe(true);
    expect(partyNs.companions).toHaveLength(1);
    expect(partyNs.companions[0]).toMatchObject({ npcId: 'maren', role: 'healer', active: true });
    expect(getPartyState(engine.world).companions[0].npcId).toBe('maren');

    // (b) entity tags (F-2fe4be26).
    const maren = engine.world.entities.maren;
    expect(maren.tags).toContain('companion');
    expect(maren.tags).toContain('companion:healer');
    expect(classifyTag('companion:healer')).toBe('companion'); // tag-taxonomy's own category

    // (c) faction (F-cf1ddc9f) — shared on both sides.
    expect(maren.faction).toBeDefined();
    expect(engine.world.entities.player.faction).toBe(maren.faction);
  });

  it('derives the companion role from the recruit\'s own authored tags (no content changes needed)', () => {
    expect(deriveCompanionRole(makeRecruitable('a', 'A', ['fighter']))).toBe('fighter');
    expect(deriveCompanionRole(makeRecruitable('b', 'B', ['diplomat']))).toBe('diplomat');
    // No recognized role tag → falls back to 'scout', not a rejection.
    expect(deriveCompanionRole(makeRecruitable('c', 'C', []))).toBe('scout');
  });

  it('rejects a target without the recruitable/companion-ready tag', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCompanionCore()],
      entities: [makePlayer(), { ...makeRecruitable('g', 'Guard', []), tags: ['npc', 'hostile'] }],
      zones,
    });
    const events = engine.submitAction('recruit', { targetIds: ['g'] });
    expect(events).toEqual([expect.objectContaining({ type: 'action.rejected' })]);
    expect(getPartyState(engine.world).companions).toHaveLength(0);
    expect(engine.world.entities.g.tags).not.toContain('companion');
  });

  it('rejects when the party is already full (maps AddCompanionResult.reason)', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCompanionCore()],
      entities: [
        makePlayer(),
        makeRecruitable('a', 'A', ['fighter']),
        makeRecruitable('b', 'B', ['scout']),
        makeRecruitable('c', 'C', ['healer']),
        makeRecruitable('d', 'D', ['diplomat']),
      ],
      zones,
    });
    engine.submitAction('recruit', { targetIds: ['a'] });
    engine.submitAction('recruit', { targetIds: ['b'] });
    engine.submitAction('recruit', { targetIds: ['c'] }); // default maxSize 3 — party now full
    const events = engine.submitAction('recruit', { targetIds: ['d'] });
    expect(events[0].payload.reason).toContain('party is full');
    expect(getPartyState(engine.world).companions).toHaveLength(3);
    expect(engine.world.entities.d.tags).not.toContain('companion'); // rejected recruit stays untagged
  });

  it('rejects re-recruiting an already-present companion', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCompanionCore()],
      entities: [makePlayer(), makeRecruitable('maren', 'Sister Maren', ['healer'])],
      zones,
    });
    engine.submitAction('recruit', { targetIds: ['maren'] });
    const events = engine.submitAction('recruit', { targetIds: ['maren'] });
    expect(events[0].payload.reason).toContain('already in your party');
  });

  it('rejects when actor and target are not in the same zone', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCompanionCore()],
      entities: [makePlayer(), makeRecruitable('maren', 'Sister Maren', ['healer'], { zoneId: 'b' })],
      zones,
    });
    const events = engine.submitAction('recruit', { targetIds: ['maren'] });
    expect(events[0].payload.reason).toBe('target not in same zone');
    expect(getPartyState(engine.world).companions).toHaveLength(0);
  });

  it('prefers AUTHORED custom.companionRole/companionAbilities/personalGoal over derived defaults — the shape all 5 starters with recruitable NPCs already write (e.g. starter-fantasy\'s Brother Aldric)', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCompanionCore()],
      entities: [
        makePlayer(),
        makeRecruitable('aldric', 'Brother Aldric', ['healer'], {
          // Mirrors starter-fantasy/src/content.ts's brotherAldric exactly.
          custom: {
            companionRole: 'healer',
            companionAbilities: 'medical-support,witness-calming',
            personalGoal: 'Redeem the fallen brothers of the chapel',
          },
        }),
      ],
      zones,
    });
    engine.submitAction('recruit', { targetIds: ['aldric'] });

    const companion = getPartyState(engine.world).companions[0];
    expect(companion.role).toBe('healer');
    expect(companion.abilityTags).toEqual(['medical-support', 'witness-calming']); // BOTH authored tags, not just the 1-tag default
    expect(companion.personalGoal).toBe('Redeem the fallen brothers of the chapel');
  });

  it('falls back to derived role + the single default ability tag when custom fields are absent (no content changes required)', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCompanionCore()],
      entities: [makePlayer(), makeRecruitable('maren', 'Sister Maren', ['healer'])], // no .custom
      zones,
    });
    engine.submitAction('recruit', { targetIds: ['maren'] });

    const companion = getPartyState(engine.world).companions[0];
    expect(companion.role).toBe('healer'); // from the entity's own 'healer' tag
    expect(companion.abilityTags).toEqual(['medical-support']); // DEFAULT_ROLE_ABILITY_TAG.healer
    expect(companion.personalGoal).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Faction assignment prevents enemy-targeting (F-cf1ddc9f) — the CRITICAL
// proof. EntityState.faction exists specifically so a party JRPG can put PCs
// and recruited NPCs on one side even when their `type` differs.
// targeting.ts's affiliationOf checks faction FIRST; only when faction is
// unset on either side does it fall back to the type heuristic (same `type`
// = ally) — which resolves a recruit ('npc') against the player ('player')
// as an ENEMY. RED-WITHOUT proves the bug this finding describes; GREEN-WITH
// proves the recruit verb's faction write fixes it.
// ---------------------------------------------------------------------------

describe('faction assignment resolves the companion as an ally, not an enemy (F-cf1ddc9f)', () => {
  it('RED — without a faction, the type heuristic resolves a recruited-but-untagged NPC as an ENEMY', () => {
    const player = makePlayer();
    const npc = makeRecruitable('maren', 'Sister Maren', ['healer']); // no .faction set
    expect(affiliationOf(player, npc)).toBe('enemy'); // the bug F-cf1ddc9f describes
  });

  it('GREEN — after recruiting through the verb, the companion resolves as an ALLY, never an enemy', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCompanionCore()],
      entities: [makePlayer(), makeRecruitable('maren', 'Sister Maren', ['healer'])],
      zones,
    });
    engine.submitAction('recruit', { targetIds: ['maren'] });

    const player = engine.world.entities.player;
    const maren = engine.world.entities.maren;
    expect(affiliationOf(player, maren)).toBe('ally');
    expect(affiliationOf(maren, player)).toBe('ally'); // symmetric
    expect(affiliationOf(player, maren)).not.toBe('enemy'); // the assertion the finding asks for
  });

  it('a second recruit shares the SAME faction as the first (idempotent set on the player)', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCompanionCore()],
      entities: [
        makePlayer(),
        makeRecruitable('maren', 'Sister Maren', ['healer']),
        makeRecruitable('aldric', 'Brother Aldric', ['diplomat']),
      ],
      zones,
    });
    engine.submitAction('recruit', { targetIds: ['maren'] });
    engine.submitAction('recruit', { targetIds: ['aldric'] });
    expect(engine.world.entities.maren.faction).toBe(engine.world.entities.aldric.faction);
    expect(affiliationOf(engine.world.entities.maren, engine.world.entities.aldric)).toBe('ally');
  });
});

// ---------------------------------------------------------------------------
// removeCompanionTags — the symmetric departure un-write a companion who
// leaves the party needs, so they stop rendering as one everywhere else.
// ---------------------------------------------------------------------------

describe('removeCompanionTags', () => {
  it('strips exactly the companion + companion:<role> pair, leaving other tags untouched', () => {
    const entity = makeRecruitable('maren', 'Sister Maren', ['healer']);
    entity.tags.push(COMPANION_TAG, companionRoleTag('healer'));
    removeCompanionTags(entity, 'healer');
    expect(entity.tags).not.toContain('companion');
    expect(entity.tags).not.toContain('companion:healer');
    expect(entity.tags).toEqual(['npc', 'recruitable', 'healer']); // originals survive
  });
});

// ---------------------------------------------------------------------------
// Ability-modifier mirror (F-66cd1cd0 / F-a8156c3b) — hpRecoveryBonus
// delivered as a periodic 'heal' status via status-effects.ts's generic
// HoT engine. End-to-end: the status is applied AND actually fires through
// the real dispatcher (statusCore's action.resolved hook), proving this is
// not just an applied-but-inert status object.
// ---------------------------------------------------------------------------

describe('refreshCompanionAbilityStatus', () => {
  it('returns null (nothing to apply, nothing to remove) for an empty party', () => {
    const engine = createTestEngine({ modules: [statusCore], entities: [makePlayer()], zones });
    const result = refreshCompanionAbilityStatus(
      engine.world, createPartyState(), engine.world.entities.player, 0,
    );
    expect(result).toBeNull();
    expect(engine.world.entities.player.statuses).toHaveLength(0);
  });

  it('RED-then-GREEN: recruiting a healer applies the status AND the periodic engine actually heals — not just an applied-but-inert status object', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCompanionCore()],
      entities: [makePlayer({ resources: { hp: 4, stamina: 5, maxHp: 20 } }), makeRecruitable('maren', 'Sister Maren', ['healer'])],
      zones,
    });
    engine.submitAction('recruit', { targetIds: ['maren'] });

    const player = engine.world.entities.player;
    const status = player.statuses.find((s) => s.statusId === COMPANION_HP_RECOVERY_STATUS);
    expect(status).toBeDefined();
    expect(status?.data?.periodicKind).toBe('heal');
    expect(status?.data?.amount).toBe(2); // 'medical-support' → hpRecoveryBonus: 2

    // GREEN: status-core's processPeriodicStatuses fires on `elapsed % period
    // === 0`, which is true at elapsed 0 — the SAME action.resolved hook that
    // ran right after applyStatus already ticked it once (a HoT's
    // immediate-first-pulse semantics, not something this wiring invented).
    // hp is healed WITHOUT any further action — the strongest proof the
    // status is not inert.
    expect(engine.world.entities.player.resources.hp).toBe(6); // 4 + 2, immediately

    // Advance 3 more ticks (periodTicks) via a rejected already-present
    // recruit re-submission — a handled-but-rejected action still fires
    // action.resolved, a valid side-effect-free way to advance the tick
    // without pulling combat-core into this test — and confirm the SECOND
    // pulse lands right on schedule (elapsed 3, 3 % 3 === 0).
    for (let i = 0; i < 3; i++) {
      engine.submitAction('recruit', { targetIds: ['maren'] }); // already-present, rejected
    }
    expect(engine.world.entities.player.resources.hp).toBe(8); // 6 + 2, second pulse at elapsed 3
  });

  it('clears the status when the active roster no longer carries a healer (party empties)', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCompanionCore()],
      entities: [makePlayer(), makeRecruitable('maren', 'Sister Maren', ['healer'])],
      zones,
    });
    engine.submitAction('recruit', { targetIds: ['maren'] });
    expect(engine.world.entities.player.statuses.some((s) => s.statusId === COMPANION_HP_RECOVERY_STATUS)).toBe(true);

    const emptyParty = createPartyState();
    const removeEvent = refreshCompanionAbilityStatus(engine.world, emptyParty, engine.world.entities.player, engine.world.meta.tick);
    expect(removeEvent?.type).toBe('status.removed');
    expect(engine.world.entities.player.statuses.some((s) => s.statusId === COMPANION_HP_RECOVERY_STATUS)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// F-a8156c3b guard fix — a companion ability effect with an explicit 0
// override must still apply (not be silently skipped by a truthy check).
// ---------------------------------------------------------------------------

describe('computeAbilityModifiers — zero-valued effect guard (F-a8156c3b)', () => {
  // Honest scope note: ABILITY_EFFECTS (private to this file) has no
  // zero-valued entries today, so the exact "an explicit 0 override is
  // silently dropped" regression has no real content to reproduce it
  // against through the public API yet — the bug was, in the finding's own
  // words, "fairly characterized as inert while the function had zero
  // callers." What IS independently verifiable here: every additive field
  // now uses the same `!== undefined` guard rumorSpreadScale already used
  // (not `if (effects.field)`), so a future 0-valued effect authored
  // alongside these real ones accumulates correctly rather than vanishing.
  // These tests pin that the real, non-zero entries still stack correctly
  // post-fix (no regression from the truthy → !== undefined change) and
  // that multiple contributions from the SAME field genuinely accumulate
  // (additive, not overwritten) — the property a truthy-skip bug would
  // silently violate the moment any contribution were 0.
  it('every additive field accumulates across multiple companions carrying the same ability (proves summation, not overwrite)', () => {
    const mods = computeAbilityModifiers(['medical-support', 'medical-support']);
    expect(mods.hpRecoveryBonus).toBe(4); // 2 + 2, not 2 (overwrite) or 0 (dropped)
  });

  it('a companion contributing nothing (unrecognized/absent ability) never perturbs the neutral baseline', () => {
    const neutral = computeAbilityModifiers([]);
    expect(neutral).toEqual({
      leverageCostDiscount: 0, hpRecoveryBonus: 0, rumorSpreadScale: 1.0,
      reputationBonus: {}, commerceGainBonus: 0, rumorSuppressionChance: 0, perceptionBonus: 0,
    });
  });
});
