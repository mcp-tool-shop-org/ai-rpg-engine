import { describe, it, expect } from 'vitest';
import { validateNarrationPlan, isValidNarrationPlan } from './validate.js';

describe('validateNarrationPlan', () => {
  const validPlan = {
    sceneText: 'You step into a dimly lit chapel.',
    tone: 'dread',
    urgency: 'normal',
    sfx: [{ effectId: 'ui_whoosh', timing: 'immediate', intensity: 0.5 }],
    ambientLayers: [{ layerId: 'ambient_drone', action: 'start', volume: 0.3, fadeMs: 1000 }],
    uiEffects: [],
    interruptibility: 'free',
  };

  it('should accept a valid plan', () => {
    const errors = validateNarrationPlan(validPlan);
    expect(errors).toHaveLength(0);
    expect(isValidNarrationPlan(validPlan)).toBe(true);
  });

  it('should reject non-object', () => {
    expect(validateNarrationPlan(null)).toHaveLength(1);
    expect(validateNarrationPlan('string')).toHaveLength(1);
  });

  it('should reject empty sceneText', () => {
    const errors = validateNarrationPlan({ ...validPlan, sceneText: '' });
    expect(errors.some((e) => e.field === 'sceneText')).toBe(true);
  });

  it('should reject invalid tone', () => {
    const errors = validateNarrationPlan({ ...validPlan, tone: 'invalid' });
    expect(errors.some((e) => e.field === 'tone')).toBe(true);
  });

  it('should reject invalid sfx timing', () => {
    const errors = validateNarrationPlan({
      ...validPlan,
      sfx: [{ effectId: 'x', timing: 'invalid', intensity: 0.5 }],
    });
    expect(errors.some((e) => e.field.includes('timing'))).toBe(true);
  });

  it('should reject sfx intensity out of range', () => {
    const errors = validateNarrationPlan({
      ...validPlan,
      sfx: [{ effectId: 'x', timing: 'immediate', intensity: 1.5 }],
    });
    expect(errors.some((e) => e.field.includes('intensity'))).toBe(true);
  });

  // F-629fd699: ambientLayers/uiEffects were only checked for array-ness, not
  // element shape, and the optional single-object fields (speaker, musicCue,
  // voiceProfile) were never validated at all. audio-director's director.ts
  // documents validateNarrationPlan as the full guard for its untrusted-input
  // boundary — a malformed element here used to pass validation cleanly and
  // flow through as undefined fields instead of being rejected.
  describe('element-level shape (F-629fd699)', () => {
    it('rejects an ambientLayers entry missing layerId/volume/fadeMs', () => {
      const errors = validateNarrationPlan({
        ...validPlan,
        ambientLayers: [{}],
      });
      expect(errors.some((e) => e.field === 'ambientLayers[0].layerId')).toBe(true);
      expect(errors.some((e) => e.field === 'ambientLayers[0].volume')).toBe(true);
      expect(errors.some((e) => e.field === 'ambientLayers[0].fadeMs')).toBe(true);
    });

    it('rejects an ambientLayers entry with an invalid action', () => {
      const errors = validateNarrationPlan({
        ...validPlan,
        ambientLayers: [{ layerId: 'drone', action: 'nonsense', volume: 0.5, fadeMs: 500 }],
      });
      expect(errors.some((e) => e.field === 'ambientLayers[0].action')).toBe(true);
    });

    it('accepts a well-formed ambientLayers entry', () => {
      const errors = validateNarrationPlan({
        ...validPlan,
        ambientLayers: [{ layerId: 'drone', action: 'crossfade', volume: 0.5, fadeMs: 500 }],
      });
      expect(errors).toHaveLength(0);
    });

    it('rejects a uiEffects entry with an invalid type or missing durationMs', () => {
      const errors = validateNarrationPlan({
        ...validPlan,
        uiEffects: [{ type: 'not-a-type' }],
      });
      expect(errors.some((e) => e.field === 'uiEffects[0].type')).toBe(true);
      expect(errors.some((e) => e.field === 'uiEffects[0].durationMs')).toBe(true);
    });

    it('rejects a uiEffects entry whose optional color is not a string', () => {
      const errors = validateNarrationPlan({
        ...validPlan,
        uiEffects: [{ type: 'flash', durationMs: 200, color: 42 }],
      });
      expect(errors.some((e) => e.field === 'uiEffects[0].color')).toBe(true);
    });

    it('accepts a well-formed uiEffects entry', () => {
      const errors = validateNarrationPlan({
        ...validPlan,
        uiEffects: [{ type: 'shake', durationMs: 300 }],
      });
      expect(errors).toHaveLength(0);
    });

    it('does not require speaker/musicCue/voiceProfile — absent is valid', () => {
      const errors = validateNarrationPlan(validPlan);
      expect(errors).toHaveLength(0);
    });

    it('rejects a malformed speaker when present', () => {
      const errors = validateNarrationPlan({
        ...validPlan,
        speaker: { entityId: 'narrator' }, // missing voiceId/emotion/speed/text
      });
      expect(errors.some((e) => e.field === 'speaker.voiceId')).toBe(true);
      expect(errors.some((e) => e.field === 'speaker.emotion')).toBe(true);
      expect(errors.some((e) => e.field === 'speaker.speed')).toBe(true);
      expect(errors.some((e) => e.field === 'speaker.text')).toBe(true);
    });

    it('accepts a well-formed speaker', () => {
      const errors = validateNarrationPlan({
        ...validPlan,
        speaker: { entityId: 'narrator', voiceId: 'v1', emotion: 'calm', speed: 1, text: 'Hello.' },
      });
      expect(errors).toHaveLength(0);
    });

    it('rejects a malformed musicCue when present', () => {
      const errors = validateNarrationPlan({
        ...validPlan,
        musicCue: { action: 'not-an-action', fadeMs: 'soon' },
      });
      expect(errors.some((e) => e.field === 'musicCue.action')).toBe(true);
      expect(errors.some((e) => e.field === 'musicCue.fadeMs')).toBe(true);
    });

    it('accepts a well-formed musicCue', () => {
      const errors = validateNarrationPlan({
        ...validPlan,
        musicCue: { action: 'intensify', fadeMs: 1000 },
      });
      expect(errors).toHaveLength(0);
    });

    it('rejects a malformed voiceProfile when present', () => {
      const errors = validateNarrationPlan({
        ...validPlan,
        voiceProfile: { voiceId: 'v1', preset: 'not-a-preset' }, // missing emotion/speed too
      });
      expect(errors.some((e) => e.field === 'voiceProfile.preset')).toBe(true);
      expect(errors.some((e) => e.field === 'voiceProfile.emotion')).toBe(true);
      expect(errors.some((e) => e.field === 'voiceProfile.speed')).toBe(true);
    });

    it('accepts a well-formed voiceProfile', () => {
      const errors = validateNarrationPlan({
        ...validPlan,
        voiceProfile: { voiceId: 'v1', preset: 'narrator', emotion: 'calm', speed: 1 },
      });
      expect(errors).toHaveLength(0);
    });
  });
});
