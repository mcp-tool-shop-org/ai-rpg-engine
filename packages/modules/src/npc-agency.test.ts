import { describe, it, expect } from 'vitest';
import { createTestEngine } from '@ai-rpg-engine/core';
import type { EntityState } from '@ai-rpg-engine/core';
import { createCognitionCore } from './cognition-core.js';
import { createFactionCognition } from './faction-cognition.js';
import {
  buildNpcProfile,
  deriveNpcRelationship,
  deriveLoyaltyBreakpoint,
  createObligation,
  buildConsequenceChain,
  getNetObligationWeight,
  isNamedNpc,
  runNpcAgencyTick,
  buildAllNpcProfiles,
  setPersistedNpcState,
  getPersistedNpcProfiles,
  getPersistedNpcLastActions,
  getPersistedNpcObligations,
} from './npc-agency.js';
import type { NpcObligationLedger } from './npc-agency.js';
import { makePressure, type WorldPressure } from './pressure-system.js';
import { createCompanionCore, syncCompanionCustomFields } from './companion-core.js';
import { statusCore } from './status-core.js';

const makePlayer = (zoneId: string): EntityState => ({
  id: 'player',
  blueprintId: 'player',
  type: 'player',
  name: 'Hero',
  tags: ['player'],
  stats: { vigor: 5, instinct: 5 },
  resources: { hp: 20, stamina: 5 },
  statuses: [],
  zoneId,
});

const makeNamedNpc = (id: string, name: string, zoneId: string, overrides?: Partial<EntityState>): EntityState => ({
  id,
  blueprintId: id,
  type: 'npc',
  name,
  tags: ['npc'],
  stats: { vigor: 5, instinct: 5 },
  resources: { hp: 20, stamina: 5 },
  statuses: [],
  zoneId,
  ai: { profileId: 'cautious', goals: [], fears: [], alertLevel: 0, knowledge: {} },
  ...overrides,
});

// F-v3-living-npcs (Phase-9 remediation): the REAL shape of every shipped
// companion/story NPC — NO `ai` field at all (unlike makeNamedNpc above,
// which always carries one and so never exercised the ai-less paths this
// wave fixes). Every ai: block in shipped content lives on a type:'enemy'
// entity; recruitable companions and authored story NPCs are both
// type:'npc' with no ai. This helper is what isNamedNpc's new
// companion/named paths actually need to prove correct.
const makeAilessNpc = (id: string, name: string, zoneId: string, overrides?: Partial<EntityState>): EntityState => ({
  id,
  blueprintId: id,
  type: 'npc',
  name,
  tags: ['npc'],
  stats: { vigor: 5, instinct: 5 },
  resources: { hp: 20, stamina: 5 },
  statuses: [],
  zoneId,
  ...overrides,
});

