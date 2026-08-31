// Gameplay-cue → soundpack-id adapter — the single vocabulary bridge.
//
// Before this map, THREE cue vocabularies coexisted with zero shared members:
//
//   1. Module event cues — what gameplay modules attach to events:
//      `event.presentation.soundCues` (`combat.hit` / `combat.defeat` from
//      combat-core and status-effects, `scene.enter` / `gate.refused` from
//      traversal-core, `ability.<id>` forwarded from `ability.ui.soundCue`
//      by ability-core) plus the starters' `audio.cue.requested` stingers
//      (`combat.victory`, `scene.crypt-reveal`, `scene.arena-roar`, …).
//   2. Soundpack entry ids — what CORE_SOUND_PACK actually defines
//      (`ui_success`, `alert_critical`, `ambient_drone`, …). These are the
//      only ids with a concrete playable definition (a voice-soundboard
//      procedural effect).
//   3. NarrationPlan `SfxCue.effectId` — a free-string third space that
//      nothing constrained.
//
// This module makes #2 the CANONICAL space: gameplay cues resolve to soundpack
// entry ids, and NarrationPlan sfx cues are built from resolved ids (see
// `buildNarrationPlan` in @ai-rpg-engine/presentation, which accepts
// `resolveSoundCue` as its cue resolver). A scheduled
// `AudioCommand.resourceId` downstream is therefore always a real soundpack
// entry id that a playback backend can look up in a SoundRegistry.
//
// Resolution is TOTAL by construction — exact match, then `<namespace>.`
// match, then a final fallback — so no emitted cue ever falls through
// unmapped. The `via` field reports which tier matched, letting dev tooling
// flag cues that only survived on the fallback tier without ever breaking
// playback for players.
//
// Mapping table (canonical, keep in sync with the constants below):
//
//   | gameplay cue         | soundpack id     | timing     | intensity | tier      |
//   |----------------------|------------------|------------|-----------|-----------|
//   | combat.hit           | alert_warning    | with-text  | 0.6       | exact     |
//   | combat.defeat        | alert_critical   | with-text  | 0.9       | exact     |
//   | combat.victory       | ui_success       | after-text | 0.8       | exact     |
//   | gate.refused         | ui_error         | with-text  | 0.6       | exact     |
//   | scene.enter          | ui_whoosh        | immediate  | 0.3       | exact     |
//   | scene.*-reveal       | ui_attention     | immediate  | 0.7       | exact     |
//   | scene.arena-roar     | alert_info       | immediate  | 0.9       | exact     |
//   | scene.conviction     | ui_success       | with-text  | 0.8       | exact     |
//   | scene.seizure        | alert_warning    | with-text  | 0.7       | exact     |
//   | ability.*            | ui_pop           | with-text  | 0.5       | namespace |
//   | scene.*              | ui_attention     | immediate  | 0.7       | namespace |
//   | combat.*             | alert_warning    | with-text  | 0.5       | namespace |
//   | gate.*               | ui_error         | with-text  | 0.5       | namespace |
//   | (anything else)      | ui_notification  | with-text  | 0.4       | fallback  |
//
// HONEST CEILING: the core pack is a small procedural-chime vocabulary, so
// this is a SEMANTIC APPROXIMATION — every ability maps to the same generic
// accent, and unlisted scene.* cues still share the attention chime. Authored
// climactic stingers (reveals / arena-roar / conviction / seizure) and
// gate.refused have distinct exact ids so a host mapping effectId→icon does
// not draw the same glyph for a refused door and a toast. A shipping game
// loads a richer pack and overrides entries via `extendCueMap` (per-cue
// overrides) rather than editing this table.

import { CORE_SOUND_PACK } from './core-pack.js';

/**
 * When an sfx fires relative to the narration text. Structural mirror of
 * `SfxTiming` in @ai-rpg-engine/presentation — duplicated (three literals)
 * rather than imported so soundpack-core keeps zero dependencies. A drift
 * would be caught at the terminal-ui composition site by the type checker.
 */
export type SfxCueTiming = 'immediate' | 'with-text' | 'after-text';

/** Which tier of the map resolved a cue. */
export type CueMatchTier = 'exact' | 'namespace' | 'fallback';

