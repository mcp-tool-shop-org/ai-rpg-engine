/**
 * Defeat Fallout — orchestrates social consequences of combat defeats.
 *
 * Listens to `combat.entity.defeated` and propagates:
 * - Faction reputation / alert mutations
 * - Player heat tracking
 * - District safety / violence escalation
 * - Structured events for chronicle, rumor, companion, pressure layers
 */

import type { EngineModule, WorldState, ResolvedEvent } from '@ai-rpg-engine/core';
import { genId } from '@ai-rpg-engine/core';
import { getDistrictForZone } from './district-core.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export type DefeatFalloutConfig = {
  factions?: Array<{ factionId: string; entityIds: string[] }>;
  reputationPerKill?: number;       // default -10
  alertPerKill?: number;            // default 15
  /**
   * Tag that marks a defeated entity as a boss. Default 'role:boss' — the
   * engine-wide role taxonomy every starter tags its bosses with (W6 finding:
   * the old default 'boss' matched NO shipped starter, so boss kills accrued
   * reputation/alert at the regular rate everywhere and the boss milestone —
   * world-tick's genre spawn-rule feed — never fired). Packs with a different
   * taxonomy pass their own tag here.
   */
  bossTag?: string;                 // default 'role:boss'
  bossReputationPenalty?: number;   // default -25
  bossAlertPenalty?: number;        // default 30
  heatPerKill?: number;             // default 5
  districtSafetyDelta?: number;     // default -3
  violenceThreshold?: number;       // kills per district before escalation, default 3
  violenceWindow?: number;          // ticks to count within, default 10
  playerId?: string;                // default 'player'
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findFaction(
  factions: Array<{ factionId: string; entityIds: string[] }>,
  entityId: string,
): string | undefined {
  for (const f of factions) {
    if (f.entityIds.includes(entityId)) return f.factionId;
  }
  return undefined;
}

function getGlobal(world: WorldState, key: string, fallback: number): number {
  return (world.globals[key] as number) ?? fallback;
}

function setGlobal(world: WorldState, key: string, value: number): void {
  world.globals[key] = value;
}

function emit(
  ctx: { events: { emit(event: ResolvedEvent): void } },
  world: WorldState,
  type: string,
  tick: number,
  payload: Record<string, unknown>,
): void {
  // Deterministic id from the per-instance counter; the event is recorded via
  // ctx.events.emit → store.recordEvent. (Was the deprecated global nextId.)
  ctx.events.emit({
    id: genId(world, 'evt'),
    type,
    tick,
    actorId: (payload.actorId as string) ?? undefined,
    payload,
  });
}

type ViolenceLevel = 'normal' | 'tense' | 'bloody' | 'crackdown';

function deriveViolenceLevel(count: number): ViolenceLevel {
  if (count >= 8) return 'crackdown';
  if (count >= 5) return 'bloody';
  if (count >= 3) return 'tense';
  return 'normal';
}

/**
 * Module persistence shape. `violenceHistory` (per-district rolling window of
 * kill ticks) used to live ONLY in createDefeatFallout()'s closure while the
 * DERIVED `violence_<district>_count` global WAS persisted (F-7f3d92e1).
 * After any save/reload the fresh closure recomputed the count from an empty
 * window and silently overwrote the persisted global with a much smaller
 * value — discarding accumulated violence pressure with no error or event
 * distinguishing "genuinely low violence" from "tracking got reset by a
 * reload." Plain arrays of tick numbers serialize fine, so the raw window now
 * rides world.modules like the sibling modules' state does.
 */
type DefeatFalloutModuleState = {
  violenceHistory: Record<string, number[]>;
};

function getFalloutState(world: WorldState): DefeatFalloutModuleState {
  const existing = world.modules['defeat-fallout'] as DefeatFalloutModuleState | undefined;
  if (existing) return existing;
  // Legacy saves (pre-persistence) lack the namespace, and Engine.deserialize
  // only seeds namespaces on NEW stores — synthesize and ATTACH the default so
  // mutations land on the world instead of a throwaway (the same write-back
  // registerProfileAbilities uses in ability-core.ts for harness worlds).
  const fresh: DefeatFalloutModuleState = { violenceHistory: {} };
  world.modules['defeat-fallout'] = fresh;
  return fresh;
}

// ---------------------------------------------------------------------------
// Module factory
// ---------------------------------------------------------------------------

