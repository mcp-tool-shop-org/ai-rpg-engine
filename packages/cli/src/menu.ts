// F1d — abilities & XP reachable from the numbered menu.
//
// The engine's `use-ability` verb needs `parameters.abilityId`, which no menu
// or parser ever produced — abilities were unreachable in the shipped loop.
// Likewise XP: progression-core accrues it on kills and registers an `unlock`
// verb, but the CLI never showed a balance or offered a spend.
//
// This module extends the numbered action menu: terminal-ui's buildActionList
// stays the source of truth for entries 1..N; this module appends entries
// N+1..N+M (ready abilities with resolved targets, then affordable
// progression unlocks) that renderFrame threads into renderFullScreen's
// `extraActions` option (P8-PS-005: rendered INSIDE the frame, sharing the
// base list's number width, above the screen-closing rule) and that
// handlePlayerInput resolves via parseExtraSelection before the free-text
// fallback.
//
// F-ENG006 adds a last, env-gated entry (AI_RPG_DEBUG=1): a debug view that
// renders every inspector the engine's modules registered (Engine.getInspectors
// previously had zero consumers). See buildDebugActions / renderInspectorReport.
//
// F-ENG005 adds the Director's Ledger entry — ALWAYS visible, because it is a
// player surface, not an operator one: the strategic-state screen that consumes
// the director-mode formatters (renderDirectorLedger in director.ts). Same
// sentinel-verb contract as debug: the wiring routes on `group: 'director'`
// and never submits the verb to the engine — reading the ledger costs no turn.
//
// F-ENG005-quest-loop-min adds the Journal entry — ALWAYS visible, the
// player's own book: active quests with stage progress, then the completed
// list (renderJournal below, reading core's world.quests + quest-core's
// registered definitions). Same sentinel-verb contract: the wiring routes on
// `group: 'journal'` and never submits the verb — reading the journal costs
// no turn. Menu order is personal → strategic → operator: journal, director,
// then the env-gated debug entry last.
//
// v3.0 wave-2 "menu-surface" (V3-MENU-1..3) closes three gaps left open by
// the v2.9 menu-integration wave:
//   (1) buildBuyActions/buildCraftActions computed genre straight off
//       world.meta.activeRuleset ('fantasy-minimal'), which never matched the
//       bare GENRE_BUYABLE_STOCK/GENRE_RECIPES keys ('fantasy') — every world
//       silently rendered the universal fallback. normalizeGenre (below)
//       strips the fixed '-minimal' suffix at every genre-lookup call site in
//       this file (buy/craft/repair/modify) so genre-tabled stock/recipes
//       actually display. A sibling wave-2 domain wires the matching
//       MECHANICAL fix in world-stack (threading the same bare genre into
//       trade-core/crafting-core's own config, which today receives none
//       from any starter) — see normalizeGenre's own doc comment for the
//       honest ceiling this display-only fix does not close alone.
//   (2) buildCraftActions was deliberately craft-only (its own doc comment:
//       repair/modify need a SECOND selection — a specific carried item
//       alongside the recipe id — the flat entry shape didn't yet model).
//       buildRepairActions/buildModifyActions add that item×recipe pairing.
//   (3) buildLeverageActions surfaced only the 4 originally-wired verbs
//       (bribe/intimidate/petition/seed); wave-1 "social-verbs" registered 21
//       more across the social/rumor groups plus two brand-new groups
//       (diplomacy/sabotage). buildLeverageActions now surfaces a curated,
//       individually-gated subset of those (afford + cooldown + minimum
//       reputation where authored) — see its own doc comment for the two
//       sub-actions (deny/bury-scandal) deliberately deferred.

import type { Engine, WorldState, EntityState, ScalarValue, QuestState } from '@ai-rpg-engine/core';
import type { AbilityDefinition, ProgressionTreeDefinition, QuestDefinition, QuestStage } from '@ai-rpg-engine/content-schema';
import type {
  SupplyCategory,
  PlayerSocialVerb,
  PlayerRumorVerb,
  PlayerDiplomacyVerb,
  PlayerSabotageVerb,
} from '@ai-rpg-engine/modules';
import {
  getAvailableAbilities,
  normalizeAbilityTarget,
  matchesAffiliation,
  getCurrency,
  canUnlock,
  getQuestDefinitions,
  questProgressCount,
  questProgressRequired,
  getDistrictForZone,
  getDistrictEconomy,
  isBlackMarketCondition,
  inferSupplyCategory,
  getBuyableStock,
  quoteBuyPrice,
  SELL_CURRENCY,
  getAvailableRecipes,
  canCraft,
  getMaterialInventory,
  getLeverageState,
  canAfford,
  isCooldownReady,
  getSocialRequirements,
  getRumorRequirements,
  getDiplomacyRequirements,
  getSabotageRequirements,
  getPersistedOpportunities,
  getDistrictDefinition,
} from '@ai-rpg-engine/modules';
import { getAbilityCatalog } from './turns.js';
import { describeActionError } from './guard.js';

/** One appended menu entry — shaped like terminal-ui's ActionOption plus a group label. */
export type ExtraAction = {
  verb: string;
  targetIds?: string[];
  parameters?: Record<string, ScalarValue>;
  label: string;
  group:
    | 'ability'
    | 'advance'
    | 'trade'
    | 'journal'
    | 'director'
    | 'debug'
    | 'crafting'
    | 'leverage'
    | 'opportunities';
};

/**
 * Menu-offer gate on top of the engine's affiliation check. The engine's
 * type-heuristic classifies EVERY differently-typed entity as an enemy, so a
 * bare offensive ability would list the friendly quest NPC as a smite target
 * (live-caught: "Holy Smite → Suspicious Pilgrim"). The MENU follows the
 * scene list's explicit-hostility convention instead: offensive entries are
 * offered only against `enemy`/`hostile`-tagged targets, support entries only
 * for self/`ally`/`companion`. Freeform text keeps full engine freedom — the
 * menu just never ADVERTISES friendly fire.
 */
function menuTargetable(
  world: WorldState,
  candidate: EntityState,
  affiliation: string,
): boolean {
  if (candidate.id === world.playerId) return true; // includeSelf already vetted
  if (affiliation === 'enemy') {
    return candidate.tags.includes('enemy') || candidate.tags.includes('hostile');
  }
  if (affiliation === 'ally') {
    return candidate.tags.includes('ally') || candidate.tags.includes('companion');
  }
  return true; // 'any' — the ability explicitly targets everyone
}

/**
 * Ability entries for every ability the player can use RIGHT NOW
 * (ability-core's own readiness check: cooldown, costs, tag requirements).
 * Single-target abilities expand to one entry per valid target in the
 * player's zone, using the same normalize/matchesAffiliation rules the
 * ability handler enforces — so every listed entry is submittable, never a
 * "menu offered it, engine rejected it" trap.
 */
export function buildAbilityActions(
  world: WorldState,
  catalog: AbilityDefinition[],
): ExtraAction[] {
  const player = world.entities[world.playerId];
  if (!player || catalog.length === 0) return [];

  const ready = getAvailableAbilities(world, world.playerId, catalog);
  const actions: ExtraAction[] = [];

  for (const ability of ready) {
    if (ability.target.type === 'single') {
      const norm = normalizeAbilityTarget(ability);
      const candidates = Object.values(world.entities)
        .filter(
          (e) =>
            (e.resources.hp ?? 0) > 0 &&
            (e.zoneId ?? world.locationId) === (player.zoneId ?? world.locationId) &&
            matchesAffiliation(player, e, norm.affiliation, norm.includeSelf) &&
            menuTargetable(world, e, norm.affiliation),
        )
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      for (const target of candidates) {
        actions.push({
          verb: ability.verb,
          targetIds: [target.id],
          parameters: { abilityId: ability.id },
          label: `${ability.name} → ${target.id === world.playerId ? 'yourself' : target.name}`,
          group: 'ability',
        });
      }
    } else {
      actions.push({
        verb: ability.verb,
        parameters: { abilityId: ability.id },
        label: ability.name,
        group: 'ability',
      });
    }
  }

  return actions;
}

