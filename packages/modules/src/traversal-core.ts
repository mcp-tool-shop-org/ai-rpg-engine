// traversal-core — movement between zones

import type { Engine, EngineModule, ActionIntent, WorldState, ResolvedEvent } from '@ai-rpg-engine/core';
import { makeEvent } from './make-event.js';
import { getDistrictForZone, getDistrictDefinition, getDistrictState } from './district-core.js';
import { getDistrictEconomy, deriveEconomyDescriptor, formatEconomyForDirector } from './economy-core.js';
import { computeDistrictMood, formatDistrictMoodForNarrator, type DistrictMood } from './district-mood.js';
import { getPersistedMoveRecommendation } from './move-advisor.js';
import { evaluateConditions } from './condition-eval.js';
import { applyZoneItemRecognition } from './item-recognition.js';

export const traversalCore: EngineModule = {
  id: 'traversal-core',
  version: '0.1.0',

  register(ctx) {
    ctx.actions.registerVerb('move', moveHandler);

    ctx.actions.registerVerb('inspect', inspectHandler);
  },
};

function moveHandler(action: ActionIntent, world: WorldState): ResolvedEvent[] {
  /**
   * A soft gate's warning, held until the move succeeds so the two events are
   * emitted in causal order (warned, then entered) rather than the warning
   * arriving for a move that then failed for an unrelated reason.
   */
  let softWarning: ResolvedEvent | undefined;

  const targetZoneId = action.targetIds?.[0];
  if (!targetZoneId) {
    return [makeEvent(action, 'action.rejected', { reason: 'no target zone specified' })];
  }

  // Resolve the actor from action.actorId (falling back to playerId for
  // back-compat with hand-built actions that never set it), matching every
  // sibling verb handler (attack, guard, disengage, brace, reposition,
  // use-ability). Previously this handler ignored action.actorId entirely and
  // always checked adjacency from world.locationId / moved the player — so a
  // non-player actor submitting 'move' via Engine.submitActionAs got wrong
  // adjacency checks against the PLAYER's zone and, on success, silently
  // teleported the PLAYER while leaving the real actor unmoved (F-5ce40588).
  const actorId = action.actorId || world.playerId;
  const actor = world.entities[actorId];
  if (!actor) {
    return [makeEvent(action, 'action.rejected', { reason: `actor not found: ${actorId}` })];
  }

  const actorZoneId = actor.zoneId ?? world.locationId;
  const currentZone = world.zones[actorZoneId];
  if (!currentZone) {
    return [makeEvent(action, 'action.rejected', { reason: 'current zone not found' })];
  }

  // Check adjacency from the ACTOR's own zone, not the player's.
  if (!currentZone.neighbors.includes(targetZoneId)) {
    return [makeEvent(action, 'action.rejected', { reason: `cannot reach ${targetZoneId} from ${currentZone.id}` })];
  }

  const targetZone = world.zones[targetZoneId];
  if (!targetZone) {
    return [makeEvent(action, 'action.rejected', { reason: `zone ${targetZoneId} does not exist` })];
  }

  // --- C3/P2: the entry gate --------------------------------------------
  //
  // Evaluated HERE — after adjacency and target-existence, before the mutation.
  // The position is the contract: a gate that refuses after the actor has moved
  // is not a gate, and a gate checked before adjacency would report "you need the
  // rope" for a zone the player cannot reach anyway.
  //
  // A zone with no gate takes no branch and is byte-identical to before this
  // field existed, which is what keeps the twelve shipped packs unchanged.
  const gate = targetZone.entryGate;
  if (gate) {
    const { met, unmet } = evaluateConditions(gate.conditions ?? [], world, actorId);
    if (!met) {
      const payload = {
        zoneId: targetZoneId,
        zoneName: targetZone.name,
        fromZoneId: currentZone.id,
        mode: gate.mode,
        // The AUTHORED message, verbatim. The fallback is deliberately plain:
        // an author who wrote no reason gets a true statement, not invented prose.
        reason: gate.reason ?? `${targetZone.name} is closed to you.`,
        unmet: unmet.map((u) => ({ type: u.condition.type, reason: u.reason, unevaluable: u.unevaluable })),
      };

      if (gate.mode === 'hard') {
        // REFUSED. The actor does not move and `world.locationId` does not change.
        return [
          makeEvent(action, 'world.zone.gate.refused', payload, {
            presentation: {
              channels: ['objective'],
              priority: 'high',
              soundCues: ['gate.refused'],
            },
          }),
        ];
      }

      // SOFT: warn AND permit. The warning rides the same payload shape so a
      // renderer has one case, not two, and then the move proceeds below exactly
      // as an ungated one would.
      softWarning = makeEvent(action, 'world.zone.gate.warned', payload, {
        presentation: { channels: ['narrator'], priority: 'normal' },
      });
    }
  }

  // Move the ACTOR. world.locationId (the "current scene" pointer) only
  // follows the PLAYER — an NPC/companion moving around must never change
  // what zone the player-facing scene is anchored to.
  actor.zoneId = targetZoneId;
  if (actorId === world.playerId) {
    world.locationId = targetZoneId;
  }

  // F-99de2f57: district-mood walk-in line. computeDistrictMood already runs
  // every round for every district that resolves elsewhere (strategic-map,
  // world-tick, leverage-modifiers, companion-reactions, npc-agency,
  // crafting-recipes) — walking INTO a district was the one silent path. An
  // unmapped zone (no district) stays byte-identical to today's four-key
  // payload.
  //
  // F-32948b79 tone-on-event: ALSO attach the raw `tone` value (the 6-value
  // DistrictMood['tone'] enum) beside moodHint, computed from the SAME
  // computeDistrictMood call rather than a second one. Consumers: media's
  // tone->mood bridge and cli-surface's zone-entry music wiring (their own
  // work, not this file's). Truthy-gated like moodHint/situationHint — an
  // unmapped zone stays byte-identical (no tone key at all).
  const { moodHint, tone } = zoneMoodFields(world, targetZoneId);

  const entered = makeEvent(action, 'world.zone.entered', {
    zoneId: targetZoneId,
    zoneName: targetZone.name,
    previousZoneId: currentZone.id,
    tags: targetZone.tags,
    ...(moodHint ? { moodHint } : {}),
    ...(tone ? { tone } : {}),
  }, {
    presentation: {
      channels: ['objective'],
      priority: 'normal',
      soundCues: ['scene.enter'],
    },
  });

  // F-29f4a5ff: equipped-item recognition against this zone's controlling
  // faction. No-op when the actor carries nothing with provenance.
  const recognition = applyZoneItemRecognition(action, world, targetZoneId);

  // A soft gate's warning precedes the entry it did not prevent.
  return softWarning ? [softWarning, entered, ...recognition] : [entered, ...recognition];
}

