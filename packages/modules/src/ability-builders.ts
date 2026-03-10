// ability-builders — convenience builders for common ability patterns
//
// Pure functions that return AbilityDefinition objects. Reduce boilerplate
// for pack authors. No runtime dependencies.

import type { AbilityDefinition } from '@ai-rpg-engine/content-schema';
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
};

export type AbilitySuiteResult = {
  validation: { ok: boolean; errors: Array<{ path: string; message: string }> };
  summary: AbilityPackSummary;
  audit: BalanceAudit;
};

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

/** Build a self-target heal ability */
export function buildHealAbility(opts: HealAbilityOpts): AbilityDefinition {
  return {
    id: opts.id,
    name: opts.name,
    verb: 'use-ability',
    tags: opts.tags ?? ['support', 'heal'],
    costs: opts.costs,
    target: { type: 'self' },
    checks: [],
    effects: [
      { type: 'heal', target: 'actor', params: { amount: opts.healAmount, resource: opts.resource ?? 'hp' } },
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

/** Build a self-target cleanse ability (remove-status-by-tag) */
export function buildCleanseAbility(opts: CleanseAbilityOpts): AbilityDefinition {
  return {
    id: opts.id,
    name: opts.name,
    verb: 'use-ability',
    tags: opts.tags ?? ['support', 'cleanse'],
    costs: opts.costs,
    target: { type: 'self' },
    checks: [],
    effects: [
      { type: 'remove-status-by-tag', target: 'actor', params: { tags: opts.cleanseTags.join(',') } },
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
