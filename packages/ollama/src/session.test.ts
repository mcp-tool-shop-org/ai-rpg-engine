import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { tmpdir } from 'node:os';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  createSession,
  loadSession,
  tryLoadSession,
  SessionLoadError,
  saveSession,
  deleteSession,
  endSession,
  listSessions,
  switchSession,
  resumeNamedSession,
  exportSession,
  formatSessionList,
  sessionSlug,
  addThemes,
  addConstraints,
  addArtifact,
  addCritiqueIssues,
  acceptSuggestion,
  resolveIssue,
  renderSessionContext,
  formatSessionStatus,
  recordEvent,
  formatSessionHistory,
  artifactBucketForKind,
  MAX_SESSION_HISTORY_EVENTS,
  MAX_SESSION_JSON_BYTES,
} from './session.js';
import type { DesignSession, SessionEvent } from './session.js';
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
      expect(s.artifacts.entities).toEqual([]);
      expect(s.artifacts.dialogues).toEqual([]);
      expect(s.artifacts.abilities).toEqual([]);
      expect(s.artifacts.statuses).toEqual([]);
      expect(s.artifacts.items).toEqual([]);
      expect(s.artifacts.hazards).toEqual([]);
      expect(s.artifacts.archetypes).toEqual([]);
      expect(s.artifacts.backgrounds).toEqual([]);
      expect(s.artifacts.catalogs).toEqual([]);
      expect(s.artifacts.placements).toEqual([]);
      expect(s.artifacts.entityAi).toEqual([]);
      expect(s.issues).toEqual([]);
      expect(s.acceptedSuggestions).toEqual([]);
      expect(s.history).toHaveLength(1);
      expect(s.history[0].kind).toBe('session_start');
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

  // v2.5 audit PA-2 — loadSession swallowed ALL errors to null: a corrupt
  // session was silently ignored and the next save clobbered it, while a
  // valid-JSON-wrong-shape file escaped as a raw TypeError downstream. The
  // invariants: ENOENT → null (no session, fine); anything else → a structured
  // SessionLoadError naming the file; the corrupt file is never modified.
  describe('corrupt session handling (PA-2)', () => {
    const sessionFile = () => join(tempDir, '.ai-session.json');

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('throws SessionLoadError (not null) on truncated/invalid JSON', async () => {
      await writeFile(sessionFile(), '{ "name": "half-written', 'utf-8');
      await expect(loadSession(tempDir)).rejects.toThrow(SessionLoadError);
      await expect(loadSession(tempDir)).rejects.toMatchObject({
        code: 'SESSION_CORRUPT',
        path: sessionFile(),
      });
    });

    it('the error names the file and carries a recovery hint', async () => {
      await writeFile(sessionFile(), 'not json at all', 'utf-8');
      const err = await loadSession(tempDir).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(SessionLoadError);
      const loadError = err as SessionLoadError;
      expect(loadError.message).toContain(sessionFile());
      expect(loadError.hint).toMatch(/session end|restore|fix/i);
    });

    it('throws SessionLoadError on valid-JSON-wrong-shape files', async () => {
      for (const bad of ['{}', '[]', '"just a string"', JSON.stringify({ name: 'x' })]) {
        await writeFile(sessionFile(), bad, 'utf-8');
        await expect(loadSession(tempDir)).rejects.toThrow(SessionLoadError);
      }
    });

    it('names the first missing artifacts array in the shape error', async () => {
      const almost = {
        name: 'x', createdAt: 't', updatedAt: 't',
        themes: [], constraints: [], issues: [], acceptedSuggestions: [],
        artifacts: {}, history: [],
      };
      await writeFile(sessionFile(), JSON.stringify(almost), 'utf-8');
      await expect(loadSession(tempDir)).rejects.toThrow(/artifacts\.districts/);
    });

    it('does not modify the corrupt file (salvageable content preserved)', async () => {
      const corrupt = '{ "name": "precious-context", "themes": ["gothic"';
      await writeFile(sessionFile(), corrupt, 'utf-8');
      await loadSession(tempDir).catch(() => undefined);
      expect(await readFile(sessionFile(), 'utf-8')).toBe(corrupt);
    });

    it('fills missing optional artifact buckets on load of older files', async () => {
      const s = createSession('legacy');
      const obj = JSON.parse(JSON.stringify(s)) as { artifacts: Record<string, unknown> };
      delete obj.artifacts['entities'];
      delete obj.artifacts['dialogues'];
      delete obj.artifacts['abilities'];
      delete obj.artifacts['statuses'];
      delete obj.artifacts['items'];
      delete obj.artifacts['hazards'];
      await writeFile(sessionFile(), JSON.stringify(obj), 'utf-8');
      const loaded = await loadSession(tempDir);
      expect(loaded).not.toBeNull();
      expect(loaded!.artifacts.entities).toEqual([]);
      expect(loaded!.artifacts.dialogues).toEqual([]);
      expect(loaded!.artifacts.abilities).toEqual([]);
      expect(loaded!.artifacts.statuses).toEqual([]);
      expect(loaded!.artifacts.items).toEqual([]);
      expect(loaded!.artifacts.hazards).toEqual([]);
      expect(loaded!.artifacts.rooms).toEqual([]);
      expect(loaded!.artifacts.archetypes).toEqual([]);
      expect(loaded!.artifacts.backgrounds).toEqual([]);
      expect(loaded!.artifacts.catalogs).toEqual([]);
      expect(loaded!.artifacts.placements).toEqual([]);
      expect(loaded!.artifacts.entityAi).toEqual([]);
    });

    it('keeps items/hazards when present and drops unknown extra keys', async () => {
      const s = createSession('extra-keys');
      const obj = JSON.parse(JSON.stringify(s)) as { artifacts: Record<string, unknown> };
      obj.artifacts['items'] = ['sword_01'];
      obj.artifacts['hazards'] = ['chapel_fire'];
      obj.artifacts['widgets'] = ['nope'];
      await writeFile(sessionFile(), JSON.stringify(obj), 'utf-8');
      const loaded = await loadSession(tempDir);
      expect(loaded).not.toBeNull();
      expect(loaded!.name).toBe('extra-keys');
      expect(loaded!.artifacts.items).toEqual(['sword_01']);
      expect(loaded!.artifacts.hazards).toEqual(['chapel_fire']);
      expect((loaded!.artifacts as Record<string, unknown>)['widgets']).toBeUndefined();
    });

    it('tolerates a session without history (older format)', async () => {
      const s = createSession('old-format');
      const obj = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
      delete obj['history'];
      await writeFile(sessionFile(), JSON.stringify(obj), 'utf-8');
      const loaded = await loadSession(tempDir);
      expect(loaded?.name).toBe('old-format');
    });

    it('tryLoadSession degrades a corrupt session to null with a stderr warning', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await writeFile(sessionFile(), '{ broken', 'utf-8');

      const result = await tryLoadSession(tempDir);

      expect(result).toBeNull();
      const stderr = errSpy.mock.calls.flat().join('\n');
      expect(stderr).toContain('Warning:');
      expect(stderr).toContain(sessionFile());
    });

    it('tryLoadSession stays quiet when there is simply no session', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(await tryLoadSession(tempDir)).toBeNull();
      expect(errSpy).not.toHaveBeenCalled();
    });

    it('throws SessionLoadError with SESSION_BUDGET_EXCEEDED before JSON.parse when the file is over the byte cap (F-1582fb3d)', async () => {
      const parseSpy = vi.spyOn(JSON, 'parse');
      await writeFile(sessionFile(), Buffer.alloc(MAX_SESSION_JSON_BYTES + 1, 0x78));
      const err = await loadSession(tempDir).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(SessionLoadError);
      const loadError = err as SessionLoadError;
      expect(loadError.code).toBe('SESSION_BUDGET_EXCEEDED');
      expect(loadError.message).toMatch(/budget exceeded/i);
      const oversizedParses = parseSpy.mock.calls.filter(
        ([arg]) => typeof arg === 'string' && arg.length > MAX_SESSION_JSON_BYTES,
      );
      expect(oversizedParses).toHaveLength(0);
      parseSpy.mockRestore();
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

    it('addThemes records history events', () => {
      const before = session.history.length;
      addThemes(session, ['gothic']);
      expect(session.history.length).toBe(before + 1);
      expect(session.history[session.history.length - 1].kind).toBe('theme_added');
    });

    it('addConstraints deduplicates', () => {
      addConstraints(session, ['no-magic', 'low-tech']);
      addConstraints(session, ['low-tech', 'permadeath']);
      expect(session.constraints).toEqual(['no-magic', 'low-tech', 'permadeath']);
    });

    it('addConstraints records history events', () => {
      const before = session.history.length;
      addConstraints(session, ['no-magic']);
      expect(session.history.length).toBe(before + 1);
      expect(session.history[session.history.length - 1].kind).toBe('constraint_added');
    });

    it('addArtifact registers by kind and deduplicates', () => {
      addArtifact(session, 'rooms', 'crypt_01');
      addArtifact(session, 'rooms', 'crypt_02');
      addArtifact(session, 'rooms', 'crypt_01');
      expect(session.artifacts.rooms).toEqual(['crypt_01', 'crypt_02']);
    });

    it('addArtifact records history events', () => {
      const before = session.history.length;
      addArtifact(session, 'rooms', 'crypt_01');
      expect(session.history.length).toBe(before + 1);
      expect(session.history[session.history.length - 1].kind).toBe('artifact_created');
      expect(session.history[session.history.length - 1].detail).toContain('crypt_01');
    });

    it('addArtifact works for all kinds', () => {
      addArtifact(session, 'districts', 'd1');
      addArtifact(session, 'factions', 'f1');
      addArtifact(session, 'quests', 'q1');
      addArtifact(session, 'packs', 'p1');
      addArtifact(session, 'entities', 'guard_01');
      addArtifact(session, 'dialogues', 'pilgrim_talk');
      addArtifact(session, 'abilities', 'fireball');
      addArtifact(session, 'statuses', 'burning');
      expect(session.artifacts.districts).toEqual(['d1']);
      expect(session.artifacts.factions).toEqual(['f1']);
      expect(session.artifacts.quests).toEqual(['q1']);
      expect(session.artifacts.packs).toEqual(['p1']);
      expect(session.artifacts.entities).toEqual(['guard_01']);
      expect(session.artifacts.dialogues).toEqual(['pilgrim_talk']);
      expect(session.artifacts.abilities).toEqual(['fireball']);
      expect(session.artifacts.statuses).toEqual(['burning']);
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
      expect(session.history.some(e => e.kind === 'issue_resolved')).toBe(true);
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

  describe('recordEvent', () => {
    it('appends event to session history', () => {
      const s = createSession('event-test');
      const before = s.history.length;
      recordEvent(s, 'plan_generated', 'Generated a 3-step plan');
      expect(s.history.length).toBe(before + 1);
      const last = s.history[s.history.length - 1];
      expect(last.kind).toBe('plan_generated');
      expect(last.detail).toBe('Generated a 3-step plan');
      expect(last.timestamp).toBeTruthy();
    });

    it('defensively initializes history if missing', () => {
      const s = createSession('defensive-test');
      // Simulate a session loaded from old format without history
      (s as Record<string, unknown>).history = undefined;
      recordEvent(s, 'content_applied', 'Wrote room to disk');
      expect(s.history).toHaveLength(1);
      expect(s.history[0].kind).toBe('content_applied');
    });

    it('drops oldest events once history exceeds the retention cap (F-1582fb3d)', () => {
      const s = createSession('capped-hist');
      s.history = [];
      for (let i = 0; i < 10_000; i++) {
        recordEvent(s, 'theme_added', `theme_${i}`);
      }
      expect(s.history.length).toBe(MAX_SESSION_HISTORY_EVENTS);
      expect(s.history[0].detail).toBe('theme_9000');
      expect(s.history[s.history.length - 1].detail).toBe('theme_9999');
    });

    it('keeps a 10k-event session save and load bounded (F-1582fb3d)', async () => {
      const s = createSession('ten-k');
      for (let i = 0; i < 10_000; i++) {
        recordEvent(s, 'theme_added', `t${i}`);
      }
      expect(s.history.length).toBeLessThanOrEqual(MAX_SESSION_HISTORY_EVENTS);
      await saveSession(tempDir, s);
      const raw = await readFile(join(tempDir, '.ai-session.json'), 'utf-8');
      expect(Buffer.byteLength(raw, 'utf-8')).toBeLessThanOrEqual(MAX_SESSION_JSON_BYTES);
      const loaded = await loadSession(tempDir);
      expect(loaded).not.toBeNull();
      expect(loaded!.history.length).toBeLessThanOrEqual(MAX_SESSION_HISTORY_EVENTS);
    });
  });

  describe('formatSessionHistory', () => {
    it('returns no-events message for empty history', () => {
      const s = createSession('empty-hist');
      s.history = [];
      expect(formatSessionHistory(s)).toBe('No events recorded.');
    });

    it('formats events with truncated timestamps', () => {
      const s = createSession('fmt-test');
      // createSession adds session_start event
      recordEvent(s, 'theme_added', 'gothic');
      recordEvent(s, 'artifact_created', 'rooms: crypt_01');

      const output = formatSessionHistory(s);
      expect(output).toContain('Session: fmt-test');
      expect(output).toContain('Total events:');
      expect(output).toContain('session_start');
      expect(output).toContain('theme_added: gothic');
      expect(output).toContain('artifact_created: rooms: crypt_01');
    });

    it('respects limit parameter', () => {
      const s = createSession('limit-test');
      s.history = [];
      for (let i = 0; i < 10; i++) {
        recordEvent(s, 'theme_added', `theme_${i}`);
      }
      const output = formatSessionHistory(s, 3);
      expect(output).toContain('showing last 3 of 10');
      expect(output).toContain('theme_7');
      expect(output).toContain('theme_8');
      expect(output).toContain('theme_9');
      expect(output).not.toContain('theme_0');
    });
  });

  describe('named session slots', () => {
    it('sessionSlug lowercases and hyphenates', () => {
      expect(sessionSlug('Harbor District')).toBe('harbor-district');
      expect(sessionSlug('  --Underdark--  ')).toBe('underdark');
      expect(sessionSlug('???')).toBe('untitled');
    });

    it('saveSession dual-writes the named slot', async () => {
      const s = createSession('harbor');
      addThemes(s, ['salt']);
      await saveSession(tempDir, s);
      const named = await readFile(join(tempDir, '.ai-sessions', 'harbor.json'), 'utf-8');
      expect(JSON.parse(named).name).toBe('harbor');
      expect(JSON.parse(named).themes).toEqual(['salt']);
    });

    it('listSessions marks the active slot', async () => {
      await saveSession(tempDir, createSession('harbor'));
      await saveSession(tempDir, createSession('underdark'));
      const slots = await listSessions(tempDir);
      expect(slots.map(s => s.name).sort()).toEqual(['harbor', 'underdark']);
      const active = slots.find(s => s.active);
      expect(active?.name).toBe('underdark');
      expect(formatSessionList(slots)).toContain('* underdark');
    });

    it('switchSession is not destructive of the previous world', async () => {
      const harbor = createSession('harbor');
      addThemes(harbor, ['salt-road']);
      await saveSession(tempDir, harbor);

      const underdark = createSession('underdark');
      addThemes(underdark, ['mycelium']);
      await saveSession(tempDir, underdark);

      const switched = await switchSession(tempDir, 'harbor');
      expect(switched.name).toBe('harbor');
      expect(switched.themes).toEqual(['salt-road']);

      const active = await loadSession(tempDir);
      expect(active?.name).toBe('harbor');

      const namedUnderdark = JSON.parse(
        await readFile(join(tempDir, '.ai-sessions', 'underdark.json'), 'utf-8'),
      );
      expect(namedUnderdark.themes).toEqual(['mycelium']);
    });

    it('endSession archives instead of unlinking', async () => {
      const s = createSession('harbor');
      addThemes(s, ['salt']);
      await saveSession(tempDir, s);

      const ended = await endSession(tempDir);
      expect(ended.archived).toBe(true);
      expect(ended.archivePath).toMatch(/archive/);
      expect(await loadSession(tempDir)).toBeNull();
      expect(await readFile(ended.archivePath!, 'utf-8')).toContain('harbor');
      // named slot remains so switch can restore
      const named = JSON.parse(
        await readFile(join(tempDir, '.ai-sessions', 'harbor.json'), 'utf-8'),
      );
      expect(named.themes).toEqual(['salt']);
    });

    it('resumeNamedSession restores a named slot to the active path', async () => {
      const s = createSession('harbor');
      addThemes(s, ['salt']);
      await saveSession(tempDir, s);
      await endSession(tempDir);

      const resumed = await resumeNamedSession(tempDir, 'harbor');
      expect(resumed?.name).toBe('harbor');
      expect(resumed?.themes).toEqual(['salt']);
      expect((await loadSession(tempDir))?.name).toBe('harbor');
    });

    it('exportSession writes JSON (and optionally a path)', async () => {
      await saveSession(tempDir, createSession('harbor'));
      const toStdout = await exportSession(tempDir);
      expect(JSON.parse(toStdout.json).name).toBe('harbor');
      const dest = join(tempDir, 'export.json');
      const written = await exportSession(tempDir, dest);
      expect(written.path).toBe(dest);
      expect(JSON.parse(await readFile(dest, 'utf-8')).name).toBe('harbor');
    });

    it('artifactBucketForKind maps new verbs onto the new buckets', () => {
      expect(artifactBucketForKind('dialogue')).toBe('dialogues');
      expect(artifactBucketForKind('entity')).toBe('entities');
      expect(artifactBucketForKind('npc')).toBe('entities');
      expect(artifactBucketForKind('ability')).toBe('abilities');
      expect(artifactBucketForKind('status')).toBe('statuses');
      expect(artifactBucketForKind('item')).toBe('items');
      expect(artifactBucketForKind('hazard')).toBe('hazards');
      expect(artifactBucketForKind('room')).toBe('rooms');
      expect(artifactBucketForKind('location-pack')).toBe('packs');
      expect(artifactBucketForKind('archetype')).toBe('archetypes');
      expect(artifactBucketForKind('background')).toBe('backgrounds');
      expect(artifactBucketForKind('build-catalog')).toBe('catalogs');
      expect(artifactBucketForKind('placement')).toBe('placements');
      expect(artifactBucketForKind('entity-ai')).toBe('entityAi');
    });
  });
});
