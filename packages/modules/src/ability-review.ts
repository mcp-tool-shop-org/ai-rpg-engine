/**
 * Ability Review — structured ability explainability.
 *
 * Produces an AbilityTrace for every ability use with full breakdown:
 * costs, checks, effects, targets. Mirrors combat-review pattern.
 */

import type {
  EngineModule,
  ResolvedEvent,
} from '@ai-rpg-engine/core';
import { nextId } from '@ai-rpg-engine/core';
import type { AbilityCheckResult } from './ability-core.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AbilityCheckTrace = {
  stat: string;
  difficulty: number;
  roll: number;
  passed: boolean;
  onFail?: string;
};

export type AbilityEffectTrace = {
  type: string;
  targetId?: string;
  targetName?: string;
  detail: Record<string, unknown>;
  resistanceOutcome?: 'immune' | 'resisted' | 'vulnerable' | 'normal';
};

export type AbilityCostTrace = {
  resourceId: string;
  amount: number;
  before: number;
  after: number;
};

export type AbilityTrace = {
  traceId: string;
  tick: number;
  abilityId: string;
  abilityName: string;
  actorId: string;
  actorName: string;
  targetIds: string[];
  targetNames: string[];
  costs: AbilityCostTrace[];
  checks: AbilityCheckTrace[];
  allChecksPassed: boolean;
  effects: AbilityEffectTrace[];
  cooldownSet: boolean;
  outcome: 'success' | 'partial' | 'aborted' | 'rejected';
  summary: string;
};

