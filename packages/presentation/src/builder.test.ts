// buildNarrationPlan tests — the producer half of the presentation stack.
// Contract under test: deterministic derivation, ALWAYS-valid output
// (validateNarrationPlan returns []), correct tone/urgency per event kinds,
// and cue collection that respects the injected vocabulary resolver.

import { describe, it, expect } from 'vitest';
import {
  buildNarrationPlan,
  collectSoundCues,
  deriveTone,
  deriveUrgency,
  type NarrationSourceEvent,
  type SoundCueResolver,
} from './builder.js';
import { validateNarrationPlan } from './validate.js';

// ─── Event fixtures shaped like the modules' real emissions ─────────────────

const hitEvent: NarrationSourceEvent = {
  type: 'combat.damage.applied',
  payload: { attackerId: 'player', targetId: 'ghoul', damage: 4, currentHp: 4 },
  presentation: { priority: 'high', soundCues: ['combat.hit'] },
};

const defeatEvent: NarrationSourceEvent = {
  type: 'combat.entity.defeated',
  payload: { entityId: 'ghoul', entityName: 'Ash Ghoul', defeatedBy: 'player' },
  presentation: { priority: 'critical', soundCues: ['combat.defeat'] },
};

const playerDefeatEvent: NarrationSourceEvent = {
  type: 'combat.entity.defeated',
  payload: { entityId: 'player', entityName: 'You', defeatedBy: 'ghoul' },
  presentation: { priority: 'critical', soundCues: ['combat.defeat'] },
};

const sceneEnterEvent: NarrationSourceEvent = {
  type: 'world.zone.entered',
  payload: { zoneId: 'chapel-nave', zoneName: 'Chapel Nave' },
  presentation: { priority: 'normal', soundCues: ['scene.enter'] },
};

const stingerEvent: NarrationSourceEvent = {
  type: 'audio.cue.requested',
  payload: { cueId: 'scene.crypt-reveal', channel: 'stinger', priority: 'high' },
};

const dialogueEvent: NarrationSourceEvent = {
  type: 'dialogue.node.entered',
  payload: { nodeId: 'entry', speaker: 'Weary Pilgrim', text: 'Turn back, traveler.' },
  presentation: { priority: 'high' },
};

// A stand-in for soundpack-core's resolveSoundCue (presentation must not
// depend on soundpack-core; the real composition is tested in terminal-ui).
const soundpackLikeResolver: SoundCueResolver = (cue) => {
  const table: Record<string, { effectId: string; timing: 'immediate' | 'with-text' | 'after-text'; intensity: number }> = {
    'combat.hit': { effectId: 'alert_warning', timing: 'with-text', intensity: 0.6 },
    'combat.defeat': { effectId: 'alert_critical', timing: 'with-text', intensity: 0.9 },
    'scene.enter': { effectId: 'ui_whoosh', timing: 'immediate', intensity: 0.3 },
    'scene.crypt-reveal': { effectId: 'ui_attention', timing: 'immediate', intensity: 0.7 },
  };
  return table[cue] ?? { effectId: 'ui_notification', timing: 'with-text', intensity: 0.4 };
};

describe('buildNarrationPlan: combat turns', () => {
  it('a damage turn produces an elevated combat plan with the mapped hit sfx', () => {
    const plan = buildNarrationPlan({
      sceneText: 'You strike the ghoul. 4 damage dealt.',
      events: [hitEvent],
      resolveSoundCue: soundpackLikeResolver,
      playerId: 'player',
    });

    expect(validateNarrationPlan(plan)).toEqual([]);
    expect(plan.tone).toBe('combat');
    expect(plan.urgency).toBe('elevated');
    expect(plan.sfx).toEqual([{ effectId: 'alert_warning', timing: 'with-text', intensity: 0.6 }]);
    expect(plan.interruptibility).toBe('free');
  });

  it('a defeat turn is critical + triumph with the defeat stinger and a flash', () => {
    const plan = buildNarrationPlan({
      sceneText: 'The Ash Ghoul crumbles to dust.',
      events: [hitEvent, defeatEvent],
      resolveSoundCue: soundpackLikeResolver,
      playerId: 'player',
    });

    expect(validateNarrationPlan(plan)).toEqual([]);
    expect(plan.tone).toBe('triumph');
    expect(plan.urgency).toBe('critical');
    expect(plan.interruptibility).toBe('soft-lock');
    expect(plan.sfx.map((s) => s.effectId)).toEqual(['alert_warning', 'alert_critical']);
    expect(plan.uiEffects).toEqual([{ type: 'flash', durationMs: 250 }]);
  });

  it('the player falling reads as sorrow with a fade-out, not triumph', () => {
    const plan = buildNarrationPlan({
      sceneText: 'Darkness takes you.',
      events: [playerDefeatEvent],
      resolveSoundCue: soundpackLikeResolver,
      playerId: 'player',
    });

    expect(validateNarrationPlan(plan)).toEqual([]);
    expect(plan.tone).toBe('sorrow');
    expect(plan.urgency).toBe('critical');
    expect(plan.uiEffects).toEqual([{ type: 'fade-out', durationMs: 600 }]);
  });

  it('without playerId every defeat reads as triumph (documented default)', () => {
    const plan = buildNarrationPlan({
      sceneText: 'A body falls.',
      events: [playerDefeatEvent],
      resolveSoundCue: soundpackLikeResolver,
    });
    expect(plan.tone).toBe('triumph');
  });
});

