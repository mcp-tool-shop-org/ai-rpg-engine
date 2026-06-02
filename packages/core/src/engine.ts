// Engine — the main orchestrator tying world, actions, events, and modules

import type {
  GameManifest,
  EngineModule,
  ActionIntent,
  ResolvedEvent,
  RulesetDefinition,
  WorldState,
} from './types.js';
import { WorldStore, SaveLoadError } from './world.js';
import { ActionDispatcher } from './actions.js';
import { ModuleManager } from './modules.js';
import type { FormulaRegistry } from './formulas.js';
import type { EventBusListenerErrorHook } from './events.js';

export type EngineOptions = {
  manifest: GameManifest;
  seed?: number;
  modules?: EngineModule[];
  ruleset?: RulesetDefinition;
  /**
   * Optional hook to observe consumer event-listener failures. A throwing
   * listener is always isolated (the tick never aborts); supply this to also
   * surface the failure to a dev overlay / log instead of swallowing it.
   */
  onListenerError?: EventBusListenerErrorHook;
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
      onListenerError: options.onListenerError,
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
      this.store.genId('act'),
    );
    return this.processAction(action);
  }

  /** Submit an action on behalf of any entity (party member, ally, NPC).
   *  Like submitAction but for non-player actors — avoids the need to
   *  manually create actions via dispatcher.createAction(). */
  submitActionAs(entityId: string, verb: string, options?: Partial<Pick<ActionIntent, 'targetIds' | 'toolId' | 'parameters'>>): ResolvedEvent[] {
    // Guard against dispatching for a ghost actor (a typo'd or already-removed
    // entity id). A verb handler reading state.entities[actorId] for a missing
    // actor would either crash or silently act on undefined; short-circuit to a
    // structured action.rejected naming the actor instead. The tick still
    // advances so the rejected attempt is recorded in the same lifecycle as any
    // other rejected action.
    if (!this.store.state.entities[entityId]) {
      this.store.emitEvent('action.rejected', {
        verb,
        actorId: entityId,
        reason: `unknown actor: no entity "${entityId}" in world state. Add the entity before acting as it, or check the actor id for a typo.`,
      }, { actorId: entityId });
      this.store.advanceTick();
      return [];
    }

    const action = this.dispatcher.createAction(
      verb,
      entityId,
      this.store.tick,
      { source: 'ai', ...options },
      this.store.genId('act'),
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

  /** Get debug inspectors registered by modules (thin pass-through). */
  getInspectors(): import('./types.js').DebugInspector[] {
    return this.moduleManager.getInspectors();
  }

  /** Get UI panels registered by modules (thin pass-through). */
  getPanels(): import('./types.js').PanelDefinition[] {
    return this.moduleManager.getPanels();
  }

  /** Tear down all modules. Call on engine shutdown so modules can release any
   *  resources they hold (timers, listeners, file handles). Idempotent from the
   *  caller's view — teardown() on a module is invoked at most once per call. */
  shutdown(): void {
    this.moduleManager.teardownAll();
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

  /**
   * Reconstruct a fully-wired Engine from a string produced by {@link serialize}.
   *
   * Unlike replaying the actionLog through a fresh game, this restores the exact
   * saved world state (entities, eventLog, globals, pending, rngState, and the
   * per-instance meta.idCounter) so continuing to play resumes the deterministic
   * id sequence without colliding with ids already in the loaded eventLog.
   *
   * Modules/ruleset must be supplied by the caller — code (verb handlers, event
   * subscribers) is never serialized, only state. The saved manifest is
   * reconstructed from world.state.meta so the dispatcher, moduleManager, and
   * module state namespaces are registered, then the live EventBus those modules
   * subscribed to is threaded into the restored WorldStore so subscriptions
   * survive the swap (core-004).
   *
   * @throws SaveLoadError on malformed or unsupported-version saves.
   */
  static deserialize(
    serialized: string,
    options: { modules?: EngineModule[]; ruleset?: RulesetDefinition } = {},
  ): Engine {
    let data: { world: { state: WorldState; rngState: number }; actionLog?: ActionIntent[] };
    try {
      data = JSON.parse(serialized) as typeof data;
    } catch {
      throw new SaveLoadError({
        code: 'SAVE_MALFORMED',
        message: 'Engine save is not valid JSON.',
        hint: 'The save may be truncated or corrupted. Restore from a backup.',
      });
    }
    if (!data || !data.world || !data.world.state || !data.world.state.meta) {
      throw new SaveLoadError({
        code: 'SAVE_MALFORMED',
        message: 'Engine save is missing required world state.',
        hint: 'Expected an object with { world: { state, rngState }, actionLog }.',
      });
    }

    const meta = data.world.state.meta;
    const manifest: GameManifest = {
      id: meta.gameId,
      title: '',
      version: '',
      engineVersion: '0.1.0',
      ruleset: meta.activeRuleset,
      modules: meta.activeModules,
      contentPacks: [],
    };

    // Build the engine normally so dispatcher + moduleManager + namespaces are
    // registered and modules subscribe to this.store.events (the live bus).
    const engine = new Engine({
      manifest,
      seed: meta.seed,
      modules: options.modules,
      ruleset: options.ruleset,
    });

    // Replace the fresh store with the saved one, reusing the live EventBus so
    // module subscriptions registered above are preserved. WorldStore.deserialize
    // runs the save-version migration chain and restores meta.idCounter + rng.
    const restored = WorldStore.deserialize(
      JSON.stringify(data.world),
      engine.store.events,
    );
    (engine as { store: WorldStore }).store = restored;

    // Restore the action log so getActionLog()/serialize() round-trip.
    engine.actionLog = data.actionLog ? [...data.actionLog] : [];

    return engine;
  }

  /** Get current tick */
  get tick(): number {
    return this.store.tick;
  }

  /** Get current world state (read-only access) */
  get world(): Readonly<WorldState> {
    return this.store.state;
  }

  /** Get the formula registry */
  get formulas(): FormulaRegistry {
    return this.moduleManager.formulas;
  }
}
