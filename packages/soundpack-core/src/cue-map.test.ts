// Cue-map tests — the vocabulary bridge must be TOTAL for every cue the
// modules and starters actually emit, STABLE (same input → same output), and
// may only point at soundpack entries that exist in CORE_SOUND_PACK.

import { describe, it, expect } from 'vitest';
import {
  resolveSoundCue,
  extendCueMap,
  cueMapTargetIds,
  cueMapIsCoveredBy,
  cueMapCoverage,
  EXACT_CUE_MAP,
  NAMESPACE_CUE_MAP,
  FALLBACK_CUE,
  KNOWN_EVENT_SOUND_CUES,
  resolveAmbientBed,
  sceneBedTargetIds,
  resolveMusicStem,
  sceneMusicTargetIds,
  SCENE_MUSIC_MAP,
  resolveMusicSting,
  combatStingTargetIds,
  COMBAT_STING_MAP,
  districtToneToSoundMood,
  districtToneMoodValues,
} from './cue-map.js';
import { CORE_SOUND_PACK } from './core-pack.js';
import { SoundRegistry } from './registry.js';

// ─── The emitted-cue corpus ─────────────────────────────────────────────────
// Enumerated from the actual emit sites (2026-07, dogfood/v2.6):
//   - combat-core.ts:   soundCues ['combat.hit'], ['combat.defeat']
//   - status-effects.ts: soundCues ['combat.defeat']
//   - traversal-core.ts: soundCues ['scene.enter'], ['gate.refused']
//   - ability-core.ts:  soundCues [ability.ui.soundCue] → every starter
//                       defines `ability.<slug>` ids (39 across ten starters)
//   - starter setup.ts audio.cue.requested cueIds: 'combat.victory' plus one
//     scene.<moment> stinger per starter (including conviction / seizure)
// If a module starts emitting a NEW cue family, add it here — the totality
// test below is the contract that no emitted cue rides the fallback tier.
const MODULE_EVENT_CUES = ['combat.hit', 'combat.defeat', 'scene.enter', 'gate.refused'];

const STARTER_STINGER_CUES = [
  'combat.victory',
  'scene.crypt-reveal', // fantasy
  'scene.vault-reveal', // cyberpunk
  'scene.crime-scene-reveal', // detective
  'scene.sunken-shrine-reveal', // pirate
  'scene.hospital-reveal', // zombie
  'scene.spirit-hollow-reveal', // weird-west
  'scene.alien-cavern-reveal', // colony
  'scene.cellar-descent', // vampire
  'scene.arena-roar', // gladiator
  'scene.hidden-passage-reveal', // ronin
  'scene.conviction', // bounty-hunter
  'scene.seizure', // merchant
];

// Representative sample of the ability.* family (one per starter).
const ABILITY_CUES = [
  'ability.holy-smite',
  'ability.ice-breaker',
  'ability.deductive-strike',
  'ability.broadside',
  'ability.desperate-swing',
  'ability.dust-devil',
  'ability.plasma-burst',
  'ability.blood-drain',
  'ability.crowd-cleave',
  'ability.iaijutsu-strike',
];

const EMITTED_CUE_CORPUS = [
  ...MODULE_EVENT_CUES,
  ...STARTER_STINGER_CUES,
  ...ABILITY_CUES,
];

describe('cue-map: totality over the emitted vocabulary', () => {
  it('resolves every emitted cue without hitting the fallback tier', () => {
    for (const cue of EMITTED_CUE_CORPUS) {
      const resolved = resolveSoundCue(cue);
      expect(resolved.effectId, cue).toBeTruthy();
      // 'fallback' would mean the cue is UNMAPPED (merely degraded, not
      // routed) — every cue the engine actually emits must land on the exact
      // or namespace tier.
      expect(resolved.via, `cue "${cue}" fell through to the fallback tier`).not.toBe('fallback');
    }
  });

  it('is total for arbitrary unknown cues (fallback tier)', () => {
    for (const cue of ['weather.storm', 'nonsense', '', '...', 'ui']) {
      const resolved = resolveSoundCue(cue);
      expect(resolved.effectId).toBe(FALLBACK_CUE.effectId);
      expect(resolved.via).toBe('fallback');
    }
  });

  it('a leading-dot cue has no namespace and degrades to fallback', () => {
    expect(resolveSoundCue('.hidden').via).toBe('fallback');
  });
});

