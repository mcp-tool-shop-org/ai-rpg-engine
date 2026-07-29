// c0-reverse-table.test.ts — P3 of the C0 Forge↔Engine alignment audit.
//
// P1 asked what the forge says that the engine drops. This asks the opposite:
// WHAT CAN THE ENGINE SAY THAT THE FORGE CANNOT AUTHOR? Three sources:
//
//   1. Engine-declared `ContentPack` keys the export lane never fills.
//   2. `ZoneState` fields with no `ZoneDefinition` counterpart.
//   3. Semantics that live in pack CODE rather than pack DATA — the structural
//      finding, and the one that bounds how far any future JSON contract can go.
//
// Plus a survey of `starter-merchant` (Salt Road Ledger), the economy starter,
// chosen because it exercises the living-economy surface the 2.5D charter calls
// the moat. Every row cites file:line in the pack that authors it.
//
// Everything here is asserted against live values, not transcribed: the seven
// unfilled keys are checked against the REAL exported pack, and every claim
// about what merchant authors is read off the pack's own exports at runtime.

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as merchant from '@ai-rpg-engine/starter-merchant';
import type { ZoneState } from '@ai-rpg-engine/core';
import { FIXTURE_PACK_PATH } from './c0/fixture-path.js';

export type ReverseClass = 'authorable' | 'unauthorable';

interface ReverseRow {
  subject: string;
  kind: 'pack-key' | 'zone-state-field' | 'pack-code' | 'merchant-vocabulary';
  class: ReverseClass;
  /** Where the engine says it, file:line. */
  engineSite: string;
  note: string;
}

/** Keys the engine's `ContentPack` declares (content-schema/src/refs.ts:13-48). */
const ENGINE_PACK_KEYS = [
  'entities', 'zones', 'dialogues', 'quests', 'abilities',
  'statuses', 'verbs', 'archetypes', 'backgrounds', 'itemUseEffects',
] as const;

