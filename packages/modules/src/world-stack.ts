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
//     config at all (it registers the `sell` verb and infers pricing purely
//     from the item id — see trade-core.ts's own header). This is the
//     write-wire that retroactively activates code that was already built and
//     waiting: director.ts's MARKET OVERVIEW ledger + FACTIONS' economy-driven
//     goal scoring, endgame.ts's merchant-prince arc/collapse triggers, and
//     the 4 economy-driven pressure kinds in pressure-system.ts.

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
 * trade-core, belief-provenance, observer-presentation, defeat-fallout,
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
    createTradeCore(),
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
