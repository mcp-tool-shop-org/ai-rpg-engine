/**
 * From-Scratch Composition Example
 *
 * A complete minimal game built from nothing: one zone, two entities,
 * combat wired via buildCombatStack, and a handful of modules.
 *
 * This is the "hello world" of AI RPG Engine composition.
 * ~30 lines of actual setup — everything else is type imports.
 */

import { Engine } from '@ai-rpg-engine/core';
import type { GameManifest, EntityState, ZoneState } from '@ai-rpg-engine/core';
import { traversalCore, statusCore, buildCombatStack, createSimulationInspector } from '@ai-rpg-engine/modules';

// 1. Manifest — game metadata
const manifest: GameManifest = {
  id: 'hello-world',
  title: 'Hello World',
  version: '1.0.0',
  engineVersion: '1.0.0',
  ruleset: 'minimal',
  modules: ['traversal-core', 'status-core', 'combat-core'],
  contentPacks: ['hello-world'],
};

// 2. Combat stack — 3 stats, that's all you need
const combat = buildCombatStack({
  statMapping: { attack: 'str', precision: 'dex', resolve: 'con' },
  playerId: 'hero',
});

// 3. Engine — wire modules
const engine = new Engine({
  manifest,
  seed: 42,
  modules: [traversalCore, statusCore, ...combat.modules, createSimulationInspector()],
});

// 4. Content — one zone, one player, one enemy
const arena: ZoneState = {
  id: 'arena',
  roomId: 'arena',
  name: 'The Arena',
  tags: ['combat'],
  neighbors: [],
};

const hero: EntityState = {
  id: 'hero',
  blueprintId: 'hero',
  type: 'player',
  name: 'The Hero',
  tags: ['human'],
  stats: { str: 6, dex: 5, con: 4 },
  resources: { hp: 25, maxHp: 25 },
  statuses: [],
};

const rat: EntityState = {
  id: 'rat',
  blueprintId: 'rat',
  type: 'enemy',
  name: 'Giant Rat',
  tags: ['beast'],
  stats: { str: 3, dex: 7, con: 2 },
  resources: { hp: 8, maxHp: 8 },
  statuses: [],
};

// 5. Add content and set player
engine.store.addZone(arena);
engine.store.addEntity(hero);
engine.store.addEntity(rat);
engine.store.state.playerId = 'hero';
engine.store.state.locationId = 'arena';

// Ready — the engine can now process actions:
// engine.submitAction('attack', { targetId: 'rat' });
