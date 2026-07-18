import { describe, it, expect } from 'vitest';
import { validateRulesetDefinition } from '@ai-rpg-engine/content-schema';
import { roninMinimalRuleset } from './ruleset.js';
import { roninAbilities } from './content.js';

describe('roninMinimalRuleset', () => {
  it('validates against RulesetDefinition schema', () => {
    const r = validateRulesetDefinition(roninMinimalRuleset);
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  // ST-03: abilities cost stamina, so the ruleset must declare stamina.
  it('declares the stamina resource used by ability costs', () => {
    const resIds = roninMinimalRuleset.resources.map((r) => r.id);
    expect(resIds).toContain('stamina');
  });

  it('every ability cost resource is declared in the ruleset', () => {
    const resIds = new Set(roninMinimalRuleset.resources.map((r) => r.id));
    for (const ability of roninAbilities) {
      for (const cost of ability.costs ?? []) {
        expect(
          resIds.has(cost.resourceId),
          `ability "${ability.id}" costs undeclared resource "${cost.resourceId}"`,
        ).toBe(true);
      }
    }
  });

  // F-e83a091f: this description was copy-pasted verbatim from starter-fantasy
  // ("40 + instinct*5 + will*2") — ronin has no 'instinct'/'will' stats at
  // all. Per buildCombatFormulas' real disengageChance formula
  // (packages/modules/src/combat-builders.ts: 40 + precision*5 + resolve*2,
  // clamped 15-90), ronin's precision/resolve stats are perception/composure.
  it('disengage-chance formula description matches this pack\'s real stats', () => {
    const formula = roninMinimalRuleset.formulas.find((f) => f.id === 'disengage-chance')!;
    expect(formula.description).toContain('perception');
    expect(formula.description).toContain('composure');
    expect(formula.description).not.toContain('instinct');
    expect(formula.description).not.toContain('will');
  });
});
