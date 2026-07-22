#!/usr/bin/env node
// AI RPG Engine CLI — run, save, load, replay

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };
import {
  renderFullScreen,
  buildActionList,
  parseActionSelection,
  parseTextInput,
  TurnPresenter,
} from '@ai-rpg-engine/terminal-ui';
import { resolveEntity } from '@ai-rpg-engine/character-creation';
import { WorldStore, SaveLoadError, migrateModuleStates, type Engine, type EntityState, type RulesetDefinition } from '@ai-rpg-engine/core';
import { allPacks } from './packs.js';
import { promptMenu, promptLine, closeReadline } from './prompts.js';
import { buildCharacter } from './character-builder.js';
import { runCreateStarter } from './create-starter.js';
import { runValidate } from './validate.js';
import { runScaffold } from './scaffold.js';
import { runProfile } from './profile.js';
import { runGuardedAction } from './guard.js';
import { runNpcTurns } from './turns.js';
import { runWorldTick } from '@ai-rpg-engine/modules';
import { evaluateSessionEnd, renderSessionEnd, computeSessionStats } from './endgame.js';
import { appendRunRecord, readRunHistory, formatRecentRuns } from './history.js';
import { buildExtraActions, parseExtraSelection, buildHudWorld, renderInspectorReport, renderJournal, type ExtraAction } from './menu.js';
import { renderDirectorLedger } from './director.js';
import { loadExternalPack, PackLoadError, type LoadedPack } from './external-pack.js';
import { runInspectSave } from './inspect.js';

// Re-exported from guard.ts (extracted so turns.ts shares it without a
// bin ⇄ turns import cycle). Public surface + tests are unchanged.
export { runGuardedAction } from './guard.js';

const SAVE_DIR = '.ai-rpg-engine';
const SAVE_FILE = path.join(SAVE_DIR, 'save.json');

function printHelp() {
  console.log(`ai-rpg-engine v${version} — simulation-first RPG toolkit`);
  console.log('');
  console.log('Usage: ai-rpg-engine [command]');
  console.log('');
  console.log('Commands:');
  console.log('  run [path]     Start a game (default). With no path: choose a bundled starter.');
  console.log('                 With a path: load a scaffolded/built game module at that path.');
  console.log('                 If a save exists for the selected game, offers Continue / New game.');
  console.log('  validate       Validate a content pack JSON file (errors + advisories)');
  console.log('  scaffold       Write a minimal valid content stub (ability/zone/quest/status/dialogue)');
  console.log('  profile        Validate a profile/profile-set JSON, or scaffold a starter profile');
  console.log('  create-starter Scaffold a new starter from template');
  console.log('  replay         Restore the save and RESUME PLAY. (--replay is accepted but');
  console.log('                 re-simulation is not supported: the save is restored instead.)');
  console.log('  inspect-save   Validate a save through the same checks Continue uses, then');
  console.log('                 summarize it (world, player, globals, recent events).');
  console.log('                 With a path: inspect that save file instead of the default.');
  console.log('  version        Print version');
  console.log('  help           Show this help');
  console.log('');
  console.log('Flags:');
  console.log('  --seed <n>     With run: fix the world seed (replay a specific run exactly).');
  console.log('                 Omitted, each new session mints and prints its own seed.');
  console.log('  --version, -v  Print version');
  console.log('  --help, -h     Show this help');
}

// --- Run seeds (F-SEED-combat-rolls-seed-blind) ------------------------------
//
// Every fresh run used to be byte-identical: pack.createGame() was called with
// no seed, WorldStore defaulted meta.seed to 0, and the roll layer hashed only
// (tick, ids). New sessions now mint a real seed (the ONE place in the engine
// where a non-deterministic source is welcome — this is the interactive CLI,
// not module code), print it with a replay affordance, and honor --seed <n>.

/** Upper bound accepted for --seed: int32-positive so seed mixing in the roll
 *  hash stays exact-integer float math (see modules' simpleRoll). */
const MAX_SEED = 2147483647;

/** Mint a session seed. Non-deterministic BY DESIGN — two fresh runs must
 *  differ. Small enough (6 digits) to read off the screen and retype. */
export function mintSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}

/** The one seed line a new session prints — pairs the seed with the exact
 *  command that reproduces the run. Exported for unit testing. */
export function formatSeedLine(seed: number, packPath?: string): string {
  const cmd = packPath
    ? `ai-rpg-engine run ${packPath} --seed ${seed}`
    : `ai-rpg-engine run --seed ${seed}`;
  return `  Seed: ${seed} — replay this run with: ${cmd}`;
}

export type ParsedRunArgs =
  | { ok: true; path: string | null; seed: number | null }
  | { ok: false; message: string; hint: string };

/**
 * Parse `run` arguments: an optional pack path (first non-flag token, as
 * before) plus `--seed <n>` / `--seed=<n>`. The seed VALUE is consumed so it
 * can never be mistaken for the pack path. Validation is strict — decimal
 * digits only, 0..MAX_SEED — with a structured rejection (message + hint)
 * instead of a silent NaN world. Exported for unit testing.
 */
