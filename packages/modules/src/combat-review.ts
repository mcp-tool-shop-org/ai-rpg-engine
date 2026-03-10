/**
 * Combat Review — structured combat explainability.
 *
 * Produces a CombatTrace for every combat action with full formula
 * source attribution (starter → engagement → combat-core).
 * No new mechanics — pure observability.
 */

import type {
  EngineModule,
  EntityState,
  WorldState,
} from '@ai-rpg-engine/core';
import { nextId } from '@ai-rpg-engine/core';
import { hasStatus } from './status-core.js';
import { COMBAT_STATES } from './combat-core.js';
import type { CombatFormulas } from './combat-core.js';
import { ENGAGEMENT_STATES } from './engagement-core.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FormulaSource = 'starter' | 'engagement' | 'combat-core' | 'clamp';

export type FormulaStep = {
  source: FormulaSource;
  label: string;
  delta: number;
  value: number;
};

export type FormulaTrace = {
  name: string;
  base: number;
  final: number;
  steps: FormulaStep[];
};

export type DamageTrace = {
  rawDamage: number;
  guardReduction: number | null;
  guardedDamage: number | null;
  exposedBonus: number;
  finalDamage: number;
  previousHp: number;
  currentHp: number;
  defeated: boolean;
};

export type InterceptionTrace = {
  interceptorId: string;
  interceptorName: string;
  chance: number;
  roll: number;
  passed: boolean;
  damageAbsorbed: number;
  interceptorDefeated: boolean;
};

export type CombatOutcome =
  | 'hit' | 'miss' | 'intercepted'
  | 'guard-start'
  | 'disengage-success' | 'disengage-fail'
  | 'rejected';

export type CombatTrace = {
  traceId: string;
  tick: number;
  verb: 'attack' | 'guard' | 'disengage';
  actorId: string;
  actorName: string;
  targetId?: string;
  targetName?: string;
  actorStatuses: string[];
  targetStatuses: string[];
  formulas: FormulaTrace[];
  roll?: number;
  outcome: CombatOutcome;
  damagePipeline?: DamageTrace;
  interception?: InterceptionTrace;
  rejectionReason?: string;
  summary: string;
};

export type CombatReviewConfig = {
  baseFormulas: CombatFormulas;
  maxTraces?: number;
};

// ---------------------------------------------------------------------------
// Defaults (duplicated from combat-core — these are local helpers, not exported)
// ---------------------------------------------------------------------------

function defaultHitChance(attacker: EntityState, target: EntityState): number {
  const ai = attacker.stats.instinct ?? 5;
  const ti = target.stats.instinct ?? 5;
  return Math.min(95, Math.max(5, 50 + ai * 5 - ti * 3));
}

