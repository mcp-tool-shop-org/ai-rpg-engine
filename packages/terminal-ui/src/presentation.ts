// Narration + audio wiring for the terminal frontend — the composition point
// of the presentation stack.
//
// What this connects (previously three built-but-inert islands):
//   modules emit events with gameplay soundCues
//     → presentation.buildNarrationPlan derives a validated NarrationPlan
//       (tone/urgency from event kinds, sfx via soundpack-core's cue map)
//     → audio-director.schedule() turns the plan into ordered AudioCommands
//       (priorities, cooldowns, ducking)
//     → this module RETURNS both to the caller.
//
// ── HONEST PLAYBACK CEILING ────────────────────────────────────────────────
// This is a TERMINAL frontend. There is no terminal audio backend — no
// process here can ring `alert_critical` through your speakers, and we do not
// pretend otherwise (no beeps, no BEL abuse). The terminal renders the plan's
// TEXT: `renderNarrationLine` styles the narration by tone/urgency using the
// same Stage-D palette rules (color is always redundant emphasis; stripping
// ANSI yields the identical plain line).
//
// The `audioCommands` on every PresentedTurn are the INTEGRATION HOOK: a GUI
// or web embedder that owns real audio output takes them (each command's
// `resourceId` is a canonical soundpack entry id resolvable in a
// SoundRegistry — see @ai-rpg-engine/soundpack-core) and plays them through
// its implementation of presentation's PresentationRenderer contract. Until
// such an embedder exists, the commands are computed, deterministic, tested —
// and deliberately silent.

import type { ResolvedEvent, WorldState } from '@ai-rpg-engine/core';
import {
  buildNarrationPlan,
  type NarrationPlan,
  type SoundCueResolver,
  type VoiceProfile,
} from '@ai-rpg-engine/presentation';
import {
  AudioDirector,
  type AudioCommand,
  type ScheduleWarning,
} from '@ai-rpg-engine/audio-director';
import { CORE_SOUND_PACK, resolveSoundCue } from '@ai-rpg-engine/soundpack-core';
import { formatEventLine, type RenderOptions } from './renderer.js';
import { detectColorEnabled, makePalette } from './styles.js';

/**
 * Milliseconds per engine tick for the presentation clock. The audio
 * director's cooldowns need a time axis; the terminal has no meaningful
 * wall-clock (turns resolve instantly), so the presenter derives `now` from
 * `world.meta.tick * PRESENTATION_TICK_MS` — deterministic and replayable,
 * per the engine's determinism contract. Embedders with real time pass
 * `{ now }` instead.
 */
export const PRESENTATION_TICK_MS = 1000;

/** Narration fallback for a turn with no renderable events. */
export const QUIET_TURN_TEXT = 'All is quiet.';

/** Everything the presentation stack produces for one turn. */
export type PresentedTurn = {
  /** The validated NarrationPlan built from this turn's events. */
  plan: NarrationPlan;
  /**
   * Scheduled audio for the turn — NOT played here (see the playback-ceiling
   * note above); exposed for GUI/web embedders. `resourceId`s are canonical
   * soundpack entry ids.
   */
  audioCommands: AudioCommand[];
  /** Plain narration text (identical to plan.sceneText). */
  narrationText: string;
  /**
   * The narration styled by tone/urgency for terminal display. Optional to
   * use; existing renderFullScreen output is untouched by this layer.
   */
  styledNarration: string;
  /** Audio-director warnings (empty when the plan scheduled cleanly). */
  warnings: ScheduleWarning[];
};

export type PresentTurnOptions = RenderOptions & {
  /** Explicit scheduling clock (ms). Default: world.meta.tick * PRESENTATION_TICK_MS. */
  now?: number;
};

export type TurnPresenterOptions = {
  /**
   * Cue vocabulary mapping. Default: soundpack-core's `resolveSoundCue`
   * (the canonical gameplay-cue → CORE_SOUND_PACK table). Pass an
   * `extendCueMap(...)` resolver to redirect cues at a richer pack.
   */
  resolveSoundCue?: SoundCueResolver;
  /** Bring your own director (custom ducking/priorities). */
  director?: AudioDirector;
  /** Optional narrator voice profile stamped onto every plan (TTS embedders). */
  voiceProfile?: VoiceProfile;
};

/**
 * Terminal punctuation check for narration joins (F-b1b81929). A fragment
 * "ends punctuated" when its last character is `.`/`!`/`?`, optionally
 * followed by closing quotes/brackets — so `"Who goes there?"` counts, while
 * `stamina: 5 → 4` and `4 damage dealt (HP: 4)` do not.
 */