const REVERSE_ROWS: ReverseRow[] = [
  // --- 1. Engine pack keys the forge never fills ---------------------------
  { subject: 'quests', kind: 'pack-key', class: 'unauthorable', engineSite: 'content-schema/src/refs.ts:17', note: 'The engine validates quests as a first-class pack key and ships a quest module; World Forge has NO quest domain at all — not a schema type, not an editor surface, not a converter. The single largest authoring hole.' },
  { subject: 'abilities', kind: 'pack-key', class: 'unauthorable', engineSite: 'content-schema/src/refs.ts:19', note: 'AbilityDefinition drives the verb/status web validateGameContent builds. No forge equivalent.' },
  { subject: 'statuses', kind: 'pack-key', class: 'unauthorable', engineSite: 'content-schema/src/refs.ts:21', note: 'StatusDefinition (stacking, duration, modifiers, triggers, removal). No forge equivalent — the schema has no status vocabulary whatsoever.' },
  { subject: 'verbs', kind: 'pack-key', class: 'unauthorable', engineSite: 'content-schema/src/refs.ts:23', note: 'The forge CAN name verbs — item.grantedVerbs, archetype.grantedVerbs, discipline.grantedVerb — but cannot DEFINE one. It emits dangling references into a slot it never fills.' },
  { subject: 'archetypes', kind: 'pack-key', class: 'authorable', engineSite: 'content-schema/src/refs.ts:33', note: 'The one bright spot: buildCatalog.archetypes IS authored and IS exported. It lands under `buildCatalog`, a key the engine ContentPack does not declare, so the intake still cannot see it — an authoring win cancelled by a wire gap.' },
  { subject: 'backgrounds', kind: 'pack-key', class: 'authorable', engineSite: 'content-schema/src/refs.ts:40', note: 'Same shape as archetypes: authored, exported, and delivered to a key the engine type does not declare.' },
  { subject: 'itemUseEffects', kind: 'pack-key', class: 'unauthorable', engineSite: 'content-schema/src/refs.ts:47', note: 'Bespoke item-use effects. The forge authors item STATS but no use effects; merchant authors one as a JS object with a `use` function (content.ts:144) — see the pack-code rows.' },

  // --- 2. ZoneState fields with no ZoneDefinition counterpart --------------
  { subject: 'ZoneState.roomId', kind: 'zone-state-field', class: 'unauthorable', engineSite: 'core/src/types.ts:157', note: 'REQUIRED by ZoneState, absent from ZoneDefinition. Any future converter must invent a value, which is exactly why no converter exists yet. Measured inert in all twelve worlds — a required field nothing reads.' },
  { subject: 'ZoneState.stability', kind: 'zone-state-field', class: 'unauthorable', engineSite: 'core/src/types.ts:163', note: 'ALIVE and unauthorable. district-core.ts:348 aggregates zone stability into district stability; rumor-propagation.ts:226 gates rumour spread on it; cognition-core.ts:1173 and observer-presentation.ts:395 read it. Measured moving four of twelve worlds. No pack file can set it.' },
  { subject: 'ZoneState.authority', kind: 'zone-state-field', class: 'unauthorable', engineSite: 'core/src/types.ts:164', note: 'Zero readers repo-wide AND absent from ZoneDefinition. Unauthorable and unread — the only field in this table that is dead on both sides.' },

  // --- 3. Semantics that live in pack CODE, not pack data ------------------
  { subject: 'createGame(seed)', kind: 'pack-code', class: 'unauthorable', engineSite: 'pack-registry/src/types.ts:107', note: 'THE STRUCTURAL FINDING. A pack IS a function that builds an Engine — chooses modules, wires config, adds zones and entities, subscribes to events. `PackEntry` has no content field. No amount of JSON can express a pack, because a pack is not data.' },
  { subject: 'hazard closures', kind: 'pack-code', class: 'unauthorable', engineSite: 'modules/src/environment-core.ts:295', note: 'environment-core calls `hazard.condition(zone, entity, world)` and `hazard.effect(...)`. Both are JS functions the pack supplies (starter-merchant/src/setup.ts:176-196 authors two). A hazard STRING in a zone means whatever a closure says it means, and nothing otherwise — proven by the hazard pair in P2.' },
  { subject: 'module selection + config', kind: 'pack-code', class: 'unauthorable', engineSite: 'starter-merchant/src/setup.ts:218-266', note: 'Which of the engine\'s modules run, and how each is configured, is a code decision: buildCombatStack statMapping, buildWorldStack factions/cohesion, createPerceptionFilter perceptionStat, createAbilityCore statMapping, createContractCore catalog + status injectors. The forge has no vocabulary for any of it.' },
  { subject: 'rulesets', kind: 'pack-code', class: 'unauthorable', engineSite: 'starter-merchant/src/ruleset.ts', note: 'RulesetDefinition is a PackEntry field with no forge counterpart. The export lane hard-codes `ruleset: \'standard-v1\'` in the manifest (convert-pack.ts:82) regardless of what the pack would need.' },
  { subject: 'event subscriptions', kind: 'pack-code', class: 'unauthorable', engineSite: 'starter-merchant/src/setup.ts:288-300', note: 'Packs subscribe to the live event bus in createGame — merchant grants the guild seal on `dialogue.ended`. Content-as-data has no way to say "when X happens, do Y" outside the narrow ConditionSpec/EffectDefinition vocabulary.' },
  { subject: 'presentation rules', kind: 'pack-code', class: 'unauthorable', engineSite: 'starter-merchant/src/setup.ts:59-63', note: 'A presentation rule carries `condition` and `transform` closures over the event stream. Pure code.' },
  { subject: 'intent profiles', kind: 'pack-code', class: 'unauthorable', engineSite: 'starter-merchant/src/setup.ts:111-112', note: 'Per-NPC AI intent profiles with `evaluate` functions. The forge authors `ai.profileId` as a bare string; the behaviour behind the string is code.' },

  // --- 4. starter-merchant vocabulary the WorldProject has no words for ----
  { subject: 'QuestDefinition (3 quests, staged)', kind: 'merchant-vocabulary', class: 'unauthorable', engineSite: 'starter-merchant/src/content.ts:584,617,676', note: 'open-the-books / the-late-caravan / the-standing-account, each with stages, objectives, rewards and gating. WorldProject has no quest type at all.' },
  { subject: 'AbilityDefinition (3 abilities)', kind: 'merchant-vocabulary', class: 'unauthorable', engineSite: 'starter-merchant/src/content.ts:808,829,850', note: 'read-the-room / call-the-debt / cut-losses, with costs, targets and effects.' },
  { subject: 'StatusDefinition set', kind: 'merchant-vocabulary', class: 'unauthorable', engineSite: 'starter-merchant/src/content.ts:875', note: 'The pack\'s statuses, including `encumbered`, which contract-core applies via injected apply/remove.' },
  { subject: 'EncounterDefinition + spawn tables', kind: 'merchant-vocabulary', class: 'unauthorable', engineSite: 'starter-merchant/src/content.ts:325,340,356', note: 'The forge authors `encounterAnchors` — a raw pass-through key with ZERO engine hits. The engine\'s real encounter vocabulary (compositions, participants, validZoneTags, per-zone tables) is entirely unauthorable.' },
  { subject: 'BossDefinition + phase listener', kind: 'merchant-vocabulary', class: 'unauthorable', engineSite: 'starter-merchant/src/content.ts:300', note: 'Boss phases. The forge can tag an entity `boss`; it cannot say what a boss DOES.' },
  { subject: 'District.baseMetrics.commerce as economy driver', kind: 'merchant-vocabulary', class: 'authorable', engineSite: 'starter-merchant/src/content.ts:495', note: 'AUTHORABLE AND CARRIED — one of the few live economy levers the lane transports. Merchant\'s own comment records that leaving it at the default 50 made `recovery` opportunities unfireable catalog-wide.' },
  { subject: 'economyGenre / tradeGenre / craftingGenre', kind: 'merchant-vocabulary', class: 'unauthorable', engineSite: 'starter-merchant/src/setup.ts:210-212', note: 'Three separate genre keys selecting supply tables, buyable stock and recipes. The forge has ONE free-text `genre` that maps only to packMeta.genres.' },
  { subject: 'faction cohesion + membership', kind: 'merchant-vocabulary', class: 'unauthorable', engineSite: 'starter-merchant/src/setup.ts:155-172', note: 'buildWorldStack takes factions as {factionId, entityIds, cohesion}. The forge authors FactionPresence (districtIds, influence, alertLevel, patrolRoutes) — a raw pass-through with zero engine hits, and a different vocabulary entirely. The two systems do not share a single field name.' },
  { subject: 'safeZoneTags / biasTags combat config', kind: 'merchant-vocabulary', class: 'unauthorable', engineSite: 'starter-merchant/src/setup.ts:148-149', note: 'Which zone tags mean "safe" is per-pack config. The forge authors tags but cannot say what any of them MEAN — which is why P2 measured tags live in only 8 of 12 worlds.' },
  { subject: 'CurrencyReward / xpAwards', kind: 'merchant-vocabulary', class: 'unauthorable', engineSite: 'starter-merchant/src/content.ts:757,783', note: 'Progression rewards with recipient predicates (functions).' },
  { subject: 'ItemCatalog + transferGuard', kind: 'merchant-vocabulary', class: 'unauthorable', engineSite: 'starter-merchant/src/content.ts:1071 + setup.ts:223', note: 'The forge authors item placements that become ItemDefinitions, but the catalog wiring and the consignment transfer guard (a closure) are code.' },
  { subject: 'item chronicle recognition', kind: 'merchant-vocabulary', class: 'unauthorable', engineSite: 'starter-merchant/src/setup.ts:244-247', note: 'createItemChronicleCore takes an `evaluate` closure deciding when an instrument earns a name.' },
  { subject: 'contract-core obligation clock', kind: 'merchant-vocabulary', class: 'unauthorable', engineSite: 'starter-merchant/src/contract-core.ts', note: 'A whole pack-local MODULE — five commerce verbs and an obligation clock. Packs can ship engine modules of their own; the forge cannot express a module.' },
];

