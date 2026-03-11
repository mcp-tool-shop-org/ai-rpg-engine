// combat-builders — DX helpers for pack authors
//
// Eliminates boilerplate when setting up combat for a starter world.
// Pack authors provide stat names and a resource profile; the builder
// returns wrapped formulas and the combat module list.

import type { EngineModule } from '@ai-rpg-engine/core';
import type { CombatFormulas, CombatStatMapping } from './combat-core.js';
import type { CombatResourceProfile } from './combat-resources.js';
import type { EngagementConfig } from './engagement-core.js';
import type { PackBias, CombatIntentConfig } from './combat-intent.js';
import type { CombatRecoveryConfig } from './combat-recovery.js';
import { DEFAULT_STAT_MAPPING } from './combat-core.js';
import { createCombatCore } from './combat-core.js';
import { createCombatReview } from './combat-review.js';
import { createEngagementCore, withEngagement } from './engagement-core.js';
import { createCombatTactics, type CombatTacticsConfig } from './combat-tactics.js';
import { createCombatResources, withCombatResources, buildTacticalHooks } from './combat-resources.js';
import { createCombatIntent, BUILTIN_PACK_BIASES } from './combat-intent.js';
import { createCombatRecovery } from './combat-recovery.js';
import { createCombatStateNarration } from './combat-state-narration.js';
import { createCognitionCore } from './cognition-core.js';

// ---------------------------------------------------------------------------
// buildCombatFormulas — eliminates the 20-line formula copy-paste
// ---------------------------------------------------------------------------

/**
 * Build standard CombatFormulas from a stat mapping.
 *
 * All 10 starter worlds use the same formula logic:
 * - hitChance: 50 + precision×5 − target.precision×3 (clamped 5–95)
 * - damage: attacker's attack stat (min 1)
 * - guardReduction: 0.5 + (resolve − 3)×0.03 (clamped 0–0.75)
 * - disengageChance: 40 + precision×5 + resolve×2 (clamped 15–90)
 *
 * Pack authors who need custom formulas can spread the result and override:
 * ```
 * const formulas = { ...buildCombatFormulas(mapping), damage: myCustomDamage };
 * ```
 */
export function buildCombatFormulas(mapping: CombatStatMapping): CombatFormulas {
  return {
    statMapping: mapping,
    hitChance: (attacker, target) => {
      const atkPrec = attacker.stats[mapping.precision] ?? 5;
      const tgtPrec = target.stats[mapping.precision] ?? 5;
      return Math.min(95, Math.max(5, 50 + atkPrec * 5 - tgtPrec * 3));
    },
    damage: (attacker) => Math.max(1, attacker.stats[mapping.attack] ?? 3),
    guardReduction: (defender) => {
      const res = defender.stats[mapping.resolve] ?? 3;
      const bonus = Math.max(0, (res - 3) * 0.03);
      return Math.min(0.75, 0.5 + bonus);
    },
    disengageChance: (actor) => {
      const prec = actor.stats[mapping.precision] ?? 5;
      const res = actor.stats[mapping.resolve] ?? 3;
      return Math.min(90, Math.max(15, 40 + prec * 5 + res * 2));
    },
  };
}

// ---------------------------------------------------------------------------
// PACK_BIAS_TAGS — discoverability for pack authors
// ---------------------------------------------------------------------------

/** All available built-in pack bias tags. Use with buildCombatStack's `biasTags` option. */
export const PACK_BIAS_TAGS = BUILTIN_PACK_BIASES.map(b => b.tag);

// ---------------------------------------------------------------------------
// buildCombatStack — eliminates the opaque wrapping pattern
// ---------------------------------------------------------------------------

