// Tests — memory shaper: class assignment, shaping, budget enforcement, formatting

import { describe, it, expect } from 'vitest';
import { shapeMemory, formatShapedContext } from './chat-memory-shaper.js';
import type { MemoryClass, ShapedContext } from './chat-memory-shaper.js';
import type { DesignSession } from './session.js';
import type { RetrievedSnippet } from './chat-rag.js';

function makeSession(overrides: Partial<DesignSession> = {}): DesignSession {
  return {
    name: 'shaper-test',
    model: 'test',
    createdAt: '2025-01-01',
    themes: ['horror', 'gothic'],
    constraints: ['no magic', 'medieval only'],
    artifacts: { districts: ['old-quarter'], factions: ['thieves-guild'], quests: [], rooms: ['dark-chapel'], packs: [] },
    issues: [
      { severity: 'warning', code: 'PACING', target: 'dark-chapel', summary: 'Room pacing is slow', status: 'open' },
      { severity: 'error', code: 'MISSING_EXIT', target: 'dark-chapel', summary: 'No exit defined', status: 'open' },
      { severity: 'info', code: 'THEME', target: 'old-quarter', summary: 'Consider darker tone', status: 'resolved' },
    ],
    acceptedSuggestions: ['Add atmospheric descriptions', 'Increase encounter density'],
    history: [
      { kind: 'session_started', detail: 'Started shaper test', timestamp: '2025-01-01T00:00:00Z' },
      { kind: 'content_applied', detail: 'Applied dark-chapel', timestamp: '2025-01-01T01:00:00Z' },
      { kind: 'critique_ran', detail: 'Critique on dark-chapel', timestamp: '2025-01-01T02:00:00Z' },
    ],
    ...overrides,
  } as DesignSession;
}

// --- Session baseline memory ---

describe('shapeMemory — session baseline', () => {
  it('includes current_session from session themes/constraints/artifacts', () => {
    const result = shapeMemory({ session: makeSession(), ragSnippets: [] });
    const sessionMem = result.memories.find(m => m.class === 'current_session');
    expect(sessionMem).toBeDefined();
    expect(sessionMem!.content).toContain('horror');
    expect(sessionMem!.content).toContain('no magic');
    expect(sessionMem!.content).toContain('dark-chapel');
    expect(sessionMem!.label).toContain('shaper-test');
  });

  it('includes open_issues from session', () => {
    const result = shapeMemory({ session: makeSession(), ragSnippets: [] });
    const issuesMem = result.memories.find(m => m.class === 'open_issues');
    expect(issuesMem).toBeDefined();
    expect(issuesMem!.content).toContain('PACING');
    expect(issuesMem!.content).toContain('MISSING_EXIT');
    expect(issuesMem!.sourceCount).toBe(2);
    // Resolved issue should NOT be in open_issues
    expect(issuesMem!.content).not.toContain('THEME');
  });

  it('includes recent_changes from history', () => {
    const result = shapeMemory({ session: makeSession(), ragSnippets: [] });
    const activityMem = result.memories.find(m => m.class === 'recent_changes');
    expect(activityMem).toBeDefined();
    expect(activityMem!.content).toContain('session_started');
    expect(activityMem!.content).toContain('content_applied');
  });

  it('includes prior_decisions from resolved issues + accepted suggestions', () => {
    const result = shapeMemory({ session: makeSession(), ragSnippets: [] });
    const decisionsMem = result.memories.find(m => m.class === 'prior_decisions');
    expect(decisionsMem).toBeDefined();
    expect(decisionsMem!.content).toContain('THEME');
    expect(decisionsMem!.content).toContain('Add atmospheric descriptions');
    expect(decisionsMem!.content).toContain('Increase encounter density');
  });

  it('skips session baseline when includeSessionBaseline is false', () => {
    const result = shapeMemory({
      session: makeSession(),
      ragSnippets: [],
      includeSessionBaseline: false,
    });
    expect(result.memories.length).toBe(0);
  });

  it('returns empty memories for null session with no snippets', () => {
    const result = shapeMemory({ session: null, ragSnippets: [] });
    expect(result.memories.length).toBe(0);
    expect(result.totalChars).toBe(0);
    expect(result.classes.length).toBe(0);
  });
});

