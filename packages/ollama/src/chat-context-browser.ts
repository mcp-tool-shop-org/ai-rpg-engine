// Context browser — inspectable, trustworthy view of what chat is relying on.
// Shows: what was retrieved, why, which memory class, budget allocation.
// Supports /context and /sources style introspection.
// Goal: make the system transparent so users know what drives the answers.

import type { RetrievedSnippet, RetrievalResult } from './chat-rag.js';
import type { ShapedContext, ShapedMemory, MemoryClass } from './chat-memory-shaper.js';
import type { PersonalityProfile } from './chat-personality.js';

// --- Types ---

export type ContextSnapshot = {
  /** When this snapshot was taken (ISO timestamp). */
  timestamp: string;
  /** The user message that triggered retrieval. */
  query: string;
  /** Keywords extracted from the query. */
  keywords: string[];
  /** RAG retrieval results. */
  retrieval: RetrievalSummary;
  /** Memory shaping results. */
  shaping: ShapingSummary;
  /** Which personality profile was active. */
  activeProfile: ProfileSummary;
  /** Budget accounting. */
  budget: BudgetSummary;
};

export type RetrievalSummary = {
  /** Total snippets found before filtering. */
  sourcesScanned: number;
  /** Snippets that made it into the final set. */
  snippetsSelected: number;
  /** By source kind: how many from each source. */
  bySource: Record<string, number>;
  /** Top snippets with relevance reasoning. */
  topSnippets: SnippetSummary[];
};

export type SnippetSummary = {
  source: string;
  origin: string;
  score: number;
  /** Why this was retrieved (keyword hits). */
  matchReason: string;
  /** How many characters it contributed. */
  charCount: number;
};

export type ShapingSummary = {
  /** Memory classes present in shaped context. */
  classesPresent: MemoryClass[];
  /** Per-class breakdown. */
  byClass: ClassBreakdown[];
  /** Total characters after shaping. */
  totalChars: number;
};

export type ClassBreakdown = {
  class: MemoryClass;
  label: string;
  sourceCount: number;
  charCount: number;
  /** Percentage of total budget used by this class. */
  budgetPercent: number;
};

export type ProfileSummary = {
  name: string;
  inferenceHint: string;
  /** Why this profile was chosen. */
  reason: string;
};

export type BudgetSummary = {
  /** Max characters allowed for retrieval. */
  retrievalBudget: number;
  /** Characters actually used for retrieval. */
  retrievalUsed: number;
  /** Max characters allowed for shaped context. */
  shapingBudget: number;
  /** Characters actually used for shaped context. */
  shapingUsed: number;
  /** Percentage of total budget used. */
  utilizationPercent: number;
};

// --- Build a context snapshot ---

export function buildContextSnapshot(options: {
  query: string;
  keywords: string[];
  retrievalResult: RetrievalResult;
  shapedContext: ShapedContext;
  profile: PersonalityProfile;
  intentForProfile: string;
  retrievalBudget?: number;
  shapingBudget?: number;
}): ContextSnapshot {
  const {
    query, keywords, retrievalResult, shapedContext, profile,
    intentForProfile,
    retrievalBudget = 4000,
    shapingBudget = 4000,
  } = options;

  // Build retrieval summary
  const bySource: Record<string, number> = {};
  for (const snippet of retrievalResult.snippets) {
    bySource[snippet.source] = (bySource[snippet.source] ?? 0) + 1;
  }

  const topSnippets: SnippetSummary[] = retrievalResult.snippets.slice(0, 5).map(s => ({
    source: s.source,
    origin: s.origin,
    score: s.score,
    matchReason: buildMatchReason(s, keywords),
    charCount: s.content.length,
  }));

  const retrieval: RetrievalSummary = {
    sourcesScanned: retrievalResult.sourcesScanned,
    snippetsSelected: retrievalResult.snippets.length,
    bySource,
    topSnippets,
  };

  // Build shaping summary
  const byClass: ClassBreakdown[] = shapedContext.memories.map(m => ({
    class: m.class,
    label: m.label,
    sourceCount: m.sourceCount,
    charCount: m.content.length,
    budgetPercent: shapedContext.totalChars > 0
      ? Math.round((m.content.length / shapedContext.totalChars) * 100)
      : 0,
  }));

  const shaping: ShapingSummary = {
    classesPresent: shapedContext.classes,
    byClass,
    totalChars: shapedContext.totalChars,
  };

  // Profile summary
  const activeProfile: ProfileSummary = {
    name: profile.name,
    inferenceHint: profile.inferenceHint,
    reason: `Selected for intent: ${intentForProfile}`,
  };

  // Budget summary
  const retrievalUsed = retrievalResult.snippets.reduce((sum, s) => sum + s.content.length, 0);
  const totalBudget = retrievalBudget + shapingBudget;
  const totalUsed = retrievalUsed + shapedContext.totalChars;

  const budget: BudgetSummary = {
    retrievalBudget,
    retrievalUsed,
    shapingBudget,
    shapingUsed: shapedContext.totalChars,
    utilizationPercent: totalBudget > 0 ? Math.round((totalUsed / totalBudget) * 100) : 0,
  };

  return {
    timestamp: new Date().toISOString(),
    query,
    keywords,
    retrieval,
    shaping,
    activeProfile,
    budget,
  };
}