describe('cue-map: targets exist in CORE_SOUND_PACK', () => {
  const packIds = CORE_SOUND_PACK.entries.map((e) => e.id);

  it('every id the map can emit is a real core-pack entry', () => {
    for (const id of cueMapTargetIds()) {
      expect(packIds, `cue-map target "${id}" missing from CORE_SOUND_PACK`).toContain(id);
    }
    expect(cueMapIsCoveredBy(packIds)).toBe(true);
  });

  it('cueMapIsCoveredBy reports false for an incomplete entry set', () => {
    expect(cueMapIsCoveredBy(['ui_notification'])).toBe(false);
  });

  it('cueMapCoverage lists missing built-in targets for an incomplete set', () => {
    const cov = cueMapCoverage(['ui_notification']);
    expect(cov.covered).toEqual(['ui_notification']);
    expect(cov.missing.length).toBeGreaterThan(0);
    expect(cov.missing).toContain('alert_warning');
  });

  it('resolved sfx targets only sfx-domain entries (never ambient loops)', () => {
    // The map feeds NarrationPlan.sfx → AudioCommand domain 'sfx'; pointing a
    // one-shot cue at a long-loop ambient entry would loop it forever.
    for (const id of cueMapTargetIds()) {
      const entry = CORE_SOUND_PACK.entries.find((e) => e.id === id);
      expect(entry?.domain, id).toBe('sfx');
    }
  });
});

describe('cue-map: mapping table is stable', () => {
  it('pins the exact tier (documented mapping table)', () => {
    const reveal = { effectId: 'ui_attention', timing: 'immediate', intensity: 0.7 };
    expect(EXACT_CUE_MAP).toEqual({
      'combat.hit': { effectId: 'alert_warning', timing: 'with-text', intensity: 0.6 },
      'combat.defeat': { effectId: 'alert_critical', timing: 'with-text', intensity: 0.9 },
      'combat.victory': { effectId: 'ui_success', timing: 'after-text', intensity: 0.8 },
      'gate.refused': { effectId: 'ui_error', timing: 'with-text', intensity: 0.6 },
      'scene.enter': { effectId: 'ui_whoosh', timing: 'immediate', intensity: 0.3 },
      'scene.crypt-reveal': reveal,
      'scene.vault-reveal': reveal,
      'scene.crime-scene-reveal': reveal,
      'scene.sunken-shrine-reveal': reveal,
      'scene.hospital-reveal': reveal,
      'scene.spirit-hollow-reveal': reveal,
      'scene.alien-cavern-reveal': reveal,
      'scene.hidden-passage-reveal': reveal,
      'scene.cellar-descent': reveal,
      'scene.arena-roar': { effectId: 'alert_info', timing: 'immediate', intensity: 0.9 },
      'scene.conviction': { effectId: 'ui_success', timing: 'with-text', intensity: 0.8 },
      'scene.seizure': { effectId: 'alert_warning', timing: 'with-text', intensity: 0.7 },
    });
    expect([...KNOWN_EVENT_SOUND_CUES].sort()).toEqual(Object.keys(EXACT_CUE_MAP).sort());
  });

  it('pins the namespace tier', () => {
    expect(NAMESPACE_CUE_MAP).toEqual({
      ability: { effectId: 'ui_pop', timing: 'with-text', intensity: 0.5 },
      scene: { effectId: 'ui_attention', timing: 'immediate', intensity: 0.7 },
      combat: { effectId: 'alert_warning', timing: 'with-text', intensity: 0.5 },
      gate: { effectId: 'ui_error', timing: 'with-text', intensity: 0.5 },
    });
  });

  it('gate.refused is exact ui_error, not the notification fallback (F-612f46dd)', () => {
    const resolved = resolveSoundCue('gate.refused');
    expect(resolved.via).toBe('exact');
    expect(resolved.effectId).toBe('ui_error');
    expect(resolved.effectId).not.toBe(FALLBACK_CUE.effectId);
  });

  it('authored scene stingers resolve to distinct effectIds (F-bbfd268f)', () => {
    expect(resolveSoundCue('scene.arena-roar').effectId)
      .not.toBe(resolveSoundCue('scene.conviction').effectId);
    expect(resolveSoundCue('scene.arena-roar').via).toBe('exact');
    expect(resolveSoundCue('scene.conviction').via).toBe('exact');
    expect(resolveSoundCue('scene.seizure').via).toBe('exact');
    expect(resolveSoundCue('scene.conviction').effectId).toBe('ui_success');
    expect(resolveSoundCue('scene.seizure').effectId).toBe('alert_warning');
    expect(resolveSoundCue('scene.arena-roar').effectId).toBe('alert_info');
  });

  it('same cue resolves identically across calls (deterministic, no state)', () => {
    for (const cue of EMITTED_CUE_CORPUS) {
      expect(resolveSoundCue(cue)).toEqual(resolveSoundCue(cue));
    }
  });

  it('resolution returns copies — mutating a result cannot poison the map', () => {
    const first = resolveSoundCue('combat.hit');
    first.intensity = 0;
    (first as { effectId: string }).effectId = 'poisoned';
    expect(resolveSoundCue('combat.hit')).toEqual({
      effectId: 'alert_warning',
      timing: 'with-text',
      intensity: 0.6,
      via: 'exact',
    });
  });

  it('every target satisfies SfxCue bounds (intensity 0..1, valid timing)', () => {
    const timings = ['immediate', 'with-text', 'after-text'];
    for (const cue of [...EMITTED_CUE_CORPUS, 'unknown.cue']) {
      const r = resolveSoundCue(cue);
      expect(r.intensity).toBeGreaterThanOrEqual(0);
      expect(r.intensity).toBeLessThanOrEqual(1);
      expect(timings).toContain(r.timing);
    }
  });
});

