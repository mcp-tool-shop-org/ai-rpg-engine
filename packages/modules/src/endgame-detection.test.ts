import { describe, it, expect, beforeEach } from 'vitest';
import {
  evaluateEndgame,
  formatEndgameForDirector,
  formatEndgameForNarrator,
  resetEndgameCounter,
  type EndgameInputs,
} from './endgame-detection.js';
import type { ArcSnapshot } from './arc-detection.js';

const emptySnapshot: ArcSnapshot = { signals: [], dominantArc: null, tick: 10 };

function makeInputs(overrides: Partial<EndgameInputs> = {}): EndgameInputs {
  return {
    factionStates: [],
    playerReputations: [],
    playerLeverage: { favor: 0, debt: 0, blackmail: 0, influence: 0, heat: 0, legitimacy: 0 },
    activePressures: [],
    npcProfiles: [],
    npcObligations: new Map(),
    companions: [],
    districtEconomies: new Map(),
    activeOpportunities: [],
    resolvedPressures: [],
    resolvedOpportunities: [],
    playerLevel: 1,
    totalTurns: 10,
    currentTick: 10,
    arcSnapshot: emptySnapshot,
    playerHp: 50,
    playerMaxHp: 50,
    previousTriggers: [],
    ...overrides,
  };
}

function makePressure(kind: string) {
  return {
    id: `p-${kind}`,
    kind: kind as any,
    sourceFactionId: 'f1',
    description: kind,
    triggeredBy: 'test',
    urgency: 0.5,
    visibility: 'known' as const,
    turnsRemaining: 5,
    potentialOutcomes: [],
    tags: [],
    createdAtTick: 1,
  };
}

beforeEach(() => {
  resetEndgameCounter();
});

