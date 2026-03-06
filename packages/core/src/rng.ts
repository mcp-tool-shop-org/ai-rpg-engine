// Deterministic PRNG — seedable, replayable
// Uses a simple mulberry32 algorithm for reproducibility

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

  /** Returns an integer in [min, max] inclusive */
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /** Roll under a value (0-100 scale). Returns true if roll <= target. */
  check(target: number): boolean {
    return this.int(1, 100) <= target;
  }

  /** Pick a random element from an array */
  pick<T>(arr: readonly T[]): T {
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
