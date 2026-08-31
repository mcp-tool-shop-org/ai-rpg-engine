// Engine — the main orchestrator tying world, actions, events, and modules

import type {
  GameManifest,
  EngineModule,
  ActionIntent,
  ResolvedEvent,
  RulesetDefinition,
  WorldState,
  AvailableAction,
  AvailableActionExpansion,
  ChannelFilter,
  EventChannel,
} from './types.js';
import { WorldStore, SaveLoadError, migrateModuleStates, type EventQuery, type EventLogRetention } from './world.js';
import { ActionDispatcher } from './actions.js';
import { ModuleManager, type ModuleLifecycleErrorHook } from './modules.js';
import type { FormulaRegistry } from './formulas.js';
import type { EventBus, EventBusListenerErrorHook } from './events.js';
import { PresentationChannels, type PresentedEvent } from './channels.js';
import { stateHash } from './state-hash.js';

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
  /**
   * Optional hook to observe isolated module init/teardown failures.
   * When omitted, {@link onListenerError} is used as a fallback so a host
   * that only supplies the listener hook still sees lifecycle errors.
   */
  onModuleError?: ModuleLifecycleErrorHook;
  /**
   * Event-log retention. Default keep-all (byte-identical replay). Applied by
   * {@link Engine.serialize} and {@link Engine.advanceRound}, never by a
   * preview clone snapshot.
   */
  eventLogRetention?: EventLogRetention;
};

/** Options accepted by {@link Engine.deserialize} — code plus observability hooks. */
export type EngineDeserializeOptions = Pick<
  EngineOptions,
  'modules' | 'ruleset' | 'onListenerError' | 'onModuleError'
>;

/** Emit due pending effects with the same isolation processAction uses. */
function emitDuePending(store: WorldStore): void {
  const due = store.processPending();
  for (const pending of due) {
    try {
      const payload =
        pending.payload && typeof pending.payload === 'object' && !Array.isArray(pending.payload)
          ? pending.payload
          : {};
      store.emitEvent(pending.type, payload, {
        causedBy: pending.sourceEventId,
      });
    } catch (err) {
      store.emitEvent('pending.failed', {
        pendingId: pending.id,
        type: pending.type,
        reason: `Due pending effect "${pending.id}" failed to emit: ${err instanceof Error ? err.message : String(err)}. Later due effects still run.`,
      }, { causedBy: pending.sourceEventId });
    }
  }
}

export class Engine {
  readonly store: WorldStore;
  readonly dispatcher: ActionDispatcher;
  readonly moduleManager: ModuleManager;
  readonly ruleset?: RulesetDefinition;
  private readonly presentation: PresentationChannels;

  private actionLog: ActionIntent[] = [];
  private closed = false;

