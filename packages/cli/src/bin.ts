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
  parseActionSelection,
  parseTextInput,
} from '@ai-rpg-engine/terminal-ui';
import { resolveEntity } from '@ai-rpg-engine/character-creation';
import { WorldStore, SaveLoadError, type Engine, type RulesetDefinition } from '@ai-rpg-engine/core';
import { allPacks, type PackInfo } from './packs.js';
import { promptMenu, promptConfirm, getReadline, closeReadline } from './prompts.js';
import { buildCharacter } from './character-builder.js';
import { runCreateStarter } from './create-starter.js';
import { runValidate } from './validate.js';
import { runScaffold } from './scaffold.js';
import { runProfile } from './profile.js';

const SAVE_DIR = '.ai-rpg-engine';
const SAVE_FILE = path.join(SAVE_DIR, 'save.json');

function printHelp() {
  console.log(`ai-rpg-engine v${version} — simulation-first RPG toolkit`);
  console.log('');
  console.log('Usage: ai-rpg-engine [command]');
  console.log('');
  console.log('Commands:');
  console.log('  run            Start a new game (default)');
  console.log('  validate       Validate a content pack JSON file (errors + advisories)');
  console.log('  scaffold       Write a minimal valid content stub (ability/zone/quest/status/dialogue)');
  console.log('  profile        Validate a profile/profile-set JSON, or scaffold a starter profile');
  console.log('  create-starter Scaffold a new starter from template');
  console.log('  replay         Load a save and restore its state (--replay re-simulates the action log)');
  console.log('  inspect-save   Show save file summary');
  console.log('  version        Print version');
  console.log('  help           Show this help');
  console.log('');
  console.log('Flags:');
  console.log('  --version, -v  Print version');
  console.log('  --help, -h     Show this help');
}

/**
 * CLI-010: run an engine action (submitAction / submitActionAs / choose) under a
 * guard so a buggy custom module that throws mid-turn cannot crash an unsaved
 * interactive session. On success returns true. On any throw it swallows the
 * error, prints a single bounded, actionable line, and returns false so the
 * caller can keep prompting (the player can still `save` / `quit`).
 *
 * The message is deliberately bounded: a single line (interior newlines from a
 * raw stack are collapsed) and length-capped so a pathological error string
 * cannot flood the terminal. Structured errors that carry a `code` are surfaced
 * as `[CODE] message` to match the engine's error shape.
 *
 * Exported for unit testing — the interactive `prompt()` loop itself is driven by
 * readline and is awkward to drive in a test.
 */
export function runGuardedAction(
  submit: () => unknown,
  log: (msg: string) => void = console.log,
): boolean {
  try {
    submit();
    return true;
  } catch (err) {
    const reason = describeActionError(err);
    log(`  That action could not be completed: ${reason}`);
    return false;
  }
}

/** Extract a single-line, length-bounded reason from an unknown thrown value. */
function describeActionError(err: unknown): string {
  let code: string | undefined;
  let message: string;

  if (err instanceof Error) {
    message = err.message;
    const maybeCode = (err as { code?: unknown }).code;
    if (typeof maybeCode === 'string' && maybeCode.length > 0) code = maybeCode;
  } else if (typeof err === 'string') {
    message = err;
  } else {
    message = String(err);
  }

  // Collapse any interior whitespace/newlines (e.g. a raw stack) to single spaces.
  let line = message.replace(/\s+/g, ' ').trim();
  if (!line) line = 'unknown error';
  if (code) line = `[${code}] ${line}`;

  // Bound the total length so a huge error cannot flood the terminal.
  const MAX = 240;
  if (line.length > MAX) line = line.slice(0, MAX - 1) + '…';
  return line;
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
      return runGame();
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
    case 'replay':
      replayGame(args.slice(1));
      closeReadline();
      return;
    case 'inspect-save':
      inspectSave();
      closeReadline();
      return;
    default:
      console.log(`Unknown command: ${command}`);
      printHelp();
      closeReadline();
      process.exit(1);
  }
}

async function selectPack(): Promise<PackInfo> {
  console.log('\n  ═══════════════════════════════════════');
  console.log('  AI RPG ENGINE');
  console.log('  Choose your adventure');
  console.log('  ═══════════════════════════════════════\n');

  const idx = await promptMenu(
    allPacks.map((p) => ({
      label: p.meta.name,
      detail: p.meta.tagline,
    })),
  );

  return allPacks[idx];
}