// --- RAG snippet grouping ---

describe('shapeMemory — RAG snippets', () => {
  it('groups RAG snippets by memory class', () => {
    const snippets: RetrievedSnippet[] = [
      { source: 'artifact', origin: 'rooms/chapel.yaml', content: 'id: dark-chapel', score: 2 },
      { source: 'doc', origin: 'handbook.md', content: 'Design handbook content', score: 1 },
      { source: 'transcript', origin: 'chat-2025.jsonl', content: 'Prior conversation', score: 0.5 },
    ];
    const result = shapeMemory({ session: null, ragSnippets: snippets });

    // artifact + doc → project_facts (grouped)
    const factsMem = result.memories.find(m => m.class === 'project_facts');
    expect(factsMem).toBeDefined();
    expect(factsMem!.content).toContain('dark-chapel');
    expect(factsMem!.content).toContain('handbook');

    // transcript → recent_changes
    const changesMem = result.memories.find(m => m.class === 'recent_changes');
    expect(changesMem).toBeDefined();
    expect(changesMem!.content).toContain('Prior conversation');
  });

  it('skips RAG class if session baseline already covers it', () => {
    const session = makeSession();
    const snippets: RetrievedSnippet[] = [
      { source: 'critique', origin: 'test', content: 'Some critique', score: 1 },
    ];
    const result = shapeMemory({ session, ragSnippets: snippets });
    // Session already provides open_issues — RAG critique should not duplicate it
    const issueMemories = result.memories.filter(m => m.class === 'open_issues');
    expect(issueMemories.length).toBe(1);
  });
});

// --- Budget enforcement ---

describe('shapeMemory — budget', () => {
  it('enforces maxChars budget', () => {
    const session = makeSession({
      themes: Array(100).fill('this-is-a-long-theme-name-to-inflate-content'),
    });
    const result = shapeMemory({ session, ragSnippets: [], maxChars: 200 });
    expect(result.totalChars).toBeLessThanOrEqual(200);
  });

  it('truncates last memory if partially fits', () => {
    const snippets: RetrievedSnippet[] = [
      { source: 'artifact', origin: 'a.yaml', content: 'x'.repeat(300), score: 2 },
      { source: 'doc', origin: 'b.md', content: 'y'.repeat(300), score: 1 },
    ];
    const result = shapeMemory({ session: null, ragSnippets: snippets, maxChars: 400 });
    expect(result.totalChars).toBeLessThanOrEqual(400);
    expect(result.memories.length).toBeGreaterThan(0);
  });

  it('provides classes list matching actual memories', () => {
    const result = shapeMemory({ session: makeSession(), ragSnippets: [] });
    for (const mem of result.memories) {
      expect(result.classes).toContain(mem.class);
    }
  });
});

// --- formatShapedContext ---

describe('formatShapedContext', () => {
  it('returns empty string for empty memories', () => {
    const shaped: ShapedContext = { memories: [], totalChars: 0, classes: [] };
    expect(formatShapedContext(shaped)).toBe('');
  });

  it('formats with section headers and markers', () => {
    const shaped: ShapedContext = {
      memories: [
        { class: 'current_session', label: 'Session "test"', content: 'Themes: horror', sourceCount: 1 },
        { class: 'open_issues', label: '1 open issue', content: '[warning] PACING', sourceCount: 1 },
      ],
      totalChars: 100,
      classes: ['current_session', 'open_issues'],
    };
    const formatted = formatShapedContext(shaped);
    expect(formatted).toContain('--- Project Memory ---');
    expect(formatted).toContain('## Session "test"');
    expect(formatted).toContain('Themes: horror');
    expect(formatted).toContain('## 1 open issue');
    expect(formatted).toContain('[warning] PACING');
    expect(formatted).toContain('--- End Project Memory ---');
  });
});
