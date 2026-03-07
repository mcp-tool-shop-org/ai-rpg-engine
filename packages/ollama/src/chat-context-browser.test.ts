// Tests — context browser: snapshot building, formatting, sources

import { describe, it, expect } from 'vitest';
import {
  buildContextSnapshot, formatContextSnapshot, formatSources,
} from './chat-context-browser.js';
import type { ContextSnapshot } from './chat-context-browser.js';
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
  return { snippets, sourcesScanned };
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
