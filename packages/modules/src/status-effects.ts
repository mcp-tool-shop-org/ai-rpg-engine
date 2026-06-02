// status-effects — the modifier / periodic / trigger engine for statuses.
//
// Consumes the (previously inert) StatusDefinition.modifiers[] and .triggers[]:
//
//   1. PASSIVE MODIFIERS  — `effectiveStat(entity, statId, world)` reduces every
//      active modifier across all of an entity's status instances in the fixed
//      GAS aggregation band `((base + Σadd) * mul) / div` (tranek GASDocumentation
//      2024, design-lock finding 2). Modifiers are sorted by a total stable key
//      `(statusId, modifierIndex, sourceId)` so the result is order-independent
//      and byte-identical; stacks are clamped at `maxStacks` BEFORE aggregating
//      (finding 4).
//
//   2. PERIODIC DoT/HoT   — driven off the engine tick counter. Each instance
//      records its bookkeeping in `AppliedStatus.data` (a ScalarValue record, so
//      the core AppliedStatus type is untouched): `periodicKind`, `periodTicks`,
//      `amount`, optional `resource`, plus the snapshot magnitude captured from
//      the source at apply-tick. Fires when `(tick - appliedAtTick) % periodTicks
//      === 0` and expires at `(tick - appliedAtTick) >= durationTicks`. Integer
//      math only (Fiedler "Fix Your Timestep" 2004, finding 6); magnitude
//      defaults to snapshot (finding 3).
//
//   3. REACTIVE TRIGGERS  — `processStatusTriggers(event, world, procCtx)` runs a
//      per-tick FIFO proc queue. The `ProcContext` (reset each tick) holds the
//      chain depth and an already-fired Set of `(event,source,target,statusId)`
//      signatures; a chain halts at the fixed `PROC_DEPTH_LIMIT` so reflect-damage
//      ping-pong loops terminate deterministically (MTG Comprehensive Rules
//      104.4b-style fiat, finding 7).
//
// Determinism guardrails (design-lock): no Date.now / Math.random; ticks from the
// engine counter; entities and modifiers iterated in a total stable key order;
// ids minted via genId(world, prefix).

import type {
  WorldState,
  EntityState,
  ResolvedEvent,
  ScalarValue,
} from '@ai-rpg-engine/core';
import { genId } from '@ai-rpg-engine/core';
import type { ModifierDefinition } from '@ai-rpg-engine/content-schema';
import { getStatusDefinition } from './status-semantics.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Hard cap on reactive-trigger chain depth within a single tick. Exceeding it
 * halts the chain by fiat (a `status.trigger.halted` event is emitted) so a pair
 * of reflect-damage statuses cannot ping-pong forever. The pattern is from MTG
 * Comprehensive Rules 104.4b (a mandatory-action loop with no exit is ended by
 * fiat); the specific value 16 is an engineering choice, deep enough for any
 * legitimate reaction chain and shallow enough to bound a runaway loop cheaply.
 */
export const PROC_DEPTH_LIMIT = 16;

/**
 * Reserved keys inside `AppliedStatus.data` used by the periodic engine. Kept as
 * named constants so the apply path (status-core) and the tick path (here) agree
 * on the schema without a shared type that would change the core AppliedStatus.
 */
export const PERIODIC_KEYS = {
  KIND: 'periodicKind',
  PERIOD: 'periodTicks',
  AMOUNT: 'amount',
  RESOURCE: 'resource',
  /** Captured snapshot magnitude (resolved from source at apply-tick). */
  SNAPSHOT: 'snapshotAmount',
  /** Duration in ticks, stored so expiry is computable without expiresAtTick. */
  DURATION: 'durationTicks',
} as const;

// ---------------------------------------------------------------------------
// 1. Passive modifiers — effectiveStat
// ---------------------------------------------------------------------------

