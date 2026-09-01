import { describe, it, expect } from 'vitest';
import { sessionDoctor, formatDoctorReport } from './session-doctor.js';
import { createSession, addThemes, addConstraints, addArtifact, addCritiqueIssues, acceptSuggestion, MAX_SESSION_HISTORY_EVENTS } from './session.js';
import { formatHeading } from './chat-studio.js';
import type { CritiqueIssue } from './parsers.js';

describe('sessionDoctor', () => {
  it('reports healthy for a clean session', () => {
    const s = createSession('clean');
    addThemes(s, ['gothic']);
    addArtifact(s, 'rooms', 'crypt_01');
    const result = sessionDoctor(s);
    expect(result.healthy).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('reports empty session', () => {
    const s = createSession('blank');
    const result = sessionDoctor(s);
    expect(result.healthy).toBe(true);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].code).toBe('EMPTY_SESSION');
  });

  it('detects duplicate themes', () => {
    const s = createSession('dupes');
    s.themes = ['gothic', 'mystery', 'gothic'];
    const result = sessionDoctor(s);
    expect(result.healthy).toBe(false);
    expect(result.diagnostics.some(d => d.code === 'DUPLICATE_THEMES')).toBe(true);
  });

  it('detects duplicate constraints', () => {
    const s = createSession('dupes');
    s.constraints = ['no-magic', 'no-magic'];
    const result = sessionDoctor(s);
    expect(result.healthy).toBe(false);
    expect(result.diagnostics.some(d => d.code === 'DUPLICATE_CONSTRAINTS')).toBe(true);
  });

  it('detects duplicate artifacts', () => {
    const s = createSession('dupes');
    s.artifacts.rooms = ['crypt_01', 'crypt_01', 'crypt_02'];
    const result = sessionDoctor(s);
    expect(result.healthy).toBe(false);
    expect(result.diagnostics.some(d => d.code === 'DUPLICATE_ARTIFACTS')).toBe(true);
  });

  it('detects duplicate entities and missing dialogue targets', () => {
    const s = createSession('new-kinds');
    addThemes(s, ['gothic']);
    s.artifacts.entities = ['guard_01', 'guard_01'];
    addArtifact(s, 'dialogues', 'pilgrim_talk');
    const issues: CritiqueIssue[] = [{
      code: 'BAD_NPC',
      severity: 'medium',
      location: 'missing_npc',
      summary: 'References missing entity',
      simulation_impact: 'test',
    }];
    addCritiqueIssues(s, issues);
    const result = sessionDoctor(s);
    expect(result.diagnostics.some(d => d.code === 'DUPLICATE_ARTIFACTS' && d.message.includes('entities'))).toBe(true);
    expect(result.diagnostics.some(d => d.code === 'MISSING_TARGETS' && d.message.includes('missing_npc'))).toBe(true);
  });

  it('warns about many open issues', () => {
    const s = createSession('busy');
    addThemes(s, ['gothic']);
    const issues: CritiqueIssue[] = Array.from({ length: 12 }, (_, i) => ({
      code: `ISSUE_${i}`,
      severity: 'medium' as const,
      location: 'global',
      summary: `Issue ${i}`,
      simulation_impact: 'test',
    }));
    addCritiqueIssues(s, issues);
    const result = sessionDoctor(s);
    expect(result.healthy).toBe(false);
    expect(result.diagnostics.some(d => d.code === 'MANY_OPEN_ISSUES')).toBe(true);
  });

  it('detects orphaned accepted suggestions', () => {
    const s = createSession('orphans');
    addThemes(s, ['gothic']);
    acceptSuggestion(s, 'ADD_TRAP');
    acceptSuggestion(s, 'ADD_NPC');
    const result = sessionDoctor(s);
    expect(result.healthy).toBe(true);
    expect(result.diagnostics.some(d => d.code === 'ORPHANED_SUGGESTIONS')).toBe(true);
  });

  it('detects issues referencing missing artifacts', () => {
    const s = createSession('missing');
    addThemes(s, ['gothic']);
    addArtifact(s, 'rooms', 'crypt_01');
    const issues: CritiqueIssue[] = [{
      code: 'BAD_REF',
      severity: 'high',
      location: 'nonexistent_room',
      summary: 'References missing room',
      simulation_impact: 'test',
    }];
    addCritiqueIssues(s, issues);
    const result = sessionDoctor(s);
    expect(result.diagnostics.some(d => d.code === 'MISSING_TARGETS')).toBe(true);
  });

  it('warns when session history is at the retention cap (F-1582fb3d)', () => {
    const s = createSession('long-hist');
    addThemes(s, ['gothic']);
    s.history = Array.from({ length: MAX_SESSION_HISTORY_EVENTS }, (_, i) => ({
      timestamp: '2026-01-01T00:00:00.000Z',
      kind: 'theme_added' as const,
      detail: `theme_${i}`,
    }));
    const result = sessionDoctor(s);
    expect(result.healthy).toBe(false);
    expect(result.diagnostics.some(d => d.code === 'HISTORY_AT_CAP')).toBe(true);
  });

  it('reports IN_FLIGHT_BUILD with goal and staged file count (F-3f17cbc3)', () => {
    const s = createSession('inflight-build');
    addThemes(s, ['gothic']);
    s.activeBuild = {
      plan: { goal: 'haunted market', steps: [], estimatedSteps: 0, warnings: [] },
      startedAt: '2026-01-01T00:00:00.000Z',
      status: 'executing',
      generatedContent: [],
      stagedWrites: {
        'content/rooms/a.yaml': {
          content: 'id: a', suggestedPath: 'content/rooms/a.yaml', label: 'a', sourceStepId: 1,
        },
        'content/rooms/b.yaml': {
          content: 'id: b', suggestedPath: 'content/rooms/b.yaml', label: 'b', sourceStepId: 2,
        },
      },
    };
    const result = sessionDoctor(s);
    const diag = result.diagnostics.find(d => d.code === 'IN_FLIGHT_BUILD');
    expect(diag).toBeTruthy();
    expect(diag!.message).toContain('haunted market');
    expect(diag!.message).toMatch(/2 staged/);
  });

  it('reports IN_FLIGHT_TUNING with goal and staged file count (F-3f17cbc3)', () => {
    const s = createSession('inflight-tune');
    addThemes(s, ['gothic']);
    s.activeTuning = {
      plan: { goal: 'paranoia pass', steps: [], warnings: [] },
      startedAt: '2026-01-01T00:00:00.000Z',
      status: 'executing',
      stagedWrites: {
        'content/rooms/t.yaml': {
          content: 'id: t', suggestedPath: 'content/rooms/t.yaml', label: 't', sourceStepId: 1,
        },
      },
    };
    const result = sessionDoctor(s);
    const diag = result.diagnostics.find(d => d.code === 'IN_FLIGHT_TUNING');
    expect(diag).toBeTruthy();
    expect(diag!.message).toContain('paranoia pass');
    expect(diag!.message).toMatch(/1 staged/);
  });

  it('does not flag issues targeting global', () => {
    const s = createSession('global-ok');
    addThemes(s, ['gothic']);
    const issues: CritiqueIssue[] = [{
      code: 'GLOBAL_01',
      severity: 'medium',
      location: 'global',
      summary: 'Global issue',
      simulation_impact: 'test',
    }];
    addCritiqueIssues(s, issues);
    const result = sessionDoctor(s);
    expect(result.diagnostics.some(d => d.code === 'MISSING_TARGETS')).toBe(false);
  });
});

