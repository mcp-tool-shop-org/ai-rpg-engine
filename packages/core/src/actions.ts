// Action pipeline — the one front door into simulation

import type {
  ActionIntent,
  ResolvedEvent,
  VerbHandler,
  WorldState,
} from './types.js';
import type { WorldStore } from './world.js';

export type ActionValidationResult = {
  valid: boolean;
  reason?: string;
};

export type ActionValidator = (action: ActionIntent, world: WorldState) => ActionValidationResult;

/**
 * Applied to each handler-resolved event after it is recorded; any events it
 * returns are recorded through the same choke point. The Engine wires
 * `ModuleManager.applyEffects` through this so module-registered RuleEffects
 * actually execute (v2.5 C1 — they were stored and never run).
 */
export type RuleEffectApplier = (event: ResolvedEvent, world: WorldState) => ResolvedEvent[];

/** Extract a one-line message from a thrown value without leaking the stack. */
function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/** One-word description of a handler/applier return for rejection reasons. */
function describeValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'an array';
  return typeof value;
}

/** Non-null non-array object — not yet a recordable event (type may be missing). */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * recordEvent stamps id then EventBus.emit does type.indexOf. Null/undefined/
 * array/primitive elements throw on event.id; a plain object with a missing,
 * empty, or non-string type throws on indexOf (F-208d62e4 sibling).
 */
function isEventObject(value: unknown): value is ResolvedEvent {
  return (
    isPlainObject(value) &&
    typeof value.type === 'string' &&
    value.type.length > 0
  );
}

/** Why a handler/applier array element is not a recordable event. */
function describeInvalidEventElement(value: unknown, index: number): string {
  if (!isPlainObject(value)) {
    return `non-object element at index ${index}: ${describeValue(value)}`;
  }
  return `element at index ${index} with missing, empty, or non-string type`;
}

export class ActionDispatcher {
  private verbs: Map<string, VerbHandler> = new Map();
  private validators: ActionValidator[] = [];
  private effectAppliers: RuleEffectApplier[] = [];

  /**
   * Register a verb handler.
   *
   * A duplicate verb throws by default: two registrations under one verb would
   * silently clobber each other (second wins, no error) — a real pack collision
   * on 'move'/'talk' dead-letters the first module's mechanic. Fail loud,
   * matching FormulaRegistry.register and ModuleManager.register (F-b71bccf1).
   *
   * Pass `{ override: true }` for the intentional replacement case (test
   * doubles, pack overrides).
   */
  registerVerb(verb: string, handler: VerbHandler, opts?: { override?: boolean }): void {
    if (this.verbs.has(verb) && !opts?.override) {
      throw new Error(
        `Verb "${verb}" is already registered. ` +
          `Verbs must be unique; a module has already claimed this verb. ` +
          `Rename one of the conflicting verbs, remove the duplicate registration, or pass { override: true } to replace intentionally.`,
      );
    }
    this.verbs.set(verb, handler);
  }

  /** Register a global validator */
  registerValidator(validator: ActionValidator): void {
    this.validators.push(validator);
  }

  /** Register a rule-effect applier (see {@link RuleEffectApplier}). */
  registerEffectApplier(applier: RuleEffectApplier): void {
    this.effectAppliers.push(applier);
  }

  /** Get all registered verb names */
  getRegisteredVerbs(): string[] {
    return [...this.verbs.keys()];
  }

  /** Check if a verb is registered */
  hasVerb(verb: string): boolean {
    return this.verbs.has(verb);
  }