/** One modifier flattened with the context needed for stable ordering + stacks. */
type FlatModifier = {
  statusId: string;
  modifierIndex: number;
  sourceId: string;
  stacks: number;
  mod: ModifierDefinition;
};

/**
 * Collect every modifier targeting `statId` across all of an entity's active
 * status instances, flattened with its stable-sort key context. Stacks are read
 * from the instance and clamped at the definition's `maxStacks` here so the clamp
 * happens BEFORE aggregation (finding 4).
 */
function collectModifiers(entity: EntityState, statId: string): FlatModifier[] {
  const out: FlatModifier[] = [];
  for (const inst of entity.statuses) {
    const def = getStatusDefinition(inst.statusId);
    if (!def?.modifiers || def.modifiers.length === 0) continue;
    const max = def.maxStacks ?? Infinity;
    const stacks = Math.max(1, Math.min(inst.stacks ?? 1, max));
    def.modifiers.forEach((mod, modifierIndex) => {
      if (mod.stat !== statId) return;
      out.push({
        statusId: inst.statusId,
        modifierIndex,
        sourceId: inst.sourceId ?? '',
        stacks,
        mod,
      });
    });
  }
  return out;
}

/**
 * Total stable ordering for modifiers: `(statusId, modifierIndex, sourceId)`.
 * Aggregation in the GAS band is order-independent for adds and for muls
 * separately, but we still sort so any future op (divide/override) and any
 * tie-broken bookkeeping is byte-identical across platforms and runs (finding 2).
 */
function compareModifiers(a: FlatModifier, b: FlatModifier): number {
  if (a.statusId !== b.statusId) return a.statusId < b.statusId ? -1 : 1;
  if (a.modifierIndex !== b.modifierIndex) return a.modifierIndex - b.modifierIndex;
  if (a.sourceId !== b.sourceId) return a.sourceId < b.sourceId ? -1 : 1;
  return 0;
}

/**
 * The effective value of `statId` for `entity`, after reducing every active
 * status modifier in the fixed band `((base + Σadd) * mul) / div` (finding 2).
 *
 * `add` modifiers are multiplied by the (clamped) stack count; `multiply`
 * modifiers compound. Pure and deterministic — no RNG, no clock. With no
 * matching modifiers it returns the base stat unchanged, which is what keeps
 * every existing combat/ability caller byte-identical (back-compat).
 *
 * @param fallback value to use when `entity.stats[statId]` is absent (mirrors the
 *   per-call-site fallbacks combat-core already passes to its stat reads).
 */
export function effectiveStat(
  entity: EntityState,
  statId: string,
  _world: WorldState,
  fallback = 0,
): number {
  const base = entity.stats[statId] ?? fallback;

  // Fast path: no statuses at all → base (the overwhelmingly common case).
  if (entity.statuses.length === 0) return base;

  const mods = collectModifiers(entity, statId);
  if (mods.length === 0) return base;

  mods.sort(compareModifiers);

  let additive = 0;
  let multiplicative = 1;
  for (const { mod, stacks } of mods) {
    switch (mod.operation) {
      case 'add':
        additive += mod.value * stacks;
        break;
      case 'multiply':
        // Each stack compounds the multiplier (×value per stack).
        multiplicative *= Math.pow(mod.value, stacks);
        break;
      // NOTE: ModifierDefinition currently enumerates only 'add' | 'multiply'.
      // 'divide'/'override' are reserved by the design lock (finding 2's full GAS
      // band is ((Base + Add) * Mul) / Div); when they're added to the schema the
      // divide branch slots in here as a non-breaking extension.
      default:
        break;
    }
  }

  // Full band per finding 2 is ((base + Σadd) * mul) / div; div is fixed at 1
  // until a 'divide' op exists in the schema, so it is elided here.
  const result = (base + additive) * multiplicative;
  // Integer stats throughout the engine — truncate toward zero deterministically.
  return Math.trunc(result);
}

