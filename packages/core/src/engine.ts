// Engine — the main orchestrator tying world, actions, events, and modules

import type {
  GameManifest,
  EngineModule,
  ActionIntent,
  ResolvedEvent,
} from './types.js';
import { WorldStore } from './world.js';
import { ActionDispatcher } from './actions.js';
import { ModuleManager } from './modules.js';
import { nextId } from './id.js';

export type EngineOptions = {
  manifest: GameManifest;
  seed?: number;
  modules?: EngineModule[];
};

export class Engine {
  readonly store: WorldStore;
  readonly dispatcher: ActionDispatcher;
  readonly moduleManager: ModuleManager;

  private actionLog: ActionIntent[] = [];

  constructor(options: EngineOptions) {
    this.store = new WorldStore({
      manifest: options.manifest,
      seed: options.seed,
    });

    this.dispatcher = new ActionDispatcher();
    this.moduleManager = new ModuleManager(this.dispatcher, this.store.events);

    // Register modules
    if (options.modules) {
      for (const mod of options.modules) {
        this.moduleManager.register(mod, this.store);
      }
      this.moduleManager.initializeNamespaces(this.store);
    }

    // Register global validator that runs module rule checks
    this.dispatcher.registerValidator((action, world) => {
      const result = this.moduleManager.checkRules(action, world);
      if (!result.pass) {
        return { valid: false, reason: `rule check failed: ${result.failedCheck}` };
      }
      return { valid: true };
    });
  }

  /** Submit a player action */
  submitAction(verb: string, options?: Partial<Pick<ActionIntent, 'targetIds' | 'toolId' | 'parameters'>>): ResolvedEvent[] {
    const action = this.dispatcher.createAction(
      verb,
      this.store.state.playerId,
      this.store.tick,
      { source: 'player', ...options },
    );
    return this.processAction(action);
  }

  /** Process any action through the pipeline */
  processAction(action: ActionIntent): ResolvedEvent[] {
    this.actionLog.push(action);
    const events = this.dispatcher.dispatch(action, this.store);

    // Process pending effects that are due
    const due = this.store.processPending();
    for (const pending of due) {
      this.store.emitEvent(pending.type, pending.payload, {
        causedBy: pending.sourceEventId,
      });
    }

    // Advance tick after each action
    this.store.advanceTick();

    return events;
  }

  /** Get available actions for the player in current context */
  getAvailableActions(): string[] {
    return this.dispatcher.getRegisteredVerbs();
  }

  /** Get the action log for replay */
  getActionLog(): readonly ActionIntent[] {
    return this.actionLog;
  }

  /** Serialize full engine state */
  serialize(): string {
    return JSON.stringify({
      world: JSON.parse(this.store.serialize()),
      actionLog: this.actionLog,
    });
  }

  /** Get current tick */
  get tick(): number {
    return this.store.tick;
  }

  /** Get current world state (read-only access) */
  get world() {
    return this.store.state;
  }
}
