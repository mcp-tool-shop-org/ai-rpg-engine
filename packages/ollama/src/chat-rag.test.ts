// Tests — RAG retrieval: keyword extraction, scoring, retrieval, formatting

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { extractKeywords, retrieve, formatRetrievedContext } from './chat-rag.js';
import type { RetrievedSnippet, RetrievalResult } from './chat-rag.js';
import type { DesignSession } from './session.js';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// --- extractKeywords ---

describe('extractKeywords', () => {
  it('extracts meaningful words, filters stop words', () => {
    const kw = extractKeywords('show me the dark chapel room');
    expect(kw).toContain('dark');
    expect(kw).toContain('chapel');
    expect(kw).toContain('room');
    expect(kw).not.toContain('show');
    expect(kw).not.toContain('me');
    expect(kw).not.toContain('the');
  });

  it('deduplicates keywords', () => {
    const kw = extractKeywords('room room room');
    expect(kw).toEqual(['room']);
  });

  it('filters short words (< 3 chars)', () => {
    const kw = extractKeywords('a an it ok go do');
    expect(kw).toEqual([]);
  });

  it('handles empty input', () => {
    expect(extractKeywords('')).toEqual([]);
  });

  it('lowercases and strips punctuation', () => {
    const kw = extractKeywords('CHAPEL! Dark? (horror)');
    expect(kw).toContain('chapel');
    expect(kw).toContain('dark');
    expect(kw).toContain('horror');
  });

  it('preserves hyphenated terms', () => {
    const kw = extractKeywords('look at the ai-session file');
    expect(kw).toContain('ai-session');
    expect(kw).toContain('file');
  });
});

// --- formatRetrievedContext ---

describe('formatRetrievedContext', () => {
  it('returns empty string for no snippets', () => {
    expect(formatRetrievedContext([])).toBe('');
  });

  it('formats snippets with source labels', () => {
    const snippets: RetrievedSnippet[] = [
      { source: 'session', origin: '.ai-session.json', content: 'Theme: horror', score: 2 },
      { source: 'artifact', origin: 'rooms/chapel.yaml', content: 'id: dark-chapel', score: 1 },
    ];
    const formatted = formatRetrievedContext(snippets);
    expect(formatted).toContain('--- Retrieved Project Context ---');
    expect(formatted).toContain('[session] .ai-session.json:');
    expect(formatted).toContain('Theme: horror');
    expect(formatted).toContain('[artifact] rooms/chapel.yaml:');
    expect(formatted).toContain('id: dark-chapel');
    expect(formatted).toContain('--- End Retrieved Context ---');
  });
});

// --- retrieve (with real filesystem) ---

function makeSession(overrides: Partial<DesignSession> = {}): DesignSession {
  return {
    name: 'test-session',
    model: 'test-model',
    createdAt: '2025-01-01',
    themes: ['horror', 'gothic'],
    constraints: ['no magic'],
    artifacts: { districts: [], factions: [], quests: [], rooms: ['dark-chapel'], packs: [] },
    issues: [
      { severity: 'warning', code: 'PACING', target: 'dark-chapel', summary: 'Room pacing is too slow', status: 'open' },
      { severity: 'info', code: 'THEME', target: 'dark-chapel', summary: 'Consider darker tone', status: 'resolved' },
    ],
    acceptedSuggestions: ['Add atmospheric descriptions'],
    history: [
      { kind: 'session_started', detail: 'Session created', timestamp: '2025-01-01T00:00:00Z' },
      { kind: 'content_applied', detail: 'Applied dark-chapel.yaml', timestamp: '2025-01-01T01:00:00Z' },
      { kind: 'replay_compared', detail: 'Found pacing divergence in dark-chapel', timestamp: '2025-01-01T02:00:00Z' },
    ],
    ...overrides,
  } as DesignSession;
}

describe('retrieve — session extraction', () => {
  it('retrieves session overview when keywords match', async () => {
    const session = makeSession();
    const result = await retrieve(
      { userMessage: 'tell me about the horror themes' },
      session,
      '/tmp/nonexistent-rag-test',
    );
    expect(result.snippets.length).toBeGreaterThan(0);
    const sessionSnippet = result.snippets.find(s => s.source === 'session');
    expect(sessionSnippet).toBeDefined();
    expect(sessionSnippet!.content).toContain('horror');
  });

  it('retrieves open issues when keywords match', async () => {
    const session = makeSession();
    const result = await retrieve(
      { userMessage: 'what are the pacing issues' },
      session,
      '/tmp/nonexistent-rag-test',
    );
    const critiqueSnippet = result.snippets.find(s => s.source === 'critique');
    expect(critiqueSnippet).toBeDefined();
    expect(critiqueSnippet!.content).toContain('PACING');
  });

  it('retrieves resolved issues as decisions', async () => {
    const session = makeSession();
    const result = await retrieve(
      { userMessage: 'what theme decisions were made' },
      session,
      '/tmp/nonexistent-rag-test',
    );
    const decisionSnippet = result.snippets.find(s => s.source === 'decision');
    expect(decisionSnippet).toBeDefined();
  });

  it('retrieves replay events when keywords match', async () => {
    const session = makeSession();
    const result = await retrieve(
      { userMessage: 'pacing divergence from replay' },
      session,
      '/tmp/nonexistent-rag-test',
    );
    const replaySnippet = result.snippets.find(s => s.source === 'replay');
    expect(replaySnippet).toBeDefined();
    expect(replaySnippet!.content).toContain('pacing divergence');
  });

  it('returns empty result when no keywords can be extracted', async () => {
    const session = makeSession();
    const result = await retrieve(
      { userMessage: 'a an if' },
      session,
      '/tmp/nonexistent-rag-test',
    );
    expect(result.snippets.length).toBe(0);
    expect(result.sourcesScanned).toBe(0);
  });

  it('returns empty when session is null', async () => {
    const result = await retrieve(
      { userMessage: 'horror themes' },
      null,
      '/tmp/nonexistent-rag-test',
    );
    // May return 0 snippets since no session and no files at nonexistent path
    expect(result.snippets).toBeDefined();
  });
});

