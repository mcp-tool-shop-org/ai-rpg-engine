// RAG retrieval — project-grounded context retrieval.
// Scans local project for artifacts, docs, critiques, replays, transcripts.
// Returns ranked snippets the chat engine injects into prompts.
// No vector DB, no hidden magic — just file-system + keyword relevance.

import { readFile, readdir, stat } from 'node:fs/promises';
import { join, extname, basename, relative } from 'node:path';
import type { DesignSession } from './session.js';
import type { ChatTranscript } from './chat-types.js';

// --- Types ---

/** A source category so consumers can distinguish project truth from other context. */
export type SourceKind =
  | 'session'         // .ai-session.json
  | 'artifact'        // Generated YAML files
  | 'critique'        // Critique issues from session
  | 'replay'          // Replay/analysis findings from session
  | 'transcript'      // Prior chat transcripts
  | 'doc'             // Markdown docs, handbook, design docs
  | 'decision';       // Resolved issues + accepted suggestions

export type RetrievedSnippet = {
  source: SourceKind;
  /** File or logical origin (e.g. ".ai-session.json", "rooms/chapel.yaml"). */
  origin: string;
  /** The relevant text content. */
  content: string;
  /** Relevance score (higher = more relevant). */
  score: number;
};

export type RetrievalQuery = {
  /** The user's raw message. */
  userMessage: string;
  /** Keywords extracted from the message (auto-extracted if not provided). */
  keywords?: string[];
  /** Max snippets to return. */
  maxSnippets?: number;
  /** Max total characters across all snippets. */
  maxChars?: number;
  /** If set, only retrieve from these source kinds (loadout-gated). */
  allowedSources?: SourceKind[];
};

export type RetrievalResult = {
  snippets: RetrievedSnippet[];
  /** Total sources scanned (for transparency). */
  sourcesScanned: number;
};

// --- Keyword extraction ---

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'about', 'between',
  'through', 'during', 'before', 'after', 'above', 'below', 'up', 'down',
  'out', 'off', 'over', 'under', 'again', 'then', 'once', 'here', 'there',
  'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few',
  'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only',
  'own', 'same', 'so', 'than', 'too', 'very', 'just', 'because', 'but',
  'and', 'or', 'if', 'while', 'what', 'which', 'who', 'whom', 'this',
  'that', 'these', 'those', 'i', 'me', 'my', 'we', 'our', 'you', 'your',
  'it', 'its', 'they', 'them', 'their', 'he', 'she', 'him', 'her',
  'show', 'tell', 'give', 'get', 'make', 'let', 'still',
]);

export function extractKeywords(message: string): string[] {
  const words = message
    .toLowerCase()
    .replace(/[^a-z0-9\s-_]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));

  // Deduplicate while preserving order
  return [...new Set(words)];
}

// --- Relevance scoring ---

function scoreContent(content: string, keywords: string[]): number {
  if (keywords.length === 0) return 0;
  const lower = content.toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    // Count occurrences — more matches = higher score
    const regex = new RegExp(`\\b${escapeRegex(kw)}\\b`, 'gi');
    const matches = lower.match(regex);
    if (matches) {
      score += matches.length;
    }
  }
  // Normalize by keyword count so longer queries don't inflate scores
  return score / keywords.length;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// --- File discovery ---

const YAML_EXTS = new Set(['.yaml', '.yml']);
const DOC_EXTS = new Set(['.md', '.txt']);

async function findProjectFiles(
  projectRoot: string,
  exts: Set<string>,
  maxDepth = 3,
): Promise<string[]> {
  const found: string[] = [];

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip obvious non-project dirs
        if (entry.name.startsWith('.') && entry.name !== '.ai-transcripts') continue;
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'coverage') continue;
        await walk(full, depth + 1);
      } else if (entry.isFile() && exts.has(extname(entry.name).toLowerCase())) {
        found.push(full);
      }
    }
  }

  await walk(projectRoot, 0);
  return found;
}

async function safeReadFile(path: string, maxChars = 8000): Promise<string | null> {
  try {
    const info = await stat(path);
    // Skip very large files
    if (info.size > 100_000) return null;
    const content = await readFile(path, 'utf-8');
    return content.slice(0, maxChars);
  } catch {
    return null;
  }
}

