// Parsers — extract structured content from LLM output

/**
 * Extract a YAML block from model output.
 * Strips markdown fences if present, returns raw text otherwise.
 */
export function extractYaml(raw: string): string {
  // Try fenced block first
  const fenced = /```(?:ya?ml)?\s*\n([\s\S]*?)```/.exec(raw);
  if (fenced) return fenced[1].trim();

  // Strip any leading prose before the first YAML-looking line
  const lines = raw.split('\n');
  const start = lines.findIndex((l) => /^\s*\w[\w-]*\s*:/.test(l));
  if (start >= 0) return lines.slice(start).join('\n').trim();

  return raw.trim();
}

/**
 * Extract a JSON block from model output.
 * Strips markdown fences if present, attempts raw parse otherwise.
 */
export function extractJson(raw: string): string {
  const fenced = /```(?:json)?\s*\n([\s\S]*?)```/.exec(raw);
  if (fenced) return fenced[1].trim();

  // Find the first { or [ and take everything to the matching close
  const objStart = raw.indexOf('{');
  const arrStart = raw.indexOf('[');
  let start: number;
  let open: string;
  let close: string;

  if (objStart >= 0 && (arrStart < 0 || objStart < arrStart)) {
    start = objStart;
    open = '{';
    close = '}';
  } else if (arrStart >= 0) {
    start = arrStart;
    open = '[';
    close = ']';
  } else {
    return raw.trim();
  }

  let depth = 0;
  for (let i = start; i < raw.length; i++) {
    if (raw[i] === open) depth++;
    else if (raw[i] === close) depth--;
    if (depth === 0) return raw.slice(start, i + 1);
  }

  return raw.slice(start);
}

/**
 * Extract plain text — strip markdown fences if wrapped in one.
 */
export function extractText(raw: string): string {
  const fenced = /```\w*\s*\n([\s\S]*?)```/.exec(raw);
  if (fenced) return fenced[1].trim();
  return raw.trim();
}

// --- Structured critique types ---

export type CritiqueIssue = {
  code: string;
  severity: 'low' | 'medium' | 'high';
  location: string;
  summary: string;
  simulation_impact: string;
};

export type CritiqueSuggestion = {
  code: string;
  priority: 'low' | 'medium' | 'high';
  action: string;
};

export type StructuredCritique = {
  issues: CritiqueIssue[];
  suggestions: CritiqueSuggestion[];
  summary: string;
};

/**
 * Parse structured critique output from dual-format model response.
 * Returns the prose text and a structured findings object.
 * Gracefully degrades: if no YAML block is found, returns empty structured data.
 */
export function parseCritiqueOutput(raw: string): {
  prose: string;
  structured: StructuredCritique;
} {
  // Find the YAML fenced block
  const fenceMatch = /```(?:ya?ml)?\s*\n([\s\S]*?)```/.exec(raw);

  if (!fenceMatch) {
    return {
      prose: raw.trim(),
      structured: { issues: [], suggestions: [], summary: '' },
    };
  }

  // Prose = everything before the fence
  const prose = raw.slice(0, fenceMatch.index).trim();
  const yamlBlock = fenceMatch[1].trim();

  // Parse the YAML block using the inline parser
  const structured = parseStructuredCritiqueYaml(yamlBlock);

  return { prose, structured };
}

