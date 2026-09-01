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
  AmbientCue,
  MusicCue,
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
   * (sorrow) from anything else. Omitted ⇒ no defeat can ever read as
   * sorrow (there is no player to attribute it to); tone falls through to
   * 'combat'/'calm' exactly as an unattributable defeat always has.
   */
  playerId?: string;
  /** Optional voice profile passed through to the plan (TTS embedders). */
  voiceProfile?: VoiceProfile;
  /**
   * Resolves a zone's district "tone" (world.zone.entered's `tone` payload
   * field) into a music/ambient target for a zone-entry turn. DEFAULT
   * undefined — a caller opts in by injecting soundpack-core's
   * districtToneToSoundMood bridge composed with a loaded SoundRegistry's
   * pickMusicStem/pickAmbientBed (see terminal-ui's TurnPresenter). Returning
   * undefined, or omitting either trackId/layerId, falls through per-field to
   * the documented 'scene.enter' fallback. Only consulted on turns containing
   * a presentation-bearing world.zone.entered event; ignored otherwise.
   */
  resolveZoneMood?: ZoneMoodResolver;
};

/**
 * See {@link BuildNarrationPlanInput.resolveZoneMood}. presentation stays
 * dependency-free of soundpack-core (matches this file's resolveSoundCue
 * injection posture) — the real districtToneToSoundMood-backed resolver is
 * composed by the caller, not imported here.
 */
export type ZoneMoodResolver = (
  tone: string,
  zoneId?: string,
) => { trackId?: string; layerId?: string } | undefined;

/** Event types whose presence marks a turn as combat presentation. */
const DEFEAT_EVENT = 'combat.entity.defeated';
const DIALOGUE_NODE_EVENT = 'dialogue.node.entered';
const AUDIO_CUE_EVENT = 'audio.cue.requested';
const ZONE_ENTERED_EVENT = 'world.zone.entered';
/**
 * The authoritative "the fight is over" signal (R2, modules' engagement-core;
 * consumed here, not defined here). F-32948b79: deriveTone/deriveUiEffects
 * used to read ANY non-player defeat as triumph/flash, so a companion's
 * death (or any single non-final kill in a multi-enemy fight) rendered as a
 * triumphant beat. Re-keyed to this event — a defeat alone no longer implies
 * the encounter ended. Also the sting trigger (deriveStingCue) — one event,
 * one meaning, shared by every derivation that cares "did the fight end".
 */
const ENCOUNTER_CLEARED_EVENT = 'combat.encounter.cleared';

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
 * combat.encounter.cleared payload.outcome. Only the exact string 'retreat'
 * is retreat; omitted/unknown stay victory so today's callers stay
 * byte-identical until modules emits retreat. F-deb1375c / R4.
 */
