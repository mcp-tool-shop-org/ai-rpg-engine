// Player-facing rumor presentation. The sim record stays the raw Rumor.

import type { Rumor, RumorStatus } from './types.js';

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