function parseStructuredCritiqueYaml(text: string): StructuredCritique {
  // Try JSON first (some models emit JSON inside YAML fences)
  try {
    const parsed = JSON.parse(text);
    return normalizeStructuredCritique(parsed);
  } catch { /* not JSON */ }

  // Minimal state-machine parser for the critique YAML shape
  const result: StructuredCritique = { issues: [], suggestions: [], summary: '' };
  const lines = text.split('\n');

  let section: 'none' | 'issues' | 'suggestions' | 'summary' = 'none';
  let currentItem: Record<string, string> = {};
  let inItem = false;

  for (const line of lines) {
    const trimmed = line.trimEnd();

    // Top-level section headers
    if (/^issues:\s*$/.test(trimmed)) {
      if (inItem && section === 'suggestions') flushSuggestion(result, currentItem);
      if (inItem && section === 'issues') flushIssue(result, currentItem);
      section = 'issues';
      currentItem = {};
      inItem = false;
      continue;
    }
    if (/^suggestions:\s*$/.test(trimmed)) {
      if (inItem && section === 'issues') flushIssue(result, currentItem);
      if (inItem && section === 'suggestions') flushSuggestion(result, currentItem);
      section = 'suggestions';
      currentItem = {};
      inItem = false;
      continue;
    }
    if (/^summary:\s*(.*)$/.test(trimmed)) {
      if (inItem && section === 'issues') flushIssue(result, currentItem);
      if (inItem && section === 'suggestions') flushSuggestion(result, currentItem);
      const match = /^summary:\s*>?\s*$/.exec(trimmed);
      if (match) {
        section = 'summary';
        continue;
      }
      // Inline summary
      const inline = /^summary:\s*>?\s*(.+)$/.exec(trimmed);
      if (inline) {
        result.summary = inline[1].trim();
        section = 'summary';
        continue;
      }
    }

    // Summary continuation lines
    if (section === 'summary' && trimmed.startsWith('  ')) {
      result.summary += (result.summary ? ' ' : '') + trimmed.trim();
      continue;
    }

    // List item start (- code: ...)
    if ((section === 'issues' || section === 'suggestions') && /^\s+-\s+\w+:/.test(trimmed)) {
      if (inItem) {
        if (section === 'issues') flushIssue(result, currentItem);
        else flushSuggestion(result, currentItem);
      }
      currentItem = {};
      inItem = true;
      const kv = /^\s+-\s+(\w[\w_]*)\s*:\s*(.*)$/.exec(trimmed);
      if (kv) currentItem[kv[1]] = kv[2].trim();
      continue;
    }

    // Continuation fields within a list item
    if (inItem && /^\s{4,}\w[\w_]*\s*:/.test(trimmed)) {
      const kv = /^\s+(\w[\w_]*)\s*:\s*(.*)$/.exec(trimmed);
      if (kv) currentItem[kv[1]] = kv[2].trim();
    }
  }

  // Flush last item
  if (inItem && section === 'issues') flushIssue(result, currentItem);
  if (inItem && section === 'suggestions') flushSuggestion(result, currentItem);

  return result;
}

function flushIssue(result: StructuredCritique, item: Record<string, string>): void {
  if (!item['code']) return;
  const severity = (['low', 'medium', 'high'] as const).includes(item['severity'] as 'low' | 'medium' | 'high')
    ? item['severity'] as 'low' | 'medium' | 'high'
    : 'medium';
  result.issues.push({
    code: item['code'],
    severity,
    location: item['location'] ?? '',
    summary: item['summary'] ?? '',
    simulation_impact: item['simulation_impact'] ?? '',
  });
}

function flushSuggestion(result: StructuredCritique, item: Record<string, string>): void {
  if (!item['code']) return;
  const priority = (['low', 'medium', 'high'] as const).includes(item['priority'] as 'low' | 'medium' | 'high')
    ? item['priority'] as 'low' | 'medium' | 'high'
    : 'medium';
  result.suggestions.push({
    code: item['code'],
    priority,
    action: item['action'] ?? '',
  });
}

function normalizeStructuredCritique(obj: Record<string, unknown>): StructuredCritique {
  const result: StructuredCritique = { issues: [], suggestions: [], summary: '' };

  if (typeof obj['summary'] === 'string') result.summary = obj['summary'];

  if (Array.isArray(obj['issues'])) {
    for (const item of obj['issues']) {
      if (item && typeof item === 'object' && 'code' in item) {
        const i = item as Record<string, string>;
        flushIssue(result, i);
      }
    }
  }

  if (Array.isArray(obj['suggestions'])) {
    for (const item of obj['suggestions']) {
      if (item && typeof item === 'object' && 'code' in item) {
        const s = item as Record<string, string>;
        flushSuggestion(result, s);
      }
    }
  }

  return result;
}

// --- Guided design types ---

export type NextAction = {
  priority: 'low' | 'medium' | 'high';
  command: string;
  reason: string;
};

export type GuidedSuggestions = {
  actions: NextAction[];
  summary: string;
};

