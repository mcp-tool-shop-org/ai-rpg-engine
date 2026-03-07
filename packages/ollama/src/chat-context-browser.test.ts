// Tests — context browser: snapshot building, formatting, sources

import { describe, it, expect } from 'vitest';
import {
  buildContextSnapshot, formatContextSnapshot, formatSources,
  formatLoadoutHistory, detectRepeatedContext,
} from './chat-context-browser.js';
import type { ContextSnapshot, LoadoutHistoryRow } from './chat-context-browser.js';
import type { RetrievalResult, RetrievedSnippet } from './chat-rag.js';
import type { ShapedContext, ShapedMemory, MemoryClass } from './chat-memory-shaper.js';
import type { PersonalityProfile } from './chat-personality.js';

function makeProfile(name = 'Worldbuilder'): PersonalityProfile {
  return {
    name,
    role: 'test role',
    inferenceHint: 'test hint',
    tone: 'test tone',
    systemInstructions: [],
  } as unknown as PersonalityProfile;
}

function makeSnippet(source: string, origin: string, content: string, score = 0.8): RetrievedSnippet {
  return { source: source as any, origin, content, score };
}

function makeRetrieval(snippets: RetrievedSnippet[], sourcesScanned = 5): RetrievalResult {
  return {
    snippets,
    sourcesScanned,
    excludedSources: [],
    droppedByBudget: 0,
    truncatedCount: 0,
    totalCandidates: snippets.length,
  };
}

function makeMemory(cls: MemoryClass, label: string, content: string, sourceCount = 1): ShapedMemory {
  return { class: cls, label, content, sourceCount };
}

function makeShaped(memories: ShapedMemory[]): ShapedContext {
  const totalChars = memories.reduce((sum, m) => sum + m.content.length, 0);
  const classes = [...new Set(memories.map(m => m.class))];
  return { memories, totalChars, classes };
}

// --- buildContextSnapshot ---

