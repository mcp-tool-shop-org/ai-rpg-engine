// felt.ts — compose one turn of AudioCommand[] + SpeakerCue for a GUI client.
//
// The terminal already does this in TurnPresenter and then stays silent (no
// backend). The sidecar is the first host that can hand the same commands to a
// renderer that owns speakers. Composition is duplicated here rather than
// importing terminal-ui: sidecar must not depend on a terminal renderer.
//
// The payload is PRESENTATION. It never writes WorldState and is omitted from
// the state hash (GGPO: audio/video are non-state).

import type { ResolvedEvent, WorldState } from '@ai-rpg-engine/core';
import { buildNarrationPlan, deriveStingCue } from '@ai-rpg-engine/presentation';
import { AudioDirector, type AudioCommand } from '@ai-rpg-engine/audio-director';
import {
  CORE_SOUND_PACK,
  SoundRegistry,
  districtToneToSoundMood,
  hashRoll,
  resolveMusicSting,
  resolveSoundCue,
} from '@ai-rpg-engine/soundpack-core';
import type { FeltPayload, FeltSpeaker, FeltUiEffect } from './protocol.js';

/** Same clock the terminal presenter uses so cooldowns agree across hosts. */
export const FELT_TICK_MS = 1000;

function corePackCooldowns(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const entry of CORE_SOUND_PACK.entries) {
    if (typeof entry.cooldownMs === 'number') out[entry.id] = entry.cooldownMs;
  }
  return out;
}

/**
 * One composer per sidecar session so SFX cooldowns and ambient tracking
 * survive across turns the way TurnPresenter does for the CLI.
 */
export class FeltPresenter {
  private readonly director = new AudioDirector({ cooldownMs: corePackCooldowns() });
  private readonly zoneRegistry = new SoundRegistry();

  constructor() {
    this.zoneRegistry.load(CORE_SOUND_PACK);
  }

  present(world: WorldState, events: readonly ResolvedEvent[]): FeltPayload {
    const playerId = world.playerId;
    const plan = buildNarrationPlan({
      sceneText: '…',
      events: [...events],
      resolveSoundCue,
      ...(typeof playerId === 'string' ? { playerId } : {}),
      resolveZoneMood: this.resolveZoneMood,
    });

    const tick = typeof world.meta?.tick === 'number' ? world.meta.tick : 0;
    const now = tick * FELT_TICK_MS;
    const audioCommands = this.director.schedule(plan, now);

    const stingCue = deriveStingCue(events, playerId);
    const sting = stingCue ? resolveMusicSting(stingCue) : undefined;
    if (sting) this.director.scheduleStingInto(audioCommands, sting.trackId, { now });

    return toFeltPayload(audioCommands, plan.speaker, plan.uiEffects);
  }

  private resolveZoneMood = (
    tone: string,
    zoneId?: string,
  ): { trackId?: string; layerId?: string } | undefined => {
    const moods = districtToneToSoundMood(tone);
    if (!moods) return undefined;
    const roll = zoneId ? hashRoll(zoneId) : 0;
    const stem = this.zoneRegistry.pickMusicStem({ mood: [...moods] }, roll);
    const bed = this.zoneRegistry.pickAmbientBed({ mood: [...moods] }, roll);
    if (!stem && !bed) return undefined;
    return {
      ...(stem ? { trackId: stem.id } : {}),
      ...(bed ? { layerId: bed.id } : {}),
    };
  };
}

function toFeltPayload(
  audio: AudioCommand[],
  speaker: FeltSpeaker | undefined,
  uiEffects: FeltUiEffect[] | undefined,
): FeltPayload {
  const payload: FeltPayload = { audio };
  if (speaker && typeof speaker.text === 'string' && speaker.text.length > 0) {
    payload.speaker = {
      entityId: speaker.entityId,
      voiceId: speaker.voiceId,
      emotion: speaker.emotion,
      speed: speaker.speed,
      text: speaker.text,
    };
  }
  if (uiEffects && uiEffects.length > 0) payload.uiEffects = uiEffects;
  return payload;
}
