// Structured recommendations — composable recommendation objects.
// Every recommendation carries: code, reason, confidence, expected impact,
// dependencies, and the command/action to execute it.
// Session-aware: uses open issues + replay findings + history to rank by leverage.

import type { DesignSession, SessionIssue, SessionEvent } from './session.js';
import type { RetrievedSnippet } from './chat-rag.js';

// --- Types ---

export type RecommendationPriority = 'critical' | 'high' | 'medium' | 'low';

export type Recommendation = {
  /** Short identifier code (e.g. REC-FIX-PACING, REC-SCAFFOLD-ROOM). */
  code: string;
  /** What to do. */
  action: string;
  /** The engine command or chat intent to execute this. */
  command: string;
  /** Why this matters right now. */
  reason: string;
  /** How confident the system is in this recommendation. */
  confidence: 'high' | 'medium' | 'low';
  /** What the expected outcome is. */
  expectedImpact: string;
  /** What must be done first (recommendation codes). */
  dependencies: string[];
  /** Priority based on session context. */
  priority: RecommendationPriority;
  /** Which open issues this would address. */
  addressesIssues: string[];
  /** Leverage score: how many downstream things this unblocks. */
  leverage: number;
};

export type RecommendationSet = {
  recommendations: Recommendation[];
  /** Overall context that shaped these recommendations. */
  context: string;
  /** How many session signals contributed. */
  signalCount: number;
};

// --- Generate recommendations from session ---

export function generateRecommendations(
  session: DesignSession | null,
  ragSnippets?: RetrievedSnippet[],
): RecommendationSet {
  if (!session) {
    return {
      recommendations: [{
        code: 'REC-START-SESSION',
        action: 'Start a design session',
        command: 'session_info',
        reason: 'No active session. All design commands benefit from session context.',
        confidence: 'high',
        expectedImpact: 'Enables themed, constrained, tracked design workflow.',
        dependencies: [],
        priority: 'critical',
        addressesIssues: [],
        leverage: 10,
      }],
      context: 'No session detected.',
      signalCount: 1,
    };
  }

  const recs: Recommendation[] = [];
  let signalCount = 0;

  // --- Issue-based recommendations ---
  const openIssues = session.issues.filter(i => i.status === 'open');

  // High-severity issues → critical fix recommendations
  const highIssues = openIssues.filter(i => i.severity === 'high');
  for (const issue of highIssues) {
    signalCount++;
    const blockedBy = findBlockedIssues(issue, openIssues);
    recs.push({
      code: `REC-FIX-${issue.code}`,
      action: `Fix ${issue.target}: ${issue.summary}`,
      command: 'improve',
      reason: `High-severity issue blocks design progress${blockedBy.length > 0 ? ` and may cascade to ${blockedBy.length} other issue(s)` : ''}`,
      confidence: 'high',
      expectedImpact: `Resolves ${issue.code} on ${issue.target}${blockedBy.length > 0 ? `, potentially unblocking ${blockedBy.map(i => i.code).join(', ')}` : ''}`,
      dependencies: [],
      priority: 'critical',
      addressesIssues: [issue.code, ...blockedBy.map(i => i.code)],
      leverage: 3 + blockedBy.length * 2,
    });
  }

  // Medium-severity issues → high fix recommendations
  const medIssues = openIssues.filter(i => i.severity === 'medium');
  for (const issue of medIssues) {
    signalCount++;
    recs.push({
      code: `REC-FIX-${issue.code}`,
      action: `Address ${issue.target}: ${issue.summary}`,
      command: 'improve',
      reason: 'Medium-severity issue reduces design quality',
      confidence: 'medium',
      expectedImpact: `Improves ${issue.target} quality`,
      dependencies: highIssues.length > 0
        ? highIssues.map(i => `REC-FIX-${i.code}`)
        : [],
      priority: 'high',
      addressesIssues: [issue.code],
      leverage: 2,
    });
  }

  // --- Coverage-based recommendations ---
  const { districts, factions, quests, rooms, packs } = session.artifacts;

  // Missing core content
  if (districts.length === 0) {
    signalCount++;
    recs.push({
      code: 'REC-SCAFFOLD-DISTRICT',
      action: 'Create a district to anchor the world',
      command: 'scaffold',
      reason: 'No districts defined — districts are the structural backbone',
      confidence: 'high',
      expectedImpact: 'World gains spatial organization, enabling room and faction placement',
      dependencies: [],
      priority: districts.length === 0 && rooms.length === 0 ? 'high' : 'medium',
      addressesIssues: [],
      leverage: 4,
    });
  }

  if (factions.length === 0 && districts.length > 0) {
    signalCount++;
    recs.push({
      code: 'REC-SCAFFOLD-FACTION',
      action: 'Create a faction to populate the world',
      command: 'scaffold',
      reason: 'No factions — factions drive NPC behavior and quest motivation',
      confidence: 'high',
      expectedImpact: 'World gains social dynamics and quest hooks',
      dependencies: districts.length === 0 ? ['REC-SCAFFOLD-DISTRICT'] : [],
      priority: 'medium',
      addressesIssues: [],
      leverage: 3,
    });
  }

  if (rooms.length === 0 && districts.length > 0) {
    signalCount++;
    recs.push({
      code: 'REC-SCAFFOLD-ROOM',
      action: 'Create a room for player interaction',
      command: 'scaffold',
      reason: 'No rooms — rooms are where gameplay happens',
      confidence: 'high',
      expectedImpact: 'World gains explorable spaces',
      dependencies: districts.length === 0 ? ['REC-SCAFFOLD-DISTRICT'] : [],
      priority: 'medium',
      addressesIssues: [],
      leverage: 2,
    });
  }

  if (quests.length === 0 && factions.length > 0) {
    signalCount++;
    recs.push({
      code: 'REC-SCAFFOLD-QUEST',
      action: 'Create a quest to give players purpose',
      command: 'scaffold',
      reason: 'No quests — quests provide player motivation and narrative structure',
      confidence: 'high',
      expectedImpact: 'World gains narrative objectives',
      dependencies: factions.length === 0 ? ['REC-SCAFFOLD-FACTION'] : [],
      priority: 'medium',
      addressesIssues: [],
      leverage: 2,
    });
  }

  // --- Quality-based recommendations ---
  const history = session.history ?? [];

  // No recent critiques on content that exists
  const totalArtifacts = districts.length + factions.length + quests.length + rooms.length + packs.length;
  const critEvents = history.filter(e => e.kind === 'issue_opened');
  if (totalArtifacts > 0 && critEvents.length === 0) {
    signalCount++;
    recs.push({
      code: 'REC-CRITIQUE-CONTENT',
      action: 'Run critique on existing content to surface issues',
      command: 'critique',
      reason: `${totalArtifacts} artifact(s) exist but none have been critiqued`,
      confidence: 'high',
      expectedImpact: 'Surface design issues before they compound',
      dependencies: [],
      priority: 'high',
      addressesIssues: [],
      leverage: totalArtifacts,
    });
  }

  // No replay analysis
  const replayEvents = history.filter(e => e.kind === 'replay_compared');
  if (totalArtifacts >= 3 && replayEvents.length === 0) {
    signalCount++;
    recs.push({
      code: 'REC-ANALYZE-REPLAY',
      action: 'Run simulation and analyze replay to test world behavior',
      command: 'analyze_replay',
      reason: 'Enough content exists to simulate but no replay analysis done',
      confidence: 'medium',
      expectedImpact: 'Verify that world design produces expected simulation behavior',
      dependencies: [],
      priority: 'medium',
      addressesIssues: [],
      leverage: 2,
    });
  }

  // --- RAG-informed recommendations ---
  if (ragSnippets && ragSnippets.length > 0) {
    const transcriptSnippets = ragSnippets.filter(s => s.source === 'transcript');
    if (transcriptSnippets.length > 0) {
      signalCount++;
      // Don't generate a rec — just count the signal for context
    }
  }

  // Sort by leverage (descending), then priority
  const priorityOrder: Record<RecommendationPriority, number> = {
    critical: 0, high: 1, medium: 2, low: 3,
  };
  recs.sort((a, b) => {
    const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (pDiff !== 0) return pDiff;
    return b.leverage - a.leverage;
  });

  return {
    recommendations: recs,
    context: buildContext(session, openIssues, recs),
    signalCount,
  };
}

