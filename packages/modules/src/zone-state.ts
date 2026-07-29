// zone-state.ts — scene descriptors + zone-state versioning (C3/P4).
//
// ⚠ THE MOAT BRIDGE. The charter says it plainly (§4 Pillar 2):
//
//   "districts, rosters, living economies, pursuit, and persistent consequences
//    are exactly what the genre's most-loved towns are made of — and no exemplar
//    simulates them. Zone-state versioning is the bridge that lets five cycles of
//    invisible depth become VISIBLE life: the town that really changes because the
//    economy really moved."
//
// Two vocabularies, and the split between them is the design:
//
// 1. SCENE DESCRIPTOR — stable KEYS the client's dioramas bind to. RG-C's decisive
//    finding is that HD-2D's look is wholly client-side, so the sim owes a
//    DESCRIPTOR, not geometry (Takahashi/Miyauchi 2018); zone records are canonical
//    content manifests the client fully realizes (OT2 2023); and — the load-bearing
//    constraint — state flags swap LIGHTING AND DRESSING VARIANTS, NEVER LAYOUT
//    (Triangle Strategy). So the descriptor carries no coordinates, no asset paths
//    and nothing whose change would move a wall.
//
// 2. ZONE CONDITION — a closed, ordinal enumeration, DERIVED rather than stored as
//    an independent number nobody updates. It reads what five cycles already
//    simulate: district stability and morale (district-core) and economy tone
//    (economy-core's own `deriveEconomyDescriptor`). A fifth free-floating scalar
//    would be exactly the "declared and never produced" shape v3.8 named as one of
//    the three ways to be dead.
//
// When the condition MOVES, `world.zone.state.changed` carries the transition and
// the CAUSE, and the descriptor's `variantTags` are re-derived at the same moment.
// That single event is the whole bridge: a real economy shock flips a real zone
// state, which flips the dressing variant the client renders.

import type { Engine, EngineModule, WorldState, ZoneState } from '@ai-rpg-engine/core';
import { getDistrictForZone, getDistrictState } from './district-core.js';
import { getDistrictEconomy, deriveEconomyDescriptor } from './economy-core.js';

/**
 * The closed, ORDINAL zone condition. Order is meaningful — index is severity —
 * so a consumer can compare two conditions without a lookup table.
 */
export const ZONE_CONDITIONS = ['intact', 'strained', 'occupied', 'damaged', 'ruined'] as const;
export type ZoneCondition = (typeof ZONE_CONDITIONS)[number];

/** Persisted per-zone condition + the descriptor variant it produced. */
export type ZoneStateRecord = {
  condition: ZoneCondition;
  /** Re-derived whenever `condition` moves. What the client binds to. */
  variantTags: string[];
  lastChangedTick: number;
};

export type ZoneStateModuleState = {
  byZone: Record<string, ZoneStateRecord>;
  /**
   * Per-district baseline, captured at FIRST observation: what this district
   * normally holds. Condition derives from movement away from it.
   *
   * Persisted, so a save/reload does not re-baseline a district that has already
   * fallen — which would silently declare a ruined town intact again.
   */
  baselines?: Record<string, { stability: number; morale: number }>;
};

export const ZONE_STATE_KEY = 'zone-state';

export function getZoneStateModuleState(world: WorldState): ZoneStateModuleState {
  const existing = world.modules[ZONE_STATE_KEY] as ZoneStateModuleState | undefined;
  if (existing) return existing;
  const fresh: ZoneStateModuleState = { byZone: {} };
  world.modules[ZONE_STATE_KEY] = fresh;
  return fresh;
}

export function getZoneCondition(world: WorldState, zoneId: string): ZoneCondition {
  return getZoneStateModuleState(world).byZone[zoneId]?.condition ?? 'intact';
}

// --- The derivation ---------------------------------------------------------

