// ENG-006 (second half) — `inspect-save` goes through the load authorities.
//
// The old bin.ts inspectSave() raw-JSON.parsed the save and field-picked it:
// schema drift printed `undefined`, the globals dump was unbounded, and the
// whole command bypassed every SaveLoadError authority the run → Continue
// path enforces. This module is the fix:
//
//   runInspectSave    — validate through restoreSessionFromSave (the same
//                       Continue/replay sequence: deserialize, rebind,
//                       migrateModuleStates, initializeNamespaces), then
//                       render a bounded summary. Exit-code contract:
//                       0 valid / 1 structured failure — never a stack.
//   renderSaveReport  — the pure render (endgame.ts stats-block voice),
//                       exported so tests can pin it byte-for-byte.
//
// A save that run → Continue would reject fails here with the SAME structured
// error + hint, because the rejection is thrown by the same code path — no
// shape checks are re-implemented in this file.

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  WorldStore,
  SaveLoadError,
  type WorldState,
  type EntityState,
} from '@ai-rpg-engine/core';
import { hasWorldTickState, getActivePressures } from '@ai-rpg-engine/modules';
import { renderEventLog, frameRule, clipToWidth, SCREEN_WIDTH, glyphsFor } from '@ai-rpg-engine/terminal-ui';
import { allPacks } from './packs.js';
import { derivePlayerLevel } from './menu.js';
import type { LoadedPack } from './external-pack.js';
import { restoreSessionFromSave } from './restore-session.js';

/**
 * Default save location, cwd-relative like every other CLI command
 * (mirrors bin.ts's private SAVE_FILE — saveGameGuarded tells the player
 * saves are cwd-relative). Exported so tests can pin the two never drift.
 */
export const DEFAULT_SAVE_FILE = path.join('.ai-rpg-engine', 'save.json');

/** Injectable output sink (defaults to console) so tests can capture lines. */
export interface InspectDeps {
  log: (msg: string) => void;
  error: (msg: string) => void;
  /** Pack catalog used to resolve the saved gameId. Defaults to bundled starters. */
  packs?: readonly LoadedPack[];
  /** F-e393db3c: print one JSON object instead of the human report. */
  json?: boolean;
}

const defaultDeps: InspectDeps = {
  log: (m) => console.log(m),
  error: (m) => console.error(m),
};

// --- Render bounds -----------------------------------------------------------

/** Globals rows shown before the "+K more" tail — no unbounded dump. */
export const GLOBALS_SHOWN = 10;
/** Longest rendered global value; longer scalars are cut with an ellipsis. */
const GLOBAL_VALUE_MAX = 80;
/** Event lines in the RECENT EVENTS tail (renderEventLog's `limit`). */
export const EVENT_TAIL = 5;

/** Section rule — same flush-left SCREEN_WIDTH frame as the play closer. */
const RULE = frameRule();

function sectionHeader(title: string): string[] {
  return [RULE, `  ${clipToWidth(title, SCREEN_WIDTH - 2)}`, RULE, ''];
}

// --- Module-namespace reads (display-only) -----------------------------------
//
// Same defensive pattern as endgame.ts buildEndgameInputs: each optional line
// reads the namespace its module actually persists, structurally — no module
// imports, no invented state, and namespaces that never wired stay silent.

/**
 * world-tick's persisted pressures via the module's own accessors
 * (P8-SP-002/WL-003: the single source of truth — the old 'pressure-system'
 * namespace had no production writer, so this line under-reported every live
 * save). hasWorldTickState carries the absent-vs-zero distinction: null hides
 * the line for saves with no pressure system at all (bare engines, pre-tick
 * saves); a wired save with nothing brewing honestly renders 0. Both reads
 * are non-attaching — inspect-save's report must never mutate the state it
 * summarizes.
 */
function readActivePressures(world: WorldState): number | null {
  if (!hasWorldTickState(world)) return null;
  return getActivePressures(world).length;
}

