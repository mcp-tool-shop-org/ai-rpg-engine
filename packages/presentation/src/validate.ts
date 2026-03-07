// Validate a NarrationPlan against expected shape

import type { NarrationPlan, NarrationTone, Urgency, Interruptibility } from './types.js';

const VALID_TONES: NarrationTone[] = [
  'tense', 'calm', 'wonder', 'dread', 'combat', 'triumph', 'sorrow',
];
const VALID_URGENCIES: Urgency[] = ['idle', 'normal', 'elevated', 'critical'];
const VALID_INTERRUPTIBILITIES: Interruptibility[] = ['free', 'locked', 'soft-lock'];

export type ValidationError = {
  field: string;
  message: string;
};

/** Validate a NarrationPlan, returning errors if any. */
export function validateNarrationPlan(plan: unknown): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!plan || typeof plan !== 'object') {
    return [{ field: 'root', message: 'NarrationPlan must be an object' }];
  }

  const p = plan as Record<string, unknown>;

  if (typeof p.sceneText !== 'string' || p.sceneText.length === 0) {
    errors.push({ field: 'sceneText', message: 'sceneText must be a non-empty string' });
  }

  if (!VALID_TONES.includes(p.tone as NarrationTone)) {
    errors.push({ field: 'tone', message: `tone must be one of: ${VALID_TONES.join(', ')}` });
  }

  if (!VALID_URGENCIES.includes(p.urgency as Urgency)) {
    errors.push({ field: 'urgency', message: `urgency must be one of: ${VALID_URGENCIES.join(', ')}` });
  }

  if (!VALID_INTERRUPTIBILITIES.includes(p.interruptibility as Interruptibility)) {
    errors.push({
      field: 'interruptibility',
      message: `interruptibility must be one of: ${VALID_INTERRUPTIBILITIES.join(', ')}`,
    });
  }

  if (!Array.isArray(p.sfx)) {
    errors.push({ field: 'sfx', message: 'sfx must be an array' });
  } else {
    for (let i = 0; i < p.sfx.length; i++) {
      const sfx = p.sfx[i] as Record<string, unknown>;
      if (typeof sfx.effectId !== 'string') {
        errors.push({ field: `sfx[${i}].effectId`, message: 'effectId must be a string' });
      }
      if (!['immediate', 'with-text', 'after-text'].includes(sfx.timing as string)) {
        errors.push({ field: `sfx[${i}].timing`, message: 'timing must be immediate, with-text, or after-text' });
      }
      if (typeof sfx.intensity !== 'number' || sfx.intensity < 0 || sfx.intensity > 1) {
        errors.push({ field: `sfx[${i}].intensity`, message: 'intensity must be a number between 0 and 1' });
      }
    }
  }

  if (!Array.isArray(p.ambientLayers)) {
    errors.push({ field: 'ambientLayers', message: 'ambientLayers must be an array' });
  }

  if (!Array.isArray(p.uiEffects)) {
    errors.push({ field: 'uiEffects', message: 'uiEffects must be an array' });
  }

  return errors;
}

/** Returns true if the plan is valid. */
export function isValidNarrationPlan(plan: unknown): plan is NarrationPlan {
  return validateNarrationPlan(plan).length === 0;
}