/**
 * Unlock entries for every progression node the player can afford right now
 * (progression-core's own canUnlock: prerequisites + currency). Selecting one
 * submits the engine's `unlock` verb with the treeId/nodeId it requires.
 */
export function buildUnlockActions(
  world: WorldState,
  trees: ProgressionTreeDefinition[],
): ExtraAction[] {
  if (trees.length === 0) return [];
  const treeMap = new Map(trees.map((t) => [t.id, t]));
  const actions: ExtraAction[] = [];

  for (const tree of trees) {
    for (const node of tree.nodes) {
      const check = canUnlock(world, world.playerId, tree.id, node.id, treeMap);
      if (!check.can) continue;
      actions.push({
        verb: 'unlock',
        parameters: { treeId: tree.id, nodeId: node.id },
        label: `Unlock ${node.name} (${node.cost} ${tree.currency})`,
        group: 'advance',
      });
    }
  }

  return actions;
}

// ---------------------------------------------------------------------------
// Trade — the buy + sell entries (F-31f15013 buy, F-6c3e4fde sell)
// ---------------------------------------------------------------------------

/**
 * Every SupplyCategory the buy menu checks, as an explicit literal tuple
 * (trade-core.ts's own ALL_SUPPLY_CATEGORIES is derived from its private
 * CATEGORY_HINTS and isn't exported) — if a future SupplyCategory addition
 * drifts this list out of sync with economy-core.ts's union, TypeScript fails
 * the assignment below, not a silent "some categories never checked" bug.
 */
const BUY_CATEGORIES: SupplyCategory[] = [
  'medicine', 'weapons', 'ammunition', 'food', 'fuel', 'luxuries', 'components', 'contraband',
];

/**
 * Normalize `world.meta.activeRuleset` (a per-starter ruleset id, e.g.
 * 'fantasy-minimal') to the bare genre key GENRE_BUYABLE_STOCK/GENRE_RECIPES
 * actually index by (e.g. 'fantasy') — v3.0 wave-2 menu-surface fix
 * (V3-MENU-1). Every shipped starter's ruleset is exactly `<genre>-minimal`
 * (see each starter's own content.ts/ruleset.ts — fantasy/cyberpunk/pirate/
 * zombie/detective/colony/weird-west/gladiator/ronin/vampire all follow
 * this), so stripping the fixed suffix recovers the genre losslessly. A
 * ruleset that ISN'T of that shape (a test fixture's 'test'/'minimal'/
 * 'none'/'proof'/etc.) simply doesn't end in '-minimal' and passes through
 * unchanged — it was never going to match a genre table key either way, so
 * this is a no-op for those, not a new failure mode.
 *
 * This is the DISPLAY half of a two-sided fix: a sibling wave-2 domain wires
 * this SAME bare genre into world-stack's createTradeCore/createCraftingCore
 * config (today neither actually receives one from any starter — see this
 * function's call sites for the honest ceiling that remains) so the menu's
 * preview and the verb handler's own resolution agree once both land.
 */
export function normalizeGenre(ruleset: string): string {
  return ruleset.replace(/-minimal$/, '');
}

/**
 * Buy entries for every item this district currently offers (getBuyableStock,
 * per SupplyCategory) that the player can ALSO currently afford — the
 * "guaranteed to succeed" discipline this file's sell entries already follow:
 * an item below-floor or absent from BuyableStock is never listed (mirrors
 * buyHandler's own "not for sale here" rejection), and an item the player
 * cannot afford is never listed either (mirrors buyHandler's own "not enough
 * coin" rejection) — both checked with trade-core's OWN quoteBuyPrice, the
 * exact price buyHandler itself debits (single-sourced, no second pricing
 * copy to drift). [] when the player's zone has no district/economy at all.
 *
 * DISPLAY fix (v3.0 wave-2 menu-surface, V3-MENU-1): genre here is
 * world.meta.activeRuleset — a per-starter ruleset id (e.g.
 * 'fantasy-minimal'), NOT the bare GENRE_BUYABLE_STOCK key ('fantasy') — the
 * two strings never matched, so this menu always rendered the universal
 * DEFAULT_BUYABLE_STOCK fallback regardless of activeRuleset. normalizeGenre
 * strips the fixed '-minimal' suffix before this lookup so a genre-tabled
 * starter's own flavored stock actually displays.
 *
 * Honest ceiling that REMAINS (a separate, deeper gap this display fix alone
 * does not close): buildWorldStack still calls createTradeCore() with no
 * genre config at all — no starter threads one through today — so the
 * REGISTERED 'buy' verb handler itself still resolves against no genre
 * regardless of what this preview now computes. A sibling wave-2 domain
 * wires that mechanical side (the same bare-genre derivation, threaded into
 * trade-core's own config via each starter's setup); once both land, this
 * display and the handler's own resolution agree on the same genre-flavored
 * stock. Until then, a genre-flavored item this function now previews for a
 * genre-tabled starter is priced/offered correctly HERE but could still be
 * rejected as "not for sale here" if actually submitted — the identical
 * cross-domain gap buildCraftActions/buildRepairActions/buildModifyActions
 * document for themselves below.
 */
export function buildBuyActions(world: WorldState): ExtraAction[] {
  const player = world.entities[world.playerId];
  if (!player) return [];

  const zoneId = player.zoneId ?? world.locationId;
  const districtId = zoneId ? getDistrictForZone(world, zoneId) : undefined;
  const districtEconomy = districtId ? getDistrictEconomy(world, districtId) : undefined;
  if (!districtId || !districtEconomy) return [];

  const genre = normalizeGenre(world.meta.activeRuleset);
  const coin = player.resources[SELL_CURRENCY] ?? 0;

  const actions: ExtraAction[] = [];
  for (const category of BUY_CATEGORIES) {
    for (const itemId of getBuyableStock(districtEconomy, category, genre)) {
      const price = quoteBuyPrice(world, itemId, genre);
      if (price === undefined || coin < price) continue; // unpriceable or unaffordable — never offered
      actions.push({
        verb: 'buy',
        targetIds: [itemId],
        label: `Buy ${itemId.replace(/-/g, ' ')} (${price} coin)`,
        group: 'trade',
      });
    }
  }
  return actions;
}

/**
 * Sell entries for every DISTINCT item id the player carries, grouped with a
 * count (F-13255438) — one entry per item id rather than one per inventory
 * SLOT, so a player carrying five healing draughts sees one "Sell healing
 * draught (x5)" line instead of five identical entries. The handler is
 * unchanged: selecting the grouped entry still sells exactly ONE unit
 * (targetIds stays a single-item array — sellHandler's own splice removes
 * one matching item per call), so re-selecting the same entry sells the next
 * unit, and the count naturally decreases as the menu rebuilds each turn.
 *
 * [] when the player's current zone has no district/economy to sell into
 * (mirrors the `sell` verb's own "no market here" rejection reason, so no
 * menu entry is ever offered that the verb could not also produce on its
 * own).
 *
 * A carried item whose inferred category is contraband with no active black
 * market is also skipped — the same "only ever list what's guaranteed to
 * succeed" discipline buildAbilityActions/buildUnlockActions already apply
 * (the ability/unlock precedent for P8-PS-002's root cause), here at
 * menu-build time instead of via the extras dispatch's post-hoc rejection
 * scan (which — unlike the base numbered menu — has none).
 */