describe('cue-map: exact tier wins over namespace tier', () => {
  it('combat.hit uses its exact entry, not the combat.* namespace entry', () => {
    const exact = resolveSoundCue('combat.hit');
    expect(exact.via).toBe('exact');
    expect(exact.intensity).toBe(0.6);
    // A non-exact combat.* cue rides the namespace tier.
    const ns = resolveSoundCue('combat.parry');
    expect(ns.via).toBe('namespace');
    expect(ns.effectId).toBe('alert_warning');
    expect(ns.intensity).toBe(0.5);
  });
});

describe('cue-map: extendCueMap overrides', () => {
  it('an override wins on exact id and reports via exact', () => {
    const resolve = extendCueMap({
      'ability.holy-smite': { effectId: 'ui_success', timing: 'immediate', intensity: 1 },
    });
    expect(resolve('ability.holy-smite')).toEqual({
      effectId: 'ui_success',
      timing: 'immediate',
      intensity: 1,
      via: 'exact',
    });
  });

  it('non-overridden cues fall through to the built-in map unchanged', () => {
    const resolve = extendCueMap({
      'ability.holy-smite': { effectId: 'ui_success', timing: 'immediate', intensity: 1 },
    });
    expect(resolve('combat.hit')).toEqual(resolveSoundCue('combat.hit'));
    expect(resolve('ability.purify')).toEqual(resolveSoundCue('ability.purify'));
  });
});

// F-d7c3c40a: ordinary object lookup inherited Object.prototype keys, so
// resolveSoundCue('toString') claimed via:'exact' with no effectId.
describe('cue-map: prototype keys fall through to fallback (F-d7c3c40a)', () => {
  it("resolveSoundCue('toString'|'constructor.foo'|'__proto__') is via fallback with FALLBACK_CUE.effectId", () => {
    for (const cue of ['toString', 'constructor.foo', '__proto__', 'valueOf', 'hasOwnProperty', 'constructor']) {
      const resolved = resolveSoundCue(cue);
      expect(resolved.via, cue).toBe('fallback');
      expect(resolved.effectId, cue).toBe(FALLBACK_CUE.effectId);
      expect(resolved.timing).toBe(FALLBACK_CUE.timing);
      expect(resolved.intensity).toBe(FALLBACK_CUE.intensity);
    }
  });
});

describe('cue-map: optional scene bed hints (F-57203b5e)', () => {
  it('does not change existing SFX exact/namespace rows', () => {
    expect(resolveSoundCue('scene.enter')).toEqual({
      effectId: 'ui_whoosh',
      timing: 'immediate',
      intensity: 0.3,
      via: 'exact',
    });
    expect(EXACT_CUE_MAP['scene.enter'].effectId).toBe('ui_whoosh');
    expect(NAMESPACE_CUE_MAP.scene.effectId).toBe('ui_attention');
  });

  it('resolves scene.enter to an ambient bed without touching the SFX id', () => {
    expect(resolveAmbientBed('scene.enter')).toEqual({
      layerId: 'ambient_white_noise',
      via: 'exact',
    });
    expect(resolveAmbientBed('scene.unlisted-moment')).toEqual({
      layerId: 'ambient_white_noise',
      via: 'namespace',
    });
    expect(resolveAmbientBed('combat.hit')).toBeUndefined();
  });

  it('bed targets exist in CORE_SOUND_PACK', () => {
    const have = new Set(CORE_SOUND_PACK.entries.map((e) => e.id));
    expect(sceneBedTargetIds().every((id) => have.has(id))).toBe(true);
  });
});

