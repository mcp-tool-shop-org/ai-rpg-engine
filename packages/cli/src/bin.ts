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
  visibleDialogueChoices,
  TurnPresenter,
  SCREEN_WIDTH,
  frameRule,
  clipToWidth,
  glyphsFor,
} from '@ai-rpg-engine/terminal-ui';
import { resolveEntity, suggestBuild } from '@ai-rpg-engine/character-creation';
import { ensureStartingLoadouts } from '@ai-rpg-engine/equipment';
import { SaveLoadError, SeededRNG, type Engine, type EntityState, type RulesetDefinition } from '@ai-rpg-engine/core';
import { allPacks, formatPackCatalog, runPacksCommand } from './packs.js';
import { promptMenu, promptLine, closeReadline } from './prompts.js';
import { buildCharacter } from './character-builder.js';
import { runCreateStarter } from './create-starter.js';
import { runValidate } from './validate.js';
import { runSidecar } from './sidecar-command.js';
import { runScaffold } from './scaffold.js';
import { runProfile } from './profile.js';
import { runAuditContent } from './audit-content.js';
import { runGuardedAction } from './guard.js';
import { runNpcTurns, runCompanionTurns } from './turns.js';
import { emitZoneEnteredForPlacement, runWorldTick } from '@ai-rpg-engine/modules';
import { evaluateSessionEnd, renderSessionEnd, computeSessionStats } from './endgame.js';
import { appendRunRecord, readRunHistory, formatRecentRuns } from './history.js';
import { buildExtraActions, parseExtraSelection, buildHudWorld, buildPartyStatusLine, renderInspectorReport, renderJournal, type ExtraAction } from './menu.js';
import { renderDirectorLedger } from './director.js';
import { loadExternalPack, PackLoadError, type LoadedPack } from './external-pack.js';
import { runInspectSave } from './inspect.js';
import { restoreSessionFromSave, type Session } from './restore-session.js';

export { restoreSessionFromSave, type Session };

// Re-exported from guard.ts (extracted so turns.ts shares it without a
// bin ⇄ turns import cycle). Public surface + tests are unchanged.
export { runGuardedAction } from './guard.js';

const SAVE_DIR = '.ai-rpg-engine';
const SAVE_FILE = path.join(SAVE_DIR, 'save.json');

/** How many checkpoint-<NNN>.json files F-b369c8c5's rotation keeps under
 *  SAVE_DIR before pruning the oldest. save.json is NOT one of these five —
 *  it is the separate, always-current latest-pointer (back-compat). */
export const CHECKPOINT_KEEP = 5;

const CHECKPOINT_FILE_RE = /^checkpoint-(\d+)\.json$/;