export function buildSellActions(world: WorldState): ExtraAction[] {
  const player = world.entities[world.playerId];
  if (!player) return [];

  const zoneId = player.zoneId ?? world.locationId;
  const districtId = zoneId ? getDistrictForZone(world, zoneId) : undefined;
  const districtEconomy = districtId ? getDistrictEconomy(world, districtId) : undefined;
  if (!districtId || !districtEconomy) return [];

  const inventory = player.inventory ?? [];
  const counts = new Map<string, number>();
  for (const itemId of inventory) {
    counts.set(itemId, (counts.get(itemId) ?? 0) + 1);
  }

  const actions: ExtraAction[] = [];
  for (const [itemId, count] of counts) {
    const category = inferSupplyCategory(itemId);
    if (category === 'contraband' && !isBlackMarketCondition(districtEconomy)) continue;
    actions.push({
      verb: 'sell',
      targetIds: [itemId],
      label: `Sell ${itemId.replace(/-/g, ' ')}${count > 1 ? ` (x${count})` : ''}`,
      group: 'trade',
    });
  }
  return actions;
}

// ---------------------------------------------------------------------------
// Crafting — salvage + craft entries (F-6631dd57 write-wire, menu-integration wave)
// ---------------------------------------------------------------------------

/**
 * Salvage entries for every carried item, one per inventory slot (mirrors
 * buildAbilityActions' per-entry iteration pattern) — ALWAYS offered, with no
 * district/economy gate: salvageHandler never rejects for lack of a district
 * (crafting-core.ts's own module header — "salvage does NOT reject when no
 * district resolves... only the economy-shift half of the result is
 * skipped"), so unlike sell/buy/craft this builder has nothing to gate on
 * besides carrying the item at all.
 */
export function buildSalvageActions(world: WorldState): ExtraAction[] {
  const player = world.entities[world.playerId];
  if (!player) return [];

  const inventory = player.inventory ?? [];
  return inventory.map((itemId) => ({
    verb: 'salvage',
    targetIds: [itemId],
    label: `Salvage ${itemId.replace(/-/g, ' ')}`,
    group: 'crafting' as const,
  }));
}

/**
 * Craft entries for every 'craft'-category recipe the player can currently
 * afford (canCraft's affordable + meetsRequirements gate — the SAME check
 * craftHandler itself runs, so an offered entry can never come back
 * rejected). Deliberately CRAFT-ONLY this wave: repair/modify recipes are NOT
 * wired into the menu — the coordinator defers those two categories to the
 * wave-3 content pass, since repair/modify both target an ALREADY-CARRIED
 * item (a second target selection this menu's flat entry shape doesn't yet
 * model) rather than craft's "produce a new item from materials" shape. They
 * stay reachable today via free-text (`craft <recipeId>` style verbs already
 * registered) and the Director's Ledger RECIPES section.
 *
 * canCraft is called with NO CraftingContext (2-arg form) — this is safe
 * specifically because 'craft' recipes never set `modificationKind`
 * (crafting-recipes.ts's own tables: only 'modify' recipes carry that field,
 * and canCraft's only context-dependent branch is
 * `modificationKind === 'black-market'`), so the menu's context-less
 * affordability check and craftHandler's own context-ful one always agree
 * for every recipe this builder can ever offer.
 *
 * DISPLAY fix (v3.0 wave-2 menu-surface, V3-MENU-1): genre is
 * world.meta.activeRuleset, not crafting-recipes.ts's bare GENRE_RECIPES key
 * — normalizeGenre (see buildBuyActions' own doc comment) strips the fixed
 * '-minimal' suffix before this lookup so a genre-tabled starter's own
 * flavored recipes actually display instead of silently degrading to
 * UNIVERSAL_RECIPES every time.
 *
 * Honest ceiling that REMAINS (the same cross-domain gap buildBuyActions'
 * own comment documents in full): buildWorldStack's `craftingGenre`
 * passthrough to createCraftingCore exists but no starter threads a value
 * into it today, so the REGISTERED 'craft' verb handler still resolves
 * against no genre regardless of what this preview computes — a sibling
 * wave-2 domain wires that starter-side plumbing; until it lands, a
 * genre-flavored recipe this function now offers could still be rejected as
 * "unknown recipe" if selected. UNIVERSAL_RECIPES-based craft recipes need no
 * such wiring at all (getRecipeById/getAvailableRecipes spread
 * UNIVERSAL_RECIPES unconditionally for every genre), so they resolve
 * identically regardless of which genre string either side computes.
 */
export function buildCraftActions(world: WorldState): ExtraAction[] {
  const player = world.entities[world.playerId];
  if (!player) return [];

  const zoneId = player.zoneId ?? world.locationId;
  const districtId = zoneId ? getDistrictForZone(world, zoneId) : undefined;
  if (!districtId) return []; // craftHandler itself rejects with no district to craft in

  const districtTags = getDistrictDefinition(world, districtId)?.tags ?? [];
  const genre = normalizeGenre(world.meta.activeRuleset);
  const recipes = getAvailableRecipes(genre, player.tags ?? [], districtTags).filter(
    (recipe) => recipe.category === 'craft',
  );
  const materials = getMaterialInventory(player.custom ?? {});

  const actions: ExtraAction[] = [];
  for (const recipe of recipes) {
    const check = canCraft(recipe, materials);
    if (!check.affordable || !check.meetsRequirements) continue;
    actions.push({
      verb: 'craft',
      parameters: { recipeId: recipe.id },
      // recipe.name is already imperative ('Craft Bandage', 'Distill Antidote'),
      // so it IS the menu label — a `Craft ${name}` template double-verbs it.
      label: recipe.name,
      group: 'crafting',
    });
  }
  return actions;
}

// ---------------------------------------------------------------------------
// Repair / Modify — item×recipe pairing (v3.0 wave-2 menu-surface, V3-MENU-2).
// buildCraftActions' own comment (above) deferred repair/modify to this wave:
// both need a SECOND selection alongside the recipe id — a specific carried
// item (action.targetIds[0]) — that this file's flat, one-selection entry
// shape didn't yet model. Both verbs were already reachable via free text
// (`repair <recipeId>`/`modify <recipeId>` with a target) and the Director's
// Ledger RECIPES section; this wires the numbered menu.
// ---------------------------------------------------------------------------

