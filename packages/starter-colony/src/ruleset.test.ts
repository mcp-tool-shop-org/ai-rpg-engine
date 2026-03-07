import { describe, it, expect } from 'vitest';
import { validateRulesetDefinition } from '@ai-rpg-engine/content-schema';
import { colonyMinimalRuleset } from './ruleset.js';

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
});
