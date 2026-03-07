import { describe, it, expect } from 'vitest';
import { sessionDoctor, formatDoctorReport } from './session-doctor.js';
import { createSession, addThemes, addConstraints, addArtifact, addCritiqueIssues, acceptSuggestion } from './session.js';
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
});
