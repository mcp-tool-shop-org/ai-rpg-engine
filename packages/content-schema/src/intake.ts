// intake.ts — the content → runtime seam (C1/P1).
//
// C0 measured the gap this file closes: a loaded ContentPack reached a report
// and stopped. `ai-rpg-engine validate` printed a summary and exited; nothing
// routed a pack into a WorldStore; `loadExternalPack` refused a content JSON
// with "must export createGame(seed?) returning an Engine"; and ZoneState
// required a `roomId` that ZoneDefinition has no field for, so no exported pack
// could produce a storable zone even in principle
// (docs/c0-alignment/REPORT.md §3.3, proven four ways).
//
// The boot contract this implements is decided, on evidence, in
// docs/contract-v1/CONTRACT.md §2: a pack stays a FUNCTION. `createGame` remains
// the host for modules, rulesets, closures and event wiring; this seam routes
// declarative content INTO the world that code has already built. It never
// constructs an engine, never registers a module, and never runs pack code.
//
// The one discipline that matters most here is inherited from the audit's
// headline failure: data was not merely lost, it was lost SILENTLY while an
// instrument reported `losslessPercent: 100` on an export that dropped 194
// fields. So every field this converter does not carry is NAMED in the result.
// A silent drop is the bug; a reported drop is a contract.
//
// Layering note (DECOMPOSE_BY_SECRETS): this package sits below
// @ai-rpg-engine/modules, so the seam cannot import district-core,
// progression-core or character-creation to route their channels. It therefore
// owns the two core-only channels (zones, entities) directly and takes the
// module-owned ones as INJECTED handlers — the same structural-typing shape
// `buildNarrationPlan` already uses for its cue vocabulary. What changes with a
// module's state shape lives with that module; the stable wire mechanism lives
// here.

import type { AIState, Engine, EntityState, ResistanceLevel, ZoneState } from '@ai-rpg-engine/core';
import type {
  ContentPack,
  EntityAiState,
  EntityPlacementRecord,
  ItemPlacementRecord,
} from './refs.js';
import type { EntityBlueprint, ZoneDefinition } from './schemas.js';
import type { ValidationError } from './validate.js';
import {
  validateEntityBlueprint,
  validateZoneDefinition,
  validateEntityPlacementRecord,
  validateItemPlacementRecord,
} from './validate.js';
import { runLoadGate, type GateContext, type GateResult } from './gate.js';

/** Plain-object test, used by the passes below to degrade rather than throw. */
function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// --- Result shapes --------------------------------------------------------

/**
 * One field the converter did not carry into runtime state, named at its source
 * path with the reason.
 *
 * `reason` is a closed vocabulary rather than free text so a consumer can react
 * to a class of drop without string-matching:
 *
 * - `no-runtime-field` — the target state type has no counterpart. The field is
 *   authorable and simply has nowhere to land.
 * - `needs-module-vocabulary` — a runtime counterpart exists but constructing it
 *   requires a module's own vocabulary (a status id resolved against a
 *   registry, an AI intent profile that is a pack closure). C3's work.
 * - `inert-without-pack-code` — carried faithfully, and provably does nothing
 *   unless pack code gives it meaning. See {@link ZONE_HAZARD_NOTE}.
 * - `session-scoped` — real, consumable content that is read at pack-construction
 *   or session-setup time, BEFORE a world exists. Writing it into a booted world
 *   would do nothing. See {@link extractSessionContent}.
 * - `evaluated-not-mapped` — examined, with a recorded rationale, and deliberately
 *   NOT carried. Distinct from the three above because it is a DECISION rather than
 *   a gap: mapping it would add fields with no consumer, or stand a second system
 *   beside one that already exists. See {@link EVALUATED_NOT_MAPPED_KEYS}.
 */
export type DropReason =
  | 'no-runtime-field'
  | 'needs-module-vocabulary'
  | 'inert-without-pack-code'
  | 'session-scoped'
  | 'evaluated-not-mapped';

export type DroppedField = {
  /** Source path, e.g. `entities[2](guard).aiProfile`. */
  path: string;
  reason: DropReason;
  /** Why, in one sentence a content author can act on. */
  detail: string;
};

/** What one injected channel did with its slice of the pack. */
export type ChannelReport = {
  /** How many records the channel ingested. */
  applied: number;
  errors?: ValidationError[];
  dropped?: DroppedField[];
};

/**
 * A pack key routed into a booted engine by a consumer that CAN depend on the
 * owning module. See `createStandardChannels` in @ai-rpg-engine/modules.
 */
export type IntakeChannel = {
  /** The top-level pack key this channel consumes. */
  key: string;
  apply(engine: Engine, data: unknown): ChannelReport;
};

/**
 * Named combat brain. Structural subset of modules' IntentProfile — content-schema
 * sits below @ai-rpg-engine/modules, so only `id` is required here. A real
 * IntentProfile is assignable. Closures stay with the cognition module; this
 * seam only needs the name to write EntityState.ai.profileId.
 */
export type IntentProfileRef = {
  id: string;
};

/** How applyContentPack turns an authored aiProfile name into EntityState.ai. */
export type AiProfileLookup = {
  profiles?: IntentProfileRef[] | Record<string, EntityAiState>;
  entityAi?: Record<string, EntityAiState>;
};

export type ApplyContentPackOptions = {
  /**
   * Handlers for module-owned pack keys (`districts`, `buildCatalog`,
   * `progressionTrees`). A key present in the pack with no handler is REPORTED
   * as dropped, never silently skipped.
   */
  channels?: IntakeChannel[];
  /**
   * Skip re-validating elements this seam is about to convert. Only set this
   * when the pack came straight out of `loadContentFromFile` (which already
   * validated it) — it is a duplicate-work switch, not a strictness switch.
   */
  prevalidated?: boolean;
  /**
   * Run the four-check load gate before applying anything (C1/P2). When the gate
   * refuses, NOTHING is applied and the result carries the diff report.
   *
   * Opt-in by argument rather than always-on, because this is the boundary where
   * strictness belongs: `loadContent` keeps its permissive structural validation
   * for callers that only want to check a file, and a pack claiming it can be
   * loaded INTO A WORLD is held to the version/module/hash/key contract. That
   * boundary did not exist before this cycle.
   */
  gate?: GateContext;
  /**
   * Named intent profiles (IntentProfile[] or id→AIState). When an entity's
   * `aiProfile` matches, {@link EntityState.ai} is written instead of dropped.
   * Unresolved names are a structured error — an unresolved brain stands still.
   */
  profiles?: IntentProfileRef[] | Record<string, EntityAiState>;
};

