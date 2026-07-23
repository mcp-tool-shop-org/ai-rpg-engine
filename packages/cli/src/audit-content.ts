// audit-content — dev CLI: a content-audit report over a pack/world's combat content.
//
// v3.0 wave 2 (V3-DIR-2). The modules package carries six format*ForDirector
// exports whose own doc comments say "for the AI director"/"director prompt"
// but that renderDirectorLedger (director.ts, the PLAYER-facing Ledger) never
// reads: combat-roles.ts's formatEncounterForDirector, and combat-summary.ts's
// formatEncounterDetailForDirector / formatBossProfileForDirector /
// formatCombatSummaryForDirector / formatRegionCombatForDirector /
// formatAuditForDirector. Both source files say so themselves — "Pure
// functions for inspecting, summarizing, and auditing combat content...
// Designed for World Forge, CLI tools, and test harnesses" — a standing
// invitation this file finally accepts. They are, and always were, public
// exports of @ai-rpg-engine/modules; nothing here needed to be un-privated.
//
// `ai-rpg-engine audit-content <file.json>` loads a lightweight, CLI-owned
// content-audit file — NOT a content-schema ContentPack (that schema has no
// `encounters`/`bossDefinitions` fields; see loader.ts) and NOT a save/world
// file — and prints a six-section report built from those six formatters:
//
//   1. SUMMARY            summarizeCombatContent      -> formatCombatSummaryForDirector
//   2. PROJECT AUDIT       auditProjectCombat          -> formatAuditForDirector
//   3. REGIONS (optional)  summarizeRegionCombat        -> formatRegionCombatForDirector (per district)
//   4. ENCOUNTER ANALYSIS  analyzeEncounter             -> formatEncounterForDirector (per encounter)
//   5. ENCOUNTER DETAIL    buildEncounterDetail         -> formatEncounterDetailForDirector (per encounter)
//   6. BOSSES (optional)   getEncounterBosses           -> formatBossProfileForDirector (per boss)
//
// Sections 3 and 6 render only when the input actually supplies districts /
// bossDefinitions (and, for BOSSES, at least one boss participant resolves) —
// the same "no invented data" rule director.ts's own Ledger sections follow.
// Encounters may be empty; SUMMARY/PROJECT AUDIT still render honestly zeroed
// (0 encounters, 0 warnings) rather than erroring.
//
// This is a DEV report, not a pass/fail gate: `validate`'s exit code reflects
// content VALIDITY (0 valid / 1 errors) because it is a correctness gate.
// audit-content's exit code reflects only whether the file could be LOADED
// (0 once entities + a resolvable player parse; 1 on a usage/shape error) —
// the warnings/advisories the audit finds are always printed, never block
// the exit code, exactly like validate's own advisories never do.
//
// Determinism: output is a pure function of the file's contents (no
// clock/RNG/network) — same input, same report, byte for byte.
//
// Kept deliberately separate from director.ts's player-facing Ledger: no
// import from director.ts, no shared section-header constant, its own
// visual voice. Do not merge the two — one is a save-file-safe player
// screen, the other is a dev tool over authored (not persisted) content.

import * as fs from 'node:fs';
import type { EntityState, WorldState, WorldMeta } from '@ai-rpg-engine/core';
import {
  type EncounterDefinition,
  type BossDefinition,
  type DistrictDefinition,
  type CombatStatMapping,
  DEFAULT_STAT_MAPPING,
  analyzeEncounter,
  formatEncounterForDirector,
  buildEncounterDetail,
  formatEncounterDetailForDirector,
  getEncounterBosses,
  formatBossProfileForDirector,
  summarizeCombatContent,
  formatCombatSummaryForDirector,
  summarizeRegionCombat,
  formatRegionCombatForDirector,
  auditProjectCombat,
  formatAuditForDirector,
} from '@ai-rpg-engine/modules';

/** Injectable output sink (defaults to console) so tests can capture lines — the validate.ts contract. */
export interface AuditContentDeps {
  log: (msg: string) => void;
  error: (msg: string) => void;
}

const defaultDeps: AuditContentDeps = {
  log: (m) => console.log(m),
  error: (m) => console.error(m),
};

// ---------------------------------------------------------------------------
// Input file shape
// ---------------------------------------------------------------------------

/**
 * One entity as authored in an audit-content file — the lightweight subset
 * combat-roles.ts/combat-summary.ts actually read (tags for role:*, stats for
 * the attack stat, resources.hp/maxHp for danger math, name for display).
 * `toEntityState` fills in the rest of EntityState's required shape with
 * inert defaults so a hand-authored fixture never needs blueprintId/statuses.
 */
