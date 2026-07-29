// c0-version-skew.test.ts — P4 of the C0 Forge↔Engine alignment audit.
//
// `packages/export-ai-rpg/src/ENGINE_CONTRACT.md` (world-forge) opened with:
// "This exporter depends on the ai-rpg-engine 2.x API. If the engine ships a
// 3.x major, work through the checklist below *before* bumping the dep ranges."
// The engine shipped 3.0.0 and reached 3.8.0 with not one of the eight
// checklist boxes ticked.
//
// This file works each item as a FINDING against current engine source. It
// fixes nothing — every assertion PINS today's reality so a later cycle that
// closes an item fails loudly here instead of leaving a stale report behind.
//
// ⚠ FOUR ITEMS FLIPPED 2026-07-29 (5 of 8 now closed). The mechanism worked as
// designed — the report did not silently rot — but it took two cycles to
// collect, so the flips are dated individually below rather than presented as
// one event:
//   - items 2 and 3 were closed by C1 (`>=3.8.0 <4.0.0` in both places; 18
//     module ids cut to 12, all resolving). C1 did not come back to flip them
//     here, which left this file contradicting its own sibling `c1-gate.test.ts`
//     two directories over.
//   - items 1 and 7 were closed by the engine-deps errand, and flipping item 1
//     is that errand's one authorised change to this repo.
// Items 4, 6 and 8 remain open and are NOT reframed. Item 5 was closed at
// audit time. Where a finding is superseded rather than deleted, the original
// sentence is quoted so the correction is legible.
//
// Assertions read live engine exports wherever possible; where the fact lives
// in world-forge (a repo this suite cannot import), it is transcribed with a
// file:line citation and the world-forge half of the audit asserts it.

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { VALID_GENRES, VALID_TONES, VALID_DIFFICULTIES } from '@ai-rpg-engine/pack-registry';
import { EQUIPMENT_SLOTS, ITEM_RARITIES } from '@ai-rpg-engine/equipment';
import { FIXTURE_PACK_PATH } from './c0/fixture-path.js';

/**
 * `DEFAULT_MODULES` as world-forge's `convert-pack.ts:48-67` declares it, with
 * the comment "Current baseline: engine v2.0.0 standard module set."
 */
const FORGE_DEFAULT_MODULES = [
  'combat-core', 'movement-core', 'npc-ai-core', 'dialogue-core',
  'perception-filter', 'district-core', 'faction-core', 'leverage-core',
  'rumor-core', 'pressure-core', 'companion-core', 'equipment-core',
  'relationship-core', 'economy-core', 'opportunity-core', 'crafting-core',
  'arc-core', 'endgame-core',
];

/**
 * Module ids the engine actually declares at 3.8.0, harvested across every
 * package from BOTH literal `id: '<name>'` declarations and `*_MODULE_ID`
 * constants, excluding test files.
 *
 * ⚠ The constants half is not optional and the first harvest omitted it,
 * reporting `economy-core` as nonexistent. It is real — its id comes from
 * `ECONOMY_MODULE_ID` (modules/src/economy-core.ts:530), and `companion-core`
 * is declared the same way and would have been the next false positive. A
 * grep-shaped harvest finds the shape it greps for.
 */
const ENGINE_MODULE_IDS = [
  'ability-core', 'ability-effects', 'ability-review', 'cognition-core',
  'combat-core', 'combat-recovery', 'combat-review', 'companion-core',
  'contract-core', 'crafting-core', 'dialogue-core', 'district-core',
  'economy-core', 'encounter-spawn', 'engagement-core', 'environment-core',
  'equipment-core', 'inventory-core', 'item-chronicle-core',
  'meditation-recovery', 'opportunity-core', 'perception-filter',
  'progression-core', 'pursuit-core', 'quest-core', 'rumor-propagation',
  'simulation-inspector', 'status-core', 'trade-core', 'traversal-core',
];

/** `GENRE_MAP` targets in world-forge's `convert-pack.ts:8-20`. */
const FORGE_GENRE_TARGETS = [
  'fantasy', 'sci-fi', 'cyberpunk', 'horror', 'mystery', 'western',
  'pirate', 'post-apocalyptic', 'historical',
];
/** `TONE_MAP` targets, `convert-pack.ts:23-32`. */
const FORGE_TONE_TARGETS = [
  'dark', 'gritty', 'heroic', 'noir', 'comedic', 'eerie', 'tense', 'atmospheric',
];
/** `DIFFICULTY_MAP` targets, `convert-pack.ts:35-42`. */
const FORGE_DIFFICULTY_TARGETS = ['beginner', 'intermediate', 'advanced'];
/** `VALID_ITEM_SLOTS` / `VALID_ITEM_RARITIES`, `convert-items.ts`. */
const FORGE_ITEM_SLOTS = ['weapon', 'armor', 'accessory', 'tool', 'trinket'];
const FORGE_ITEM_RARITIES = ['common', 'uncommon', 'rare', 'legendary'];

