// Validate a NarrationPlan against expected shape

import type {
  NarrationPlan,
  NarrationTone,
  Urgency,
  Interruptibility,
  UiEffectType,
  VoicePreset,
} from './types.js';

const VALID_TONES: NarrationTone[] = [
  'tense', 'calm', 'wonder', 'dread', 'combat', 'triumph', 'sorrow',
];
const VALID_URGENCIES: Urgency[] = ['idle', 'normal', 'elevated', 'critical'];
const VALID_INTERRUPTIBILITIES: Interruptibility[] = ['free', 'locked', 'soft-lock'];
const VALID_AMBIENT_ACTIONS = ['start', 'stop', 'crossfade'];
const VALID_UI_EFFECT_TYPES: UiEffectType[] = [
  'flash', 'shake', 'fade-in', 'fade-out', 'border-pulse',
];
const VALID_MUSIC_ACTIONS = ['play', 'stop', 'crossfade', 'intensify', 'soften'];
const VALID_VOICE_PRESETS: VoicePreset[] = [
  'narrator', 'storyteller', 'announcer', 'whisper', 'assistant',
];

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
  } else {
    for (let i = 0; i < p.ambientLayers.length; i++) {
      const layer = p.ambientLayers[i] as Record<string, unknown>;
      if (!layer || typeof layer !== 'object') {
        errors.push({ field: `ambientLayers[${i}]`, message: 'ambientLayers entry must be an object' });
        continue;
      }
      if (typeof layer.layerId !== 'string') {
        errors.push({ field: `ambientLayers[${i}].layerId`, message: 'layerId must be a string' });
      }
      if (!VALID_AMBIENT_ACTIONS.includes(layer.action as string)) {
        errors.push({
          field: `ambientLayers[${i}].action`,
          message: `action must be one of: ${VALID_AMBIENT_ACTIONS.join(', ')}`,
        });
      }
      if (typeof layer.volume !== 'number') {
        errors.push({ field: `ambientLayers[${i}].volume`, message: 'volume must be a number' });
      }
      if (typeof layer.fadeMs !== 'number') {
        errors.push({ field: `ambientLayers[${i}].fadeMs`, message: 'fadeMs must be a number' });
      }
    }
  }

  if (!Array.isArray(p.uiEffects)) {
    errors.push({ field: 'uiEffects', message: 'uiEffects must be an array' });
  } else {
    for (let i = 0; i < p.uiEffects.length; i++) {
      const effect = p.uiEffects[i] as Record<string, unknown>;
      if (!effect || typeof effect !== 'object') {
        errors.push({ field: `uiEffects[${i}]`, message: 'uiEffects entry must be an object' });
        continue;
      }
      if (!VALID_UI_EFFECT_TYPES.includes(effect.type as UiEffectType)) {
        errors.push({
          field: `uiEffects[${i}].type`,
          message: `type must be one of: ${VALID_UI_EFFECT_TYPES.join(', ')}`,
        });
      }
      if (typeof effect.durationMs !== 'number') {
        errors.push({ field: `uiEffects[${i}].durationMs`, message: 'durationMs must be a number' });
      }
      if (effect.color !== undefined && typeof effect.color !== 'string') {
        errors.push({ field: `uiEffects[${i}].color`, message: 'color must be a string when present' });
      }
    }
  }

  // speaker, musicCue, and voiceProfile are optional single-object fields —
  // only validated when present, but when present their shape is checked
  // just as strictly as sfx[]/ambientLayers[]/uiEffects[]. Previously these
  // three were never validated at all, so a malformed one (or a malformed
  // ambientLayers/uiEffects element, above) passed validation cleanly and
  // flowed into audio-director's scheduler as undefined fields instead of
  // being rejected at this documented untrusted-input boundary.
  if (p.speaker !== undefined) {
    const speaker = p.speaker as Record<string, unknown>;
    if (!speaker || typeof speaker !== 'object') {
      errors.push({ field: 'speaker', message: 'speaker must be an object when present' });
    } else {
      if (typeof speaker.entityId !== 'string') {
        errors.push({ field: 'speaker.entityId', message: 'entityId must be a string' });
      }
      if (typeof speaker.voiceId !== 'string') {
        errors.push({ field: 'speaker.voiceId', message: 'voiceId must be a string' });
      }
      if (typeof speaker.emotion !== 'string') {
        errors.push({ field: 'speaker.emotion', message: 'emotion must be a string' });
      }
      if (typeof speaker.speed !== 'number') {
        errors.push({ field: 'speaker.speed', message: 'speed must be a number' });
      }
      if (typeof speaker.text !== 'string') {
        errors.push({ field: 'speaker.text', message: 'text must be a string' });
      }
    }
  }

  if (p.musicCue !== undefined) {
    const musicCue = p.musicCue as Record<string, unknown>;
    if (!musicCue || typeof musicCue !== 'object') {
      errors.push({ field: 'musicCue', message: 'musicCue must be an object when present' });
    } else {
      if (!VALID_MUSIC_ACTIONS.includes(musicCue.action as string)) {
        errors.push({
          field: 'musicCue.action',
          message: `action must be one of: ${VALID_MUSIC_ACTIONS.join(', ')}`,
        });
      }
      if (musicCue.trackId !== undefined && typeof musicCue.trackId !== 'string') {
        errors.push({ field: 'musicCue.trackId', message: 'trackId must be a string when present' });
      }
      if (typeof musicCue.fadeMs !== 'number') {
        errors.push({ field: 'musicCue.fadeMs', message: 'fadeMs must be a number' });
      }
    }
  }

  if (p.voiceProfile !== undefined) {
    const voiceProfile = p.voiceProfile as Record<string, unknown>;
    if (!voiceProfile || typeof voiceProfile !== 'object') {
      errors.push({ field: 'voiceProfile', message: 'voiceProfile must be an object when present' });
    } else {
      if (typeof voiceProfile.voiceId !== 'string') {
        errors.push({ field: 'voiceProfile.voiceId', message: 'voiceId must be a string' });
      }
      if (!VALID_VOICE_PRESETS.includes(voiceProfile.preset as VoicePreset)) {
        errors.push({
          field: 'voiceProfile.preset',
          message: `preset must be one of: ${VALID_VOICE_PRESETS.join(', ')}`,
        });
      }
      if (typeof voiceProfile.emotion !== 'string') {
        errors.push({ field: 'voiceProfile.emotion', message: 'emotion must be a string' });
      }
      if (typeof voiceProfile.speed !== 'number') {
        errors.push({ field: 'voiceProfile.speed', message: 'speed must be a number' });
      }
    }
  }

  return errors;
}

/** Returns true if the plan is valid. */
export function isValidNarrationPlan(plan: unknown): plan is NarrationPlan {
  return validateNarrationPlan(plan).length === 0;
}
