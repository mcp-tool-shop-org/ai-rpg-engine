// PCC-1 — catalog-wide CONTENT-CONVENTION conformance, beyond statusTags.
//
// PSC-1 (packs-status-tag-conformance.test.ts) gated the first of the four
// `contentConventions` fields. This file measures the other three —
// `entityTypes`, `combatTags`, `networkTags` — declared across the catalog and
// read by nothing outside a test.
//
// ⚠ THEY ARE NOT ALL THE SAME CLASS, and the difference is the whole finding.
// The brief for this cycle assumed they were "the statusTags class again".
// One is. Two are a class further gone:
//
//   entityTypes  — has a REAL CARRIER (`entity.type`) with a real reader:
//                  targeting, combat and perception all branch on it. So the
//                  declaration is a live contract and can be gated the way
//                  PSC-1 gates statusTags. One pack violated it.
//   combatTags   — 29 of the 34 values these two declare across the catalog
//   networkTags    appear NOWHERE in any pack's ruleset, catalog, statuses,
//                  progression trees, or booted world. They do not describe a
//                  field that exists. The five apparent hits are coincidences
//                  (`data-vault` is a ZONE ID; `supernatural`, `energy` and
//                  `collections` are entity/status tags that happen to share a
//                  word). A "used ⊆ declared" gate over them would be
//                  vacuously green forever, which is the exact vacuous-gate
//                  disease this repo keeps catching in its own validators.
//
// So this file ships TWO gates of different shapes, and the second one is the
// honest answer to a contract that cannot be conformance-checked:
//
//   1. CONFORMANCE (entityTypes) — every type a pack SHIPS is one it DECLARES.
//   2. COVERAGE (all three) — how much of each declared vocabulary real
//      content actually uses, pinned per value. Bidirectional: coverage
//      going UP means a contract came alive and the table moves in the same
//      commit; going DOWN is drift.
//
// @see [[feedback_baseline_before_enforce]], [[feedback_verify_fix_site_not_just_defect]]

import { describe, it, expect } from 'vitest';
import type { Engine } from '@ai-rpg-engine/core';
import { allPacks, type PackInfo } from './packs.js';

type ConventionField = 'entityTypes' | 'combatTags' | 'networkTags';

type ConventionCarrier = {
  contentConventions?: Partial<Record<ConventionField | 'statusTags', string[]>>;
};

function declared(pack: PackInfo, field: ConventionField): string[] {
  return (pack.ruleset as ConventionCarrier).contentConventions?.[field] ?? [];
}

/** Booted once per pack — every probe below reads the same world. */
const booted = new Map<string, Engine>();
function boot(pack: PackInfo): Engine {
  const existing = booted.get(pack.meta.id);
  if (existing) return existing;
  const engine = pack.createGame(1);
  booted.set(pack.meta.id, engine);
  return engine;
}

// --- Gate 1: entityTypes conformance ---------------------------------------

/** Every `entity.type` this pack's booted world actually contains. */
export function shippedEntityTypes(engine: Engine): Map<string, string[]> {
  const byType = new Map<string, string[]>();
  for (const entity of Object.values(engine.world.entities)) {
    byType.set(entity.type, [...(byType.get(entity.type) ?? []), entity.id]);
  }
  return byType;
}

function undeclaredEntityTypes(pack: PackInfo, engine = boot(pack)): string[] {
  const known = new Set(declared(pack, 'entityTypes'));
  return [...shippedEntityTypes(engine).keys()].filter((t) => !known.has(t)).sort();
}

describe('entity-type conformance × real catalog (PCC-1)', () => {
  it('every pack declares entityTypes at all', () => {
    for (const pack of allPacks) {
      expect(
        declared(pack, 'entityTypes').length,
        `${pack.meta.id} declares no contentConventions.entityTypes — the contract has to exist before it can be kept`,
      ).toBeGreaterThan(0);
    }
  });

  for (const pack of allPacks) {
    it(`${pack.meta.id}: every entity type it ships is one it declares`, () => {
      const missing = undeclaredEntityTypes(pack);
      const byType = shippedEntityTypes(boot(pack));
      expect(
        missing,
        `${pack.meta.id} boots entities whose type its own ruleset never declares.\n` +
          missing.map((t) => `    '${t}' — e.g. ${byType.get(t)!.slice(0, 3).join(', ')}`).join('\n') +
          `\n  declared: [${declared(pack, 'entityTypes').join(', ')}]\n` +
          '  Fix by WIDENING the declaration to match the shipped world, not by retyping entities\n' +
          '  to match a declaration written before that content existed.',
      ).toEqual([]);
    });
  }

  it('the declaration is not a reliable guide to what EXISTS — measured', () => {
    // The half a conformance gate cannot see, and the more useful half for
    // anyone writing a probe. Every pack declares flavour types it never
    // ships, and the shipped vocabulary is the same three everywhere. A reader
    // that trusted these declarations would look for `ice-agent`, `suspect` or
    // `zombie` and find nothing — which is the v3.7 probe bug from the other
    // side, where filtering for `npc` missed every hostile because hostiles
    // are `enemy`.
    const shipped = new Set(allPacks.flatMap((p) => [...shippedEntityTypes(boot(p)).keys()]));
    expect(
      [...shipped].sort(),
      'the catalog now ships an entity-type vocabulary wider than player/npc/enemy. That is\n' +
        '  fine — but every probe and rule that branches on `entity.type` was written against\n' +
        '  these three, so update this pin deliberately.',
    ).toEqual(['enemy', 'npc', 'player']);
  });
});

