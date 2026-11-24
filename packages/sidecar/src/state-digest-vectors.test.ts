// state-digest-vectors.test.ts — shared cross-language digest vectors.
//
// Reads fixtures/state_digest_vectors.jsonl (also executed in headless Godot)
// and verifies canonicalJson() and canonicalStateHash() on every vector.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { canonicalJson, canonicalStateHash } from './serializer.js';

type DigestVector = {
  id: string;
  category: string;
  input: unknown;
  expected_preimage: string;
  expected_hash: string;
};

const fixturesPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'fixtures',
  'state_digest_vectors.jsonl',
);

const vectors: DigestVector[] = readFileSync(fixturesPath, 'utf8')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.length > 0)
  .map((line) => JSON.parse(line) as DigestVector);

describe('shared state digest vectors (fixtures/state_digest_vectors.jsonl)', () => {
  it('loads a non-empty vector suite covering every required edge case', () => {
    const categories = new Set(vectors.map((v) => v.category));
    expect(vectors.length).toBeGreaterThanOrEqual(19);
    for (const required of [
      'null',
      'neg_zero',
      'negative_ties',
      'exact_binary_tie',
      'safe_integer_edges',
      'five_int_vs_float',
      'key_orders',
      'nested',
      'control_chars_and_del',
    ]) {
      expect(categories.has(required), `missing vector category: ${required}`).toBe(true);
    }
  });

  for (const vector of vectors) {
    it(`[${vector.category}] ${vector.id} matches canonicalJson and canonicalStateHash`, () => {
      expect(canonicalJson(vector.input)).toBe(vector.expected_preimage);
      expect(canonicalStateHash(vector.input)).toBe(vector.expected_hash);
    });
  }

  it('produces identical digests for 5 and 5.0, -0 and 0, and reordered keys', () => {
    expect(canonicalStateHash({ n: 5 })).toBe(canonicalStateHash({ n: 5.0 }));
    expect(canonicalJson(-0)).toBe('0');
    expect(canonicalJson({ z: -0 })).toBe('{"z":0}');
    expect(canonicalStateHash(-0)).toBe(canonicalStateHash(0));
    expect(canonicalStateHash({ z: 1, a: 2, m: 3, A: 4, _: 5, 0: 6 })).toBe(
      canonicalStateHash({ 0: 6, A: 4, _: 5, a: 2, m: 3, z: 1 }),
    );
  });
});