// --- Source retrievers ---

function retrieveFromSession(session: DesignSession, keywords: string[]): RetrievedSnippet[] {
  const snippets: RetrievedSnippet[] = [];

  // Session overview
  const overview = [
    `Session: ${session.name}`,
    `Themes: ${session.themes.join(', ') || '(none)'}`,
    `Constraints: ${session.constraints.join(', ') || '(none)'}`,
    `Districts: ${session.artifacts.districts.join(', ') || '(none)'}`,
    `Factions: ${session.artifacts.factions.join(', ') || '(none)'}`,
    `Quests: ${session.artifacts.quests.join(', ') || '(none)'}`,
    `Rooms: ${session.artifacts.rooms.join(', ') || '(none)'}`,
    `Packs: ${session.artifacts.packs.join(', ') || '(none)'}`,
  ].join('\n');
  const overviewScore = scoreContent(overview, keywords);
  if (overviewScore > 0) {
    snippets.push({ source: 'session', origin: '.ai-session.json', content: overview, score: overviewScore + 1 });
  }

  // Open issues
  const openIssues = session.issues.filter(i => i.status === 'open');
  if (openIssues.length > 0) {
    const issueText = openIssues.map(i =>
      `[${i.severity}] ${i.code} → ${i.target}: ${i.summary}`
    ).join('\n');
    const issueScore = scoreContent(issueText, keywords);
    if (issueScore > 0) {
      snippets.push({ source: 'critique', origin: 'open issues', content: issueText, score: issueScore + 0.5 });
    }
  }

  // Resolved issues (prior decisions)
  const resolved = session.issues.filter(i => i.status === 'resolved');
  if (resolved.length > 0) {
    const resolvedText = resolved.map(i =>
      `[resolved] ${i.code} → ${i.target}: ${i.summary}`
    ).join('\n');
    const resolvedScore = scoreContent(resolvedText, keywords);
    if (resolvedScore > 0) {
      snippets.push({ source: 'decision', origin: 'resolved issues', content: resolvedText, score: resolvedScore });
    }
  }

  // Accepted suggestions
  if (session.acceptedSuggestions.length > 0) {
    const sugText = session.acceptedSuggestions.join('\n');
    const sugScore = scoreContent(sugText, keywords);
    if (sugScore > 0) {
      snippets.push({ source: 'decision', origin: 'accepted suggestions', content: sugText, score: sugScore });
    }
  }

  // Recent history events — look for replay/critique/plan events
  const history = session.history ?? [];
  const replayEvents = history.filter(e =>
    e.kind === 'replay_compared' || e.kind === 'plan_generated'
  );
  if (replayEvents.length > 0) {
    const replayText = replayEvents.map(e =>
      `${e.kind} (${e.timestamp}): ${e.detail}`
    ).join('\n');
    const replayScore = scoreContent(replayText, keywords);
    if (replayScore > 0) {
      snippets.push({ source: 'replay', origin: 'session history', content: replayText, score: replayScore });
    }
  }

  return snippets;
}

async function retrieveFromArtifacts(
  projectRoot: string,
  keywords: string[],
): Promise<RetrievedSnippet[]> {
  const files = await findProjectFiles(projectRoot, YAML_EXTS);
  const snippets: RetrievedSnippet[] = [];

  for (const file of files) {
    const content = await safeReadFile(file, 4000);
    if (!content) continue;
    const score = scoreContent(content, keywords);
    if (score > 0) {
      const rel = relative(projectRoot, file);
      snippets.push({ source: 'artifact', origin: rel, content, score });
    }
  }
  return snippets;
}

async function retrieveFromDocs(
  projectRoot: string,
  keywords: string[],
): Promise<RetrievedSnippet[]> {
  const files = await findProjectFiles(projectRoot, DOC_EXTS);
  const snippets: RetrievedSnippet[] = [];

  for (const file of files) {
    const content = await safeReadFile(file, 6000);
    if (!content) continue;
    const score = scoreContent(content, keywords);
    if (score > 0) {
      const rel = relative(projectRoot, file);
      snippets.push({ source: 'doc', origin: rel, content, score });
    }
  }
  return snippets;
}

