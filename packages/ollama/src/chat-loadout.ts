// Chat loadout — optional pre-retrieval routing via @mcptoolshop/ai-loadout.
// Sits between intent classification and RAG retrieval.
// Decides WHAT knowledge classes should be considered before retrieval starts.
// Gracefully degrades when ai-loadout is not installed (all sources allowed).
//
// Flow: classify intent → buildTaskString → routeContext → filter RAG sources
//
// Design rule: loadout-selected, retrieved snippets, and external web context
// are three distinct layers — never mixed.

import type { DesignSession, SessionIssue, SessionEvent } from './session.js';
import type { ChatIntent } from './chat-types.js';
import type { SourceKind } from './chat-rag.js';
import type { PersonalityProfile } from './chat-personality.js';

// --- Types ---

/** Mirrors ai-loadout LoadMode without requiring the dep at type level. */
export type ContextLoadMode = 'eager' | 'lazy' | 'manual';

/** A single routed entry — what the loadout decided about a knowledge source. */
export type RoutedEntry = {
  id: string;
  /** Why this entry was selected. */
  reason: string;
  /** Keywords/patterns that matched. */
  matchedTerms: string[];
  /** Relevance score (0-1). */
  score: number;
  /** How it should be loaded. */
  mode: ContextLoadMode;
  /** Estimated token cost. */
  tokensEst: number;
  /** Which resolver layer provided this entry. */
  layer: string;
};

/** The loadout routing plan — what sources are allowed in each tier. */
export type LoadoutRoutePlan = {
  /** Whether ai-loadout was available and produced a plan. */
  active: boolean;
  /** Sources that should be loaded immediately (core + matched domain). */
  preload: RoutedEntry[];
  /** Sources available on-demand (matched but lower priority). */
  onDemand: RoutedEntry[];
  /** Sources only available via explicit lookup. */
  manualCount: number;
  /** Which SourceKind values are allowed for RAG retrieval. */
  allowedSources: SourceKind[];
  /** Token budget summary. */
  preloadTokens: number;
  onDemandTokens: number;
  /** Which resolver layers contributed. */
  layers: string[];
  /** The task string that was sent to planLoad(). */
  taskString: string;
  /** How the personality profile influenced source selection (B2). */
  profileInfluence: string;
};

// --- Issue/finding summarization buckets (A2) ---

/** Route-friendly issue categories. Same issue set always maps to same buckets. */
export type IssueBucket =
  | 'schema'              // Schema/validation issues
  | 'rumor_flow'          // Rumor propagation or information flow issues
  | 'faction_isolation'   // Faction isolation or relationship issues
  | 'district_alert'      // District alert/stability issues
  | 'replay_regression'   // Replay-detected regressions
  | 'content_gap'         // Missing content or coverage gaps
  | 'pacing'              // Pacing or flow issues
  | 'quality';            // General quality issues

const CODE_TO_BUCKET: Record<string, IssueBucket> = {
  SCHEMA: 'schema', VALIDATION: 'schema', PARSE: 'schema', FORMAT: 'schema',
  RUMOR: 'rumor_flow', PROPAGATION: 'rumor_flow', INFO_FLOW: 'rumor_flow',
  FACTION: 'faction_isolation', TRUST: 'faction_isolation', ISOLATION: 'faction_isolation',
  DISTRICT: 'district_alert', ALERT: 'district_alert', STABILITY: 'district_alert',
  REGRESSION: 'replay_regression', DIVERGENCE: 'replay_regression', REPLAY: 'replay_regression',
  CONTENT_GAP: 'content_gap', MISSING: 'content_gap', COVERAGE: 'content_gap',
  PACING: 'pacing', FLOW: 'pacing', TEMPO: 'pacing',
  THEME: 'quality', TONE: 'quality', QUALITY: 'quality', DEPTH: 'quality',
};

/**
 * Compress issues into route-friendly buckets.
 * Deterministic: same issues always produce same buckets.
 */
export function summarizeIssueBuckets(issues: SessionIssue[]): Map<IssueBucket, number> {
  const buckets = new Map<IssueBucket, number>();
  for (const issue of issues) {
    const bucket = CODE_TO_BUCKET[issue.code] ?? 'quality';
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
  }
  return buckets;
}

