import { describe, expect, it } from 'vitest';
import type { ContentPack } from './refs.js';
import { runLoadGate } from './gate.js';
import { satisfiesRange } from './semver-range.js';

// The missing-engineVersion hint names the range a pack should declare. It is
// built from the parsed engine version: from that release up to the next major,
// so the suggestion is always a range the running engine itself satisfies.
const emptyPack = {} as ContentPack;

function engineVersionHint(engineVersion: string): string {
  const r = runLoadGate(emptyPack, { engineVersion, manifest: {} });
  const check = r.checks.find((c) => c.check === 'engine-version');
  expect(check?.ok).toBe(false);
  return check?.hint ?? '';
}

function suggested(hint: string): string {
  return /e\.g\. "([^"]+)"/.exec(hint)?.[1] ?? '';
}

describe('load gate engine-version hint', () => {
  it('suggests a range from the running release up to its next major', () => {
    expect(engineVersionHint('4.0.0')).toContain('">=4.0.0 <5.0.0"');
    expect(engineVersionHint('12.3.4')).toContain('">=12.3.4 <13.0.0"');
  });

  it('drops a prerelease and a "v" prefix, so the engine satisfies its own suggestion', () => {
    expect(suggested(engineVersionHint('4.0.0-rc.1'))).toBe('>=4.0.0 <5.0.0');
    expect(suggested(engineVersionHint('v4.1.2'))).toBe('>=4.1.2 <5.0.0');
    expect(satisfiesRange('4.1.2', suggested(engineVersionHint('v4.1.2')))).toBe(true);
  });

  it('falls back to a generic example when the engine version does not parse', () => {
    expect(suggested(engineVersionHint('dev'))).toBe('>=4.0.0 <5.0.0');
    expect(suggested(engineVersionHint('4abc'))).toBe('>=4.0.0 <5.0.0');
  });
});
