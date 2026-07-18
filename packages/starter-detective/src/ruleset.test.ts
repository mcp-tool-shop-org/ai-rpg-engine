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

  // F-e83a091f: this description was copy-pasted verbatim from starter-fantasy
  // ("40 + instinct*5 + will*2") — detective has no 'instinct'/'will' stats at
  // all. Per buildCombatFormulas' real disengageChance formula
  // (packages/modules/src/combat-builders.ts: 40 + precision*5 + resolve*2,
  // clamped 15-90), detective's precision/resolve stats are perception/eloquence.
  it('disengage-chance formula description matches this pack\'s real stats', () => {
    const formula = detectiveMinimalRuleset.formulas.find((f) => f.id === 'disengage-chance')!;
    expect(formula.description).toContain('perception');
    expect(formula.description).toContain('eloquence');
    expect(formula.description).not.toContain('instinct');
    expect(formula.description).not.toContain('will');
  });
});