describe('npc-agency breakpoint gating (MW-4)', () => {
  // Forbidden goals for a given breakpoint must be REMOVED, not merely set to
  // priority 0 — a 0-priority forbidden goal can still be selected when every
  // other goal also scores 0/negative. World canon: an allied NPC must NEVER
  // accuse or betray the player.
  it('allied NPC never carries an accuse or betray goal even when it would otherwise fire', () => {
    const engine = createTestEngine({
      modules: [
        createCognitionCore(),
        createFactionCognition({
          // cohesion 0.8 → loyalty = floor(0.8*80 + 20) = 84 (> 70, so betray-player goal #7 fires)
          factions: [{ factionId: 'order', entityIds: ['knight'], cohesion: 0.8 }],
        }),
      ],
      entities: [
        makePlayer('hall'),
        // High trust → allied breakpoint (trust 70 >= 60, loyalty 84 >= 50, no obligations)
        makeNamedNpc('knight', 'Sir Aldric', 'hall', { relations: { 'player-trust': 70 } }),
      ],
      zones: [{ id: 'hall', roomId: 'keep', name: 'Great Hall', tags: [], neighbors: [] }],
    });

    // Faction is under pressure → underPressure=true → betray goal #7 condition met
    const pressure: WorldPressure = makePressure({
      kind: 'faction-summons',
      sourceFactionId: 'order',
      description: 'the order summons its own',
      triggeredBy: 'test',
      urgency: 0.5,
      visibility: 'known',
      turnsRemaining: 5,
      potentialOutcomes: ['x'],
      tags: ['test'],
      currentTick: 0,
    });

    // Sanity: confirm the scenario actually produces an allied NPC whose betray
    // condition is satisfied (loyalty > 70, trust > 0, underPressure).
    const rel = deriveNpcRelationship(engine.world, 'knight', 'player');
    expect(rel.trust).toBeGreaterThan(0);
    expect(rel.loyalty).toBeGreaterThan(70);
    expect(deriveLoyaltyBreakpoint(rel)).toBe('allied');

    const profile = buildNpcProfile(engine.world, 'knight', 'player', [pressure]);

    expect(profile.breakpoint).toBe('allied');
    // The fix: forbidden goals are filtered out entirely, not parked at priority 0.
    const hasForbidden = profile.goals.some((g) => g.verb === 'accuse' || g.verb === 'betray');
    expect(hasForbidden).toBe(false);
  });

  it('allied companion never carries accuse/betray/flee goals', () => {
    const engine = createTestEngine({
      modules: [
        createCognitionCore(),
        createFactionCognition({
          factions: [{ factionId: 'order', entityIds: ['squire'], cohesion: 0.8 }],
        }),
      ],
      entities: [
        makePlayer('hall'),
        makeNamedNpc('squire', 'Squire', 'hall', {
          tags: ['npc', 'companion'],
          relations: { 'player-trust': 70 },
          custom: { companionRole: 'fighter', companionMorale: 80 },
        }),
      ],
      zones: [{ id: 'hall', roomId: 'keep', name: 'Great Hall', tags: [], neighbors: [] }],
    });

    const pressure: WorldPressure = makePressure({
      kind: 'faction-summons',
      sourceFactionId: 'order',
      description: 'the order summons its own',
      triggeredBy: 'test',
      urgency: 0.5,
      visibility: 'known',
      turnsRemaining: 5,
      potentialOutcomes: ['x'],
      tags: ['test'],
      currentTick: 0,
    });

    const profile = buildNpcProfile(engine.world, 'squire', 'player', [pressure]);
    const forbidden = profile.goals.filter(
      (g) => g.verb === 'accuse' || g.verb === 'betray' || g.verb === 'flee',
    );
    expect(forbidden).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// F-2fe4be26 completeness — deriveCompanionGoals reads role/morale from
// entity.custom DIRECTLY (its own comment: "read from custom field set by
// product layer"), not from the 'companion' tag or party state. The tag
// write alone gates the OUTER check (the test above proves that), but
// protect/abandon's own priority and firing condition need REAL data —
// otherwise they'd silently run on deriveCompanionGoals' own `?? 'fighter'`
// / `?? 50` fallback defaults regardless of who was actually recruited or
// how their morale is doing. companion-core.ts's recruit verb (and
// world-tick.ts's companion-reactions wiring, on every morale change) keep
// this mirror in sync via syncCompanionCustomFields.
// ---------------------------------------------------------------------------

describe('companion-core recruit verb feeds npc-agency real data (F-2fe4be26)', () => {
  it('a recruited fighter gets a protect goal when the player is critically hurt — role comes from the REAL recruit, not a fallback', () => {
    const engine = createTestEngine({
      modules: [createCognitionCore(), createFactionCognition({ factions: [] }), statusCore, createCompanionCore()],
      entities: [
        makePlayer('hall'), // vigor 5, no maxHp — deriveCompanionGoals falls back to stats.vigor
        makeNamedNpc('mira', 'Mira', 'hall', { tags: ['npc', 'recruitable', 'fighter'] }),
      ],
      zones: [{ id: 'hall', roomId: 'keep', name: 'Great Hall', tags: [], neighbors: [] }],
    });
    engine.submitAction('recruit', { targetIds: ['mira'] });
    expect(engine.world.entities.mira.custom?.companionRole).toBe('fighter'); // the sync, not a default

    engine.world.entities.player.resources.hp = 1; // 1/5 vigor-fallback maxHp = 0.2 < 0.3 threshold
    const profile = buildNpcProfile(engine.world, 'mira', 'player', []);
    expect(profile.goals.some((g) => g.verb === 'protect')).toBe(true);
  });

  it('a fighter with full player HP does NOT get a protect goal (the condition is live, not always-on)', () => {
    const engine = createTestEngine({
      modules: [createCognitionCore(), createFactionCognition({ factions: [] }), statusCore, createCompanionCore()],
      entities: [makePlayer('hall'), makeNamedNpc('mira', 'Mira', 'hall', { tags: ['npc', 'recruitable', 'fighter'] })],
      zones: [{ id: 'hall', roomId: 'keep', name: 'Great Hall', tags: [], neighbors: [] }],
    });
    engine.submitAction('recruit', { targetIds: ['mira'] });
    const profile = buildNpcProfile(engine.world, 'mira', 'player', []);
    expect(profile.goals.some((g) => g.verb === 'protect')).toBe(false);
  });

  it('a recruit\'s morale reflects the REAL value (60, recruitHandler\'s starting morale) — not deriveCompanionGoals\' own 50 default', () => {
    const engine = createTestEngine({
      modules: [createCognitionCore(), createFactionCognition({ factions: [] }), statusCore, createCompanionCore()],
      entities: [makePlayer('hall'), makeNamedNpc('mira', 'Mira', 'hall', { tags: ['npc', 'recruitable', 'fighter'] })],
      zones: [{ id: 'hall', roomId: 'keep', name: 'Great Hall', tags: [], neighbors: [] }],
    });
    engine.submitAction('recruit', { targetIds: ['mira'] });
    expect(engine.world.entities.mira.custom?.companionMorale).toBe(60);
    // 60 is well above the abandon threshold (< 20) — no abandon goal yet.
    const profile = buildNpcProfile(engine.world, 'mira', 'player', []);
    expect(profile.goals.some((g) => g.verb === 'abandon')).toBe(false);
  });

  it('a companion whose morale is synced low (companion-reactions wiring) gets an abandon goal at the correct priority band', () => {
    const engine = createTestEngine({
      modules: [createCognitionCore(), createFactionCognition({ factions: [] }), statusCore, createCompanionCore()],
      entities: [makePlayer('hall'), makeNamedNpc('mira', 'Mira', 'hall', { tags: ['npc', 'recruitable', 'fighter'] })],
      zones: [{ id: 'hall', roomId: 'keep', name: 'Great Hall', tags: [], neighbors: [] }],
    });
    engine.submitAction('recruit', { targetIds: ['mira'] });

    // Simulates world-tick.ts's companion-reactions sync after a bad round.
    syncCompanionCustomFields(engine.world.entities.mira, 'fighter', 8);
    const profile = buildNpcProfile(engine.world, 'mira', 'player', []);
    const abandon = profile.goals.find((g) => g.verb === 'abandon');
    expect(abandon).toBeDefined();
    expect(abandon?.priority).toBe(0.95); // morale < 10 band
  });
});

describe('npc-agency determinism (no module-global counters)', () => {
  // Obligation and consequence-chain ids must be a function of (content), not a
  // process-global counter. Two independent "runs" that create the SAME
  // obligation / chain must mint the SAME id. Against the old
  // `obl-${++obligationCounter}` / `cc-${++consequenceCounter}` globals this
  // FAILS (id depends on how many were ever minted in the process / call order).

  describe('obligations', () => {
    it('produces identical ids for identical inputs regardless of call order', () => {
      const a = createObligation('favor', 'npc-owes-player', 'merchant', 'player', 3, 'warn', 12, 20);
      // mint unrelated obligations to advance any hidden global counter
      createObligation('debt', 'player-owes-npc', 'elder', 'player', 5, 'bargain', 30, 15);
      createObligation('saved', 'npc-owes-player', 'guard', 'player', 4, 'protect', 40, null);
      const b = createObligation('favor', 'npc-owes-player', 'merchant', 'player', 3, 'warn', 12, 20);
      expect(a.id).toBe(b.id);
    });

    it('encodes npc + kind + tick (distinct across npc/kind/tick)', () => {
      const base = createObligation('favor', 'npc-owes-player', 'merchant', 'player', 3, 'warn', 12, 20);
      const otherNpc = createObligation('favor', 'npc-owes-player', 'guard', 'player', 3, 'warn', 12, 20);
      const otherKind = createObligation('debt', 'npc-owes-player', 'merchant', 'player', 3, 'warn', 12, 20);
      const otherTick = createObligation('favor', 'npc-owes-player', 'merchant', 'player', 3, 'warn', 13, 20);
      expect(base.id).not.toBe(otherNpc.id);
      expect(base.id).not.toBe(otherKind.id);
      expect(base.id).not.toBe(otherTick.id);
      expect(base.id).toContain('merchant');
      expect(base.id).toContain('favor');
      expect(base.id).toContain('12');
    });

    it('a realistic multi-obligation sequence across ticks has no id collisions', () => {
      const ids = new Set<string>();
      const npcs = ['merchant', 'guard', 'elder'];
      const kinds = ['favor', 'debt', 'saved'] as const;
      for (let tick = 1; tick <= 9; tick++) {
        const npc = npcs[tick % npcs.length];
        const kind = kinds[tick % kinds.length];
        const o = createObligation(kind, 'npc-owes-player', npc, 'player', 3, 'warn', tick, null);
        expect(ids.has(o.id)).toBe(false);
        ids.add(o.id);
      }
      expect(ids.size).toBe(9);
    });
  });

  describe('consequence chains', () => {
    it('produces identical ids for identical inputs regardless of call order', () => {
      const a = buildConsequenceChain('rival', 'retaliation', 'loyalty collapsed to hostile', 8);
      // mint unrelated chains to advance any hidden global counter
      buildConsequenceChain('traitor', 'vendetta', 'deep betrayal', 20);
      buildConsequenceChain('coward', 'plea', 'cornered and desperate', 25);
      const b = buildConsequenceChain('rival', 'retaliation', 'loyalty collapsed to hostile', 8);
      expect(a.id).toBe(b.id);
    });

    it('encodes npc + kind + tick (distinct across npc/kind/tick)', () => {
      const base = buildConsequenceChain('rival', 'retaliation', 't', 8);
      const otherNpc = buildConsequenceChain('foe', 'retaliation', 't', 8);
      const otherKind = buildConsequenceChain('rival', 'vendetta', 't', 8);
      const otherTick = buildConsequenceChain('rival', 'retaliation', 't', 9);
      expect(base.id).not.toBe(otherNpc.id);
      expect(base.id).not.toBe(otherKind.id);
      expect(base.id).not.toBe(otherTick.id);
      expect(base.id).toContain('rival');
      expect(base.id).toContain('retaliation');
      expect(base.id).toContain('8');
    });
  });
});

// ---------------------------------------------------------------------------
// Obligation sign math (F-b53aa70d / F-9fc34e60)
// ---------------------------------------------------------------------------
//
// The only place a `kind: 'betrayed'` obligation is created is
// resolveNpcAction's 'betray' case: { kind: 'betrayed',
// direction: 'player-owes-npc', magnitude: 5, ... } — the NPC is the
// betrayer, counterpartyId is the player. getNetObligationWeight's sign math
// used to double-negate this: direction: 'player-owes-npc' already yields
// sign = -1, and kindWeight = (kind === 'betrayed' ? -1 : 1) applied ANOTHER
// -1, so the product was POSITIVE — the same sign bucket as a genuine
// 'favor'. This contradicted deriveNpcGoals's adjacent, correctly-signed
// betrayalCount check (boosts accuse/betray, suppresses warn for exactly
// this case), so the two obligation-adjustment blocks partially canceled
// instead of reinforcing.

describe('npc-agency: obligation sign math', () => {
  it('a single betrayed obligation nets NEGATIVE (not positive) toward the counterparty', () => {
    const ledger: NpcObligationLedger = {
      obligations: [createObligation('betrayed', 'player-owes-npc', 'knight', 'player', 5, 'betray', 10, null)],
    };
    expect(getNetObligationWeight(ledger, 'player')).toBeLessThan(0);
  });

  it('a genuine favor (npc-owes-player) still nets POSITIVE — the fix must not flip unrelated kinds', () => {
    const ledger: NpcObligationLedger = {
      obligations: [createObligation('favor', 'npc-owes-player', 'knight', 'player', 5, 'recruit', 10, null)],
    };
    expect(getNetObligationWeight(ledger, 'player')).toBeGreaterThan(0);
  });

  it('after a betrayal, the netWeight-based and betrayalCount-based goal adjustments reinforce (not partially cancel): accuse/betray moves MORE hostile', () => {
    // NPC loyal to a cohesive faction (loyalty > 60 via cohesion 0.8), deeply
    // distrustful of the player, and aware of damaging rumors — satisfies
    // deriveNpcGoals rule 2 ('accuse'). trust <= -30 also makes this NPC
    // 'hostile' for BOTH scenarios below, so the breakpoint-gating step's
    // +0.1 accuse bump applies equally in each and cancels out of the diff.
    const engine = createTestEngine({
      modules: [
        createCognitionCore(),
        createFactionCognition({
          factions: [{ factionId: 'order', entityIds: ['knight'], cohesion: 0.8 }], // loyalty ≈ 84
        }),
      ],
      entities: [
        makePlayer('hall'),
        makeNamedNpc('knight', 'Sir Aldric', 'hall', { relations: { 'player-trust': -40 } }),
      ],
      zones: [{ id: 'hall', roomId: 'keep', name: 'Great Hall', tags: [], neighbors: [] }],
    });

    const rumors = [{
      id: 'r1', claim: 'burned the granary', subjectDescriptor: 'the stranger',
      sourceEvent: 'test', originFactionId: 'order', confidence: 0.9, distortion: 0,
      mutationCount: 0, valence: 'fearsome' as const, spreadTo: [], originTick: 0,
    }];

    // Sanity: this scenario is hostile (trust ≤ -30) with loyalty > 60 —
    // rule 2's precondition for an 'accuse' goal.
    const rel = deriveNpcRelationship(engine.world, 'knight', 'player');
    expect(rel.trust).toBeLessThanOrEqual(-30);
    expect(rel.loyalty).toBeGreaterThan(60);

    const withoutObligation = buildNpcProfile(engine.world, 'knight', 'player', [], rumors);
    const accuseBefore = withoutObligation.goals.find((g) => g.verb === 'accuse');
    expect(accuseBefore).toBeDefined();

    const ledger: NpcObligationLedger = {
      obligations: [createObligation('betrayed', 'player-owes-npc', 'knight', 'player', 5, 'betray', 10, null)],
    };
    const withObligation = buildNpcProfile(engine.world, 'knight', 'player', [], rumors, ledger);
    const accuseAfter = withObligation.goals.find((g) => g.verb === 'accuse');
    expect(accuseAfter).toBeDefined();

    // Fixed behavior: a betrayal must make accuse strictly MORE likely, never
    // less — the buggy sign math made it LESS likely (net effect -0.1).
    expect(accuseAfter!.priority).toBeGreaterThan(accuseBefore!.priority);
  });
});

// ---------------------------------------------------------------------------
// V3R-NPC-1..4 (Phase-9 remediation, F-v3-living-npcs) — isNamedNpc no
// longer hard-requires entity.ai. Every ai: block in shipped content lives
// on a type:'enemy' entity; every recruited companion and every authored
// story NPC is type:'npc' with NO ai. Before this fix, `if (!entity.ai)
// return false` gated isNamedNpc FIRST, so it was always false for both
// audiences: world.modules['npc-agency'] was never created, and
// PEOPLE / npc-goal+obligation opportunities / companion departure never
// fired in any shipped starter. These tests exercise the real, ai-less
// shape (via makeAilessNpc, not makeNamedNpc — the latter always carries an
// `ai` block and so never touched the paths fixed here).
// ---------------------------------------------------------------------------

describe('isNamedNpc (V3R-NPC-1): companion/named paths qualify without entity.ai', () => {
  it('a companion-tagged entity with NO ai qualifies', () => {
    const entity = makeAilessNpc('mira', 'Mira', 'hall', { tags: ['npc', 'companion', 'companion:fighter'] });
    expect(entity.ai).toBeUndefined();
    expect(isNamedNpc(entity, 'player')).toBe(true);
  });

  it('a named-tagged entity with NO ai qualifies', () => {
    const entity = makeAilessNpc('pilgrim', 'Suspicious Pilgrim', 'chapel', { tags: ['npc', 'named'] });
    expect(entity.ai).toBeUndefined();
    expect(isNamedNpc(entity, 'player')).toBe(true);
  });

  it('legacy path preserved: an ai-bearing type-npc entity with NEITHER companion NOR named still qualifies', () => {
    const entity = makeNamedNpc('knight', 'Sir Aldric', 'hall'); // carries ai, tags: ['npc'] only
    expect(entity.ai).toBeDefined();
    expect(entity.tags).not.toContain('companion');
    expect(entity.tags).not.toContain('named');
    expect(isNamedNpc(entity, 'player')).toBe(true);
  });

  it('an ai-less, untagged type-npc entity does NOT qualify (genuinely un-authored background NPCs stay dark)', () => {
    const entity = makeAilessNpc('generic', 'Townsperson', 'square');
    expect(isNamedNpc(entity, 'player')).toBe(false);
  });

  it('a dead entity never qualifies, even when tagged named or companion', () => {
    const named = makeAilessNpc('fallen', 'Fallen Ally', 'hall', { tags: ['npc', 'named'], resources: { hp: 0 } });
    const companion = makeAilessNpc('downed', 'Downed Companion', 'hall', { tags: ['npc', 'companion'], resources: { hp: 0 } });
    expect(isNamedNpc(named, 'player')).toBe(false);
    expect(isNamedNpc(companion, 'player')).toBe(false);
  });

  it('the player entity itself never qualifies, even tagged named/companion', () => {
    const entity = makeAilessNpc('player', 'Hero', 'hall', { type: 'player', tags: ['player', 'named', 'companion'] });
    expect(isNamedNpc(entity, 'player')).toBe(false);
  });
});

describe('V3R-NPC-1/4: npc-agency builds valid profiles for ai-less named entities (companion tag AND named tag)', () => {
  it.each([
    ['companion-tagged', ['npc', 'companion', 'companion:scout']],
    ['named story NPC', ['npc', 'named']],
  ] as const)('%s: buildNpcProfile returns a well-shaped, non-throwing profile with no entity.ai', (_label, tags) => {
    const engine = createTestEngine({
      modules: [createCognitionCore(), createFactionCognition({ factions: [] })],
      entities: [
        makePlayer('hall'),
        makeAilessNpc('subject', 'Subject', 'hall', { tags: [...tags] }),
      ],
      zones: [{ id: 'hall', roomId: 'keep', name: 'Great Hall', tags: [], neighbors: [] }],
    });

    expect(engine.world.entities.subject.ai).toBeUndefined();
    expect(isNamedNpc(engine.world.entities.subject, 'player')).toBe(true);

    let profile!: ReturnType<typeof buildNpcProfile>;
    expect(() => {
      profile = buildNpcProfile(engine.world, 'subject', 'player', []);
    }).not.toThrow();

    expect(profile.npcId).toBe('subject');
    expect(profile.name).toBe('Subject');
    expect(profile.factionId).toBeNull();
    expect(Number.isFinite(profile.relationship.trust)).toBe(true);
    expect(Number.isFinite(profile.relationship.fear)).toBe(true);
    expect(Number.isFinite(profile.relationship.greed)).toBe(true);
    expect(Number.isFinite(profile.relationship.loyalty)).toBe(true);
    expect(['allied', 'favorable', 'wavering', 'hostile', 'compromised']).toContain(profile.breakpoint);
    expect(['trust', 'fear', 'greed', 'loyalty']).toContain(profile.dominantAxis);
    expect(typeof profile.leverageAngle).toBe('string');
    expect(profile.leverageAngle.length).toBeGreaterThan(0);
    expect(Array.isArray(profile.goals)).toBe(true);
    expect(Array.isArray(profile.knownRumors)).toBe(true);
    expect(typeof profile.underPressure).toBe('boolean');
  });
});

describe('V3R-NPC-4: a recruited companion is a named NPC with goals/relationship/breakpoint (ai-less, the real shipped shape)', () => {
  it('recruiting an ai-less recruitable NPC flips isNamedNpc true and buildNpcProfile returns a full profile', () => {
    const engine = createTestEngine({
      modules: [createCognitionCore(), createFactionCognition({ factions: [] }), statusCore, createCompanionCore()],
      entities: [
        makePlayer('hall'),
        makeAilessNpc('mira', 'Mira', 'hall', { tags: ['npc', 'recruitable', 'fighter'] }),
      ],
      zones: [{ id: 'hall', roomId: 'keep', name: 'Great Hall', tags: [], neighbors: [] }],
    });

    // Pre-recruit: no companion/named tag and no ai — correctly NOT a named NPC yet.
    expect(isNamedNpc(engine.world.entities.mira, 'player')).toBe(false);

    engine.submitAction('recruit', { targetIds: ['mira'] });

    expect(engine.world.entities.mira.ai).toBeUndefined(); // recruit never adds an ai block
    expect(engine.world.entities.mira.tags).toContain('companion');
    expect(isNamedNpc(engine.world.entities.mira, 'player')).toBe(true);

    const profile = buildNpcProfile(engine.world, 'mira', 'player', []);
    expect(profile.npcId).toBe('mira');
    expect(profile.name).toBe('Mira');
    expect(profile.relationship).toEqual({
      trust: expect.any(Number),
      fear: expect.any(Number),
      greed: expect.any(Number),
      loyalty: expect.any(Number),
    });
    expect(['allied', 'favorable', 'wavering', 'hostile', 'compromised']).toContain(profile.breakpoint);
    expect(Array.isArray(profile.goals)).toBe(true);
  });
});

describe('V3R-NPC-4: an authored story NPC (named tag, no ai) appears in npc-agency profiles WITHOUT taking a combat turn', () => {
  it('a named, ai-less NPC is agency-eligible and never produces a combat verb across a wide tick range', () => {
    const engine = createTestEngine({
      modules: [createCognitionCore(), createFactionCognition({ factions: [] })],
      entities: [
        makePlayer('chapel'),
        // Distrustful of the player (fits "Suspicious Pilgrim") — gives
        // deriveNpcGoals rule 3 (trust < -20 && fear < 50) a real goal to
        // fire ('lie'), so this test exercises a REAL resolved action
        // instead of vacuously looping over an always-idle profile.
        makeAilessNpc('pilgrim', 'Suspicious Pilgrim', 'chapel', {
          tags: ['npc', 'named'],
          relations: { 'player-trust': -40 },
        }),
      ],
      zones: [{ id: 'chapel', roomId: 'r1', name: 'Chapel', tags: [], neighbors: [] }],
    });

    // No ai block at all — the engine's separate combat-turn selection
    // (combat-intent.ts's selectNpcCombatAction, driven off entity.ai/type)
    // has nothing to act on for this entity. npc-agency's own NpcActionVerb
    // union (warn/lie/conceal/accuse/flee/bargain/recruit/betray/protect/
    // abandon) structurally excludes combat verbs too — both guarantees are
    // asserted below so an ai block accidentally reappearing on a future
    // content edit, or a combat verb leaking into the union, would fail loud.
    expect(engine.world.entities.pilgrim.ai).toBeUndefined();
    expect(isNamedNpc(engine.world.entities.pilgrim, 'player')).toBe(true);

    const profile = buildNpcProfile(engine.world, 'pilgrim', 'player', []);
    expect(profile.npcId).toBe('pilgrim');
    expect(profile.goals.length).toBeGreaterThan(0); // confirms the scenario is live, not idle

    const combatVerbs = new Set(['attack', 'guard', 'brace', 'reposition', 'disengage']);
    let sawAnyAction = false;
    for (let tick = 0; tick < 40; tick++) {
      const results = runNpcAgencyTick(engine.world, 'player', [], tick);
      for (const r of results) {
        sawAnyAction = true;
        expect(combatVerbs.has(r.action.verb)).toBe(false);
      }
    }
    // Sanity: the scenario actually exercised at least one resolved action
    // across the stagger window (idle profiles would make the "never a
    // combat verb" assertion vacuously true).
    expect(sawAnyAction).toBe(true);
  });
});

describe("V3R-NPC-4: world.modules['npc-agency'] persistence populates for a world with a named NPC", () => {
  it('setPersistedNpcState + getPersistedNpcProfiles/getPersistedNpcLastActions/getPersistedNpcObligations round-trip for a named story NPC', () => {
    const engine = createTestEngine({
      modules: [createCognitionCore(), createFactionCognition({ factions: [] })],
      entities: [
        makePlayer('chapel'),
        makeAilessNpc('pilgrim', 'Suspicious Pilgrim', 'chapel', { tags: ['npc', 'named'] }),
      ],
      zones: [{ id: 'chapel', roomId: 'r1', name: 'Chapel', tags: [], neighbors: [] }],
    });

    // SEED-0 precondition: absent until something actually writes it.
    expect(engine.world.modules['npc-agency']).toBeUndefined();
    expect(getPersistedNpcProfiles(engine.world)).toEqual([]);
    expect(getPersistedNpcLastActions(engine.world)).toEqual([]);
    expect(getPersistedNpcObligations(engine.world)).toEqual(new Map());

    const profiles = buildAllNpcProfiles(engine.world, 'player', []);
    expect(profiles).toHaveLength(1);
    expect(profiles[0].npcId).toBe('pilgrim');

    const results = runNpcAgencyTick(engine.world, 'player', [], 0);
    const ledgers = new Map<string, NpcObligationLedger>();

    setPersistedNpcState(engine.world, profiles, results, ledgers);

    expect(engine.world.modules['npc-agency']).toBeDefined();
    expect(getPersistedNpcProfiles(engine.world)).toHaveLength(1);
    expect(getPersistedNpcProfiles(engine.world)[0].npcId).toBe('pilgrim');
    expect(getPersistedNpcLastActions(engine.world)).toEqual(results);
    expect(getPersistedNpcObligations(engine.world)).toEqual(ledgers);
  });
});