export function parseRunArgs(runArgs: string[]): ParsedRunArgs {
  let seed: number | null = null;
  let pathArg: string | null = null;
  for (let i = 0; i < runArgs.length; i++) {
    const arg = runArgs[i];
    if (arg === '--seed' || arg.startsWith('--seed=')) {
      const raw = arg === '--seed' ? runArgs[++i] : arg.slice('--seed='.length);
      if (raw === undefined || raw === '' || !/^\d+$/.test(raw) || Number(raw) > MAX_SEED) {
        return {
          ok: false,
          message: `--seed must be a non-negative integer (0-${MAX_SEED}), got ${raw === undefined || raw === '' ? '(missing)' : `"${raw}"`}.`,
          hint: 'Pass the whole number a previous session printed, e.g. --seed 482913.',
        };
      }
      seed = Number(raw);
    } else if (!arg.startsWith('-') && pathArg === null) {
      pathArg = arg;
    }
  }
  return { ok: true, path: pathArg, seed };
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] ?? 'run';

  if (args.includes('--version') || args.includes('-v') || command === 'version') {
    console.log(`ai-rpg-engine v${version}`);
    closeReadline();
    return;
  }

  // CLI-011: `<command> --help` routes into that command's own help rather than
  // the top-level help. Commands that own a distinct help screen (create-starter)
  // handle the flag themselves; we only short-circuit to the top-level help when
  // the help flag is the leading token, the explicit `help` command is used, or
  // the command has no help of its own.
  const wantsHelp = args.includes('--help') || args.includes('-h') || command === 'help';
  const COMMANDS_WITH_OWN_HELP = new Set(['create-starter', 'validate', 'scaffold', 'profile']);
  if (wantsHelp && !COMMANDS_WITH_OWN_HELP.has(command)) {
    printHelp();
    closeReadline();
    return;
  }

  switch (command) {
    case 'run':
      return runGame(args.slice(1));
    case 'validate': {
      // runValidate returns the exit code (0 valid / 1 errors-or-usage) rather than
      // exiting itself, so it stays unit-testable. The bin turns it into the process code.
      const code = runValidate(args.slice(1));
      closeReadline();
      if (code !== 0) process.exit(code);
      return;
    }
    case 'scaffold':
      runScaffold(args.slice(1));
      closeReadline();
      return;
    case 'profile': {
      // runProfile returns the exit code (0 ok / 1 errors-or-usage) rather than
      // exiting itself, so it stays unit-testable. The bin turns it into the process code.
      const code = runProfile(args.slice(1));
      closeReadline();
      if (code !== 0) process.exit(code);
      return;
    }
    case 'create-starter':
      runCreateStarter(args.slice(1));
      closeReadline();
      return;
    case 'replay': {
      // F1c: a restored game is PLAYABLE. replayGame() restores and returns
      // the live session; the shared prompt loop takes over instead of the
      // old print-summary-and-exit dead end. (--replay re-simulation retired
      // in v2.7 — see replayGame; resim parity is v2.8 work.)
      const restored = replayGame(args.slice(1));
      if (restored) {
        await playSessions(restored, null);
        console.log('\n  Farewell, wanderer.\n');
      }
      closeReadline();
      process.exit(0);
      return;
    }
    case 'inspect-save': {
      // ENG-006: runInspectSave validates through the SAME load authority the
      // run → Continue path uses (WorldStore.deserialize via inspect.ts) and
      // returns the exit code (0 valid / 1 structured failure) rather than
      // exiting itself — the runValidate/runProfile contract.
      const savePath = args.slice(1).find((a) => !a.startsWith('-'));
      const code = runInspectSave(savePath);
      closeReadline();
      if (code !== 0) process.exit(code);
      return;
    }
    default:
      console.log(`Unknown command: ${command}`);
      printHelp();
      closeReadline();
      process.exit(1);
  }
}

async function selectPack(): Promise<LoadedPack> {
  console.log('\n  ═══════════════════════════════════════');
  console.log('  AI RPG ENGINE');
  console.log('  Choose your adventure');
  console.log('  ═══════════════════════════════════════\n');

  // Recent completed runs (runs.jsonl) render under the pack list — the table
  // remembers how the last stories ended. No history, no section.
  const footer = formatRecentRuns(
    readRunHistory(SAVE_DIR),
    new Map(allPacks.map((p) => [p.meta.id, p.meta.name])),
  );

  const idx = await promptMenu(
    allPacks.map((p) => ({
      label: p.meta.name,
      detail: p.meta.tagline,
    })),
    footer ? { footer } : {},
  );

  return allPacks[idx];
}

/** One live game: a wired engine plus the pack it came from. */
export type Session = { engine: Engine; pack: LoadedPack };

/**
 * F1c: read just enough of the save file to offer "Continue" — never throws.
 * Returns null when there is no save or it is unreadable/foreign.
 */
export function readSaveSummary(): { gameId: string; tick: number } | null {
  try {
    if (!fs.existsSync(SAVE_FILE)) return null;
    const data = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf-8')) as {
      world?: { state?: { meta?: { gameId?: unknown; tick?: unknown } } };
    };
    const gameId = data.world?.state?.meta?.gameId;
    if (typeof gameId !== 'string') return null;
    const tick = data.world?.state?.meta?.tick;
    return { gameId, tick: typeof tick === 'number' ? tick : 0 };
  } catch {
    return null;
  }
}

/**
 * Restore the saved world into a fully pack-wired engine (the shared load
 * authority for `run` → Continue and `replay`).
 *
 * Build a fully-wired engine (modules registered, pack event subscriptions
 * bound to its live EventBus). createGame is also where pack closures hook the
 * bus — we must reuse THAT bus, so we restore state into this engine rather
 * than constructing a bare one via Engine.deserialize. Two hardenings over the
 * old replay-only path (F1c):
 *  - the pack's ruleset is threaded into WorldStore.deserialize so stat/
 *    resource bounds survive the load (parity with Engine.deserialize, C7)
 *  - moduleManager.rebindStore(restored) rebinds the module contexts' emit
 *    path so post-load reactive emits (status DoT, defeat cascades) land in
 *    the LIVE eventLog, not the orphaned construction store (parity with
 *    Engine.deserialize, v2.5 PC-1)
 *
 * P8-WL-002/P8-SP-001: this path also runs the ENG-009 module-migration seam,
 * which it previously bypassed entirely — Engine.deserialize had the seam,
 * but this function is the only load authority shipped play reaches, so
 * version-drifted module slices loaded raw and a save → Continue → save cycle
 * carried its original meta.moduleVersions forever. After the store swap:
 *  - migrateModuleStates(restored.state, moduleManager.getModules()) — each
 *    registered module whose persisted meta.moduleVersions entry differs from
 *    its registered version gets migrateState() on its slice, then the stamp
 *    is refreshed IN PLACE (the re-stamp lives inside migrateModuleStates,
 *    world.ts — the exact call Engine.deserialize makes), so the NEXT save is
 *    post-seam. All-or-nothing: a throwing hook rejects the load with
 *    SAVE_MODULE_MIGRATION_FAILED and the half-built engine is abandoned —
 *    the caller never receives a session holding half-migrated state.
 *  - moduleManager.initializeNamespaces(restored) — namespaces ABSENT from
 *    the save get their modules' registered defaults (factory defaults run
 *    against the RESTORED world, so eventLog-cursor state baselines to the
 *    loaded log's length — P8-WL-006); PRESENT namespaces are never touched.
 *
 * @throws SaveLoadError on malformed/unsupported saves, and with code
 *   SAVE_MODULE_MIGRATION_FAILED when a module's migrateState throws —
 *   caller renders it.
 */
