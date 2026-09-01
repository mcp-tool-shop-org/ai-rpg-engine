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
import { resolveEntityFaction } from './faction-cognition.js';
import type { ExternalLeverageModifiers } from './player-leverage.js';
import type { TradeContext } from './trade-value.js';

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
    // faction-route prefers CompanionState.originFaction (the guild they
    // came from, F-14feff64) over the living party faction
    // resolveEntityFaction now returns after recruit.
    const factionIds = Object.fromEntries(
      active.map((c) => {
        const origin = c.originFaction;
        if (c.abilityTags.includes('faction-route') && origin) {
          return [c.npcId, origin];
        }
        return [c.npcId, resolveEntityFaction(world, c.npcId) ?? null];
      }),
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
    if (mods.rumorSuppressionChance > 0) {
      composed.rumorSuppression = { strength: mods.rumorSuppressionChance, source };
    }
    // Held, not committed: the district's own rumor scale multiplies onto this
    // below, and the composed pair ships as ONE attribution naming both — the
    // player's decision is "who I brought, and where I did it", which is a
    // single choice with two halves rather than two independent bonuses.
    if (mods.rumorSpreadScale !== 1) {
      composed.rumorSpreadScale = { scale: mods.rumorSpreadScale, source };
    }
  }

  // --- District ---
  const districtId = actor.zoneId ? getDistrictForZone(world, actor.zoneId) : undefined;
  if (districtId) {
    const state = getDistrictState(world, districtId);
    if (state) {
      const tags = getDistrictDefinition(world, districtId)?.tags ?? [];
      const district = computeDistrictModifiers(computeDistrictMood(state, tags));

      // Exactly 1.0 is the neutral reading and must not produce an entry —
      // an attribution saying "this changed nothing" is noise, and it would
      // also break the byte-identical guarantee above.
      if (district.leverageCostScale !== 1) {
        composed.districtCostScale = { scale: district.leverageCostScale, source: districtId };
      }

      // The composed pair. A talkative companion in a gossipy district carries
      // further than either alone, so these MULTIPLY — and they ship as one
      // attribution naming both sources, because a UI that showed two separate
      // "rumor spread" lines would be describing two systems where the player
      // made one decision.
      const partyScale = composed.rumorSpreadScale?.scale ?? 1;
      const combined = partyScale * district.rumorSpreadScale;
      if (combined !== 1) {
        composed.rumorSpreadScale = {
          scale: combined,
          source: composed.rumorSpreadScale
            ? `${composed.rumorSpreadScale.source} in ${districtId}`
            : districtId,
        };
      } else {
        delete composed.rumorSpreadScale;
      }
    }
  }

  return composed;
}

/**
 * The trade half of the same seam: the district MOOD's price scale and the
 * party's flat commerce bonus, composed for one actor.
 *
 * Separate from `composeLeverageModifiers` because trade and social resolution
 * spend different fields and share no consumer — folding them into one bundle
 * would make every trade recompute a leverage discount it never reads.
 * Returns `undefined` (not an empty object) when neither applies, so
 * `computeItemValue` sees no `externalModifiers` key at all and every existing
 * TradeContext keeps its exact arithmetic.
 */
export function composeTradeModifiers(
  world: WorldState,
  actor: EntityState,
): TradeContext['externalModifiers'] {
  const composed: NonNullable<TradeContext['externalModifiers']> = {};

  const active = getPartyState(world).companions.filter((c) => c.active);
  if (active.length > 0) {
    const mods = computeAbilityModifiers(computePartyAbilities(getPartyState(world)));
    if (mods.commerceGainBonus > 0) {
      composed.companionCommerceBonus = {
        amount: mods.commerceGainBonus,
        source: active.map((c) => c.npcId).sort().join('+'),
      };
    }
  }

  const districtId = actor.zoneId ? getDistrictForZone(world, actor.zoneId) : undefined;
  if (districtId) {
    const state = getDistrictState(world, districtId);
    if (state) {
      const tags = getDistrictDefinition(world, districtId)?.tags ?? [];
      const scale = computeDistrictModifiers(computeDistrictMood(state, tags)).tradePriceScale;
      if (scale !== 1) composed.districtMoodScale = { scale, source: districtId };
    }
  }

  return Object.keys(composed).length > 0 ? composed : undefined;
}

/**
 * The craft half of the same seam: DistrictModifiers.craftingEfficiency,
 * composed for one actor. Emits `{scale, source}` only when scale !== 1 so
 * every hand-built CraftingContext keeps its exact material cost.
 * buildCraftingContext attaches the result (F-88872722).
 */
export function composeCraftModifiers(
  world: WorldState,
  actor: EntityState,
): { scale: number; source: string } | undefined {
  const districtId = actor.zoneId ? getDistrictForZone(world, actor.zoneId) : undefined;
  if (!districtId) return undefined;
  const state = getDistrictState(world, districtId);
  if (!state) return undefined;
  const tags = getDistrictDefinition(world, districtId)?.tags ?? [];
  const scale = computeDistrictModifiers(computeDistrictMood(state, tags)).craftingEfficiency;
  if (scale === 1) return undefined;
  return { scale, source: districtId };
}
