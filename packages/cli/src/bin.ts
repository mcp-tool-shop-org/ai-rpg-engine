#!/usr/bin/env node
// SignalFire CLI — run, save, load, replay

import * as readline from 'node:readline';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createGame } from '@signalfire/starter-fantasy';
import {
  renderFullScreen,
  parseActionSelection,
  parseTextInput,
} from '@signalfire/terminal-ui';
import type { Engine } from '@signalfire/core';

const SAVE_DIR = '.signalfire';
const SAVE_FILE = path.join(SAVE_DIR, 'save.json');

function main() {
  const args = process.argv.slice(2);
  const command = args[0] ?? 'run';

  switch (command) {
    case 'run':
      return runGame();
    case 'replay':
      return replayGame();
    case 'inspect-save':
      return inspectSave();
    default:
      console.log('SignalFire CLI v0.1.0');
      console.log('Commands: run, replay, inspect-save');
      process.exit(0);
  }
}

function runGame() {
  let engine: Engine;

  // Try to load save
  if (fs.existsSync(SAVE_FILE)) {
    console.log('  Save file found. Loading...');
    try {
      const data = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf-8'));
      engine = createGame(data.world?.state?.meta?.seed);
      // Replay actions from save to restore state
      // For now, just start fresh — full save/load in Step 14
      engine = createGame();
      console.log('  (Starting fresh — full save/load coming soon)');
    } catch {
      engine = createGame();
    }
  } else {
    engine = createGame();
  }

  console.log('\n  ═══════════════════════════════════════');
  console.log('  THE CHAPEL THRESHOLD');
  console.log('  A SignalFire Starter');
  console.log('  ═══════════════════════════════════════\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

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
        rl.close();
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

function replayGame() {
  if (!fs.existsSync(SAVE_FILE)) {
    console.log('  No save file found.');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf-8'));
  const actionLog = data.actionLog ?? [];

  console.log(`  Replaying ${actionLog.length} actions...`);

  const engine = createGame(data.world?.state?.meta?.seed ?? 42);
  for (const action of actionLog) {
    engine.processAction(action);
  }

  console.log(`  Replay complete. ${engine.world.eventLog.length} events generated.`);
  console.log(`  Final tick: ${engine.tick}`);
  console.log(`  Player location: ${engine.world.locationId}`);
  const player = engine.world.entities['player'];
  if (player) {
    console.log(`  HP: ${player.resources.hp}  Stamina: ${player.resources.stamina}`);
  }
}

function inspectSave() {
  if (!fs.existsSync(SAVE_FILE)) {
    console.log('  No save file found.');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf-8'));
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

main();