function inspectHandler(action: ActionIntent, world: WorldState): ResolvedEvent[] {
  const targetId = action.targetIds?.[0];

  // Inspect current zone if no target
  if (!targetId) {
    // Report the ACTOR's own zone, not the player's — a non-player actor
    // issuing a targetless 'inspect' via submitActionAs should see its own
    // surroundings, not the player's (F-08f214dd).
    const actorId = action.actorId || world.playerId;
    const actorZoneId = world.entities[actorId]?.zoneId ?? world.locationId;
    const zone = world.zones[actorZoneId];
    if (!zone) {
      return [makeEvent(action, 'action.rejected', { reason: 'no zone to inspect' })];
    }

    const entities = Object.values(world.entities).filter(e => e.zoneId === zone.id);

    // F-5ef2c8f5: single-district trade drill-down. When this zone resolves
    // to a district WITH a seeded economy (economy-core's write-wire,
    // F-d0b5edb5 — a pack with no districts, or one whose zone maps to no
    // district, simply has neither), append the detailed single-district
    // economy report alongside the zone facts already returned above. No new
    // verb, no menu entry — this only enriches the existing 'inspect'
    // payload. A zone with no district resolves byte-identically to before
    // (the spread below adds nothing).
    const districtId = getDistrictForZone(world, zone.id);
    const districtEconomy = districtId ? getDistrictEconomy(world, districtId) : undefined;

    // F-7d890283: the same player-facing strategic-map line runMoveAdvisorStep
    // already persists this round (world-tick.ts) — read here, never
    // recomputed, so there is exactly one buildStrategicMap call per round.
    // World-level (not district-scoped), so it rides beside economyReport as
    // its own independent conditional, not nested inside the districtId gate.
    const situationHint = getPersistedMoveRecommendation(world)?.situationHint;

    return [makeEvent(action, 'world.zone.inspected', {
      zoneId: zone.id,
      zoneName: zone.name,
      tags: zone.tags,
      entities: entities.map(e => ({ id: e.id, name: e.name, type: e.type, tags: e.tags })),
      interactables: zone.interactables ?? [],
      exits: zone.neighbors,
      hazards: zone.hazards ?? [],
      ...(districtId && districtEconomy
        ? {
            districtId,
            economyReport: formatEconomyForDirector(
              districtId,
              getDistrictDefinition(world, districtId)?.name ?? districtId,
              districtEconomy,
              deriveEconomyDescriptor(districtEconomy),
            ),
          }
        : {}),
      ...(situationHint ? { situationHint } : {}),
    })];
  }

  // Inspect a specific entity
  const entity = world.entities[targetId];
  if (!entity) {
    return [makeEvent(action, 'action.rejected', { reason: `nothing to inspect: ${targetId}` })];
  }

  return [makeEvent(action, 'world.entity.inspected', {
    entityId: entity.id,
    name: entity.name,
    type: entity.type,
    tags: entity.tags,
    stats: entity.stats,
    resources: entity.resources,
    statuses: entity.statuses.map(s => s.statusId),
  })];
}