// --- Format for /context command ---

export function formatContextSnapshot(snapshot: ContextSnapshot): string {
  const lines: string[] = [];

  lines.push('--- Context Snapshot ---');
  lines.push(`Query: "${snapshot.query}"`);
  lines.push(`Keywords: ${snapshot.keywords.join(', ') || '(none)'}`);
  lines.push(`Time: ${snapshot.timestamp}`);
  lines.push('');

  // Retrieval
  lines.push('## Retrieval');
  lines.push(`  Sources scanned: ${snapshot.retrieval.sourcesScanned}`);
  lines.push(`  Snippets selected: ${snapshot.retrieval.snippetsSelected}`);
  if (Object.keys(snapshot.retrieval.bySource).length > 0) {
    lines.push('  By source:');
    for (const [source, count] of Object.entries(snapshot.retrieval.bySource)) {
      lines.push(`    ${source}: ${count}`);
    }
  }
  if (snapshot.retrieval.topSnippets.length > 0) {
    lines.push('  Top snippets:');
    for (const s of snapshot.retrieval.topSnippets) {
      lines.push(`    [${s.source}] ${s.origin} (score: ${s.score.toFixed(2)}, ${s.charCount} chars)`);
      lines.push(`      Match: ${s.matchReason}`);
    }
  }
  lines.push('');

  // Shaping
  lines.push('## Memory Shaping');
  lines.push(`  Classes: ${snapshot.shaping.classesPresent.join(', ') || '(none)'}`);
  lines.push(`  Total chars: ${snapshot.shaping.totalChars}`);
  if (snapshot.shaping.byClass.length > 0) {
    lines.push('  Budget allocation:');
    for (const c of snapshot.shaping.byClass) {
      lines.push(`    ${c.class} (${c.label}): ${c.charCount} chars (${c.budgetPercent}%) — ${c.sourceCount} source(s)`);
    }
  }
  lines.push('');

  // Profile
  lines.push('## Active Profile');
  lines.push(`  Name: ${snapshot.activeProfile.name}`);
  lines.push(`  Inference: ${snapshot.activeProfile.inferenceHint}`);
  lines.push(`  Reason: ${snapshot.activeProfile.reason}`);
  lines.push('');

  // Budget
  lines.push('## Budget');
  lines.push(`  Retrieval: ${snapshot.budget.retrievalUsed} / ${snapshot.budget.retrievalBudget} chars`);
  lines.push(`  Shaping: ${snapshot.budget.shapingUsed} / ${snapshot.budget.shapingBudget} chars`);
  lines.push(`  Utilization: ${snapshot.budget.utilizationPercent}%`);

  lines.push('--- End Context Snapshot ---');
  return lines.join('\n');
}

// --- Format for /sources command (condensed) ---

export function formatSources(snapshot: ContextSnapshot): string {
  if (snapshot.retrieval.snippetsSelected === 0) {
    return 'No sources were retrieved for the last query.';
  }

  const lines: string[] = [];
  lines.push(`Sources for: "${snapshot.query}"`);
  lines.push('');

  for (const s of snapshot.retrieval.topSnippets) {
    lines.push(`[${s.source}] ${s.origin}`);
    lines.push(`  Score: ${s.score.toFixed(2)} | ${s.charCount} chars | ${s.matchReason}`);
  }

  if (snapshot.retrieval.snippetsSelected > snapshot.retrieval.topSnippets.length) {
    lines.push(`... and ${snapshot.retrieval.snippetsSelected - snapshot.retrieval.topSnippets.length} more.`);
  }

  return lines.join('\n');
}

// --- Internal helpers ---

function buildMatchReason(snippet: RetrievedSnippet, keywords: string[]): string {
  if (keywords.length === 0) return 'baseline context';

  const hits: string[] = [];
  const lower = snippet.content.toLowerCase();
  for (const kw of keywords) {
    const re = new RegExp(`\\b${escapeRegex(kw)}\\b`, 'gi');
    const count = (lower.match(re) || []).length;
    if (count > 0) hits.push(`${kw}(${count})`);
  }

  if (hits.length === 0) return 'metadata match';
  return `keyword hits: ${hits.join(', ')}`;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
