// semver-range.test.ts — the bounded range checker the load gate rests on.
//
// This exists because the gate's first check is "does the running engine satisfy
// the range this pack claims?", and an answer is only as good as the comparison
// behind it. A permissive parser at a security boundary is worse than none: it
// converts a refusal into a silent pass, which is the exact failure C0 measured.

import { describe, it, expect } from 'vitest';
import { satisfiesRange, parseVersion, compareVersions, isBareVersion, SemVerError } from './semver-range.js';

describe('parseVersion', () => {
  it('parses major.minor.patch', () => {
    expect(parseVersion('3.8.0')).toEqual({ major: 3, minor: 8, patch: 0 });
  });

  it('tolerates a leading v and strips build metadata', () => {
    expect(parseVersion('v1.2.3+build.5')).toEqual({ major: 1, minor: 2, patch: 3 });
  });

  it('captures a prerelease without letting it affect comparison', () => {
    expect(parseVersion('1.2.3-rc.1').prerelease).toBe('rc.1');
    expect(compareVersions(parseVersion('1.2.3-rc.1'), parseVersion('1.2.3'))).toBe(0);
  });

  it('RED: refuses malformed versions instead of guessing', () => {
    for (const bad of ['', '1.2', '1.2.3.4', 'x.y.z', '1.2.a']) {
      expect(() => parseVersion(bad), `"${bad}" should be refused`).toThrow(SemVerError);
    }
  });
});

describe('compareVersions', () => {
  it('orders by major, then minor, then patch', () => {
    const lt = (a: string, b: string) => compareVersions(parseVersion(a), parseVersion(b));
    expect(lt('1.0.0', '2.0.0')).toBe(-1);
    expect(lt('1.9.0', '1.10.0')).toBe(-1); // numeric, not lexicographic
    expect(lt('1.0.2', '1.0.1')).toBe(1);
    expect(lt('3.8.0', '3.8.0')).toBe(0);
  });
});

describe('satisfiesRange', () => {
  it('comparator sets AND together', () => {
    expect(satisfiesRange('3.8.0', '>=3.8.0 <4.0.0')).toBe(true);
    expect(satisfiesRange('3.7.9', '>=3.8.0 <4.0.0')).toBe(false);
    expect(satisfiesRange('4.0.0', '>=3.8.0 <4.0.0')).toBe(false);
  });

  it('|| unions OR together', () => {
    expect(satisfiesRange('2.5.0', '>=2.0.0 <3.0.0 || >=4.0.0')).toBe(true);
    expect(satisfiesRange('4.1.0', '>=2.0.0 <3.0.0 || >=4.0.0')).toBe(true);
    expect(satisfiesRange('3.5.0', '>=2.0.0 <3.0.0 || >=4.0.0')).toBe(false);
  });

  it('caret follows the leftmost-nonzero rule', () => {
    expect(satisfiesRange('1.9.9', '^1.2.3')).toBe(true);
    expect(satisfiesRange('2.0.0', '^1.2.3')).toBe(false);
    // 0.x: the minor is the breaking axis.
    expect(satisfiesRange('0.2.9', '^0.2.3')).toBe(true);
    expect(satisfiesRange('0.3.0', '^0.2.3')).toBe(false);
    // 0.0.x: only the exact patch.
    expect(satisfiesRange('0.0.3', '^0.0.3')).toBe(true);
    expect(satisfiesRange('0.0.4', '^0.0.3')).toBe(false);
  });

  it('tilde allows patch drift only', () => {
    expect(satisfiesRange('1.2.9', '~1.2.3')).toBe(true);
    expect(satisfiesRange('1.3.0', '~1.2.3')).toBe(false);
  });

  it('wildcards and partials expand to ranges', () => {
    expect(satisfiesRange('3.8.0', '3.x')).toBe(true);
    expect(satisfiesRange('4.0.0', '3.x')).toBe(false);
    expect(satisfiesRange('3.8.9', '3.8')).toBe(true);
    expect(satisfiesRange('3.9.0', '3.8')).toBe(false);
    expect(satisfiesRange('9.9.9', '*')).toBe(true);
  });

  it('a bare version is an exact match', () => {
    expect(satisfiesRange('3.8.0', '3.8.0')).toBe(true);
    expect(satisfiesRange('3.8.1', '3.8.0')).toBe(false);
  });

  it('THE C0 CASE: 3.8.0 does not satisfy a 2.0.0 claim', () => {
    expect(satisfiesRange('3.8.0', '2.0.0')).toBe(false);
    expect(satisfiesRange('3.8.0', '>=2.0.0 <3.0.0')).toBe(false);
  });

  it('RED: an unparseable range THROWS rather than defaulting to permissive', () => {
    // The load-gate posture (RFC 9413): a gate that passes what it cannot parse
    // is not a gate. Every one of these would be a silent pass if the checker
    // returned `true` on confusion.
    for (const bad of ['', '1.0.0 - 2.0.0', '>=', '>=1.2.3.4', '>=a.b.c', '>=1.0.0 ||']) {
      expect(() => satisfiesRange('3.8.0', bad), `"${bad}" should throw`).toThrow(SemVerError);
    }
  });

  it('is linear in input size — no backtracking blowup', () => {
    // Not a timing assertion (flaky by nature); a structural one. A pathological
    // input a backtracking regex would choke on parses or refuses immediately.
    const nasty = `${'>='.repeat(1)}${'1.'.repeat(200)}0`;
    expect(() => satisfiesRange('3.8.0', nasty)).toThrow(SemVerError);
    const wide = Array.from({ length: 500 }, () => '>=1.0.0').join(' ');
    expect(satisfiesRange('3.8.0', wide)).toBe(true);
  });
});

describe('isBareVersion', () => {
  it('distinguishes a point claim from a range', () => {
    expect(isBareVersion('2.0.0')).toBe(true);
    expect(isBareVersion('>=3.8.0 <4.0.0')).toBe(false);
    expect(isBareVersion('^3.8.0')).toBe(false);
    expect(isBareVersion('3.x')).toBe(false);
    expect(isBareVersion('not-a-version')).toBe(false);
  });
});
