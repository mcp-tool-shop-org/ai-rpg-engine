import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerPack,
  getPack,
  getAllPacks,
  filterPacks,
  getPackIds,
  getPackSummaries,
  clearRegistry,
} from './registry.js';
import type { PackEntry } from './types.js';

function makePack(overrides: Partial<PackEntry['meta']> = {}): PackEntry {
  const id = overrides.id ?? 'test-pack';
  return {
    meta: {
      id,
      name: 'Test Pack',
      tagline: 'A test pack',
      genres: ['fantasy'],
      difficulty: 'beginner',
      tones: ['dark'],
      tags: ['test'],
      engineVersion: '2.0.0',
      version: '2.0.0',
      description: 'A test starter pack.',
      narratorTone: 'test tone',
      ...overrides,
    },
    manifest: {
      id,
      title: 'Test Pack',
      version: '0.1.0',
      engineVersion: '0.1.0',
      ruleset: 'test-minimal',
      modules: [],
      contentPacks: [id],
    },
    ruleset: {
      id: 'test-minimal',
      name: 'Test Minimal',
      version: '0.1.0',
      stats: [],
      resources: [],
      verbs: [],
      formulas: [],
      defaultModules: [],
      progressionModels: [],
      contentConventions: { entityTypes: [], statusTags: [] },
    },
    createGame: () => ({} as any),
  };
}

describe('PackRegistry', () => {
  beforeEach(() => {
    clearRegistry();
  });

  it('registers and retrieves a pack', () => {
    const pack = makePack();
    registerPack(pack);
    expect(getPack('test-pack')).toBe(pack);
  });

  it('throws on duplicate registration', () => {
    registerPack(makePack());
    expect(() => registerPack(makePack())).toThrow('already registered');
  });

  it('returns undefined for unknown pack', () => {
    expect(getPack('nope')).toBeUndefined();
  });

  it('lists all packs', () => {
    registerPack(makePack({ id: 'a' }));
    registerPack(makePack({ id: 'b' }));
    expect(getAllPacks()).toHaveLength(2);
  });

  it('filters by genre', () => {
    registerPack(makePack({ id: 'a', genres: ['fantasy'] }));
    registerPack(makePack({ id: 'b', genres: ['sci-fi'] }));
    expect(filterPacks({ genre: 'fantasy' })).toHaveLength(1);
    expect(filterPacks({ genre: 'fantasy' })[0].meta.id).toBe('a');
  });

  it('filters by difficulty', () => {
    registerPack(makePack({ id: 'a', difficulty: 'beginner' }));
    registerPack(makePack({ id: 'b', difficulty: 'advanced' }));
    expect(filterPacks({ difficulty: 'advanced' })).toHaveLength(1);
  });

  it('filters by tone', () => {
    registerPack(makePack({ id: 'a', tones: ['dark', 'gritty'] }));
    registerPack(makePack({ id: 'b', tones: ['heroic'] }));
    expect(filterPacks({ tone: 'gritty' })).toHaveLength(1);
  });

  it('filters by tag', () => {
    registerPack(makePack({ id: 'a', tags: ['undead', 'dungeon'] }));
    registerPack(makePack({ id: 'b', tags: ['neon', 'hacking'] }));
    expect(filterPacks({ tag: 'dungeon' })).toHaveLength(1);
  });

  it('combines filters with AND logic', () => {
    registerPack(makePack({ id: 'a', genres: ['fantasy'], difficulty: 'beginner' }));
    registerPack(makePack({ id: 'b', genres: ['fantasy'], difficulty: 'advanced' }));
    expect(filterPacks({ genre: 'fantasy', difficulty: 'beginner' })).toHaveLength(1);
  });

  it('returns pack IDs', () => {
    registerPack(makePack({ id: 'x' }));
    registerPack(makePack({ id: 'y' }));
    expect(getPackIds()).toEqual(['x', 'y']);
  });

  it('returns pack summaries', () => {
    registerPack(makePack({ id: 'x', name: 'Pack X', tagline: 'Tagline X' }));
    const summaries = getPackSummaries();
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toEqual({
      id: 'x',
      name: 'Pack X',
      tagline: 'Tagline X',
      genres: ['fantasy'],
      difficulty: 'beginner',
    });
  });

  it('clears the registry', () => {
    registerPack(makePack());
    clearRegistry();
    expect(getAllPacks()).toHaveLength(0);
  });
});
