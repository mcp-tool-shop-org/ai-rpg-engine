// NarrationPlan builder — constructs a valid plan from a turn's resolved
// events plus the renderer's scene text.
//
// This is the missing producer half of the presentation stack: types.ts has
// always DEFINED NarrationPlan and validate.ts has always CHECKED one, but
// nothing in the engine ever CONSTRUCTED one — the audio-director's
// schedule() had no real plans to schedule. buildNarrationPlan closes that
// gap deterministically: same events + same scene text ⇒ byte-identical plan.
//
// Dependency posture: presentation stays dependency-free. Events are accepted
// through the structural NarrationSourceEvent type (core's ResolvedEvent is
// assignable to it — no import of @ai-rpg-engine/core), and the cue
// vocabulary mapping is INJECTED via `resolveSoundCue` (soundpack-core's
// resolveSoundCue / extendCueMap fit the parameter — no import of
// @ai-rpg-engine/soundpack-core). terminal-ui composes the three packages;
// see TurnPresenter there.

import type {
  NarrationPlan,
  NarrationTone,
  SfxCue,
  SpeakerCue,
  UiEffect,
  Urgency,
  VoiceProfile,
} from './types.js';

/**
 * The slice of a resolved engine event the builder reads. Structural subset
 * of @ai-rpg-engine/core's ResolvedEvent so callers pass engine events
 * directly without presentation taking a dependency on core.
 */
export type NarrationSourceEvent = {
  type: string;
  payload?: Record<string, unknown>;
  presentation?: {
    priority?: string;
    soundCues?: string[];
  };
};

/**
 * Maps a gameplay cue id (module vocabulary: `combat.hit`,
 * `ability.holy-smite`, `scene.crypt-reveal`, …) into an sfx cue in the
 * canonical soundpack vocabulary. soundpack-core's `resolveSoundCue` (or an
 * `extendCueMap` resolver) satisfies this signature; the identity default is
 * documented on {@link buildNarrationPlan}.
 */
export type SoundCueResolver = (cue: string) => Pick<SfxCue, 'effectId' | 'timing' | 'intensity'>;

export type BuildNarrationPlanInput = {
  /**
   * The narration text for this turn — normally the renderer's formatted
   * event lines (see terminal-ui's narrationTextFromEvents). Empty /
   * whitespace-only input degrades to the deterministic placeholder `'…'`
   * rather than producing an invalid plan (warn-and-degrade, matching the
   * engine's consumer-mistake contract).
   */
  sceneText: string;
  /** This turn's resolved events (engine ResolvedEvents are assignable). */
  events?: NarrationSourceEvent[];
  /**
   * Maps gameplay cues to the canonical soundpack vocabulary. DEFAULT is the
   * identity passthrough (effectId = raw cue, with-text, 0.5) — supply
   * soundpack-core's `resolveSoundCue` to land in the unified vocabulary.
   */
  resolveSoundCue?: SoundCueResolver;
  /**
   * The player entity id — lets defeat events distinguish "you fell"
   * (sorrow) from "the enemy fell" (triumph). Omitted ⇒ every defeat reads
   * as triumph.
   */
  playerId?: string;
  /** Optional voice profile passed through to the plan (TTS embedders). */
  voiceProfile?: VoiceProfile;
};

/** Event types whose presence marks a turn as combat presentation. */
const DEFEAT_EVENT = 'combat.entity.defeated';
const DIALOGUE_NODE_EVENT = 'dialogue.node.entered';
const AUDIO_CUE_EVENT = 'audio.cue.requested';

const IDENTITY_RESOLVER: SoundCueResolver = (cue) => ({
  effectId: cue,
  timing: 'with-text',
  intensity: 0.5,
});

/**
 * Collect the gameplay sound cues a turn's events request, in first-seen
 * order, deduplicated. Two sources feed it:
 *   - `event.presentation.soundCues` (module-attached cues), and
 *   - `audio.cue.requested` events' `payload.cueId` (starter stingers).
 * Order + dedup are part of the determinism contract: the same turn always
 * yields the same cue list, and a module double-attaching a cue does not
 * double-fire it (the audio-director's cooldowns get one shot to arbitrate).
 */
export function collectSoundCues(events: readonly NarrationSourceEvent[]): string[] {
  const seen = new Set<string>();
  const cues: string[] = [];
  const push = (cue: unknown): void => {
    if (typeof cue !== 'string' || cue.length === 0 || seen.has(cue)) return;
    seen.add(cue);
    cues.push(cue);
  };

  for (const event of events) {
    for (const cue of event.presentation?.soundCues ?? []) push(cue);
    if (event.type === AUDIO_CUE_EVENT) push(event.payload?.cueId);
  }
  return cues;
}

/** True when the defeated entity in a defeat event is the player. */
function isPlayerDefeat(event: NarrationSourceEvent, playerId?: string): boolean {
  return playerId !== undefined && event.payload?.entityId === playerId;
}

/**
 * Only PRESENTATION-BEARING events drive tone/urgency. Modules mark events
 * meant for the player with an `event.presentation` block (channels,
 * priority, soundCues); events without one are internal bookkeeping — e.g.
 * recovery's per-turn `combat.aftermath.stamina-tick` — and must not tint a
 * quiet look-around as combat just because their type shares the namespace.
 */
function presentable(event: NarrationSourceEvent): boolean {
  return event.presentation !== undefined;
}

