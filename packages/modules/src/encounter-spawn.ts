// encounter-spawn — zone-entry-driven encounter spawning (F-ENG005-encounter-spawn-wiring).
//
// The wave-4 audit found every starter authoring ~3 EncounterDefinitions that
// nothing imports, and a content-schema `encounterTable` zone field that
// nothing reads. This module is the missing wire, not a new system: starters
// register their authored encounters + per-zone tables, and the world tick
// (world-tick.ts — ONE world tick per round) checks the round's zone entries
// and rolls a spawn. The authored data drives everything:
//
//   - encounter-library.ts ships pure factories only (no selection/weighting
//     API), so selection lives here: a zone's table is a plain string[] of
//     encounter ids — the same shape as content-schema's `RoomDefinition`
//     `encounterTable` (schemas.ts:245) — and WEIGHT IS REPETITION, the classic
//     encounter-table idiom the string[] schema affords. Two entries of
//     'street-patrol' against one 'runner-ambush' is 2:1.
//     (⚠ ATTRIBUTION CORRECTED C3/P1: this said `ZoneDefinition.encounterTable`.
//     `ZoneDefinition` has no such field — it is on `RoomDefinition`, which is
//     itself authoring-only and unconsumed. C0 filed the misattribution as
//     engine-hygiene; corrected here rather than left, because a cross-file
//     pointer nobody follows is exactly how EB-011's comment rotted into nine
//     phantom module ids.)
//   - EncounterDefinition.validZoneIds / validZoneTags are honored as authored:
//     a table may only offer an encounter in a zone the definition itself
//     allows (validateEncounterSpawnContent enforces it at content-test time;
//     the runtime candidate filter re-checks defensively).
//   - composition is honored as authored: 'boss-fight' encounters are PLACED
//     set-pieces — the boss already stands in its lair from setup, and the
//     CLI's victory check live-scans `role:boss` hostiles, so minting a boss
//     clone from a random table could un-win a won game (or double a unique
//     villain). Tables refuse boss-fight compositions and any participant
//     whose template carries `role:boss`.
//
// Determinism: rolls derive from world.meta.seed + the current tick + the
// zone id through a local pure hash (FNV-1a + avalanche). No Math.random, no
// combat-core dice — a sibling owns those — same seed + same path ⇒ the same
// spawns, byte for byte.
//
// Safety modulates chance: defeat-fallout accrues `district_<id>_safety`
// (−3/kill) and nothing ever read it back for the streets themselves. Here a
// LOWER safety raises spawn chance (SAFETY_CHANCE_STEP per point below 0) —
// violence makes the district's streets more dangerous, which is the
// F-ENG005 loop closing at the tactical layer like world-tick closed it at
// the strategic layer.
//
// Anti-restack: entering the same zone repeatedly must not pile encounters.
// The library declares no rule of its own, so the rule here is ONE LIVE
// ENCOUNTER PER ZONE — a zone whose last spawn still has a living member
// standing in it spawns nothing new; once the pack is dead (or has chased
// you elsewhere) the table is live again. Tracked in this module's persisted
// state (rides world.modules, survives save/reload).
//
// Spawn = store.addEntity per participant (the store detaches at ingestion —
// F-71ec5dcd — so cloned module constants are safe) + ONE `encounter.spawned`
// event through the canonical store.emitEvent choke point, public, with a
// narrator presentation block. The payload carries a ready-to-render `label`
// ('Ambush' / 'Patrol' / …) and `description` so the terminal renderer's line
// is one dumb case in the pressure-line family:
//
//   `> ${label}: ${description}.`   e.g. "> Ambush: Blinding speed, no time to react."
//
// (The formatEventLine case itself lives in terminal-ui — a sibling domain —
// and is reported as a seam; the event, payload contract, and presentation
// block are complete here.)
//
// Content registry: engine.moduleManager keeps module instances private and
// the CLI calls runWorldTick(engine) with no content argument, so registered
// content is held module-side keyed by `world.meta.gameId` (the manifest id —
// unique per pack). Packs that never register simply never spawn — external
// packs and the pre-existing world-tick tests are byte-identical no-ops.

