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
    aggressiveProfile,
} from '@ai-rpg-engine/modules';
import type { IntentProfile } from '@ai-rpg-engine/modules';
import { applyContentPack } from '@ai-rpg-engine/content-schema';
import { manifest, pack } from './content.js';
import { myRuleset } from './ruleset.js';

// ═══════════════════════════════════════════════════════════════════
// STARTER-OWNED SYSTEMS
// Add your game-specific modules here. These are the things that make
// your starter feel different from other starters.
// ═══════════════════════════════════════════════════════════════════

// Example: a custom module that raises your "tension" resource whenever
// damage lands in combat. It listens on 'combat.damage.applied' — a real
// event emitted by combat-core every time an attack connects (other engine
// events you can hook: 'combat.contact.hit', 'combat.contact.miss',
// 'combat.entity.defeated', 'status.applied', 'world.zone.entered').
function createTensionPressure(): EngineModule {
    return {
        id: 'tension-pressure',
        version: '1.0.0',
        register(ctx) {
            ctx.events.on('combat.damage.applied', (event: ResolvedEvent, world: WorldState) => {
                const p = world.entities['player'];
                if (p && p.resources.tension !== undefined) {
                    p.resources.tension = Math.min(100, (p.resources.tension ?? 0) + 5);
                }
            });
        },
    };
}

// ═══════════════════════════════════════════════════════════════════
// INTENT PROFILES — required for enemies to act
// Every entity in content.ts that declares an `aiProfile` must find a
// matching profile in this list: cognition builds its profile map from
// `cognition.profiles`, and with an empty map no enemy ever selects an
// intent — they stand still forever. Built-ins from @ai-rpg-engine/modules:
// aggressiveProfile ('aggressive': attack visible hostiles, flee at low
// morale) and cautiousProfile ('cautious': observe first, strike when
// confident). Add your own IntentProfile objects here for custom brains.
// ═══════════════════════════════════════════════════════════════════

export const myIntentProfiles: IntentProfile[] = [aggressiveProfile];

// ═══════════════════════════════════════════════════════════════════
// GAME FACTORY
// ═══════════════════════════════════════════════════════════════════

export function createGame(seed?: number): Engine {
    // Combat stack: map your three stats → the combat dimensions
    const combat = buildCombatStack({
        statMapping: { attack: 'power', precision: 'speed', resolve: 'grit' },
        playerId: 'player',
        // resourceProfile — uncomment and customize for your game's resource
        // pressure. A CombatResourceProfile needs packId + the four arrays
        // (gains / spends / drains / aiModifiers — empty arrays are fine):
        // resourceProfile: {
        //   packId: 'my-game',
        //   gains: [
        //     // +2 tension every time an attack you make lands
        //     { trigger: 'attack-hit', resourceId: 'tension', amount: 2 },
        //   ],
        //   spends: [
        //     // spend 2 stamina on each attack for +1 damage
        //     { action: 'attack', resourceId: 'stamina', amount: 2, effects: { damageBonus: 1 } },
        //   ],
        //   drains: [],
        //   aiModifiers: [],
        // },
        // biasTags — built-in pack bias tags that shape combat AI intent.
        // Must come from PACK_BIAS_TAGS (exported by @ai-rpg-engine/modules,
        // e.g. 'undead', 'beast', 'feral'); unknown tags warn and are dropped:
        // biasTags: ['undead', 'beast'],
        // engagement — backline/protector behavior for ranged parties
        // (fields: backlineTags, protectorTags, chokepointTag, ambushTag):
        // engagement: { backlineTags: ['ranged', 'caster'], protectorTags: ['bodyguard'] },
        // recovery — safe zone recovery:
        recovery: { safeZoneTags: ['safe'] },
        // cognition — wires the intent profiles above into the enemy AI.
        // Every entityAi profileId (content.ts aiProfile) must resolve here.
        cognition: { profiles: myIntentProfiles },
    });

    // ═══════════════════════════════════════════════════════════════════
    // STRATEGIC TIER (OPTIONAL) — buildWorldStack
    // Every shipped starter adds a world-simulation layer (environment,
    // factions, districts, economy/trade, crafting, companions, quests, ...)
    // via ONE buildWorldStack({...}) call. This template stays combat-only by
    // default — uncomment below to add it. Two things buildWorldStack itself
    // requires registered BEFORE it (see its own file-header contract):
    // cognition-core (already inside combat.modules above) and
    // createPerceptionFilter() (import + register it in the modules array,
    // ahead of ...worldStack.modules).
    //
    // GENRE WIRING (V3-GEN-1/2, v3.0 wave 2; F-V31-ECON-GENRE, v3.1): pass
    // YOUR OWN ruleset's bare genre id as tradeGenre, craftingGenre, AND
    // economyGenre — the ruleset `id` with any '-minimal'-style suffix your
    // naming convention adds stripped off (myRuleset.id here is already
    // bare: 'my-game', nothing to strip). Do NOT use manifest.genres — that
    // is a free-text flavor-tag vocabulary, a DIFFERENT vocabulary than
    // trade-core.ts's GENRE_BUYABLE_STOCK / crafting-recipes.ts's
    // GENRE_RECIPES / economy-core.ts's GENRE_SUPPLY_DEFAULTS table keys
    // (e.g. a pack tagged genres: ['western'] may key its table entries
    // 'weird-west' instead — the bare ruleset id, not the flavor tag, is
    // what selects genre-flavored stock/recipes/starting supply). A genre
    // with no matching table entry safely falls back to the universal/
    // default tables — an honest degrade, not a bug.
    //
    // import { buildWorldStack, createPerceptionFilter } from '@ai-rpg-engine/modules';
    // ...
    // const worldStack = buildWorldStack({
    //   playerId: 'player',
    //   tradeGenre: myRuleset.id,    // or a literal genre string
    //   craftingGenre: myRuleset.id,
    //   economyGenre: myRuleset.id,
    // });
    // ═══════════════════════════════════════════════════════════════════

    const engine = new Engine({
        manifest,
        seed: seed ?? 42,
        ruleset: myRuleset,
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

    // Author data → runtime. JSON hosts: extractSessionContent(pack) →
    // construct modules (buildWorldStack({ districts: session.districts })) →
    // applyContentPack({ profiles, channels: createStandardChannels() }).
    // Import createStandardChannels from @ai-rpg-engine/modules — do not
    // auto-inject. This factory still wires named catalogs at construction;
    // apply copies EntityBlueprint relations/custom/resistances/faction/
    // ruleProfileId and resolves aiProfile against cognition profiles +
    // pack.entityAi.
    const applied = applyContentPack(engine, pack, { profiles: myIntentProfiles });
    if (!applied.ok) {
        const detail = applied.errors.map((e) => `${e.path}: ${e.message}`).join('\n');
        throw new Error(`applyContentPack failed:\n${detail}`);
    }

    // F-bc7b8ab1: no manual playerId/locationId stamp needed here —
    // content.ts's placements[] places pack's single type:'player' entity at
    // 'start', so applyContentPack's own identity stamp (F-67786a6c) already
    // derived both onto the store above. Don't add one back for your own
    // starting zone either: if your pack authors exactly one type:'player'
    // entity with a placement, the stamp tracks it for free — a hand-written
    // override here is the exact pattern that can silently diverge from
    // content.ts once you move the starting zone. Only fall back manually
    // for a pack that declares zero or several type:'player' entities (the
    // stamp is deliberately ambiguous-safe: it never guesses):
    // if (!engine.store.state.playerId) engine.store.state.playerId = 'player';

    return engine;
}
