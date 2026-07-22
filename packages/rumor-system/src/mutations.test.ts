// Direct unit tests for the built-in mutation rules.
//
// F-cc23db9a: attributeShiftMutation.apply() used to increment mutationCount
// unconditionally, even on hops where the guarded claim.replace() did not fire
// (i.e. the claim text never contained sourceId, so nothing actually changed).
// That inflated mutationCount for rumors whose claim text does not happen to
// contain their own sourceId substring — every time the attribute-shift roll
// succeeded, whether or not it did anything. These tests pin both branches so
// a regression trips CI instead of silently over-reporting mutation counts.

import { describe, test, expect } from 'vitest';
import { attributeShiftMutation } from './mutations.js';
import type { MutationContext, Rumor } from './types.js';

function baseRumor(overrides: Partial<Rumor> = {}): Rumor {
  return {
    id: 'rum_1',
    claim: 'guard_1 killed the merchant',
    subject: 'guard_1',
    key: 'killed',
    value: true,
    originalValue: true,
    sourceId: 'guard_1',
    originTick: 0,
    confidence: 0.9,
    emotionalCharge: -0.5,
    spreadPath: ['guard_1'],
    mutationCount: 0,
    factionUptake: [],
    status: 'spreading',
    lastSpreadTick: 0,
    ...overrides,
  };
}

function defaultCtx(overrides: Partial<MutationContext> = {}): MutationContext {
  return {
    spreaderId: 'guard_2',
    receiverId: 'guard_3',
    environmentInstability: 0,
    hopCount: 1,
    ...overrides,
  };
}

describe('attributeShiftMutation', () => {
  test('re-attributes the claim and increments mutationCount when sourceId is present in the claim', () => {
    const rumor = baseRumor({ claim: 'guard_1 killed the merchant', sourceId: 'guard_1' });
    const mutated = attributeShiftMutation.apply(rumor, defaultCtx({ spreaderId: 'guard_2' }));

    expect(mutated.claim).toBe('guard_2 killed the merchant');
    expect(mutated.mutationCount).toBe(1);
  });

  test('leaves the claim untouched and does NOT increment mutationCount when sourceId is absent from the claim', () => {
    const rumor = baseRumor({ claim: 'player killed merchant_1', sourceId: 'guard_1' });
    const mutated = attributeShiftMutation.apply(rumor, defaultCtx({ spreaderId: 'guard_2' }));

    expect(mutated.claim).toBe('player killed merchant_1');
    expect(mutated.mutationCount).toBe(0);
  });

  test('mutationCount only rises by one per real shift across repeated hops', () => {
    let rumor = baseRumor({ claim: 'guard_1 killed the merchant', sourceId: 'guard_1' });
    rumor = attributeShiftMutation.apply(rumor, defaultCtx({ spreaderId: 'guard_2' }));
    expect(rumor.mutationCount).toBe(1); // real shift: guard_1 -> guard_2

    // Second hop: the claim no longer contains sourceId ('guard_1'), so this
    // hop must be a no-op on both the claim text and the counter.
    rumor = attributeShiftMutation.apply(rumor, defaultCtx({ spreaderId: 'guard_3' }));
    expect(rumor.claim).toBe('guard_2 killed the merchant');
    expect(rumor.mutationCount).toBe(1);
  });
});
