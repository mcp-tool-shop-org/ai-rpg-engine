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
});