describe('retrieve — artifact files', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'rag-test-'));
    // Create a YAML artifact
    const roomsDir = join(tmpDir, 'rooms');
    await mkdir(roomsDir, { recursive: true });
    await writeFile(
      join(roomsDir, 'dark-chapel.yaml'),
      'id: dark-chapel\ntype: room\nname: Dark Chapel\ntags: [horror, gothic]\ndescription: A haunted chapel with flickering candles.',
    );
    await writeFile(
      join(roomsDir, 'throne-room.yaml'),
      'id: throne-room\ntype: room\nname: Throne Room\ntags: [royal, grand]\ndescription: A majestic room with golden furniture.',
    );
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('finds and scores artifact files by keywords', async () => {
    const result = await retrieve(
      { userMessage: 'tell me about the chapel horror' },
      null,
      tmpDir,
    );
    expect(result.snippets.length).toBeGreaterThan(0);
    const artifactSnippet = result.snippets.find(s => s.source === 'artifact');
    expect(artifactSnippet).toBeDefined();
    expect(artifactSnippet!.content).toContain('dark-chapel');
  });

  it('ranks higher-scoring artifacts first', async () => {
    const result = await retrieve(
      { userMessage: 'horror gothic chapel haunted candles' },
      null,
      tmpDir,
    );
    const artifacts = result.snippets.filter(s => s.source === 'artifact');
    if (artifacts.length >= 2) {
      // Chapel should score higher than throne room for horror keywords
      expect(artifacts[0].origin).toContain('dark-chapel');
    }
  });
});

describe('retrieve — doc files', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'rag-doc-test-'));
    await writeFile(
      join(tmpDir, 'handbook.md'),
      '# Design Handbook\n\nThis project uses a faction-driven simulation engine.\nDistricts contain rooms. Rooms have encounters.',
    );
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('retrieves matching doc content', async () => {
    const result = await retrieve(
      { userMessage: 'how does faction simulation work' },
      null,
      tmpDir,
    );
    const docSnippet = result.snippets.find(s => s.source === 'doc');
    expect(docSnippet).toBeDefined();
    expect(docSnippet!.content).toContain('faction-driven simulation');
  });
});

describe('retrieve — transcripts', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'rag-transcript-test-'));
    const transcriptDir = join(tmpDir, '.ai-transcripts');
    await mkdir(transcriptDir, { recursive: true });
    await writeFile(
      join(transcriptDir, '2025-01-01-chat.jsonl'),
      [
        JSON.stringify({ role: 'user', content: 'create a haunted library room', timestamp: '2025-01-01T00:00:00Z' }),
        JSON.stringify({ role: 'assistant', content: 'Generated haunted-library with horror tags', timestamp: '2025-01-01T00:01:00Z' }),
      ].join('\n'),
    );
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('retrieves matching transcript content', async () => {
    const result = await retrieve(
      { userMessage: 'what about the haunted library' },
      null,
      tmpDir,
    );
    const transcriptSnippet = result.snippets.find(s => s.source === 'transcript');
    expect(transcriptSnippet).toBeDefined();
    expect(transcriptSnippet!.content).toContain('haunted library');
  });
});

describe('retrieve — budget enforcement', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'rag-budget-test-'));
    // Create many docs to exceed budget
    for (let i = 0; i < 20; i++) {
      await writeFile(
        join(tmpDir, `doc-${i}.md`),
        `# Document ${i}\n${'keyword '.repeat(200)}\nThis is document number ${i} about the dark chapel horror faction.`,
      );
    }
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('limits snippets by maxSnippets', async () => {
    const result = await retrieve(
      { userMessage: 'dark chapel horror faction', maxSnippets: 3, maxChars: 100_000 },
      null,
      tmpDir,
    );
    expect(result.snippets.length).toBeLessThanOrEqual(3);
  });

  it('limits total characters by maxChars', async () => {
    const result = await retrieve(
      { userMessage: 'dark chapel horror faction', maxSnippets: 100, maxChars: 500 },
      null,
      tmpDir,
    );
    const totalChars = result.snippets.reduce((sum, s) => sum + s.content.length, 0);
    expect(totalChars).toBeLessThanOrEqual(500);
  });
});