  /** Dispatch an action through the full pipeline */
  dispatch(action: ActionIntent, store: WorldStore): ResolvedEvent[] {
    const world = store.state;

    // Emit action.declared
    store.emitEvent('action.declared', {
      verb: action.verb,
      actorId: action.actorId,
      targetIds: action.targetIds,
    }, { actorId: action.actorId });

    // Validate. A validator is consumer-supplied code (module rule checks run
    // through one); a throwing validator must degrade to a structured
    // action.rejected naming the verb, not abort the tick with a raw stack.
    // result.valid is read AFTER this try (F-208d62e4): undefined/null returns
    // used to TypeError outside the catch and abort the tick declared-only.
    for (const validator of this.validators) {
      let result: ActionValidationResult;
      try {
        result = validator(action, world);
        if (!(result && typeof result.valid === 'boolean')) {
          store.emitEvent('action.rejected', {
            verb: action.verb,
            reason: `validator for "${action.verb}" returned non-object: ${describeValue(result)}`,
          }, { actorId: action.actorId });
          return [];
        }
      } catch (err) {
        store.emitEvent('action.rejected', {
          verb: action.verb,
          reason: `validator for "${action.verb}" threw: ${errMessage(err)}`,
        }, { actorId: action.actorId });
        return [];
      }
      if (!result.valid) {
        store.emitEvent('action.rejected', {
          verb: action.verb,
          reason: result.reason ?? 'validation failed',
        }, { actorId: action.actorId });
        return [];
      }
    }

    // Find verb handler
    const handler = this.verbs.get(action.verb);
    if (!handler) {
      store.emitEvent('action.rejected', {
        verb: action.verb,
        reason: `unknown verb: ${action.verb}`,
      }, { actorId: action.actorId });
      return [];
    }

    // Resolve. The handler is module-supplied; a throw must surface as a
    // structured action.rejected (verb + that the handler threw) so a single
    // buggy verb cannot crash the tick or leak a stack to the player.
    // A non-array return (undefined/null/plain object — forgetting `return [...]`)
    // is the same class: the `for...of` below used to sit outside this try and
    // abort the tick with TypeError (F-daece5c6). Guard Array.isArray before
    // iterating — strings are iterable, so a typeof/try wrap is not enough.
    let events: ResolvedEvent[];
    try {
      events = handler(action, world);
    } catch (err) {
      store.emitEvent('action.rejected', {
        verb: action.verb,
        reason: `handler for "${action.verb}" threw: ${errMessage(err)}`,
      }, { actorId: action.actorId });
      return [];
    }
    if (!Array.isArray(events)) {
      store.emitEvent('action.rejected', {
        verb: action.verb,
        reason: `handler for "${action.verb}" returned non-array: ${describeValue(events)}`,
      }, { actorId: action.actorId });
      return [];
    }

    // Array.isArray is not enough: `return [maybeEvent]` with a failed
    // construction is a valid-looking array of null/undefined. recordEvent
    // reads event.id and would throw outside the handler try (F-208d62e4).
    // A non-null object with no string type (`[{ payload: {} }]`) passes the
    // object check then EventBus.emit type.indexOf TypeError-aborts the tick
    // declared-only. Reject the action without recording any element.
    for (let i = 0; i < events.length; i++) {
      if (!isEventObject(events[i])) {
        store.emitEvent('action.rejected', {
          verb: action.verb,
          index: i,
          reason: `handler for "${action.verb}" returned ${describeInvalidEventElement(events[i], i)}`,
        }, { actorId: action.actorId });
        return [];
      }
    }

    // Record all resolved events. Capture the log entries (cloned + enriched)
    // so the returned array aliases eventLog, not the caller's pre-record object.
    const recorded: ResolvedEvent[] = [];
    for (const event of events) {
      recorded.push(store.recordEvent(event));
    }

    // Apply registered rule effects (v2.5 C1). Each applier sees every
    // handler-resolved event in order; events they return are recorded through
    // the same recordEvent choke point (deterministic ids), after the
    // handler's own events and before action.resolved. Single pass — effect
    // output is NOT re-fed to effects, so cascades are bounded and the id
    // sequence stays replayable. An applier is consumer-adjacent code; a throw
    // degrades to a structured rule.effect.failed event, never a lost tick
    // (module-level RuleEffects are additionally isolated per-effect inside
    // ModuleManager.applyEffects).
    const effectEvents: ResolvedEvent[] = [];
    for (const event of recorded) {
      for (const applier of this.effectAppliers) {
        try {
          const produced = applier(event, world);
          if (!Array.isArray(produced)) {
            // Same non-array class as verb handlers (F-daece5c6). The spread
            // was already inside try so the tick survived, but a named
            // rule.effect.failed is the structured signal, not "X is not iterable".
            effectEvents.push({
              id: '',
              tick: event.tick,
              type: 'rule.effect.failed',
              payload: {
                sourceEventId: event.id,
                reason: `rule-effect applier returned non-array: ${describeValue(produced)}`,
              },
              causedBy: event.id,
            });
          } else {
            // [null] and [{ payload }] pass Array.isArray then throw in the
            // unguarded recordEvent loop after this try (F-208d62e4). Skip
            // the hole; name the index; keep later elements and action.resolved.
            for (let i = 0; i < produced.length; i++) {
              const item = produced[i];
              if (!isEventObject(item)) {
                effectEvents.push({
                  id: '',
                  tick: event.tick,
                  type: 'rule.effect.failed',
                  payload: {
                    sourceEventId: event.id,
                    index: i,
                    reason: `rule-effect applier returned ${describeInvalidEventElement(item, i)}`,
                  },
                  causedBy: event.id,
                });
              } else {
                effectEvents.push(item);
              }
            }
          }
        } catch (err) {
          effectEvents.push({
            id: '',
            tick: event.tick,
            type: 'rule.effect.failed',
            payload: {
              sourceEventId: event.id,
              reason: `rule-effect applier threw: ${errMessage(err)}`,
            },
            causedBy: event.id,
          });
        }
      }
    }

    const recordedEffects: ResolvedEvent[] = [];
    for (const event of effectEvents) {
      recordedEffects.push(store.recordEvent(event));
    }

    // Emit action.resolved. eventCount is everything the action recorded
    // between declared and resolved (handler events + effect events) — with
    // no effects registered this equals events.length, the pre-C1 value.
    store.emitEvent('action.resolved', {
      verb: action.verb,
      actorId: action.actorId,
      eventCount: recorded.length + recordedEffects.length,
    }, { actorId: action.actorId });

    return recordedEffects.length > 0 ? [...recorded, ...recordedEffects] : recorded;
  }

  /**
   * Create an ActionIntent with defaults.
   *
   * The id is supplied by the caller (the Engine mints it from the per-world
   * deterministic counter via `store.genId('act')`) because action ids live in
   * the serialized actionLog and must be replayable byte-for-byte. The
   * dispatcher itself is stateless and has no world to draw a counter from.
   * `id` defaults to '' so direct test callers that don't assert on action.id
   * keep working; production paths always pass a real id.
   */
  createAction(
    verb: string,
    actorId: string,
    tick: number,
    options?: Partial<Pick<ActionIntent, 'targetIds' | 'toolId' | 'parameters' | 'source'>>,
    id = '',
  ): ActionIntent {
    return {
      id,
      actorId,
      verb,
      source: 'player',
      issuedAtTick: tick,
      ...options,
    };
  }
}
