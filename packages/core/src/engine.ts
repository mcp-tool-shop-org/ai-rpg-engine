// Engine — the main orchestrator tying world, actions, events, and modules

import type {
  GameManifest,
  EngineModule,
  ActionIntent,
  ResolvedEvent,
  RulesetDefinition,
  WorldState,
} from './types.js';
import { WorldStore, SaveLoadError, assertSaveMetaShape } from './world.js';
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
      ruleset: options.ruleset,
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

    // Wire module rule EFFECTS into the dispatch pipeline (v2.5 C1). Rule
    // checks were wired above since day one, but effects registered via
    // rules.registerEffect were stored and never executed. Each
    // handler-resolved event is offered to every registered effect; events
    // they return are recorded through the same recordEvent choke point so
    // ordering and ids stay deterministic (see ActionDispatcher.dispatch).
    this.dispatcher.registerEffectApplier((event, world) =>
      this.moduleManager.applyEffects(event, world),
    );
  }

  /** Submit a player action */
  submitAction(verb: string, options?: Partial<Pick<ActionIntent, 'targetIds' | 'toolId' | 'parameters'>>): ResolvedEvent[] {
    // Ghost-actor guard, symmetric with submitActionAs (v2.5 C2): the default
    // playerId is '' and nothing forces a consumer to register the player
    // entity before acting. A verb handler reading entities[actorId] for a
    // missing player would crash or silently act on undefined; short-circuit
    // to a structured action.rejected instead. Guarded before createAction so
    // no action id is minted for the ghost attempt (same as submitActionAs);
    // the tick still advances, matching every other rejected action.
    const playerId = this.store.state.playerId;
    if (!this.store.state.entities[playerId]) {
      this.store.emitEvent('action.rejected', {
        verb,
        actorId: playerId,
        reason: playerId === ''
          ? 'unknown actor: state.playerId is not set. Set world.playerId to the player entity\'s id (and add that entity) before submitting player actions.'
          : `unknown actor: no entity "${playerId}" in world state for state.playerId. Add the player entity before acting, or check the id for a typo.`,
      }, { actorId: playerId });
      this.store.advanceTick();
      return [];
    }

    const action = this.dispatcher.createAction(
      verb,
      playerId,
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
    // Ghost-actor guard (v2.5 C2), symmetric with submitActionAs: this method
    // is public and accepts a caller-built ActionIntent, so the actor must be
    // validated here too. Guarded BEFORE the actionLog push so a ghost action
    // never enters the replay log — matching submitActionAs, whose guard
    // fires before the action is even created.
    if (!this.store.state.entities[action.actorId]) {
      this.store.emitEvent('action.rejected', {
        verb: action.verb,
        actorId: action.actorId,
        reason: `unknown actor: no entity "${action.actorId}" in world state. Add the entity before acting as it, or check the actor id for a typo.`,
      }, { actorId: action.actorId });
      this.store.advanceTick();
      return [];
    }

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
    // Guard the meta fields fed into manifest reconstruction (v2.5 C5 family):
    // a crafted save with e.g. activeModules missing previously raw-threw the
    // same [...undefined] TypeError as a malformed manifest. On the load path
    // the structured error must be a SaveLoadError — the bad input is the save.
    assertSaveMetaShape(meta);
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
    // The caller's ruleset is threaded through so stat/resource bounds (C7)
    // survive the load — like modules, rulesets are code and never serialized.
    const restored = WorldStore.deserialize(
      JSON.stringify(data.world),
      engine.store.events,
      options.ruleset,
    );
    (engine as { store: WorldStore }).store = restored;

    // The module contexts' event-emit path (ctx.events.emit -> store.recordEvent)
    // captured the throwaway store during construction above; rebind it to the
    // restored store so post-load reactive emits (status reflect/DoT, cognition,
    // defeat cascades) land in the live eventLog with the live idCounter instead
    // of the orphaned construction store (v2.5 PC-1). The EventBus reuse
    // (core-004) already preserved the subscribe side; this fixes the emit side.
    engine.moduleManager.rebindStore(restored);

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