/**
 * A gameplay cue resolved into the canonical soundpack vocabulary.
 * `{ effectId, timing, intensity }` is structurally assignable to
 * presentation's `SfxCue`, so a resolved cue can be placed directly into a
 * NarrationPlan's `sfx` array.
 */
export type ResolvedSfxCue = {
  /** Canonical soundpack entry id (a CORE_SOUND_PACK id by default). */
  effectId: string;
  timing: SfxCueTiming;
  /** 0..1 — matches SfxCue.intensity bounds enforced by validateNarrationPlan. */
  intensity: number;
  /** Which map tier matched — `fallback` means "unknown cue, degraded". */
  via: CueMatchTier;
};

type CueTarget = Omit<ResolvedSfxCue, 'via'>;

/** Null-prototype map so inherited Object.prototype keys cannot masquerade as cues (F-d7c3c40a). */
function freezeNullProto<T extends Record<string, CueTarget>>(entries: T): T {
  return Object.freeze(Object.assign(Object.create(null), entries)) as T;
}

const REVEAL_STINGER: CueTarget = Object.freeze({ effectId: 'ui_attention', timing: 'immediate', intensity: 0.7 });

/** Exact-match tier: the cues modules and starters emit by literal id. */
export const EXACT_CUE_MAP: Readonly<Record<string, CueTarget>> = freezeNullProto({
  'combat.hit': { effectId: 'alert_warning', timing: 'with-text', intensity: 0.6 },
  'combat.defeat': { effectId: 'alert_critical', timing: 'with-text', intensity: 0.9 },
  'combat.victory': { effectId: 'ui_success', timing: 'after-text', intensity: 0.8 },
  'gate.refused': { effectId: 'ui_error', timing: 'with-text', intensity: 0.6 },
  'scene.enter': { effectId: 'ui_whoosh', timing: 'immediate', intensity: 0.3 },
  'scene.crypt-reveal': REVEAL_STINGER,
  'scene.vault-reveal': REVEAL_STINGER,
  'scene.crime-scene-reveal': REVEAL_STINGER,
  'scene.sunken-shrine-reveal': REVEAL_STINGER,
  'scene.hospital-reveal': REVEAL_STINGER,
  'scene.spirit-hollow-reveal': REVEAL_STINGER,
  'scene.alien-cavern-reveal': REVEAL_STINGER,
  'scene.hidden-passage-reveal': REVEAL_STINGER,
  'scene.cellar-descent': REVEAL_STINGER,
  'scene.arena-roar': { effectId: 'alert_info', timing: 'immediate', intensity: 0.9 },
  'scene.conviction': { effectId: 'ui_success', timing: 'with-text', intensity: 0.8 },
  'scene.seizure': { effectId: 'alert_warning', timing: 'with-text', intensity: 0.7 },
});

/**
 * Namespace tier: matched on the segment before the first `.` when no exact
 * entry exists. Covers open-ended families — every `ability.<id>` cue a
 * content pack invents, every unlisted `scene.<moment>` stinger a starter
 * emits, and any future `gate.*` refusal besides `gate.refused`.
 */
export const NAMESPACE_CUE_MAP: Readonly<Record<string, CueTarget>> = freezeNullProto({
  ability: { effectId: 'ui_pop', timing: 'with-text', intensity: 0.5 },
  scene: { effectId: 'ui_attention', timing: 'immediate', intensity: 0.7 },
  combat: { effectId: 'alert_warning', timing: 'with-text', intensity: 0.5 },
  gate: { effectId: 'ui_error', timing: 'with-text', intensity: 0.5 },
});

/** Final tier: any cue from an unknown namespace degrades to a neutral chime. */
export const FALLBACK_CUE: Readonly<CueTarget> = Object.freeze({
  effectId: 'ui_notification',
  timing: 'with-text',
  intensity: 0.4,
});

type BedTarget = { layerId: string };

/**
 * Optional ambient-bed hints for scene.* gameplay cues (F-57203b5e).
 * Independent of {@link EXACT_CUE_MAP} / {@link NAMESPACE_CUE_MAP} so existing
 * SFX exact/namespace rows (e.g. scene.enter → ui_whoosh) stay unchanged.
 */
