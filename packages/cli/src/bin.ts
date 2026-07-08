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
import { WorldStore, SaveLoadError, type Engine } from '@ai-rpg-engine/core';
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
      const trimmed = input.trim();
      if (!trimmed) {
        prompt();
        return;
      }

      // Meta commands
      if (trimmed === 'quit' || trimmed === 'exit') {
        console.log('\n  Farewell, wanderer.\n');
        closeReadline();
        process.exit(0);
      }

      if (trimmed === 'save') {
        saveGame(engine);
        console.log('  Game saved.');
        prompt();
        return;
      }

      if (trimmed === 'help') {
        console.log('\n  Commands: move, inspect, attack, speak, use, save, quit');
        console.log('  Or type a number to select an action.\n');
        prompt();
        return;
      }

      // Check for dialogue mode — number selects dialogue choice
      const dState = engine.world.modules['dialogue-core'] as { activeDialogue: string | null } | undefined;
      if (dState?.activeDialogue) {
        const choiceIndex = parseInt(trimmed, 10);
        if (!isNaN(choiceIndex) && choiceIndex >= 1) {
          runGuardedAction(() =>
            engine.submitAction('choose', {
              parameters: { choiceIndex: choiceIndex - 1 },
            }),
          );
          prompt();
          return;
        }
      }

      // Try number selection
      const numAction = parseActionSelection(trimmed, engine.world);
      if (numAction) {
        runGuardedAction(() =>
          engine.submitAction(numAction.verb, {
            targetIds: numAction.targetIds,
            toolId: numAction.toolId,
            parameters: numAction.parameters,
          }),
        );
        prompt();
        return;
      }

      // Try text parsing
      const textAction = parseTextInput(trimmed, engine.world);
      if (textAction) {
        runGuardedAction(() =>
          engine.submitAction(textAction.verb, {
            targetIds: textAction.targetIds,
            toolId: textAction.toolId,
            parameters: textAction.parameters,
          }),
        );
        prompt();
        return;
      }

      console.log(`  Unknown command: ${trimmed}. Type "help" for options.`);
      prompt();
    });
  }

  prompt();
}

function saveGame(engine: Engine) {
  if (!fs.existsSync(SAVE_DIR)) {
    fs.mkdirSync(SAVE_DIR, { recursive: true });
  }
  fs.writeFileSync(SAVE_FILE, engine.serialize(), 'utf-8');
}

function replayGame(args: string[] = []) {
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
    const actionLog = data.actionLog ?? [];
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
