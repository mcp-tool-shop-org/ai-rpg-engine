// Engine — the main orchestrator tying world, actions, events, and modules

import type {
  GameManifest,
  EngineModule,
  ActionIntent,
  ResolvedEvent,
  RulesetDefinition,
} from './types.js';
import { WorldStore } from './world.js';
import { ActionDispatcher } from './actions.js';
import { ModuleManager } from './modules.js';
import type { FormulaRegistry } from './formulas.js';
import { nextId } from './id.js';

export type EngineOptions = {
  manifest: GameManifest;
  seed?: number;
  modules?: EngineModule[];
  ruleset?: RulesetDefinition;
};

export class Engine {
  readonly store: WorldStore;
  readonly dispatcher: ActionDispatcher;
  readonly moduleManager: ModuleManager;
  readonly ruleset?: RulesetDefinition;

  private actionLog: ActionIntent[] = [];

  constructor(options: EngineOptions) {
    this.ruleset = options.ruleset;

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
      this.moduleManager.initAll();
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

  /** Submit an action on behalf of any entity (party member, ally, NPC).
   *  Like submitAction but for non-player actors — avoids the need to
   *  manually create actions via dispatcher.createAction(). */
  submitActionAs(entityId: string, verb: string, options?: Partial<Pick<ActionIntent, 'targetIds' | 'toolId' | 'parameters'>>): ResolvedEvent[] {
    const action = this.dispatcher.createAction(
      verb,
      entityId,
      this.store.tick,
      { source: 'ai', ...options },
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

  /** Get the formula registry */
  get formulas(): FormulaRegistry {
    return this.moduleManager.formulas;
  }
}