export const SCENE_BED_MAP: Readonly<Record<string, BedTarget>> = Object.freeze(
  Object.assign(Object.create(null), {
    'scene.enter': { layerId: 'ambient_white_noise' },
    'scene.crypt-reveal': { layerId: 'ambient_drone' },
    'scene.vault-reveal': { layerId: 'ambient_drone' },
    'scene.crime-scene-reveal': { layerId: 'ambient_drone' },
    'scene.sunken-shrine-reveal': { layerId: 'ambient_drone' },
    'scene.hospital-reveal': { layerId: 'ambient_drone' },
    'scene.spirit-hollow-reveal': { layerId: 'ambient_drone' },
    'scene.alien-cavern-reveal': { layerId: 'ambient_drone' },
    'scene.hidden-passage-reveal': { layerId: 'ambient_drone' },
    'scene.cellar-descent': { layerId: 'ambient_drone' },
    'scene.arena-roar': { layerId: 'ambient_drone' },
    'scene.conviction': { layerId: 'ambient_white_noise' },
    'scene.seizure': { layerId: 'ambient_drone' },
  }),
);

export const NAMESPACE_BED_MAP: Readonly<Record<string, BedTarget>> = Object.freeze(
  Object.assign(Object.create(null), {
    scene: { layerId: 'ambient_white_noise' },
  }),
);

/**
 * Optional ambient bed for a gameplay cue. Undefined when the cue has no bed
 * hint (combat.* / ability.* / unknown namespaces) — hosts then keep the
 * current mix. Does not emit an SFX cue.
 */
export function resolveAmbientBed(cue: string): { layerId: string; via: CueMatchTier } | undefined {
  if (Object.hasOwn(SCENE_BED_MAP, cue)) {
    return { layerId: SCENE_BED_MAP[cue].layerId, via: 'exact' };
  }
  const dot = cue.indexOf('.');
  if (dot > 0) {
    const nsKey = cue.slice(0, dot);
    if (Object.hasOwn(NAMESPACE_BED_MAP, nsKey)) {
      return { layerId: NAMESPACE_BED_MAP[nsKey].layerId, via: 'namespace' };
    }
  }
  return undefined;
}

export function sceneBedTargetIds(): string[] {
  const ids = new Set<string>();
  for (const target of Object.values(SCENE_BED_MAP)) ids.add(target.layerId);
  for (const target of Object.values(NAMESPACE_BED_MAP)) ids.add(target.layerId);
  return [...ids].sort();
}

type MusicTarget = { trackId: string };

/**
 * Optional music-stem hints for scene.* gameplay cues (F-768980bb).
 * Independent of SFX exact/namespace rows and of {@link SCENE_BED_MAP} so
 * hosts can pick a stem without changing ambient beds or one-shot cues.
 */
export const SCENE_MUSIC_MAP: Readonly<Record<string, MusicTarget>> = Object.freeze(
  Object.assign(Object.create(null), {
    'scene.enter': { trackId: 'music_calm' },
    'scene.crypt-reveal': { trackId: 'music_dread' },
    'scene.vault-reveal': { trackId: 'music_dread' },
    'scene.crime-scene-reveal': { trackId: 'music_dread' },
    'scene.sunken-shrine-reveal': { trackId: 'music_dread' },
    'scene.hospital-reveal': { trackId: 'music_dread' },
    'scene.spirit-hollow-reveal': { trackId: 'music_dread' },
    'scene.alien-cavern-reveal': { trackId: 'music_dread' },
    'scene.hidden-passage-reveal': { trackId: 'music_dread' },
    'scene.cellar-descent': { trackId: 'music_dread' },
    'scene.arena-roar': { trackId: 'music_triumph' },
    'scene.conviction': { trackId: 'music_triumph' },
    'scene.seizure': { trackId: 'music_dread' },
  }),
);

export const NAMESPACE_MUSIC_MAP: Readonly<Record<string, MusicTarget>> = Object.freeze(
  Object.assign(Object.create(null), {
    scene: { trackId: 'music_calm' },
  }),
);

/**
 * Optional music stem for a gameplay cue. Undefined when the cue has no music
 * hint (combat.* / ability.* / unknown namespaces). Does not emit an SFX cue
 * and does not change ambient beds.
 */