describe('buildContextSnapshot', () => {
  it('builds a snapshot with correct top-level fields', () => {
    const snippets = [
      makeSnippet('artifact', 'rooms/chapel.yaml', 'A dark chapel with vaulted ceilings'),
    ];
    const retrieval = makeRetrieval(snippets, 3);
    const memories = [makeMemory('current_session', 'Session: test', 'Session context here', 2)];
    const shaped = makeShaped(memories);

    const snapshot = buildContextSnapshot({
      query: 'describe the chapel',
      keywords: ['chapel', 'dark'],
      retrievalResult: retrieval,
      shapedContext: shaped,
      profile: makeProfile(),
      intentForProfile: 'scaffold',
    });

    expect(snapshot.query).toBe('describe the chapel');
    expect(snapshot.keywords).toEqual(['chapel', 'dark']);
    expect(snapshot.timestamp).toBeTruthy();
    expect(snapshot.retrieval.sourcesScanned).toBe(3);
    expect(snapshot.retrieval.snippetsSelected).toBe(1);
    expect(snapshot.shaping.classesPresent).toContain('current_session');
    expect(snapshot.activeProfile.name).toBe('Worldbuilder');
  });

  it('calculates budget utilization correctly', () => {
    const snippets = [
      makeSnippet('artifact', 'a.yaml', 'x'.repeat(1000)),
      makeSnippet('session', 'b.json', 'y'.repeat(500)),
    ];
    const retrieval = makeRetrieval(snippets);
    const memories = [
      makeMemory('current_session', 'session', 'z'.repeat(800)),
      makeMemory('open_issues', 'issues', 'w'.repeat(400)),
    ];
    const shaped = makeShaped(memories);

    const snapshot = buildContextSnapshot({
      query: 'test',
      keywords: [],
      retrievalResult: retrieval,
      shapedContext: shaped,
      profile: makeProfile(),
      intentForProfile: 'explain_state',
      retrievalBudget: 4000,
      shapingBudget: 4000,
    });

    expect(snapshot.budget.retrievalUsed).toBe(1500);
    expect(snapshot.budget.shapingUsed).toBe(1200);
    expect(snapshot.budget.utilizationPercent).toBe(Math.round((1500 + 1200) / 8000 * 100));
  });

  it('builds retrieval summary by source', () => {
    const snippets = [
      makeSnippet('artifact', 'a.yaml', 'content a'),
      makeSnippet('artifact', 'b.yaml', 'content b'),
      makeSnippet('session', 'session.json', 'session content'),
    ];
    const retrieval = makeRetrieval(snippets, 10);

    const snapshot = buildContextSnapshot({
      query: 'test',
      keywords: [],
      retrievalResult: retrieval,
      shapedContext: makeShaped([]),
      profile: makeProfile(),
      intentForProfile: 'help',
    });

    expect(snapshot.retrieval.bySource['artifact']).toBe(2);
    expect(snapshot.retrieval.bySource['session']).toBe(1);
  });

  it('generates match reasons from keyword hits', () => {
    const snippets = [
      makeSnippet('artifact', 'chapel.yaml', 'The dark chapel has dark corridors and a dark altar'),
    ];
    const retrieval = makeRetrieval(snippets);

    const snapshot = buildContextSnapshot({
      query: 'describe dark chapel',
      keywords: ['dark', 'chapel'],
      retrievalResult: retrieval,
      shapedContext: makeShaped([]),
      profile: makeProfile(),
      intentForProfile: 'scaffold',
    });

    expect(snapshot.retrieval.topSnippets[0].matchReason).toContain('dark');
    expect(snapshot.retrieval.topSnippets[0].matchReason).toContain('chapel');
  });

  it('limits top snippets to 5', () => {
    const snippets = Array.from({ length: 8 }, (_, i) =>
      makeSnippet('artifact', `file${i}.yaml`, `content ${i}`)
    );
    const retrieval = makeRetrieval(snippets);

    const snapshot = buildContextSnapshot({
      query: 'test',
      keywords: [],
      retrievalResult: retrieval,
      shapedContext: makeShaped([]),
      profile: makeProfile(),
      intentForProfile: 'help',
    });

    expect(snapshot.retrieval.topSnippets).toHaveLength(5);
    expect(snapshot.retrieval.snippetsSelected).toBe(8);
  });

  it('calculates per-class budget percentages', () => {
    const memories = [
      makeMemory('current_session', 'session', 'a'.repeat(600)),
      makeMemory('open_issues', 'issues', 'b'.repeat(400)),
    ];
    const shaped = makeShaped(memories);

    const snapshot = buildContextSnapshot({
      query: 'test',
      keywords: [],
      retrievalResult: makeRetrieval([]),
      shapedContext: shaped,
      profile: makeProfile(),
      intentForProfile: 'help',
    });

    const sessionClass = snapshot.shaping.byClass.find(c => c.class === 'current_session');
    const issuesClass = snapshot.shaping.byClass.find(c => c.class === 'open_issues');
    expect(sessionClass!.budgetPercent).toBe(60);
    expect(issuesClass!.budgetPercent).toBe(40);
  });

  it('returns "baseline context" when no keywords', () => {
    const snippets = [makeSnippet('artifact', 'a.yaml', 'some content')];
    const retrieval = makeRetrieval(snippets);

    const snapshot = buildContextSnapshot({
      query: 'test',
      keywords: [],
      retrievalResult: retrieval,
      shapedContext: makeShaped([]),
      profile: makeProfile(),
      intentForProfile: 'help',
    });

    expect(snapshot.retrieval.topSnippets[0].matchReason).toBe('baseline context');
  });

  it('returns "metadata match" when keywords present but no hits', () => {
    const snippets = [makeSnippet('artifact', 'a.yaml', 'no matching words here')];
    const retrieval = makeRetrieval(snippets);

    const snapshot = buildContextSnapshot({
      query: 'find the dragon',
      keywords: ['dragon'],
      retrievalResult: retrieval,
      shapedContext: makeShaped([]),
      profile: makeProfile(),
      intentForProfile: 'help',
    });

    expect(snapshot.retrieval.topSnippets[0].matchReason).toBe('metadata match');
  });
});

// --- formatContextSnapshot ---

