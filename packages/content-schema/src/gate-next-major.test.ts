import { describe, expect, it } from 'vitest';
import type { ContentPack } from './refs.js';
import { runLoadGate } from './gate.js';

// The missing-engineVersion hint names the range a pack should declare. It derives
// the upper bound from the running engine's major instead of a hard-coded "<4.0.0",
// which every 4.x engine would otherwise print as advice no 4.x pack could follow.
const emptyPack = {} as ContentPack;

function engineVersionHint(engineVersion: string): string {
  const r = runLoadGate(emptyPack, { engineVersion, manifest: {} });
  const check = r.checks.find((c) => c.check === 'engine-version');
  expect(check?.ok).toBe(false);
  return check?.hint ?? '';
}

describe('load gate engine-version hint', () => {
  it('suggests a range ending at the next major of the running engine', () => {
    expect(engineVersionHint('4.0.0')).toContain('">=4.0.0 <5.0.0"');
    expect(engineVersionHint('12.3.4')).toContain('<13.0.0"');
  });

  it('falls back to words when the engine version has no numeric major', () => {
    expect(engineVersionHint('dev')).toContain('<the next major"');
  });
});
