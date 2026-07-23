// world-stack — DX helpers for pack authors
//
// The strategic-tier counterpart of combat-builders. buildCombatStack made
// the tactical tier a one-call assembly; this file does the same for the
// world simulation layer that every starter used to hand-list module by
// module: environment, faction cognition, rumor transport, districts, belief
// provenance, observer presentation, defeat fallout, and encounter spawning.
// Pack authors provide their world's rosters and content; the builder returns
// the strategic module list in the correct wiring order.
//
// CONTRACT (the part that keeps ten shipped worlds byte-identical):
//   - The module order is FIXED and dependency-true: environment-core before
//     district-core (district-core depends on it), district-core before
//     defeat-fallout (ditto), faction-cognition before rumor-propagation.
//     It is exactly the order every shipped starter already registered by
//     hand, so adopting the builder is a pure lift-and-drop.
//   - ONE `factions` roster feeds BOTH faction-cognition (which reads
//     cohesion) and defeat-fallout (which reads membership only) — the two
//     hand-kept copies every setup carried are unified here.
//   - The stack expects `cognition-core` and `perception-filter` to be
//     registered BEFORE it (faction-cognition, rumor-propagation, belief-
//     provenance, and observer-presentation declare dependsOn them). In every
//     shipped starter that holds by construction: cognition-core ships inside
//     buildCombatStack's modules and perception-filter is registered ahead of
//     the world tier. Registration throws loudly if the prerequisite is
//     missing — nothing degrades silently.
//   - `encounterSpawn` is presence-optional (the resourceProfile idiom from
//     buildCombatStack): a pack without authored spawn tables simply omits it
//     and no encounter-spawn module is included. The world tick
//     (world-tick.ts) drives the registered content each round — the builder
//     wires the module; the tick chain is unchanged.
//   - `quests` is presence-optional the same way (F-ENG005-quest-loop-min):
//     a pack with authored QuestDefinitions passes them and quest-core joins
//     the stack; a pack without simply omits the key. Quest content is
//     validated INSIDE createQuestCore and throws at assembly on any problem
//     (fail-loud is that module's contract — invalid quests are a content
//     bug, not a degradable warning like an unspawnable table entry).
//   - economy-core and trade-core (F-d0b5edb5/F-6c3e4fde) are ALWAYS
//     included — the SAME always-included-but-possibly-empty contract
//     district-core itself has, not presence-optional like quests/
//     encounterSpawn. economy-core seeds a DistrictEconomy for every entry in
//     the SAME `districts` roster district-core receives (a pack with no
//     districts registers the namespace governing {}); trade-core needs no
//     REQUIRED config (it registers the `sell` verb unconditionally and the
//     `buy` verb keyed off the optional `tradeGenre` passthrough — see
//     trade-core.ts's own header). This is the write-wire that retroactively
//     activates code that was already built and waiting: director.ts's
//     MARKET OVERVIEW ledger + FACTIONS' economy-driven goal scoring,
//     endgame.ts's merchant-prince arc/collapse triggers, and the 4
//     economy-driven pressure kinds in pressure-system.ts.
//   - V3-GEN-1 (genre-mechanical fix, v3.0 wave 2): before this wave,
//     `tradeGenre`/`craftingGenre` were the only always-included modules'
//     genre passthroughs no starter actually supplied — createTradeCore()
//     was called with ZERO config and createCraftingCore's `genre` always
//     resolved undefined, so every shipped world's buy/craft/repair/modify
//     verbs resolved DEFAULT_BUYABLE_STOCK/UNIVERSAL_RECIPES only, regardless
//     of the pack's own genre. Each starter's setup.ts now passes its OWN
//     ruleset's bare genre id (the ruleset's `id` with any `-minimal` suffix
//     stripped) as both fields — NOT `manifest.genres`, a free-text
//     flavor-tag vocabulary that does not share GENRE_BUYABLE_STOCK's/
//     GENRE_RECIPES's keys (e.g. weird-west's genres are ['western'] but its
//     table key is 'weird-west'; gladiator's genres are ['historical'] and
//     it has no table key at all). A pack whose bare genre id has no
//     GENRE_BUYABLE_STOCK/GENRE_RECIPES entry correctly keeps resolving the
//     universal/default fallback — that is the honest, intended behavior,
//     not a residual bug to paper over with an invented remap.
//   - companion-core (F-7d5c3e28) joins the stack the same way, same
//     reasoning: ALWAYS included, needs no config (it registers the
//     `recruit` verb and the flat-PartyState namespace — see companion-core.ts's
//     own header). The write-wire for director.ts's PARTY ledger section,
//     endgame.ts's companion arc axis, finale's COMPANIONS block,
//     terminal-ui's ally coloring, menu.ts's support-ability targeting,
//     npc-agency's companion goals, and combat-core's interception +
//     INTERCEPT_ROLE_BONUS — all already built, all previously dark for lack
//     of a recruit verb.
//   - crafting-core (F-6631dd57) joins the same way, same reasoning: ALWAYS
//     included, no REQUIRED config (it registers 'salvage'/'craft'/'repair'/
//     'modify' — see crafting-recipes.ts's own module-header). No new
//     persistence namespace: material state already lives on actor.custom,
//     the address getMaterialInventory/adjustMaterial already read/write.
//     The optional `craftingGenre` passthrough below selects genre-flavored
//     recipes (crafting-recipes.ts's GENRE_RECIPES); omitting it still
//     resolves the full UNIVERSAL_RECIPES table (repair/craft/modify recipes
//     with no genreFilter) — every world gets working verbs with zero
//     config. The write-wire for director.ts's MATERIALS ledger section
//     (already reading getMaterialInventory) and the RECIPES section
//     alongside it (F-239d0813) — both previously dark for lack of a
//     salvage/craft verb ever writing real material state.

