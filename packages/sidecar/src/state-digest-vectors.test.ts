// state-digest-vectors.test.ts — shared cross-language digest vectors.
//
// Reads fixtures/state_digest_vectors.jsonl (also executed in headless Godot)
// and verifies canonicalJson() and canonicalStateHash() on every vector.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { canonicalJson, canonicalStateHash, StateDigestError, validateDigestState } from './serializer.js';

type DigestVector = {
  id: string;
  category: string;
  input?: unknown;
  expected_preimage?: string;
  expected_hash?: string;
  refused_string_code_units?: number[];
  raw_json_literal?: string;
  expected_error?: string;
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
    expect(vectors.length).toBeGreaterThanOrEqual(26);
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
      'unicode_strings',
      'refused_unicode',
    ]) {
      expect(categories.has(required), `missing vector category: ${required}`).toBe(true);
    }
  });

  for (const vector of vectors) {
    if (vector.expected_error) {
      it(`[${vector.category}] ${vector.id} refuses with ${vector.expected_error}`, () => {
        const s = String.fromCharCode(...(vector.refused_string_code_units ?? []));
        const state = { s };
        for (const run of [() => validateDigestState(state), () => canonicalStateHash(state)]) {
          try {
            run();
            expect.unreachable(`expected ${vector.expected_error}`);
          } catch (err) {
            expect(err).toBeInstanceOf(StateDigestError);
            expect((err as StateDigestError).code).toBe(vector.expected_error);
          }
        }
        if (vector.raw_json_literal) {
          const parsed = JSON.parse(vector.raw_json_literal) as unknown;
          expect(() => canonicalJson(parsed)).toThrowError(StateDigestError);
        }
      });
    } else {
      it(`[${vector.category}] ${vector.id} matches canonicalJson and canonicalStateHash`, () => {
        expect(canonicalJson(vector.input)).toBe(vector.expected_preimage);
        expect(canonicalStateHash(vector.input)).toBe(vector.expected_hash);
      });
    }
  }

  it('produces identical digests for sub-ulp zero, lexicographic numeric keys, and reordered keys', () => {
    expect(canonicalJson(-0)).toBe('0');
    expect(canonicalJson({ z: -0 })).toBe('{"z":0}');
    expect(canonicalStateHash(-1e-9)).toBe(canonicalStateHash(0));
    expect(canonicalJson({ 10: 10, 2: 2 })).toBe('{"10":10000000,"2":2000000}');
    expect(canonicalStateHash({ z: 1, a: 2, m: 3, A: 4, _: 5, 0: 6 })).toBe(
      canonicalStateHash({ 0: 6, A: 4, _: 5, a: 2, m: 3, z: 1 }),
    );
  });
});
