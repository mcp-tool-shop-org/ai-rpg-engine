import { describe, it, expect } from 'vitest';
import { validateRulesetDefinition } from '@ai-rpg-engine/content-schema';
import { zombieMinimalRuleset } from './ruleset.js';

describe('zombieMinimalRuleset', () => {
  it('validates against RulesetDefinition schema', () => {
    const r = validateRulesetDefinition(zombieMinimalRuleset);
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('declares expected stats', () => {
    const statIds = zombieMinimalRuleset.stats.map((s) => s.id);
    expect(statIds).toContain('fitness');
    expect(statIds).toContain('wits');
    expect(statIds).toContain('nerve');
  });

  it('declares expected resources', () => {
    const resIds = zombieMinimalRuleset.resources.map((r) => r.id);
    expect(resIds).toContain('hp');
    expect(resIds).toContain('stamina');
    expect(resIds).toContain('infection');
  });

  it('declares all verbs used by starter modules', () => {
    const verbIds = zombieMinimalRuleset.verbs.map((v) => v.id);
    expect(verbIds).toContain('move');
    expect(verbIds).toContain('attack');
    expect(verbIds).toContain('inspect');
    expect(verbIds).toContain('speak');
    expect(verbIds).toContain('choose');
    expect(verbIds).toContain('use');
    expect(verbIds).toContain('barricade');
    expect(verbIds).toContain('scavenge');
  });

  it('lists all default modules', () => {
    expect(zombieMinimalRuleset.defaultModules).toContain('traversal-core');
    expect(zombieMinimalRuleset.defaultModules).toContain('combat-core');
  });

  it('declares combat formulas', () => {
    const formulaIds = zombieMinimalRuleset.formulas.map((f) => f.id);
    expect(formulaIds).toContain('hit-chance');
    expect(formulaIds).toContain('damage');
  });
});