async function runGame() {
  // --- Pack Selection ---
  const pack = await selectPack();

  // --- Character Creation ---
  console.log('\n  ═══════════════════════════════════════');
  console.log(`  CHARACTER CREATION — ${pack.meta.name}`);
  console.log('  ═══════════════════════════════════════\n');

  const build = await buildCharacter(pack.buildCatalog, pack.ruleset);
  const playerEntity = resolveEntity(build, pack.buildCatalog, pack.ruleset);

  // --- Create Game ---
  const engine = pack.createGame();

  // Replace the default player with the custom character. The player entity key
  // is NOT always 'player' — 6/10 packs use a pack-specific id (e.g. 'runner',
  // 'detective'). Read the real id from state.playerId and re-key the built
  // character to it, preserving the default player's zone (CLI-001).
  const playerId = engine.store.state.playerId;
  const defaultPlayer = engine.store.state.entities[playerId];
  playerEntity.id = playerId;
  playerEntity.zoneId = defaultPlayer?.zoneId;
  engine.store.state.entities[playerId] = playerEntity;

  console.log(`\n  ═══════════════════════════════════════`);
  console.log(`  ${pack.meta.name.toUpperCase()}`);
  console.log(`  An AI RPG Engine Starter`);
  console.log(`  ═══════════════════════════════════════\n`);

  const rl = getReadline();

  function render() {
    const recentEvents = engine.world.eventLog.slice(-8);
    console.log('\n' + renderFullScreen(engine.world, recentEvents));
  }

  function prompt() {
    render();
    rl.question('  > ', (input) => {
      // All routing lives in handlePlayerInput (exported + unit-tested); the
      // readline callback only decides "exit or keep prompting". Notably this
      // keeps every fs/engine failure inside the guarded router instead of
      // raw-throwing out of the callback, OUTSIDE main()'s .catch (CS-C-008).
      const result = handlePlayerInput(engine, input, { ruleset: pack.ruleset });
      if (result.kind === 'quit') {
        console.log('\n  Farewell, wanderer.\n');
        closeReadline();
        process.exit(0);
        return;
      }
      prompt();
    });
  }

  prompt();
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
  | { kind: 'action'; via: 'dialogue-choice' | 'menu' | 'text' }
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
 */
export function handlePlayerInput(
  engine: Engine,
  rawInput: string,
  opts: { ruleset?: RulesetDefinition; log?: (msg: string) => void } = {},
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
    runGuardedAction(
      () =>
        engine.submitAction(numAction.verb, {
          targetIds: numAction.targetIds,
          toolId: numAction.toolId,
          parameters: numAction.parameters,
        }),
      log,
    );
    return { kind: 'action', via: 'menu' };
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
 * Exported for unit testing (same rationale as runGuardedAction — this reads
 * a real save file off disk and drives process.exit on bad input, so tests
 * point it at a temp cwd and stub process.exit rather than shelling out).
 */
export function replayGame(args: string[] = []) {
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

  const seed = data.world?.state?.meta?.seed ?? 42;
  const reSimulate = args.includes('--replay');

  // Build a fully-wired engine (modules registered, pack event subscriptions
  // bound to its live EventBus). createGame is also where pack closures hook the
  // bus — we must reuse THAT bus, so we restore state into this engine rather
  // than constructing a bare one via Engine.deserialize.
  const engine = pack.createGame(seed);

  if (reSimulate) {
    // Explicit re-simulation path: replay the action log through a fresh game.
    // F-7650e39d: `data.actionLog ?? []` only substitutes for null/undefined —
    // a corrupted save with actionLog set to any other non-iterable JSON
    // value (a number, boolean, or plain object) made the for..of below
    // raw-throw an unstructured TypeError, unlike the default-load branch
    // just below, which wraps WorldStore.deserialize in try/catch and prints
    // a friendly `[code] message` + hint on SaveLoadError. Match that.
    const rawActionLog = data.actionLog;
    if (rawActionLog !== undefined && rawActionLog !== null && !Array.isArray(rawActionLog)) {
      console.error(`  Cannot load save: actionLog must be an array, got ${typeof rawActionLog}.`);
      console.error('  Hint: the save file is corrupt or was not produced by this engine.');
      process.exit(1);
    }
    const actionLog = Array.isArray(rawActionLog) ? rawActionLog : [];
    console.log(`  Re-simulating ${actionLog.length} actions...`);
    for (const action of actionLog) {
      engine.processAction(action);
    }
    console.log(`  Replay complete. ${engine.world.eventLog.length} events generated.`);
  } else {
    // Default load: RESTORE the saved world state (entities, eventLog, globals,
    // pending, rngState, meta incl. idCounter). Reuse the pack-wired EventBus so
    // module + pack subscriptions survive the swap (core-004). The pack closures
    // read engine.store.state via the engine reference, so they see the new
    // store after the assignment below.
    try {
      const restored = WorldStore.deserialize(
        JSON.stringify(data.world),
        engine.store.events,
      );
      (engine as { store: WorldStore }).store = restored;
    } catch (e) {
      if (e instanceof SaveLoadError) {
        console.error(`  Cannot load save [${e.code}]: ${e.message}`);
        console.error(`  Hint: ${e.hint}`);
        process.exit(1);
      }
      throw e;
    }
    console.log(`  Loaded save. ${engine.world.eventLog.length} events in log.`);
  }

  console.log(`  Final tick: ${engine.tick}`);
  console.log(`  Player location: ${engine.world.locationId}`);
  const player = engine.world.entities[engine.store.state.playerId];
  if (player) {
    const resDisplay = Object.entries(player.resources)
      .map(([k, v]) => `${k}: ${v}`)
      .join('  ');
    console.log(`  ${resDisplay}`);
  }
}

function inspectSave() {
  if (!fs.existsSync(SAVE_FILE)) {
    console.log('  No save file found.');
    process.exit(1);
  }

  let data: any;
  try {
    data = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf-8'));
  } catch {
    console.error('  Save file is corrupted or not valid JSON.');
    process.exit(1);
  }
  const world = data.world?.state;
  if (!world) {
    console.log('  Invalid save file.');
    process.exit(1);
  }

  console.log(`  Game: ${world.meta?.gameId}`);
  console.log(`  Tick: ${world.meta?.tick}`);
  console.log(`  Seed: ${world.meta?.seed}`);
  console.log(`  Location: ${world.locationId}`);
  console.log(`  Entities: ${Object.keys(world.entities ?? {}).length}`);
  console.log(`  Events: ${(world.eventLog ?? []).length}`);
  console.log(`  Actions: ${(data.actionLog ?? []).length}`);
  console.log(`  Globals: ${JSON.stringify(world.globals ?? {})}`);
}

// Only run the CLI when this file is the process entry point. Importing it (e.g.
// from a unit test that exercises the exported helpers) must NOT kick off main()
// and its readline/argv handling.
const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((e: Error) => { console.error(e.message); process.exit(1); });
}
