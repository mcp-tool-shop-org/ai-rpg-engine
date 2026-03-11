/**
 * Multi-Encounter Composition Example
 *
 * One world with three different encounter modes: patrol, ambush,
 * and boss fight. Demonstrates that encounter structure is a content
 * decision, not an engine constraint — the same combat stack serves
 * all three patterns.
 *
 * Uses the encounter library helpers from @ai-rpg-engine/modules
 * alongside a manual boss definition.
 *
 * Inspired by: Colony (squad combat), Gladiator (3-phase boss)
 */

import { Engine } from '@ai-rpg-engine/core';
import type { GameManifest, EntityState, ZoneState } from '@ai-rpg-engine/core';
import {
  traversalCore, statusCore,
  buildCombatStack,
  createBossPhaseListener,
  createSimulationInspector,
} from '@ai-rpg-engine/modules';
import type { BossDefinition } from '@ai-rpg-engine/modules';

const manifest: GameManifest = {
  id: 'dungeon-modes', title: 'Dungeon Modes', version: '1.0.0',
  engineVersion: '1.0.0', ruleset: 'dungeon', modules: [], contentPacks: ['dungeon'],
};

const combat = buildCombatStack({
  statMapping: { attack: 'might', precision: 'agility', resolve: 'fortitude' },
  playerId: 'adventurer',
  biasTags: ['undead', 'beast'],
});

// --- Boss Definition (3 phases) ---

const lichBoss: BossDefinition = {
  entityId: 'lich-lord',
  phases: [
    {
      hpThreshold: 0.7,
      narrativeKey: 'summoning',
      addTags: ['summoner'],
    },
    {
      hpThreshold: 0.4,
      narrativeKey: 'enraged',
      removeTags: ['summoner'],
      addTags: ['feral'],
      newBiasModifiers: { attack: 10, guard: -5 },
    },
    {
      hpThreshold: 0.15,
      narrativeKey: 'desperate',
      removeTags: ['feral'],
      addTags: ['desperate'],
      newBiasModifiers: { attack: 15, guard: -10, disengage: -10 },
    },
  ],
  immovable: true,
};

const engine = new Engine({
  manifest,
  seed: 42,
  modules: [
    traversalCore,
    statusCore,
    ...combat.modules,
    createBossPhaseListener(lichBoss),
    createSimulationInspector(),
  ],
});

// --- Zones ---

const zones: ZoneState[] = [
  { id: 'corridor', roomId: 'corridor', name: 'Dungeon Corridor', tags: ['indoor'], neighbors: ['ambush-room', 'throne-room'] },
  { id: 'ambush-room', roomId: 'ambush-room', name: 'Collapsed Chamber', tags: ['indoor', 'dark', 'ambush'], neighbors: ['corridor'] },
  { id: 'throne-room', roomId: 'throne-room', name: 'Lich Throne Room', tags: ['indoor', 'boss'], neighbors: ['corridor'] },
];

// --- Entities ---

// Player
const adventurer: EntityState = {
  id: 'adventurer', blueprintId: 'adventurer', type: 'player', name: 'The Adventurer',
  tags: ['human'], stats: { might: 6, agility: 5, fortitude: 5 },
  resources: { hp: 30, maxHp: 30 }, statuses: [],
};

// Encounter Mode 1: Patrol — a skeleton walking a fixed route
const patrolSkeleton: EntityState = {
  id: 'patrol-skeleton', blueprintId: 'skeleton', type: 'enemy', name: 'Patrol Skeleton',
  tags: ['undead', 'role:minion'], stats: { might: 3, agility: 4, fortitude: 2 },
  resources: { hp: 10, maxHp: 10 }, statuses: [],
};

// Encounter Mode 2: Ambush — enemies that start hidden in a dark room
const ambusher1: EntityState = {
  id: 'shadow-1', blueprintId: 'shadow', type: 'enemy', name: 'Shadow Lurker',
  tags: ['undead', 'role:skirmisher'], stats: { might: 4, agility: 8, fortitude: 2 },
  resources: { hp: 12, maxHp: 12 }, statuses: [],
};
const ambusher2: EntityState = {
  id: 'shadow-2', blueprintId: 'shadow', type: 'enemy', name: 'Shadow Stalker',
  tags: ['undead', 'role:skirmisher'], stats: { might: 4, agility: 7, fortitude: 3 },
  resources: { hp: 14, maxHp: 14 }, statuses: [],
};

// Encounter Mode 3: Boss — the lich with 3 phases
const lichLord: EntityState = {
  id: 'lich-lord', blueprintId: 'lich-lord', type: 'enemy', name: 'Lich Lord',
  tags: ['undead', 'role:boss'], stats: { might: 8, agility: 4, fortitude: 7 },
  resources: { hp: 50, maxHp: 50 }, statuses: [],
};

// --- Wire content ---

zones.forEach(z => engine.store.addZone(z));
engine.store.addEntity(adventurer);
engine.store.addEntity(patrolSkeleton);
engine.store.addEntity(ambusher1);
engine.store.addEntity(ambusher2);
engine.store.addEntity(lichLord);
engine.store.state.playerId = 'adventurer';
engine.store.state.locationId = 'corridor';

// Three encounter modes, one combat stack, one world.
// The patrol skeleton roams the corridor.
// The shadows wait in the ambush room.
// The lich sits in the throne room with 3-phase escalation.