export type ApplyContentPackResult = {
  /** False if anything was refused. Dropped fields do NOT flip this. */
  ok: boolean;
  /** Present when `options.gate` was supplied. Carries the diff report. */
  gate?: GateResult;
  /** Records ingested, per channel key. */
  applied: Record<string, number>;
  /** Every field the converter did not carry, named. */
  dropped: DroppedField[];
  errors: ValidationError[];
  /** Non-fatal observations (unhandled channels, inert-by-construction data). */
  advisories: ValidationError[];
};

// --- The hazard truth, stated once ----------------------------------------

/**
 * C0's sharpest measurement, and the reason `hazards` is carried but not
 * counted as a win: hazard STRINGS carry no engine semantics. Their meaning is
 * JavaScript the pack ships, invoked at `environment-core.ts:295`.
 *
 * Same field, two mutations, all twelve shipped worlds: adding `'unstable
 * floor'` — which starter-fantasy's closure matches at `setup.ts:137` — moves
 * the simulation in one world. Adding `'loose cobbles'` — which no closure
 * anywhere references — moves nothing, anywhere.
 *
 * So a data-only export ships no closures, and the one rule-bearing zone field
 * the lane transports faithfully still arrives inert. Typed hazards
 * (`HazardDefinition`'s effect union) are the C3 repair; this seam's duty is to
 * carry the strings and SAY SO.
 */
export const ZONE_HAZARD_NOTE =
  'hazard strings are matched by pack-supplied closures, not by engine vocabulary — ' +
  'a hazard no pack closure references is inert (C0 REPORT §3.2)';

// --- Converters -----------------------------------------------------------

/**
 * `ZoneDefinition` → `ZoneState`.
 *
 * The `roomId` decision (CONTRACT.md §2.2): DERIVED as `zone.id`. The store
 * requires the field, the definition has no counterpart, and C0 measured it
 * `stored-inert` — 0 of 12 worlds moved, zero readers. Removing it from
 * `ZoneState` is an engine type change touching every starter for a field no
 * rule reads, filed under engine-hygiene in REPORT §9. Deriving costs one line
 * and keeps the store's invariant true.
 *
 * `stability` is deliberately NOT set. It is alive (4 of 12 worlds move on it,
 * four readers) and unauthorable — `ZoneDefinition` has no such field. Making it
 * authorable is a schema change, not a wire change (REPORT §6.1).
 */
export function zoneDefinitionToState(def: ZoneDefinition, dropped?: DroppedField[], path = ''): ZoneState {
  const p = path || `zones(${def.id})`;

  if (def.description !== undefined) {
    dropped?.push({
      path: `${p}.description`,
      reason: 'no-runtime-field',
      detail: 'ZoneState carries no prose; description is presentation content with no runtime counterpart.',
    });
  }
  if (def.exits !== undefined && def.exits.length > 0) {
    dropped?.push({
      path: `${p}.exits`,
      reason: 'no-runtime-field',
      detail:
        'ZoneState has no `exits` field and nothing evaluates a zone ConditionSpec. Traversal reads `neighbors`. ' +
        'Typed/gated edges are C3 (REPORT §9).',
    });
  }
  if (def.entities !== undefined && def.entities.length > 0) {
    dropped?.push({
      path: `${p}.entities`,
      reason: 'no-runtime-field',
      detail:
        'Zone-side entity lists have no ZoneState counterpart. Placement lives on the entity ' +
        '(EntityState.zoneId), and EntityBlueprint has no location field (REPORT §2).',
    });
  }
  if (def.hazards !== undefined && def.hazards.length > 0) {
    dropped?.push({
      path: `${p}.hazards`,
      reason: 'inert-without-pack-code',
      detail: `carried verbatim, but ${ZONE_HAZARD_NOTE}`,
    });
  }
  // ANDON: zone-container vocabulary does not exist. EntityState.inventory is
  // the only place an item id lives. Authors use entity.inventory or
  // ContentPack.itemPlacements; a hypothetical zone.items field is refused here.
  const zoneItems = (def as unknown as Record<string, unknown>).items;
  if (zoneItems !== undefined) {
    dropped?.push({
      path: `${p}.items`,
      reason: 'evaluated-not-mapped',
      detail:
        'ANDON: the runtime has no zone-container vocabulary. There is no `zone.items`. ' +
        'Place items on EntityState.inventory (entity.inventory / entity.equipment that resolve ' +
        'against pack.items) or ContentPack.itemPlacements: { itemId, entityId }[].',
    });
  }

  // Every array is COPIED, not referenced. `addZone` structuredClones on the way
  // in, so aliasing here would be invisible through the store — which is exactly
  // why it needs its own control: these converters are exported and callable
  // without a store, and a caller that mutated the result would silently corrupt
  // the pack it converted from. (Found by that control, not by review.)
  const state: ZoneState = {
    id: def.id,
    roomId: def.id,
    name: def.name,
    tags: [...(def.tags ?? [])],
    neighbors: [...(def.neighbors ?? [])],
  };
  if (def.light !== undefined) state.light = def.light;
  if (def.noise !== undefined) state.noise = def.noise;
  if (def.hazards !== undefined) state.hazards = [...def.hazards];
  if (def.interactables !== undefined) state.interactables = [...def.interactables];
  // C3/P2 — the entry gate crosses as rule-bearing state. Conditions are already
  // COMPILED by the exporter (the engine never parses author syntax), so this is
  // a structural copy, deep enough that a caller mutating the result cannot reach
  // back into the pack (the aliasing bug C1's own control caught on `tags`).
  // C3/P3 — the TYPED hazard refs. The legacy `hazards` string list above is
  // carried too and still reported `inert-without-pack-code`: both cross, and only
  // one of them means anything without a closure. Keeping the contrast is the
  // point (see ZONE_HAZARD_NOTE).
  // Guard a non-array: `[...string]` spreads into character ids and those
  // characters then look like hazard ids at intake. Shape refusal belongs to
  // validateZoneDefinition; here we simply do not copy a non-array.
  if (Array.isArray(def.hazardRefs)) state.hazardRefs = [...def.hazardRefs];
  // C3/P4 — the scene descriptor. Copied field-by-field rather than spread, so a
  // future authored key cannot ride across undeclared (the excess-property hole
  // C0 measured on zones, in miniature).
  if (def.scene !== undefined && def.scene !== null && typeof def.scene === 'object' && !Array.isArray(def.scene)) {
    state.scene = {
      ...(def.scene.biome !== undefined ? { biome: def.scene.biome } : {}),
      ...(def.scene.timeOfDay !== undefined ? { timeOfDay: def.scene.timeOfDay } : {}),
      ...(def.scene.dressingDensity !== undefined ? { dressingDensity: def.scene.dressingDensity } : {}),
      ...(Array.isArray(def.scene.variantTags) ? { variantTags: [...def.scene.variantTags] } : {}),
    };
  }
  if (def.entryGate !== undefined) {
    state.entryGate = {
      conditions: (def.entryGate.conditions ?? []).map((c) => ({
        type: c.type,
        ...(c.params !== undefined ? { params: { ...c.params } } : {}),
      })),
      mode: def.entryGate.mode,
      ...(def.entryGate.reason !== undefined ? { reason: def.entryGate.reason } : {}),
    };
  }
  return state;
}