// ---------------------------------------------------------------------------
// 2. Periodic DoT / HoT
// ---------------------------------------------------------------------------

function numData(data: Record<string, ScalarValue> | undefined, key: string): number | undefined {
  const v = data?.[key];
  return typeof v === 'number' ? v : undefined;
}

function strData(data: Record<string, ScalarValue> | undefined, key: string): string | undefined {
  const v = data?.[key];
  return typeof v === 'string' ? v : undefined;
}

/**
 * Fire any due periodic (DoT/HoT) status effects for the current tick and expire
 * instances that have reached their duration. Pure-ish: mutates entity resources
 * and status lists in place (the engine's established status pattern) and returns
 * the events to record. Driven entirely by the integer tick counter.
 *
 * For each instance carrying `data.periodicKind`:
 *  - fires when `(tick - appliedAtTick) % periodTicks === 0` (and not yet expired)
 *  - magnitude is the snapshot (`data.snapshotAmount`, captured at apply-tick),
 *    falling back to `data.amount`
 *  - expires (removes the instance) when `(tick - appliedAtTick) >= durationTicks`
 *
 * Entities are iterated in id order and each entity's instances in array order
 * (already stable) so the event stream is byte-identical across runs.
 */
export function processPeriodicStatuses(world: WorldState, tick: number): ResolvedEvent[] {
  const events: ResolvedEvent[] = [];
  const entityIds = Object.keys(world.entities).sort();

  for (const eid of entityIds) {
    const entity = world.entities[eid];
    const survivors: typeof entity.statuses = [];

    for (const inst of entity.statuses) {
      const kind = strData(inst.data, PERIODIC_KEYS.KIND);
      if (!kind) {
        survivors.push(inst); // not a periodic instance — leave untouched
        continue;
      }

      const period = numData(inst.data, PERIODIC_KEYS.PERIOD) ?? 1;
      // Duration is single-sourced: prefer an explicit data.durationTicks, else
      // derive it from the instance's own expiry window (expiresAtTick set by
      // applyStatus from its `duration` option). This keeps the periodic schedule
      // and the existing tick-expiry agreeing without duplicating the value.
      const duration =
        numData(inst.data, PERIODIC_KEYS.DURATION) ??
        (inst.expiresAtTick !== undefined ? inst.expiresAtTick - inst.appliedAtTick : undefined);
      const elapsed = tick - inst.appliedAtTick;

      // Expiry (>= duration). Periodic instances own their own expiry here so the
      // periodic schedule and the removal are decided by one integer comparison.
      if (duration !== undefined && elapsed >= duration) {
        events.push(makePeriodicEvent('status.periodic.expired', entity.id, inst.statusId, tick, {
          appliedAtTick: inst.appliedAtTick,
          durationTicks: duration,
        }));
        continue; // drop (do not push to survivors)
      }

      // Fire on-period, but never on a defeated entity (no ticking a corpse).
      const onPeriod = elapsed >= 0 && period > 0 && elapsed % period === 0;
      const alive = (entity.resources.hp ?? 0) > 0;
      if (onPeriod && alive) {
        const magnitude =
          numData(inst.data, PERIODIC_KEYS.SNAPSHOT) ??
          numData(inst.data, PERIODIC_KEYS.AMOUNT) ??
          0;

        if (kind === 'damage') {
          const before = entity.resources.hp ?? 0;
          entity.resources.hp = Math.max(0, before - magnitude);
          events.push(makePeriodicEvent('status.periodic.damage', entity.id, inst.statusId, tick, {
            amount: magnitude,
            sourceId: inst.sourceId ?? '',
            hpBefore: before,
            hpAfter: entity.resources.hp,
          }));
          if (entity.resources.hp <= 0 && before > 0) {
            events.push(makePeriodicEvent('combat.entity.defeated', entity.id, inst.statusId, tick, {
              entityId: entity.id,
              entityName: entity.name,
              cause: 'status',
              statusId: inst.statusId,
              attackerId: inst.sourceId ?? '',
            }));
          }
        } else if (kind === 'heal') {
          const resource = strData(inst.data, PERIODIC_KEYS.RESOURCE) ?? 'hp';
          const before = entity.resources[resource] ?? 0;
          const maxKey = `max${resource.charAt(0).toUpperCase()}${resource.slice(1)}`;
          const max = entity.resources[maxKey] ?? entity.stats[maxKey] ?? Infinity;
          entity.resources[resource] = Math.min(max, before + magnitude);
          events.push(makePeriodicEvent('status.periodic.heal', entity.id, inst.statusId, tick, {
            amount: magnitude,
            actual: entity.resources[resource] - before,
            resource,
            sourceId: inst.sourceId ?? '',
            before,
            after: entity.resources[resource],
          }));
        }
      }

      survivors.push(inst);
    }

    entity.statuses = survivors;
  }

  return events;
}

