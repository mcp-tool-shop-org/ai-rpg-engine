// hazard-interpreter.ts — typed hazards as DATA (C3/P3).
//
// ⚠ THE SHARPEST MEASUREMENT IN THE WHOLE ARC, and this file is its repair.
//
// C0 §3.2 swept one zone field two ways across all twelve shipped worlds: adding
// `'unstable floor'` — which starter-fantasy's closure matches at setup.ts:137 —
// moved the simulation. Adding `'loose cobbles'` — which no closure anywhere
// references — moved NOTHING, in any world. The conclusion:
//
//   "Hazard strings carry no engine semantics; their meaning is JavaScript the
//    pack ships. A data-only JSON export ships no closures, so the one
//    rule-bearing zone field the lane transports faithfully still arrives inert."
//
// C1 re-confirmed it on CONVERTED content in both directions and refused to paper
// over it. C0 §9 called typed hazards "the highest-value single item, because it
// closes a structural hole rather than a wire hole: today hazard meaning lives in
// pack closures, so NO data format can express it."
//
// This is that format's interpreter. `'loose cobbles'` as a typed HazardSpec moves
// the simulation with no pack code — and `'loose cobbles'` as a bare STRING stays
// exactly as inert as C0 measured it, deliberately, because that contrast IS the
// finding and losing it would cost more than the fix is worth.
//
// ── Two structural facts that shaped the design ──────────────────────────────
//
// 1. NAME COLLISION, resolved. `environment-core` already exports a type called
//    `HazardDefinition` whose `condition`/`effect` are CLOSURES. World Forge
//    exports a type called `HazardDefinition` that is DATA. Two different things
//    under one name across a wire is how a silent divergence starts, so the wire
//    type is `HazardSpec` (in content-schema) and the closure type keeps its name.
//    The interpreter converts spec → closure shape, which means the data path and
//    the code path SHARE ONE EXECUTION SITE (`checkHazard`) rather than running
//    two engines side by side.
//
// 2. NOT ROUTABLE POST-BOOT VIA CONFIG — measured, not assumed.
//    `createEnvironmentCore(config)` closure-captures `config.hazards` and
//    registers one event listener PER HAZARD inside `register()`. So a post-boot
//    write cannot add a listener: the same structural class as
//    `progressionTrees`, which C1 measured and reported rather than pretending.
//    The fix is the pattern `encounter-spawn` already proved — a module-side
//    registry keyed by `world.meta.gameId`, consulted at trigger time by ONE
//    listener registered at construction. A registration after boot is therefore
//    seen by every later trigger, which is what makes the intake channel real.
//
// ── The escape hatch stays ───────────────────────────────────────────────────
//
// OpenRA's mature endpoint (RG-C1 Lane 1) is data-by-default with a DECLARED code
// escape hatch in one manifest. Pack-supplied hazard closures still work, exactly
// as before; typed hazards are the default, and the closure path is the declared
// hatch for meaning the closed vocabulary cannot express.

import type { Engine, EntityState, ResolvedEvent, WorldState } from '@ai-rpg-engine/core';
import { applyStatus } from './status-core.js';
import { makeProcContext, processStatusTriggers } from './status-effects.js';

// --- The closed effect vocabulary (mirrors world-forge's HazardEffect) -------

export type HazardEffectSpec =
  | {
      kind: 'damage';
      amount: number;
      amountIsPercentMaxHp?: boolean;
      tickOn: 'turn-start' | 'turn-end';
      durationTicks?: number;
    }
  | { kind: 'status'; statusId: string; chance: number; stacking: 'refresh' | 'stack' | 'ignore' }
  | { kind: 'instakill' }
  | { kind: 'ignite'; igniteChance: number };

export type HazardSpec = {
  id: string;
  name: string;
  effects: HazardEffectSpec[];
  trigger: 'on-enter' | 'per-turn' | 'on-exit' | 'timed';
  moveCostDelta?: number;
  passable?: 'yes' | 'flying-only' | 'never';
  blocksVision?: boolean;
  weatherConditions?: string[];
  immuneTags?: string[];
  tags: string[];
};