function cloneAiState(ai: EntityAiState): AIState {
  return {
    profileId: ai.profileId,
    goals: [...(ai.goals ?? [])],
    fears: [...(ai.fears ?? [])],
    alertLevel: typeof ai.alertLevel === 'number' ? ai.alertLevel : 0,
    knowledge: { ...((ai.knowledge ?? {}) as AIState['knowledge']) },
  };
}

function aiFromProfileList(profileId: string, profiles: IntentProfileRef[]): AIState | undefined {
  const hit = profiles.find((p) => p && typeof p.id === 'string' && p.id === profileId);
  return hit ? cloneAiState({ profileId: hit.id }) : undefined;
}

function aiFromProfileMap(
  profileId: string,
  profiles: Record<string, EntityAiState>,
): AIState | undefined {
  const hit = profiles[profileId];
  if (!isRecord(hit) || typeof hit.profileId !== 'string') return undefined;
  return cloneAiState(hit as EntityAiState);
}

/**
 * Resolve an authored `aiProfile` / `entityAi` overlay into runtime AIState.
 * Returns `undefined` when the entity has no AI to apply.
 */
export function resolveEntityAi(
  bp: EntityBlueprint,
  lookup: AiProfileLookup | undefined,
): { ok: true; ai: AIState } | { ok: false; profileId: string } | undefined {
  const fromEntity = lookup?.entityAi?.[bp.id];
  if (fromEntity && isRecord(fromEntity) && typeof fromEntity.profileId === 'string') {
    return { ok: true, ai: cloneAiState(fromEntity) };
  }
  if (bp.aiProfile === undefined) return undefined;
  const profiles = lookup?.profiles;
  if (Array.isArray(profiles)) {
    const ai = aiFromProfileList(bp.aiProfile, profiles);
    return ai ? { ok: true, ai } : { ok: false, profileId: bp.aiProfile };
  }
  if (profiles && isRecord(profiles)) {
    const ai = aiFromProfileMap(bp.aiProfile, profiles as Record<string, EntityAiState>);
    return ai ? { ok: true, ai } : { ok: false, profileId: bp.aiProfile };
  }
  return { ok: false, profileId: bp.aiProfile };
}

/**
 * `EntityBlueprint` → `EntityState`.
 *
 * `blueprintId` is derived from `id` — a blueprint is its own template until an
 * instancing vocabulary exists. Note what CANNOT be carried: the blueprint has
 * no `zoneId`, so an exported pack knows every NPC and where none of them stand
 * (REPORT §2). That is reported per entity, not assumed known.
 *
 * `aiProfile` is resolved against {@link AiProfileLookup} (options.profiles and/or
 * ContentPack.entityAi). A hit writes EntityState.ai; an unresolved name is
 * dropped AND reported as a structured error when `errors` is supplied.
 */