/**
 * Repair entries: one numbered row per (affordable repair recipe, distinct
 * carried item) pair.
 *
 * repairHandler (crafting-recipes.ts) never gates on the carried item's OWN
 * type — verified from source: it checks only actor / recipe-category /
 * `inventory.includes(itemId)` / canCraft's afford+meetsRequirements, no
 * slot or tag compatibility check between the recipe and the item at all. So
 * "eligible carried item" reduces to "carried" here — every distinct carried
 * item pairs validly with every affordable repair recipe, the same
 * "guaranteed to succeed" ceiling this file's other builders already hold
 * themselves to. Distinct item ids only (mirrors buildSellActions' own
 * grouping rationale) — repair never removes the target item from
 * inventory, so N identical copies would just repeat one already-listed,
 * identically-resolving row.
 *
 * canCraft is called with NO CraftingContext (2-arg form) — safe for the
 * exact reason buildCraftActions' own comment gives: repair recipes never set
 * `modificationKind` (only 'modify' recipes do — crafting-recipes.ts's own
 * tables), so canCraft's only context-dependent branch
 * (`modificationKind === 'black-market'`) can never fire for a repair recipe;
 * the menu's context-less affordability check and repairHandler's own
 * context-ful one always agree for every repair recipe this builder offers.
 *
 * Genre normalized the same way buildCraftActions' own call site now is
 * (normalizeGenre, V3-MENU-1) — repair shares getAvailableRecipes with craft,
 * so leaving it on the raw `<genre>-minimal` string would silently starve
 * repair of every genre-flavored recipe craft itself now shows. Same honest
 * ceiling as buildBuyActions/buildCraftActions: a genre-flavored repair
 * recipe (there are none authored today — repair-weapon/repair-armor are
 * both UNIVERSAL_RECIPES) will agree with the mechanical side once the
 * sibling wave-2 domain's world-stack fix lands; UNIVERSAL_RECIPES entries
 * need no such wiring at all and are safe today.
 */
export function buildRepairActions(world: WorldState): ExtraAction[] {
  const player = world.entities[world.playerId];
  if (!player) return [];

  const inventory = player.inventory ?? [];
  if (inventory.length === 0) return [];

  const zoneId = player.zoneId ?? world.locationId;
  const districtId = zoneId ? getDistrictForZone(world, zoneId) : undefined;
  if (!districtId) return []; // repairHandler itself rejects with no district to repair in

  const districtTags = getDistrictDefinition(world, districtId)?.tags ?? [];
  const genre = normalizeGenre(world.meta.activeRuleset);
  const recipes = getAvailableRecipes(genre, player.tags ?? [], districtTags).filter(
    (recipe) => recipe.category === 'repair',
  );
  if (recipes.length === 0) return [];

  const materials = getMaterialInventory(player.custom ?? {});
  const carriedItems = [...new Set(inventory)];

  const actions: ExtraAction[] = [];
  for (const recipe of recipes) {
    const check = canCraft(recipe, materials);
    if (!check.affordable || !check.meetsRequirements) continue;
    for (const itemId of carriedItems) {
      actions.push({
        verb: 'repair',
        targetIds: [itemId],
        parameters: { recipeId: recipe.id },
        label: `${recipe.name} → ${itemId.replace(/-/g, ' ')}`,
        group: 'crafting',
      });
    }
  }
  return actions;
}

/**
 * Modify entries: the same item×recipe pairing as buildRepairActions, for
 * 'modify'-category recipes. modifyHandler (crafting-recipes.ts) is likewise
 * item-type-agnostic — no slot/tag check between recipe and item — so
 * "eligible carried item" again reduces to "carried".
 *
 * Black-market modify recipes (`modificationKind === 'black-market'` —
 * today just 'modify-black-market-tune') are EXCLUDED from this builder
 * entirely — the one documented ceiling buildCraftActions' own comment
 * already carries, for the same reason: canCraft's only context-dependent
 * branch is exactly that check, and the CraftingContext that would tell it
 * whether the player is actually standing in an active black market
 * (`buildCraftingContext`, crafting-recipes.ts) is module-private — out of
 * this domain's reach without editing that file. Calling canCraft with no
 * context reports `meetsRequirements: true` for a black-market recipe
 * UNCONDITIONALLY (the context-dependent branch only fires when a context
 * IS passed) — offering it even outside an active black market, which
 * modifyHandler's own context-ful call would then reject. Excluding the
 * whole `modificationKind` value keeps every OTHER modify recipe's
 * context-less check provably agreeing with modifyHandler's context-ful one:
 * every remaining modificationKind (field-repair/enhancement/makeshift/
 * faction-mark/blessed/cursed) only ever affects resolveModify's OUTPUT
 * flavor, never canCraft's verdict.
 */
export function buildModifyActions(world: WorldState): ExtraAction[] {
  const player = world.entities[world.playerId];
  if (!player) return [];

  const inventory = player.inventory ?? [];
  if (inventory.length === 0) return [];

  const zoneId = player.zoneId ?? world.locationId;
  const districtId = zoneId ? getDistrictForZone(world, zoneId) : undefined;
  if (!districtId) return []; // modifyHandler itself rejects with no district to work in

  const districtTags = getDistrictDefinition(world, districtId)?.tags ?? [];
  const genre = normalizeGenre(world.meta.activeRuleset);
  const recipes = getAvailableRecipes(genre, player.tags ?? [], districtTags).filter(
    (recipe) => recipe.category === 'modify' && recipe.modificationKind !== 'black-market',
  );
  if (recipes.length === 0) return [];

  const materials = getMaterialInventory(player.custom ?? {});
  const carriedItems = [...new Set(inventory)];

  const actions: ExtraAction[] = [];
  for (const recipe of recipes) {
    const check = canCraft(recipe, materials);
    if (!check.affordable || !check.meetsRequirements) continue;
    for (const itemId of carriedItems) {
      actions.push({
        verb: 'modify',
        targetIds: [itemId],
        parameters: { recipeId: recipe.id },
        label: `${recipe.name} → ${itemId.replace(/-/g, ' ')}`,
        group: 'crafting',
      });
    }
  }
  return actions;
}

// ---------------------------------------------------------------------------
// Leverage — bribe/intimidate/petition/seed entries (F-677e94ad/F-19a23718
// write-wire, menu-integration wave)
// ---------------------------------------------------------------------------

/**
 * v3.0 wave-1 "social-verbs" registered 21 more leverage verbs beyond the
 * original four (bribe/intimidate/petition/seed) — the full social/rumor
 * groups, plus two brand-new groups (diplomacy/sabotage). buildLeverageActions
 * (below) surfaces a CURATED subset of them: every table here lists a verb
 * this codebase's own resolve*Action source proves is safe to gate by
 * afford + cooldown (+ minimum reputation where the requirement table sets
 * one) alone — never a raw, ungated dump. Two sub-actions are deliberately
 * EXCLUDED: 'deny'/'bury-scandal' (rumor group) mutate an EXISTING rumor by
 * id (`action.parameters.rumorId`, player-leverage.ts's own
 * rumorManipulationVerbHandler) — a third selection dimension (which rumor)
 * this wave doesn't model, the same "defer the extra pairing dimension"
 * choice buildCraftActions made for repair/modify before THIS wave wired
 * those. They stay reachable via free text and the Director's Ledger.
 *
 * Social sub-actions that hard-require a controlling-faction target — same
 * shape/reasoning as bribe/intimidate/petition-authority, extended by
 * player-leverage.ts's own socialVerbHandler doc comment: "call-in-favor/
 * recruit-ally['s]... only meaningful effects are likewise
 * targetFactionId-gated."
 */
const SOCIAL_FACTION_VERBS: { subAction: PlayerSocialVerb; label: (factionId: string) => string }[] = [
  { subAction: 'call-in-favor', label: (id) => `Call in a favor with ${id.replace(/-/g, ' ')}` },
  { subAction: 'recruit-ally', label: (id) => `Recruit an ally within ${id.replace(/-/g, ' ')}` },
];

/** Social sub-actions with NO target requirement — same "need not be about
 *  anyone/anywhere in particular" shape 'seed' already has (socialVerbHandler
 *  calls both with `{ requireTargetFaction: false }`). stake-claim's real
 *  payload (the district) is derived from the actor's OWN zone inside the
 *  handler, never from menu input — mirrored by 'seed' passing no targetIds
 *  below despite a controlling faction sometimes being available. */