/** encounter-spawn: liveByZone is the one-live-encounter-per-zone ledger. */
function readLiveEncounters(world: WorldState): number | null {
  const ns = world.modules['encounter-spawn'] as { liveByZone?: unknown } | undefined;
  if (ns === undefined) return null;
  const ledger = ns.liveByZone;
  if (typeof ledger !== 'object' || ledger === null || Array.isArray(ledger)) return 0;
  return Object.keys(ledger).length;
}

/** equipment-core: the player's loadout — occupied slots + carried count. */
function readLoadoutLine(world: WorldState): string | null {
  const ns = world.modules['equipment-core'] as
    | { loadouts?: Record<string, { equipped?: Record<string, string | null>; inventory?: unknown }> }
    | undefined;
  const loadout = ns?.loadouts?.[world.playerId];
  if (!loadout || typeof loadout !== 'object') return null;

  const equipped = Object.entries(loadout.equipped ?? {})
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([slot, itemId]) => `${slot}: ${itemId}`);
  const carried = Array.isArray(loadout.inventory) ? loadout.inventory.length : 0;

  const slots = equipped.length > 0 ? equipped.join(', ') : '(nothing equipped)';
  return carried > 0 ? `${slots} (+${carried} carried)` : slots;
}

/**
 * F-1cb3757f: economy-core's district count — same non-attaching
 * defensive-degrade split as readActivePressures/readLiveEncounters above:
 * null hides the line (the pack never wired economy-core — getEconomyCoreState
 * would silently degrade to `{ districts: {} }`, which is indistinguishable
 * from "wired but empty" without checking the raw namespace ourselves, so this
 * reads world.modules directly rather than going through that accessor); a
 * wired-but-empty economy honestly renders 0.
 */
function readDistrictEconomyCount(world: WorldState): number | null {
  const ns = world.modules['economy-core'] as { districts?: unknown } | undefined;
  if (ns === undefined) return null;
  const districts = ns.districts;
  if (typeof districts !== 'object' || districts === null || Array.isArray(districts)) return 0;
  return Object.keys(districts).length;
}

/**
 * F-1cb3757f: companion-core's ACTIVE party size — the roster of companions
 * actually traveling with the player right now (CompanionState.active),
 * not every companion ever recruited (dismissed/away companions stay in
 * the roster array but are not "the party"). Same absent-vs-zero split as
 * readActivePressures: null when companion-core never wired, 0 for an
 * empty-or-benched party.
 */
function readPartySize(world: WorldState): number | null {
  const ns = world.modules['companion-core'] as { companions?: unknown } | undefined;
  if (ns === undefined) return null;
  const companions = ns.companions;
  if (!Array.isArray(companions)) return 0;
  return companions.filter(
    (c) => c && typeof c === 'object' && (c as { active?: unknown }).active === true,
  ).length;
}

// --- The report ---------------------------------------------------------------

export type SaveReportOptions = {
  /** Installed pack's display name; null renders "(pack not installed)". */
  packName?: string | null;
  /** The save envelope's actionLog, unvalidated (restore tolerates non-arrays). */
  actionLog?: unknown;
  /** Unofficial saved-at stamp when the envelope/meta carries one. */
  savedAt?: unknown;
  /** Explicit color override for the event tail (tests pass false). Omitted →
   *  renderEventLog auto-detects exactly like the in-game screen. */
  color?: boolean;
};

/** `HP hp/maxHp` when maxHp is known, plain `HP hp` otherwise — display only,
 *  no invented maximum (buildEndgameInputs's max-fallback is math, not truth). */
function formatHp(player: EntityState): string {
  const hp = player.resources.hp ?? 0;
  const maxHp = player.resources.maxHp;
  return typeof maxHp === 'number' ? `HP ${hp}/${maxHp}` : `HP ${hp}`;
}

/** Saved-at renders only when the save actually carries a stamp. */
function formatSavedAt(savedAt: unknown): string | null {
  if (typeof savedAt === 'string' && savedAt.length > 0) return savedAt;
  if (typeof savedAt === 'number' && Number.isFinite(savedAt)) {
    return new Date(savedAt).toISOString();
  }
  return null;
}

