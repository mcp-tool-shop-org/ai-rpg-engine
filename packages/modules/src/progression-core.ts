// progression-core — flexible progression framework
// Supports XP/levels, milestones, reputation, skill-use growth, item upgrades.
// All models reduce to: earn currency → spend on tree nodes → get effects.

import type {
  EngineModule,
  WorldState,
  ResolvedEvent,
  EntityState,
  ScalarValue,
} from '@ai-rpg-engine/core';
import { nextId } from '@ai-rpg-engine/core';
import type { ProgressionTreeDefinition, ProgressionNode, EffectDefinition } from '@ai-rpg-engine/content-schema';

// --- Types ---

export type ProgressionState = {
  /** Currency balances: entityId → currencyId → amount */
  currencies: Record<string, Record<string, number>>;
  /** Unlocked nodes: entityId → treeId → nodeId[] */
  unlocked: Record<string, Record<string, string[]>>;
};

export type ProgressionEvent = {
  entityId: string;
  type: 'currency-gained' | 'currency-spent' | 'node-unlocked';
  treeId?: string;
  nodeId?: string;
  currencyId?: string;
  amount?: number;
  tick: number;
};

export type CurrencyReward = {
  /** Event pattern to listen for (e.g. 'combat.entity.defeated') */
  eventPattern: string;
  /** Which currency to grant */
  currencyId: string;
  /** Amount to grant (or function of event payload) */
  amount: number | ((event: ResolvedEvent, world: WorldState) => number);
  /** Who receives the reward: 'actor' (event.actorId) or custom function */
  recipient?: 'actor' | ((event: ResolvedEvent, world: WorldState) => string | undefined);
};

export type ProgressionCoreConfig = {
  /** Progression trees (content definitions) */
  trees?: ProgressionTreeDefinition[];
  /** Automatic currency rewards from events */
  rewards?: CurrencyReward[];
  /** Effect handlers for progression node effects */
  effectHandlers?: Record<string, EffectHandler>;
};

export type EffectHandler = (
  effect: EffectDefinition,
  entity: EntityState,
  world: WorldState,
) => void;

export type UnlockResult = {
  success: boolean;
  reason?: string;
  event?: ProgressionEvent;
  effects?: EffectDefinition[];
};

// --- Module ---

export function createProgressionCore(config?: ProgressionCoreConfig): EngineModule {
  const trees = new Map<string, ProgressionTreeDefinition>();
  for (const tree of config?.trees ?? []) {
    trees.set(tree.id, tree);
  }

  const rewards = config?.rewards ?? [];
  const effectHandlers: Record<string, EffectHandler> = {
    'stat-boost': defaultStatBoost,
    'resource-boost': defaultResourceBoost,
    'grant-tag': defaultGrantTag,
    'set-global': defaultSetGlobal,
    ...config?.effectHandlers,
  };

  return {
    id: 'progression-core',
    version: '0.1.0',

    register(ctx) {
      ctx.persistence.registerNamespace('progression-core', {
        currencies: {},
        unlocked: {},
      } as ProgressionState);

      // Register 'unlock' verb for spending currency on tree nodes
      ctx.actions.registerVerb('unlock', (action, world) => {
        const treeId = action.parameters?.treeId as string;
        const nodeId = action.parameters?.nodeId as string;

        if (!treeId || !nodeId) {
          return [{
            id: nextId('evt'),
            tick: action.issuedAtTick,
            type: 'progression.unlock.rejected',
            actorId: action.actorId,
            payload: { reason: 'missing treeId or nodeId' },
          }];
        }

        const result = unlockNode(world, action.actorId, treeId, nodeId, trees, effectHandlers, action.issuedAtTick);

        if (!result.success) {
          return [{
            id: nextId('evt'),
            tick: action.issuedAtTick,
            type: 'progression.unlock.rejected',
            actorId: action.actorId,
            payload: { treeId, nodeId, reason: result.reason },
          }];
        }

        return [{
          id: nextId('evt'),
          tick: action.issuedAtTick,
          type: 'progression.node.unlocked',
          actorId: action.actorId,
          payload: {
            treeId,
            nodeId,
            effects: result.effects?.map((e) => e.type) ?? [],
          },
        }];
      });

      // Set up automatic currency rewards from events
      for (const reward of rewards) {
        ctx.events.on(reward.eventPattern, (event, world) => {
          const recipientId = getRecipientId(reward, event, world);
          if (!recipientId) return;

          const amount = typeof reward.amount === 'function'
            ? reward.amount(event, world)
            : reward.amount;

          if (amount <= 0) return;
          addCurrency(world, recipientId, reward.currencyId, amount, event.tick);
        });
      }
    },
  };
}

// --- Currency Operations ---

function getProgressionState(world: WorldState): ProgressionState {
  return (world.modules['progression-core'] ?? { currencies: {}, unlocked: {} }) as ProgressionState;
}

/** Get an entity's balance in a currency */
export function getCurrency(world: WorldState, entityId: string, currencyId: string): number {
  const state = getProgressionState(world);
  return state.currencies[entityId]?.[currencyId] ?? 0;
}

/** Add currency to an entity */
export function addCurrency(
  world: WorldState,
  entityId: string,
  currencyId: string,
  amount: number,
  tick: number,
): void {
  const state = getProgressionState(world);
  if (!state.currencies[entityId]) {
    state.currencies[entityId] = {};
  }
  state.currencies[entityId][currencyId] = (state.currencies[entityId][currencyId] ?? 0) + amount;
}