/**
 * ⚠ THE SYSTEM-WIDE COMPOSITION CAP (RG-C1 Lane 2; Churchill et al.,
 * arXiv:1904.09828 — composition of individually-bounded effects is Turing
 * complete, so the bound must be on the SYSTEM, not the operand).
 *
 * `hazard → status → reactive trigger → hazard` is a real cycle: status-core runs
 * reactive triggers on damage, and a triggered effect can re-enter a zone check.
 * `status-effects.ts` already ships a `PROC_DEPTH_LIMIT` with a fiat halt for
 * exactly this shape; this is the same idiom for the same reason, exported so a
 * test pins the threshold rather than a magic number.
 *
 * A cap with no test that REACHES it is a cap nobody has measured, so
 * `c3-typed-hazards.test.ts` drives a cycle fixture into it.
 */
export const HAZARD_DEPTH_LIMIT = 4;

/** How a hazard resolution ended, for the report and the tests. */
export type HazardApplication = {
  hazardId: string;
  zoneId: string;
  entityId: string;
  /** Effect kinds that actually executed. */
  applied: string[];
  /** Effect kinds carried but NOT executed, with why. */
  skipped: Array<{ kind: string; reason: string }>;
};

type RegistryEntry = {
  specsById: Map<string, HazardSpec>;
  /** zoneId → hazard ids active there, from `ZoneState.hazardRefs`. */
  byZone: Record<string, string[]>;
  /** Status ids the pack declares, for live resolution. */
  knownStatusIds: Set<string>;
};

const registry = new Map<string, RegistryEntry>();

/** Exposed for tests: drop a pack's registered typed hazards. */
export function unregisterTypedHazards(gameId: string): void {
  registry.delete(gameId);
}

/**
 * Register typed hazards for a booted world.
 *
 * Merge semantics match `mergeEncounterSpawnContent`: specs are added, an id
 * already registered WINS (code is the more specific authority), and a zone's
 * ref list is REPLACED rather than concatenated so re-ingesting the same pack
 * twice does not double its hazards.
 */
export function registerTypedHazards(
  gameId: string,
  specs: readonly HazardSpec[],
  byZone: Record<string, string[]>,
  knownStatusIds: readonly string[] = [],
): { skippedIds: string[] } {
  const entry: RegistryEntry = registry.get(gameId) ?? {
    specsById: new Map(),
    byZone: {},
    knownStatusIds: new Set(),
  };
  const skippedIds: string[] = [];
  for (const spec of specs) {
    if (entry.specsById.has(spec.id)) {
      skippedIds.push(spec.id);
      continue;
    }
    entry.specsById.set(spec.id, spec);
  }
  for (const [zoneId, ids] of Object.entries(byZone)) entry.byZone[zoneId] = [...ids];
  for (const id of knownStatusIds) entry.knownStatusIds.add(id);
  registry.set(gameId, entry);
  return { skippedIds };
}

export function getTypedHazardsForZone(world: WorldState, zoneId: string): HazardSpec[] {
  const entry = registry.get(world.meta.gameId);
  if (!entry) return [];
  return (entry.byZone[zoneId] ?? [])
    .map((id) => entry.specsById.get(id))
    .filter((s): s is HazardSpec => s !== undefined);
}

// --- Gating -----------------------------------------------------------------

/** Immunity: any matching tag on the entity exempts it entirely. */
function isImmune(spec: HazardSpec, entity: EntityState): boolean {
  if (!spec.immuneTags || spec.immuneTags.length === 0) return false;
  return spec.immuneTags.some((t) => entity.tags.includes(t));
}

/**
 * Weather gating. A hazard with `weatherConditions` is active only under one of
 * them.
 *
 * ⚠ NO WEATHER SOURCE EXISTS in this engine — measured, like the gate operands in
 * C3/P2. `world.globals.weather` is the convention this reads, and when nothing
 * sets it the hazard is treated as ACTIVE and the caller reports the gate
 * UNEVALUABLE. Fail-OPEN here, unlike a gate's fail-closed, and deliberately: a
 * hazard that silently stops existing is a floor the player walks over safely by
 * accident, which is worse than one that fires when it should not — and either way
 * it is REPORTED rather than guessed at silently.
 */
function weatherAllows(spec: HazardSpec, world: WorldState): { active: boolean; evaluable: boolean } {
  if (!spec.weatherConditions || spec.weatherConditions.length === 0) {
    return { active: true, evaluable: true };
  }
  const current = world.globals['weather'];
  if (typeof current !== 'string' || current.length === 0) {
    return { active: true, evaluable: false };
  }
  return { active: spec.weatherConditions.includes(current), evaluable: true };
}

