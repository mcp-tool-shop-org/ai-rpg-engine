/**
 * Combat Intent — AI combat decision scoring with explainability.
 *
 * Pure advisory: scores six combat intents (attack, guard, disengage,
 * pressure, protect, finish), applies personality-based pack biases,
 * and produces an explainable decision trace. Never auto-submits actions.
 */

import type {
  EngineModule,
  EntityState,
  WorldState,
} from '@ai-rpg-engine/core';
import { nextId } from '@ai-rpg-engine/core';
import { hasStatus } from './status-core.js';
import { COMBAT_STATES, DEFAULT_STAT_MAPPING } from './combat-core.js';
import type { CombatStatMapping } from './combat-core.js';
import { ENGAGEMENT_STATES } from './engagement-core.js';
import { getCognition } from './cognition-core.js';
import { BUILTIN_COMBAT_ROLES } from './combat-roles.js';
import type { CombatRole } from './combat-roles.js';
import type { CombatResourceProfile } from './combat-resources.js';
import { applyResourceIntentModifiers } from './combat-resources.js';

// ---------------------------------------------------------------------------
// Defeat awareness (module-scoped, cleared per tick)
// ---------------------------------------------------------------------------

/** Tracks defeated entity IDs and their types for this tick */
const defeatLog: Map<string, string> = new Map(); // entityId → entity.type

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CombatIntentType =
  | 'attack' | 'guard' | 'brace' | 'disengage' | 'reposition'
  | 'pressure' | 'protect' | 'finish';

export type IntentScoreContribution = {
  factor: string;
  value: number;
  weight: number;
  delta: number;
};

export type IntentScore = {
  intent: CombatIntentType;
  resolvedVerb: 'attack' | 'guard' | 'brace' | 'disengage' | 'reposition';
  targetId?: string;
  score: number;
  contributions: IntentScoreContribution[];
  reason: string;
};

export type CombatDecision = {
  entityId: string;
  entityName: string;
  tick: number;
  chosen: IntentScore;
  alternatives: IntentScore[];
  packBias?: string;
};

export type PackBias = {
  tag: string;
  name: string;
  modifiers: Partial<Record<CombatIntentType, number>>;
  moraleFleeThreshold?: number;
  moraleGuardThreshold?: number;
};

export type CombatIntentConfig = {
  packBiases?: PackBias[];
  statMapping?: CombatStatMapping;
  /** Optional resource profile for resource-aware AI scoring */
  resourceProfile?: CombatResourceProfile;
};

