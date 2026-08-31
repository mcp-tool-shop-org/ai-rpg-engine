// EDS-1 — the DORMANT SURFACE baseline.
//
// This cycle's thesis, generalised into a standing measurement. Three separate
// findings in v3.7 were the same shape: something computed, exported, unit-
// tested, and read by nothing.
//
//   - six of seven AbilityModifiers fields, and every DistrictModifiers field
//   - DistrictDefinition.tags, recognised four of ~45 authored values
//   - contentConventions.statusTags, declared by 11 packs, enforced by none
//
// None of those had a failing test, because a function with no caller has no
// caller to fail. So this sweeps the production tree for exported `compute*`
// functions nothing calls, and pins the answer as DATA.
//
// It does NOT demand the list be empty. Some of these are honest seams waiting
// for a consumer, and deleting them would be worse than leaving them. What it
// demands is that the list not GROW without someone noticing — and that when a
// wave wires one up, the wiring is visible as a line removed here.
//
// @see [[feedback_baseline_before_enforce]]

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Production TypeScript only — no dist, no tests. A test-only caller is not a consumer. */
function productionSources(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) productionSources(full, acc);
    else if (entry.endsWith('.ts') && !entry.includes('.test.')) acc.push(full);
  }
  return acc;
}

/**
 * Exported `compute*` functions that no production file CALLS.
 *
 * A re-export through an index does not count — that is distribution, not
 * consumption, and every one of the entries below is re-exported. The check is
 * for `name(` appearing somewhere other than its own definition.
 */
function dormantComputeFunctions(): string[] {
  const files = productionSources(PACKAGES_DIR);
  const blob = files.map((f) => readFileSync(f, 'utf8')).join('\n');

  const declared = new Set<string>();
  for (const source of files.map((f) => readFileSync(f, 'utf8'))) {
    for (const match of source.matchAll(/export function (compute[A-Za-z0-9_]+)/g)) {
      declared.add(match[1]);
    }
  }

  return [...declared]
    .filter((name) => blob.split(`${name}(`).length - 1 <= 1)
    .sort();
}

/**
 * Measured 2026-07-28. Every entry is exported, unit-tested, and called by no
 * production code — the engine computes these for nobody.
 *
 * DEFERRED as a set, owner = the v3.8 cycle, per the Director's disposal rule:
 * these are the same theme as the opportunity-fallout sinks (systems that
 * should leave real marks on the world), and building seven consumers inside a
 * release phase is how a release goes wrong.
 */
const KNOWN_DORMANT = [
  'computeDeltas',
  'computeItemNotoriety',
  'computeLoadoutEffects',
  'computeNpcRecapEntries',
  'computeRelationshipModifiers',
  'computeRelicBonuses',
];

describe('dormant engine surface (EDS-1)', () => {
  it('the set of computed-but-uncalled functions is exactly what v3.7 measured', () => {
    const measured = dormantComputeFunctions();

    const appeared = measured.filter((name) => !KNOWN_DORMANT.includes(name));
    expect(
      appeared,
      'NEW dormant surface: these are computed, exported, and called by no production code.\n' +
        '  Either wire them to a consumer, or add them here with an owner — but do not let the\n' +
        '  engine grow another system that runs for nobody.',
    ).toEqual([]);

    const wiredUp = KNOWN_DORMANT.filter((name) => !measured.includes(name));
    expect(
      wiredUp,
      'these were dormant and now have a caller — good. Remove them from KNOWN_DORMANT in the\n' +
        '  SAME commit that wired them, so this list stays a true measurement.',
    ).toEqual([]);
  });
});

describe('meta: the dormant sweep can see a real caller (EDS-1 control)', () => {
  it('a function the engine genuinely calls is NOT reported dormant', () => {
    // computeAbilityModifiers was on this list before v3.7 threaded it. It is
    // the proof that the sweep distinguishes "wired" from "exported" — without
    // it, a sweep that reported everything as dormant would also pass.
    expect(dormantComputeFunctions()).not.toContain('computeAbilityModifiers');
  });

  it('and the sweep finds SOMETHING — an empty result would pass vacuously', () => {
    expect(dormantComputeFunctions().length).toBeGreaterThan(0);
  });
});