/**
 * Whether a hazard blocks entry, for traversal-core.
 *
 * `never` refuses outright; `flying-only` refuses unless the actor carries a
 * flight tag. This shares the move handler's refusal path with entry gates — one
 * refusal mechanism, two reasons — rather than inventing a second way to say no.
 */
export function hazardBlocksEntry(
  world: WorldState,
  zoneId: string,
  entity: EntityState,
): { blocked: boolean; hazardName?: string; reason?: string } {
  for (const spec of getTypedHazardsForZone(world, zoneId)) {
    if (isImmune(spec, entity)) continue;
    if (!weatherAllows(spec, world).active) continue;
    if (spec.passable === 'never') {
      return { blocked: true, hazardName: spec.name, reason: `${spec.name} makes this impassable.` };
    }
    if (spec.passable === 'flying-only' && !entity.tags.some((t) => t === 'flying' || t === 'flight')) {
      return { blocked: true, hazardName: spec.name, reason: `${spec.name} can only be crossed in flight.` };
    }
  }
  return { blocked: false };
}

// --- The interpreter --------------------------------------------------------

/** Per-world recursion guard, keyed by worldId. The system-wide cap. */
const depthByWorld = new Map<string, number>();

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/**
 * Apply every typed hazard in `zoneId` to `entity`, executing the closed effect
 * union as DATA.
 *
 * Returns the events to record plus a per-hazard report of what executed and what
 * was carried-but-skipped. The report is not decoration: an effect that silently
 * does nothing is the failure mode this whole file exists to end, so every skip
 * is named.
 */
