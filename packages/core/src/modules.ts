// Module registration system — how mechanics plug in without infecting core

import type {
  EngineModule,
  ModuleRegistrationContext,
  ActionRegistry,
  RuleRegistry,
  EventRegistry,
  ContentRegistry,
  PersistenceRegistry,
  UIRegistry,
  DebugRegistry,
  FormulaRegistryAccess,
  VerbHandler,
  RuleCheck,
  RuleEffect,
  EventHandler,
  PanelDefinition,
  DebugInspector,
  ResolvedEvent,
  WorldState,
} from './types.js';
import type { WorldStore } from './world.js';
import type { ActionDispatcher } from './actions.js';
import { EventBus } from './events.js';
import { FormulaRegistry } from './formulas.js';

/** One-word description of an effect.apply return for rule.effect.failed. */
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

/** Why an effect.apply array element is not a recordable event. */
function describeInvalidEventElement(value: unknown, index: number): string {
  if (!isPlainObject(value)) {
    return `non-object element at index ${index}: ${describeValue(value)}`;
  }
  return `element at index ${index} with missing, empty, or non-string type`;
}

/** Host hook for isolated module init/teardown failures (F-64f9ad98). */
export type ModuleLifecycleErrorHook = (
  err: unknown,
  phase: 'init' | 'teardown',
  moduleId: string,
) => void;

export class ModuleManager {
  private modules: Map<string, EngineModule> = new Map();
  private moduleContexts: Map<string, ModuleRegistrationContext> = new Map();
  /** Ids claimed for the current Engine constructor list, before register(). */
  private claimedIds: Set<string> = new Set();
  private ruleChecks: RuleCheck[] = [];
  private ruleEffects: RuleEffect[] = [];
  private panels: PanelDefinition[] = [];
  private inspectors: DebugInspector[] = [];
  private namespaceDefaults: Map<string, unknown> = new Map();
  readonly formulas: FormulaRegistry = new FormulaRegistry();
  /**
   * The store that module event emits (`ctx.events.emit`) record into. Held as
   * a single mutable reference — NOT captured per-context — so
   * Engine.deserialize can rebind it after swapping the throwaway construction
   * store for the restored one, keeping post-load module emits in the live
   * world instead of an orphaned store (v2.5 PC-1).
   */
  private activeStore?: WorldStore;

  constructor(
    private dispatcher: ActionDispatcher,
    private eventBus: EventBus,
    private onModuleError?: ModuleLifecycleErrorHook,
  ) {}

  /**
   * Claim every module id in a constructor list before {@link register} so
   * `dependsOn` succeeds for peers later in the same array (F-46bb43bc).
   * Duplicate ids in the list (or against already-registered modules) throw.
   */
  claimAll(modules: readonly EngineModule[]): void {
    for (const mod of modules) {
      if (this.modules.has(mod.id) || this.claimedIds.has(mod.id)) {
        throw new Error(
          `Module id "${mod.id}" is already registered. ` +
            `Module ids must be unique; rename one of the conflicting modules or remove the duplicate from the engine's modules list.`,
        );
      }
      this.claimedIds.add(mod.id);
    }
  }

  /** Register and initialize a module */
  register(module: EngineModule, store: WorldStore): void {
    // Duplicate module id is a real config mistake (two modules claiming the
    // same id would silently clobber each other's context and verbs). Fail
    // loud and actionable rather than degrade — there is no safe way to run
    // two modules under one id. claimAll already caught list-internal dups.
    if (this.modules.has(module.id)) {
      throw new Error(
        `Module id "${module.id}" is already registered. ` +
          `Module ids must be unique; rename one of the conflicting modules or remove the duplicate from the engine's modules list.`,
      );
    }

    // Check dependencies against already-registered modules AND ids claimed
    // for this constructor list, so listing a child before its parent in
    // options.modules is not a hard fail (F-46bb43bc). Still throw when the
    // dep is not in this engine at all.
    if (module.dependsOn) {
      for (const dep of module.dependsOn) {
        if (!this.modules.has(dep) && !this.claimedIds.has(dep)) {
          throw new Error(`Module "${module.id}" depends on "${dep}" which is not registered`);
        }
      }
    }

    // Bind the store module emits record into (rebindable across deserialize —
    // PC-1). All modules in one manager share the one active store.
    this.activeStore = store;
    const ctx = this.createContext(module.id);
    module.register(ctx);
    this.modules.set(module.id, module);
    this.moduleContexts.set(module.id, ctx);
    this.claimedIds.delete(module.id);
  }

  /**
   * Redirect module event emits (`ctx.events.emit`) to a different store.
   * Called by Engine.deserialize after the restored store replaces the
   * throwaway the modules were registered against, so reactive follow-on events
   * land in the live eventLog with the live idCounter instead of the orphaned
   * construction store (v2.5 PC-1).
   */
  rebindStore(store: WorldStore): void {
    this.activeStore = store;
  }

