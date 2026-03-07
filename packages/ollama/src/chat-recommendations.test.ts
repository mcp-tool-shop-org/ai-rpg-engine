// Tests — chat recommendations: leverage-scored structured suggestions

import { describe, it, expect } from 'vitest';
import { generateRecommendations, formatRecommendations } from './chat-recommendations.js';
import type { Recommendation, RecommendationSet } from './chat-recommendations.js';
import type { DesignSession } from './session.js';

function makeSession(overrides: Partial<DesignSession> = {}): DesignSession {
  return {
    name: 'rec-test',
    model: 'test',
    createdAt: '2025-01-01',
    themes: ['steampunk'],
    constraints: [],
    artifacts: { districts: ['clocktower'], factions: ['geargrinders'], quests: [], rooms: ['workshop'], packs: [] },
    issues: [],
    acceptedSuggestions: [],
    history: [],
    ...overrides,
  } as DesignSession;
}

// --- No session ---

describe('generateRecommendations — no session', () => {
  it('recommends starting a session', () => {
    const result = generateRecommendations(null);
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0].code).toBe('REC-START-SESSION');
    expect(result.recommendations[0].priority).toBe('critical');
    expect(result.recommendations[0].leverage).toBe(10);
  });
});

// --- Issue-based recommendations ---

describe('generateRecommendations — high-severity issues', () => {
  it('generates critical fix recommendations for high-severity', () => {
    const session = makeSession({
      issues: [
        { severity: 'high', code: 'PACING', target: 'workshop', summary: 'Pacing too slow', status: 'open' },
      ],
    });
    const result = generateRecommendations(session);
    const fixRec = result.recommendations.find(r => r.code === 'REC-FIX-PACING');
    expect(fixRec).toBeDefined();
    expect(fixRec!.priority).toBe('critical');
    expect(fixRec!.confidence).toBe('high');
    expect(fixRec!.addressesIssues).toContain('PACING');
    expect(fixRec!.leverage).toBeGreaterThanOrEqual(3);
  });

  it('includes cascading issues in leverage score', () => {
    const session = makeSession({
      issues: [
        { severity: 'high', code: 'EXITS', target: 'workshop', summary: 'Missing exits', status: 'open' },
        { severity: 'medium', code: 'FLOW', target: 'workshop', summary: 'Flow broken', status: 'open' },
        { severity: 'medium', code: 'TONE', target: 'workshop', summary: 'Tone off', status: 'open' },
      ],
    });
    const result = generateRecommendations(session);
    const fixRec = result.recommendations.find(r => r.code === 'REC-FIX-EXITS');
    expect(fixRec).toBeDefined();
    // 3 base + 2 blocked issues * 2 = 7
    expect(fixRec!.leverage).toBe(7);
    expect(fixRec!.addressesIssues).toContain('FLOW');
    expect(fixRec!.addressesIssues).toContain('TONE');
  });
});

describe('generateRecommendations — medium-severity issues', () => {
  it('generates high-priority fix recommendations for medium-severity', () => {
    const session = makeSession({
      issues: [
        { severity: 'medium', code: 'STYLE', target: 'workshop', summary: 'Inconsistent', status: 'open' },
      ],
    });
    const result = generateRecommendations(session);
    const fixRec = result.recommendations.find(r => r.code === 'REC-FIX-STYLE');
    expect(fixRec).toBeDefined();
    expect(fixRec!.priority).toBe('high');
    expect(fixRec!.confidence).toBe('medium');
  });

  it('adds dependency on high-severity fixes', () => {
    const session = makeSession({
      issues: [
        { severity: 'high', code: 'EXIT', target: 'workshop', summary: 'Missing', status: 'open' },
        { severity: 'medium', code: 'STYLE', target: 'workshop', summary: 'Inconsistent', status: 'open' },
      ],
    });
    const result = generateRecommendations(session);
    const medRec = result.recommendations.find(r => r.code === 'REC-FIX-STYLE');
    expect(medRec!.dependencies).toContain('REC-FIX-EXIT');
  });
});

// --- Coverage-based recommendations ---

describe('generateRecommendations — missing content', () => {
  it('recommends scaffolding missing districts', () => {
    const session = makeSession({
      artifacts: { districts: [], factions: [], quests: [], rooms: [], packs: [] },
    });
    const result = generateRecommendations(session);
    const districtRec = result.recommendations.find(r => r.code === 'REC-SCAFFOLD-DISTRICT');
    expect(districtRec).toBeDefined();
    expect(districtRec!.leverage).toBe(4);
  });

  it('recommends factions when districts exist but factions missing', () => {
    const session = makeSession({
      artifacts: { districts: ['d1'], factions: [], quests: [], rooms: [], packs: [] },
    });
    const result = generateRecommendations(session);
    const factionRec = result.recommendations.find(r => r.code === 'REC-SCAFFOLD-FACTION');
    expect(factionRec).toBeDefined();
    expect(factionRec!.leverage).toBe(3);
  });

  it('recommends rooms when districts exist but rooms missing', () => {
    const session = makeSession({
      artifacts: { districts: ['d1'], factions: ['f1'], quests: [], rooms: [], packs: [] },
    });
    const result = generateRecommendations(session);
    const roomRec = result.recommendations.find(r => r.code === 'REC-SCAFFOLD-ROOM');
    expect(roomRec).toBeDefined();
  });

  it('recommends quests when factions exist but quests missing', () => {
    const session = makeSession({
      artifacts: { districts: ['d1'], factions: ['f1'], quests: [], rooms: ['r1'], packs: [] },
    });
    const result = generateRecommendations(session);
    const questRec = result.recommendations.find(r => r.code === 'REC-SCAFFOLD-QUEST');
    expect(questRec).toBeDefined();
  });

  it('does not recommend factions when no districts exist', () => {
    const session = makeSession({
      artifacts: { districts: [], factions: [], quests: [], rooms: [], packs: [] },
    });
    const result = generateRecommendations(session);
    const factionRec = result.recommendations.find(r => r.code === 'REC-SCAFFOLD-FACTION');
    expect(factionRec).toBeUndefined();
  });
});