describe('endgame-detection', () => {
  it('returns null for neutral state', () => {
    const trigger = evaluateEndgame(makeInputs());
    expect(trigger).toBeNull();
  });

  describe('victory', () => {
    it('triggers with allied factions + high influence + low heat', () => {
      const trigger = evaluateEndgame(makeInputs({
        playerReputations: [
          { factionId: 'f1', value: 65 },
          { factionId: 'f2', value: 70 },
        ],
        playerLeverage: { favor: 0, debt: 0, blackmail: 0, influence: 65, heat: 10, legitimacy: 0 },
        activePressures: [],
      }));

      expect(trigger).not.toBeNull();
      expect(trigger!.resolutionClass).toBe('victory');
    });

    it('does not trigger with too many pressures', () => {
      const trigger = evaluateEndgame(makeInputs({
        playerReputations: [
          { factionId: 'f1', value: 65 },
          { factionId: 'f2', value: 70 },
        ],
        playerLeverage: { favor: 0, debt: 0, blackmail: 0, influence: 65, heat: 10, legitimacy: 0 },
        activePressures: [makePressure('bounty-issued'), makePressure('revenge-attempt'), makePressure('investigation-opened')],
      }));

      expect(trigger).toBeNull();
    });
  });

  describe('exile', () => {
    it('triggers with all factions hostile + high heat + no allies', () => {
      const trigger = evaluateEndgame(makeInputs({
        playerReputations: [
          { factionId: 'f1', value: -40 },
          { factionId: 'f2', value: -35 },
        ],
        playerLeverage: { favor: 0, debt: 0, blackmail: 0, influence: 0, heat: 85, legitimacy: 0 },
        companions: [],
        npcProfiles: [
          { npcId: 'n1', name: 'N1', factionId: 'f1', goals: [], relationship: { trust: -50, fear: 0, greed: 50, loyalty: 50 }, breakpoint: 'hostile' as const, dominantAxis: 'trust' as const, leverageAngle: '', knownRumors: [], underPressure: false },
        ],
      }));

      expect(trigger).not.toBeNull();
      expect(trigger!.resolutionClass).toBe('exile');
    });

    it('does not trigger with active companions', () => {
      const trigger = evaluateEndgame(makeInputs({
        playerReputations: [
          { factionId: 'f1', value: -40 },
          { factionId: 'f2', value: -35 },
        ],
        playerLeverage: { favor: 0, debt: 0, blackmail: 0, influence: 0, heat: 85, legitimacy: 0 },
        companions: [{ npcId: 'c1', role: 'fighter' as const, joinedAtTick: 1, abilityTags: [], morale: 30, active: true }],
        npcProfiles: [],
      }));

      expect(trigger).toBeNull();
    });
  });

  describe('martyrdom', () => {
    it('triggers when player is dead with good reputation', () => {
      const trigger = evaluateEndgame(makeInputs({
        playerHp: 0,
        playerReputations: [
          { factionId: 'f1', value: 30 },
          { factionId: 'f2', value: 25 },
        ],
        companions: [{ npcId: 'c1', role: 'fighter' as const, joinedAtTick: 1, abilityTags: [], morale: 60, active: true }],
      }));

      expect(trigger).not.toBeNull();
      expect(trigger!.resolutionClass).toBe('martyrdom');
    });

    it('does not trigger with low reputation', () => {
      const trigger = evaluateEndgame(makeInputs({
        playerHp: 0,
        playerReputations: [
          { factionId: 'f1', value: -10 },
          { factionId: 'f2', value: 5 },
        ],
      }));

      expect(trigger).toBeNull();
    });
  });

  describe('quiet-retirement', () => {
    it('triggers with long peaceful game', () => {
      const trigger = evaluateEndgame(makeInputs({
        totalTurns: 50,
        activePressures: [],
        playerLeverage: { favor: 10, debt: 0, blackmail: 0, influence: 20, heat: 5, legitimacy: 55 },
        companions: [{ npcId: 'c1', role: 'healer' as const, joinedAtTick: 1, abilityTags: [], morale: 75, active: true }],
      }));

      expect(trigger).not.toBeNull();
      expect(trigger!.resolutionClass).toBe('quiet-retirement');
    });
  });

  describe('puppet-master', () => {
    it('triggers with high blackmail/influence and many debts', () => {
      const obligations = new Map();
      obligations.set('n1', { obligations: [
        { id: 'o1', kind: 'blackmail' as const, direction: 'npc-owes-player' as const, npcId: 'n1', counterpartyId: 'player', magnitude: 5, sourceTag: 'test', createdAtTick: 1, decayTurns: null },
      ] });
      obligations.set('n2', { obligations: [
        { id: 'o2', kind: 'debt' as const, direction: 'npc-owes-player' as const, npcId: 'n2', counterpartyId: 'player', magnitude: 3, sourceTag: 'test', createdAtTick: 2, decayTurns: null },
      ] });
      obligations.set('n3', { obligations: [
        { id: 'o3', kind: 'favor' as const, direction: 'npc-owes-player' as const, npcId: 'n3', counterpartyId: 'player', magnitude: 4, sourceTag: 'test', createdAtTick: 3, decayTurns: null },
      ] });

      const trigger = evaluateEndgame(makeInputs({
        playerLeverage: { favor: 0, debt: 0, blackmail: 45, influence: 55, heat: 15, legitimacy: 0 },
        npcObligations: obligations,
        playerReputations: [
          { factionId: 'f1', value: 10 },
          { factionId: 'f2', value: -5 },
        ],
      }));

      expect(trigger).not.toBeNull();
      expect(trigger!.resolutionClass).toBe('puppet-master');
    });
  });

  describe('deduplication', () => {
    it('skips already-triggered resolution classes', () => {
      const trigger = evaluateEndgame(makeInputs({
        playerHp: 0,
        playerReputations: [{ factionId: 'f1', value: 30 }],
        previousTriggers: [
          { id: 'e1', resolutionClass: 'martyrdom', detectedAtTick: 5, reason: '', evidence: {}, dominantArc: null, acknowledged: true },
        ],
      }));

      // martyrdom conditions are met but class already triggered
      expect(trigger?.resolutionClass).not.toBe('martyrdom');
    });
  });

  describe('formatting', () => {
    it('formatEndgameForDirector includes resolution class', () => {
      const trigger = evaluateEndgame(makeInputs({
        playerHp: 0,
        playerReputations: [{ factionId: 'f1', value: 30 }],
        companions: [],
      }));

      expect(trigger).not.toBeNull();
      const text = formatEndgameForDirector(trigger!);
      expect(text).toContain('MARTYRDOM');
      expect(text).toContain('Evidence');
    });

    it('formatEndgameForNarrator is concise', () => {
      const trigger = evaluateEndgame(makeInputs({
        playerHp: 0,
        playerReputations: [{ factionId: 'f1', value: 30 }],
        companions: [],
      }));

      expect(trigger).not.toBeNull();
      const text = formatEndgameForNarrator(trigger!);
      expect(text).toContain('martyrdom');
      expect(text.length).toBeLessThan(200);
    });
  });
});
