/**
 * Combat Resources — declarative genre resource integration with the tactical triangle.
 *
 * Each pack defines a CombatResourceProfile declaring how its resources
 * interact with the 5 tactical actions. Shared builders convert profiles into:
 * - TacticalHooks (brace/reposition spend modifiers)
 * - CombatFormulas wrapper (attack/guard spend modifiers)
 * - Event listeners (gain/drain triggers)
 * - AI intent score modifiers (resource-aware NPC decisions)
 *
 * Profiles are data — no pack-specific code in the engine.
 */

import type {
  EngineModule,
  EntityState,
  WorldState,
  ResolvedEvent,
} from '@ai-rpg-engine/core';
import type { CombatActionKind, TacticalHooks } from './combat-tactics.js';
import type { CombatIntentType, IntentScore } from './combat-intent.js';
import type { CombatFormulas } from './combat-core.js';
import { COMBAT_STATES, simpleRoll } from './combat-core.js';
import { removeStatus } from './status-core.js';

// ---------------------------------------------------------------------------
// Profile types
// ---------------------------------------------------------------------------

export type ResourceGainTrigger = {
  trigger: 'attack-hit' | 'guard-absorb' | 'brace' | 'defeat-enemy'
         | 'reposition-success' | 'reposition-outflank' | 'take-damage'
         | 'ally-defeated';
  resourceId: string;
  amount: number;
  /** Scale gain by a stat. Final = amount + stat * scaleMultiplier */
  scaleStat?: string;
  scaleMultiplier?: number;
};

export type ResourceSpendModifier = {
  /** Which tactical action this modifies */
  action: CombatActionKind;
  /** Resource spent to activate */
  resourceId: string;
  amount: number;
  /** Minimum resource to trigger (default: amount) */
  minResource?: number;
  /** What the spend produces */
  effects: {
    hitBonus?: number;
    damageBonus?: number;
    guardBonus?: number;       // extra guard reduction fraction
    repositionBonus?: number;  // extra reposition chance
    resistState?: string;      // resist a combat state application
    resistChance?: number;     // 0-100
  };
};

export type ResourceDrainTrigger = {
  trigger: 'take-damage' | 'disengage-fail' | 'reposition-fail' | 'off-balance-applied' | 'defeat-enemy'
         | 'ally-defeated';
  resourceId: string;
  amount: number;
};

export type ResourceAIModifier = {
  resourceId: string;
  highThreshold?: number;
  highModifiers?: Partial<Record<CombatIntentType, number>>;
  lowThreshold?: number;
  lowModifiers?: Partial<Record<CombatIntentType, number>>;
};

export type CombatResourceProfile = {
  packId: string;
  gains: ResourceGainTrigger[];
  spends: ResourceSpendModifier[];
  drains: ResourceDrainTrigger[];
  aiModifiers: ResourceAIModifier[];
};

// ---------------------------------------------------------------------------
// Event type mapping
// ---------------------------------------------------------------------------

type EventMapping = { eventType: string; entityField: string };

const GAIN_EVENT_MAP: Record<Exclude<ResourceGainTrigger['trigger'], 'ally-defeated'>, EventMapping> = {
  'attack-hit':           { eventType: 'combat.contact.hit',          entityField: 'attackerId' },
  'guard-absorb':         { eventType: 'combat.guard.absorbed',       entityField: 'entityId' },
  'brace':                { eventType: 'combat.brace.start',          entityField: 'entityId' },
  'defeat-enemy':         { eventType: 'combat.entity.defeated',      entityField: 'defeatedBy' },
  'reposition-success':   { eventType: 'combat.reposition.success',   entityField: 'entityId' },
  'reposition-outflank':  { eventType: 'combat.reposition.outflank',  entityField: 'entityId' },
  'take-damage':          { eventType: 'combat.damage.applied',       entityField: 'targetId' },
};