export function restoreSessionFromSave(pack: LoadedPack, saveData?: unknown): Session {
  const data = (saveData ?? JSON.parse(fs.readFileSync(SAVE_FILE, 'utf-8'))) as {
    world?: { state?: { meta?: { seed?: number } } };
    actionLog?: unknown;
  };
  const seed = data.world?.state?.meta?.seed ?? 42;
  const engine = pack.createGame(seed);

  const restored = WorldStore.deserialize(
    JSON.stringify(data.world),
    engine.store.events,
    pack.ruleset,
  );
  (engine as { store: WorldStore }).store = restored;
  engine.moduleManager.rebindStore(restored);

  // ENG-009 seam on the shipped load path (see the doc block above). Order
  // matters: migrations first (a hook may discard its slice by returning
  // undefined), then namespace init re-defaults whatever is absent. The
  // module list comes from the pack-wired manager — pack closures own module
  // construction, so getModules() is the only public route to the exact
  // instances the pack registered.
  migrateModuleStates(restored.state, engine.moduleManager.getModules());
  engine.moduleManager.initializeNamespaces(restored);

  // Restore the action log so a save taken AFTER resuming still carries the
  // full history (`--replay` re-simulation stays coherent). The old replay
  // path silently dropped it — every resumed session forked its history.
  // Non-array shapes are ignored here (the strict validation lives on the
  // save-load authorities); an absent/corrupt log degrades to post-resume-only.
  if (Array.isArray(data.actionLog)) {
    (engine as unknown as { actionLog: unknown[] }).actionLog = [...data.actionLog];
  }

  return { engine, pack };
}

/**
 * F1c: when a save exists for the selected context, offer Continue / New game.
 * Returns the restored session, or null to proceed with a fresh game.
 */
async function maybeOfferResume(external: LoadedPack | null): Promise<Session | null> {
  const summary = readSaveSummary();
  if (!summary) return null;

  const pack = external
    ? external.meta.id === summary.gameId
      ? external
      : null
    : (allPacks.find((p) => p.meta.id === summary.gameId) ?? null);
  if (!pack) return null;

  console.log('\n  ═══════════════════════════════════════');
  console.log(`  A saved game exists — ${pack.meta.name} (turn ${summary.tick})`);
  console.log('  ═══════════════════════════════════════\n');
  const choice = await promptMenu([
    { label: 'Continue', detail: `Resume ${pack.meta.name} from ${path.resolve(SAVE_FILE)}` },
    { label: 'New game', detail: 'Start fresh (the old save remains until you save again)' },
  ]);
  if (choice !== 0) return null;

  try {
    const session = restoreSessionFromSave(pack);
    console.log(`  Loaded save. ${session.engine.world.eventLog.length} events in log — welcome back.`);
    return session;
  } catch (e) {
    if (e instanceof SaveLoadError) {
      console.error(`  Cannot load save [${e.code}]: ${e.message}`);
      console.error(`  Hint: ${e.hint}`);
      console.log('  Starting a new game instead.');
      return null;
    }
    throw e;
  }
}

/**
 * Replace the pack's default player with the created character. The player
 * entity key is NOT always 'player' — 6/10 packs use a pack-specific id (e.g.
 * 'runner', 'detective'). Read the real id from state.playerId and re-key the
 * built character to it, preserving the default player's zone (CLI-001).
 *
 * F-1049b518: ingestion goes through store.addEntity — the store's
 * detach-at-ingestion contract (structuredClone, F-71ec5dcd) — instead of the
 * old direct `state.entities[playerId] = playerEntity` write, which was the
 * one ingestion point left aliasing a caller-owned object into store state.
 * Exported for unit testing (the interactive wizard around it is readline-driven).
 */
export function installCreatedPlayer(engine: Engine, playerEntity: EntityState): void {
  const playerId = engine.store.state.playerId;
  const defaultPlayer = engine.store.state.entities[playerId];
  playerEntity.id = playerId;
  playerEntity.zoneId = defaultPlayer?.zoneId;
  engine.store.addEntity(playerEntity);
}

/**
 * Character creation + engine construction for a fresh game.
 *
 * `seed` defaults to a freshly minted one, so every construction path yields a
 * distinct world stream unless a specific seed is requested (--seed / tests).
 * The seed is passed to pack.createGame(seed) — the PackInfo contract
 * (`createGame(seed?)`) — and a pack that ignores it degrades gracefully: the
 * session still runs; the printed seed line reads the world's ACTUAL
 * meta.seed, so it never advertises a replay recipe the pack won't honor.
 * Exported for unit testing (the wizard inside is readline-driven; packs
 * without a buildCatalog skip it, which is what tests use).
 */