/**
 * Thresholds, expressed as a DROP FROM THE DISTRICT'S OWN BASELINE — not as
 * absolute values.
 *
 * ⚠ THIS IS A CORRECTION, AND THE MEASUREMENT THAT FORCED IT IS THE FINDING.
 *
 * The first draft used absolute cut-offs (stability ≤ 25 damaged, ≤ 10 ruined),
 * calibrated against the forge fixture's authored `stability: 45`. Run against the
 * catalog it reported EVERY ZONE IN EVERY PACK as `ruined` on the first tick —
 * 62 events across 12 packs — and that flood broke `bounty` opportunity
 * reachability catalog-wide.
 *
 * The reason, measured: `DEFAULT_METRICS.stability` is **5**, and across all 12
 * shipped packs all **27 districts sit at exactly the defaults (stability 5,
 * morale 50)** — not one authors `baseMetrics`. Only the forge fixture does. So in
 * this engine a low stability is the NORMAL RESTING STATE that events accrue
 * upward from, not a shock; an absolute threshold was measuring the engine's
 * defaults, not the world.
 *
 * This is C0's ledger entry 3 in a new costume — "a single-world probe measures the
 * world, not the engine" — and I calibrated against a single FIXTURE.
 *
 * The repair reuses reasoning the engine already documents. `DistrictEconomy`
 * carries a `baseline` for exactly this purpose, and its docstring says why:
 * recovery toward what a place normally holds "is also the only reading under
 * which 'this district is short of medicine' is a fact about the district rather
 * than a fact about how recently the world was created." Zone condition follows
 * the same rule: a district is damaged when it has FALLEN from what it normally
 * holds, whatever that happens to be.
 *
 * Deliberately coarse. A condition that flips on every point of drift is not a
 * STATE — it is a rounded-off scalar with a name, and a client re-dressing a town
 * every round is worse than one that never re-dresses.
 */
export const ZONE_STATE_THRESHOLDS = {
  /** Stability fallen this far below the district's baseline reads as damage. */
  damagedStabilityDrop: 20,
  /** …and this far below, ruin. */
  ruinedStabilityDrop: 40,
  /** Morale fallen this far below baseline reads as occupation/unrest. */
  occupiedMoraleDrop: 25,
  /** Economy tones that read as strain. */
  strainedTones: ['strained', 'crisis'] as readonly string[],
} as const;

/**
 * Derive a zone's condition from the strategic state that already exists.
 *
 * Pure: no RNG, no clock, no writes. Reads district stability/morale and the
 * economy tone, in severity order, and returns the first that matches — so a
 * ruined zone is never reported merely strained.
 *
 * A zone in NO district derives `intact` and says why through
 * {@link deriveZoneConditionWithReason}. That is not a bug and it is worth stating:
 * zone state rides the district layer, so a zone outside it has nothing to ride.
 */
export function deriveZoneConditionWithReason(
  world: WorldState,
  zoneId: string,
): { condition: ZoneCondition; cause: string } {
  const districtId = getDistrictForZone(world, zoneId);
  if (!districtId) {
    return { condition: 'intact', cause: 'zone belongs to no district — zone state rides the district layer' };
  }
  const district = getDistrictState(world, districtId);
  if (!district) {
    return { condition: 'intact', cause: `district "${districtId}" has no seeded state` };
  }

  // The district's own baseline — what it NORMALLY holds. Captured at first
  // observation and persisted, so condition is a fact about the district rather
  // than about the engine's defaults (see ZONE_STATE_THRESHOLDS).
  const baseline = baselineFor(world, districtId, district);
  const stabilityDrop = baseline.stability - district.stability;
  const moraleDrop = baseline.morale - district.morale;

  if (stabilityDrop >= ZONE_STATE_THRESHOLDS.ruinedStabilityDrop) {
    return {
      condition: 'ruined',
      cause: `district stability fell ${stabilityDrop} from its baseline of ${baseline.stability}`,
    };
  }
  if (stabilityDrop >= ZONE_STATE_THRESHOLDS.damagedStabilityDrop) {
    return {
      condition: 'damaged',
      cause: `district stability fell ${stabilityDrop} from its baseline of ${baseline.stability}`,
    };
  }
  if (moraleDrop >= ZONE_STATE_THRESHOLDS.occupiedMoraleDrop) {
    return {
      condition: 'occupied',
      cause: `district morale fell ${moraleDrop} from its baseline of ${baseline.morale}`,
    };
  }

  // The economy read — the moat's own surface. `deriveEconomyDescriptor` is
  // economy-core's OWN summariser, so "strained" means here exactly what it means
  // in the trade report a player already sees.
  const economy = getDistrictEconomy(world, districtId);
  if (economy) {
    const tone = deriveEconomyDescriptor(economy).overallTone;
    if (ZONE_STATE_THRESHOLDS.strainedTones.includes(tone)) {
      return { condition: 'strained', cause: `district economy is ${tone}` };
    }
  }

  return { condition: 'intact', cause: 'district stability, morale and economy are all at or near baseline' };
}

/**
 * Read (or capture) a district's baseline.
 *
 * First observation records the district's CURRENT metrics as its normal state, so
 * a world that has never been shocked is `intact` by construction whatever the
 * absolute numbers happen to be. Persisted afterwards, so a reload cannot
 * re-baseline a district that has already fallen — which would silently declare a
 * ruined town intact again.
 */
