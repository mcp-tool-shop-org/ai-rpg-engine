import { describe, it, expect } from 'vitest';
import { validateRulesetDefinition } from '@ai-rpg-engine/content-schema';
import { gladiatorMinimalRuleset } from './ruleset.js';
import { gladiatorAbilities } from './content.js';

describe('gladiatorMinimalRuleset', () => {
  it('validates against RulesetDefinition schema', () => {
    const r = validateRulesetDefinition(gladiatorMinimalRuleset);
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  // ST-03: abilities cost stamina, so the ruleset must declare stamina.
  it('declares the stamina resource used by ability costs', () => {
    const resIds = gladiatorMinimalRuleset.resources.map((r) => r.id);
    expect(resIds).toContain('stamina');
  });

  it('every ability cost resource is declared in the ruleset', () => {
    const resIds = new Set(gladiatorMinimalRuleset.resources.map((r) => r.id));
    for (const ability of gladiatorAbilities) {
      for (const cost of ability.costs ?? []) {
        expect(
          resIds.has(cost.resourceId),
          `ability "${ability.id}" costs undeclared resource "${cost.resourceId}"`,
        ).toBe(true);
      }
    }
  });
});