function outcomeOf(event: NarrationSourceEvent): 'victory' | 'retreat' {
  return event.payload?.outcome === 'retreat' ? 'retreat' : 'victory';
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
 *   1. the player was defeated                    → 'sorrow'
 *   2. the encounter was cleared (outcome !== 'retreat') → 'triumph'
 *   3. any combat.* event occurred                → 'combat'
 *   4. otherwise (dialogue, travel, idle)          → 'calm'
 * The remaining tones (tense/dread/wonder) are authored space — a game with
 * scripted moments builds its plan directly (or post-edits this one) rather
 * than expecting the generic derivation to guess atmosphere.
 *
 * F-32948b79: 'triumph' is keyed off {@link ENCOUNTER_CLEARED_EVENT}, NOT off
 * "any non-player defeat" (the old rule — a companion's death, or the first
 * of several kills in a multi-enemy fight, used to read as triumphant). A
 * bare defeat with no clearance now reads as the conservative 'combat' tone.
 * Player defeat still outranks everything, including a same-turn clearance
 * (a mutual kill fades out, never flashes triumphant — mirrors
 * deriveStingCue's identical precedence call).
 *
 * F-deb1375c / R4: sawCleared only when payload.outcome !== 'retreat'. A
 * flee-clear is still a combat.* event so it falls through to 'combat' —
 * never 'triumph'. There is no NarrationTone named retreat.
 */
export function deriveTone(
  events: readonly NarrationSourceEvent[],
  playerId?: string,
): NarrationTone {
  let sawCleared = false;
  let sawCombat = false;
  for (const event of events) {
    if (!presentable(event)) continue;
    if (event.type === DEFEAT_EVENT && isPlayerDefeat(event, playerId)) return 'sorrow';
    if (event.type === ENCOUNTER_CLEARED_EVENT && outcomeOf(event) !== 'retreat') sawCleared = true;
    if (event.type.startsWith('combat.')) sawCombat = true;
  }
  if (sawCleared) return 'triumph';
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

/**
 * Which music STING (a one-shot fanfare/stinger, distinct from the sfx
 * pipeline's blips) this turn calls for, in the canonical soundpack cue
 * vocabulary soundpack-core's `resolveMusicSting` resolves — 'combat.defeat'
 * / 'combat.victory' / 'combat.retreat' / undefined. F-0671a25f / F-b5150ad5:
 * TurnPresenter is the repo's only per-turn AudioCommand composition point
 * and never called AudioDirector.scheduleSting, so the documented sting hook
 * could never actually carry a sting to a player or embedder; this is the
 * pure half of the fix (terminal-ui's TurnPresenter does the thin scheduling
 * call).
 *
 * Precedence mirrors deriveTone exactly: a player defeat wins even alongside
 * a same-turn combat.encounter.cleared (a mutual kill defeats, it does not
 * also victory-sting) — pinned by the Director ruling that ties this
 * derivation's precedence to deriveTone's.
 *
 * F-deb1375c / R4: binds payload.outcome. Only exact 'retreat' is retreat
 * (cue id 'combat.retreat', media's COMBAT_STING_MAP key); omitted/unknown
 * stay 'combat.victory' so today's callers stay byte-identical until
 * modules emits retreat. Until media lands the map row, resolveMusicSting
 * is undefined and TurnPresenter schedules no sting — still not
 * music_victory_sting.
 */
export function deriveStingCue(
  events: readonly NarrationSourceEvent[],
  playerId?: string,
): string | undefined {
  let cleared = false;
  let retreated = false;
  for (const event of events) {
    if (!presentable(event)) continue;
    if (event.type === DEFEAT_EVENT && isPlayerDefeat(event, playerId)) return 'combat.defeat';
    if (event.type === ENCOUNTER_CLEARED_EVENT) {
      if (outcomeOf(event) === 'retreat') retreated = true;
      else cleared = true;
    }
  }
  if (retreated) return 'combat.retreat';
  return cleared ? 'combat.victory' : undefined;
}

/**
 * The current turn's dialogue content and hints, as narratable prose
 * fragments in on-screen reading order — the producer half of
 * {@link NarrationPlan.asides}. One dialogue.node.entered event's worth of
 * fragments, in the SAME order the R4-approved Dialogue section renders them
 * (texture -> bias -> world/party asides), because that is also the more
 * natural SPOKEN order: a stage direction precedes the line it accompanies.
 * dialogueHint is deliberately excluded — see deriveSpeaker, which routes it
 * into SpeakerCue.emotion instead. The spoken line itself (payload.text) is
 * ALSO deliberately excluded, for the same overlap-avoidance reason
 * (F-f1c74adc): deriveSpeaker already routes it into SpeakerCue.text, and an
 * embedder speaks it exactly once via playVoice — asides carries only the
 * SURROUNDING fragments, never the line a caller already got from
 * plan.speaker. Returns [] for a node with no text (never a partial/broken
 * fragment) or one the modules did not mark presentation-bearing (matches
 * every other derivation's bookkeeping exclusion).
 */
function dialogueAsides(event: NarrationSourceEvent): string[] {
  if (!presentable(event)) return [];
  const payload = event.payload;
  const text = payload?.text;
  if (typeof text !== 'string' || text.length === 0) return [];

  const asides: string[] = [];
  const push = (key: string): void => {
    const value = payload?.[key];
    if (typeof value === 'string' && value.length > 0) asides.push(value);
  };
  push('textureHint');
  push('dialogueBias');
  // F-f1c74adc: the spoken line (`text`) is intentionally NOT pushed here.
  // plan.speaker already carries it (see deriveSpeaker below), and an
  // embedder speaks it exactly once through playVoice — pushing it into
  // asides too would double-speak the same turn. `text` above is still used
  // as the "is this really a spoken dialogue turn" presence gate.
  push('partyPresence');
  push('pressureHint');
  push('opportunityHint');
  return asides;
}

/**
 * The most recent dialogue node in the turn, as a SpeakerCue (or undefined).
 *
 * F-25e3c162: gated on presentable(), matching every sibling derivation over
 * this same event set (deriveTone, deriveUrgency, deriveStingCue, and this
 * file's dialogueAsides) — a bookkeeping-only dialogue.node.entered (no
 * presentation block) must not populate plan.speaker any more than it can
 * populate plan.asides.
 */
function deriveSpeaker(events: readonly NarrationSourceEvent[]): SpeakerCue | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event.type !== DIALOGUE_NODE_EVENT) continue;
    if (!presentable(event)) continue;
    const text = event.payload?.text;
    const speaker = event.payload?.speaker;
    if (typeof text !== 'string' || text.length === 0) continue;
    // dialogue-core carries the speaker DISPLAY NAME (no entity id) — use it
    // for entityId, and derive a stable per-speaker voice id from it. A TTS
    // embedder maps voice ids to actual voices; the terminal ignores them.
    const name = typeof speaker === 'string' && speaker.length > 0 ? speaker : 'narrator';
    // dialogueHint is a manner/delivery fragment ("evasive, deflecting,
    // changing subject") — exactly what SpeakerCue.emotion wants, and it is
    // already a freeform string, so this is a zero-schema-change read: use
    // it verbatim when present, 'neutral' otherwise (unchanged default).
    const dialogueHint = event.payload?.dialogueHint;
    const emotion = typeof dialogueHint === 'string' && dialogueHint.length > 0 ? dialogueHint : 'neutral';
    return {
      entityId: name,
      voiceId: `voice.${name.toLowerCase().replace(/\s+/g, '-')}`,
      emotion,
      speed: 1,
      text,
    };
  }
  return undefined;
}

