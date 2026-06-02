// ability-builders — convenience builders for common ability patterns
//
// Pure functions that return AbilityDefinition objects. Reduce boilerplate
// for pack authors. No runtime dependencies.

import type { AbilityDefinition, TargetScope, TargetAffiliation } from '@ai-rpg-engine/content-schema';
import type { AbilityPackRuleset } from '@ai-rpg-engine/content-schema';
import { validateAbilityPack } from '@ai-rpg-engine/content-schema';
import { summarizeAbilityPack, auditAbilityBalance } from './ability-summary.js';
import type { AbilityPackSummary, BalanceAudit } from './ability-summary.js';

// ---------------------------------------------------------------------------
// Builder Types
// ---------------------------------------------------------------------------

export type DamageAbilityOpts = {
  id: string;
  name: string;
  damage: number;
  damageType: string;
  stat: string;
  difficulty: number;
  costs: Array<{ resourceId: string; amount: number }>;
  cooldown: number;
  tags?: string[];
  requirements?: AbilityDefinition['requirements'];
  ui?: AbilityDefinition['ui'];
};

export type HealAbilityOpts = {
  id: string;
  name: string;
  healAmount: number;
  resource?: string;
  costs: Array<{ resourceId: string; amount: number }>;
  cooldown: number;
  tags?: string[];
  requirements?: AbilityDefinition['requirements'];
  ui?: AbilityDefinition['ui'];
  /**
   * Who the heal can reach. Defaults to `'self'` for back-compat (an undefined
   * affiliation behaves exactly like the original self-only heal). Set `'ally'`
   * for a party-JRPG healer that can mend other party members.
   */
  affiliation?: TargetAffiliation;
  /** How many targets. `'single'` (default) or `'all'` for a group heal. Ignored unless `affiliation` is set. */
  scope?: TargetScope;
};

export type BuffAbilityOpts = {
  id: string;
  name: string;
  statusId: string;
  duration: number;
  costs: Array<{ resourceId: string; amount: number }>;
  cooldown: number;
  /** Optional stat tweak applied alongside the status (e.g. +2 might). */
  statModify?: { stat: string; amount: number };
  /** Single ally (default) or the whole party (`'all'`). */
  scope?: TargetScope;
  /** Whether the caster buffs itself too. Defaults to true. */
  includeSelf?: boolean;
  stacking?: 'replace' | 'stack' | 'refresh';
  tags?: string[];
  requirements?: AbilityDefinition['requirements'];
  ui?: AbilityDefinition['ui'];
};

export type ReviveAbilityOpts = {
  id: string;
  name: string;
  /** HP restored to the revived ally. */
  healAmount: number;
  resource?: string;
  costs: Array<{ resourceId: string; amount: number }>;
  cooldown: number;
  /** Revive one fallen ally (default) or all of them (`'all'`). */
  scope?: TargetScope;
  tags?: string[];
  requirements?: AbilityDefinition['requirements'];
  ui?: AbilityDefinition['ui'];
};

export type StatusAbilityOpts = {
  id: string;
  name: string;
  statusId: string;
  duration: number;
  costs: Array<{ resourceId: string; amount: number }>;
  cooldown: number;
  target?: 'single' | 'all-enemies';
  statModify?: { stat: string; amount: number };
  tags?: string[];
  requirements?: AbilityDefinition['requirements'];
  ui?: AbilityDefinition['ui'];
};

export type CleanseAbilityOpts = {
  id: string;
  name: string;
  cleanseTags: string[];
  costs: Array<{ resourceId: string; amount: number }>;
  cooldown: number;
  tags?: string[];
  requirements?: AbilityDefinition['requirements'];
  ui?: AbilityDefinition['ui'];
  /** Defaults to `'self'` for back-compat. Set `'ally'` to cleanse a chosen party member. */
  affiliation?: TargetAffiliation;
  /** Single target (default) or whole party (`'all'`). Ignored unless `affiliation` is set. */
  scope?: TargetScope;
};

export type AbilitySuiteResult = {
  validation: { ok: boolean; errors: Array<{ path: string; message: string }> };
  summary: AbilityPackSummary;
  audit: BalanceAudit;
};

