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

    const commands = director.schedule(plan, 0);
    const voiceCmd = commands.find((c) => c.domain === 'voice');
    expect(voiceCmd).toBeDefined();
    expect(voiceCmd!.params.text).toBe('Turn back!');
  });

  it('should schedule SFX commands', () => {
    const director = new AudioDirector();
    const plan = makePlan({
      sfx: [{ effectId: 'alert_warning', timing: 'immediate', intensity: 0.8 }],
    });

    const commands = director.schedule(plan, 0);
    const sfxCmd = commands.find((c) => c.domain === 'sfx');
    expect(sfxCmd).toBeDefined();
    expect(sfxCmd!.resourceId).toBe('alert_warning');
  });

  it('should schedule ambient commands', () => {
    const director = new AudioDirector();
    const plan = makePlan({
      ambientLayers: [{ layerId: 'ambient_drone', action: 'start', volume: 0.3, fadeMs: 1000 }],
    });

    const commands = director.schedule(plan, 0);
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

    const commands = director.schedule(plan, 0);
    const duckCmd = commands.find((c) => c.action === 'duck');
    expect(duckCmd).toBeDefined();
  });

  it('should apply SFX cooldown', () => {
    const director = new AudioDirector();
    const plan = makePlan({
      sfx: [{ effectId: 'alert_warning', timing: 'immediate', intensity: 0.8 }],
    });

    director.schedule(plan, 0);
    expect(director.isOnCooldown('alert_warning', 0)).toBe(true);

    // Second schedule at the same instant should filter out the cooled-down SFX
    const commands2 = director.schedule(plan, 0);
    const sfxCmds = commands2.filter((c) => c.domain === 'sfx' && c.action === 'play');
    expect(sfxCmds).toHaveLength(0);
  });

  it('should track active ambient layers', () => {
    const director = new AudioDirector();
    const plan = makePlan({
      ambientLayers: [{ layerId: 'ambient_rain', action: 'start', volume: 0.4, fadeMs: 1000 }],
    });

    director.schedule(plan, 0);
    expect(director.getActiveLayers().has('ambient_rain')).toBe(true);
  });

  it('should clear cooldowns', () => {
    const director = new AudioDirector();
    const plan = makePlan({
      sfx: [{ effectId: 'ui_click', timing: 'immediate', intensity: 0.5 }],
    });

    director.schedule(plan, 0);
    expect(director.isOnCooldown('ui_click', 0)).toBe(true);
    director.clearCooldowns();
    expect(director.isOnCooldown('ui_click', 0)).toBe(false);
  });

  it('should schedule music commands', () => {
    const director = new AudioDirector();
    const plan = makePlan({
      musicCue: { action: 'intensify', fadeMs: 500 },
    });

    const commands = director.schedule(plan, 0);
    const musicCmd = commands.find((c) => c.domain === 'music');
    expect(musicCmd).toBeDefined();
    expect(musicCmd!.action).toBe('intensify');
  });

  // PM-01: schedule/isOnCooldown must be deterministic — time is an explicit input.
  describe('deterministic clock (PM-01)', () => {
    it('schedule accepts an explicit clock and uses it for cooldown bookkeeping', () => {
      const director = new AudioDirector({ defaultCooldownMs: 1000 });
      const plan = makePlan({
        sfx: [{ effectId: 'alert_warning', timing: 'immediate', intensity: 0.8 }],
      });

      // Play at t=0.
      director.schedule(plan, 0);
      // Still on cooldown at t=999 (relative to the explicit clock, not wall time).
      expect(director.isOnCooldown('alert_warning', 999)).toBe(true);
      // Cooldown elapsed at t=1000.
      expect(director.isOnCooldown('alert_warning', 1000)).toBe(false);
    });

    it('second schedule at a later explicit time re-plays once cooldown elapsed', () => {
      const director = new AudioDirector({ defaultCooldownMs: 1000 });
      const plan = makePlan({
        sfx: [{ effectId: 'alert_warning', timing: 'immediate', intensity: 0.8 }],
      });

      director.schedule(plan, 0);
      // Re-schedule before cooldown elapses → SFX filtered out.
      const blocked = director.schedule(plan, 500);
      expect(blocked.filter((c) => c.domain === 'sfx' && c.action === 'play')).toHaveLength(0);

      // Re-schedule after cooldown elapses → SFX plays again.
      const allowed = director.schedule(plan, 2000);
      expect(allowed.filter((c) => c.domain === 'sfx' && c.action === 'play')).toHaveLength(1);
    });

    it('two directors driven by the same explicit clock produce byte-identical command streams', () => {
      const plan = makePlan({
        sfx: [{ effectId: 'alert_warning', timing: 'immediate', intensity: 0.8 }],
        ambientLayers: [{ layerId: 'ambient_drone', action: 'start', volume: 0.3, fadeMs: 1000 }],
      });
      const a = new AudioDirector();
      const b = new AudioDirector();
      // Identical inputs + identical clock ⇒ identical output, regardless of wall time.
      expect(JSON.stringify(a.schedule(plan, 12345))).toBe(JSON.stringify(b.schedule(plan, 12345)));
    });
  });

  // PM-02: per-resource cooldowns must be honored, not a single defaultCooldownMs.
  describe('per-resource cooldowns (PM-02)', () => {
    it('honors distinct per-resource cooldownMs over the default', () => {
      const director = new AudioDirector({
        defaultCooldownMs: 2000,
        cooldownMs: { ui_click: 200, alert_critical: 5000 },
      });

      const clickPlan = makePlan({
        sfx: [{ effectId: 'ui_click', timing: 'immediate', intensity: 0.5 }],
      });
      const critPlan = makePlan({
        sfx: [{ effectId: 'alert_critical', timing: 'immediate', intensity: 1.0 }],
      });

      director.schedule(clickPlan, 0);
      director.schedule(critPlan, 0);

      // At t=300: short-cooldown ui_click has recovered, long-cooldown alert_critical has not.
      expect(director.isOnCooldown('ui_click', 300)).toBe(false);
      expect(director.isOnCooldown('alert_critical', 300)).toBe(true);

      // alert_critical still cooling at t=4999, recovered at t=5000.
      expect(director.isOnCooldown('alert_critical', 4999)).toBe(true);
      expect(director.isOnCooldown('alert_critical', 5000)).toBe(false);
    });

    it('falls back to defaultCooldownMs for resources without a per-resource entry', () => {
      const director = new AudioDirector({
        defaultCooldownMs: 2000,
        cooldownMs: { ui_click: 200 },
      });
      const plan = makePlan({
        sfx: [{ effectId: 'alert_warning', timing: 'immediate', intensity: 0.8 }],
      });

      director.schedule(plan, 0);
      // Uses the 2000ms default since alert_warning has no per-resource override.
      expect(director.isOnCooldown('alert_warning', 1999)).toBe(true);
      expect(director.isOnCooldown('alert_warning', 2000)).toBe(false);
    });
  });
});