import type { EngineModule } from '@ai-rpg-engine/core';
import { createEnvironmentCore } from './environment-core.js';
import type { EnvironmentCoreConfig } from './environment-core.js';
import { createFactionCognition } from './faction-cognition.js';
import type { FactionMembership } from './faction-cognition.js';
import { createRumorPropagation } from './rumor-propagation.js';
import type { RumorPropagationConfig } from './rumor-propagation.js';
import { createDistrictCore } from './district-core.js';
import type { DistrictDefinition, DistrictDecayConfig } from './district-core.js';
import { createBeliefProvenance } from './belief-provenance.js';
import { createObserverPresentation } from './observer-presentation.js';
import type { PresentationRule } from './observer-presentation.js';
import { createDefeatFallout } from './defeat-fallout.js';
import type { DefeatFalloutConfig } from './defeat-fallout.js';
import { createWorldTick } from './world-tick.js';
import { createEncounterSpawn, validateEncounterSpawnContent } from './encounter-spawn.js';
import type { EncounterSpawnConfig } from './encounter-spawn.js';
import { createQuestCore } from './quest-core.js';
import type { QuestCoreConfig } from './quest-core.js';
import { createEconomyCore } from './economy-core.js';
import { createTradeCore } from './trade-core.js';
import { createCompanionCore } from './companion-core.js';
import { createCraftingCore } from './crafting-recipes.js';
import { createPlayerLeverageCore } from './player-leverage.js';
import { createOpportunityCore } from './opportunity-resolution.js';
import { createNpcAgency } from './npc-agency.js';

// ---------------------------------------------------------------------------
// buildWorldStack — eliminates the strategic-tier hand-list
// ---------------------------------------------------------------------------