// --- Gate 2: does a declared vocabulary have anywhere to live? -------------

/**
 * Every string reachable inside a pack's authored content, ignoring the
 * declaration block itself — a declaration cannot be its own carrier.
 *
 * Deliberately exhaustive rather than field-targeted: the question is "does
 * this vocabulary appear ANYWHERE", and a targeted search would answer "not in
 * the places I thought to look", which is a different and much weaker claim.
 */
function authoredStrings(pack: PackInfo): Set<string> {
  const found = new Set<string>();
  const walk = (value: unknown, depth: number): void => {
    if (depth > 12) return;
    if (typeof value === 'string') {
      found.add(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1);
      return;
    }
    if (value && typeof value === 'object') {
      for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        if (key === 'contentConventions') continue;
        walk(item, depth + 1);
      }
    }
  };
  walk(pack.ruleset, 0);
  walk(pack.buildCatalog, 0);
  walk(pack.itemCatalog, 0);
  walk(pack.statusDefinitions, 0);
  walk(pack.progressionTrees, 0);
  const engine = boot(pack);
  walk(engine.world.entities, 0);
  walk(engine.world.zones, 0);
  walk(engine.world.factions, 0);
  return found;
}

/**
 * For one pack: which of each field's declared values appear anywhere in its
 * authored content, keyed `pack/field`.
 *
 * ⚠ PER-VALUE, and the first draft was per-FIELD — "does ANY declared value
 * appear" — which reported neon-lockbox's `networkTags` as carried. It is not:
 * `data-vault` appears because a ZONE IS CALLED THAT, and `firewall` because a
 * STATUS is tagged with it. Two coincidences out of four values were enough to
 * make a dead contract look live, which is a smaller version of exactly the
 * disease this file is about. Coverage per value cannot be fooled that way,
 * and it says something a boolean cannot: WHICH values are real.
 */
export function conventionCoverage(pack: PackInfo): Record<string, string[]> {
  const fields: ConventionField[] = ['entityTypes', 'combatTags', 'networkTags'];
  const coverage: Record<string, string[]> = {};
  // Each field is measured against ITS OWN carrier where one exists, and
  // against "anywhere in the content at all" only where none does. A second
  // draft correction: running the loose sweep over entityTypes reported
  // `pirate`, `zombie`, `survivor` and six more as covered — they appear as
  // entity TAGS and archetype names, not as `entity.type`. The loose sweep is
  // the right tool only for a vocabulary with no field to check against, and
  // using it where a precise carrier exists inflates the answer.
  const shipped = new Set(shippedEntityTypes(boot(pack)).keys());
  const authored = authoredStrings(pack);
  for (const field of fields) {
    const values = declared(pack, field);
    if (values.length === 0) continue;
    const present = field === 'entityTypes'
      ? (v: string) => shipped.has(v)
      : (v: string) => authored.has(v);
    coverage[`${pack.meta.id}/${field}`] = values.filter(present).sort();
  }
  return coverage;
}

/**
 * Measured 2026-07-28 against every pack in the catalog: for each declared
 * convention field, exactly which of its values appear anywhere in that pack's
 * ruleset, catalog, statuses, progression trees or booted world.
 *
 * THE FINDING, in one table. `entityTypes` rows carry their shipped types.
 * `combatTags` and `networkTags` rows are almost entirely EMPTY: 29 of the 34
 * values those two declare across the catalog appear nowhere, and the five
 * that do are coincidences — `data-vault` is a zone id, `supernatural`,
 * `energy` and `collections` are entity or status tags that happen to share a
 * word with a combat idea. They name a field the content model does not have.
 *
 * KEPT, not deleted, for the reason EDS-1 keeps its own list: these are the
 * pack authors' stated intent about how their combat and network fiction is
 * organised, and deleting them would destroy that signal to make a number
 * green. What is not acceptable is the table drifting unnoticed in either
 * direction.
 *
 * OWNER: whichever cycle gives combat vocabulary a carrier. The natural one is
 * an authored tag on the abilities a pack ships — and every pack currently
 * publishes ZERO abilities through `buildCatalog`, so the carrier itself would
 * need building first. That is a content-model change, not a gate, and doing
 * it inside a gate slice is how a gate slice becomes a content project.
 */