export function entityBlueprintToState(
  bp: EntityBlueprint,
  dropped?: DroppedField[],
  path = '',
  lookup?: AiProfileLookup,
  errors?: ValidationError[],
): EntityState {
  const p = path || `entities(${bp.id})`;

  if (bp.startingStatuses !== undefined && bp.startingStatuses.length > 0) {
    dropped?.push({
      path: `${p}.startingStatuses`,
      reason: 'needs-module-vocabulary',
      detail:
        'An AppliedStatus needs an instance id and an appliedAtTick minted against a status registry ' +
        'status-core owns. Applying statuses at intake is C3.',
    });
  }
  if (bp.scripts !== undefined && bp.scripts.length > 0) {
    dropped?.push({
      path: `${p}.scripts`,
      reason: 'no-runtime-field',
      detail: 'EntityState has no script hook; behaviour is module-registered, not entity-attached.',
    });
  }

  const state: EntityState = {
    id: bp.id,
    blueprintId: bp.id,
    type: bp.type,
    name: bp.name,
    tags: [...(bp.tags ?? [])],
    stats: { ...(bp.baseStats ?? {}) },
    resources: { ...(bp.baseResources ?? {}) },
    statuses: [],
  };
  if (bp.inventory !== undefined) state.inventory = [...bp.inventory];
  if (bp.equipment !== undefined) state.equipment = { ...bp.equipment };

  // F-cf3fc257: structural copies of live EntityState fields. Unknown
  // resistance names land in dropped[] only — never flip applyContentPack.ok.
  if (bp.relations !== undefined && isRecord(bp.relations)) {
    state.relations = { ...bp.relations };
  }
  if (bp.custom !== undefined && isRecord(bp.custom)) {
    state.custom = { ...bp.custom };
  }
  if (bp.resistances !== undefined && isRecord(bp.resistances)) {
    const copied: NonNullable<EntityState['resistances']> = {};
    for (const [k, v] of Object.entries(bp.resistances)) {
      if (v === 'immune' || v === 'resistant' || v === 'vulnerable') {
        copied[k] = v as ResistanceLevel;
      } else {
        dropped?.push({
          path: `${p}.resistances.${k}`,
          reason: 'needs-module-vocabulary',
          detail:
            `unresolved resistance level ${JSON.stringify(v)} — expected immune|resistant|vulnerable. ` +
            'Dropped, not refused (an unresolved name never flips applyContentPack.ok).',
        });
      }
    }
    if (Object.keys(copied).length > 0) state.resistances = copied;
  }
  if (typeof bp.faction === 'string') state.faction = bp.faction;
  if (typeof bp.ruleProfileId === 'string') state.ruleProfileId = bp.ruleProfileId;

  const ai = resolveEntityAi(bp, lookup);
  if (ai?.ok === true) {
    state.ai = ai.ai;
  } else if (ai?.ok === false) {
    dropped?.push({
      path: `${p}.aiProfile`,
      reason: 'needs-module-vocabulary',
      detail:
        `unresolved aiProfile "${ai.profileId}" — pass ApplyContentPackOptions.profiles ` +
        '(IntentProfile[] or id→AIState) and/or ContentPack.entityAi so this name becomes EntityState.ai. ' +
        'An unresolved brain never selects an intent.',
    });
  }
  return state;
}

// --- The seam -------------------------------------------------------------

/**
 * Pack keys this seam routes directly, using core state APIs only.
 *
 * `placements` joins them at C3/P1: it writes `EntityState.zoneId`, a core field,
 * so it needs no module vocabulary and stays on this side of the layering.
 */
export const CORE_INTAKE_KEYS = ['zones', 'entities', 'placements', 'items', 'itemPlacements', 'entityAi'] as const;

/**
 * Pack keys that need a module's own vocabulary and can still be routed into an
 * ALREADY-BOOTED world, and therefore arrive as injected {@link IntakeChannel}s.
 *
 * ⚠ CORRECTION TO THE COMMISSIONING BRIEF, measured in this cycle. C0 filed
 * `districts`, `buildCatalog` and `progressionTrees` together as "three cheap
 * wire gaps ... the cheapest thing on this whole list to close" (REPORT §3.1),
 * and the C1 brief carried that forward as three channels to route. The claim is
 * exactly right about SHAPE and wrong about INGESTION, and C1's own definition
 * of "real" — reaches a runtime — is what exposes the difference:
 *
 * - `districts` reads its definitions out of world state
 *   (`district-core.ts:212`, `world.modules['district-core']`), so a post-boot
 *   write lands and the readers see it. **Routable. It is here.**
 * - `progressionTrees` is closure-captured at module construction
 *   (`progression-core.ts:70-72` builds a `Map` the `unlock` verb closes over at
 *   :109) and is NEVER read from world state. A post-boot write cannot reach it.
 * - `buildCatalog` is consumed by character creation before a session runs
 *   (PackInfo → `cli/src/character-builder.ts`), not by any world reader.
 *
 * The last two are not dead and not dropped — they are SESSION-SCOPED, and the
 * seam that serves them is {@link extractSessionContent}, which a pack or host
 * reads BEFORE constructing modules. All three still join the declared key list
 * (that half of C0's finding was correct and is closed by the gate); only one of
 * the three can be handed to a world that is already running.
 *
 * C3/P1 adds `encounterAnchors` here for the same reason `districts` qualifies:
 * `encounter-spawn` keeps its content in a module-side registry keyed by
 * `world.meta.gameId` and reads its per-zone tables from there at tick time, so
 * a registration after boot is seen by every later roll. The channel REGISTERS
 * into that existing system rather than standing a second spawn system beside
 * it — see `encounterAnchorsChannel` in @ai-rpg-engine/modules.
 */
export const MODULE_INTAKE_KEYS = ['districts', 'encounterAnchors', 'hazardDefinitions'] as const;

/**
 * Pack keys carrying real content that is consumed at construction/session-setup
 * time rather than by a world reader. See {@link MODULE_INTAKE_KEYS} for the
 * measurement behind the split.
 */
export const SESSION_SCOPED_KEYS = ['buildCatalog', 'archetypes', 'backgrounds', 'progressionTrees', 'ruleset'] as const;

/**
 * Pack keys the engine KNOWS about and deliberately does not carry, each with the
 * reason a content author needs to hear.
 *
 * The distinction this table exists to draw: a key here is not a gap and not a typo. It
 * was evaluated (C3 REPORT §8) and mapping it was refused on the merits. Without the
 * distinction, the load gate has only two verdicts — carried, or fatal — and an
 * ordinary forge export is fatal.
 */
export const EVALUATED_NOT_MAPPED_KEYS: Record<string, string> = {
  // `items` used to live here (ANDON: no zone-container vocabulary). The catalog
  // now applies: entity.inventory / entity.equipment ids that resolve against
  // pack.items land on EntityState, and ContentPack.itemPlacements is the
  // authored giveItem. The ANDON remains on a hypothetical `zone.items` field
  // (see zoneDefinitionToState).
  factionPresences:
    'EVALUATED, do not map: of factionId/districtIds/influence/alertLevel/patrolRoutes, only '
    + 'districtIds has an engine counterpart and it already arrives as '
    + '`districts[].controllingFaction`. The rest would be fields with no reader. Entity '
    + '`faction:` tags DO cross, so a person keeps who they answer to.',
  pressureHotspots:
    'EVALUATED, do not map: `{zoneId, pressureType, baseProbability}` would be a fourth '
    + 'parallel spawn system beside encounter-spawn, the pressure system and typed hazards. '
    + '`evaluatePressures` is driven by live district state, not by authored hotspots.',
};

