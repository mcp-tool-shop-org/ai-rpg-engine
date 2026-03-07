// Session doctor — structural health check for .ai-session.json
// Pure function, no LLM call. Reports issues with the session file itself.

import type { DesignSession } from './session.js';

export type SessionDiagnostic = {
  code: string;
  severity: 'info' | 'warning';
  message: string;
};

export type SessionDoctorResult = {
  healthy: boolean;
  diagnostics: SessionDiagnostic[];
};

export function sessionDoctor(session: DesignSession): SessionDoctorResult {
  const diagnostics: SessionDiagnostic[] = [];

  // Duplicate themes
  const uniqueThemes = new Set(session.themes);
  if (uniqueThemes.size < session.themes.length) {
    const dupes = session.themes.filter((t, i) => session.themes.indexOf(t) !== i);
    diagnostics.push({
      code: 'DUPLICATE_THEMES',
      severity: 'warning',
      message: `Duplicate themes: ${[...new Set(dupes)].join(', ')}`,
    });
  }

  // Duplicate constraints
  const uniqueConstraints = new Set(session.constraints);
  if (uniqueConstraints.size < session.constraints.length) {
    const dupes = session.constraints.filter((c, i) => session.constraints.indexOf(c) !== i);
    diagnostics.push({
      code: 'DUPLICATE_CONSTRAINTS',
      severity: 'warning',
      message: `Duplicate constraints: ${[...new Set(dupes)].join(', ')}`,
    });
  }

  // Stale issues — open issues with no recent activity
  const openIssues = session.issues.filter(i => i.status === 'open');
  if (openIssues.length > 10) {
    diagnostics.push({
      code: 'MANY_OPEN_ISSUES',
      severity: 'warning',
      message: `${openIssues.length} open issues — consider resolving or triaging`,
    });
  }

  // Accepted suggestions that reference unknown issue codes
  const knownCodes = new Set(session.issues.map(i => i.code));
  const orphanedSuggestions = session.acceptedSuggestions.filter(s => !knownCodes.has(s));
  if (orphanedSuggestions.length > 0) {
    diagnostics.push({
      code: 'ORPHANED_SUGGESTIONS',
      severity: 'info',
      message: `Accepted suggestions with no matching issue: ${orphanedSuggestions.join(', ')}`,
    });
  }

  // Empty session — no artifacts, no themes, no issues
  const totalArtifacts = Object.values(session.artifacts).reduce((sum, arr) => sum + arr.length, 0);
  if (totalArtifacts === 0 && session.themes.length === 0 && session.issues.length === 0) {
    diagnostics.push({
      code: 'EMPTY_SESSION',
      severity: 'info',
      message: 'Session has no themes, artifacts, or issues — still a blank slate',
    });
  }

  // Duplicate artifacts
  for (const [kind, ids] of Object.entries(session.artifacts)) {
    const unique = new Set(ids as string[]);
    if (unique.size < (ids as string[]).length) {
      const dupes = (ids as string[]).filter((id, i) => (ids as string[]).indexOf(id) !== i);
      diagnostics.push({
        code: 'DUPLICATE_ARTIFACTS',
        severity: 'warning',
        message: `Duplicate ${kind}: ${[...new Set(dupes)].join(', ')}`,
      });
    }
  }

  // Issues referencing targets not in artifacts
  const allArtifactIds = new Set(Object.values(session.artifacts).flat());
  const missingTargets = openIssues.filter(
    i => i.target && i.target !== 'global' && !allArtifactIds.has(i.target),
  );
  if (missingTargets.length > 0) {
    diagnostics.push({
      code: 'MISSING_TARGETS',
      severity: 'info',
      message: `Issues reference unknown artifacts: ${missingTargets.map(i => `${i.code} → ${i.target}`).join(', ')}`,
    });
  }

  return {
    healthy: diagnostics.filter(d => d.severity === 'warning').length === 0,
    diagnostics,
  };
}

export function formatDoctorReport(result: SessionDoctorResult): string {
  const lines: string[] = [];

  if (result.healthy && result.diagnostics.length === 0) {
    lines.push('Session is healthy — no issues found.');
    return lines.join('\n');
  }

  lines.push(result.healthy ? 'Session is healthy (with notes):' : 'Session has issues:');
  lines.push('');

  for (const d of result.diagnostics) {
    const icon = d.severity === 'warning' ? '⚠' : 'ℹ';
    lines.push(`  ${icon} [${d.code}] ${d.message}`);
  }

  return lines.join('\n');
}