export async function createNewSession(pack: LoadedPack, seed: number = mintSeed()): Promise<Session> {
  const engine = pack.createGame(seed);

  // Character creation needs the pack's build catalog + ruleset. External
  // packs may omit them (the starter template does) — the pack's authored
  // default player is used as-is.
  if (pack.buildCatalog && pack.ruleset) {
    console.log('\n  ═══════════════════════════════════════');
    console.log(`  CHARACTER CREATION — ${pack.meta.name}`);
    console.log('  ═══════════════════════════════════════\n');

    const build = await buildCharacter(pack.buildCatalog, pack.ruleset);
    const playerEntity = resolveEntity(build, pack.buildCatalog, pack.ruleset);
    installCreatedPlayer(engine, playerEntity);
  }

  return { engine, pack };
}

function printSessionBanner(pack: LoadedPack) {
  console.log(`\n  ═══════════════════════════════════════`);
  console.log(`  ${pack.meta.name.toUpperCase()}`);
  console.log(`  An AI RPG Engine Starter`);
  console.log(`  ═══════════════════════════════════════\n`);
}

/**
 * F-7ea8fdaf: the single gate for "should extras exist this turn" — shared by
 * renderFrame (what's shown) and runSession (what handlePlayerInput may
 * resolve a typed number into), so the two can never drift. Extras vanish
 * during active dialogue: the numbers on screen belong to the dialogue
 * choices, and a value never rendered must never be reachable as a menu
 * selection either. Previously runSession built its own copy unconditionally
 * (unlike renderFrame's gated copy), so a number typed during dialogue that
 * missed the current node's choice range could fall through into an ability/
 * unlock entry that was never shown on screen — silently casting an ability
 * or spending XP. Exported for unit testing (runSession itself has no
 * exported/testable surface of its own).
 */
export function computeExtras(engine: Engine, pack: LoadedPack): ExtraAction[] {
  const dState = engine.world.modules['dialogue-core'] as { activeDialogue: string | null } | undefined;
  if (dState?.activeDialogue) return [];
  return buildExtraActions(engine, pack.progressionTrees ?? []);
}

/**
 * One full-screen frame: scene/HUD/log/actions from terminal-ui, decorated
 * with the CLI's own layers —
 *  - F1d HUD: the player shown carries xp/level pseudo-resources (display-only
 *    copy; live state untouched)
 *  - F1d menu: ability + unlock entries numbered to continue the base menu.
 *    P8-PS-005: the extras ride renderFullScreen's `extraActions` option, so
 *    they render INSIDE the frame — below the base list, above the screen-
 *    closing rule, sharing one number width. (The old pattern appended them
 *    after the frame's return: the closing rule bisected the menu on every
 *    frame and the number columns misaligned at the seam.)
 * BOTH menu layers vanish during active dialogue (terminal-ui suppresses the
 *  whole Actions section, extras included) — the numbers on screen belong to
 *  the dialogue choices.
 * `opts.menu: false` suppresses both layers outright: the session-end frame
 *  keeps the scene/HUD/log panels but offers a corpse no action menu (the
 *  finale's New game / Quit prompt owns the numbers there).
 * Exported for unit testing — the print sink is a parameter so tests capture
 * the frame without touching console (same rationale as narrateRound).
 */
export function renderFrame(
  engine: Engine,
  pack: LoadedPack,
  opts: { menu?: boolean; print?: (line: string) => void } = {},
) {
  const print = opts.print ?? console.log;
  const menu = opts.menu ?? true;
  const trees = pack.progressionTrees ?? [];

  // Building the extras costs ability/unlock scans — skip when the menu is
  // suppressed anyway (end frames). The dialogue gate itself lives in
  // computeExtras (F-7ea8fdaf), shared with runSession, so the numbers
  // rendered here and the numbers handlePlayerInput can resolve never drift.
  const extras = menu ? computeExtras(engine, pack) : [];

  const screen = renderFullScreen(
    buildHudWorld(engine.world, trees),
    engine.world.eventLog.slice(-8),
    menu ? { extraActions: extras } : { actions: false },
  );

  print('\n' + screen);
}

export type SessionOutcome = 'quit' | 'new-game';

/**
 * FU-2: narrate one action round. The round's events — everything the
 * eventLog gained since `logLenBefore` (the player's action plus the NPC
 * responses it provoked) — are presented as ONE turn, per the presenter's
 * contract ("an eventLog slice since the previous present"), and the styled
 * narration prints on its own line. An empty delta prints nothing.
 *
 * The returned audioCommands are deliberately unused: there is no terminal
 * audio backend — they are an embedder hook (terminal-ui's documented
 * playback ceiling). Scheduling warnings are advisory and likewise dropped.
 * Exported for unit testing — the print sink is a parameter so tests capture
 * output without touching console.
 */
export function narrateRound(
  presenter: TurnPresenter,
  engine: Engine,
  logLenBefore: number,
  print: (line: string) => void,
): void {
  const delta = engine.world.eventLog.slice(logLenBefore);
  if (delta.length === 0) return;
  const presented = presenter.present(engine.world, delta);
  print(`  ${presented.styledNarration}`);
}

/**
 * The world's half of one action round: NPC turns, then the world tick.
 *
 * Two end-gates, both load-bearing:
 *  - entry gate (F1a): a player action that ended the game (killing blow on
 *    the boss, death to a reactive effect) gets no NPC round at all;
 *  - the P8-WL-010 gate BETWEEN the NPC block and the world tick: when an
 *    NPC downs the player mid-round, the tick would otherwise still run on
 *    the dead-player world — pressures tick and the zone-entry spawn check
 *    can fire, so the death round's narration telegraphed 'Ambush: …' over
 *    the player's corpse, immediately followed by the defeat screen.
 *
 * `deps` exists for unit tests only (the gates are what's under test; the
 * real NPC/tick drivers are exercised by their own suites) — production
 * callers pass nothing and get the live drivers.
 */
