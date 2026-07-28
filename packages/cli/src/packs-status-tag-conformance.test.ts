// PSC-1 — catalog-wide STATUS-TAG CONFORMANCE.
//
// Every one of the eleven packs declares `contentConventions.statusTags`, and
// real engine code READS status tags for behaviour: ability gating goes through
// `getStatusTags` (ability-effects.ts, ability-intent.ts) against the taxonomy
// in tag-taxonomy.ts. So the declaration is a live contract, not documentation.
//
// It was enforced by nothing, and ten of eleven packs violated it — fantasy's
// `holy`, colony's `breach`+`control`, vampire's `control`+`fear`+
// `supernatural`, ronin's `stance`, and five more. A declared contract that
// nobody checks drifts exactly the way the catalog-of-record did before v3.6
// gave it a filesystem-backed membership guard.
//
// DIRECTION OF FIX — [[feedback_baseline_before_enforce]]. The declarations
// were widened to what the shipped statuses ACTUALLY tag, and no status
// definition changed. The alternative (rewrite ten packs' content until it
// matched declarations written before that content existed) would have been a
// gate enforcing a wish over reality.
//
// WHY CATALOG-WIDE rather than per-pack in each `schema-conformance.test.ts`:
// a per-pack copy is eleven files that can each drift, and the twelfth pack
// would ship with no check at all — which is precisely how merchant shipped
// missing from two separate catalogs-of-record. One gate over `allPacks` covers
// every pack that exists by construction.

import { describe, it, expect } from 'vitest';
import type { StatusDefinition } from '@ai-rpg-engine/content-schema';
import { allPacks, type PackInfo } from './packs.js';

type ConventionCarrier = { contentConventions?: { statusTags?: string[] } };

function declaredTags(pack: PackInfo): Set<string> {
  return new Set((pack.ruleset as ConventionCarrier).contentConventions?.statusTags ?? []);
}

/** Every tag any of this pack's own status definitions carries. */
function usedTags(definitions: StatusDefinition[]): Map<string, string[]> {
  const byTag = new Map<string, string[]>();
  for (const definition of definitions) {
    for (const tag of definition.tags ?? []) {
      byTag.set(tag, [...(byTag.get(tag) ?? []), definition.id]);
    }
  }
  return byTag;
}

function undeclared(pack: PackInfo, definitions = pack.statusDefinitions): string[] {
  const declared = declaredTags(pack);
  return [...usedTags(definitions).keys()].filter((tag) => !declared.has(tag)).sort();
}

describe('status-tag conformance × real catalog (PSC-1)', () => {
  it('every pack declares statusTags at all', () => {
    for (const pack of allPacks) {
      expect(
        declaredTags(pack).size,
        `${pack.meta.id} declares no contentConventions.statusTags — the contract has to exist before it can be kept`,
      ).toBeGreaterThan(0);
    }
  });

  for (const pack of allPacks) {
    it(`${pack.meta.id}: every status tag it uses is one it declares`, () => {
      const missing = undeclared(pack);
      const byTag = usedTags(pack.statusDefinitions);
      expect(
        missing,
        `${pack.meta.id} ships statuses tagged with vocabulary its own ruleset never declares.\n` +
          missing.map((tag) => `    '${tag}' — used by ${byTag.get(tag)!.join(', ')}`).join('\n') +
          `\n  declared: [${[...declaredTags(pack)].sort().join(', ')}]\n` +
          '  Fix by WIDENING the declaration to match the shipped status, not by retagging content\n' +
          '  to match a declaration written before that content existed.',
      ).toEqual([]);
    });
  }
});

// --- Mutation control ------------------------------------------------------
//
// The gate ships with a committed proof that it can FAIL. Five validators
// written in the v3.6.0 cycle were vacuous on first draft — one skipped exactly
// the malformed input it existed to catch — so "the check passes" is not
// evidence the check works, and a conformance gate that just went green across
// eleven packs is exactly the shape that hides a no-op.

describe('meta: the conformance gate fires on a violation (PSC-1 negative control)', () => {
  const control = allPacks.find((p) => p.meta.id === 'black-flag-requiem')!;

  it('a status tagged with undeclared vocabulary is caught', () => {
    const violation: StatusDefinition = {
      ...control.statusDefinitions[0],
      id: '__psc_probe_status',
      tags: ['__psc_undeclared_tag'],
    };
    expect(
      undeclared(control, [violation]),
      'the gate accepted a status tagged with vocabulary no pack declares — it cannot detect drift',
    ).toEqual(['__psc_undeclared_tag']);
  });

  it('and a status using only DECLARED vocabulary is not', () => {
    // The other direction: a gate that flagged everything would also "catch"
    // the violation above while being useless.
    const declared = [...declaredTags(control)][0];
    const conformant: StatusDefinition = {
      ...control.statusDefinitions[0],
      id: '__psc_probe_status',
      tags: [declared],
    };
    expect(undeclared(control, [conformant])).toEqual([]);
  });

  it('a status missing `tags` entirely is handled, not thrown on', () => {
    // `StatusDefinition.tags` is REQUIRED by the type, so this cannot arise
    // from a compiled pack — but an externally loaded pack (create-starter's
    // JSON path) is not typechecked, and the natural implementation of "check
    // the tags" throws on `undefined` rather than reporting nothing to check.
    // Cast through `unknown` deliberately: the whole point is a value the type
    // says is impossible.
    const untagged = { ...control.statusDefinitions[0], id: '__psc_probe_status', tags: undefined };
    expect(() => undeclared(control, [untagged as unknown as StatusDefinition])).not.toThrow();
    expect(undeclared(control, [untagged as unknown as StatusDefinition])).toEqual([]);
  });
});
