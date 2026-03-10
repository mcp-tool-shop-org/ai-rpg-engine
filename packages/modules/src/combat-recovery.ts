/**
 * Combat Recovery — post-combat consequences and gradual recovery.
 *
 * Detects combat end (zone cleared of enemies), then:
 * - Applies wound statuses based on survivor HP ratio
 * - Applies morale aftermath statuses (shaken / emboldened)
 * - Regenerates stamina per tick (unconditional)
 * - Regenerates HP per tick (safe zones only by default)
 * - Emits structured aftermath events for the narrator layer
 */

import type {
  EngineModule,
  WorldState,
  ResolvedEvent,
  EntityState,
} from '@ai-rpg-engine/core';
import { nextId } from '@ai-rpg-engine/core';
import { applyStatus } from './status-core.js';
import { getCognition } from './cognition-core.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WoundSeverity = 'light' | 'serious' | 'critical';

export type WoundThreshold = {
  severity: WoundSeverity;
  /** HP ratio at or below this qualifies */
  maxHpRatio: number;
  statusId: string;
  /** Duration in ticks */
  duration: number;
  /** Advisory stat penalties for narrative */
  statPenalties: Record<string, number>;
  narrativeKey: string;
};

export type MoraleAftermathTier = 'shaken' | 'steady' | 'emboldened';

export type AftermathSurvivor = {
  entityId: string;
  entityName: string;
  hpRatio: number;
  morale: number;
  moraleTier: MoraleAftermathTier;
  wounds: WoundSeverity[];
};

export type AftermathSummaryPayload = {
  zoneId: string;
  casualties: Array<{ entityId: string; entityName: string }>;
  survivors: AftermathSurvivor[];
};