/**
 * Parse suggest-next output: prose + YAML block with actions[] and summary.
 */
export function parseSuggestNextOutput(raw: string): {
  prose: string;
  structured: GuidedSuggestions;
} {
  const fenceMatch = /```(?:ya?ml)?\s*\n([\s\S]*?)```/.exec(raw);

  if (!fenceMatch) {
    return { prose: raw.trim(), structured: { actions: [], summary: '' } };
  }

  const prose = raw.slice(0, fenceMatch.index).trim();
  const yamlBlock = fenceMatch[1].trim();
  const structured = parseSuggestNextYaml(yamlBlock);

  return { prose, structured };
}

function parseSuggestNextYaml(text: string): GuidedSuggestions {
  try {
    const parsed = JSON.parse(text);
    return normalizeGuidedSuggestions(parsed);
  } catch { /* not JSON */ }

  const result: GuidedSuggestions = { actions: [], summary: '' };
  const lines = text.split('\n');

  let section: 'none' | 'actions' | 'summary' = 'none';
  let currentItem: Record<string, string> = {};
  let inItem = false;

  for (const line of lines) {
    const trimmed = line.trimEnd();

    if (/^actions:\s*$/.test(trimmed)) {
      if (inItem) flushAction(result, currentItem);
      section = 'actions';
      currentItem = {};
      inItem = false;
      continue;
    }
    if (/^summary:\s*(.*)$/.test(trimmed) && !trimmed.startsWith(' ')) {
      if (inItem) flushAction(result, currentItem);
      const inline = /^summary:\s*>?\s*(.+)$/.exec(trimmed);
      if (inline) result.summary = inline[1].trim();
      section = 'summary';
      inItem = false;
      continue;
    }

    if (section === 'summary' && trimmed.startsWith('  ')) {
      result.summary += (result.summary ? ' ' : '') + trimmed.trim();
      continue;
    }

    if (section === 'actions' && /^\s+-\s+\w+:/.test(trimmed)) {
      if (inItem) flushAction(result, currentItem);
      currentItem = {};
      inItem = true;
      const kv = /^\s+-\s+(\w[\w_]*)\s*:\s*(.*)$/.exec(trimmed);
      if (kv) currentItem[kv[1]] = unquote(kv[2]);
      continue;
    }

    if (inItem && /^\s{4,}\w[\w_]*\s*:/.test(trimmed)) {
      const kv = /^\s+(\w[\w_]*)\s*:\s*(.*)$/.exec(trimmed);
      if (kv) currentItem[kv[1]] = unquote(kv[2]);
    }
  }

  if (inItem) flushAction(result, currentItem);
  return result;
}

function flushAction(result: GuidedSuggestions, item: Record<string, string>): void {
  if (!item['command']) return;
  const priority = (['low', 'medium', 'high'] as const).includes(item['priority'] as 'low' | 'medium' | 'high')
    ? item['priority'] as 'low' | 'medium' | 'high'
    : 'medium';
  result.actions.push({
    priority,
    command: item['command'],
    reason: item['reason'] ?? '',
  });
}

function normalizeGuidedSuggestions(obj: Record<string, unknown>): GuidedSuggestions {
  const result: GuidedSuggestions = { actions: [], summary: '' };
  if (typeof obj['summary'] === 'string') result.summary = obj['summary'];
  if (Array.isArray(obj['actions'])) {
    for (const item of obj['actions']) {
      if (item && typeof item === 'object' && 'command' in item) {
        flushAction(result, item as Record<string, string>);
      }
    }
  }
  return result;
}

// --- Design plan types ---

export type PlanStep = {
  order: number;
  command: string;
  produces: string;
  description: string;
  dependsOn: number[];
};

export type DesignPlan = {
  steps: PlanStep[];
  rationale: string;
};

/**
 * Parse plan-district output: prose + YAML block with steps[] and rationale.
 */
export function parsePlanOutput(raw: string): {
  prose: string;
  structured: DesignPlan;
} {
  const fenceMatch = /```(?:ya?ml)?\s*\n([\s\S]*?)```/.exec(raw);

  if (!fenceMatch) {
    return { prose: raw.trim(), structured: { steps: [], rationale: '' } };
  }

  const prose = raw.slice(0, fenceMatch.index).trim();
  const yamlBlock = fenceMatch[1].trim();
  const structured = parsePlanYaml(yamlBlock);

  return { prose, structured };
}

