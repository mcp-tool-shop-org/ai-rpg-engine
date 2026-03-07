import { describe, it, expect } from 'vitest';
import { AudioDirector } from './director.js';
import type { NarrationPlan } from '@ai-rpg-engine/presentation';

const makePlan = (overrides: Partial<NarrationPlan> = {}): NarrationPlan => ({
  sceneText: 'You step into darkness.',
  tone: 'dread',
  urgency: 'normal',
  sfx: [],
  ambientLayers: [],
  uiEffects: [],
  interruptibility: 'free',
  ...overrides,
});

describe('AudioDirector', () => {
  it('should schedule voice commands from plan with speaker', () => {
    const director = new AudioDirector();
    const plan = makePlan({
      speaker: {
        entityId: 'pilgrim',
        voiceId: 'am_adam',
        emotion: 'fearful',
        speed: 0.9,
        text: 'Turn back!',
      },
    });

    const commands = director.schedule(plan);
    const voiceCmd = commands.find((c) => c.domain === 'voice');
    expect(voiceCmd).toBeDefined();
    expect(voiceCmd!.params.text).toBe('Turn back!');
  });

  it('should schedule SFX commands', () => {
    const director = new AudioDirector();
    const plan = makePlan({
      sfx: [{ effectId: 'alert_warning', timing: 'immediate', intensity: 0.8 }],
    });

    const commands = director.schedule(plan);
    const sfxCmd = commands.find((c) => c.domain === 'sfx');
    expect(sfxCmd).toBeDefined();
    expect(sfxCmd!.resourceId).toBe('alert_warning');
  });

  it('should schedule ambient commands', () => {
    const director = new AudioDirector();
    const plan = makePlan({
      ambientLayers: [{ layerId: 'ambient_drone', action: 'start', volume: 0.3, fadeMs: 1000 }],
    });

    const commands = director.schedule(plan);
    const ambientCmd = commands.find((c) => c.domain === 'ambient');
    expect(ambientCmd).toBeDefined();
    expect(ambientCmd!.resourceId).toBe('ambient_drone');
  });

  it('should add ducking commands when voice is playing', () => {
    const director = new AudioDirector();
    const plan = makePlan({
      speaker: {
        entityId: 'npc',
        voiceId: 'af_bella',
        emotion: 'calm',
        speed: 1.0,
        text: 'Hello.',
      },
    });

    const commands = director.schedule(plan);
    const duckCmd = commands.find((c) => c.action === 'duck');
    expect(duckCmd).toBeDefined();
  });

  it('should apply SFX cooldown', () => {
    const director = new AudioDirector();
    const plan = makePlan({
      sfx: [{ effectId: 'alert_warning', timing: 'immediate', intensity: 0.8 }],
    });

    director.schedule(plan);
    expect(director.isOnCooldown('alert_warning')).toBe(true);

    // Second schedule should filter out the cooled-down SFX
    const commands2 = director.schedule(plan);
    const sfxCmds = commands2.filter((c) => c.domain === 'sfx' && c.action === 'play');
    expect(sfxCmds).toHaveLength(0);
  });

  it('should track active ambient layers', () => {
    const director = new AudioDirector();
    const plan = makePlan({
      ambientLayers: [{ layerId: 'ambient_rain', action: 'start', volume: 0.4, fadeMs: 1000 }],
    });

    director.schedule(plan);
    expect(director.getActiveLayers().has('ambient_rain')).toBe(true);
  });

  it('should clear cooldowns', () => {
    const director = new AudioDirector();
    const plan = makePlan({
      sfx: [{ effectId: 'ui_click', timing: 'immediate', intensity: 0.5 }],
    });

    director.schedule(plan);
    expect(director.isOnCooldown('ui_click')).toBe(true);
    director.clearCooldowns();
    expect(director.isOnCooldown('ui_click')).toBe(false);
  });

  it('should schedule music commands', () => {
    const director = new AudioDirector();
    const plan = makePlan({
      musicCue: { action: 'intensify', fadeMs: 500 },
    });

    const commands = director.schedule(plan);
    const musicCmd = commands.find((c) => c.domain === 'music');
    expect(musicCmd).toBeDefined();
    expect(musicCmd!.action).toBe('intensify');
  });
});
