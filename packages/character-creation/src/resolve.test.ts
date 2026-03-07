import { describe, it, expect } from 'vitest';
import { resolveEntity } from './resolve.js';
import { testCatalog, testRuleset, validBuild, validBuildWithDiscipline } from './test-fixtures.js';

describe('resolveEntity', () => {
  it('produces a valid EntityState from a basic build', () => {
    const entity = resolveEntity(validBuild, testCatalog, testRuleset);
    expect(entity.id).toBe('player');
    expect(entity.type).toBe('player');
    expect(entity.name).toBe('Aldric');
    expect(entity.blueprintId).toBe('warrior');
  });

  it('sets computed stats on the entity', () => {
    const entity = resolveEntity(validBuild, testCatalog, testRuleset);
    expect(entity.stats.str).toBe(9);
    expect(entity.stats.dex).toBe(5);
  });

  it('sets computed resources on the entity', () => {
    const entity = resolveEntity(validBuild, testCatalog, testRuleset);
    expect(entity.resources.hp).toBe(25);
    expect(entity.resources.mana).toBe(10);
  });

  it('collects tags from all sources', () => {
    const entity = resolveEntity(validBuild, testCatalog, testRuleset);
    expect(entity.tags).toContain('player');
    expect(entity.tags).toContain('martial');
    expect(entity.tags).toContain('disciplined');
    expect(entity.tags).toContain('curse-touched');
  });

  it('collects starting inventory', () => {
    const rogueBuild = {
      name: 'Shadow',
      archetypeId: 'rogue',
      backgroundId: 'noble',
      traitIds: ['cursed'],
    };
    const entity = resolveEntity(rogueBuild, testCatalog, testRuleset);
    expect(entity.inventory).toContain('lockpick');
    expect(entity.inventory).toContain('signet-ring');
  });

  it('stores build metadata in custom field', () => {
    const entity = resolveEntity(validBuildWithDiscipline, testCatalog, testRuleset);
    expect(entity.custom?.archetypeId).toBe('mage');
    expect(entity.custom?.backgroundId).toBe('noble');
    expect(entity.custom?.disciplineId).toBe('smuggler');
    expect(entity.custom?.portraitRef).toBe('portrait-morrigan-001');
    expect(entity.custom?.title).toBe('Relic Runner');
  });

  it('throws on invalid build', () => {
    const bad = { ...validBuild, archetypeId: 'nonexistent' };
    expect(() => resolveEntity(bad, testCatalog, testRuleset)).toThrow('Invalid build');
  });
});
