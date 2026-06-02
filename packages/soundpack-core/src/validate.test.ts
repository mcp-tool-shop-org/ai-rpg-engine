import { describe, it, expect } from 'vitest';
import { validateManifest, isValidManifest } from './validate.js';
import { CORE_SOUND_PACK } from './core-pack.js';

/** A minimal valid entry; spread + override per test. */
const validEntry = () => ({
  id: 'ok',
  tags: ['t'],
  domain: 'sfx',
  intensity: 'low',
  mood: ['neutral'],
  durationClass: 'oneshot',
  cooldownMs: 0,
  variants: [],
  source: 'file',
});

const wrap = (entries: unknown[]) => ({
  name: 'p',
  version: '1.0.0',
  description: 'd',
  author: 'a',
  entries,
});

describe('validateManifest', () => {
  it('accepts the built-in core sound pack', () => {
    expect(validateManifest(CORE_SOUND_PACK)).toEqual([]);
    expect(isValidManifest(CORE_SOUND_PACK)).toBe(true);
  });

  it('accepts a hand-built valid manifest', () => {
    expect(validateManifest(wrap([validEntry()]))).toEqual([]);
  });

  it('rejects a non-object manifest', () => {
    expect(validateManifest(null).length).toBeGreaterThan(0);
    expect(validateManifest('nope').length).toBeGreaterThan(0);
    expect(validateManifest(42).length).toBeGreaterThan(0);
  });

  it('rejects entries that is not an array', () => {
    const errs = validateManifest({ name: 'p', version: '1', description: 'd', author: 'a', entries: 'oops' });
    expect(errs.some((e) => e.field === 'entries')).toBe(true);
  });

  // PM-03: the validator is the untrusted-input boundary. It must REJECT (not crash on,
  // and not silently accept) malformed entry shapes.

  it('does not throw and reports an error when an entry is null', () => {
    let errs;
    // Before the fix this throws "Cannot read properties of null (reading 'id')".
    expect(() => {
      errs = validateManifest(wrap([null]));
    }).not.toThrow();
    expect(errs!.length).toBeGreaterThan(0);
    expect(errs!.some((e) => e.field === 'entries[0]')).toBe(true);
  });

  it('does not throw and reports an error when an entry is a primitive', () => {
    let errs;
    expect(() => {
      errs = validateManifest(wrap(['just-a-string', 7]));
    }).not.toThrow();
    expect(errs!.some((e) => e.field === 'entries[0]')).toBe(true);
    expect(errs!.some((e) => e.field === 'entries[1]')).toBe(true);
  });

  it('rejects a non-array tags field', () => {
    const errs = validateManifest(wrap([{ ...validEntry(), tags: 'ui' }]));
    expect(errs.some((e) => e.field === 'entries[0].tags')).toBe(true);
  });

  it('rejects tags that contains a non-string element', () => {
    const errs = validateManifest(wrap([{ ...validEntry(), tags: ['ok', 5] }]));
    expect(errs.some((e) => e.field.startsWith('entries[0].tags'))).toBe(true);
  });

  it('rejects a non-array mood field', () => {
    const errs = validateManifest(wrap([{ ...validEntry(), mood: 'calm' }]));
    expect(errs.some((e) => e.field === 'entries[0].mood')).toBe(true);
  });

  it('rejects a non-array variants field', () => {
    const errs = validateManifest(wrap([{ ...validEntry(), variants: 'one.wav' }]));
    expect(errs.some((e) => e.field === 'entries[0].variants')).toBe(true);
  });

  it('rejects variants that contains a non-string element', () => {
    const errs = validateManifest(wrap([{ ...validEntry(), variants: ['a.wav', 9] }]));
    expect(errs.some((e) => e.field.startsWith('entries[0].variants'))).toBe(true);
  });

  it('rejects a non-number cooldownMs', () => {
    const errs = validateManifest(wrap([{ ...validEntry(), cooldownMs: '1000' }]));
    expect(errs.some((e) => e.field === 'entries[0].cooldownMs')).toBe(true);
  });

  it('rejects a negative or non-finite cooldownMs', () => {
    expect(validateManifest(wrap([{ ...validEntry(), cooldownMs: -5 }])).some((e) => e.field === 'entries[0].cooldownMs')).toBe(true);
    expect(validateManifest(wrap([{ ...validEntry(), cooldownMs: NaN }])).some((e) => e.field === 'entries[0].cooldownMs')).toBe(true);
  });

  it('rejects a non-string voiceSoundboardEffect when present', () => {
    const errs = validateManifest(wrap([{ ...validEntry(), voiceSoundboardEffect: 123 }]));
    expect(errs.some((e) => e.field === 'entries[0].voiceSoundboardEffect')).toBe(true);
  });

  it('allows voiceSoundboardEffect to be absent', () => {
    const e = validEntry();
    expect(validateManifest(wrap([e]))).toEqual([]);
  });

  it('still catches duplicate ids alongside shape errors', () => {
    const errs = validateManifest(wrap([validEntry(), validEntry()]));
    expect(errs.some((e) => e.message.includes('duplicate id'))).toBe(true);
  });
});