import type { Engine, EntityState, WorldState, ZoneState } from '@ai-rpg-engine/core';
import { genId } from '@ai-rpg-engine/core';
import type { EngineModule } from '@ai-rpg-engine/core';
import type { EncounterDefinition } from './combat-roles.js';
import { getDistrictForZone } from './district-core.js';

// ---------------------------------------------------------------------------
// Tuning constants (exported so tests pin thresholds, not magic numbers)
// ---------------------------------------------------------------------------

/** Spawn chance on entering a tabled zone at neutral (0) district safety. */
export const BASE_SPAWN_CHANCE = 0.35;

/**
 * Chance gained per point of NEGATIVE district safety (and lost per positive
 * point). defeat-fallout's −3/kill means each kill in a district makes its
 * streets +6% likelier to answer.
 */
export const SAFETY_CHANCE_STEP = 0.02;

/** Chance floor — a tabled zone is never perfectly safe. */
export const MIN_SPAWN_CHANCE = 0.05;

/** Chance ceiling — a spawn is never a certainty, however bloody the district. */
export const MAX_SPAWN_CHANCE = 0.95;

/** The tag that marks an entity as a unique boss (the engine-wide taxonomy). */
export const BOSS_ROLE_TAG = 'role:boss';

/**
 * Quiet ticks after combat.encounter.cleared when the pack authored no
 * cooldownTurns (F-33099b8e). Same absolute-tick ledger as authored
 * cooldown; never shortens an already-future authored value.
 */
export const DEFAULT_POST_CLEAR_COOLDOWN = 2;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The authored content a pack wires in (single-sourced from its content.ts). */
export type EncounterSpawnContent = {
  /** The pack's authored EncounterDefinitions. */
  encounters: EncounterDefinition[];
  /**
   * Entity templates participants reference by `entityId`. Spawning clones a
   * template with a fresh deterministic id — the authored instance placed at
   * setup is untouched.
   */
  entityTemplates: EntityState[];
  /**
   * zoneId → encounter ids. Same shape and meaning as content-schema's
   * ZoneDefinition.encounterTable (string[]); weight is repetition.
   */
  zoneTables: Record<string, string[]>;
};

export type EncounterSpawnConfig = EncounterSpawnContent & {
  /** The pack's manifest id (world.meta.gameId) — the registry key. */
  gameId: string;
  /** Override BASE_SPAWN_CHANCE. */
  baseChance?: number;
  /** Override SAFETY_CHANCE_STEP. */
  safetyStep?: number;
};

/** Persisted module state — rides world.modules, survives save/reload. */
export type EncounterSpawnState = {
  /** eventLog scan cursor — zone entries are read from the delta only. */
  cursor: number;
  /** One-live-encounter-per-zone ledger: zoneId → the last spawn's members. */
  liveByZone: Record<string, { encounterId: string; entityIds: string[] }>;
  /**
   * C3/P1 — per-zone cooldown: zoneId → the tick at which the zone becomes live
   * again. A zone whose last spawn is dead but whose cooldown has not elapsed
   * stays quiet.
   *
   * This is the second axis an authored `EncounterAnchor` carries that this
   * module had no expression for. It rides the SAME persisted namespace as
   * `liveByZone` (so it survives save/reload identically) and is checked in the
   * SAME guard, rather than becoming a second ledger with its own lifecycle.
   *
   * Optional so a pre-C3 restored save — whose namespace has no such field —
   * initialises to `{}` and behaves exactly as before instead of throwing on a
   * missing record. (The `cursor` field learned this lesson the hard way; see
   * `freshEncounterSpawnState`.)
   */
  cooledUntilTick?: Record<string, number>;
};

/** What one spawn did — returned via WorldTickResult.encounters for tests/debug. */
export type SpawnedEncounterReport = {
  encounterId: string;
  encounterName: string;
  composition: string;
  zoneId: string;
  entityIds: string[];
};