const DRAIN_EVENT_MAP: Record<Exclude<ResourceDrainTrigger['trigger'], 'ally-defeated'>, EventMapping> = {
  'take-damage':          { eventType: 'combat.damage.applied',       entityField: 'targetId' },
  'disengage-fail':       { eventType: 'combat.disengage.fail',       entityField: 'entityId' },
  'reposition-fail':      { eventType: 'combat.reposition.fail',      entityField: 'entityId' },
  'off-balance-applied':  { eventType: 'status.applied',              entityField: 'actorId' },
  'defeat-enemy':         { eventType: 'combat.entity.defeated',      entityField: 'defeatedBy' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Check if entity has this resource (initialized, not undefined) */
function hasResource(entity: EntityState, resourceId: string): boolean {
  return entity.resources[resourceId] !== undefined;
}

/** Try to spend a resource. Returns true if spend succeeded. */
function trySpend(entity: EntityState, spend: ResourceSpendModifier): boolean {
  const current = entity.resources[spend.resourceId] ?? 0;
  const min = spend.minResource ?? spend.amount;
  if (current < min) return false;
  entity.resources[spend.resourceId] = current - spend.amount;
  return true;
}

// ---------------------------------------------------------------------------
// Builder: CombatFormulas wrapper for attack/guard spends
// ---------------------------------------------------------------------------

/**
 * Wrap CombatFormulas to apply resource-based spend modifiers on attack and guard.
 *
 * Attack hitBonus spends apply during hitChance (consumed whether hit or miss).
 * Attack damageBonus spends apply during damage (consumed only on hit).
 * Guard guardBonus spends apply during guardReduction (consumed when absorbing).
 */
export function withCombatResources(profile: CombatResourceProfile, base: CombatFormulas): CombatFormulas {
  const attackHitSpends = profile.spends.filter(s => s.action === 'attack' && s.effects.hitBonus);
  const attackDmgSpends = profile.spends.filter(s => s.action === 'attack' && s.effects.damageBonus);
  const guardSpends = profile.spends.filter(s => s.action === 'guard' && s.effects.guardBonus);

  // Only wrap functions that have relevant spends
  const needsHitWrap = attackHitSpends.length > 0;
  const needsDmgWrap = attackDmgSpends.length > 0;
  const needsGuardWrap = guardSpends.length > 0;

  return {
    ...base,

    hitChance: needsHitWrap
      ? (attacker, target, world) => {
          let chance = base.hitChance
            ? base.hitChance(attacker, target, world)
            : 50;
          for (const spend of attackHitSpends) {
            if (!hasResource(attacker, spend.resourceId)) continue;
            if (trySpend(attacker, spend)) {
              chance += spend.effects.hitBonus!;
            }
          }
          return chance;
        }
      : base.hitChance,

    damage: needsDmgWrap
      ? (attacker, target, world) => {
          let dmg = base.damage
            ? base.damage(attacker, target, world)
            : 1;
          for (const spend of attackDmgSpends) {
            if (!hasResource(attacker, spend.resourceId)) continue;
            if (trySpend(attacker, spend)) {
              dmg += spend.effects.damageBonus!;
            }
          }
          return dmg;
        }
      : base.damage,

    guardReduction: needsGuardWrap
      ? (defender, world) => {
          let reduction = base.guardReduction
            ? base.guardReduction(defender, world)
            : 0.5;
          for (const spend of guardSpends) {
            if (!hasResource(defender, spend.resourceId)) continue;
            if (trySpend(defender, spend)) {
              reduction += spend.effects.guardBonus!;
            }
          }
          return Math.min(0.90, reduction);
        }
      : base.guardReduction,
  };
}

// ---------------------------------------------------------------------------
// Builder: TacticalHooks for brace/reposition spends
// ---------------------------------------------------------------------------

/**
 * Build TacticalHooks from a resource profile.
 * Handles reposition spends (repositionBonus) via movementModifier.
 *
 * Attack/guard spends are handled by withCombatResources() at the formula level.
 */
export function buildTacticalHooks(profile: CombatResourceProfile): TacticalHooks {
  const repositionSpends = profile.spends.filter(
    s => s.action === 'reposition' && s.effects.repositionBonus,
  );

  return {
    movementModifier(actor, action, _world) {
      if (action !== 'reposition') return {};
      let successBonus = 0;
      for (const spend of repositionSpends) {
        if (!hasResource(actor, spend.resourceId)) continue;
        if (trySpend(actor, spend)) {
          successBonus += spend.effects.repositionBonus!;
        }
      }
      return { successBonus };
    },

    afterAction(_action, _actor, _events, _world) {
      return [];
    },
  };
}

// ---------------------------------------------------------------------------
// Builder: event listener registration for gains and drains
// ---------------------------------------------------------------------------

type EventRegistrationCtx = {
  events: {
    on: (type: string, handler: (event: ResolvedEvent, world: WorldState) => void) => void;
  };
};

/**
 * Register event listeners for resource gains and drains.
 * Call inside a module's register() method.
 */
export function registerResourceListeners(
  profile: CombatResourceProfile,
  ctx: EventRegistrationCtx,
): void {
  // --- Gains ---
  const gainsByEvent = new Map<string, { gain: ResourceGainTrigger; entityField: string }[]>();
  for (const gain of profile.gains) {
    const mapping = GAIN_EVENT_MAP[gain.trigger as keyof typeof GAIN_EVENT_MAP];
    if (!mapping) continue; // ally-defeated handled separately
    const entries = gainsByEvent.get(mapping.eventType) ?? [];
    entries.push({ gain, entityField: mapping.entityField });
    gainsByEvent.set(mapping.eventType, entries);
  }

  for (const [eventType, entries] of gainsByEvent) {
    ctx.events.on(eventType, (event: ResolvedEvent, world: WorldState) => {
      for (const { gain, entityField } of entries) {
        const entityId = event.payload[entityField] as string;
        if (!entityId) continue;
        const entity = world.entities[entityId];
        if (!entity || !hasResource(entity, gain.resourceId)) continue;

        let amount = gain.amount;
        if (gain.scaleStat && gain.scaleMultiplier) {
          amount += (entity.stats[gain.scaleStat] ?? 0) * gain.scaleMultiplier;
        }

        entity.resources[gain.resourceId] = Math.min(
          100,
          (entity.resources[gain.resourceId] ?? 0) + amount,
        );
      }
    });
  }

  // --- Drains ---
  const drainsByEvent = new Map<string, { drain: ResourceDrainTrigger; entityField: string }[]>();
  for (const drain of profile.drains) {
    const mapping = DRAIN_EVENT_MAP[drain.trigger as keyof typeof DRAIN_EVENT_MAP];
    if (!mapping) continue; // ally-defeated handled separately
    const entries = drainsByEvent.get(mapping.eventType) ?? [];
    entries.push({ drain, entityField: mapping.entityField });
    drainsByEvent.set(mapping.eventType, entries);
  }

  for (const [eventType, entries] of drainsByEvent) {
    ctx.events.on(eventType, (event: ResolvedEvent, world: WorldState) => {
      for (const { drain, entityField } of entries) {
        // Special filter: off-balance-applied only triggers on off_balance status
        if (drain.trigger === 'off-balance-applied') {
          if (event.payload.statusId !== COMBAT_STATES.OFF_BALANCE) continue;
        }

        const entityId = (event.payload[entityField] as string) ?? event.actorId;
        if (!entityId) continue;
        const entity = world.entities[entityId];
        if (!entity || !hasResource(entity, drain.resourceId)) continue;

        entity.resources[drain.resourceId] = Math.max(
          0,
          (entity.resources[drain.resourceId] ?? 0) - drain.amount,
        );
      }
    });
  }

  // --- Ally-defeated triggers (zone witnesses) ---
  const allyDefeatGains = profile.gains.filter(g => g.trigger === 'ally-defeated');
  const allyDefeatDrains = profile.drains.filter(d => d.trigger === 'ally-defeated');

  if (allyDefeatGains.length > 0 || allyDefeatDrains.length > 0) {
    ctx.events.on('combat.entity.defeated', (event: ResolvedEvent, world: WorldState) => {
      const defeatedId = event.payload.entityId as string;
      const defeated = world.entities[defeatedId];
      if (!defeated?.zoneId) return;

      // Find living same-type entities in zone (ally witnesses)
      const witnesses = Object.values(world.entities).filter(
        e => e.id !== defeatedId && e.zoneId === defeated.zoneId
          && e.type === defeated.type && (e.resources.hp ?? 0) > 0,
      );

      for (const witness of witnesses) {
        for (const gain of allyDefeatGains) {
          if (!hasResource(witness, gain.resourceId)) continue;
          let amount = gain.amount;
          if (gain.scaleStat && gain.scaleMultiplier) {
            amount += (witness.stats[gain.scaleStat] ?? 0) * gain.scaleMultiplier;
          }
          witness.resources[gain.resourceId] = Math.min(
            100,
            (witness.resources[gain.resourceId] ?? 0) + amount,
          );
        }
        for (const drain of allyDefeatDrains) {
          if (!hasResource(witness, drain.resourceId)) continue;
          witness.resources[drain.resourceId] = Math.max(
            0,
            (witness.resources[drain.resourceId] ?? 0) - drain.amount,
          );
        }
      }
    });
  }

  // --- Resist spends (status.applied listener) ---
  const resistSpends = profile.spends.filter(
    s => s.effects.resistState && s.effects.resistChance,
  );
  if (resistSpends.length > 0) {
    ctx.events.on('status.applied', (event: ResolvedEvent, world: WorldState) => {
      const statusId = event.payload.statusId as string;
      const entityId = event.actorId ?? (event.payload.entityId as string);
      if (!entityId) return;
      const entity = world.entities[entityId];
      if (!entity) return;

      for (const spend of resistSpends) {
        if (spend.effects.resistState !== statusId) continue;
        if (!hasResource(entity, spend.resourceId)) continue;

        const current = entity.resources[spend.resourceId] ?? 0;
        const min = spend.minResource ?? spend.amount;
        if (current < min) continue;

        const roll = simpleRoll(event.tick, entityId, `resist-${statusId}`);
        if (roll <= (spend.effects.resistChance ?? 0)) {
          entity.resources[spend.resourceId] = current - spend.amount;
          removeStatus(entity, statusId, event.tick);
        }
      }
    });
  }
}

// ---------------------------------------------------------------------------
// AI: resource-aware intent score adjustment
// ---------------------------------------------------------------------------

/**
 * Adjust AI intent scores based on entity resource levels.
 * Call after base scoring in selectNpcCombatAction.
 */
export function applyResourceIntentModifiers(
  profile: CombatResourceProfile,
  entity: EntityState,
  scores: IntentScore[],
): void {
  for (const mod of profile.aiModifiers) {
    if (!hasResource(entity, mod.resourceId)) continue;
    const level = entity.resources[mod.resourceId] ?? 0;

    if (mod.highThreshold !== undefined && mod.highModifiers && level >= mod.highThreshold) {
      for (const score of scores) {
        const delta = mod.highModifiers[score.intent] ?? 0;
        if (delta !== 0) {
          score.score += delta;
          score.contributions.push({
            factor: `${mod.resourceId}-high`,
            value: level,
            weight: 1,
            delta,
          });
        }
      }
    }

    if (mod.lowThreshold !== undefined && mod.lowModifiers && level <= mod.lowThreshold) {
      for (const score of scores) {
        const delta = mod.lowModifiers[score.intent] ?? 0;
        if (delta !== 0) {
          score.score += delta;
          score.contributions.push({
            factor: `${mod.resourceId}-low`,
            value: level,
            weight: 1,
            delta,
          });
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Convenience: EngineModule factory
// ---------------------------------------------------------------------------

/**
 * Create an EngineModule that wires resource gain/drain/resist listeners.
 *
 * For formula-level integration (attack/guard spends), use withCombatResources()
 * when constructing CombatFormulas. For tactical hooks (brace/reposition spends),
 * use buildTacticalHooks() when creating CombatTacticsConfig.
 */
export function createCombatResources(profile: CombatResourceProfile): EngineModule {
  return {
    id: `combat-resources-${profile.packId}`,
    version: '1.0.0',
    dependsOn: ['combat-core', 'status-core'],

    register(ctx) {
      registerResourceListeners(profile, ctx);

      ctx.persistence.registerNamespace(`combat-resources-${profile.packId}`, {
        version: '1.0.0',
      });
    },
  };
}