/**
 * The summary for a save that already passed the load authorities. Pure —
 * takes the post-migration, shape-asserted WorldState (WorldStore.deserialize's
 * output) and renders the endgame.ts stats-block sections:
 *
 *   SAVE SUMMARY          — game, save version, seed, tick, saved-at if present,
 *                           and the player line (name — HP — zone — level, the
 *                           level via derivePlayerLevel, the HUD's own authority)
 *   THE WORLD IN NUMBERS  — entity/zone counts, the optional module lines
 *                           (pressures / encounters / loadout — only when the
 *                           namespace exists), event + action tallies
 *   GLOBALS               — top GLOBALS_SHOWN by key sort, then "+K more"
 *   RECENT EVENTS         — renderEventLog(…, EVENT_TAIL): the exact renderer
 *                           the in-game log panel uses (formatEventLine inside,
 *                           filter-first per CS-C-004), so inspect shows the
 *                           log truth the game itself renders
 */
export function renderSaveReport(state: WorldState, opts: SaveReportOptions = {}): string {
  const lines: string[] = [''];
  const meta = state.meta;

  // --- Header ---
  lines.push(...sectionHeader('SAVE SUMMARY'));
  const gameLine = opts.packName
    ? `${opts.packName} (${meta.gameId})`
    : `${meta.gameId} (pack not installed)`;
  lines.push(`  Game: ${gameLine}`);
  lines.push(`  Save Version: ${meta.saveVersion}`);
  lines.push(`  Seed: ${meta.seed}`);
  lines.push(`  Tick: ${meta.tick}`);
  const savedAt = formatSavedAt(opts.savedAt);
  if (savedAt !== null) lines.push(`  Saved At: ${savedAt}`);
  lines.push('');

  // --- Player line ---
  const player = state.entities[state.playerId];
  if (player) {
    const zone = state.zones[player.zoneId ?? '']?.name ?? player.zoneId ?? state.locationId;
    lines.push(
      `  Player: ${player.name} — ${formatHp(player)} — ${zone} — Level ${derivePlayerLevel(state)}`,
    );
  } else {
    lines.push('  Player: (none — no player entity in this save)');
  }
  lines.push('');

  // --- World summary ---
  lines.push(...sectionHeader('THE WORLD IN NUMBERS'));
  lines.push(`  Entities: ${Object.keys(state.entities).length}`);
  lines.push(`  Zones: ${Object.keys(state.zones).length}`);
  const pressures = readActivePressures(state);
  if (pressures !== null) lines.push(`  Active Pressures: ${pressures}`);
  const encounters = readLiveEncounters(state);
  if (encounters !== null) lines.push(`  Live Encounters: ${encounters}`);
  const loadout = readLoadoutLine(state);
  if (loadout !== null) lines.push(`  Loadout: ${loadout}`);
  const districtEconomies = readDistrictEconomyCount(state);
  if (districtEconomies !== null) lines.push(`  District Economies: ${districtEconomies}`);
  const partySize = readPartySize(state);
  if (partySize !== null) lines.push(`  Party Size: ${partySize}`);
  lines.push(`  Events Logged: ${state.eventLog.length}`);
  // Absent/null degrades to 0 exactly like restoreSessionFromSave; a present
  // non-array is called out rather than counted as nothing.
  const actionCount =
    opts.actionLog === undefined || opts.actionLog === null
      ? 0
      : Array.isArray(opts.actionLog)
        ? opts.actionLog.length
        : null;
  lines.push(
    actionCount === null
      ? '  Actions Logged: (invalid — actionLog is not an array)'
      : `  Actions Logged: ${actionCount}`,
  );
  lines.push('');

  // --- Globals, bounded ---
  const globalKeys = Object.keys(state.globals).sort();
  lines.push(...sectionHeader(`GLOBALS (${globalKeys.length})`));
  if (globalKeys.length === 0) {
    lines.push('  (none)');
  } else {
    for (const key of globalKeys.slice(0, GLOBALS_SHOWN)) {
      const rendered = JSON.stringify(state.globals[key]) ?? 'undefined';
      const ellipsis = glyphsFor().ellipsis;
      const bounded =
        rendered.length > GLOBAL_VALUE_MAX
          ? `${rendered.slice(0, Math.max(0, GLOBAL_VALUE_MAX - ellipsis.length))}${ellipsis}`
          : rendered;
      lines.push(`  ${key}: ${bounded}`);
    }
    if (globalKeys.length > GLOBALS_SHOWN) {
      lines.push(`  +${globalKeys.length - GLOBALS_SHOWN} more`);
    }
  }
  lines.push('');

  // --- Recent events — the game's own log renderer ---
  lines.push(...sectionHeader('RECENT EVENTS'));
  const tail = renderEventLog(
    state.eventLog,
    EVENT_TAIL,
    opts.color === undefined ? undefined : { color: opts.color },
  );
  if (tail === '') {
    lines.push('  (no renderable events)');
  } else {
    // renderEventLog lines carry their own two-space indent + trailing newline.
    lines.push(tail.replace(/\n$/, ''));
  }

  return lines.join('\n');
}

