/**
 * Unified Decision — merges combat intent and ability intent into one action.
 *
 * Solves finding F6 (MEDIUM): no unified decision layer. Both
 * `selectNpcCombatAction` and `selectNpcAbilityAction` are independent
 * advisors. This module calls both, compares top scores with a
 * configurable advantage threshold, and returns one winner.
 *
 * Design goals:
 * - Abilities must not erase the tactical triangle
 * - Basic combat remains competitive when abilities are available
 * - Cooldowns, costs, and readiness are already enforced upstream
 * - The merge layer adds a small threshold so abilities must clearly
 *   outperform combat to be chosen (prevents marginal ability spam)
 */

import type { EntityState, WorldState } from '@ai-rpg-engine/core';
import type { AbilityDefinition } from '@ai-rpg-engine/content-schema';
import type { CombatDecision, IntentScore, CombatIntentConfig } from './combat-intent.js';
import type { AbilityDecision, AbilityScore } from './ability-intent.js';
import { selectNpcCombatAction } from './combat-intent.js';
import { selectNpcAbilityAction } from './ability-intent.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UnifiedActionSource = 'combat' | 'ability';

export type UnifiedAction = {
  source: UnifiedActionSource;
  /** The verb to submit (e.g., 'attack', 'guard', 'use-ability') */
  verb: string;
  /** Target entity ID, if applicable */
  targetId?: string;
  /** Winning score (from the chosen advisor) */
  score: number;
  /** Ability ID, if source is 'ability' */
  abilityId?: string;
  /** Human-readable reason for the choice */
  reason: string;
};

export type UnifiedDecision = {
  entityId: string;
  entityName: string;
  tick: number;
  /** The chosen action */
  chosen: UnifiedAction;
  /** The runner-up from the other advisor (null if that advisor had no option) */
  runnerUp: UnifiedAction | null;
  /** Full combat decision (for inspection/debugging) */
  combatDecision: CombatDecision;
  /** Full ability decision (for inspection/debugging) */
  abilityDecision: AbilityDecision;
  /** Margin by which the winner beat the runner-up */
  margin: number;
};

export type UnifiedDecisionConfig = {
  /** Combat intent config (stat mapping, pack biases, resource profile) */
  combatConfig?: CombatIntentConfig;

  /**
   * Minimum score advantage an ability must have over the best combat
   * action to be chosen. Default: 5.
   *
   * Set to 0 for pure score comparison. Higher values make combat
   * stickier and abilities rarer. Recommended range: 0–15.
   */
  abilityAdvantageThreshold?: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function combatActionToUnified(score: IntentScore): UnifiedAction {
  return {
    source: 'combat',
    verb: score.resolvedVerb,
    targetId: score.targetId,
    score: score.score,
    reason: `${score.intent}: ${score.reason}`,
  };
}

function abilityActionToUnified(score: AbilityScore): UnifiedAction {
  return {
    source: 'ability',
    verb: score.resolvedVerb,
    targetId: score.targetId,
    score: score.score,
    abilityId: score.abilityId,
    reason: `${score.abilityName}: ${score.reason}`,
  };
}

// ---------------------------------------------------------------------------
// Core function
// ---------------------------------------------------------------------------

/**
 * Select the best action for an NPC by consulting both the combat intent
 * advisor and the ability intent advisor, then comparing their top scores.
 *
 * The ability must outscore combat by at least `abilityAdvantageThreshold`
 * points to be chosen. This ensures basic actions (attack, guard, brace,
 * reposition, disengage) remain competitive and abilities don't dominate
 * by marginal score differences.
 *
 * @param entity     The NPC entity making a decision
 * @param world      Current world state
 * @param abilities  Ability definitions available to this entity
 * @param config     Optional configuration (combat config, threshold)
 * @returns          A unified decision with the winning action
 */
export function selectBestAction(
  entity: EntityState,
  world: WorldState,
  abilities: AbilityDefinition[],
  config?: UnifiedDecisionConfig,
): UnifiedDecision {
  const threshold = config?.abilityAdvantageThreshold ?? 5;

  // Consult both advisors
  const combatDecision = selectNpcCombatAction(entity, world, config?.combatConfig);
  const abilityDecision = selectNpcAbilityAction(entity, world, abilities);

  const combatTop = combatDecision.chosen;
  const abilityTop = abilityDecision.chosen;

  const combatAction = combatActionToUnified(combatTop);

  // No ability available → combat wins by default
  if (!abilityTop) {
    return {
      entityId: entity.id,
      entityName: entity.name,
      tick: world.meta.tick,
      chosen: combatAction,
      runnerUp: null,
      combatDecision,
      abilityDecision,
      margin: combatAction.score,
    };
  }

  const abilityAction = abilityActionToUnified(abilityTop);

  // Ability must beat combat by threshold to win
  const abilityWins = abilityTop.score > combatTop.score + threshold;
  const margin = Math.abs(abilityTop.score - combatTop.score);

  if (abilityWins) {
    return {
      entityId: entity.id,
      entityName: entity.name,
      tick: world.meta.tick,
      chosen: abilityAction,
      runnerUp: combatAction,
      combatDecision,
      abilityDecision,
      margin,
    };
  }

  return {
    entityId: entity.id,
    entityName: entity.name,
    tick: world.meta.tick,
    chosen: combatAction,
    runnerUp: abilityAction,
    combatDecision,
    abilityDecision,
    margin,
  };
}

// ---------------------------------------------------------------------------
// Text formatter
// ---------------------------------------------------------------------------

export function formatUnifiedDecision(decision: UnifiedDecision): string {
  const lines: string[] = [];
  lines.push(`--- Unified AI Decision [tick ${decision.tick}] ---`);
  lines.push(`${decision.entityName} → ${decision.chosen.source}:${decision.chosen.verb}`);

  if (decision.chosen.abilityId) {
    lines.push(`Ability: ${decision.chosen.abilityId}`);
  }
  if (decision.chosen.targetId) {
    lines.push(`Target: ${decision.chosen.targetId}`);
  }

  lines.push(`Score: ${Math.round(decision.chosen.score)}`);
  lines.push(`Reason: ${decision.chosen.reason}`);

  if (decision.runnerUp) {
    lines.push(
      `Runner-up: ${decision.runnerUp.source}:${decision.runnerUp.verb} ` +
      `(score ${Math.round(decision.runnerUp.score)}, margin ${Math.round(decision.margin)})`,
    );
  }

  return lines.join('\n');
}
