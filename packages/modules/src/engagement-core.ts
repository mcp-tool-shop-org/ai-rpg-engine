/**
 * Engagement Core — lightweight positional texture for combat.
 *
 * Manages 4 engagement statuses (engaged, protected, backline, isolated)
 * that modify combat formulas via the `withEngagement()` wrapper.
 * No grid, no battlemat — just statuses driven by entity tags, zone tags,
 * and companion presence.
 */

import type {
  EngineModule,
  WorldState,
  ResolvedEvent,
  EntityState,
} from '@ai-rpg-engine/core';
import { applyStatus, removeStatus, hasStatus } from './status-core.js';
import { COMBAT_STATES, DEFAULT_STAT_MAPPING, defaultInterceptChance } from './combat-core.js';
import type { CombatFormulas } from './combat-core.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ENGAGEMENT_STATES = {
  ENGAGED: 'engagement:engaged',
  PROTECTED: 'engagement:protected',
  BACKLINE: 'engagement:backline',
  ISOLATED: 'engagement:isolated',
} as const;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export type EngagementConfig = {
  backlineTags?: string[];      // entity tags that default to backline, default ['ranged', 'caster']
  chokepointTag?: string;       // zone tag that forces engagement, default 'chokepoint'
  ambushTag?: string;           // zone tag that applies EXPOSED on entry, default 'ambush_entry'
  protectorTags?: string[];     // entity tags that grant PROTECTED to allies, default ['bodyguard']
  playerId?: string;            // default 'player'
};

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

export function isEngaged(entity: EntityState): boolean {
  return hasStatus(entity, ENGAGEMENT_STATES.ENGAGED);
}

export function isProtected(entity: EntityState): boolean {
  return hasStatus(entity, ENGAGEMENT_STATES.PROTECTED);
}

export function isBackline(entity: EntityState): boolean {
  return hasStatus(entity, ENGAGEMENT_STATES.BACKLINE);
}