/**
 * Visual accents for GUI embedders (terminal-ui renders text only and does
 * not apply these): a cleared encounter flashes; the player's own fall fades
 * out.
 *
 * F-77706f09: scans the WHOLE turn for a player defeat before falling back to
 * clearance — the same precedence order deriveTone uses. A turn with a
 * defeat AND a same-turn clearance (a mutual kill) must fade out, not flash:
 * plan.tone and plan.uiEffects can never disagree about whether the player
 * died this turn.
 *
 * F-32948b79: the flash trigger is re-keyed off {@link ENCOUNTER_CLEARED_EVENT},
 * matching deriveTone's re-key — "any non-player defeat" used to flash a
 * companion's death exactly as it would a won fight. Gated on presentable()
 * for the SAME reason deriveStingCue gates it (the sibling derivation for
 * this exact event): a bookkeeping combat.encounter.cleared with no
 * presentation block should not flash the screen the player never saw
 * announced. The existing player-defeat/fade-out branch is NOT gated on
 * presentable() — unchanged from before this fix, out of this fix's scope.
 *
 * F-deb1375c / R4: flash only on presentable cleared with outcome !==
 * 'retreat'; a flee-clear returns [] (no flash, no triumph).
 */
function deriveUiEffects(
  events: readonly NarrationSourceEvent[],
  playerId?: string,
): UiEffect[] {
  let sawCleared = false;
  for (const event of events) {
    if (event.type === DEFEAT_EVENT && isPlayerDefeat(event, playerId)) {
      return [{ type: 'fade-out', durationMs: 600 }];
    }
    if (
      event.type === ENCOUNTER_CLEARED_EVENT &&
      presentable(event) &&
      outcomeOf(event) !== 'retreat'
    ) {
      sawCleared = true;
    }
  }
  return sawCleared ? [{ type: 'flash', durationMs: 250 }] : [];
}

