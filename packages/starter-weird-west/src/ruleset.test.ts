import { describe, it, expect } from 'vitest';
import { validateRulesetDefinition } from '@ai-rpg-engine/content-schema';
import { weirdWestMinimalRuleset } from './ruleset.js';
import { weirdWestAbilities } from './content.js';

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

  // ST-03: abilities cost stamina, so the ruleset must declare stamina.
  it('declares the stamina resource used by ability costs', () => {
    const resIds = weirdWestMinimalRuleset.resources.map((r) => r.id);
    expect(resIds).toContain('stamina');
  });

  it('every ability cost resource is declared in the ruleset', () => {
    const resIds = new Set(weirdWestMinimalRuleset.resources.map((r) => r.id));
    for (const ability of weirdWestAbilities) {
      for (const cost of ability.costs ?? []) {
        expect(
          resIds.has(cost.resourceId),
          `ability "${ability.id}" costs undeclared resource "${cost.resourceId}"`,
        ).toBe(true);
      }
    }
  });

  it('declares all verbs used by starter modules', () => {
    const verbIds = weirdWestMinimalRuleset.verbs.map((v) => v.id);
    expect(verbIds).toContain('move');
    expect(verbIds).toContain('attack');
    expect(verbIds).toContain('inspect');
    expect(verbIds).toContain('speak');
    expect(verbIds).toContain('choose');
    expect(verbIds).toContain('use');
    // T0-verb-honesty-content: 'draw'/'commune' were flavor rows with NO
    // registered handler — the help taught verbs that bounced. They are gone;
    // brace/reposition (registered by buildCombatStack) are advertised instead.
    expect(verbIds).not.toContain('draw');
    expect(verbIds).not.toContain('commune');
    expect(verbIds).toContain('brace');
    expect(verbIds).toContain('reposition');
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

  // F-e83a091f: this description was copy-pasted verbatim from starter-fantasy
  // ("40 + instinct*5 + will*2") — weird-west has no 'instinct'/'will' stats
  // at all. Per buildCombatFormulas' real disengageChance formula
  // (packages/modules/src/combat-builders.ts: 40 + precision*5 + resolve*2,
  // clamped 15-90), weird-west's precision/resolve stats are draw-speed/lore.
  it('disengage-chance formula description matches this pack\'s real stats', () => {
    const formula = weirdWestMinimalRuleset.formulas.find((f) => f.id === 'disengage-chance')!;
    expect(formula.description).toContain('draw-speed');
    expect(formula.description).toContain('lore');
    expect(formula.description).not.toContain('instinct');
    expect(formula.description).not.toContain('will');
  });
});
