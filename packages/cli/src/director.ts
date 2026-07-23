// F-ENG005-director-observability — the Director's Ledger.
//
// The handbook (appendix C) documents thirty-one format*ForDirector exports
// across the strategic modules — pressures, leverage, factions, districts,
// economies, opportunities, rumors, arcs, companions, materials, equipment
// — and until this file none of them had a consumer. The ledger is the
// player-facing strategic-state screen that finally reads them: one
// plain-text report, in the CLI's existing visual voice, showing the
// campaign the way the director modules see it.
//
// Two rules keep the ledger honest:
//
//  1. A section renders ONLY when its module actually persisted state in this
//     world (world.modules / world.globals / the player's custom record). No
//     empty scaffolds, no invented data — a world where only heat and
//     pressures exist gets a short ledger with exactly those sections.
//  2. Every section runs under the same guarded-degrade pattern the debug
//     inspector report uses: a throwing formatter (or a malformed namespace)
//     collapses to ONE bounded, attributed line and every sibling section
//     still renders.
//
// F-efdb93d1/F-ec5c7354 (director-integration, wave 6): EQUIPMENT is wired.
// @ai-rpg-engine/equipment is now a real dependency (package.json +
// tsconfig.json references — the gap this file's header used to name as the
// blocker), and the section below reads the player's Loadout through the
// SAME formula-registry transport turns.ts already uses for the ability
// catalog. v2.9 wave 3 closed the remaining gap: all 10 starters now wire
// createEquipmentCore (previously only starter-gladiator did, with the other
// 9 gating off to "no catalog available") — rule 1 above still governs the
// section, it just no longer has a pack left to silently skip for that
// specific reason. The Chronicle: trailer still never renders, because
// recordItemEvent (item-chronicle.ts) has zero production callers anywhere
// in the engine — authored provenance (origin/faction/flags/lore) is real,
// kill/recognition counts are not, until something actually calls it.

import type { Engine, WorldState, ScalarValue } from '@ai-rpg-engine/core';
import {
  // pressures — read via world-tick's stable accessors (P8-SP-002/WL-003:
  // world.modules['world-tick'] is the single persisted pressure source of
  // truth; the old 'pressure-system' namespace had no production writer, so
  // these sections could never render in real play)
  getActivePressures,
  getResolvedPressures,
  formatPressureForDirector,
  formatFalloutForDirector,
  // leverage & heat
  getLeverageState,
  formatLeverageForDirector,
  // factions
  buildFactionProfile,
  formatFactionProfilesForDirector,
  type FactionActionResult,
  // districts
  getAllDistrictIds,
  getDistrictDefinition,
  formatAllDistrictsForDirector,
  // economy
  formatAllDistrictEconomiesForDirector,
  type DistrictEconomy,
  // opportunities
  formatOpportunityListForDirector,
  formatOpportunityFalloutForDirector,
  type OpportunityState,
  type OpportunityFallout,
  // rumors
  formatRumorForDirector,
  type PlayerRumor,
  // people (npc agency)
  formatNpcPeopleForDirector,
  type NpcProfile,
  type NpcActionResult,
  type NpcObligationLedger,
  // arcs + endgame trajectory
  formatArcForDirector,
  evaluateEndgame,
  formatEndgameForDirector,
  // companions
  formatPartyForDirector,
  createPartyState,
  computePartyCohesion,
  evaluateDepartureRisk,
  type PartyState,
  type CompanionState,
  // materials
  getMaterialInventory,
  formatMaterialsForDirector,
  // recipes (F-239d0813)
  getAvailableRecipes,
  formatAvailableRecipesForDirector,
  getDistrictForZone,
} from '@ai-rpg-engine/modules';
import {
  // equipment (F-ec5c7354) — read via the formula-registry transport, the
  // same per-engine pattern turns.ts's getAbilityCatalog uses
  getEntityLoadout,
  EQUIPMENT_CATALOG_FORMULA,
  getItemProvenance,
  formatProvenanceForDirector,
  type ItemCatalog,
  type ItemDefinition,
} from '@ai-rpg-engine/equipment';
import { buildEndgameInputs } from './endgame.js';
import { describeActionError } from './guard.js';