describe('buildNarrationPlan: two defeats in one turn (F-77706f09)', () => {
  it('a non-player defeat followed by the PLAYER\'s own defeat still reads as a fade-out (mirrors deriveTone\'s sorrow precedence)', () => {
    // RED-PROOF: pre-fix, deriveUiEffects returned on the FIRST defeat event
    // in the list (flash, for the non-player defeat) and never looked further
    // — this fails without the fix (uiEffects would be 'flash') and passes
    // with it (uiEffects agrees with tone: 'fade-out').
    const plan = buildNarrationPlan({
      sceneText: 'The ghoul falls — but so do you.',
      events: [defeatEvent, playerDefeatEvent], // non-player defeat FIRST, player defeat LATER
      resolveSoundCue: soundpackLikeResolver,
      playerId: 'player',
    });

    expect(validateNarrationPlan(plan)).toEqual([]);
    expect(plan.tone).toBe('sorrow');
    expect(plan.uiEffects).toEqual([{ type: 'fade-out', durationMs: 600 }]);
  });

  it('control: with no player defeat in the turn, the first non-player defeat still flashes', () => {
    const secondDefeat: NarrationSourceEvent = {
      type: 'combat.entity.defeated',
      payload: { entityId: 'bandit', entityName: 'Bandit', defeatedBy: 'player' },
      presentation: { priority: 'critical', soundCues: ['combat.defeat'] },
    };
    const plan = buildNarrationPlan({
      sceneText: 'Two enemies fall.',
      events: [defeatEvent, secondDefeat],
      resolveSoundCue: soundpackLikeResolver,
      playerId: 'player',
    });
    expect(plan.tone).toBe('triumph');
    expect(plan.uiEffects).toEqual([{ type: 'flash', durationMs: 250 }]);
  });
});

describe('buildNarrationPlan: calm turns', () => {
  it('a quiet scene entry produces a calm, normal-urgency plan', () => {
    const plan = buildNarrationPlan({
      sceneText: 'You step into the chapel nave. Dust hangs in the light.',
      events: [sceneEnterEvent],
      resolveSoundCue: soundpackLikeResolver,
      playerId: 'player',
    });

    expect(validateNarrationPlan(plan)).toEqual([]);
    expect(plan.tone).toBe('calm');
    expect(plan.urgency).toBe('normal');
    expect(plan.interruptibility).toBe('free');
    expect(plan.sfx).toEqual([{ effectId: 'ui_whoosh', timing: 'immediate', intensity: 0.3 }]);
    expect(plan.uiEffects).toEqual([]);
    expect(plan.speaker).toBeUndefined();
    expect(plan.musicCue).toBeUndefined();
    expect(plan.ambientLayers).toEqual([]);
  });

  it('presentation-less bookkeeping never tints tone/urgency (stamina-tick class)', () => {
    // Recovery emits `combat.aftermath.stamina-tick` EVERY turn with no
    // presentation block. A quiet look-around must stay calm despite the
    // combat.* namespace — only presentation-bearing events drive derivation.
    const bookkeeping: NarrationSourceEvent = {
      type: 'combat.aftermath.stamina-tick',
      payload: { entityId: 'player', amount: 1 },
    };
    const inspected: NarrationSourceEvent = {
      type: 'world.zone.inspected',
      payload: { zoneId: 'chapel-entrance', zoneName: 'Chapel Entrance' },
    };
    const plan = buildNarrationPlan({
      sceneText: 'You look around the chapel entrance.',
      events: [inspected, bookkeeping],
      resolveSoundCue: soundpackLikeResolver,
      playerId: 'player',
    });
    expect(plan.tone).toBe('calm');
    expect(plan.urgency).toBe('normal');
    expect(validateNarrationPlan(plan)).toEqual([]);
  });

  it('an event-free turn still yields a valid calm plan with no sfx', () => {
    const plan = buildNarrationPlan({ sceneText: 'All is quiet.' });
    expect(validateNarrationPlan(plan)).toEqual([]);
    expect(plan.tone).toBe('calm');
    expect(plan.urgency).toBe('normal');
    expect(plan.sfx).toEqual([]);
  });
});

