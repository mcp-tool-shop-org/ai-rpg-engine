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
import { DEFAULT_STAT_MAPPING, resolveEntityMapping } from './combat-core.js';
import { createCombatCore } from './combat-core.js';
import { effectiveStat } from './status-effects.js';
import { COMPANION_TAG } from './companion-core.js';
import { createCombatReview } from './combat-review.js';
import { createEngagementCore, withEngagement } from './engagement-core.js';
import { createCombatTactics, type CombatTacticsConfig } from './combat-tactics.js';
import { createCombatResources, withCombatResources, buildTacticalHooks } from './combat-resources.js';
import { createCombatIntent, BUILTIN_PACK_BIASES } from './combat-intent.js';
import { createCombatRecovery } from './combat-recovery.js';
import { createCombatStateNarration } from './combat-state-narration.js';
import { createCognitionCore, type CognitionCoreConfig } from './cognition-core.js';

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
 *
 * CR-1: each closure resolves its stats PER-ENTITY via `resolveEntityMapping`,
 * with `mapping` as the fallback — so a `might` fighter and a `will` mystic in a
 * `buildCombatStack`-wired game (every shipped starter) read their own stat
 * mappings off this one formula set. Reads go through `effectiveStat`, so status
 * buffs/debuffs reach these formulas too (matching the built-in default path).
 * Byte-identical to the previous raw reads when no profile and no modifiers are
 * present (`effectiveStat` then returns `entity.stats[stat] ?? fallback`).
 */
export function buildCombatFormulas(mapping: CombatStatMapping): CombatFormulas {
  return {
    statMapping: mapping,
    hitChance: (attacker, target, world) => {
      const am = resolveEntityMapping(attacker, world, mapping);
      const tm = resolveEntityMapping(target, world, mapping);
      const atkPrec = effectiveStat(attacker, am.precision, world, 5);
      const tgtPrec = effectiveStat(target, tm.precision, world, 5);
      return Math.min(95, Math.max(5, 50 + atkPrec * 5 - tgtPrec * 3));
    },
    damage: (attacker, _target, world) => {
      const m = resolveEntityMapping(attacker, world, mapping);
      return Math.max(1, effectiveStat(attacker, m.attack, world, 3));
    },
    guardReduction: (defender, world) => {
      const m = resolveEntityMapping(defender, world, mapping);
      const res = effectiveStat(defender, m.resolve, world, 3);
      const bonus = Math.max(0, (res - 3) * 0.03);
      return Math.min(0.75, 0.5 + bonus);
    },
    disengageChance: (actor, world) => {
      const m = resolveEntityMapping(actor, world, mapping);
      const prec = effectiveStat(actor, m.precision, world, 5);
      const res = effectiveStat(actor, m.resolve, world, 3);
      return Math.min(90, Math.max(15, 40 + prec * 5 + res * 2));
    },
    // F-64580086: combat-core.ts's interception mechanic (isAlly/
    // interceptChance/INTERCEPT_ROLE_BONUS) was fully authored and tested but
    // 100% dark in every shipped starter — buildCombatFormulas never set
    // isAlly, so `if (formulas?.isAlly && shouldCheck)` never entered.
    // companion-core.ts's recruit verb tags a recruit 'companion' (F-2fe4be26);
    // this is the read side. PASSIVE interception only — shouldIntercept
    // still defaults to player-only, so this does not give companions
    // independent turns (that would mean teaching combat-intent.ts's
    // turn-order/decision system that non-player entities can act
    // autonomously on the player's side — a materially larger v2.9+ change,
    // deliberately untouched here).
    isAlly: (id, world) => world.entities[id]?.tags.includes(COMPANION_TAG) ?? false,
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

  /**
   * Cognition module config. Controls belief decay, morale flee thresholds, and intent profiles.
   * - Omit or undefined → default cognition (baseRate 0.02, pruneThreshold 0.05)
   * - Object → custom cognition config passed to createCognitionCore()
   * - false → no cognition module included (caller must provide their own)
   */
  cognition?: CognitionCoreConfig | false;
};

export type CombatStack = {
  /** The fully wrapped combat formulas (engagement + resources + review tracing). */
  formulas: CombatFormulas;

  /** Combat engine modules in correct wiring order. Add these to Engine's modules array. */
  modules: EngineModule[];

  /**
   * Non-fatal author warnings (warn-and-degrade). Currently surfaces any
   * `biasTags` entry that is not a known built-in pack bias tag — those are
   * silently dropped from the intent config, so a typo (`'feeral'` for
   * `'feral'`) would otherwise vanish without trace. Each message names the
   * offending tag and lists the valid tags. Empty array when all input is valid.
   */
  warnings: string[];
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
  const warnings: string[] = [];

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
  // cognition-core is included automatically unless explicitly disabled (false).
  // combat-recovery depends on it, and combat-intent uses getCognition() for morale-aware scoring.
  const modules: EngineModule[] = [];
  if (config.cognition !== false) {
    modules.push(createCognitionCore(config.cognition ?? undefined));
  }
  modules.push(
    createEngagementCore({ playerId, ...config.engagement }),
    review.module,
    createCombatCore(tracedFormulas),
  );

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
    // Warn-and-degrade: an unknown biasTag is silently dropped by the filter
    // below. Surface each one (with the valid tag list) instead of vanishing it.
    const unknownTags = config.biasTags.filter(t => !PACK_BIAS_TAGS.includes(t));
    for (const tag of unknownTags) {
      warnings.push(
        `unknown biasTag '${tag}' — dropped. Valid tags: ${PACK_BIAS_TAGS.join(', ')}.`,
      );
    }
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

  return { formulas: tracedFormulas, modules, warnings };
}
