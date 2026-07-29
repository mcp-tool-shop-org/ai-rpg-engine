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

import type { Engine, EntityState, ZoneState } from '@ai-rpg-engine/core';
import type { ContentPack, EntityPlacementRecord } from './refs.js';
import type { EntityBlueprint, ZoneDefinition } from './schemas.js';
import type { ValidationError } from './validate.js';
import {
  validateEntityBlueprint,
  validateZoneDefinition,
  validateEntityPlacementRecord,
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
 */
export type DropReason =
  | 'no-runtime-field'
  | 'needs-module-vocabulary'
  | 'inert-without-pack-code'
  | 'session-scoped';

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
  return state;
}

/**
 * `EntityBlueprint` → `EntityState`.
 *
 * `blueprintId` is derived from `id` — a blueprint is its own template until an
 * instancing vocabulary exists. Note what CANNOT be carried: the blueprint has
 * no `zoneId`, so an exported pack knows every NPC and where none of them stand
 * (REPORT §2). That is reported per entity, not assumed known.
 */
export function entityBlueprintToState(bp: EntityBlueprint, dropped?: DroppedField[], path = ''): EntityState {
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
  if (bp.aiProfile !== undefined) {
    dropped?.push({
      path: `${p}.aiProfile`,
      reason: 'needs-module-vocabulary',
      detail:
        'AIState requires goals/fears/alertLevel/knowledge, and intent profiles are pack-supplied ' +
        '`evaluate` closures (REPORT §4). A profile NAME cannot be resolved without the pack that defines it.',
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
  return state;
}

// --- The seam -------------------------------------------------------------

/**
 * Pack keys this seam routes directly, using core state APIs only.
 *
 * `placements` joins them at C3/P1: it writes `EntityState.zoneId`, a core field,
 * so it needs no module vocabulary and stays on this side of the layering.
 */
export const CORE_INTAKE_KEYS = ['zones', 'entities', 'placements'] as const;

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
export const MODULE_INTAKE_KEYS = ['districts', 'encounterAnchors'] as const;

/**
 * Pack keys carrying real content that is consumed at construction/session-setup
 * time rather than by a world reader. See {@link MODULE_INTAKE_KEYS} for the
 * measurement behind the split.
 */
export const SESSION_SCOPED_KEYS = ['buildCatalog', 'progressionTrees'] as const;

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
  const entities = pack.entities ?? [];
  if (!Array.isArray(entities)) {
    errors.push({ path: 'pack.entities', message: 'must be an array if provided.' });
  } else {
    let count = 0;
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
      engine.store.addEntity(entityBlueprintToState(bp as EntityBlueprint, dropped, label));
      count++;
    }
    if (entities.length > 0) {
      applied.entities = count;
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

  // --- module-owned channels (injected) ---
  const byKey = new Map<string, IntakeChannel>();
  for (const ch of options.channels ?? []) byKey.set(ch.key, ch);

  const raw = pack as unknown as Record<string, unknown>;
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
    const report = channel.apply(engine, raw[key]);
    if (report.errors?.length) errors.push(...report.errors);
    if (report.dropped?.length) dropped.push(...report.dropped);
    applied[key] = report.applied;
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
          : 'the build catalog is consumed by character creation before a session runs, not by any world reader. ' +
            'Read it with extractSessionContent() and hand it to the character builder.',
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
 * ```ts
 * const session = extractSessionContent(pack);
 * const engine = createGame(seed, {
 *   modules: [createProgressionCore({ trees: session.progressionTrees })],
 * });
 * applyContentPack(engine, pack, { channels: createStandardChannels() });
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

  return out;
}

/**
 * `ContentPack` keys that are genuinely declared and validated, carry real
 * content, and still have no route into a world at this rung. Each is named in
 * the result so an author is never told "applied" about a pack half of which
 * went nowhere.
 */
const UNROUTED_DECLARED_KEYS: ReadonlyArray<readonly [string, string]> = [
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