/**
 * Extract recent replay findings from session history.
 */
function extractReplaySignals(history: SessionEvent[]): { verdict: string | null; categories: string[] } {
  // Find the most recent replay_compared events
  const replayEvents = history
    .filter(e => e.kind === 'replay_compared')
    .slice(-3);

  if (replayEvents.length === 0) return { verdict: null, categories: [] };

  // Extract categories from replay detail strings
  const categories = new Set<string>();
  let lastVerdict: string | null = null;
  for (const e of replayEvents) {
    const detail = e.detail.toLowerCase();
    if (detail.includes('divergence')) categories.add('divergence');
    if (detail.includes('regression')) categories.add('regression');
    if (detail.includes('pacing')) categories.add('pacing');
    if (detail.includes('faction')) categories.add('faction');
    if (detail.includes('stable')) lastVerdict = 'stable';
    else if (detail.includes('regression')) lastVerdict = 'regression';
    else if (detail.includes('divergence')) lastVerdict = 'divergence';
    else lastVerdict = 'mixed';
  }
  return { verdict: lastVerdict, categories: [...categories] };
}

/**
 * Identify recently changed artifact types from session history.
 */
function recentArtifactTypes(history: SessionEvent[]): string[] {
  const recentTypes = new Set<string>();
  // Last 10 artifact creation events
  const recent = history
    .filter(e => e.kind === 'artifact_created' || e.kind === 'content_applied')
    .slice(-10);

  for (const e of recent) {
    const detail = e.detail.toLowerCase();
    if (detail.includes('room')) recentTypes.add('room');
    if (detail.includes('faction')) recentTypes.add('faction');
    if (detail.includes('district')) recentTypes.add('district');
    if (detail.includes('quest')) recentTypes.add('quest');
    if (detail.includes('pack')) recentTypes.add('pack');
  }
  return [...recentTypes];
}

/**
 * Count stale issues — open issues not referenced in recent history.
 */
function countStaleIssues(session: DesignSession): number {
  const openIssues = session.issues.filter(i => i.status === 'open');
  const recentTargets = new Set(
    session.history.slice(-20).map(e => e.detail.toLowerCase()),
  );
  return openIssues.filter(i =>
    !recentTargets.has(i.target.toLowerCase()) &&
    !recentTargets.has(i.code.toLowerCase()),
  ).length;
}

// --- Profile bias for routing (B1) ---

/** Source emphasis by profile family. Shapes, not overrides. */
const PROFILE_SOURCE_BIAS: Record<string, SourceKind[]> = {
  analyst: ['replay', 'critique', 'decision'],
  generator: ['artifact', 'doc'],
  worldbuilder: ['artifact', 'doc', 'session', 'decision'],
  router: ['session'],
};

/**
 * Describe how the profile influenced source selection.
 * Returns a compact, deterministic explanation string.
 */
export function explainProfileInfluence(profile: PersonalityProfile, allowedSources: SourceKind[]): string {
  const bias = PROFILE_SOURCE_BIAS[profile.name.toLowerCase()];
  if (!bias) return `Profile "${profile.name}": no source bias applied`;

  const emphasized = bias.filter(s => allowedSources.includes(s));
  if (emphasized.length === 0) return `Profile "${profile.name}": bias sources [${bias.join(', ')}] not in allowed set`;

  return `Profile "${profile.name}" emphasized: ${emphasized.join(', ')}`;
}

// --- Task string builder (A1 enriched) ---

/**
 * Build a task description string for planLoad() from the chat context.
 * Combines user message, classified intent, session signals, and profile
 * into a dense routing signal.
 *
 * v1.3: intent + message + basic session counts
 * v1.4: adds issue buckets, replay signals, artifact types, stale count, profile
 */