export type ScoringContext = {
  morale: number;
  will: number;
  hpRatio: number;
  enemies: EntityState[];
  allies: EntityState[];
  hasExit: boolean;
  bestExitScore: number;
  engagementState: {
    isEngaged: boolean;
    isProtected: boolean;
    isBackline: boolean;
    isIsolated: boolean;
  };
  allyDefeatedRecently: boolean;
  enemyDefeatedRecently: boolean;
  attackStat: number;
  precisionStat: number;
  dominantDimension: 'force' | 'precision' | 'composure';
  enemyCover: Map<string, number>;
  packBias: PackBias | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function contrib(factor: string, value: number, weight: number, delta: number): IntentScoreContribution {
  return { factor, value, weight, delta };
}

function entityHpRatio(e: EntityState): number {
  const hp = e.resources.hp ?? 0;
  const maxHp = e.resources.maxHp ?? hp ?? 30;
  return maxHp > 0 ? hp / maxHp : 0;
}

function buildContext(entity: EntityState, world: WorldState, config?: CombatIntentConfig): ScoringContext {
  const cognition = getCognition(world, entity.id);
  const zone = world.zones[entity.zoneId ?? world.locationId];
  const enemies: EntityState[] = [];
  const allies: EntityState[] = [];

  for (const e of Object.values(world.entities)) {
    if (e.id === entity.id) continue;
    if ((e.resources.hp ?? 0) <= 0) continue;
    const sameZone = (e.zoneId ?? world.locationId) === (entity.zoneId ?? world.locationId);
    if (!sameZone) continue;
    if (e.type === entity.type) {
      allies.push(e);
    } else {
      enemies.push(e);
    }
  }

  // Find first matching pack bias (explicit config > role tag > none).
  // Precedence: first matching config packBias tag wins.
  // If no config match, first role:* tag on the entity wins.
  // Multiple role tags: first in entity.tags order is used (deterministic).
  // Use validateEntityTags() from tag-taxonomy to detect multi-role conflicts.
  let packBias: PackBias | null = null;
  if (config?.packBiases) {
    for (const bias of config.packBiases) {
      if (entity.tags.includes(bias.tag)) {
        packBias = bias;
        break;
      }
    }
  }
  if (!packBias) {
    const roleTag = entity.tags.find(t => t.startsWith('role:'));
    if (roleTag) {
      const role = roleTag.slice(5) as CombatRole;
      const template = BUILTIN_COMBAT_ROLES[role];
      if (template) packBias = template.bias;
    }
  }

  const mapping = config?.statMapping ?? DEFAULT_STAT_MAPPING;

  // Evaluate best exit zone quality (non-chokepoint +5, has allies +5, no enemies +5)
  let bestExitScore = 0;
  if (zone?.neighbors) {
    for (const nid of zone.neighbors) {
      const nzone = world.zones[nid];
      let exitScore = 0;
      if (!nzone?.tags?.includes('chokepoint')) exitScore += 5;
      const nEntities = Object.values(world.entities).filter(
        e => e.zoneId === nid && (e.resources.hp ?? 0) > 0,
      );
      if (nEntities.some(e => e.type === entity.type)) exitScore += 5;
      if (!nEntities.some(e => e.type !== entity.type)) exitScore += 5;
      bestExitScore = Math.max(bestExitScore, exitScore);
    }
  }

  const attackStat = entity.stats[mapping.attack] ?? 5;
  const precisionStat = entity.stats[mapping.precision] ?? 5;
  const resolveStat = entity.stats[mapping.resolve] ?? 3;
  const dominantDimension: ScoringContext['dominantDimension'] =
    attackStat > precisionStat && attackStat > resolveStat ? 'force'
    : precisionStat > attackStat && precisionStat > resolveStat ? 'precision'
    : 'composure';

  // Estimate interception cover per enemy (how well-protected are they by allies?)
  const enemyCover = new Map<string, number>();
  for (const enemy of enemies) {
    let cover = 0;
    for (const e of Object.values(world.entities)) {
      if (e.id === enemy.id || e.id === entity.id) continue;
      if ((e.resources.hp ?? 0) <= 0) continue;
      if (e.type !== enemy.type) continue;
      if ((e.zoneId ?? world.locationId) !== (enemy.zoneId ?? world.locationId)) continue;
      if (hasStatus(e, COMBAT_STATES.FLEEING)) continue;
      let allyScore = 5;
      const roleTag = e.tags.find(t => t.startsWith('role:'));
      if (roleTag === 'role:bodyguard' || roleTag === 'role:sentinel') allyScore = 15;
      else if (roleTag === 'role:brute' || roleTag === 'role:elite') allyScore = 8;
      else if (roleTag === 'role:coward' || roleTag === 'role:backliner') allyScore = 2;
      cover += allyScore;
    }
    enemyCover.set(enemy.id, cover);
  }

  return {
    morale: cognition.morale,
    will: resolveStat,
    hpRatio: entityHpRatio(entity),
    enemies,
    allies,
    hasExit: (zone?.neighbors?.length ?? 0) > 0,
    bestExitScore,
    engagementState: {
      isEngaged: hasStatus(entity, ENGAGEMENT_STATES.ENGAGED),
      isProtected: hasStatus(entity, ENGAGEMENT_STATES.PROTECTED),
      isBackline: hasStatus(entity, ENGAGEMENT_STATES.BACKLINE),
      isIsolated: hasStatus(entity, ENGAGEMENT_STATES.ISOLATED),
    },
    allyDefeatedRecently: [...defeatLog.entries()].some(([, type]) => type === entity.type),
    enemyDefeatedRecently: [...defeatLog.entries()].some(([, type]) => type !== entity.type),
    attackStat,
    precisionStat,
    dominantDimension,
    enemyCover,
    packBias,
  };
}

function buildReason(contributions: IntentScoreContribution[]): string {
  const significant = contributions.filter(c => c.delta !== 0 && c.factor !== 'base');
  if (significant.length === 0) return 'base score';
  return significant.map(c => {
    const sign = c.delta > 0 ? '+' : '';
    return `${c.factor} ${sign}${Math.round(c.delta)}`;
  }).join(' + ');
}

// ---------------------------------------------------------------------------
// Scorers
// ---------------------------------------------------------------------------

function scoreAttack(entity: EntityState, ctx: ScoringContext): IntentScore[] {
  const scores: IntentScore[] = [];
  const biasMod = ctx.packBias?.modifiers.attack ?? 0;

  for (const enemy of ctx.enemies) {
    const c: IntentScoreContribution[] = [];
    let score = 50;
    c.push(contrib('base', 50, 1, 50));

    const moraleDelta = (ctx.morale - 50) * 0.3;
    if (moraleDelta !== 0) {
      score += moraleDelta;
      c.push(contrib('morale', ctx.morale, 0.3, moraleDelta));
    }

    const hpDelta = ctx.hpRatio * 10;
    score += hpDelta;
    c.push(contrib('hp', ctx.hpRatio, 10, hpDelta));

    if (hasStatus(enemy, COMBAT_STATES.EXPOSED)) {
      score += 15;
      c.push(contrib('exposed_target', 1, 15, 15));
    }
    if (hasStatus(enemy, COMBAT_STATES.GUARDED)) {
      score -= 10;
      c.push(contrib('guarded_target', 1, -10, -10));
    }
    if (hasStatus(enemy, COMBAT_STATES.FLEEING)) {
      score += 5;
      c.push(contrib('fleeing_target', 1, 5, 5));
    }
    if (hasStatus(enemy, COMBAT_STATES.OFF_BALANCE)) {
      score += 8;
      c.push(contrib('off_balance_target', 1, 8, 8));
    }

    const willDelta = Math.min(5, (ctx.will - 3) * 1.5);
    if (willDelta !== 0) {
      score += willDelta;
      c.push(contrib('will', ctx.will, 1.5, willDelta));
    }

    if (ctx.enemyDefeatedRecently) {
      score += 8;
      c.push(contrib('momentum', 1, 8, 8));
    }

    if (ctx.attackStat > 5) {
      const vigorDelta = Math.min(5, (ctx.attackStat - 5) * 3);
      score += vigorDelta;
      c.push(contrib('vigor_advantage', ctx.attackStat, 3, vigorDelta));
    }

    // Prefer targets with weaker interception cover
    const cover = ctx.enemyCover.get(enemy.id) ?? 0;
    if (cover > 0) {
      const coverPenalty = -Math.min(10, Math.floor(cover * 0.6));
      score += coverPenalty;
      c.push(contrib('interception_cover', cover, -0.6, coverPenalty));
    }

    if (biasMod !== 0) {
      score += biasMod;
      c.push(contrib(ctx.packBias!.name, biasMod, 1, biasMod));
    }

    score = clamp(score, 0, 100);

    scores.push({
      intent: 'attack',
      resolvedVerb: 'attack',
      targetId: enemy.id,
      score,
      contributions: c,
      reason: buildReason(c),
    });
  }
  return scores;
}

function scoreGuard(entity: EntityState, ctx: ScoringContext): IntentScore[] {
  const c: IntentScoreContribution[] = [];
  let score = 30;
  c.push(contrib('base', 30, 1, 30));
  const biasMod = ctx.packBias?.modifiers.guard ?? 0;

  if (ctx.hpRatio < 0.4) {
    const delta = (1 - ctx.hpRatio) * 30;
    score += delta;
    c.push(contrib('low_hp', ctx.hpRatio, 30, delta));
  }

  const guardThreshold = ctx.packBias?.moraleGuardThreshold ?? 60;
  if (ctx.morale > 30 && ctx.morale <= guardThreshold) {
    score += 15;
    c.push(contrib('moderate_morale', ctx.morale, 1, 15));
  }

  if (hasStatus(entity, COMBAT_STATES.EXPOSED)) {
    score += 20;
    c.push(contrib('exposed', 1, 20, 20));
  }
  if (hasStatus(entity, ENGAGEMENT_STATES.ENGAGED)) {
    score += 5;
    c.push(contrib('engaged', 1, 5, 5));
  }
  if (ctx.allies.length > 0) {
    score += 5;
    c.push(contrib('ally_present', ctx.allies.length, 5, 5));
  }

  const willDelta = Math.min(8, (ctx.will - 3) * 2);
  if (willDelta !== 0) {
    score += willDelta;
    c.push(contrib('will', ctx.will, 2, willDelta));
  }

  if (ctx.allyDefeatedRecently) {
    score += 8;
    c.push(contrib('ally_fallen', 1, 8, 8));
  }

  if (biasMod !== 0) {
    score += biasMod;
    c.push(contrib(ctx.packBias!.name, biasMod, 1, biasMod));
  }

  score = clamp(score, 0, 100);

  return [{
    intent: 'guard',
    resolvedVerb: 'guard',
    score,
    contributions: c,
    reason: buildReason(c),
  }];
}

function scoreDisengage(entity: EntityState, ctx: ScoringContext): IntentScore[] {
  const c: IntentScoreContribution[] = [];
  let score = 20;
  c.push(contrib('base', 20, 1, 20));
  const biasMod = ctx.packBias?.modifiers.disengage ?? 0;
  const fleeThreshold = ctx.packBias?.moraleFleeThreshold ?? 30;

  if (ctx.morale <= fleeThreshold) {
    const delta = (fleeThreshold - ctx.morale) * 2;
    score += delta;
    c.push(contrib('low_morale', ctx.morale, 2, delta));
  }

  if (ctx.hpRatio < 0.25) {
    score += 25;
    c.push(contrib('critical_hp', ctx.hpRatio, 1, 25));
  } else if (ctx.hpRatio < 0.4) {
    score += 10;
    c.push(contrib('low_hp', ctx.hpRatio, 1, 10));
  }

  if (ctx.allies.length === 0) {
    score += 10;
    c.push(contrib('no_allies', 0, 1, 10));
  }

  if (!ctx.hasExit) {
    score -= 100;
    c.push(contrib('no_exit', 0, 1, -100));
  }

  if (ctx.engagementState.isIsolated) {
    score += 10;
    c.push(contrib('isolated', 1, 10, 10));
  }

  if (ctx.bestExitScore > 0) {
    score += ctx.bestExitScore;
    c.push(contrib('exit_quality', ctx.bestExitScore, 1, ctx.bestExitScore));
  }

  if (ctx.allyDefeatedRecently) {
    score += 12;
    c.push(contrib('ally_fallen', 1, 12, 12));
  }

  const willPenalty = -Math.min(10, (ctx.will - 3) * 3);
  if (willPenalty !== 0) {
    score += willPenalty;
    c.push(contrib('will', ctx.will, -3, willPenalty));
  }

  if (biasMod !== 0) {
    score += biasMod;
    c.push(contrib(ctx.packBias!.name, biasMod, 1, biasMod));
  }

  score = clamp(score, 0, 100);

  return [{
    intent: 'disengage',
    resolvedVerb: 'disengage',
    score,
    contributions: c,
    reason: buildReason(c),
  }];
}

function scoreBrace(entity: EntityState, ctx: ScoringContext): IntentScore[] {
  const c: IntentScoreContribution[] = [];
  let score = 25;
  c.push(contrib('base', 25, 1, 25));
  const biasMod = ctx.packBias?.modifiers.brace ?? 0;

  // Brace is strong when holding ground under pressure
  if (ctx.engagementState.isEngaged) {
    score += 10;
    c.push(contrib('engaged', 1, 10, 10));
  }

  // Low HP encourages bracing to stabilize
  if (ctx.hpRatio < 0.5) {
    const delta = (1 - ctx.hpRatio) * 20;
    score += delta;
    c.push(contrib('low_hp', ctx.hpRatio, 20, delta));
  }

  // Off-balance strongly encourages brace (it clears off-balance)
  if (hasStatus(entity, COMBAT_STATES.OFF_BALANCE)) {
    score += 25;
    c.push(contrib('off_balance', 1, 25, 25));
  }

  // Exposed encourages brace to stabilize
  if (hasStatus(entity, COMBAT_STATES.EXPOSED)) {
    score += 15;
    c.push(contrib('exposed', 1, 15, 15));
  }

  // Chokepoint makes brace very attractive (holding ground)
  // Check via zone tags
  if (ctx.engagementState.isEngaged && ctx.allies.length > 0) {
    score += 8;
    c.push(contrib('protecting_allies', ctx.allies.length, 8, 8));
  }

  // Will boosts brace effectiveness
  const willDelta = Math.min(10, (ctx.will - 3) * 2.5);
  if (willDelta !== 0) {
    score += willDelta;
    c.push(contrib('will', ctx.will, 2.5, willDelta));
  }

  if (ctx.attackStat > 5) {
    const forceDelta = Math.min(5, (ctx.attackStat - 5) * 2);
    score += forceDelta;
    c.push(contrib('force_hold', ctx.attackStat, 2, forceDelta));
  }

  if (biasMod !== 0) {
    score += biasMod;
    c.push(contrib(ctx.packBias!.name, biasMod, 1, biasMod));
  }

  score = clamp(score, 0, 100);

  return [{
    intent: 'brace',
    resolvedVerb: 'brace',
    score,
    contributions: c,
    reason: buildReason(c),
  }];
}

function scoreReposition(entity: EntityState, ctx: ScoringContext): IntentScore[] {
  const scores: IntentScore[] = [];
  const biasMod = ctx.packBias?.modifiers.reposition ?? 0;

  // Reposition against specific targets
  for (const enemy of ctx.enemies) {
    const c: IntentScoreContribution[] = [];
    let score = 30;
    c.push(contrib('base', 30, 1, 30));

    // Guarded target is prime reposition target (outflank the guard)
    if (hasStatus(enemy, COMBAT_STATES.GUARDED)) {
      score += 20;
      c.push(contrib('guarded_target', 1, 20, 20));
    }

    // Off-balance self discourages reposition (risky while unstable)
    if (hasStatus(entity, COMBAT_STATES.OFF_BALANCE)) {
      score -= 15;
      c.push(contrib('self_off_balance', 1, -15, -15));
    }

    // High morale encourages aggressive repositioning
    if (ctx.morale > 60) {
      score += 10;
      c.push(contrib('confident', ctx.morale, 1, 10));
    }

    // Not engaged = free to maneuver
    if (!ctx.engagementState.isEngaged) {
      score += 10;
      c.push(contrib('free_to_maneuver', 1, 10, 10));
    }

    // Backline target is worth repositioning toward
    if (hasStatus(enemy, ENGAGEMENT_STATES.BACKLINE)) {
      score += 15;
      c.push(contrib('backline_target', 1, 15, 15));
    }

    // HP ratio: healthy = more willing to reposition
    if (ctx.hpRatio > 0.6) {
      score += 5;
      c.push(contrib('healthy', ctx.hpRatio, 5, 5));
    }

    if (ctx.precisionStat > 5) {
      const precDelta = Math.min(5, (ctx.precisionStat - 5) * 3);
      score += precDelta;
      c.push(contrib('precision_advantage', ctx.precisionStat, 3, precDelta));
    }

    if (biasMod !== 0) {
      score += biasMod;
      c.push(contrib(ctx.packBias!.name, biasMod, 1, biasMod));
    }

    score = clamp(score, 0, 100);

    scores.push({
      intent: 'reposition',
      resolvedVerb: 'reposition',
      targetId: enemy.id,
      score,
      contributions: c,
      reason: buildReason(c),
    });
  }

  // Untargeted reposition (for positional recovery when exposed/off-balance)
  if (hasStatus(entity, COMBAT_STATES.EXPOSED) || hasStatus(entity, COMBAT_STATES.OFF_BALANCE)) {
    const c: IntentScoreContribution[] = [];
    let score = 35;
    c.push(contrib('base', 35, 1, 35));
    if (hasStatus(entity, COMBAT_STATES.EXPOSED)) {
      score += 15;
      c.push(contrib('self_exposed', 1, 15, 15));
    }
    if (hasStatus(entity, COMBAT_STATES.OFF_BALANCE)) {
      score += 10;
      c.push(contrib('self_off_balance', 1, 10, 10));
    }
    if (biasMod !== 0) {
      score += biasMod;
      c.push(contrib(ctx.packBias!.name, biasMod, 1, biasMod));
    }
    score = clamp(score, 0, 100);
    scores.push({
      intent: 'reposition',
      resolvedVerb: 'reposition',
      score,
      contributions: c,
      reason: buildReason(c),
    });
  }

  return scores;
}

function scorePressure(_entity: EntityState, ctx: ScoringContext): IntentScore[] {
  const scores: IntentScore[] = [];
  const biasMod = ctx.packBias?.modifiers.pressure ?? 0;

  for (const enemy of ctx.enemies) {
    if (!hasStatus(enemy, ENGAGEMENT_STATES.BACKLINE)) continue;

    const c: IntentScoreContribution[] = [];
    let score = 40;
    c.push(contrib('base', 40, 1, 40));
    c.push(contrib('backline_target', 1, 15, 15));
    score += 15;

    if (ctx.morale > 60) {
      score += 10;
      c.push(contrib('confident', ctx.morale, 1, 10));
    }

    if (!ctx.engagementState.isEngaged) {
      score += 10;
      c.push(contrib('free_to_maneuver', 1, 10, 10));
    }

    if (ctx.allies.length > 0) {
      score += 5;
      c.push(contrib('ally_present', ctx.allies.length, 5, 5));
    }

    if (ctx.attackStat > 5) {
      const forceDelta = Math.min(5, (ctx.attackStat - 5) * 2);
      score += forceDelta;
      c.push(contrib('force_pressure', ctx.attackStat, 2, forceDelta));
    }

    if (biasMod !== 0) {
      score += biasMod;
      c.push(contrib(ctx.packBias!.name, biasMod, 1, biasMod));
    }

    score = clamp(score, 0, 100);

    scores.push({
      intent: 'pressure',
      resolvedVerb: 'attack',
      targetId: enemy.id,
      score,
      contributions: c,
      reason: buildReason(c),
    });
  }
  return scores;
}

function scoreProtect(_entity: EntityState, ctx: ScoringContext): IntentScore[] {
  const scores: IntentScore[] = [];
  const biasMod = ctx.packBias?.modifiers.protect ?? 0;

  for (const ally of ctx.allies) {
    const allyHpRatio = entityHpRatio(ally);
    if (allyHpRatio >= 0.4) continue;

    const c: IntentScoreContribution[] = [];
    let score = 35;
    c.push(contrib('base', 35, 1, 35));

    const dangerDelta = (1 - allyHpRatio) * 20;
    score += dangerDelta;
    c.push(contrib('ally_danger', allyHpRatio, 20, dangerDelta));

    if (ctx.hpRatio > 0.6) {
      score += 10;
      c.push(contrib('self_healthy', ctx.hpRatio, 1, 10));
    }

    if (ctx.morale > 40) {
      score += 10;
      c.push(contrib('morale_stable', ctx.morale, 1, 10));
    }

    const willDelta = Math.min(8, (ctx.will - 3) * 2);
    if (willDelta !== 0) {
      score += willDelta;
      c.push(contrib('will', ctx.will, 2, willDelta));
    }

    if (biasMod !== 0) {
      score += biasMod;
      c.push(contrib(ctx.packBias!.name, biasMod, 1, biasMod));
    }

    score = clamp(score, 0, 100);

    scores.push({
      intent: 'protect',
      resolvedVerb: 'guard',
      targetId: ally.id,
      score,
      contributions: c,
      reason: buildReason(c),
    });
  }
  return scores;
}

function scoreFinish(_entity: EntityState, ctx: ScoringContext): IntentScore[] {
  const scores: IntentScore[] = [];
  const biasMod = ctx.packBias?.modifiers.finish ?? 0;

  for (const enemy of ctx.enemies) {
    const isFleeing = hasStatus(enemy, COMBAT_STATES.FLEEING);
    const isExposed = hasStatus(enemy, COMBAT_STATES.EXPOSED);
    const eHpRatio = entityHpRatio(enemy);
    if (!isFleeing && !(isExposed && eHpRatio < 0.3)) continue;

    const c: IntentScoreContribution[] = [];
    let score = 55;
    c.push(contrib('base', 55, 1, 55));

    if (isFleeing) {
      score += 20;
      c.push(contrib('target_fleeing', 1, 20, 20));
    }
    if (isExposed) {
      score += 10;
      c.push(contrib('target_exposed', 1, 10, 10));
    }
    if (eHpRatio < 0.3) {
      score += 15;
      c.push(contrib('target_low_hp', eHpRatio, 15, 15));
    }
    if (ctx.morale > 40) {
      score += 5;
      c.push(contrib('morale', ctx.morale, 1, 5));
    }

    if (ctx.enemyDefeatedRecently) {
      score += 10;
      c.push(contrib('momentum', 1, 10, 10));
    }

    if (biasMod !== 0) {
      score += biasMod;
      c.push(contrib(ctx.packBias!.name, biasMod, 1, biasMod));
    }

    score = clamp(score, 0, 100);

    scores.push({
      intent: 'finish',
      resolvedVerb: 'attack',
      targetId: enemy.id,
      score,
      contributions: c,
      reason: buildReason(c),
    });
  }
  return scores;
}

// ---------------------------------------------------------------------------
// Core function
// ---------------------------------------------------------------------------

export function selectNpcCombatAction(
  entity: EntityState,
  world: WorldState,
  config?: CombatIntentConfig,
): CombatDecision {
  const ctx = buildContext(entity, world, config);

  const allScores: IntentScore[] = [
    ...scoreAttack(entity, ctx),
    ...scoreGuard(entity, ctx),
    ...scoreBrace(entity, ctx),
    ...scoreDisengage(entity, ctx),
    ...scoreReposition(entity, ctx),
    ...scorePressure(entity, ctx),
    ...scoreProtect(entity, ctx),
    ...scoreFinish(entity, ctx),
  ];

  // Resource-aware scoring pass (additive — no profile = no change)
  if (config?.resourceProfile) {
    applyResourceIntentModifiers(config.resourceProfile, entity, allScores);
  }

  // Sort descending by score
  allScores.sort((a, b) => b.score - a.score);

  const chosen = allScores[0] ?? {
    intent: 'guard' as CombatIntentType,
    resolvedVerb: 'guard' as const,
    score: 0,
    contributions: [],
    reason: 'no valid options',
  };

  return {
    entityId: entity.id,
    entityName: entity.name,
    tick: world.meta.tick,
    chosen,
    alternatives: allScores.slice(1),
    packBias: ctx.packBias?.name,
  };
}

// ---------------------------------------------------------------------------
// Built-in pack biases
// ---------------------------------------------------------------------------

export const BUILTIN_PACK_BIASES: PackBias[] = [
  {
    tag: 'assassin',
    name: 'assassin-precision',
    modifiers: { finish: 20, pressure: 10, guard: -10, disengage: 10, attack: 5, reposition: 15, brace: -15 },
  },
  {
    tag: 'samurai',
    name: 'samurai-discipline',
    modifiers: { guard: 15, protect: 10, attack: 5, disengage: -10, brace: 15, reposition: -5 },
    moraleFleeThreshold: 15,
  },
  {
    tag: 'feral',
    name: 'feral-berserk',
    modifiers: { attack: 20, finish: 15, guard: -20, disengage: -15, protect: -15, brace: -20, reposition: 5 },
    moraleFleeThreshold: 5,
  },
  {
    tag: 'beast',
    name: 'beast-predator',
    modifiers: { attack: 15, finish: 10, guard: -15, protect: -10, brace: -10, reposition: 10 },
  },
  {
    tag: 'pirate',
    name: 'pirate-swarm',
    modifiers: { attack: 10, pressure: 15, finish: 10, protect: -5, disengage: -5, reposition: 10, brace: -5 },
  },
  {
    tag: 'colonial',
    name: 'colonial-disciplined',
    modifiers: { guard: 10, protect: 10, disengage: 5, brace: 15, reposition: -5 },
  },
  {
    tag: 'vampire',
    name: 'vampire-aggression',
    modifiers: { attack: 15, finish: 15, guard: -10, disengage: -10, pressure: 5, reposition: 10, brace: -10 },
    moraleFleeThreshold: 15,
  },
  {
    tag: 'hunter',
    name: 'hunter-methodical',
    modifiers: { guard: 5, attack: 5, finish: 10, reposition: 10, brace: 5 },
  },
  {
    tag: 'ice-agent',
    name: 'cyberpunk-protocol',
    modifiers: { pressure: 20, finish: 10, guard: -5, reposition: 10, brace: 5 },
  },
  {
    tag: 'zombie',
    name: 'zombie-mindless',
    modifiers: { attack: 25, guard: -25, disengage: -25, protect: -20, brace: -20, reposition: -15 },
    moraleFleeThreshold: 0,
  },
  {
    tag: 'undead',
    name: 'undead-relentless',
    modifiers: { attack: 15, disengage: -20, guard: -10, brace: -5, reposition: -10 },
    moraleFleeThreshold: 5,
  },
  {
    tag: 'criminal',
    name: 'criminal-coward',
    modifiers: { disengage: 15, attack: -5, guard: 5, reposition: 10, brace: -5 },
    moraleFleeThreshold: 45,
  },
  {
    tag: 'drone',
    name: 'drone-programmed',
    modifiers: { attack: 10, guard: 5, disengage: -20, protect: -10, brace: 10, reposition: -10 },
    moraleFleeThreshold: 10,
  },
  {
    tag: 'alien',
    name: 'alien-enigmatic',
    modifiers: { pressure: 10, guard: 10, disengage: 5, reposition: 10, brace: 5 },
  },
  {
    tag: 'spirit',
    name: 'spirit-ethereal',
    modifiers: { attack: 10, pressure: 10, guard: -5, disengage: 10, reposition: 15, brace: -15 },
  },
];

// ---------------------------------------------------------------------------
// Event emission helper
// ---------------------------------------------------------------------------

export function emitDecisionEvent(
  ctx: { emit: (event: { id: string; type: string; tick: number; actorId: string; payload: Record<string, unknown>; visibility: string }) => void },
  decision: CombatDecision,
): void {
  ctx.emit({
    id: nextId('evt'),
    type: 'combat.ai.decision',
    tick: decision.tick,
    actorId: decision.entityId,
    payload: { decision },
    visibility: 'hidden',
  });
}

// ---------------------------------------------------------------------------
// Module factory
// ---------------------------------------------------------------------------

export function createCombatIntent(_config?: CombatIntentConfig): EngineModule {
  const decisions: CombatDecision[] = [];
  const maxDecisions = 50;

  return {
    id: 'combat-intent',
    version: '1.0.0',

    register(ctx) {
      ctx.persistence.registerNamespace('combat-intent', {
        recentDecisions: [] as CombatDecision[],
      });

      // Track defeats for AI scoring context
      ctx.events.on('tick.start', () => defeatLog.clear());
      ctx.events.on('combat.entity.defeated', (event, world) => {
        const defeatedId = event.payload.entityId as string;
        const defeated = world.entities[defeatedId];
        if (defeated) defeatLog.set(defeatedId, defeated.type);
      });

      // Listen for combat.ai.decision events to populate ring buffer
      ctx.events.on('combat.ai.decision', (event) => {
        const decision = event.payload.decision as CombatDecision;
        decisions.push(decision);
        if (decisions.length > maxDecisions) {
          decisions.splice(0, decisions.length - maxDecisions);
        }
      });

      ctx.debug.registerInspector({
        id: 'combat-intent',
        label: 'AI Combat Decisions',
        inspect: () => ({
          count: decisions.length,
          recent: decisions.slice(-10),
        }),
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Text formatter
// ---------------------------------------------------------------------------

export function formatCombatDecision(decision: CombatDecision): string {
  const lines: string[] = [];
  lines.push(`--- AI Decision [tick ${decision.tick}] ---`);
  lines.push(`${decision.entityName} → ${decision.chosen.intent}`);
  if (decision.packBias) {
    lines.push(`Pack bias: ${decision.packBias}`);
  }
  lines.push(`Score: ${Math.round(decision.chosen.score)}`);

  for (const c of decision.chosen.contributions) {
    const sign = c.delta >= 0 ? '+' : '';
    if (c.factor === 'base') {
      lines.push(`  base                             = ${Math.round(c.delta)}`);
    } else {
      const label = `${c.factor} (${typeof c.value === 'number' ? (c.value % 1 === 0 ? c.value : c.value.toFixed(2)) : c.value})`;
      lines.push(`  ${label.padEnd(35)} ${sign}${Math.round(c.delta)}`);
    }
  }

  // Alternatives
  const altParts = decision.alternatives
    .reduce<{ intent: string; score: number }[]>((acc, s) => {
      if (!acc.find(a => a.intent === s.intent)) {
        acc.push({ intent: s.intent, score: s.score });
      }
      return acc;
    }, [])
    .slice(0, 5)
    .map(a => `${a.intent} ${Math.round(a.score)}`);
  if (altParts.length > 0) {
    lines.push(`Alternatives: ${altParts.join(' | ')}`);
  }

  lines.push(`Summary: ${decision.chosen.reason} → ${decision.chosen.intent} score highest`);
  return lines.join('\n');
}
