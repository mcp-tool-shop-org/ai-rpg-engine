// Game setup — wire content + combat stack into the engine
//
// ╔══════════════════════════════════════════════════════════════════╗
// ║  COMPOSITION CONTRACT                                           ║
// ║  buildCombatStack owns: cognition, engagement, review,          ║
// ║    combatCore, tactics, resources, intent, recovery, narration   ║
// ║  YOU own: traversal, status, inventory, dialogue, progression,  ║
// ║    perception, environment, abilities, and your custom modules   ║
// ╚══════════════════════════════════════════════════════════════════╝

import { Engine } from '@ai-rpg-engine/core';
import type { EngineModule, ResolvedEvent, WorldState } from '@ai-rpg-engine/core';
import {
    traversalCore,
    statusCore,
    buildCombatStack,
} from '@ai-rpg-engine/modules';
import { manifest, player, enemy, zones } from './content.js';
import { westernRuleset } from './ruleset.js';

// ═══════════════════════════════════════════════════════════════════
// STARTER-OWNED SYSTEMS
// Add your game-specific modules here. These are the things that make
// your starter feel different from other starters.
// ═══════════════════════════════════════════════════════════════════

// Example: a custom module that ticks your "tension" resource each combat round
function createTensionPressure(): EngineModule {
    return {
        id: 'tension-pressure',
        version: '1.0.0',
        register(ctx) {
            ctx.events.on('combat.round.end', (event: ResolvedEvent, world: WorldState) => {
                const p = world.entities['player'];
                if (p && p.resources.tension !== undefined) {
                    p.resources.tension = Math.min(100, (p.resources.tension ?? 0) + 5);
                }
            });
        },
    };
}

// ═══════════════════════════════════════════════════════════════════
// GAME FACTORY
// ═══════════════════════════════════════════════════════════════════

export function createGame(seed?: number): Engine {
    // Combat stack: map your three stats → the combat dimensions
    const combat = buildCombatStack({
        statMapping: { attack: 'power', precision: 'speed', resolve: 'grit' },
        playerId: 'player',
        // resourceProfile — uncomment and customize for your game's resource pressure:
        // resourceProfile: {
        //   spends: [
        //     { verbId: 'attack', costStat: 'stamina', amount: 2 },
        //   ],
        // },
        // biasTags — entity tags that cognition uses for faction bias:
        // biasTags: ['enemy'],
        // engagement — customize if your game uses ranged/melee distance:
        // engagement: { defaultRange: 'melee' },
        // recovery — safe zone recovery:
        recovery: { safeZoneTags: ['safe'] },
    });

    const engine = new Engine({
        manifest,
        seed: seed ?? 42,
        ruleset: westernRuleset,
        modules: [
            traversalCore,
            statusCore,
            ...combat.modules, // ← the full combat stack
            // ──────────────────────────────────────────────
            // YOUR MODULES GO HERE
            createTensionPressure(),
            // ──────────────────────────────────────────────
        ],
    });

    // Register zones
    for (const zone of zones) {
        engine.store.addZone(zone);
    }

    // Register entities
    engine.store.addEntity({ ...player });
    engine.store.addEntity({ ...enemy });

    // Set player context
    engine.store.state.playerId = 'player';
    engine.store.state.locationId = 'start';

    return engine;
}