export type AbilityReviewConfig = {
  maxTraces?: number;
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createAbilityReview(config?: AbilityReviewConfig): EngineModule {
  const maxTraces = config?.maxTraces ?? 50;
  const traces: AbilityTrace[] = [];
  let pending: Partial<AbilityTrace> | null = null;

  function summarize(t: Partial<AbilityTrace>): string {
    switch (t.outcome) {
      case 'success':
        return `${t.actorName} used ${t.abilityName}${t.targetNames?.length ? ` on ${t.targetNames.join(', ')}` : ''} — ${t.effects?.length ?? 0} effects applied`;
      case 'partial':
        return `${t.actorName} used ${t.abilityName}${t.targetNames?.length ? ` on ${t.targetNames.join(', ')}` : ''} — partial (check failed)`;
      case 'aborted':
        return `${t.actorName} tried ${t.abilityName} but check failed (aborted)`;
      case 'rejected':
        return `${t.actorName} could not use ${t.abilityName}`;
      default:
        return `${t.actorName} ${t.abilityName}`;
    }
  }

  return {
    id: 'ability-review',
    version: '0.1.0',
    dependsOn: ['ability-core'],

    register(ctx) {
      // 1. ability.used — start trace
      ctx.events.on('ability.used', (event) => {
        const checks = (event.payload.checks as AbilityCheckResult[]) ?? [];
        const allPassed = checks.every((c) => c.passed);

        pending = {
          traceId: nextId('trace'),
          tick: event.tick,
          abilityId: event.payload.abilityId as string,
          abilityName: event.payload.abilityName as string,
          actorId: event.payload.actorId as string,
          actorName: event.payload.actorName as string,
          targetIds: (event.payload.targetIds as string[]) ?? [],
          targetNames: (event.payload.targetNames as string[]) ?? [],
          costs: [],
          checks: checks.map((c) => ({
            stat: c.stat,
            difficulty: c.difficulty,
            roll: c.roll,
            passed: c.passed,
            onFail: c.onFail,
          })),
          allChecksPassed: allPassed,
          effects: [],
          cooldownSet: false,
          outcome: allPassed ? 'success' : 'partial',
        };
      });

      // 2. ability.check.failed (abort) — starts its own trace since ability.used never fires on abort
      ctx.events.on('ability.check.failed', (event) => {
        if (event.payload.aborted) {
          const checks = ((event.payload.checks as AbilityCheckResult[]) ?? []);
          pending = {
            traceId: nextId('trace'),
            tick: event.tick,
            abilityId: event.payload.abilityId as string,
            abilityName: event.payload.abilityName as string,
            actorId: event.actorId,
            actorName: event.actorId,
            targetIds: (event.payload.targetIds as string[]) ?? [],
            targetNames: [],
            costs: [],
            checks: checks.map((c) => ({
              stat: c.stat,
              difficulty: c.difficulty,
              roll: c.roll,
              passed: c.passed,
              onFail: c.onFail,
            })),
            allChecksPassed: false,
            effects: [],
            cooldownSet: false,
            outcome: 'aborted',
          };
          finalize(ctx, event.tick);
        }
      });

      // 3. ability.rejected
      ctx.events.on('ability.rejected', (event) => {
        pending = {
          traceId: nextId('trace'),
          tick: event.tick,
          abilityId: event.payload.abilityId as string ?? 'unknown',
          abilityName: event.payload.abilityName as string ?? 'unknown',
          actorId: event.actorId,
          actorName: event.actorId,
          targetIds: [],
          targetNames: [],
          costs: [],
          checks: [],
          allChecksPassed: false,
          effects: [],
          cooldownSet: false,
          outcome: 'rejected',
          summary: `Rejected: ${event.payload.reason}`,
        };
        finalize(ctx, event.tick);
      });

      // 4. resource.changed — capture costs
      ctx.events.on('resource.changed', (event) => {
        if (!pending) return;
        if (event.payload.entityId === pending.actorId) {
          pending.costs!.push({
            resourceId: event.payload.resource as string,
            amount: Math.abs(event.payload.delta as number),
            before: event.payload.previous as number,
            after: event.payload.current as number,
          });
        }
      });

      // 5. Effect events — capture effect details
      const effectTypes = [
        'ability.damage.applied',
        'ability.heal.applied',
        'ability.status.applied',
        'ability.status.removed',
        'ability.resource.modified',
        'ability.stat.modified',
      ];

      for (const effectType of effectTypes) {
        ctx.events.on(effectType, (event) => {
          if (!pending) return;
          let resistanceOutcome: AbilityEffectTrace['resistanceOutcome'] = undefined;
          if (effectType === 'ability.status.applied' && event.payload.resistance) {
            const raw = event.payload.resistance as string;
            resistanceOutcome = raw === 'resistant' ? 'resisted' : raw as 'vulnerable' | 'normal';
          }
          pending.effects!.push({
            type: effectType.replace('ability.', '').replace('.applied', '').replace('.modified', '').replace('.removed', '-removed'),
            targetId: event.payload.targetId as string,
            targetName: event.payload.targetName as string,
            detail: { ...event.payload },
            ...(resistanceOutcome ? { resistanceOutcome } : {}),
          });
        });
      }

      // 5b. Resistance interaction events — capture immune/resisted/vulnerable as effect traces
      const resistanceEventTypes = [
        'ability.status.immune',
        'ability.status.resisted',
        'ability.status.vulnerable',
      ] as const;

      for (const resType of resistanceEventTypes) {
        ctx.events.on(resType, (event) => {
          if (!pending) return;
          const outcome = resType === 'ability.status.immune' ? 'immune'
            : resType === 'ability.status.resisted' ? 'resisted'
            : 'vulnerable';
          pending.effects!.push({
            type: `status-${outcome}`,
            targetId: event.payload.targetId as string,
            targetName: event.payload.targetName as string,
            detail: { ...event.payload },
            resistanceOutcome: outcome,
          });
        });
      }

      // 6. ability.resolved — finalize trace
      ctx.events.on('ability.resolved', (event) => {
        if (!pending) return;
        pending.cooldownSet = true; // If we got to resolved, cooldown was set (if ability has one)
        finalize(ctx, event.tick);
      });

      // Debug inspector — expanded for Phase 4
      ctx.debug.registerInspector({
        id: 'ability-review',
        label: 'Ability Review',
        inspect: (world) => {
          // Active cooldowns
          const coreState = world.modules?.['ability-core'] as
            | { cooldowns: Record<string, Record<string, number>> }
            | undefined;
          const activeCooldowns: Array<{ entityId: string; abilityId: string; expiresAt: number }> = [];
          if (coreState?.cooldowns) {
            const tick = world.meta?.tick ?? 0;
            for (const [entityId, abilities] of Object.entries(coreState.cooldowns)) {
              for (const [abilityId, expiresAt] of Object.entries(abilities)) {
                if (expiresAt > tick) {
                  activeCooldowns.push({ entityId, abilityId, expiresAt });
                }
              }
            }
          }

          // Active statuses
          const activeStatuses: Array<{ entityId: string; statusId: string; expiresAt?: number }> = [];
          for (const entity of Object.values(world.entities)) {
            for (const status of entity.statuses ?? []) {
              activeStatuses.push({
                entityId: entity.id,
                statusId: status.statusId,
                expiresAt: status.expiresAtTick,
              });
            }
          }

          // Notable resistances
          const resistances: Array<{ entityId: string; resistances: Record<string, string> }> = [];
          for (const entity of Object.values(world.entities)) {
            if (entity.resistances && Object.keys(entity.resistances).length > 0) {
              resistances.push({ entityId: entity.id, resistances: { ...entity.resistances } });
            }
          }

          return {
            traceCount: traces.length,
            recentTraces: traces.slice(-5).map((t) => ({
              abilityId: t.abilityId,
              actorId: t.actorId,
              outcome: t.outcome,
              tick: t.tick,
            })),
            activeCooldowns,
            activeStatuses,
            resistances,
          };
        },
      });
    },
  };

  function finalize(
    ctx: { events: { emit: (event: ResolvedEvent) => void } },
    tick: number,
  ): void {
    if (!pending) return;
    if (!pending.summary) {
      pending.summary = summarize(pending);
    }

    const trace = pending as AbilityTrace;
    traces.push(trace);
    if (traces.length > maxTraces) traces.shift();
    pending = null;

    ctx.events.emit({
      id: nextId('evt'),
      type: 'ability.review.trace',
      tick,
      actorId: trace.actorId,
      payload: { trace },
      visibility: 'hidden',
    });
  }
}

// ---------------------------------------------------------------------------
// Text formatter
// ---------------------------------------------------------------------------

/** Derive a category label from an ability trace's effects */
function traceCategory(trace: AbilityTrace): string {
  const types = new Set(trace.effects.map((e) => e.type));
  if (types.has('damage') || types.has('damage-applied')) return 'offensive';
  if (types.has('heal') || types.has('heal-applied') || types.has('stat-removed')) return 'defensive';
  if (types.has('status') || types.has('status-immune') || types.has('status-resisted')) return 'control';
  return 'utility';
}

export function formatAbilityTrace(trace: AbilityTrace): string {
  const lines: string[] = [];
  const cat = traceCategory(trace);
  lines.push(`--- Ability Trace [tick ${trace.tick}] [${cat}] ---`);
  lines.push(`${trace.actorName} → ${trace.abilityName} (${trace.abilityId})`);
  lines.push(`Outcome: ${trace.outcome}`);

  if (trace.targetNames.length > 0) {
    lines.push(`Targets: ${trace.targetNames.join(', ')}`);
  }

  if (trace.costs.length > 0) {
    lines.push('Costs:');
    for (const cost of trace.costs) {
      lines.push(`  ${cost.resourceId}: -${cost.amount} (${cost.before} → ${cost.after})`);
    }
  }

  if (trace.checks.length > 0) {
    lines.push('Checks:');
    for (const check of trace.checks) {
      const status = check.passed ? 'PASS' : 'FAIL';
      lines.push(`  ${check.stat} vs ${check.difficulty}: roll ${check.roll} → ${status}${check.onFail ? ` (onFail: ${check.onFail})` : ''}`);
    }
  }

  if (trace.effects.length > 0) {
    lines.push('Effects:');
    for (const effect of trace.effects) {
      const resSuffix = effect.resistanceOutcome ? ` (${effect.resistanceOutcome})` : '';
      lines.push(`  [${effect.type}] ${effect.targetName ?? 'self'}${resSuffix}`);
    }
  }

  lines.push(`Summary: ${trace.summary}`);
  return lines.join('\n');
}
