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
    // The claim gets attributed to the spreader instead of the source
    if (mutated.claim.includes(mutated.sourceId)) {
      mutated.claim = mutated.claim.replace(mutated.sourceId, ctx.spreaderId);
    }
    mutated.mutationCount++;
    return mutated;
  },
};

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