describe('formatDoctorReport', () => {
  it('formats healthy report', () => {
    const report = formatDoctorReport({ healthy: true, diagnostics: [] });
    expect(report).toContain('healthy');
    expect(report).toContain('no issues');
  });

  it('formats report with diagnostics', () => {
    const report = formatDoctorReport({
      healthy: false,
      diagnostics: [
        { code: 'DUPLICATE_THEMES', severity: 'warning', message: 'Duplicate themes: gothic' },
        { code: 'EMPTY_SESSION', severity: 'info', message: 'Session is empty' },
      ],
    });
    expect(report).toContain('has issues');
    expect(report).toContain('DUPLICATE_THEMES');
    expect(report).toContain('EMPTY_SESSION');
  });

  it('groups Warnings then Notes and prints a counts line (F-f4a94524)', () => {
    const report = formatDoctorReport({
      healthy: false,
      diagnostics: [
        { code: 'DUPLICATE_THEMES', severity: 'warning', message: 'Duplicate themes: gothic' },
        { code: 'EMPTY_SESSION', severity: 'info', message: 'Session is empty' },
      ],
    });
    expect(report).toContain('1 warning, 1 note');
    expect(report).toContain(formatHeading('Warnings'));
    expect(report).toContain(formatHeading('Notes'));
    expect(report).toContain('[warn] [DUPLICATE_THEMES]');
    expect(report).toContain('[info] [EMPTY_SESSION]');
    expect(report).not.toContain('⚠');
    expect(report).not.toContain('ℹ');
    expect(report.indexOf('Warnings')).toBeLessThan(report.indexOf('Notes'));
    expect(report.indexOf('DUPLICATE_THEMES')).toBeLessThan(report.indexOf('EMPTY_SESSION'));
  });

  it('pins HISTORY_AT_CAP in Warnings above ORPHANED_SUGGESTIONS / MISSING_TARGETS (F-f4a94524)', () => {
    const s = createSession('mixed');
    addThemes(s, ['gothic']);
    acceptSuggestion(s, 'ADD_TRAP');
    s.history = Array.from({ length: MAX_SESSION_HISTORY_EVENTS }, (_, i) => ({
      timestamp: '2026-01-01T00:00:00.000Z',
      kind: 'theme_added' as const,
      detail: `theme_${i}`,
    }));
    addCritiqueIssues(s, [{
      code: 'BAD_REF',
      severity: 'high',
      location: 'nonexistent_room',
      summary: 'References missing room',
      simulation_impact: 'test',
    }]);

    const result = sessionDoctor(s);
    expect(result.diagnostics.map(d => d.code)).toEqual([
      'ORPHANED_SUGGESTIONS',
      'HISTORY_AT_CAP',
      'MISSING_TARGETS',
    ]);

    const report = formatDoctorReport(result);
    expect(report).toContain('1 warning, 2 notes');
    expect(report).toContain(formatHeading('Warnings'));
    expect(report).toContain(formatHeading('Notes'));

    const warnAt = report.indexOf(formatHeading('Warnings'));
    const notesAt = report.indexOf(formatHeading('Notes'));
    const histAt = report.indexOf('HISTORY_AT_CAP');
    const orphanAt = report.indexOf('ORPHANED_SUGGESTIONS');
    const missingAt = report.indexOf('MISSING_TARGETS');

    expect(warnAt).toBeGreaterThanOrEqual(0);
    expect(notesAt).toBeGreaterThan(warnAt);
    expect(histAt).toBeGreaterThan(warnAt);
    expect(histAt).toBeLessThan(notesAt);
    expect(orphanAt).toBeGreaterThan(notesAt);
    expect(missingAt).toBeGreaterThan(notesAt);
    expect(histAt).toBeLessThan(orphanAt);
    expect(histAt).toBeLessThan(missingAt);
  });
});