export type AuditEntityInput = {
  id: string;
  name?: string;
  type?: string;
  tags?: string[];
  stats?: Record<string, number>;
  resources?: Record<string, number>;
};

/** The full audit-content input file shape. Only `entities` is required. */
export type AuditContentFile = {
  entities: AuditEntityInput[];
  /** Explicit player entity id. Omit to auto-resolve the entity tagged 'player'. */
  playerId?: string;
  encounters?: EncounterDefinition[];
  bossDefinitions?: BossDefinition[];
  /** Enables the REGIONS section — one per district, filtered by validZoneIds overlap. */
  districts?: DistrictDefinition[];
  /** Overrides DEFAULT_STAT_MAPPING (attack/precision/resolve -> vigor/instinct/will). */
  statMapping?: CombatStatMapping;
};

/** One structured load error — the validate.ts `{path, message}` idiom, rendered as `✗ path: message`. */
export type AuditContentError = { path: string; message: string };

export type AuditContentLoaded = {
  entities: Record<string, EntityState>;
  player: EntityState;
  encounters: EncounterDefinition[];
  bossDefinitions: BossDefinition[];
  districts: DistrictDefinition[];
  statMapping: CombatStatMapping;
  world: WorldState;
};

export type LoadAuditContentResult =
  | ({ ok: true } & AuditContentLoaded)
  | { ok: false; errors: AuditContentError[] };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function describe(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

/** Fill AuditEntityInput's optional fields with the engine-shape defaults EntityState requires. */
function toEntityState(input: AuditEntityInput): EntityState {
  return {
    id: input.id,
    blueprintId: input.id,
    type: input.type ?? 'npc',
    name: input.name ?? input.id,
    tags: input.tags ?? [],
    stats: input.stats ?? {},
    resources: input.resources ?? {},
    statuses: [],
  };
}

/**
 * A minimal-but-real WorldState: just enough for district-core's readers
 * (getDistrictDefinition/getDistrictThreatLevel, which summarizeRegionCombat
 * and auditProjectCombat's region-balance pass both call) to resolve the
 * supplied districts instead of degrading to "no district data" throughout.
 * No live DistrictState (alertPressure etc.) is synthesized — district-core's
 * own readers already degrade an absent one to 0/undefined, the same
 * graceful-degrade contract every other reader in this engine already has.
 */
function buildSyntheticWorld(
  entities: Record<string, EntityState>,
  playerId: string,
  districts: DistrictDefinition[],
): WorldState {
  const definitions: Record<string, DistrictDefinition> = {};
  const zoneToDistrict: Record<string, string> = {};
  for (const district of districts) {
    definitions[district.id] = district;
    for (const zoneId of district.zoneIds ?? []) zoneToDistrict[zoneId] = district.id;
  }

  const meta: WorldMeta = {
    worldId: 'audit-content',
    gameId: 'audit-content',
    saveVersion: '0.0.0',
    tick: 0,
    seed: 0,
    activeRuleset: 'audit-content',
    activeModules: [],
    idCounter: 0,
  };

  return {
    meta,
    playerId,
    locationId: '',
    entities,
    zones: {},
    quests: {},
    factions: {},
    globals: {},
    modules: {
      'district-core': { districts: {}, zoneToDistrict, definitions },
    },
    eventLog: [],
    pending: [],
  };
}

/**
 * Load + boundary-guard an audit-content file, the same three-boundary shape
 * loadContentFromFile (content-schema) uses: unreadable file, malformed JSON,
 * and a malformed pack shape are all reported as structured errors, never a
 * raw throw. A missing/unresolvable player is a fourth boundary specific to
 * this file: analyzeEncounter/buildEncounterDetail both require a definite
 * player entity (not optional), so there is no honest degrade below this —
 * it fails loud with a hint rather than silently picking an arbitrary entity.
 */
export function loadAuditContentFile(filePath: string): LoadAuditContentResult {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      errors: [
        {
          path: 'file',
          message: `could not read content-audit file "${filePath}": ${reason} — check the path exists and is readable`,
        },
      ],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      errors: [
        {
          path: 'file',
          message: `invalid JSON in "${filePath}": ${reason} — fix the JSON syntax (a trailing comma or unclosed bracket is the usual cause)`,
        },
      ],
    };
  }

  if (!isPlainObject(parsed)) {
    return {
      ok: false,
      errors: [
        {
          path: 'file',
          message: `content-audit file must be a plain object (got ${describe(parsed)}) — pass an object like { entities: [...], encounters: [...] }`,
        },
      ],
    };
  }

  const errors: AuditContentError[] = [];

  const rawEntities = parsed.entities;
  if (!Array.isArray(rawEntities) || rawEntities.length === 0) {
    errors.push({
      path: 'entities',
      message: 'must be a non-empty array — at least one entity (the player) is required',
    });
  }
  for (const field of ['encounters', 'bossDefinitions', 'districts'] as const) {
    const v = parsed[field];
    if (v !== undefined && !Array.isArray(v)) {
      errors.push({ path: field, message: `must be an array if provided (got ${describe(v)})` });
    }
  }
  if (errors.length > 0) return { ok: false, errors };

  const entityInputs = rawEntities as unknown[];
  for (let i = 0; i < entityInputs.length; i++) {
    const e = entityInputs[i];
    const idOk = isPlainObject(e) && typeof e.id === 'string' && e.id !== '';
    if (!idOk) {
      errors.push({ path: `entities[${i}]`, message: 'must be an object with a non-empty string "id"' });
    }
  }
  if (errors.length > 0) return { ok: false, errors };

  const entities: Record<string, EntityState> = {};
  for (const raw of entityInputs as AuditEntityInput[]) {
    entities[raw.id] = toEntityState(raw);
  }

  const explicitPlayerId = parsed.playerId;
  let playerId: string | undefined;
  if (typeof explicitPlayerId === 'string') {
    if (!entities[explicitPlayerId]) {
      return {
        ok: false,
        errors: [{ path: 'playerId', message: `"${explicitPlayerId}" does not match any supplied entity id` }],
      };
    }
    playerId = explicitPlayerId;
  } else {
    playerId = Object.values(entities).find((e) => e.tags.includes('player'))?.id;
  }

  if (!playerId) {
    return {
      ok: false,
      errors: [
        {
          path: 'playerId',
          message: 'no player entity resolvable — set "playerId" to one of the supplied entity ids, or tag one entity "player"',
        },
      ],
    };
  }

  const encounters = ((parsed.encounters as EncounterDefinition[] | undefined) ?? []);
  const bossDefinitions = ((parsed.bossDefinitions as BossDefinition[] | undefined) ?? []);
  const districts = ((parsed.districts as DistrictDefinition[] | undefined) ?? []);
  const statMapping = (parsed.statMapping as CombatStatMapping | undefined) ?? DEFAULT_STAT_MAPPING;

  return {
    ok: true,
    entities,
    player: entities[playerId],
    encounters,
    bossDefinitions,
    districts,
    statMapping,
    world: buildSyntheticWorld(entities, playerId, districts),
  };
}