  /** Check if a module is registered */
  has(moduleId: string): boolean {
    return this.modules.has(moduleId);
  }

  /**
   * The registered EngineModule list, in registration order.
   *
   * Exists for load paths that restore a world into an ALREADY-WIRED engine
   * and must then run the module-migration seam themselves — specifically the
   * CLI's restoreSessionFromSave (packages/cli/src/bin.ts), which swaps a
   * restored WorldStore into a pack-built engine and needs the registered
   * module list to call `migrateModuleStates(restored.state, modules)` +
   * `initializeNamespaces(restored)` with the exact modules the pack wired
   * (pack closures own module construction, so the caller has no other way to
   * reach them — F-P8SP-001's structural note). Read-only: mutating the
   * returned array does not alter registration.
   */
  getModules(): readonly EngineModule[] {
    return [...this.modules.values()];
  }

  /** Get registered panels for UI */
  getPanels(): PanelDefinition[] {
    return this.panels;
  }

  /** Get registered inspectors for debug */
  getInspectors(): DebugInspector[] {
    return this.inspectors;
  }

  /** Run all rule checks against an action */
  checkRules(action: import('./types.js').ActionIntent, world: WorldState): { pass: boolean; failedCheck?: string } {
    for (const check of this.ruleChecks) {
      if (!check.check(action, world)) {
        return { pass: false, failedCheck: check.id };
      }
    }
    return { pass: true };
  }

  /**
   * Apply rule effects to a resolved event. Wired into the dispatch pipeline
   * by the Engine (v2.5 C1 — previously this had zero callers, so
   * `rules.registerEffect` silently never executed). Effects run in
   * registration order; returned events are recorded by the caller through
   * the store's recordEvent choke point, so ids and ordering stay
   * deterministic. A throwing effect is isolated into a structured
   * `rule.effect.failed` event naming the effect (consistent with how
   * dispatch isolates throwing validators/handlers) — one buggy effect can
   * neither crash the tick nor silently vanish, and later effects still run.
   */
  applyEffects(event: ResolvedEvent, world: WorldState): ResolvedEvent[] {
    const additional: ResolvedEvent[] = [];
    for (const effect of this.ruleEffects) {
      try {
        const produced = effect.apply(event, world);
        if (!Array.isArray(produced)) {
          // Non-array return (forgetting `return []`) used to throw inside this
          // try as "produced is not iterable" (F-daece5c6 sibling). Name it.
          additional.push({
            id: '',
            tick: event.tick,
            type: 'rule.effect.failed',
            payload: {
              effectId: effect.id,
              sourceEventId: event.id,
              reason: `effect "${effect.id}" returned non-array: ${describeValue(produced)}`,
            },
            causedBy: event.id,
          });
          continue;
        }
        // [null] and [{ payload }] pass Array.isArray then throw in dispatch's
        // recordEvent loop (F-208d62e4). Replace the hole with rule.effect.failed
        // naming this effect and the index; later elements still record.
        for (let i = 0; i < produced.length; i++) {
          const item = produced[i];
          if (!isEventObject(item)) {
            additional.push({
              id: '',
              tick: event.tick,
              type: 'rule.effect.failed',
              payload: {
                effectId: effect.id,
                sourceEventId: event.id,
                index: i,
                reason: `effect "${effect.id}" returned ${describeInvalidEventElement(item, i)}`,
              },
              causedBy: event.id,
            });
          } else {
            additional.push(item);
          }
        }
      } catch (err) {
        additional.push({
          id: '', // stamped deterministically by recordEvent
          tick: event.tick,
          type: 'rule.effect.failed',
          payload: {
            effectId: effect.id,
            sourceEventId: event.id,
            reason: err instanceof Error ? err.message : String(err),
          },
          causedBy: event.id,
        });
      }
    }
    return additional;
  }

  /** Call init() on all modules (after all are registered, before first tick).
   *  Each init is isolated: a throw is routed to onModuleError and a structured
   *  `module.init.failed` event, then remaining modules still init. If any
   *  init failed, the first error is rethrown after the loop so Engine
   *  construction can teardown already-inited modules (F-64f9ad98). */
  initAll(): void {
    let firstError: unknown;
    for (const [id, mod] of this.modules) {
      if (!mod.init) continue;
      const ctx = this.moduleContexts.get(id);
      if (!ctx) continue;
      try {
        mod.init(ctx);
      } catch (err) {
        this.routeModuleError(err, 'init', id);
        if (firstError === undefined) firstError = err;
      }
    }
    if (firstError !== undefined) {
      throw firstError instanceof Error
        ? firstError
        : new Error(String(firstError));
    }
  }

  /** Call teardown() on all modules (on shutdown). Each teardown is isolated
   *  so one throw cannot leak the rest of the pack's timers/handles. After
   *  every module.teardown() has run, the bus is cleared. */
  teardownAll(): void {
    for (const [id, mod] of this.modules) {
      if (!mod.teardown) continue;
      try {
        mod.teardown();
      } catch (err) {
        this.routeModuleError(err, 'teardown', id);
      }
    }
    this.eventBus.clear();
  }

