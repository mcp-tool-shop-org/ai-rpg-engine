// Timing and sequencing logic for audio commands

import type { NarrationPlan, SfxCue, AmbientCue, MusicCue, SpeakerCue } from '@ai-rpg-engine/presentation';
import type { AudioCommand, AudioDomain } from './types.js';

/** Estimate speech duration in ms from text length. */
function estimateSpeechDurationMs(text: string, speed: number): number {
  const wordsPerMinute = 150 * speed;
  const wordCount = text.split(/\s+/).length;
  return Math.round((wordCount / wordsPerMinute) * 60_000);
}

/** Convert SFX cues to AudioCommands with timing offsets. */
export function scheduleSfx(
  sfx: SfxCue[],
  speechDurationMs: number,
  basePriority: number,
): AudioCommand[] {
  return sfx.map((cue) => {
    let timing = 0;
    if (cue.timing === 'with-text') timing = 200;
    else if (cue.timing === 'after-text') timing = speechDurationMs + 100;

    return {
      domain: 'sfx' as AudioDomain,
      action: 'play',
      resourceId: cue.effectId,
      priority: basePriority,
      timing,
      params: { intensity: cue.intensity },
    };
  });
}

/** Convert ambient cues to AudioCommands. */
export function scheduleAmbient(
  layers: AmbientCue[],
  basePriority: number,
): AudioCommand[] {
  return layers.map((cue) => ({
    domain: 'ambient' as AudioDomain,
    action: cue.action,
    resourceId: cue.layerId,
    priority: basePriority,
    timing: 0,
    params: { volume: cue.volume, fadeMs: cue.fadeMs },
  }));
}

/** Convert a music cue to an AudioCommand. */
export function scheduleMusic(
  cue: MusicCue,
  basePriority: number,
): AudioCommand {
  return {
    domain: 'music' as AudioDomain,
    action: cue.action,
    resourceId: cue.trackId ?? '',
    priority: basePriority,
    timing: 0,
    params: { fadeMs: cue.fadeMs },
  };
}

/** Convert a speaker cue to a voice AudioCommand. */
export function scheduleVoice(
  cue: SpeakerCue,
  basePriority: number,
): AudioCommand {
  return {
    domain: 'voice' as AudioDomain,
    action: 'play',
    resourceId: cue.voiceId,
    priority: basePriority,
    timing: 0,
    params: {
      text: cue.text,
      emotion: cue.emotion,
      speed: cue.speed,
      entityId: cue.entityId,
    },
  };
}

/** Schedule all cues from a NarrationPlan into ordered AudioCommands. */
export function scheduleAll(
  plan: NarrationPlan,
  domainPriorities: Record<AudioDomain, number>,
): AudioCommand[] {
  const commands: AudioCommand[] = [];
  const speechMs = plan.voiceProfile
    ? estimateSpeechDurationMs(plan.sceneText, plan.voiceProfile.speed)
    : estimateSpeechDurationMs(plan.sceneText, 1.0);

  // Voice (narrator or speaker)
  if (plan.speaker) {
    commands.push(scheduleVoice(plan.speaker, domainPriorities.voice));
  } else if (plan.voiceProfile) {
    commands.push(scheduleVoice({
      entityId: '__narrator__',
      voiceId: plan.voiceProfile.voiceId,
      emotion: plan.voiceProfile.emotion,
      speed: plan.voiceProfile.speed,
      text: plan.sceneText,
    }, domainPriorities.voice));
  }

  // SFX
  commands.push(...scheduleSfx(plan.sfx, speechMs, domainPriorities.sfx));

  // Ambient
  commands.push(...scheduleAmbient(plan.ambientLayers, domainPriorities.ambient));

  // Music
  if (plan.musicCue) {
    commands.push(scheduleMusic(plan.musicCue, domainPriorities.music));
  }

  // Sort by timing, then priority (higher first)
  commands.sort((a, b) => a.timing - b.timing || b.priority - a.priority);

  return commands;
}