const TERMINAL_PUNCTUATION = /[.!?]["')\]]*$/;

/**
 * Build the turn's narration text from its formatted event lines — the exact
 * lines the log renders (minus the `> ` log affordance), joined into prose.
 * Single source of truth: narration can never say something the log doesn't.
 *
 * F-b1b81929: busy rounds used to join fragments with bare spaces —
 * "…stamina: 5 → 4 Hit! …" read as one run-on mash. The join now adds a
 * period to any fragment lacking terminal punctuation BEFORE the space —
 * a punctuation-only transform at the joins: fragment CONTENT is still
 * formatEventLine's verbatim text, already-punctuated fragments are untouched,
 * and the final fragment keeps its original ending (no join follows it).
 */
export function narrationTextFromEvents(events: readonly ResolvedEvent[]): string {
  const sentences: string[] = [];
  for (const event of events) {
    const line = formatEventLine(event);
    if (!line) continue;
    sentences.push(line.startsWith('> ') ? line.slice(2) : line);
  }
  if (sentences.length === 0) return QUIET_TURN_TEXT;
  return sentences
    .map((s, i) =>
      i < sentences.length - 1 && !TERMINAL_PUNCTUATION.test(s) ? `${s}.` : s,
    )
    .join(' ');
}

/**
 * Style a plan's narration by tone/urgency with the Stage-D palette.
 * Precedence: triumph (green bold) and sorrow (dim) are tone-specific
 * moments that outrank the urgency ramp; then critical (red bold), elevated
 * (yellow), else plain. Color is redundant emphasis only — stripping ANSI
 * yields the identical plain text (pinned by test).
 */
export function renderNarrationLine(plan: NarrationPlan, opts?: RenderOptions): string {
  const pal = makePalette(opts?.color ?? detectColorEnabled());
  const text = plan.sceneText;
  if (plan.tone === 'triumph') return pal.green(pal.bold(text));
  if (plan.tone === 'sorrow') return pal.dim(text);
  if (plan.urgency === 'critical') return pal.red(pal.bold(text));
  if (plan.urgency === 'elevated') return pal.yellow(text);
  return text;
}

/** Per-resource cooldowns from the core pack, honoring each SoundEntry's own cooldownMs. */
function corePackCooldowns(): Record<string, number> {
  const cooldowns: Record<string, number> = {};
  for (const entry of CORE_SOUND_PACK.entries) {
    cooldowns[entry.id] = entry.cooldownMs;
  }
  return cooldowns;
}

/**
 * Stateful presenter for a game session. Holds ONE AudioDirector across turns
 * so sfx cooldowns are real (a `combat.hit` every tick does not restrike
 * `alert_warning` inside its cooldown window) and ambient layer tracking can
 * accumulate. Create one per engine/session; for one-off use see
 * {@link presentTurn}.
 */
export class TurnPresenter {
  private readonly director: AudioDirector;
  private readonly resolveCue: SoundCueResolver;
  private readonly voiceProfile?: VoiceProfile;

  constructor(opts?: TurnPresenterOptions) {
    this.director =
      opts?.director ?? new AudioDirector({ cooldownMs: corePackCooldowns() });
    this.resolveCue = opts?.resolveSoundCue ?? resolveSoundCue;
    this.voiceProfile = opts?.voiceProfile;
  }

  /**
   * Present one turn: build the NarrationPlan from the turn's events, style
   * its text for the terminal, and schedule its audio.
   *
   * @param world  Current world state (playerId + tick are read).
   * @param events THIS turn's resolved events (e.g. the submitAction return,
   *               or an eventLog slice since the previous present).
   */
  present(
    world: WorldState,
    events: readonly ResolvedEvent[],
    opts?: PresentTurnOptions,
  ): PresentedTurn {
    const narrationText = narrationTextFromEvents(events);
    const plan = buildNarrationPlan({
      sceneText: narrationText,
      events: [...events],
      resolveSoundCue: this.resolveCue,
      playerId: world.playerId,
      ...(this.voiceProfile ? { voiceProfile: this.voiceProfile } : {}),
    });

    const now = opts?.now ?? world.meta.tick * PRESENTATION_TICK_MS;
    const audioCommands = this.director.schedule(plan, now);

    return {
      plan,
      audioCommands,
      narrationText: plan.sceneText,
      styledNarration: renderNarrationLine(plan, opts),
      warnings: this.director.getLastWarnings(),
    };
  }
}

/**
 * One-shot convenience: present a single turn with a fresh presenter.
 * NOTE: cooldown state is NOT carried between calls — for a real session
 * loop, hold a {@link TurnPresenter}.
 */
export function presentTurn(
  world: WorldState,
  events: readonly ResolvedEvent[],
  opts?: PresentTurnOptions & TurnPresenterOptions,
): PresentedTurn {
  return new TurnPresenter(opts).present(world, events, opts);
}
