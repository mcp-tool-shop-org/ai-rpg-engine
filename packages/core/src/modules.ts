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

export class ModuleManager {
  private modules: Map<string, EngineModule> = new Map();
  private ruleChecks: RuleCheck[] = [];
  private ruleEffects: RuleEffect[] = [];
  private panels: PanelDefinition[] = [];
  private inspectors: DebugInspector[] = [];
  private namespaceDefaults: Map<string, unknown> = new Map();

  constructor(
    private dispatcher: ActionDispatcher,
    private eventBus: EventBus,
  ) {}

  /** Register and initialize a module */
  register(module: EngineModule, store: WorldStore): void {
    // Check dependencies
    if (module.dependsOn) {
      for (const dep of module.dependsOn) {
        if (!this.modules.has(dep)) {
          throw new Error(`Module "${module.id}" depends on "${dep}" which is not registered`);
        }
      }
    }

    const ctx = this.createContext(module.id, store);
    module.register(ctx);
    this.modules.set(module.id, module);
  }

  /** Check if a module is registered */
  has(moduleId: string): boolean {
    return this.modules.has(moduleId);
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

  /** Apply rule effects to a resolved event */
  applyEffects(event: ResolvedEvent, world: WorldState): ResolvedEvent[] {
    const additional: ResolvedEvent[] = [];
    for (const effect of this.ruleEffects) {
      additional.push(...effect.apply(event, world));
    }
    return additional;
  }

  /** Initialize module state namespaces in world */
  initializeNamespaces(store: WorldStore): void {
    for (const [moduleId, defaults] of this.namespaceDefaults) {
      if (store.getModuleState(moduleId) === undefined) {
        store.setModuleState(moduleId, structuredClone(defaults));
      }
    }
  }

  private createContext(moduleId: string, store: WorldStore): ModuleRegistrationContext {
    const self = this;

    const actions: ActionRegistry = {
      registerVerb(verb: string, handler: VerbHandler): void {
        self.dispatcher.registerVerb(verb, handler);
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
        self.eventBus.on(eventType, handler);
      },
      emit(event: ResolvedEvent): void {
        store.recordEvent(event);
      },
    };

    const content: ContentRegistry = {
      extendSchema(_moduleId: string, _schema: Record<string, unknown>): void {
        // Content schema extension — placeholder for Phase 2
      },
    };

    const persistence: PersistenceRegistry = {
      registerNamespace(modId: string, defaults: unknown): void {
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

    return { actions, rules, events, content, persistence, ui, debug };
  }
}