export function applyTypedHazards(
  engine: Engine,
  zoneId: string,
  entity: EntityState,
  trigger: HazardSpec['trigger'],
): { events: ResolvedEvent[]; applications: HazardApplication[] } {
  const world = engine.store.state;
  const worldId = world.meta.worldId;
  const depth = depthByWorld.get(worldId) ?? 0;

  const events: ResolvedEvent[] = [];
  const applications: HazardApplication[] = [];

  // ⚠ THE FIAT HALT. Past the cap we stop, and we stop LOUDLY — a silent halt
  // would make a runaway cycle look like a hazard that simply did not fire.
  if (depth >= HAZARD_DEPTH_LIMIT) {
    engine.store.emitEvent(
      'hazard.depth.exceeded',
      { zoneId, entityId: entity.id, limit: HAZARD_DEPTH_LIMIT },
      { visibility: 'hidden' },
    );
    return { events, applications };
  }

  const specs = getTypedHazardsForZone(world, zoneId).filter((s) => s.trigger === trigger);
  if (specs.length === 0) return { events, applications };

  depthByWorld.set(worldId, depth + 1);
  try {
    for (const spec of specs) {
      const applied: string[] = [];
      const skipped: HazardApplication['skipped'] = [];

      if (isImmune(spec, entity)) {
        skipped.push({ kind: 'all', reason: `entity carries an immunity tag (${spec.immuneTags!.join(', ')})` });
        applications.push({ hazardId: spec.id, zoneId, entityId: entity.id, applied, skipped });
        continue;
      }
      const weather = weatherAllows(spec, world);
      if (!weather.active) {
        skipped.push({ kind: 'all', reason: `weather is not one of ${spec.weatherConditions!.join(', ')}` });
        applications.push({ hazardId: spec.id, zoneId, entityId: entity.id, applied, skipped });
        continue;
      }
      if (!weather.evaluable) {
        skipped.push({
          kind: 'weather-gate',
          reason: 'no weather source in this engine — the hazard is treated as ACTIVE and the gate is unevaluated',
        });
      }

      // Carried, and honestly inert: there is no move-cost economy to spend into.
      if (spec.moveCostDelta !== undefined) {
        skipped.push({ kind: 'moveCostDelta', reason: 'the engine has no movement-cost economy; carried and not enforced' });
      }
      if (spec.blocksVision) {
        skipped.push({ kind: 'blocksVision', reason: 'no perception reader consumes a per-zone vision block yet; carried and not enforced' });
      }

      // Re-fetch per spec so a prior spec's addEntity clone cannot leak in.
      let live = engine.store.getEntity(entity.id);
      if (!live) break;

      const recordStatus = (ev: ResolvedEvent): void => {
        engine.store.recordEvent(ev);
        events.push(ev);
      };

      // Shared across this spec's HP writes so a walker hit by two effects
      // in one pass still dedups reactive signatures the way status-core's
      // per-tick ProcContext does.
      const procCtx = makeProcContext();
      const hazardActor = { actorId: spec.id, causedBy: spec.id };

      const writeHp = (after: number, amount: number, extra: Record<string, unknown> = {}): boolean => {
        if (!live) return false;
        const current = live;
        const before = num(current.resources.hp);
        // addEntity structuredClones — keep the write on that path so the
        // HAZARD_DEPTH_LIMIT cycle fixture (which hooks addEntity) still
        // reaches the cap, then RE-FETCH so a later status/ignite arm cannot
        // mutate the discarded pre-clone.
        engine.store.addEntity({ ...current, resources: { ...current.resources, hp: after } });
        const next = engine.store.getEntity(entity.id);
        if (!next) return false;
        live = next;
        engine.store.emitEvent(
          'hazard.damage.applied',
          { hazardId: spec.id, hazardName: spec.name, zoneId, entityId: live.id, amount, currentHp: after, ...extra },
          {
            ...hazardActor,
            visibility: 'public',
            presentation: { channels: ['narrator'], priority: extra.instakill ? 'critical' : 'high' },
          },
        );
        // Match attackHandler's sibling events so combat.damage.applied
        // consumers (status-core reactive seed, cognition morale, combat-
        // resources take-damage) and HP-bar resource.changed listeners see
        // swamp/acid/gas hits. actorId is the hazard spec — never the
        // victim, never omitted — so quest-core's non-player gate fires.
        const damageEvent = engine.store.emitEvent(
          'combat.damage.applied',
          {
            attackerId: spec.id,
            targetId: live.id,
            damage: amount,
            amount,
            previousHp: before,
            currentHp: after,
            cause: 'hazard',
            hazardId: spec.id,
          },
          {
            ...hazardActor,
            targetIds: [live.id],
            presentation: {
              channels: ['objective'],
              priority: extra.instakill ? 'critical' : 'high',
              soundCues: extra.instakill ? undefined : ['combat.hit'],
            },
          },
        );
        engine.store.emitEvent(
          'resource.changed',
          {
            entityId: live.id,
            resource: 'hp',
            previous: before,
            current: after,
            delta: after - before,
            cause: 'hazard',
          },
          { ...hazardActor, targetIds: [live.id] },
        );
        // Hazards run after action.resolved, so status-core's tick seed
        // already missed this hit. Process reactive triggers here so a
        // combat.damage.applied status actually fires on this swamp step.
        for (const ev of processStatusTriggers(damageEvent, engine.store.state, procCtx, world.meta.tick)) {
          engine.store.recordEvent(ev);
          events.push(ev);
        }
        // Same choke point attackHandler uses: hp crossing 0 emits
        // combat.entity.defeated so defeat-fallout / companion combat-lost /
        // chronicle consumers all fire. Instakill of a living entity always
        // satisfies after===0 && before>0.
        if (after === 0 && before > 0) {
          engine.store.emitEvent(
            'combat.entity.defeated',
            {
              entityId: live.id,
              entityName: live.name,
              defeatedBy: spec.id,
              defeatedByName: spec.name,
              defeatZoneId: zoneId,
              wasInterceptor: false,
            },
            {
              ...hazardActor,
              targetIds: [live.id],
              presentation: {
                channels: ['objective', 'narrator'],
                priority: 'critical',
                soundCues: ['combat.defeat'],
              },
            },
          );
        }
        return true;
      };

      for (const effect of spec.effects) {
        if (!live) break;
        switch (effect.kind) {
          case 'damage': {
            const maxHp = num(live.resources.maxHp, num(live.resources.hp));
            const raw = effect.amountIsPercentMaxHp
              ? Math.round(maxHp * effect.amount)
              : effect.amount;
            const amount = Math.max(0, Math.round(raw));
            if (amount === 0) {
              skipped.push({ kind: 'damage', reason: 'computed amount was 0' });
              break;
            }
            if (effect.durationTicks !== undefined) {
              // Periodic damage rides status-core's EXISTING DoT machinery rather
              // than a bespoke timer — one implementation of "damage over time".
              // Pulses emit combat.damage.applied + processStatusTriggers from
              // processPeriodicStatuses (F-b000f36d); actorId is spec.id via
              // sourceId, never the walker (F-1f8eb735).
              recordStatus(
                applyStatus(
                  live,
                  `hazard:${spec.id}`,
                  world.meta.tick,
                  {
                    duration: effect.durationTicks,
                    stacking: 'refresh',
                    sourceId: spec.id,
                    data: { periodicKind: 'damage', amount, tickOn: effect.tickOn },
                  },
                  world,
                ),
              );
              applied.push('damage:periodic');
              break;
            }
            const before = num(live.resources.hp);
            if (!writeHp(Math.max(0, before - amount), amount)) break;
            applied.push('damage');
            break;
          }

          case 'status': {
            const entry = registry.get(world.meta.gameId);
            // ⚠ LIVE RESOLUTION, exactly as C1's module-id check resolves against a
            // booted engine rather than a static catalog. A hazard naming a status
            // no pack declares is the hazard equivalent of C0's phantom module ids —
            // plausible, and dead.
            if (entry && entry.knownStatusIds.size > 0 && !entry.knownStatusIds.has(effect.statusId)) {
              skipped.push({
                kind: 'status',
                reason: `statusId "${effect.statusId}" matches no status this pack declares — refused rather than applied as an unknown id`,
              });
              break;
            }
            // Deterministic, not random: the chance is compared against a pure hash
            // of (tick, entity, hazard), so the same seeded session always makes the
            // same call. `Math.random` here would break byte-identical replay, which
            // is charter §6's first non-negotiable.
            const roll = pureRoll(world.meta.seed, world.meta.tick, `${spec.id}:${live.id}`);
            if (roll >= effect.chance) {
              skipped.push({ kind: 'status', reason: `proc roll ${roll.toFixed(3)} >= chance ${effect.chance}` });
              break;
            }
            recordStatus(
              applyStatus(
                live,
                effect.statusId,
                world.meta.tick,
                { stacking: effect.stacking === 'ignore' ? 'replace' : effect.stacking, sourceId: spec.id },
                world,
              ),
            );
            applied.push('status');
            break;
          }

          case 'instakill': {
            // Through the SAME resource path as damage, so defeat/fallout/chronicle
            // consumers all fire. A bespoke kill would bypass every one of them.
            const before = num(live.resources.hp);
            if (!writeHp(0, before, { instakill: true })) break;
            applied.push('instakill');
            break;
          }

          case 'ignite': {
            // The burn status has no id in the authored spec. Inventing an
            // engine-owned constant would be inventing vocabulary (§1.1); the
            // convention is a `burn:<id>` tag on the hazard, and absent that the
            // effect is REFUSED with what to declare — never a silent no-op.
            const burnTag = spec.tags.find((t) => t.startsWith('burn:'));
            if (!burnTag) {
              skipped.push({
                kind: 'ignite',
                reason: 'no burn status id — tag the hazard `burn:<statusId>` so ignite has a status to apply',
              });
              break;
            }
            const roll = pureRoll(world.meta.seed, world.meta.tick, `${spec.id}:ignite:${live.id}`);
            if (roll >= effect.igniteChance) {
              skipped.push({ kind: 'ignite', reason: `ignite roll ${roll.toFixed(3)} >= chance ${effect.igniteChance}` });
              break;
            }
            recordStatus(applyStatus(live, burnTag.slice('burn:'.length), world.meta.tick, { stacking: 'refresh', sourceId: spec.id }, world));
            applied.push('ignite');
            break;
          }
        }
      }

      applications.push({ hazardId: spec.id, zoneId, entityId: entity.id, applied, skipped });
    }
  } finally {
    // Restored even if an effect throws, so one bad hazard cannot wedge the cap
    // shut for the rest of the session.
    depthByWorld.set(worldId, depth);
  }

  return { events, applications };
}

