// Deterministic PRNG — seedable, replayable
// Uses a simple mulberry32 algorithm for reproducibility

/** Structured error shape for RNG misuse (out-of-range / empty input). */
export type RngErrorShape = {
  code: 'RNG_RANGE_INVALID' | 'RNG_EMPTY_INPUT';
  message: string;
  hint: string;
};

export class RngError extends Error {
  readonly code: RngErrorShape['code'];
  readonly hint: string;
  constructor(shape: RngErrorShape) {
    super(shape.message);
    this.name = 'RngError';
    this.code = shape.code;
    this.hint = shape.hint;
  }
}

export class SeededRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed;
  }

  /** Returns a float in [0, 1) */
  next(): number {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Returns an integer in [min, max] inclusive.
   *
   * Guards against inverted ranges: a call like int(5, 3) previously consumed an
   * rng draw and returned a value BELOW min (e.g. 4), silently corrupting both
   * the result and the deterministic rng stream. We throw a structured RngError
   * instead — least-surprising for a deterministic engine, since an inverted
   * range is a caller bug, not a recoverable condition, and swapping would hide
   * it. NaN bounds are also rejected.
   */
  int(min: number, max: number): number {
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      throw new RngError({
        code: 'RNG_RANGE_INVALID',
        message: `SeededRNG.int requires finite bounds, got (${min}, ${max}).`,
        hint: 'Pass numeric min/max; check for NaN/undefined upstream.',
      });
    }
    if (min > max) {
      throw new RngError({
        code: 'RNG_RANGE_INVALID',
        message: `SeededRNG.int called with min > max (${min} > ${max}).`,
        hint: 'Ensure min <= max. An inverted range is a caller bug; swap the arguments at the call site.',
      });
    }
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /** Roll under a value (0-100 scale). Returns true if roll <= target. */
  check(target: number): boolean {
    return this.int(1, 100) <= target;
  }

  /**
   * Pick a random element from a non-empty array.
   * @throws RngError on an empty array — returning undefined would consume an
   * rng draw and propagate undefined into downstream logic.
   */
  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) {
      throw new RngError({
        code: 'RNG_EMPTY_INPUT',
        message: 'SeededRNG.pick called with an empty array.',
        hint: 'Guard the call site so pick() only runs on a non-empty collection.',
      });
    }
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Get current state for save/restore */
  getState(): number {
    return this.state;
  }

  /** Restore state from save */
  setState(state: number): void {
    this.state = state;
  }
}
