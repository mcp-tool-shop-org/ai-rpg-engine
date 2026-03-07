import { describe, it, expect } from 'vitest';
import { validateRulesetDefinition } from '@ai-rpg-engine/content-schema';
import { detectiveMinimalRuleset } from './ruleset.js';

describe('detectiveMinimalRuleset', () => {
  it('validates against RulesetDefinition schema', () => {
    const r = validateRulesetDefinition(detectiveMinimalRuleset);
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('declares expected stats', () => {
    const statIds = detectiveMinimalRuleset.stats.map((s) => s.id);
    expect(statIds).toContain('perception');
    expect(statIds).toContain('eloquence');
    expect(statIds).toContain('grit');
  });

  it('declares expected resources', () => {
    const resIds = detectiveMinimalRuleset.resources.map((r) => r.id);
    expect(resIds).toContain('hp');
    expect(resIds).toContain('composure');
  });

  it('declares all verbs used by starter modules', () => {
    const verbIds = detectiveMinimalRuleset.verbs.map((v) => v.id);
    expect(verbIds).toContain('move');
    expect(verbIds).toContain('attack');
    expect(verbIds).toContain('inspect');
    expect(verbIds).toContain('speak');
    expect(verbIds).toContain('choose');
    expect(verbIds).toContain('use');
    expect(verbIds).toContain('interrogate');
    expect(verbIds).toContain('deduce');
  });

  it('lists all default modules', () => {
    expect(detectiveMinimalRuleset.defaultModules).toContain('traversal-core');
    expect(detectiveMinimalRuleset.defaultModules).toContain('combat-core');
  });

  it('declares combat and investigation formulas', () => {
    const formulaIds = detectiveMinimalRuleset.formulas.map((f) => f.id);
    expect(formulaIds).toContain('hit-chance');
    expect(formulaIds).toContain('damage');
    expect(formulaIds).toContain('interrogation-success');
  });
});
