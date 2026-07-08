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
  districts?: { id: string; controllingFaction?: string }[];
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
    districts: overrides.districts,
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
      districts: [{ id: 'old-quarter', controllingFaction: 'the-syndicate' }],
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

  // --- D1 meta-tests: faction topology must inspect real faction data ---

  it('D1 meta: a pack with dialogue-core but zero factions FAILS faction topology', () => {
    // Mutation under test: the pack declares the dialogue module (the field the
    // old check wrongly inspected) but defines no districts and no factions.
    const pack = makePack('dialogue-only', { defaultModules: ['dialogue-core'] });
    const result = validatePackRubric(pack, [pack]);
    const check = result.checks.find((c) => c.dimension === 'distinct-faction-topology');
    expect(check?.passed).toBe(false);
    // The detail string must describe what was actually inspected — not dialogue.
    expect(check?.detail.toLowerCase()).not.toContain('dialogue');
  });

  it('D1: districts without any controllingFaction still fail faction topology', () => {
    const pack = makePack('unclaimed', {
      districts: [{ id: 'wilds' }, { id: 'ruins' }],
    });
    const result = validatePackRubric(pack, [pack]);
    const check = result.checks.find((c) => c.dimension === 'distinct-faction-topology');
    expect(check?.passed).toBe(false);
  });

  it('D1: passes faction topology when a district declares a controlling faction, and the detail names it', () => {
    const pack = makePack('factioned', {
      districts: [
        { id: 'docks', controllingFaction: 'smugglers' },
        { id: 'temple' },
      ],
    });
    const result = validatePackRubric(pack, [pack]);
    const check = result.checks.find((c) => c.dimension === 'distinct-faction-topology');
    expect(check?.passed).toBe(true);
    expect(check?.detail).toContain('smugglers');
  });

  // --- D6: cross-catalog uniqueness must actually consult the catalog ---

  it('D6: fails distinct-verbs when every non-base verb is shared with another pack', () => {
    const a = makePack('a', {
      verbs: [{ id: 'move', name: 'Move' }, { id: 'duel', name: 'Duel' }],
    });
    const b = makePack('b', {
      verbs: [{ id: 'move', name: 'Move' }, { id: 'duel', name: 'Duel' }],
    });
    const result = validatePackRubric(a, [a, b]);
    const check = result.checks.find((c) => c.dimension === 'distinct-verbs');
    expect(check?.passed).toBe(false);
  });

  it('D6: fails distinct-failure-mode when the failure resource is shared with another pack', () => {
    const shared = [
      { id: 'hp', name: 'HP', min: 0, max: 100, default: 50 },
      { id: 'corruption', name: 'Corruption', min: 0, max: 10, default: 0 },
    ];
    const a = makePack('a', { resources: shared });
    const b = makePack('b', { resources: shared });
    const result = validatePackRubric(a, [a, b]);
    const check = result.checks.find((c) => c.dimension === 'distinct-failure-mode');
    expect(check?.passed).toBe(false);
  });

  it('D6: passes distinct-failure-mode when the pack has a failure resource no other pack shares', () => {
    const a = makePack('a', {
      resources: [
        { id: 'hp', name: 'HP', min: 0, max: 100, default: 50 },
        { id: 'corruption', name: 'Corruption', min: 0, max: 10, default: 0 },
      ],
    });
    const b = makePack('b', {
      resources: [
        { id: 'hp', name: 'HP', min: 0, max: 100, default: 50 },
        { id: 'suspicion', name: 'Suspicion', min: 0, max: 10, default: 0 },
      ],
    });
    const result = validatePackRubric(a, [a, b]);
    const check = result.checks.find((c) => c.dimension === 'distinct-failure-mode');
    expect(check?.passed).toBe(true);
  });
});
