import { describe, it, expect } from 'vitest';
import { SoundRegistry } from './registry.js';
import { CORE_SOUND_PACK } from './core-pack.js';

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
});
