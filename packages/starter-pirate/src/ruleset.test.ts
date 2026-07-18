import { describe, it, expect } from 'vitest';
import { validateRulesetDefinition } from '@ai-rpg-engine/content-schema';
import { pirateMinimalRuleset } from './ruleset.js';
import { pirateAbilities } from './content.js';

describe('pirateMinimalRuleset', () => {
  it('validates against RulesetDefinition schema', () => {
    const r = validateRulesetDefinition(pirateMinimalRuleset);
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('declares expected stats', () => {
    const statIds = pirateMinimalRuleset.stats.map((s) => s.id);
    expect(statIds).toContain('brawn');
    expect(statIds).toContain('cunning');
    expect(statIds).toContain('sea-legs');
  });

  it('declares expected resources', () => {
    const resIds = pirateMinimalRuleset.resources.map((r) => r.id);
    expect(resIds).toContain('hp');
    expect(resIds).toContain('morale');
  });

  // ST-03: abilities cost stamina, so the ruleset must declare stamina.
  it('declares the stamina resource used by ability costs', () => {
    const resIds = pirateMinimalRuleset.resources.map((r) => r.id);
    expect(resIds).toContain('stamina');
  });

  it('every ability cost resource is declared in the ruleset', () => {
    const resIds = new Set(pirateMinimalRuleset.resources.map((r) => r.id));
    for (const ability of pirateAbilities) {
      for (const cost of ability.costs ?? []) {
        expect(
          resIds.has(cost.resourceId),
          `ability "${ability.id}" costs undeclared resource "${cost.resourceId}"`,
        ).toBe(true);
      }
    }
  });

  it('declares all verbs used by starter modules', () => {
    const verbIds = pirateMinimalRuleset.verbs.map((v) => v.id);
    expect(verbIds).toContain('move');
    expect(verbIds).toContain('attack');
    expect(verbIds).toContain('inspect');
    expect(verbIds).toContain('speak');
    expect(verbIds).toContain('choose');
    expect(verbIds).toContain('use');
    expect(verbIds).toContain('plunder');
    expect(verbIds).toContain('navigate');
  });

  it('lists all default modules', () => {
    expect(pirateMinimalRuleset.defaultModules).toContain('traversal-core');
    expect(pirateMinimalRuleset.defaultModules).toContain('combat-core');
  });

  it('declares combat formulas', () => {
    const formulaIds = pirateMinimalRuleset.formulas.map((f) => f.id);
    expect(formulaIds).toContain('hit-chance');
    expect(formulaIds).toContain('damage');
  });

  // F-e83a091f: this description was copy-pasted verbatim from starter-fantasy
  // ("40 + instinct*5 + will*2") — pirate has no 'instinct'/'will' stats at
  // all. Per buildCombatFormulas' real disengageChance formula
  // (packages/modules/src/combat-builders.ts: 40 + precision*5 + resolve*2,
  // clamped 15-90), pirate's precision/resolve stats are cunning/sea-legs.
  it('disengage-chance formula description matches this pack\'s real stats', () => {
    const formula = pirateMinimalRuleset.formulas.find((f) => f.id === 'disengage-chance')!;
    expect(formula.description).toContain('cunning');
    expect(formula.description).toContain('sea-legs');
    expect(formula.description).not.toContain('instinct');
    expect(formula.description).not.toContain('will');
  });
});
