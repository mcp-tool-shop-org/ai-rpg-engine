import { describe, it, expect } from 'vitest';
import {
  evaluateOpportunities,
  tickOpportunities,
  getAvailableOpportunities,
  getAcceptedOpportunities,
  getOpportunityById,
  getOpportunitiesForNpc,
  getOpportunitiesForFaction,
  formatOpportunityForDirector,
  formatOpportunityListForDirector,
  formatOpportunityForNarrator,
  formatOpportunityForDialogue,
  makeOpportunity,
  getPersistedOpportunities,
  setPersistedOpportunities,
  type OpportunityState,
  type OpportunityInputs,
} from './opportunity-core.js';
import type { WorldState } from '@ai-rpg-engine/core';
import type { LeverageState } from './player-leverage.js';
import type { NpcProfile, NpcObligationLedger } from './npc-agency.js';
import type { WorldPressure } from './pressure-system.js';
import type { DistrictEconomy } from './economy-core.js';
import { createDistrictEconomy } from './economy-core.js';
import { createTestEngine } from '@ai-rpg-engine/core';
import { createCompanionCore, getPartyState } from './companion-core.js';
import { statusCore } from './status-core.js';
// V3-ESC-3: read-only import to prove a spawned escort resolves correctly
// through the ALREADY-authored getEscortFallout (opportunity-resolution.ts).
// getEscortFallout itself is not exported (private, dispatched internally by
// getKindFallout's switch) — computeOpportunityFallout is its public entry
// point and the same one the product layer calls. This does not edit
// opportunity-resolution.ts, only consumes its existing export, matching
// this file's established pattern of importing read-only from sibling
// domain modules (npc-agency.ts, pressure-system.ts, economy-core.ts,
// companion-core.ts, status-core.ts, above) it does not own either.
import { computeOpportunityFallout } from './opportunity-resolution.js';

function baseLeverage(): LeverageState {
  return { favor: 10, debt: 0, blackmail: 0, influence: 5, heat: 10, legitimacy: 20 };
}

function baseEconomy(overrides?: Partial<Record<string, number>>): DistrictEconomy {
  const econ = createDistrictEconomy();
  if (overrides) {
    for (const [cat, level] of Object.entries(overrides)) {
      const supply = econ.supplies[cat as keyof typeof econ.supplies];
      if (supply) supply.level = level as number;
    }
  }
  return econ;
}

function stableEconomy(): DistrictEconomy {
  // Economy with contraband at 25 (below 30 threshold) so blackMarketActive = false
  const econ = createDistrictEconomy();
  econ.supplies.contraband.level = 25;
  econ.blackMarketActive = false;
  return econ;
}

function baseInputs(overrides?: Partial<OpportunityInputs>): OpportunityInputs {
  return {
    activeOpportunities: [],
    activePressures: [],
    npcProfiles: [],
    npcObligations: new Map(),
    factionStates: { guild: { alertLevel: 20, cohesion: 0.7 } },
    playerReputations: [{ factionId: 'guild', value: 30 }],
    playerLeverage: baseLeverage(),
    districtEconomies: new Map([['market-district', stableEconomy()]]),
    companions: [],
    playerDistrictId: 'market-district',
    playerLevel: 3,
    currentTick: 20,
    genre: 'fantasy',
    totalTurns: 20,
    ...overrides,
  };
}

function makeTestOpp(overrides?: Partial<OpportunityState>): OpportunityState {
  return {
    id: 'test-opp',
    kind: 'contract',
    status: 'available',
    title: 'Test Contract',
    description: 'A test opportunity.',
    objectiveDescription: 'Complete the test.',
    linkedRumorIds: [],
    linkedNpcIds: [],
    tags: [],
    rewards: [{ type: 'leverage', currency: 'favor', delta: 5 }],
    risks: [],
    visibility: 'offered',
    urgency: 0.5,
    turnsRemaining: 10,
    createdAtTick: 10,
    genre: 'fantasy',
    ...overrides,
  };
}

