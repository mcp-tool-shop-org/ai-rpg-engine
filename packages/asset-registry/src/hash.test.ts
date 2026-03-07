import { describe, it, expect } from 'vitest';
import { hashBytes, isValidHash } from './hash.js';

describe('hashBytes', () => {
  it('produces a 64-char hex string', () => {
    const hash = hashBytes(new Uint8Array([1, 2, 3]));
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic', () => {
    const data = new Uint8Array([10, 20, 30]);
    expect(hashBytes(data)).toBe(hashBytes(data));
  });

  it('different data produces different hashes', () => {
    const a = hashBytes(new Uint8Array([1]));
    const b = hashBytes(new Uint8Array([2]));
    expect(a).not.toBe(b);
  });

  it('empty input produces a valid hash', () => {
    const hash = hashBytes(new Uint8Array([]));
    expect(hash).toHaveLength(64);
  });
});

describe('isValidHash', () => {
  it('accepts a valid SHA-256 hex string', () => {
    const hash = hashBytes(new Uint8Array([1, 2, 3]));
    expect(isValidHash(hash)).toBe(true);
  });

  it('rejects too-short strings', () => {
    expect(isValidHash('abc123')).toBe(false);
  });

  it('rejects uppercase hex', () => {
    expect(isValidHash('A'.repeat(64))).toBe(false);
  });

  it('rejects non-hex characters', () => {
    expect(isValidHash('g'.repeat(64))).toBe(false);
  });
});