type RegistryEntry = {
  encountersById: Map<string, EncounterDefinition>;
  templatesById: Map<string, EntityState>;
  zoneTables: Record<string, string[]>;
  baseChance: number;
  safetyStep: number;
  /**
   * C3/P1 — per-zone spawn chance, from an authored `EncounterAnchor.probability`.
   * Consulted INSTEAD of `baseChance` for that zone; safety still modulates, so
   * the F-ENG005 loop (a bloodier district answers more often) is not undone.
   */
  zoneChance?: Record<string, number>;
  /**
   * C3/P1 — per-zone cooldown in rounds, from `EncounterAnchor.cooldownTurns`.
   */
  zoneCooldown?: Record<string, number>;
};

// ---------------------------------------------------------------------------
// Content registry (module-side, keyed by manifest id — see file header)
// ---------------------------------------------------------------------------

const registry = new Map<string, RegistryEntry>();

/** Exposed for tests: drop a pack's registered spawn content. */
export function unregisterEncounterSpawnContent(gameId: string): void {
  registry.delete(gameId);
}

/**
 * C3/P1 — MERGE authored spawn-set content into an already-registered pack.
 *
 * The content-intake seam's entry point. `createEncounterSpawn` registers at
 * module construction, from code; an exported pack's `encounterAnchors` arrive
 * AFTER boot, and this is how they join the same registry the tick already
 * reads. There is deliberately no second registry and no second roll: this
 * module is the engine's spawn system, and C3 extends it.
 *
 * Merge semantics, chosen to make code and data composable rather than rivals:
 * - encounters and templates are ADDED; an id already registered by pack code
 *   WINS, because code is the more specific authority (it can carry closures a
 *   data record cannot express) and silently overwriting it would make a pack's
 *   own set-pieces vanish when someone added an anchor.
 * - a zone's table is REPLACED, not concatenated — an authored anchor for a zone
 *   is a statement about that zone, and appending would make re-ingesting the
 *   same pack twice double its weights.
 *
 * Returns the ids that were skipped because code already owned them, so the
 * caller can report rather than guess.
 */
export function mergeEncounterSpawnContent(
  gameId: string,
  content: {
    encounters?: EncounterDefinition[];
    entityTemplates?: EntityState[];
    zoneTables?: Record<string, string[]>;
    zoneChance?: Record<string, number>;
    zoneCooldown?: Record<string, number>;
  },
): { skippedEncounterIds: string[]; skippedTemplateIds: string[] } {
  const existing = registry.get(gameId);
  const entry: RegistryEntry = existing ?? {
    encountersById: new Map(),
    templatesById: new Map(),
    zoneTables: {},
    baseChance: BASE_SPAWN_CHANCE,
    safetyStep: SAFETY_CHANCE_STEP,
  };

  const skippedEncounterIds: string[] = [];
  const skippedTemplateIds: string[] = [];

  for (const e of content.encounters ?? []) {
    if (entry.encountersById.has(e.id)) {
      skippedEncounterIds.push(e.id);
      continue;
    }
    entry.encountersById.set(e.id, e);
  }
  for (const t of content.entityTemplates ?? []) {
    if (entry.templatesById.has(t.id)) {
      skippedTemplateIds.push(t.id);
      continue;
    }
    entry.templatesById.set(t.id, t);
  }
  for (const [zoneId, table] of Object.entries(content.zoneTables ?? {})) {
    entry.zoneTables[zoneId] = [...table];
  }
  if (content.zoneChance) {
    entry.zoneChance = { ...(entry.zoneChance ?? {}), ...content.zoneChance };
  }
  if (content.zoneCooldown) {
    entry.zoneCooldown = { ...(entry.zoneCooldown ?? {}), ...content.zoneCooldown };
  }

  registry.set(gameId, entry);
  return { skippedEncounterIds, skippedTemplateIds };
}

// ---------------------------------------------------------------------------
// Module state (synthesize-and-attach — the defeat-fallout/world-tick pattern)
// ---------------------------------------------------------------------------

const STATE_KEY = 'encounter-spawn';

/**
 * Fresh module state for the world it joins. `cursor` baselines to the
 * CURRENT eventLog length (P8-WL-006): a fresh world's log is empty at
 * initialization so the cursor starts at 0 exactly as before, but a restored
 * pre-v2.7 save whose namespace is absent used to get cursor 0 over the old
 * session's FULL log — the first world tick then scanned every historical
 * `world.zone.entered` event and rolled a spawn for each (a one-round burst
 * that could place a patrol in every tabled zone the player ever visited).
 * Nothing historical is re-consumed; the cursor-always-advances discipline
 * starts from "now".
 */
