// F1a — NPC turn driver: after the player's action resolves, every living
// hostile sharing the player's zone takes one action through the engine's own
// AI selection (`selectActionForEntity` — cognition intent profiles with
// aggressive-fallback). Cadence is "player acts, then each enemy acts": no
// initiative system, one NPC action per enemy per player action.
//
// Every submission runs under runGuardedAction so one buggy NPC (a throwing
// verb handler, a corrupt profile) degrades to a logged line instead of
// crashing the whole interactive session.

import type { Engine, EntityState, WorldState } from '@ai-rpg-engine/core';
import type { AbilityDefinition } from '@ai-rpg-engine/content-schema';
import {
  selectActionForEntity,
  ABILITY_CATALOG_FORMULA,
  selectBestAction,
  getPartyState,
  getActiveCompanions,
} from '@ai-rpg-engine/modules';
import type { UnifiedActionSource } from '@ai-rpg-engine/modules';
import { runGuardedAction } from './guard.js';

/**
 * The pack's construction-frozen ability catalog, published by ability-core as
 * a formula (F-dd1faf2a). Empty array when the pack has no ability module —
 * callers never need to know whether ability-core is wired.
 */
export function getAbilityCatalog(engine: Engine): AbilityDefinition[] {
  if (!engine.formulas.has(ABILITY_CATALOG_FORMULA)) return [];
  const catalog = engine.formulas.get(ABILITY_CATALOG_FORMULA)();
  return Array.isArray(catalog) ? (catalog as AbilityDefinition[]) : [];
}

/**
 * The entities that take a turn after the player: living, explicitly hostile
 * (the `enemy`/`hostile` tag — the same explicit-hostility convention the
 * terminal-ui scene list uses, so the NPCs that render red are exactly the
 * NPCs that fight), and in the player's zone. Friendly NPCs never act here —
 * `type !== 'player'` alone would send the shopkeeper to war, because the
 * type-heuristic affiliation treats every non-player type as an enemy.
 *
 * Sorted by entity id so the acting order is byte-deterministic regardless of
 * insertion order.
 */
