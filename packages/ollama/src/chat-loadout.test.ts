// Tests — loadout adapter: task string building, source mapping, routing, formatting

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildTaskString,
  routeContext,
  recordContextLoads,
  formatLoadoutRoute,
  summarizeIssueBuckets,
  explainProfileInfluence,
} from './chat-loadout.js';
import type { LoadoutRoutePlan, RoutedEntry } from './chat-loadout.js';
import type { DesignSession } from './session.js';
import type { ChatIntent } from './chat-types.js';
import { ANALYST_PROFILE, GENERATOR_PROFILE, WORLDBUILDER_PROFILE, ROUTER_PROFILE } from './chat-personality.js';
import type { PersonalityProfile } from './chat-personality.js';

// --- Helpers ---

function makeSession(overrides: Partial<DesignSession> = {}): DesignSession {
  return {
    name: 'test-loadout-session',
    model: 'test-model',
    createdAt: '2025-01-01',
    themes: ['horror', 'gothic', 'mystery'],
    constraints: ['no magic'],
    artifacts: {
      districts: ['old-quarter'],
      factions: ['thieves-guild'],
      quests: [],
      rooms: ['dark-chapel', 'market'],
      packs: [],
    },
    issues: [
      { severity: 'warning', code: 'PACING', target: 'dark-chapel', summary: 'Slow pacing', status: 'open' },
      { severity: 'info', code: 'THEME', target: 'market', summary: 'Too bright', status: 'resolved' },
    ],
    acceptedSuggestions: [],
    history: [],
    ...overrides,
  } as DesignSession;
}

function makeRoutedEntry(overrides: Partial<RoutedEntry> = {}): RoutedEntry {
  return {
    id: 'test-entry',
    reason: 'matched test keyword',
    matchedTerms: ['test'],
    score: 0.85,
    mode: 'eager',
    tokensEst: 500,
    layer: 'project',
    ...overrides,
  };
}

// --- buildTaskString ---

describe('buildTaskString', () => {
  it('builds task string with intent, message, and no session', () => {
    const result = buildTaskString('describe the chapel', 'scaffold', null);
    expect(result).toContain('intent: scaffold');
    expect(result).toContain('task: describe the chapel');
    expect(result).not.toContain('session:');
  });

  it('includes session summary when session is provided', () => {
    const session = makeSession();
    const result = buildTaskString('describe the chapel', 'scaffold', session);
    expect(result).toContain('intent: scaffold');
    expect(result).toContain('task: describe the chapel');
    expect(result).toContain('session: test-loadout-session');
    expect(result).toContain('4 artifacts');
    expect(result).toContain('1 open issues');
    expect(result).toContain('horror, gothic, mystery');
  });

  it('truncates long messages to 200 chars', () => {
    const longMsg = 'x'.repeat(300);
    const result = buildTaskString(longMsg, 'explain_why', null);
    expect(result).toContain('…');
    expect(result.length).toBeLessThan(350);
  });

  it('handles all intent types without crashing', () => {
    const intents: ChatIntent[] = [
      'scaffold', 'explain_why', 'critique', 'suggest_next',
      'compare_replays', 'improve', 'explain_state', 'analyze_replay',
      'plan', 'session_info', 'apply_content', 'help',
      'unknown', 'context_info', 'show_plan', 'recommend',
    ];
    for (const intent of intents) {
      const result = buildTaskString('test', intent, null);
      expect(result).toContain(`intent: ${intent}`);
    }
  });

  it('counts artifacts correctly with empty categories', () => {
    const session = makeSession({
      artifacts: { districts: [], factions: [], quests: [], rooms: [], packs: [] },
    });
    const result = buildTaskString('test', 'scaffold', session);
    expect(result).toContain('0 artifacts');
  });

  it('limits themes to first 3', () => {
    const session = makeSession({
      themes: ['horror', 'gothic', 'mystery', 'noir', 'steampunk'],
    });
    const result = buildTaskString('test', 'scaffold', session);
    expect(result).toContain('horror, gothic, mystery');
    expect(result).not.toContain('noir');
  });
});

// --- routeContext ---

