// Action pipeline — the one front door into simulation

import type {
  ActionIntent,
  ResolvedEvent,
  VerbHandler,
  WorldState,
} from './types.js';
import type { WorldStore } from './world.js';
import { nextId } from './id.js';

export type ActionValidationResult = {
  valid: boolean;
  reason?: string;
};

export type ActionValidator = (action: ActionIntent, world: WorldState) => ActionValidationResult;

export class ActionDispatcher {
  private verbs: Map<string, VerbHandler> = new Map();
  private validators: ActionValidator[] = [];

  /** Register a verb handler */
  registerVerb(verb: string, handler: VerbHandler): void {
    this.verbs.set(verb, handler);
  }

  /** Register a global validator */
  registerValidator(validator: ActionValidator): void {
    this.validators.push(validator);
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

    // Validate
    for (const validator of this.validators) {
      const result = validator(action, world);
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

    // Resolve
    const events = handler(action, world);

    // Record all resolved events
    for (const event of events) {
      store.recordEvent(event);
    }

    // Emit action.resolved
    store.emitEvent('action.resolved', {
      verb: action.verb,
      actorId: action.actorId,
      eventCount: events.length,
    }, { actorId: action.actorId });

    return events;
  }

  /** Create an ActionIntent with defaults */
  createAction(
    verb: string,
    actorId: string,
    tick: number,
    options?: Partial<Pick<ActionIntent, 'targetIds' | 'toolId' | 'parameters' | 'source'>>
  ): ActionIntent {
    return {
      id: nextId('act'),
      actorId,
      verb,
      source: 'player',
      issuedAtTick: tick,
      ...options,
    };
  }
}