// ---------------------------------------------------------------------------
// Report — the 6 content-audit formatters, composed
// ---------------------------------------------------------------------------

const DIVIDER = '='.repeat(60);

function sectionHeader(title: string): string {
  return `-- ${title} --`;
}

/**
 * Compose the six-section content-audit report. Each optional section
 * (REGIONS, BOSSES) renders only when the loaded content actually supports
 * it — no invented districts, no invented boss roster.
 */
export function buildContentAuditReport(loaded: AuditContentLoaded): string {
  const { entities, player, encounters, bossDefinitions, districts, statMapping, world } = loaded;
  const lines: string[] = [];

  lines.push(DIVIDER);
  lines.push('  CONTENT AUDIT REPORT');
  lines.push('  (dev tool over authored combat content — not the player Ledger)');
  lines.push(DIVIDER);
  lines.push(
    `  Entities: ${Object.keys(entities).length} | Encounters: ${encounters.length} | ` +
      `Boss defs: ${bossDefinitions.length} | Districts: ${districts.length}`,
  );

  // 1. SUMMARY — summarizeCombatContent -> formatCombatSummaryForDirector
  lines.push('');
  lines.push(sectionHeader('SUMMARY'));
  lines.push(formatCombatSummaryForDirector(summarizeCombatContent(encounters, entities, player, bossDefinitions, statMapping)));

  // 2. PROJECT AUDIT — auditProjectCombat -> formatAuditForDirector
  lines.push('');
  lines.push(sectionHeader('PROJECT AUDIT'));
  lines.push(formatAuditForDirector(auditProjectCombat(encounters, entities, world, bossDefinitions, player, statMapping)));

  // 3. REGIONS (optional) — summarizeRegionCombat -> formatRegionCombatForDirector, per district
  if (districts.length > 0) {
    lines.push('');
    lines.push(sectionHeader('REGIONS'));
    for (const district of districts) {
      const overview = summarizeRegionCombat(district.id, encounters, entities, world, player, bossDefinitions, statMapping);
      lines.push('');
      lines.push(formatRegionCombatForDirector(overview));
    }
  }

  // 4. ENCOUNTER ANALYSIS — analyzeEncounter -> formatEncounterForDirector, per encounter
  if (encounters.length > 0) {
    lines.push('');
    lines.push(sectionHeader('ENCOUNTER ANALYSIS'));
    for (const encounter of encounters) {
      lines.push('');
      lines.push(formatEncounterForDirector(analyzeEncounter(encounter, entities, player, statMapping)));
    }
  }

  // 5. ENCOUNTER DETAIL — buildEncounterDetail -> formatEncounterDetailForDirector, per encounter
  if (encounters.length > 0) {
    lines.push('');
    lines.push(sectionHeader('ENCOUNTER DETAIL'));
    for (const encounter of encounters) {
      const detail = buildEncounterDetail(encounter, entities, player, { world, bossDefs: bossDefinitions, statMapping });
      lines.push('');
      lines.push(formatEncounterDetailForDirector(detail));
    }
  }

  // 6. BOSSES (optional) — getEncounterBosses -> formatBossProfileForDirector, per boss
  const bossProfiles = bossDefinitions.length > 0 ? getEncounterBosses(encounters, bossDefinitions, entities) : [];
  if (bossProfiles.length > 0) {
    lines.push('');
    lines.push(sectionHeader('BOSSES'));
    for (const profile of bossProfiles) {
      lines.push('');
      lines.push(formatBossProfileForDirector(profile));
    }
  }

  lines.push('');
  lines.push(DIVIDER);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI entry — mirrors runValidate's shape (validate.ts)
// ---------------------------------------------------------------------------

function printAuditContentHelp(log: (msg: string) => void): void {
  log('Usage: ai-rpg-engine audit-content <file.json>');
  log('');
  log("Dev tool: loads a lightweight combat-content file and prints a six-section");
  log('content-audit report (summary, project audit, regions, encounter analysis,');
  log('encounter detail, bosses) through the director-mode formatters that back');
  log("them. This is a DEV report over AUTHORED content, not the player-facing");
  log('Director\'s Ledger (the in-game "director" menu entry / director.ts) —');
  log('the two are separate tools by design and never share state.');
  log('');
  log('Input file shape (JSON), only "entities" is required:');
  log('  {');
  log('    "entities": [');
  log('      { "id": "player", "tags": ["player"], "stats": { "vigor": 5 }, "resources": { "hp": 20 } },');
  log('      { "id": "goblin", "tags": ["enemy", "role:brute"], "stats": { "vigor": 3 }, "resources": { "hp": 10 } }');
  log('    ],');
  log('    "playerId": "player",              // optional — else the entity tagged "player"');
  log('    "encounters": [ /* EncounterDefinition */ ],     // optional, default []');
  log('    "bossDefinitions": [ /* BossDefinition */ ],     // optional, default []');
  log('    "districts": [ /* DistrictDefinition */ ],       // optional, default [] — enables REGIONS');
  log('    "statMapping": { "attack": "vigor", "precision": "instinct", "resolve": "will" }  // optional');
  log('  }');
  log('');
  log('Exit code: 0 once entities + a resolvable player load (this is a report,');
  log('not a pass/fail gate — warnings/advisories the audit finds are always');
  log('printed, never block the exit code). 1 on a usage/load error (missing');
  log('file, bad JSON, missing entities, or no resolvable player).');
  log('');
  log('Example:');
  log('  ai-rpg-engine audit-content ./content/encounters.audit.json');
}

/**
 * Run the audit-content command. Returns the process exit code (0 = loaded
 * and reported, 1 = usage/load error) — the runValidate/runProfile contract,
 * so bin.ts turns the returned code into process.exit and this stays
 * unit-testable without spawning a process.
 */
export function runAuditContent(args: string[], deps: AuditContentDeps = defaultDeps): number {
  const { log, error } = deps;

  if (args.includes('--help') || args.includes('-h')) {
    printAuditContentHelp(log);
    return 0;
  }

  const file = args.find((a) => !a.startsWith('-'));
  if (!file) {
    error('✗ [AUDIT_CONTENT_FILE_MISSING] Missing <file.json>.');
    error('  Hint: provide a path to a content-audit JSON file, e.g. ai-rpg-engine audit-content ./content/encounters.audit.json');
    printAuditContentHelp(log);
    return 1;
  }

  const loaded = loadAuditContentFile(file);
  if (!loaded.ok) {
    error(`✗ Content-audit file invalid — ${loaded.errors.length} error${loaded.errors.length === 1 ? '' : 's'} in ${file}:`);
    for (const e of loaded.errors) error(`  ✗ ${e.path}: ${e.message}`);
    return 1;
  }

  log(`✓ Content-audit loaded: ${file}`);
  log(
    `  ${Object.keys(loaded.entities).length} entities, ${loaded.encounters.length} encounters, ` +
      `${loaded.bossDefinitions.length} boss definitions, ${loaded.districts.length} districts`,
  );
  log('');
  log(buildContentAuditReport(loaded));
  return 0;
}
