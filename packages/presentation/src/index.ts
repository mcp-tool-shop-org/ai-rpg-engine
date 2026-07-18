export type {
  NarrationPlan,
  NarrationTone,
  Urgency,
  Interruptibility,
  SpeakerCue,
  SfxCue,
  SfxTiming,
  AmbientCue,
  MusicCue,
  UiEffect,
  UiEffectType,
  VoiceProfile,
  VoicePreset,
  PresentationState,
  PresentationRenderer,
} from './types.js';

export {
  validateNarrationPlan,
  isValidNarrationPlan,
  type ValidationError,
} from './validate.js';

export {
  buildNarrationPlan,
  collectSoundCues,
  deriveTone,
  deriveUrgency,
  type BuildNarrationPlanInput,
  type NarrationSourceEvent,
  type SoundCueResolver,
} from './builder.js';