/** FNV-1a + avalanche, the same shape `encounter-spawn.spawnRoll` uses. Pure. */
function pureRoll(seed: number, tick: number, salt: string): number {
  let h = 0x811c9dc5;
  const str = `${seed}:${tick}:${salt}`;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h >>>= 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * The per-round step: apply `per-turn` hazards to every entity standing in a
 * hazardous zone. Called from the world tick, like `runEncounterSpawnStep`.
 */
export function runTypedHazardStep(engine: Engine): HazardApplication[] {
  const world = engine.store.state;
  if (!registry.has(world.meta.gameId)) return [];
  const out: HazardApplication[] = [];
  for (const entity of Object.values(world.entities)) {
    if (!entity.zoneId) continue;
    const { applications } = applyTypedHazards(engine, entity.zoneId, entity, 'per-turn');
    out.push(...applications);
  }

  // Timed pass: a persisted elapsed-tick cursor, so a `trigger:'timed'` pack
  // actually fires rather than intake-greening a shape the tick ignores.
  // First observation (no lastTimedTick, or tick has not advanced) is a
  // baseline — same P8-WL-006 "don't re-fire on history" posture as the
  // on-enter cursor. Subsequent ticks apply timed hazards to whoever is
  // standing in the zone.
  const state = getHazardStepState(world);
  const currentTick = world.meta.tick;
  if (state.lastTimedTick === undefined) {
    state.lastTimedTick = currentTick;
  } else if (currentTick > state.lastTimedTick) {
    for (const entity of Object.values(world.entities)) {
      if (!entity.zoneId) continue;
      const { applications } = applyTypedHazards(engine, entity.zoneId, entity, 'timed');
      out.push(...applications);
    }
    state.lastTimedTick = currentTick;
  }
  return out;
}

/** Persisted cursor state — rides world.modules, like encounter-spawn's. */
type HazardStepState = {
  cursor: number;
  /** Last world tick a `timed` pass ran. Absent ⇒ first observation, no fire. */
  lastTimedTick?: number;
};

/**
 * The persistence namespace the cursor lives in. Exported so `environment-core`
 * registers it at boot — see the comment there for what happens when nothing does.
 */
export const TYPED_HAZARD_STATE_KEY = 'typed-hazards';
const HAZARD_STATE_KEY = TYPED_HAZARD_STATE_KEY;

function getHazardStepState(world: WorldState): HazardStepState {
  const existing = world.modules[HAZARD_STATE_KEY] as HazardStepState | undefined;
  if (existing) return existing;
  // Baselined to the CURRENT log length, for the reason encounter-spawn learned
  // the hard way (P8-WL-006): a restored save whose namespace is absent would
  // otherwise re-scan the entire historical log and re-apply every hazard the
  // player ever walked into, in one burst.
  const fresh: HazardStepState = { cursor: world.eventLog.length, lastTimedTick: world.meta.tick };
  world.modules[HAZARD_STATE_KEY] = fresh;
  return fresh;
}

/**
 * The ON-ENTER / ON-EXIT step: scan the eventLog delta for `world.zone.entered`
 * and apply that zone's on-enter hazards to whoever entered — then the
 * PREVIOUS zone's on-exit hazards, hanging off `payload.previousZoneId`
 * (traversal-core already stamps it; there is no separate `world.zone.exited`).
 *
 * Cursor-driven, like `runEncounterSpawnStep`, and the cursor ALWAYS advances —
 * including for packs with no registered hazards — so a pack that registers late
 * never replays stale entries.
 *
 * Unlike the spawn step this does NOT filter to the player: an NPC that walks into
 * a poison swamp should take the poison, which is what makes a hazard a property
 * of the world rather than a scripted event about the protagonist.
 */
export function runTypedHazardEntryStep(engine: Engine): HazardApplication[] {
  const world = engine.store.state;
  const state = getHazardStepState(world);
  const log = world.eventLog;

  const entries: Array<{ zoneId: string; entityId: string; previousZoneId?: string }> = [];
  for (let i = state.cursor; i < log.length; i++) {
    const event = log[i];
    if (event.type !== 'world.zone.entered') continue;
    const zoneId = event.payload?.zoneId;
    const entityId = event.actorId;
    const previousZoneId = event.payload?.previousZoneId;
    if (typeof zoneId === 'string' && typeof entityId === 'string') {
      entries.push({
        zoneId,
        entityId,
        previousZoneId: typeof previousZoneId === 'string' ? previousZoneId : undefined,
      });
    }
  }
  state.cursor = log.length;

  if (!registry.has(world.meta.gameId)) return [];

  const out: HazardApplication[] = [];
  for (const { zoneId, entityId, previousZoneId } of entries) {
    const entity = engine.store.getEntity(entityId);
    if (!entity) continue;
    // Leave first: on-exit of the zone being departed, then on-enter of the
    // destination. Same-zone re-entry is a no-op for on-exit.
    if (previousZoneId && previousZoneId !== zoneId) {
      out.push(...applyTypedHazards(engine, previousZoneId, entity, 'on-exit').applications);
    }
    out.push(...applyTypedHazards(engine, zoneId, entity, 'on-enter').applications);
  }
  return out;
}

