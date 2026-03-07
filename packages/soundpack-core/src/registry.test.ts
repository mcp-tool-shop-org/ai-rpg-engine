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
});
