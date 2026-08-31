import { describe, it, expect } from 'vitest';
import { AudioDirector } from './director.js';
import type { SoundLookup } from './types.js';
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

  it('resolves file-source effectIds to ingested hashes via soundRegistry (F-2f138ec3)', () => {
    const hash = 'a'.repeat(64);
    const director = new AudioDirector({
      variantRoll: 0,
      soundRegistry: {
        get(id) {
          if (id !== 'tavern_chatter') return undefined;
          return {
            source: 'file',
            variants: ['tavern_chatter_01.wav'],
            hashes: { 'tavern_chatter_01.wav': hash },
          };
        },
        pickVariant(id, _roll) {
          return id === 'tavern_chatter' ? 'tavern_chatter_01.wav' : undefined;
        },
      },
    });
    const plan = makePlan({
      sfx: [{ effectId: 'tavern_chatter', timing: 'immediate', intensity: 0.5 }],
    });
    const commands = director.schedule(plan, 0);
    const sfxCmd = commands.find((c) => c.domain === 'sfx' && c.action === 'play');
    expect(sfxCmd!.resourceId).toBe(hash);
    expect(sfxCmd!.params.effectId).toBe('tavern_chatter');
    expect(sfxCmd!.params.variant).toBe('tavern_chatter_01.wav');
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

    it('emits stop of the previous music stem then play of the new one (F-c53caff0)', () => {
      const director = new AudioDirector();
      director.schedule(makePlan({
        musicCue: { action: 'play', trackId: 'theme_a', fadeMs: 800 },
      }), 0);
      expect(director.getActiveMusic()).toBe('theme_a');

      const next = director.schedule(makePlan({
        musicCue: { action: 'play', trackId: 'theme_b', fadeMs: 400 },
      }), 1000);
      const music = next.filter((c) => c.domain === 'music');
      const stop = music.find((c) => c.action === 'stop');
      const play = music.find((c) => c.action === 'play');
      expect(stop?.resourceId).toBe('theme_a');
      expect(stop?.params.fadeMs).toBe(400);
      expect(play?.resourceId).toBe('theme_b');
      expect(music.indexOf(stop!)).toBeLessThan(music.indexOf(play!));
      expect(director.getActiveMusic()).toBe('theme_b');
      expect(director.getActiveLayers().get('theme_b')?.domain).toBe('music');
    });

    it('resolves music and voice file-source hashes (F-c53caff0)', () => {
      const musicHash = 'b'.repeat(64);
      const voiceHash = 'c'.repeat(64);
      const director = new AudioDirector({
        variantRoll: 0,
        soundRegistry: {
          get(id: string): ReturnType<SoundLookup['get']> {
            if (id === 'theme_file') {
              return { source: 'file', variants: ['theme.ogg'], hashes: { 'theme.ogg': musicHash } };
            }
            if (id === 'npc_voice') {
              return { source: 'file', variants: ['npc.wav'], hashes: { 'npc.wav': voiceHash } };
            }
            return undefined;
          },
          pickVariant(id) {
            if (id === 'theme_file') return 'theme.ogg';
            if (id === 'npc_voice') return 'npc.wav';
            return undefined;
          },
        },
      });
      const commands = director.schedule(makePlan({
        musicCue: { action: 'play', trackId: 'theme_file', fadeMs: 200 },
        speaker: {
          entityId: 'npc',
          voiceId: 'npc_voice',
          emotion: 'calm',
          speed: 1,
          text: 'Hello.',
        },
      }), 0);
      const music = commands.find((c) => c.domain === 'music' && c.action === 'play');
      const voice = commands.find((c) => c.domain === 'voice' && c.action === 'play');
      expect(music!.resourceId).toBe(musicHash);
      expect(voice!.resourceId).toBe(voiceHash);
      expect(director.getActiveMusic()).toBe(musicHash);
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

  // AUD-001: schedule() previously read plan.sceneText.split / plan.sfx.map /
  // plan.ambientLayers.map with no guard, so an incomplete plan (a consumer
  // mistake — e.g. forgetting sfx/ambientLayers) crashed with a raw
  // ".map of undefined". Per WARN-AND-DEGRADE it must now degrade: return [] and
  // surface a structured warning naming the missing field, not throw.
  describe('invalid plan handling (AUD-001)', () => {
    it('returns [] instead of crashing when the plan is missing arrays', () => {
      const director = new AudioDirector();
      // Incomplete plan: a consumer built it by hand and forgot sfx/ambientLayers.
      const broken = { sceneText: 'A scene.', tone: 'calm', urgency: 'normal' } as unknown as NarrationPlan;

      expect(() => director.schedule(broken, 0)).not.toThrow();
      expect(director.schedule(broken, 0)).toEqual([]);
    });

    it('surfaces a structured warning naming the offending field via onWarn', () => {
      const warnings: { field: string; message: string }[] = [];
      const director = new AudioDirector({ onWarn: (w) => warnings.push(w) });
      const broken = { sceneText: 'A scene.', tone: 'calm', urgency: 'normal' } as unknown as NarrationPlan;

      director.schedule(broken, 0);

      // At least one warning, and the missing sfx array is named with a fix hint.
      expect(warnings.length).toBeGreaterThan(0);
      const sfxWarn = warnings.find((w) => w.field === 'sfx');
      expect(sfxWarn).toBeDefined();
      expect(sfxWarn!.message).toMatch(/sfx/);
    });

    it('exposes the last batch of warnings via getLastWarnings()', () => {
      const director = new AudioDirector();
      const broken = { sceneText: 'A scene.' } as unknown as NarrationPlan;

      director.schedule(broken, 0);
      const warns = director.getLastWarnings();
      expect(warns.length).toBeGreaterThan(0);
      expect(warns.every((w) => typeof w.field === 'string' && typeof w.message === 'string')).toBe(true);
    });

    it('hard-throws a structured error for a non-object plan (would crash anyway)', () => {
      const director = new AudioDirector();
      expect(() => director.schedule(null as unknown as NarrationPlan, 0)).toThrow(/NarrationPlan/);
    });

    it('still schedules normally and reports no warnings for a valid plan', () => {
      const director = new AudioDirector();
      const plan = makePlan({
        sfx: [{ effectId: 'alert_warning', timing: 'immediate', intensity: 0.8 }],
      });

      const commands = director.schedule(plan, 0);
      expect(commands.length).toBeGreaterThan(0);
      expect(director.getLastWarnings()).toEqual([]);
    });
  });

  // F-fa44e956: gameplay had no way to drive a music sting (victory/defeat
  // fanfare) without killing the zone stem — scheduleMusic's action always
  // folded into schedule()'s single-slot activeMusicId bookkeeping, so any
  // play/crossfade stopped whatever was already playing. scheduleSting is
  // a distinct entry point that never touches activeMusicId/activeLayers.
  describe('music stings (F-fa44e956)', () => {
    it('a sting play must not clear or crossfade-stop activeMusicId', () => {
      const director = new AudioDirector();
      director.schedule(makePlan({
        musicCue: { action: 'play', trackId: 'crypt_theme', fadeMs: 800 },
      }), 0);
      expect(director.getActiveMusic()).toBe('crypt_theme');

      director.scheduleSting('music_victory_sting');

      expect(director.getActiveMusic()).toBe('crypt_theme');
      expect(director.getActiveLayers().get('crypt_theme')?.domain).toBe('music');
    });

    it('returns a music-domain command tagged with a distinct action, not play/crossfade/stop', () => {
      const director = new AudioDirector();
      const cmd = director.scheduleSting('music_victory_sting');
      expect(cmd.domain).toBe('music');
      expect(cmd.resourceId).toBe('music_victory_sting');
      expect(cmd.action).toBe('sting');
      expect(cmd.action).not.toBe('play');
      expect(cmd.action).not.toBe('crossfade');
      expect(cmd.action).not.toBe('stop');
    });

    it('a sting never appears in getActiveLayers as the active music', () => {
      const director = new AudioDirector();
      director.scheduleSting('music_victory_sting');
      expect(director.getActiveLayers().has('music_victory_sting')).toBe(false);
      expect(director.getActiveMusic()).toBeNull();
    });

    it('a later normal stem crossfade after a sting behaves exactly as if the sting never happened', () => {
      const director = new AudioDirector();
      director.schedule(makePlan({
        musicCue: { action: 'play', trackId: 'theme_a', fadeMs: 800 },
      }), 0);
      director.scheduleSting('music_victory_sting');

      const next = director.schedule(makePlan({
        musicCue: { action: 'play', trackId: 'theme_b', fadeMs: 400 },
      }), 1000);
      const music = next.filter((c) => c.domain === 'music');
      const stop = music.find((c) => c.action === 'stop');
      expect(stop?.resourceId).toBe('theme_a');
      expect(director.getActiveMusic()).toBe('theme_b');
    });

    it('resolves a file-source sting to its ingested hash via soundRegistry, same as a normal play', () => {
      const stingHash = 'd'.repeat(64);
      const director = new AudioDirector({
        variantRoll: 0,
        soundRegistry: {
          get(id: string): ReturnType<SoundLookup['get']> {
            if (id === 'custom_sting') {
              return { source: 'file', variants: ['sting.wav'], hashes: { 'sting.wav': stingHash } };
            }
            return undefined;
          },
          pickVariant(id) {
            return id === 'custom_sting' ? 'sting.wav' : undefined;
          },
        },
      });
      const cmd = director.scheduleSting('custom_sting');
      expect(cmd.resourceId).toBe(stingHash);
      expect(cmd.action).toBe('sting');
      expect(cmd.params.effectId).toBe('custom_sting');
    });

    it('an optional fadeMs is forwarded in params for a soft fade-in over the mix', () => {
      const director = new AudioDirector();
      const cmd = director.scheduleSting('music_victory_sting', { fadeMs: 250 });
      expect(cmd.params.fadeMs).toBe(250);
    });

    it('does not touch the music cooldown clock (still OPEN F-a360ad62)', () => {
      const director = new AudioDirector();
      director.scheduleSting('music_victory_sting');
      // No cooldown bookkeeping is created for the sting's resourceId.
      expect(director.isOnCooldown('music_victory_sting', 0)).toBe(false);
    });
  });
});
