/**
 * Cross-World Composition Example
 *
 * The same combat stack (stat mapping + resource profile) reused with
 * two completely different zone/entity sets. Proves that "world" is
 * just content — swap the zones and entities, keep the mechanics.
 *
 * This example defines one combat stack and two factory functions
 * that each build a different world with the same combat feel.
 *
 * Inspired by: Weird West (buildCombatStack), Fantasy (simple content)
 */

import { Engine } from '@ai-rpg-engine/core';
import type { GameManifest, EntityState, ZoneState } from '@ai-rpg-engine/core';
import {
  traversalCore, statusCore, buildCombatStack,
  createSimulationInspector,
} from '@ai-rpg-engine/modules';
import type { CombatStackConfig, CombatResourceProfile } from '@ai-rpg-engine/modules';

// --- Shared combat identity ---

const sharedProfile: CombatResourceProfile = {
  packId: 'shared-combat',
  gains: [
    { trigger: 'attack-hit', resourceId: 'fury', amount: 2 },
    { trigger: 'defeat-enemy', resourceId: 'fury', amount: 5 },
  ],
  spends: [
    { action: 'attack', resourceId: 'fury', amount: 5, effects: { damageBonus: 2 } },
  ],
  drains: [
    { trigger: 'take-damage', resourceId: 'fury', amount: 1 },
  ],
  aiModifiers: [
    { resourceId: 'fury', highThreshold: 50, highModifiers: { attack: 10 } },
  ],
};

const sharedCombatConfig: CombatStackConfig = {
  statMapping: { attack: 'ferocity', precision: 'instinct', resolve: 'endurance' },
  playerId: 'player',
  resourceProfile: sharedProfile,
  biasTags: ['beast', 'undead'],
};

// --- World A: Frozen Tundra ---

function createTundraWorld(seed: number): Engine {
  const combat = buildCombatStack(sharedCombatConfig);
  const manifest: GameManifest = {
    id: 'frozen-tundra', title: 'Frozen Tundra', version: '1.0.0',
    engineVersion: '1.0.0', ruleset: 'tundra', modules: [], contentPacks: ['tundra'],
  };
  const engine = new Engine({ manifest, seed, modules: [traversalCore, statusCore, ...combat.modules, createSimulationInspector()] });

  const zones: ZoneState[] = [
    { id: 'glacier', roomId: 'glacier', name: 'Shattered Glacier', tags: ['cold'], neighbors: ['ice-cave'] },
    { id: 'ice-cave', roomId: 'ice-cave', name: 'Ice Cave', tags: ['cold', 'dark'], neighbors: ['glacier'] },
  ];

  const player: EntityState = {
    id: 'player', blueprintId: 'player', type: 'player', name: 'Frost Ranger',
    tags: ['human'], stats: { ferocity: 5, instinct: 6, endurance: 4 },
    resources: { hp: 28, maxHp: 28, fury: 0 }, statuses: [],
  };
  const iceWyrm: EntityState = {
    id: 'ice-wyrm', blueprintId: 'ice-wyrm', type: 'enemy', name: 'Ice Wyrm',
    tags: ['beast'], stats: { ferocity: 7, instinct: 4, endurance: 5 },
    resources: { hp: 20, maxHp: 20 }, statuses: [],
  };

  zones.forEach(z => engine.store.addZone(z));
  engine.store.addEntity(player);
  engine.store.addEntity(iceWyrm);
  engine.store.state.playerId = 'player';
  engine.store.state.locationId = 'glacier';
  return engine;
}

// --- World B: Desert Ruins ---

function createDesertWorld(seed: number): Engine {
  const combat = buildCombatStack(sharedCombatConfig);
  const manifest: GameManifest = {
    id: 'desert-ruins', title: 'Desert Ruins', version: '1.0.0',
    engineVersion: '1.0.0', ruleset: 'desert', modules: [], contentPacks: ['desert'],
  };
  const engine = new Engine({ manifest, seed, modules: [traversalCore, statusCore, ...combat.modules, createSimulationInspector()] });

  const zones: ZoneState[] = [
    { id: 'oasis', roomId: 'oasis', name: 'Desert Oasis', tags: ['hot'], neighbors: ['tomb'] },
    { id: 'tomb', roomId: 'tomb', name: 'Buried Tomb', tags: ['dark'], neighbors: ['oasis'] },
  ];

  const player: EntityState = {
    id: 'player', blueprintId: 'player', type: 'player', name: 'Sand Walker',
    tags: ['human'], stats: { ferocity: 4, instinct: 7, endurance: 5 },
    resources: { hp: 24, maxHp: 24, fury: 0 }, statuses: [],
  };
  const mummy: EntityState = {
    id: 'mummy', blueprintId: 'mummy', type: 'enemy', name: 'Risen Mummy',
    tags: ['undead'], stats: { ferocity: 6, instinct: 3, endurance: 7 },
    resources: { hp: 22, maxHp: 22 }, statuses: [],
  };

  zones.forEach(z => engine.store.addZone(z));
  engine.store.addEntity(player);
  engine.store.addEntity(mummy);
  engine.store.state.playerId = 'player';
  engine.store.state.locationId = 'oasis';
  return engine;
}

// Same combat mechanics, different worlds.
const tundra = createTundraWorld(1);
const desert = createDesertWorld(2);