export type WorldStackConfig = {
  /** Player entity ID (defeat-fallout attributes kills to it). Default: 'player'. */
  playerId?: string;

  /**
   * Faction rosters for this world. ONE list feeds BOTH faction-cognition
   * (which also reads each roster's `cohesion`) and defeat-fallout (which
   * reads membership only) — no more keeping two copies in sync by hand.
   */
  factions?: FactionMembership[];

  /** Environment config (hazards, rules, tickEffects). Omit for a world with no authored hazards. */
  environment?: EnvironmentCoreConfig;

  /** Rumor transport tuning (propagationDelay, distortionPerHop, …). Omit for module defaults. */
  rumors?: RumorPropagationConfig;

  /**
   * District definitions. Default: [] — district-core is still included
   * (defeat-fallout depends on it), it just governs no districts.
   */
  districts?: DistrictDefinition[];

  /** District metric decay overrides. */
  districtDecay?: Partial<DistrictDecayConfig>;

  /** World-specific observer presentation rules (the module's builtins are always included). */
  presentationRules?: PresentationRule[];

  /**
   * Defeat-fallout tuning overrides (reputationPerKill, bossTag, heat, …).
   * `factions` and `playerId` are supplied by the builder — pass the rest here.
   */
  defeatFallout?: Omit<DefeatFalloutConfig, 'factions' | 'playerId'>;

  /**
   * Encounter spawn content + tuning (gameId, encounters, entityTemplates,
   * zoneTables). Omit for packs without authored spawn tables — no
   * encounter-spawn module is included then.
   */
  encounterSpawn?: EncounterSpawnConfig;

  /**
   * Authored quests (gameId + QuestDefinitions). Omit for packs without
   * quest content — no quest-core module is included then. Invalid quest
   * content THROWS here at assembly (createQuestCore's fail-loud contract).
   */
  quests?: QuestCoreConfig;

  /**
   * Buyable-stock genre (trade-core.ts's GENRE_BUYABLE_STOCK key, e.g.
   * 'fantasy'). Omit for DEFAULT_BUYABLE_STOCK only — trade-core is included
   * either way (see the file-header contract entry above); this only
   * selects which genre-flavored stock joins the universal per-category
   * fallback the buy verb always offers. Same idiom, same GENRE_* table
   * shape, as `craftingGenre` immediately below — different module, same
   * bare genre id (this starter's ruleset id minus any `-minimal` suffix;
   * see the V3-GEN-1 file-header contract entry above for why NOT
   * `manifest.genres`).
   */
  tradeGenre?: string;

  /**
   * Crafting recipe genre (crafting-recipes.ts's GENRE_RECIPES key, e.g.
   * 'fantasy'). Omit for UNIVERSAL_RECIPES only — crafting-core is included
   * either way (see the file-header contract entry above); this only
   * selects which genre-flavored recipes join the universal table.
   */
  craftingGenre?: string;
};

export type WorldStack = {
  /** Strategic-tier engine modules in correct wiring order. Add these to Engine's modules array. */
  modules: EngineModule[];

  /**
   * Non-fatal author warnings (warn-and-degrade). Currently surfaces
   * encounter-spawn content problems from validateEncounterSpawnContent —
   * a zone table referencing an unauthored encounter, a boss-fight
   * composition in a random table, a participant with no template — which
   * the runtime candidate filter would otherwise drop without a trace.
   * Zone-existence checks need the zone list and stay with the pack's
   * content tests. Empty array when all input is valid.
   */
  warnings: string[];
};

/**
 * Build the complete strategic-tier module stack from a simple config.
 *
 * Encapsulates the world-simulation hand-list that every starter world
 * repeated after its combat modules:
 * ```
 * createEnvironmentCore({ hazards }),
 * createFactionCognition({ factions }),
 * createRumorPropagation({ propagationDelay }),
 * createDistrictCore({ districts }),
 * createBeliefProvenance(),
 * createObserverPresentation({ rules }),
 * createDefeatFallout({ factions, playerId }),   // same rosters, re-typed
 * createEncounterSpawn({ gameId, ...content }),
 * ```
 *
 * Default composition (always included, in wiring order): environment-core,
 * faction-cognition, rumor-propagation, district-core, economy-core,
 * trade-core, companion-core, npc-agency, player-leverage, crafting-core,
 * opportunity-core, belief-provenance, observer-presentation, defeat-fallout,
 * world-tick. Presence-optional: encounter-spawn (included when
 * `encounterSpawn` is passed), quests (included when `quests` is passed).
 *
 * Usage:
 * ```
 * const worldStack = buildWorldStack({
 *   playerId: 'drifter',
 *   factions: [{ factionId: 'townsfolk', entityIds: ['bartender', 'sheriff'], cohesion: 0.4 }],
 *   environment: { hazards: [dustStorm] },
 *   rumors: { propagationDelay: 2 },
 *   districts,
 *   presentationRules: [spiritPerception],
 *   encounterSpawn: { gameId: manifest.id, ...encounterSpawnContent },
 * });
 * // Then in Engine constructor, AFTER combat.modules and perception-filter:
 * modules: [...combat.modules, ..., ...worldStack.modules, ...]
 * ```
 *
 * Requires `cognition-core` and `perception-filter` registered before the
 * stack (see the file-header contract) — module registration fails loudly
 * with the missing dependency's name otherwise.
 */
