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
  deriveStingCue,
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

// F-32948b79: the authoritative "the fight is over" signal (modules'
// engagement-core, landing this wave) — distinct from any single defeat.
const encounterClearedEvent: NarrationSourceEvent = {
  type: 'combat.encounter.cleared',
  payload: {},
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

  // F-32948b79: triumph/flash are re-keyed off combat.encounter.cleared (the
  // authoritative "the fight is over" event) rather than "any non-player
  // defeat" — a defeat event alone no longer implies the encounter ended.
  it('a cleared encounter is critical + triumph with the defeat stinger and a flash', () => {
    const plan = buildNarrationPlan({
      sceneText: 'The Ash Ghoul crumbles to dust.',
      events: [hitEvent, defeatEvent, encounterClearedEvent],
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

  // F-32948b79: this used to read 'triumph' — without a playerId no defeat can
  // be ATTRIBUTED to the player (isPlayerDefeat always false), and the old
  // rule fell back to "any non-player-attributable defeat is triumphant".
  // Now that triumph requires combat.encounter.cleared (not just a defeat),
  // the documented default without playerId is 'combat', not 'triumph' — a
  // bare defeat is never enough on its own, attributable or not.
  it('without playerId, a defeat cannot be sorrow (unattributable) OR triumph (no clearance) — it reads as "combat" (documented default)', () => {
    const plan = buildNarrationPlan({
      sceneText: 'A body falls.',
      events: [playerDefeatEvent],
      resolveSoundCue: soundpackLikeResolver,
    });
    expect(plan.tone).toBe('combat');
  });

  it('without playerId, combat.encounter.cleared alone still triumphs — clearance needs no player attribution', () => {
    const plan = buildNarrationPlan({
      sceneText: 'The fight ends.',
      events: [encounterClearedEvent],
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

  it('control: with no player defeat in the turn, multiple non-player defeats PLUS clearance still triumphs (defeat count is irrelevant — clearance is what matters)', () => {
    const secondDefeat: NarrationSourceEvent = {
      type: 'combat.entity.defeated',
      payload: { entityId: 'bandit', entityName: 'Bandit', defeatedBy: 'player' },
      presentation: { priority: 'critical', soundCues: ['combat.defeat'] },
    };
    const plan = buildNarrationPlan({
      sceneText: 'Two enemies fall.',
      events: [defeatEvent, secondDefeat, encounterClearedEvent],
      resolveSoundCue: soundpackLikeResolver,
      playerId: 'player',
    });
    expect(plan.tone).toBe('triumph');
    expect(plan.uiEffects).toEqual([{ type: 'flash', durationMs: 250 }]);
  });
});

// F-32948b79: re-verified bug — deriveTone/deriveUiEffects used to read ANY
// non-player defeat as triumph/flash, so a companion's death (a non-player
// defeat with no encounter.cleared) rendered as a triumphant beat. Re-keyed
// to the authoritative combat.encounter.cleared event; a bare defeat now
// reads as the conservative 'combat' tone with no ui flash.
describe('buildNarrationPlan: triumph requires combat.encounter.cleared, not just a defeat (F-32948b79)', () => {
  it('a companion (or any non-player) death ALONE, with no encounter.cleared, is NOT triumph — the conservative "combat" tone, no flash', () => {
    const companionDeath: NarrationSourceEvent = {
      type: 'combat.entity.defeated',
      payload: { entityId: 'doc', entityName: 'Doc', defeatedBy: 'ghoul' },
      presentation: { priority: 'critical', soundCues: ['combat.defeat'] },
    };
    const plan = buildNarrationPlan({
      sceneText: 'Doc falls.',
      events: [hitEvent, companionDeath],
      resolveSoundCue: soundpackLikeResolver,
      playerId: 'player',
    });
    expect(plan.tone).toBe('combat');
    expect(plan.uiEffects).toEqual([]);
    expect(validateNarrationPlan(plan)).toEqual([]);
  });

  it('combat.encounter.cleared alone (no defeat event in the turn at all) still triumphs', () => {
    const plan = buildNarrationPlan({
      sceneText: 'The last hostile breaks and flees; the fight is over.',
      events: [encounterClearedEvent],
      resolveSoundCue: soundpackLikeResolver,
      playerId: 'player',
    });
    expect(plan.tone).toBe('triumph');
    expect(plan.uiEffects).toEqual([{ type: 'flash', durationMs: 250 }]);
  });

  it('a non-presentable combat.encounter.cleared (bookkeeping, no presentation block) is ignored — stays combat, not triumph', () => {
    const bookkeepingCleared: NarrationSourceEvent = { type: 'combat.encounter.cleared', payload: {} };
    const plan = buildNarrationPlan({
      sceneText: 'The ghoul falls.',
      events: [hitEvent, defeatEvent, bookkeepingCleared],
      resolveSoundCue: soundpackLikeResolver,
      playerId: 'player',
    });
    expect(plan.tone).toBe('combat');
    expect(plan.uiEffects).toEqual([]);
  });

  it('player-defeat still reads as sorrow even when combat.encounter.cleared ALSO fires the same turn (mutual kill — defeat wins, mirrors deriveStingCue)', () => {
    const plan = buildNarrationPlan({
      sceneText: 'Your killing blow lands as the last of your strength gives out.',
      events: [defeatEvent, encounterClearedEvent, playerDefeatEvent],
      resolveSoundCue: soundpackLikeResolver,
      playerId: 'player',
    });
    expect(plan.tone).toBe('sorrow');
    expect(plan.uiEffects).toEqual([{ type: 'fade-out', durationMs: 600 }]);
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
    // F-901767f5: sceneEnterEvent IS a world.zone.entered turn, so musicCue/
    // ambientLayers now populate via the scene.enter fallback (no
    // resolveZoneMood injected here) — see the dedicated zone-entry-music
    // describe block below for the full behavior this changed from/to.
    expect(plan.musicCue).toEqual({ action: 'play', trackId: 'music_calm', fadeMs: 1000 });
    expect(plan.ambientLayers).toEqual([{ layerId: 'ambient_white_noise', action: 'start', volume: 0.3, fadeMs: 1000 }]);
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
    // F-32948b79: a bare defeat (no combat.encounter.cleared) reads as
    // 'combat', not 'triumph' — see the re-key describe block above.
    const events = [hitEvent, defeatEvent];
    expect(deriveTone(events, 'player')).toBe('combat');
    expect(deriveUrgency(events)).toBe('critical');
  });
});

describe('buildNarrationPlan: deriveStingCue (F-0671a25f / F-b5150ad5)', () => {
  it('a combat.encounter.cleared event yields "combat.victory"', () => {
    expect(deriveStingCue([encounterClearedEvent], 'player')).toBe('combat.victory');
  });

  it('a player defeat yields "combat.defeat" even alongside a cleared event in the same turn (mutual kill — defeat wins, mirrors F-77706f09)', () => {
    expect(deriveStingCue([encounterClearedEvent, playerDefeatEvent], 'player')).toBe('combat.defeat');
  });

  it('a non-player defeat alone (no clearance) yields undefined', () => {
    expect(deriveStingCue([defeatEvent], 'player')).toBeUndefined();
  });

  it('a non-presentable encounter.cleared (no presentation block) is ignored, matching presentable()\'s bookkeeping exclusion', () => {
    const bookkeepingCleared: NarrationSourceEvent = { type: 'combat.encounter.cleared', payload: {} };
    expect(deriveStingCue([bookkeepingCleared], 'player')).toBeUndefined();
  });

  it('a calm turn (no combat events at all) yields undefined', () => {
    expect(deriveStingCue([sceneEnterEvent], 'player')).toBeUndefined();
  });
});

// Wave-2 R4 ruling, TTS scope expansion: dialogue.node.entered is structurally
// excluded from sceneText (formatEventLine renders it null — "rendered
// separately in dialogue display"), so the six dialogue hints could not reach
// spoken output through the existing pipeline. `asides` closes that gap: a
// new, additive NarrationPlan field built straight from the turn's raw
// events (which buildNarrationPlan already receives independently of
// sceneText), so a TTS embedder gets the same story beats the terminal's
// Dialogue section shows. Order mirrors the approved on-screen composition
// (texture -> bias -> the line itself -> world/party asides) since that is
// the more natural SPOKEN reading order (stage direction before the line,
// not after). dialogueHint is deliberately EXCLUDED from asides — it routes
// into SpeakerCue.emotion instead (verbatim, manner-shaped data a voice
// embedder can use directly), not into narratable prose.
describe('buildNarrationPlan: dialogue asides (TTS pipeline expansion)', () => {
  const fullHintEvent: NarrationSourceEvent = {
    type: 'dialogue.node.entered',
    payload: {
      nodeId: 'threat',
      speaker: 'Mira',
      text: "I don't know what you're talking about.",
      textureHint: 'Mira edging toward the exit, eyes darting',
      dialogueBias: 'A friend of the faction.',
      dialogueHint: 'evasive, deflecting, changing subject',
      partyPresence: 'Accompanied by Doc (support, HP 8/8, cautious)',
      pressureHint: 'faction-retaliation (imminent): the Ironclad Watch are mustering to move against you.',
      opportunityHint: 'delivery (available): Smuggle medicine past the checkpoint — 3 turns remaining',
    },
    presentation: { priority: 'high' },
  };

  it('a turn with no dialogue events at all leaves asides unset — byte-compat with today\'s exact plan', () => {
    const plan = buildNarrationPlan({ sceneText: 'You step into the chapel nave.', events: [sceneEnterEvent] });
    expect(plan.asides).toBeUndefined();
    expect(validateNarrationPlan(plan)).toEqual([]);
  });

  it('a plain dialogue node (no hints) contributes nothing to asides — the spoken line reaches an embedder via speaker, not asides (F-f1c74adc)', () => {
    const plan = buildNarrationPlan({ sceneText: 'The pilgrim leans close.', events: [dialogueEvent] });
    expect(plan.asides).toBeUndefined();
    expect(plan.speaker?.text).toBe('Turn back, traveler.');
    expect(validateNarrationPlan(plan)).toEqual([]);
  });

  it('a fully-hinted dialogue node composes texture -> bias -> party/pressure/opportunity, in that order, verbatim (no spoken line, no dialogueHint, no display parens/labels) (F-f1c74adc)', () => {
    const plan = buildNarrationPlan({ sceneText: 'ignored for this check', events: [fullHintEvent] });
    expect(plan.asides).toEqual([
      'Mira edging toward the exit, eyes darting',
      'A friend of the faction.',
      'Accompanied by Doc (support, HP 8/8, cautious)',
      'faction-retaliation (imminent): the Ironclad Watch are mustering to move against you.',
      'delivery (available): Smuggle medicine past the checkpoint — 3 turns remaining',
    ]);
    expect(validateNarrationPlan(plan)).toEqual([]);
  });

  it('never duplicates the spoken line into asides when both speaker and asides are set (F-f1c74adc)', () => {
    const plan = buildNarrationPlan({ sceneText: 'ignored for this check', events: [fullHintEvent] });
    expect(plan.speaker?.text).toBe("I don't know what you're talking about.");
    expect(plan.asides).toBeDefined();
    expect(plan.asides).not.toContain(plan.speaker?.text);
  });

  it('a dialogue node with no text contributes nothing (matches deriveSpeaker\'s own no-text exclusion)', () => {
    const mute: NarrationSourceEvent = {
      type: 'dialogue.node.entered',
      payload: { nodeId: 'mute', speaker: 'Ghost', textureHint: 'a chill in the air' },
      presentation: { priority: 'high' },
    };
    const plan = buildNarrationPlan({ sceneText: 'Silence.', events: [mute] });
    expect(plan.asides).toBeUndefined();
  });

  it('a non-presentable dialogue.node.entered (bookkeeping, no presentation block) yields neither asides nor a speaker cue (F-25e3c162)', () => {
    const bookkeeping: NarrationSourceEvent = {
      type: 'dialogue.node.entered',
      payload: { nodeId: 'x', speaker: 'X', text: 'should not speak' },
    };
    const plan = buildNarrationPlan({ sceneText: 'ignored', events: [bookkeeping] });
    expect(plan.asides).toBeUndefined();
    // F-25e3c162: deriveSpeaker must gate on presentable() like every
    // sibling derivation over the same event set (deriveTone, deriveUrgency,
    // deriveStingCue, dialogueAsides) -- a bookkeeping-only dialogue node
    // must not populate plan.speaker any more than it populates plan.asides.
    expect(plan.speaker).toBeUndefined();
  });

  it('multiple dialogue nodes in one turn contribute their surrounding fragments in event order (F-f1c74adc: spoken lines excluded from both)', () => {
    const first: NarrationSourceEvent = {
      type: 'dialogue.node.entered',
      payload: { nodeId: 'entry', speaker: 'Weary Pilgrim', text: 'Turn back, traveler.', textureHint: 'The pilgrim raises a hand.' },
      presentation: { priority: 'high' },
    };
    const later: NarrationSourceEvent = {
      type: 'dialogue.node.entered',
      payload: { nodeId: 'warn', speaker: 'Weary Pilgrim', text: 'The crypt hungers.', textureHint: 'His voice drops.' },
      presentation: { priority: 'high' },
    };
    const plan = buildNarrationPlan({ sceneText: 'ignored', events: [first, later] });
    expect(plan.asides).toEqual(['The pilgrim raises a hand.', 'His voice drops.']);
  });

  describe('deriveSpeaker emotion (dialogueHint -> SpeakerCue.emotion, verbatim)', () => {
    it('a dialogueHint-bearing node yields SpeakerCue.emotion equal to the hint text', () => {
      const plan = buildNarrationPlan({ sceneText: 'ignored', events: [fullHintEvent] });
      expect(plan.speaker?.emotion).toBe('evasive, deflecting, changing subject');
    });

    it('a node with no dialogueHint still yields "neutral" (regression guard)', () => {
      const plan = buildNarrationPlan({ sceneText: 'ignored', events: [dialogueEvent] });
      expect(plan.speaker?.emotion).toBe('neutral');
    });
  });
});

// Composition half of media's F-901767f5: zone-entry turns populate
// musicCue/ambientLayers for the first time (both were previously ALWAYS
// undefined/[] — an honest ceiling this closes). `resolveZoneMood` is the
// injected seam (mirrors resolveSoundCue's posture: presentation stays
// dependency-free of soundpack-core) a caller wires to soundpack-core's
// districtToneToSoundMood bridge + a loaded SoundRegistry; that bridge does
// not exist in this worktree yet (media lands it this wave), so these tests
// exercise the seam directly with a fake resolver rather than the real one —
// the coordinator wires terminal-ui's TurnPresenter to the real bridge at
// the stitch. v1 semantics: only zone-entry turns are affected; every other
// turn is byte-identical to before this field existed.
describe('buildNarrationPlan: zone-entry music (F-901767f5 composition half)', () => {
  it('a non-zone-entry turn is byte-identical to today: musicCue undefined, ambientLayers []', () => {
    const plan = buildNarrationPlan({ sceneText: 'You strike the ghoul.', events: [hitEvent] });
    expect(plan.musicCue).toBeUndefined();
    expect(plan.ambientLayers).toEqual([]);
  });

  it('a zone-entry turn with no resolveZoneMood injected falls through to the scene.enter fallback', () => {
    const plan = buildNarrationPlan({ sceneText: 'Entered the nave.', events: [sceneEnterEvent] });
    expect(plan.musicCue).toEqual({ action: 'play', trackId: 'music_calm', fadeMs: 1000 });
    expect(plan.ambientLayers).toEqual([{ layerId: 'ambient_white_noise', action: 'start', volume: 0.3, fadeMs: 1000 }]);
    expect(validateNarrationPlan(plan)).toEqual([]);
  });

  it('a zone-entry turn with an injected resolveZoneMood uses ITS trackId/layerId over the fallback', () => {
    const zoneWithTone: NarrationSourceEvent = {
      type: 'world.zone.entered',
      payload: { zoneId: 'crypt', zoneName: 'Crypt', tone: 'dread' },
      presentation: { priority: 'normal', soundCues: ['scene.enter'] },
    };
    const plan = buildNarrationPlan({
      sceneText: 'Entered the crypt.',
      events: [zoneWithTone],
      resolveZoneMood: (tone) => (tone === 'dread' ? { trackId: 'music_dread', layerId: 'ambient_drone' } : undefined),
    });
    expect(plan.musicCue).toEqual({ action: 'play', trackId: 'music_dread', fadeMs: 1000 });
    expect(plan.ambientLayers).toEqual([{ layerId: 'ambient_drone', action: 'start', volume: 0.3, fadeMs: 1000 }]);
  });

  it('an unmapped tone (resolveZoneMood returns undefined) falls through to the scene.enter fallback', () => {
    const zoneWithTone: NarrationSourceEvent = {
      type: 'world.zone.entered',
      payload: { zoneId: 'nowhere', zoneName: 'Nowhere', tone: 'unmapped-tone' },
      presentation: { priority: 'normal' },
    };
    const plan = buildNarrationPlan({
      sceneText: 'Entered nowhere.',
      events: [zoneWithTone],
      resolveZoneMood: () => undefined,
    });
    expect(plan.musicCue).toEqual({ action: 'play', trackId: 'music_calm', fadeMs: 1000 });
    expect(plan.ambientLayers).toEqual([{ layerId: 'ambient_white_noise', action: 'start', volume: 0.3, fadeMs: 1000 }]);
  });

  it('a zone-entry turn with no tone on the payload falls through to the fallback even with a resolver injected', () => {
    const plan = buildNarrationPlan({
      sceneText: 'Entered the nave.',
      events: [sceneEnterEvent], // no `tone` field
      resolveZoneMood: () => ({ trackId: 'should-not-be-used', layerId: 'should-not-be-used' }),
    });
    expect(plan.musicCue).toEqual({ action: 'play', trackId: 'music_calm', fadeMs: 1000 });
  });
});