/** Real, fully-formed WorldState (modules: {} — no namespace registered yet). */
function bareWorld(): WorldState {
  return createTestEngine({
    modules: [],
    entities: [{ id: 'player', blueprintId: 'player', type: 'player', name: 'Hero', tags: ['player'], stats: {}, resources: { hp: 10 }, statuses: [], zoneId: 'a' }],
    zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
  }).world;
}

describe('opportunity-core', () => {
  describe('evaluateOpportunities', () => {
    it('returns null when at capacity', () => {
      const inputs = baseInputs({
        activeOpportunities: Array.from({ length: 5 }, (_, i) =>
          makeTestOpp({ id: `opp-${i}`, status: 'available' }),
        ),
      });
      expect(evaluateOpportunities(inputs)).toBeNull();
    });

    it('returns null when too recent', () => {
      const inputs = baseInputs({
        activeOpportunities: [makeTestOpp({ createdAtTick: 19 })],
        currentTick: 20,
      });
      expect(evaluateOpportunities(inputs)).toBeNull();
    });

    it('spawns supply-run from supply-crisis pressure', () => {
      const pressure: WorldPressure = {
        id: 'wp-1',
        kind: 'supply-crisis',
        sourceFactionId: 'guild',
        description: 'Guild is short on supplies',
        triggeredBy: 'economy',
        urgency: 0.6,
        visibility: 'known',
        turnsRemaining: 8,
        potentialOutcomes: [],
        tags: [],
        createdAtTick: 10,
      };
      const inputs = baseInputs({ activePressures: [pressure] });
      const result = evaluateOpportunities(inputs);
      expect(result).not.toBeNull();
      expect(result!.opportunity.kind).toBe('supply-run');
      expect(result!.opportunity.linkedPressureId).toBe('wp-1');
    });

    it('spawns faction-job from faction-summons pressure', () => {
      const pressure: WorldPressure = {
        id: 'wp-2',
        kind: 'faction-summons',
        sourceFactionId: 'guild',
        description: 'Guild summons the player',
        triggeredBy: 'reputation',
        urgency: 0.5,
        visibility: 'known',
        turnsRemaining: 10,
        potentialOutcomes: [],
        tags: [],
        createdAtTick: 10,
      };
      const inputs = baseInputs({ activePressures: [pressure] });
      const result = evaluateOpportunities(inputs);
      expect(result).not.toBeNull();
      expect(result!.opportunity.kind).toBe('faction-job');
    });

    it('spawns supply-run from scarcity', () => {
      const scarceEcon = baseEconomy({ medicine: 10 });
      const inputs = baseInputs({
        districtEconomies: new Map([['market-district', scarceEcon]]),
      });
      const result = evaluateOpportunities(inputs);
      expect(result).not.toBeNull();
      expect(result!.opportunity.kind).toBe('supply-run');
      expect(result!.reason).toContain('medicine');
    });

    it('spawns contract from NPC bargain goal', () => {
      const npc: NpcProfile = {
        npcId: 'merchant-tom',
        name: 'Tom',
        factionId: 'guild',
        goals: [{ id: 'g1', label: 'Strike a deal', priority: 0.6, verb: 'bargain', targetEntityId: 'player', reason: 'wants help' }],
        relationship: { trust: 50, fear: 0, greed: 70, loyalty: 60 },
        breakpoint: 'favorable',
        dominantAxis: 'greed',
        leverageAngle: 'Open to deals',
        knownRumors: [],
        underPressure: false,
      };
      const inputs = baseInputs({ npcProfiles: [npc] });
      const result = evaluateOpportunities(inputs);
      expect(result).not.toBeNull();
      expect(result!.opportunity.kind).toBe('contract');
      expect(result!.opportunity.sourceNpcId).toBe('merchant-tom');
    });

    it('spawns favor-request from obligation', () => {
      const ledger: NpcObligationLedger = {
        obligations: [{
          id: 'obl-1',
          kind: 'debt',
          direction: 'player-owes-npc',
          npcId: 'elder-ann',
          counterpartyId: 'player',
          magnitude: 5,
          sourceTag: 'saved',
          createdAtTick: 5,
          decayTurns: null,
        }],
      };
      const npc: NpcProfile = {
        npcId: 'elder-ann',
        name: 'Ann',
        factionId: 'guild',
        goals: [],
        relationship: { trust: 30, fear: 0, greed: 20, loyalty: 50 },
        breakpoint: 'favorable',
        dominantAxis: 'trust',
        leverageAngle: 'Open to deals',
        knownRumors: [],
        underPressure: false,
      };
      const inputs = baseInputs({
        npcProfiles: [npc],
        npcObligations: new Map([['elder-ann', ledger]]),
      });
      const result = evaluateOpportunities(inputs);
      expect(result).not.toBeNull();
      expect(result!.opportunity.kind).toBe('favor-request');
      expect(result!.opportunity.sourceNpcId).toBe('elder-ann');
    });

    it('spawns faction-job from allied faction', () => {
      const inputs = baseInputs({
        playerReputations: [{ factionId: 'guild', value: 50 }],
      });
      const result = evaluateOpportunities(inputs);
      expect(result).not.toBeNull();
      expect(result!.opportunity.kind).toBe('faction-job');
    });

    it('spawns favor-request from companion personal goal', () => {
      const inputs = baseInputs({
        // Low faction rep so faction-job evaluator doesn't fire first
        playerReputations: [{ factionId: 'guild', value: 10 }],
        companions: [{
          npcId: 'companion-sara',
          role: 'scout',
          joinedAtTick: 5,
          personalGoal: 'Find her missing brother',
          abilityTags: [],
          morale: 60,
          active: true,
        }],
        npcProfiles: [{
          npcId: 'companion-sara',
          name: 'Sara',
          factionId: null,
          goals: [],
          relationship: { trust: 50, fear: 0, greed: 10, loyalty: 0 },
          breakpoint: 'favorable',
          dominantAxis: 'trust',
          leverageAngle: 'Reliable ally',
          knownRumors: [],
          underPressure: false,
        }],
      });
      const result = evaluateOpportunities(inputs);
      expect(result).not.toBeNull();
      expect(result!.opportunity.kind).toBe('favor-request');
      expect(result!.opportunity.tags).toContain('personal-ask');
    });

    // F-2fe4be26 completeness: the test above proves the READER accepts a
    // hand-built CompanionState with personalGoal. This closes the loop —
    // the REAL recruit verb's output (companion-core.ts, F-7d5c3e28), fed
    // straight into the same already-tested reader, RED-PROOFs that this
    // wave's write-side output is the exact shape this dark-but-authored
    // consumer expects (starter-fantasy's Brother Aldric authors
    // custom.personalGoal, which the recruit verb now carries onto
    // CompanionState.personalGoal — see companion-core.test.ts's authored-
    // content test). evaluateOpportunities/evaluateCompanionOpportunities
    // still have no round-hook caller in production (a separate, unscoped
    // gap — same class as companion-reactions' pre-wave state); this proves
    // the DATA CONTRACT, the part actually owned by this wave.
    it('a companion recruited through the REAL verb round-trips into a favor-request opportunity', () => {
      const engine = createTestEngine({
        modules: [statusCore, createCompanionCore()],
        entities: [
          { id: 'player', blueprintId: 'player', type: 'player', name: 'Hero', tags: ['player'], stats: {}, resources: { hp: 10 }, statuses: [], zoneId: 'a' },
          {
            id: 'aldric', blueprintId: 'aldric', type: 'npc', name: 'Brother Aldric',
            tags: ['npc', 'recruitable', 'healer'], stats: {}, resources: { hp: 10 }, statuses: [], zoneId: 'a',
            custom: { companionRole: 'healer', companionAbilities: 'medical-support,witness-calming', personalGoal: 'Redeem the fallen brothers of the chapel' },
          },
        ],
        zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
      });
      engine.submitAction('recruit', { targetIds: ['aldric'] });
      const companions = getPartyState(engine.world).companions;
      expect(companions).toHaveLength(1);

      const inputs = baseInputs({
        playerReputations: [{ factionId: 'guild', value: 10 }], // keep faction-job from firing first
        companions,
        npcProfiles: [{
          npcId: 'aldric', name: 'Brother Aldric', factionId: null, goals: [],
          relationship: { trust: 50, fear: 0, greed: 10, loyalty: 0 },
          breakpoint: 'favorable', dominantAxis: 'trust', leverageAngle: 'Reliable ally',
          knownRumors: [], underPressure: false,
        }],
      });
      const result = evaluateOpportunities(inputs);
      expect(result).not.toBeNull();
      expect(result!.opportunity.kind).toBe('favor-request');
      expect(result!.opportunity.description).toContain('Redeem the fallen brothers of the chapel');
      expect(result!.opportunity.tags).toContain('companion');
    });

    it('spawns investigation from black market district', () => {
      const bmEcon = baseEconomy({ contraband: 50 });
      bmEcon.blackMarketActive = true;
      const inputs = baseInputs({
        // Low faction rep so faction-job evaluator doesn't fire first
        playerReputations: [{ factionId: 'guild', value: 10 }],
        districtEconomies: new Map([['market-district', bmEcon]]),
      });
      const result = evaluateOpportunities(inputs);
      expect(result).not.toBeNull();
      expect(result!.opportunity.kind).toBe('investigation');
    });

    // V3-ESC-1/2/3: escort was a fully-defined OpportunityKind (fallout
    // already authored in getEscortFallout) with ZERO spawn rules ever
    // producing one. evaluateEscortOpportunities closes that gap. Its
    // trigger is an AND-gate: (active companion OR a faction that trusts the
    // player at ESCORT_TRUST_THRESHOLD) AND the player's district has gone
    // dangerous (same instability proxy evaluateDistrictOpportunities uses).
    describe('escort (V3-ESC)', () => {
      it('V3-ESC-2 SEED-0 IDENTITY: a fresh/legacy world (no companions, neutral economy, no relevant relationships) spawns zero escort opportunities across several rounds', () => {
        // Deliberately more "fresh" than baseInputs()'s own defaults: empty
        // reputations/factionStates/npcProfiles/obligations/pressures, and a
        // stable (non-dangerous) economy. Every one of the 8 spawn rules —
        // not just escort — returns null against this fixture, so the
        // assertion is the strongest form available: byte-identical (null)
        // behavior to today, round after round, not merely "not escort."
        for (let tick = 10; tick <= 40; tick += 5) {
          const inputs = baseInputs({
            companions: [],
            npcProfiles: [],
            npcObligations: new Map(),
            activePressures: [],
            playerReputations: [],
            factionStates: {},
            districtEconomies: new Map([['market-district', stableEconomy()]]),
            activeOpportunities: [],
            currentTick: tick,
            totalTurns: tick,
          });
          expect(evaluateOpportunities(inputs)).toBeNull();
        }
      });

      it('does not spawn escort when the district is dangerous but nobody has a protective claim (no companion, no trusted faction)', () => {
        // Danger alone is not nothing — investigation still fires (byte-
        // identical to today's black-market-district behavior) — but it must
        // never be escort without a companion or ESCORT_TRUST_THRESHOLD rep.
        const dangerousEcon = baseEconomy({});
        dangerousEcon.blackMarketActive = true;
        const inputs = baseInputs({
          playerReputations: [{ factionId: 'guild', value: 10 }], // below both faction-job's (30) and escort's (50) bars
          companions: [],
          districtEconomies: new Map([['market-district', dangerousEcon]]),
        });
        const result = evaluateOpportunities(inputs);
        expect(result).not.toBeNull();
        expect(result!.opportunity.kind).not.toBe('escort');
        expect(result!.opportunity.kind).toBe('investigation');
      });

      it('does not spawn escort when a companion is active but the district is stable/safe (only one AND-half satisfied)', () => {
        const inputs = baseInputs({
          playerReputations: [{ factionId: 'guild', value: 10 }],
          companions: [{
            npcId: 'companion-doran', role: 'fighter', joinedAtTick: 3,
            abilityTags: [], morale: 70, active: true,
          }],
          npcProfiles: [{
            npcId: 'companion-doran', name: 'Doran', factionId: null, goals: [],
            relationship: { trust: 50, fear: 0, greed: 10, loyalty: 0 },
            breakpoint: 'favorable', dominantAxis: 'trust', leverageAngle: 'Loyal guard',
            knownRumors: [], underPressure: false,
          }],
          districtEconomies: new Map([['market-district', stableEconomy()]]), // NOT dangerous
        });
        const result = evaluateOpportunities(inputs);
        expect(result?.opportunity.kind).not.toBe('escort');
      });

      it('V3-ESC-3 SPAWNS: escort via the active-companion path when both AND-halves are met', () => {
        const dangerousEcon = baseEconomy({});
        dangerousEcon.blackMarketActive = true;
        const inputs = baseInputs({
          playerReputations: [{ factionId: 'guild', value: 10 }], // keep faction-job (30) from competing
          companions: [{
            npcId: 'companion-mira', role: 'scout', joinedAtTick: 5,
            abilityTags: [], morale: 65, active: true,
          }],
          npcProfiles: [{
            npcId: 'companion-mira', name: 'Mira', factionId: null, goals: [],
            relationship: { trust: 55, fear: 0, greed: 10, loyalty: 0 },
            breakpoint: 'favorable', dominantAxis: 'trust', leverageAngle: 'Reliable ally',
            knownRumors: [], underPressure: false,
          }],
          districtEconomies: new Map([['market-district', dangerousEcon]]),
          currentTick: 20,
        });
        const result = evaluateOpportunities(inputs);
        expect(result).not.toBeNull();
        expect(result!.opportunity.kind).toBe('escort');
        expect(result!.opportunity.sourceNpcId).toBe('companion-mira');
        expect(result!.opportunity.linkedNpcIds).toContain('companion-mira');
        expect(result!.opportunity.tags).toContain('protective');

        // One-active-per-kind-per-source guard applies to escort exactly like
        // every sibling rule: with this escort already active for Mira, a
        // second evaluation (same trigger inputs, past MIN_TURNS_BETWEEN_SPAWNS)
        // must not mint a duplicate escort for the same companion — it falls
        // through to whatever else still qualifies (investigation, here),
        // never silently re-picking escort.
        const secondInputs = baseInputs({
          playerReputations: [{ factionId: 'guild', value: 10 }],
          companions: inputs.companions,
          npcProfiles: inputs.npcProfiles,
          districtEconomies: new Map([['market-district', dangerousEcon]]),
          activeOpportunities: [result!.opportunity],
          currentTick: 24,
        });
        const second = evaluateOpportunities(secondInputs);
        expect(second).not.toBeNull();
        expect(second!.opportunity.kind).not.toBe('escort');
      });

      it('V3-ESC-3 SPAWNS: escort via the trusted-faction path when no companion is present', () => {
        const dangerousEcon = baseEconomy({});
        dangerousEcon.blackMarketActive = true;
        const inputs = baseInputs({
          playerReputations: [{ factionId: 'coalition', value: 60 }], // >= ESCORT_TRUST_THRESHOLD (50)
          factionStates: { coalition: { alertLevel: 10, cohesion: 0.8 } },
          companions: [],
          npcProfiles: [{
            npcId: 'coalition-envoy', name: 'Envoy Reyes', factionId: 'coalition', goals: [],
            relationship: { trust: 60, fear: 0, greed: 10, loyalty: 50 },
            breakpoint: 'allied', dominantAxis: 'trust', leverageAngle: 'Speaks for the coalition',
            knownRumors: [], underPressure: false,
          }],
          districtEconomies: new Map([['market-district', dangerousEcon]]),
        });
        const result = evaluateOpportunities(inputs);
        expect(result).not.toBeNull();
        expect(result!.opportunity.kind).toBe('escort');
        expect(result!.opportunity.sourceFactionId).toBe('coalition');
        expect(result!.opportunity.sourceNpcId).toBe('coalition-envoy');
      });

      it('a spawned escort resolves correctly through the existing getEscortFallout (completed, failed, expired)', () => {
        const dangerousEcon = baseEconomy({});
        dangerousEcon.blackMarketActive = true;
        const inputs = baseInputs({
          playerReputations: [{ factionId: 'guild', value: 10 }],
          companions: [{
            npcId: 'companion-mira', role: 'scout', joinedAtTick: 5,
            abilityTags: [], morale: 65, active: true,
          }],
          npcProfiles: [{
            npcId: 'companion-mira', name: 'Mira', factionId: null, goals: [],
            relationship: { trust: 55, fear: 0, greed: 10, loyalty: 0 },
            breakpoint: 'favorable', dominantAxis: 'trust', leverageAngle: 'Reliable ally',
            knownRumors: [], underPressure: false,
          }],
          districtEconomies: new Map([['market-district', dangerousEcon]]),
          currentTick: 20,
        });
        const result = evaluateOpportunities(inputs);
        expect(result).not.toBeNull();
        const escortOpp = result!.opportunity;
        expect(escortOpp.kind).toBe('escort');

        const ctx = { currentTick: 30, playerDistrictId: 'market-district', genre: 'fantasy' };

        const completed = computeOpportunityFallout(escortOpp, 'completed', ctx);
        expect(completed.warnings).toBeUndefined();
        expect(completed.effects).toEqual(expect.arrayContaining([
          { type: 'leverage', currency: 'favor', delta: 5 },
          { type: 'obligation', kind: 'saved', direction: 'npc-owes-player', npcId: 'companion-mira', magnitude: 4 },
        ]));

        const failed = computeOpportunityFallout(escortOpp, 'failed', ctx);
        expect(failed.warnings).toBeUndefined();
        expect(failed.effects).toEqual(expect.arrayContaining([
          { type: 'companion-morale', npcId: 'companion-mira', delta: -10 },
        ]));

        const expired = computeOpportunityFallout(escortOpp, 'expired', ctx);
        expect(expired.warnings).toBeUndefined();
        expect(expired.effects).toEqual([]);
      });
    });
  });

  describe('tickOpportunities', () => {
    it('decrements turnsRemaining', () => {
      const opp = makeTestOpp({ turnsRemaining: 5 });
      const result = tickOpportunities([opp], 15);
      expect(result.active.length).toBe(1);
      expect(result.active[0].turnsRemaining).toBe(4);
      expect(result.expired.length).toBe(0);
    });

    it('expires opportunities at 0 turns', () => {
      const opp = makeTestOpp({ turnsRemaining: 0 });
      const result = tickOpportunities([opp], 15);
      expect(result.active.length).toBe(0);
      expect(result.expired.length).toBe(1);
      expect(result.expired[0].status).toBe('expired');
    });

    it('escalates visibility over time', () => {
      const opp = makeTestOpp({ visibility: 'hidden', createdAtTick: 5 });
      // After 3 ticks: hidden → rumored
      const r1 = tickOpportunities([opp], 8);
      expect(r1.active[0].visibility).toBe('rumored');

      // After 6 ticks: rumored → known
      const r2 = tickOpportunities([{ ...opp, visibility: 'rumored' }], 11);
      expect(r2.active[0].visibility).toBe('known');
    });

    it('does not tick completed/failed opportunities', () => {
      const opp = makeTestOpp({ status: 'completed', turnsRemaining: 5 });
      const result = tickOpportunities([opp], 15);
      expect(result.active.length).toBe(0);
      expect(result.expired.length).toBe(0);
    });
  });

  describe('queries', () => {
    const opps = [
      makeTestOpp({ id: 'a', status: 'available', sourceNpcId: 'npc-1', sourceFactionId: 'guild' }),
      makeTestOpp({ id: 'b', status: 'accepted', sourceNpcId: 'npc-2', sourceFactionId: 'guild' }),
      makeTestOpp({ id: 'c', status: 'completed', sourceNpcId: 'npc-1' }),
      makeTestOpp({ id: 'd', status: 'available', sourceFactionId: 'rebels', linkedNpcIds: ['npc-3'] }),
    ];

    it('getAvailableOpportunities filters by available', () => {
      expect(getAvailableOpportunities(opps).map((o) => o.id)).toEqual(['a', 'd']);
    });

    it('getAcceptedOpportunities filters by accepted', () => {
      expect(getAcceptedOpportunities(opps).map((o) => o.id)).toEqual(['b']);
    });

    it('getOpportunityById finds by id', () => {
      expect(getOpportunityById(opps, 'c')?.id).toBe('c');
      expect(getOpportunityById(opps, 'z')).toBeUndefined();
    });

    it('getOpportunitiesForNpc finds by source or linked', () => {
      expect(getOpportunitiesForNpc(opps, 'npc-1').map((o) => o.id)).toEqual(['a', 'c']);
      expect(getOpportunitiesForNpc(opps, 'npc-3').map((o) => o.id)).toEqual(['d']);
    });

    it('getOpportunitiesForFaction finds by faction', () => {
      expect(getOpportunitiesForFaction(opps, 'guild').map((o) => o.id)).toEqual(['a', 'b']);
      expect(getOpportunitiesForFaction(opps, 'rebels').map((o) => o.id)).toEqual(['d']);
    });
  });

  describe('formatting', () => {
    const opp = makeTestOpp({
      sourceNpcId: 'npc-1',
      sourceFactionId: 'guild',
      linkedPressureId: 'wp-1',
      linkedDistrictId: 'market',
      rewards: [
        { type: 'reputation', factionId: 'guild', delta: 10 },
        { type: 'leverage', currency: 'favor', delta: 5 },
      ],
      risks: [
        { type: 'heat', delta: 5 },
      ],
      tags: ['npc-sourced'],
    });

    it('formatOpportunityForDirector produces multi-line output', () => {
      const result = formatOpportunityForDirector(opp);
      expect(result).toContain('CONTRACT');
      expect(result).toContain('Test Contract');
      expect(result).toContain('npc-1');
      expect(result).toContain('guild');
      expect(result).toContain('+10 reputation');
      expect(result).toContain('+5 heat');
    });

    it('formatOpportunityListForDirector shows sections', () => {
      const list = [
        makeTestOpp({ id: 'a', status: 'available' }),
        makeTestOpp({ id: 'b', status: 'accepted' }),
      ];
      const result = formatOpportunityListForDirector(list);
      expect(result).toContain('ACCEPTED');
      expect(result).toContain('AVAILABLE');
    });

    it('formatOpportunityForNarrator is compact', () => {
      const result = formatOpportunityForNarrator(opp);
      expect(result).toContain('contract');
      expect(result).toContain('Test Contract');
      expect(result.length).toBeLessThan(100);
    });

    it('formatOpportunityForDialogue includes status', () => {
      const result = formatOpportunityForDialogue(opp);
      expect(result).toContain('available');
    });

    it('formatOpportunityListForDirector handles empty', () => {
      const result = formatOpportunityListForDirector([]);
      expect(result).toContain('No active opportunities');
    });
  });

  describe('makeOpportunity', () => {
    it('creates valid opportunity with defaults', () => {
      const opp = makeOpportunity({
        kind: 'contract',
        title: 'Test',
        description: 'Desc',
        objectiveDescription: 'Obj',
        urgency: 0.5,
        turnsRemaining: 10,
        visibility: 'offered',
        rewards: [],
        risks: [],
        genre: 'fantasy',
        currentTick: 5,
      });
      expect(opp.id).toMatch(/^opp-/);
      expect(opp.status).toBe('available');
      expect(opp.linkedRumorIds).toEqual([]);
      expect(opp.linkedNpcIds).toEqual([]);
      expect(opp.tags).toEqual([]);
    });
  });

  describe("persisted opportunities (world.modules['opportunity-core']) — F-ceed887f/F-f3f2a84c", () => {
    it('absent namespace: getPersistedOpportunities returns [] and never attaches', () => {
      const world = bareWorld();
      expect(getPersistedOpportunities(world)).toEqual([]);
      expect(world.modules['opportunity-core']).toBeUndefined();
    });

    it('setPersistedOpportunities round-trips through getPersistedOpportunities in the EXACT shape director.test.ts pins', () => {
      const world = bareWorld();
      const opp = makeTestOpp({ id: 'opp-a' });
      setPersistedOpportunities(world, [opp]);
      expect(getPersistedOpportunities(world)).toEqual([opp]);
      expect(world.modules['opportunity-core']).toEqual({ opportunities: [opp] });
    });

    it('setPersistedOpportunities preserves a sibling field it does not own (e.g. resolvedOpportunities)', () => {
      const world = bareWorld();
      world.modules['opportunity-core'] = { resolvedOpportunities: ['some-fallout'] };
      const opp = makeTestOpp();
      setPersistedOpportunities(world, [opp]);
      expect(world.modules['opportunity-core']).toEqual({
        resolvedOpportunities: ['some-fallout'],
        opportunities: [opp],
      });
    });

    it('malformed namespace values degrade to [], never throw', () => {
      const world = bareWorld();
      world.modules['opportunity-core'] = { opportunities: 'not-an-array' };
      expect(() => getPersistedOpportunities(world)).not.toThrow();
      expect(getPersistedOpportunities(world)).toEqual([]);
    });
  });

  describe('determinism (no module-global counter)', () => {
    // The id must be a function of (content), not a process-global counter.
    // Two independent "runs" that build the SAME opportunity must mint the SAME
    // id. Against the old `opp-${++opportunityCounter}` global this FAILS (id
    // depends on how many opportunities were ever minted in the process).
    function buildOpp(currentTick: number) {
      return makeOpportunity({
        kind: 'contract',
        sourceFactionId: 'guild',
        title: 'Job',
        description: 'Desc',
        objectiveDescription: 'Obj',
        urgency: 0.5,
        turnsRemaining: 10,
        visibility: 'offered',
        rewards: [],
        risks: [],
        genre: 'fantasy',
        currentTick,
      });
    }

    it('produces identical ids for identical inputs regardless of call order', () => {
      const a = buildOpp(7);
      // mint unrelated opportunities to advance any hidden global counter
      buildOpp(99);
      makeOpportunity({
        kind: 'bounty', sourceFactionId: 'rebels', title: 't', description: 'd',
        objectiveDescription: 'o', urgency: 0.5, turnsRemaining: 5,
        visibility: 'offered', rewards: [], risks: [], genre: 'fantasy', currentTick: 50,
      });
      const b = buildOpp(7);
      expect(a.id).toBe(b.id);
    });

    it('encodes kind + source + tick (collision-free across kinds/sources/ticks)', () => {
      const contract = buildOpp(7);
      const sameKindLaterTick = buildOpp(8);
      const differentSource = makeOpportunity({
        kind: 'contract', sourceFactionId: 'rebels', title: 't', description: 'd',
        objectiveDescription: 'o', urgency: 0.5, turnsRemaining: 5,
        visibility: 'offered', rewards: [], risks: [], genre: 'fantasy', currentTick: 7,
      });
      expect(contract.id).not.toBe(sameKindLaterTick.id); // same kind+source, diff tick
      expect(contract.id).not.toBe(differentSource.id);   // same kind+tick, diff source
      expect(contract.id).toContain('contract');
      expect(contract.id).toContain('guild');
      expect(contract.id).toContain('7');
    });

    it('a realistic multi-spawn sequence has no id collisions', () => {
      // Drive evaluateOpportunities across several ticks; collect minted ids and
      // assert all distinct (no two persisted opportunities share an id).
      const ids = new Set<string>();
      let activeOpportunities: OpportunityState[] = [];
      for (let tick = 10; tick <= 60; tick += 4) {
        const scarce = baseEconomy({ medicine: 5, weapons: 8, food: 6 });
        const result = evaluateOpportunities(baseInputs({
          activeOpportunities,
          districtEconomies: new Map([['market-district', scarce]]),
          currentTick: tick,
          totalTurns: tick,
        }));
        if (result) {
          expect(ids.has(result.opportunity.id)).toBe(false);
          ids.add(result.opportunity.id);
          activeOpportunities = [...activeOpportunities, result.opportunity];
        }
      }
      expect(ids.size).toBeGreaterThan(1);
    });
  });
});
