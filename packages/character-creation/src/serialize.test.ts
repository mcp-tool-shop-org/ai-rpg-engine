import { describe, it, expect } from 'vitest';
import { serializeBuild, deserializeBuild, validateSerializedBuild, BuildLoadError } from './serialize.js';
import { BUILD_VERSION } from './types.js';
import { validBuild, validBuildWithDiscipline } from './test-fixtures.js';

describe('serializeBuild', () => {
  it('produces valid JSON', () => {
    const json = serializeBuild(validBuild);
    expect(() => JSON.parse(json)).not.toThrow();
  });
});

describe('deserializeBuild', () => {
  it('round-trips a basic build', () => {
    const json = serializeBuild(validBuild);
    const restored = deserializeBuild(json);
    expect(restored.name).toBe(validBuild.name);
    expect(restored.archetypeId).toBe(validBuild.archetypeId);
    expect(restored.backgroundId).toBe(validBuild.backgroundId);
    expect(restored.traitIds).toEqual(validBuild.traitIds);
    expect(restored.statAllocations).toEqual(validBuild.statAllocations);
  });

  it('round-trips a build with discipline and portrait', () => {
    const json = serializeBuild(validBuildWithDiscipline);
    const restored = deserializeBuild(json);
    expect(restored.disciplineId).toBe('smuggler');
    expect(restored.portraitRef).toBe('portrait-morrigan-001');
  });

  it('throws on invalid JSON', () => {
    expect(() => deserializeBuild('not json')).toThrow();
  });

  it('throws on missing required fields', () => {
    expect(() => deserializeBuild('{}')).toThrow('Invalid build JSON');
  });

  it('D7: does not leak a raw SyntaxError on malformed JSON', () => {
    let caught: unknown;
    try {
      deserializeBuild('not json');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect(caught).not.toBeInstanceOf(SyntaxError);
  });

  it('D7: throws a structured BuildLoadError with code + hint on malformed JSON', () => {
    let caught: unknown;
    try {
      deserializeBuild('not json');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(BuildLoadError);
    const err = caught as BuildLoadError;
    expect(err.code).toBe('BUILD_MALFORMED');
    expect(err.message).toContain('Invalid build JSON');
    expect(err.hint.length).toBeGreaterThan(0);
  });

  it('D7: stamps the schema version on serialize', () => {
    const json = serializeBuild(validBuild);
    expect(JSON.parse(json).version).toBe(BUILD_VERSION);
  });

  it('D7: stamps legacy builds (no version field) with the current schema version', () => {
    const legacy = JSON.stringify({
      name: 'X',
      archetypeId: 'a',
      backgroundId: 'b',
      traitIds: [],
    });
    const restored = deserializeBuild(legacy);
    expect(restored.version).toBe(BUILD_VERSION);
  });

  it('D7: rejects a build from a newer schema version with BUILD_VERSION_UNSUPPORTED', () => {
    const future = JSON.stringify({
      name: 'X',
      archetypeId: 'a',
      backgroundId: 'b',
      traitIds: [],
      version: BUILD_VERSION + 1,
    });
    let caught: unknown;
    try {
      deserializeBuild(future);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(BuildLoadError);
    expect((caught as BuildLoadError).code).toBe('BUILD_VERSION_UNSUPPORTED');
  });

  it('D7: round-trip preserves the stamped version', () => {
    const restored = deserializeBuild(serializeBuild(validBuild));
    expect(restored.version).toBe(BUILD_VERSION);
  });
});

describe('validateSerializedBuild', () => {
  it('accepts valid build JSON', () => {
    const json = serializeBuild(validBuild);
    const r = validateSerializedBuild(json);
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('rejects invalid JSON', () => {
    const r = validateSerializedBuild('{{bad');
    expect(r.ok).toBe(false);
    expect(r.errors).toContain('Invalid JSON');
  });

  it('rejects non-object root', () => {
    const r = validateSerializedBuild('"string"');
    expect(r.ok).toBe(false);
    expect(r.errors).toContain('Root must be an object');
  });

  it('reports missing fields', () => {
    const r = validateSerializedBuild('{"name": "X"}');
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('archetypeId'))).toBe(true);
    expect(r.errors.some((e) => e.includes('backgroundId'))).toBe(true);
    expect(r.errors.some((e) => e.includes('traitIds'))).toBe(true);
  });

  it('rejects wrong types', () => {
    const r = validateSerializedBuild(JSON.stringify({
      name: 123,
      archetypeId: 'a',
      backgroundId: 'b',
      traitIds: 'not-array',
    }));
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('name must be a string'))).toBe(true);
    expect(r.errors.some((e) => e.includes('traitIds must be an array'))).toBe(true);
  });

  it('validates statAllocations shape', () => {
    const r = validateSerializedBuild(JSON.stringify({
      name: 'X',
      archetypeId: 'a',
      backgroundId: 'b',
      traitIds: [],
      statAllocations: { str: 'not-number' },
    }));
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('statAllocations.str'))).toBe(true);
  });

  it('D7: rejects a non-numeric version field', () => {
    const r = validateSerializedBuild(JSON.stringify({
      name: 'X',
      archetypeId: 'a',
      backgroundId: 'b',
      traitIds: [],
      version: '2',
    }));
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('version must be a number'))).toBe(true);
  });

  it('D7: accepts a valid current-version build', () => {
    const r = validateSerializedBuild(serializeBuild(validBuild));
    expect(r.ok).toBe(true);
  });
});