const MEASURED_COVERAGE: Record<string, string[]> = {
  'chapel-threshold/entityTypes': ['enemy', 'npc', 'player'],
  'chapel-threshold/combatTags': [],
  'neon-lockbox/entityTypes': ['enemy', 'npc', 'player'],
  'neon-lockbox/networkTags': ['data-vault'],
  'gaslight-detective/entityTypes': ['enemy', 'npc', 'player'],
  'gaslight-detective/combatTags': [],
  'black-flag-requiem/entityTypes': ['enemy', 'npc', 'player'],
  'black-flag-requiem/combatTags': [],
  'ashfall-dead/entityTypes': ['enemy', 'npc', 'player'],
  'ashfall-dead/combatTags': [],
  'dust-devils-bargain/entityTypes': ['enemy', 'npc', 'player'],
  'dust-devils-bargain/combatTags': ['supernatural'],
  'signal-loss/entityTypes': ['enemy', 'npc', 'player'],
  'signal-loss/combatTags': ['energy'],
  'crimson-court/entityTypes': ['enemy', 'npc', 'player'],
  'crimson-court/combatTags': ['supernatural'],
  'iron-colosseum/entityTypes': ['enemy', 'npc', 'player'],
  'iron-colosseum/combatTags': [],
  'jade-veil/entityTypes': ['enemy', 'npc', 'player'],
  'jade-veil/combatTags': [],
  'salt-road-ledger/entityTypes': ['enemy', 'npc', 'player'],
  'salt-road-ledger/combatTags': ['collections'],
};

function measureCoverage(): Record<string, string[]> {
  return Object.assign({}, ...allPacks.map(conventionCoverage)) as Record<string, string[]>;
}

describe('declared vocabulary has somewhere to live (PCC-1)', () => {
  it('the coverage of every declared convention is exactly what v3.8 measured', () => {
    expect(
      measureCoverage(),
      'a declared convention changed how much of it real content actually uses.\n' +
        '  MORE coverage is good and means a contract came alive — update this table in the same\n' +
        '  commit. LESS means content stopped using vocabulary it declares, which is drift.',
    ).toEqual(MEASURED_COVERAGE);
  });

  it('combatTags and networkTags are overwhelmingly unused — the headline, asserted', () => {
    // Stated as a number rather than left in prose, so it cannot quietly stop
    // being true while the table above absorbs the change row by row.
    let declaredValues = 0;
    let appearing = 0;
    for (const pack of allPacks) {
      for (const field of ['combatTags', 'networkTags'] as ConventionField[]) {
        const values = declared(pack, field);
        if (values.length === 0) continue;
        declaredValues += values.length;
        appearing += (conventionCoverage(pack)[`${pack.meta.id}/${field}`] ?? []).length;
      }
    }
    expect(declaredValues, 'nothing declares these any more — the finding is stale').toBe(34);
    expect(
      appearing,
      'combat/network vocabulary started appearing in content. If a carrier was built, this file\n' +
        '  should now gate conformance for that field the way it does for entityTypes.',
    ).toBe(5);
  });

  it('`entityTypes` is fully covered everywhere — the sweep can see a real carrier (control)', () => {
    // Without this row the sweep could be reporting near-zero coverage for
    // every field, which would satisfy the table above while measuring
    // nothing. entityTypes is the field with a real carrier, and every pack's
    // three shipped types are found by the same sweep that finds nothing for
    // combatTags.
    for (const pack of allPacks) {
      expect(
        conventionCoverage(pack)[`${pack.meta.id}/entityTypes`],
        `${pack.meta.id}: the sweep cannot see entity.type, so its combatTags verdict means nothing`,
      ).toEqual(['enemy', 'npc', 'player']);
    }
  });
});

// --- Mutation controls -----------------------------------------------------
//
// Both gates ship with a committed proof they can FAIL. A conformance gate
// that just went green across eleven packs is exactly the shape that hides a
// no-op — five validators in the v3.6 cycle were vacuous on first draft.

describe('meta: the convention gates fire on a violation (PCC-1 negative controls)', () => {
  const control = allPacks.find((p) => p.meta.id === 'black-flag-requiem')!;

  it('an entity typed with undeclared vocabulary is caught', () => {
    const engine = control.createGame(1);
    engine.world.entities['__pcc_probe'] = {
      ...Object.values(engine.world.entities)[0],
      id: '__pcc_probe',
      type: '__pcc_undeclared_type',
    };
    expect(
      undeclaredEntityTypes(control, engine),
      'the gate accepted an entity typed with vocabulary no pack declares — it cannot detect drift',
    ).toEqual(['__pcc_undeclared_type']);
  });

  it('and an entity using only DECLARED vocabulary is not', () => {
    // The other direction: a gate that flagged everything would also "catch"
    // the violation above while being useless.
    const engine = control.createGame(1);
    engine.world.entities['__pcc_probe'] = {
      ...Object.values(engine.world.entities)[0],
      id: '__pcc_probe',
      type: declared(control, 'entityTypes')[0],
    };
    expect(undeclaredEntityTypes(control, engine)).toEqual([]);
  });

  it('the carrier sweep sees a value that IS authored, and one that is not', () => {
    const authored = authoredStrings(control);
    // Every pack's own id appears in its content; a made-up string does not.
    expect(authored.has(control.meta.id)).toBe(true);
    expect(authored.has('__pcc_definitely_not_authored')).toBe(false);
  });
});
