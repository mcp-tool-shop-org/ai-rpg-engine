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
});
