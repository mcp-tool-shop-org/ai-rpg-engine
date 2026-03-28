// ability-core — register use-ability verb, validate costs, enforce cooldowns
// Genre-agnostic core. Abilities are defined per-genre via AbilityDefinition from content-schema.
// Effects are resolved by resolveEffects() from ability-effects.ts.

import type {
  EngineModule,
  ActionIntent,
  WorldState,
  ResolvedEvent,
  EntityState,
  ScalarValue,
} from '@ai-rpg-engine/core';
import { makeEvent } from './make-event.js';
import type {
  AbilityDefinition,
  ResourceCost,
  ConditionSpec,
} from '@ai-rpg-engine/content-schema';
import { simpleRoll } from './combat-core.js';
import { resolveEffects } from './ability-effects.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Maps generic ability stat roles to genre-specific stat names */
export type AbilityStatMapping = {
  /** Stat governing power / raw ability strength (e.g., vigor, chrome, grit) */
  power: string;
  /** Stat governing accuracy / finesse (e.g., instinct, reflex, draw-speed) */
  precision: string;
  /** Stat governing willpower / focus (e.g., will, netrunning, lore) */
  focus: string;
};

export const DEFAULT_ABILITY_STAT_MAPPING: AbilityStatMapping = {
  power: 'vigor',
  precision: 'instinct',
  focus: 'will',
};

/** Per-entity cooldown tracking: entityId -> abilityId -> expiresAtTick */
export type AbilityCooldownState = Record<string, Record<string, number>>;

/** Per-entity use counts: entityId -> abilityId -> count */
export type AbilityUseState = Record<string, Record<string, number>>;

/** Module persistence shape */
export type AbilityModuleState = {
  cooldowns: AbilityCooldownState;
  useCounts: AbilityUseState;
};

/** Result of a stat check */
export type AbilityCheckResult = {
  stat: string;
  difficulty: number;
  roll: number;
  passed: boolean;
  onFail?: string;
};

/** Config for createAbilityCore */
export type AbilityCoreConfig = {
  /** Ability definitions available in this game instance */
  abilities: AbilityDefinition[];
  /** Maps generic stat roles to genre-specific stat names */
  statMapping?: AbilityStatMapping;
};

// ---------------------------------------------------------------------------
// Genre-gated ability tables (follows crafting-recipes pattern)
// ---------------------------------------------------------------------------

/** Universal abilities available in all genres */
export const UNIVERSAL_ABILITIES: AbilityDefinition[] = [];

/** Genre-specific ability tables */
export const GENRE_ABILITIES: Record<string, AbilityDefinition[]> = {};

/**
 * Get abilities available for a given genre + entity tags.
 * Follows the same pattern as getAvailableRecipes() in crafting-recipes.ts.
 */
export function getAbilitiesForGenre(
  genre: string,
  entityTags?: string[],
): AbilityDefinition[] {
  const all = [
    ...UNIVERSAL_ABILITIES,
    ...(GENRE_ABILITIES[genre] ?? []),
  ];

  if (!entityTags || entityTags.length === 0) return all;

  return all.filter((ability) => {
    if (!ability.requirements || ability.requirements.length === 0) return true;
    return ability.requirements.every((req) => checkCondition(req, entityTags));
  });
}

// ---------------------------------------------------------------------------
// Condition checking
// ---------------------------------------------------------------------------

function checkCondition(cond: ConditionSpec, entityTags: string[]): boolean {
  switch (cond.type) {
    case 'has-tag':
      return entityTags.includes(cond.params.tag as string);
    case 'not-tag':
      return !entityTags.includes(cond.params.tag as string);
    default:
      // Unknown condition type — fail open (don't gate)
      return true;
  }
}