export function resolveMusicStem(cue: string): { trackId: string; via: CueMatchTier } | undefined {
  if (Object.hasOwn(SCENE_MUSIC_MAP, cue)) {
    return { trackId: SCENE_MUSIC_MAP[cue].trackId, via: 'exact' };
  }
  const dot = cue.indexOf('.');
  if (dot > 0) {
    const nsKey = cue.slice(0, dot);
    if (Object.hasOwn(NAMESPACE_MUSIC_MAP, nsKey)) {
      return { trackId: NAMESPACE_MUSIC_MAP[nsKey].trackId, via: 'namespace' };
    }
  }
  return undefined;
}

export function sceneMusicTargetIds(): string[] {
  const ids = new Set<string>();
  for (const target of Object.values(SCENE_MUSIC_MAP)) ids.add(target.trackId);
  for (const target of Object.values(NAMESPACE_MUSIC_MAP)) ids.add(target.trackId);
  return [...ids].sort();
}

type StingTarget = { trackId: string };

/**
 * Optional music-sting hints for combat.* gameplay cues (F-fa44e956).
 * Independent of {@link SCENE_MUSIC_MAP} / {@link resolveMusicStem}: a sting
 * is a one-shot overlay layered over whatever stem is already playing (play
 * it via `AudioDirector.scheduleSting`), never a stem replacement — so it
 * gets its own resolver rather than folding into resolveMusicStem's
 * loop-only vocabulary. Exact tier only; no namespace fallback (there is no
 * generic "combat.*" sting to fall back to).
 */
export const COMBAT_STING_MAP: Readonly<Record<string, StingTarget>> = Object.freeze(
  Object.assign(Object.create(null), {
    'combat.victory': { trackId: 'music_victory_sting' },
    'combat.defeat': { trackId: 'music_defeat_sting' },
  }),
);

/**
 * Optional music sting for a gameplay cue. Undefined when the cue has no
 * sting hint (everything except combat.victory/combat.defeat today). Does
 * not emit an SFX cue and does not change ambient beds or the active stem —
 * unlike {@link resolveMusicStem}, a resolved sting is never meant to
 * replace what schedule() already has playing.
 */
export function resolveMusicSting(cue: string): { trackId: string; via: CueMatchTier } | undefined {
  if (Object.hasOwn(COMBAT_STING_MAP, cue)) {
    return { trackId: COMBAT_STING_MAP[cue].trackId, via: 'exact' };
  }
  return undefined;
}

export function combatStingTargetIds(): string[] {
  return [...new Set(Object.values(COMBAT_STING_MAP).map((t) => t.trackId))].sort();
}

/**
 * The exact-tier cue ids, for docs and totality tests. Namespace families are
 * open-ended by design and therefore not enumerable here.
 */
export const KNOWN_EVENT_SOUND_CUES: readonly string[] = Object.freeze(
  Object.keys(EXACT_CUE_MAP),
);

/**
 * Resolve a gameplay cue to its canonical soundpack target.
 *
 * Total: every string input resolves (exact → namespace → fallback), so a
 * cue can never crash or silently vanish from the audio path. Pure and
 * deterministic: same input, same output, no state.
 *
 * @param cue A gameplay cue id (e.g. `combat.hit`, `ability.holy-smite`).
 */
export function resolveSoundCue(cue: string): ResolvedSfxCue {
  if (Object.hasOwn(EXACT_CUE_MAP, cue)) {
    return { ...EXACT_CUE_MAP[cue], via: 'exact' };
  }

  const dot = cue.indexOf('.');
  if (dot > 0) {
    const nsKey = cue.slice(0, dot);
    if (Object.hasOwn(NAMESPACE_CUE_MAP, nsKey)) {
      return { ...NAMESPACE_CUE_MAP[nsKey], via: 'namespace' };
    }
  }

  return { ...FALLBACK_CUE, via: 'fallback' };
}

/**
 * Build a resolver with per-cue overrides layered over the built-in map —
 * how a game with a richer soundpack redirects cues to its own entry ids
 * without editing the canonical table. Overrides win on exact cue id only
 * (they are reported as `via: 'exact'`); unmatched cues fall through to
 * {@link resolveSoundCue}.
 *
 * @param overrides Exact cue id → replacement target.
 */