function parsePlanYaml(text: string): DesignPlan {
  try {
    const parsed = JSON.parse(text);
    return normalizePlan(parsed);
  } catch { /* not JSON */ }

  const result: DesignPlan = { steps: [], rationale: '' };
  const lines = text.split('\n');

  let section: 'none' | 'steps' | 'rationale' = 'none';
  let currentItem: Record<string, string> = {};
  let inItem = false;

  for (const line of lines) {
    const trimmed = line.trimEnd();

    if (/^steps:\s*$/.test(trimmed)) {
      if (inItem) flushStep(result, currentItem);
      section = 'steps';
      currentItem = {};
      inItem = false;
      continue;
    }
    if (/^rationale:\s*(.*)$/.test(trimmed)) {
      if (inItem) flushStep(result, currentItem);
      const inline = /^rationale:\s*>?\s*(.+)$/.exec(trimmed);
      if (inline) result.rationale = inline[1].trim();
      section = 'rationale';
      inItem = false;
      continue;
    }

    if (section === 'rationale' && trimmed.startsWith('  ')) {
      result.rationale += (result.rationale ? ' ' : '') + trimmed.trim();
      continue;
    }

    if (section === 'steps' && /^\s+-\s+\w+:/.test(trimmed)) {
      if (inItem) flushStep(result, currentItem);
      currentItem = {};
      inItem = true;
      const kv = /^\s+-\s+(\w[\w_]*)\s*:\s*(.*)$/.exec(trimmed);
      if (kv) currentItem[kv[1]] = unquote(kv[2]);
      continue;
    }

    if (inItem && /^\s{4,}\w[\w_]*\s*:/.test(trimmed)) {
      const kv = /^\s+(\w[\w_]*)\s*:\s*(.*)$/.exec(trimmed);
      if (kv) currentItem[kv[1]] = unquote(kv[2]);
    }
  }

  if (inItem) flushStep(result, currentItem);
  return result;
}

function flushStep(result: DesignPlan, item: Record<string, string>): void {
  if (!item['command']) return;
  const order = parseInt(item['order'] ?? '0', 10) || result.steps.length + 1;
  const dependsOn = item['dependsOn']
    ? item['dependsOn'].replace(/[\[\]]/g, '').split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
    : [];
  result.steps.push({
    order,
    command: item['command'],
    produces: item['produces'] ?? '',
    description: item['description'] ?? '',
    dependsOn,
  });
}

function normalizePlan(obj: Record<string, unknown>): DesignPlan {
  const result: DesignPlan = { steps: [], rationale: '' };
  if (typeof obj['rationale'] === 'string') result.rationale = obj['rationale'];
  if (Array.isArray(obj['steps'])) {
    for (const item of obj['steps']) {
      if (item && typeof item === 'object' && 'command' in item) {
        flushStep(result, item as Record<string, string>);
      }
    }
  }
  return result;
}

// --- Replay comparison types ---

export type ReplayChange = {
  area: string;
  description: string;
};

export type ReplayComparison = {
  improvements: ReplayChange[];
  regressions: ReplayChange[];
  unchanged: ReplayChange[];
  verdict: string;
  summary: string;
};

/**
 * Parse compare-replays output: prose + YAML block with improvements/regressions/unchanged.
 */
export function parseCompareOutput(raw: string): {
  prose: string;
  structured: ReplayComparison;
} {
  const fenceMatch = /```(?:ya?ml)?\s*\n([\s\S]*?)```/.exec(raw);

  if (!fenceMatch) {
    return {
      prose: raw.trim(),
      structured: { improvements: [], regressions: [], unchanged: [], verdict: 'neutral', summary: '' },
    };
  }

  const prose = raw.slice(0, fenceMatch.index).trim();
  const yamlBlock = fenceMatch[1].trim();
  const structured = parseCompareYaml(yamlBlock);

  return { prose, structured };
}

