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
    // T0-verb-honesty-content: 'barricade'/'scavenge' were flavor rows with NO
    // registered handler — the help taught verbs that bounced. They are gone;
    // brace/reposition (registered by buildCombatStack) are advertised instead.
    expect(verbIds).not.toContain('barricade');
    expect(verbIds).not.toContain('scavenge');
    expect(verbIds).toContain('brace');
    expect(verbIds).toContain('reposition');
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

  // F-e83a091f: this description was copy-pasted verbatim from starter-fantasy
  // ("40 + instinct*5 + will*2") — zombie has no 'instinct'/'will' stats at
  // all. Per buildCombatFormulas' real disengageChance formula
  // (packages/modules/src/combat-builders.ts: 40 + precision*5 + resolve*2,
  // clamped 15-90), zombie's precision/resolve stats are wits/nerve.
  it('disengage-chance formula description matches this pack\'s real stats', () => {
    const formula = zombieMinimalRuleset.formulas.find((f) => f.id === 'disengage-chance')!;
    expect(formula.description).toContain('wits');
    expect(formula.description).toContain('nerve');
    expect(formula.description).not.toContain('instinct');
    expect(formula.description).not.toContain('will');
  });
});
