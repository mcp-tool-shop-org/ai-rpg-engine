// Gameplay-cue → soundpack-id adapter — the single vocabulary bridge.
//
// Before this map, THREE cue vocabularies coexisted with zero shared members:
//
//   1. Module event cues — what gameplay modules attach to events:
//      `event.presentation.soundCues` (`combat.hit` / `combat.defeat` from
//      combat-core and status-effects, `scene.enter` from traversal-core,
//      `ability.<id>` forwarded from `ability.ui.soundCue` by ability-core)
//      plus the starters' `audio.cue.requested` stingers
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
//   | gameplay cue    | soundpack id     | timing     | intensity | tier      |
//   |-----------------|------------------|------------|-----------|-----------|
//   | combat.hit      | alert_warning    | with-text  | 0.6       | exact     |
//   | combat.defeat   | alert_critical   | with-text  | 0.9       | exact     |
//   | combat.victory  | ui_success       | after-text | 0.8       | exact     |
//   | scene.enter     | ui_whoosh        | immediate  | 0.3       | exact     |
//   | ability.*       | ui_pop           | with-text  | 0.5       | namespace |
//   | scene.*         | ui_attention     | immediate  | 0.7       | namespace |
//   | combat.*        | alert_warning    | with-text  | 0.5       | namespace |
//   | (anything else) | ui_notification  | with-text  | 0.4       | fallback  |
//
// HONEST CEILING: the core pack is a small procedural-chime vocabulary, so
// this is a SEMANTIC APPROXIMATION — every ability maps to the same generic
// accent, every scene stinger to the same attention chime. A shipping game
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

/** Exact-match tier: the cues modules and starters emit by literal id. */
export const EXACT_CUE_MAP: Readonly<Record<string, CueTarget>> = Object.freeze({
  'combat.hit': { effectId: 'alert_warning', timing: 'with-text', intensity: 0.6 },
  'combat.defeat': { effectId: 'alert_critical', timing: 'with-text', intensity: 0.9 },
  'combat.victory': { effectId: 'ui_success', timing: 'after-text', intensity: 0.8 },
  'scene.enter': { effectId: 'ui_whoosh', timing: 'immediate', intensity: 0.3 },
});

/**
 * Namespace tier: matched on the segment before the first `.` when no exact
 * entry exists. Covers open-ended families — every `ability.<id>` cue a
 * content pack invents, every `scene.<moment>` stinger a starter emits.
 */
export const NAMESPACE_CUE_MAP: Readonly<Record<string, CueTarget>> = Object.freeze({
  ability: { effectId: 'ui_pop', timing: 'with-text', intensity: 0.5 },
  scene: { effectId: 'ui_attention', timing: 'immediate', intensity: 0.7 },
  combat: { effectId: 'alert_warning', timing: 'with-text', intensity: 0.5 },
});

/** Final tier: any cue from an unknown namespace degrades to a neutral chime. */
export const FALLBACK_CUE: Readonly<CueTarget> = Object.freeze({
  effectId: 'ui_notification',
  timing: 'with-text',
  intensity: 0.4,
});

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
  const exact = EXACT_CUE_MAP[cue];
  if (exact) return { ...exact, via: 'exact' };

  const dot = cue.indexOf('.');
  if (dot > 0) {
    const ns = NAMESPACE_CUE_MAP[cue.slice(0, dot)];
    if (ns) return { ...ns, via: 'namespace' };
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
    const hit = overrides[cue];
    if (hit) return { ...hit, via: 'exact' };
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
/* v8 ignore stop */