describe('routeContext', () => {
  it('returns passthrough plan when ai-loadout is not installed', async () => {
    const plan = await routeContext('intent: scaffold | task: describe the chapel', '/tmp/test');
    expect(plan.active).toBe(false);
    expect(plan.preload).toEqual([]);
    expect(plan.onDemand).toEqual([]);
    expect(plan.manualCount).toBe(0);
    // Passthrough allows all sources
    expect(plan.allowedSources).toContain('session');
    expect(plan.allowedSources).toContain('artifact');
    expect(plan.allowedSources).toContain('doc');
    expect(plan.allowedSources).toContain('transcript');
    expect(plan.allowedSources).toContain('critique');
    expect(plan.allowedSources).toContain('replay');
    expect(plan.allowedSources).toContain('decision');
  });

  it('preserves task string in passthrough plan', async () => {
    const task = 'intent: scaffold | task: build a room';
    const plan = await routeContext(task, '/tmp/test');
    expect(plan.taskString).toBe(task);
  });

  it('passthrough plan has zero token counts', async () => {
    const plan = await routeContext('test', '/tmp/test');
    expect(plan.preloadTokens).toBe(0);
    expect(plan.onDemandTokens).toBe(0);
  });
});

// --- recordContextLoads ---

describe('recordContextLoads', () => {
  it('does nothing when ai-loadout is not installed', async () => {
    const entries = [makeRoutedEntry()];
    // Should not throw
    await expect(recordContextLoads(entries, '/tmp/test')).resolves.toBeUndefined();
  });

  it('handles empty entries array', async () => {
    await expect(recordContextLoads([], '/tmp/test')).resolves.toBeUndefined();
  });
});

// --- formatLoadoutRoute ---

describe('formatLoadoutRoute', () => {
  it('formats inactive plan', () => {
    const plan: LoadoutRoutePlan = {
      active: false,
      preload: [],
      onDemand: [],
      manualCount: 0,
      allowedSources: ['session', 'artifact', 'critique', 'replay', 'transcript', 'doc', 'decision'],
      preloadTokens: 0,
      onDemandTokens: 0,
      layers: [],
      taskString: 'test',
      profileInfluence: '',
    };
    const output = formatLoadoutRoute(plan);
    expect(output).toContain('not active');
  });

  it('formats active plan with preload entries', () => {
    const plan: LoadoutRoutePlan = {
      active: true,
      preload: [
        makeRoutedEntry({ id: 'session-rules', score: 0.92, reason: 'matched session keyword', layer: 'project' }),
        makeRoutedEntry({ id: 'artifact-schema', score: 0.78, reason: 'matched artifact pattern', layer: 'org' }),
      ],
      onDemand: [
        makeRoutedEntry({ id: 'replay-analysis', score: 0.55, reason: 'lazy match', mode: 'lazy', layer: 'global' }),
      ],
      manualCount: 2,
      allowedSources: ['session', 'artifact', 'replay'],
      preloadTokens: 1500,
      onDemandTokens: 300,
      layers: ['global', 'org', 'project'],
      taskString: 'intent: scaffold | task: build a chapel',
      profileInfluence: '',
    };

    const output = formatLoadoutRoute(plan);
    expect(output).toContain('## Loadout Routing');
    expect(output).toContain('session-rules');
    expect(output).toContain('artifact-schema');
    expect(output).toContain('replay-analysis');
    expect(output).toContain('session, artifact, replay');
    expect(output).toContain('global → org → project');
    expect(output).toContain('1500 preload');
    expect(output).toContain('300 on-demand');
    expect(output).toContain('Manual: 2');
  });

  it('truncates long task strings in output', () => {
    const plan: LoadoutRoutePlan = {
      active: true,
      preload: [],
      onDemand: [],
      manualCount: 0,
      allowedSources: ['session'],
      preloadTokens: 0,
      onDemandTokens: 0,
      layers: ['project'],
      taskString: 'x'.repeat(200),
      profileInfluence: '',
    };
    const output = formatLoadoutRoute(plan);
    expect(output).toContain('…');
  });

  it('handles empty layers gracefully', () => {
    const plan: LoadoutRoutePlan = {
      active: true,
      preload: [],
      onDemand: [],
      manualCount: 0,
      allowedSources: ['session'],
      preloadTokens: 0,
      onDemandTokens: 0,
      layers: [],
      taskString: 'test',
      profileInfluence: '',
    };
    const output = formatLoadoutRoute(plan);
    expect(output).toContain('(none)');
  });
});