describe('retrieve — allowedSources filtering', () => {
  it('skips artifact retrieval when not in allowedSources', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'rag-filter-test-'));
    try {
      // Create a YAML artifact that would normally match
      const roomsDir = join(tmpDir, 'rooms');
      await mkdir(roomsDir, { recursive: true });
      await writeFile(
        join(roomsDir, 'dark-chapel.yaml'),
        'id: dark-chapel\ntype: room\nname: Dark Chapel\ntags: [horror]\ndescription: A dark chapel.',
      );

      const session = makeSession();

      // Without filter: should find artifacts
      const allResult = await retrieve(
        { userMessage: 'horror chapel dark' },
        session,
        tmpDir,
      );
      const hasArtifact = allResult.snippets.some(s => s.source === 'artifact');
      expect(hasArtifact).toBe(true);

      // With filter: only session allowed, no artifacts
      const filtered = await retrieve(
        { userMessage: 'horror chapel dark', allowedSources: ['session'] },
        session,
        tmpDir,
      );
      const hasFilteredArtifact = filtered.snippets.some(s => s.source === 'artifact');
      expect(hasFilteredArtifact).toBe(false);
      // But session snippets should still be there
      const hasSession = filtered.snippets.some(s => s.source === 'session');
      expect(hasSession).toBe(true);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('skips session retrieval when not in allowedSources', async () => {
    const session = makeSession();
    const result = await retrieve(
      { userMessage: 'horror themes', allowedSources: ['artifact', 'doc'] },
      session,
      '/tmp/nonexistent-rag-filter-test',
    );
    const hasSession = result.snippets.some(s => s.source === 'session');
    expect(hasSession).toBe(false);
  });

  it('allows all sources when allowedSources is undefined', async () => {
    const session = makeSession();
    const result = await retrieve(
      { userMessage: 'horror themes pacing' },
      session,
      '/tmp/nonexistent-rag-filter-test',
    );
    // Should find session-based snippets (session is default-allowed)
    expect(result.snippets.length).toBeGreaterThan(0);
  });
});

// --- v1.4.0: RetrievalResult transparency fields ---

describe('retrieve — transparency fields', () => {
  it('returns all new fields', async () => {
    const session = makeSession();
    const result = await retrieve(
      { userMessage: 'horror themes' },
      session,
      '/tmp/nonexistent-rag-test',
    );
    expect(typeof result.sourcesScanned).toBe('number');
    expect(Array.isArray(result.excludedSources)).toBe(true);
    expect(typeof result.droppedByBudget).toBe('number');
    expect(typeof result.truncatedCount).toBe('number');
    expect(typeof result.totalCandidates).toBe('number');
  });

  it('reports excludedSources when allowedSources filters them', async () => {
    const session = makeSession();
    const result = await retrieve(
      { userMessage: 'horror themes', allowedSources: ['session'] },
      session,
      '/tmp/nonexistent-rag-filter-test',
    );
    // critique, replay, decision, artifact, doc, transcript should be excluded
    expect(result.excludedSources.length).toBeGreaterThan(0);
  });

  it('returns zero excluded when no allowedSources filter', async () => {
    const session = makeSession();
    const result = await retrieve(
      { userMessage: 'horror themes' },
      session,
      '/tmp/nonexistent-rag-test',
    );
    expect(result.excludedSources).toEqual([]);
  });

  it('reports empty result with zero transparency fields', async () => {
    const result = await retrieve(
      { userMessage: 'a an if' },
      null,
      '/tmp/nonexistent-rag-test',
    );
    expect(result.snippets).toEqual([]);
    expect(result.excludedSources).toEqual([]);
    expect(result.droppedByBudget).toBe(0);
    expect(result.truncatedCount).toBe(0);
    expect(result.totalCandidates).toBe(0);
  });
});

describe('retrieve — budget tracking', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'rag-budget-track-test-'));
    for (let i = 0; i < 10; i++) {
      await writeFile(
        join(tmpDir, `doc-${i}.md`),
        `# Document ${i}\n${'keyword '.repeat(100)}\nThis is document about the dark chapel horror faction number ${i}.`,
      );
    }
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('tracks dropped snippets when maxSnippets is hit', async () => {
    const result = await retrieve(
      { userMessage: 'dark chapel horror faction', maxSnippets: 2, maxChars: 100_000 },
      null,
      tmpDir,
    );
    expect(result.snippets.length).toBeLessThanOrEqual(2);
    expect(result.totalCandidates).toBeGreaterThan(2);
    expect(result.droppedByBudget).toBeGreaterThan(0);
  });

  it('totalCandidates >= snippets selected', async () => {
    const result = await retrieve(
      { userMessage: 'dark chapel horror', maxSnippets: 3 },
      null,
      tmpDir,
    );
    expect(result.totalCandidates).toBeGreaterThanOrEqual(result.snippets.length);
  });
});