export function listHostilesInPlayerZone(world: WorldState): EntityState[] {
  const player = world.entities[world.playerId];
  if (!player) return [];
  const playerZone = player.zoneId ?? world.locationId;

  return Object.values(world.entities)
    .filter(
      (e) =>
        e.id !== world.playerId &&
        (e.resources.hp ?? 0) > 0 &&
        (e.tags.includes('enemy') || e.tags.includes('hostile')) &&
        (e.zoneId ?? world.locationId) === playerZone,
    )
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** What one NPC did on its turn — returned for tests and optional debug output. */
export type NpcTurnResult = {
  actorId: string;
  actorName: string;
  verb: string;
  targetIds?: string[];
  /** Intent profile that evaluated (post-fallback). */
  profileId: string;
  /** True when the entity's declared profile id did not resolve and the aggressive fallback ran. */
  usedFallback: boolean;
  reason: string;
  /** False when the guarded submission threw (session survived; NPC turn lost). */
  submitted: boolean;
};

/**
 * Run one NPC action for every living hostile in the player's zone.
 *
 * Per hostile:
 *  1. `selectActionForEntity` resolves the entity's `ai.profileId` (unknown ids
 *     fall back to 'aggressive', so a content typo degrades to sensible
 *     behavior, not a frozen NPC). Null — missing/non-AI/downed entity — skips.
 *  2. The chosen action is submitted via `engine.submitActionAs(entityId, …)`,
 *     so the action's actorId is the NPC: its attacks damage the player, its
 *     moves move IT (the Stage A submitActionAs fix — pinned by test).
 *  3. Both steps are guarded: a throwing advisor or verb handler logs one
 *     bounded line and the loop continues with the next hostile.
 *
 * The hostile roster is snapshotted before any NPC acts (this player-action's
 * "round"), then each entry is re-checked against live state right before it
 * acts: an NPC defeated by a companion/reactive effect mid-round loses its
 * turn, and the round stops early if the player is downed — the defeat screen
 * owns what happens next, not a pile-on.
 */
export function runNpcTurns(
  engine: Engine,
  opts: { log?: (msg: string) => void } = {},
): NpcTurnResult[] {
  const log = opts.log ?? console.log;
  const results: NpcTurnResult[] = [];

  const playerId = engine.world.playerId;
  const roster = listHostilesInPlayerZone(engine.world).map((e) => e.id);

  for (const entityId of roster) {
    // Player downed mid-round → stop; the endgame screen takes over.
    const player = engine.world.entities[playerId];
    if (!player || (player.resources.hp ?? 0) <= 0) break;

    // Re-check liveness against live state — an earlier NPC's action (or a
    // reactive effect it triggered) may have removed or downed this one.
    const entity = engine.world.entities[entityId];
    if (!entity || (entity.resources.hp ?? 0) <= 0) continue;

    // 1. Selection — guarded: a throwing profile must not kill the round.
    let selection: ReturnType<typeof selectActionForEntity>;
    try {
      selection = selectActionForEntity(engine.world, entityId);
    } catch (err) {
      log(`  (${entity.name} hesitates — its instincts failed: ${err instanceof Error ? err.message : String(err)})`);
      continue;
    }
    if (!selection) continue; // no ai state / downed / nothing to do

    // Idle 'inspect' is the profiles' explicit "do nothing" option (cautious
    // observers, becalmed aggressors). Submitting it burns a tick AND renders
    // through the player-anchored narrator ("You look around…" — spoken by a
    // crypt stalker), so idle NPCs simply pass their turn.
    if (selection.verb === 'inspect') continue;

    // 2. Submission — guarded (CLI-010): one bad verb handler logs one line.
    const submitted = runGuardedAction(
      () =>
        engine.submitActionAs(entityId, selection.verb, {
          targetIds: selection.targetIds,
        }),
      log,
    );

    results.push({
      actorId: entityId,
      actorName: entity.name,
      verb: selection.verb,
      targetIds: selection.targetIds,
      profileId: selection.profileId,
      usedFallback: selection.usedFallback,
      reason: selection.reason,
      submitted,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// F-4b9c5aee — Companion turn driver: independent companion combat turns
// ---------------------------------------------------------------------------
//
// Recruited companions (companion-core.ts's 'recruit' verb, v2.8) sat fully
// wired into party state, tags, and faction, but NEVER took a turn — the
// per-round driver only ever advanced hostiles (runNpcTurns above). This is
// the missing wire: after hostiles act, every ACTIVE companion in the
// player's zone takes one action too, through the SAME guarded-submission
// discipline runNpcTurns uses.
//
// Decisions route through unified-decision.ts's `selectBestAction`
// (combat-intent + ability-intent merged), NOT cognition-core's
// `selectActionForEntity` — deliberately. None of the 5 owned starters'
// recruitable NPCs author an `entity.ai` block (they are plain recruit
// targets, not autonomous hostiles), and `selectActionForEntity` returns
// `null` for any entity lacking `.ai`. Routing companions through it would
// silently never act for a single one of them. `selectBestAction` is
// entity-agnostic — it needs no `ai.profileId`, only the entity + world +
// ability catalog — so a plain recruited NPC gets a real tactical choice.
// Target partitioning (who is an ally vs. an enemy to the companion) already
// works with zero changes here: companion-core's recruit handler sets a
// shared faction on the player and every recruit (F-cf1ddc9f), and
// targeting.ts's `affiliationOf` is faction-first, so combat-intent's
// `buildContext` naturally sorts the player and other companions into
// `ctx.allies` and hostiles into `ctx.enemies` — a companion structurally
// cannot select an attack against the player or another companion.

/** What one companion did on its turn — returned for tests and optional debug output. */
export type CompanionTurnResult = {
  actorId: string;
  actorName: string;
  verb: string;
  targetIds?: string[];
  /** Which advisor's action won the unified-decision merge ('combat' or 'ability'). */
  source: UnifiedActionSource;
  reason: string;
  /** False when the guarded submission threw (session survived; companion turn lost). */
  submitted: boolean;
};

/**
 * The party's ACTIVE companions (not dismissed/away), living, and standing in
 * the player's zone — the roster that takes a turn in `runCompanionTurns`.
 * Sorted by npcId for byte-deterministic acting order, same discipline
 * `listHostilesInPlayerZone` uses for hostiles. A companion left behind in
 * another zone (no party-follow mechanic exists) never acts here, mirroring
 * hostile turns' own zone-scoped cadence.
 */
function listActiveCompanionsInPlayerZone(world: WorldState): EntityState[] {
  const player = world.entities[world.playerId];
  if (!player) return [];
  const playerZone = player.zoneId ?? world.locationId;
  const party = getPartyState(world);

  return getActiveCompanions(party)
    .map((c) => world.entities[c.npcId])
    .filter(
      (e): e is EntityState =>
        !!e &&
        (e.resources.hp ?? 0) > 0 &&
        (e.zoneId ?? world.locationId) === playerZone,
    )
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Run one companion action for every active, living companion in the
 * player's zone.
 *
 * EARLY-RETURNS when the party is empty — copies the exact
 * `if (party.companions.length === 0) return;` gate world-tick's
 * `applyCompanionReactions` uses, so a companion-less pack NEVER submits an
 * action from this path (world.meta.tick advances only on submitActionAs, so
 * an empty-party round producing a stray submit would silently change the
 * tick count of every existing seed-0 playthrough that never recruits).
 *
 * Per companion:
 *  1. `selectBestAction` (unified-decision.ts) consults both the combat-intent
 *     and ability-intent advisors and returns the winning action —
 *     entity-agnostic, works for a plain recruited NPC with no `.ai` block.
 *  2. The chosen action is submitted via `engine.submitActionAs(entityId, …)`,
 *     under the same `runGuardedAction` wrapper hostile turns use, so one
 *     buggy verb handler degrades to a logged line instead of crashing the
 *     session.
 *  3. An ability-sourced choice threads `parameters.abilityId` — ability-core's
 *     `use-ability` handler resolves the ability by that field, not `toolId`.
 *
 * The roster is snapshotted before any companion acts (this round), then each
 * entry is re-checked against live state right before it acts: a companion
 * downed by a reactive effect mid-round loses its turn, and the round stops
 * early if the player is downed — same contract as `runNpcTurns`.
 */
export function runCompanionTurns(
  engine: Engine,
  opts: { log?: (msg: string) => void } = {},
): CompanionTurnResult[] {
  const log = opts.log ?? console.log;
  const results: CompanionTurnResult[] = [];

  const party = getPartyState(engine.world);
  if (party.companions.length === 0) return results;

  const playerId = engine.world.playerId;
  const abilities = getAbilityCatalog(engine);
  const roster = listActiveCompanionsInPlayerZone(engine.world).map((e) => e.id);

  for (const entityId of roster) {
    // Player downed mid-round → stop; the endgame screen takes over.
    const player = engine.world.entities[playerId];
    if (!player || (player.resources.hp ?? 0) <= 0) break;

    // Re-check liveness against live state — an earlier companion's/NPC's
    // action (or a reactive effect it triggered) may have downed this one.
    const entity = engine.world.entities[entityId];
    if (!entity || (entity.resources.hp ?? 0) <= 0) continue;

    // 1. Decision — guarded: a throwing advisor must not kill the round.
    let decision: ReturnType<typeof selectBestAction>;
    try {
      decision = selectBestAction(entity, engine.world, abilities);
    } catch (err) {
      log(`  (${entity.name} hesitates — its instincts failed: ${err instanceof Error ? err.message : String(err)})`);
      continue;
    }

    const chosen = decision.chosen;
    const targetIds = chosen.targetId ? [chosen.targetId] : undefined;

    // 2. Submission — guarded (CLI-010): one bad verb handler logs one line.
    const submitted = runGuardedAction(
      () =>
        engine.submitActionAs(entityId, chosen.verb, {
          targetIds,
          // Ability-sourced actions need the ability id threaded through so
          // ability-core's use-ability handler can resolve it — it reads
          // `action.parameters.abilityId`, not `toolId`. None of the 5 owned
          // starters' companions carry a tag that satisfies any authored
          // ability's requirements today (an honest ceiling, not an
          // oversight), so this branch is inert in current content but
          // correct for the first companion that ever qualifies.
          ...(chosen.source === 'ability' && chosen.abilityId
            ? { parameters: { abilityId: chosen.abilityId } }
            : {}),
        }),
      log,
    );

    results.push({
      actorId: entityId,
      actorName: entity.name,
      verb: chosen.verb,
      targetIds,
      source: chosen.source,
      reason: chosen.reason,
      submitted,
    });
  }

  return results;
}
