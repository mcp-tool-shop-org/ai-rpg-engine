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
//     encounter ids — the same shape as content-schema's ZoneDefinition
//     `encounterTable` (schemas.ts) — and WEIGHT IS REPETITION, the classic
//     encounter-table idiom the string[] schema affords. Two entries of
//     'street-patrol' against one 'runner-ambush' is 2:1.
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
};

// ---------------------------------------------------------------------------
// Content registry (module-side, keyed by manifest id — see file header)
// ---------------------------------------------------------------------------

const registry = new Map<string, RegistryEntry>();

/** Exposed for tests: drop a pack's registered spawn content. */
export function unregisterEncounterSpawnContent(gameId: string): void {
  registry.delete(gameId);
}

// ---------------------------------------------------------------------------
// Module state (synthesize-and-attach — the defeat-fallout/world-tick pattern)
// ---------------------------------------------------------------------------

const STATE_KEY = 'encounter-spawn';

export function getEncounterSpawnState(world: WorldState): EncounterSpawnState {
  const existing = world.modules[STATE_KEY] as EncounterSpawnState | undefined;
  if (existing) return existing;
  const fresh: EncounterSpawnState = { cursor: 0, liveByZone: {} };
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
      ctx.persistence.registerNamespace(STATE_KEY, {
        cursor: 0,
        liveByZone: {},
      } satisfies EncounterSpawnState);

      registry.set(config.gameId, {
        encountersById: new Map(config.encounters.map((e) => [e.id, e])),
        templatesById: new Map(config.entityTemplates.map((t) => [t.id, t])),
        zoneTables: config.zoneTables,
        baseChance: config.baseChance ?? BASE_SPAWN_CHANCE,
        safetyStep: config.safetyStep ?? SAFETY_CHANCE_STEP,
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

  const candidates = spawnCandidates(entry, world, zoneId);
  if (candidates.length === 0) return undefined;

  // Gate roll: safety modulates — a bloodier district answers more often.
  const districtId = getDistrictForZone(world, zoneId);
  const safety = districtId ? num(world.globals[`district_${districtId}_safety`]) : 0;
  const chance = spawnChance(entry.baseChance, entry.safetyStep, safety);
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
    engine.store.addEntity(clone);
    entityIds.push(clone.id);
    entityNames.push(clone.name);
  }

  state.liveByZone[zoneId] = { encounterId: pick.id, entityIds };

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
