import { describe, it, expect, beforeEach } from 'vitest';
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
  resetOpportunityCounter,
  type OpportunityState,
  type OpportunityInputs,
} from './opportunity-core.js';
import type { LeverageState } from './player-leverage.js';
import type { NpcProfile, NpcObligationLedger } from './npc-agency.js';
import type { WorldPressure } from './pressure-system.js';
import type { DistrictEconomy } from './economy-core.js';
import { createDistrictEconomy } from './economy-core.js';

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

describe('opportunity-core', () => {
  beforeEach(() => {
    resetOpportunityCounter();
  });

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
});
