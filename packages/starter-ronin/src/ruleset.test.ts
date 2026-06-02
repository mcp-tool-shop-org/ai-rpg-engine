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
});