export function extendCueMap(
  overrides: Record<string, CueTarget>,
): (cue: string) => ResolvedSfxCue {
  return (cue: string): ResolvedSfxCue => {
    if (Object.hasOwn(overrides, cue)) {
      return { ...overrides[cue], via: 'exact' };
    }
    return resolveSoundCue(cue);
  };
}

/**
 * Every soundpack id the built-in map can emit. Exposed so tests (and pack
 * authors swapping in their own manifest) can assert the map only points at
 * entries that exist — the property that makes the vocabulary actually
 * unified rather than a third disjoint space.
 */
export function cueMapTargetIds(): string[] {
  const ids = new Set<string>();
  for (const target of Object.values(EXACT_CUE_MAP)) ids.add(target.effectId);
  for (const target of Object.values(NAMESPACE_CUE_MAP)) ids.add(target.effectId);
  ids.add(FALLBACK_CUE.effectId);
  return [...ids].sort();
}

/** True when every id the cue map can emit exists in the given entry-id set. */
export function cueMapIsCoveredBy(entryIds: readonly string[]): boolean {
  const have = new Set(entryIds);
  return cueMapTargetIds().every((id) => have.has(id));
}

/** Coverage report of cue-map targets (plus optional extendCueMap effectIds) vs a pack. */
export type CueMapCoverage = {
  covered: string[];
  missing: string[];
  extra: string[];
};

/**
 * Which cue-map targets a pack implements. `extraTargets` are additional
 * required ids (typically `extendCueMap` override `effectId`s) so an author
 * can see that `holy_smite_01` is referenced but absent from entries.
 */
export function cueMapCoverage(
  entryIds: readonly string[],
  extraTargets: readonly string[] = [],
): CueMapCoverage {
  const have = new Set(entryIds);
  const required = new Set([...cueMapTargetIds(), ...extraTargets]);
  const covered: string[] = [];
  const missing: string[] = [];
  for (const id of required) {
    if (have.has(id)) covered.push(id);
    else missing.push(id);
  }
  const extra: string[] = [];
  for (const id of have) {
    if (!required.has(id)) extra.push(id);
  }
  covered.sort();
  missing.sort();
  extra.sort();
  return { covered, missing, extra };
}

/**
 * Bridge from a district's computed mood `tone` (DistrictMood's 6-value
 * enum in `@ai-rpg-engine/modules`' district-mood.ts: `calm | tense |
 * volatile | oppressive | grim | prosperous`) to the sound-mood vocabulary
 * CORE_SOUND_PACK entries already carry via `SoundEntry.mood` (F-f8412999).
 * Keyed with a null prototype like every other table in this file, so an
 * inherited `Object.prototype` key (`toString`, `constructor`, …) can never
 * masquerade as a matched tone (same defensive shape as F-d7c3c40a).
 *
 * Not exported: `districtToneToSoundMood` and {@link districtToneMoodValues}
 * are the public surface; the table itself stays module-private.
 */
const DISTRICT_TONE_MOOD_MAP: Readonly<Record<string, readonly string[]>> = Object.freeze(
  Object.assign(Object.create(null), {
    calm: Object.freeze(['calm']),
    tense: Object.freeze(['tension']),
    volatile: Object.freeze(['tension']),
    oppressive: Object.freeze(['dread']),
    grim: Object.freeze(['dread', 'negative']),
    prosperous: Object.freeze(['positive']),
  }),
);

/**
 * Translate a district's computed `tone` into the sound-mood vocabulary for
 * `SoundQuery.mood` — pass the result to `SoundRegistry.pickMusicStem` /
 * `pickAmbientBed` (F-f8412999). Returns `undefined` for an unrecognized
 * tone: an explicit non-match, not a guess, so a caller knows to fall
 * through to today's fixed `resolveMusicStem('scene.enter')` /
 * `resolveAmbientBed('scene.enter')` result rather than querying with an
 * empty or wrong mood array. Returns a fresh copy each call — like
 * {@link resolveSoundCue}, mutating a result cannot poison the bridge table.
 *
 * `tone: string`, not a `DistrictMood['tone']` import from
 * @ai-rpg-engine/modules — soundpack-core stays dependency-free, the same
 * posture @ai-rpg-engine/presentation's builder.ts documents for itself. A
 * drift between the two vocabularies surfaces as a type error at the
 * composition site instead.
 *
 * Composing this with a registry query and an actual fallback is the
 * composition layer's job (not soundpack-core) — this pure helper only
 * answers "what mood does this tone mean", nothing about what to do when it
 * doesn't match.
 */