// --- Quality-based recommendations ---

describe('generateRecommendations — quality checks', () => {
  it('recommends critique when content exists but none have been critiqued', () => {
    const session = makeSession(); // has artifacts, no issue_opened events
    const result = generateRecommendations(session);
    const critiqueRec = result.recommendations.find(r => r.code === 'REC-CRITIQUE-CONTENT');
    expect(critiqueRec).toBeDefined();
    expect(critiqueRec!.priority).toBe('high');
  });

  it('does not recommend critique when critique events exist', () => {
    const session = makeSession({
      history: [
        { kind: 'issue_opened', detail: 'Found issue', timestamp: new Date().toISOString() },
      ],
    });
    const result = generateRecommendations(session);
    const critiqueRec = result.recommendations.find(r => r.code === 'REC-CRITIQUE-CONTENT');
    expect(critiqueRec).toBeUndefined();
  });

  it('recommends replay analysis when enough artifacts and no replays', () => {
    const session = makeSession({
      artifacts: { districts: ['d1'], factions: ['f1'], quests: ['q1'], rooms: ['r1'], packs: [] },
    });
    const result = generateRecommendations(session);
    const replayRec = result.recommendations.find(r => r.code === 'REC-ANALYZE-REPLAY');
    expect(replayRec).toBeDefined();
  });
});

// --- Sorting ---

describe('generateRecommendations — sorting', () => {
  it('sorts by priority then leverage descending', () => {
    const session = makeSession({
      issues: [
        { severity: 'high', code: 'A', target: 't1', summary: 'High', status: 'open' },
        { severity: 'medium', code: 'B', target: 't2', summary: 'Med', status: 'open' },
      ],
      artifacts: { districts: [], factions: [], quests: [], rooms: ['r1'], packs: [] },
    });
    const result = generateRecommendations(session);
    // Critical should come before high which comes before medium
    const priorities = result.recommendations.map(r => r.priority);
    const critIdx = priorities.indexOf('critical');
    const highIdx = priorities.indexOf('high');
    if (critIdx >= 0 && highIdx >= 0) {
      expect(critIdx).toBeLessThan(highIdx);
    }
  });
});

// --- Resolved issues ignored ---

describe('generateRecommendations — ignores resolved', () => {
  it('does not recommend fixes for resolved issues', () => {
    const session = makeSession({
      issues: [
        { severity: 'high', code: 'OLD', target: 'workshop', summary: 'Was bad', status: 'resolved' },
      ],
    });
    const result = generateRecommendations(session);
    const fixRec = result.recommendations.find(r => r.code === 'REC-FIX-OLD');
    expect(fixRec).toBeUndefined();
  });
});

// --- formatRecommendations ---

describe('formatRecommendations', () => {
  it('formats non-empty recommendations', () => {
    const recSet: RecommendationSet = {
      recommendations: [{
        code: 'REC-FIX-PACING',
        action: 'Fix bar pacing',
        command: 'improve',
        reason: 'High-severity issue',
        confidence: 'high',
        expectedImpact: 'Resolves PACING',
        dependencies: [],
        priority: 'critical',
        addressesIssues: ['PACING'],
        leverage: 5,
      }],
      context: 'Session "test": 3 artifact(s).',
      signalCount: 1,
    };
    const formatted = formatRecommendations(recSet);
    expect(formatted).toContain('REC-FIX-PACING');
    expect(formatted).toContain('[critical]');
    expect(formatted).toContain('leverage: 5');
    expect(formatted).toContain('Command: improve');
    expect(formatted).toContain('fixes: PACING');
  });

  it('shows "healthy" for empty recommendations', () => {
    const recSet: RecommendationSet = { recommendations: [], context: '', signalCount: 0 };
    const formatted = formatRecommendations(recSet);
    expect(formatted).toContain('healthy');
  });

  it('respects limit parameter', () => {
    const recs: Recommendation[] = Array.from({ length: 10 }, (_, i) => ({
      code: `REC-${i}`,
      action: `Action ${i}`,
      command: 'improve',
      reason: 'Reason',
      confidence: 'medium' as const,
      expectedImpact: 'impact',
      dependencies: [],
      priority: 'medium' as const,
      addressesIssues: [],
      leverage: 1,
    }));
    const recSet: RecommendationSet = { recommendations: recs, context: 'ctx', signalCount: 10 };
    const formatted = formatRecommendations(recSet, 3);
    expect(formatted).toContain('3 recommendation(s)');
    expect(formatted).toContain('... and 7 more.');
  });
});

// --- Signal counting ---

describe('generateRecommendations — signalCount', () => {
  it('counts signals correctly', () => {
    const session = makeSession({
      issues: [
        { severity: 'high', code: 'A', target: 't1', summary: 'Issue A', status: 'open' },
        { severity: 'medium', code: 'B', target: 't2', summary: 'Issue B', status: 'open' },
      ],
    });
    const result = generateRecommendations(session);
    // At least 2 signals (one per issue) + possibly critique + replay
    expect(result.signalCount).toBeGreaterThanOrEqual(2);
  });
});