function freshEncounterSpawnState(world: WorldState): EncounterSpawnState {
  return { cursor: world.eventLog.length, liveByZone: {}, cooledUntilTick: {} };
}

export function getEncounterSpawnState(world: WorldState): EncounterSpawnState {
  const existing = world.modules[STATE_KEY] as EncounterSpawnState | undefined;
  if (existing) return existing;
  const fresh = freshEncounterSpawnState(world);
  world.modules[STATE_KEY] = fresh;
  return fresh;
}

// ---------------------------------------------------------------------------
// Deterministic rolls — local pure hash (FNV-1a 32-bit + avalanche)
// ---------------------------------------------------------------------------

function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Deterministic roll in [0, 1) from seed + tick + zone + salt. Pure and local
 * on purpose: combat-core's dice belong to a sibling rework; this module's
 * randomness must not couple to it.
 */
export function spawnRoll(seed: number, tick: number, zoneId: string, salt: string): number {
  let h = fnv1a(`${seed}:${tick}:${zoneId}:${salt}`);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * Spawn chance for a zone entry given the district's accrued safety global.
 * Monotonic: lower safety never lowers the chance. Clamped to
 * [MIN_SPAWN_CHANCE, MAX_SPAWN_CHANCE].
 */
export function spawnChance(baseChance: number, safetyStep: number, safety: number): number {
  const raw = baseChance + -safety * safetyStep;
  return Math.max(MIN_SPAWN_CHANCE, Math.min(MAX_SPAWN_CHANCE, raw));
}

// ---------------------------------------------------------------------------
// Presentation — the telegraph line family (label + description ride the payload)
// ---------------------------------------------------------------------------

/** Composition → telegraph label. The renderer's line: `> ${label}: ${description}.` */
export function compositionLabel(composition: string | undefined): string {
  switch (composition) {
    case 'ambush':
      return 'Ambush';
    case 'patrol':
      return 'Patrol';
    case 'horde':
      return 'Horde';
    case 'duel':
      return 'Challenge';
    default:
      return 'Encounter';
  }
}

/** Strip terminal punctuation so the renderer's own `.` never doubles up. */
function stripTerminal(text: string): string {
  return text.replace(/[\s.!?]+$/u, '');
}

/**
 * The player-facing description: the authored trigger hook (the circumstance —
 * "Noise attracts the dead from nearby blocks"), falling back to tone, then
 * the encounter's name. Authored voice verbatim, minus terminal punctuation.
 */
export function encounterDescription(def: EncounterDefinition): string {
  const text = def.narrativeHooks?.trigger ?? def.narrativeHooks?.tone ?? def.name;
  return stripTerminal(text);
}

// ---------------------------------------------------------------------------
// Content validation (each starter's content test runs this against its pack)
// ---------------------------------------------------------------------------

/**
 * Validate a pack's spawn content: every table entry must reference an
 * authored encounter; tabled encounters must be spawnable (not boss-fight, no
 * role:boss participant, all templates present) and allowed in their zone by
 * the definition's own validZoneIds/validZoneTags. Returns human-readable
 * errors ([] = valid).
 */
export function validateEncounterSpawnContent(
  content: EncounterSpawnContent,
  zones?: Array<Pick<ZoneState, 'id' | 'tags'>>,
): string[] {
  const errors: string[] = [];
  const byId = new Map(content.encounters.map((e) => [e.id, e]));
  const templates = new Map(content.entityTemplates.map((t) => [t.id, t]));
  const zoneById = zones ? new Map(zones.map((z) => [z.id, z])) : undefined;

  for (const [zoneId, table] of Object.entries(content.zoneTables)) {
    if (zoneById && !zoneById.has(zoneId)) {
      errors.push(`zoneTables["${zoneId}"]: no such zone`);
    }
    for (const encounterId of table) {
      const def = byId.get(encounterId);
      if (!def) {
        errors.push(`zoneTables["${zoneId}"]: encounter "${encounterId}" is not authored`);
        continue;
      }
      if (def.composition === 'boss-fight') {
        errors.push(
          `zoneTables["${zoneId}"]: "${encounterId}" is a boss-fight — bosses are placed set-pieces, not random spawns`,
        );
      }
      if (def.validZoneIds && !def.validZoneIds.includes(zoneId)) {
        errors.push(
          `zoneTables["${zoneId}"]: "${encounterId}" declares validZoneIds ${JSON.stringify(def.validZoneIds)} which exclude this zone`,
        );
      }
      if (def.validZoneTags && zoneById) {
        const zone = zoneById.get(zoneId);
        if (zone && !def.validZoneTags.some((t) => zone.tags.includes(t))) {
          errors.push(
            `zoneTables["${zoneId}"]: "${encounterId}" declares validZoneTags ${JSON.stringify(def.validZoneTags)} and the zone matches none`,
          );
        }
      }
      for (const participant of def.participants) {
        const template = templates.get(participant.entityId);
        if (!template) {
          errors.push(
            `encounter "${encounterId}": participant "${participant.entityId}" has no entity template`,
          );
        } else if (template.tags.includes(BOSS_ROLE_TAG)) {
          errors.push(
            `encounter "${encounterId}": participant "${participant.entityId}" is ${BOSS_ROLE_TAG} — unique bosses must not be cloned by random spawns`,
          );
        }
      }
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Module factory
// ---------------------------------------------------------------------------

/**
 * Register a pack's encounter spawn content. The module itself registers only
 * a persistence namespace (cursor + live-encounter ledger); the spawn check
 * runs inside world-tick's tick so the round keeps ONE world tick.
 */
export function createEncounterSpawn(config: EncounterSpawnConfig): EngineModule {
  return {
    id: 'encounter-spawn',
    version: '1.0.0',

    register(ctx) {
      // Factory default (NamespaceDefaultsFactory), not static data: the
      // cursor must baseline to the log length of the world the namespace
      // joins — 0 at fresh construction, the full historical length when a
      // legacy save without the namespace is restored and initialized
      // (P8-WL-006; a static `cursor: 0` planted by namespace-init over an
      // old log re-armed the spawn burst on every migration-seam load path).
      ctx.persistence.registerNamespace(STATE_KEY, (world: WorldState) =>
        freshEncounterSpawnState(world),
      );

      registry.set(config.gameId, {
        encountersById: new Map(config.encounters.map((e) => [e.id, e])),
        templatesById: new Map(config.entityTemplates.map((t) => [t.id, t])),
        zoneTables: config.zoneTables,
        baseChance: config.baseChance ?? BASE_SPAWN_CHANCE,
        safetyStep: config.safetyStep ?? SAFETY_CHANCE_STEP,
      });

      // F-33099b8e: proactive liveByZone cleanup + default post-clear
      // cooldown so bounce-back re-entry cannot restack when the pack
      // authored none. Authored cooledUntilTick in the future wins.
      ctx.events.on('combat.encounter.cleared', (event, world) => {
        const zoneId = event.payload.zoneId;
        if (typeof zoneId !== 'string') return;
        const state = getEncounterSpawnState(world);
        const stillLive = zoneHasLiveEncounter(world, state, zoneId);
        if (event.payload.outcome === 'retreat' && stillLive) return;
        state.cooledUntilTick ??= {};
        if (state.cooledUntilTick[zoneId] === undefined) {
          state.cooledUntilTick[zoneId] = event.tick + DEFAULT_POST_CLEAR_COOLDOWN;
        }
      });
    },
  };
}

// ---------------------------------------------------------------------------
// The spawn step (called from world-tick's tickWorld — one world tick per round)
// ---------------------------------------------------------------------------

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** A zone's last spawn still has a living member standing in it? */
function zoneHasLiveEncounter(
  world: WorldState,
  state: EncounterSpawnState,
  zoneId: string,
): boolean {
  const record = state.liveByZone[zoneId];
  if (!record) return false;
  const live = record.entityIds.some((id) => {
    const entity = world.entities[id];
    return !!entity && (entity.resources.hp ?? 0) > 0 && entity.zoneId === zoneId;
  });
  if (!live) delete state.liveByZone[zoneId]; // pack cleared — table is live again
  return live;
}

/**
 * C3/P1 — is the zone still cooling down from its last spawn?
 *
 * Distinct from `zoneHasLiveEncounter` and checked after it: "the pack is still
 * alive" and "the pack is dead but the street has not settled" are different
 * facts, and an authored `cooldownTurns` is about the second. A zone with no
 * authored cooldown is never cooling, so packs that register no anchors are
 * byte-identical no-ops (the invariant this whole module already holds).
 */
function zoneIsCoolingDown(
  world: WorldState,
  state: EncounterSpawnState,
  zoneId: string,
): boolean {
  const until = state.cooledUntilTick?.[zoneId];
  if (until === undefined) return false;
  if (world.meta.tick >= until) {
    // Elapsed — clear the record rather than letting it accumulate one entry per
    // zone the player ever fought in.
    delete state.cooledUntilTick![zoneId];
    return false;
  }
  return true;
}

/**
 * Candidates for a zone entry: table entries resolved against the authored
 * definitions, keeping repetition (weight), dropping anything unspawnable —
 * boss-fight compositions, role:boss participants, missing templates, and
 * definitions whose own validZoneIds/validZoneTags exclude this zone.
 * Content tests enforce these statically; the runtime filter is the fail-closed
 * backstop.
 */
function spawnCandidates(
  entry: RegistryEntry,
  world: WorldState,
  zoneId: string,
): EncounterDefinition[] {
  const table = entry.zoneTables[zoneId];
  if (!table || table.length === 0) return [];
  const zone = world.zones[zoneId];
  const out: EncounterDefinition[] = [];
  for (const encounterId of table) {
    const def = entry.encountersById.get(encounterId);
    if (!def) continue;
    if (def.composition === 'boss-fight') continue;
    if (def.validZoneIds && !def.validZoneIds.includes(zoneId)) continue;
    if (def.validZoneTags && zone && !def.validZoneTags.some((t) => zone.tags.includes(t))) {
      continue;
    }
    const spawnable = def.participants.every((p) => {
      const template = entry.templatesById.get(p.entityId);
      return !!template && !template.tags.includes(BOSS_ROLE_TAG);
    });
    if (!spawnable) continue;
    out.push(def);
  }
  return out;
}

function trySpawn(
  engine: Engine,
  entry: RegistryEntry,
  state: EncounterSpawnState,
  zoneId: string,
): SpawnedEncounterReport | undefined {
  const world = engine.store.state;

  if (zoneHasLiveEncounter(world, state, zoneId)) return undefined;
  // C3/P1 — an authored cooldown keeps the zone quiet even once the pack is dead.
  if (zoneIsCoolingDown(world, state, zoneId)) return undefined;

  const candidates = spawnCandidates(entry, world, zoneId);
  if (candidates.length === 0) return undefined;

  // Gate roll: safety modulates — a bloodier district answers more often.
  //
  // C3/P1: an authored `EncounterAnchor.probability` replaces the pack-wide
  // base chance FOR THIS ZONE, and safety still modulates on top. Substituting
  // the base rather than multiplying keeps the authored number meaning what an
  // author would expect it to mean ("this anchor fires about a third of the
  // time"), and keeps the safety loop intact rather than special-casing it.
  const districtId = getDistrictForZone(world, zoneId);
  const safety = districtId ? num(world.globals[`district_${districtId}_safety`]) : 0;
  const base = entry.zoneChance?.[zoneId] ?? entry.baseChance;
  const chance = spawnChance(base, entry.safetyStep, safety);
  const seed = world.meta.seed;
  const tick = world.meta.tick;
  if (spawnRoll(seed, tick, zoneId, 'gate') >= chance) return undefined;

  // Pick roll: weighted by table repetition.
  const pick =
    candidates[Math.floor(spawnRoll(seed, tick, zoneId, 'pick') * candidates.length)];

  // Clone each participant's template with a fresh deterministic id. The
  // store detaches at ingestion (F-71ec5dcd), but the clone-then-override is
  // still required: the template's own id/zoneId must never be mutated.
  const entityIds: string[] = [];
  const entityNames: string[] = [];
  for (const participant of pick.participants) {
    const template = entry.templatesById.get(participant.entityId)!;
    const clone = structuredClone(template);
    clone.id = genId(world, 'enc');
    clone.zoneId = zoneId;
    clone.statuses = [];
    // F-4a203504: stamp the spawning encounter's own id onto each
    // participant so engagement-core can attribute combat.encounter.cleared
    // to the ENCOUNTER THAT JUST ENDED (the defeated entity's own stamp)
    // instead of this module's zone-keyed `liveByZone` ledger, which can go
    // stale for a zone the player re-enters by disengage (never emits
    // world.zone.entered, so liveByZone's lazy cleanup never runs there).
    // Spread-merges over any authored `custom` fields (companion-core.ts's
    // stamping convention), never overwrites them.
    clone.custom = { ...clone.custom, encounterId: pick.id };
    engine.store.addEntity(clone);
    entityIds.push(clone.id);
    entityNames.push(clone.name);
  }

  state.liveByZone[zoneId] = { encounterId: pick.id, entityIds };
  // C3/P1 — arm the authored cooldown. Recorded as an absolute tick so the
  // check is a comparison rather than a per-round decrement: a decrementing
  // counter has to be ticked by something, and this module is only ever entered
  // on a zone ENTRY, so a counter would stall the moment the player left.
  const cooldown = entry.zoneCooldown?.[zoneId];
  if (cooldown !== undefined && cooldown > 0) {
    state.cooledUntilTick ??= {};
    state.cooledUntilTick[zoneId] = tick + cooldown;
  }

  const hooks = pick.narrativeHooks;
  // ONE renderable event through the canonical emit path. label + description
  // make the renderer's case dumb: `> ${label}: ${description}.`
  engine.store.emitEvent(
    'encounter.spawned',
    {
      encounterId: pick.id,
      encounterName: pick.name,
      composition: pick.composition ?? 'encounter',
      zoneId,
      zoneName: world.zones[zoneId]?.name ?? zoneId,
      label: compositionLabel(pick.composition),
      description: encounterDescription(pick),
      spawnedEntityIds: entityIds,
      spawnedEntityNames: entityNames,
      ...(hooks?.tone ? { tone: hooks.tone } : {}),
      ...(hooks?.stakes ? { stakes: hooks.stakes } : {}),
    },
    {
      visibility: 'public',
      presentation: { channels: ['narrator'], priority: 'high' },
    },
  );

  return {
    encounterId: pick.id,
    encounterName: pick.name,
    composition: pick.composition ?? 'encounter',
    zoneId,
    entityIds,
  };
}

/**
 * The per-round spawn check, called from world-tick's tickWorld (keeping ONE
 * world tick per round). Scans the eventLog delta for the PLAYER's
 * `world.zone.entered` events via a persisted cursor (the world-tick cursor
 * pattern), and rolls a spawn per entry.
 *
 * The cursor always advances — even for packs with no registered content —
 * so a pack that registers late never replays stale zone entries.
 */
export function runEncounterSpawnStep(engine: Engine): SpawnedEncounterReport[] {
  const world = engine.store.state;
  const state = getEncounterSpawnState(world);
  const log = world.eventLog;

  const entry = registry.get(world.meta.gameId);
  if (!entry) {
    state.cursor = log.length;
    return [];
  }

  const enteredZones: string[] = [];
  for (let i = state.cursor; i < log.length; i++) {
    const event = log[i];
    if (event.type !== 'world.zone.entered') continue;
    if (event.actorId !== world.playerId) continue; // NPC movement never rolls
    const zoneId = event.payload.zoneId;
    if (typeof zoneId === 'string') enteredZones.push(zoneId);
  }
  state.cursor = log.length;

  const reports: SpawnedEncounterReport[] = [];
  for (const zoneId of enteredZones) {
    const report = trySpawn(engine, entry, state, zoneId);
    if (report) reports.push(report);
  }
  return reports;
}