export function districtToneToSoundMood(tone: string): string[] | undefined {
  if (Object.hasOwn(DISTRICT_TONE_MOOD_MAP, tone)) {
    return [...DISTRICT_TONE_MOOD_MAP[tone]];
  }
  return undefined;
}

/**
 * Every sound-mood string {@link districtToneToSoundMood} can emit, deduped
 * and sorted — for the boot-time coverage invariant below and for coverage
 * tests. Mirrors {@link sceneBedTargetIds} / {@link sceneMusicTargetIds} /
 * {@link combatStingTargetIds}'s "everything this table can point at" shape,
 * except these values are `SoundEntry.mood` strings, not soundpack entry ids.
 */
export function districtToneMoodValues(): string[] {
  const moods = new Set<string>();
  for (const arr of Object.values(DISTRICT_TONE_MOOD_MAP)) {
    for (const m of arr) moods.add(m);
  }
  return [...moods].sort();
}

// Startup invariant, not just a test: the built-in map must only point at
// entries CORE_SOUND_PACK defines. A typo'd target id here would otherwise
// ship a cue that resolves to an unplayable sound.
/* v8 ignore start -- unreachable unless the table above is edited to a bad id */
if (!cueMapIsCoveredBy(CORE_SOUND_PACK.entries.map((e) => e.id))) {
  throw new Error(
    '[soundpack-core] cue-map points at a sound id missing from CORE_SOUND_PACK. ' +
      'Fix the mapping table in cue-map.ts (see cueMapTargetIds()).',
  );
}
const coreIds = new Set(CORE_SOUND_PACK.entries.map((e) => e.id));
if (!sceneBedTargetIds().every((id) => coreIds.has(id))) {
  throw new Error(
    '[soundpack-core] scene bed map points at a sound id missing from CORE_SOUND_PACK. ' +
      'Fix SCENE_BED_MAP / NAMESPACE_BED_MAP in cue-map.ts.',
  );
}
if (!sceneMusicTargetIds().every((id) => coreIds.has(id))) {
  throw new Error(
    '[soundpack-core] scene music map points at a sound id missing from CORE_SOUND_PACK. ' +
      'Fix SCENE_MUSIC_MAP / NAMESPACE_MUSIC_MAP in cue-map.ts.',
  );
}
if (!combatStingTargetIds().every((id) => coreIds.has(id))) {
  throw new Error(
    '[soundpack-core] combat sting map points at a sound id missing from CORE_SOUND_PACK. ' +
      'Fix COMBAT_STING_MAP in cue-map.ts.',
  );
}
// F-f8412999: every mood string the district-tone bridge can emit must
// exist on at least one CORE_SOUND_PACK entry's mood array — catches a
// typo'd bridge value (e.g. 'postive') the same way the checks above catch
// a typo'd target id. Checked against the WHOLE pack (any domain), not
// per-channel (music-only vs. ambient-only): a per-channel version would
// throw TODAY on 'positive', which appears on music entries (music_triumph,
// ui_success) but on no ambient entry — a known content-authoring gap (no
// ambient bed is tagged positive/triumph yet; see F-f8412999's
// evidence_base and cue-map.test.ts's "documents the known gap" test), not
// a mapping typo. Scoping the gate to "the pack defines this mood
// somewhere" keeps it honest — an incomplete pack is a content gap, not a
// bug — while still firing on what it exists to catch: a bridge value that
// matches NO entry anywhere (a real typo) still throws.
const allMoods = new Set(CORE_SOUND_PACK.entries.flatMap((e) => e.mood));
if (!districtToneMoodValues().every((m) => allMoods.has(m))) {
  throw new Error(
    '[soundpack-core] district-tone sound-mood bridge emits a mood string ' +
      'absent from every CORE_SOUND_PACK entry. Fix DISTRICT_TONE_MOOD_MAP in cue-map.ts.',
  );
}
/* v8 ignore stop */