/** Machine-readable save-summary fields (inspect-save --json). */
export function buildSaveSummary(
  state: WorldState,
  opts: SaveReportOptions = {},
): Record<string, unknown> {
  const meta = state.meta;
  const player = state.entities[state.playerId];
  const actionCount =
    opts.actionLog === undefined || opts.actionLog === null
      ? 0
      : Array.isArray(opts.actionLog)
        ? opts.actionLog.length
        : null;
  return {
    ok: true,
    gameId: meta.gameId,
    packName: opts.packName ?? null,
    saveVersion: meta.saveVersion,
    seed: meta.seed,
    tick: meta.tick,
    savedAt: formatSavedAt(opts.savedAt),
    player: player
      ? {
          name: player.name,
          hp: formatHp(player),
          zone: state.zones[player.zoneId ?? '']?.name ?? player.zoneId ?? state.locationId,
          level: derivePlayerLevel(state),
        }
      : null,
    entities: Object.keys(state.entities).length,
    zones: Object.keys(state.zones).length,
    activePressures: readActivePressures(state),
    liveEncounters: readLiveEncounters(state),
    loadout: readLoadoutLine(state),
    districtEconomies: readDistrictEconomyCount(state),
    partySize: readPartySize(state),
    eventsLogged: state.eventLog.length,
    actionsLogged: actionCount,
    globals: state.globals,
  };
}

function emitInspectJson(deps: InspectDeps, payload: unknown): void {
  deps.log(JSON.stringify(payload));
}

// --- The command ---------------------------------------------------------------

/**
 * Run `inspect-save`. Returns the process exit code (0 = valid save rendered,
 * 1 = structured failure) rather than exiting itself, so it stays unit-testable
 * — the bin turns it into the process code (the runValidate/runProfile pattern).
 *
 * Validation is THE restore authority, reused read-only:
 * restoreSessionFromSave — the load gate `run` → Continue and `replay` share,
 * which itself funnels through WorldStore.deserialize (JSON gate, meta
 * presence, rngState, save-version migration, assertSaveMetaShape,
 * assertSaveStateShape) and then the ENG-009 module-migration seam
 * (migrateModuleStates + initializeNamespaces). A throwing migrateState
 * rejects with SAVE_MODULE_MIGRATION_FAILED, same frame as Continue.
 * Nothing is written — the save file is only read.
 *
 * When the file itself is not valid JSON, the raw text is handed to that same
 * gate so ITS structured error (code + message + hint) is the verdict —
 * byte-identical to what restoreSessionFromSave throws for the same bytes.
 * SaveLoadError renders exactly like run → Continue's rejection frame
 * (`Cannot load save [CODE]: message` + `Hint:`), never a stack.
 */
