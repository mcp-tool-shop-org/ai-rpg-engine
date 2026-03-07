// Memory shaper — structures retrieved context into memory classes.
// Instead of dumping raw retrieval into prompts, this module categorizes
// context into distinct classes and shapes them for the prompt window.
// The chat engine uses this to build focused, grounded context.

import type { DesignSession } from './session.js';
import type { RetrievedSnippet, SourceKind } from './chat-rag.js';

// --- Memory classes ---

export type MemoryClass =
  | 'current_session'   // Active session state: themes, constraints, artifact IDs
  | 'project_facts'     // Content from artifact files and docs
  | 'open_issues'       // Critique issues still unresolved
  | 'recent_changes'    // Recent session events and activity
  | 'prior_decisions'   // Resolved issues, accepted suggestions, design choices
  | 'external';         // Webfetch or imported references (clearly separated)

export type ShapedMemory = {
  class: MemoryClass;
  /** Human-readable label for transparency. */
  label: string;
  /** The shaped content for prompt injection. */
  content: string;
  /** How many source items contributed. */
  sourceCount: number;
};

export type ShapedContext = {
  memories: ShapedMemory[];
  /** Total characters across all memories. */
  totalChars: number;
  /** Which memory classes are present. */
  classes: MemoryClass[];
};

// --- Source kind → memory class mapping ---

const SOURCE_TO_CLASS: Record<SourceKind, MemoryClass> = {
  session: 'current_session',
  artifact: 'project_facts',
  critique: 'open_issues',
  replay: 'recent_changes',
  transcript: 'recent_changes',
  doc: 'project_facts',
  decision: 'prior_decisions',
};

// --- Session-derived memory ---

function shapeSessionMemory(session: DesignSession): ShapedMemory | null {
  const parts: string[] = [];

  if (session.themes.length > 0) {
    parts.push(`Themes: ${session.themes.join(', ')}`);
  }
  if (session.constraints.length > 0) {
    parts.push(`Constraints: ${session.constraints.join(', ')}`);
  }

  const { districts, factions, quests, rooms, packs } = session.artifacts;
  const counts = [
    districts.length && `${districts.length} districts (${districts.join(', ')})`,
    factions.length && `${factions.length} factions (${factions.join(', ')})`,
    quests.length && `${quests.length} quests (${quests.join(', ')})`,
    rooms.length && `${rooms.length} rooms (${rooms.join(', ')})`,
    packs.length && `${packs.length} packs (${packs.join(', ')})`,
  ].filter(Boolean);

  if (counts.length > 0) {
    parts.push(`Artifacts: ${counts.join('; ')}`);
  }

  if (parts.length === 0) return null;

  return {
    class: 'current_session',
    label: `Session "${session.name}"`,
    content: parts.join('\n'),
    sourceCount: 1,
  };
}

function shapeOpenIssues(session: DesignSession): ShapedMemory | null {
  const open = session.issues.filter(i => i.status === 'open');
  if (open.length === 0) return null;

  const content = open.map(i =>
    `[${i.severity}] ${i.code} → ${i.target}: ${i.summary}`
  ).join('\n');

  return {
    class: 'open_issues',
    label: `${open.length} open issue${open.length > 1 ? 's' : ''}`,
    content,
    sourceCount: open.length,
  };
}

function shapeRecentActivity(session: DesignSession, limit = 10): ShapedMemory | null {
  const history = session.history ?? [];
  if (history.length === 0) return null;

  const recent = history.slice(-limit);
  const content = recent.map(e =>
    `${e.kind}: ${e.detail}`
  ).join('\n');

  return {
    class: 'recent_changes',
    label: `Recent activity (${recent.length} events)`,
    content,
    sourceCount: recent.length,
  };
}