const SOCIAL_FREE_VERBS: { subAction: PlayerSocialVerb; label: string }[] = [
  { subAction: 'disguise', label: 'Adopt a disguise' },
  { subAction: 'stake-claim', label: 'Stake a claim here' },
];

/** Rumor's "spawn family" — same no-target shape as 'seed' (every
 *  resolveRumorAction switch case for these defaults gracefully with no
 *  target faction, mirrored exactly by player-leverage.ts's own
 *  rumorSpawnVerbHandler). deny/bury-scandal are excluded — see this
 *  section's header comment. */
const RUMOR_FREE_VERBS: { subAction: PlayerRumorVerb; label: string }[] = [
  { subAction: 'frame', label: 'Frame someone else for it' },
  { subAction: 'claim-false-credit', label: 'Claim false credit for a deed' },
  { subAction: 'leak-truth', label: 'Leak an uncomfortable truth' },
  { subAction: 'spread-counter-rumor', label: 'Spread a counter-rumor' },
];

/**
 * Diplomacy (brand-new group this wave): every sub-action hard-requires a
 * target faction — resolveDiplomacyAction's targetFactionId parameter is
 * non-optional (`string`, not `string | undefined`), the type signature's
 * own requirement, not a judgment call made here (player-leverage.ts's own
 * diplomacyVerbHandler doc comment). Three of the seven ALSO gate on a
 * minimum reputation (DIPLOMACY_REQUIREMENTS' own `minimumReputation` field —
 * resolveDiplomacyAction checks it BEFORE affordability) — buildLeverageActions
 * replicates that same check below so an under-reputation offer never reaches
 * the menu (the "menu offers it, engine rejects it" trap this whole file
 * avoids everywhere else).
 */
const DIPLOMACY_MENU_VERBS: { subAction: PlayerDiplomacyVerb; label: (factionId: string) => string }[] = [
  { subAction: 'request-meeting', label: (id) => `Request a meeting with ${id.replace(/-/g, ' ')}` },
  { subAction: 'improve-standing', label: (id) => `Improve standing with ${id.replace(/-/g, ' ')}` },
  { subAction: 'cash-milestone', label: (id) => `Cash in a milestone with ${id.replace(/-/g, ' ')}` },
  { subAction: 'negotiate-access', label: (id) => `Negotiate access with ${id.replace(/-/g, ' ')}` },
  { subAction: 'trade-secret', label: (id) => `Trade a secret with ${id.replace(/-/g, ' ')}` },
  { subAction: 'temporary-alliance', label: (id) => `Propose a temporary alliance with ${id.replace(/-/g, ' ')}` },
  { subAction: 'broker-truce', label: (id) => `Broker a truce with ${id.replace(/-/g, ' ')}` },
];

/** Sabotage (brand-new group this wave): no sub-action hard-requires a
 *  target — every one bakes in an UNCONDITIONAL 'heat' effect
 *  (player-leverage.ts's own sabotageVerbHandler doc comment: "no sabotage
 *  sub-action hard-requires one... there is no no-op case to guard
 *  against"), so — like disguise/stake-claim/seed — these are offered with
 *  no target regardless of whether a controlling faction is present here. */
const SABOTAGE_MENU_VERBS: { subAction: PlayerSabotageVerb; label: string }[] = [
  { subAction: 'sabotage', label: 'Sabotage something here' },
  { subAction: 'plant-evidence', label: 'Plant false evidence' },
  { subAction: 'blackmail-target', label: 'Blackmail a rival' },
  { subAction: 'incite-riot', label: 'Incite a riot' },
];

/**
 * Reputation toward `factionId`, merged the SAME way player-leverage.ts's own
 * (module-private) playerReputationFor does: an authored faction baseline
 * (world.factions[id].reputation) plus the accrued `reputation_<id>` global —
 * replicated here rather than imported because it isn't exported (the same
 * "each call site inlines this 2-line merge" idiom trade-core.ts and
 * crafting-recipes.ts already follow independently, for the identical
 * reason: a leverage/diplomacy action and a sale/craft must never disagree
 * about how a faction feels about the player).
 */
function playerReputationForFaction(world: WorldState, factionId: string): number {
  const base = world.factions?.[factionId]?.reputation ?? 0;
  const delta = world.globals[`reputation_${factionId}`];
  return base + (typeof delta === 'number' && Number.isFinite(delta) ? delta : 0);
}

/**
 * Leverage entries for the original FOUR wired player-leverage verbs
 * (bribe/intimidate/petition/seed) PLUS a curated extension (v3.0 wave-2
 * menu-surface, V3-MENU-3) surfacing wave-1's 21 newly-registered verbs
 * across all four groups — see the table comments above for the exact
 * per-group gating this reuses. Every original-4 entry below is BYTE-FOR-BYTE
 * unchanged from before this wave (same checks, same labels, same order) —
 * only new entries are appended after them, so a state where nothing new
 * applies renders an identical menu to pre-wave (V3-MENU-4).
 *
 * Each entry (old and new alike) is offered ONLY when its full
 * success-predicate holds: resolveSocialAction/resolveRumorAction/
 * resolveSabotageAction succeed IFF canAfford(costs) — there is no additional
 * hidden threshold (verified from source: none of the three checks
 * reputation, alert, or anything else before succeeding) — so afford +
 * cooldown-ready is the COMPLETE guaranteed-success gate for those three
 * groups, the same one socialVerbHandler/seedHandler themselves run before
 * resolving. resolveDiplomacyAction is the one exception — it ALSO checks
 * `minimumReputation` before affordability — replicated via
 * playerReputationForFaction above.
 *
 * bribe/intimidate/petition/call-in-favor/recruit-ally/every diplomacy verb
 * all require a controlling faction at the player's CURRENT district
 * (socialVerbHandler/diplomacyVerbHandler both reject with no target faction
 * id — a faction-directed action with no faction is a no-op the menu must
 * never charge a turn for); seed/disguise/stake-claim/every rumor spawn
 * verb/every sabotage verb have no such requirement and carry no targetIds —
 * their target faction is optional or nonexistent by design (their own
 * handlers resolve fine with targetFactionId undefined).
 *
 * Cooldown keys mirror the verb handlers' own setCooldown calls exactly:
 * bribe → 'social'/'bribe', intimidate → 'social'/'intimidate', petition →
 * 'social'/'petition-authority' (NOTE: the sub-action id petitionHandler
 * actually resolves through is 'petition-authority', not 'petition' — the
 * VERB is 'petition', the cooldown/requirements key is not), seed →
 * 'rumor'/'seed'; every new social/rumor/diplomacy/sabotage verb's cooldown
 * group+subAction pair matches its own table's `subAction` literally (verb
 * === subAction for all 19 new entries — only 'petition' has ever needed the
 * split, and that precedent is untouched).
 */