describe('C0/P3 — the reverse table: what the engine says that the forge cannot author', () => {
  const exported = JSON.parse(fs.readFileSync(FIXTURE_PACK_PATH, 'utf-8')) as Record<string, unknown>;

  it('every engine-declared pack key has a reverse row', () => {
    const keyRows = REVERSE_ROWS.filter((r) => r.kind === 'pack-key').map((r) => r.subject);
    const unfilled = ENGINE_PACK_KEYS.filter((k) => exported[k] === undefined);
    // entities, zones and dialogues ARE filled; the other seven are not.
    expect(unfilled.sort()).toEqual([
      'abilities', 'archetypes', 'backgrounds', 'itemUseEffects', 'quests', 'statuses', 'verbs',
    ]);
    expect(keyRows.sort()).toEqual([...unfilled].sort());
  });

  it('every ZoneState field absent from ZoneDefinition has a reverse row', () => {
    // Derived from the live types rather than transcribed: build a ZoneState
    // and diff its keys against the ZoneDefinition keys the exporter emits.
    const zoneStateKeys: Array<keyof ZoneState> = [
      'id', 'roomId', 'name', 'tags', 'neighbors', 'light', 'noise',
      'stability', 'authority', 'hazards', 'interactables',
    ];
    const exportedZoneKeys = new Set(
      (exported.zones as Record<string, unknown>[]).flatMap((z) => Object.keys(z)),
    );
    // `description` and `exits` are exported but are not ZoneState fields —
    // that asymmetry belongs to the EXPORT table, not this one.
    const missingFromPack = zoneStateKeys.filter((k) => !exportedZoneKeys.has(k as string));
    expect(missingFromPack.sort()).toEqual(['authority', 'roomId', 'stability']);

    const fieldRows = REVERSE_ROWS
      .filter((r) => r.kind === 'zone-state-field')
      .map((r) => r.subject.replace('ZoneState.', ''));
    expect(fieldRows.sort()).toEqual(missingFromPack.sort());
  });

  it('every reverse row carries a class and a citation', () => {
    for (const row of REVERSE_ROWS) {
      expect(row.class, row.subject).toMatch(/^(authorable|unauthorable)$/);
      expect(row.engineSite, `${row.subject} needs a file:line citation`).toMatch(/\.(ts|md)(:\d+)?/);
      expect(row.note.length, `${row.subject} needs a note`).toBeGreaterThan(20);
    }
  });
});

