/**
 * Ability Intent — AI ability decision scoring with explainability.
 *
 * Pure advisory: scores available abilities for an NPC entity,
 * produces a comparable decision to CombatDecision.
 * Never auto-submits actions.
 */

import type {
  EntityState,
  WorldState,
} from '@ai-rpg-engine/core';
import type { AbilityDefinition } from '@ai-rpg-engine/content-schema';
import {
  isAbilityReady,
} from './ability-core.js';
import { checkResistance, getStatusTags } from './status-semantics.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AbilityScoreContribution = {
  factor: string;
  value: number;
  weight: number;
  delta: number;
};

export type AbilityScore = {
  abilityId: string;
  abilityName: string;
  resolvedVerb: 'use-ability';
  targetId?: string;
  score: number;
  contributions: AbilityScoreContribution[];
  reason: string;
};

export type AbilityDecision = {
  entityId: string;
  entityName: string;
  tick: number;
  chosen: AbilityScore | null;
  alternatives: AbilityScore[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function contrib(factor: string, value: number, weight: number, delta: number): AbilityScoreContribution {
  return { factor, value, weight, delta };
}

function entityHpRatio(e: EntityState): number {
  const hp = e.resources.hp ?? 0;
  const maxHp = e.stats.maxHp ?? hp ?? 30;
  return maxHp > 0 ? hp / maxHp : 0;
}

function buildReason(contributions: AbilityScoreContribution[]): string {
  const significant = contributions.filter(c => c.delta !== 0 && c.factor !== 'base');
  if (significant.length === 0) return 'base score';
  return significant.map(c => {
    const sign = c.delta > 0 ? '+' : '';
    return `${c.factor} ${sign}${Math.round(c.delta)}`;
  }).join(' + ');
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function hasTag(tags: string[], tag: string): boolean {
  return tags.includes(tag);
}

/** Check if an ability applies any statuses and how the target resists them */
function getStatusResistancePenalty(
  ability: AbilityDefinition,
  target: EntityState,
): { penalty: number; reason: string } {
  if (!target.resistances) return { penalty: 0, reason: '' };

  const statusEffects = ability.effects.filter((e) => e.type === 'apply-status');
  if (statusEffects.length === 0) return { penalty: 0, reason: '' };

  let totalImmune = 0;
  let totalResisted = 0;
  let totalVulnerable = 0;

  for (const effect of statusEffects) {
    const statusId = effect.params.statusId as string;
    const resistance = checkResistance(target, statusId);
    if (resistance === 'immune') totalImmune++;
    else if (resistance === 'resistant') totalResisted++;
    else if (resistance === 'vulnerable') totalVulnerable++;
  }

  // If ALL status effects are immune → large penalty
  if (totalImmune === statusEffects.length) {
    return { penalty: -30, reason: 'all_statuses_immune' };
  }
  // If any immune or resisted → moderate penalty
  if (totalImmune > 0 || totalResisted > 0) {
    return { penalty: -15, reason: 'status_resisted' };
  }
  // If any vulnerable → bonus
  if (totalVulnerable > 0) {
    return { penalty: 10, reason: 'status_vulnerable' };
  }
  return { penalty: 0, reason: '' };
}

/** Check if a cleanse ability has value for the entity (self-targeted remove-status-by-tag) */
function getCleanseValue(
  ability: AbilityDefinition,
  entity: EntityState,
): number {
  const cleanseEffects = ability.effects.filter((e) => e.type === 'remove-status-by-tag');
  if (cleanseEffects.length === 0) return 0;

  let matchingDebuffs = 0;
  for (const effect of cleanseEffects) {
    const tagsParam = (effect.params.tags as string) ?? (effect.params.tag as string) ?? '';
    const cleanseTags = tagsParam.split(',').map((t) => t.trim()).filter((t) => t.length > 0);
    const tagSet = new Set(cleanseTags);

    for (const status of entity.statuses) {
      const statusTags = getStatusTags(status.statusId);
      if (statusTags.some((t) => tagSet.has(t))) {
        matchingDebuffs++;
      }
    }
  }

  // Bonus scales with number of matching debuffs
  return matchingDebuffs > 0 ? Math.min(30, matchingDebuffs * 15) : 0;
}

/**
 * Score a single ability for a given entity against potential targets.
 * Returns one AbilityScore per valid target (or one for self-targeted abilities).
 */
export function scoreAbilityUse(
  entity: EntityState,
  ability: AbilityDefinition,
  world: WorldState,
): AbilityScore[] {
  const scores: AbilityScore[] = [];
  const hpRatio = entityHpRatio(entity);

  // --- Determine targets based on ability type ---
  if (ability.target.type === 'self' || ability.target.type === 'none') {
    const c: AbilityScoreContribution[] = [];
    let score = 40;
    c.push(contrib('base', 40, 1, 40));

    // Healing abilities are more valuable at low HP
    if (hasTag(ability.tags, 'support') || hasTag(ability.tags, 'heal')) {
      if (hpRatio < 0.5) {
        const healBonus = (1 - hpRatio) * 40;
        score += healBonus;
        c.push(contrib('low_hp_heal', hpRatio, 40, healBonus));
      }
    }

    // Buff abilities
    if (hasTag(ability.tags, 'buff')) {
      score += 10;
      c.push(contrib('buff', 1, 10, 10));
    }

    // Cleanse abilities value when entity has matching debuffs
    const cleanseBonus = getCleanseValue(ability, entity);
    if (cleanseBonus > 0) {
      score += cleanseBonus;
      c.push(contrib('cleanse_value', entity.statuses.length, 15, cleanseBonus));
    }

    score = clamp(score, 0, 100);

    scores.push({
      abilityId: ability.id,
      abilityName: ability.name,
      resolvedVerb: 'use-ability',
      score,
      contributions: c,
      reason: buildReason(c),
    });
    return scores;
  }

  // --- Combat / target abilities ---
  const enemies = Object.values(world.entities).filter(
    (e) => e.id !== entity.id &&
    e.zoneId === entity.zoneId &&
    (e.resources.hp ?? 0) > 0 &&
    e.type !== entity.type,
  );

  if (ability.target.type === 'all-enemies') {
    if (enemies.length === 0) return [];

    const c: AbilityScoreContribution[] = [];
    let score = 45;
    c.push(contrib('base', 45, 1, 45));

    // AoE is better with more targets
    const aoeDelta = Math.min(20, enemies.length * 8);
    score += aoeDelta;
    c.push(contrib('aoe_targets', enemies.length, 8, aoeDelta));

    // Combat abilities prefer being aggressive when healthy
    if (hpRatio > 0.6 && hasTag(ability.tags, 'combat')) {
      score += 10;
      c.push(contrib('healthy_aggression', hpRatio, 10, 10));
    }

    // AoE resistance: average penalty across all enemies
    const aoeResistances = enemies.map((e) => getStatusResistancePenalty(ability, e));
    const avgPenalty = aoeResistances.reduce((sum, r) => sum + r.penalty, 0) / enemies.length;
    if (avgPenalty !== 0) {
      score += avgPenalty;
      c.push(contrib('resistance_avg', avgPenalty, 1, avgPenalty));
    }

    score = clamp(score, 0, 100);

    scores.push({
      abilityId: ability.id,
      abilityName: ability.name,
      resolvedVerb: 'use-ability',
      score,
      contributions: c,
      reason: buildReason(c),
    });
    return scores;
  }

  // Single-target
  for (const enemy of enemies) {
    // Apply target filter if ability has one
    if (ability.target.filter && ability.target.filter.length > 0) {
      const matchesFilter = ability.target.filter.some((f) => enemy.tags.includes(f));
      if (!matchesFilter) continue;
    }

    const c: AbilityScoreContribution[] = [];
    let score = 45;
    c.push(contrib('base', 45, 1, 45));

    const enemyHpRatio = entityHpRatio(enemy);

    // Prioritize low-HP targets (finish them off)
    if (enemyHpRatio < 0.3) {
      score += 20;
      c.push(contrib('target_low_hp', enemyHpRatio, 20, 20));
    } else if (enemyHpRatio < 0.5) {
      score += 10;
      c.push(contrib('target_wounded', enemyHpRatio, 10, 10));
    }

    // Debuff abilities value targets that aren't already debuffed
    if (hasTag(ability.tags, 'debuff')) {
      const hasDebuff = enemy.statuses.length > 0;
      if (!hasDebuff) {
        score += 10;
        c.push(contrib('no_debuffs', 0, 10, 10));
      }
    }

    // Combat abilities prefer being aggressive when healthy
    if (hpRatio > 0.6 && hasTag(ability.tags, 'combat')) {
      score += 10;
      c.push(contrib('healthy_aggression', hpRatio, 10, 10));
    }

    // Resistance penalty — penalize abilities whose status effects the target resists
    const { penalty: resPenalty, reason: resReason } = getStatusResistancePenalty(ability, enemy);
    if (resPenalty !== 0) {
      score += resPenalty;
      c.push(contrib(resReason, resPenalty, 1, resPenalty));
    }

    // Resource budget — prefer abilities that cost less when low on resources
    if (ability.costs && ability.costs.length > 0) {
      const totalCostRatio = ability.costs.reduce((sum, cost) => {
        const current = entity.resources[cost.resourceId] ?? 0;
        const max = entity.stats[`max${cost.resourceId.charAt(0).toUpperCase()}${cost.resourceId.slice(1)}`] ?? current;
        return sum + (max > 0 ? cost.amount / max : 1);
      }, 0) / ability.costs.length;

      if (totalCostRatio > 0.5) {
        const costPenalty = -(totalCostRatio - 0.5) * 20;
        score += costPenalty;
        c.push(contrib('expensive', totalCostRatio, -20, costPenalty));
      }
    }

    score = clamp(score, 0, 100);

    scores.push({
      abilityId: ability.id,
      abilityName: ability.name,
      resolvedVerb: 'use-ability',
      targetId: enemy.id,
      score,
      contributions: c,
      reason: buildReason(c),
    });
  }

  return scores;
}

/**
 * Select the best ability action for an NPC.
 * Returns null if no abilities are available.
 * The returned AbilityDecision is comparable with CombatDecision.
 */
export function selectNpcAbilityAction(
  entity: EntityState,
  world: WorldState,
  abilities: AbilityDefinition[],
): AbilityDecision {
  const allScores: AbilityScore[] = [];

  for (const ability of abilities) {
    if (!isAbilityReady(world, entity.id, ability.id, abilities)) continue;
    allScores.push(...scoreAbilityUse(entity, ability, world));
  }

  // Sort descending by score
  allScores.sort((a, b) => b.score - a.score);

  return {
    entityId: entity.id,
    entityName: entity.name,
    tick: world.meta.tick,
    chosen: allScores[0] ?? null,
    alternatives: allScores.slice(1),
  };
}

// ---------------------------------------------------------------------------
// Text formatter
// ---------------------------------------------------------------------------

export function formatAbilityDecision(decision: AbilityDecision): string {
  const lines: string[] = [];
  lines.push(`--- AI Ability Decision [tick ${decision.tick}] ---`);

  if (!decision.chosen) {
    lines.push(`${decision.entityName} — no abilities available`);
    return lines.join('\n');
  }

  lines.push(`${decision.entityName} → ${decision.chosen.abilityName}`);
  if (decision.chosen.targetId) {
    lines.push(`Target: ${decision.chosen.targetId}`);
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

  // Alternatives (deduplicated by ability)
  const altParts = decision.alternatives
    .reduce<{ abilityName: string; score: number }[]>((acc, s) => {
      if (!acc.find(a => a.abilityName === s.abilityName)) {
        acc.push({ abilityName: s.abilityName, score: s.score });
      }
      return acc;
    }, [])
    .slice(0, 5)
    .map(a => `${a.abilityName} ${Math.round(a.score)}`);
  if (altParts.length > 0) {
    lines.push(`Alternatives: ${altParts.join(' | ')}`);
  }

  lines.push(`Summary: ${decision.chosen.reason} → ${decision.chosen.abilityName} score highest`);
  return lines.join('\n');
}