export function buildLeverageActions(world: WorldState): ExtraAction[] {
  const player = world.entities[world.playerId];
  if (!player) return [];

  const zoneId = player.zoneId ?? world.locationId;
  const districtId = zoneId ? getDistrictForZone(world, zoneId) : undefined;
  const controllingFaction = districtId ? getDistrictDefinition(world, districtId)?.controllingFaction : undefined;

  const custom = player.custom ?? {};
  const state = getLeverageState(custom);
  const tick = world.meta.tick;

  const actions: ExtraAction[] = [];

  if (controllingFaction) {
    const bribeReq = getSocialRequirements('bribe');
    if (
      canAfford(state, bribeReq.costs) &&
      isCooldownReady(custom, 'social', 'bribe', tick, bribeReq.cooldownTurns ?? 0)
    ) {
      actions.push({
        verb: 'bribe',
        targetIds: [controllingFaction],
        label: `Bribe ${controllingFaction.replace(/-/g, ' ')}`,
        group: 'leverage',
      });
    }

    const intimidateReq = getSocialRequirements('intimidate');
    if (
      canAfford(state, intimidateReq.costs) &&
      isCooldownReady(custom, 'social', 'intimidate', tick, intimidateReq.cooldownTurns ?? 0)
    ) {
      actions.push({
        verb: 'intimidate',
        targetIds: [controllingFaction],
        label: `Intimidate ${controllingFaction.replace(/-/g, ' ')}`,
        group: 'leverage',
      });
    }

    // NOTE the subAction id is 'petition-authority', not 'petition' — see doc comment above.
    const petitionReq = getSocialRequirements('petition-authority');
    if (
      canAfford(state, petitionReq.costs) &&
      isCooldownReady(custom, 'social', 'petition-authority', tick, petitionReq.cooldownTurns ?? 0)
    ) {
      actions.push({
        verb: 'petition',
        targetIds: [controllingFaction],
        label: `Petition ${controllingFaction.replace(/-/g, ' ')}`,
        group: 'leverage',
      });
    }

    // v3.0 wave-2: the remaining social sub-actions that ALSO hard-require a
    // controlling faction target (SOCIAL_FACTION_VERBS' own doc comment).
    for (const { subAction, label } of SOCIAL_FACTION_VERBS) {
      const req = getSocialRequirements(subAction);
      if (
        canAfford(state, req.costs) &&
        isCooldownReady(custom, 'social', subAction, tick, req.cooldownTurns ?? 0)
      ) {
        actions.push({
          verb: subAction,
          targetIds: [controllingFaction],
          label: label(controllingFaction),
          group: 'leverage',
        });
      }
    }

    // Diplomacy (brand-new group): DIPLOMACY_MENU_VERBS' own doc comment —
    // hard-requires a target faction, so gated inside this SAME
    // `if (controllingFaction)` block; a minority also gate on minimum
    // reputation, checked first (mirrors resolveDiplomacyAction's own order).
    const playerReputation = playerReputationForFaction(world, controllingFaction);
    for (const { subAction, label } of DIPLOMACY_MENU_VERBS) {
      const req = getDiplomacyRequirements(subAction);
      if (req.minimumReputation != null && playerReputation < req.minimumReputation) continue;
      if (
        canAfford(state, req.costs) &&
        isCooldownReady(custom, 'diplomacy', subAction, tick, req.cooldownTurns ?? 0)
      ) {
        actions.push({
          verb: subAction,
          targetIds: [controllingFaction],
          label: label(controllingFaction),
          group: 'leverage',
        });
      }
    }
  }

  // Social sub-actions with NO target requirement (SOCIAL_FREE_VERBS' own doc
  // comment: disguise/stake-claim, same shape as 'seed' below).
  for (const { subAction, label } of SOCIAL_FREE_VERBS) {
    const req = getSocialRequirements(subAction);
    if (
      canAfford(state, req.costs) &&
      isCooldownReady(custom, 'social', subAction, tick, req.cooldownTurns ?? 0)
    ) {
      actions.push({ verb: subAction, label, group: 'leverage' });
    }
  }

  const seedReq = getRumorRequirements('seed');
  if (
    canAfford(state, seedReq.costs) &&
    isCooldownReady(custom, 'rumor', 'seed', tick, seedReq.cooldownTurns ?? 0)
  ) {
    actions.push({
      verb: 'seed',
      label: 'Spread a rumor about yourself',
      group: 'leverage',
    });
  }

  // Rumor's spawn family (RUMOR_FREE_VERBS' own doc comment) — same no-target
  // shape as 'seed' above.
  for (const { subAction, label } of RUMOR_FREE_VERBS) {
    const req = getRumorRequirements(subAction);
    if (
      canAfford(state, req.costs) &&
      isCooldownReady(custom, 'rumor', subAction, tick, req.cooldownTurns ?? 0)
    ) {
      actions.push({ verb: subAction, label, group: 'leverage' });
    }
  }

  // Sabotage (brand-new group): SABOTAGE_MENU_VERBS' own doc comment — no
  // target requirement at all, offered regardless of controllingFaction.
  for (const { subAction, label } of SABOTAGE_MENU_VERBS) {
    const req = getSabotageRequirements(subAction);
    if (
      canAfford(state, req.costs) &&
      isCooldownReady(custom, 'sabotage', subAction, tick, req.cooldownTurns ?? 0)
    ) {
      actions.push({ verb: subAction, label, group: 'leverage' });
    }
  }

  return actions;
}

// ---------------------------------------------------------------------------
// Opportunities — accept/complete/abandon entries (F-ceed887f/F-f3f2a84c
// write-wire, menu-integration wave)
// ---------------------------------------------------------------------------

/**
 * Opportunity entries from the persisted opportunity ledger
 * (getPersistedOpportunities — world.modules['opportunity-core'].opportunities,
 * the same namespace world-tick's per-round spawn/tick and the 'opportunity'
 * verb both read/write). Only 'available' and 'accepted' are live statuses;
 * every other OpportunityStatus (completed/failed/expired/declined/abandoned/
 * betrayed) is terminal and gets no entry — the opportunity verb itself
 * rejects any op against a terminal opportunity (opportunityHandler: "accept"
 * requires status 'available', "complete"/"abandon" require 'accepted'), so
 * this mirrors that gate exactly.
 *
 * An 'available' opportunity offers ONE entry (accept); an 'accepted' one
 * offers TWO (complete, abandon) — both submit the SAME verb ('opportunity')
 * with a different `parameters.op`, the shape opportunityHandler's own
 * action.parameters.op switch expects.
 */
export function buildOpportunityActions(world: WorldState): ExtraAction[] {
  const opportunities = getPersistedOpportunities(world);
  const actions: ExtraAction[] = [];

  for (const opp of opportunities) {
    if (opp.status === 'available') {
      actions.push({
        verb: 'opportunity',
        targetIds: [opp.id],
        parameters: { op: 'accept' },
        label: `Accept: ${opp.title}`,
        group: 'opportunities',
      });
    } else if (opp.status === 'accepted') {
      actions.push({
        verb: 'opportunity',
        targetIds: [opp.id],
        parameters: { op: 'complete' },
        label: `Complete: ${opp.title}`,
        group: 'opportunities',
      });
      actions.push({
        verb: 'opportunity',
        targetIds: [opp.id],
        parameters: { op: 'abandon' },
        label: `Abandon: ${opp.title}`,
        group: 'opportunities',
      });
    }
  }

  return actions;
}

// ---------------------------------------------------------------------------
// Journal — the quest book entry (F-ENG005-quest-loop-min)
// ---------------------------------------------------------------------------

/** The journal entry's label. Sentinel verb: routed by `group === 'journal'`
 *  in the extras dispatch, never meant to reach the engine as an action. */
export const JOURNAL_MENU_LABEL = 'Journal — quests and undertakings';
export const JOURNAL_MENU_VERB = 'journal';

/**
 * The extras menu's Journal entry — ALWAYS present, no env gate: the quest
 * loop is the shipped reason to return, and its book must never hide.
 * Selecting it renders {@link renderJournal}; the wiring routes on
 * `group: 'journal'` instead of submitting the sentinel verb — consulting
 * the journal must not advance the world.
 */
