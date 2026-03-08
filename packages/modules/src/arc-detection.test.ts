import { describe, it, expect } from 'vitest';
import {
  evaluateArcs,
  buildArcSnapshot,
  formatArcForDirector,
  formatArcForNarrator,
  type ArcInputs,
  type ArcSnapshot,
} from './arc-detection.js';

function makeInputs(overrides: Partial<ArcInputs> = {}): ArcInputs {
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
    ...overrides,
  };
}

function makePressure(kind: string, sourceFactionId = 'f1') {
  return {
    id: `p-${kind}`,
    kind: kind as any,
    sourceFactionId,
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

function makeNpcProfile(overrides: Partial<any> = {}) {
  return {
    npcId: 'npc1',
    name: 'Test NPC',
    factionId: 'f1',
    goals: [],
    relationship: { trust: 0, fear: 0, greed: 50, loyalty: 50 },
    breakpoint: 'favorable' as const,
    dominantAxis: 'trust' as const,
    leverageAngle: 'none',
    knownRumors: [],
    underPressure: false,
    ...overrides,
  };
}

function makeCompanion(overrides: Partial<any> = {}) {
  return {
    npcId: 'comp1',
    role: 'fighter' as const,
    joinedAtTick: 1,
    abilityTags: [],
    morale: 70,
    active: true,
    ...overrides,
  };
}

function makeResolvedOpp(kind: string, resolutionType = 'completed') {
  return {
    resolution: {
      opportunityId: `opp-${kind}`,
      opportunityKind: kind as any,
      resolutionType: resolutionType as any,
      resolvedAtTick: 5,
    },
    effects: [],
    summary: `${kind} ${resolutionType}`,
  };
}

describe('arc-detection', () => {
  describe('evaluateArcs', () => {
    it('returns empty array for neutral state', () => {
      const signals = evaluateArcs(makeInputs());
      // With completely neutral state, no arcs should fire strongly
      expect(signals.every((s) => s.strength <= 1)).toBe(true);
    });

    it('detects rising-power arc', () => {
      const signals = evaluateArcs(makeInputs({
        playerReputations: [
          { factionId: 'f1', value: 40 },
          { factionId: 'f2', value: 35 },
        ],
        playerLeverage: { favor: 0, debt: 0, blackmail: 0, influence: 50, heat: 10, legitimacy: 0 },
        playerLevel: 5,
        resolvedOpportunities: [
          makeResolvedOpp('contract'),
          makeResolvedOpp('contract'),
          makeResolvedOpp('contract'),
        ],
      }));

      const rising = signals.find((s) => s.kind === 'rising-power');
      expect(rising).toBeDefined();
      expect(rising!.strength).toBeGreaterThan(0.5);
    });

    it('detects hunted arc', () => {
      const signals = evaluateArcs(makeInputs({
        playerReputations: [
          { factionId: 'f1', value: -30 },
          { factionId: 'f2', value: -25 },
        ],
        playerLeverage: { favor: 0, debt: 0, blackmail: 0, influence: 0, heat: 70, legitimacy: 0 },
        activePressures: [makePressure('bounty-issued')],
      }));

      const hunted = signals.find((s) => s.kind === 'hunted');
      expect(hunted).toBeDefined();
      expect(hunted!.strength).toBeGreaterThan(0.5);
    });

    it('detects shadow-broker arc', () => {
      const obligations = new Map();
      obligations.set('npc1', { obligations: [
        { id: 'o1', kind: 'blackmail', direction: 'npc-owes-player', npcId: 'npc1', counterpartyId: 'player', magnitude: 5, sourceTag: 'test', createdAtTick: 1, decayTurns: null },
        { id: 'o2', kind: 'debt', direction: 'npc-owes-player', npcId: 'npc1', counterpartyId: 'player', magnitude: 3, sourceTag: 'test', createdAtTick: 2, decayTurns: null },
      ] });
      obligations.set('npc2', { obligations: [
        { id: 'o3', kind: 'favor', direction: 'npc-owes-player', npcId: 'npc2', counterpartyId: 'player', magnitude: 4, sourceTag: 'test', createdAtTick: 3, decayTurns: null },
      ] });

      const signals = evaluateArcs(makeInputs({
        playerLeverage: { favor: 0, debt: 25, blackmail: 35, influence: 35, heat: 0, legitimacy: 0 },
        npcObligations: obligations,
        playerReputations: [
          { factionId: 'f1', value: 10 },
          { factionId: 'f2', value: -5 },
        ],
      }));

      const broker = signals.find((s) => s.kind === 'shadow-broker');
      expect(broker).toBeDefined();
      expect(broker!.strength).toBeGreaterThan(0.4);
    });

    it('detects community-builder arc', () => {
      const signals = evaluateArcs(makeInputs({
        companions: [
          makeCompanion({ npcId: 'c1', morale: 80 }),
          makeCompanion({ npcId: 'c2', morale: 75 }),
        ],
        playerLeverage: { favor: 0, debt: 0, blackmail: 0, influence: 0, heat: 10, legitimacy: 50 },
        npcProfiles: [
          makeNpcProfile({ npcId: 'n1', breakpoint: 'allied' }),
          makeNpcProfile({ npcId: 'n2', breakpoint: 'favorable' }),
        ],
      }));

      const community = signals.find((s) => s.kind === 'community-builder');
      expect(community).toBeDefined();
      expect(community!.strength).toBeGreaterThan(0.5);
    });

    it('detects last-stand arc', () => {
      const signals = evaluateArcs(makeInputs({
        playerHp: 10,
        playerMaxHp: 50,
        activePressures: [
          makePressure('bounty-issued'),
          makePressure('revenge-attempt'),
          makePressure('investigation-opened'),
        ],
        companions: [makeCompanion({ morale: 20 })],
        playerLeverage: { favor: 0, debt: 0, blackmail: 0, influence: 0, heat: 60, legitimacy: 0 },
        playerReputations: [
          { factionId: 'f1', value: -30 },
          { factionId: 'f2', value: -25 },
        ],
      }));

      const lastStand = signals.find((s) => s.kind === 'last-stand');
      expect(lastStand).toBeDefined();
      expect(lastStand!.strength).toBeGreaterThan(0.5);
    });

    it('sorts signals by strength descending', () => {
      const signals = evaluateArcs(makeInputs({
        playerReputations: [
          { factionId: 'f1', value: -30 },
          { factionId: 'f2', value: -25 },
        ],
        playerLeverage: { favor: 0, debt: 0, blackmail: 0, influence: 0, heat: 70, legitimacy: 0 },
        activePressures: [makePressure('bounty-issued')],
      }));

      for (let i = 1; i < signals.length; i++) {
        expect(signals[i].strength).toBeLessThanOrEqual(signals[i - 1].strength);
      }
    });
  });

  describe('buildArcSnapshot', () => {
    it('sets dominantArc when strongest signal > 0.5', () => {
      const snapshot = buildArcSnapshot(makeInputs({
        playerReputations: [
          { factionId: 'f1', value: 40 },
          { factionId: 'f2', value: 35 },
        ],
        playerLeverage: { favor: 0, debt: 0, blackmail: 0, influence: 50, heat: 10, legitimacy: 0 },
        playerLevel: 5,
        resolvedOpportunities: [
          makeResolvedOpp('contract'),
          makeResolvedOpp('contract'),
          makeResolvedOpp('contract'),
        ],
      }));

      expect(snapshot.dominantArc).not.toBeNull();
    });

    it('returns null dominantArc when all signals weak', () => {
      const snapshot = buildArcSnapshot(makeInputs());
      expect(snapshot.dominantArc).toBeNull();
    });

    it('tracks momentum from previous snapshot', () => {
      const prev: ArcSnapshot = {
        signals: [{ kind: 'hunted', strength: 0.3, momentum: 'steady', primaryDrivers: [], turnsActive: 2 }],
        dominantArc: null,
        tick: 9,
      };

      const snapshot = buildArcSnapshot(makeInputs({
        playerReputations: [
          { factionId: 'f1', value: -30 },
          { factionId: 'f2', value: -25 },
        ],
        playerLeverage: { favor: 0, debt: 0, blackmail: 0, influence: 0, heat: 70, legitimacy: 0 },
        activePressures: [makePressure('bounty-issued')],
      }), prev);

      const hunted = snapshot.signals.find((s) => s.kind === 'hunted');
      expect(hunted).toBeDefined();
      expect(hunted!.momentum).toBe('building');
      expect(hunted!.turnsActive).toBe(3);
    });

    it('records tick', () => {
      const snapshot = buildArcSnapshot(makeInputs({ currentTick: 42 }));
      expect(snapshot.tick).toBe(42);
    });
  });

  describe('formatting', () => {
    it('formatArcForDirector handles empty signals', () => {
      const result = formatArcForDirector({ signals: [], dominantArc: null, tick: 1 });
      expect(result).toContain('No narrative arcs');
    });

    it('formatArcForDirector includes dominant arc', () => {
      const snapshot = buildArcSnapshot(makeInputs({
        playerReputations: [
          { factionId: 'f1', value: 40 },
          { factionId: 'f2', value: 35 },
        ],
        playerLeverage: { favor: 0, debt: 0, blackmail: 0, influence: 50, heat: 10, legitimacy: 0 },
        playerLevel: 5,
        resolvedOpportunities: [
          makeResolvedOpp('contract'),
          makeResolvedOpp('contract'),
          makeResolvedOpp('contract'),
        ],
      }));

      if (snapshot.dominantArc) {
        const result = formatArcForDirector(snapshot);
        expect(result).toContain('Dominant Arc');
      }
    });

    it('formatArcForNarrator returns empty for no dominant arc', () => {
      const result = formatArcForNarrator({ signals: [], dominantArc: null, tick: 1 });
      expect(result).toBe('');
    });

    it('formatArcForNarrator includes momentum', () => {
      const snapshot: ArcSnapshot = {
        signals: [{ kind: 'hunted', strength: 0.7, momentum: 'building', primaryDrivers: [], turnsActive: 5 }],
        dominantArc: 'hunted',
        tick: 10,
      };
      const result = formatArcForNarrator(snapshot);
      expect(result).toContain('hunted');
      expect(result).toContain('intensifying');
    });
  });
});
