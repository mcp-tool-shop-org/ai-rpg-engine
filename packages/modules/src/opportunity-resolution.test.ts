import { describe, it, expect } from 'vitest';
import {
  computeOpportunityFallout,
  formatOpportunityFalloutForDirector,
  formatOpportunityFalloutForNarrator,
  type OpportunityResolutionContext,
  type OpportunityResolutionType,
} from './opportunity-resolution.js';
import type { OpportunityState } from './opportunity-core.js';

function makeOpp(overrides?: Partial<OpportunityState>): OpportunityState {
  return {
    id: 'opp-test',
    kind: 'contract',
    status: 'accepted',
    title: 'Test Opportunity',
    description: 'A test.',
    objectiveDescription: 'Do something.',
    linkedRumorIds: [],
    linkedNpcIds: [],
    tags: [],
    rewards: [],
    risks: [],
    visibility: 'offered',
    urgency: 0.5,
    turnsRemaining: 5,
    createdAtTick: 10,
    genre: 'fantasy',
    ...overrides,
  };
}

const ctx: OpportunityResolutionContext = {
  currentTick: 25,
  playerDistrictId: 'market-district',
  genre: 'fantasy',
};

describe('opportunity-resolution', () => {
  describe('contract fallout', () => {
    it('completed: +rep, +favor, rumor, obligation, milestone', () => {
      const opp = makeOpp({ sourceFactionId: 'guild', sourceNpcId: 'npc-1' });
      const result = computeOpportunityFallout(opp, 'completed', ctx);
      expect(result.resolution.resolutionType).toBe('completed');
      expect(result.effects.find((e) => e.type === 'reputation')).toMatchObject({ factionId: 'guild', delta: 10 });
      expect(result.effects.find((e) => e.type === 'leverage')).toMatchObject({ currency: 'favor', delta: 5 });
      expect(result.effects.find((e) => e.type === 'rumor')).toBeDefined();
      expect(result.effects.find((e) => e.type === 'obligation')).toMatchObject({ direction: 'npc-owes-player', npcId: 'npc-1' });
      expect(result.effects.find((e) => e.type === 'milestone-tag')).toMatchObject({ tag: 'contract-completed' });
    });

    it('abandoned: -rep, rumor, +heat', () => {
      const opp = makeOpp({ sourceFactionId: 'guild' });
      const result = computeOpportunityFallout(opp, 'abandoned', ctx);
      expect(result.effects.find((e) => e.type === 'reputation')).toMatchObject({ delta: -8 });
      expect(result.effects.find((e) => e.type === 'heat')).toMatchObject({ delta: 5 });
      expect(result.effects.find((e) => e.type === 'rumor')).toBeDefined();
    });

    it('betrayed: large -rep, heat spike, spawn-pressure', () => {
      const opp = makeOpp({ sourceFactionId: 'guild', sourceNpcId: 'npc-1' });
      const result = computeOpportunityFallout(opp, 'betrayed', ctx);
      expect(result.effects.find((e) => e.type === 'reputation')).toMatchObject({ delta: -20 });
      expect(result.effects.find((e) => e.type === 'heat')).toMatchObject({ delta: 15 });
      expect(result.effects.find((e) => e.type === 'spawn-pressure')).toMatchObject({ kind: 'investigation-opened' });
      expect(result.effects.find((e) => e.type === 'obligation')).toMatchObject({ kind: 'betrayed', npcId: 'npc-1' });
    });

    it('declined: mild if low urgency', () => {
      const opp = makeOpp({ sourceFactionId: 'guild', urgency: 0.3 });
      const result = computeOpportunityFallout(opp, 'declined', ctx);
      expect(result.effects.length).toBe(0);
    });

    it('declined: small -rep if high urgency', () => {
      const opp = makeOpp({ sourceFactionId: 'guild', urgency: 0.8 });
      const result = computeOpportunityFallout(opp, 'declined', ctx);
      expect(result.effects.find((e) => e.type === 'reputation')).toMatchObject({ delta: -3 });
    });
  });

  describe('favor-request fallout', () => {
    it('completed: +favor, obligation, +trust', () => {
      const opp = makeOpp({ kind: 'favor-request', sourceNpcId: 'elder-ann' });
      const result = computeOpportunityFallout(opp, 'completed', ctx);
      expect(result.effects.find((e) => e.type === 'leverage')).toMatchObject({ currency: 'favor', delta: 5 });
      expect(result.effects.find((e) => e.type === 'obligation')).toMatchObject({ direction: 'npc-owes-player' });
      expect(result.effects.find((e) => e.type === 'npc-relationship')).toMatchObject({ axis: 'trust', delta: 20 });
    });

    it('completed companion: +morale', () => {
      const opp = makeOpp({ kind: 'favor-request', sourceNpcId: 'sara', tags: ['companion', 'personal-ask'] });
      const result = computeOpportunityFallout(opp, 'completed', ctx);
      expect(result.effects.find((e) => e.type === 'companion-morale')).toMatchObject({ npcId: 'sara', delta: 15 });
    });

    it('betrayed companion: large -morale', () => {
      const opp = makeOpp({ kind: 'favor-request', sourceNpcId: 'sara', tags: ['companion'] });
      const result = computeOpportunityFallout(opp, 'betrayed', ctx);
      expect(result.effects.find((e) => e.type === 'companion-morale')).toMatchObject({ delta: -30 });
    });

    it('expired: obligation grows', () => {
      const opp = makeOpp({ kind: 'favor-request', sourceNpcId: 'elder-ann' });
      const result = computeOpportunityFallout(opp, 'expired', ctx);
      expect(result.effects.find((e) => e.type === 'obligation')).toMatchObject({ kind: 'debt', direction: 'player-owes-npc' });
    });
  });

  describe('bounty fallout', () => {
    it('completed: +rep, +blackmail, milestone', () => {
      const opp = makeOpp({ kind: 'bounty', sourceFactionId: 'guild' });
      const result = computeOpportunityFallout(opp, 'completed', ctx);
      expect(result.effects.find((e) => e.type === 'reputation')).toMatchObject({ delta: 15 });
      expect(result.effects.find((e) => e.type === 'leverage')).toMatchObject({ currency: 'blackmail', delta: 5 });
      expect(result.effects.find((e) => e.type === 'milestone-tag')).toMatchObject({ tag: 'bounty-collected' });
    });

    it('betrayed: -rep, +heat', () => {
      const opp = makeOpp({ kind: 'bounty', sourceFactionId: 'guild' });
      const result = computeOpportunityFallout(opp, 'betrayed', ctx);
      expect(result.effects.find((e) => e.type === 'reputation')).toMatchObject({ delta: -15 });
      expect(result.effects.find((e) => e.type === 'heat')).toMatchObject({ delta: 10 });
    });
  });

  describe('supply-run fallout', () => {
    it('completed: +rep, +legitimacy, economy-shift from reward', () => {
      const opp = makeOpp({
        kind: 'supply-run',
        sourceFactionId: 'guild',
        rewards: [{ type: 'economy-shift', districtId: 'market-district', category: 'medicine', delta: 15 }],
      });
      const result = computeOpportunityFallout(opp, 'completed', ctx);
      expect(result.effects.find((e) => e.type === 'reputation')).toMatchObject({ delta: 10 });
      expect(result.effects.find((e) => e.type === 'leverage')).toMatchObject({ currency: 'legitimacy' });
      expect(result.effects.find((e) => e.type === 'economy-shift')).toMatchObject({ category: 'medicine', delta: 15 });
    });

    it('betrayed: spawn-pressure investigation', () => {
      const opp = makeOpp({ kind: 'supply-run', sourceFactionId: 'guild' });
      const result = computeOpportunityFallout(opp, 'betrayed', ctx);
      expect(result.effects.find((e) => e.type === 'spawn-pressure')).toMatchObject({ kind: 'investigation-opened' });
    });
  });

  describe('escort fallout', () => {
    it('completed: +rep, +favor, obligation (saved)', () => {
      const opp = makeOpp({ kind: 'escort', sourceFactionId: 'guild', sourceNpcId: 'npc-1' });
      const result = computeOpportunityFallout(opp, 'completed', ctx);
      expect(result.effects.find((e) => e.type === 'obligation')).toMatchObject({ kind: 'saved', direction: 'npc-owes-player' });
    });

    it('failed: tragic rumor, companion-morale hit on linked NPCs', () => {
      const opp = makeOpp({ kind: 'escort', sourceFactionId: 'guild', sourceNpcId: 'npc-1', linkedNpcIds: ['companion-1'] });
      const result = computeOpportunityFallout(opp, 'failed', ctx);
      expect(result.effects.find((e) => e.type === 'rumor')).toMatchObject({ valence: 'tragic' });
      expect(result.effects.find((e) => e.type === 'companion-morale')).toMatchObject({ npcId: 'companion-1', delta: -10 });
    });
  });

  describe('investigation fallout', () => {
    it('completed: +blackmail, milestone', () => {
      const opp = makeOpp({ kind: 'investigation', sourceFactionId: 'guild' });
      const result = computeOpportunityFallout(opp, 'completed', ctx);
      expect(result.effects.find((e) => e.type === 'leverage')).toMatchObject({ currency: 'blackmail', delta: 8 });
      expect(result.effects.find((e) => e.type === 'milestone-tag')).toMatchObject({ tag: 'investigation-completed' });
    });

    it('betrayed: sold findings, +heat, +blackmail', () => {
      const opp = makeOpp({ kind: 'investigation' });
      const result = computeOpportunityFallout(opp, 'betrayed', ctx);
      expect(result.effects.find((e) => e.type === 'heat')).toMatchObject({ delta: 10 });
      expect(result.effects.find((e) => e.type === 'leverage')).toMatchObject({ currency: 'blackmail', delta: 5 });
    });
  });

  describe('faction-job fallout', () => {
    it('completed: large +rep, +influence, milestone, title', () => {
      const opp = makeOpp({ kind: 'faction-job', sourceFactionId: 'guild' });
      const result = computeOpportunityFallout(opp, 'completed', ctx);
      expect(result.effects.find((e) => e.type === 'reputation')).toMatchObject({ delta: 20 });
      expect(result.effects.find((e) => e.type === 'leverage')).toMatchObject({ currency: 'influence', delta: 8 });
      expect(result.effects.find((e) => e.type === 'milestone-tag')).toMatchObject({ tag: 'faction-mission-completed' });
      expect(result.effects.find((e) => e.type === 'title-trigger')).toMatchObject({ tag: 'faction-operative' });
    });

    it('betrayed: massive -rep, +alert, spawn bounty-issued pressure', () => {
      const opp = makeOpp({ kind: 'faction-job', sourceFactionId: 'guild' });
      const result = computeOpportunityFallout(opp, 'betrayed', ctx);
      expect(result.effects.find((e) => e.type === 'reputation')).toMatchObject({ delta: -30 });
      expect(result.effects.find((e) => e.type === 'alert')).toMatchObject({ delta: 25 });
      expect(result.effects.find((e) => e.type === 'heat')).toMatchObject({ delta: 20 });
      expect(result.effects.find((e) => e.type === 'spawn-pressure')).toMatchObject({ kind: 'bounty-issued' });
    });

    it('declined high-urgency: small -rep and +alert', () => {
      const opp = makeOpp({ kind: 'faction-job', sourceFactionId: 'guild', urgency: 0.8 });
      const result = computeOpportunityFallout(opp, 'declined', ctx);
      expect(result.effects.find((e) => e.type === 'reputation')).toMatchObject({ delta: -5 });
      expect(result.effects.find((e) => e.type === 'alert')).toMatchObject({ delta: 5 });
    });

    it('declined low-urgency: no effects', () => {
      const opp = makeOpp({ kind: 'faction-job', sourceFactionId: 'guild', urgency: 0.3 });
      const result = computeOpportunityFallout(opp, 'declined', ctx);
      expect(result.effects.length).toBe(0);
    });
  });

  describe('resolution metadata', () => {
    it('resolution contains correct fields', () => {
      const opp = makeOpp();
      const result = computeOpportunityFallout(opp, 'completed', ctx);
      expect(result.resolution).toEqual({
        opportunityId: 'opp-test',
        opportunityKind: 'contract',
        resolutionType: 'completed',
        resolvedAtTick: 25,
      });
    });

    it('summary uses kind and title', () => {
      const opp = makeOpp({ title: 'Merchant Deal' });
      const result = computeOpportunityFallout(opp, 'completed', ctx);
      expect(result.summary).toContain('contract');
      expect(result.summary).toContain('Merchant Deal');
      expect(result.summary).toContain('completed');
    });

    it('summary varies by resolution type', () => {
      const opp = makeOpp();
      const resolutions: OpportunityResolutionType[] = ['completed', 'abandoned', 'betrayed', 'expired', 'declined'];
      for (const rt of resolutions) {
        const result = computeOpportunityFallout(opp, rt, ctx);
        expect(result.summary).toContain(rt);
      }
      // 'failed' uses "failure" wording
      const failResult = computeOpportunityFallout(opp, 'failed', ctx);
      expect(failResult.summary).toContain('failure');
    });
  });

  describe('formatting', () => {
    it('formatOpportunityFalloutForDirector includes kind and effects', () => {
      const opp = makeOpp({ kind: 'faction-job', sourceFactionId: 'guild' });
      const fallout = computeOpportunityFallout(opp, 'completed', ctx);
      const text = formatOpportunityFalloutForDirector(fallout);
      expect(text).toContain('faction-job');
      expect(text).toContain('completed');
      expect(text).toContain('+20 reputation');
      expect(text).toContain('+8 influence');
    });

    it('formatOpportunityFalloutForNarrator returns summary', () => {
      const opp = makeOpp();
      const fallout = computeOpportunityFallout(opp, 'failed', ctx);
      const text = formatOpportunityFalloutForNarrator(fallout);
      expect(text).toContain('failure');
    });

    it('formatOpportunityFalloutForDirector handles empty effects', () => {
      const opp = makeOpp({ kind: 'bounty', urgency: 0.3 });
      const fallout = computeOpportunityFallout(opp, 'expired', ctx);
      const text = formatOpportunityFalloutForDirector(fallout);
      expect(text).toContain('expired');
      expect(text).not.toContain('Effects:');
    });
  });

  describe('recovery fallout', () => {
    it('completed: +rep, +legitimacy, rumor', () => {
      const opp = makeOpp({ kind: 'recovery', sourceFactionId: 'guild' });
      const result = computeOpportunityFallout(opp, 'completed', ctx);
      expect(result.effects.find((e) => e.type === 'reputation')).toMatchObject({ delta: 8 });
      expect(result.effects.find((e) => e.type === 'leverage')).toMatchObject({ currency: 'legitimacy' });
      expect(result.effects.find((e) => e.type === 'rumor')).toBeDefined();
    });

    it('betrayed: -rep, +heat', () => {
      const opp = makeOpp({ kind: 'recovery', sourceFactionId: 'guild' });
      const result = computeOpportunityFallout(opp, 'betrayed', ctx);
      expect(result.effects.find((e) => e.type === 'reputation')).toMatchObject({ delta: -10 });
      expect(result.effects.find((e) => e.type === 'heat')).toMatchObject({ delta: 8 });
    });
  });
});
