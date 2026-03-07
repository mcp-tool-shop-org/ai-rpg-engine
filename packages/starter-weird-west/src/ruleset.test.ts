import { describe, it, expect } from 'vitest';
import { validateRulesetDefinition } from '@ai-rpg-engine/content-schema';
import { weirdWestMinimalRuleset } from './ruleset.js';

describe('weirdWestMinimalRuleset', () => {
  it('validates against RulesetDefinition schema', () => {
    const r = validateRulesetDefinition(weirdWestMinimalRuleset);
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('declares expected stats', () => {
    const statIds = weirdWestMinimalRuleset.stats.map((s) => s.id);
    expect(statIds).toContain('grit');
    expect(statIds).toContain('draw-speed');
    expect(statIds).toContain('lore');
  });

  it('declares expected resources', () => {
    const resIds = weirdWestMinimalRuleset.resources.map((r) => r.id);
    expect(resIds).toContain('hp');
    expect(resIds).toContain('resolve');
    expect(resIds).toContain('dust');
  });

  it('declares all verbs used by starter modules', () => {
    const verbIds = weirdWestMinimalRuleset.verbs.map((v) => v.id);
    expect(verbIds).toContain('move');
    expect(verbIds).toContain('attack');
    expect(verbIds).toContain('inspect');
    expect(verbIds).toContain('speak');
    expect(verbIds).toContain('choose');
    expect(verbIds).toContain('use');
    expect(verbIds).toContain('draw');
    expect(verbIds).toContain('commune');
  });

  it('lists all default modules', () => {
    expect(weirdWestMinimalRuleset.defaultModules).toContain('traversal-core');
    expect(weirdWestMinimalRuleset.defaultModules).toContain('combat-core');
  });

  it('declares combat and commune formulas', () => {
    const formulaIds = weirdWestMinimalRuleset.formulas.map((f) => f.id);
    expect(formulaIds).toContain('hit-chance');
    expect(formulaIds).toContain('damage');
    expect(formulaIds).toContain('commune-success');
  });
});