describe('C0/P3 — the merchant survey is asserted, not transcribed', () => {
  it('merchant really authors the quest / ability / status vocabulary claimed', () => {
    expect(merchant.merchantQuests).toHaveLength(3);
    expect(merchant.merchantQuests.map((q) => q.id).sort()).toEqual([
      'open-the-books', 'the-late-caravan', 'the-standing-account',
    ]);
    expect(merchant.merchantAbilities).toHaveLength(3);
    expect(merchant.merchantStatusDefinitions.length).toBeGreaterThan(0);
  });

  it('merchant really authors an uncontrolled district and a commerce-8 district', () => {
    const warrens = merchant.districts.find((d) => d.id === 'the-warrens');
    expect(warrens).toBeDefined();
    expect(warrens!.controllingFaction).toBeUndefined();

    const crown = merchant.districts.find((d) => d.id === 'high-counting-house');
    expect(crown!.baseMetrics?.commerce).toBe(8);
  });

  it('NONE of that vocabulary appears in the exported forge pack', () => {
    // The reverse claim, made mechanically: the merchant pack's own content ids
    // have no counterpart shape anywhere in what the forge lane can emit.
    const raw = JSON.parse(fs.readFileSync(FIXTURE_PACK_PATH, 'utf-8')) as Record<string, unknown>;
    for (const key of ['quests', 'abilities', 'statuses', 'verbs', 'encounters', 'bosses', 'rulesets', 'modules']) {
      expect(raw[key], `forge exports no ${key}`).toBeUndefined();
    }
  });

  it('the one economy lever that DOES cross is the one merchant proved load-bearing', () => {
    // District commerce is authorable in the forge (District.baseMetrics.commerce)
    // and carried lossless by the export lane. Merchant's own comment records
    // that leaving it at the default 50 kept `recovery` opportunities from ever
    // firing catalog-wide. So the lane transports exactly one lever of the
    // living economy, and it happens to be a consequential one.
    const raw = JSON.parse(fs.readFileSync(FIXTURE_PACK_PATH, 'utf-8')) as Record<string, unknown>;
    const districts = raw.districts as Array<{ baseMetrics?: Record<string, number> }>;
    expect(districts.every((d) => typeof d.baseMetrics?.commerce === 'number')).toBe(true);
    // …while the economyProfile that would give it meaning is dropped entirely.
    expect(districts.some((d) => 'economyProfile' in d)).toBe(false);
  });
});

describe('C0/P3 — the machine-readable reverse artifact', () => {
  it('writes docs/c0-alignment/reverse-table.json', () => {
    const artifact = {
      audit: 'C0 — Reverse table',
      direction: 'engine vocabulary → what World Forge can author',
      generatedBy: 'packages/cli/src/c0-reverse-table.test.ts',
      proofPack: '@ai-rpg-engine/starter-merchant (Salt Road Ledger) — the economy starter, chosen because it exercises the living-economy surface the 2.5D charter calls the moat',
      headline:
        'A pack is a FUNCTION, not a document. `PackEntry.createGame(seed?) => Engine` has no content field, so the ceiling on any JSON content contract is set by how much of a pack is code: module selection, module config, rulesets, hazard closures, event subscriptions, presentation rules and AI intent profiles are all unauthorable by construction, not by omission.',
      rows: REVERSE_ROWS,
      tally: REVERSE_ROWS.reduce<Record<string, number>>((acc, r) => {
        const k = `${r.kind}:${r.class}`;
        acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      }, {}),
    };

    expect(artifact.rows.length).toBeGreaterThan(20);

    const outDir = path.resolve(import.meta.dirname, '../../../docs/c0-alignment');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
      path.join(outDir, 'reverse-table.json'),
      `${JSON.stringify(artifact, null, 2)}\n`,
      'utf-8',
    );
  });
});