export function buildJournalActions(): ExtraAction[] {
  return [{ verb: JOURNAL_MENU_VERB, label: JOURNAL_MENU_LABEL, group: 'journal' }];
}

const JOURNAL_RULE = '═'.repeat(60);

/** One active quest's journal lines: banner, stage position + hook, objectives. */
function journalQuestLines(instance: QuestState, def: QuestDefinition | undefined): string[] {
  const lines: string[] = [''];
  const name = def?.name ?? instance.questId;
  lines.push(`  ── ${name} ──`);

  const stage: QuestStage | undefined = def?.stages.find((s) => s.id === instance.currentStage);
  if (!def || !stage) {
    // Definitions unavailable (foreign save / pack without registered quest
    // content): the journal still renders what the state itself knows.
    lines.push(`  Stage: ${instance.currentStage}`);
    return lines;
  }

  const stageIndex = def.stages.findIndex((s) => s.id === stage.id) + 1;
  const required = questProgressRequired(stage);
  const progress = required !== undefined
    ? ` (${Math.min(questProgressCount(instance, stage.id), required)}/${required})`
    : '';
  const hook = stage.description ? ` — ${stage.description}` : '';
  lines.push(`  Stage ${stageIndex}/${def.stages.length}: ${stage.name}${progress}${hook}`);
  for (const objective of stage.objectives ?? []) {
    lines.push(`    • ${objective}`);
  }
  return lines;
}

/**
 * Render the Journal: active quests (name, current stage x/y with progress
 * counts, the stage hook, its objectives), then the completed list — read
 * from core's own world.quests container plus quest-core's registered
 * definitions for this world's pack. Same voice family as the inspector
 * report and the Director's Ledger; pure over state (no writes), so a save
 * taken after rendering is byte-identical to one taken before.
 */
