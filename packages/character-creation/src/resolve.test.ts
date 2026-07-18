import { describe, it, expect } from 'vitest';
import { resolveEntity, BuildResolutionError } from './resolve.js';
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

// core-spine F-6c1a8f3d: resolveEntity threw a plain `Error` — the ONE
// unstructured error boundary in a package family where every sibling carries
// a machine-readable code + hint (core's SaveLoadError/ManifestError, this
// package's own BuildLoadError, cli's [CODE]-prefixed messages). A caller
// other than the CLI (GUI, test harness, programmatic pipeline) could only
// pattern-match the message string. These pin the structured shape — without
// changing the message, so existing `.toThrow('Invalid build')` callers and
// string-matchers keep working.
describe('resolveEntity — structured BuildResolutionError (F-6c1a8f3d)', () => {
  it('throws BuildResolutionError with code BUILD_INVALID and the raw errors as structured detail', () => {
    const bad = { ...validBuild, archetypeId: 'nonexistent' };
    try {
      resolveEntity(bad, testCatalog, testRuleset);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(BuildResolutionError);
      const err = e as BuildResolutionError;
      expect(err.code).toBe('BUILD_INVALID');
      expect(err.name).toBe('BuildResolutionError');
      // Structured detail: the raw validation errors, NOT just a joined string.
      expect(Array.isArray(err.details)).toBe(true);
      expect(err.details.some((d) => d.includes('nonexistent'))).toBe(true);
      expect(err.hint).toBeTruthy();
      // Message format unchanged (back-compat with message-matching callers).
      expect(err.message).toContain('Invalid build:');
    }
  });

  it('carries EVERY validation error in details, not only the first', () => {
    const bad = {
      ...validBuild,
      name: '',
      traitIds: ['no-such-trait'],
    };
    try {
      resolveEntity(bad, testCatalog, testRuleset);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(BuildResolutionError);
      const err = e as BuildResolutionError;
      expect(err.details.length).toBeGreaterThan(1);
      expect(err.details.some((d) => d.includes('no-such-trait'))).toBe(true);
      expect(err.details.some((d) => d.toLowerCase().includes('name'))).toBe(true);
    }
  });

  it('is still an Error (instanceof + throwable through generic catch paths)', () => {
    const bad = { ...validBuild, archetypeId: 'nonexistent' };
    try {
      resolveEntity(bad, testCatalog, testRuleset);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
    }
  });
});
