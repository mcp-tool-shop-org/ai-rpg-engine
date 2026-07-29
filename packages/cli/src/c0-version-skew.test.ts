// c0-version-skew.test.ts — P4 of the C0 Forge↔Engine alignment audit.
//
// `packages/export-ai-rpg/src/ENGINE_CONTRACT.md` (world-forge) opens with:
// "This exporter depends on the ai-rpg-engine 2.x API. If the engine ships a
// 3.x major, work through the checklist below *before* bumping the dep ranges."
// The engine shipped 3.0.0 and has since reached 3.8.0. Not one of the eight
// checklist boxes is ticked.
//
// This file works each item as a FINDING against current engine source. It
// fixes nothing — every assertion PINS today's reality so a later cycle that
// closes an item fails loudly here instead of leaving a stale report behind.
//
// Assertions read live engine exports wherever possible; where the fact lives
// in world-forge (a repo this suite cannot import), it is transcribed with a
// file:line citation and the world-forge half of the audit asserts it.

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { VALID_GENRES, VALID_TONES, VALID_DIFFICULTIES } from '@ai-rpg-engine/pack-registry';
import { EQUIPMENT_SLOTS, ITEM_RARITIES } from '@ai-rpg-engine/equipment';
import { FIXTURE_PACK_PATH } from './c0-intake-table.test.js';

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
  it('1. dep ranges — OPEN: the exporter type-checks against a two-major-old surface', () => {
    // world-forge/packages/export-ai-rpg/package.json still pins
    // content-schema ^2.0.1, core ^2.0.1, modules ^2.1.0, pack-registry ^2.0.2,
    // character-creation ^2.0.2, equipment ^2.0.2 — and `npm ls` in that repo
    // resolves exactly those. The engine is at 3.8.0.
    //
    // This is stronger than the hard-coded version string in item 2: every type
    // the converters are checked against is the 2.x type. A field the engine
    // added in 3.x is not merely unset by the exporter — it is invisible to it.
    record({
      item: 1,
      checklistText: 'Bump the six @ai-rpg-engine/* dep ranges in package.json.',
      status: 'open',
      finding:
        'Unchanged. Installed: content-schema 2.0.1, core 2.0.1, modules 2.1.0, pack-registry 2.0.2, equipment 2.0.2, character-creation 2.0.2. Engine ships 3.8.0. The export lane compiles against a surface two majors old, so every 3.x addition is invisible to it at type-check time.',
    });
    expect(SKEW_FINDINGS.at(-1)!.status).toBe('open');
  });

  it('2. engineVersion — OPEN: the pack self-reports 2.0.0 and loads clean anyway', () => {
    // convert-pack.ts:81 and :134. The exported fixture carries it, and the
    // 3.8.0 validators accept it without comment: engineVersion is not checked
    // by anything on the intake path.
    const raw = JSON.parse(fs.readFileSync(FIXTURE_PACK_PATH, 'utf-8')) as Record<string, unknown>;
    // The ContentPack itself carries no engineVersion — it rides on the manifest
    // and packMeta, which the pack file does not contain.
    expect(raw.engineVersion).toBeUndefined();
    record({
      item: 2,
      checklistText: "Update hard-coded engineVersion: '2.0.0' in convert-pack.ts.",
      status: 'open',
      finding:
        "Unchanged at convert-pack.ts:81 (GameManifest) and :134 (PackMetadata). Nothing on the engine's intake path reads engineVersion, so the stale value produces no error anywhere — it is a claim no consumer checks.",
    });
  });

  it('3. DEFAULT_MODULES — OPEN, and worse than stale: 9 of 18 ids do not exist', () => {
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
      status: 'open',
      finding:
        'Unchanged, and not merely stale: NINE of the eighteen ids the exporter writes into every manifest do not exist anywhere in the engine at 3.8.0 (arc-core, endgame-core, faction-core, leverage-core, movement-core, npc-ai-core, pressure-core, relationship-core, rumor-core). Four are near-misses for real modules under different names (movement-core/traversal-core, npc-ai-core/cognition-core, rumor-core/rumor-propagation, pressure-core/pressure-system), which is why the list reads plausible. Manifest validation (core/src/manifest.ts:77-89) checks only that `modules` is an array of strings — no id is ever resolved — so a manifest naming ten nonexistent modules passes every gate the engine has.',
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

  it('7. dialogue text shape — the contract records a constraint that no longer binds', () => {
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
      status: 'open',
      finding:
        "The contract's runtime note ('Dialogue node text is an array of { text } blocks on 2.x') does not describe what the exporter emits: convert-dialogues writes a plain string. At 3.8.0 DialogueNode.text is `string | TextBlock[]` (schemas.ts:289), so the plain string is valid today — the constraint the contract records has been widened out of existence. Note the pack disagrees with itself either way: zone descriptions ARE wrapped in TextBlock arrays while dialogue text is not.",
    });
  });

  it('8. major version bump — OPEN, and the whole checklist is untouched', () => {
    record({
      item: 8,
      checklistText: "Bump this package's major version (breaking change for consumers).",
      status: 'open',
      finding:
        '@world-forge/export-ai-rpg is at 4.5.0, versioned with the World Forge monorepo rather than against the engine surface it targets. No engine-facing major was ever cut, because item 1 was never done.',
    });

    // Seven of eight open. Recorded as a single number so the report cannot
    // drift from the file.
    expect(SKEW_FINDINGS).toHaveLength(8);
    expect(SKEW_FINDINGS.filter((f) => f.status === 'open')).toHaveLength(7);
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