function parseCompareYaml(text: string): ReplayComparison {
  try {
    const parsed = JSON.parse(text);
    return normalizeComparison(parsed);
  } catch { /* not JSON */ }

  const result: ReplayComparison = {
    improvements: [],
    regressions: [],
    unchanged: [],
    verdict: 'neutral',
    summary: '',
  };
  const lines = text.split('\n');

  let section: 'none' | 'improvements' | 'regressions' | 'unchanged' | 'verdict' | 'summary' = 'none';
  let currentItem: Record<string, string> = {};
  let inItem = false;

  for (const line of lines) {
    const trimmed = line.trimEnd();

    if (/^improvements:\s*$/.test(trimmed)) {
      if (inItem) flushChange(result, section as 'improvements' | 'regressions' | 'unchanged', currentItem);
      section = 'improvements';
      currentItem = {};
      inItem = false;
      continue;
    }
    if (/^regressions:\s*$/.test(trimmed)) {
      if (inItem) flushChange(result, section as 'improvements' | 'regressions' | 'unchanged', currentItem);
      section = 'regressions';
      currentItem = {};
      inItem = false;
      continue;
    }
    if (/^unchanged:\s*$/.test(trimmed)) {
      if (inItem) flushChange(result, section as 'improvements' | 'regressions' | 'unchanged', currentItem);
      section = 'unchanged';
      currentItem = {};
      inItem = false;
      continue;
    }
    if (/^verdict:\s*(.+)$/.test(trimmed)) {
      if (inItem) flushChange(result, section as 'improvements' | 'regressions' | 'unchanged', currentItem);
      const match = /^verdict:\s*(.+)$/.exec(trimmed);
      if (match) result.verdict = match[1].trim();
      inItem = false;
      continue;
    }
    if (/^summary:\s*(.*)$/.test(trimmed)) {
      if (inItem) flushChange(result, section as 'improvements' | 'regressions' | 'unchanged', currentItem);
      const inline = /^summary:\s*>?\s*(.+)$/.exec(trimmed);
      if (inline) result.summary = inline[1].trim();
      section = 'summary';
      inItem = false;
      continue;
    }

    if (section === 'summary' && trimmed.startsWith('  ')) {
      result.summary += (result.summary ? ' ' : '') + trimmed.trim();
      continue;
    }

    if ((section === 'improvements' || section === 'regressions' || section === 'unchanged') &&
      /^\s+-\s+\w+:/.test(trimmed)) {
      if (inItem) flushChange(result, section, currentItem);
      currentItem = {};
      inItem = true;
      const kv = /^\s+-\s+(\w[\w_]*)\s*:\s*(.*)$/.exec(trimmed);
      if (kv) currentItem[kv[1]] = unquote(kv[2]);
      continue;
    }

    if (inItem && /^\s{4,}\w[\w_]*\s*:/.test(trimmed)) {
      const kv = /^\s+(\w[\w_]*)\s*:\s*(.*)$/.exec(trimmed);
      if (kv) currentItem[kv[1]] = unquote(kv[2]);
    }
  }

  if (inItem && (section === 'improvements' || section === 'regressions' || section === 'unchanged')) {
    flushChange(result, section, currentItem);
  }
  return result;
}

function flushChange(
  result: ReplayComparison,
  section: 'improvements' | 'regressions' | 'unchanged',
  item: Record<string, string>,
): void {
  if (!item['area'] && !item['description']) return;
  result[section].push({
    area: item['area'] ?? '',
    description: item['description'] ?? '',
  });
}

function normalizeComparison(obj: Record<string, unknown>): ReplayComparison {
  const result: ReplayComparison = {
    improvements: [],
    regressions: [],
    unchanged: [],
    verdict: 'neutral',
    summary: '',
  };
  if (typeof obj['verdict'] === 'string') result.verdict = obj['verdict'];
  if (typeof obj['summary'] === 'string') result.summary = obj['summary'];

  for (const key of ['improvements', 'regressions', 'unchanged'] as const) {
    if (Array.isArray(obj[key])) {
      for (const item of obj[key]) {
        if (item && typeof item === 'object') {
          flushChange(result, key, item as Record<string, string>);
        }
      }
    }
  }
  return result;
}

/** Strip surrounding quotes from a YAML string value. */
function unquote(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}
