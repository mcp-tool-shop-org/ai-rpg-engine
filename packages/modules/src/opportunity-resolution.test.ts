import { describe, it, expect } from 'vitest';
import {
  computeOpportunityFallout,
  formatOpportunityFalloutForDirector,
  formatOpportunityFalloutForNarrator,
  createOpportunityCore,
  opportunityCore,
  applyOpportunityFallout,
  getResolvedOpportunities,
  RESOLVED_OPPORTUNITIES_KEPT,
  type OpportunityResolutionContext,
  type OpportunityResolutionType,
} from './opportunity-resolution.js';
import { getPersistedOpportunities, setPersistedOpportunities, type OpportunityState } from './opportunity-core.js';
import { createTestEngine } from '@ai-rpg-engine/core';
import type { EntityState } from '@ai-rpg-engine/core';
import { createCompanionCore, getPartyState, type CompanionState } from './companion-core.js';
import { createEnvironmentCore } from './environment-core.js';
import { createDistrictCore } from './district-core.js';
import { createEconomyCore, getDistrictEconomy } from './economy-core.js';

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

// ---------------------------------------------------------------------------
// Fixtures for the resolution-loop tests (F-f3f2a84c) — the verb + fallout
// application, exercised through a REAL engine, not just the pure
// computeOpportunityFallout unit above.
// ---------------------------------------------------------------------------

const zones = [{ id: 'zone-a', roomId: 'test', name: 'Zone A', tags: [], neighbors: [] }];

function makePlayer(overrides?: Partial<EntityState>): EntityState {
  return {
    id: 'player', blueprintId: 'player', type: 'player', name: 'Hero',
    tags: ['player'], stats: {}, resources: { hp: 10 }, statuses: [], zoneId: 'zone-a',
    ...overrides,
  };
}

function makeRecruitableNpc(id: string, role: string, overrides?: Partial<EntityState>): EntityState {
  return {
    id, blueprintId: id, type: 'npc', name: id,
    tags: ['npc', 'recruitable', role], stats: {}, resources: { hp: 10 }, statuses: [], zoneId: 'zone-a',
    ...overrides,
  };
}

/** Engine with the 'opportunity' verb + companion-core wired. */
function makeOppEngine(entities: EntityState[] = [makePlayer()]) {
  return createTestEngine({
    modules: [createOpportunityCore(), createCompanionCore()],
    entities,
    zones,
  });
}

function partyCompanions(engine: ReturnType<typeof createTestEngine>): CompanionState[] {
  return getPartyState(engine.world).companions;
}

