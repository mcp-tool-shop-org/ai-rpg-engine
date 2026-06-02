#!/usr/bin/env node
// AI RPG Engine CLI — run, save, load, replay

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';

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

const SAVE_DIR = '.ai-rpg-engine';
const SAVE_FILE = path.join(SAVE_DIR, 'save.json');

function printHelp() {
  console.log(`ai-rpg-engine v${version} — simulation-first RPG toolkit`);
  console.log('');
  console.log('Usage: ai-rpg-engine [command]');
  console.log('');
  console.log('Commands:');
  console.log('  run            Start a new game (default)');
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

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] ?? 'run';

  if (args.includes('--version') || args.includes('-v') || command === 'version') {
    console.log(`ai-rpg-engine v${version}`);
    closeReadline();
    return;
  }

  if (args.includes('--help') || args.includes('-h') || command === 'help') {
    printHelp();
    closeReadline();
    return;
  }

  switch (command) {
    case 'run':
      return runGame();
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
          engine.submitAction('choose', {
            parameters: { choiceIndex: choiceIndex - 1 },
          });
          prompt();
          return;
        }
      }

      // Try number selection
      const numAction = parseActionSelection(trimmed, engine.world);
      if (numAction) {
        engine.submitAction(numAction.verb, {
          targetIds: numAction.targetIds,
          toolId: numAction.toolId,
          parameters: numAction.parameters,
        });
        prompt();
        return;
      }

      // Try text parsing
      const textAction = parseTextInput(trimmed, engine.world);
      if (textAction) {
        engine.submitAction(textAction.verb, {
          targetIds: textAction.targetIds,
          toolId: textAction.toolId,
          parameters: textAction.parameters,
        });
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

main().catch((e: Error) => { console.error(e.message); process.exit(1); });