describe('formatContextSnapshot', () => {
  it('formats a complete snapshot', () => {
    const snapshot = buildContextSnapshot({
      query: 'describe chapel',
      keywords: ['chapel'],
      retrievalResult: makeRetrieval([
        makeSnippet('artifact', 'chapel.yaml', 'A dark chapel'),
      ], 5),
      shapedContext: makeShaped([
        makeMemory('current_session', 'Session: demo', 'Session data'),
      ]),
      profile: makeProfile('Analyst'),
      intentForProfile: 'critique',
    });

    const formatted = formatContextSnapshot(snapshot);
    expect(formatted).toContain('Context Snapshot');
    expect(formatted).toContain('describe chapel');
    expect(formatted).toContain('chapel');
    expect(formatted).toContain('Retrieval');
    expect(formatted).toContain('Memory Shaping');
    expect(formatted).toContain('Active Profile');
    expect(formatted).toContain('Analyst');
    expect(formatted).toContain('Budget');
    expect(formatted).toContain('End Context Snapshot');
  });

  it('shows by-source breakdown', () => {
    const snapshot = buildContextSnapshot({
      query: 'test',
      keywords: [],
      retrievalResult: makeRetrieval([
        makeSnippet('artifact', 'a.yaml', 'content'),
        makeSnippet('session', 'b.json', 'content'),
      ]),
      shapedContext: makeShaped([]),
      profile: makeProfile(),
      intentForProfile: 'help',
    });

    const formatted = formatContextSnapshot(snapshot);
    expect(formatted).toContain('artifact: 1');
    expect(formatted).toContain('session: 1');
  });
});

// --- formatSources ---

describe('formatSources', () => {
  it('formats sources for a snapshot with results', () => {
    const snapshot = buildContextSnapshot({
      query: 'find the chapel',
      keywords: ['chapel'],
      retrievalResult: makeRetrieval([
        makeSnippet('artifact', 'chapel.yaml', 'Dark chapel content', 0.95),
      ]),
      shapedContext: makeShaped([]),
      profile: makeProfile(),
      intentForProfile: 'help',
    });

    const formatted = formatSources(snapshot);
    expect(formatted).toContain('find the chapel');
    expect(formatted).toContain('artifact');
    expect(formatted).toContain('chapel.yaml');
    expect(formatted).toContain('0.95');
  });

  it('returns message when no sources', () => {
    const snapshot = buildContextSnapshot({
      query: 'test',
      keywords: [],
      retrievalResult: makeRetrieval([]),
      shapedContext: makeShaped([]),
      profile: makeProfile(),
      intentForProfile: 'help',
    });

    const formatted = formatSources(snapshot);
    expect(formatted).toContain('No sources were retrieved');
  });

  it('shows excess count when more snippets than top 5', () => {
    const snippets = Array.from({ length: 8 }, (_, i) =>
      makeSnippet('artifact', `file${i}.yaml`, `content ${i}`, 0.5 + i * 0.05)
    );
    const snapshot = buildContextSnapshot({
      query: 'test',
      keywords: [],
      retrievalResult: makeRetrieval(snippets),
      shapedContext: makeShaped([]),
      profile: makeProfile(),
      intentForProfile: 'help',
    });

    const formatted = formatSources(snapshot);
    expect(formatted).toContain('... and 3 more.');
  });
});

// --- Profile summary ---

describe('buildContextSnapshot — profile', () => {
  it('includes profile name and reason', () => {
    const snapshot = buildContextSnapshot({
      query: 'test',
      keywords: [],
      retrievalResult: makeRetrieval([]),
      shapedContext: makeShaped([]),
      profile: makeProfile('Generator'),
      intentForProfile: 'scaffold',
    });

    expect(snapshot.activeProfile.name).toBe('Generator');
    expect(snapshot.activeProfile.reason).toContain('scaffold');
  });
});

// --- Loadout integration ---

