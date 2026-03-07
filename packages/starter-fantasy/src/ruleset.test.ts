import { describe, it, expect } from 'vitest';
import { validateRulesetDefinition } from '@ai-rpg-engine/content-schema';
import { fantasyMinimalRuleset } from './ruleset.js';

describe('fantasyMinimalRuleset', () => {
  it('validates against RulesetDefinition schema', () => {
    const r = validateRulesetDefinition(fantasyMinimalRuleset);
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('declares expected stats', () => {
    const statIds = fantasyMinimalRuleset.stats.map((s) => s.id);
    expect(statIds).toContain('vigor');
    expect(statIds).toContain('instinct');
    expect(statIds).toContain('will');
  });

  it('declares expected resources', () => {
    const resIds = fantasyMinimalRuleset.resources.map((r) => r.id);
    expect(resIds).toContain('hp');
    expect(resIds).toContain('stamina');
  });

  it('declares all verbs used by starter modules', () => {
    const verbIds = fantasyMinimalRuleset.verbs.map((v) => v.id);
    expect(verbIds).toContain('move');
    expect(verbIds).toContain('attack');
    expect(verbIds).toContain('inspect');
    expect(verbIds).toContain('speak');
    expect(verbIds).toContain('choose');
    expect(verbIds).toContain('use');
  });

  it('lists all default modules', () => {
    expect(fantasyMinimalRuleset.defaultModules).toContain('traversal-core');
    expect(fantasyMinimalRuleset.defaultModules).toContain('combat-core');
  });

  it('declares combat formulas', () => {
    const formulaIds = fantasyMinimalRuleset.formulas.map((f) => f.id);
    expect(formulaIds).toContain('hit-chance');
    expect(formulaIds).toContain('damage');
  });
});
