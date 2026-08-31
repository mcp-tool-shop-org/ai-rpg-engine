// Player-facing rumor presentation. The sim record stays the raw Rumor.

import type { Rumor, RumorStatus, RumorStance } from './types.js';

export type FormatRumorOptions = {
  /** Map an entity id in the claim (subject, source, numbered tokens) to a spoken name. */
  resolveName?: (entityId: string) => string;
};

export type PlayerRumorView = {
  spoken: string;
  status: RumorStatus;
  confidencePct: number;
  charge: number;
  factions: string[];
  hops: number;
  mutated: boolean;
};

const SMALL_QTY: Record<number, string> = {
  0: 'zero',
  1: 'one',
  2: 'two',
  3: 'three',
  4: 'four',
  5: 'five',
  6: 'six',
  7: 'seven',
  8: 'eight',
  9: 'nine',
  10: 'ten',
  11: 'eleven',
  12: 'twelve',
};

function quantity(n: number): string {
  return SMALL_QTY[n] ?? String(n);
}

/** `merchant_1` → `merchant`, `town_guard` → `town guard`. */
function humanizeId(id: string): string {
  return id.replace(/_/g, ' ').replace(/ \d+$/, '').trim();
}

function replaceWholeIdToken(text: string, id: string, replacement: string): string | null {
  if (id.length === 0) return null;
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?<![A-Za-z0-9_-])${escaped}(?![A-Za-z0-9_-])`);
  if (!re.test(text)) return null;
  return text.replace(re, replacement);
}

function rewriteIds(claim: string, rumor: Rumor, resolveName: (id: string) => string): string {
  const ids = new Set<string>([rumor.subject, rumor.sourceId, ...rumor.spreadPath]);
  const tokenRe = /[A-Za-z][A-Za-z0-9_-]*/g;
  const found = claim.match(tokenRe) ?? [];
  for (const token of found) {
    if (/_\d+$/.test(token) || ids.has(token)) ids.add(token);
  }
  let text = claim;
  const sorted = [...ids].sort((a, b) => b.length - a.length);
  for (const id of sorted) {
    const name = resolveName(id);
    if (!name || name === id) continue;
    const replaced = replaceWholeIdToken(text, id, name);
    if (replaced !== null) text = replaced;
  }
  return text;
}

function isMutated(rumor: Rumor): boolean {
  return rumor.mutationCount > 0 || !Object.is(rumor.value, rumor.originalValue);
}

function interpolateValue(text: string, rumor: Rumor): string {
  const mutated = isMutated(rumor);

  if (typeof rumor.value === 'number') {
    if (/\b\d+\b/.test(text)) {
      return text.replace(/\b\d+\b/, String(rumor.value));
    }
    if (mutated) {
      const orig = typeof rumor.originalValue === 'number' ? rumor.originalValue : rumor.value;
      const exaggerated = rumor.value > orig;
      const qty = quantity(rumor.value);
      if (/\bkilled\b/i.test(text)) {
        const verb = exaggerated ? 'slaughtered' : 'fought';
        let next = text.replace(/\bkilled\b/i, `${verb} ${qty}`);
        if (rumor.value !== 1) {
          next = next.replace(/(\S+)$/, (word) => (word.endsWith('s') ? word : `${word}s`));
        }
        return next;
      }
      return `${text} (${rumor.value})`;
    }
    return text;
  }

  if (typeof rumor.value === 'boolean' && mutated && rumor.value !== rumor.originalValue) {
    if (rumor.value === false) {
      return text.replace(/\bkilled\b/i, 'spared').replace(/\bhelped\b/i, 'harmed');
    }
    return text.replace(/\bspared\b/i, 'killed').replace(/\bharmed\b/i, 'helped');
  }

  return text;
}

function capitalizeSpoken(text: string): string {
  if (text.length === 0) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Present a rumor as a spoken line plus UI fields. Does not mutate `rumor`.
 * Mutated numeric/boolean `value` is interpolated into `spoken` so a host that
 * prints this (not `rumor.claim`) sees the README mutation example.
 */
export function formatRumorForPlayer(rumor: Rumor, opts?: FormatRumorOptions): PlayerRumorView {
  const resolve = opts?.resolveName ?? humanizeId;
  const withNames = rewriteIds(rumor.claim, rumor, resolve);
  const spoken = capitalizeSpoken(interpolateValue(withNames, rumor));
  return {
    spoken,
    status: rumor.status,
    confidencePct: Math.round(rumor.confidence * 100),
    charge: rumor.emotionalCharge,
    factions: [...rumor.factionUptake],
    hops: Math.max(0, rumor.spreadPath.length - 1),
    mutated: isMutated(rumor),
  };
}

export type FormatRumorBoardOptions = FormatRumorOptions & {
  /** Include dead rumors as denied board lines. Default: live statuses only. */
  includeDead?: boolean;
  /** Entity whose believed/doubted stance is attached to each line (F-959f6ee9). */
  entityId?: string;
  /** `(rumorId) => stance`. Hosts pass `id => engine.stanceOf(entityId, id)`. */
  stanceOf?: (rumorId: string) => RumorStance | undefined;
  /** Per-rumor-id stance map for `entityId` (from serialize().stances). */
  stances?: Readonly<Record<string, RumorStance>>;
};

export type RumorBoardLine = PlayerRumorView & {
  subject: string;
  key: string;
  /** Unique witnesses (`sourceId` ∪ `spreadPath`) across the collapsed group. */
  witnessCount: number;
  /** Value inverted vs `originalValue`, or the winning row is dead. */
  denied: boolean;
  /** Player-facing denial when {@link RumorBoardLine.denied} — else omitted. */
  denialLine?: string;
  /** Entity stance when `entityId` / `stanceOf` / `stances` is provided. */
  stance?: RumorStance;
  /** True when the entity believes the winning row (F-959f6ee9). */
  believed: boolean;
  /** True when the entity doubts the winning row (F-959f6ee9). */
  doubted: boolean;
};

function resolveBoardStance(rumorId: string, opts?: FormatRumorBoardOptions): RumorStance {
  if (opts?.stanceOf) return opts.stanceOf(rumorId) ?? 'unknown';
  if (opts?.stances) return opts.stances[rumorId] ?? 'unknown';
  return 'unknown';
}

function isDenied(rumor: Rumor): boolean {
  if (rumor.status === 'dead') return true;
  if (typeof rumor.value === 'boolean' && typeof rumor.originalValue === 'boolean') {
    return rumor.value !== rumor.originalValue;
  }
  if (typeof rumor.value === 'number' && typeof rumor.originalValue === 'number') {
    return rumor.value === -rumor.originalValue && rumor.value !== rumor.originalValue;
  }
  return false;
}

/**
 * Collapse rumors into one board line per `(subject, key)` (F-823e0edf).
 * Picks the highest-confidence row, keeps {@link formatRumorForPlayer} as the
 * spoken line, and attaches witness count plus a denial flag/line.
 * Does not mint or corroborate — `create()` stays mint-always.
 */
export function formatRumorBoard(
  rumors: readonly Rumor[],
  opts?: FormatRumorBoardOptions,
): RumorBoardLine[] {
  const includeDead = opts?.includeDead === true;
  const groups = new Map<string, Rumor[]>();
  for (const rumor of rumors) {
    if (!includeDead && rumor.status === 'dead') continue;
    const groupKey = `${rumor.subject}\0${rumor.key}`;
    const list = groups.get(groupKey);
    if (list) list.push(rumor);
    else groups.set(groupKey, [rumor]);
  }

  const lines: RumorBoardLine[] = [];
  for (const group of groups.values()) {
    group.sort(
      (a, b) => b.confidence - a.confidence || a.originTick - b.originTick || a.id.localeCompare(b.id),
    );
    const top = group[0];
    const witnesses = new Set<string>();
    for (const r of group) {
      if (r.sourceId) witnesses.add(r.sourceId);
      for (const id of r.spreadPath) witnesses.add(id);
    }
    const view = formatRumorForPlayer(top, opts);
    const denied = isDenied(top);
    const stance = resolveBoardStance(top.id, opts);
    const hasStanceInput =
      opts?.entityId !== undefined || opts?.stanceOf !== undefined || opts?.stances !== undefined;
    const line: RumorBoardLine = {
      ...view,
      subject: top.subject,
      key: top.key,
      witnessCount: witnesses.size,
      denied,
      believed: stance === 'believe',
      doubted: stance === 'doubt',
    };
    if (hasStanceInput) line.stance = stance;
    if (denied) line.denialLine = view.spoken;
    lines.push(line);
  }

  lines.sort(
    (a, b) => b.confidencePct - a.confidencePct || a.subject.localeCompare(b.subject) || a.key.localeCompare(b.key),
  );
  return lines;
}
