#!/usr/bin/env node
// AI RPG Engine CLI — run, save, load, replay

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  renderFullScreen,
  parseActionSelection,
  parseTextInput,
} from '@ai-rpg-engine/terminal-ui';
import { resolveEntity } from '@ai-rpg-engine/character-creation';
import type { Engine } from '@ai-rpg-engine/core';
import { allPacks, type PackInfo } from './packs.js';
import { promptMenu, promptConfirm, getReadline, closeReadline } from './prompts.js';
import { buildCharacter } from './character-builder.js';

const SAVE_DIR = '.ai-rpg-engine';
const SAVE_FILE = path.join(SAVE_DIR, 'save.json');

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] ?? 'run';

  switch (command) {
    case 'run':
      return runGame();
    case 'replay':
      replayGame();
      closeReadline();
      return;
    case 'inspect-save':
      inspectSave();
      closeReadline();
      return;
    default:
      console.log('AI RPG Engine CLI v2.0.0');
      console.log('Commands: run, replay, inspect-save');
      closeReadline();
      process.exit(0);
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

  // Replace the default player with the custom character
  const defaultPlayer = engine.store.state.entities['player'];
  playerEntity.zoneId = defaultPlayer?.zoneId;
  engine.store.state.entities['player'] = playerEntity;

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

function replayGame() {
  if (!fs.existsSync(SAVE_FILE)) {
    console.log('  No save file found.');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf-8'));
  const actionLog = data.actionLog ?? [];

  // Use the first pack for replay (TODO: save pack ID in save file)
  const pack = allPacks[0];
  console.log(`  Replaying ${actionLog.length} actions...`);

  const engine = pack.createGame(data.world?.state?.meta?.seed ?? 42);
  for (const action of actionLog) {
    engine.processAction(action);
  }

  console.log(`  Replay complete. ${engine.world.eventLog.length} events generated.`);
  console.log(`  Final tick: ${engine.tick}`);
  console.log(`  Player location: ${engine.world.locationId}`);
  const player = engine.world.entities['player'];
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
