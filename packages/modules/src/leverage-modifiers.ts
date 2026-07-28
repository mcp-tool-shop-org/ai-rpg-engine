// leverage-modifiers — the composition seam between the two passive bundles
// and the resolution functions that spend them.
//
// companion-core.ts has carried this note since v2.8:
//
//   "The other six AbilityModifiers fields ... have NO equivalent generic
//    consumption layer to piggyback on today — player-leverage.ts's
//    resolveSocialAction takes a hardcoded SOCIAL_REQUIREMENTS cost table with
//    no external-modifier parameter, and district-mood.ts's own
//    DistrictModifiers sit in the identical unwired gap. Deferred to a
//    follow-up wave explicitly scoped to thread BOTH modifier bundles into
//    their resolution functions together — named here so it isn't silently
//    dropped."
//
// This file is that wave's seam, and it exists as a separate module rather
// than as a helper inside player-leverage.ts for one reason: DECOMPOSE_BY_
// SECRETS. Resolution functions take modifier PARAMETERS and know nothing
// about parties or district moods. Everything that knows what a companion is,
// or what a district feels like, lives here. Swap either bundle and only this
// file changes.
//
// LEGIBILITY IS THE POINT, not the arithmetic. Juul & Begy 2016 (Good Feedback
// for Bad Players?, FDG/DiGRA) put two mechanically IDENTICAL versions of a
// game in front of players, differing only in feedback, and the high-feedback
// one was rated the better game. A computed-but-unrendered modifier is
// experientially identical to no modifier at all — which is this cycle's whole
// thesis, measured. So every composed contribution carries a name and a source
// through to the resolution payload; see ModifierAttribution in
// player-leverage.ts.

import type { EntityState, WorldState } from '@ai-rpg-engine/core';
import { computeAbilityModifiers, computePartyAbilities, getPartyState } from './companion-core.js';
import { computeDistrictMood, computeDistrictModifiers } from './district-mood.js';
import { getDistrictForZone, getDistrictState, getDistrictDefinition } from './district-core.js';
import { getEntityFaction } from './faction-cognition.js';
import type { ExternalLeverageModifiers } from './player-leverage.js';

/**
 * Compose the party's and the district's passive contributions for one actor.
 *
 * Returns `{}` — not a bundle of neutral values — when neither has anything to
 * say. That is load-bearing: `resolveSocialAction` drops its `modifiers` field
 * entirely on an empty composition, so a world with no companions standing in
 * a neutral district resolves byte-identically to its pre-v3.7 self. The
 * no-new-namespace-defaults contract, applied to a payload.
 */
export function composeLeverageModifiers(
  world: WorldState,
  actor: EntityState,
  targetFactionId?: string,
): ExternalLeverageModifiers {
  const composed: ExternalLeverageModifiers = {};

  // --- Party ---
  const party = getPartyState(world);
  const active = party.companions.filter((c) => c.active);
  if (active.length > 0) {
    // A companion's faction is not on CompanionState — it lives in
    // faction-cognition's membership registry, the same place npc-agency reads
    // it. Looked up rather than duplicated onto the party record so the two
    // can never disagree about who someone answers to.
    const factionIds = Object.fromEntries(
      active.map((c) => [c.npcId, getEntityFaction(world, c.npcId) ?? null]),
    );
    const mods = computeAbilityModifiers(computePartyAbilities(party), factionIds);

    // Sorted, so the attributed source is a stable function of the party
    // rather than of join order.
    const source = active.map((c) => c.npcId).sort().join('+');

    if (mods.leverageCostDiscount > 0) {
      composed.companionDiscount = { amount: mods.leverageCostDiscount, source };
    }
    // reputationBonus is per-faction: only the faction being acted ON can
    // benefit, which is what makes it a party-composition decision rather
    // than a flat rate ("you brought someone the Guild listens to").
    const repBonus = targetFactionId ? mods.reputationBonus[targetFactionId] : undefined;
    if (repBonus) {
      composed.companionReputationBonus = { amount: repBonus, source };
    }
  }

  // --- District ---
  const districtId = actor.zoneId ? getDistrictForZone(world, actor.zoneId) : undefined;
  if (districtId) {
    const state = getDistrictState(world, districtId);
    if (state) {
      const tags = getDistrictDefinition(world, districtId)?.tags ?? [];
      const scale = computeDistrictModifiers(computeDistrictMood(state, tags)).leverageCostScale;
      // Exactly 1.0 is the neutral reading and must not produce an entry —
      // an attribution saying "this changed nothing" is noise, and it would
      // also break the byte-identical guarantee above.
      if (scale !== 1) {
        composed.districtCostScale = { scale, source: districtId };
      }
    }
  }

  return composed;
}
