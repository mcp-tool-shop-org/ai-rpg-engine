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