  private routeModuleError(
    err: unknown,
    phase: 'init' | 'teardown',
    moduleId: string,
  ): void {
    const reason = err instanceof Error ? err.message : String(err);
    try {
      this.onModuleError?.(err, phase, moduleId);
    } catch {
      // Host hook must not abort remaining module lifecycle.
    }
    try {
      this.activeStore?.emitEvent(`module.${phase}.failed`, {
        moduleId,
        reason:
          phase === 'init'
            ? `Module "${moduleId}" init failed: ${reason}. Remaining modules still initialized; construction will abort and already-inited modules will be torn down.`
            : `Module "${moduleId}" teardown failed: ${reason}. Remaining modules still tear down.`,
      });
    } catch {
      // Emitting the structured signal must not abort remaining teardowns.
    }
  }

  /**
   * Initialize module state namespaces in world. Only ABSENT namespaces are
   * written — present (loaded or just-migrated) state is never clobbered.
   *
   * Function-valued defaults are factories (NamespaceDefaultsFactory): they
   * are invoked with the TARGET store's world at init time, so defaults can
   * depend on the world they join — the eventLog-cursor case (world-tick,
   * encounter-spawn) baselines its cursor to the current log length, which is
   * 0 on a fresh construction-time world and the full historical length on a
   * restored legacy save whose namespace is absent (P8-WL-006: a static
   * `cursor: 0` planted over an old log made the first tick re-consume the
   * entire prior session). Factory results are cloned like static defaults so
   * shared module constants never leak into world state.
   */
  initializeNamespaces(store: WorldStore): void {
    for (const [moduleId, defaults] of this.namespaceDefaults) {
      if (store.getModuleState(moduleId) === undefined) {
        const value =
          typeof defaults === 'function'
            ? (defaults as (world: WorldState) => unknown)(store.state)
            : defaults;
        store.setModuleState(moduleId, structuredClone(value));
      }
    }
  }

  private createContext(moduleId: string): ModuleRegistrationContext {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- capture for closure-based registries
    const self = this;

    const actions: ActionRegistry = {
      registerVerb(verb: string, handler: VerbHandler, opts?: { override?: boolean }): void {
        self.dispatcher.registerVerb(verb, handler, opts);
      },
    };

    const rules: RuleRegistry = {
      registerCheck(check: RuleCheck): void {
        self.ruleChecks.push(check);
      },
      registerEffect(effect: RuleEffect): void {
        self.ruleEffects.push(effect);
      },
    };

    const events: EventRegistry = {
      on(eventType: string, handler: EventHandler): void {
        if (eventType === '*') {
          self.eventBus.onAny(handler);
        } else {
          self.eventBus.on(eventType, handler);
        }
      },
      off(eventType: string, handler: EventHandler): void {
        if (eventType === '*') {
          self.eventBus.offAny(handler);
        } else {
          self.eventBus.off(eventType, handler);
        }
      },
      offAny(handler: EventHandler): void {
        self.eventBus.offAny(handler);
      },
      emit(event: ResolvedEvent): void {
        // Record into the CURRENT active store, not one captured at register
        // time — deserialize rebinds via rebindStore so post-load emits hit the
        // live world (v2.5 PC-1). activeStore is set by register() before any
        // tick can run, so it is always bound here.
        self.activeStore!.recordEvent(event);
      },
    };

    const content: ContentRegistry = {
      extendSchema(_moduleId: string, _schema: Record<string, unknown>): void {
        // Content schema extension — placeholder for Phase 2
      },
    };

    const persistence: PersistenceRegistry = {
      registerNamespace(modId: string, defaults: unknown, opts?: { override?: boolean }): void {
        // Same accidental-clobber class as registerVerb / FormulaRegistry
        // (F-b71bccf1): two modules claiming one world.modules key used to
        // silently last-wins. Fail loud unless the replacement is explicit.
        if (self.namespaceDefaults.has(modId) && !opts?.override) {
          throw new Error(
            `Persistence namespace "${modId}" is already registered. ` +
              `Namespace keys must be unique; a module has already claimed this world.modules key. ` +
              `Rename one namespace, remove the duplicate registration, or pass { override: true } to replace intentionally.`,
          );
        }
        self.namespaceDefaults.set(modId, defaults);
      },
    };

    const ui: UIRegistry = {
      registerPanel(panel: PanelDefinition): void {
        self.panels.push(panel);
      },
    };

    const debug: DebugRegistry = {
      registerInspector(inspector: DebugInspector): void {
        self.inspectors.push(inspector);
      },
    };

    const formulas: FormulaRegistryAccess = {
      register: (id, fn, opts) => self.formulas.register(id, fn, opts),
      get: (id) => self.formulas.get(id),
      has: (id) => self.formulas.has(id),
    };

    return { actions, rules, events, content, persistence, ui, debug, formulas };
  }
}