export type CombatStackConfig = {
  /** Stat mapping for this world's combat dimensions. */
  statMapping: CombatStatMapping;

  /** Player entity ID. Default: 'player'. */
  playerId?: string;

  /** Engagement config (backlineTags, protectorTags, chokepointTag). */
  engagement?: Omit<EngagementConfig, 'playerId'>;

  /** Combat resource profile. Omit for worlds without combat resources (e.g. Fantasy). */
  resourceProfile?: CombatResourceProfile;

  /** Built-in pack bias tags to include (e.g. ['undead', 'feral']). Filters BUILTIN_PACK_BIASES. */
  biasTags?: string[];

  /** Recovery config overrides. */
  recovery?: Omit<CombatRecoveryConfig, 'playerId'>;

  /** Override individual combat formulas (spread over the generated defaults). */
  formulaOverrides?: Partial<CombatFormulas>;

  /** Additional combat tactics config (braceStabilizeChance, etc). */
  tacticsConfig?: Partial<CombatTacticsConfig>;
};

export type CombatStack = {
  /** The fully wrapped combat formulas (engagement + resources + review tracing). */
  formulas: CombatFormulas;

  /** Combat engine modules in correct wiring order. Add these to Engine's modules array. */
  modules: EngineModule[];
};

/**
 * Build a complete combat module stack from a simple config.
 *
 * Encapsulates the formula wrapping pattern and module wiring that every
 * starter world repeats:
 * ```
 * const review = createCombatReview({ baseFormulas });
 * const wrapped = withCombatResources(profile, withEngagement(formulas));
 * // + createEngagementCore, review.module, createCombatCore, createCombatTactics,
 * //   createCombatResources, createCombatIntent, createCombatRecovery, createCombatStateNarration
 * ```
 *
 * Usage:
 * ```
 * const combat = buildCombatStack({
 *   statMapping: { attack: 'grit', precision: 'draw-speed', resolve: 'lore' },
 *   playerId: 'drifter',
 *   resourceProfile: weirdWestCombatProfile,
 *   biasTags: ['undead', 'spirit', 'beast'],
 *   engagement: { protectorTags: ['bodyguard'] },
 * });
 * // Then in Engine constructor:
 * modules: [...combat.modules, ...otherModules]
 * ```
 */
export function buildCombatStack(config: CombatStackConfig): CombatStack {
  const playerId = config.playerId ?? 'player';
  const mapping = config.statMapping;

  // Build base formulas (standard or overridden)
  const baseFormulas: CombatFormulas = {
    ...buildCombatFormulas(mapping),
    ...config.formulaOverrides,
    statMapping: mapping,
  };

  // Create review (traces formula evaluation)
  const review = createCombatReview({ baseFormulas });

  // Wrap formulas: engagement → resources → review tracing
  let wrappedFormulas: CombatFormulas = withEngagement(baseFormulas);
  if (config.resourceProfile) {
    wrappedFormulas = withCombatResources(config.resourceProfile, wrappedFormulas);
  }
  const tracedFormulas = review.explain(wrappedFormulas);

  // Build modules in correct wiring order.
  // cognition-core is included automatically — combat-recovery depends on it,
  // and combat-intent uses getCognition() for morale-aware scoring.
  const modules: EngineModule[] = [
    createCognitionCore(),
    createEngagementCore({ playerId, ...config.engagement }),
    review.module,
    createCombatCore(tracedFormulas),
  ];

  // Tactics (with resource hooks if profile exists)
  const tacticsOpts: Partial<CombatTacticsConfig> = { ...config.tacticsConfig };
  if (config.resourceProfile) {
    tacticsOpts.hooks = buildTacticalHooks(config.resourceProfile);
  }
  modules.push(createCombatTactics(tacticsOpts));

  // Resources (if profile exists)
  if (config.resourceProfile) {
    modules.push(createCombatResources(config.resourceProfile));
  }

  // Intent (AI decision-making)
  const intentConfig: CombatIntentConfig = {
    statMapping: mapping,
  };
  if (config.biasTags?.length) {
    intentConfig.packBiases = BUILTIN_PACK_BIASES.filter(b => config.biasTags!.includes(b.tag));
  }
  if (config.resourceProfile) {
    intentConfig.resourceProfile = config.resourceProfile;
  }
  modules.push(createCombatIntent(intentConfig));

  // Recovery
  modules.push(createCombatRecovery({ playerId, ...config.recovery }));

  // State narration
  modules.push(createCombatStateNarration());

  return { formulas: tracedFormulas, modules };
}
