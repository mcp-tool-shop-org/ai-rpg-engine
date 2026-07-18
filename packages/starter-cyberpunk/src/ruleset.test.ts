// Cyberpunk ruleset integrity tests
//
// This starter had no ruleset.test.ts at all before F-e83a091f — the other 9
// starters each have one, so this brings cyberpunk in line and gives it a
// place to pin the disengage-chance description fix below.

import { describe, it, expect } from 'vitest';
import { validateRulesetDefinition } from '@ai-rpg-engine/content-schema';
import { cyberpunkMinimalRuleset } from './ruleset.js';
import { cyberpunkAbilities } from './content.js';

describe('cyberpunkMinimalRuleset', () => {
  it('validates against RulesetDefinition schema', () => {
    const r = validateRulesetDefinition(cyberpunkMinimalRuleset);
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('declares expected stats', () => {
    const statIds = cyberpunkMinimalRuleset.stats.map((s) => s.id);
    expect(statIds).toContain('chrome');
    expect(statIds).toContain('reflex');
    expect(statIds).toContain('netrunning');
  });

  it('declares expected resources', () => {
    const resIds = cyberpunkMinimalRuleset.resources.map((r) => r.id);
    expect(resIds).toContain('hp');
  });

  it('every ability cost resource is declared in the ruleset', () => {
    const resIds = new Set(cyberpunkMinimalRuleset.resources.map((r) => r.id));
    for (const ability of cyberpunkAbilities) {
      for (const cost of ability.costs ?? []) {
        expect(
          resIds.has(cost.resourceId),
          `ability "${ability.id}" costs undeclared resource "${cost.resourceId}"`,
        ).toBe(true);
      }
    }
  });

  it('declares combat formulas', () => {
    const formulaIds = cyberpunkMinimalRuleset.formulas.map((f) => f.id);
    expect(formulaIds).toContain('hit-chance');
    expect(formulaIds).toContain('damage');
  });

  // F-e83a091f: this description was copy-pasted verbatim from starter-fantasy
  // ("40 + instinct*5 + will*2") — cyberpunk has no 'instinct'/'will' stats
  // at all. Per buildCombatFormulas' real disengageChance formula
  // (packages/modules/src/combat-builders.ts: 40 + precision*5 + resolve*2,
  // clamped 15-90), cyberpunk's precision/resolve stats are reflex/netrunning.
  it('disengage-chance formula description matches this pack\'s real stats', () => {
    const formula = cyberpunkMinimalRuleset.formulas.find((f) => f.id === 'disengage-chance')!;
    expect(formula.description).toContain('reflex');
    expect(formula.description).toContain('netrunning');
    expect(formula.description).not.toContain('instinct');
    expect(formula.description).not.toContain('will');
  });
});