const LEDGER_RULE = '═'.repeat(60);

/** Narrow an unknown to an array of plain objects (endgame.ts's read idiom). */
function objectArray<T>(value: unknown): T[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is T => typeof v === 'object' && v !== null);
}

/** A module namespace read defensively — never throws, absent → undefined. */
function namespace<T extends object>(world: WorldState, key: string): Partial<T> | undefined {
  const ns = world.modules[key];
  return ns && typeof ns === 'object' ? (ns as Partial<T>) : undefined;
}

/**
 * District economies as economy-core's wiring persists them
 * (`districts`: districtId → DistrictEconomy — endgame.ts reads the same key).
 */
function readDistrictEconomies(world: WorldState): Map<string, DistrictEconomy> {
  const districts = namespace<{ districts: unknown }>(world, 'economy-core')?.districts;
  const economies = new Map<string, DistrictEconomy>();
  if (districts && typeof districts === 'object') {
    for (const [districtId, econ] of Object.entries(districts as Record<string, unknown>)) {
      if (econ && typeof econ === 'object') economies.set(districtId, econ as DistrictEconomy);
    }
  }
  return economies;
}

/**
 * The pack's construction-frozen equipment catalog via the formula-registry
 * transport (equipment-core's EQUIPMENT_CATALOG_FORMULA) — the identical
 * per-engine pattern turns.ts's getAbilityCatalog uses for
 * ABILITY_CATALOG_FORMULA. Empty when the pack never wired
 * @ai-rpg-engine/equipment's createEquipmentCore module — as of v2.9 wave 3
 * all 10 starters register the formula (previously only starter-gladiator
 * did), so this degrades to [] only for a future/external pack that skips
 * equipment-core entirely. Callers never need to know which situation
 * they're in: an absent formula and an empty/malformed published catalog
 * both degrade to [].
 */
function readEquipmentCatalog(engine: Pick<Engine, 'formulas'>): ItemDefinition[] {
  if (!engine.formulas.has(EQUIPMENT_CATALOG_FORMULA)) return [];
  const catalog = engine.formulas.get(EQUIPMENT_CATALOG_FORMULA)() as ItemCatalog | undefined;
  return catalog && Array.isArray(catalog.items) ? catalog.items : [];
}

/**
 * Non-attaching read of this round's persisted NPC profiles
 * (world.modules['npc-agency'].profiles) — mirrors npc-agency.ts's own
 * getPersistedNpcProfiles exactly (same namespace, same filter, same
 * degrade-to-[] contract). Reimplemented locally (F-V3R-PARTY-1, Phase-9
 * party-departure remediation) rather than imported: that function is not
 * part of @ai-rpg-engine/modules' public export surface
 * (packages/modules/src/index.ts), and this remediation's file scope is
 * director*.ts only — index.ts belongs to a different domain/worktree. Feeds
 * PARTY below; PEOPLE (above) keeps its own pre-existing inline read of the
 * same namespace unchanged.
 */
function readPersistedNpcProfiles(world: WorldState): NpcProfile[] {
  return objectArray<NpcProfile>(namespace<{ profiles: unknown }>(world, 'npc-agency')?.profiles);
}

/**
 * One ledger section: `body` returns the complete section text, or null when
 * the section's module has no state in this world (the section is skipped
 * silently — absence of state is not an error). A THROW anywhere in the body
 * degrades to one bounded line under the section's name.
 */
type LedgerSection = {
  name: string;
  body: () => string | null;
};

/** Sub-header in the inspector report's idiom, for formatters without their own banner. */
function sectionHeader(title: string): string {
  return `  ── ${title} ──`;
}

