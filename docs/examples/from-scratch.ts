/**
 * From-Scratch Composition Example
 *
 * A complete minimal game built from nothing: one zone, two entities,
 * combat wired via buildCombatStack, and a handful of modules.
 *
 * This is the "hello world" of AI RPG Engine composition.
 * ~30 lines of actual setup — everything else is type imports.
 *
 * `createFromScratchGame()` returns a ready-to-drive Engine so the example
 * is both readable top-to-bottom AND exercised by docs/examples.test.ts.
 */

import { Engine } from '@ai-rpg-engine/core';
import type { GameManifest, EntityState, ZoneState } from '@ai-rpg-engine/core';
import { traversalCore, statusCore, buildCombatStack, createSimulationInspector } from '@ai-rpg-engine/modules';

export function createFromScratchGame(seed = 42): Engine {
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
    seed,
    modules: [traversalCore, statusCore, ...combat.modules, createSimulationInspector()],
  });

  // 4. Content — one zone, one player, one enemy.
  //    Combatants must share a zoneId for combat to resolve, and carry a
  //    `stamina` resource (attacking costs 1) — otherwise combat-core rejects
  //    the action ("target not in same zone" / "not enough stamina").
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
    resources: { hp: 25, maxHp: 25, stamina: 5 },
    zoneId: 'arena',
    statuses: [],
  };

  const rat: EntityState = {
    id: 'rat',
    blueprintId: 'rat',
    type: 'enemy',
    name: 'Giant Rat',
    tags: ['beast'],
    stats: { str: 3, dex: 7, con: 2 },
    resources: { hp: 8, maxHp: 8, stamina: 5 },
    zoneId: 'arena',
    statuses: [],
  };

  // 5. Add content and set player.
  //    setPlayerLocation keeps state.locationId and the player's zoneId in sync.
  engine.store.addZone(arena);
  engine.store.addEntity(hero);
  engine.store.addEntity(rat);
  engine.store.state.playerId = 'hero';
  engine.store.setPlayerLocation('arena');

  return engine;
}

// Build the game and resolve one real attack — both entities are in 'arena'
// and have stamina, so this returns hit/miss events rather than a rejection.
const engine = createFromScratchGame();
const events = engine.submitAction('attack', { targetIds: ['rat'] });
void events; // e.g. inspect for 'combat.contact.*' or 'action.rejected'