export function runHostileRound(
  engine: Engine,
  pack: LoadedPack,
  deps: {
    npcTurns?: (engine: Engine) => unknown;
    worldTick?: (engine: Engine, opts: { genre?: string; log: (msg: string) => void }) => unknown;
    log?: (msg: string) => void;
  } = {},
): void {
  if (evaluateSessionEnd(engine)) return;
  (deps.npcTurns ?? runNpcTurns)(engine);
  if (evaluateSessionEnd(engine)) return; // P8-WL-010 — no tick over a corpse
  (deps.worldTick ?? runWorldTick)(engine, { genre: pack.meta.genres?.[0], log: deps.log ?? console.log });
}

/**
 * The shared interactive loop (run, run <path>, resumed saves, and replay all
 * land here). Each iteration:
 *   1. F1b — if the session is over (player downed / bosses downed), render
 *      the finale screen and offer New game / Quit: the loop ENDS instead of
 *      soft-locking on a corpse that can't act.
 *   2. render the frame, read one input, route it (handlePlayerInput).
 *   3. F1a — after the player's action resolves (and only if it didn't end
 *      the game), every living hostile in the zone takes its turn.
 *   4. F-ENG005 — then the WORLD takes its turn: runWorldTick reads the heat/
 *      safety/reputation/alert ledger defeat-fallout accrued and drives the
 *      pressure lifecycle (spawn, reveal, escalate, expire). Guarded inside
 *      like the NPC round — one bad tick logs one line, never kills the
 *      session. Its events land in the same round delta as the action.
 *      Both steps live in runHostileRound with its two end-gates (P8-WL-010).
 *   5. FU-2 — the round's eventLog delta (player + NPC + world-tick events)
 *      is presented once and its narration line printed. A round that ends
 *      the game still narrates — the line lands before the next iteration's
 *      finale screen. A REJECTED round (kind 'rejected' — the engine refused
 *      the submission, P8-PS-002) narrates its rejection but provokes no NPC
 *      or world turn: a dead menu entry costs the player nothing.
 */
async function runSession(engine: Engine, pack: LoadedPack): Promise<SessionOutcome> {
  // FU-2: ONE presenter per session — its AudioDirector carries sfx cooldown
  // state across rounds; per-round construction would reset every cooldown.
  const presenter = new TurnPresenter();
  while (true) {
    const end = evaluateSessionEnd(engine);
    if (end) {
      // The end frame keeps the scene/HUD/log panels but no action menu —
      // the session is over; the finale prompt below owns the numbers.
      renderFrame(engine, pack, { menu: false });
      console.log(renderSessionEnd(end, engine.world, pack.progressionTrees ?? []));

      // Record the COMPLETED run (victory or defeat — a mid-session quit
      // never reaches this branch). Guarded append: a history write failure
      // prints one structured line and the finale flow continues.
      const stats = computeSessionStats(engine.world, pack.progressionTrees ?? []);
      appendRunRecord(
        {
          ts: new Date().toISOString(),
          packId: pack.meta.id,
          outcome: end.kind,
          ...(end.trigger ? { endingId: end.trigger.id } : {}),
          rounds: stats.rounds,
          kills: stats.enemiesDefeated,
          xp: stats.xpEarned,
        },
        SAVE_DIR,
      );

      const choice = await promptMenu([
        { label: 'New game', detail: 'Return to the adventure select' },
        { label: 'Quit', detail: 'Leave the table' },
      ]);
      return choice === 0 ? 'new-game' : 'quit';
    }

    renderFrame(engine, pack);
    const input = await promptLine('  > ');

    // All routing lives in handlePlayerInput (exported + unit-tested); the
    // loop only decides "exit, NPC turns, narration, or keep prompting".
    // Notably this keeps every fs/engine failure inside the guarded router
    // instead of raw-throwing out of the loop, OUTSIDE main()'s .catch
    // (CS-C-008).
    // F-7ea8fdaf: extras computed via computeExtras — the same gate
    // renderFrame uses — instead of built unconditionally. A value never
    // rendered on screen (dialogue suppresses the whole extras layer) can
    // therefore never be parsed as a selection.
    const extras = computeExtras(engine, pack);
    const logLenBefore = engine.world.eventLog.length;
    const result = handlePlayerInput(engine, input, { ruleset: pack.ruleset, extras });
    if (result.kind === 'quit') return 'quit';

    if (result.kind === 'action') {
      runHostileRound(engine, pack);
    }

    // 'rejected' narrates too: the engine's structured refusal is the round's
    // one event, and the player deserves to hear it immediately rather than
    // finding it in the next frame's log panel (P8-PS-002).
    if (result.kind === 'action' || result.kind === 'rejected') {
      narrateRound(presenter, engine, logLenBefore, console.log);
    }
  }
}

/**
 * Session driver: play sessions until the player quits. 'new-game' from an
 * ending loops back — an external pack replays itself; the bundled flow
 * returns to the adventure select.
 *
 * Seeds: a FRESH session prints its seed line right under the banner (resumed
 * and replayed sessions don't — their world is mid-flight; a bare
 * `run --seed N` would not reproduce it without the action log).
 * `opts.seedOverride` (from --seed) pins the seed for every fresh session this
 * invocation starts — "run it back" semantics; without it each new game mints
 * its own. `opts.packPath` threads the external pack path into the replay
 * affordance so the printed command actually works.
 */
async function playSessions(
  initial: Session | null,
  external: LoadedPack | null,
  opts: { seedOverride?: number | null; packPath?: string | null } = {},
): Promise<void> {
  let pending: Session | null = initial;
  while (true) {
    let session = pending;
    pending = null;
    let fresh = false;
    if (!session) {
      const pack = external ?? (await selectPack());
      session = await createNewSession(pack, opts.seedOverride ?? undefined);
      fresh = true;
    }
    printSessionBanner(session.pack);
    if (fresh) {
      // Read the seed back from world truth, not from what we requested —
      // a pack that ignores its seed argument then prints an honest line.
      console.log(formatSeedLine(session.engine.world.meta.seed, opts.packPath ?? undefined) + '\n');
    }
    const outcome = await runSession(session.engine, session.pack);
    if (outcome === 'quit') return;
  }
}

