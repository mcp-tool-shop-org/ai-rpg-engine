// Session — file-based design session protocol
// Stores evolving world context in .ai-session.json at the project root.
// Commands read session state to enrich prompts but never require it.

import { readFile, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { CritiqueIssue, CritiqueSuggestion } from './parsers.js';

// --- Types ---

export type SessionArtifacts = {
  districts: string[];
  factions: string[];
  quests: string[];
  rooms: string[];
  packs: string[];
};

export type SessionIssue = {
  code: string;
  target: string;
  severity: 'low' | 'medium' | 'high';
  status: 'open' | 'resolved' | 'accepted';
  summary: string;
};

export type SessionEventKind =
  | 'session_start'
  | 'theme_added'
  | 'constraint_added'
  | 'artifact_created'
  | 'issue_opened'
  | 'issue_resolved'
  | 'suggestion_accepted'
  | 'suggestion_generated'
  | 'replay_compared'
  | 'plan_generated'
  | 'content_applied';

export type SessionEvent = {
  timestamp: string;
  kind: SessionEventKind;
  detail: string;
};

export type DesignSession = {
  name: string;
  createdAt: string;
  updatedAt: string;
  themes: string[];
  constraints: string[];
  artifacts: SessionArtifacts;
  issues: SessionIssue[];
  acceptedSuggestions: string[];
  history: SessionEvent[];
  modelConfig?: {
    model?: string;
    baseUrl?: string;
  };
};

// --- File protocol ---

const SESSION_FILENAME = '.ai-session.json';

function sessionPath(projectRoot: string): string {
  return resolve(projectRoot, SESSION_FILENAME);
}

export async function loadSession(projectRoot: string): Promise<DesignSession | null> {
  try {
    const raw = await readFile(sessionPath(projectRoot), 'utf-8');
    return JSON.parse(raw) as DesignSession;
  } catch {
    return null;
  }
}

export async function saveSession(projectRoot: string, session: DesignSession): Promise<void> {
  session.updatedAt = new Date().toISOString();
  await writeFile(sessionPath(projectRoot), JSON.stringify(session, null, 2) + '\n', 'utf-8');
}

export async function deleteSession(projectRoot: string): Promise<boolean> {
  try {
    await unlink(sessionPath(projectRoot));
    return true;
  } catch {
    return false;
  }
}

// --- Factories ---

export function createSession(name: string): DesignSession {
  const now = new Date().toISOString();
  return {
    name,
    createdAt: now,
    updatedAt: now,
    themes: [],
    constraints: [],
    artifacts: {
      districts: [],
      factions: [],
      quests: [],
      rooms: [],
      packs: [],
    },
    issues: [],
    acceptedSuggestions: [],
    history: [{ timestamp: now, kind: 'session_start', detail: `Session "${name}" started` }],
  };
}

// --- History recording ---

export function recordEvent(session: DesignSession, kind: SessionEventKind, detail: string): void {
  session.history = session.history ?? [];
  session.history.push({
    timestamp: new Date().toISOString(),
    kind,
    detail,
  });
}

// --- Mutators ---

export function addThemes(session: DesignSession, themes: string[]): void {
  for (const t of themes) {
    if (!session.themes.includes(t)) {
      session.themes.push(t);
      recordEvent(session, 'theme_added', t);
    }
  }
}

export function addConstraints(session: DesignSession, constraints: string[]): void {
  for (const c of constraints) {
    if (!session.constraints.includes(c)) {
      session.constraints.push(c);
      recordEvent(session, 'constraint_added', c);
    }
  }
}

export function addArtifact(session: DesignSession, kind: keyof SessionArtifacts, id: string): void {
  if (!session.artifacts[kind].includes(id)) {
    session.artifacts[kind].push(id);
    recordEvent(session, 'artifact_created', `${kind}/${id}`);
  }
}

export function addCritiqueIssues(session: DesignSession, issues: CritiqueIssue[]): void {
  for (const issue of issues) {
    const existing = session.issues.find(i => i.code === issue.code);
    if (!existing) {
      session.issues.push({
        code: issue.code,
        target: issue.location,
        severity: issue.severity,
        status: 'open',
        summary: issue.summary,
      });
      recordEvent(session, 'issue_opened', `${issue.code}: ${issue.summary}`);
    }
  }
}

export function acceptSuggestion(session: DesignSession, code: string): void {
  if (!session.acceptedSuggestions.includes(code)) {
    session.acceptedSuggestions.push(code);
    recordEvent(session, 'suggestion_accepted', code);
  }
}

export function resolveIssue(session: DesignSession, code: string): boolean {
  const issue = session.issues.find(i => i.code === code);
  if (issue) {
    issue.status = 'resolved';
    recordEvent(session, 'issue_resolved', code);
    return true;
  }
  return false;
}

// --- Context rendering (for prompt injection) ---

export function renderSessionContext(session: DesignSession): string {
  const lines: string[] = [];

  lines.push(`Session: ${session.name}`);

  if (session.themes.length > 0) {
    lines.push(`Themes: ${session.themes.join(', ')}`);
  }
  if (session.constraints.length > 0) {
    lines.push(`Constraints: ${session.constraints.join(', ')}`);
  }

  const { districts, factions, quests, rooms, packs } = session.artifacts;
  if (districts.length > 0) lines.push(`Known districts: ${districts.join(', ')}`);
  if (factions.length > 0) lines.push(`Known factions: ${factions.join(', ')}`);
  if (quests.length > 0) lines.push(`Known quests: ${quests.join(', ')}`);
  if (rooms.length > 0) lines.push(`Known rooms: ${rooms.join(', ')}`);
  if (packs.length > 0) lines.push(`Known packs: ${packs.join(', ')}`);

  const openIssues = session.issues.filter(i => i.status === 'open');
  if (openIssues.length > 0) {
    lines.push(`Open issues (${openIssues.length}):`);
    for (const issue of openIssues) {
      lines.push(`  [${issue.severity}] ${issue.code}: ${issue.summary}`);
    }
  }

  if (session.acceptedSuggestions.length > 0) {
    lines.push(`Accepted suggestions: ${session.acceptedSuggestions.join(', ')}`);
  }

  // Include recent history (last 10 events) for guided design context
  const history = session.history ?? [];
  if (history.length > 0) {
    const recent = history.slice(-10);
    lines.push(`Recent activity (${recent.length} of ${history.length} events):`);
    for (const e of recent) {
      lines.push(`  ${e.kind}: ${e.detail}`);
    }
  }

  return lines.join('\n');
}

// --- Status formatting ---

export function formatSessionStatus(session: DesignSession): string {
  const lines: string[] = [];

  lines.push(`Session: ${session.name}`);
  lines.push(`Created: ${session.createdAt}`);
  lines.push(`Updated: ${session.updatedAt}`);
  lines.push('');

  if (session.themes.length > 0) {
    lines.push(`Themes: ${session.themes.join(', ')}`);
  }
  if (session.constraints.length > 0) {
    lines.push(`Constraints: ${session.constraints.join(', ')}`);
  }
  lines.push('');

  lines.push('Artifacts:');
  const { districts, factions, quests, rooms, packs } = session.artifacts;
  lines.push(`  Districts: ${districts.length > 0 ? districts.join(', ') : '(none)'}`);
  lines.push(`  Factions: ${factions.length > 0 ? factions.join(', ') : '(none)'}`);
  lines.push(`  Quests: ${quests.length > 0 ? quests.join(', ') : '(none)'}`);
  lines.push(`  Rooms: ${rooms.length > 0 ? rooms.join(', ') : '(none)'}`);
  lines.push(`  Packs: ${packs.length > 0 ? packs.join(', ') : '(none)'}`);
  lines.push('');

  const openIssues = session.issues.filter(i => i.status === 'open');
  const resolvedIssues = session.issues.filter(i => i.status === 'resolved');
  lines.push(`Issues: ${openIssues.length} open, ${resolvedIssues.length} resolved`);
  for (const issue of openIssues) {
    lines.push(`  [${issue.severity}] ${issue.code} → ${issue.target}: ${issue.summary}`);
  }
  lines.push('');

  if (session.acceptedSuggestions.length > 0) {
    lines.push(`Accepted suggestions: ${session.acceptedSuggestions.join(', ')}`);
  }

  return lines.join('\n');
}

// --- History formatting ---

export function formatSessionHistory(session: DesignSession, limit = 20): string {
  const history = session.history ?? [];
  if (history.length === 0) return 'No events recorded.';

  const lines: string[] = [];
  lines.push(`Session: ${session.name}`);
  lines.push(`Total events: ${history.length}`);
  lines.push('');

  const shown = limit > 0 ? history.slice(-limit) : history;
  if (limit > 0 && history.length > limit) {
    lines.push(`(showing last ${limit} of ${history.length})`);
    lines.push('');
  }

  for (const event of shown) {
    const ts = event.timestamp.replace('T', ' ').replace(/\.\d+Z$/, 'Z');
    lines.push(`  ${ts}  ${event.kind}: ${event.detail}`);
  }

  return lines.join('\n');
}