/**
 * Render the Director's Ledger: the strategic picture of THIS world, assembled
 * from the director-mode formatters whose underlying module state exists.
 *
 * Reads a structuredClone of the world: several module readers
 * (getFactionCognition, getDistrictState's synthesize-and-attach cousins)
 * write default namespaces on first read, and the ledger is an inspection
 * surface — a save taken after rendering must be byte-identical to one taken
 * before (buildHudWorld's promise, extended here).
 */
export function renderDirectorLedger(engine: Pick<Engine, 'world' | 'formulas'>): string {
  const world = structuredClone(engine.world) as WorldState;

  const player = world.entities[world.playerId];
  const custom: Record<string, ScalarValue> = player?.custom ?? {};

  // Shared strategic reads. Pressures come from world-tick's accessors —
  // non-attaching (this is a structuredClone'd display world; the ledger's
  // byte-identical-save promise depends on reads that never synthesize) and
  // defensive (absent/malformed namespaces degrade to []). The fallout ledger
  // is the tick's bounded resolvedPressures — real state since P8-WL-003, so
  // the PRESSURE FALLOUT section below can finally render.
  const activePressures = getActivePressures(world);
  const resolvedPressures = getResolvedPressures(world);

  const sections: LedgerSection[] = [
    // -- Pressures first: what the world is about to do to you. ------------
    {
      name: 'ACTIVE PRESSURES',
      body: () => {
        if (activePressures.length === 0) return null;
        const parts = [sectionHeader(`ACTIVE PRESSURES (${activePressures.length})`)];
        for (const pressure of activePressures) {
          parts.push('');
          parts.push(formatPressureForDirector(pressure));
        }
        return parts.join('\n');
      },
    },
    {
      name: 'PRESSURE FALLOUT',
      body: () => {
        if (resolvedPressures.length === 0) return null;
        const parts = [sectionHeader(`PRESSURE FALLOUT (${resolvedPressures.length})`)];
        for (const fallout of resolvedPressures) {
          parts.push('');
          parts.push(formatFalloutForDirector(fallout));
        }
        return parts.join('\n');
      },
    },
    {
      name: 'PLAYER LEVERAGE',
      body: () => {
        // Leverage lives at two addresses: player-leverage's own
        // `leverage.*` keys on the player's custom record, and the heat that
        // defeat-fallout accrues at world.globals['player_heat'] (the only
        // axis with a live writer today — endgame.ts reads the same key).
        const hasLeverageKeys = Object.keys(custom).some(
          (k) => k.startsWith('leverage.') && typeof custom[k] === 'number',
        );
        const heatRaw = world.globals['player_heat'];
        const hasHeatGlobal = typeof heatRaw === 'number';
        if (!hasLeverageKeys && !hasHeatGlobal) return null;

        let state = getLeverageState(custom);
        // The module's own key wins when both exist; the global fills in when
        // the leverage wiring never wrote heat.
        if (hasHeatGlobal && typeof custom['leverage.heat'] !== 'number') {
          state = { ...state, heat: heatRaw };
        }
        return formatLeverageForDirector(state);
      },
    },
    // -- Factions: who is moving against (or for) you. ---------------------
    {
      name: 'FACTIONS',
      body: () => {
        const factionIds = Object.keys(world.factions ?? {}).sort();
        if (factionIds.length === 0) return null;
        const lastActions = objectArray<FactionActionResult>(
          namespace<{ lastActions: unknown }>(world, 'faction-agency')?.lastActions,
        );
        const economies = readDistrictEconomies(world);
        const profiles = factionIds.map((factionId) =>
          buildFactionProfile(
            factionId,
            world,
            world.factions[factionId]?.reputation ?? 0,
            activePressures,
            economies,
          ),
        );
        return formatFactionProfilesForDirector(profiles, lastActions);
      },
    },
    // -- Districts & economy: the ground the campaign is fought over. ------
    {
      name: 'DISTRICTS',
      body: () =>
        getAllDistrictIds(world).length === 0 ? null : formatAllDistrictsForDirector(world),
    },
    {
      name: 'MARKET OVERVIEW',
      body: () => {
        const economies = readDistrictEconomies(world);
        if (economies.size === 0) return null;
        const entries = [...economies.entries()]
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([districtId, economy]) => ({
            districtId,
            districtName: getDistrictDefinition(world, districtId)?.name ?? districtId,
            economy,
          }));
        return formatAllDistrictEconomiesForDirector(entries);
      },
    },
    // -- Opportunities: what the world is offering. -------------------------
    {
      name: 'OPPORTUNITIES',
      body: () => {
        const oppNs = namespace<{
          opportunities: unknown;
          activeOpportunities: unknown;
        }>(world, 'opportunity-core');
        const opportunities = objectArray<OpportunityState>(
          oppNs?.opportunities ?? oppNs?.activeOpportunities,
        );
        if (opportunities.length === 0) return null;
        return formatOpportunityListForDirector(opportunities);
      },
    },
    {
      name: 'OPPORTUNITY FALLOUT',
      body: () => {
        const resolved = objectArray<OpportunityFallout>(
          namespace<{ resolvedOpportunities: unknown }>(world, 'opportunity-core')
            ?.resolvedOpportunities,
        );
        if (resolved.length === 0) return null;
        const parts = [sectionHeader(`OPPORTUNITY FALLOUT (${resolved.length})`)];
        for (const fallout of resolved) {
          parts.push('');
          parts.push(formatOpportunityFalloutForDirector(fallout));
        }
        return parts.join('\n');
      },
    },
    {
      name: 'RUMORS ABOUT YOU',
      body: () => {
        const rumors = objectArray<PlayerRumor>(
          namespace<{ rumors: unknown }>(world, 'player-rumor')?.rumors,
        );
        if (rumors.length === 0) return null;
        const parts = [sectionHeader(`RUMORS ABOUT YOU (${rumors.length})`)];
        for (const rumor of rumors) {
          parts.push('');
          parts.push(formatRumorForDirector(rumor));
        }
        return parts.join('\n');
      },
    },
    {
      name: 'PEOPLE',
      body: () => {
        // v3.0 (F-v3-npc-agency): world-tick.ts's own per-round step is now
        // the production writer for this namespace — a world with at least
        // one named NPC gets real profiles/lastActions/obligationLedgers
        // here every round; a world with none (SEED-0) leaves the namespace
        // absent, same as before this wave, and this section stays dark.
        const npcNs = namespace<{ profiles: unknown; lastActions: unknown; obligationLedgers: unknown }>(
          world,
          'npc-agency',
        );
        const profiles = objectArray<NpcProfile>(npcNs?.profiles);
        if (profiles.length === 0) return null;
        const lastActions = objectArray<NpcActionResult>(npcNs?.lastActions);
        const npcObligations = new Map<string, NpcObligationLedger>();
        if (npcNs?.obligationLedgers && typeof npcNs.obligationLedgers === 'object') {
          for (const [npcId, ledger] of Object.entries(npcNs.obligationLedgers as Record<string, unknown>)) {
            if (ledger && typeof ledger === 'object') npcObligations.set(npcId, ledger as NpcObligationLedger);
          }
        }
        return formatNpcPeopleForDirector(profiles, lastActions, npcObligations);
      },
    },
    // -- Arcs & trajectory: where this campaign is heading. -----------------
    {
      name: 'NARRATIVE ARCS',
      body: () => {
        // The same live-state assembly the finale uses (buildEndgameInputs) —
        // the ledger and the endgame evaluator can never disagree about arcs.
        // Gated on the module's OWN dominance bar (0.5): the scorers emit
        // floor-level signals from neutral baselines ("clean reputation",
        // "0 companions") even in a world with zero strategic state, and the
        // ledger must never dress baseline noise up as a story. An arc is
        // worth reporting once one is dominant.
        const snapshot = buildEndgameInputs(world).arcSnapshot;
        if (!snapshot.dominantArc) return null;
        return `${sectionHeader('NARRATIVE ARCS')}\n${formatArcForDirector(snapshot)}`;
      },
    },
    {
      name: 'ENDGAME TRAJECTORY',
      body: () => {
        const trigger = evaluateEndgame(buildEndgameInputs(world));
        if (!trigger) return null;
        return `${sectionHeader('ENDGAME TRAJECTORY')}\n${formatEndgameForDirector(trigger)}`;
      },
    },
    // -- Companions & holdings last: what you carry with you. ---------------
    {
      name: 'PARTY',
      body: () => {
        // F-834d0485: companion-core persists world.modules['companion-core']
        // flat — PartyState's own { companions, maxSize, cohesion } fields at
        // the namespace TOP, no `party:` wrapper (the shape director.test.ts
        // and endgame.test.ts already construct and assert against). The
        // speculative `party:`-wrapper branch this used to check FIRST was
        // dead code for a shape nothing ever produced — removed rather than
        // carried forward. maxSize/cohesion fall back to createPartyState()'s
        // defaults only when genuinely absent (a pre-wiring save); a live
        // companion-core namespace always carries both.
        const compNs = namespace<PartyState>(world, 'companion-core');
        const companions = objectArray<CompanionState>(compNs?.companions);
        if (companions.length === 0) return null;
        const party: PartyState = {
          companions,
          maxSize: typeof compNs?.maxSize === 'number' ? compNs.maxSize : createPartyState().maxSize,
          cohesion: typeof compNs?.cohesion === 'number' ? compNs.cohesion : computePartyCohesion({ ...createPartyState(), companions }),
        };
        // F-V3R-PARTY-1 (Phase-9 party-departure remediation): npc-agency now
        // persists real per-round profiles (world-tick.ts's step 5a, v3.0
        // F-v3-npc-agency) — the hardcoded [] this used to pass here was the
        // bug: the Breakpoint field always read 'unknown' and goals never
        // rendered, even in a session where npc-agency HAD already profiled
        // this exact companion (PEOPLE, above, was proof the state existed —
        // PARTY just never looked). Real breakpoints also now flow into
        // evaluateDepartureRisk, so its 'high' band (previously unreachable
        // from this section, since the second argument was always omitted)
        // can finally show.
        const npcProfiles = readPersistedNpcProfiles(world);
        const departureRisks: Record<string, { risk: string; reason?: string }> = {};
        for (const companion of companions) {
          const breakpoint = npcProfiles.find((p) => p.npcId === companion.npcId)?.breakpoint;
          const assessment = evaluateDepartureRisk(companion, breakpoint);
          if (assessment.risk !== 'none') departureRisks[companion.npcId] = assessment;
        }
        return formatPartyForDirector(party, npcProfiles, departureRisks);
      },
    },
    {
      name: 'EQUIPMENT',
      body: () => {
        // F-ec5c7354: the section this file's own header used to name as
        // designed-but-absent. Reads the player's persisted Loadout
        // (equipment-core's namespace) and resolves each equipped/carried
        // item's ItemDefinition through the formula-registry transport.
        const catalog = readEquipmentCatalog(engine);
        if (catalog.length === 0) return null; // pack never wired equipment-core
        const loadout = getEntityLoadout(world, world.playerId);
        if (!loadout) return null; // wired, but this entity has never equipped

        const itemIds = [
          ...new Set([
            ...Object.values(loadout.equipped).filter((id): id is string => id !== null),
            ...loadout.inventory,
          ]),
        ].sort();

        const entries: string[] = [];
        for (const itemId of itemIds) {
          const item = catalog.find((i) => i.id === itemId);
          // Gate per-item, not per-loadout: an entity can carry ordinary
          // gear alongside provenance-bearing relics, and only the latter
          // earns a line — mirrors MATERIALS' "is there anything real to
          // show" gate style.
          if (!item || !getItemProvenance(item)) continue;
          // No chronicle argument: recordItemEvent (item-chronicle.ts) has
          // zero production callers anywhere in the engine, so passing one
          // here would always be an invented []. formatProvenanceForDirector
          // already treats an omitted chronicle as "no Chronicle: line" —
          // the honest ceiling until something actually calls it.
          entries.push(formatProvenanceForDirector(item));
        }
        if (entries.length === 0) return null;

        const parts = [sectionHeader(`EQUIPMENT (${entries.length})`)];
        for (const entry of entries) {
          parts.push('');
          parts.push(entry);
        }
        return parts.join('\n');
      },
    },
    {
      name: 'MATERIALS',
      body: () => {
        const inventory = getMaterialInventory(custom);
        if (!Object.values(inventory).some((quantity) => quantity > 0)) return null;
        return formatMaterialsForDirector(inventory);
      },
    },
    {
      name: 'RECIPES',
      body: () => {
        // F-239d0813: recipes (crafting-recipes.ts's UNIVERSAL_RECIPES ∪
        // GENRE_RECIPES) are static content, not persisted state — crafting-
        // core's write-wire (F-6631dd57) registers no namespace of its own to
        // gate on. Rule 1's "does real state back this section" reduces to
        // the SAME signal MATERIALS renders on: a world where the player has
        // never salvaged/crafted gets no invented recipe wishlist alongside
        // an empty materials pouch.
        const inventory = getMaterialInventory(custom);
        if (!Object.values(inventory).some((quantity) => quantity > 0)) return null;

        // Ceiling closed (v3.0 wave 2, V3-DIR-1): world.meta.activeRuleset
        // carries a per-starter ruleset id ('fantasy-minimal'), not the bare
        // 'fantasy' GENRE_RECIPES key — every starter's ruleset id follows
        // the literal '<genre>-minimal' pattern (ruleset.ts across all ten
        // starters), including hyphenated genres ('weird-west-minimal'), so
        // stripping the trailing '-minimal' suffix (not splitting on the
        // first '-') recovers the exact key without mangling a multi-word
        // genre. getAvailableRecipes still degrades an unrecognized genre to
        // its UNIVERSAL_RECIPES table only (untouched contract, still exact
        // for gladiator/ronin — neither has a GENRE_RECIPES entry) — this
        // only fixes resolution for the packs that DO have one. Sibling
        // wave-2 domains apply the identical strip to the mechanical
        // resolution (crafting-recipes.ts's write-wire) and the menu's own
        // buildCraftActions; this is the display-only fix for this file.
        const genre = world.meta.activeRuleset.replace(/-minimal$/, '');
        const hereId = player?.zoneId ?? world.locationId;
        const districtId = hereId ? getDistrictForZone(world, hereId) : undefined;
        const districtTags = districtId ? getDistrictDefinition(world, districtId)?.tags ?? [] : [];
        const recipes = getAvailableRecipes(genre, player?.tags ?? [], districtTags);
        if (recipes.length === 0) return null;
        return formatAvailableRecipesForDirector(recipes, inventory);
      },
    },
  ];

  const lines: string[] = [];
  lines.push(`  ${LEDGER_RULE}`);
  lines.push("  THE DIRECTOR'S LEDGER");
  lines.push(`  ${LEDGER_RULE}`);
  const hereId = player?.zoneId ?? world.locationId;
  lines.push(`  Turn ${world.meta.tick} — ${world.zones[hereId]?.name ?? hereId}`);

  let rendered = 0;
  for (const section of sections) {
    let text: string | null;
    try {
      text = section.body();
    } catch (err) {
      // Same degrade contract as the debug inspector report: one bounded,
      // attributed line — a malformed namespace can never hide its siblings.
      text = `${sectionHeader(section.name)}\n  [section failed: ${describeActionError(err)}]`;
    }
    if (text === null) continue;
    rendered += 1;
    lines.push('');
    lines.push(text);
  }

  if (rendered === 0) {
    lines.push('');
    lines.push('  Nothing on the books yet — no strategic system carries state');
    lines.push('  in this world. Play on; the ledger fills itself.');
  }

  return lines.join('\n');
}