async function runGame(runArgs: string[] = []) {
  // F-SEED: --seed <n> parsed and validated BEFORE anything interactive; an
  // invalid value is a structured rejection, not a silently-ignored token.
  const parsed = parseRunArgs(runArgs);
  if (!parsed.ok) {
    console.error(`  ✗ [INVALID_SEED] ${parsed.message}`);
    console.error(`  Hint: ${parsed.hint}`);
    closeReadline();
    process.exit(1);
    return; // unreachable; keeps control flow explicit for tests that stub exit
  }

  // F1e: `run <path>` loads a scaffolded/built game module instead of the
  // bundled starters. Structured load errors exit with the contract spelled out.
  const pathArg = parsed.path;
  let external: LoadedPack | null = null;
  if (pathArg) {
    try {
      external = await loadExternalPack(pathArg);
      console.log(`  Loaded pack "${external.meta.name}" (${external.meta.id}) from ${path.resolve(pathArg)}`);
    } catch (err) {
      if (err instanceof PackLoadError) {
        console.error(`  ✗ [${err.code}] ${err.message}`);
        console.error(`  Hint: ${err.hint}`);
        closeReadline();
        process.exit(1);
      }
      throw err;
    }
  }

  const resumed = await maybeOfferResume(external);
  await playSessions(resumed, external, { seedOverride: parsed.seed, packPath: pathArg });

  console.log('\n  Farewell, wanderer.\n');
  closeReadline();
  process.exit(0);
}

/**
 * CS-C-008: `save` is the one command whose whole purpose is preserving
 * progress — and it was the one that could destroy it. The old saveGame ran
 * bare mkdirSync/writeFileSync inside the readline callback, OUTSIDE main()'s
 * promise chain, so an EACCES/EROFS/ENOSPC surfaced as an uncaught raw stack
 * that killed the process along with the unsaved session. Guarded now: on
 * failure print a structured [SAVE_WRITE_FAILED] line + hint and return false
 * so the caller keeps the loop (and the session) alive for a retry or a
 * relocated save. On success the resolved path is printed (CS-C-009) so the
 * player knows saves are cwd-relative. Exported for unit testing.
 */
export function saveGameGuarded(
  engine: Engine,
  log: (msg: string) => void = console.log,
): boolean {
  const resolvedPath = path.resolve(SAVE_FILE);
  try {
    if (!fs.existsSync(SAVE_DIR)) {
      fs.mkdirSync(SAVE_DIR, { recursive: true });
    }
    fs.writeFileSync(SAVE_FILE, engine.serialize(), 'utf-8');
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    log(`  [SAVE_WRITE_FAILED] Could not write ${resolvedPath}: ${reason}`);
    log('  Hint: run from a directory you can write to. Your session is still live — you can keep playing or try "save" again.');
    return false;
  }
  log(`  Game saved to ${resolvedPath}`);
  return true;
}

/**
 * CS-C-005: in-game help generated from the ACTIVE pack's ruleset verbs
 * (id + player-facing description — authored for exactly this purpose and
 * previously rendered nowhere), so pack-defining mechanics like the vampire's
 * `feed`/`enthrall` or the universal `guard`/`disengage` are discoverable
 * instead of the old hardcoded seven-verb line. The session meta commands are
 * appended so `help` stays the one complete list. Falls back to the engine's
 * registered verbs when no ruleset is available. Exported for unit testing.
 */
export function formatGameHelp(engine: Engine, ruleset?: RulesetDefinition): string {
  const verbs: { id: string; description: string }[] =
    ruleset && ruleset.verbs.length > 0
      ? ruleset.verbs.map((v) => ({ id: v.id, description: v.description ?? v.name }))
      : engine.getAvailableActions().map((id) => ({ id, description: '' }));

  const meta = [
    { id: 'save', description: `Save the game (writes ${SAVE_FILE})` },
    { id: 'quit', description: 'Exit the game (progress is NOT saved automatically)' },
    { id: 'help', description: 'Show this list' },
  ];

  const width = Math.max(...[...verbs, ...meta].map((v) => v.id.length));
  const row = (v: { id: string; description: string }) =>
    `    ${v.id.padEnd(width + 2)}${v.description}`.trimEnd();

  const lines: string[] = [''];
  lines.push('  Commands:');
  for (const v of verbs) lines.push(row(v));
  lines.push('');
  lines.push('  Session:');
  for (const v of meta) lines.push(row(v));
  lines.push('');
  lines.push('  Or type a number to select one of the listed actions.');
  return lines.join('\n');
}

/**
 * Discriminated result of one line of player input — lets the readline loop
 * stay a two-branch shell while the real routing logic stays unit-testable.
 */
export type PlayerInputResult =
  | { kind: 'empty' }
  | { kind: 'quit' }
  | { kind: 'save'; ok: boolean }
  | { kind: 'help' }
  | { kind: 'action'; via: 'dialogue-choice' | 'menu' | 'extra' | 'text' }
  /** A MENU-selected submission the engine refused (action.rejected) —
   *  P8-PS-002: the menu advertised it, the engine said no; the refusal
   *  narrates but the round is NOT forfeited (no NPC turns, no world tick). */
  | { kind: 'rejected' }
  | { kind: 'unknown' };

/**
 * Route one line of player input. Exported for unit testing — the interactive
 * prompt() loop is readline-driven and awkward to drive in a test (same
 * rationale as runGuardedAction / replayGame).
 *
 * CS-C-001 (the false-save half): meta commands match on the FIRST word,
 * case-insensitively, not on the exact string. Previously only the exact
 * strings 'save'/'quit'/'exit'/'help' were intercepted, while parseTextInput
 * turned a leading save/quit into pseudo-verbs — so 'save game' was submitted
 * to the engine as verb 'save', rejected, and rendered as nothing: the player
 * believed they saved and they had not. Data-loss-adjacent, hence first-word
 * routing BEFORE anything reaches the engine.
 *
 * F1d: `opts.extras` extends the numbered range — a number beyond the base
 * menu (and outside dialogue) resolves to an appended ability/unlock entry,
 * which is how `use-ability` finally receives its `parameters.abilityId`.
 */