describe('buildContextSnapshot — loadout', () => {
  it('snapshot has no loadout field when not provided', () => {
    const snapshot = buildContextSnapshot({
      query: 'test',
      keywords: [],
      retrievalResult: makeRetrieval([]),
      shapedContext: makeShaped([]),
      profile: makeProfile(),
      intentForProfile: 'help',
    });

    expect(snapshot.loadout).toBeUndefined();
  });

  it('snapshot includes loadout summary when plan provided', () => {
    const snapshot = buildContextSnapshot({
      query: 'test loadout',
      keywords: ['loadout'],
      retrievalResult: makeRetrieval([]),
      shapedContext: makeShaped([]),
      profile: makeProfile(),
      intentForProfile: 'scaffold',
      loadoutPlan: {
        active: true,
        preload: [
          { id: 'schema-rules', reason: 'matched schema', matchedTerms: ['schema'], score: 0.9, mode: 'eager', tokensEst: 800, layer: 'project' },
        ],
        onDemand: [
          { id: 'doc-guide', reason: 'matched guide', matchedTerms: ['guide'], score: 0.6, mode: 'lazy', tokensEst: 300, layer: 'org' },
        ],
        manualCount: 1,
        allowedSources: ['session', 'artifact'],
        preloadTokens: 800,
        onDemandTokens: 300,
        layers: ['project', 'org'],
        taskString: 'intent: scaffold | task: test loadout',
        profileInfluence: '',
      },
    });

    expect(snapshot.loadout).toBeDefined();
    expect(snapshot.loadout!.active).toBe(true);
    expect(snapshot.loadout!.preloadCount).toBe(1);
    expect(snapshot.loadout!.onDemandCount).toBe(1);
    expect(snapshot.loadout!.manualCount).toBe(1);
    expect(snapshot.loadout!.allowedSources).toEqual(['session', 'artifact']);
    expect(snapshot.loadout!.preloadTokens).toBe(800);
    expect(snapshot.loadout!.topEntries).toHaveLength(2);
  });

  it('formats loadout section in context snapshot output', () => {
    const snapshot = buildContextSnapshot({
      query: 'test',
      keywords: [],
      retrievalResult: makeRetrieval([]),
      shapedContext: makeShaped([]),
      profile: makeProfile(),
      intentForProfile: 'help',
      loadoutPlan: {
        active: true,
        preload: [
          { id: 'schema-rules', reason: 'matched', matchedTerms: ['test'], score: 0.9, mode: 'eager', tokensEst: 500, layer: 'project' },
        ],
        onDemand: [],
        manualCount: 0,
        allowedSources: ['session', 'artifact'],
        preloadTokens: 500,
        onDemandTokens: 0,
        layers: ['project'],
        taskString: 'intent: help | task: test',
        profileInfluence: '',
      },
    });

    const formatted = formatContextSnapshot(snapshot);
    expect(formatted).toContain('Loadout Routing');
    expect(formatted).toContain('session, artifact');
    expect(formatted).toContain('schema-rules');
    expect(formatted).toContain('project');
  });

  it('shows inactive loadout message when plan is not active', () => {
    const snapshot = buildContextSnapshot({
      query: 'test',
      keywords: [],
      retrievalResult: makeRetrieval([]),
      shapedContext: makeShaped([]),
      profile: makeProfile(),
      intentForProfile: 'help',
      loadoutPlan: {
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
      },
    });

    const formatted = formatContextSnapshot(snapshot);
    expect(formatted).toContain('Not active');
  });

  it('formatSources shows loadout gating info', () => {
    const snapshot = buildContextSnapshot({
      query: 'test',
      keywords: [],
      retrievalResult: makeRetrieval([
        makeSnippet('artifact', 'a.yaml', 'content'),
      ]),
      shapedContext: makeShaped([]),
      profile: makeProfile(),
      intentForProfile: 'help',
      loadoutPlan: {
        active: true,
        preload: [
          { id: 'test', reason: 'test', matchedTerms: [], score: 0.8, mode: 'eager', tokensEst: 100, layer: 'project' },
        ],
        onDemand: [],
        manualCount: 0,
        allowedSources: ['session', 'artifact'],
        preloadTokens: 100,
        onDemandTokens: 0,
        layers: ['project'],
        taskString: 'test',
        profileInfluence: '',
      },
    });

    const formatted = formatSources(snapshot);
    expect(formatted).toContain('Loadout:');
    expect(formatted).toContain('session, artifact');
  });
});

// --- v1.4.0: Retrieval transparency (C1) ---