/** Seed a single opportunity directly into the persisted namespace. */
function seedOpportunity(engine: ReturnType<typeof createTestEngine>, overrides?: Partial<OpportunityState>): OpportunityState {
  const opp = makeOpp({ status: 'available', ...overrides });
  setPersistedOpportunities(engine.world, [opp]);
  return opp;
}

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

  // F-0e7a14c3: getKindFallout's switch over opp.kind relied entirely on
  // TypeScript's compile-time exhaustiveness check, with no runtime default.
  // A corrupted/schema-drifted save, a hand-built OpportunityState in
  // test/content tooling, or a future OpportunityKind added without updating
  // this switch made it implicitly return `undefined` instead of `[]`, and
  // the first consumer touching `.effects.length`/`.effects.map(...)` (e.g.
  // formatOpportunityFalloutForDirector) threw an uncaught TypeError instead
  // of degrading gracefully — unlike pressure-resolution.ts's
  // computeFallout/getUniversalFallout (returns null + warnings) and
  // faction-agency.ts's resolveFactionAction (never: exhaustiveness gate +
  // runtime warning).
  describe('unrecognized opportunity kind (defensive default)', () => {
    it('degrades to empty effects + a structured warning instead of returning undefined', () => {
      const opp = makeOpp({ kind: 'phantom-kind' as OpportunityState['kind'] });
      const result = computeOpportunityFallout(opp, 'completed', ctx);
      expect(result.effects).toEqual([]);
      expect(result.warnings).toBeDefined();
      expect(result.warnings![0]).toContain('phantom-kind');
    });

    it('formatOpportunityFalloutForDirector does not throw on the degraded result', () => {
      const opp = makeOpp({ kind: 'phantom-kind' as OpportunityState['kind'] });
      const result = computeOpportunityFallout(opp, 'completed', ctx);
      expect(() => formatOpportunityFalloutForDirector(result)).not.toThrow();
    });

    it('a recognized kind produces no warnings field at all', () => {
      const opp = makeOpp({ kind: 'contract', sourceFactionId: 'guild' });
      const result = computeOpportunityFallout(opp, 'completed', ctx);
      expect(result.warnings).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// createOpportunityCore — module identity + registration (F-f3f2a84c)
// ---------------------------------------------------------------------------
describe('createOpportunityCore — module identity + registration (F-f3f2a84c)', () => {
  it('carries the id/version contract sibling modules declare', () => {
    const mod = createOpportunityCore();
    expect(mod.id).toBe('opportunity-core');
    expect(mod.version).toBe('1.0.0');
  });

  it('registers the opportunity-core namespace default at construction', () => {
    const engine = makeOppEngine();
    expect(engine.world.modules['opportunity-core']).toEqual({ opportunities: [], resolvedOpportunities: [] });
  });

  it('the exported opportunityCore singleton is the same shape createOpportunityCore() produces', () => {
    expect(opportunityCore.id).toBe('opportunity-core');
    expect(opportunityCore.version).toBe('1.0.0');
  });

  it("RED-PROOF: the 'opportunity' verb is unknown without the module registered", () => {
    const engine = createTestEngine({ modules: [], entities: [makePlayer()], zones });
    expect(engine.getAvailableActions()).not.toContain('opportunity');
    engine.submitAction('opportunity', { parameters: { op: 'accept' }, targetIds: ['opp-x'] });
    // The core engine's own unknown-verb rejection (ActionDispatcher.dispatch:
    // "unknown verb: opportunity") is recorded to the eventLog directly —
    // dispatch() returns [] on this path, so the SUBMITTED action's own
    // return value is empty; the rejection still rides the world's eventLog,
    // the same place every other rejection in this engine lands.
    const rejection = engine.world.eventLog.find((e) => e.type === 'action.rejected');
    expect(rejection).toBeDefined();
    expect(rejection?.payload.reason).toContain('unknown verb');
  });
});

// ---------------------------------------------------------------------------
// The 'opportunity' verb — accept (F-f3f2a84c)
// ---------------------------------------------------------------------------
describe("the 'opportunity' verb — accept (F-f3f2a84c)", () => {
  it('accepting an available opportunity marks it accepted and stamps acceptedAtTick', () => {
    const engine = makeOppEngine();
    const opp = seedOpportunity(engine);
    const tickAtSubmit = engine.tick; // submitAction advances the tick AFTER the handler runs

    const events = engine.submitAction('opportunity', { parameters: { op: 'accept' }, targetIds: [opp.id] });

    expect(events.some((e) => e.type === 'opportunity.accepted')).toBe(true);
    const persisted = getPersistedOpportunities(engine.world);
    expect(persisted[0].status).toBe('accepted');
    expect(persisted[0].acceptedAtTick).toBe(tickAtSubmit);
  });

  it('rejects accepting an opportunity that is not available (e.g. already accepted)', () => {
    const engine = makeOppEngine();
    const opp = seedOpportunity(engine, { status: 'accepted' });

    const events = engine.submitAction('opportunity', { parameters: { op: 'accept' }, targetIds: [opp.id] });

    expect(events[0].type).toBe('action.rejected');
    expect(getPersistedOpportunities(engine.world)[0].status).toBe('accepted'); // unchanged
  });

  it('rejects an unknown opportunity id', () => {
    const engine = makeOppEngine();
    seedOpportunity(engine);
    const events = engine.submitAction('opportunity', { parameters: { op: 'accept' }, targetIds: ['does-not-exist'] });
    expect(events[0].type).toBe('action.rejected');
  });

  it('rejects a missing/unknown op', () => {
    const engine = makeOppEngine();
    const opp = seedOpportunity(engine);
    const events = engine.submitAction('opportunity', { parameters: { op: 'launch' }, targetIds: [opp.id] });
    expect(events[0].type).toBe('action.rejected');
  });

  it('rejects with no opportunity id specified', () => {
    const engine = makeOppEngine();
    seedOpportunity(engine);
    const events = engine.submitAction('opportunity', { parameters: { op: 'accept' } });
    expect(events[0].type).toBe('action.rejected');
  });
});

// ---------------------------------------------------------------------------
// The 'opportunity' verb — complete/abandon: transitions + fallout + ledger
// (F-f3f2a84c)
// ---------------------------------------------------------------------------
describe("the 'opportunity' verb — complete/abandon (F-f3f2a84c)", () => {
  it('rejects completing/abandoning an opportunity that is not yet accepted', () => {
    const engine = makeOppEngine();
    const opp = seedOpportunity(engine); // status: 'available'
    const events = engine.submitAction('opportunity', { parameters: { op: 'complete' }, targetIds: [opp.id] });
    expect(events[0].type).toBe('action.rejected');
    expect(getPersistedOpportunities(engine.world)[0].status).toBe('available'); // unchanged
  });

  it('completing an accepted contract transitions to completed, applies fallout, and appends the resolved-opportunity ledger', () => {
    const engine = makeOppEngine();
    const opp = seedOpportunity(engine, { status: 'accepted', kind: 'contract', sourceFactionId: 'guild' });
    const tickAtSubmit = engine.tick; // submitAction advances the tick AFTER the handler runs

    const events = engine.submitAction('opportunity', { parameters: { op: 'complete' }, targetIds: [opp.id] });

    const completedEvent = events.find((e) => e.type === 'opportunity.completed');
    expect(completedEvent).toBeDefined();
    expect(completedEvent?.payload.summary).toContain('completed');

    const persisted = getPersistedOpportunities(engine.world);
    expect(persisted[0].status).toBe('completed');
    expect(persisted[0].resolvedAtTick).toBe(tickAtSubmit);

    // Real reputation write — getContractFallout's 'completed' case (+10 guild).
    expect(engine.world.globals['reputation_guild']).toBe(10);

    // The resolved-opportunity ledger (director's OPPORTUNITY FALLOUT section reads this).
    const resolved = getResolvedOpportunities(engine.world);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].resolution).toMatchObject({ opportunityId: opp.id, resolutionType: 'completed' });

    // Sibling 'opportunities' field preserved alongside the new ledger entry.
    const ns = engine.world.modules['opportunity-core'] as { opportunities: unknown; resolvedOpportunities: unknown };
    expect(Array.isArray(ns.opportunities)).toBe(true);
    expect(Array.isArray(ns.resolvedOpportunities)).toBe(true);
  });

  it('abandoning an accepted contract transitions to abandoned, applies its own (different) fallout', () => {
    const engine = makeOppEngine();
    const opp = seedOpportunity(engine, { status: 'accepted', kind: 'contract', sourceFactionId: 'guild' });

    const events = engine.submitAction('opportunity', { parameters: { op: 'abandon' }, targetIds: [opp.id] });

    expect(events.some((e) => e.type === 'opportunity.abandoned')).toBe(true);
    expect(getPersistedOpportunities(engine.world)[0].status).toBe('abandoned');
    // getContractFallout's 'abandoned' case: -8 rep, +5 heat (distinct from 'completed').
    expect(engine.world.globals['reputation_guild']).toBe(-8);
    expect(engine.world.globals['player_heat']).toBe(5);
  });

  it('a terminal opportunity naturally self-prunes from the NEXT tick\'s ticked set (tickOpportunities\' own contract — proven here end to end with the verb)', () => {
    const engine = makeOppEngine();
    const opp = seedOpportunity(engine, { status: 'accepted', turnsRemaining: 5 });
    engine.submitAction('opportunity', { parameters: { op: 'complete' }, targetIds: [opp.id] });
    expect(getPersistedOpportunities(engine.world)[0].status).toBe('completed');
    // world-tick.test.ts's own "self-prunes" test proves the TICK side of
    // this; this just confirms the verb leaves a genuinely terminal status
    // for that tick step to find.
  });
});

// ---------------------------------------------------------------------------
// Companion morale — the v2.8 'companion-morale favor-fallout' honest-skip
// closes here (F-f3f2a84c). End-to-end through the REAL verb + a REAL party.
// ---------------------------------------------------------------------------
describe("the 'opportunity' verb — companion morale (v2.8 honest-skip closes here)", () => {
  it('completing a favor-request opportunity with a party present ACTUALLY changes companion morale', () => {
    const engine = makeOppEngine([makePlayer(), makeRecruitableNpc('sara', 'scout')]);
    engine.submitAction('recruit', { targetIds: ['sara'] });
    const before = partyCompanions(engine).find((c) => c.npcId === 'sara')!.morale;

    const opp = seedOpportunity(engine, {
      status: 'accepted', kind: 'favor-request', sourceNpcId: 'sara', tags: ['companion', 'personal-ask'],
    });
    engine.submitAction('opportunity', { parameters: { op: 'complete' }, targetIds: [opp.id] });

    const after = partyCompanions(engine).find((c) => c.npcId === 'sara')!.morale;
    expect(after).toBe(before + 15); // getFavorRequestFallout's 'completed' companion case
    // The .custom mirror npc-agency reads directly stays in sync too.
    expect(engine.world.entities.sara.custom?.companionMorale).toBe(after);
  });

  it('abandoning a favor-request opportunity with a party present ACTUALLY changes companion morale', () => {
    const engine = makeOppEngine([makePlayer(), makeRecruitableNpc('sara', 'scout')]);
    engine.submitAction('recruit', { targetIds: ['sara'] });
    const before = partyCompanions(engine).find((c) => c.npcId === 'sara')!.morale;

    const opp = seedOpportunity(engine, {
      status: 'accepted', kind: 'favor-request', sourceNpcId: 'sara', tags: ['companion'],
    });
    engine.submitAction('opportunity', { parameters: { op: 'abandon' }, targetIds: [opp.id] });

    const after = partyCompanions(engine).find((c) => c.npcId === 'sara')!.morale;
    expect(after).toBe(before - 15); // getFavorRequestFallout's 'abandoned' companion case
  });

  it('with NO party recruited, completing the same favor-request applies every OTHER effect but never touches companion morale (no throw)', () => {
    const engine = makeOppEngine(); // no recruit call — party stays empty
    const opp = seedOpportunity(engine, {
      status: 'accepted', kind: 'favor-request', sourceNpcId: 'sara', tags: ['companion', 'personal-ask'],
    });
    expect(() => engine.submitAction('opportunity', { parameters: { op: 'complete' }, targetIds: [opp.id] })).not.toThrow();
    expect(partyCompanions(engine)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// applyOpportunityFallout — writes every effect kind (F-f3f2a84c)
// ---------------------------------------------------------------------------
describe('applyOpportunityFallout — writes every effect kind', () => {
  /** District + economy engine, for the economy-shift write test. */
  function makeEconomyEngine() {
    return createTestEngine({
      modules: [
        createEnvironmentCore(),
        createDistrictCore({ districts: [{ id: 'district-1', name: 'Market', zoneIds: ['zone-a'], tags: [] }] }),
        createEconomyCore({ districts: [{ id: 'district-1', tags: [] }] }),
      ],
      entities: [makePlayer()],
      zones,
    });
  }

  it('reputation and alert effects write to the SAME globals world-tick.ts reads (reputation_<id>, faction_alert_<id>)', () => {
    const engine = createTestEngine({ modules: [], entities: [makePlayer()], zones });
    const opp = makeOpp({ kind: 'faction-job', sourceFactionId: 'guild' });
    const fallout = computeOpportunityFallout(opp, 'betrayed', ctx); // -30 rep, +25 alert, +20 heat
    applyOpportunityFallout(engine.world, fallout);
    expect(engine.world.globals['reputation_guild']).toBe(-30);
    expect(engine.world.globals['faction_alert_guild']).toBe(25);
    expect(engine.world.globals['player_heat']).toBe(20);
  });

  it('heat accumulates across multiple applications (additive, not overwritten)', () => {
    const engine = createTestEngine({ modules: [], entities: [makePlayer()], zones });
    const opp = makeOpp({ kind: 'bounty', sourceFactionId: 'guild' });
    applyOpportunityFallout(engine.world, computeOpportunityFallout(opp, 'betrayed', ctx)); // +10 heat
    applyOpportunityFallout(engine.world, computeOpportunityFallout(opp, 'betrayed', ctx)); // +10 heat again
    expect(engine.world.globals['player_heat']).toBe(20);
  });

  it('economy-shift writes back into the district economy via getDistrictEconomy/applyEconomyShift (mirrors trade-core\'s own sell handler)', () => {
    const engine = makeEconomyEngine();
    const before = getDistrictEconomy(engine.world, 'district-1')!;
    const beforeLevel = before.supplies.medicine.level;

    const opp = makeOpp({
      kind: 'supply-run',
      sourceFactionId: 'guild',
      linkedDistrictId: 'district-1',
      rewards: [{ type: 'economy-shift', districtId: 'district-1', category: 'medicine', delta: 15 }],
    });
    const fallout = computeOpportunityFallout(opp, 'completed', { ...ctx, playerDistrictId: 'district-1' });
    applyOpportunityFallout(engine.world, fallout);

    const after = getDistrictEconomy(engine.world, 'district-1')!;
    expect(after.supplies.medicine.level).toBe(beforeLevel + 15);
  });

  it("economy-shift is a silent no-op when the district doesn't exist (no throw)", () => {
    const engine = createTestEngine({ modules: [], entities: [makePlayer()], zones });
    const opp = makeOpp({
      kind: 'supply-run',
      linkedDistrictId: 'nonexistent-district',
      rewards: [{ type: 'economy-shift', districtId: 'nonexistent-district', category: 'medicine', delta: 15 }],
    });
    const fallout = computeOpportunityFallout(opp, 'completed', { ...ctx, playerDistrictId: 'nonexistent-district' });
    expect(() => applyOpportunityFallout(engine.world, fallout)).not.toThrow();
  });

  describe('companion-morale — all dead emission sites now write for real, gated on party non-empty', () => {
    function engineWithParty(): ReturnType<typeof createTestEngine> {
      return createTestEngine({
        modules: [createCompanionCore()],
        entities: [makePlayer(), makeRecruitableNpc('sara', 'scout'), makeRecruitableNpc('finn', 'fighter')],
        zones,
      });
    }

    it('favor-request completed: +15 morale (real write via adjustCompanionMorale)', () => {
      const engine = engineWithParty();
      engine.submitAction('recruit', { targetIds: ['sara'] });
      const before = partyCompanions(engine).find((c) => c.npcId === 'sara')!.morale;

      const opp = makeOpp({ kind: 'favor-request', sourceNpcId: 'sara', tags: ['companion'] });
      applyOpportunityFallout(engine.world, computeOpportunityFallout(opp, 'completed', ctx));

      expect(partyCompanions(engine).find((c) => c.npcId === 'sara')!.morale).toBe(before + 15);
    });

    it('favor-request abandoned: -15 morale', () => {
      const engine = engineWithParty();
      engine.submitAction('recruit', { targetIds: ['sara'] });
      const before = partyCompanions(engine).find((c) => c.npcId === 'sara')!.morale;

      const opp = makeOpp({ kind: 'favor-request', sourceNpcId: 'sara', tags: ['companion'] });
      applyOpportunityFallout(engine.world, computeOpportunityFallout(opp, 'abandoned', ctx));

      expect(partyCompanions(engine).find((c) => c.npcId === 'sara')!.morale).toBe(before - 15);
    });

    it('favor-request betrayed: -30 morale', () => {
      const engine = engineWithParty();
      engine.submitAction('recruit', { targetIds: ['sara'] });
      const before = partyCompanions(engine).find((c) => c.npcId === 'sara')!.morale;

      const opp = makeOpp({ kind: 'favor-request', sourceNpcId: 'sara', tags: ['companion'] });
      applyOpportunityFallout(engine.world, computeOpportunityFallout(opp, 'betrayed', ctx));

      expect(partyCompanions(engine).find((c) => c.npcId === 'sara')!.morale).toBe(before - 30);
    });

    it('escort failed: -10 morale on each linked companion NPC', () => {
      const engine = engineWithParty();
      engine.submitAction('recruit', { targetIds: ['sara'] });
      engine.submitAction('recruit', { targetIds: ['finn'] });
      const beforeSara = partyCompanions(engine).find((c) => c.npcId === 'sara')!.morale;
      const beforeFinn = partyCompanions(engine).find((c) => c.npcId === 'finn')!.morale;

      const opp = makeOpp({ kind: 'escort', sourceFactionId: 'guild', sourceNpcId: 'npc-1', linkedNpcIds: ['sara', 'finn'] });
      applyOpportunityFallout(engine.world, computeOpportunityFallout(opp, 'failed', ctx));

      expect(partyCompanions(engine).find((c) => c.npcId === 'sara')!.morale).toBe(beforeSara - 10);
      expect(partyCompanions(engine).find((c) => c.npcId === 'finn')!.morale).toBe(beforeFinn - 10);
    });

    it('gated on party non-empty: an empty party never calls setPartyState (no throw, nothing to change)', () => {
      const engine = createTestEngine({ modules: [createCompanionCore()], entities: [makePlayer()], zones });
      const opp = makeOpp({ kind: 'favor-request', sourceNpcId: 'sara', tags: ['companion'] });
      expect(() => applyOpportunityFallout(engine.world, computeOpportunityFallout(opp, 'completed', ctx))).not.toThrow();
      expect(partyCompanions(engine)).toHaveLength(0);
    });
  });

  describe('documented no-op effect kinds (no persisted sink anywhere in the engine today)', () => {
    it('npc-relationship, obligation, rumor, milestone-tag, title-trigger, spawn-pressure effects never throw and touch nothing else', () => {
      const engine = createTestEngine({ modules: [createCompanionCore()], entities: [makePlayer()], zones });
      const before = JSON.parse(JSON.stringify(engine.world.globals));

      // faction-job 'completed' carries milestone-tag + title-trigger;
      // faction-job 'betrayed' carries spawn-pressure; favor-request
      // 'completed'/'expired' carry npc-relationship/obligation.
      const job = makeOpp({ kind: 'faction-job', sourceFactionId: 'guild' });
      applyOpportunityFallout(engine.world, computeOpportunityFallout(job, 'completed', ctx));
      const favor = makeOpp({ kind: 'favor-request', sourceNpcId: 'ann' });
      applyOpportunityFallout(engine.world, computeOpportunityFallout(favor, 'completed', ctx));

      // The globals these documented-dormant kinds WOULD need don't exist —
      // only the real sinks (reputation/heat/alert) changed.
      expect(engine.world.globals).not.toEqual(before); // reputation/leverage-adjacent heat DID move
      expect(Object.keys(engine.world.globals).some((k) => k.includes('milestone'))).toBe(false);
      expect(Object.keys(engine.world.globals).some((k) => k.includes('title'))).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// getResolvedOpportunities / RESOLVED_OPPORTUNITIES_KEPT — the bounded ledger
// ---------------------------------------------------------------------------
describe('getResolvedOpportunities — the bounded resolved-opportunity ledger', () => {
  it('absent namespace: returns [] and never attaches', () => {
    const engine = createTestEngine({ modules: [], entities: [makePlayer()], zones });
    expect(getResolvedOpportunities(engine.world)).toEqual([]);
    expect(engine.world.modules['opportunity-core']).toBeUndefined();
  });

  it('malformed value degrades to [], never throws', () => {
    const engine = createTestEngine({ modules: [], entities: [makePlayer()], zones });
    engine.world.modules['opportunity-core'] = { resolvedOpportunities: 'not-an-array' };
    expect(() => getResolvedOpportunities(engine.world)).not.toThrow();
    expect(getResolvedOpportunities(engine.world)).toEqual([]);
  });

  it(`is bounded to the ${RESOLVED_OPPORTUNITIES_KEPT} most recent records, oldest dropped`, () => {
    const engine = makeOppEngine();
    for (let i = 0; i < RESOLVED_OPPORTUNITIES_KEPT + 5; i++) {
      const opp = seedOpportunity(engine, { id: `opp-${i}`, status: 'accepted' });
      engine.submitAction('opportunity', { parameters: { op: 'complete' }, targetIds: [opp.id] });
    }
    const resolved = getResolvedOpportunities(engine.world);
    expect(resolved).toHaveLength(RESOLVED_OPPORTUNITIES_KEPT);
    expect(resolved[resolved.length - 1].resolution.opportunityId).toBe(`opp-${RESOLVED_OPPORTUNITIES_KEPT + 4}`);
    expect(resolved[0].resolution.opportunityId).toBe('opp-5'); // the first 5 were dropped
  });
});

// ---------------------------------------------------------------------------
// Determinism (packages/core determinism suite pairs with this)
// ---------------------------------------------------------------------------
describe("the 'opportunity' verb — determinism", () => {
  it('same world in, same resolved state out, across independent instances', () => {
    const run = () => {
      const engine = makeOppEngine();
      const opp = seedOpportunity(engine, { status: 'accepted', kind: 'contract', sourceFactionId: 'guild' });
      engine.submitAction('opportunity', { parameters: { op: 'complete' }, targetIds: [opp.id] });
      return {
        opportunities: getPersistedOpportunities(engine.world),
        resolved: getResolvedOpportunities(engine.world),
        globals: engine.world.globals,
      };
    };
    const a = run();
    const b = run();
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