// ---------------------------------------------------------------------------
// 3. Reactive triggers
// ---------------------------------------------------------------------------

/**
 * Per-tick proc context for reactive triggers. Reset (recreated) every tick so
 * the dedup set and chain depth never leak across ticks. `chainDepth` counts how
 * deep the current reaction chain has gone; `firedSignatures` blocks re-firing the
 * same `(causeEvent,source,target,statusId)` within the tick.
 *
 * Two distinct loop-terminators, both per the design lock (finding 7):
 *  - The dedup set keys on the *triggering event id*, so one hit cannot proc the
 *    same status instance twice (no double-counting on fan-out / re-entry of the
 *    same event).
 *  - A reflect ping-pong produces a *new* event each hop (a fresh id), so the
 *    dedup set does not catch it — that is exactly what `PROC_DEPTH_LIMIT` is for:
 *    the chain is halted by fiat once it grows past the cap (MTG 104.4b-style).
 */
export type ProcContext = {
  chainDepth: number;
  firedSignatures: Set<string>;
};

/** Create a fresh proc context. Call once per tick. */
export function makeProcContext(): ProcContext {
  return { chainDepth: 0, firedSignatures: new Set() };
}

/** A pending reaction to process through the FIFO queue. */
type ProcItem = {
  event: ResolvedEvent;
  depth: number;
};

function signatureOf(causeEventId: string, sourceId: string, targetId: string, statusId: string): string {
  return `${causeEventId}|${sourceId}|${targetId}|${statusId}`;
}

/**
 * Stable id for a triggering event for dedup purposes. Real recorded events carry
 * an id; synthetic test events / freshly-produced reaction events may have an
 * empty id, so we mint a deterministic one from the world counter on first sight.
 * Minting (rather than reusing a constant) is what lets a ping-pong of new events
 * each get a unique signature, so the depth cap — not an accidental dedup — is the
 * thing that halts the loop.
 */
function eventIdFor(event: ResolvedEvent, world: WorldState): string {
  if (event.id) return event.id;
  event.id = genId(world, 'proc');
  return event.id;
}

/**
 * Process reactive status triggers in response to `event`, draining a FIFO queue
 * of follow-on reactions. Each entity's statuses are scanned for a trigger whose
 * `.event` matches; a matching trigger fires its effect (currently `damage` /
 * `heal`, the two that can form loops) against the resolved target, which may emit
 * a new `combat.damage.applied`-style event that re-enters the queue one level
 * deeper.
 *
 * Termination is guaranteed by `PROC_DEPTH_LIMIT` (a `status.trigger.halted` event
 * is emitted when the cap is hit) and re-entry of the *same* event is blocked by
 * the dedup set. Entities are scanned in id order for determinism.
 */
