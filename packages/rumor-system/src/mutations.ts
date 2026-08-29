// Built-in mutation rules — how rumors change during spread

import type { MutationRule, Rumor, MutationContext } from './types.js';

/**
 * Exaggerate: numeric values increase, severity grows.
 * "He dealt 10 damage" → "He dealt 15 damage"
 */
export const exaggerateMutation: MutationRule = {
  id: 'exaggerate',
  type: 'exaggerate',
  probability: 0.15,
  apply(rumor: Rumor, _ctx: MutationContext): Rumor {
    const mutated = { ...rumor };
    if (typeof mutated.value === 'number') {
      // Increase numeric values by 20-50%
      const factor = 1.2 + seededRandom(rumor.id, mutated.spreadPath.length) * 0.3;
      mutated.value = Math.round((mutated.value as number) * factor);
      mutated.mutationCount++;
    }
    // Exaggeration also intensifies emotional charge
    if (mutated.emotionalCharge < 0) {
      mutated.emotionalCharge = Math.max(-1, mutated.emotionalCharge - 0.1);
    } else {
      mutated.emotionalCharge = Math.min(1, mutated.emotionalCharge + 0.1);
    }
    return mutated;
  },
};

/**
 * Minimize: numeric values decrease, severity shrinks.
 * "He killed 5 guards" → "He fought 3 guards"
 */
export const minimizeMutation: MutationRule = {
  id: 'minimize',
  type: 'minimize',
  probability: 0.10,
  apply(rumor: Rumor, _ctx: MutationContext): Rumor {
    const mutated = { ...rumor };
    if (typeof mutated.value === 'number') {
      const factor = 0.5 + seededRandom(rumor.id, mutated.spreadPath.length + 7) * 0.3;
      mutated.value = Math.max(1, Math.round((mutated.value as number) * factor));
      mutated.mutationCount++;
    }
    // Minimization dampens emotional charge
    mutated.emotionalCharge *= 0.7;
    return mutated;
  },
};

/**
 * Invert: boolean/directional values flip.
 * "He helped the merchant" → "He harmed the merchant"
 * Rare but dramatic.
 */
export const invertMutation: MutationRule = {
  id: 'invert',
  type: 'invert',
  probability: 0.05,
  apply(rumor: Rumor, _ctx: MutationContext): Rumor {
    const mutated = { ...rumor };
    if (typeof mutated.value === 'boolean') {
      mutated.value = !mutated.value;
      mutated.mutationCount++;
      mutated.emotionalCharge *= -1;
    }
    return mutated;
  },
};

/**
 * Attribute shift: the "who" changes during spread.
 * "Player killed the merchant" → "The guard killed the merchant"
 * Uses the spreader's ID as the new attribution.
 */
export const attributeShiftMutation: MutationRule = {
  id: 'attribute-shift',
  type: 'attribute-shift',
  probability: 0.08,
  apply(rumor: Rumor, ctx: MutationContext): Rumor {
    const mutated = { ...rumor };
    // Whole-token match only (F-208059bc): sourceId 'guard_1' must not rewrite
    // a claim about 'guard_10'. Entity ids are [A-Za-z0-9_-] with numbered suffixes.
    const shifted = replaceWholeIdToken(mutated.claim, mutated.sourceId, ctx.spreaderId);
    if (shifted !== null) {
      mutated.claim = shifted;
      mutated.mutationCount++;
    }
    return mutated;
  },
};

/**
 * Replace `id` in `text` only when it appears as a whole id-token (bounded by
 * non-id characters or string edges). First match only, matching the previous
 * non-global String.replace. Returns null when no whole-token match exists.
 */
function replaceWholeIdToken(text: string, id: string, replacement: string): string | null {
  if (id.length === 0) return null;
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?<![A-Za-z0-9_-])${escaped}(?![A-Za-z0-9_-])`);
  if (!re.test(text)) return null;
  return text.replace(re, replacement);
}

/**
 * Embellish: emotional charge intensifies without changing factual content.
 * The story gets more dramatic but the facts stay the same.
 * Most common mutation.
 */
export const embellishMutation: MutationRule = {
  id: 'embellish',
  type: 'embellish',
  probability: 0.20,
  apply(rumor: Rumor, _ctx: MutationContext): Rumor {
    const mutated = { ...rumor };
    // Intensify emotional charge toward extremes
    if (mutated.emotionalCharge >= 0) {
      mutated.emotionalCharge = Math.min(1, mutated.emotionalCharge + 0.15);
    } else {
      mutated.emotionalCharge = Math.max(-1, mutated.emotionalCharge - 0.15);
    }
    // Embellishment doesn't count as a factual mutation
    return mutated;
  },
};

/** All default mutation rules */
export const DEFAULT_MUTATIONS: MutationRule[] = [
  exaggerateMutation,
  minimizeMutation,
  invertMutation,
  attributeShiftMutation,
  embellishMutation,
];

// Deterministic pseudo-random based on rumor ID and hop count
function seededRandom(id: string, hop: number): number {
  let hash = hop * 2654435761;
  for (const char of id + 'mutate') {
    hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  }
  return (Math.abs(hash) % 1000) / 1000;
}
