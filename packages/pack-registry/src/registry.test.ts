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
import { PACK_GENRE_LABELS, VALID_GENRES, type PackEntry } from './types.js';

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
      description: 'A test starter pack.',
      version: '2.0.0',
      genres: ['fantasy'],
      genreLabels: ['Fantasy'],
      difficulty: 'beginner',
      tones: ['dark'],
    });
  });

  it('F-7af3a342: listing labels are display names, not raw genre tokens', () => {
    registerPack(makePack({
      id: 'hue-and-cry',
      name: 'Hue and Cry',
      tagline: 'There is no law here. There is a price, and there is you.',
      genres: ['pursuit'],
      tones: ['noir', 'tense'],
    }));
    const [summary] = getPackSummaries();
    expect(summary.genres).toEqual(['pursuit']);
    expect(summary.genreLabels).toEqual(['Pursuit / thief-taker']);
    expect(summary.genreLabels).not.toContain('pursuit');
    expect(summary.tones).toEqual(['noir', 'tense']);
  });

  it('F-d58978bc: summaries carry description and version for the listing subtitle', () => {
    registerPack(makePack({
      id: 'listed',
      description: 'Explore a ruined chapel.',
      version: '3.8.0',
    }));
    const [summary] = getPackSummaries();
    expect(summary.description).toBe('Explore a ruined chapel.');
    expect(summary.version).toBe('3.8.0');
    expect(summary.tagline).toBe('A test pack');
  });

  it('F-7af3a342: every PackGenre has a display label; jargon tokens are not the listing text', () => {
    expect(Object.keys(PACK_GENRE_LABELS).sort()).toEqual([...VALID_GENRES].sort());
    expect(PACK_GENRE_LABELS.pursuit).toBe('Pursuit / thief-taker');
    expect(PACK_GENRE_LABELS.mercantile).toBe('Mercantile');
    expect(PACK_GENRE_LABELS['sci-fi']).toBe('Sci-fi');
    expect(PACK_GENRE_LABELS.pursuit).not.toBe('pursuit');
  });

  it('clears the registry', () => {
    registerPack(makePack());
    clearRegistry();
    expect(getAllPacks()).toHaveLength(0);
  });

  it('F-ff841673: refuses a missing meta.id with a structured throw naming the field', () => {
    const pack = makePack();
    (pack.meta as { id?: string }).id = '';
    expect(() => registerPack(pack)).toThrow(/meta\.id must be a non-empty string/);
    expect(() => registerPack(pack)).toThrow(/set meta\.id/);
  });

  it('F-ff841673: refuses non-array genres/tones/tags with a structured throw naming the field', () => {
    const pack = makePack({ id: 'no-genres' });
    (pack.meta as { genres?: unknown }).genres = undefined;
    expect(() => registerPack(pack)).toThrow(/meta\.genres must be an array/);
    expect(() => registerPack(pack)).toThrow(/set meta\.genres/);
  });

  it('F-ff841673: filterPacks treats a missing/non-array field as non-matching instead of throwing', () => {
    const pack = makePack({ id: 'later-mutated', genres: ['fantasy'] });
    registerPack(pack);
    (pack.meta as { genres?: unknown }).genres = undefined;
    expect(() => filterPacks({ genre: 'fantasy' })).not.toThrow();
    expect(filterPacks({ genre: 'fantasy' })).toHaveLength(0);
    (pack.meta as { tones?: unknown }).tones = 'dark';
    expect(() => filterPacks({ tone: 'dark' })).not.toThrow();
    expect(filterPacks({ tone: 'dark' })).toHaveLength(0);
  });
});