export type CombatRecoveryConfig = {
  playerId?: string;
  /** Zone tags that count as safe for HP regen (default: ['safe']) */
  safeZoneTags?: string[];
  woundThresholds?: WoundThreshold[];
  staminaRegenPerTick?: number;
  hpRegenPerTick?: number;
  hpRegenUnsafePerTick?: number;
  /** Max aftermath entries tracked for recovery (default: 20) */
  maxAftermathLog?: number;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const WOUND_STATUSES = {
  LIGHT: 'wound:light',
  SERIOUS: 'wound:serious',
  CRITICAL: 'wound:critical',
} as const;

export const MORALE_AFTERMATH_STATUSES = {
  SHAKEN: 'morale:shaken',
  EMBOLDENED: 'morale:emboldened',
} as const;

const DEFAULT_WOUND_THRESHOLDS: WoundThreshold[] = [
  {
    severity: 'critical',
    maxHpRatio: 0.15,
    statusId: WOUND_STATUSES.CRITICAL,
    duration: 25,
    statPenalties: { vigor: -3, instinct: -2, will: -1 },
    narrativeKey: 'wound.critical',
  },
  {
    severity: 'serious',
    maxHpRatio: 0.35,
    statusId: WOUND_STATUSES.SERIOUS,
    duration: 15,
    statPenalties: { vigor: -2, instinct: -1 },
    narrativeKey: 'wound.serious',
  },
  {
    severity: 'light',
    maxHpRatio: 0.60,
    statusId: WOUND_STATUSES.LIGHT,
    duration: 8,
    statPenalties: { vigor: -1 },
    narrativeKey: 'wound.light',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hpRatio(entity: EntityState): number {
  const max = entity.resources.maxHp ?? 1;
  return max > 0 ? entity.resources.hp / max : 0;
}

function isAlive(entity: EntityState): boolean {
  return (entity.resources.hp ?? 0) > 0;
}

function moraleTier(morale: number): MoraleAftermathTier {
  if (morale >= 70) return 'emboldened';
  if (morale <= 29) return 'shaken';
  return 'steady';
}

function isSafeZone(world: WorldState, zoneId: string, safeTags: string[]): boolean {
  const zone = world.zones[zoneId];
  if (!zone) return false;
  return zone.tags.some(t => safeTags.includes(t));
}

function emitHidden(
  ctx: { events: { emit(event: ResolvedEvent): void } },
  type: string,
  tick: number,
  payload: Record<string, unknown>,
): void {
  ctx.events.emit({
    id: nextId('evt'),
    type,
    tick,
    actorId: (payload.actorId as string) ?? undefined,
    payload,
    visibility: 'hidden',
  });
}

// ---------------------------------------------------------------------------
// Recovery tracker (in-memory)
// ---------------------------------------------------------------------------

type RecoveryEntry = {
  entityId: string;
  zoneId: string;
  startTick: number;
};

// ---------------------------------------------------------------------------
// Module factory
// ---------------------------------------------------------------------------

export function createCombatRecovery(config: CombatRecoveryConfig = {}): EngineModule {
  const {
    playerId = 'player',
    safeZoneTags = ['safe'],
    woundThresholds = DEFAULT_WOUND_THRESHOLDS,
    staminaRegenPerTick = 1,
    hpRegenPerTick = 1,
    hpRegenUnsafePerTick = 0,
    maxAftermathLog = 20,
  } = config;

  // Track which zone+tick combos have already triggered aftermath
  const triggeredZones = new Set<string>();
  // Active recovery entries
  const recoveryEntries: RecoveryEntry[] = [];

  return {
    id: 'combat-recovery',
    version: '1.0.0',
    dependsOn: ['status-core', 'cognition-core'],

    register(ctx) {
      // -----------------------------------------------------------------------
      // Combat end detection — after defeat or disengage, check zone clearance
      // -----------------------------------------------------------------------
      function checkZoneClearance(event: ResolvedEvent, world: WorldState): void {
        const playerEntity = world.entities[playerId];
        if (!playerEntity) return;

        const zoneId = playerEntity.zoneId ?? world.locationId;
        const key = `${zoneId}:${event.tick}`;
        if (triggeredZones.has(key)) return;

        // Are there living enemies in the player's zone?
        const livingEnemies = Object.values(world.entities).filter(
          e => e.id !== playerId &&
               e.zoneId === zoneId &&
               e.tags.includes('enemy') &&
               isAlive(e),
        );

        if (livingEnemies.length > 0) return;

        // Zone is clear — trigger aftermath
        triggeredZones.add(key);
        processAftermath(event.tick, zoneId, world);
      }

      ctx.events.on('combat.entity.defeated', (event: ResolvedEvent, world: WorldState) => {
        checkZoneClearance(event, world);
      });

      ctx.events.on('combat.disengage.success', (event: ResolvedEvent, world: WorldState) => {
        checkZoneClearance(event, world);
      });

      // -----------------------------------------------------------------------
      // Aftermath processing
      // -----------------------------------------------------------------------
      function processAftermath(tick: number, zoneId: string, world: WorldState): void {
        const entitiesInZone = Object.values(world.entities).filter(e => e.zoneId === zoneId);
        const casualties: Array<{ entityId: string; entityName: string }> = [];
        const survivors: AftermathSurvivor[] = [];

        // Classify entities
        for (const entity of entitiesInZone) {
          if (!isAlive(entity)) {
            casualties.push({ entityId: entity.id, entityName: entity.name });
            continue;
          }

          const ratio = hpRatio(entity);
          const wounds: WoundSeverity[] = [];

          // Apply wound — highest severity that matches (thresholds sorted critical first)
          for (const threshold of woundThresholds) {
            if (ratio <= threshold.maxHpRatio) {
              applyStatus(entity, threshold.statusId, tick, {
                duration: threshold.duration,
                stacking: 'replace',
                data: Object.fromEntries(
                  Object.entries(threshold.statPenalties).map(([k, v]) => [k, v]),
                ),
              });
              wounds.push(threshold.severity);

              emitHidden(ctx, 'combat.aftermath.injury', tick, {
                entityId: entity.id,
                entityName: entity.name,
                severity: threshold.severity,
                hpRatio: ratio,
                statusId: threshold.statusId,
                narrativeKey: threshold.narrativeKey,
              });

              break; // Only highest severity
            }
          }

          // Morale aftermath (for AI entities with cognition)
          let morale = 70; // Default for player/non-AI
          let tier: MoraleAftermathTier = 'steady';

          if (entity.ai || entity.id !== playerId) {
            try {
              const cog = getCognition(world, entity.id);
              morale = cog.morale;
            } catch {
              // No cognition available — use default
            }
          }

          tier = moraleTier(morale);

          if (tier === 'shaken') {
            applyStatus(entity, MORALE_AFTERMATH_STATUSES.SHAKEN, tick, {
              duration: 10,
              stacking: 'replace',
              data: { attackPenalty: -10, disengageBonus: 15 },
            });
            emitHidden(ctx, 'combat.aftermath.morale', tick, {
              entityId: entity.id,
              entityName: entity.name,
              morale,
              tier,
              statusId: MORALE_AFTERMATH_STATUSES.SHAKEN,
            });
          } else if (tier === 'emboldened') {
            applyStatus(entity, MORALE_AFTERMATH_STATUSES.EMBOLDENED, tick, {
              duration: 8,
              stacking: 'replace',
              data: { hitBonus: 5, damageBonusPct: 0.10 },
            });
            emitHidden(ctx, 'combat.aftermath.morale', tick, {
              entityId: entity.id,
              entityName: entity.name,
              morale,
              tier,
              statusId: MORALE_AFTERMATH_STATUSES.EMBOLDENED,
            });
          }

          survivors.push({
            entityId: entity.id,
            entityName: entity.name,
            hpRatio: ratio,
            morale,
            moraleTier: tier,
            wounds,
          });

          // Register for recovery tracking
          if (entity.resources.hp < (entity.resources.maxHp ?? entity.resources.hp) ||
              entity.resources.stamina < (entity.resources.maxStamina ?? entity.resources.stamina ?? 5)) {
            recoveryEntries.push({ entityId: entity.id, zoneId, startTick: tick });
            // Cap recovery entries
            while (recoveryEntries.length > maxAftermathLog) {
              recoveryEntries.shift();
            }
          }
        }

        // Emit structured events
        const survivorIds = survivors.map(s => s.entityId);
        const casualtyIds = casualties.map(c => c.entityId);

        emitHidden(ctx, 'combat.aftermath.started', tick, {
          zoneId,
          survivorIds,
          casualtyIds,
        });

        emitHidden(ctx, 'combat.aftermath.summary', tick, {
          zoneId,
          casualties,
          survivors,
        });
      }

      // -----------------------------------------------------------------------
      // Recovery tick — stamina + HP regen on action.resolved
      // -----------------------------------------------------------------------
      ctx.events.on('action.resolved', (_event: ResolvedEvent, world: WorldState) => {
        const tick = world.meta.tick;
        const completed: number[] = [];

        // Regen stamina for ALL alive entities (unconditional)
        for (const entity of Object.values(world.entities)) {
          if (!isAlive(entity)) continue;
          const maxStamina = entity.resources.maxStamina ?? 5;
          if (entity.resources.stamina < maxStamina) {
            const prev = entity.resources.stamina;
            entity.resources.stamina = Math.min(maxStamina, entity.resources.stamina + staminaRegenPerTick);
            if (entity.resources.stamina !== prev) {
              emitHidden(ctx, 'combat.aftermath.stamina-tick', tick, {
                entityId: entity.id,
                prevStamina: prev,
                currentStamina: entity.resources.stamina,
              });
            }
          }
        }

        // HP regen for tracked recovery entries
        for (let i = recoveryEntries.length - 1; i >= 0; i--) {
          const entry = recoveryEntries[i];
          const entity = world.entities[entry.entityId];
          if (!entity || !isAlive(entity)) {
            completed.push(i);
            continue;
          }

          const maxHp = entity.resources.maxHp ?? 1;
          const maxStamina = entity.resources.maxStamina ?? 5;

          // HP regen
          if (entity.resources.hp < maxHp) {
            const inSafe = isSafeZone(world, entity.zoneId ?? '', safeZoneTags);
            const regenRate = inSafe ? hpRegenPerTick : hpRegenUnsafePerTick;
            if (regenRate > 0) {
              const prev = entity.resources.hp;
              entity.resources.hp = Math.min(maxHp, entity.resources.hp + regenRate);
              if (entity.resources.hp !== prev) {
                emitHidden(ctx, 'combat.aftermath.hp-tick', tick, {
                  entityId: entity.id,
                  prevHp: prev,
                  currentHp: entity.resources.hp,
                  inSafeZone: inSafe,
                });
              }
            }
          }

          // Check if fully recovered
          if (entity.resources.hp >= maxHp && entity.resources.stamina >= maxStamina) {
            emitHidden(ctx, 'combat.aftermath.recovery-complete', tick, {
              entityId: entity.id,
            });
            completed.push(i);
          }
        }

        // Remove completed entries (reverse order to preserve indices)
        for (const idx of completed.sort((a, b) => b - a)) {
          recoveryEntries.splice(idx, 1);
        }
      });
    },
  };
}
