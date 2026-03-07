// Context browser — inspectable, trustworthy view of what chat is relying on.
// Shows: what was retrieved, why, which memory class, budget allocation.
// Supports /context and /sources style introspection.
// Goal: make the system transparent so users know what drives the answers.

import type { RetrievedSnippet, RetrievalResult } from './chat-rag.js';
import type { ShapedContext, ShapedMemory, MemoryClass } from './chat-memory-shaper.js';
import type { PersonalityProfile } from './chat-personality.js';
import type { LoadoutRoutePlan, RoutedEntry } from './chat-loadout.js';

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
  /** Loadout routing info (present when loadout is active). */
  loadout?: LoadoutSummary;
  /** Advisory warnings (e.g. repeated-context). */
  warnings: string[];
};

export type LoadoutSummary = {
  active: boolean;
  preloadCount: number;
  onDemandCount: number;
  manualCount: number;
  allowedSources: string[];
  preloadTokens: number;
  onDemandTokens: number;
  layers: string[];
  taskString: string;
  /** How the personality profile influenced source selection. */
  profileInfluence: string;
  /** Top entries from preload + onDemand for display. */
  topEntries: Array<{ id: string; score: number; reason: string; mode: string }>;
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
  /** Sources that were gated out by allowedSources. */
  excludedSources: string[];
  /** Candidate snippets before budget filtering. */
  totalCandidates: number;
  /** Snippets dropped because budget was exhausted. */
  droppedByBudget: number;
  /** Snippets that were truncated to fit remaining budget. */
  truncatedCount: number;
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
  /** Percentage of total shaped output used by this class. */
  budgetPercent: number;
  /** Percentage of total shaping budget consumed by this class. */
  budgetSharePercent: number;
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

// --- Repeated-context detection (D2) ---

/**
 * Detect when loadout routing repeatedly selects the same source set
 * while open issues remain unresolved.
 * Returns a warning string if the pattern is detected, empty array otherwise.
 * Deterministic: same inputs → same output.
 */
export function detectRepeatedContext(
  history: LoadoutHistoryRow[],
  openIssueCount: number,
): string[] {
  if (history.length < 3 || openIssueCount === 0) return [];

  // Check last 3 entries for identical source sets
  const recent = history.slice(-3);
  const key = (r: LoadoutHistoryRow) => [...r.allowedSources].sort().join(',');
  const keys = recent.map(key);

  const warnings: string[] = [];
  if (keys[0] === keys[1] && keys[1] === keys[2]) {
    warnings.push(
      `Same source set (${recent[0].allowedSources.join(', ')}) routed 3× in a row with ${openIssueCount} open issue(s). Consider broadening context or addressing open issues.`
    );
  }

  return warnings;
}

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
  loadoutPlan?: LoadoutRoutePlan;
  /** Loadout history for repeated-context detection. */
  loadoutHistory?: LoadoutHistoryRow[];
  /** Number of open issues in current session. */
  openIssueCount?: number;
}): ContextSnapshot {
  const {
    query, keywords, retrievalResult, shapedContext, profile,
    intentForProfile,
    retrievalBudget = 4000,
    shapingBudget = 4000,
    loadoutPlan,
    loadoutHistory = [],
    openIssueCount = 0,
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
    excludedSources: retrievalResult.excludedSources ?? [],
    totalCandidates: retrievalResult.totalCandidates ?? 0,
    droppedByBudget: retrievalResult.droppedByBudget ?? 0,
    truncatedCount: retrievalResult.truncatedCount ?? 0,
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
    budgetSharePercent: shapingBudget > 0
      ? Math.round((m.content.length / shapingBudget) * 100)
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

  // Build loadout summary if present
  let loadout: LoadoutSummary | undefined;
  if (loadoutPlan) {
    const topEntries = [
      ...loadoutPlan.preload.map(e => ({ id: e.id, score: e.score, reason: e.reason, mode: e.mode })),
      ...loadoutPlan.onDemand.map(e => ({ id: e.id, score: e.score, reason: e.reason, mode: e.mode })),
    ].slice(0, 8);

    loadout = {
      active: loadoutPlan.active,
      preloadCount: loadoutPlan.preload.length,
      onDemandCount: loadoutPlan.onDemand.length,
      manualCount: loadoutPlan.manualCount,
      allowedSources: loadoutPlan.allowedSources,
      preloadTokens: loadoutPlan.preloadTokens,
      onDemandTokens: loadoutPlan.onDemandTokens,
      layers: loadoutPlan.layers,
      taskString: loadoutPlan.taskString,
      profileInfluence: loadoutPlan.profileInfluence ?? '',
      topEntries,
    };
  }

  // Repeated-context warnings (D2)
  const warnings = detectRepeatedContext(loadoutHistory, openIssueCount);

  return {
    timestamp: new Date().toISOString(),
    query,
    keywords,
    retrieval,
    shaping,
    activeProfile,
    budget,
    loadout,
    warnings,
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

  // Loadout routing (if active)
  if (snapshot.loadout) {
    if (snapshot.loadout.active) {
      lines.push('## Loadout Routing');
      lines.push(`  Task: "${snapshot.loadout.taskString.length > 100 ? snapshot.loadout.taskString.slice(0, 100) + '…' : snapshot.loadout.taskString}"`);
      lines.push(`  Layers: ${snapshot.loadout.layers.join(' → ') || '(none)'}`);
      lines.push(`  Allowed sources: ${snapshot.loadout.allowedSources.join(', ')}`);
      if (snapshot.loadout.profileInfluence) {
        lines.push(`  Profile influence: ${snapshot.loadout.profileInfluence}`);
      }
      lines.push(`  Entries: ${snapshot.loadout.preloadCount} preload, ${snapshot.loadout.onDemandCount} on-demand, ${snapshot.loadout.manualCount} manual`);
      lines.push(`  Tokens: ${snapshot.loadout.preloadTokens} preload + ${snapshot.loadout.onDemandTokens} on-demand`);
      if (snapshot.loadout.topEntries.length > 0) {
        lines.push('  Top entries:');
        for (const e of snapshot.loadout.topEntries) {
          lines.push(`    [${e.mode}] ${e.id} (score: ${e.score.toFixed(2)}) — ${e.reason}`);
        }
      }
      lines.push('');
    } else {
      lines.push('## Loadout Routing');
      lines.push('  Not active (ai-loadout not installed or no index found)');
      lines.push('');
    }
  }

  // Retrieval
  lines.push('## Retrieval');
  lines.push(`  Sources scanned: ${snapshot.retrieval.sourcesScanned}`);
  lines.push(`  Candidates found: ${snapshot.retrieval.totalCandidates}`);
  lines.push(`  Snippets selected: ${snapshot.retrieval.snippetsSelected}`);
  if (snapshot.retrieval.droppedByBudget > 0) {
    lines.push(`  Dropped by budget: ${snapshot.retrieval.droppedByBudget}`);
  }
  if (snapshot.retrieval.truncatedCount > 0) {
    lines.push(`  Truncated to fit: ${snapshot.retrieval.truncatedCount}`);
  }
  if (snapshot.retrieval.excludedSources.length > 0) {
    lines.push(`  Excluded sources: ${snapshot.retrieval.excludedSources.join(', ')}`);
  }
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
    lines.push('  Per-class budget:');
    for (const c of snapshot.shaping.byClass) {
      lines.push(`    ${c.class} (${c.label}): ${c.charCount} chars — ${c.budgetPercent}% of output, ${c.budgetSharePercent}% of budget — ${c.sourceCount} source(s)`);
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
  lines.push('');

  // Pipeline utilization summary (C3)
  const routedSources = snapshot.loadout?.active
    ? `${snapshot.loadout.allowedSources.length} source types routed`
    : 'no loadout';
  const retrievedInfo = `${snapshot.retrieval.snippetsSelected}/${snapshot.retrieval.totalCandidates} candidates kept`;
  const shapedInfo = `${snapshot.shaping.byClass.length} classes → ${snapshot.shaping.totalChars} chars`;
  const budgetInfo = `${snapshot.budget.utilizationPercent}% budget used`;
  lines.push(`Pipeline: ${routedSources} → ${retrievedInfo} → ${shapedInfo} → ${budgetInfo}`);

  // Warnings (D2)
  if (snapshot.warnings.length > 0) {
    lines.push('');
    lines.push('## Warnings');
    for (const w of snapshot.warnings) {
      lines.push(`  ⚠ ${w}`);
    }
  }

  lines.push('--- End Context Snapshot ---');
  return lines.join('\n');
}

// --- Format for /sources command (condensed) ---

export function formatSources(snapshot: ContextSnapshot): string {
  if (snapshot.retrieval.snippetsSelected === 0 && !snapshot.loadout?.active) {
    return 'No sources were retrieved for the last query.';
  }

  const lines: string[] = [];
  lines.push(`Sources for: "${snapshot.query}"`);
  lines.push('');

  // Loadout gating info
  if (snapshot.loadout?.active) {
    lines.push(`Loadout: ${snapshot.loadout.allowedSources.join(', ')} (${snapshot.loadout.preloadCount} preload, ${snapshot.loadout.onDemandCount} on-demand)`);
    if (snapshot.loadout.profileInfluence) {
      lines.push(`Profile: ${snapshot.loadout.profileInfluence}`);
    }
    lines.push('');
  }

  if (snapshot.retrieval.excludedSources.length > 0) {
    lines.push(`Excluded: ${snapshot.retrieval.excludedSources.join(', ')}`);
  }
  if (snapshot.retrieval.droppedByBudget > 0) {
    lines.push(`Dropped by budget: ${snapshot.retrieval.droppedByBudget} snippet(s)`);
  }

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

// --- Loadout history (D1) ---

export type LoadoutHistoryRow = {
  timestamp: string;
  query: string;
  allowedSources: string[];
  profileName: string;
  snippetsSelected: number;
  droppedByBudget: number;
};

export function formatLoadoutHistory(entries: LoadoutHistoryRow[]): string {
  if (entries.length === 0) return 'No loadout history yet.';

  const lines: string[] = [];
  lines.push(`--- Loadout History (${entries.length} entries) ---`);
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    const time = e.timestamp.slice(11, 19); // HH:MM:SS
    const sources = e.allowedSources.join(',');
    const dropped = e.droppedByBudget > 0 ? `, ${e.droppedByBudget} dropped` : '';
    lines.push(`  ${time} [${e.profileName}] ${sources} → ${e.snippetsSelected} snippets${dropped}`);
    lines.push(`         "${e.query}"`);
  }
  lines.push('--- End Loadout History ---');
  return lines.join('\n');
}