export function createDefeatFallout(config: DefeatFalloutConfig = {}): EngineModule {
  const {
    factions = [],
    reputationPerKill = -10,
    alertPerKill = 15,
    // 'role:boss' — the shipped role taxonomy (see DefeatFalloutConfig.bossTag).
    // The old default 'boss' was dead against every starter's tags.
    bossTag = 'role:boss',
    bossReputationPenalty = -25,
    bossAlertPenalty = 30,
    heatPerKill = 5,
    districtSafetyDelta = -3,
    violenceThreshold = 3,
    violenceWindow = 10,
    playerId = 'player',
  } = config;

  return {
    id: 'defeat-fallout',
    version: '1.0.0',
    dependsOn: ['district-core'],

    register(ctx) {
      ctx.persistence.registerNamespace('defeat-fallout', {
        violenceHistory: {},
      } satisfies DefeatFalloutModuleState);

      ctx.events.on('combat.entity.defeated', (event: ResolvedEvent, world: WorldState) => {
        const defeatedId = event.payload.entityId as string;
        const defeatedName = (event.payload.entityName as string) ?? defeatedId;
        const defeatedBy = event.payload.defeatedBy as string;

        // --- Player defeated ---
        if (defeatedId === playerId) {
          emit(ctx, world, 'defeat.fallout.player-fallen', event.tick, {
            defeatedBy,
            zoneId: world.entities[playerId]?.zoneId ?? world.locationId,
          });
          emit(ctx, world, 'defeat.fallout.companion', event.tick, {
            trigger: 'combat-lost',
          });
          emit(ctx, world, 'defeat.fallout.chronicle', event.tick, {
            category: 'death',
            actorId: defeatedBy,
            targetId: playerId,
            targetName: world.entities[playerId]?.name ?? playerId,
            significance: 1.0,
          });
          return;
        }

        // --- Non-player kill by non-player: no fallout ---
        if (defeatedBy !== playerId) return;

        // --- Player killed an entity ---
        const defeated = world.entities[defeatedId];
        const isBoss = defeated?.tags.includes(bossTag) ?? false;
        const zoneId = defeated?.zoneId ?? world.locationId;
        const districtId = getDistrictForZone(world, zoneId);

        // Faction lookup
        const factionId = findFaction(factions, defeatedId);

        // Reputation
        if (factionId) {
          const repKey = `reputation_${factionId}`;
          const repDelta = isBoss ? bossReputationPenalty : reputationPerKill;
          setGlobal(world, repKey, getGlobal(world, repKey, 0) + repDelta);
        }

        // Alert
        if (factionId) {
          const alertKey = `faction_alert_${factionId}`;
          const alertDelta = isBoss ? bossAlertPenalty : alertPerKill;
          setGlobal(world, alertKey, getGlobal(world, alertKey, 0) + alertDelta);
        }

        // Heat
        const heatKey = 'player_heat';
        setGlobal(world, heatKey, getGlobal(world, heatKey, 0) + heatPerKill);

        // District safety
        if (districtId) {
          const safetyKey = `district_${districtId}_safety`;
          setGlobal(world, safetyKey, getGlobal(world, safetyKey, 0) + districtSafetyDelta);
        }

        // Violence tracking per district (persisted tick history, count stored
        // in globals). Re-fetched from world.modules on every kill
        // (F-7f3d92e1) so the window survives save/reload and the derived
        // count can never silently regress below reality.
        let violenceLevel: ViolenceLevel = 'normal';
        if (districtId) {
          const countKey = `violence_${districtId}_count`;
          const { violenceHistory } = getFalloutState(world);
          if (!violenceHistory[districtId]) {
            violenceHistory[districtId] = [];
            // Legacy-save reconciliation: a pre-persistence save carries the
            // derived count global but no tick history. Seed that many ticks
            // at the current tick so accumulated pressure carries forward
            // (and decays from now) instead of being silently amnestied.
            const persisted = getGlobal(world, countKey, 0);
            for (let i = 0; i < persisted; i++) {
              violenceHistory[districtId].push(event.tick);
            }
          }
          const ticks = violenceHistory[districtId];
          // Prune old ticks outside window
          while (ticks.length > 0 && event.tick - ticks[0] > violenceWindow) {
            ticks.shift();
          }
          ticks.push(event.tick);
          const killCount = ticks.length;
          setGlobal(world, countKey, killCount);
          violenceLevel = deriveViolenceLevel(killCount);

          if (killCount >= violenceThreshold) {
            world.globals[`district_${districtId}_tension`] = violenceLevel;
            emit(ctx, world, 'defeat.region.violence-escalated', event.tick, {
              districtId,
              level: violenceLevel,
              killCount,
            });
          }
        }

        // Significance: boss = 1.0, faction member = 0.7, random = 0.4
        const significance = isBoss ? 1.0 : factionId ? 0.7 : 0.4;

        // --- Emit structured events ---

        // Fallout summary
        emit(ctx, world, 'defeat.fallout.triggered', event.tick, {
          actorId: playerId,
          targetId: defeatedId,
          targetName: defeatedName,
          factionId: factionId ?? null,
          isBoss,
          reputation: factionId ? getGlobal(world, `reputation_${factionId}`, 0) : null,
          alert: factionId ? getGlobal(world, `faction_alert_${factionId}`, 0) : null,
          heat: getGlobal(world, heatKey, 0),
          districtId: districtId ?? null,
          districtSafety: districtId ? getGlobal(world, `district_${districtId}_safety`, 0) : null,
          violenceLevel,
          significance,
        });

        // Chronicle
        emit(ctx, world, 'defeat.fallout.chronicle', event.tick, {
          category: 'kill',
          actorId: playerId,
          targetId: defeatedId,
          targetName: defeatedName,
          factionId: factionId ?? null,
          significance,
          zoneId,
          isBoss,
        });

        // Rumor
        const valence = isBoss ? 'fearsome' : (factionId ? 'fearsome' : 'heroic');
        const claim = isBoss
          ? `${world.entities[playerId]?.name ?? playerId} slew the ${defeatedName}`
          : `${world.entities[playerId]?.name ?? playerId} killed ${defeatedName}`;
        emit(ctx, world, 'defeat.fallout.rumor', event.tick, {
          claim,
          valence,
          originDistrictId: districtId ?? null,
          defeateeId: defeatedId,
          defeateeName: defeatedName,
        });

        // Companion
        emit(ctx, world, 'defeat.fallout.companion', event.tick, {
          trigger: 'combat-won',
        });

        // Pressure (for product layer evaluation)
        if (factionId) {
          emit(ctx, world, 'defeat.fallout.pressure', event.tick, {
            factionId,
            alertLevel: getGlobal(world, `faction_alert_${factionId}`, 0),
            reputation: getGlobal(world, `reputation_${factionId}`, 0),
          });
        }

        // Boss milestone
        if (isBoss) {
          emit(ctx, world, 'defeat.fallout.milestone', event.tick, {
            label: `Defeated ${defeatedName}`,
            tags: ['boss-kill', `faction:${factionId ?? 'none'}`],
          });
        }
      });
    },
  };
}
