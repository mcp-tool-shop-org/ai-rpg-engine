// Narration plan schema and presentation types

/** Structured narration recipe for multi-modal presentation. */
export type NarrationPlan = {
  sceneText: string;
  tone: NarrationTone;
  urgency: Urgency;
  speaker?: SpeakerCue;
  musicCue?: MusicCue;
  sfx: SfxCue[];
  ambientLayers: AmbientCue[];
  uiEffects: UiEffect[];
  interruptibility: Interruptibility;
  voiceProfile?: VoiceProfile;
};

export type NarrationTone =
  | 'tense'
  | 'calm'
  | 'wonder'
  | 'dread'
  | 'combat'
  | 'triumph'
  | 'sorrow';

export type Urgency = 'idle' | 'normal' | 'elevated' | 'critical';

export type Interruptibility = 'free' | 'locked' | 'soft-lock';

/** Voice synthesis cue for a speaker (narrator or NPC). */
export type SpeakerCue = {
  entityId: string;
  voiceId: string;
  emotion: string;
  speed: number;
  text: string;
};

/** Sound effect trigger. */
export type SfxCue = {
  effectId: string;
  timing: SfxTiming;
  intensity: number;
};

export type SfxTiming = 'immediate' | 'with-text' | 'after-text';

/** Ambient audio layer control. */
export type AmbientCue = {
  layerId: string;
  action: 'start' | 'stop' | 'crossfade';
  volume: number;
  fadeMs: number;
};

/** Background music control. */
export type MusicCue = {
  action: 'play' | 'stop' | 'crossfade' | 'intensify' | 'soften';
  trackId?: string;
  fadeMs: number;
};

/** Terminal/screen visual effect. */
export type UiEffect = {
  type: UiEffectType;
  durationMs: number;
  color?: string;
};

export type UiEffectType =
  | 'flash'
  | 'shake'
  | 'fade-in'
  | 'fade-out'
  | 'border-pulse';

/** Voice configuration for speech synthesis. */
export type VoiceProfile = {
  voiceId: string;
  preset: VoicePreset;
  emotion: string;
  speed: number;
};

export type VoicePreset =
  | 'narrator'
  | 'storyteller'
  | 'announcer'
  | 'whisper'
  | 'assistant';

/** Presentation state for the game session. */
export type PresentationState =
  | 'exploration'
  | 'dialogue'
  | 'tension'
  | 'combat'
  | 'aftermath'
  | 'menu'
  | 'dream'
  | 'director';

/** Render contract — any frontend implements this to receive presentation commands. */
export interface PresentationRenderer {
  renderText(text: string): Promise<void>;
  playVoice(cue: SpeakerCue): Promise<void>;
  playSfx(cue: SfxCue): Promise<void>;
  setAmbient(cue: AmbientCue): Promise<void>;
  setMusic(cue: MusicCue): Promise<void>;
  applyUiEffect(effect: UiEffect): Promise<void>;
}