export function renderJournal(world: WorldState): string {
  const defs = new Map(getQuestDefinitions(world).map((q) => [q.id, q]));
  const instances = Object.values(world.quests);
  const active = instances.filter((q) => q.status === 'active');
  const completed = instances.filter((q) => q.status === 'completed');
  const failed = instances.filter((q) => q.status === 'failed');

  const lines: string[] = [];
  lines.push(`  ${JOURNAL_RULE}`);
  lines.push(`  JOURNAL — ACTIVE QUESTS (${active.length}) · COMPLETED (${completed.length})`);
  lines.push(`  ${JOURNAL_RULE}`);

  if (instances.length === 0) {
    lines.push('');
    lines.push('  Nothing undertaken yet. The world will ask soon enough.');
    return lines.join('\n');
  }

  for (const instance of active) {
    // F-470a2a88: guarded-degrade, same contract as renderDirectorLedger's
    // per-section and this file's own renderInspectorReport per-inspector
    // try/catch — a throwing quest-core read (a foreign or content-drifted
    // save) degrades to ONE bounded, attributed line instead of propagating
    // uncaught through handlePlayerInput into the main interactive loop; the
    // journal's other entries (and the completed/failed lists below) still
    // render.
    try {
      lines.push(...journalQuestLines(instance, defs.get(instance.questId)));
    } catch (err) {
      lines.push('');
      lines.push(`  ── ${instance.questId} ──`);
      lines.push(`  [quest entry failed: ${describeActionError(err)}]`);
    }
  }

  if (completed.length > 0) {
    lines.push('');
    lines.push('  ── Completed ──');
    for (const instance of completed) {
      lines.push(`  • ${defs.get(instance.questId)?.name ?? instance.questId}`);
    }
  }

  // quest-core never marks a quest 'failed' today (failStage is a branch, not
  // a terminal state — its documented ceiling), but core's QuestState models
  // the status, so a save that carries one still renders honestly.
  if (failed.length > 0) {
    lines.push('');
    lines.push('  ── Failed ──');
    for (const instance of failed) {
      lines.push(`  • ${defs.get(instance.questId)?.name ?? instance.questId}`);
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Director — the ledger entry (F-ENG005)
// ---------------------------------------------------------------------------

/** The ledger entry's label. Sentinel verb: routed by `group === 'director'`
 *  in the extras dispatch, never meant to reach the engine as an action. */
export const DIRECTOR_MENU_LABEL = "Director's Ledger — the strategic picture";
export const DIRECTOR_MENU_VERB = 'director-ledger';

/**
 * The extras menu's Director's Ledger entry — ALWAYS present, no env gate:
 * unlike the operator-only debug view, the ledger is part of the shipped
 * player surface. Selecting it renders renderDirectorLedger (director.ts);
 * the wiring routes on `group: 'director'` instead of submitting the sentinel
 * verb — consulting the ledger must not advance the world.
 */
export function buildDirectorActions(): ExtraAction[] {
  return [{ verb: DIRECTOR_MENU_VERB, label: DIRECTOR_MENU_LABEL, group: 'director' }];
}

// ---------------------------------------------------------------------------
// Debug — inspector report (F-ENG006)
// ---------------------------------------------------------------------------

/** The debug entry's label. Sentinel verb: routed by `group === 'debug'` in the
 *  extras dispatch, never meant to reach the engine as an action. */
export const DEBUG_MENU_LABEL = 'Debug: inspect simulation state';
export const DEBUG_MENU_VERB = 'debug-inspect';

/**
 * The extras menu's debug entry — present ONLY when the operator set
 * AI_RPG_DEBUG=1, so the player surface stays clean. Selecting it renders
 * renderInspectorReport (the wiring routes on `group: 'debug'` instead of
 * submitting the sentinel verb to the engine — inspection must not advance
 * the world).
 */
export function buildDebugActions(
  env: Record<string, string | undefined> = process.env,
): ExtraAction[] {
  if (env.AI_RPG_DEBUG !== '1') return [];
  return [{ verb: DEBUG_MENU_VERB, label: DEBUG_MENU_LABEL, group: 'debug' }];
}

const DEBUG_RULE = '═'.repeat(60);

/**
 * Render every registered inspector's output (Engine.getInspectors — the 14
 * per-starter inspectors that previously had zero consumers): label + id as a
 * section title, then the inspected state pretty-printed as JSON. Plain text,
 * two-space indented like the rest of the CLI — no new styling system.
 *
 * Guarded per inspector: a throwing `inspect` (or unserializable return, e.g.
 * a circular structure) degrades to ONE bounded line via describeActionError
 * and the report moves on — a buggy inspector can never take down the session
 * or hide its siblings.
 */
export function renderInspectorReport(
  engine: Pick<Engine, 'getInspectors' | 'world'>,
): string {
  const inspectors = engine.getInspectors();
  const lines: string[] = [];
  lines.push(`  ${DEBUG_RULE}`);
  lines.push(`  DEBUG — SIMULATION INSPECTORS (${inspectors.length})`);
  lines.push(`  ${DEBUG_RULE}`);

  if (inspectors.length === 0) {
    lines.push('');
    lines.push('  No debug inspectors are registered for this pack.');
    return lines.join('\n');
  }

  for (const inspector of inspectors) {
    lines.push('');
    lines.push(`  ── ${inspector.label} (${inspector.id}) ──`);
    try {
      const value = inspector.inspect(engine.world);
      const body = JSON.stringify(value, null, 2) ?? String(value);
      for (const bodyLine of body.split('\n')) lines.push(`  ${bodyLine}`);
    } catch (err) {
      lines.push(`  [inspector failed: ${describeActionError(err)}]`);
    }
  }

  return lines.join('\n');
}

/** All appended entries — abilities, then unlocks, then trade (buy, sell),
 *  then crafting (salvage, craft, repair, modify), then leverage, then
 *  opportunities, then the always-on player surfaces in reading order (the
 *  Journal, then the Director's Ledger), then the env-gated debug entry last
 *  (the operator surface stays at the bottom). Stable order, pure over state.
 *
 * F-03f27ace: the ability and unlock constructions are guarded — same
 * contract as turns.ts's runNpcTurns and this file's own
 * renderInspectorReport — because both reach into content-driven modules
 * data (a malformed ability or progression-node definition from a
 * hand-authored or scaffolded pack) that has no other guard between here and
 * the top-level catch. A throw from either source degrades to one bounded
 * line and contributes no entries from the failing source; the other extras
 * (unlock/ability, trade, crafting, leverage, opportunities, journal,
 * director, debug) still build normally.
 * F-6c3e4fde: buildSellActions gets the same guard — it reads district/
 * economy state the same way abilities read the ability catalog.
 * Menu-integration wave (v2.9): buildBuyActions, buildSalvageActions,
 * buildCraftActions, buildLeverageActions, and buildOpportunityActions each
 * get their OWN guard, same shape — every one of them reads content-driven or
 * persisted state (district/economy, recipe tables, leverage custom fields,
 * the opportunity ledger) with no other guard between here and the top-level
 * catch, and a throw from any ONE of them must never take out its siblings.
 * v3.0 wave-2 menu-surface: buildRepairActions/buildModifyActions get the
 * SAME guard as buildCraftActions (they read the identical recipe-table +
 * material-inventory + district state, just with an added inventory read) —
 * a throw from either degrades to its own bounded line and never takes out
 * craft/leverage/journal/director/debug alongside it.
 */
export function buildExtraActions(
  engine: Engine,
  trees: ProgressionTreeDefinition[] = [],
  opts: { log?: (msg: string) => void } = {},
): ExtraAction[] {
  const log = opts.log ?? console.log;

  let abilityActions: ExtraAction[] = [];
  try {
    abilityActions = buildAbilityActions(engine.world, getAbilityCatalog(engine));
  } catch (err) {
    log(`  (ability menu unavailable this turn: ${describeActionError(err)})`);
  }

  let unlockActions: ExtraAction[] = [];
  try {
    unlockActions = buildUnlockActions(engine.world, trees);
  } catch (err) {
    log(`  (advancement menu unavailable this turn: ${describeActionError(err)})`);
  }

  let buyActions: ExtraAction[] = [];
  try {
    buyActions = buildBuyActions(engine.world);
  } catch (err) {
    log(`  (buy menu unavailable this turn: ${describeActionError(err)})`);
  }

  let sellActions: ExtraAction[] = [];
  try {
    sellActions = buildSellActions(engine.world);
  } catch (err) {
    log(`  (trade menu unavailable this turn: ${describeActionError(err)})`);
  }

  let salvageActions: ExtraAction[] = [];
  try {
    salvageActions = buildSalvageActions(engine.world);
  } catch (err) {
    log(`  (salvage menu unavailable this turn: ${describeActionError(err)})`);
  }

  let craftActions: ExtraAction[] = [];
  try {
    craftActions = buildCraftActions(engine.world);
  } catch (err) {
    log(`  (craft menu unavailable this turn: ${describeActionError(err)})`);
  }

  let repairActions: ExtraAction[] = [];
  try {
    repairActions = buildRepairActions(engine.world);
  } catch (err) {
    log(`  (repair menu unavailable this turn: ${describeActionError(err)})`);
  }

  let modifyActions: ExtraAction[] = [];
  try {
    modifyActions = buildModifyActions(engine.world);
  } catch (err) {
    log(`  (modify menu unavailable this turn: ${describeActionError(err)})`);
  }

  let leverageActions: ExtraAction[] = [];
  try {
    leverageActions = buildLeverageActions(engine.world);
  } catch (err) {
    log(`  (leverage menu unavailable this turn: ${describeActionError(err)})`);
  }

  let opportunityActions: ExtraAction[] = [];
  try {
    opportunityActions = buildOpportunityActions(engine.world);
  } catch (err) {
    log(`  (opportunity menu unavailable this turn: ${describeActionError(err)})`);
  }

  return [
    ...abilityActions,
    ...unlockActions,
    ...buyActions,
    ...sellActions,
    ...salvageActions,
    ...craftActions,
    ...repairActions,
    ...modifyActions,
    ...leverageActions,
    ...opportunityActions,
    ...buildJournalActions(),
    ...buildDirectorActions(),
    ...buildDebugActions(),
  ];
}

// renderExtraActions is gone (P8-PS-005): rendering the appended entries is
// terminal-ui's job now — renderFullScreen's `extraActions` option numbers
// them as a continuation of the base list, INSIDE the frame's closing rule,
// with one shared number width (renderActions owns the whole numbered range).
// The two-renderer split was the misalignment bug: this module padded to the
// TOTAL width while the base menu padded to its own, so the columns broke at
// the seam, and the extras printed after the frame's return, below the
// screen-closing rule. parseExtraSelection below is unchanged — the numbers
// it resolves are exactly the numbers the frame now renders.

/**
 * Map a numeric input beyond the base menu range onto an appended entry.
 * Returns null when the input is not a number or is out of range — the caller
 * falls through to free-text parsing exactly as before.
 */
export function parseExtraSelection(
  input: string,
  baseCount: number,
  extras: ExtraAction[],
): ExtraAction | null {
  if (!/^\d+$/.test(input.trim())) return null;
  const n = parseInt(input, 10);
  if (isNaN(n) || n <= baseCount || n > baseCount + extras.length) return null;
  return extras[n - baseCount - 1];
}

// ---------------------------------------------------------------------------
// HUD decoration — XP / level in the vitals line
// ---------------------------------------------------------------------------

/**
 * The player's level as the CLI understands it: 1 + total progression nodes
 * the player unlocked across all trees (progression-core persists no explicit
 * level of its own). Single authority shared by the HUD (buildHudWorld) and
 * the endgame evaluator (buildEndgameInputs) so the two can never disagree.
 */
export function derivePlayerLevel(world: WorldState): number {
  const unlockedByTree = (world.modules['progression-core'] as
    | { unlocked?: Record<string, Record<string, string[]>> }
    | undefined)?.unlocked?.[world.playerId] ?? {};
  return 1 + Object.values(unlockedByTree).reduce((sum, nodes) => sum + nodes.length, 0);
}

/**
 * Display-only copy of the world whose player carries `xp` and `level`
 * pseudo-resources, so terminal-ui's existing vitals renderer (which renders
 * every player resource it is handed) shows them with zero terminal-ui
 * changes. Never mutates live state — a save taken after rendering is
 * byte-identical to one taken before.
 *
 * xp    — progression-core currency balance (the trees' currency, default 'xp')
 * level — derivePlayerLevel (1 + total progression nodes unlocked across all trees)
 */
export function buildHudWorld(
  world: WorldState,
  trees: ProgressionTreeDefinition[] = [],
): WorldState {
  const player = world.entities[world.playerId];
  if (!player) return world;

  const currencyId = trees[0]?.currency ?? 'xp';
  const xp = getCurrency(world, world.playerId, currencyId);
  const level = derivePlayerLevel(world);

  return {
    ...world,
    entities: {
      ...world.entities,
      [world.playerId]: {
        ...player,
        resources: { ...player.resources, xp, level },
      },
    },
  };
}
