// Starter content — entities, zones, and manifest
//
// Replace this with your game's content.

import type { EntityState, ZoneState, GameManifest } from '@ai-rpg-engine/core';

export const manifest: GameManifest = {
    id: 'my-game',
    title: 'My Game',
    version: '0.1.0',
    engineVersion: '0.1.0',
    ruleset: 'my-game',
    modules: ['traversal-core', 'status-core', 'combat-core'],
    contentPacks: ['my-game'],
};

// ═══════════════════════════════════════════════════════════════════
// PACK METADATA
// This is a minimal subset to keep the template dependency-light. To list
// your pack in the CLI pack selector, export the full PackMetadata shape
// from @ai-rpg-engine/pack-registry (adds: tagline, genres, difficulty,
// tones, tags, engineVersion, narratorTone) plus a BuildCatalog from
// @ai-rpg-engine/character-creation — see any packages/starter-* content.ts
// for a complete example.
// ═══════════════════════════════════════════════════════════════════

export const packMeta = {
    id: 'my-game',
    name: 'My Game',
    description: 'A brief description of your game',
    version: '0.1.0',
};

// ═══════════════════════════════════════════════════════════════════
// PLAYER
// ═══════════════════════════════════════════════════════════════════

export const player: EntityState = {
    id: 'player',
    blueprintId: 'player',
    type: 'player',
    name: 'Hero',
    tags: ['player'],
    stats: { power: 5, speed: 4, grit: 3 },
    resources: { hp: 25, stamina: 10, tension: 0 },
    statuses: [],
    inventory: [],
    zoneId: 'start',
};

// ═══════════════════════════════════════════════════════════════════
// ENEMIES
// ═══════════════════════════════════════════════════════════════════

export const enemy: EntityState = {
    id: 'grunt',
    blueprintId: 'grunt',
    type: 'npc',
    name: 'Grunt',
    tags: ['enemy', 'hostile'],
    stats: { power: 3, speed: 3, grit: 2 },
    resources: { hp: 12 },
    statuses: [],
    zoneId: 'danger-zone',
    // ai.profileId picks this enemy's combat brain. It must match a profile
    // provided in setup.ts (`cognition: { profiles: [...] }`) — without that
    // pairing the enemy never selects an intent and just stands there.
    // Built-ins: 'aggressive' (attack on sight) and 'cautious' (observe first).
    ai: { profileId: 'aggressive', goals: ['guard-zone'], fears: [], alertLevel: 0, knowledge: {} },
};

// ═══════════════════════════════════════════════════════════════════
// ZONES
// ═══════════════════════════════════════════════════════════════════

export const zones: ZoneState[] = [
    {
        id: 'start',
        roomId: 'room-1',
        name: 'Starting Area',
        tags: ['safe'],
        neighbors: ['danger-zone'],
    },
    {
        id: 'danger-zone',
        roomId: 'room-2',
        name: 'The Danger Zone',
        tags: ['hostile'],
        neighbors: ['start'],
    },
];
