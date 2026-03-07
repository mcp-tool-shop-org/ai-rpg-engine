import { describe, it, expect } from 'vitest';
import { serializeBuild, deserializeBuild, validateSerializedBuild } from './serialize.js';
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
});