/**
 * Derive tone from presentation-bearing event kinds. Precedence (first
 * match wins):
 *   1. the player was defeated            → 'sorrow'
 *   2. any entity was defeated            → 'triumph'
 *   3. any combat.* event occurred        → 'combat'
 *   4. otherwise (dialogue, travel, idle) → 'calm'
 * The remaining tones (tense/dread/wonder) are authored space — a game with
 * scripted moments builds its plan directly (or post-edits this one) rather
 * than expecting the generic derivation to guess atmosphere.
 */
export function deriveTone(
  events: readonly NarrationSourceEvent[],
  playerId?: string,
): NarrationTone {
  let sawDefeat = false;
  let sawCombat = false;
  for (const event of events) {
    if (!presentable(event)) continue;
    if (event.type === DEFEAT_EVENT) {
      if (isPlayerDefeat(event, playerId)) return 'sorrow';
      sawDefeat = true;
    }
    if (event.type.startsWith('combat.')) sawCombat = true;
  }
  if (sawDefeat) return 'triumph';
  if (sawCombat) return 'combat';
  return 'calm';
}

/**
 * Derive urgency from presentation-bearing events:
 *   - 'critical' — any event the modules marked presentation.priority
 *     'critical' (defeats, interceptor falls, boss phases);
 *   - 'elevated' — else any combat.* event or any 'high'-priority event
 *     (damage, ability use);
 *   - 'normal'   — everything else. ('idle' is reserved for ambient
 *     screensaver-style presentation; the builder never derives it.)
 */
export function deriveUrgency(events: readonly NarrationSourceEvent[]): Urgency {
  let elevated = false;
  for (const event of events) {
    if (!presentable(event)) continue;
    const priority = event.presentation?.priority;
    if (priority === 'critical') return 'critical';
    if (priority === 'high' || event.type.startsWith('combat.')) elevated = true;
  }
  return elevated ? 'elevated' : 'normal';
}

/** The most recent dialogue node in the turn, as a SpeakerCue (or undefined). */
function deriveSpeaker(events: readonly NarrationSourceEvent[]): SpeakerCue | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event.type !== DIALOGUE_NODE_EVENT) continue;
    const text = event.payload?.text;
    const speaker = event.payload?.speaker;
    if (typeof text !== 'string' || text.length === 0) continue;
    // dialogue-core carries the speaker DISPLAY NAME (no entity id) — use it
    // for entityId, and derive a stable per-speaker voice id from it. A TTS
    // embedder maps voice ids to actual voices; the terminal ignores them.
    const name = typeof speaker === 'string' && speaker.length > 0 ? speaker : 'narrator';
    return {
      entityId: name,
      voiceId: `voice.${name.toLowerCase().replace(/\s+/g, '-')}`,
      emotion: 'neutral',
      speed: 1,
      text,
    };
  }
  return undefined;
}

/**
 * Visual accents for GUI embedders (terminal-ui renders text only and does
 * not apply these): a defeat flashes; the player's own fall fades out.
 */
function deriveUiEffects(
  events: readonly NarrationSourceEvent[],
  playerId?: string,
): UiEffect[] {
  for (const event of events) {
    if (event.type !== DEFEAT_EVENT) continue;
    if (isPlayerDefeat(event, playerId)) {
      return [{ type: 'fade-out', durationMs: 600 }];
    }
    return [{ type: 'flash', durationMs: 250 }];
  }
  return [];
}

/**
 * Build a valid NarrationPlan from a turn's events + scene text.
 *
 * Deterministic (pure function of its input) and always valid: every plan it
 * returns passes validateNarrationPlan — pinned by test, so audio-director's
 * schedule() accepts builder output unconditionally.
 *
 * Honest scope notes (deliberate ceilings of this slice, not oversights):
 *   - `ambientLayers` is always [] — deriving ambient beds needs zone-state
 *     tracking across turns (a start/stop state machine), not per-turn events.
 *   - `musicCue` is always undefined — same reason; music direction is a
 *     cross-turn concern for a future music-state module.
 */
export function buildNarrationPlan(input: BuildNarrationPlanInput): NarrationPlan {
  const events = input.events ?? [];
  const resolve = input.resolveSoundCue ?? IDENTITY_RESOLVER;

  const trimmed = input.sceneText.trim();
  const sceneText = trimmed.length > 0 ? input.sceneText : '…';

  const sfx: SfxCue[] = collectSoundCues(events).map((cue) => {
    const resolved = resolve(cue);
    // Re-shape rather than spread: resolver results may carry extra fields
    // (soundpack-core's `via` tier tag) that don't belong in the plan.
    return {
      effectId: resolved.effectId,
      timing: resolved.timing,
      intensity: resolved.intensity,
    };
  });

  const urgency = deriveUrgency(events);

  const plan: NarrationPlan = {
    sceneText,
    tone: deriveTone(events, input.playerId),
    urgency,
    sfx,
    ambientLayers: [],
    uiEffects: deriveUiEffects(events, input.playerId),
    // Big moments hold the floor: a critical beat asks renderers not to let
    // the player skip mid-line (soft — never a hard lock from generic
    // derivation); everything else is freely skippable.
    interruptibility: urgency === 'critical' ? 'soft-lock' : 'free',
  };

  const speaker = deriveSpeaker(events);
  if (speaker) plan.speaker = speaker;
  if (input.voiceProfile) plan.voiceProfile = input.voiceProfile;

  return plan;
}