export interface SkewItem {
  item: number;
  checklistText: string;
  status: 'open' | 'closed';
  finding: string;
}

export const SKEW_FINDINGS: SkewItem[] = [];
function record(item: SkewItem) {
  SKEW_FINDINGS.push(item);
}

describe('C0/P4 — the eight 3.x-bump checklist items, worked as findings', () => {
  it('1. dep ranges — CLOSED 2026-07-29: the exporter type-checks against 3.x', () => {
    // The finding, as it stood: "world-forge/packages/export-ai-rpg/package.json
    // still pins content-schema ^2.0.1, core ^2.0.1, modules ^2.1.0,
    // pack-registry ^2.0.2, character-creation ^2.0.2, equipment ^2.0.2 — and
    // those exact versions are what its node_modules resolves." It was stronger
    // than the hard-coded string in item 2: every type the converters were
    // checked against was the 2.x type, so a field the engine added in 3.x was
    // not merely unset by the exporter — it was invisible to it.
    //
    // Closed by the engine-deps errand. All six ranges are ^3.8.0 and all six
    // RESOLVE at 3.8.0, which are two different facts: that errand produced a
    // tree where the declared ranges were all correct and content-schema@3.8.0
    // still sat on core@2.0.1. world-forge asserts both live, in
    // `packages/export-ai-rpg/src/__tests__/engine-deps-3x.test.ts`.
    //
    // (An earlier draft called this "two majors old". The cross-family jury's
    // glm-5.2 seat refuted it and was right: 2.x → 3.x is ONE major behind.
    // Eight minor releases of drift, one major boundary.)
    record({
      item: 1,
      checklistText: 'Bump the six @ai-rpg-engine/* dep ranges in package.json.',
      status: 'closed',
      finding:
        'CLOSED 2026-07-29 by the engine-deps errand. All six ranges declare ^3.8.0 and all six resolve 3.8.0; asserted live in world-forge engine-deps-3x.test.ts, which checks declaration and resolution separately because the first install of that errand got the declarations right and left content-schema@3.8.0 on core@2.0.1. Superseded finding: "Unchanged. Installed: content-schema 2.0.1, core 2.0.1, modules 2.1.0, pack-registry 2.0.2, equipment 2.0.2, character-creation 2.0.2. Engine ships 3.8.0. The export lane compiles against a surface one major behind, so every 3.x addition is invisible to it at type-check time."',
    });
    expect(SKEW_FINDINGS.at(-1)!.status).toBe('closed');
  });

  it('2. engineVersion — CLOSED by C1: the pack declares a range the gate checks', () => {
    // Was: "the pack self-reports 2.0.0 and loads clean anyway" — convert-pack.ts
    // :81 and :134 both carried the literal, and nothing on the intake path read
    // it, so it was a claim no consumer checked.
    //
    // C1 replaced both with ENGINE_VERSION_RANGE ('>=3.8.0 <4.0.0') and gave the
    // load gate a check that reads it. `c1-gate.test.ts` asserts the committed
    // forge manifest carries the range and that the gate's engine-version check
    // passes on it.
    const raw = JSON.parse(fs.readFileSync(FIXTURE_PACK_PATH, 'utf-8')) as Record<string, unknown>;
    // Unchanged and still pinned: the ContentPack itself carries no
    // engineVersion — it rides on the manifest and packMeta, which the pack file
    // does not contain. Closing item 2 did not move it into the pack.
    expect(raw.engineVersion).toBeUndefined();
    record({
      item: 2,
      checklistText: "Update hard-coded engineVersion: '2.0.0' in convert-pack.ts.",
      status: 'closed',
      finding:
        'CLOSED by C1. Both sites now emit ENGINE_VERSION_RANGE (">=3.8.0 <4.0.0") and the four-check load gate reads it, so it is a checked claim rather than a comment; c1-gate.test.ts asserts the committed forge manifest carries the range and passes the engine-version check. Flipped here 2026-07-29 — C1 closed it and did not return to this file. Superseded finding: "Unchanged at convert-pack.ts:81 (GameManifest) and :134 (PackMetadata). Nothing on the engine\'s intake path reads engineVersion, so the stale value produces no error anywhere — it is a claim no consumer checks."',
    });
  });

  it('3. DEFAULT_MODULES — CLOSED by C1: the 18-id list that follows is HISTORY', () => {
    // ⚠ READ THIS BEFORE THE ASSERTIONS. `FORGE_DEFAULT_MODULES` is the list as
    // it stood at C0 — eighteen ids, nine of them naming nothing. The forge no
    // longer emits it: C1 cut it to twelve, dropping six pure phantoms and
    // remapping three near-misses (movement-core→traversal-core,
    // npc-ai-core→cognition-core, rumor-core→rumor-propagation).
    //
    // The assertions below are kept and still pass, because they are about the
    // OLD list and the old list has not changed — it is history. What they pin
    // is the size of the hole C1 closed, and the near-miss facts that made it
    // invisible. The live check on what the forge emits TODAY is in
    // `c1-gate.test.ts` (against this repo's ModuleManager) and in world-forge's
    // `c1-manifest-truth.test.ts` (against a booted published starter).
    const engineSet = new Set(ENGINE_MODULE_IDS);
    const phantom = FORGE_DEFAULT_MODULES.filter((m) => !engineSet.has(m));
    const real = FORGE_DEFAULT_MODULES.filter((m) => engineSet.has(m));

    expect(phantom.sort()).toEqual([
      'arc-core', 'endgame-core', 'faction-core', 'leverage-core',
      'movement-core', 'npc-ai-core', 'pressure-core', 'relationship-core', 'rumor-core',
    ]);
    expect(real.sort()).toEqual([
      'combat-core', 'companion-core', 'crafting-core', 'dialogue-core',
      'district-core', 'economy-core', 'equipment-core', 'opportunity-core',
      'perception-filter',
    ]);

    // Three phantoms are near-misses for real modules under other names, which
    // is what makes the whole list read plausible.
    expect(engineSet.has('traversal-core')).toBe(true); // vs the forge's movement-core
    expect(engineSet.has('cognition-core')).toBe(true); // vs npc-ai-core
    expect(engineSet.has('rumor-propagation')).toBe(true); // vs rumor-core
    // `pressure-core` has a near-miss too, but only as a SOURCE FILE
    // (modules/src/pressure-system.ts) — it registers no module id at all, so
    // pressure has no entry in this registry under any name.
    expect(engineSet.has('pressure-system')).toBe(false);

    // And nothing catches it: manifest validation checks that `modules` is an
    // array of strings and never that any id resolves.
    record({
      item: 3,
      checklistText: 'Re-verify DEFAULT_MODULES against the 3.x module registry.',
      status: 'closed',
      finding:
        'CLOSED by C1, flipped here 2026-07-29. The 18-id list was cut to 12: six pure phantoms dropped (faction-core, leverage-core, pressure-core, relationship-core, arc-core, endgame-core) and three near-misses remapped (movement-core→traversal-core, npc-ai-core→cognition-core, rumor-core→rumor-propagation). The mechanism that failed was a comment asking a human to keep two repos in sync; it is now two live resolutions — c1-gate.test.ts against this repo\'s booted ModuleManager, and world-forge c1-manifest-truth.test.ts against a booted published starter. The 18-id list retained in this file is history, and the assertions on it still pass because history does not change. Superseded finding: "Unchanged, and not merely stale: NINE of the eighteen ids the exporter writes into every manifest do not exist anywhere in the engine at 3.8.0… Manifest validation (core/src/manifest.ts:77-89) checks only that `modules` is an array of strings — no id is ever resolved — so a manifest naming ten nonexistent modules passes every gate the engine has."',
    });
  });

  it('4. tone / genre / difficulty maps — OPEN for genre, CLEAN for tone + difficulty', () => {
    // Tone and difficulty happen to still match exactly.
    expect([...FORGE_TONE_TARGETS].sort()).toEqual([...VALID_TONES].sort());
    expect([...FORGE_DIFFICULTY_TARGETS].sort()).toEqual([...VALID_DIFFICULTIES].sort());

    // Genre does not: 3.x added two the forge can never emit.
    const unreachable = VALID_GENRES.filter((g) => !FORGE_GENRE_TARGETS.includes(g));
    expect(unreachable.sort()).toEqual(['mercantile', 'pursuit']);

    // Which matters concretely: those two genres are the two newest STARTERS —
    // the merchant and bounty-hunter packs the engine shipped in 3.5 and 3.8.
    // A forge author cannot author a pack of either genre; the silent
    // GENRE_MAP fallback turns any attempt into 'fantasy'.
    record({
      item: 4,
      checklistText: 'Re-verify TONE_MAP, GENRE_MAP, DIFFICULTY_MAP against 3.x enums.',
      status: 'open',
      finding:
        "TONE_MAP (8 targets) and DIFFICULTY_MAP (3 targets) still match VALID_TONES and VALID_DIFFICULTIES exactly. GENRE_MAP does not: 3.x added 'mercantile' and 'pursuit' to VALID_GENRES and no GENRE_MAP entry targets either, so a forge author cannot produce a pack of the two newest starter genres — and the silent fallback at convert-pack.ts:102 turns the attempt into 'fantasy' with no warning.",
    });
  });

  it('5. item slots + rarities — CLOSED by coincidence, with a forge-side hole beneath it', () => {
    expect([...FORGE_ITEM_SLOTS].sort()).toEqual([...EQUIPMENT_SLOTS].sort());
    expect([...FORGE_ITEM_RARITIES].sort()).toEqual([...ITEM_RARITIES].sort());
    record({
      item: 5,
      checklistText: 'Re-verify VALID_ITEM_SLOTS / VALID_ITEM_RARITIES in convert-items.ts.',
      status: 'closed',
      finding:
        "Both lists still match the engine exactly (EquipmentSlot 5/5, ItemRarity 4/4) — the only checklist item 3.x did not invalidate. Beneath it sits a FORGE-side hole this audit found independently: world-forge's own ItemSlot type has SIX members, and the sixth ('consumable') is silently narrowed to 'trinket' by convert-items with no warning and no fidelity entry.",
    });
  });

  it('6. role maps — OPEN in effect: the engine has no role vocabulary to verify against', () => {
    // ROLE_TO_TYPE / ROLE_TAGS / ROLE_AI_PROFILE map six forge roles onto
    // EntityBlueprint.type, which content-schema declares as a bare `string`
    // with no enum and no validation. There is nothing to re-verify AGAINST —
    // which reads as "clean" and is really "unconstrained".
    const raw = JSON.parse(fs.readFileSync(FIXTURE_PACK_PATH, 'utf-8')) as Record<string, unknown>;
    const types = new Set((raw.entities as Array<{ type: string }>).map((e) => e.type));
    expect([...types].sort()).toEqual(['enemy', 'npc']);
    record({
      item: 6,
      checklistText: 'Re-verify ROLE_TO_TYPE, ROLE_TAGS, ROLE_AI_PROFILE in convert-entities.ts.',
      status: 'open',
      finding:
        "Nothing to verify against, which is itself the finding: `EntityBlueprint.type` is declared as a bare string in content-schema with no enum and no validation, so the exporter's six-roles-to-two-types collapse can never be caught by a type or a gate. Shipped starters use 'npc' and 'enemy' by convention only. Same for aiProfile, a free string the exporter substitutes a role default into when unset.",
    });
  });

  it('7. suite + fixtures — CLOSED 2026-07-29: run against 3.x, zero fixture churn', () => {
    // ENGINE_CONTRACT.md line 30: "Dialogue node `text` is an array of
    // `{ text: string }` blocks on 2.x." At 3.8.0 the type is
    // `string | TextBlock[]` (content-schema/src/schemas.ts:289) — widened, so
    // the exporter's plain-string output is valid. It was ALSO emitting a plain
    // string under the 2.x note, so either the note was wrong when written or
    // the widening rescued it after the fact.
    const raw = JSON.parse(fs.readFileSync(FIXTURE_PACK_PATH, 'utf-8')) as Record<string, unknown>;
    const dialogue = (raw.dialogues as Array<{ nodes: Record<string, { text: unknown }> }>)[0];
    const texts = Object.values(dialogue.nodes).map((n) => typeof n.text);
    expect(new Set(texts)).toEqual(new Set(['string']));
    record({
      item: 7,
      checklistText: 'Run the full test suite; update fixtures if engine record shapes changed.',
      status: 'closed',
      finding:
        "CLOSED 2026-07-29 by the engine-deps errand: world-forge's suite ran against the 3.x deps — 133 files / 2412 tests green, build clean — and NOT ONE FIXTURE CHANGED. The item's own observation is unaffected and still pinned above: the contract's runtime note ('Dialogue node text is an array of { text } blocks on 2.x') never described what the exporter emits, since convert-dialogues writes a plain string. At 3.8.0 DialogueNode.text is `string | TextBlock[]` (schemas.ts:289), so the constraint was widened out of existence rather than satisfied. The pack still disagrees with itself: zone descriptions ARE wrapped in TextBlock arrays while dialogue text is not.",
    });
  });

  it('8. major version bump — OPEN, deferred to release-time bookkeeping', () => {
    record({
      item: 8,
      checklistText: "Bump this package's major version (breaking change for consumers).",
      status: 'open',
      finding:
        '@world-forge/export-ai-rpg is at 4.5.0, versioned with the World Forge monorepo rather than against the engine surface it targets. Item 1 is now done, so the breaking change EXISTS — consumers pinning engine 2.x get a duplicated engine or a resolution failure — but the bump is release-time bookkeeping and the errand that made the change had no authority to publish, tag or bump. Recorded as a standing release note in ENGINE_CONTRACT.md; the next release of that package takes a major and says so in its CHANGELOG.',
    });

    // Three of eight open, and the numbers are recorded rather than written so
    // the report cannot drift from the file. Was 7 of 8 at the C0 audit; C1
    // closed 2 and 3, the engine-deps errand closed 1 and 7, and 5 was closed on
    // the day it was written. What is left is 4 (the GENRE_MAP gap, an ANDON —
    // the forge has three genre vocabularies that disagree, so two identity
    // entries are not the mechanical fix they look like), 6 (nothing to verify
    // against: EntityBlueprint.type is still a bare string), and 8 above.
    expect(SKEW_FINDINGS).toHaveLength(8);
    expect(SKEW_FINDINGS.filter((f) => f.status === 'open')).toHaveLength(3);
    expect(SKEW_FINDINGS.filter((f) => f.status === 'open').map((f) => f.item)).toEqual([4, 6, 8]);
  });
});