export function buildWorldStack(config: WorldStackConfig = {}): WorldStack {
  const playerId = config.playerId ?? 'player';
  const factions = config.factions ?? [];
  const warnings: string[] = [];

  const modules: EngineModule[] = [
    createEnvironmentCore(config.environment),
    createFactionCognition({ factions }),
    createRumorPropagation(config.rumors),
    createDistrictCore({
      districts: config.districts ?? [],
      ...(config.districtDecay ? { decay: config.districtDecay } : {}),
    }),
    // F-d0b5edb5/F-6c3e4fde: always included, same district roster
    // district-core received — see the file-header contract entry above.
    createEconomyCore({ districts: config.districts ?? [] }),
    // V3-GEN-1: always included, no REQUIRED config — see the file-header
    // contract entry above. `tradeGenre` is optional passthrough (mirrors
    // `craftingGenre` below).
    createTradeCore({ genre: config.tradeGenre }),
    // F-7d5c3e28: always included, no config — see the file-header contract
    // entry above.
    createCompanionCore(),
    // F-v3-npc-agency (v3.0): named-NPC individual agency — the write-wire
    // for runNpcAgencyTick (npc-agency.ts), previously fully authored and
    // unit-tested with ZERO production callers. Always included, no config;
    // registers ONLY module identity (no verb, no eager namespace default —
    // see createNpcAgency's own header for why). Placed directly after
    // companion-core: a companion IS a named NPC, and this module is the
    // individual-actor layer companion-core's roles/morale sit inside.
    // world-tick.ts's per-round step is the production writer.
    createNpcAgency(),
    // F-677e94ad (v2.9): the player-leverage write-wire — bribe/intimidate/
    // petition/seed. Always included, no config; its companion-reaction
    // dispatch places it semantically next to companion-core. Registered
    // before crafting so the module order stays value-domain grouped.
    createPlayerLeverageCore(),
    // F-6631dd57: always included, no REQUIRED config — see the file-header
    // contract entry above. `craftingGenre` is optional passthrough.
    createCraftingCore({ genre: config.craftingGenre }),
    // F-ceed887f/F-f3f2a84c (v2.9): the opportunity resolution loop (accept →
    // complete/abandon → fallout). Always included, no config; the per-round
    // spawn/tick that feeds it lives in world-tick. Registered after crafting
    // and before belief-provenance, same 'always included' shape.
    createOpportunityCore(),
    createBeliefProvenance(),
    createObserverPresentation({ rules: config.presentationRules ?? [] }),
    // The one roster serves both: defeat-fallout reads factionId + entityIds
    // and ignores cohesion (its config type simply doesn't name it).
    createDefeatFallout({ factions, playerId, ...config.defeatFallout }),
    // The world-tick driver's module identity (P8-SP-003): runWorldTick stays
    // a per-round function call, but registering the module here puts its
    // persisted slice — the tree's most actively evolved state shape — into
    // the version-stamped set (meta.moduleVersions) and under the ENG-009
    // migration seam, and its factory namespace default baselines the
    // eventLog cursor correctly on legacy-save restores (P8-WL-006).
    createWorldTick(),
  ];

  if (config.encounterSpawn) {
    // Warn-and-degrade: unspawnable table entries are silently dropped by the
    // runtime candidate filter — surface them at assembly time instead.
    // (Zone-existence checks require the zone list, which packs pass to
    // validateEncounterSpawnContent in their own content tests.)
    for (const problem of validateEncounterSpawnContent(config.encounterSpawn)) {
      warnings.push(`encounterSpawn: ${problem}`);
    }
    modules.push(createEncounterSpawn(config.encounterSpawn));
  }

  if (config.quests) {
    // Fail-loud, not warn-and-degrade: createQuestCore validates the authored
    // quests (schema + runtime vocabulary) and THROWS on any problem — a
    // quest that could never offer or a reward that would silently vanish is
    // a content bug that must die at assembly (F-ENG005-quest-loop-min).
    modules.push(createQuestCore(config.quests));
  }

  return { modules, warnings };
}
