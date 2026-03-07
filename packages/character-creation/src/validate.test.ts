import { describe, it, expect } from 'vitest';
import { validateBuild } from './validate.js';
import { testCatalog, testRuleset, validBuild, validBuildWithDiscipline } from './test-fixtures.js';

describe('validateBuild', () => {
  it('accepts a valid build', () => {
    const r = validateBuild(validBuild, testCatalog, testRuleset);
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('computes final stats from archetype + background + traits + allocations', () => {
    const r = validateBuild(validBuild, testCatalog, testRuleset);
    // warrior: str 6, dex 4, wis 2
    // military: str +1, wis -1
    // tough: no stat effect
    // cursed: wis -1
    // allocations: str +2, dex +1
    expect(r.finalStats.str).toBe(9);  // 6+1+2
    expect(r.finalStats.dex).toBe(5);  // 4+1
    expect(r.finalStats.wis).toBe(1);  // 2-1-1=0, clamped to min 1
  });

  it('computes final resources from ruleset defaults + traits', () => {
    const r = validateBuild(validBuild, testCatalog, testRuleset);
    // hp default 20, tough +5 = 25 (cursed has no resource effect)
    expect(r.finalResources.hp).toBe(25);
    expect(r.finalResources.mana).toBe(10);
  });

  it('applies archetype resource overrides', () => {
    const mageBuild = { ...validBuild, archetypeId: 'mage', traitIds: ['cursed'] };
    const r = validateBuild(mageBuild, testCatalog, testRuleset);
    expect(r.finalResources.mana).toBe(20);  // overridden from 10 to 20
  });

  it('rejects unknown archetype', () => {
    const bad = { ...validBuild, archetypeId: 'paladin' };
    const r = validateBuild(bad, testCatalog, testRuleset);
    expect(r.ok).toBe(false);
    expect(r.errors).toContain('Unknown archetype: paladin');
  });

  it('rejects unknown background', () => {
    const bad = { ...validBuild, backgroundId: 'dragon-born' };
    const r = validateBuild(bad, testCatalog, testRuleset);
    expect(r.ok).toBe(false);
    expect(r.errors).toContain('Unknown background: dragon-born');
  });

  it('rejects unknown trait', () => {
    const bad = { ...validBuild, traitIds: ['tough', 'nonexistent', 'frail'] };
    const r = validateBuild(bad, testCatalog, testRuleset);
    expect(r.ok).toBe(false);
    expect(r.errors).toContain('Unknown trait: nonexistent');
  });

  it('rejects too many traits', () => {
    const bad = { ...validBuild, traitIds: ['tough', 'quick', 'frail', 'cursed'] };
    const r = validateBuild(bad, testCatalog, testRuleset);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/Too many traits/);
  });

  it('rejects insufficient flaws', () => {
    const bad = { ...validBuild, traitIds: ['tough', 'quick'] };
    const r = validateBuild(bad, testCatalog, testRuleset);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/Not enough flaws/);
  });

  it('detects incompatible traits', () => {
    const bad = { ...validBuild, traitIds: ['tough', 'frail'] };
    // frail is incompatible with tough
    const r = validateBuild(bad, testCatalog, testRuleset);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('Incompatible traits'))).toBe(true);
  });

  it('rejects stat budget overflow', () => {
    const bad = { ...validBuild, statAllocations: { str: 2, dex: 2 } };
    const r = validateBuild(bad, testCatalog, testRuleset);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('Stat budget exceeded'))).toBe(true);
  });

  it('rejects empty name', () => {
    const bad = { ...validBuild, name: '' };
    const r = validateBuild(bad, testCatalog, testRuleset);
    expect(r.ok).toBe(false);
    expect(r.errors).toContain('Character name is required');
  });

  it('rejects unknown discipline', () => {
    const bad = { ...validBuild, disciplineId: 'necromancer' };
    const r = validateBuild(bad, testCatalog, testRuleset);
    expect(r.ok).toBe(false);
    expect(r.errors).toContain('Unknown discipline: necromancer');
  });

  it('applies discipline passive and drawback effects', () => {
    const r = validateBuild(validBuildWithDiscipline, testCatalog, testRuleset);
    // mage: str 2, dex 3, wis 7
    // noble: wis +1, str -1 → str 1, wis 8
    // quick: dex +1 → dex 4
    // cursed: wis -1 → wis 7
    // smuggler passive: dex +1 → dex 5
    // smuggler drawback: faction effect (no stat change)
    expect(r.finalStats.dex).toBe(5);
    expect(r.finalStats.wis).toBe(7);
  });

  it('resolves cross-discipline title', () => {
    const r = validateBuild(validBuildWithDiscipline, testCatalog, testRuleset);
    expect(r.resolvedTitle).toBe('Relic Runner');
  });

  it('reports entanglement warnings', () => {
    const r = validateBuild(validBuildWithDiscipline, testCatalog, testRuleset);
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.warnings[0]).toMatch(/Entanglement/);
    expect(r.resolvedTags).toContain('wanted');
  });

  it('collects tags from archetype, background, traits, discipline', () => {
    const r = validateBuild(validBuildWithDiscipline, testCatalog, testRuleset);
    expect(r.resolvedTags).toContain('player');
    expect(r.resolvedTags).toContain('arcane');    // archetype
    expect(r.resolvedTags).toContain('noble');     // background
    expect(r.resolvedTags).toContain('curse-touched');  // trait
    expect(r.resolvedTags).toContain('relic-runner');    // title
  });

  it('clamps stats to ruleset bounds', () => {
    const maxedBuild = {
      ...validBuild,
      statAllocations: { str: 3 },
      traitIds: ['cursed'],
    };
    const r = validateBuild(maxedBuild, testCatalog, testRuleset);
    // warrior str 6 + military str +1 + alloc 3 = 10 (max)
    expect(r.finalStats.str).toBe(10);
    // warrior wis 2 + military wis -1 + cursed wis -1 = 0, clamped to min 1
    expect(r.finalStats.wis).toBe(1);
  });
});