// ---------------------------------------------------------------------------
// Targeting helper (ally support routing)
// ---------------------------------------------------------------------------

/**
 * Compute the `{ target, effectTarget }` pair for a support ability from its
 * affiliation/scope/life axes, choosing the routing that works with the engine's
 * existing target resolution WITHOUT changing ability-core:
 *
 * - No affiliation (or `'self'`) → legacy self target; effect hits the actor.
 * - Living single ally → `type:'single'` so ability-core resolves the chosen ally
 *   by id; effect target `'target'`.
 * - `scope:'all'` OR `life:'dead'` (group, or any revive) → `type:'zone'` so
 *   ability-core does not pre-filter/reject candidates (it rejects defeated single
 *   targets); the zone effect handler then runs the affiliation + life filter.
 *
 * `type` is also set to the nearest legacy enum so summary/distribution tooling
 * stays meaningful.
 */
function resolveSupportTargeting(opts: {
  affiliation?: TargetAffiliation;
  scope?: TargetScope;
  life?: 'alive' | 'dead' | 'any';
  includeSelf?: boolean;
  filter?: string[];
}): { target: AbilityDefinition['target']; effectTarget: 'actor' | 'target' | 'zone' } {
  const affiliation = opts.affiliation;
  // Back-compat: no affiliation means the original self-only behavior.
  if (!affiliation) {
    return { target: { type: 'self' }, effectTarget: 'actor' };
  }

  const scope: TargetScope = opts.scope ?? 'single';
  const life = opts.life ?? 'alive';
  const includeSelf = opts.includeSelf ?? true;

  // Group, or any revive (dead target), must route through the zone effect target.
  const useZone = scope === 'all' || life === 'dead';

  if (useZone) {
    return {
      target: {
        type: scope === 'all' ? 'all-enemies' : 'zone',
        scope: scope === 'all' ? 'all' : 'single',
        affiliation,
        life,
        includeSelf,
        filter: opts.filter,
      },
      effectTarget: 'zone',
    };
  }

  // Living single ally — handled by ability-core's single-target path.
  return {
    target: {
      type: 'single',
      scope: 'single',
      affiliation,
      life,
      includeSelf,
      filter: opts.filter,
    },
    effectTarget: 'target',
  };
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

/** Build a common single-target damage ability */
export function buildDamageAbility(opts: DamageAbilityOpts): AbilityDefinition {
  return {
    id: opts.id,
    name: opts.name,
    verb: 'use-ability',
    tags: opts.tags ?? ['combat', 'damage'],
    costs: opts.costs,
    target: { type: 'single' },
    checks: [{ stat: opts.stat, difficulty: opts.difficulty, onFail: 'half-damage' }],
    effects: [
      { type: 'damage', target: 'target', params: { amount: opts.damage, damageType: opts.damageType } },
    ],
    cooldown: opts.cooldown,
    requirements: opts.requirements,
    ui: opts.ui,
  };
}

/**
 * Build a heal ability.
 *
 * Back-compat: with no `affiliation` it is the original self-only heal
 * (`target:{type:'self'}`, effect on the actor) — existing callers are unchanged.
 * Pass `affiliation:'ally'` for a party healer; `scope:'all'` for a group heal.
 */
export function buildHealAbility(opts: HealAbilityOpts): AbilityDefinition {
  const { target, effectTarget } = resolveSupportTargeting({
    affiliation: opts.affiliation,
    scope: opts.scope,
    life: 'alive',
  });
  return {
    id: opts.id,
    name: opts.name,
    verb: 'use-ability',
    tags: opts.tags ?? ['support', 'heal'],
    costs: opts.costs,
    target,
    checks: [],
    effects: [
      { type: 'heal', target: effectTarget, params: { amount: opts.healAmount, resource: opts.resource ?? 'hp' } },
    ],
    cooldown: opts.cooldown,
    requirements: opts.requirements,
    ui: opts.ui,
  };
}

/**
 * Build a buff ability (apply-status, optionally with a stat tweak), ally-targeted
 * by default and including the caster. Single ally by default; `scope:'all'` for a
 * party-wide buff.
 */
export function buildBuffAbility(opts: BuffAbilityOpts): AbilityDefinition {
  const { target, effectTarget } = resolveSupportTargeting({
    affiliation: 'ally',
    scope: opts.scope,
    life: 'alive',
    includeSelf: opts.includeSelf,
  });
  const effects: AbilityDefinition['effects'] = [
    { type: 'apply-status', target: effectTarget, params: { statusId: opts.statusId, duration: opts.duration, stacking: opts.stacking ?? 'replace' } },
  ];
  if (opts.statModify) {
    effects.push({ type: 'stat-modify', target: effectTarget, params: { stat: opts.statModify.stat, amount: opts.statModify.amount } });
  }
  return {
    id: opts.id,
    name: opts.name,
    verb: 'use-ability',
    tags: opts.tags ?? ['support', 'buff'],
    costs: opts.costs,
    target,
    checks: [],
    effects,
    cooldown: opts.cooldown,
    requirements: opts.requirements,
    ui: opts.ui,
  };
}

/**
 * Build a revive ability — ally + `life:'dead'`, restoring HP to a fallen ally.
 * Routed through the zone effect target so the (defeated) ally is reachable
 * (ability-core rejects defeated single targets). `scope:'all'` revives the party.
 */
export function buildReviveAbility(opts: ReviveAbilityOpts): AbilityDefinition {
  const { target, effectTarget } = resolveSupportTargeting({
    affiliation: 'ally',
    scope: opts.scope,
    life: 'dead',
    includeSelf: false,
  });
  return {
    id: opts.id,
    name: opts.name,
    verb: 'use-ability',
    tags: opts.tags ?? ['support', 'revive'],
    costs: opts.costs,
    target,
    checks: [],
    effects: [
      { type: 'heal', target: effectTarget, params: { amount: opts.healAmount, resource: opts.resource ?? 'hp' } },
    ],
    cooldown: opts.cooldown,
    requirements: opts.requirements,
    ui: opts.ui,
  };
}

/** Build a status-applying ability (single or AoE) */
export function buildStatusAbility(opts: StatusAbilityOpts): AbilityDefinition {
  const effects: AbilityDefinition['effects'] = [
    { type: 'apply-status', target: 'target', params: { statusId: opts.statusId, duration: opts.duration, stacking: 'replace' } },
  ];
  if (opts.statModify) {
    effects.push({ type: 'stat-modify', target: 'target', params: { stat: opts.statModify.stat, amount: opts.statModify.amount } });
  }
  return {
    id: opts.id,
    name: opts.name,
    verb: 'use-ability',
    tags: opts.tags ?? ['combat', 'debuff'],
    costs: opts.costs,
    target: { type: opts.target ?? 'single' },
    checks: [],
    effects,
    cooldown: opts.cooldown,
    requirements: opts.requirements,
    ui: opts.ui,
  };
}

/**
 * Build a cleanse ability (remove-status-by-tag).
 *
 * Back-compat: with no `affiliation` it is the original self-cleanse. Pass
 * `affiliation:'ally'` to cleanse a chosen party member; `scope:'all'` for the party.
 */
export function buildCleanseAbility(opts: CleanseAbilityOpts): AbilityDefinition {
  const { target, effectTarget } = resolveSupportTargeting({
    affiliation: opts.affiliation,
    scope: opts.scope,
    life: 'alive',
  });
  return {
    id: opts.id,
    name: opts.name,
    verb: 'use-ability',
    tags: opts.tags ?? ['support', 'cleanse'],
    costs: opts.costs,
    target,
    checks: [],
    effects: [
      { type: 'remove-status-by-tag', target: effectTarget, params: { tags: opts.cleanseTags.join(',') } },
    ],
    cooldown: opts.cooldown,
    requirements: opts.requirements,
    ui: opts.ui,
  };
}

/** Validate, summarize, and audit a set of abilities in one call */
export function buildAbilitySuite(
  genre: string,
  abilities: AbilityDefinition[],
  ruleset: AbilityPackRuleset,
): AbilitySuiteResult {
  const validation = validateAbilityPack(abilities, ruleset);
  const summary = summarizeAbilityPack(genre, abilities);
  const audit = auditAbilityBalance([{ genre, abilities }]);
  return { validation, summary, audit };
}