export function processStatusTriggers(
  event: ResolvedEvent,
  world: WorldState,
  procCtx: ProcContext,
  tick: number,
): ResolvedEvent[] {
  const out: ResolvedEvent[] = [];
  const queue: ProcItem[] = [{ event, depth: procCtx.chainDepth }];

  while (queue.length > 0) {
    const item = queue.shift()!;

    // Depth cap (fiat halt). The chain has gone as deep as we allow; stop here so
    // a reflect ping-pong cannot run forever.
    if (item.depth >= PROC_DEPTH_LIMIT) {
      procCtx.chainDepth = PROC_DEPTH_LIMIT;
      out.push(makeTriggerEvent('status.trigger.halted', event.type, tick, {
        reason: `reactive trigger chain hit PROC_DEPTH_LIMIT (${PROC_DEPTH_LIMIT}); halting to prevent an unbounded loop`,
        depth: item.depth,
        eventType: item.event.type,
      }));
      // Drain the rest of the queue too — everything beyond the cap is halted.
      while (queue.length > 0) queue.shift();
      break;
    }

    procCtx.chainDepth = Math.max(procCtx.chainDepth, item.depth);

    const causeId = eventIdFor(item.event, world);
    const reactions = collectReactions(item.event, world, tick);
    for (const r of reactions) {
      const sig = signatureOf(causeId, r.sourceId, r.targetId, r.statusId);
      if (procCtx.firedSignatures.has(sig)) continue;
      procCtx.firedSignatures.add(sig);

      const fired = applyReaction(r, world, item.event, tick);
      out.push(...fired.events);

      out.push(makeTriggerEvent('status.trigger.fired', item.event.type, tick, {
        statusId: r.statusId,
        sourceId: r.sourceId,
        targetId: r.targetId,
        effectType: r.effectType,
        amount: r.amount,
        depth: item.depth,
      }));

      // Any new damage event this reaction produced re-enters the chain one level
      // deeper (heals don't form loops). It carries a fresh, deterministic id so a
      // ping-pong keeps generating distinct signatures and is bounded by the cap.
      for (const ev of fired.events) {
        if (ev.type === 'combat.damage.applied') {
          eventIdFor(ev, world);
          queue.push({ event: ev, depth: item.depth + 1 });
        }
      }
    }
  }

  return out;
}

/** A resolved, ready-to-apply reaction. */
type Reaction = {
  statusId: string;
  sourceId: string; // entity whose status triggered (the reactor)
  targetId: string; // entity the effect lands on
  effectType: string;
  amount: number;
};

/**
 * Find every status trigger that should fire for `event`. For combat damage
 * events, the conventional reactor is the entity that took the hit (`targetId` of
 * the damage payload); its triggers' `target: 'actor'|'attacker'` resolve to
 * itself or to the original attacker respectively.
 */
function collectReactions(event: ResolvedEvent, world: WorldState, _tick: number): Reaction[] {
  const reactions: Reaction[] = [];
  const payloadTarget = (event.payload?.targetId as string) ?? event.targetIds?.[0] ?? '';
  const payloadAttacker = (event.payload?.attackerId as string) ?? event.actorId ?? '';

  // The reactor is the entity that was hit. Scan in id order for determinism.
  const reactorIds = Object.keys(world.entities).sort();
  for (const rid of reactorIds) {
    if (rid !== payloadTarget) continue; // only the hit entity reacts (damage convention)
    const reactor = world.entities[rid];
    if ((reactor.resources.hp ?? 0) <= 0) continue; // a defeated entity does not react

    for (const inst of reactor.statuses) {
      const def = getStatusDefinition(inst.statusId);
      if (!def?.triggers) continue;
      for (const trig of def.triggers) {
        if (trig.event !== event.type) continue;
        const effectType = trig.effect.type;
        if (effectType !== 'damage' && effectType !== 'heal') continue; // loop-forming effects only
        const amount = (trig.effect.params?.amount as number) ?? 0;

        // Resolve where the reaction effect lands. The canonical reflect case
        // ("spiked armor hurts the attacker") needs to point at the attacker, but
        // the shared EffectDefinition.target enum is only 'actor'|'target'|'zone'
        // (no 'attacker'), and content-schema is out of scope to change. So the
        // reactor-relative target is conveyed via the freeform `params.triggerTarget`
        // ('attacker' | 'self' | 'target'); when absent we fall back to the schema
        // `effect.target` keyword. 'attacker' → whoever dealt the triggering hit;
        // 'self'/'actor' → the reactor; 'target' → the triggering event's target
        // (the reactor, for a damage-taken trigger).
        const triggerTarget =
          (trig.effect.params?.triggerTarget as string | undefined) ??
          (trig.effect.target === 'target' ? 'target' : 'self');
        const targetId =
          triggerTarget === 'attacker' ? payloadAttacker
          : triggerTarget === 'target' ? payloadTarget
          : reactor.id; // 'self' / 'actor' / default

        if (!targetId || !world.entities[targetId]) continue;

        reactions.push({
          statusId: inst.statusId,
          sourceId: reactor.id,
          targetId,
          effectType,
          amount,
        });
      }
    }
  }
  return reactions;
}