export function runInspectSave(savePath?: string, deps: InspectDeps = defaultDeps): number {
  const file = savePath ?? DEFAULT_SAVE_FILE;
  const json = deps.json === true;

  if (!fs.existsSync(file)) {
    if (json) {
      emitInspectJson(deps, {
        ok: false,
        code: 'SAVE_MISSING',
        message: `No save file found at ${path.resolve(file)}.`,
        hint: 'play and use "save" in a running session first, or pass a path: ai-rpg-engine inspect-save <path>.',
      });
      return 1;
    }
    deps.error(`  No save file found at ${path.resolve(file)}.`);
    deps.error(
      '  Hint: play and use "save" in a running session first, or pass a path: ai-rpg-engine inspect-save <path>.',
    );
    return 1;
  }

  // P8-SEC-002: the read itself can fail on a foreseeable input even after
  // existsSync passed — a DIRECTORY at the path (EISDIR), a permission-denied
  // file (EACCES), or a TOCTOU delete (ENOENT). Each previously raw-threw a
  // bare Node fs error out of this function, breaking the docstring's promise
  // that every failure renders as the structured `Cannot load save [CODE]` +
  // `Hint:` frame. Same voice as the authority's verdicts below.
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf-8');
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    if (json) {
      emitInspectJson(deps, {
        ok: false,
        code: 'SAVE_UNREADABLE',
        message: reason,
        hint: 'the path must be a readable save FILE. Check that it is not a directory and that you have permission to read it.',
      });
      return 1;
    }
    deps.error(`  Cannot load save [SAVE_UNREADABLE]: ${reason}`);
    deps.error(
      '  Hint: the path must be a readable save FILE. Check that it is not a directory and that you have permission to read it.',
    );
    return 1;
  }
  let envelope: unknown;
  let parsed = true;
  try {
    envelope = JSON.parse(raw);
  } catch {
    parsed = false; // the authority below renders the structured verdict
  }

  // Pack pre-read, exactly replayGame's CLI-002 move: a defensive optional
  // chain (never a shape check) so the pack's ruleset threads into deserialize
  // — the same parity restoreSessionFromSave has (stat/resource bounds, C7).
  const savedGameId = parsed
    ? (envelope as { world?: { state?: { meta?: { gameId?: unknown } } } } | null)?.world?.state
        ?.meta?.gameId
    : undefined;
  const catalog = deps.packs ?? allPacks;
  const pack = catalog.find((p) => p.meta.id === savedGameId) ?? null;

  let store: WorldStore;
  try {
    if (pack !== null && parsed) {
      // Same sequence Continue uses: createGame, deserialize, rebind,
      // migrateModuleStates, initializeNamespaces. Stopping at deserialize
      // let a version-drifted save exit 0 here and fail Continue.
      store = restoreSessionFromSave(pack, envelope).engine.store;
    } else {
      // Unparseable file → raw text through the same gate (its JSON error is
      // the verdict). Pack-not-installed → deserialize only; there is no
      // module list to migrate against.
      const worldJson = parsed
        ? JSON.stringify((envelope as { world?: unknown } | null)?.world)
        : raw;
      store = WorldStore.deserialize(worldJson, undefined, pack?.ruleset ?? undefined);
    }
  } catch (e) {
    if (e instanceof SaveLoadError) {
      if (json) {
        emitInspectJson(deps, { ok: false, code: e.code, message: e.message, hint: e.hint });
        return 1;
      }
      deps.error(`  Cannot load save [${e.code}]: ${e.message}`);
      deps.error(`  Hint: ${e.hint}`);
      return 1;
    }
    throw e;
  }

  const envelopeSavedAt = parsed ? (envelope as { savedAt?: unknown } | null)?.savedAt : undefined;
  const metaSavedAt = (store.state.meta as unknown as { savedAt?: unknown }).savedAt;
  const reportOpts: SaveReportOptions = {
    packName: pack?.meta.name ?? null,
    actionLog: parsed ? (envelope as { actionLog?: unknown } | null)?.actionLog : undefined,
    savedAt: envelopeSavedAt ?? metaSavedAt,
  };

  if (json) {
    emitInspectJson(deps, buildSaveSummary(store.state, reportOpts));
    return 0;
  }

  deps.log(renderSaveReport(store.state, reportOpts));
  return 0;
}
