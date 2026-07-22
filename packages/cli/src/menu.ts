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

import type { Engine, WorldState, EntityState, ScalarValue, QuestState } from '@ai-rpg-engine/core';
import type { AbilityDefinition, ProgressionTreeDefinition, QuestDefinition, QuestStage } from '@ai-rpg-engine/content-schema';
import type { SupplyCategory } from '@ai-rpg-engine/modules';
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
 * Honest ceiling (documented inline per this wave's instructions): genre here
 * is world.meta.activeRuleset — a per-starter ruleset id (e.g.
 * 'fantasy-minimal'), NOT the bare GENRE_BUYABLE_STOCK key ('fantasy').
 * This is the SAME source director.ts's own RECIPES section already uses for
 * an identical reason (see that file's comment) — getBuyableStock/
 * quoteBuyPrice degrade an unmatched genre to the generic DEFAULT_BUYABLE_STOCK
 * list, the same safe fallback every genre-keyed lookup in this engine
 * already takes; genre-flavored stock lights up once a pack threads a
 * matching genre through buildWorldStack's trade-core config (today,
 * buildWorldStack calls createTradeCore() with no genre at all, so this
 * ceiling is not even reached in production — every world sees
 * DEFAULT_BUYABLE_STOCK regardless of activeRuleset).
 */
export function buildBuyActions(world: WorldState): ExtraAction[] {
  const player = world.entities[world.playerId];
  if (!player) return [];

  const zoneId = player.zoneId ?? world.locationId;
  const districtId = zoneId ? getDistrictForZone(world, zoneId) : undefined;
  const districtEconomy = districtId ? getDistrictEconomy(world, districtId) : undefined;
  if (!districtId || !districtEconomy) return [];

  const genre = world.meta.activeRuleset;
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
 * Honest ceiling (same source + same degrade as buildBuyActions' own):
 * genre is world.meta.activeRuleset, not crafting-recipes.ts's bare
 * GENRE_RECIPES key — getAvailableRecipes degrades an unmatched genre to
 * UNIVERSAL_RECIPES only, exactly the ceiling director.ts's own RECIPES
 * section documents for this identical call.
 */
export function buildCraftActions(world: WorldState): ExtraAction[] {
  const player = world.entities[world.playerId];
  if (!player) return [];

  const zoneId = player.zoneId ?? world.locationId;
  const districtId = zoneId ? getDistrictForZone(world, zoneId) : undefined;
  if (!districtId) return []; // craftHandler itself rejects with no district to craft in

  const districtTags = getDistrictDefinition(world, districtId)?.tags ?? [];
  const genre = world.meta.activeRuleset;
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
// Leverage — bribe/intimidate/petition/seed entries (F-677e94ad/F-19a23718
// write-wire, menu-integration wave)
// ---------------------------------------------------------------------------

/**
 * Leverage entries for the FOUR wired player-leverage verbs
 * (bribe/intimidate/petition/seed — player-leverage.ts's own documented
 * "exactly four verbs" scope). Each entry is offered ONLY when its full
 * success-predicate holds: resolveSocialAction/resolveRumorAction succeed IFF
 * canAfford(costs) — there is no additional hidden threshold (verified from
 * source: neither function checks reputation, alert, or anything else before
 * succeeding) — so afford + cooldown-ready is the COMPLETE guaranteed-success
 * gate, the same one socialVerbHandler/seedHandler themselves run before
 * resolving.
 *
 * bribe/intimidate/petition all require a controlling faction at the
 * player's CURRENT district (socialVerbHandler rejects with no target
 * faction id — a faction-directed action with no faction is a no-op the menu
 * must never charge a turn for); seed has no such requirement and carries no
 * targetIds — its target faction is optional (seedHandler resolves fine with
 * targetFactionId undefined).
 *
 * Cooldown keys mirror the verb handlers' own setCooldown calls exactly:
 * bribe → 'social'/'bribe', intimidate → 'social'/'intimidate', petition →
 * 'social'/'petition-authority' (NOTE: the sub-action id petitionHandler
 * actually resolves through is 'petition-authority', not 'petition' — the
 * VERB is 'petition', the cooldown/requirements key is not), seed →
 * 'rumor'/'seed'.
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
 *  then crafting (salvage, craft), then leverage, then opportunities, then
 *  the always-on player surfaces in reading order (the Journal, then the
 *  Director's Ledger), then the env-gated debug entry last (the operator
 *  surface stays at the bottom). Stable order, pure over state.
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