async function retrieveFromTranscripts(
  projectRoot: string,
  keywords: string[],
): Promise<RetrievedSnippet[]> {
  const transcriptDir = join(projectRoot, '.ai-transcripts');
  let files: string[];
  try {
    const entries = await readdir(transcriptDir);
    files = entries
      .filter(e => e.endsWith('.jsonl'))
      .map(e => join(transcriptDir, e));
  } catch {
    return [];
  }

  const snippets: RetrievedSnippet[] = [];

  // Only look at the most recent transcripts (max 5)
  const sorted = files.sort().reverse().slice(0, 5);
  for (const file of sorted) {
    const content = await safeReadFile(file, 6000);
    if (!content) continue;

    // Extract message content from JSONL
    const lines = content.split('\n').filter(l => l.trim().length > 0);
    const messageTexts: string[] = [];
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.content) messageTexts.push(parsed.content);
      } catch { /* skip malformed lines */ }
    }

    const combined = messageTexts.join('\n');
    const score = scoreContent(combined, keywords);
    if (score > 0) {
      const rel = relative(projectRoot, file);
      snippets.push({
        source: 'transcript',
        origin: rel,
        content: combined.slice(0, 3000),
        score,
      });
    }
  }
  return snippets;
}

// --- Main retrieval function ---

export async function retrieve(
  query: RetrievalQuery,
  session: DesignSession | null,
  projectRoot: string,
): Promise<RetrievalResult> {
  const keywords = query.keywords ?? extractKeywords(query.userMessage);
  const maxSnippets = query.maxSnippets ?? 8;
  const maxChars = query.maxChars ?? 6000;

  if (keywords.length === 0) {
    return { snippets: [], sourcesScanned: 0 };
  }

  // Which sources are allowed? (loadout-gated or all)
  const allowed = query.allowedSources ? new Set(query.allowedSources) : null;
  const sourceAllowed = (kind: SourceKind) => !allowed || allowed.has(kind);

  // Gather snippets from allowed sources in parallel
  const [sessionSnippets, artifactSnippets, docSnippets, transcriptSnippets] = await Promise.all([
    session && sourceAllowed('session') ? Promise.resolve(retrieveFromSession(session, keywords)) : Promise.resolve([]),
    sourceAllowed('artifact') ? retrieveFromArtifacts(projectRoot, keywords) : Promise.resolve([]),
    sourceAllowed('doc') ? retrieveFromDocs(projectRoot, keywords) : Promise.resolve([]),
    sourceAllowed('transcript') ? retrieveFromTranscripts(projectRoot, keywords) : Promise.resolve([]),
  ]);

  const all = [
    ...sessionSnippets,
    ...artifactSnippets,
    ...docSnippets,
    ...transcriptSnippets,
  ];

  // Sort by score descending, take top N within budget
  all.sort((a, b) => b.score - a.score);

  const selected: RetrievedSnippet[] = [];
  let totalChars = 0;
  for (const snippet of all) {
    if (selected.length >= maxSnippets) break;
    if (totalChars + snippet.content.length > maxChars) {
      // Try to include a truncated version if there's room
      const remaining = maxChars - totalChars;
      if (remaining > 200) {
        selected.push({ ...snippet, content: snippet.content.slice(0, remaining) });
        totalChars += remaining;
      }
      break;
    }
    selected.push(snippet);
    totalChars += snippet.content.length;
  }

  const sourcesScanned =
    (session ? 1 : 0) +
    artifactSnippets.length +
    docSnippets.length +
    transcriptSnippets.length;

  return { snippets: selected, sourcesScanned };
}

// --- Format for prompt injection ---

export function formatRetrievedContext(snippets: RetrievedSnippet[]): string {
  if (snippets.length === 0) return '';

  const lines: string[] = ['--- Retrieved Project Context ---'];
  for (const s of snippets) {
    lines.push(`[${s.source}] ${s.origin}:`);
    lines.push(s.content.trim());
    lines.push('');
  }
  lines.push('--- End Retrieved Context ---');
  return lines.join('\n');
}