describe('cue-map: optional scene music stems (F-768980bb)', () => {
  it('does not change existing SFX exact/namespace rows', () => {
    expect(resolveSoundCue('scene.enter').effectId).toBe('ui_whoosh');
    expect(resolveSoundCue('scene.crypt-reveal').effectId).toBe('ui_attention');
    expect(resolveSoundCue('combat.hit').effectId).toBe('alert_warning');
  });

  it('resolves scene cues to music stems without touching ambient beds', () => {
    expect(resolveMusicStem('scene.enter')).toEqual({ trackId: 'music_calm', via: 'exact' });
    expect(resolveMusicStem('scene.crypt-reveal')).toEqual({ trackId: 'music_dread', via: 'exact' });
    expect(resolveMusicStem('scene.arena-roar')).toEqual({ trackId: 'music_triumph', via: 'exact' });
    expect(resolveMusicStem('scene.unlisted-moment')).toEqual({ trackId: 'music_calm', via: 'namespace' });
    expect(resolveMusicStem('combat.hit')).toBeUndefined();
    expect(resolveAmbientBed('scene.enter')?.layerId).toBe('ambient_white_noise');
    expect(SCENE_MUSIC_MAP['scene.enter'].trackId).toBe('music_calm');
  });

  it('music targets exist as domain:music long-loops in CORE_SOUND_PACK', () => {
    const have = new Set(CORE_SOUND_PACK.entries.map((e) => e.id));
    expect(sceneMusicTargetIds().every((id) => have.has(id))).toBe(true);
    for (const id of sceneMusicTargetIds()) {
      const entry = CORE_SOUND_PACK.entries.find((e) => e.id === id);
      expect(entry?.domain).toBe('music');
      expect(entry?.durationClass).toBe('long-loop');
    }
  });
});

describe('cue-map: optional combat music stings (F-fa44e956)', () => {
  it('does not change existing SFX exact/namespace rows', () => {
    expect(resolveSoundCue('combat.hit').effectId).toBe('alert_warning');
    expect(resolveSoundCue('combat.victory').effectId).toBe('ui_success');
    expect(resolveSoundCue('combat.defeat').effectId).toBe('alert_critical');
  });

  it('resolves combat.victory/combat.defeat to music stings, exact tier only (no namespace fallback)', () => {
    expect(resolveMusicSting('combat.victory')).toEqual({ trackId: 'music_victory_sting', via: 'exact' });
    expect(resolveMusicSting('combat.defeat')).toEqual({ trackId: 'music_defeat_sting', via: 'exact' });
    // combat.hit has no sting hint — undefined, not a namespace fallback to
    // either sting (unlike resolveMusicStem, this map has no namespace tier).
    expect(resolveMusicSting('combat.hit')).toBeUndefined();
    expect(resolveMusicSting('scene.enter')).toBeUndefined();
    expect(COMBAT_STING_MAP['combat.victory'].trackId).toBe('music_victory_sting');
  });

  it('is independent of resolveMusicStem — combat.victory has no loop-stem hint', () => {
    expect(resolveMusicStem('combat.victory')).toBeUndefined();
    expect(resolveMusicStem('combat.defeat')).toBeUndefined();
  });

  it('sting targets exist as domain:music oneshots in CORE_SOUND_PACK', () => {
    const have = new Set(CORE_SOUND_PACK.entries.map((e) => e.id));
    expect(combatStingTargetIds().every((id) => have.has(id))).toBe(true);
    for (const id of combatStingTargetIds()) {
      const entry = CORE_SOUND_PACK.entries.find((e) => e.id === id);
      expect(entry?.domain).toBe('music');
      expect(entry?.durationClass).toBe('oneshot');
    }
  });
});

