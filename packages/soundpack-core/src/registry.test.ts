import { describe, it, expect } from 'vitest';
import { SoundRegistry, diffAmbientLayers, hashRoll } from './registry.js';
import { CORE_SOUND_PACK } from './core-pack.js';
import { hashRoll as indexHashRoll } from './index.js';

describe('SoundRegistry', () => {
  it('should load the core sound pack', () => {
    const registry = new SoundRegistry();
    registry.load(CORE_SOUND_PACK);
    expect(registry.size).toBe(CORE_SOUND_PACK.entries.length);
  });

  it('should get an entry by ID', () => {
    const registry = new SoundRegistry();
    registry.load(CORE_SOUND_PACK);
    const entry = registry.get('ui_success');
    expect(entry).toBeDefined();
    expect(entry!.voiceSoundboardEffect).toBe('chime_success');
  });

  it('should query by domain', () => {
    const registry = new SoundRegistry();
    registry.load(CORE_SOUND_PACK);
    const ambient = registry.query({ domain: 'ambient' });
    expect(ambient.length).toBeGreaterThan(0);
    expect(ambient.every((e) => e.domain === 'ambient')).toBe(true);
  });

  it('should query by tags', () => {
    const registry = new SoundRegistry();
    registry.load(CORE_SOUND_PACK);
    const alerts = registry.query({ tags: ['alert'] });
    expect(alerts.length).toBeGreaterThan(0);
  });

  it('should query by mood', () => {
    const registry = new SoundRegistry();
    registry.load(CORE_SOUND_PACK);
    const tense = registry.query({ mood: ['dread'] });
    expect(tense.length).toBeGreaterThan(0);
  });

  it('should return undefined for missing ID', () => {
    const registry = new SoundRegistry();
    registry.load(CORE_SOUND_PACK);
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('should list all IDs', () => {
    const registry = new SoundRegistry();
    registry.load(CORE_SOUND_PACK);
    const ids = registry.getIds();
    expect(ids).toContain('ui_success');
    expect(ids).toContain('ambient_drone');
  });

  // SIBLING (determinism): variant selection must be reproducible.
  describe('deterministic variant selection', () => {
    const VARIANT_PACK = {
      name: 'variant-test',
      version: '1.0.0',
      description: 'fixture with multi-variant entries',
      author: 'test',
      entries: [
        {
          id: 'multi',
          tags: ['t'],
          domain: 'sfx' as const,
          intensity: 'low' as const,
          mood: ['neutral'],
          durationClass: 'oneshot' as const,
          cooldownMs: 0,
          variants: ['a.wav', 'b.wav', 'c.wav', 'd.wav'],
          source: 'file' as const,
        },
      ],
    };

    it('pickVariant(roll) maps a deterministic roll to a stable variant index', () => {
      const registry = new SoundRegistry();
      registry.load(VARIANT_PACK);
      // roll in [0,1) selects floor(roll * len). Same roll ⇒ same variant, every time.
      expect(registry.pickVariant('multi', 0)).toBe('a.wav');
      expect(registry.pickVariant('multi', 0.25)).toBe('b.wav');
      expect(registry.pickVariant('multi', 0.5)).toBe('c.wav');
      expect(registry.pickVariant('multi', 0.99)).toBe('d.wav');
      // Repeat call with identical roll yields identical result (no hidden RNG).
      expect(registry.pickVariant('multi', 0.25)).toBe('b.wav');
    });

    it('pickVariant(roll=1) clamps to the last variant rather than overflowing', () => {
      const registry = new SoundRegistry();
      registry.load(VARIANT_PACK);
      expect(registry.pickVariant('multi', 1)).toBe('d.wav');
    });

    it('pickVariant returns undefined for missing entry or empty variants', () => {
      const registry = new SoundRegistry();
      registry.load(VARIANT_PACK);
      registry.load(CORE_SOUND_PACK);
      expect(registry.pickVariant('nonexistent', 0)).toBeUndefined();
      // ambient_drone has no variants in the core pack.
      expect(registry.pickVariant('ambient_drone', 0)).toBeUndefined();
    });
  });

  describe('pickAmbientBed + diffAmbientLayers (F-57203b5e)', () => {
    it('pickAmbientBed indexes id-sorted ambient loops like pickVariant', () => {
      const registry = new SoundRegistry();
      registry.load(CORE_SOUND_PACK);
      const first = registry.pickAmbientBed({}, 0);
      const last = registry.pickAmbientBed({}, 1);
      expect(first?.id).toBe('ambient_drone');
      expect(last?.id).toBe('ambient_white_noise');
      expect(registry.pickAmbientBed({ mood: ['dread'] }, 0)?.id).toBe('ambient_drone');
      expect(registry.pickAmbientBed({ tags: ['weather'] }, 0)?.id).toBe('ambient_rain');
      expect(registry.pickAmbientBed({ mood: ['nope'] }, 0)).toBeUndefined();
    });

    it('pickMusicStem indexes id-sorted music loops like pickAmbientBed (F-768980bb)', () => {
      const registry = new SoundRegistry();
      registry.load(CORE_SOUND_PACK);
      const first = registry.pickMusicStem({}, 0);
      const last = registry.pickMusicStem({}, 1);
      expect(first?.id).toBe('music_calm');
      expect(last?.id).toBe('music_triumph');
      expect(registry.pickMusicStem({ mood: ['dread'] }, 0)?.id).toBe('music_dread');
      expect(registry.pickMusicStem({ mood: ['triumph'] }, 0)?.id).toBe('music_triumph');
      expect(registry.pickMusicStem({ mood: ['nope'] }, 0)).toBeUndefined();
      expect(registry.pickAmbientBed({ mood: ['dread'] }, 0)?.id).toBe('ambient_drone');
    });

    it('pickMusicSting indexes id-sorted music oneshots — the inverse filter of pickMusicStem (F-fa44e956)', () => {
      const registry = new SoundRegistry();
      registry.load(CORE_SOUND_PACK);
      const first = registry.pickMusicSting({}, 0);
      const last = registry.pickMusicSting({}, 1);
      // id-sorted: 'music_defeat_sting' < 'music_retreat_sting' < 'music_victory_sting'.
      expect(first?.id).toBe('music_defeat_sting');
      expect(last?.id).toBe('music_victory_sting');
      expect(first?.durationClass).toBe('oneshot');
      expect(registry.pickMusicSting({ mood: ['nope'] }, 0)).toBeUndefined();
      // Loop stems never satisfy a sting query, and vice versa — the two
      // pickers partition CORE_SOUND_PACK's music domain by durationClass.
      expect(registry.pickMusicSting({ mood: ['calm'] }, 0)).toBeUndefined();
    });

    it('pickMusicStem and pickMusicSting partition the music domain — no id sees both', () => {
      const registry = new SoundRegistry();
      registry.load(CORE_SOUND_PACK);
      const stems = new Set<string>();
      const stings = new Set<string>();
      for (const roll of [0, 0.25, 0.5, 0.75, 1]) {
        const stem = registry.pickMusicStem({}, roll);
        const sting = registry.pickMusicSting({}, roll);
        if (stem) stems.add(stem.id);
        if (sting) stings.add(sting.id);
      }
      for (const id of stems) expect(stings.has(id)).toBe(false);
    });

    it('hashRoll is FNV-1a 32-bit / 2^32 into [0, 1), deterministic per id (F-cf6a6952)', () => {
      expect(hashRoll('crypt-chamber')).toBeGreaterThanOrEqual(0);
      expect(hashRoll('crypt-chamber')).toBeLessThan(1);
      expect(hashRoll('crypt-chamber')).toBe(hashRoll('crypt-chamber'));
      expect(hashRoll('crypt-chamber')).toBe(0.9062919542193413);
      expect(hashRoll('graveyard')).toBe(0.8636932238005102);
      expect(hashRoll('crypt-chamber')).not.toBe(hashRoll('graveyard'));
      expect(indexHashRoll).toBe(hashRoll);
      // Behavior-neutral on a 1-match list: any zone hash still picks the only dread stem.
      const registry = new SoundRegistry();
      registry.load(CORE_SOUND_PACK);
      expect(registry.pickMusicStem({ mood: ['dread'] }, hashRoll('crypt-chamber'))?.id).toBe('music_dread');
      expect(registry.pickMusicStem({ mood: ['dread'] }, hashRoll('graveyard'))?.id).toBe('music_dread');
    });

    it('diffAmbientLayers emits start/stop against getActiveLayers-shaped maps', () => {
      const active = new Map([
        ['ambient_rain', { domain: 'ambient' as const, resourceId: 'ambient_rain' }],
        ['theme_a', { domain: 'music' as const, resourceId: 'theme_a' }],
      ]);
      expect(diffAmbientLayers(['ambient_drone', 'ambient_rain'], active)).toEqual({
        start: ['ambient_drone'],
        stop: [],
      });
      expect(diffAmbientLayers(['ambient_drone'], ['ambient_rain', 'ambient_white_noise'])).toEqual({
        start: ['ambient_drone'],
        stop: ['ambient_rain', 'ambient_white_noise'],
      });
    });
  });

  // SND-001: load() used to silently set() each entry, so a duplicate id (either
  // within one manifest or across two loads) overwrote without warning, and a
  // malformed manifest was accepted as-is. Per WARN-AND-DEGRADE, load now reports
  // structured warnings naming the collision (and which entry wins) and can
  // optionally run validateManifest — it still degrades (keeps loading) rather
  // than throwing on a consumer mistake.
  describe('duplicate-id and validation reporting (SND-001)', () => {
    const entry = (id: string, tag: string) => ({
      id,
      tags: [tag],
      domain: 'sfx' as const,
      intensity: 'low' as const,
      mood: ['neutral'],
      durationClass: 'oneshot' as const,
      cooldownMs: 0,
      variants: [`${tag}.wav`],
      source: 'file' as const,
    });

    it('reports a duplicate id within a single manifest, naming the collision', () => {
      const registry = new SoundRegistry();
      const result = registry.load({
        name: 'dup-pack',
        version: '1.0.0',
        description: 'has a duplicate id',
        author: 'test',
        entries: [entry('boom', 'first'), entry('boom', 'second')],
      });

      const dup = result.warnings.find((w) => w.message.includes('boom'));
      expect(dup).toBeDefined();
      expect(dup!.field).toContain('boom');
      // The later entry wins (last-write), and the warning says so.
      expect(registry.get('boom')!.tags).toContain('second');
    });

    it('reports a duplicate id across two separate load() calls', () => {
      const registry = new SoundRegistry();
      registry.load({
        name: 'pack-a',
        version: '1.0.0',
        description: 'a',
        author: 'test',
        entries: [entry('shared', 'from-a')],
      });
      const second = registry.load({
        name: 'pack-b',
        version: '1.0.0',
        description: 'b',
        author: 'test',
        entries: [entry('shared', 'from-b')],
      });

      expect(second.warnings.some((w) => w.message.includes('shared'))).toBe(true);
      expect(registry.get('shared')!.tags).toContain('from-b');
    });

    it('returns no warnings for a clean manifest', () => {
      const registry = new SoundRegistry();
      const result = registry.load({
        name: 'clean',
        version: '1.0.0',
        description: 'clean',
        author: 'test',
        entries: [entry('a', 'ta'), entry('b', 'tb')],
      });
      expect(result.warnings).toEqual([]);
      expect(result.loaded).toBe(2);
    });

    it('surfaces validateManifest errors as warnings when { validate: true }', () => {
      const registry = new SoundRegistry();
      const malformed = {
        name: 'bad',
        version: '1.0.0',
        description: 'malformed entry',
        author: 'test',
        // domain is invalid; validateManifest should flag it.
        entries: [{ ...entry('x', 'tx'), domain: 'not-a-domain' }],
      };
      const result = registry.load(malformed as unknown as Parameters<SoundRegistry['load']>[0], { validate: true });
      expect(result.warnings.some((w) => /domain/.test(w.message))).toBe(true);
    });

    it('does not run validateManifest unless asked (default behavior unchanged)', () => {
      const registry = new SoundRegistry();
      const malformed = {
        name: 'bad',
        version: '1.0.0',
        description: 'malformed entry',
        author: 'test',
        entries: [{ ...entry('x', 'tx'), domain: 'not-a-domain' }],
      };
      const result = registry.load(malformed as unknown as Parameters<SoundRegistry['load']>[0]);
      // No validate flag → no schema warnings (only duplicate-id detection runs).
      expect(result.warnings.some((w) => /domain/.test(w.message))).toBe(false);
    });

    // F-833dedfc: the JSDoc on LoadResult.loaded promises "Number of entries
    // written into the registry by this call," but load() used to return the
    // raw `manifest.entries.length` instead of counting actual writes. A
    // malformed (non-object) entry is skipped — warned, but never written —
    // so `loaded` overstated the real count by exactly the number of skipped
    // entries. This is most likely to bite when opts.validate is used, i.e.
    // precisely the untrusted/third-party-pack case the option exists for.
    it('loaded counts entries actually written, not the raw entries.length, when an entry is skipped', () => {
      const registry = new SoundRegistry();
      const malformedPack = {
        name: 'mixed-pack',
        version: '1.0.0',
        description: 'one good entry, two malformed (non-object) entries',
        author: 'test',
        entries: [entry('good', 'tag'), null, 'not-an-object'],
      };
      const result = registry.load(malformedPack as unknown as Parameters<SoundRegistry['load']>[0]);

      // Only the one well-formed entry was actually written.
      expect(registry.size).toBe(1);
      expect(result.loaded).toBe(1);
      // Not the raw array length (3) — what the pre-fix code returned.
      expect(result.loaded).not.toBe(malformedPack.entries.length);
      expect(result.warnings.filter((w) => w.field === 'entries[]')).toHaveLength(2);
    });
  });

  // F-74ba230b: load() stored the caller's object; get/query returned it.
  // Mutating a pack constant or a query result poisoned later lookups.
  describe('entry isolation (F-74ba230b)', () => {
    const entry = (id: string, tag: string) => ({
      id,
      tags: [tag],
      domain: 'sfx' as const,
      intensity: 'low' as const,
      mood: ['neutral'],
      durationClass: 'oneshot' as const,
      cooldownMs: 0,
      variants: [`${tag}.wav`],
      source: 'file' as const,
    });

    it('load(), mutate the input entry and a query() result, get() is unchanged', () => {
      const registry = new SoundRegistry();
      const input = entry('boom', 'first');
      registry.load({
        name: 'iso',
        version: '1.0.0',
        description: 'isolation',
        author: 'test',
        entries: [input],
      });

      input.tags.push('poison');
      input.mood.push('dread');
      expect(registry.get('boom')!.tags).toEqual(['first']);
      expect(registry.get('boom')!.mood).toEqual(['neutral']);
      expect(registry.query({ tags: ['poison'] })).toHaveLength(0);

      const queried = registry.query({ tags: ['first'] });
      queried[0].tags.push('poison');
      queried[0].mood.push('dread');
      queried[0].variants.push('evil.wav');
      expect(registry.get('boom')!.tags).toEqual(['first']);
      expect(registry.get('boom')!.mood).toEqual(['neutral']);
      expect(registry.get('boom')!.variants).toEqual(['first.wav']);
      expect(registry.query({ tags: ['poison'] })).toHaveLength(0);
    });
  });
});