function checkRequirements(
  ability: AbilityDefinition,
  entity: EntityState,
): { valid: boolean; reason?: string } {
  if (!ability.requirements || ability.requirements.length === 0) {
    return { valid: true };
  }
  for (const req of ability.requirements) {
    if (!checkCondition(req, entity.tags)) {
      return {
        valid: false,
        reason: `missing requirement: ${req.type} ${JSON.stringify(req.params)}`,
      };
    }
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
// Resource checking
// ---------------------------------------------------------------------------

function checkResources(
  costs: ResourceCost[] | undefined,
  entity: EntityState,
): { valid: boolean; reason?: string } {
  if (!costs || costs.length === 0) return { valid: true };

  for (const cost of costs) {
    const current = entity.resources[cost.resourceId] ?? 0;
    if (current < cost.amount) {
      return {
        valid: false,
        reason: `not enough ${cost.resourceId}: need ${cost.amount}, have ${current}`,
      };
    }
  }
  return { valid: true };
}

function deductResources(
  costs: ResourceCost[] | undefined,
  entity: EntityState,
  action: ActionIntent,
): ResolvedEvent[] {
  if (!costs || costs.length === 0) return [];

  const events: ResolvedEvent[] = [];
  for (const cost of costs) {
    const previous = entity.resources[cost.resourceId] ?? 0;
    entity.resources[cost.resourceId] = previous - cost.amount;
    events.push(makeEvent(action, 'resource.changed', {
      entityId: entity.id,
      resource: cost.resourceId,
      previous,
      current: entity.resources[cost.resourceId],
      delta: -cost.amount,
    }));
  }
  return events;
}

// ---------------------------------------------------------------------------
// Cooldown helpers
// ---------------------------------------------------------------------------

function getModuleState(world: WorldState): AbilityModuleState {
  return (world.modules['ability-core'] ?? { cooldowns: {}, useCounts: {} }) as AbilityModuleState;
}

/** Check if an ability is on cooldown */
export function isAbilityOnCooldown(
  world: WorldState,
  entityId: string,
  abilityId: string,
): boolean {
  const state = getModuleState(world);
  const expiresAt = state.cooldowns[entityId]?.[abilityId] ?? 0;
  return world.meta.tick < expiresAt;
}

/** Get the tick when an ability's cooldown expires (0 if not on cooldown) */
export function getAbilityCooldown(
  world: WorldState,
  entityId: string,
  abilityId: string,
): number {
  const state = getModuleState(world);
  return state.cooldowns[entityId]?.[abilityId] ?? 0;
}

/** Check if an ability is ready to use */
export function isAbilityReady(
  world: WorldState,
  entityId: string,
  abilityId: string,
  abilities: AbilityDefinition[],
): boolean {
  const ability = abilities.find((a) => a.id === abilityId);
  if (!ability) return false;

  const entity = world.entities[entityId];
  if (!entity) return false;
  if ((entity.resources.hp ?? 0) <= 0) return false;

  // Check cooldown
  if (isAbilityOnCooldown(world, entityId, abilityId)) return false;

  // Check resources
  const resourceCheck = checkResources(ability.costs, entity);
  if (!resourceCheck.valid) return false;

  // Check requirements
  const reqCheck = checkRequirements(ability, entity);
  if (!reqCheck.valid) return false;

  return true;
}

/** Get all abilities an entity can use right now */
export function getAvailableAbilities(
  world: WorldState,
  entityId: string,
  abilities: AbilityDefinition[],
): AbilityDefinition[] {
  return abilities.filter((a) => isAbilityReady(world, entityId, a.id, abilities));
}

function setCooldown(
  world: WorldState,
  entityId: string,
  abilityId: string,
  cooldownTicks: number,
): void {
  const state = getModuleState(world);
  if (!state.cooldowns[entityId]) {
    state.cooldowns[entityId] = {};
  }
  state.cooldowns[entityId][abilityId] = world.meta.tick + cooldownTicks;
}

function incrementUseCount(
  world: WorldState,
  entityId: string,
  abilityId: string,
): void {
  const state = getModuleState(world);
  if (!state.useCounts[entityId]) {
    state.useCounts[entityId] = {};
  }
  state.useCounts[entityId][abilityId] =
    (state.useCounts[entityId][abilityId] ?? 0) + 1;
}

// ---------------------------------------------------------------------------
// Stat checks
// ---------------------------------------------------------------------------

function resolveChecks(
  ability: AbilityDefinition,
  entity: EntityState,
  tick: number,
): AbilityCheckResult[] {
  if (!ability.checks || ability.checks.length === 0) return [];

  return ability.checks.map((check) => {
    const statValue = entity.stats[check.stat] ?? 0;
    // Roll 1-20, pass if statValue + roll >= difficulty * 2
    // This gives a stat-dependent check where higher stats pass more often
    const roll = simpleRoll(tick, entity.id, `check:${ability.id}:${check.stat}`);
    const rollNorm = ((roll - 1) / 99) * 20 + 1; // map 1-100 to 1-20
    const passed = (statValue + rollNorm) >= (check.difficulty * 2);

    return {
      stat: check.stat,
      difficulty: check.difficulty,
      roll: Math.round(rollNorm),
      passed,
      onFail: check.onFail,
    };
  });
}

// ---------------------------------------------------------------------------
// Target resolution
// ---------------------------------------------------------------------------

function resolveTargets(
  ability: AbilityDefinition,
  action: ActionIntent,
  world: WorldState,
): { targets: EntityState[]; reason?: string } {
  const actor = world.entities[action.actorId];
  if (!actor) return { targets: [], reason: 'actor not found' };

  switch (ability.target.type) {
    case 'self':
      return { targets: [actor] };

    case 'none':
      return { targets: [] };

    case 'single': {
      const targetId = action.targetIds?.[0];
      if (!targetId) return { targets: [], reason: 'no target specified' };
      const target = world.entities[targetId];
      if (!target) return { targets: [], reason: `target ${targetId} not found` };
      if (target.zoneId !== actor.zoneId) {
        return { targets: [], reason: 'target not in same zone' };
      }
      if ((target.resources.hp ?? 0) <= 0) {
        return { targets: [], reason: 'target is already defeated' };
      }
      // Filter check
      if (ability.target.filter && ability.target.filter.length > 0) {
        const hasTag = ability.target.filter.some((f) => target.tags.includes(f));
        if (!hasTag) {
          return { targets: [], reason: `target lacks required tags: ${ability.target.filter.join(', ')}` };
        }
      }
      return { targets: [target] };
    }

    case 'all-enemies': {
      const enemies = Object.values(world.entities).filter((e) =>
        e.id !== actor.id &&
        e.zoneId === actor.zoneId &&
        (e.resources.hp ?? 0) > 0 &&
        e.type !== actor.type,
      );
      if (enemies.length === 0) {
        return { targets: [], reason: 'no valid targets in zone' };
      }
      return { targets: enemies };
    }

    case 'zone':
      // Zone-targeted abilities don't need entity targets
      return { targets: [] };

    default:
      return { targets: [], reason: `unknown target type: ${ability.target.type}` };
  }
}

// ---------------------------------------------------------------------------
// Module factory
// ---------------------------------------------------------------------------

export function createAbilityCore(config: AbilityCoreConfig): EngineModule {
  const abilityMap = new Map<string, AbilityDefinition>();
  for (const ability of config.abilities) {
    abilityMap.set(ability.id, ability);
  }

  const _statMapping = config.statMapping ?? DEFAULT_ABILITY_STAT_MAPPING;

  return {
    id: 'ability-core',
    version: '0.1.0',
    dependsOn: ['status-core'],

    register(ctx) {
      ctx.actions.registerVerb('use-ability', (action, world) =>
        useAbilityHandler(action, world, abilityMap, _statMapping),
      );

      ctx.persistence.registerNamespace('ability-core', {
        cooldowns: {},
        useCounts: {},
      } satisfies AbilityModuleState);
    },
  };
}

// ---------------------------------------------------------------------------
// Verb handler
// ---------------------------------------------------------------------------

function useAbilityHandler(
  action: ActionIntent,
  world: WorldState,
  abilityMap: Map<string, AbilityDefinition>,
  _statMapping: AbilityStatMapping,
): ResolvedEvent[] {
  const events: ResolvedEvent[] = [];

  // 1. Lookup ability
  const abilityId = action.parameters?.abilityId as string | undefined;
  if (!abilityId) {
    return [makeEvent(action, 'action.rejected', { reason: 'no abilityId specified' })];
  }

  const ability = abilityMap.get(abilityId);
  if (!ability) {
    return [makeEvent(action, 'action.rejected', { reason: `ability ${abilityId} not found` })];
  }

  // 2. Validate actor
  const actor = world.entities[action.actorId];
  if (!actor) {
    return [makeEvent(action, 'action.rejected', { reason: 'actor not found' })];
  }
  if ((actor.resources.hp ?? 0) <= 0) {
    return [makeEvent(action, 'action.rejected', { reason: 'actor is defeated' })];
  }

  // 3. Check requirements (tags)
  const reqCheck = checkRequirements(ability, actor);
  if (!reqCheck.valid) {
    return [makeEvent(action, 'ability.rejected', {
      abilityId,
      abilityName: ability.name,
      reason: reqCheck.reason,
    })];
  }

  // 4. Check cooldown
  if (isAbilityOnCooldown(world, actor.id, abilityId)) {
    const expiresAt = getAbilityCooldown(world, actor.id, abilityId);
    return [makeEvent(action, 'ability.rejected', {
      abilityId,
      abilityName: ability.name,
      reason: `on cooldown until tick ${expiresAt}`,
      cooldownExpiresAt: expiresAt,
    })];
  }

  // 5. Check resources
  const resourceCheck = checkResources(ability.costs, actor);
  if (!resourceCheck.valid) {
    return [makeEvent(action, 'ability.rejected', {
      abilityId,
      abilityName: ability.name,
      reason: resourceCheck.reason,
    })];
  }

  // 6. Resolve targets
  const { targets, reason: targetReason } = resolveTargets(ability, action, world);
  if (targetReason && ability.target.type !== 'none' && ability.target.type !== 'zone') {
    return [makeEvent(action, 'ability.rejected', {
      abilityId,
      abilityName: ability.name,
      reason: targetReason,
    })];
  }

  // 7. Stat checks
  const checkResults = resolveChecks(ability, actor, world.meta.tick);
  const anyAbort = checkResults.find((c) => !c.passed && c.onFail === 'abort');
  if (anyAbort) {
    // Ability fails entirely — still deduct costs (you tried)
    events.push(...deductResources(ability.costs, actor, action));

    // Set cooldown even on failure
    if (ability.cooldown && ability.cooldown > 0) {
      setCooldown(world, actor.id, abilityId, ability.cooldown);
    }

    events.push(makeEvent(action, 'ability.check.failed', {
      abilityId,
      abilityName: ability.name,
      checks: checkResults,
      aborted: true,
    }, {
      targetIds: targets.map((t) => t.id),
      presentation: { channels: ['objective'], priority: 'normal' },
    }));
    return events;
  }

  // 8. Deduct resources
  events.push(...deductResources(ability.costs, actor, action));

  // 9. Set cooldown
  if (ability.cooldown && ability.cooldown > 0) {
    setCooldown(world, actor.id, abilityId, ability.cooldown);
  }

  // 10. Increment use count
  incrementUseCount(world, actor.id, abilityId);

  // 11. Compute check pass state
  const allChecksPassed = checkResults.every((c) => c.passed);

  // 12. Emit ability.used event
  events.push(makeEvent(action, 'ability.used', {
    abilityId,
    abilityName: ability.name,
    verb: ability.verb,
    actorId: actor.id,
    actorName: actor.name,
    targetIds: targets.map((t) => t.id),
    targetNames: targets.map((t) => t.name),
    costs: (ability.costs ?? []).map((c) => ({
      resourceId: c.resourceId,
      amount: c.amount,
    })),
    checks: checkResults,
    allChecksPassed,
    tags: ability.tags,
    ui: ability.ui,
  }, {
    targetIds: targets.map((t) => t.id),
    tags: ['ability', ...ability.tags],
    presentation: {
      channels: ['objective', 'narrator'],
      priority: 'high',
      soundCues: ability.ui?.soundCue ? [ability.ui.soundCue] : undefined,
    },
  }));

  // 13. Resolve effects (damage, heal, status, etc.)
  events.push(...resolveEffects(
    ability,
    actor,
    targets,
    world,
    world.meta.tick,
    action,
    allChecksPassed,
  ));

  return events;
}

