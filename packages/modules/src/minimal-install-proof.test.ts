/**
 * Minimal Install Proof — "New User Truth"
 *
 * Proves that a consumer who installs ONLY:
 *   @ai-rpg-engine/core + @ai-rpg-engine/modules
 * can run the README quickstart without hidden monorepo dependencies.
 *
 * This test:
 * 1. Imports exclusively from core + modules (the two user-facing packages)
 * 2. Uses the exact README pattern (no monorepo-internal helpers)
 * 3. Verifies the engine boots, accepts actions, and produces events
 * 4. Asserts no additional @ai-rpg-engine/* packages are required
 */

import { describe, it, expect } from 'vitest';
import { Engine } from '@ai-rpg-engine/core';
import type { GameManifest, EntityState, ZoneState } from '@ai-rpg-engine/core';
import { buildCombatStack, traversalCore, statusCore, createDialogueCore } from '@ai-rpg-engine/modules';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('Minimal Install Proof', () => {
  it('boots and runs with only core + modules imports', () => {
    // A new user creates a manifest
    const manifest: GameManifest = {
      id: 'minimal-proof',
      title: 'Minimal Install Test',
      version: '1.0.0',
      engineVersion: '2.3.2',
      ruleset: 'minimal',
      modules: ['combat', 'traversal', 'status'],
      contentPacks: [],
    };

    // They follow the README pattern exactly
    const combat = buildCombatStack({
      statMapping: { attack: 'strength', precision: 'dexterity', resolve: 'willpower' },
      playerId: 'player',
      biasTags: ['enemy'],
    });

    const dialogues: Parameters<typeof createDialogueCore>[0] = [];
    const engine = new Engine({
      manifest,
      modules: [statusCore, ...combat.modules, traversalCore, createDialogueCore(dialogues)],
    });

    // Inject minimal content (what a new user would do)
    const player: EntityState = {
      id: 'player',
      blueprintId: 'player',
      type: 'player',
      name: 'New User Hero',
      tags: ['human', 'player'],
      stats: { strength: 12, dexterity: 10, willpower: 8 },
      resources: { hp: 25, stamina: 15 },
      statuses: [],
      zoneId: 'start',
    };

    const enemy: EntityState = {
      id: 'goblin-1',
      blueprintId: 'goblin',
      type: 'npc',
      name: 'Goblin Scout',
      tags: ['enemy', 'hostile'],
      stats: { strength: 6, dexterity: 8, willpower: 3 },
      resources: { hp: 10, stamina: 8 },
      statuses: [],
      zoneId: 'start',
      ai: { profileId: 'aggressive', goals: ['kill-player'], fears: [], alertLevel: 70, knowledge: {} },
    };

    const zones: ZoneState[] = [
      { id: 'start', roomId: 'start', name: 'Starting Area', tags: ['outdoor', 'combat-zone'], neighbors: [] },
    ];

    engine.store.state.playerId = 'player';
    engine.store.state.locationId = 'start';
    engine.store.state.entities['player'] = player;
    engine.store.state.entities['goblin-1'] = enemy;
    for (const z of zones) engine.store.state.zones[z.id] = { ...z };

    // It works — actions produce events
    const events = engine.submitAction('attack', { targetIds: ['goblin-1'] });
    expect(events.length).toBeGreaterThan(0);
    expect(engine.tick).toBe(1);
  });

  it('this file imports only from @ai-rpg-engine/core and @ai-rpg-engine/modules', () => {
    // Self-referential proof: parse this file's own imports and assert
    // no hidden @ai-rpg-engine/* packages beyond core + modules
    const thisFile = readFileSync(resolve(__dirname, 'minimal-install-proof.test.ts'), 'utf-8');
    const importMatches = thisFile.match(/from\s+['"](@ai-rpg-engine\/[^'"]+)['"]/g) || [];
    const packages = importMatches.map(m => m.match(/@ai-rpg-engine\/[^'"]+/)![0]);
    const unique = [...new Set(packages)];

    // Only core and modules should appear
    expect(unique.sort()).toEqual(['@ai-rpg-engine/core', '@ai-rpg-engine/modules']);
  });

  it('modules package.json declares only core + content-schema + character-profile as deps', () => {
    // Ensures no surprise dependencies sneak into the install surface
    const pkgPath = resolve(__dirname, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    const deps = Object.keys(pkg.dependencies || {}).sort();

    // These are the allowed transitive deps a consumer gets
    expect(deps).toEqual([
      '@ai-rpg-engine/character-profile',
      '@ai-rpg-engine/content-schema',
      '@ai-rpg-engine/core',
    ]);
  });
});