export function buildTaskString(
  userMessage: string,
  intent: ChatIntent,
  session: DesignSession | null,
  profile?: PersonalityProfile,
): string {
  const parts: string[] = [];

  // Intent as a routing signal
  parts.push(`intent: ${intent}`);

  // Profile as a routing signal (B1)
  if (profile) {
    parts.push(`profile: ${profile.name}`);
  }

  // User message (truncated for routing efficiency)
  const truncated = userMessage.length > 200
    ? userMessage.slice(0, 200) + '…'
    : userMessage;
  parts.push(`task: ${truncated}`);

  // Session signals — structured, not raw prose
  if (session) {
    const { artifacts, issues, themes, history } = session;
    const artCount =
      artifacts.districts.length + artifacts.factions.length +
      artifacts.quests.length + artifacts.rooms.length + artifacts.packs.length;
    const openIssues = issues.filter(i => i.status === 'open');
    const themeStr = themes.slice(0, 3).join(', ');

    parts.push(`session: ${session.name} (${artCount} artifacts, ${openIssues.length} open issues, themes: ${themeStr})`);

    // Issue buckets (A2)
    if (openIssues.length > 0) {
      const buckets = summarizeIssueBuckets(openIssues);
      const bucketStr = [...buckets.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k}:${v}`)
        .join(', ');
      parts.push(`issues: ${bucketStr}`);
    }

    // Replay signals
    const replay = extractReplaySignals(history);
    if (replay.verdict) {
      const catStr = replay.categories.length > 0 ? ` [${replay.categories.join(', ')}]` : '';
      parts.push(`replay: ${replay.verdict}${catStr}`);
    }

    // Recently changed artifact types
    const recentTypes = recentArtifactTypes(history);
    if (recentTypes.length > 0) {
      parts.push(`recent: ${recentTypes.join(', ')}`);
    }

    // Stale issue count
    const stale = countStaleIssues(session);
    if (stale > 0) {
      parts.push(`stale: ${stale}`);
    }

    // Unresolved suggestion count
    if (session.acceptedSuggestions.length > 0) {
      parts.push(`suggestions: ${session.acceptedSuggestions.length}`);
    }
  }

  return parts.join(' | ');
}

// --- Source mapping ---

/**
 * Map loadout entry IDs/keywords to SourceKind values.
 * Loadout entries use patterns like "ci_pipeline", "marketing_ops".
 * We map them to the RPG engine's SourceKind vocabulary.
 */
const PATTERN_TO_SOURCES: Record<string, SourceKind[]> = {
  // Session/state patterns
  session_state: ['session'],
  session_info: ['session'],
  session_context: ['session'],

  // Content patterns
  artifact_content: ['artifact'],
  content_schema: ['artifact'],
  scaffolding: ['artifact', 'doc'],
  worldbuilding: ['artifact', 'doc'],

  // Quality/analysis patterns
  critique_analysis: ['critique', 'artifact'],
  replay_analysis: ['replay'],
  quality_check: ['critique', 'replay'],

  // Documentation patterns
  design_docs: ['doc'],
  handbook: ['doc'],
  authoring: ['doc', 'artifact'],

  // History patterns
  conversation_history: ['transcript'],
  prior_decisions: ['decision'],
  decision_log: ['decision'],
};

/**
 * Map loadout entry keywords to SourceKind values.
 */
const KEYWORD_TO_SOURCES: Record<string, SourceKind[]> = {
  session: ['session'],
  artifact: ['artifact'],
  critique: ['critique'],
  replay: ['replay'],
  transcript: ['transcript'],
  doc: ['doc'],
  decision: ['decision'],
  schema: ['artifact'],
  room: ['artifact'],
  faction: ['artifact'],
  district: ['artifact'],
  quest: ['artifact'],
  issue: ['critique'],
  analysis: ['replay', 'critique'],
  history: ['transcript', 'decision'],
};

/** All SourceKind values — used as fallback when loadout is not available. */
const ALL_SOURCES: SourceKind[] = [
  'session', 'artifact', 'critique', 'replay', 'transcript', 'doc', 'decision',
];

/**
 * Derive allowed SourceKinds from loadout entries.
 * Uses entry patterns and keywords to determine which RAG sources to enable.
 */
function deriveAllowedSources(
  entries: Array<{ patterns?: string[]; keywords?: string[]; mode: ContextLoadMode }>,
): SourceKind[] {
  const allowed = new Set<SourceKind>();

  // Core entries always include session (it's the foundation)
  allowed.add('session');

  for (const entry of entries) {
    // Map patterns
    if (entry.patterns) {
      for (const pattern of entry.patterns) {
        const sources = PATTERN_TO_SOURCES[pattern];
        if (sources) sources.forEach(s => allowed.add(s));
      }
    }

    // Map keywords
    if (entry.keywords) {
      for (const keyword of entry.keywords) {
        const sources = KEYWORD_TO_SOURCES[keyword.toLowerCase()];
        if (sources) sources.forEach(s => allowed.add(s));
      }
    }
  }

  // If nothing specific was found, allow all (safe fallback)
  if (allowed.size <= 1) return ALL_SOURCES;

  return [...allowed];
}

// --- Dynamic import wrapper ---

/**
 * Try to import @mcptoolshop/ai-loadout at runtime.
 * Returns null if not installed. Caches the result.
 */
let _loadoutModule: LoadoutModule | null | undefined;

type LoadoutModule = {
  planLoad: (task: string, opts?: { projectRoot?: string }) => {
    preload: Array<{
      entry: { id: string; keywords: string[]; patterns: string[]; tokens_est: number };
      score: number;
      matchedKeywords: string[];
      matchedPatterns: string[];
      reason: string;
      mode: string;
    }>;
    onDemand: Array<{
      entry: { id: string; keywords: string[]; patterns: string[]; tokens_est: number };
      score: number;
      matchedKeywords: string[];
      matchedPatterns: string[];
      reason: string;
      mode: string;
    }>;
    manual: Array<{ id: string }>;
    provenance: Record<string, string>;
    budget: { always_loaded_est: number; on_demand_total_est: number };
    layerNames: string[];
    preloadTokens: number;
    onDemandTokens: number;
  };
  recordLoad: (entryId: string, trigger: string, mode: string, tokensEst: number, opts?: { usagePath?: string; taskHash?: string }) => void;
};

async function tryImportLoadout(): Promise<LoadoutModule | null> {
  if (_loadoutModule !== undefined) return _loadoutModule;
  try {
    // Dynamic import — ai-loadout is an optional peer dependency
    // @ts-expect-error — module may not be installed
    const mod = await import('@mcptoolshop/ai-loadout');
    _loadoutModule = mod as unknown as LoadoutModule;
    return _loadoutModule;
  } catch {
    _loadoutModule = null;
    return null;
  }
}

// --- Route context ---

/**
 * Route context through ai-loadout if available.
 * Returns a LoadoutRoutePlan that tells the RAG layer which sources to query.
 *
 * If ai-loadout is not installed, returns a pass-through plan that allows
 * all sources (preserving existing behavior).
 *
 * v1.4: accepts optional profile for source emphasis.
 */
export async function routeContext(
  taskString: string,
  projectRoot: string,
  profile?: PersonalityProfile,
): Promise<LoadoutRoutePlan> {
  const mod = await tryImportLoadout();

  if (!mod) {
    return makePassthroughPlan(taskString, profile);
  }

  try {
    const plan = mod.planLoad(taskString, { projectRoot });

    const preload: RoutedEntry[] = plan.preload.map(m => ({
      id: m.entry.id,
      reason: m.reason,
      matchedTerms: [...m.matchedKeywords, ...m.matchedPatterns],
      score: m.score,
      mode: m.mode as ContextLoadMode,
      tokensEst: m.entry.tokens_est,
      layer: plan.provenance[m.entry.id] ?? 'unknown',
    }));

    const onDemand: RoutedEntry[] = plan.onDemand.map(m => ({
      id: m.entry.id,
      reason: m.reason,
      matchedTerms: [...m.matchedKeywords, ...m.matchedPatterns],
      score: m.score,
      mode: m.mode as ContextLoadMode,
      tokensEst: m.entry.tokens_est,
      layer: plan.provenance[m.entry.id] ?? 'unknown',
    }));

    // Derive allowed sources from preload + onDemand entries
    const routedEntries = [
      ...plan.preload.map(m => ({
        patterns: m.entry.patterns,
        keywords: m.entry.keywords,
        mode: m.mode as ContextLoadMode,
      })),
      ...plan.onDemand.map(m => ({
        patterns: m.entry.patterns,
        keywords: m.entry.keywords,
        mode: m.mode as ContextLoadMode,
      })),
    ];

    const allowedSources = applyProfileBias(
      deriveAllowedSources(routedEntries),
      profile,
    );
    const profileInfluence = profile
      ? explainProfileInfluence(profile, allowedSources)
      : '';

    return {
      active: true,
      preload,
      onDemand,
      manualCount: plan.manual.length,
      allowedSources,
      preloadTokens: plan.preloadTokens,
      onDemandTokens: plan.onDemandTokens,
      layers: plan.layerNames,
      taskString,
      profileInfluence,
    };
  } catch {
    // If planLoad fails, fall back to passthrough
    return makePassthroughPlan(taskString, profile);
  }
}

/**
 * Record that entries were loaded into context.
 * Calls ai-loadout's recordLoad() for observability tracking.
 */
export async function recordContextLoads(
  entries: RoutedEntry[],
  projectRoot: string,
  taskHash?: string,
): Promise<void> {
  const mod = await tryImportLoadout();
  if (!mod) return;

  const usagePath = `${projectRoot}/.claude/loadout-usage.jsonl`;
  for (const entry of entries) {
    const trigger = entry.matchedTerms[0] ?? entry.id;
    mod.recordLoad(entry.id, trigger, entry.mode, entry.tokensEst, {
      usagePath,
      taskHash,
    });
  }
}

// --- Passthrough plan ---

function makePassthroughPlan(taskString: string, profile?: PersonalityProfile): LoadoutRoutePlan {
  const allowedSources = applyProfileBias(ALL_SOURCES, profile);
  return {
    active: false,
    preload: [],
    onDemand: [],
    manualCount: 0,
    allowedSources,
    preloadTokens: 0,
    onDemandTokens: 0,
    layers: [],
    taskString,
    profileInfluence: profile
      ? explainProfileInfluence(profile, allowedSources)
      : '',
  };
}

/**
 * Apply profile-based source bias to an allowed source list.
 * Profile bias adds sources, never removes. It shapes emphasis, not law.
 */
function applyProfileBias(
  baseSources: SourceKind[],
  profile?: PersonalityProfile,
): SourceKind[] {
  if (!profile) return baseSources;

  const bias = PROFILE_SOURCE_BIAS[profile.name.toLowerCase()];
  if (!bias) return baseSources;

  // Add profile-biased sources that aren't already present
  const result = new Set(baseSources);
  for (const s of bias) {
    result.add(s);
  }
  return [...result];
}

// --- Format for display ---

/**
 * Format loadout routing info for /context output.
 */
export function formatLoadoutRoute(plan: LoadoutRoutePlan): string {
  if (!plan.active) {
    return 'Loadout: not active (ai-loadout not installed or no index found)';
  }

  const lines: string[] = [];
  lines.push('## Loadout Routing');
  lines.push(`  Task: "${plan.taskString.length > 100 ? plan.taskString.slice(0, 100) + '…' : plan.taskString}"`);
  lines.push(`  Layers: ${plan.layers.join(' → ') || '(none)'}`);
  lines.push(`  Allowed sources: ${plan.allowedSources.join(', ')}`);
  lines.push(`  Token budget: ${plan.preloadTokens} preload + ${plan.onDemandTokens} on-demand`);
  if (plan.profileInfluence) {
    lines.push(`  Profile: ${plan.profileInfluence}`);
  }

  if (plan.preload.length > 0) {
    lines.push('  Preload:');
    for (const e of plan.preload) {
      lines.push(`    [${e.layer}] ${e.id} (score: ${e.score.toFixed(2)}, ${e.tokensEst} tokens)`);
      lines.push(`      ${e.reason}`);
    }
  }

  if (plan.onDemand.length > 0) {
    lines.push('  On-demand:');
    for (const e of plan.onDemand) {
      lines.push(`    [${e.layer}] ${e.id} (score: ${e.score.toFixed(2)}, ${e.tokensEst} tokens)`);
      lines.push(`      ${e.reason}`);
    }
  }

  if (plan.manualCount > 0) {
    lines.push(`  Manual: ${plan.manualCount} entries available via explicit lookup`);
  }

  return lines.join('\n');
}