export function handlePlayerInput(
  engine: Engine,
  rawInput: string,
  opts: { ruleset?: RulesetDefinition; log?: (msg: string) => void; extras?: ExtraAction[] } = {},
): PlayerInputResult {
  const log = opts.log ?? console.log;
  const trimmed = rawInput.trim();
  if (!trimmed) return { kind: 'empty' };

  // Meta commands — first-word match so 'save game' / 'quit now' / 'HELP me'
  // reach the meta handlers instead of dying in the engine's rejection
  // pipeline with zero on-screen feedback.
  const firstWord = trimmed.split(/\s+/)[0].toLowerCase();
  if (firstWord === 'quit' || firstWord === 'exit') {
    return { kind: 'quit' };
  }
  if (firstWord === 'save') {
    return { kind: 'save', ok: saveGameGuarded(engine, log) };
  }
  if (firstWord === 'help') {
    log(formatGameHelp(engine, opts.ruleset));
    return { kind: 'help' };
  }

  // Dialogue mode — a number selects a dialogue choice.
  const dState = engine.world.modules['dialogue-core'] as { activeDialogue: string | null } | undefined;
  if (dState?.activeDialogue) {
    const choiceIndex = parseInt(trimmed, 10);
    if (!isNaN(choiceIndex) && choiceIndex >= 1) {
      const logLenBefore = engine.world.eventLog.length;
      const ok = runGuardedAction(
        () =>
          engine.submitAction('choose', {
            parameters: { choiceIndex: choiceIndex - 1 },
          }),
        log,
      );
      // Rejections are EVENTS, not throws — runGuardedAction cannot see them.
      // Scan only the events this submission appended, and only for a rejected
      // `choose`, so a companion/reactive action rejected in the same window
      // does not trigger a false fall-through.
      const chooseRejected = engine.world.eventLog
        .slice(logLenBefore)
        .some(
          (e) =>
            e.type === 'action.rejected' &&
            (e.payload as { verb?: unknown }).verb === 'choose',
        );
      if (ok && !chooseRejected) {
        return { kind: 'action', via: 'dialogue-choice' };
      }
      // Dialogue-trap guard (pairs with the modules-side dialogue.ended fix):
      // dialogue is flagged active but `choose` was rejected — e.g. the node
      // has no choices and the menu on screen is a numbered ACTION menu.
      // Previously the doomed hijack returned here anyway, so every numeric
      // input died in a rejected `choose` and the menu was dead: a stuck
      // session. Fall through to normal number/text handling instead.
    }
  }

  // Numbered menu selection
  const numAction = parseActionSelection(trimmed, engine.world);
  if (numAction) {
    const logLenBefore = engine.world.eventLog.length;
    runGuardedAction(
      () =>
        engine.submitAction(numAction.verb, {
          targetIds: numAction.targetIds,
          toolId: numAction.toolId,
          parameters: numAction.parameters,
        }),
      log,
    );
    // P8-PS-002 (routing half): a menu entry is the UI's own promise — when
    // the engine refuses it anyway (the 'menu offered it, engine rejected it'
    // trap: 'Speak to <npc>' with no dialogue authored, the exact composed
    // finding), the player made no mistake and forfeits nothing. Scan only
    // this submission's delta, only for the player's own rejected verb (the
    // dialogue branch's exact discipline for 'choose'), and return the
    // non-action 'rejected' kind: the refusal still narrates, but no NPC
    // turns and no world tick follow. The honest MENU-side gate (don't offer
    // dialogue-less NPCs at all) needs a dialogue-registry read the modules
    // layer does not expose yet — dialogue-core's registry is closure-private
    // with no formula/world-state surface — so the cost is gated here, at the
    // routing layer, instead.
    const rejected = engine.world.eventLog
      .slice(logLenBefore)
      .some(
        (e) =>
          e.type === 'action.rejected' &&
          e.actorId === engine.world.playerId &&
          (e.payload as { verb?: unknown }).verb === numAction.verb,
      );
    if (rejected) return { kind: 'rejected' };
    return { kind: 'action', via: 'menu' };
  }

  // F1d: appended menu entries (abilities / advancement) continue the base
  // numbering — resolve them BEFORE the free-text fallback so '7' cannot be
  // submitted to the engine as bogus verb '7'.
  if (opts.extras && opts.extras.length > 0) {
    const extra = parseExtraSelection(trimmed, buildActionList(engine.world).length, opts.extras);
    if (extra) {
      // Debug entries render the inspector report and consume no turn — the
      // sentinel verb never reaches the engine (menu.ts's group contract).
      if (extra.group === 'debug') {
        log(renderInspectorReport(engine));
        return { kind: 'help' };
      }
      // Director's Ledger: same no-turn contract as debug (F-ENG005).
      if (extra.group === 'director') {
        log(renderDirectorLedger(engine));
        return { kind: 'help' };
      }
      // Journal: quests and undertakings — same no-turn contract (F-ENG005).
      if (extra.group === 'journal') {
        log(renderJournal(engine.world));
        return { kind: 'help' };
      }
      runGuardedAction(
        () =>
          engine.submitAction(extra.verb, {
            targetIds: extra.targetIds,
            parameters: extra.parameters,
          }),
        log,
      );
      return { kind: 'action', via: 'extra' };
    }
  }

  // P8-PS-001: a number that resolved to NEITHER the base menu NOR the extras
  // range must never fall through to the free-text parser — that submitted it
  // to the engine as a bogus verb ('99' → verb '99'), the engine rejected it,
  // and because the result was kind 'action' every living hostile got a free
  // attack on a mistyped menu number. Digits are a menu gesture: answer with
  // the menu's real range and consume nothing (the extras entries' own
  // no-turn contract, applied to the whole numbered range).
  if (/^\d+$/.test(trimmed)) {
    const menuSize = buildActionList(engine.world).length + (opts.extras?.length ?? 0);
    log(`  Please enter a number between 1 and ${menuSize}.`);
    return { kind: 'unknown' };
  }

  // Freeform text
  const textAction = parseTextInput(trimmed, engine.world);
  if (textAction) {
    // Belt-and-braces for CS-C-001: parseTextInput maps a leading save/quit
    // into pseudo-verbs the engine always rejects. The first-word routing
    // above already intercepts them; if the parser and that routing ever
    // drift, still refuse to submit a pseudo-verb as an engine action.
    if (textAction.verb === 'save') return { kind: 'save', ok: saveGameGuarded(engine, log) };
    if (textAction.verb === 'quit') return { kind: 'quit' };
    runGuardedAction(
      () =>
        engine.submitAction(textAction.verb, {
          targetIds: textAction.targetIds,
          toolId: textAction.toolId,
          parameters: textAction.parameters,
        }),
      log,
    );
    return { kind: 'action', via: 'text' };
  }

  log(`  Unknown command: ${trimmed}. Type "help" for options.`);
  return { kind: 'unknown' };
}

