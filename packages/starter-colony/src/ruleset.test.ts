import { describe, it, expect } from 'vitest';
import { validateRulesetDefinition } from '@ai-rpg-engine/content-schema';
import { colonyMinimalRuleset } from './ruleset.js';
import { colonyAbilities } from './content.js';

describe('colonyMinimalRuleset', () => {
  it('validates against RulesetDefinition schema', () => {
    const r = validateRulesetDefinition(colonyMinimalRuleset);
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('declares expected stats', () => {
    const statIds = colonyMinimalRuleset.stats.map((s) => s.id);
    expect(statIds).toContain('engineering');
    expect(statIds).toContain('command');
    expect(statIds).toContain('awareness');
  });

  it('declares expected resources', () => {
    const resIds = colonyMinimalRuleset.resources.map((r) => r.id);
    expect(resIds).toContain('hp');
    expect(resIds).toContain('power');
    expect(resIds).toContain('morale');
  });

  // ST-03: abilities cost stamina, so the ruleset must declare stamina.
  it('declares the stamina resource used by ability costs', () => {
    const resIds = colonyMinimalRuleset.resources.map((r) => r.id);
    expect(resIds).toContain('stamina');
  });

  it('every ability cost resource is declared in the ruleset', () => {
    const resIds = new Set(colonyMinimalRuleset.resources.map((r) => r.id));
    for (const ability of colonyAbilities) {
      for (const cost of ability.costs ?? []) {
        expect(
          resIds.has(cost.resourceId),
          `ability "${ability.id}" costs undeclared resource "${cost.resourceId}"`,
        ).toBe(true);
      }
    }
  });

  it('declares all verbs used by starter modules', () => {
    const verbIds = colonyMinimalRuleset.verbs.map((v) => v.id);
    expect(verbIds).toContain('move');
    expect(verbIds).toContain('attack');
    expect(verbIds).toContain('inspect');
    expect(verbIds).toContain('speak');
    expect(verbIds).toContain('choose');
    expect(verbIds).toContain('use');
    expect(verbIds).toContain('scan');
    expect(verbIds).toContain('allocate');
  });

  it('lists all default modules', () => {
    expect(colonyMinimalRuleset.defaultModules).toContain('traversal-core');
    expect(colonyMinimalRuleset.defaultModules).toContain('combat-core');
  });

  it('declares combat and scan formulas', () => {
    const formulaIds = colonyMinimalRuleset.formulas.map((f) => f.id);
    expect(formulaIds).toContain('hit-chance');
    expect(formulaIds).toContain('damage');
    expect(formulaIds).toContain('scan-success');
  });

  // F-e83a091f: this description was copy-pasted verbatim from starter-fantasy
  // ("40 + instinct*5 + will*2") — colony has no 'instinct'/'will' stats at
  // all. Per buildCombatFormulas' real disengageChance formula
  // (packages/modules/src/combat-builders.ts: 40 + precision*5 + resolve*2,
  // clamped 15-90), colony's precision/resolve stats are awareness/command.
  it('disengage-chance formula description matches this pack\'s real stats', () => {
    const formula = colonyMinimalRuleset.formulas.find((f) => f.id === 'disengage-chance')!;
    expect(formula.description).toContain('awareness');
    expect(formula.description).toContain('command');
    expect(formula.description).not.toContain('instinct');
    expect(formula.description).not.toContain('will');
  });
});