// --- LoadoutRoutePlan type shape ---

describe('LoadoutRoutePlan shape', () => {
  it('passthrough plan satisfies the type contract', async () => {
    const plan = await routeContext('test', '/tmp');
    // Verify all required fields exist
    expect(typeof plan.active).toBe('boolean');
    expect(Array.isArray(plan.preload)).toBe(true);
    expect(Array.isArray(plan.onDemand)).toBe(true);
    expect(typeof plan.manualCount).toBe('number');
    expect(Array.isArray(plan.allowedSources)).toBe(true);
    expect(typeof plan.preloadTokens).toBe('number');
    expect(typeof plan.onDemandTokens).toBe('number');
    expect(Array.isArray(plan.layers)).toBe(true);
    expect(typeof plan.taskString).toBe('string');
  });
});

// --- Integration: buildTaskString → routeContext chain ---

describe('buildTaskString → routeContext integration', () => {
  it('task string from buildTaskString works with routeContext', async () => {
    const session = makeSession();
    const taskString = buildTaskString('describe the dark chapel', 'scaffold', session);
    const plan = await routeContext(taskString, '/tmp/test');

    // Without ai-loadout, we get passthrough — but the chain should not throw
    expect(plan.taskString).toBe(taskString);
    expect(plan.allowedSources.length).toBeGreaterThan(0);
  });

  it('handles null session gracefully in full chain', async () => {
    const taskString = buildTaskString('help me', 'unknown', null);
    const plan = await routeContext(taskString, '/tmp/test');
    expect(plan.active).toBe(false);
    expect(plan.taskString).toContain('intent: unknown');
  });
});

// --- v1.4.0: Issue bucket summarization (A2) ---

describe('summarizeIssueBuckets', () => {
  it('maps known issue codes to buckets', () => {
    const issues = [
      { severity: 'warning', code: 'SCHEMA', target: 't', summary: 's', status: 'open' },
      { severity: 'warning', code: 'RUMOR', target: 't', summary: 's', status: 'open' },
      { severity: 'warning', code: 'FACTION', target: 't', summary: 's', status: 'open' },
    ] as any;
    const buckets = summarizeIssueBuckets(issues);
    expect(buckets.get('schema')).toBe(1);
    expect(buckets.get('rumor_flow')).toBe(1);
    expect(buckets.get('faction_isolation')).toBe(1);
  });

  it('groups multiple issues into same bucket', () => {
    const issues = [
      { severity: 'warning', code: 'SCHEMA', target: 't1', summary: 's', status: 'open' },
      { severity: 'warning', code: 'VALIDATION', target: 't2', summary: 's', status: 'open' },
    ] as any;
    const buckets = summarizeIssueBuckets(issues);
    expect(buckets.get('schema')).toBe(2);
  });

  it('maps unknown codes to quality bucket', () => {
    const issues = [
      { severity: 'warning', code: 'UNKNOWN_CODE', target: 't', summary: 's', status: 'open' },
    ] as any;
    const buckets = summarizeIssueBuckets(issues);
    expect(buckets.get('quality')).toBe(1);
  });

  it('returns empty map for empty issues', () => {
    const buckets = summarizeIssueBuckets([]);
    expect(buckets.size).toBe(0);
  });

  it('is deterministic — same input always gives same output', () => {
    const issues = [
      { severity: 'high', code: 'DISTRICT', target: 't', summary: 's', status: 'open' },
      { severity: 'low', code: 'PACING', target: 't2', summary: 's', status: 'open' },
    ] as any;
    const a = summarizeIssueBuckets(issues);
    const b = summarizeIssueBuckets(issues);
    expect([...a.entries()]).toEqual([...b.entries()]);
  });
});