describe('buildNarrationPlan: dialogue', () => {
  it('the most recent dialogue node becomes the speaker cue', () => {
    const later: NarrationSourceEvent = {
      type: 'dialogue.node.entered',
      payload: { nodeId: 'warn', speaker: 'Weary Pilgrim', text: 'The crypt hungers.' },
      presentation: { priority: 'high' },
    };
    const plan = buildNarrationPlan({
      sceneText: 'The pilgrim leans close.',
      events: [dialogueEvent, later],
      resolveSoundCue: soundpackLikeResolver,
    });

    expect(validateNarrationPlan(plan)).toEqual([]);
    expect(plan.speaker).toEqual({
      entityId: 'Weary Pilgrim',
      voiceId: 'voice.weary-pilgrim',
      emotion: 'neutral',
      speed: 1,
      text: 'The crypt hungers.',
    });
    // Dialogue without combat stays calm; priority 'high' still elevates.
    expect(plan.tone).toBe('calm');
    expect(plan.urgency).toBe('elevated');
  });

  it('a dialogue node without text yields no speaker cue (never an invalid one)', () => {
    const broken: NarrationSourceEvent = {
      type: 'dialogue.node.entered',
      payload: { nodeId: 'mute', speaker: 'Ghost' },
    };
    const plan = buildNarrationPlan({ sceneText: 'Silence.', events: [broken] });
    expect(plan.speaker).toBeUndefined();
    expect(validateNarrationPlan(plan)).toEqual([]);
  });
});

describe('collectSoundCues', () => {
  it('collects module soundCues and audio.cue.requested cueIds in first-seen order', () => {
    expect(collectSoundCues([hitEvent, stingerEvent, defeatEvent])).toEqual([
      'combat.hit',
      'scene.crypt-reveal',
      'combat.defeat',
    ]);
  });

  it('dedupes repeated cues (one shot per turn; cooldowns arbitrate the rest)', () => {
    expect(collectSoundCues([hitEvent, hitEvent, hitEvent])).toEqual(['combat.hit']);
  });

  it('ignores empty and non-string cue values', () => {
    const junk: NarrationSourceEvent = {
      type: 'audio.cue.requested',
      payload: { cueId: 42 },
      presentation: { soundCues: ['', 'combat.hit'] },
    };
    expect(collectSoundCues([junk])).toEqual(['combat.hit']);
  });
});

describe('buildNarrationPlan: identity resolver default', () => {
  it('without a resolver, raw cue ids pass through with documented defaults', () => {
    const plan = buildNarrationPlan({ sceneText: 'Hit.', events: [hitEvent] });
    expect(plan.sfx).toEqual([{ effectId: 'combat.hit', timing: 'with-text', intensity: 0.5 }]);
    expect(validateNarrationPlan(plan)).toEqual([]);
  });
});

describe('buildNarrationPlan: robustness + determinism', () => {
  it('empty scene text degrades to the placeholder and still validates', () => {
    const plan = buildNarrationPlan({ sceneText: '   ' });
    expect(plan.sceneText).toBe('…');
    expect(validateNarrationPlan(plan)).toEqual([]);
  });

  it('voiceProfile passes through untouched', () => {
    const plan = buildNarrationPlan({
      sceneText: 'A voice narrates.',
      voiceProfile: { voiceId: 'v1', preset: 'narrator', emotion: 'warm', speed: 1.1 },
    });
    expect(plan.voiceProfile).toEqual({ voiceId: 'v1', preset: 'narrator', emotion: 'warm', speed: 1.1 });
    expect(validateNarrationPlan(plan)).toEqual([]);
  });

  it('same input produces a deep-equal plan (deterministic)', () => {
    const input = {
      sceneText: 'You strike the ghoul.',
      events: [hitEvent, stingerEvent, defeatEvent, dialogueEvent],
      resolveSoundCue: soundpackLikeResolver,
      playerId: 'player',
    };
    expect(buildNarrationPlan(input)).toEqual(buildNarrationPlan(input));
  });

  it('derivation helpers agree with the composed plan', () => {
    const events = [hitEvent, defeatEvent];
    expect(deriveTone(events, 'player')).toBe('triumph');
    expect(deriveUrgency(events)).toBe('critical');
  });
});
