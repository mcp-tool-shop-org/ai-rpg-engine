// Starter content — entities, zones, and manifest
//
// Replace this with your game's content.

import type { EntityState, ZoneState, GameManifest } from '@ai-rpg-engine/core';

export const manifest: GameManifest = {
    id: 'my-game',
    title: 'My Game',
    version: '0.1.0',
    engineVersion: '>=3.8.0 <4.0.0',
    ruleset: 'my-game',
    modules: ['traversal-core', 'status-core', 'combat-core'],
    contentPacks: ['my-game'],
};

// ═══════════════════════════════════════════════════════════════════
// PACK METADATA
// Full PackMetadata shape so a copied pack can appear in getPackSummaries()
// / the CLI pack selector without a second trip to the docs. Keep this
// dependency-light (no pack-registry import). See any packages/starter-*
// content.ts for a typed PackMetadata + BuildCatalog example.
// ═══════════════════════════════════════════════════════════════════

export const packMeta = {
    id: 'my-game',
    name: 'My Game',
    tagline: 'A one-line pitch for your game.',
    genres: ['fantasy'],
    difficulty: 'beginner',
    tones: ['heroic'],
    tags: ['starter'],
    engineVersion: '>=3.8.0 <4.0.0',
    version: '0.1.0',
    description: 'A brief description of your game. One to three sentences that appear as the listing subtitle.',
    narratorTone: 'A short narrator-voice note.',
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