function baselineFor(
  world: WorldState,
  districtId: string,
  current: { stability: number; morale: number },
): { stability: number; morale: number } {
  const state = getZoneStateModuleState(world);
  state.baselines ??= {};
  const existing = state.baselines[districtId];
  if (existing) return existing;
  const captured = { stability: current.stability, morale: current.morale };
  state.baselines[districtId] = captured;
  return captured;
}

/**
 * The dressing variant a condition produces.
 *
 * STABLE KEYS, and that is the contract: the client binds to `dressing:damaged`,
 * not to an asset path or a layout. Triangle Strategy's rule — state flags swap
 * dressing variants, never layout — is enforced by the vocabulary itself, because
 * there is nothing here a renderer could interpret as geometry.
 */
export function variantTagsFor(condition: ZoneCondition): string[] {
  const tags = [`dressing:${condition}`];
  if (condition === 'damaged' || condition === 'ruined') tags.push('lighting:dim', 'props:rubble');
  if (condition === 'occupied') tags.push('props:checkpoint');
  if (condition === 'strained') tags.push('props:sparse');
  return tags;
}

// --- The step ---------------------------------------------------------------

/**
 * Re-derive every zone's condition; emit `world.zone.state.changed` for each one
 * that MOVED.
 *
 * Called from the world tick. Emits nothing when nothing crossed a threshold,
 * which is the property the RED control checks: a state that fires every round is
 * not a state.
 */
export function runZoneStateStep(
  engine: Engine,
): Array<{ zoneId: string; from: ZoneCondition; to: ZoneCondition; cause: string }> {
  const world = engine.store.state;
  const state = getZoneStateModuleState(world);
  const changes: Array<{ zoneId: string; from: ZoneCondition; to: ZoneCondition; cause: string }> = [];

  for (const zone of Object.values(world.zones)) {
    const { condition, cause } = deriveZoneConditionWithReason(world, zone.id);
    const previous = state.byZone[zone.id];
    const from = previous?.condition ?? 'intact';

    if (previous !== undefined && previous.condition === condition) continue;

    // ⚠ FIRST OBSERVATION IS NOT A CHANGE — recorded silently, whatever the
    // condition. An event named `state.changed` must mean something MOVED, and a
    // world's opening state moved from nothing.
    //
    // Measured, not assumed: with the first draft's "emit unless intact" rule,
    // `ashfall-dead` fired five events on its very first tick. That was not a
    // defect in the derivation — the zombie pack's genre supply profile authors a
    // genuinely scarce economy, so `strained` is correct — but a client would have
    // received five "the town just changed" notifications about a town that had
    // always been that way. Authored initial state and a shock are different facts
    // and must not share an event.
    if (previous === undefined) {
      state.byZone[zone.id] = {
        condition,
        variantTags: variantTagsFor(condition),
        lastChangedTick: world.meta.tick,
      };
      continue;
    }

    state.byZone[zone.id] = {
      condition,
      variantTags: variantTagsFor(condition),
      lastChangedTick: world.meta.tick,
    };

    engine.store.emitEvent(
      'world.zone.state.changed',
      {
        zoneId: zone.id,
        zoneName: zone.name,
        from,
        to: condition,
        // The CAUSE, named. A state change with no cause is a mystery the player
        // reads as a bug; this is what makes the shock legible.
        cause,
        variantTags: variantTagsFor(condition),
        ...(zone.scene !== undefined ? { scene: zone.scene } : {}),
      },
      { visibility: 'public', presentation: { channels: ['narrator'], priority: 'high' } },
    );
    changes.push({ zoneId: zone.id, from, to: condition, cause });
  }

  return changes;
}

/** The module — persistence namespace only; the step runs from the world tick. */
export const zoneStateCore: EngineModule = {
  id: 'zone-state-core',
  version: '1.0.0',
  register(ctx) {
    ctx.persistence.registerNamespace(ZONE_STATE_KEY, { byZone: {} } as ZoneStateModuleState);
  },
};

/**
 * The client-facing read: a zone's descriptor MERGED with its current dressing
 * variant.
 *
 * This is what a diorama binds to — the authored keys plus the state-derived ones,
 * in one object, so the client never has to know which came from where.
 */
export function resolveSceneDescriptor(
  world: WorldState,
  zoneId: string,
): (NonNullable<ZoneState['scene']> & { variantTags: string[]; condition: ZoneCondition }) | undefined {
  const zone = world.zones[zoneId];
  if (!zone) return undefined;
  const record = getZoneStateModuleState(world).byZone[zoneId];
  const condition = record?.condition ?? 'intact';
  return {
    ...(zone.scene ?? {}),
    condition,
    variantTags: record?.variantTags ?? variantTagsFor(condition),
  };
}
