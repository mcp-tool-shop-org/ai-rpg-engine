import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  createSession,
  loadSession,
  saveSession,
  deleteSession,
  addThemes,
  addConstraints,
  addArtifact,
  addCritiqueIssues,
  acceptSuggestion,
  resolveIssue,
  renderSessionContext,
  formatSessionStatus,
} from './session.js';
import type { DesignSession } from './session.js';
import type { CritiqueIssue } from './parsers.js';

describe('session', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'session-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('createSession', () => {
    it('creates a fresh session with defaults', () => {
      const s = createSession('dark-chapel');
      expect(s.name).toBe('dark-chapel');
      expect(s.themes).toEqual([]);
      expect(s.constraints).toEqual([]);
      expect(s.artifacts.districts).toEqual([]);
      expect(s.artifacts.factions).toEqual([]);
      expect(s.artifacts.quests).toEqual([]);
      expect(s.artifacts.rooms).toEqual([]);
      expect(s.artifacts.packs).toEqual([]);
      expect(s.issues).toEqual([]);
      expect(s.acceptedSuggestions).toEqual([]);
      expect(s.createdAt).toBeTruthy();
      expect(s.updatedAt).toBeTruthy();
    });
  });

  describe('file protocol', () => {
    it('returns null when no session file exists', async () => {
      const result = await loadSession(tempDir);
      expect(result).toBeNull();
    });

    it('round-trips save and load', async () => {
      const s = createSession('test-world');
      addThemes(s, ['gothic', 'mystery']);
      await saveSession(tempDir, s);

      const loaded = await loadSession(tempDir);
      expect(loaded).not.toBeNull();
      expect(loaded!.name).toBe('test-world');
      expect(loaded!.themes).toEqual(['gothic', 'mystery']);
    });

    it('writes valid JSON to .ai-session.json', async () => {
      const s = createSession('json-check');
      await saveSession(tempDir, s);

      const raw = await readFile(join(tempDir, '.ai-session.json'), 'utf-8');
      const parsed = JSON.parse(raw);
      expect(parsed.name).toBe('json-check');
    });

    it('deleteSession removes the file', async () => {
      const s = createSession('ephemeral');
      await saveSession(tempDir, s);

      const deleted = await deleteSession(tempDir);
      expect(deleted).toBe(true);

      const after = await loadSession(tempDir);
      expect(after).toBeNull();
    });

    it('deleteSession returns false when no file exists', async () => {
      const deleted = await deleteSession(tempDir);
      expect(deleted).toBe(false);
    });
  });

  describe('mutators', () => {
    let session: DesignSession;

    beforeEach(() => {
      session = createSession('mutator-test');
    });

    it('addThemes deduplicates', () => {
      addThemes(session, ['gothic', 'mystery']);
      addThemes(session, ['mystery', 'horror']);
      expect(session.themes).toEqual(['gothic', 'mystery', 'horror']);
    });

    it('addConstraints deduplicates', () => {
      addConstraints(session, ['no-magic', 'low-tech']);
      addConstraints(session, ['low-tech', 'permadeath']);
      expect(session.constraints).toEqual(['no-magic', 'low-tech', 'permadeath']);
    });

    it('addArtifact registers by kind and deduplicates', () => {
      addArtifact(session, 'rooms', 'crypt_01');
      addArtifact(session, 'rooms', 'crypt_02');
      addArtifact(session, 'rooms', 'crypt_01');
      expect(session.artifacts.rooms).toEqual(['crypt_01', 'crypt_02']);
    });

    it('addArtifact works for all kinds', () => {
      addArtifact(session, 'districts', 'd1');
      addArtifact(session, 'factions', 'f1');
      addArtifact(session, 'quests', 'q1');
      addArtifact(session, 'packs', 'p1');
      expect(session.artifacts.districts).toEqual(['d1']);
      expect(session.artifacts.factions).toEqual(['f1']);
      expect(session.artifacts.quests).toEqual(['q1']);
      expect(session.artifacts.packs).toEqual(['p1']);
    });

    it('addCritiqueIssues converts and deduplicates', () => {
      const issues: CritiqueIssue[] = [
        { code: 'SCHEMA_001', severity: 'high', location: 'room.exits', summary: 'Missing exit target', simulation_impact: 'Room unreachable' },
        { code: 'BALANCE_002', severity: 'medium', location: 'room.entities', summary: 'Too many hostiles', simulation_impact: 'Encounter unwinnable' },
      ];
      addCritiqueIssues(session, issues);
      expect(session.issues).toHaveLength(2);
      expect(session.issues[0].status).toBe('open');
      expect(session.issues[0].target).toBe('room.exits');

      // duplicates ignored
      addCritiqueIssues(session, [issues[0]]);
      expect(session.issues).toHaveLength(2);
    });

    it('acceptSuggestion deduplicates', () => {
      acceptSuggestion(session, 'ADD_TRAP');
      acceptSuggestion(session, 'ADD_TRAP');
      acceptSuggestion(session, 'ADD_NPC');
      expect(session.acceptedSuggestions).toEqual(['ADD_TRAP', 'ADD_NPC']);
    });

    it('resolveIssue marks an issue resolved', () => {
      const issues: CritiqueIssue[] = [
        { code: 'FIX_01', severity: 'low', location: 'room', summary: 'Minor', simulation_impact: 'None' },
      ];
      addCritiqueIssues(session, issues);
      const result = resolveIssue(session, 'FIX_01');
      expect(result).toBe(true);
      expect(session.issues[0].status).toBe('resolved');
    });

    it('resolveIssue returns false for unknown code', () => {
      expect(resolveIssue(session, 'NOPE')).toBe(false);
    });
  });

  describe('renderSessionContext', () => {
    it('renders minimal session', () => {
      const s = createSession('barebones');
      const ctx = renderSessionContext(s);
      expect(ctx).toContain('Session: barebones');
      expect(ctx).not.toContain('Themes:');
    });

    it('renders full session with artifacts and issues', () => {
      const s = createSession('full-world');
      addThemes(s, ['gothic', 'mystery']);
      addConstraints(s, ['no-magic']);
      addArtifact(s, 'districts', 'old_quarter');
      addArtifact(s, 'factions', 'thieves_guild');
      addCritiqueIssues(s, [
        { code: 'ISSUE_01', severity: 'high', location: 'exits', summary: 'Bad exit', simulation_impact: 'Room broken' },
      ]);

      const ctx = renderSessionContext(s);
      expect(ctx).toContain('Themes: gothic, mystery');
      expect(ctx).toContain('Constraints: no-magic');
      expect(ctx).toContain('Known districts: old_quarter');
      expect(ctx).toContain('Known factions: thieves_guild');
      expect(ctx).toContain('Open issues (1)');
      expect(ctx).toContain('[high] ISSUE_01');
    });
  });

  describe('formatSessionStatus', () => {
    it('formats a session for CLI display', () => {
      const s = createSession('status-test');
      addThemes(s, ['horror']);
      addArtifact(s, 'rooms', 'cellar');

      const status = formatSessionStatus(s);
      expect(status).toContain('Session: status-test');
      expect(status).toContain('Themes: horror');
      expect(status).toContain('cellar');
      expect(status).toContain('Districts: (none)');
      expect(status).toContain('Issues: 0 open, 0 resolved');
    });
  });
});