/**
 * Restore the save and hand back the live session so the caller can enter the
 * shared prompt loop (F1c — a restored game is playable, not a
 * print-summary-and-exit dead end).
 *
 * P8-WL-001/P8-PS-004 (v2.7): the `--replay` RE-SIMULATION path is retired —
 * `--replay` now restores exactly like the default, plus one structured
 * notice. Re-simulation replayed the actionLog through a fresh
 * pack.createGame(seed), which has been structurally divergent since the
 * world-state waves: character creation is not an action (the resim played
 * the pack's DEFAULT character, not the created one the save holds), and
 * world-tick/encounter-spawn mutate state OUTSIDE the action log (spawned
 * entities never existed during resim; fresh cursor state then rolled a spawn
 * burst against the fully-restored eventLog) — all while printing 'Replay
 * complete' with no warning. Restore-then-continue is the honest v2.7
 * behavior; resim PARITY (recording creation as a synthetic action, ticking
 * the world inside the resim loop at live cadence) is documented v2.8 work.
 *
 * Exported for unit testing (same rationale as runGuardedAction — this reads
 * a real save file off disk and drives process.exit on bad input, so tests
 * point it at a temp cwd and stub process.exit rather than shelling out).
 * Tests exercising only the restore semantics ignore the returned session.
 */
export function replayGame(args: string[] = []): Session | undefined {
  if (!fs.existsSync(SAVE_FILE)) {
    console.error('  No save file found.');
    process.exit(1);
  }

  let data: any;
  try {
    data = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf-8'));
  } catch {
    console.error('  Save file is corrupted or not valid JSON.');
    process.exit(1);
  }

  // CLI-002: select the pack whose manifest id matches the SAVED gameId rather
  // than blindly using allPacks[0] (fantasy). Loading a cyberpunk save through
  // the fantasy pack produced nonsense.
  const savedGameId: string | undefined = data.world?.state?.meta?.gameId;
  const pack = allPacks.find((p) => p.meta.id === savedGameId);
  if (!pack) {
    console.error(`  Cannot load save: no installed pack matches gameId "${savedGameId ?? '(missing)'}".`);
    console.error(`  Installed packs: ${allPacks.map((p) => p.meta.id).join(', ')}`);
    console.error('  Hint: this save was made by a pack that is not part of this build.');
    process.exit(1);
  }

  if (args.includes('--replay')) {
    // The structured notice (the SAVE_WRITE_FAILED voice: [CODE] line + Hint,
    // non-fatal, stdout): the flag is honored as a restore, never silently.
    console.log(
      '  [REPLAY_RESIM_UNSUPPORTED] --replay re-simulation is not supported with world-state modules; restoring the save instead (same as Continue).',
    );
    console.log(
      '  Hint: world ticks and encounter spawns evolve the world outside the action log, so a re-simulation silently diverges from the save. Your session resumes exactly where it was saved.',
    );
  }

  // RESTORE the saved world state (entities, eventLog, globals, pending,
  // rngState, meta incl. idCounter) into a pack-wired engine — shared with
  // `run` → Continue (see restoreSessionFromSave: EventBus reuse core-004,
  // ruleset bounds C7, rebindStore v2.5 PC-1, ENG-009 seam P8-WL-002).
  let session: Session;
  try {
    session = restoreSessionFromSave(pack, data);
  } catch (e) {
    if (e instanceof SaveLoadError) {
      console.error(`  Cannot load save [${e.code}]: ${e.message}`);
      console.error(`  Hint: ${e.hint}`);
      process.exit(1);
    }
    throw e;
  }
  console.log(`  Loaded save. ${session.engine.world.eventLog.length} events in log.`);

  const engine = session.engine;
  console.log(`  Final tick: ${engine.tick}`);
  console.log(`  Player location: ${engine.world.locationId}`);
  const player = engine.world.entities[engine.store.state.playerId];
  if (player) {
    const resDisplay = Object.entries(player.resources)
      .map(([k, v]) => `${k}: ${v}`)
      .join('  ');
    console.log(`  ${resDisplay}`);
  }
  return session;
}

// inspect-save's implementation lives in inspect.ts (ENG-006): the old
// inspectSave() here raw-JSON.parsed the save and field-picked it — schema
// drift printed `undefined`, the globals dump was unbounded, and it bypassed
// every SaveLoadError authority the run → Continue path enforces.

// Only run the CLI when this file is the process entry point. Importing it (e.g.
// from a unit test that exercises the exported helpers) must NOT kick off main()
// and its readline/argv handling.
const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((e: Error) => { console.error(e.message); process.exit(1); });
}
