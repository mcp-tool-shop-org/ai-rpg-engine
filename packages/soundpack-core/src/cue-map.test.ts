// Cue-map tests — the vocabulary bridge must be TOTAL for every cue the
// modules and starters actually emit, STABLE (same input → same output), and
// may only point at soundpack entries that exist in CORE_SOUND_PACK.

import { describe, it, expect } from 'vitest';
import {
  resolveSoundCue,
  extendCueMap,
  cueMapTargetIds,
  cueMapIsCoveredBy,
  EXACT_CUE_MAP,
  NAMESPACE_CUE_MAP,
  FALLBACK_CUE,
  KNOWN_EVENT_SOUND_CUES,
} from './cue-map.js';
import { CORE_SOUND_PACK } from './core-pack.js';

// ─── The emitted-cue corpus ─────────────────────────────────────────────────
// Enumerated from the actual emit sites (2026-07, dogfood/v2.6):
//   - combat-core.ts:   soundCues ['combat.hit'], ['combat.defeat']
//   - status-effects.ts: soundCues ['combat.defeat']
//   - traversal-core.ts: soundCues ['scene.enter']
//   - ability-core.ts:  soundCues [ability.ui.soundCue] → every starter
//                       defines `ability.<slug>` ids (39 across ten starters)
//   - starter setup.ts audio.cue.requested cueIds: 'combat.victory' plus one
//     scene.<moment> stinger per starter
// If a module starts emitting a NEW cue family, add it here — the totality
// test below is the contract that no emitted cue rides the fallback tier.
const MODULE_EVENT_CUES = ['combat.hit', 'combat.defeat', 'scene.enter'];

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
    expect(EXACT_CUE_MAP).toEqual({
      'combat.hit': { effectId: 'alert_warning', timing: 'with-text', intensity: 0.6 },
      'combat.defeat': { effectId: 'alert_critical', timing: 'with-text', intensity: 0.9 },
      'combat.victory': { effectId: 'ui_success', timing: 'after-text', intensity: 0.8 },
      'scene.enter': { effectId: 'ui_whoosh', timing: 'immediate', intensity: 0.3 },
    });
    expect([...KNOWN_EVENT_SOUND_CUES].sort()).toEqual(Object.keys(EXACT_CUE_MAP).sort());
  });

  it('pins the namespace tier', () => {
    expect(NAMESPACE_CUE_MAP).toEqual({
      ability: { effectId: 'ui_pop', timing: 'with-text', intensity: 0.5 },
      scene: { effectId: 'ui_attention', timing: 'immediate', intensity: 0.7 },
      combat: { effectId: 'alert_warning', timing: 'with-text', intensity: 0.5 },
    });
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
