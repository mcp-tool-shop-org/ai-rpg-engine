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
} from './npc-agency.js';
import type { NpcObligationLedger } from './npc-agency.js';
import { makePressure, type WorldPressure } from './pressure-system.js';

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