// --- Format for presentation ---

export function formatRecommendations(recSet: RecommendationSet, limit = 5): string {
  if (recSet.recommendations.length === 0) {
    return 'No recommendations — session looks healthy.';
  }

  const shown = recSet.recommendations.slice(0, limit);
  const lines: string[] = [];

  lines.push(`**${shown.length} recommendation(s)** (from ${recSet.signalCount} signal(s)):`);
  lines.push('');

  for (const rec of shown) {
    const deps = rec.dependencies.length > 0 ? ` (after: ${rec.dependencies.join(', ')})` : '';
    const issues = rec.addressesIssues.length > 0 ? ` → fixes: ${rec.addressesIssues.join(', ')}` : '';
    lines.push(`[${rec.priority}] ${rec.code}: ${rec.action}${deps}${issues}`);
    lines.push(`  Reason: ${rec.reason}`);
    lines.push(`  Impact: ${rec.expectedImpact} (${rec.confidence} confidence, leverage: ${rec.leverage})`);
    lines.push(`  Command: ${rec.command}`);
    lines.push('');
  }

  if (recSet.recommendations.length > limit) {
    lines.push(`... and ${recSet.recommendations.length - limit} more.`);
  }

  lines.push(recSet.context);
  return lines.join('\n');
}

// --- Internal helpers ---

function findBlockedIssues(issue: SessionIssue, allOpen: SessionIssue[]): SessionIssue[] {
  // Issues on the same target are likely related / cascading
  return allOpen.filter(i =>
    i !== issue &&
    i.target === issue.target &&
    i.severity !== 'high'
  );
}

function buildContext(
  session: DesignSession,
  openIssues: SessionIssue[],
  recs: Recommendation[],
): string {
  const parts: string[] = [];
  const totalArtifacts =
    session.artifacts.districts.length +
    session.artifacts.factions.length +
    session.artifacts.quests.length +
    session.artifacts.rooms.length +
    session.artifacts.packs.length;

  parts.push(`Session "${session.name}": ${totalArtifacts} artifact(s), ${openIssues.length} open issue(s).`);

  const fixRecs = recs.filter(r => r.addressesIssues.length > 0);
  const scaffoldRecs = recs.filter(r => r.command === 'scaffold');

  if (fixRecs.length > 0 && scaffoldRecs.length > 0) {
    parts.push(`Fix ${fixRecs.reduce((n, r) => n + r.addressesIssues.length, 0)} issue(s) first, then expand with ${scaffoldRecs.length} scaffold(s).`);
  } else if (fixRecs.length > 0) {
    parts.push(`Focus: resolve ${fixRecs.length} issue(s).`);
  } else if (scaffoldRecs.length > 0) {
    parts.push(`Focus: build out missing content.`);
  }

  return parts.join(' ');
}