/**
 * Route a validated {@link ContentPack} into a booted engine's world.
 *
 * Pre-condition: `engine` was built by pack code (`createGame`). This function
 * adds content to the world that code produced; it does not build one.
 *
 * Post-condition: every pack field is either applied, or named in
 * `dropped`/`advisories`. Nothing is silently eaten — that is the whole point.
 */
export function applyContentPack(
  engine: Engine,
  pack: ContentPack,
  options: ApplyContentPackOptions = {},
): ApplyContentPackResult {
  const errors: ValidationError[] = [];
  const advisories: ValidationError[] = [];
  const dropped: DroppedField[] = [];
  const applied: Record<string, number> = {};

  if (pack === null || typeof pack !== 'object' || Array.isArray(pack)) {
    return {
      ok: false,
      applied,
      dropped,
      errors: [
        {
          path: 'pack',
          message: 'content pack must be a plain object — pass the `pack` from loadContentFromFile.',
        },
      ],
      advisories,
    };
  }

  // --- the load gate, before ANY mutation ---
  // A gate that refuses after half the pack has landed is not a gate: the world
  // would carry content from a pack the engine just said it would not accept.
  let gateResult: GateResult | undefined;
  if (options.gate) {
    gateResult = runLoadGate(pack, options.gate);
    advisories.push(...gateResult.advisories);
    if (!gateResult.ok) {
      return { ok: false, gate: gateResult, applied, dropped, errors: gateResult.errors, advisories };
    }
  }

  // Snapshot before core writes so a throwing module channel can roll the
  // world back (F-f7358f53). structuredClone can fail if module state holds
  // closures; in that case we still catch the throw and skip rollback.
  let preApply: unknown;
  try {
    preApply = structuredClone(engine.store.state);
  } catch {
    preApply = undefined;
  }

  // --- zones (core-only) ---
  const zones = pack.zones ?? [];
  if (!Array.isArray(zones)) {
    errors.push({ path: 'pack.zones', message: 'must be an array if provided.' });
  } else {
    let count = 0;
    for (let i = 0; i < zones.length; i++) {
      const def = zones[i];
      const label = `zones[${i}](${idOf(def)})`;
      if (!options.prevalidated) {
        const r = validateZoneDefinition(def, label);
        if (r.errors.length > 0) {
          errors.push(...r.errors);
          continue;
        }
      }
      engine.store.addZone(zoneDefinitionToState(def as ZoneDefinition, dropped, label));
      count++;
    }
    if (zones.length > 0) applied.zones = count;
  }

  // --- entities (core-only) ---
  const itemCatalogIds = itemIdsFromPack(pack);
  const aiLookup: AiProfileLookup = {
    profiles: options.profiles,
    entityAi: isRecord(pack.entityAi) ? pack.entityAi : undefined,
  };
  const entities = pack.entities ?? [];
  if (!Array.isArray(entities)) {
    errors.push({ path: 'pack.entities', message: 'must be an array if provided.' });
  } else {
    let count = 0;
    let aiApplied = 0;
    for (let i = 0; i < entities.length; i++) {
      const bp = entities[i];
      const label = `entities[${i}](${idOf(bp)})`;
      if (!options.prevalidated) {
        const r = validateEntityBlueprint(bp, label);
        if (r.errors.length > 0) {
          errors.push(...r.errors);
          continue;
        }
      }
      const state = entityBlueprintToState(bp as EntityBlueprint, dropped, label, aiLookup, errors);
      retainResolvedItems(state, bp as EntityBlueprint, itemCatalogIds, errors, label);
      engine.store.addEntity(state);
      if (state.ai) aiApplied++;
      count++;
    }
    if (entities.length > 0) {
      applied.entities = count;
      if (aiApplied > 0) applied.entityAi = aiApplied;
      // ⚠ C3/P1 CLOSED THE ADVISORY THAT LIVED HERE. C1 emitted, on every single
      // ingestion: "EntityBlueprint has no `zoneId`, so converted entities are
      // placed nowhere." That was true and there was nothing better to do about
      // it — C0 called it "the single most consequential drop in the lane"
      // (REPORT §2). The `placements` channel below is the field that closes it,
      // and `intake.test.ts` now asserts the advisory is GONE rather than
      // present, in the same commit. A pack that carries entities and no
      // placements still gets told so, once, from the placements pass.
    }
  }

  // --- placements (core-only) ---
  // WHERE the entities stand. Runs AFTER entities so the referent exists in the
  // store — a placement is a write to an EntityState the previous pass created,
  // not a second way to create one.
  const placements = pack.placements ?? [];
  if (!Array.isArray(placements)) {
    errors.push({ path: 'pack.placements', message: 'must be an array if provided.' });
  } else {
    let count = 0;
    for (let i = 0; i < placements.length; i++) {
      const rec = placements[i];
      const label = `placements[${i}](${isRecord(rec) ? String(rec.entityId ?? '?') : '?'})`;
      if (!options.prevalidated) {
        const r = validateEntityPlacementRecord(rec, label);
        if (r.errors.length > 0) {
          errors.push(...r.errors);
          continue;
        }
      }
      const { entityId, zoneId, spawnCondition } = rec as EntityPlacementRecord;

      // Referential checks against the STORE, not against the pack. The pack's
      // own refs pass already resolved intra-pack references; here the question
      // is different and sharper — does this entity/zone exist in the world the
      // pack's code built? A pack whose placements resolve on paper and not in
      // the booted world is the "carried, therefore alive" error, and it is the
      // one C1 measured on `light`.
      const target = engine.store.state.entities[entityId];
      if (!target) {
        errors.push({
          path: `${label}.entityId`,
          message:
            `no entity "${entityId}" in the booted world — a placement writes to an existing EntityState. ` +
            'Check the entity is in this pack\'s entities[] (or was registered by pack code).',
        });
        continue;
      }
      if (!engine.store.state.zones[zoneId]) {
        errors.push({
          path: `${label}.zoneId`,
          message:
            `no zone "${zoneId}" in the booted world — the entity would be placed nowhere, ` +
            'which is the exact gap placements exist to close.',
        });
        continue;
      }

      // A spawn condition is carried, NOT evaluated here. Intake is not a tick:
      // there is no actor, no party and no tick to evaluate `party-level:>=10`
      // against, and a condition evaluated at the wrong moment is worse than one
      // deferred. It is REPORTED so a pack author is never left thinking a
      // conditional placement was gated at load.
      if (spawnCondition !== undefined) {
        dropped.push({
          path: `${label}.spawnCondition`,
          reason: 'needs-module-vocabulary',
          detail:
            `carried and NOT evaluated at intake: the entity is placed unconditionally. ` +
            'Conditional placement needs a tick-time evaluator with a party/inventory/flag ' +
            'reader — the same input chain zone entry gates need (C3/P2).',
        });
      }

      target.zoneId = zoneId;
      count++;
    }
    if (placements.length > 0) applied.placements = count;
  }
  // Entities with no placement are named ONCE, with the count — the honest
  // remainder of the advisory C1 had to emit for every pack.
  if (Array.isArray(entities) && entities.length > 0) {
    const placedIds = new Set(
      (Array.isArray(placements) ? placements : [])
        .filter(isRecord)
        .map((p) => String((p as EntityPlacementRecord).entityId)),
    );
    const unplaced = entities
      .filter(isRecord)
      .map((e) => String((e as EntityBlueprint).id))
      .filter((id) => !placedIds.has(id));
    if (unplaced.length > 0) {
      advisories.push({
        path: 'pack.placements',
        message:
          `${unplaced.length} of ${entities.length} converted entit${unplaced.length === 1 ? 'y has' : 'ies have'} no placement ` +
          `and stand${unplaced.length === 1 ? 's' : ''} nowhere: ${unplaced.slice(0, 8).join(', ')}` +
          `${unplaced.length > 8 ? `, +${unplaced.length - 8} more` : ''}. ` +
          'Add a `placements` entry per entity that should be somewhere.',
      });
    }
  }

  // --- items (core catalog + entity inventory already copied) ---
  // pack.items is no longer evaluated-not-mapped: inventory/equipment ids that
  // resolve against it already sit on EntityState (entityBlueprintToState +
  // retainResolvedItems). Count the catalog so a forge export that only
  // declares items[] is applied, not advised.
  if (Array.isArray(pack.items) && pack.items.length > 0) {
    applied.items = itemCatalogIds.size;
    registerItemCatalog(engine, pack.items);
  }

  // --- itemPlacements (authored giveItem) ---
  const itemPlacements = pack.itemPlacements ?? [];
  if (!Array.isArray(itemPlacements)) {
    errors.push({ path: 'pack.itemPlacements', message: 'must be an array if provided.' });
  } else {
    let count = 0;
    for (let i = 0; i < itemPlacements.length; i++) {
      const rec = itemPlacements[i];
      const label = `itemPlacements[${i}](${isRecord(rec) ? String(rec.itemId ?? '?') : '?'})`;
      if (!options.prevalidated) {
        const r = validateItemPlacementRecord(rec, label);
        if (r.errors.length > 0) {
          errors.push(...r.errors);
          continue;
        }
      }
      const { itemId, entityId } = rec as ItemPlacementRecord;
      if (itemCatalogIds.size > 0 && !itemCatalogIds.has(itemId)) {
        errors.push({
          path: `${label}.itemId`,
          message: `item "${itemId}" is not in pack.items — itemPlacements resolve against this pack's item catalog`,
        });
        continue;
      }
      const holder = engine.store.state.entities[entityId];
      if (!holder) {
        errors.push({
          path: `${label}.entityId`,
          message:
            `no entity "${entityId}" in the booted world — itemPlacements give an item to an existing EntityState`,
        });
        continue;
      }
      const inv = holder.inventory ?? [];
      if (!inv.includes(itemId)) {
        holder.inventory = [...inv, itemId];
      }
      count++;
    }
    if (itemPlacements.length > 0) applied.itemPlacements = count;
  }

  // --- module-owned channels (injected) ---
  // First-wins on duplicate keys, with an advisory — last-wins silently
  // dropped the first handler (F-f7358f53).
  const byKey = new Map<string, IntakeChannel>();
  for (const ch of options.channels ?? []) {
    if (byKey.has(ch.key)) {
      advisories.push({
        path: `channels.${ch.key}`,
        message:
          `duplicate intake channel key "${ch.key}" — channel keys must be unique; ` +
          'the first channel for this key is used and later copies are ignored. ' +
          'Rename one of the copies or drop the duplicate.',
      });
      continue;
    }
    byKey.set(ch.key, ch);
  }

  const raw = pack as unknown as Record<string, unknown>;
  let channelThrew = false;
  for (const key of MODULE_INTAKE_KEYS) {
    if (raw[key] === undefined) continue;
    const channel = byKey.get(key);
    if (!channel) {
      advisories.push({
        path: `pack.${key}`,
        message:
          `no intake channel supplied for "${key}" — the data was NOT applied. ` +
          `Pass createStandardChannels() from @ai-rpg-engine/modules, or a channel with key "${key}".`,
      });
      continue;
    }
    let report: ChannelReport;
    try {
      report = channel.apply(engine, raw[key]);
    } catch (err) {
      channelThrew = true;
      const reason = err instanceof Error ? err.message : String(err);
      errors.push({
        path: `pack.${key}`,
        message:
          `intake channel "${key}" threw: ${reason} — wrap channel.apply so garbage in this collection ` +
          'becomes a structured error, not a raw throw. The pack was not applied (rolled back).',
      });
      break;
    }
    if (report.errors?.length) errors.push(...report.errors);
    if (report.dropped?.length) dropped.push(...report.dropped);
    applied[key] = report.applied;
  }

  if (channelThrew && preApply !== undefined && isRecord(preApply)) {
    const state = engine.store.state as unknown as Record<string, unknown>;
    const restored = structuredClone(preApply) as Record<string, unknown>;
    for (const key of Object.keys(state)) {
      if (!(key in restored)) delete state[key];
    }
    Object.assign(state, restored);
    for (const key of CORE_INTAKE_KEYS) delete applied[key];
    for (const key of MODULE_INTAKE_KEYS) delete applied[key];
  }

  // Any channel supplied for a key the pack does not carry is worth saying —
  // silence there is how a consumer discovers a typo six hours later.
  for (const ch of options.channels ?? []) {
    if (!(MODULE_INTAKE_KEYS as readonly string[]).includes(ch.key)) {
      advisories.push({
        path: `channels.${ch.key}`,
        message:
          `channel key "${ch.key}" is not a recognised module-intake key ` +
          `(${MODULE_INTAKE_KEYS.join(', ')}) — it will never be consulted.`,
      });
    }
  }

  // --- keys examined and deliberately not carried ---
  //
  // ⚠ These are DECLARED in `ALLOWED_PACK_KEYS` so a real forge export loads, and they
  // must therefore be REPORTED, or declaring them would have converted a loud refusal
  // into a silent acceptance — the exact silent-pass the gate replaced. C4 made both
  // mistakes in order: first the gate refused an ordinary export, then declaring the keys
  // swallowed them without a word.
  for (const [key, detail] of Object.entries(EVALUATED_NOT_MAPPED_KEYS)) {
    if (raw[key] === undefined) continue;
    dropped.push({ path: `pack.${key}`, reason: 'evaluated-not-mapped', detail });
  }

  // --- session-scoped keys ---
  // Real content, correctly shaped, and NOT applicable to a running world.
  // Reported so a host that skipped extractSessionContent finds out here rather
  // than by wondering why the XP menu is empty.
  for (const key of SESSION_SCOPED_KEYS) {
    if (raw[key] === undefined) continue;
    dropped.push({
      path: `pack.${key}`,
      reason: 'session-scoped',
      detail:
        key === 'progressionTrees'
          ? 'progression-core closure-captures its tree Map at construction (progression-core.ts:70-72) and never ' +
            'reads trees from world state — a post-boot write cannot reach it. Read it with extractSessionContent() ' +
            'and pass it to createProgressionCore({ trees }).'
          : key === 'buildCatalog'
            ? 'the build catalog is consumed by character creation before a session runs, not by any world reader. ' +
              'Read it with extractSessionContent() and hand it to the character builder.'
            : key === 'ruleset'
              ? 'the pack ruleset is bound at Engine construction (and by loadContent against abilities/statuses). ' +
                'A post-boot write cannot swap the host ruleset. Read it with extractSessionContent() / PackEntry.ruleset.'
              : 'chargen archetypes/backgrounds belong with the build catalog — consumed by character creation before a session runs, not by any world reader. ' +
                'Read them with extractSessionContent() and hand them to the character builder.',
    });
  }

  // --- keys this seam knowingly does not route ---
  // Declared by ContentPack, real content, and with no runtime route today.
  // Named rather than ignored so "applied" is never mistaken for "all of it".
  for (const [key, detail] of UNROUTED_DECLARED_KEYS) {
    const v = raw[key];
    if (v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    dropped.push({ path: `pack.${key}`, reason: 'needs-module-vocabulary', detail });
  }

  return {
    ok: errors.length === 0,
    ...(gateResult ? { gate: gateResult } : {}),
    applied,
    dropped,
    errors,
    advisories,
  };
}

// --- The session-scoped seam ----------------------------------------------

/**
 * Content a pack or host consumes BEFORE a world exists — the honest home for
 * the two keys {@link MODULE_INTAKE_KEYS} could not take.
 *
 * `applyContentPack` writes into a booted world. These two are read at
 * construction time and handed to the things that close over them:
 *
 * JSON-pack boot recipe (F-82b17cb3): extractSessionContent → construct
 * modules from the bag → applyContentPack({ profiles }). applyContentPack
 * stays UNROUTED for dialogues/quests/abilities/statuses (those modules
 * freeze their registries at construction). items also live here so a host
 * can hand them to createEquipmentCore; apply still resolves entity
 * inventory/equipment against pack.items.
 *
 * ```ts
 * const session = extractSessionContent(pack);
 * registerStatusDefinitions(session.statuses ?? []);
 * const engine = new Engine({
 *   ruleset: session.ruleset ?? hostRuleset,
 *   modules: [
 *     createDialogueCore(session.dialogues ?? []),
 *     createAbilityCore({ abilities: session.abilities ?? [] }),
 *     createProgressionCore({ trees: session.progressionTrees ?? [] }),
 *     createEquipmentCore({ catalog: { items: session.items ?? [] } }),
 *     ...buildWorldStack({ quests: session.quests ?? [] }).modules,
 *   ],
 * });
 * applyContentPack(engine, pack, { profiles });
 * ```
 *
 * Deliberately untyped beyond `unknown[]`/`unknown`: `BuildCatalog` lives in
 * @ai-rpg-engine/character-creation and `ProgressionTreeDefinition` in this
 * package's own schema surface, but validating either here would drag
 * construction-time policy into a wire-shaped module. The caller owns the cast
 * and the validation (`validateBuildCatalog` is exported alongside this).
 */
export type SessionContent = {
  /** Present only if the pack carried the key. */
  buildCatalog?: unknown;
  /** Present only if the pack carried the key. */
  progressionTrees?: unknown[];
  /** Chargen kits — same session as buildCatalog. Present only if the pack carried the key. */
  archetypes?: unknown[];
  /** Chargen kits — same session as buildCatalog. Present only if the pack carried the key. */
  backgrounds?: unknown[];
  /**
   * Pack-authored RulesetDefinition. Present only if the pack carried the key.
   * Bind it at Engine construction; loadContent already validated it.
   */
  ruleset?: unknown;
  /** Dialogue trees for createDialogueCore. Present only if the pack carried the key. */
  dialogues?: unknown[];
  /** Quest definitions for buildWorldStack({ quests }). Present only if the pack carried the key. */
  quests?: unknown[];
  /** Ability definitions for createAbilityCore. Present only if the pack carried the key. */
  abilities?: unknown[];
  /** Status definitions for registerStatusDefinitions. Present only if the pack carried the key. */
  statuses?: unknown[];
  /** Item catalog for createEquipmentCore({ catalog: { items } }). Present only if the pack carried the key. */
  items?: unknown[];
  /** Keys found but unusable, with the reason — never silently omitted. */
  advisories: ValidationError[];
};

export function extractSessionContent(pack: ContentPack): SessionContent {
  const raw = pack as unknown as Record<string, unknown>;
  const advisories: ValidationError[] = [];
  const out: SessionContent = { advisories };

  if (raw.buildCatalog !== undefined) {
    if (raw.buildCatalog === null || typeof raw.buildCatalog !== 'object' || Array.isArray(raw.buildCatalog)) {
      advisories.push({
        path: 'pack.buildCatalog',
        message: 'must be an object ({ archetypes, backgrounds, ... }) — skipped.',
      });
    } else {
      out.buildCatalog = raw.buildCatalog;
    }
  }

  if (raw.progressionTrees !== undefined) {
    if (!Array.isArray(raw.progressionTrees)) {
      advisories.push({
        path: 'pack.progressionTrees',
        message: 'must be an array of ProgressionTreeDefinition — skipped.',
      });
    } else {
      out.progressionTrees = raw.progressionTrees;
    }
  }

  if (raw.archetypes !== undefined) {
    if (!Array.isArray(raw.archetypes)) {
      advisories.push({
        path: 'pack.archetypes',
        message: 'must be an array of chargen archetypes — skipped.',
      });
    } else {
      out.archetypes = raw.archetypes;
    }
  }

  if (raw.backgrounds !== undefined) {
    if (!Array.isArray(raw.backgrounds)) {
      advisories.push({
        path: 'pack.backgrounds',
        message: 'must be an array of chargen backgrounds — skipped.',
      });
    } else {
      out.backgrounds = raw.backgrounds;
    }
  }

  if (raw.ruleset !== undefined) {
    if (raw.ruleset === null || typeof raw.ruleset !== 'object' || Array.isArray(raw.ruleset)) {
      advisories.push({
        path: 'pack.ruleset',
        message: 'must be a RulesetDefinition object — skipped.',
      });
    } else {
      out.ruleset = raw.ruleset;
    }
  }

  liftSessionArray(raw, 'dialogues', 'must be an array of DialogueDefinition — skipped.', out, advisories);
  liftSessionArray(raw, 'quests', 'must be an array of QuestDefinition — skipped.', out, advisories);
  liftSessionArray(raw, 'abilities', 'must be an array of AbilityDefinition — skipped.', out, advisories);
  liftSessionArray(raw, 'statuses', 'must be an array of StatusDefinition — skipped.', out, advisories);
  liftSessionArray(raw, 'items', 'must be an array of ItemDefinition — skipped.', out, advisories);

  return out;
}

function liftSessionArray(
  raw: Record<string, unknown>,
  key: 'dialogues' | 'quests' | 'abilities' | 'statuses' | 'items',
  message: string,
  out: SessionContent,
  advisories: ValidationError[],
): void {
  if (raw[key] === undefined) return;
  if (!Array.isArray(raw[key])) {
    advisories.push({ path: `pack.${key}`, message });
    return;
  }
  out[key] = raw[key] as unknown[];
}

/**
 * `ContentPack` keys that are genuinely declared and validated, carry real
 * content, and still have no route into a world at this rung. Each is named in
 * the result so an author is never told "applied" about a pack half of which
 * went nowhere.
 */
export const UNROUTED_DECLARED_KEYS: ReadonlyArray<readonly [string, string]> = [
  ['dialogues', 'dialogue-core holds its registry in pack-supplied config; routing dialogues at intake is C3.'],
  ['quests', 'quest-core state is module-owned and world-forge has no quest domain at all (REPORT §4) — the largest authoring hole.'],
  ['abilities', 'ability definitions are registered through module config, not world state.'],
  ['statuses', 'status definitions are registered through module config, not world state.'],
  ['verbs', 'the forge can NAME verbs but cannot DEFINE one; it emits dangling references into a slot it never fills (REPORT §4).'],
  ['itemUseEffects', 'item use effects carry a `use` function — code, not data.'],
];

function idOf(v: unknown): string {
  if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
    const id = (v as Record<string, unknown>).id;
    if (typeof id === 'string') return id;
  }
  return '?';
}