/** Spend currency (returns false if insufficient) */
export function spendCurrency(
  world: WorldState,
  entityId: string,
  currencyId: string,
  amount: number,
): boolean {
  const balance = getCurrency(world, entityId, currencyId);
  if (balance < amount) return false;
  const state = getProgressionState(world);
  state.currencies[entityId][currencyId] = balance - amount;
  return true;
}

// --- Node Operations ---

/** Get all unlocked nodes for an entity in a tree */
export function getUnlockedNodes(world: WorldState, entityId: string, treeId: string): string[] {
  const state = getProgressionState(world);
  return state.unlocked[entityId]?.[treeId] ?? [];
}

/** Check if a specific node is unlocked */
export function isNodeUnlocked(world: WorldState, entityId: string, treeId: string, nodeId: string): boolean {
  return getUnlockedNodes(world, entityId, treeId).includes(nodeId);
}

/** Check if a node can be unlocked (prerequisites met, currency available) */
export function canUnlock(
  world: WorldState,
  entityId: string,
  treeId: string,
  nodeId: string,
  trees: Map<string, ProgressionTreeDefinition>,
): { can: boolean; reason?: string } {
  const tree = trees.get(treeId);
  if (!tree) return { can: false, reason: `tree not found: ${treeId}` };

  const node = tree.nodes.find((n) => n.id === nodeId);
  if (!node) return { can: false, reason: `node not found: ${nodeId}` };

  // Already unlocked?
  if (isNodeUnlocked(world, entityId, treeId, nodeId)) {
    return { can: false, reason: 'already unlocked' };
  }

  // Check prerequisites
  const unlocked = getUnlockedNodes(world, entityId, treeId);
  if (node.requires?.length) {
    const missing = node.requires.filter((r) => !unlocked.includes(r));
    if (missing.length > 0) {
      return { can: false, reason: `missing prerequisites: ${missing.join(', ')}` };
    }
  }

  // Check currency
  const balance = getCurrency(world, entityId, tree.currency);
  if (balance < node.cost) {
    return { can: false, reason: `insufficient ${tree.currency}: have ${balance}, need ${node.cost}` };
  }

  return { can: true };
}

/** Unlock a node: pay cost, record unlock, apply effects */
export function unlockNode(
  world: WorldState,
  entityId: string,
  treeId: string,
  nodeId: string,
  trees: Map<string, ProgressionTreeDefinition>,
  effectHandlers: Record<string, EffectHandler>,
  tick: number,
): UnlockResult {
  const check = canUnlock(world, entityId, treeId, nodeId, trees);
  if (!check.can) {
    return { success: false, reason: check.reason };
  }

  const tree = trees.get(treeId)!;
  const node = tree.nodes.find((n) => n.id === nodeId)!;

  // Pay the cost
  if (!spendCurrency(world, entityId, tree.currency, node.cost)) {
    return { success: false, reason: 'currency spend failed' };
  }

  // Record the unlock
  const state = getProgressionState(world);
  if (!state.unlocked[entityId]) {
    state.unlocked[entityId] = {};
  }
  if (!state.unlocked[entityId][treeId]) {
    state.unlocked[entityId][treeId] = [];
  }
  state.unlocked[entityId][treeId].push(nodeId);

  // Apply effects
  const entity = world.entities[entityId];
  if (entity && node.effects.length > 0) {
    for (const effect of node.effects) {
      const handler = effectHandlers[effect.type];
      if (handler) {
        handler(effect, entity, world);
      }
    }
  }

  return {
    success: true,
    event: {
      entityId,
      type: 'node-unlocked',
      treeId,
      nodeId,
      currencyId: tree.currency,
      amount: node.cost,
      tick,
    },
    effects: node.effects,
  };
}

/** Get all nodes available for unlock (prerequisites met, enough currency) */
export function getAvailableNodes(
  world: WorldState,
  entityId: string,
  treeId: string,
  trees: Map<string, ProgressionTreeDefinition>,
): ProgressionNode[] {
  const tree = trees.get(treeId);
  if (!tree) return [];

  return tree.nodes.filter((node) => {
    const check = canUnlock(world, entityId, treeId, node.id, trees);
    return check.can;
  });
}

// --- Default Effect Handlers ---

function defaultStatBoost(effect: EffectDefinition, entity: EntityState): void {
  const statId = effect.params.stat as string;
  const amount = effect.params.amount as number;
  if (statId && amount) {
    entity.stats[statId] = (entity.stats[statId] ?? 0) + amount;
  }
}

function defaultResourceBoost(effect: EffectDefinition, entity: EntityState): void {
  const resourceId = effect.params.resource as string;
  const amount = effect.params.amount as number;
  if (resourceId && amount) {
    entity.resources[resourceId] = (entity.resources[resourceId] ?? 0) + amount;
  }
}

function defaultGrantTag(effect: EffectDefinition, entity: EntityState): void {
  const tag = effect.params.tag as string;
  if (tag && !entity.tags.includes(tag)) {
    entity.tags.push(tag);
  }
}

function defaultSetGlobal(effect: EffectDefinition, _entity: EntityState, world: WorldState): void {
  const key = effect.params.key as string;
  const value = effect.params.value;
  if (key && value !== undefined) {
    world.globals[key] = value;
  }
}

// --- Helpers ---

function getRecipientId(
  reward: CurrencyReward,
  event: ResolvedEvent,
  world: WorldState,
): string | undefined {
  if (!reward.recipient || reward.recipient === 'actor') {
    return event.actorId;
  }
  return reward.recipient(event, world);
}
