import { describe, it, expect } from 'vitest';
import { validatePackRubric } from './rubric.js';
import type { PackEntry } from './types.js';

function makePack(id: string, overrides: {
  verbs?: { id: string; name: string }[];
  resources?: { id: string; name: string; min: number; max: number; default: number }[];
  genres?: PackEntry['meta']['genres'];
  tones?: PackEntry['meta']['tones'];
  tags?: string[];
  defaultModules?: string[];
} = {}): PackEntry {
  return {
    meta: {
      id,
      name: id,
      tagline: 'test',
      genres: overrides.genres ?? ['fantasy'],
      difficulty: 'beginner',
      tones: overrides.tones ?? ['dark'],
      tags: overrides.tags ?? [],
      engineVersion: '2.0.0',
      version: '2.0.0',
      description: 'test',
      narratorTone: 'test',
    },
    manifest: {
      id,
      title: id,
      version: '0.1.0',
      engineVersion: '0.1.0',
      ruleset: `${id}-minimal`,
      modules: [],
      contentPacks: [id],
    },
    ruleset: {
      id: `${id}-minimal`,
      name: `${id} Minimal`,
      version: '0.1.0',
      stats: [],
      resources: overrides.resources ?? [
        { id: 'hp', name: 'HP', min: 0, max: 100, default: 50 },
      ],
      verbs: overrides.verbs ?? [
        { id: 'move', name: 'Move' },
        { id: 'attack', name: 'Attack' },
      ],
      formulas: [],
      defaultModules: overrides.defaultModules ?? ['dialogue-core'],
      progressionModels: [],
      contentConventions: { entityTypes: [], statusTags: [] },
    },
    createGame: () => ({} as any),
  };
}

describe('validatePackRubric', () => {
  it('passes a well-differentiated pack', () => {
    const pack = makePack('good', {
      verbs: [
        { id: 'move', name: 'Move' },
        { id: 'attack', name: 'Attack' },
        { id: 'interrogate', name: 'Interrogate' },
      ],
      resources: [
        { id: 'hp', name: 'HP', min: 0, max: 100, default: 50 },
        { id: 'composure', name: 'Composure', min: 0, max: 20, default: 12 },
      ],
      genres: ['mystery'],
      tones: ['noir'],
    });
    const result = validatePackRubric(pack, [pack]);
    expect(result.ok).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(5);
  });

  it('fails a pack with only base verbs and HP', () => {
    const pack = makePack('bare', {
      verbs: [{ id: 'move', name: 'Move' }],
      resources: [{ id: 'hp', name: 'HP', min: 0, max: 100, default: 50 }],
      defaultModules: [],
    });
    const result = validatePackRubric(pack, [pack]);
    // Should fail: no distinct verbs, no distinct resource, no faction, no failure mode
    expect(result.score).toBeLessThan(5);
    expect(result.ok).toBe(false);
  });

  it('detects duplicate genre combination', () => {
    const a = makePack('a', { genres: ['fantasy'] });
    const b = makePack('b', { genres: ['fantasy'] });
    const result = validatePackRubric(b, [a, b]);
    const genreCheck = result.checks.find((c) => c.dimension === 'distinct-narrative-fantasy');
    expect(genreCheck?.passed).toBe(false);
  });

  it('detects duplicate tone set', () => {
    const a = makePack('a', { tones: ['dark', 'gritty'] });
    const b = makePack('b', { tones: ['dark', 'gritty'] });
    const result = validatePackRubric(b, [a, b]);
    const toneCheck = result.checks.find((c) => c.dimension === 'distinct-presentation-rule');
    expect(toneCheck?.passed).toBe(false);
  });

  it('always passes audio palette (soft check)', () => {
    const pack = makePack('soft');
    const result = validatePackRubric(pack, [pack]);
    const audioCheck = result.checks.find((c) => c.dimension === 'distinct-audio-palette');
    expect(audioCheck?.passed).toBe(true);
  });

  it('recognizes distinct verbs across catalog', () => {
    const a = makePack('a', { verbs: [{ id: 'move', name: 'Move' }, { id: 'pray', name: 'Pray' }] });
    const b = makePack('b', { verbs: [{ id: 'move', name: 'Move' }, { id: 'hack', name: 'Hack' }] });
    const resultA = validatePackRubric(a, [a, b]);
    const verbCheck = resultA.checks.find((c) => c.dimension === 'distinct-verbs');
    expect(verbCheck?.passed).toBe(true);
    expect(verbCheck?.detail).toContain('pray');
  });

  it('returns 7 checks total', () => {
    const pack = makePack('full');
    const result = validatePackRubric(pack, [pack]);
    expect(result.checks).toHaveLength(7);
  });
});