function shapePriorDecisions(session: DesignSession): ShapedMemory | null {
  const resolved = session.issues.filter(i => i.status === 'resolved');
  const accepted = session.acceptedSuggestions;

  if (resolved.length === 0 && accepted.length === 0) return null;

  const parts: string[] = [];
  if (resolved.length > 0) {
    parts.push('Resolved issues:');
    for (const i of resolved) {
      parts.push(`  ${i.code} → ${i.target}: ${i.summary}`);
    }
  }
  if (accepted.length > 0) {
    parts.push('Accepted suggestions:');
    for (const s of accepted) {
      parts.push(`  ${s}`);
    }
  }

  return {
    class: 'prior_decisions',
    label: `${resolved.length} resolved, ${accepted.length} accepted`,
    content: parts.join('\n'),
    sourceCount: resolved.length + accepted.length,
  };
}

// --- RAG snippet grouping ---

function groupSnippetsByClass(snippets: RetrievedSnippet[]): Map<MemoryClass, RetrievedSnippet[]> {
  const groups = new Map<MemoryClass, RetrievedSnippet[]>();
  for (const s of snippets) {
    const cls = SOURCE_TO_CLASS[s.source] ?? 'project_facts';
    if (!groups.has(cls)) groups.set(cls, []);
    groups.get(cls)!.push(s);
  }
  return groups;
}

function shapeSnippetGroup(cls: MemoryClass, snippets: RetrievedSnippet[]): ShapedMemory {
  const labels: Record<MemoryClass, string> = {
    current_session: 'Session context',
    project_facts: 'Project files',
    open_issues: 'Open issues',
    recent_changes: 'Recent activity',
    prior_decisions: 'Prior decisions',
    external: 'External references',
  };

  const content = snippets
    .map(s => `[${s.origin}]\n${s.content.trim()}`)
    .join('\n\n');

  return {
    class: cls,
    label: `${labels[cls]} (${snippets.length} source${snippets.length > 1 ? 's' : ''})`,
    content,
    sourceCount: snippets.length,
  };
}

// --- Main shaping function ---

export type ShapeOptions = {
  session: DesignSession | null;
  ragSnippets: RetrievedSnippet[];
  /** Max total characters for shaped context. */
  maxChars?: number;
  /** Include session-derived memory even without matching RAG snippets. */
  includeSessionBaseline?: boolean;
};

export function shapeMemory(options: ShapeOptions): ShapedContext {
  const {
    session,
    ragSnippets,
    maxChars = 5000,
    includeSessionBaseline = true,
  } = options;

  const memories: ShapedMemory[] = [];

  // Session-derived memories (always relevant if available)
  if (session && includeSessionBaseline) {
    const sessionMem = shapeSessionMemory(session);
    if (sessionMem) memories.push(sessionMem);

    const issuesMem = shapeOpenIssues(session);
    if (issuesMem) memories.push(issuesMem);

    const activityMem = shapeRecentActivity(session);
    if (activityMem) memories.push(activityMem);

    const decisionsMem = shapePriorDecisions(session);
    if (decisionsMem) memories.push(decisionsMem);
  }

  // RAG-retrieved snippets grouped by memory class
  const groups = groupSnippetsByClass(ragSnippets);
  for (const [cls, snippets] of groups) {
    // Skip if session baseline already covers this class
    if (memories.some(m => m.class === cls)) continue;
    memories.push(shapeSnippetGroup(cls, snippets));
  }

  // Budget enforcement
  let totalChars = 0;
  const budgeted: ShapedMemory[] = [];
  for (const mem of memories) {
    if (totalChars + mem.content.length > maxChars) {
      const remaining = maxChars - totalChars;
      if (remaining > 100) {
        budgeted.push({ ...mem, content: mem.content.slice(0, remaining) });
        totalChars += remaining;
      }
      break;
    }
    budgeted.push(mem);
    totalChars += mem.content.length;
  }

  return {
    memories: budgeted,
    totalChars,
    classes: [...new Set(budgeted.map(m => m.class))],
  };
}

// --- Format for prompt injection ---

export function formatShapedContext(shaped: ShapedContext): string {
  if (shaped.memories.length === 0) return '';

  const sections: string[] = [];
  for (const mem of shaped.memories) {
    sections.push(`## ${mem.label}`);
    sections.push(mem.content);
    sections.push('');
  }

  return [
    '--- Project Memory ---',
    ...sections,
    '--- End Project Memory ---',
  ].join('\n');
}