function defaultDamage(attacker: EntityState): number {
  return Math.max(1, attacker.stats.vigor ?? 3);
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

const COMBAT_VERBS = new Set(['attack', 'guard', 'disengage']);

export function createCombatReview(config: CombatReviewConfig): {
  module: EngineModule;
  explain: (wrappedFormulas: CombatFormulas) => CombatFormulas;
} {
  const maxTraces = config.maxTraces ?? 50;
  const base = config.baseFormulas;

  // --- Shared closure state ---
  const traces: CombatTrace[] = [];
  let pending: Partial<CombatTrace> | null = null;

  // Formula capture buffer — written by explain(), read by module listeners
  const cap: {
    hitChance?: { base: number; eng: number; steps: FormulaStep[] };
    damage?: { base: number; eng: number; steps: FormulaStep[] };
    guardReduction?: { base: number; eng: number; steps: FormulaStep[] };
    disengageChance?: { base: number; eng: number; steps: FormulaStep[] };
    interceptChance?: { base: number; eng: number; steps: FormulaStep[] };
  } = {};

  function clearCapture(): void {
    delete cap.hitChance;
    delete cap.damage;
    delete cap.guardReduction;
    delete cap.disengageChance;
    delete cap.interceptChance;
  }

  // --- Helper: build engagement attribution steps ---

  function engagementSteps(
    baseVal: number,
    engVal: number,
    checks: { statusId: string; entity: EntityState; delta: number; label: string }[],
  ): FormulaStep[] {
    const steps: FormulaStep[] = [
      { source: 'starter', label: 'starter', delta: baseVal, value: baseVal },
    ];
    if (engVal === baseVal) return steps;

    let running = baseVal;
    for (const c of checks) {
      if (hasStatus(c.entity, c.statusId)) {
        running += c.delta;
        steps.push({ source: 'engagement', label: c.label, delta: c.delta, value: running });
      }
    }
    // If running doesn't match engagement result, add clamp step
    if (running !== engVal) {
      steps.push({ source: 'clamp', label: 'engagement clamp', delta: engVal - running, value: engVal });
    }
    return steps;
  }

  // --- Formula wrapper ---

  function explain(wrapped: CombatFormulas): CombatFormulas {
    return {
      ...wrapped,

      hitChance: (attacker, target, world) => {
        const bv = base.hitChance ? base.hitChance(attacker, target, world) : defaultHitChance(attacker, target);
        const ev = wrapped.hitChance ? wrapped.hitChance(attacker, target, world) : bv;
        cap.hitChance = {
          base: bv,
          eng: ev,
          steps: engagementSteps(bv, ev, [
            { statusId: ENGAGEMENT_STATES.BACKLINE, entity: target, delta: -10, label: 'BACKLINE -10 hit' },
            { statusId: ENGAGEMENT_STATES.ENGAGED, entity: target, delta: 5, label: 'ENGAGED +5 hit' },
          ]),
        };
        return ev;
      },

      damage: (attacker, target, world) => {
        const bv = base.damage ? base.damage(attacker, target, world) : defaultDamage(attacker);
        const ev = wrapped.damage ? wrapped.damage(attacker, target, world) : bv;
        cap.damage = {
          base: bv,
          eng: ev,
          steps: engagementSteps(bv, ev, [
            { statusId: ENGAGEMENT_STATES.BACKLINE, entity: attacker, delta: -1, label: 'BACKLINE -1 dmg' },
            { statusId: ENGAGEMENT_STATES.ISOLATED, entity: target, delta: 2, label: 'ISOLATED +2 dmg' },
          ]),
        };
        return ev;
      },

      guardReduction: (defender, world) => {
        const bv = base.guardReduction ? base.guardReduction(defender, world) : 0.5;
        const ev = wrapped.guardReduction ? wrapped.guardReduction(defender, world) : bv;
        cap.guardReduction = {
          base: bv,
          eng: ev,
          steps: engagementSteps(bv, ev, [
            { statusId: ENGAGEMENT_STATES.PROTECTED, entity: defender, delta: 0.10, label: 'PROTECTED +0.10 guard' },
          ]),
        };
        return ev;
      },

      disengageChance: (actor, world) => {
        const bv = base.disengageChance ? base.disengageChance(actor, world) : 40;
        const ev = wrapped.disengageChance ? wrapped.disengageChance(actor, world) : bv;
        cap.disengageChance = {
          base: bv,
          eng: ev,
          steps: engagementSteps(bv, ev, [
            { statusId: ENGAGEMENT_STATES.ENGAGED, entity: actor, delta: -15, label: 'ENGAGED -15 disengage' },
            { statusId: ENGAGEMENT_STATES.ISOLATED, entity: actor, delta: -10, label: 'ISOLATED -10 disengage' },
            { statusId: ENGAGEMENT_STATES.BACKLINE, entity: actor, delta: 15, label: 'BACKLINE +15 disengage' },
          ]),
        };
        return ev;
      },

      interceptChance: (ally, target, world) => {
        const bv = base.interceptChance ? base.interceptChance(ally, target, world) : 30;
        const ev = wrapped.interceptChance ? wrapped.interceptChance(ally, target, world) : bv;
        cap.interceptChance = {
          base: bv,
          eng: ev,
          steps: engagementSteps(bv, ev, [
            { statusId: ENGAGEMENT_STATES.PROTECTED, entity: target, delta: 15, label: 'PROTECTED +15 intercept' },
          ]),
        };
        return ev;
      },

      isAlly: wrapped.isAlly,
      combatMoraleDelta: wrapped.combatMoraleDelta,
    };
  }

  // --- Build hitChance FormulaTrace from capture + event payload ---

  function buildHitChanceTrace(eventHitChance: number, _world: WorldState): FormulaTrace | undefined {
    if (!cap.hitChance) return undefined;
    const { base: bv, eng: ev, steps } = cap.hitChance;
    const allSteps = [...steps];

    // Combat-core applies EXPOSED +20 and FLEEING +10 after the formula.
    // Statuses may already be removed by the time listeners fire,
    // so use the snapshot captured at action.declared time.
    if (eventHitChance !== ev) {
      const targetStatuses = pending?.targetStatuses ?? [];
      let running = ev;
      if (targetStatuses.includes(COMBAT_STATES.EXPOSED)) {
        running += 20;
        allSteps.push({ source: 'combat-core', label: 'EXPOSED +20 hit', delta: 20, value: running });
      }
      if (targetStatuses.includes(COMBAT_STATES.FLEEING)) {
        running += 10;
        allSteps.push({ source: 'combat-core', label: 'FLEEING +10 hit', delta: 10, value: running });
      }
      // Final clamp by combat-core
      if (running !== eventHitChance) {
        allSteps.push({ source: 'clamp', label: 'clamp [5, 95]', delta: eventHitChance - running, value: eventHitChance });
      }
    }

    return { name: 'hitChance', base: bv, final: eventHitChance, steps: allSteps };
  }

  // --- Generate one-line summary ---

  function summarize(t: Partial<CombatTrace>): string {
    switch (t.outcome) {
      case 'hit':
        if (t.damagePipeline) {
          const dp = t.damagePipeline;
          return `${t.actorName} hit ${t.targetName} for ${dp.finalDamage} damage (${dp.previousHp}\u2192${dp.currentHp} HP)${dp.defeated ? ' [DEFEATED]' : ''}`;
        }
        return `${t.actorName} hit ${t.targetName}`;
      case 'miss':
        return `${t.actorName} missed ${t.targetName} (roll ${t.roll} vs ${t.formulas?.find(f => f.name === 'hitChance')?.final ?? '?'}%)`;
      case 'intercepted':
        return `${t.interception?.interceptorName} intercepted attack on ${t.targetName}, absorbed ${t.interception?.damageAbsorbed} damage`;
      case 'guard-start':
        return `${t.actorName} raised guard`;
      case 'disengage-success':
        return `${t.actorName} disengaged successfully`;
      case 'disengage-fail':
        return `${t.actorName} failed to disengage (roll ${t.roll} vs ${t.formulas?.find(f => f.name === 'disengageChance')?.final ?? '?'}%)`;
      case 'rejected':
        return `${t.actorName} action rejected: ${t.rejectionReason}`;
      default:
        return `${t.actorName} ${t.verb}`;
    }
  }

  // --- Module ---

  const module: EngineModule = {
    id: 'combat-review',
    version: '1.0.0',
    dependsOn: ['status-core'],

    register(ctx) {
      // 1. action.declared — start trace
      ctx.events.on('action.declared', (event, world) => {
        const verb = event.payload.verb as string;
        if (!COMBAT_VERBS.has(verb)) {
          pending = null;
          return;
        }
        clearCapture();

        const actorId = event.payload.actorId as string;
        const targetId = (event.payload.targetIds as string[] | undefined)?.[0];
        const actor = world.entities[actorId];
        const target = targetId ? world.entities[targetId] : undefined;

        pending = {
          traceId: nextId('trace'),
          tick: event.tick,
          verb: verb as CombatTrace['verb'],
          actorId,
          actorName: actor?.name ?? actorId,
          targetId,
          targetName: target?.name ?? targetId,
          actorStatuses: actor?.statuses.map(s => s.statusId) ?? [],
          targetStatuses: target?.statuses.map(s => s.statusId) ?? [],
          formulas: [],
          outcome: 'rejected',
          summary: '',
        };
      });

      // 2. combat.contact.hit
      ctx.events.on('combat.contact.hit', (event, world) => {
        if (!pending) return;
        pending.outcome = 'hit';
        pending.roll = event.payload.roll as number;
        const hitTrace = buildHitChanceTrace(event.payload.hitChance as number, world);
        if (hitTrace) pending.formulas!.push(hitTrace);
      });

      // 3. combat.contact.miss
      ctx.events.on('combat.contact.miss', (event, world) => {
        if (!pending) return;
        pending.outcome = 'miss';
        pending.roll = event.payload.roll as number;
        const hitTrace = buildHitChanceTrace(event.payload.hitChance as number, world);
        if (hitTrace) pending.formulas!.push(hitTrace);
      });

      // 4. combat.damage.applied
      ctx.events.on('combat.damage.applied', (event, _world) => {
        if (!pending) return;
        const finalDmg = event.payload.damage as number;
        const prevHp = event.payload.previousHp as number;
        const curHp = event.payload.currentHp as number;

        // Preserve guard data if combat.guard.absorbed already fired
        const existingGuardReduction = pending.damagePipeline?.guardReduction ?? null;
        const existingGuardedDamage = pending.damagePipeline?.guardedDamage ?? null;

        pending.damagePipeline = {
          rawDamage: cap.damage?.eng ?? finalDmg,
          guardReduction: existingGuardReduction,
          guardedDamage: existingGuardedDamage,
          exposedBonus: 0,
          finalDamage: finalDmg,
          previousHp: prevHp,
          currentHp: curHp,
          defeated: curHp <= 0,
        };

        // Check if EXPOSED bonus was applied (combat-core adds +2 for exposed)
        if (pending.targetStatuses?.includes(COMBAT_STATES.EXPOSED)) {
          pending.damagePipeline.exposedBonus = 2;
        }

        if (cap.damage) {
          pending.formulas!.push({
            name: 'damage',
            base: cap.damage.base,
            final: finalDmg,
            steps: [...cap.damage.steps],
          });
        }
      });

      // 5. combat.guard.absorbed (fires BEFORE combat.damage.applied in event order)
      ctx.events.on('combat.guard.absorbed', (event, _world) => {
        if (!pending) return;
        const origDmg = event.payload.originalDamage as number;
        const reducedDmg = event.payload.reducedDamage as number;
        const reduction = origDmg > 0 ? 1 - (reducedDmg / origDmg) : 0;

        // Store for when damage.applied fires
        if (!pending.damagePipeline) {
          pending.damagePipeline = {
            rawDamage: cap.damage?.eng ?? origDmg,
            guardReduction: reduction,
            guardedDamage: reducedDmg,
            exposedBonus: 0,
            finalDamage: 0,
            previousHp: 0,
            currentHp: 0,
            defeated: false,
          };
        } else {
          pending.damagePipeline.guardReduction = reduction;
          pending.damagePipeline.guardedDamage = reducedDmg;
        }

        if (cap.guardReduction) {
          pending.formulas!.push({
            name: 'guardReduction',
            base: cap.guardReduction.base,
            final: cap.guardReduction.eng,
            steps: [...cap.guardReduction.steps],
          });
        }
      });

      // 6. combat.guard.start
      ctx.events.on('combat.guard.start', (_event, _world) => {
        if (!pending) return;
        pending.outcome = 'guard-start';
      });

      // 7. combat.disengage.success
      ctx.events.on('combat.disengage.success', (_event, _world) => {
        if (!pending) return;
        pending.outcome = 'disengage-success';
        if (cap.disengageChance) {
          pending.formulas!.push({
            name: 'disengageChance',
            base: cap.disengageChance.base,
            final: cap.disengageChance.eng,
            steps: [...cap.disengageChance.steps],
          });
        }
      });

      // 8. combat.disengage.fail
      ctx.events.on('combat.disengage.fail', (event, _world) => {
        if (!pending) return;
        pending.outcome = 'disengage-fail';
        pending.roll = event.payload.roll as number;
        if (cap.disengageChance) {
          pending.formulas!.push({
            name: 'disengageChance',
            base: cap.disengageChance.base,
            final: event.payload.needed as number,
            steps: [...cap.disengageChance.steps],
          });
        }
      });

      // 9. combat.companion.intercepted
      ctx.events.on('combat.companion.intercepted', (event, _world) => {
        if (!pending) return;
        pending.outcome = 'intercepted';
        pending.interception = {
          interceptorId: event.payload.interceptorId as string,
          interceptorName: event.payload.interceptorName as string,
          chance: event.payload.interceptChance as number,
          roll: 0, // roll is internal to combat-core, not in payload
          passed: true,
          damageAbsorbed: event.payload.damage as number,
          interceptorDefeated: (event.payload.interceptorHpAfter as number) <= 0,
        };
      });

      // 10. action.rejected
      ctx.events.on('action.rejected', (event, _world) => {
        if (!pending) return;
        pending.outcome = 'rejected';
        pending.rejectionReason = event.payload.reason as string;
      });

      // 11. action.resolved — finalize + emit
      ctx.events.on('action.resolved', (event, _world) => {
        if (!pending) return;
        pending.summary = summarize(pending);

        const trace = pending as CombatTrace;
        traces.push(trace);
        if (traces.length > maxTraces) traces.shift();
        pending = null;

        ctx.events.emit({
          id: nextId('evt'),
          type: 'combat.review.trace',
          tick: event.tick,
          actorId: trace.actorId,
          payload: { trace },
          visibility: 'hidden',
        });
      });

      // Debug inspector
      ctx.debug.registerInspector({
        id: 'combat-review',
        label: 'Combat Review Traces',
        inspect: () => ({
          count: traces.length,
          recent: traces.slice(-10),
        }),
      });
    },
  };

  return { module, explain };
}

// ---------------------------------------------------------------------------
// Query helpers (exposed for tests / external consumers)
// ---------------------------------------------------------------------------

export function getReviewTraces(world: WorldState): readonly CombatTrace[] {
  const mod = world.modules['combat-review'] as { traces?: CombatTrace[] } | undefined;
  // The ring buffer lives in the closure, not in world.modules.
  // Traces are accessible via the debug inspector or combat.review.trace events.
  return mod?.traces ?? [];
}

// ---------------------------------------------------------------------------
// Text formatter
// ---------------------------------------------------------------------------

export function formatCombatTrace(trace: CombatTrace): string {
  const lines: string[] = [];
  lines.push(`--- Combat Trace [tick ${trace.tick}] ---`);
  lines.push(`${trace.actorName} ${trace.verb}${trace.targetName ? ` \u2192 ${trace.targetName}` : ''}`);
  lines.push(`Outcome: ${trace.outcome}`);

  if (trace.actorStatuses.length > 0) {
    lines.push(`Actor statuses: ${trace.actorStatuses.join(', ')}`);
  }
  if (trace.targetStatuses.length > 0) {
    lines.push(`Target statuses: ${trace.targetStatuses.join(', ')}`);
  }

  for (const ft of trace.formulas) {
    const rollInfo = ft.name === 'hitChance' && trace.roll != null
      ? `  (roll ${trace.roll} ${trace.roll <= ft.final ? '\u2264' : '>'} ${ft.final}% \u2192 ${trace.outcome === 'hit' || trace.outcome === 'intercepted' ? 'HIT' : 'MISS'})`
      : ft.name === 'disengageChance' && trace.roll != null
        ? `  (roll ${trace.roll} ${trace.roll <= ft.final ? '\u2264' : '>'} ${ft.final}% \u2192 ${trace.outcome === 'disengage-success' ? 'SUCCESS' : 'FAIL'})`
        : '';
    lines.push(`${ft.name}: ${ft.final}${ft.name.includes('Chance') || ft.name === 'hitChance' || ft.name === 'disengageChance' ? '%' : ''}${rollInfo}`);
    for (const step of ft.steps) {
      const deltaStr = step.delta !== 0 ? ` (${step.delta > 0 ? '+' : ''}${step.delta})` : '';
      lines.push(`  [${step.source}] ${step.label} = ${step.value}${deltaStr}`);
    }
  }

  if (trace.damagePipeline) {
    const dp = trace.damagePipeline;
    const parts = [`Raw: ${dp.rawDamage}`];
    if (dp.guardReduction !== null) parts.push(`Guard: ${(dp.guardReduction * 100).toFixed(0)}% \u2192 ${dp.guardedDamage}`);
    if (dp.exposedBonus > 0) parts.push(`EXPOSED +${dp.exposedBonus}`);
    parts.push(`Final: ${dp.finalDamage}`);
    lines.push(`Damage: ${parts.join('  \u2192  ')}`);
    lines.push(`HP: ${dp.previousHp} \u2192 ${dp.currentHp}${dp.defeated ? '  [DEFEATED]' : ''}`);
  }

  if (trace.interception) {
    const ic = trace.interception;
    lines.push(`Intercepted by ${ic.interceptorName} (chance: ${ic.chance}%, absorbed: ${ic.damageAbsorbed})${ic.interceptorDefeated ? ' [INTERCEPTOR DEFEATED]' : ''}`);
  }

  if (trace.rejectionReason) {
    lines.push(`Rejected: ${trace.rejectionReason}`);
  }

  lines.push(`Summary: ${trace.summary}`);
  return lines.join('\n');
}