/** Apply a single reaction to the world, returning the events it produced. */
function applyReaction(
  r: Reaction,
  world: WorldState,
  _cause: ResolvedEvent,
  tick: number,
): { events: ResolvedEvent[] } {
  const events: ResolvedEvent[] = [];
  const target = world.entities[r.targetId];
  if (!target) return { events };

  if (r.effectType === 'damage') {
    const before = target.resources.hp ?? 0;
    if (before <= 0) return { events }; // do not hit a corpse (also stops a dead loop)
    target.resources.hp = Math.max(0, before - r.amount);
    events.push(makeTriggerEvent('combat.damage.applied', 'status', tick, {
      attackerId: r.sourceId,
      targetId: r.targetId,
      damage: r.amount,
      cause: 'status-trigger',
      statusId: r.statusId,
      previousHp: before,
      currentHp: target.resources.hp,
    }, [r.targetId]));
    if (target.resources.hp <= 0 && before > 0) {
      events.push(makeTriggerEvent('combat.entity.defeated', 'status', tick, {
        entityId: target.id,
        entityName: target.name,
        cause: 'status-trigger',
        statusId: r.statusId,
        attackerId: r.sourceId,
      }, [r.targetId]));
    }
  } else if (r.effectType === 'heal') {
    const before = target.resources.hp ?? 0;
    const max = target.resources.maxHp ?? target.stats.maxHp ?? Infinity;
    target.resources.hp = Math.min(max, before + r.amount);
    events.push(makeTriggerEvent('status.trigger.heal', 'status', tick, {
      targetId: r.targetId,
      amount: r.amount,
      actual: target.resources.hp - before,
      statusId: r.statusId,
      sourceId: r.sourceId,
    }, [r.targetId]));
  }

  return { events };
}

// ---------------------------------------------------------------------------
// Event helpers
// ---------------------------------------------------------------------------
//
// id: '' — every consumer records these via the WorldStore recordEvent choke
// point, which stamps a deterministic per-instance id when the id is empty (the
// same pattern status-core's makeStatusEvent uses). The global nextId() is never
// touched, so ids stay byte-identical across same-seed runs.

function makePeriodicEvent(
  type: string,
  entityId: string,
  statusId: string,
  tick: number,
  payload: Record<string, unknown>,
): ResolvedEvent {
  return {
    id: '',
    tick,
    type,
    actorId: entityId,
    targetIds: [entityId],
    payload: { statusId, ...payload },
    tags: ['status', 'periodic'],
  };
}

function makeTriggerEvent(
  type: string,
  causeEventType: string,
  tick: number,
  payload: Record<string, unknown>,
  targetIds?: string[],
): ResolvedEvent {
  return {
    id: '',
    tick,
    type,
    payload: { causeEvent: causeEventType, ...payload },
    targetIds,
    tags: ['status', 'trigger'],
  };
}