// --- v1.4.0: Profile-aware task strings (A1 + B1) ---

describe('buildTaskString — with profile', () => {
  it('includes profile name when profile is provided', () => {
    const result = buildTaskString('test', 'scaffold', null, ANALYST_PROFILE);
    expect(result).toContain('profile: analyst');
  });

  it('omits profile when not provided', () => {
    const result = buildTaskString('test', 'scaffold', null);
    expect(result).not.toContain('profile:');
  });

  it('includes issue buckets when session has issues', () => {
    const session = makeSession({
      issues: [
        { severity: 'high', code: 'SCHEMA', target: 't', summary: 's', status: 'open' },
        { severity: 'medium', code: 'RUMOR', target: 't', summary: 's', status: 'open' },
      ],
    });
    const result = buildTaskString('test', 'explain_state', session, ANALYST_PROFILE);
    expect(result).toContain('issues:');
    expect(result).toContain('schema');
    expect(result).toContain('rumor_flow');
  });
});

// --- v1.4.0: Profile influence explanation (B2) ---

describe('explainProfileInfluence', () => {
  it('returns explanation for analyst profile', () => {
    const explanation = explainProfileInfluence(ANALYST_PROFILE, ['session', 'artifact']);
    expect(explanation).toContain('analyst');
    expect(explanation.length).toBeGreaterThan(0);
  });

  it('returns explanation for generator profile', () => {
    const explanation = explainProfileInfluence(GENERATOR_PROFILE, ['session', 'artifact']);
    expect(explanation).toContain('generator');
  });

  it('returns explanation for worldbuilder profile', () => {
    const explanation = explainProfileInfluence(WORLDBUILDER_PROFILE, ['session']);
    expect(explanation).toContain('worldbuilder');
  });

  it('is deterministic for same inputs', () => {
    const a = explainProfileInfluence(ANALYST_PROFILE, ['session', 'artifact']);
    const b = explainProfileInfluence(ANALYST_PROFILE, ['session', 'artifact']);
    expect(a).toBe(b);
  });
});

// --- v1.4.0: routeContext with profile (B1) ---

describe('routeContext — with profile', () => {
  it('passthrough plan includes profileInfluence when profile provided', async () => {
    const plan = await routeContext('test', '/tmp/test', ANALYST_PROFILE);
    expect(typeof plan.profileInfluence).toBe('string');
    expect(plan.profileInfluence).toContain('analyst');
  });

  it('passthrough plan has empty profileInfluence without profile', async () => {
    const plan = await routeContext('test', '/tmp/test');
    expect(plan.profileInfluence).toBe('');
  });

  it('different profiles produce different influence strings', async () => {
    const analystPlan = await routeContext('test', '/tmp/test', ANALYST_PROFILE);
    const generatorPlan = await routeContext('test', '/tmp/test', GENERATOR_PROFILE);
    expect(analystPlan.profileInfluence).not.toBe(generatorPlan.profileInfluence);
  });
});

// --- v1.4.0: formatLoadoutRoute shows profile influence ---

describe('formatLoadoutRoute — profile influence', () => {
  it('shows profile influence line when present', () => {
    const plan: LoadoutRoutePlan = {
      active: true,
      preload: [],
      onDemand: [],
      manualCount: 0,
      allowedSources: ['session', 'artifact'],
      preloadTokens: 0,
      onDemandTokens: 0,
      layers: ['project'],
      taskString: 'test',
      profileInfluence: 'Analyst adds replay, critique, decision',
    };
    const output = formatLoadoutRoute(plan);
    expect(output).toContain('Analyst adds replay, critique, decision');
  });

  it('omits profile line when influence is empty', () => {
    const plan: LoadoutRoutePlan = {
      active: true,
      preload: [],
      onDemand: [],
      manualCount: 0,
      allowedSources: ['session'],
      preloadTokens: 0,
      onDemandTokens: 0,
      layers: ['project'],
      taskString: 'test',
      profileInfluence: '',
    };
    const output = formatLoadoutRoute(plan);
    expect(output).not.toContain('Profile');
  });
});
