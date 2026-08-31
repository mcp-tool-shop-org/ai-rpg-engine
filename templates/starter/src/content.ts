// Starter content — a loadable ContentPack plus session catalogs
//
// Replace this with your game's content. create-starter rewrites "my-game" /
// "My Game" placeholders. Keep enemies' aiProfile paired with a profile in
// setup.ts (runtime AI is overlaid after applyContentPack).

import type { GameManifest, EntityState } from '@ai-rpg-engine/core';
import type {
  ContentPack,
  EntityBlueprint,
  ZoneDefinition,
  ProgressionTreeDefinition,
  StatusDefinition,
} from '@ai-rpg-engine/content-schema';
import type { PackMetadata } from '@ai-rpg-engine/pack-registry';
import type { BuildCatalog } from '@ai-rpg-engine/character-creation';
import type { ItemCatalog } from '@ai-rpg-engine/equipment';

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
// / the CLI pack selector without a second trip to the docs.
// ═══════════════════════════════════════════════════════════════════

export const packMeta: PackMetadata = {
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
// ENTITY BLUEPRINTS (author data — not runtime EntityState)
// ═══════════════════════════════════════════════════════════════════

export const player: EntityBlueprint = {
    id: 'player',
    type: 'player',
    name: 'Hero',
    tags: ['player'],
    baseStats: { power: 5, speed: 4, grit: 3 },
    baseResources: { hp: 25, stamina: 10, tension: 0 },
};

export const enemy: EntityBlueprint = {
    id: 'grunt',
    type: 'npc',
    name: 'Grunt',
    tags: ['enemy', 'hostile'],
    baseStats: { power: 3, speed: 3, grit: 2 },
    baseResources: { hp: 12 },
    // aiProfile picks this enemy's combat brain. It must match a profile
    // provided in setup.ts (`cognition: { profiles: [...] }`) — without that
    // pairing the enemy never selects an intent and just stands there.
    // Built-ins: 'aggressive' (attack on sight) and 'cautious' (observe first).
    // applyContentPack drops the name (needs module vocabulary); setup.ts
    // overlays the runtime AIState from entityAi after intake.
    aiProfile: 'aggressive',
};

// Runtime-only AI overlay. Not part of the ContentPack; applyContentPack
// cannot construct AIState from a profile name. setup.ts writes this onto
// the converted entity after intake.
export const entityAi: Record<string, EntityState['ai']> = {
    grunt: { profileId: 'aggressive', goals: ['guard-zone'], fears: [], alertLevel: 0, knowledge: {} },
};

// ═══════════════════════════════════════════════════════════════════
// ZONES (ZoneDefinition — no roomId)
// ═══════════════════════════════════════════════════════════════════

export const zones: ZoneDefinition[] = [
    {
        id: 'start',
        name: 'Starting Area',
        tags: ['safe'],
        neighbors: ['danger-zone'],
    },
    {
        id: 'danger-zone',
        name: 'The Danger Zone',
        tags: ['hostile'],
        neighbors: ['start'],
    },
];

export const placements: ContentPack['placements'] = [
    { entityId: 'player', zoneId: 'start' },
    { entityId: 'grunt', zoneId: 'danger-zone' },
];

// ═══════════════════════════════════════════════════════════════════
// SESSION CATALOGS (chargen / items / progression / statuses / districts)
// Stubs so a create-starter project can join the pack selector.
// ═══════════════════════════════════════════════════════════════════

export const buildCatalog: BuildCatalog = {
    packId: 'my-game',
    statBudget: 3,
    maxTraits: 2,
    requiredFlaws: 0,
    archetypes: [
        {
            id: 'wanderer',
            name: 'Wanderer',
            description: 'A wanderer in My Game.',
            statPriorities: { power: 5, speed: 4, grit: 3 },
            startingTags: ['starter'],
            progressionTreeId: 'my-game-mastery',
        },
    ],
    backgrounds: [
        {
            id: 'local',
            name: 'Local',
            description: 'Grew up around My Game.',
            statModifiers: {},
            startingTags: [],
        },
    ],
    traits: [],
    disciplines: [],
    crossTitles: [],
    entanglements: [],
};

export const itemCatalog: ItemCatalog = {
    items: [
        {
            id: 'worn-blade',
            name: 'Worn Blade',
            description: 'A simple blade for My Game.',
            slot: 'weapon',
            rarity: 'common',
        },
    ],
};

export const districts = [
    {
        id: 'my-game-grounds',
        name: 'My Game Grounds',
        zoneIds: ['start', 'danger-zone'],
        tags: ['starter'],
        controllingFaction: 'my-game',
    },
];

export const progressionTree: ProgressionTreeDefinition = {
    id: 'my-game-mastery',
    name: 'My Game Mastery',
    currency: 'xp',
    nodes: [
        {
            id: 'hardened',
            name: 'Hardened',
            cost: 10,
            effects: [{ type: 'resource-boost', params: { resource: 'hp', amount: 5 } }],
        },
    ],
};

export const statusDefinitions: StatusDefinition[] = [];

// ═══════════════════════════════════════════════════════════════════
// CONTENT PACK (the authoring pipeline consumes this)
// ═══════════════════════════════════════════════════════════════════

export const pack: ContentPack = {
    entities: [player, enemy],
    zones,
    placements,
    districts,
    buildCatalog: buildCatalog as ContentPack['buildCatalog'],
    progressionTrees: [progressionTree],
    statuses: statusDefinitions,
    items: itemCatalog.items as ContentPack['items'],
};

/** Identity today — reserved for stripping any runtime-only fields later. */
export function toContentPack(): ContentPack {
    return pack;
}