  constructor(options: EngineOptions) {
    this.ruleset = options.ruleset;

    this.store = new WorldStore({
      manifest: options.manifest,
      seed: options.seed,
      ruleset: options.ruleset,
      onListenerError: options.onListenerError,
      eventLogRetention: options.eventLogRetention,
    });

    this.presentation = new PresentationChannels({
      onFilterError: options.onListenerError
        ? (err, event) => options.onListenerError!(err, event)
        : undefined,
    });

    this.dispatcher = new ActionDispatcher();
    this.moduleManager = new ModuleManager(
      this.dispatcher,
      this.store.events,
      options.onModuleError ??
        (options.onListenerError
          ? (err, phase, moduleId) => {
              options.onListenerError!(err, {
                id: '',
                tick: 0,
                type: `module.${phase}.failed`,
                payload: { moduleId },
              });
            }
          : undefined),
      this.presentation,
    );

    // Register modules
    if (options.modules) {
      // Claim every id first so dependsOn succeeds for peers later in the
      // same array (F-46bb43bc), then register in listed order.
      this.moduleManager.claimAll(options.modules);
      for (const mod of options.modules) {
        this.moduleManager.register(mod, this.store);
      }
      // Stamp each registered module's save-format version into meta (ENG-009)
      // so every serialize carries meta.moduleVersions and a later restore can
      // detect per-module drift. Values are filled into the map the WorldStore
      // constructor literal created — never a fresh object — so meta key order
      // (and byte-identical serialize between same-seed engines) is preserved.
      const moduleVersions = (this.store.state.meta.moduleVersions ??= {});
      for (const mod of options.modules) {
        moduleVersions[mod.id] = mod.version;
      }
      this.moduleManager.initializeNamespaces(this.store);
      try {
        this.moduleManager.initAll();
      } catch (err) {
        // A broken init must not leave a half-registered world: teardown
        // already-inited modules (isolated) before the constructor throw.
        this.moduleManager.teardownAll();
        throw err;
      }
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
    if (this.closed) return this.rejectShutdown(verb, this.store.state.playerId);
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
    if (this.closed) return this.rejectShutdown(verb, entityId);
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
    if (this.closed) return this.rejectShutdown(action.verb, action.actorId);
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

    // Process pending effects that are due. Isolate each emit the way dispatch
    // isolates handler events so one bad due effect cannot abort the tick
    // after action.resolved is already in the log (F-0a03d557).
    emitDuePending(this.store);

    // Advance tick after each action
    this.store.advanceTick();

    return events;
  }

  /**
   * Side-effect-free dispatch: clone the world, rebind modules onto the copy,
   * run the verb, return the clone's events, restore the live store.
   * Live tick, actionLog, rngState, and eventLog are unchanged.
   */
  preview(
    verb: string,
    options?: Partial<Pick<ActionIntent, 'targetIds' | 'toolId' | 'parameters'>>,
  ): ResolvedEvent[] {
    if (this.closed) return [];
    const liveStore = this.store;
    const clone = WorldStore.deserialize(liveStore.serialize(), undefined, this.ruleset);
    this.moduleManager.rebindStore(clone);
    try {
      return this.runPlayerIntentOnStore(clone, verb, options);
    } finally {
      this.moduleManager.rebindStore(liveStore);
    }
  }

  /**
   * Player-facing legal verbs in the current context (dry validators, no emit).
   * Returns passing verb ids so existing catalog consumers keep working.
   * Rejection reasons live on {@link getAvailableActionsFor}.
   */
  getAvailableActions(): string[] {
    if (this.closed) return [];
    return this.listAvailableActions(this.store.state.playerId)
      .filter((a) => a.available)
      .map((a) => a.verb);
  }

  /** Unfiltered registered-verb catalog (no legality dry-run). */
  getRegisteredVerbs(): string[] {
    return this.dispatcher.getRegisteredVerbs();
  }

  /**
   * Dry-run every registered verb for `actorId`: pass/fail + reason, plus
   * module-registered target/tool expansions.
   */
  getAvailableActionsFor(actorId: string): AvailableAction[] {
    if (this.closed) return [];
    return this.listAvailableActions(actorId);
  }

  /**
   * Advance the living-world half of a turn: due pending, module onRound
   * hooks (registration order, isolated), optional log compaction, then tick.
   */
  advanceRound(rounds = 1): ResolvedEvent[] {
    if (this.closed) return [];
    const n = Number.isFinite(rounds) ? Math.min(1000, Math.max(1, Math.floor(rounds))) : 1;
    const events: ResolvedEvent[] = [];
    for (let i = 0; i < n; i++) {
      if (this.closed) break;
      events.push(...this.advanceOneRound());
    }
    return events;
  }

  /** Canonical state hash (sorted keys, quantized numbers). */
  hash(): string {
    return stateHash(this.store.state);
  }

  /** Present one event through the engine-owned PresentationChannels. */
  present(event: ResolvedEvent): PresentedEvent[] {
    return this.presentation.present(event);
  }

  /** Present a batch through the engine-owned PresentationChannels. */
  presentAll(events: ResolvedEvent[]): PresentedEvent[] {
    return this.presentation.presentAll(events);
  }

  addChannelFilter(channel: EventChannel, filter: ChannelFilter): void {
    this.presentation.addFilter(channel, filter);
  }

  queryEvents(query: EventQuery = {}): ResolvedEvent[] {
    return this.store.queryEvents(query);
  }

  compactEventLog(): ResolvedEvent | undefined {
    return this.store.compactEventLog();
  }

  private runPlayerIntentOnStore(
    store: WorldStore,
    verb: string,
    options?: Partial<Pick<ActionIntent, 'targetIds' | 'toolId' | 'parameters'>>,
  ): ResolvedEvent[] {
    const playerId = store.state.playerId;
    const logBefore = store.state.eventLog.length;
    if (!store.state.entities[playerId]) {
      store.emitEvent('action.rejected', {
        verb,
        actorId: playerId,
        reason: playerId === ''
          ? 'unknown actor: state.playerId is not set. Set world.playerId to the player entity\'s id (and add that entity) before submitting player actions.'
          : `unknown actor: no entity "${playerId}" in world state for state.playerId. Add the player entity before acting, or check the id for a typo.`,
      }, { actorId: playerId });
      store.advanceTick();
    } else {
      const action = this.dispatcher.createAction(
        verb,
        playerId,
        store.tick,
        { source: 'player', ...options },
        store.genId('act'),
      );
      this.dispatcher.dispatch(action, store);
      emitDuePending(store);
      store.advanceTick();
    }
    return store.state.eventLog.slice(logBefore);
  }

  private listAvailableActions(actorId: string): AvailableAction[] {
    const world = this.store.state;
    const verbs = this.dispatcher.getRegisteredVerbs();
    const out: AvailableAction[] = [];
    for (const verb of verbs) {
      const bare = this.dispatcher.createAction(verb, actorId, this.store.tick, { source: 'player' }, '');
      const validation = this.dispatcher.validate(bare, world);
      const expansions: AvailableActionExpansion[] = [];
      for (const expansion of this.dispatcher.expandVerb(verb, actorId, world)) {
        const expanded = this.dispatcher.createAction(
          verb,
          actorId,
          this.store.tick,
          {
            source: 'player',
            targetIds: expansion.targetIds,
            toolId: expansion.toolId,
            parameters: expansion.parameters,
          },
          '',
        );
        if (this.dispatcher.validate(expanded, world).valid) expansions.push(expansion);
      }
      const available = validation.valid || expansions.length > 0;
      const entry: AvailableAction = { verb, available };
      if (!validation.valid) entry.reason = validation.reason;
      if (expansions.length > 0) entry.expansions = expansions;
      out.push(entry);
    }
    return out;
  }

  private advanceOneRound(): ResolvedEvent[] {
    const logBefore = this.store.state.eventLog.length;
    emitDuePending(this.store);
    this.moduleManager.runRound();
    this.store.compactEventLog();
    this.store.advanceTick();
    return this.store.state.eventLog.slice(logBefore);
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
   *  resources they hold (timers, listeners, file handles). After this returns
   *  the engine is closed: submitAction/submitActionAs/processAction emit a
   *  structured action.rejected naming shutdown and do not dispatch.
   *  Idempotent from the caller's view — teardown() on a module is invoked at
   *  most once per call. */
  shutdown(): void {
    this.closed = true;
    this.moduleManager.teardownAll();
  }

  private rejectShutdown(verb: string, actorId?: string): ResolvedEvent[] {
    this.store.emitEvent('action.rejected', {
      verb,
      actorId,
      reason:
        'engine is shut down. Engine.shutdown() already ran; this instance will not dispatch further actions. Create a new Engine or deserialize a save to continue play.',
    }, actorId !== undefined ? { actorId } : undefined);
    return [];
  }

  /** Get the action log for replay */
  getActionLog(): readonly ActionIntent[] {
    return this.actionLog;
  }

  /** Serialize full engine state */
  serialize(): string {
    this.store.compactEventLog();
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
   * subscribers) is never serialized, only state. The saved world is restored
   * through WorldStore.deserialize FIRST (rngState check → migration chain →
   * meta-shape assert, in that order, so a migration may backfill legacy meta
   * fields — v2.5 PC-2), then module-level migrations run (ENG-009: each
   * registered module whose persisted meta.moduleVersions entry differs from
   * its registered version gets migrateState() on its namespace slice), then
   * the manifest is reconstructed from the restored post-migration meta so the
   * dispatcher, moduleManager, and module state namespaces are registered, and
   * the live EventBus those modules subscribed to is threaded into the
   * restored WorldStore so subscriptions survive the swap (core-004). After
   * the swap, namespaces ABSENT from the save are initialized to their
   * modules' registered defaults; PRESENT namespaces are never re-initialized.
   *
   * @throws SaveLoadError on malformed or unsupported-version saves, and with
   *   code SAVE_MODULE_MIGRATION_FAILED when a module's migrateState throws.
   */
  static deserialize(
    serialized: string,
    options: EngineDeserializeOptions = {},
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

    // Restore the world FIRST. WorldStore.deserialize is the single load
    // authority: it validates rngState (C3), runs the save-version migration
    // chain, and asserts the reconstruction-critical meta shape AFTER the
    // migrations — so a future SAVE_MIGRATIONS entry may backfill meta fields
    // for legacy saves (v2.5 PC-2). This path previously asserted the
    // PRE-migration meta, which foreclosed exactly those backfill migrations
    // and made the two public load paths disagree; the guard itself is intact,
    // it just runs where WorldStore.deserialize runs it. A nice side effect:
    // every save-rejection now fires before any module code executes. The
    // caller's ruleset is threaded through so stat/resource bounds (C7)
    // survive the load — like modules, rulesets are code, never serialized.
    const restored = WorldStore.deserialize(JSON.stringify(data.world), undefined, options.ruleset);

    // Module-level save-migration seam (ENG-009): after the world-level chain
    // + shape asserts, before ANY module code runs and before the world swaps
    // in, each registered module whose persisted namespace version
    // (meta.moduleVersions — absent means the pre-versioning sentinel) differs
    // from its registered version gets migrateState() on its own slice. A
    // throwing hook rejects the load with a structured
    // SAVE_MODULE_MIGRATION_FAILED here — consistent with "every
    // save-rejection fires before any module code executes" below.
    migrateModuleStates(restored.state, options.modules ?? []);

    // Reconstruct the manifest from the RESTORED (post-migration, shape-
    // asserted) meta — not the raw save blob — and build the engine normally
    // so dispatcher + moduleManager + namespaces are registered and modules
    // subscribe to this.store.events (the live bus).
    const meta = restored.state.meta;
    const manifest: GameManifest = {
      id: meta.gameId,
      title: '',
      version: '',
      engineVersion: '0.1.0',
      ruleset: meta.activeRuleset,
      modules: meta.activeModules,
      contentPacks: [],
    };
    const engine = new Engine({
      manifest,
      seed: meta.seed,
      modules: options.modules,
      ruleset: options.ruleset,
      onListenerError: options.onListenerError,
      onModuleError: options.onModuleError,
    });

    // Swap the fresh construction store for the restored one, threading the
    // live EventBus (the bus modules subscribed to during construction above)
    // into the restored store so subscriptions survive the swap (core-004).
    (restored as { events: EventBus }).events = engine.store.events;
    (engine as { store: WorldStore }).store = restored;

    // The module contexts' event-emit path (ctx.events.emit -> store.recordEvent)
    // captured the throwaway store during construction above; rebind it to the
    // restored store so post-load reactive emits (status reflect/DoT, cognition,
    // defeat cascades) land in the live eventLog with the live idCounter instead
    // of the orphaned construction store (v2.5 PC-1). The EventBus reuse
    // (core-004) already preserved the subscribe side; this fixes the emit side.
    engine.moduleManager.rebindStore(restored);

    // Namespace-init guarantee (ENG-009): the constructor's
    // initializeNamespaces call above ran against the THROWAWAY store — the
    // restored store never got one, so a module registered AFTER the save was
    // written (its namespace absent from the save) previously had to hand-roll
    // lazy defaults or crash on first read. Run it against the restored store:
    // ABSENT namespaces get the module's registered defaults (cloned);
    // PRESENT namespaces are never touched — initializeNamespaces only writes
    // when getModuleState() is undefined, so loaded (or just-migrated) module
    // state is never clobbered back to defaults.
    engine.moduleManager.initializeNamespaces(restored);

    // Restore the action log so getActionLog()/serialize() round-trip. Every
    // other field this method reads from a save is validated with a
    // structured SaveLoadError before use (assertSaveMetaShape, the rngState
    // guard in world.ts) — actionLog had none of that (dogfood/v2.6
    // core-spine amend). A non-iterable truthy actionLog (a number, boolean,
    // or plain object) would raw-throw a TypeError out of
    // `[...data.actionLog]` instead of this method's documented `@throws
    // SaveLoadError` contract; a JSON STRING would silently succeed and
    // spread into an array of single characters, accepted as the action log
    // with zero error — the same "corrupt input silently accepted as valid"
    // failure class the rest of this file was hardened to eliminate.
    if (data.actionLog !== undefined && data.actionLog !== null && !Array.isArray(data.actionLog)) {
      throw new SaveLoadError({
        code: 'SAVE_MALFORMED',
        message: `Save actionLog must be an array, got ${typeof data.actionLog}.`,
        hint: 'The save file is corrupt or was not produced by this engine. Restore from a backup.',
      });
    }
    engine.actionLog = Array.isArray(data.actionLog) ? [...data.actionLog] : [];

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