/**
 * Zone-entry music/ambient default. Mirrors soundpack-core's
 * `resolveMusicStem('scene.enter')` / `resolveAmbientBed('scene.enter')` —
 * SCENE_MUSIC_MAP / SCENE_BED_MAP's 'scene.enter' rows, both resolved at the
 * 'exact' tier. Duplicated as a literal rather than imported: presentation
 * stays dependency-free of soundpack-core (matches this file's
 * resolveSoundCue injection posture, and cue-map.ts's own precedent of
 * duplicating stable literals across the package boundary rather than
 * importing across it).
 */
const ZONE_ENTER_FALLBACK: { trackId: string; layerId: string } = {
  trackId: 'music_calm',
  layerId: 'ambient_white_noise',
};

/**
 * Build a valid NarrationPlan from a turn's events + scene text.
 *
 * Deterministic (pure function of its input) and always valid: every plan it
 * returns passes validateNarrationPlan — pinned by test, so audio-director's
 * schedule() accepts builder output unconditionally.
 *
 * Honest scope notes (deliberate ceilings of this slice, not oversights):
 *   - `ambientLayers` / `musicCue` are populated ONLY on turns carrying a
 *     presentation-bearing world.zone.entered event (F-901767f5's
 *     composition half) — every other turn leaves them [] / undefined
 *     exactly as before this field was wired. Cross-turn concerns (fading
 *     the PREVIOUS stem out, tracking which ambient layers are already
 *     running so a repeat zone entry does not restart them) remain a future
 *     music-state module's job — this slice derives the per-turn TARGET,
 *     never the transition.
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

  // F-901767f5 (composition half): a zone-entry turn gets a music/ambient
  // target — the tone-aware resolver when the caller injects one and the
  // event carries a `tone`, else the documented scene.enter fallback.
  // Missing/undefined resolve PER FIELD, not all-or-nothing, so a resolver
  // that only knows music still gets the fallback ambient bed.
  let musicCue: MusicCue | undefined;
  let ambientLayers: AmbientCue[] = [];
  const zoneEnteredEvent = events.find(
    (event) => event.type === ZONE_ENTERED_EVENT && presentable(event),
  );
  if (zoneEnteredEvent) {
    const tone = zoneEnteredEvent.payload?.tone;
    const zoneIdRaw = zoneEnteredEvent.payload?.zoneId;
    const zoneId = typeof zoneIdRaw === 'string' && zoneIdRaw.length > 0 ? zoneIdRaw : undefined;
    const resolved =
      typeof tone === 'string' && tone.length > 0 && input.resolveZoneMood
        ? input.resolveZoneMood(tone, zoneId)
        : undefined;
    musicCue = {
      action: 'play',
      trackId: resolved?.trackId ?? ZONE_ENTER_FALLBACK.trackId,
      fadeMs: 1000,
    };
    ambientLayers = [
      {
        layerId: resolved?.layerId ?? ZONE_ENTER_FALLBACK.layerId,
        action: 'start',
        volume: 0.3,
        fadeMs: 1000,
      },
    ];
  }

  const plan: NarrationPlan = {
    sceneText,
    tone: deriveTone(events, input.playerId),
    urgency,
    sfx,
    ambientLayers,
    uiEffects: deriveUiEffects(events, input.playerId),
    // Big moments hold the floor: a critical beat asks renderers not to let
    // the player skip mid-line (soft — never a hard lock from generic
    // derivation); everything else is freely skippable.
    interruptibility: urgency === 'critical' ? 'soft-lock' : 'free',
  };

  const speaker = deriveSpeaker(events);
  if (speaker) plan.speaker = speaker;
  if (input.voiceProfile) plan.voiceProfile = input.voiceProfile;
  if (musicCue) plan.musicCue = musicCue;

  // TTS pipeline expansion (wave-2 R4 ruling): dialogue content + hints,
  // additive and byte-compat — a turn with no dialogue events leaves
  // `asides` unset, identical to the plan shape before this field existed.
  const asides = events
    .filter((event) => event.type === DIALOGUE_NODE_EVENT)
    .flatMap(dialogueAsides);
  if (asides.length > 0) plan.asides = asides;

  return plan;
}