function printHelp() {
  console.log(`ai-rpg-engine v${version} — simulation-first RPG toolkit`);
  console.log('');
  console.log('Usage: ai-rpg-engine [command]');
  console.log('');
  console.log('Commands:');
  console.log('  run [path]     Start a game (default). With no path: choose a bundled starter.');
  console.log('                 With a path: load a scaffolded/built game module at that path.');
  console.log('                 If a save exists for the selected game, offers Continue / New game.');
  console.log('  packs          List installed starter ids (id, name, tagline). --json for an array.');
  console.log('  validate       Validate a content pack JSON file (errors + advisories)');
  console.log('  scaffold       Write a minimal valid content stub (ability/zone/quest/status/dialogue/entity/item/hazard)');
  console.log('  profile        Validate a profile/profile-set JSON, or scaffold a starter profile');
  console.log('  create-starter Scaffold a new starter from template');
  console.log('  replay         Restore the save and RESUME PLAY. (--replay is accepted but');
  console.log('                 re-simulation is not supported: the save is restored instead.)');
  console.log('                 --list-checkpoints lists saved checkpoints, newest first.');
  console.log('                 --checkpoint <n|file>  restore that checkpoint instead of save.json.');
  console.log('                 --pack <path|id>  pack for a save whose gameId is not bundled');
  console.log('                 (create-starter / run <path> saves). A positional save path is');
  console.log('                 accepted the same way inspect-save takes one.');
  console.log('  inspect-save   Validate a save through the same checks Continue uses, then');
  console.log('                 summarize it (world, player, globals, recent events).');
  console.log('                 With a path: inspect that save file instead of the default.');
  console.log('                 --json prints the save-summary fields as one JSON object.');
  console.log('  audit-content  Dev tool: load a combat-content JSON file and print a');
  console.log('                 content-audit report (encounter/boss/region/project balance).');
  console.log('                 --json prints the six audit sections as data.');
  console.log('  version        Print version');
  console.log('  help           Show this help');
  console.log('');
  console.log('Flags:');
  console.log('  --seed <n>     With run: fix the world seed (replay a specific run exactly).');
  console.log('                 --seed=<n> is accepted too. Omitted, each new session mints and prints its own.');
  console.log('  --pack <id>    With run: start that bundled starter (exact meta.id match).');
  console.log('                 Unknown ids are refused (same voice as a bad --seed).');
  console.log('  --list-packs   With run: print installed starter ids and exit (no readline).');
  console.log('  --default-hero With run: skip character creation; keep the pack\'s authored player.');
  console.log('  --random-hero  With run: skip the wizard; install suggestBuild(catalog, SeededRNG(seed)).');
  console.log('                 Cannot combine with --default-hero.');
  console.log('  --json         With validate, inspect-save, audit-content, packs, or profile validate: machine JSON.');
  console.log('                 Not accepted on interactive run or profile scaffold.');
  console.log('  --ascii, --plain  7-bit glyphs (also ASCII_ONLY=1 or TERM=dumb). Color stays on NO_COLOR.');
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
export const MAX_SEED = 2147483647;

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
  | {
      ok: true;
      path: string | null;
      seed: number | null;
      packId: string | null;
      defaultHero: boolean;
      randomHero: boolean;
      listPacks: boolean;
    }
  | { ok: false; message: string; hint: string; code: 'INVALID_SEED' | 'INVALID_FLAG' | 'INVALID_PACK' };

const RUN_FLAG_HINT =
  `run accepts --seed <n> or --seed=<n> (0-${MAX_SEED}), --pack <id>, --list-packs, --default-hero, --random-hero, and --ascii. Unknown flags are refused so a typo cannot be mistaken for a pack path.`;

/**
 * Parse `run` arguments: an optional pack path (first non-flag token, as
 * before) plus `--seed <n>` / `--seed=<n>`, `--pack <id>` (exact match
 * against bundled starter meta.id), and `--default-hero` (skip chargen).
 * The seed VALUE is consumed so it can never be mistaken for the pack path.
 * Validation is strict — decimal digits only, 0..MAX_SEED — with a structured
 * rejection (message + hint) instead of a silent NaN world. Unknown `--*`
 * tokens are refused (named) rather than dropped, so a typo like
 * `--seee 482913` cannot become a pack path. Exported for unit testing.
 */
export function parseRunArgs(runArgs: string[]): ParsedRunArgs {
  let seed: number | null = null;
  let pathArg: string | null = null;
  let packId: string | null = null;
  let defaultHero = false;
  let randomHero = false;
  let listPacks = false;
  for (let i = 0; i < runArgs.length; i++) {
    const arg = runArgs[i];
    if (arg === '--seed' || arg.startsWith('--seed=')) {
      const raw = arg === '--seed' ? runArgs[++i] : arg.slice('--seed='.length);
      if (raw === undefined || raw === '' || !/^\d+$/.test(raw) || Number(raw) > MAX_SEED) {
        return {
          ok: false,
          code: 'INVALID_SEED',
          message: `--seed must be a non-negative integer (0-${MAX_SEED}), got ${raw === undefined || raw === '' ? '(missing)' : `"${raw}"`}.`,
          hint: `Pass the whole number a previous session printed, e.g. --seed 482913 or --seed=482913.`,
        };
      }
      seed = Number(raw);
    } else if (arg === '--pack' || arg.startsWith('--pack=')) {
      const raw = arg === '--pack' ? runArgs[++i] : arg.slice('--pack='.length);
      if (raw === undefined || raw === '' || raw.startsWith('-')) {
        return {
          ok: false,
          code: 'INVALID_PACK',
          message: `--pack must be a bundled starter id, got ${raw === undefined || raw === '' ? '(missing)' : `"${raw}"`}.`,
          hint: `Installed packs: ${allPacks.map((p) => p.meta.id).join(', ')}. e.g. --pack chapel-threshold.`,
        };
      }
      if (!allPacks.some((p) => p.meta.id === raw)) {
        return {
          ok: false,
          code: 'INVALID_PACK',
          message: `--pack "${raw}" is not an installed starter.`,
          hint: `Installed packs: ${allPacks.map((p) => p.meta.id).join(', ')}. Pass an exact id, e.g. --pack chapel-threshold.`,
        };
      }
      packId = raw;
    } else if (arg === '--default-hero') {
      defaultHero = true;
    } else if (arg === '--random-hero') {
      randomHero = true;
    } else if (arg === '--list-packs') {
      listPacks = true;
    } else if (arg === '--ascii' || arg === '--plain') {
      // Glyph gate — applied from env in main(); accepted here so it is not
      // mistaken for a pack path (F-99681db1).
    } else if (arg.startsWith('-')) {
      // Consume a following non-flag value so `--seee 482913` cannot land in
      // the pack-path slot (F-d464da79). Hard-refuse: naming then starting a
      // live game is still a silent skip of the operator's intent.
      return {
        ok: false,
        code: 'INVALID_FLAG',
        message: `"${arg}" is not a recognized run flag.`,
        hint: RUN_FLAG_HINT,
      };
    } else if (pathArg === null) {
      pathArg = arg;
    }
  }
  if (defaultHero && randomHero) {
    return {
      ok: false,
      code: 'INVALID_FLAG',
      message: '--random-hero cannot be combined with --default-hero.',
      hint: "Use --default-hero to keep the pack's authored player, or --random-hero to generate a seeded legal build — not both.",
    };
  }
  if (pathArg !== null && packId !== null) {
    return {
      ok: false,
      code: 'INVALID_FLAG',
      message: 'run accepts either --pack <id> or a module path, not both.',
      hint: 'Use --pack chapel-threshold for a bundled starter, or `run <path>` for a scaffolded module.',
    };
  }
  return { ok: true, path: pathArg, seed, packId, defaultHero, randomHero, listPacks };
}

function applyAsciiFlag(args: string[]): void {
  if (args.includes('--ascii') || args.includes('--plain')) {
    process.env.ASCII_ONLY = '1';
  }
}

async function main() {
  const args = process.argv.slice(2);
  applyAsciiFlag(args);
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
  const COMMANDS_WITH_OWN_HELP = new Set(['create-starter', 'validate', 'scaffold', 'profile', 'audit-content', 'sidecar']);
  if (wantsHelp && !COMMANDS_WITH_OWN_HELP.has(command)) {
    printHelp();
    closeReadline();
    return;
  }

  switch (command) {
    case 'run':
      return runGame(args.slice(1));
    case 'packs': {
      const code = runPacksCommand(args.slice(1));
      closeReadline();
      if (code !== 0) process.exit(code);
      return;
    }
    case 'validate': {
      // runValidate returns the exit code (0 valid / 1 errors-or-usage) rather than
      // exiting itself, so it stays unit-testable. The bin turns it into the process code.
      const code = runValidate(args.slice(1));
      closeReadline();
      if (code !== 0) process.exit(code);
      return;
    }
    case 'sidecar': {
      // The sim as a JSON-RPC server over stdio. Returns null while the server
      // runs -- the process stays alive on stdin, which is the point.
      // Await: a positional path loads through loadExternalPack (F-dda90fe8).
      const code = await runSidecar(args.slice(1));
      if (code === null) return;
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
      const restored = await replayGame(args.slice(1));
      if (restored) {
        await playSessions(restored, restored.pack);
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
      const rest = args.slice(1);
      const json = rest.includes('--json') || rest.some((a) => a.startsWith('--json='));
      const savePath = rest.find((a) => !a.startsWith('-'));
      const code = runInspectSave(savePath, {
        log: (m) => console.log(m),
        error: (m) => console.error(m),
        json,
      });
      closeReadline();
      if (code !== 0) process.exit(code);
      return;
    }
    case 'audit-content': {
      // V3-DIR-2: a dev-only content-audit report, NOT the player-facing
      // Director's Ledger (renderDirectorLedger/director.ts). runAuditContent
      // returns the exit code (0 loaded / 1 errors-or-usage) rather than
      // exiting itself — the runValidate/runProfile/runInspectSave contract.
      const code = runAuditContent(args.slice(1));
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

const TITLE_WIDTH = SCREEN_WIDTH - 2;

/** Flush-left SCREEN_WIDTH rule around a 2-space-indented title (+ optional subtitle). */
export function formatFrameBanner(title: string, subtitle?: string): string {
  const lines = ['', frameRule(), `  ${clipToWidth(title, TITLE_WIDTH)}`];
  if (subtitle) lines.push(`  ${clipToWidth(subtitle, TITLE_WIDTH)}`);
  lines.push(frameRule(), '');
  return lines.join('\n');
}

export function formatWelcomeBanner(): string {
  return formatFrameBanner('AI RPG ENGINE', 'Choose your adventure');
}

export function formatSessionBanner(pack: LoadedPack, opts: { external?: boolean } = {}): string {
  const subtitle = opts.external
    ? (pack.meta.tagline ? pack.meta.tagline : undefined)
    : 'An AI RPG Engine Starter';
  return formatFrameBanner(pack.meta.name.toUpperCase(), subtitle);
}

/** First-run controls line printed under the session banner before the first `>`. */
export function formatFirstRunLegend(): string {
  return '  Type a number to select. Type help for verbs, save or quit to leave.';
}

async function selectPack(): Promise<LoadedPack> {
  console.log(formatWelcomeBanner());

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
 * Boot Continue candidates: named slots + save.json for the selected pack
 * (or every readable slot when no pack is selected yet). Rotating checkpoints
 * stay on replay/--checkpoint — including them here would turn a single
 * save.json into a multi-slot menu because every default save also rotates one.
 */
export function listResumeSlots(packId: string | null, saveDir: string = SAVE_DIR): LoadableSlot[] {
  return listLoadableSlots(saveDir).filter((s) => {
    if (s.kind === 'checkpoint') return false;
    if (!s.gameId) return false;
    return packId ? s.gameId === packId : true;
  });
}

function packForResumeSlot(slot: LoadableSlot, external: LoadedPack | null): LoadedPack | null {
  if (external && slot.gameId === external.meta.id) return external;
  if (slot.gameId) return allPacks.find((p) => p.meta.id === slot.gameId) ?? null;
  return null;
}

/**
 * F1c / F-16ff4dd1: when loadable slots exist for the selected pack (or the
 * Continue context), offer Continue / New game. Named slots count — not only
 * save.json. One slot keeps the two-item menu; several lists those slots plus
 * New game. Returns the restored session, or null to proceed with a fresh game.
 */
export async function maybeOfferResume(external: LoadedPack | null): Promise<Session | null> {
  const slots = listResumeSlots(external?.meta.id ?? null);
  const restorable = slots.filter((s) => packForResumeSlot(s, external) !== null);
  if (restorable.length === 0) return null;

  const loadSlot = (slot: LoadableSlot): Session | null => {
    const pack = packForResumeSlot(slot, external);
    if (!pack) return null;
    const session = loadSessionFromFile(pack, slot.path);
    if (!session) {
      console.log('  Starting a new game instead.');
      return null;
    }
    return session;
  };

  if (restorable.length === 1) {
    const slot = restorable[0];
    const pack = packForResumeSlot(slot, external)!;
    console.log(formatFrameBanner(`A saved game exists — ${pack.meta.name} (turn ${slot.tick ?? 0})`));
    const choice = await promptMenu([
      { label: 'Continue', detail: `Resume ${pack.meta.name} from ${path.resolve(slot.path)}` },
      { label: 'New game', detail: 'Start fresh (the old save remains until you save again)' },
    ]);
    if (choice !== 0) return null;
    return loadSlot(slot);
  }

  const heading = external?.meta.name ?? 'saved games';
  console.log(formatFrameBanner(`Saved games exist — ${heading}`));
  const items = [
    ...restorable.map((s) => ({
      label: s.label,
      detail: path.resolve(s.path),
    })),
    { label: 'New game', detail: 'Start fresh (the old saves remain until you save again)' },
  ];
  const choice = await promptMenu(items);
  if (choice === restorable.length) return null;
  return loadSlot(restorable[choice]);
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
export async function createNewSession(
  pack: LoadedPack,
  seed: number = mintSeed(),
  opts: { defaultHero?: boolean; randomHero?: boolean } = {},
): Promise<Session> {
  const engine = pack.createGame(seed);

  // Character creation needs the pack's build catalog + ruleset. External
  // packs may omit them (the starter template does) — the pack's authored
  // default player is used as-is. `--default-hero` (F-6d2cfdf8) skips the
  // wizard even when a catalog exists, keeping the pack's authored player.
  // `--random-hero` (F-b10dcd48) installs suggestBuild(catalog, SeededRNG(seed))
  // with no promptMenu/promptText — complementary to --default-hero, not a
  // replacement: combining the two is refused at parseRunArgs.
  if (!opts.defaultHero && pack.buildCatalog && pack.ruleset) {
    if (opts.randomHero) {
      const build = suggestBuild(pack.buildCatalog, new SeededRNG(seed));
      const playerEntity = resolveEntity(build, pack.buildCatalog, pack.ruleset);
      installCreatedPlayer(engine, playerEntity);
    } else {
      console.log(formatFrameBanner(`CHARACTER CREATION — ${pack.meta.name}`));

      const build = await buildCharacter(pack.buildCatalog, pack.ruleset);
      const playerEntity = resolveEntity(build, pack.buildCatalog, pack.ruleset);
      installCreatedPlayer(engine, playerEntity);
    }
  }

  // F-5164895e: first snapshot after chargen wears starting kits (Gravewalker
  // chapel-lantern in the tool slot). Readers (HUD, chronicle) stay pure.
  ensureStartingLoadouts(engine.world);

  // F-9b93f45b: pack.createGame places the player without emitting
  // world.zone.entered (sidecar --start is the only other CLI stitch). After
  // chargen so zoneId is final, synthesize the same arrival so F-c8f6fbe1
  // records starting-zone mood. Do not also journal inspect.
  const player = engine.world.entities[engine.world.playerId];
  emitZoneEnteredForPlacement(engine, player?.zoneId ?? engine.world.locationId);

  return { engine, pack };
}

function printSessionBanner(pack: LoadedPack, opts: { external?: boolean } = {}) {
  console.log(formatSessionBanner(pack, opts));
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
 * BOTH menu layers vanish while dialogue choices are on screen (terminal-ui
 *  suppresses the whole Actions section, extras included) — those numbers
 *  belong to the choices. The original trap (activeDialogue, no visible
 *  choices) keeps the base menu; extras still vanish via computeExtras.
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

  // F-dc8a82be / F-b30e754a: read from engine.world, not the display-only
  // buildHudWorld copy — party membership is untouched by the HUD's
  // xp/level decoration. Threaded into BOTH branches so the line survives
  // even on a menu:false end-frame (a corpse's screen should still show who
  // was traveling with them).
  const partyLine = buildPartyStatusLine(engine.world);

  const screen = renderFullScreen(
    buildHudWorld(engine.world, trees),
    engine.world.eventLog.slice(-8),
    menu ? { extraActions: extras, partyLine } : { actions: false, partyLine },
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
    npcTurns?: (engine: Engine, opts: { log: (msg: string) => void }) => unknown;
    companionTurns?: (engine: Engine, opts: { log: (msg: string) => void }) => unknown;
    worldTick?: (engine: Engine, opts: { genre?: string; log: (msg: string) => void }) => unknown;
    log?: (msg: string) => void;
  } = {},
): void {
  // Sidecar ADVANCE passes { log: () => {} } so guarded throws stay off the
  // JSON-RPC stdout pipe. Interactive `run` defaults to console.log.
  const log = deps.log ?? console.log;
  if (evaluateSessionEnd(engine)) return;
  (deps.npcTurns ?? runNpcTurns)(engine, { log });
  if (evaluateSessionEnd(engine)) return; // P8-WL-010 — no tick over a corpse
  // F-4b9c5aee (v2.9): recruited companions take their independent turns after
  // the hostiles, before the world tick. runCompanionTurns early-returns on an
  // empty party (byte-identical to legacy for companion-less packs), so the
  // seed-0 legacy-identity law holds. Its own end-gate below: a companion can
  // down the last boss, and we must not tick past a won session.
  (deps.companionTurns ?? runCompanionTurns)(engine, { log });
  if (evaluateSessionEnd(engine)) return; // companions can end combat — no tick over a finished fight
  (deps.worldTick ?? runWorldTick)(engine, { genre: pack.meta.genres?.[0], log });
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
  let presenter = new TurnPresenter();
  let liveEngine = engine;
  let dirty = false;
  while (true) {
    const end = evaluateSessionEnd(liveEngine);
    if (end) {
      // The end frame keeps the scene/HUD/log panels but no action menu —
      // the session is over; the finale prompt below owns the numbers.
      renderFrame(liveEngine, pack, { menu: false });
      console.log(renderSessionEnd(end, liveEngine.world, pack.progressionTrees ?? []));

      // Record the COMPLETED run (victory or defeat — a mid-session quit
      // never reaches this branch). Guarded append: a history write failure
      // prints one structured line and the finale flow continues.
      const stats = computeSessionStats(liveEngine.world, pack.progressionTrees ?? []);
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

    renderFrame(liveEngine, pack);
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
    const extras = computeExtras(liveEngine, pack);
    const logLenBefore = liveEngine.world.eventLog.length;
    const result = handlePlayerInput(liveEngine, input, { ruleset: pack.ruleset, extras, pack });
    if (result.kind === 'quit') {
      const decision = await confirmUnsavedQuit(liveEngine, dirty);
      if (decision === 'stay') continue;
      return 'quit';
    }
    if (result.kind === 'save' && result.ok) dirty = false;
    if (result.kind === 'load-menu') {
      const loaded = await promptAndLoadSave(pack);
      if (loaded) {
        liveEngine = loaded.engine;
        dirty = false;
        presenter = new TurnPresenter();
      }
      continue;
    }
    if (result.kind === 'load') {
      liveEngine = result.session.engine;
      dirty = false;
      presenter = new TurnPresenter();
      continue;
    }

    if (result.kind === 'action' || result.kind === 'wait') {
      dirty = true;
      runHostileRound(liveEngine, pack);
    }

    // 'rejected' narrates too: the engine's structured refusal is the round's
    // one event, and the player deserves to hear it immediately rather than
    // finding it in the next frame's log panel (P8-PS-002).
    // 'wait' narrates the world's half (NPC / tick) with no player verb.
    if (result.kind === 'action' || result.kind === 'rejected' || result.kind === 'wait') {
      narrateRound(presenter, liveEngine, logLenBefore, console.log);
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
  opts: { seedOverride?: number | null; packPath?: string | null; defaultHero?: boolean; randomHero?: boolean } = {},
): Promise<void> {
  let pending: Session | null = initial;
  while (true) {
    let session = pending;
    pending = null;
    let fresh = false;
    if (!session) {
      const pack = external ?? (await selectPack());
      session = await createNewSession(pack, opts.seedOverride ?? undefined, {
        defaultHero: opts.defaultHero,
        randomHero: opts.randomHero,
      });
      fresh = true;
    }
    printSessionBanner(session.pack, { external: external !== null });
    if (fresh) {
      // Read the seed back from world truth, not from what we requested —
      // a pack that ignores its seed argument then prints an honest line.
      console.log(formatSeedLine(session.engine.world.meta.seed, opts.packPath ?? undefined) + '\n');
      console.log(formatFirstRunLegend() + '\n');
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
    const mark = glyphsFor().errorMark;
    console.error(`  ${mark} [${parsed.code}] ${parsed.message}`);
    console.error(`  Hint: ${parsed.hint}`);
    closeReadline();
    process.exit(1);
    return; // unreachable; keeps control flow explicit for tests that stub exit
  }

  // F-1a09e498: catalog dump, then exit — never promptMenu / promptLine.
  if (parsed.listPacks) {
    console.log(formatPackCatalog());
    closeReadline();
    process.exit(0);
    return;
  }

  // F1e: `run <path>` loads a scaffolded/built game module instead of the
  // bundled starters. Structured load errors exit with the contract spelled out.
  // F-6d2cfdf8: `--pack <id>` selects a bundled starter without promptMenu.
  const pathArg = parsed.path;
  let external: LoadedPack | null = null;
  if (parsed.packId) {
    external = allPacks.find((p) => p.meta.id === parsed.packId) ?? null;
  } else if (pathArg) {
    try {
      external = await loadExternalPack(pathArg);
      console.log(`  Loaded pack "${external.meta.name}" (${external.meta.id}) from ${path.resolve(pathArg)}`);
    } catch (err) {
      if (err instanceof PackLoadError) {
        const mark = glyphsFor().errorMark;
        console.error(`  ${mark} [${err.code}] ${err.message}`);
        console.error(`  Hint: ${err.hint}`);
        closeReadline();
        process.exit(1);
      }
      throw err;
    }
  }

  // `--default-hero` / `--random-hero` are explicit fresh-game requests —
  // skip the Continue prompt so the command never touches promptMenu/promptText.
  const resumed = parsed.defaultHero || parsed.randomHero ? null : await maybeOfferResume(external);
  const seedLinePath = parsed.packId ? `--pack ${parsed.packId}` : pathArg;
  await playSessions(resumed, external, {
    seedOverride: parsed.seed,
    packPath: seedLinePath,
    defaultHero: parsed.defaultHero,
    randomHero: parsed.randomHero,
  });

  console.log('\n  Farewell, wanderer.\n');
  closeReadline();
  process.exit(0);
}

// --- Checkpoints (F-b369c8c5) ------------------------------------------------
//
// save.json is the back-compat latest-pointer — unchanged shape, write order,
// or read path for any caller that never asks for a checkpoint. Every
// successful save ALSO rotates a numbered checkpoint-<NNN>.json alongside it
// (same SAVE_DIR, the identical engine.serialize() bytes save.json just got),
// so `replay` can restore any of the last CHECKPOINT_KEEP saves, not only the
// most recent. Ordinals are derived from the checkpoint files already on
// disk — never Date.now()/Math.random() (the repo's determinism law) — so
// naming stays deterministic and monotonic within a session.
//
// restoreSessionFromSave (the load authority) is REUSED UNCHANGED: a
// checkpoint file is byte-identical in shape to save.json, so selecting one
// is purely a matter of which file replayGame reads before handing its
// parsed JSON to that same authority — see replayGame below.

function checkpointFileName(ordinal: number): string {
  return `checkpoint-${String(ordinal).padStart(3, '0')}.json`;
}

/** Next monotonic ordinal for this saveDir — one past the highest ordinal
 *  already on disk, or 1 for an empty/missing directory. Guarded: an
 *  unreadable directory degrades to 1 rather than throwing — writeCheckpoint's
 *  own write attempt just below is the real failure gate. */
function nextCheckpointOrdinal(saveDir: string): number {
  let files: string[];
  try {
    if (!fs.existsSync(saveDir)) return 1;
    files = fs.readdirSync(saveDir);
  } catch {
    return 1;
  }
  let max = 0;
  for (const f of files) {
    const m = CHECKPOINT_FILE_RE.exec(f);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

/** One checkpoint file's identity + display metadata (listCheckpoints). */
export type CheckpointInfo = {
  /** Filename within saveDir, e.g. 'checkpoint-004.json'. */
  file: string;
  /** The monotonic ordinal parsed from the filename. */
  ordinal: number;
  /** world.meta.tick read from the file's own contents; null when unreadable. */
  tick: number | null;
};

/**
 * Every checkpoint-<NNN>.json in saveDir, NEWEST FIRST (highest ordinal
 * first) — the order both formatCheckpointList's numbering and
 * resolveCheckpointSelector's index selector rely on. Never throws: a
 * missing directory yields [], and one corrupt/unreadable file still appears
 * in the list (its tick reads null) rather than vanishing entirely.
 */
export function listCheckpoints(saveDir: string = SAVE_DIR): CheckpointInfo[] {
  let files: string[];
  try {
    if (!fs.existsSync(saveDir)) return [];
    files = fs.readdirSync(saveDir);
  } catch {
    return [];
  }
  const entries: CheckpointInfo[] = [];
  for (const f of files) {
    const m = CHECKPOINT_FILE_RE.exec(f);
    if (!m) continue;
    let tick: number | null = null;
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(saveDir, f), 'utf-8')) as {
        world?: { state?: { meta?: { tick?: unknown } } };
      };
      const t = parsed.world?.state?.meta?.tick;
      tick = typeof t === 'number' ? t : null;
    } catch {
      tick = null;
    }
    entries.push({ file: f, ordinal: Number(m[1]), tick });
  }
  return entries.sort((a, b) => b.ordinal - a.ordinal);
}

/** Delete every checkpoint beyond CHECKPOINT_KEEP, oldest first. Best-effort
 *  per file — one stuck/locked file logs and is skipped rather than aborting
 *  the rest of the prune (same posture as history.ts's guarded writes). */
function pruneCheckpoints(saveDir: string, log: (msg: string) => void): void {
  const stale = listCheckpoints(saveDir).slice(CHECKPOINT_KEEP); // newest-first; tail = oldest
  for (const entry of stale) {
    try {
      fs.unlinkSync(path.join(saveDir, entry.file));
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      log(`  [CHECKPOINT_PRUNE_FAILED] Could not remove ${entry.file}: ${reason}`);
    }
  }
}

/**
 * Write one new checkpoint (the exact bytes saveGameGuarded just wrote to
 * save.json) and prune down to CHECKPOINT_KEEP. Best-effort and NEVER
 * throws — a checkpoint is a nicety layered on a save that already
 * succeeded, the same failure posture as history.ts's appendRunRecord: a
 * failure logs one structured line and returns false instead of losing the
 * session or the save.json the caller already has on disk.
 */
export function writeCheckpoint(
  serialized: string,
  saveDir: string = SAVE_DIR,
  log: (msg: string) => void = console.log,
): boolean {
  try {
    if (!fs.existsSync(saveDir)) {
      fs.mkdirSync(saveDir, { recursive: true });
    }
    const ordinal = nextCheckpointOrdinal(saveDir);
    fs.writeFileSync(path.join(saveDir, checkpointFileName(ordinal)), serialized, 'utf-8');
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    log(`  [CHECKPOINT_WRITE_FAILED] Could not write a checkpoint in ${path.resolve(saveDir)}: ${reason}`);
    return false;
  }
  pruneCheckpoints(saveDir, log);
  return true;
}

/**
 * Resolve a `--checkpoint` selector to a file path under saveDir. A selector
 * of decimal digits is a 1-based index into listCheckpoints' newest-first
 * order (1 = most recent — the CLI's numbered-menu convention elsewhere,
 * e.g. promptMenu/buildActionList); anything else must match a checkpoint's
 * exact filename. null when nothing matches — never throws.
 */
export function resolveCheckpointSelector(selector: string, saveDir: string = SAVE_DIR): string | null {
  const checkpoints = listCheckpoints(saveDir);
  if (/^\d+$/.test(selector)) {
    const idx = Number(selector) - 1;
    const entry = idx >= 0 ? checkpoints[idx] : undefined;
    return entry ? path.join(saveDir, entry.file) : null;
  }
  const byName = checkpoints.find((c) => c.file === selector);
  return byName ? path.join(saveDir, byName.file) : null;
}

/** Named-slot token: alphanumerics plus `.` `_` `-`, no path separators. */
const SLOT_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/**
 * Validate a `save <name>` / `load <name>` token. Rejects path traversal and
 * reserved chatter. `save` / `save.json` map to the default latest-pointer.
 * Returns the file's basename without `.json`, or null when invalid.
 */
export function sanitizeSlotName(raw: string): string | null {
  const name = raw.trim().replace(/\.json$/i, '');
  if (!SLOT_NAME_RE.test(name)) return null;
  if (name === '.' || name === '..') return null;
  return name;
}

/** cwd-relative path of a named slot or the default save.json. */
export function slotFilePath(name: string, saveDir: string = SAVE_DIR): string {
  if (name === 'save') return path.join(saveDir, 'save.json');
  return path.join(saveDir, `${name}.json`);
}

export type LoadableSlot = {
  file: string;
  path: string;
  label: string;
  tick: number | null;
  kind: 'save' | 'slot' | 'checkpoint';
  gameId: string | null;
};

function readSaveFileMeta(filePath: string): { tick: number | null; gameId: string | null } {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as {
      world?: { state?: { meta?: { tick?: unknown; gameId?: unknown } } };
    };
    const t = parsed.world?.state?.meta?.tick;
    const g = parsed.world?.state?.meta?.gameId;
    return {
      tick: typeof t === 'number' ? t : null,
      gameId: typeof g === 'string' ? g : null,
    };
  } catch {
    return { tick: null, gameId: null };
  }
}

/**
 * Default save.json + named slots + rotating checkpoints, for the in-session
 * load menu (F-b606e4e8). Checkpoints stay newest-first; named slots are
 * alphabetical. Never throws.
 */
export function listLoadableSlots(saveDir: string = SAVE_DIR): LoadableSlot[] {
  const slots: LoadableSlot[] = [];
  try {
    if (!fs.existsSync(saveDir)) return [];
  } catch {
    return [];
  }

  const defaultPath = path.join(saveDir, 'save.json');
  if (fs.existsSync(defaultPath)) {
    const meta = readSaveFileMeta(defaultPath);
    slots.push({
      file: 'save.json',
      path: defaultPath,
      label: `Current save (save.json)${meta.tick === null ? '' : ` — round ${meta.tick}`}`,
      tick: meta.tick,
      kind: 'save',
      gameId: meta.gameId,
    });
  }

  let files: string[] = [];
  try {
    files = fs.readdirSync(saveDir);
  } catch {
    files = [];
  }
  const named = files
    .filter((f) => f.endsWith('.json') && f !== 'save.json' && !CHECKPOINT_FILE_RE.test(f))
    .sort();
  for (const f of named) {
    const filePath = path.join(saveDir, f);
    const meta = readSaveFileMeta(filePath);
    const slotName = f.replace(/\.json$/i, '');
    slots.push({
      file: f,
      path: filePath,
      label: `Slot "${slotName}"${meta.tick === null ? '' : ` — round ${meta.tick}`}`,
      tick: meta.tick,
      kind: 'slot',
      gameId: meta.gameId,
    });
  }

  for (const c of listCheckpoints(saveDir)) {
    const filePath = path.join(saveDir, c.file);
    slots.push({
      file: c.file,
      path: filePath,
      label: `${c.file}${c.tick === null ? ' — (round unknown)' : ` — round ${c.tick}`}`,
      tick: c.tick,
      kind: 'checkpoint',
      gameId: readSaveFileMeta(filePath).gameId,
    });
  }
  return slots;
}

/**
 * Resolve `load <token>` to a file under saveDir: checkpoint index/filename,
 * named slot, or save.json. null when nothing matches.
 */
export function resolveLoadTarget(token: string, saveDir: string = SAVE_DIR): string | null {
  const trimmed = token.trim();
  if (!trimmed) return null;
  const checkpoint = resolveCheckpointSelector(trimmed, saveDir);
  if (checkpoint) return checkpoint;
  const slot = sanitizeSlotName(trimmed);
  if (!slot) return null;
  const dest = slotFilePath(slot, saveDir);
  return fs.existsSync(dest) ? dest : null;
}

/**
 * Restore a save file through restoreSessionFromSave without process.exit.
 * Returns null and logs a structured line on failure (in-session load).
 */
export function loadSessionFromFile(
  pack: LoadedPack,
  filePath: string,
  log: (msg: string) => void = console.log,
): Session | null {
  let data: unknown;
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    log(`  [LOAD_FAILED] Could not read ${path.resolve(filePath)}: ${reason}`);
    log('  Hint: pick a save from "load" or "checkpoints". Your session is still live.');
    return null;
  }
  const savedGameId = (data as { world?: { state?: { meta?: { gameId?: unknown } } } })?.world?.state
    ?.meta?.gameId;
  if (typeof savedGameId === 'string' && savedGameId !== pack.meta.id) {
    log(
      `  [LOAD_PACK_MISMATCH] Save gameId "${savedGameId}" does not match this session's pack "${pack.meta.id}".`,
    );
    log('  Hint: quit and restore with: ai-rpg-engine replay --pack <path|id> <save>.');
    return null;
  }
  try {
    const session = restoreSessionFromSave(pack, data);
    log(`  Loaded ${path.resolve(filePath)}. ${session.engine.world.eventLog.length} events in log.`);
    return session;
  } catch (e) {
    if (e instanceof SaveLoadError) {
      log(`  Cannot load save [${e.code}]: ${e.message}`);
      log(`  Hint: ${e.hint}`);
      return null;
    }
    throw e;
  }
}

/**
 * F-1d23173a: on quit, if the session took an action since the last successful
 * save, offer Save / Discard / Cancel. Autosave-on-Save writes save.json
 * before the loop exits; Cancel returns the player to the prompt. Exported
 * for unit testing (promptMenu is injectable via queueInputLine).
 */
export async function confirmUnsavedQuit(
  engine: Engine,
  dirty: boolean,
  deps: {
    promptMenu?: typeof promptMenu;
    save?: typeof saveGameGuarded;
    log?: (msg: string) => void;
  } = {},
): Promise<'quit' | 'stay'> {
  if (!dirty) return 'quit';
  const prompt = deps.promptMenu ?? promptMenu;
  const save = deps.save ?? saveGameGuarded;
  const log = deps.log ?? console.log;
  log('  Unsaved progress — this session has not been written since your last action.');
  const idx = await prompt([
    { label: 'Save', detail: `Write ${SAVE_FILE} and leave` },
    { label: 'Discard', detail: 'Leave without saving this session' },
    { label: 'Cancel', detail: 'Return to the game' },
  ]);
  if (idx === 2) return 'stay';
  if (idx === 0) {
    if (!save(engine, log)) return 'stay';
  }
  return 'quit';
}

/**
 * In-session load menu: print slots and let the player pick one. Empty dir
 * prints a one-line fallback and returns null (session stays live).
 */
export async function promptAndLoadSave(
  pack: LoadedPack,
  deps: {
    promptMenu?: typeof promptMenu;
    log?: (msg: string) => void;
    saveDir?: string;
  } = {},
): Promise<Session | null> {
  const log = deps.log ?? console.log;
  const saveDir = deps.saveDir ?? SAVE_DIR;
  const slots = listLoadableSlots(saveDir);
  if (slots.length === 0) {
    log('  No saves yet — type save (or save <name>) first.');
    return null;
  }
  const prompt = deps.promptMenu ?? promptMenu;
  const idx = await prompt(slots.map((s) => ({ label: s.label, detail: s.file })));
  return loadSessionFromFile(pack, slots[idx].path, log);
}

/** The `replay --list-checkpoints` block — 1-based, newest first (matching
 *  --checkpoint's index selector). '' when there are none; the caller prints
 *  a one-line fallback instead (formatRecentRuns' empty-string contract). */
export function formatCheckpointList(checkpoints: CheckpointInfo[]): string {
  if (checkpoints.length === 0) return '';
  const lines = ['  Available checkpoints (newest first):'];
  checkpoints.forEach((c, i) => {
    const round = c.tick === null ? '(round unknown)' : `round ${c.tick}`;
    lines.push(`    [${i + 1}] ${c.file} — ${round}`);
  });
  return lines.join('\n');
}

/** Read `--checkpoint <selector>` / `--checkpoint=<selector>` out of replay's
 *  argv. null when the flag is absent (bare replay / --replay only). */
export function parseCheckpointArg(args: string[]): string | null {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--checkpoint') return args[i + 1] ?? null;
    if (arg.startsWith('--checkpoint=')) return arg.slice('--checkpoint='.length);
  }
  return null;
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
 *
 * F-b369c8c5: on a successful write, also rotates a checkpoint (writeCheckpoint)
 * carrying the SAME bytes just written to SAVE_FILE. Best-effort and
 * non-blocking — save.json above has already succeeded either way, and a
 * checkpoint failure logs its own structured line rather than turning a
 * good save into a reported failure.
 */
export function saveGameGuarded(
  engine: Engine,
  log: (msg: string) => void = console.log,
  slotName?: string,
): boolean {
  let dest = SAVE_FILE;
  if (slotName !== undefined) {
    const slot = sanitizeSlotName(slotName);
    if (!slot) {
      log(`  [SAVE_SLOT_INVALID] "${slotName}" is not a valid slot name.`);
      log('  Hint: use letters, digits, ".", "_" or "-" (no path separators). Example: save chapel-night.');
      return false;
    }
    dest = slotFilePath(slot);
  }
  const resolvedPath = path.resolve(dest);
  let serialized: string;
  try {
    if (!fs.existsSync(SAVE_DIR)) {
      fs.mkdirSync(SAVE_DIR, { recursive: true });
    }
    serialized = engine.serialize();
    fs.writeFileSync(dest, serialized, 'utf-8');
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    log(`  [SAVE_WRITE_FAILED] Could not write ${resolvedPath}: ${reason}`);
    log('  Hint: run from a directory you can write to. Your session is still live — you can keep playing or try "save" again.');
    return false;
  }
  // Named slots sit alongside save.json; the rotator stays on the default pointer.
  if (slotName === undefined || sanitizeSlotName(slotName) === 'save') {
    writeCheckpoint(serialized, SAVE_DIR, log);
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
    { id: 'save', description: `Save the game (writes ${SAVE_FILE}; save <name> writes a named slot)` },
    { id: 'load', description: 'Load a save or checkpoint (load <name>, or pick from the menu)' },
    { id: 'checkpoints', description: 'List rotating checkpoints, newest first' },
    { id: 'wait', description: 'Pass without acting — the world still ticks (NPCs, recovery, rumors)' },
    { id: 'quit', description: 'Exit the game (prompts to save if you have unsaved progress)' },
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
  | { kind: 'load'; session: Session }
  | { kind: 'load-menu' }
  | { kind: 'action'; via: 'dialogue-choice' | 'menu' | 'extra' | 'text' }
  /** A MENU-selected submission the engine refused (action.rejected) —
   *  P8-PS-002: the menu advertised it, the engine said no; the refusal
   *  narrates but the round is NOT forfeited (no NPC turns, no world tick). */
  | { kind: 'rejected' }
  /** No player verb: runHostileRound still runs (world tick / NPC turns). */
  | { kind: 'wait' }
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
  opts: {
    ruleset?: RulesetDefinition;
    log?: (msg: string) => void;
    extras?: ExtraAction[];
    pack?: LoadedPack;
  } = {},
): PlayerInputResult {
  const log = opts.log ?? console.log;
  const trimmed = rawInput.trim();
  if (!trimmed) return { kind: 'empty' };

  // Meta commands — first-word match so 'save game' / 'quit now' / 'HELP me'
  // reach the meta handlers instead of dying in the engine's rejection
  // pipeline with zero on-screen feedback.
  const firstWord = trimmed.split(/\s+/)[0].toLowerCase();
  const restTokens = trimmed.split(/\s+/).slice(1);
  if (firstWord === 'quit' || firstWord === 'exit') {
    return { kind: 'quit' };
  }
  if (firstWord === 'save') {
    // A single extra token is a named slot (F-b606e4e8). Extra chatter
    // (`save now please`) still writes the default pointer.
    const slot = restTokens.length === 1 ? restTokens[0] : undefined;
    return { kind: 'save', ok: saveGameGuarded(engine, log, slot) };
  }
  if (firstWord === 'checkpoints') {
    const formatted = formatCheckpointList(listCheckpoints(SAVE_DIR));
    log(formatted === '' ? '  No checkpoints yet — save at least once to create one.' : formatted);
    return { kind: 'help' };
  }
  if (firstWord === 'load') {
    if (restTokens.length === 0) {
      if (!opts.pack) {
        const formatted = formatCheckpointList(listCheckpoints(SAVE_DIR));
        log(formatted === '' ? '  No checkpoints yet — save at least once to create one.' : formatted);
        log('  Type load <name> inside a session to restore, or replay --pack <path> from the shell.');
        return { kind: 'help' };
      }
      return { kind: 'load-menu' };
    }
    if (!opts.pack) {
      log('  Cannot load: this command needs a live pack (use it from inside a session).');
      log('  Hint: restore from the shell with: ai-rpg-engine replay --pack <path|id> <save>.');
      return { kind: 'unknown' };
    }
    const target = resolveLoadTarget(restTokens[0]);
    if (!target) {
      log(`  No save matches "${restTokens[0]}".`);
      log('  Hint: type load (no arguments) for the menu, or checkpoints to list rotating saves.');
      return { kind: 'unknown' };
    }
    const session = loadSessionFromFile(opts.pack, target, log);
    if (!session) return { kind: 'unknown' };
    return { kind: 'load', session };
  }
  if (firstWord === 'help') {
    log(formatGameHelp(engine, opts.ruleset));
    return { kind: 'help' };
  }
  if (firstWord === 'wait') {
    // Sentinel: never submitted. Absent from the extras menu during dialogue
    // (computeExtras returns []); typed `wait` is the same no-verb round only
    // when extras are not dialogue-suppressed.
    const dStateForWait = engine.world.modules['dialogue-core'] as
      | { activeDialogue: string | null }
      | undefined;
    if (!dStateForWait?.activeDialogue) {
      return { kind: 'wait' };
    }
  }

  // Dialogue mode — a number selects a dialogue choice.
  const dState = engine.world.modules['dialogue-core'] as { activeDialogue: string | null } | undefined;
  if (dState?.activeDialogue) {
    // F-7d5f3da9: whole-token digits only. parseInt('1a', 10) === 1 would
    // fire choice 0; mixed tokens fall through as unknown, never a choose.
    const choiceIndex = /^\d+$/.test(trimmed) ? parseInt(trimmed, 10) : NaN;
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
      // F-c7ac6a7c: if dialogue choices are on screen, a rejected (or thrown)
      // choose is an out-of-range dialogue number — same as P8-PS-001. Never
      // parseActionSelection: those numbers belong to the choices, so a hit
      // on hidden action N+1..M would move/attack/inspect mid-conversation
      // and runSession would runHostileRound.
      const onScreen = visibleDialogueChoices(engine.world);
      if (onScreen.length > 0) {
        log(`  Please enter a number between 1 and ${onScreen.length}.`);
        return { kind: 'unknown' };
      }
      // Original trap: dialogue is flagged active but no choices are on
      // screen (no node, or a choiceless node). Fall through to the action
      // menu — renderFullScreen shows it in this case, matching this comment.
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
      // Wait: sentinel verb never submitted; the world's half of the round still
      // runs (F-10b5c460). Not a core wait verb.
      if (extra.group === 'wait') {
        return { kind: 'wait' };
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

  // P8-PS-001 / F-7d5f3da9: a leading-digit token that resolved to NEITHER
  // the base menu NOR the extras range must never fall through to the
  // free-text parser. Pure digits ('99') used to become verb '99'; mixed
  // tokens ('1a', '99a', '1.5', '1e2') prefix-parsed as a menu index or
  // became a bogus verb — both returned kind 'action' and ran the hostile
  // round. Digits are a menu gesture: consume nothing.
  if (/^\d/.test(trimmed)) {
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

export type ParsedReplayArgs =
  | {
      ok: true;
      savePath: string | null;
      pack: string | null;
      checkpoint: string | null;
      listCheckpoints: boolean;
      replayFlag: boolean;
    }
  | { ok: false; message: string; hint: string; code: 'INVALID_FLAG' | 'INVALID_PACK'; token: string };

const REPLAY_FLAG_HINT =
  'replay accepts --pack <path|id>, a positional save path, --checkpoint <n|file>, --list-checkpoints, --replay, and --ascii.';

/**
 * Parse replay argv. Unknown tokens are REFUSED (F-fef49820), not ignored.
 * `--pack` takes a bundled id or a module path; a non-flag token is the save
 * path (parity with inspect-save). Exported for unit testing.
 */
export function parseReplayArgs(args: string[]): ParsedReplayArgs {
  let savePath: string | null = null;
  let pack: string | null = null;
  let checkpoint: string | null = null;
  let list = false;
  let replayFlag = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--replay') {
      replayFlag = true;
      continue;
    }
    if (arg === '--list-checkpoints') {
      list = true;
      continue;
    }
    if (arg === '--ascii' || arg === '--plain') {
      continue;
    }
    if (arg === '--checkpoint' || arg.startsWith('--checkpoint=')) {
      const raw = arg === '--checkpoint' ? args[++i] : arg.slice('--checkpoint='.length);
      if (raw === undefined || raw === '' || raw.startsWith('-')) {
        return {
          ok: false,
          code: 'INVALID_FLAG',
          token: '--checkpoint',
          message: `--checkpoint requires a 1-based index or filename, got ${raw === undefined || raw === '' ? '(missing)' : `"${raw}"`}.`,
          hint: 'Run "ai-rpg-engine replay --list-checkpoints" to see what is available.',
        };
      }
      checkpoint = raw;
      continue;
    }
    if (arg === '--pack' || arg.startsWith('--pack=')) {
      const raw = arg === '--pack' ? args[++i] : arg.slice('--pack='.length);
      if (raw === undefined || raw === '' || raw.startsWith('-')) {
        return {
          ok: false,
          code: 'INVALID_PACK',
          token: '--pack',
          message: `--pack requires a bundled starter id or a module path, got ${raw === undefined || raw === '' ? '(missing)' : `"${raw}"`}.`,
          hint: 'Example: replay --pack chapel-threshold, or replay --pack ./my-starter path/to/save.json.',
        };
      }
      pack = raw;
      continue;
    }
    if (arg.startsWith('-')) {
      return {
        ok: false,
        code: 'INVALID_FLAG',
        token: arg,
        message: `"${arg}" is not a recognized replay flag.`,
        hint: REPLAY_FLAG_HINT,
      };
    }
    if (savePath === null) {
      savePath = arg;
      continue;
    }
    return {
      ok: false,
      code: 'INVALID_FLAG',
      token: arg,
      message: `Unexpected argument "${arg}".`,
      hint: REPLAY_FLAG_HINT,
    };
  }
  return { ok: true, savePath, pack, checkpoint, listCheckpoints: list, replayFlag };
}

/**
 * The first token in replay's argv that this function does not act on — null
 * when every token is recognized. Kept as a thin wrapper over parseReplayArgs
 * (F-fedb2573 named ignored args; F-fef49820 now refuses them).
 */
export function findIgnoredReplayArg(args: string[]): string | null {
  const parsed = parseReplayArgs(args);
  return parsed.ok ? null : parsed.token;
}

/**
 * Restore the save and hand back the live session so the caller can enter the
 * shared prompt loop (F1c — a restored game is playable, not a
 * print-summary-and-exit dead end).
 *
 * DECIDED (v2.9, F-079d3fee/F-e5817c7c): snapshot/checkpoint restore is the
 * durable contract; event-source re-simulation stays retired (v2.7,
 * P8-WL-001/P8-PS-004). Four state families mutate OUTSIDE the actionLog, so
 * no resim can ever reconstruct them from it:
 *   1. chargen          — installCreatedPlayer calls store.addEntity
 *                          directly; character creation is not a submitted
 *                          action.
 *   2. economy tick      — world-tick's tickDistrictEconomy step (economy-core)
 *                          mutates district economies every round, with no
 *                          action behind it.
 *   3. encounter spawn   — runEncounterSpawnStep calls store.addEntity per
 *                          hostile AND advances the world id counter (genId);
 *                          a resim's spawn roll drifts the instant timing
 *                          differs by one tick.
 *   4. party writes      — world-tick's reaction pass (adjustCompanionMorale /
 *                          removeCompanion / setPartyState) mutates the party
 *                          as a round side effect, never a player action.
 * The old resim printed 'Replay complete' having silently reconstructed the
 * pack's DEFAULT character over a spawn burst the original session never
 * saw — restore-then-continue is the only path that was ever actually
 * correct. F-b369c8c5 (this cycle, same decision) is the other half: multi-
 * checkpoint rotation (`--checkpoint <n|file>`, `--list-checkpoints`) so
 * restore has more than one save slot to return to, through this SAME
 * authority (restoreSessionFromSave) — unchanged.
 *
 * Exported for unit testing (same rationale as runGuardedAction — this reads
 * a real save file off disk and drives process.exit on bad input, so tests
 * point it at a temp cwd and stub process.exit rather than shelling out).
 * Tests exercising only the restore semantics ignore the returned session.
 */
export async function replayGame(args: string[] = []): Promise<Session | undefined> {
  const parsed = parseReplayArgs(args);
  if (!parsed.ok) {
    const mark = glyphsFor().errorMark;
    console.error(`  ${mark} [${parsed.code}] ${parsed.message}`);
    console.error(`  Hint: ${parsed.hint}`);
    process.exit(1);
    return; // unreachable; keeps control flow explicit for tests that stub exit
  }

  // F-b369c8c5: --list-checkpoints is informational only — it never restores.
  if (parsed.listCheckpoints) {
    const formatted = formatCheckpointList(listCheckpoints(SAVE_DIR));
    console.log(formatted === '' ? '  No checkpoints yet — save at least once to create one.' : formatted);
    return undefined;
  }

  // F-b369c8c5: --checkpoint <index|file> swaps which file gets read below;
  // restoreSessionFromSave (the load authority) never changes. A positional
  // save path (parity with inspect-save) is the other selector.
  let saveFile = parsed.savePath ?? SAVE_FILE;
  if (parsed.checkpoint !== null) {
    const resolved = resolveCheckpointSelector(parsed.checkpoint, SAVE_DIR);
    if (!resolved) {
      console.error(`  No checkpoint matches "${parsed.checkpoint}".`);
      console.error('  Hint: run "ai-rpg-engine replay --list-checkpoints" to see what is available.');
      process.exit(1);
      return; // unreachable; keeps control flow explicit for tests that stub exit
    }
    saveFile = resolved;
  }

  if (!fs.existsSync(saveFile)) {
    console.error('  No save file found.');
    process.exit(1);
  }

  let data: any;
  try {
    data = JSON.parse(fs.readFileSync(saveFile, 'utf-8'));
  } catch {
    console.error('  Save file is corrupted or not valid JSON.');
    process.exit(1);
  }

  // CLI-002: select the pack whose manifest id matches the SAVED gameId rather
  // than blindly using allPacks[0] (fantasy). Loading a cyberpunk save through
  // the fantasy pack produced nonsense.
  // F-fef49820: `--pack <path|id>` is the same Continue-path resolution
  // `run <path>` already has — a create-starter save is restorable when the
  // operator points at that module.
  const savedGameId: string | undefined = data.world?.state?.meta?.gameId;
  let pack: LoadedPack | undefined = allPacks.find((p) => p.meta.id === savedGameId);
  if (parsed.pack) {
    const bundled = allPacks.find((p) => p.meta.id === parsed.pack);
    if (bundled) {
      pack = bundled;
    } else {
      try {
        pack = await loadExternalPack(parsed.pack);
      } catch (err) {
        if (err instanceof PackLoadError) {
          const mark = glyphsFor().errorMark;
          console.error(`  ${mark} [${err.code}] ${err.message}`);
          console.error(`  Hint: ${err.hint}`);
          process.exit(1);
          return;
        }
        throw err;
      }
    }
  }
  if (!pack) {
    console.error(`  Cannot load save: no installed pack matches gameId "${savedGameId ?? '(missing)'}".`);
    console.error('  Hint: restore this save with: ai-rpg-engine replay --pack <path> [save.json]');
    process.exit(1);
    return;
  }

  if (parsed.replayFlag) {
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