describe('buildContextSnapshot — retrieval transparency', () => {
  it('passes through excludedSources from retrieval result', () => {
    const retrieval: RetrievalResult = {
      snippets: [makeSnippet('artifact', 'a.yaml', 'content')],
      sourcesScanned: 5,
      excludedSources: ['transcript', 'doc'],
      droppedByBudget: 2,
      truncatedCount: 1,
      totalCandidates: 6,
    };
    const snapshot = buildContextSnapshot({
      query: 'test',
      keywords: [],
      retrievalResult: retrieval,
      shapedContext: makeShaped([]),
      profile: makeProfile(),
      intentForProfile: 'help',
    });

    expect(snapshot.retrieval.excludedSources).toEqual(['transcript', 'doc']);
    expect(snapshot.retrieval.droppedByBudget).toBe(2);
    expect(snapshot.retrieval.truncatedCount).toBe(1);
    expect(snapshot.retrieval.totalCandidates).toBe(6);
  });

  it('formats excluded sources in snapshot output', () => {
    const retrieval: RetrievalResult = {
      snippets: [],
      sourcesScanned: 3,
      excludedSources: ['transcript'],
      droppedByBudget: 1,
      truncatedCount: 0,
      totalCandidates: 2,
    };
    const snapshot = buildContextSnapshot({
      query: 'test',
      keywords: [],
      retrievalResult: retrieval,
      shapedContext: makeShaped([]),
      profile: makeProfile(),
      intentForProfile: 'help',
    });

    const formatted = formatContextSnapshot(snapshot);
    expect(formatted).toContain('Excluded sources: transcript');
    expect(formatted).toContain('Dropped by budget: 1');
    expect(formatted).toContain('Candidates found: 2');
  });
});

// --- v1.4.0: Per-class budget share (C2) ---

describe('buildContextSnapshot — per-class budget share', () => {
  it('calculates budgetSharePercent relative to shaping budget', () => {
    const memories = [
      makeMemory('current_session', 'session', 'a'.repeat(2000)),
      makeMemory('open_issues', 'issues', 'b'.repeat(1000)),
    ];
    const shaped = makeShaped(memories);

    const snapshot = buildContextSnapshot({
      query: 'test',
      keywords: [],
      retrievalResult: makeRetrieval([]),
      shapedContext: shaped,
      profile: makeProfile(),
      intentForProfile: 'help',
      shapingBudget: 4000,
    });

    const sessionClass = snapshot.shaping.byClass.find(c => c.class === 'current_session')!;
    expect(sessionClass.budgetSharePercent).toBe(50); // 2000/4000 = 50%
    const issuesClass = snapshot.shaping.byClass.find(c => c.class === 'open_issues')!;
    expect(issuesClass.budgetSharePercent).toBe(25); // 1000/4000 = 25%
  });

  it('shows budget share in formatted output', () => {
    const memories = [
      makeMemory('current_session', 'session', 'a'.repeat(1000)),
    ];
    const shaped = makeShaped(memories);

    const snapshot = buildContextSnapshot({
      query: 'test',
      keywords: [],
      retrievalResult: makeRetrieval([]),
      shapedContext: shaped,
      profile: makeProfile(),
      intentForProfile: 'help',
      shapingBudget: 2000,
    });

    const formatted = formatContextSnapshot(snapshot);
    expect(formatted).toContain('Per-class budget');
    expect(formatted).toContain('% of budget');
  });
});

// --- v1.4.0: Pipeline summary (C3) ---

describe('formatContextSnapshot — pipeline summary', () => {
  it('shows pipeline utilization line', () => {
    const snapshot = buildContextSnapshot({
      query: 'test',
      keywords: [],
      retrievalResult: makeRetrieval([
        makeSnippet('artifact', 'a.yaml', 'content a'),
      ]),
      shapedContext: makeShaped([
        makeMemory('project_facts', 'facts', 'data'),
      ]),
      profile: makeProfile(),
      intentForProfile: 'help',
    });

    const formatted = formatContextSnapshot(snapshot);
    expect(formatted).toContain('Pipeline:');
    expect(formatted).toContain('candidates kept');
    expect(formatted).toContain('budget used');
  });

  it('pipeline shows loadout info when active', () => {
    const snapshot = buildContextSnapshot({
      query: 'test',
      keywords: [],
      retrievalResult: makeRetrieval([]),
      shapedContext: makeShaped([]),
      profile: makeProfile(),
      intentForProfile: 'help',
      loadoutPlan: {
        active: true,
        preload: [],
        onDemand: [],
        manualCount: 0,
        allowedSources: ['session', 'artifact'],
        preloadTokens: 0,
        onDemandTokens: 0,
        layers: ['project'],
        taskString: 'test',
        profileInfluence: '',
      },
    });

    const formatted = formatContextSnapshot(snapshot);
    expect(formatted).toContain('2 source types routed');
  });
});

// --- v1.4.0: Loadout history (D1) ---