describe('C0/P4 — the end-to-end chain, live', () => {
  it('the exported pack validates clean, and the report names a third of it', () => {
    // The verbatim CLI transcript lives in REPORT.md; this pins the two facts
    // that make it worth reading.
    const raw = JSON.parse(fs.readFileSync(FIXTURE_PACK_PATH, 'utf-8')) as Record<string, unknown>;
    expect(Object.keys(raw)).toHaveLength(12);
    // `ai-rpg-engine validate` prints "3 entities, 3 zones, 1 dialogues, 0 quests".
    expect(raw.entities).toHaveLength(3);
    expect(raw.zones).toHaveLength(3);
    expect(raw.dialogues).toHaveLength(1);
    expect(raw.quests).toBeUndefined();
  });

  it('writes docs/c0-alignment/version-skew.json', () => {
    const artifact = {
      audit: 'C0 — ENGINE_CONTRACT.md 3.x-bump checklist, worked as findings',
      source: 'world-forge/packages/export-ai-rpg/src/ENGINE_CONTRACT.md',
      engineVersionAtAudit: '3.8.0',
      contractTargets: '2.x',
      generatedBy: 'packages/cli/src/c0-version-skew.test.ts',
      openItems: SKEW_FINDINGS.filter((f) => f.status === 'open').length,
      closedItems: SKEW_FINDINGS.filter((f) => f.status === 'closed').length,
      items: SKEW_FINDINGS.sort((a, b) => a.item - b.item),
      moduleDiff: {
        forgeDeclares: FORGE_DEFAULT_MODULES,
        engineDeclares: ENGINE_MODULE_IDS,
        phantom: FORGE_DEFAULT_MODULES.filter((m) => !ENGINE_MODULE_IDS.includes(m)),
        harvestCaveat:
          'Harvest BOTH literal `id:` declarations and `*_MODULE_ID` constants, excluding tests. The first pass matched only literals and reported economy-core as phantom; it is real (ECONOMY_MODULE_ID, modules/src/economy-core.ts:530), and companion-core would have been the next false positive. Note also that `pressure` has no module id under any name — modules/src/pressure-system.ts is a source file that registers none.',
        harvestCommand:
          "grep -rhoE \"id: '[a-z][a-z0-9-]*'\" packages/*/src/*.ts | grep -vE '\\.test\\.' | sort -u",
      },
    };
    expect(artifact.items).toHaveLength(8);

    const outDir = path.resolve(import.meta.dirname, '../../../docs/c0-alignment');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
      path.join(outDir, 'version-skew.json'),
      `${JSON.stringify(artifact, null, 2)}\n`,
      'utf-8',
    );
  });
});
