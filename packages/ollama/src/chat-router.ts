// Intent router — classifies user messages into structured intents.
// Uses a combination of keyword heuristics (fast path) and LLM classification (fallback).
// The router never executes commands — it only decides what to do.

import type { OllamaTextClient } from './client.js';
import type { ChatIntent, IntentClassification } from './chat-types.js';

// --- Keyword-based fast path ---

type IntentPattern = {
  intent: ChatIntent;
  /** Any of these patterns matching means this intent. */
  patterns: RegExp[];
  /** Extract named params from the message. */
  extractParams?: (message: string) => Record<string, string>;
};

const INTENT_PATTERNS: IntentPattern[] = [
  {
    intent: 'session_info',
    patterns: [
      /\b(session|status|what('s| is) (in |my )?session|show.*(issues?|artifacts?|themes?|constraints?))\b/i,
      /\b(open issues|current session|session state)\b/i,
    ],
  },
  {
    intent: 'help',
    patterns: [
      /\b(help|what can you do|commands?|capabilities)\b/i,
      /^\/help$/i,
    ],
  },
  {
    intent: 'suggest_fixes',
    patterns: [
      /\b(suggest|recommend|propose)\s*(some\s+)?(fix|fixes|changes?|adjustments?)\b/i,
      /\bwhat should I (change|fix|adjust)\b/i,
      /^\/suggest-fixes$/i,
    ],
  },
  {
    intent: 'suggest_next',
    patterns: [
      /\b(what (should|could) I do|next step|suggest|what now)\b/i,
      /\b(what('s| is) next)\b/i,
    ],
  },
  {
    intent: 'scaffold',
    patterns: [
      /\b(create|generate|make|build|scaffold)\s+(a |an |the )?(room|faction|district|quest|location.?pack|encounter.?pack)\b/i,
    ],
    extractParams: (msg) => {
      const kindMatch = msg.match(/\b(room|faction|district|quest|location.?pack|encounter.?pack)\b/i);
      const themeMatch = msg.match(/(?:about|for|themed?|called|named)\s+"?([^"]+)"?$/i)
        ?? msg.match(/(?:create|generate|make|build)\s+(?:a |an |the )?(?:room|faction|district|quest|location.?pack|encounter.?pack)\s+(.+)/i);
      return {
        ...(kindMatch ? { kind: kindMatch[1].toLowerCase().replace(/\s+/g, '-') } : {}),
        ...(themeMatch ? { theme: themeMatch[1].trim() } : {}),
      };
    },
  },
  {
    intent: 'build_goal',
    patterns: [
      /\bbuild\s+(?:a |an |the )?(?!(?:room|faction|district|quest|location.?pack|encounter.?pack)\b)\w+/i,
      /^\/build\s+/i,
    ],
    extractParams: (msg) => {
      const goalMatch = msg.match(/(?:\/build|build)\s+(?:a |an |the )?(.+)/i);
      const params: Record<string, string> = {};
      if (goalMatch) params.goal = goalMatch[1].trim();
      return params;
    },
  },
  {
    intent: 'analyze_balance',
    patterns: [
      /\b(analyze|analyse|check|assess)\s*(the\s+)?(balance|balancing)\b/i,
      /^\/analyze-balance$/i,
    ],
  },
  {
    intent: 'compare_intent',
    patterns: [
      /\b(compare|check)\s*(design\s+)?intent\b/i,
      /\bintent\s+vs\s+(outcome|result|replay)\b/i,
      /^\/compare-intent$/i,
    ],
  },
  {
    intent: 'analyze_window',
    patterns: [
      /\b(analyze|analyse)\s*(tick|window|phase)\b/i,
      /\bticks?\s+\d+\s*[-–]\s*\d+\b/i,
      /^\/analyze-window\b/i,
    ],
    extractParams: (msg) => {
      const rangeMatch = msg.match(/ticks?\s+(\d+)\s*[-–]\s*(\d+)/i);
      const focusMatch = msg.match(/(?:focus|about|for)\s+(.+)/i);
      const params: Record<string, string> = {};
      if (rangeMatch) {
        params.startTick = rangeMatch[1];
        params.endTick = rangeMatch[2];
      }
      if (focusMatch) params.focus = focusMatch[1].trim();
      return params;
    },
  },
  {
    intent: 'compare_scenarios',
    patterns: [
      /\bcompare\s*(the\s+)?(scenario|revision|version)s?\b/i,
      /\bdid\s+the\s+revision\s+(help|improve|work)\b/i,
      /^\/compare-scenarios$/i,
    ],
  },
  {
    intent: 'tune_goal',
    patterns: [
      /\btune\s+(?:the\s+)?(?!plan\b|status\b|preview\b)\w+/i,
      /^\/tune\s+/i,
    ],
    extractParams: (msg) => {
      const goalMatch = msg.match(/(?:\/tune|tune)\s+(?:the\s+)?(.+)/i);
      const params: Record<string, string> = {};
      if (goalMatch) params.goal = goalMatch[1].trim();
      return params;
    },
  },
  {
    intent: 'tune_preview',
    patterns: [
      /\b(preview|show)\s+(the\s+)?(tuning|patch|config)\s*(changes?|patches?|plan)?\b/i,
      /\btune[\s-]*preview\b/i,
      /\bwhat will change\b/i,
      /^\/tune-preview$/i,
    ],
  },
  {
    intent: 'tune_apply',
    patterns: [
      /\b(apply|confirm)\s+(the\s+)?(tuning|patch|config)\s*(changes?|patches?)?\b/i,
      /\btune[\s-]*apply\b/i,
      /^\/tune-apply$/i,
    ],
  },
  {
    intent: 'tune_bundles',
    patterns: [
      /\b(show|list|create|view)\s+(the\s+)?(fix\s+)?bundles?\b/i,
      /\bbundle\s+(the\s+)?fix(es)?\b/i,
      /\bfix\s+bundles?\b/i,
      /^\/tune-bundles$/i,
    ],
  },
  {
    intent: 'experiment_run',
    patterns: [
      /\b(run|execute)\s+(this\s+)?(district|scenario|experiment|simulation)\s+\d+\s+times\b/i,
      /\bexperiment\s+run\b/i,
      /\brun\s+(\d+)\s+(experiments?|simulations?|replays?)\b/i,
      /^\/experiment-run\b/i,
      /^\/experiment\s+run\b/i,
    ],
    extractParams: (msg) => {
      const runsMatch = msg.match(/(\d+)\s+times\b/i) ?? msg.match(/run\s+(\d+)/i);
      const params: Record<string, string> = {};
      if (runsMatch) params.runs = runsMatch[1];
      const labelMatch = msg.match(/(?:--label|label[=:]?)\s*(\S+)/i);
      if (labelMatch) params.label = labelMatch[1];
      return params;
    },
  },
  {
    intent: 'experiment_sweep',
    patterns: [
      /\bsweep\s+\w+/i,
      /\bexperiment\s+sweep\b/i,
      /\bparameter\s+sweep\b/i,
      /^\/experiment-sweep\b/i,
      /^\/experiment\s+sweep\b/i,
    ],
    extractParams: (msg) => {
      const paramMatch = msg.match(/sweep\s+(\w+)/i);
      const fromMatch = msg.match(/(?:from|--from)\s+([\d.]+)/i);
      const toMatch = msg.match(/(?:to|--to)\s+([\d.]+)/i);
      const stepMatch = msg.match(/(?:step|--step)\s+([\d.]+)/i);
      const runsMatch = msg.match(/(?:--runs)\s+(\d+)/i);
      const params: Record<string, string> = {};
      if (paramMatch) params.param = paramMatch[1];
      if (fromMatch) params.from = fromMatch[1];
      if (toMatch) params.to = toMatch[1];
      if (stepMatch) params.step = stepMatch[1];
      if (runsMatch) params.runs = runsMatch[1];
      return params;
    },
  },
  {
    intent: 'experiment_compare',
    patterns: [
      /\bexperiment\s+compare\b/i,
      /\bcompare\s+(the\s+)?(experiments?|batche?s?|baselines?.*tuned)\b/i,
      /\bcompare\s+tuned\b/i,
      /^\/experiment-compare\b/i,
      /^\/experiment\s+compare\b/i,
    ],
  },
  {
    intent: 'experiment_plan',
    patterns: [
      /\bexperiment\s+plan\b/i,
      /\bplan\s+(an?\s+)?experiment\b/i,
      /^\/experiment-plan\b/i,
      /^\/experiment\s+plan\b/i,
    ],
    extractParams: (msg) => {
      const goalMatch = msg.match(/experiment\s+plan\s+(.+)/i) ?? msg.match(/plan\s+(?:an?\s+)?experiment\s*(?:for|about|:)?\s*(.+)/i);
      const params: Record<string, string> = {};
      if (goalMatch) params.goal = (goalMatch[1] ?? goalMatch[2] ?? '').trim();
      return params;
    },
  },
  {
    intent: 'studio_status',
    patterns: [
      /^\/(studio|dashboard|dash)\b/i,
      /\b(studio|dashboard)\s*(status|overview|summary)?\b/i,
      /\bshow\s+(me\s+)?the\s+(studio|dashboard)\b/i,
    ],
  },
  {
    intent: 'studio_history',
    patterns: [
      /^\/history\b/i,
      /\b(session|event)\s+history\b/i,
      /\bshow\s+(me\s+)?(the\s+)?history\b/i,
      /\brecent\s+events?\b/i,
    ],
  },
  {
    intent: 'studio_issues',
    patterns: [
      /^\/issues\b/i,
      /\b(open|all)\s+issues\b/i,
      /\bshow\s+(me\s+)?(the\s+)?issues\b/i,
      /\bissue\s+(list|browser|overview)\b/i,
    ],
  },
  {
    intent: 'studio_findings',
    patterns: [
      /^\/findings\b/i,
      /\b(balance|experiment)\s+findings\b/i,
      /\bshow\s+(me\s+)?(the\s+)?findings\b/i,
      /\bfinding\s+(list|browser|overview)\b/i,
    ],
  },
  {
    intent: 'studio_experiments',
    patterns: [
      /^\/experiments\b/i,
      /\blist\s+experiments\b/i,
      /\bshow\s+(me\s+)?(the\s+)?experiments\b/i,
      /\bexperiment\s+(list|browser|overview|results?)\b/i,
    ],
  },
  {
    intent: 'critique',
    patterns: [
      /\b(critique|review|check|evaluate|assess)\s+(this|the|my)?\s*(content|room|faction|district|quest|pack|yaml)?\b/i,
    ],
  },
  {
    intent: 'improve',
    patterns: [
      /\b(improve|fix|revise|refine|polish|enhance|make.+better)\b/i,
    ],
    extractParams: (msg) => {
      const goalMatch = msg.match(/\b(?:improve|fix|revise|refine|polish|enhance)\s+(.+)/i);
      const params: Record<string, string> = {};
      if (goalMatch) params.goal = goalMatch[1].trim();
      return params;
    },
  },
  {
    intent: 'compare_replays',
    patterns: [
      /\b(compare).*\b(replay|simulation|run)\b/i,
      /\b(before|after).*\b(replay|run|simulation)\b/i,
    ],
  },
  {
    intent: 'analyze_replay',
    patterns: [
      /\b(analyze|analyse).*\b(replay|simulation|run)\b/i,
    ],
  },
  {
    intent: 'plan',
    patterns: [
      /\b(plan|design|architect|layout)\s+(a |an |the )?(district|area|zone|world|region)\b/i,
    ],
    extractParams: (msg) => {
      const themeMatch = msg.match(/(?:plan|design|architect)\s+(?:a |an |the )?\w+\s+(.+)/i);
      const params: Record<string, string> = {};
      if (themeMatch) params.theme = themeMatch[1].trim();
      return params;
    },
  },
  {
    intent: 'explain_why',
    patterns: [
      /\bwhy\s+(did|do|does|is|are|was|were|hasn't|haven't|won't|can't|didn't)\b/i,
    ],
    extractParams: (msg) => ({ question: msg }),
  },
  {
    intent: 'explain_state',
    patterns: [
      /\b(explain|describe|tell me about|what('s| is) (happening|going on|the state))\b/i,
      /\bunstable|broken|weird|wrong\b/i,
    ],
  },
  {
    intent: 'context_info',
    patterns: [
      /^\/(context|sources)$/i,
      /\b(what context|what sources|what('s| are) (you|chat) (using|relying|basing)|show.*(context|sources))\b/i,
    ],
  },
  {
    intent: 'show_plan',
    patterns: [
      /^\/(plan|smartplan)$/i,
      /\b(make|build|create|show|give) (me )?(a |the )?(smart )?plan\b/i,
      /\bwhat('s| is) the plan\b/i,
    ],
  },
  {
    intent: 'recommend',
    patterns: [
      /^\/(recommend|recs?)$/i,
      /\b(what should I prioritize|top priorities|highest.?leverage)\b/i,
      /\bgive.+recommendations?\b/i,
    ],
  },
  {
    intent: 'apply_content',
    patterns: [
      /\b(write|save|apply|commit)\s+(this|it|the|that)\b/i,
      /\b(write to|save to|apply to)\s+(disk|file)\b/i,
    ],
    extractParams: (msg) => {
      const pathMatch = msg.match(/(?:to|at|in)\s+(\S+\.ya?ml)\b/i);
      const params: Record<string, string> = {};
      if (pathMatch) params.targetPath = pathMatch[1];
      return params;
    },
  },
];

/**
 * Fast keyword-based intent classification.
 * Returns null if no pattern matches (fallback to LLM).
 */
export function classifyByKeywords(message: string): IntentClassification | null {
  const trimmed = message.trim();
  if (!trimmed) return null;

  for (const pattern of INTENT_PATTERNS) {
    if (pattern.patterns.some(p => p.test(trimmed))) {
      const params = pattern.extractParams?.(trimmed) ?? {};
      return {
        intent: pattern.intent,
        confidence: 'high',
        params,
      };
    }
  }
  return null;
}

// --- LLM-based fallback ---

const CLASSIFY_SYSTEM = `You are a command router for a game world design tool.
Classify the user's message into exactly ONE intent. Respond with ONLY a JSON object.

Valid intents:
- suggest_next: user wants recommendations on what to do next
- explain_state: user wants to understand current state of artifacts/simulation
- scaffold: user wants to generate new content (room, faction, district, quest, pack)
- critique: user wants content reviewed
- improve: user wants existing content improved/revised
- compare_replays: user wants to compare simulation runs
- analyze_replay: user wants a replay analyzed
- plan: user wants a multi-step design plan
- explain_why: user asks a causal "why" question about simulation behavior
- session_info: user asks about session status, artifacts, issues
- apply_content: user wants to write/save content to disk
- help: user asks what the tool can do
- context_info: user asks what context/sources chat is using
- show_plan: user wants a smart action plan based on session state
- recommend: user wants prioritized recommendations
- build_goal: user wants to build a complete scenario, district, or faction network from a high-level goal
- analyze_balance: user wants balance analysis of replay data (difficulty, pacing, escalation)
- compare_intent: user wants to compare design intent vs actual simulation outcomes
- analyze_window: user wants to analyze a specific tick range or phase in replay data
- suggest_fixes: user wants suggested fixes or adjustments based on analysis findings
- compare_scenarios: user wants to compare two scenario revisions to see if changes helped
- tune_goal: user wants a guided tuning plan to adjust world behavior (e.g. "tune increase paranoia")
- experiment_run: user wants to run a deterministic experiment batch (e.g. "run this district 50 times")
- experiment_sweep: user wants to sweep a parameter across a range (e.g. "sweep rumor clarity from 0.4 to 0.8")
- experiment_compare: user wants to compare two experiment results (baseline vs tuned)
- experiment_plan: user wants to plan an experiment workflow
- unknown: can't determine intent

Response format (JSON only, no markdown):
{"intent":"<intent>","params":{"theme":"...","kind":"...","goal":"...","question":"..."}}

Only include params that are clearly stated. Do not invent params.`;

export async function classifyByLLM(
  client: OllamaTextClient,
  message: string,
): Promise<IntentClassification> {
  const result = await client.generate({
    system: CLASSIFY_SYSTEM,
    prompt: message,
  });

  if (!result.ok) {
    return { intent: 'unknown', confidence: 'low', params: {} };
  }

  try {
    // Extract JSON from response (may have surrounding text)
    // Use balanced-brace matching for nested objects like {"params":{...}}
    const start = result.text.indexOf('{');
    const end = result.text.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      return { intent: 'unknown', confidence: 'low', params: {} };
    }
    const jsonStr = result.text.slice(start, end + 1);
    const parsed = JSON.parse(jsonStr) as { intent?: string; params?: Record<string, string> };
    const validIntents: ChatIntent[] = [
      'suggest_next', 'explain_state', 'scaffold', 'critique', 'improve',
      'compare_replays', 'analyze_replay', 'plan', 'explain_why',
      'session_info', 'apply_content', 'help', 'context_info',
      'show_plan', 'recommend', 'build_goal',
      'analyze_balance', 'compare_intent', 'analyze_window',
      'suggest_fixes', 'compare_scenarios', 'tune_goal',
      'experiment_run', 'experiment_sweep', 'experiment_compare', 'experiment_plan',
      'studio_status', 'studio_history', 'studio_issues', 'studio_findings', 'studio_experiments',
      'unknown',
    ];
    const intent = validIntents.includes(parsed.intent as ChatIntent)
      ? parsed.intent as ChatIntent
      : 'unknown';

    return {
      intent,
      confidence: 'medium',
      params: parsed.params && typeof parsed.params === 'object' ? parsed.params : {},
    };
  } catch {
    return { intent: 'unknown', confidence: 'low', params: {} };
  }
}

/**
 * Classify intent: fast keyword path first, LLM fallback second.
 */
export async function classifyIntent(
  client: OllamaTextClient,
  message: string,
): Promise<IntentClassification> {
  const fast = classifyByKeywords(message);
  if (fast) return fast;
  return classifyByLLM(client, message);
}