function itemIdsFromPack(pack: ContentPack): Set<string> {
  const ids = new Set<string>();
  if (!Array.isArray(pack.items)) return ids;
  for (const item of pack.items) {
    if (isRecord(item) && typeof item.id === 'string') ids.add(item.id);
  }
  return ids;
}

/**
 * Keep inventory/equipment ids that resolve against pack.items. When the pack
 * has no catalog, ids stay as copied (they may be granted by pack code).
 * Unresolved names against a present catalog are structured errors.
 */
function retainResolvedItems(
  state: EntityState,
  bp: EntityBlueprint,
  catalog: Set<string>,
  errors: ValidationError[],
  label: string,
): void {
  if (catalog.size === 0) return;
  if (Array.isArray(bp.inventory)) {
    const kept: string[] = [];
    for (const id of bp.inventory) {
      if (catalog.has(id)) kept.push(id);
      else {
        errors.push({
          path: `${label}.inventory`,
          message: `item "${id}" is not in pack.items — inventory ids must resolve against the pack catalog`,
        });
      }
    }
    state.inventory = kept;
  }
  if (bp.equipment !== undefined && isRecord(bp.equipment)) {
    const kept: Record<string, string | null> = {};
    for (const [slot, item] of Object.entries(bp.equipment)) {
      if (typeof item !== 'string') continue;
      if (catalog.has(item)) kept[slot] = item;
      else {
        errors.push({
          path: `${label}.equipment.${slot}`,
          message: `item "${item}" is not in pack.items — equipment ids must resolve against the pack catalog`,
        });
      }
    }
    state.equipment = kept;
  }
}

/** Stash the catalog on world.modules so later hosts can read it without a parallel type. */
function registerItemCatalog(engine: Engine, items: NonNullable<ContentPack['items']>): void {
  const modules = engine.store.state.modules;
  if (!isRecord(modules)) return;
  modules['content-pack-items'] = items.map((item) => ({ ...item }));
}