// F-f8412999: bridge DistrictMood's 6-value `tone` enum (calm | tense |
// volatile | oppressive | grim | prosperous — @ai-rpg-engine/modules'
// district-mood.ts:26) to the sound-mood vocabulary CORE_SOUND_PACK entries
// already carry via SoundEntry.mood, so a zone entry's computed district
// mood can drive SoundRegistry.pickMusicStem/pickAmbientBed instead of a
// fifth parallel resolution table. The composition side (calling the
// registry with this bridged mood array, and falling through to today's
// fixed resolveMusicStem('scene.enter')/resolveAmbientBed('scene.enter')
// when there's no match) is cli-surface's work this wave — this suite pins
// only what soundpack-core owns: the bridge itself, its live-pack targets,
// and the fallback contract a caller depends on.
describe('districtToneToSoundMood: district-tone -> sound-mood bridge (F-f8412999)', () => {
  it('bridges all 6 DistrictMood tones to the sound-mood vocabulary (golden)', () => {
    expect(districtToneToSoundMood('calm')).toEqual(['calm']);
    expect(districtToneToSoundMood('tense')).toEqual(['tension']);
    expect(districtToneToSoundMood('volatile')).toEqual(['tension']);
    expect(districtToneToSoundMood('oppressive')).toEqual(['dread']);
    expect(districtToneToSoundMood('grim')).toEqual(['dread', 'negative']);
    expect(districtToneToSoundMood('prosperous')).toEqual(['positive']);
  });

  it('an unrecognized 7th tone is an explicit non-match, not a guess', () => {
    expect(districtToneToSoundMood('ecstatic')).toBeUndefined();
    expect(districtToneToSoundMood('')).toBeUndefined();
  });

  // Mirrors cue-map's F-d7c3c40a paranoia: an ordinary Record lookup lets
  // inherited Object.prototype keys masquerade as hits. DISTRICT_TONE_MOOD_MAP
  // is built the same null-prototype way as every other table in this file.
  it('inherited Object.prototype keys are not tone matches (F-d7c3c40a posture)', () => {
    for (const tone of ['toString', 'constructor', '__proto__', 'valueOf', 'hasOwnProperty']) {
      expect(districtToneToSoundMood(tone), tone).toBeUndefined();
    }
  });

  it('resolution returns copies — mutating a result cannot poison the bridge table', () => {
    const first = districtToneToSoundMood('grim');
    first?.push('poisoned');
    expect(districtToneToSoundMood('grim')).toEqual(['dread', 'negative']);
  });

  describe('pickMusicStem / pickAmbientBed against the live CORE_SOUND_PACK', () => {
    const registry = new SoundRegistry();
    registry.load(CORE_SOUND_PACK);

    it('calm picks music_calm / ambient_rain', () => {
      const mood = districtToneToSoundMood('calm');
      expect(registry.pickMusicStem({ mood }, 0)?.id).toBe('music_calm');
      expect(registry.pickAmbientBed({ mood }, 0)?.id).toBe('ambient_rain');
    });

    it('tense picks music_dread / ambient_drone', () => {
      const mood = districtToneToSoundMood('tense');
      expect(registry.pickMusicStem({ mood }, 0)?.id).toBe('music_dread');
      expect(registry.pickAmbientBed({ mood }, 0)?.id).toBe('ambient_drone');
    });

    it('volatile collapses onto the same dread-tagged targets as tense (only 3 stems/beds exist for 6 tones)', () => {
      const mood = districtToneToSoundMood('volatile');
      expect(registry.pickMusicStem({ mood }, 0)?.id).toBe('music_dread');
      expect(registry.pickAmbientBed({ mood }, 0)?.id).toBe('ambient_drone');
    });

    it('oppressive picks music_dread / ambient_drone', () => {
      const mood = districtToneToSoundMood('oppressive');
      expect(registry.pickMusicStem({ mood }, 0)?.id).toBe('music_dread');
      expect(registry.pickAmbientBed({ mood }, 0)?.id).toBe('ambient_drone');
    });

    it('grim picks music_dread / ambient_drone', () => {
      const mood = districtToneToSoundMood('grim');
      expect(registry.pickMusicStem({ mood }, 0)?.id).toBe('music_dread');
      expect(registry.pickAmbientBed({ mood }, 0)?.id).toBe('ambient_drone');
    });

    it('prosperous picks music_triumph but has NO ambient bed — the honest coverage gap, pinned not silently passing', () => {
      const mood = districtToneToSoundMood('prosperous');
      expect(registry.pickMusicStem({ mood }, 0)?.id).toBe('music_triumph');
      // No CORE_SOUND_PACK ambient entry carries a positive/triumph mood tag
      // today (ambient_rain=calm/melancholy, ambient_white_noise=neutral,
      // ambient_drone=dread/tension) — a content-authoring gap named in
      // F-f8412999's evidence_base, not a bug in this bridge. Pinned
      // explicitly so a future pack fixing the gap changes this assertion
      // deliberately instead of the gap silently regressing unnoticed.
      expect(registry.pickAmbientBed({ mood }, 0)).toBeUndefined();
    });
  });

  describe('fallback contract: no tone / unmatched tone (F-f8412999)', () => {
    it('the fallback target itself is untouched by this bridge — pinned to scene.enter\'s existing resolution', () => {
      expect(resolveMusicStem('scene.enter')).toEqual({ trackId: 'music_calm', via: 'exact' });
      expect(resolveAmbientBed('scene.enter')).toEqual({ layerId: 'ambient_white_noise', via: 'exact' });
    });

    it('no tone / unmatched tone resolves byte-identically to resolveMusicStem/resolveAmbientBed(scene.enter)', () => {
      const registry = new SoundRegistry();
      registry.load(CORE_SOUND_PACK);

      // Mirrors the addendum's recommended composition step (cli-surface's
      // job this wave, not soundpack-core's) closely enough to prove the
      // primitives this domain owns compose to an UNCHANGED result when
      // there is no mood signal. Test-local only — not a shipped function.
      function resolveZoneMusicForTest(tone: string | undefined, roll: number) {
        const mood = tone !== undefined ? districtToneToSoundMood(tone) : undefined;
        const picked = mood ? registry.pickMusicStem({ mood }, roll) : undefined;
        return picked ? { trackId: picked.id, via: 'mood' as const } : resolveMusicStem('scene.enter');
      }
      function resolveZoneAmbientForTest(tone: string | undefined, roll: number) {
        const mood = tone !== undefined ? districtToneToSoundMood(tone) : undefined;
        const picked = mood ? registry.pickAmbientBed({ mood }, roll) : undefined;
        return picked ? { layerId: picked.id, via: 'mood' as const } : resolveAmbientBed('scene.enter');
      }

      // No tone supplied (an unmapped zone).
      expect(resolveZoneMusicForTest(undefined, 0)).toEqual(resolveMusicStem('scene.enter'));
      expect(resolveZoneAmbientForTest(undefined, 0)).toEqual(resolveAmbientBed('scene.enter'));

      // Unmatched tone.
      expect(resolveZoneMusicForTest('ecstatic', 0)).toEqual(resolveMusicStem('scene.enter'));
      expect(resolveZoneAmbientForTest('ecstatic', 0)).toEqual(resolveAmbientBed('scene.enter'));
    });
  });

  describe('boot-time coverage invariant (extends the cue-map.ts:395-423 pattern)', () => {
    it('every mood the bridge can emit exists on at least one CORE_SOUND_PACK entry', () => {
      const allMoods = new Set(CORE_SOUND_PACK.entries.flatMap((e) => e.mood));
      for (const mood of districtToneMoodValues()) {
        expect(allMoods.has(mood), `bridge mood "${mood}" missing from every CORE_SOUND_PACK entry`).toBe(true);
      }
    });

    it('districtToneMoodValues() is the exact deduped, sorted set the bridge table can emit', () => {
      expect(districtToneMoodValues()).toEqual(['calm', 'dread', 'negative', 'positive', 'tension']);
    });

    // Documents WHY the invariant above checks "anywhere in the pack" rather
    // than per-channel (music-only / ambient-only): a per-channel version
    // would throw TODAY on 'positive', since it appears on music entries but
    // no ambient entry. This is the known content gap the pickAmbientBed
    // test above pins, not a mapping typo — so gating on it would make the
    // boot invariant dishonest (it would block boot over missing CONTENT,
    // not a broken MAPPING). If this test ever fails, the coverage gap
    // above has been closed and the invariant could be tightened to
    // per-channel; until then it stays intentionally pack-wide.
    it('documents the known gap: no ambient-domain entry is tagged positive/triumph mood (why the invariant is pack-wide, not per-channel)', () => {
      const ambientMoods = new Set(
        CORE_SOUND_PACK.entries.filter((e) => e.domain === 'ambient').flatMap((e) => e.mood),
      );
      expect(ambientMoods.has('positive')).toBe(false);
      expect(ambientMoods.has('triumph')).toBe(false);
    });
  });
});