export function isIsolated(entity: EntityState): boolean {
  return hasStatus(entity, ENGAGEMENT_STATES.ISOLATED);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getEntitiesInZone(world: WorldState, zoneId: string): EntityState[] {
  return Object.values(world.entities).filter(
    e => e.zoneId === zoneId && (e.resources.hp ?? 0) > 0,
  );
}

function hasEnemiesInZone(world: WorldState, entity: EntityState): boolean {
  if (!entity.zoneId) return false;
  const zoneEntities = getEntitiesInZone(world, entity.zoneId);
  return zoneEntities.some(e => e.id !== entity.id && e.type !== entity.type);
}

function hasAlliesInZone(world: WorldState, entity: EntityState): boolean {
  if (!entity.zoneId) return false;
  const zoneEntities = getEntitiesInZone(world, entity.zoneId);
  return zoneEntities.some(e => e.id !== entity.id && e.type === entity.type);
}

function hasProtectorInZone(
  world: WorldState,
  entity: EntityState,
  protectorTags: string[],
): boolean {
  if (!entity.zoneId) return false;
  const zoneEntities = getEntitiesInZone(world, entity.zoneId);
  return zoneEntities.some(
    e => e.id !== entity.id
      && e.type === entity.type
      && protectorTags.some(tag => e.tags.includes(tag)),
  );
}

function isBacklineCandidate(entity: EntityState, backlineTags: string[]): boolean {
  return backlineTags.some(tag => entity.tags.includes(tag));
}

function safeApply(entity: EntityState, statusId: string, tick: number): void {
  if (!hasStatus(entity, statusId)) {
    applyStatus(entity, statusId, tick, { stacking: 'refresh' });
  }
}

function safeRemove(entity: EntityState, statusId: string, tick: number): void {
  if (hasStatus(entity, statusId)) {
    removeStatus(entity, statusId, tick);
  }
}

// ---------------------------------------------------------------------------
// Module factory
// ---------------------------------------------------------------------------

export function createEngagementCore(config: EngagementConfig = {}): EngineModule {
  const {
    backlineTags = ['ranged', 'caster'],
    chokepointTag = 'chokepoint',
    ambushTag = 'ambush_entry',
    protectorTags = ['bodyguard'],
    playerId = 'player',
  } = config;

  return {
    id: 'engagement-core',
    version: '1.0.0',
    dependsOn: ['status-core'],

    register(ctx) {
      // --- Combat hit: both sides become ENGAGED, target loses BACKLINE ---
      ctx.events.on('combat.contact.hit', (event: ResolvedEvent, world: WorldState) => {
        const tick = event.tick;
        const attackerId = event.payload.attackerId as string;
        const targetId = event.payload.targetId as string;
        const attacker = world.entities[attackerId];
        const target = world.entities[targetId];

        if (attacker) {
          safeApply(attacker, ENGAGEMENT_STATES.ENGAGED, tick);
          safeRemove(attacker, ENGAGEMENT_STATES.BACKLINE, tick);
        }
        if (target) {
          safeApply(target, ENGAGEMENT_STATES.ENGAGED, tick);
          safeRemove(target, ENGAGEMENT_STATES.BACKLINE, tick);
        }
      });

      // --- Entity defeated: re-evaluate zone ---
      ctx.events.on('combat.entity.defeated', (event: ResolvedEvent, world: WorldState) => {
        const tick = event.tick;
        const defeatedId = event.payload.entityId as string;
        const defeated = world.entities[defeatedId];
        if (!defeated?.zoneId) return;

        // Snapshot: was the defeated entity a frontliner?
        const wasEngaged = hasStatus(defeated, ENGAGEMENT_STATES.ENGAGED);

        const zoneEntities = getEntitiesInZone(world, defeated.zoneId);
        for (const entity of zoneEntities) {
          if (entity.id === defeatedId) continue;

          // Re-check PROTECTED (protector might have been defeated)
          if (hasProtectorInZone(world, entity, protectorTags)) {
            safeApply(entity, ENGAGEMENT_STATES.PROTECTED, tick);
          } else {
            safeRemove(entity, ENGAGEMENT_STATES.PROTECTED, tick);
          }

          // Re-check ISOLATED
          if (hasAlliesInZone(world, entity)) {
            safeRemove(entity, ENGAGEMENT_STATES.ISOLATED, tick);
          } else {
            safeApply(entity, ENGAGEMENT_STATES.ISOLATED, tick);
          }

          // Clear ENGAGED when no enemies remain (nothing to be engaged with)
          if (hasStatus(entity, ENGAGEMENT_STATES.ENGAGED) && !hasEnemiesInZone(world, entity)) {
            safeRemove(entity, ENGAGEMENT_STATES.ENGAGED, tick);
          }

          // Re-check BACKLINE (if no enemies left, could revert to backline)
          if (isBacklineCandidate(entity, backlineTags)
            && !hasStatus(entity, ENGAGEMENT_STATES.ENGAGED)
            && !hasEnemiesInZone(world, entity)) {
            safeApply(entity, ENGAGEMENT_STATES.BACKLINE, tick);
          }
        }

        // Frontline collapse: if defeated was ENGAGED and no same-side entities remain ENGAGED
        if (wasEngaged) {
          const remainingFrontliners = zoneEntities.filter(
            e => e.id !== defeatedId && e.type === defeated.type && hasStatus(e, ENGAGEMENT_STATES.ENGAGED),
          );
          if (remainingFrontliners.length === 0) {
            const exposedBackliners = zoneEntities.filter(
              e => e.type === defeated.type && hasStatus(e, ENGAGEMENT_STATES.BACKLINE),
            );
            if (exposedBackliners.length > 0) {
              ctx.events.emit({
                id: `evt-frontline-collapse-${tick}`,
                tick,
                type: 'combat.frontline.collapsed',
                payload: { zoneId: defeated.zoneId, exposedIds: exposedBackliners.map(e => e.id) },
                presentation: { channels: ['narrator'], priority: 'high' },
              });
            }
          }
        }
      });

      // --- Disengage success: remove ENGAGED, evaluate new zone ---
      ctx.events.on('combat.disengage.success', (event: ResolvedEvent, world: WorldState) => {
        const tick = event.tick;
        const entityId = event.payload.entityId as string;
        const entity = world.entities[entityId];
        if (!entity) return;

        safeRemove(entity, ENGAGEMENT_STATES.ENGAGED, tick);

        // Evaluate new zone
        if (entity.zoneId) {
          const zone = world.zones[entity.zoneId];
          if (zone?.tags.includes(chokepointTag)) {
            safeApply(entity, ENGAGEMENT_STATES.ENGAGED, tick);
          } else if (isBacklineCandidate(entity, backlineTags) && !hasEnemiesInZone(world, entity)) {
            safeApply(entity, ENGAGEMENT_STATES.BACKLINE, tick);
          }

          if (hasAlliesInZone(world, entity)) {
            safeRemove(entity, ENGAGEMENT_STATES.ISOLATED, tick);
          } else {
            safeApply(entity, ENGAGEMENT_STATES.ISOLATED, tick);
          }

          if (hasProtectorInZone(world, entity, protectorTags)) {
            safeApply(entity, ENGAGEMENT_STATES.PROTECTED, tick);
          } else {
            safeRemove(entity, ENGAGEMENT_STATES.PROTECTED, tick);
          }
        }
      });

      // --- Reposition success: re-evaluate engagement states ---
      ctx.events.on('combat.reposition.success', (event: ResolvedEvent, world: WorldState) => {
        const tick = event.tick;
        const entityId = event.payload.entityId as string;
        const entity = world.entities[entityId];
        if (!entity?.zoneId) return;

        // Successful reposition may shift engagement status
        // If entity was backline and repositioned, they may now be engaged
        if (hasStatus(entity, ENGAGEMENT_STATES.BACKLINE)) {
          const hasEnemies = getEntitiesInZone(world, entity.zoneId)
            .some(e => e.id !== entity.id && e.type !== entity.type);
          if (hasEnemies) {
            safeRemove(entity, ENGAGEMENT_STATES.BACKLINE, tick);
            safeApply(entity, ENGAGEMENT_STATES.ENGAGED, tick);
          }
        }
      });

      // --- Reposition outflank: target loses protected status ---
      ctx.events.on('combat.reposition.outflank', (event: ResolvedEvent, world: WorldState) => {
        const tick = event.tick;
        const targetId = event.payload.targetId as string;
        const target = world.entities[targetId];
        if (!target) return;

        // Outflanked targets lose PROTECTED status
        safeRemove(target, ENGAGEMENT_STATES.PROTECTED, tick);
      });

      // --- Zone entered: full evaluation ---
      ctx.events.on('world.zone.entered', (event: ResolvedEvent, world: WorldState) => {
        const tick = event.tick;
        const entityId = event.payload.entityId as string;
        const zoneId = event.payload.zoneId as string;
        const entity = world.entities[entityId];
        if (!entity) return;

        const zone = world.zones[zoneId];

        // Chokepoint forces engagement
        if (zone?.tags.includes(chokepointTag)) {
          safeApply(entity, ENGAGEMENT_STATES.ENGAGED, tick);
          safeRemove(entity, ENGAGEMENT_STATES.BACKLINE, tick);
        } else {
          // Backline for ranged/caster if not engaged
          if (isBacklineCandidate(entity, backlineTags)
            && !hasStatus(entity, ENGAGEMENT_STATES.ENGAGED)) {
            safeApply(entity, ENGAGEMENT_STATES.BACKLINE, tick);
          }
        }

        // Isolated check
        if (hasAlliesInZone(world, entity)) {
          safeRemove(entity, ENGAGEMENT_STATES.ISOLATED, tick);
        } else {
          safeApply(entity, ENGAGEMENT_STATES.ISOLATED, tick);
        }

        // Protected check
        if (hasProtectorInZone(world, entity, protectorTags)) {
          safeApply(entity, ENGAGEMENT_STATES.PROTECTED, tick);
        } else {
          safeRemove(entity, ENGAGEMENT_STATES.PROTECTED, tick);
        }

        // Ambush entry: entity walking into an ambush zone with enemies gets EXPOSED
        if (zone?.tags.includes(ambushTag) && hasEnemiesInZone(world, entity)) {
          if (!hasStatus(entity, COMBAT_STATES.EXPOSED)) {
            applyStatus(entity, COMBAT_STATES.EXPOSED, tick, { duration: 1, sourceId: 'ambush' });
            ctx.events.emit({
              id: `evt-ambush-${tick}-${entityId}`,
              tick,
              type: 'combat.ambush.triggered',
              actorId: entityId,
              payload: { entityId, entityName: entity.name, zoneId },
              tags: ['combat', 'ambush'],
              presentation: { channels: ['narrator', 'objective'], priority: 'high' },
            });
          }
        }

        // Also re-evaluate other entities in the zone (arrival changes their state)
        const zoneEntities = getEntitiesInZone(world, zoneId);
        for (const other of zoneEntities) {
          if (other.id === entityId) continue;

          // Other entities might gain/lose ISOLATED
          if (hasAlliesInZone(world, other)) {
            safeRemove(other, ENGAGEMENT_STATES.ISOLATED, tick);
          }

          // New arrival might be a protector
          if (protectorTags.some(tag => entity.tags.includes(tag)) && other.type === entity.type) {
            safeApply(other, ENGAGEMENT_STATES.PROTECTED, tick);
          }
        }
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Formula wrapper
// ---------------------------------------------------------------------------

function defaultHitChance(attacker: EntityState, target: EntityState): number {
  const atkInstinct = attacker.stats.instinct ?? 5;
  const tgtInstinct = target.stats.instinct ?? 5;
  return Math.min(95, Math.max(5, 50 + atkInstinct * 5 - tgtInstinct * 3));
}

function defaultDamage(attacker: EntityState): number {
  return Math.max(1, attacker.stats.vigor ?? 3);
}

export type EngagementFormulaOpts = {
  chokepointTag?: string;
};

export function withEngagement(base: CombatFormulas, opts?: EngagementFormulaOpts): CombatFormulas {
  const chokepointTag = opts?.chokepointTag ?? 'chokepoint';
  return {
    ...base,

    hitChance: (attacker, target, world) => {
      let chance = base.hitChance
        ? base.hitChance(attacker, target, world)
        : defaultHitChance(attacker, target);
      if (hasStatus(target, ENGAGEMENT_STATES.BACKLINE)) chance -= 10;
      if (hasStatus(target, ENGAGEMENT_STATES.ENGAGED)) chance += 5;
      return Math.min(95, Math.max(5, chance));
    },

    damage: (attacker, target, world) => {
      let dmg = base.damage
        ? base.damage(attacker, target, world)
        : defaultDamage(attacker);
      if (hasStatus(attacker, ENGAGEMENT_STATES.BACKLINE)) dmg -= 1;
      if (hasStatus(target, ENGAGEMENT_STATES.ISOLATED)) dmg += 2;
      return Math.max(1, dmg);
    },

    guardReduction: (defender, world) => {
      let reduction = base.guardReduction
        ? base.guardReduction(defender, world)
        : 0.5;
      if (hasStatus(defender, ENGAGEMENT_STATES.PROTECTED)) reduction += 0.10;
      return Math.min(0.75, reduction);
    },

    disengageChance: (actor, world) => {
      let chance = base.disengageChance
        ? base.disengageChance(actor, world)
        : 40;
      if (hasStatus(actor, ENGAGEMENT_STATES.ENGAGED)) chance -= 15;
      if (hasStatus(actor, ENGAGEMENT_STATES.ISOLATED)) chance -= 10;
      if (hasStatus(actor, ENGAGEMENT_STATES.BACKLINE)) chance += 15;
      const zone = world.zones?.[actor.zoneId ?? ''];
      if (zone?.tags?.includes(chokepointTag)) chance -= 10;
      return Math.min(90, Math.max(5, chance));
    },

    interceptChance: (ally, target, world) => {
      let chance = base.interceptChance
        ? base.interceptChance(ally, target, world)
        : defaultInterceptChance(ally, target, world, base.statMapping ?? DEFAULT_STAT_MAPPING);
      if (hasStatus(target, ENGAGEMENT_STATES.PROTECTED)) chance += 15;
      return Math.min(90, Math.max(5, chance));
    },

    shouldIntercept: (target, world) => {
      if (target.id === world.playerId) return true;
      return hasStatus(target, ENGAGEMENT_STATES.BACKLINE);
    },

    isAlly: base.isAlly,
    combatMoraleDelta: base.combatMoraleDelta,
  };
}