describe('formatLoadoutHistory', () => {
  it('returns message when no entries', () => {
    const result = formatLoadoutHistory([]);
    expect(result).toContain('No loadout history');
  });

  it('formats entries in reverse chronological order', () => {
    const entries: LoadoutHistoryRow[] = [
      { timestamp: '2025-01-01T10:00:00Z', query: 'first', allowedSources: ['session'], profileName: 'Analyst', snippetsSelected: 3, droppedByBudget: 0 },
      { timestamp: '2025-01-01T11:00:00Z', query: 'second', allowedSources: ['session', 'artifact'], profileName: 'Generator', snippetsSelected: 5, droppedByBudget: 1 },
    ];
    const result = formatLoadoutHistory(entries);
    expect(result).toContain('Loadout History (2 entries)');
    // second should appear before first in output (reverse chron)
    const secondIdx = result.indexOf('second');
    const firstIdx = result.indexOf('first');
    expect(secondIdx).toBeLessThan(firstIdx);
  });

  it('shows dropped count when non-zero', () => {
    const entries: LoadoutHistoryRow[] = [
      { timestamp: '2025-01-01T10:00:00Z', query: 'test', allowedSources: ['session'], profileName: 'Analyst', snippetsSelected: 3, droppedByBudget: 2 },
    ];
    const result = formatLoadoutHistory(entries);
    expect(result).toContain('2 dropped');
  });
});

// --- v1.4.0: Repeated-context detection (D2) ---

describe('detectRepeatedContext', () => {
  it('returns empty when fewer than 3 entries', () => {
    const history: LoadoutHistoryRow[] = [
      { timestamp: '2025-01-01T10:00:00Z', query: 'test', allowedSources: ['session'], profileName: 'Analyst', snippetsSelected: 3, droppedByBudget: 0 },
    ];
    expect(detectRepeatedContext(history, 2)).toEqual([]);
  });

  it('returns empty when no open issues', () => {
    const history: LoadoutHistoryRow[] = Array.from({ length: 3 }, (_, i) => ({
      timestamp: `2025-01-01T1${i}:00:00Z`, query: `q${i}`, allowedSources: ['session'],
      profileName: 'Analyst', snippetsSelected: 3, droppedByBudget: 0,
    }));
    expect(detectRepeatedContext(history, 0)).toEqual([]);
  });

  it('warns when same sources repeated 3x with open issues', () => {
    const history: LoadoutHistoryRow[] = Array.from({ length: 3 }, (_, i) => ({
      timestamp: `2025-01-01T1${i}:00:00Z`, query: `q${i}`, allowedSources: ['session', 'artifact'],
      profileName: 'Analyst', snippetsSelected: 3, droppedByBudget: 0,
    }));
    const warnings = detectRepeatedContext(history, 2);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain('3×');
    expect(warnings[0]).toContain('2 open issue');
  });

  it('does not warn when sources differ', () => {
    const history: LoadoutHistoryRow[] = [
      { timestamp: 'a', query: 'q1', allowedSources: ['session'], profileName: 'Analyst', snippetsSelected: 1, droppedByBudget: 0 },
      { timestamp: 'b', query: 'q2', allowedSources: ['session', 'artifact'], profileName: 'Analyst', snippetsSelected: 2, droppedByBudget: 0 },
      { timestamp: 'c', query: 'q3', allowedSources: ['session'], profileName: 'Analyst', snippetsSelected: 1, droppedByBudget: 0 },
    ];
    expect(detectRepeatedContext(history, 5)).toEqual([]);
  });

  it('shows warnings in context snapshot', () => {
    const history: LoadoutHistoryRow[] = Array.from({ length: 3 }, (_, i) => ({
      timestamp: `2025-01-01T1${i}:00:00Z`, query: `q${i}`, allowedSources: ['session'],
      profileName: 'Analyst', snippetsSelected: 3, droppedByBudget: 0,
    }));

    const snapshot = buildContextSnapshot({
      query: 'test',
      keywords: [],
      retrievalResult: makeRetrieval([]),
      shapedContext: makeShaped([]),
      profile: makeProfile(),
      intentForProfile: 'help',
      loadoutHistory: history,
      openIssueCount: 3,
    });

    expect(snapshot.warnings.length).toBeGreaterThan(0);
    const formatted = formatContextSnapshot(snapshot);
    expect(formatted).toContain('Warnings');
  });
});
