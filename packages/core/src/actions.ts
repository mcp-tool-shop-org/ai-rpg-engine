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

export class ActionDispatcher {
  private verbs: Map<string, VerbHandler> = new Map();
  private validators: ActionValidator[] = [];
  private effectAppliers: RuleEffectApplier[] = [];

  /** Register a verb handler */
  registerVerb(verb: string, handler: VerbHandler): void {
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
    for (const validator of this.validators) {
      let result: ActionValidationResult;
      try {
        result = validator(action, world);
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

    // Record all resolved events
    for (const event of events) {
      store.recordEvent(event);
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
    for (const event of events) {
      for (const applier of this.effectAppliers) {
        try {
          effectEvents.push(...applier(event, world));
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
    for (const event of effectEvents) {
      store.recordEvent(event);
    }

    // Emit action.resolved. eventCount is everything the action recorded
    // between declared and resolved (handler events + effect events) — with
    // no effects registered this equals events.length, the pre-C1 value.
    store.emitEvent('action.resolved', {
      verb: action.verb,
      actorId: action.actorId,
      eventCount: events.length + effectEvents.length,
    }, { actorId: action.actorId });

    return effectEvents.length > 0 ? [...events, ...effectEvents] : events;
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