/** Shared by moveHandler and emitZoneEnteredForPlacement so both derive
 * moodHint/tone from the SAME computeDistrictMood call. An unmapped zone
 * (no district) returns both fields undefined. */
function zoneMoodFields(world: WorldState, zoneId: string): { moodHint?: string; tone?: DistrictMood['tone'] } {
  const districtId = getDistrictForZone(world, zoneId);
  const districtState = districtId ? getDistrictState(world, districtId) : undefined;
  const districtDef = districtId ? getDistrictDefinition(world, districtId) : undefined;
  const districtMood = districtState && districtDef
    ? computeDistrictMood(districtState, districtDef.tags)
    : undefined;
  const moodHint = districtMood && districtDef
    ? formatDistrictMoodForNarrator(districtMood, districtDef.name)
    : undefined;
  return { moodHint, tone: districtMood?.tone };
}

/**
 * F-96e9a5f4 — synthesize a `world.zone.entered` event for a zone the player
 * was PLACED into rather than walked into. world.zone.entered has exactly
 * one production emitter anywhere in this repo: moveHandler above, inside
 * the 'move' verb. But Engine.setPlayerLocation (packages/core/src/world.ts
 * — outside this domain) sets locationId/the player entity's zoneId directly
 * and emits NOTHING; this primitive is exercised in production by the CLI
 * sidecar's `--start <zone>` boot path (packages/cli/src/sidecar-command.ts,
 * `engine.store.setPlayerLocation(zoneId)`), used to place the player in
 * their authored starting zone. Skipping world.zone.entered means every
 * zone-entry LISTENER in this package silently never runs for a sidecar
 * session's starting zone — engagement-core's positional texture,
 * encounter-spawn's zone-entry cursor, district-core's and cognition-core's
 * own listeners among them — and no tone/moodHint ever reaches the opening
 * scene.
 *
 * This is the modules-side half of the fix. Built from `store.emitEvent`
 * (the same primitive encounter-spawn.ts's trySpawn already uses for its own
 * synthesized event) rather than `makeEvent`, because a session-start
 * placement has no ActionIntent to hang off of. `previousZoneId` is
 * deliberately omitted — there is no "from" zone for a session start, and
 * every consumer already treats it as optional (hazard-interpreter.ts's
 * on-exit half no-ops without it, exactly as it should here).
 *
 * Caller contract: call this AFTER `engine.store.setPlayerLocation(zoneId)`,
 * e.g. `engine.store.setPlayerLocation(zoneId);
 * emitZoneEnteredForPlacement(engine, zoneId);`. The CLI's sidecar `--start`
 * boot path (packages/cli/src/sidecar-command.ts, the
 * `engine.store.setPlayerLocation(zoneId)` call site) should make that
 * second call — packages/cli sits outside packages/modules/** and is not
 * edited here; naming the exact call site for the coordinator's cross-domain
 * stitch. Returns undefined (and records nothing) if `zoneId` does not name
 * a real zone, mirroring moveHandler's own zone-existence check.
 */
export function emitZoneEnteredForPlacement(engine: Engine, zoneId: string): ResolvedEvent | undefined {
  const world = engine.store.state;
  const zone = world.zones[zoneId];
  if (!zone) return undefined;

  const { moodHint, tone } = zoneMoodFields(world, zoneId);

  return engine.store.emitEvent('world.zone.entered', {
    zoneId,
    zoneName: zone.name,
    tags: zone.tags,
    ...(moodHint ? { moodHint } : {}),
    ...(tone ? { tone } : {}),
  }, {
    actorId: world.playerId,
    presentation: {
      channels: ['objective'],
      priority: 'normal',
      soundCues: ['scene.enter'],
    },
  });
}

