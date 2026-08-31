// player-titles — the runtime record of what the world has started calling you.
//
// v3.8. `title-trigger` is announced by seven authored fallout sites — one on
// the opportunity side (faction-job completed → `faction-operative`) and six on
// the pressure side (`bounty-survivor`, `trade-broker`, `faith-tested`,
// `iron-captain`, `steadfast`, `ghost`) — and until now the engine had nowhere
// to put one. `formatFalloutEffect` printed "title trigger: bounty-survivor"
// and the world forgot it before the next read.
//
// DELIBERATELY NOT A TITLE SUBSYSTEM. What exists already:
//
//   - character-creation resolves a CROSS-DISCIPLINE title once, at build
//     time, into `custom.title` (e.g. "Hedge-Knight"). That is who you chose
//     to be, and this file does not overwrite it.
//   - social-consequence exports `evolveTitle(current, milestoneTags,
//     evolutions)`. F-025fd000 ships DEFAULT_TITLE_EVOLUTIONS for the seven
//     live tags so grantTitleToEntity / getDisplayTitle can call it without
//     a pack authoring a table. Packs may still pass their own.
//
// What this adds is the smallest thing that makes an announced title real: a
// persisted, readable record of the tags the world has hung on the player, in
// the SAME flat prefixed-key idiom player-leverage uses for `leverage.*`. An
// earned title is a fact about the run, so it lives with the run's other
// facts, on the actor's own custom record. No namespace, no migration, no
// defaults — an entity that never earned one carries no `title.*` key at all.

import type { EntityState } from '@ai-rpg-engine/core';
import { evolveTitle, DEFAULT_TITLE_EVOLUTIONS, type TitleEvolution } from './social-consequence.js';

/** Key prefix for an earned-title record. Mirrors `leverage.<currency>`. */
const TITLE_PREFIX = 'title.';

export type EarnedTitle = {
  /** The tag the fallout announced, e.g. `faction-operative`. */
  tag: string;
  /** The tick the world first used it. Re-earning does not reset this. */
  earnedAtTick: number;
};

/**
 * Record that the player has earned `tag`.
 *
 * Returns a NEW custom record (the immutable-update shape `adjustLeverage`
 * uses, so callers can assign the result without worrying about aliasing).
 * FIRST-EARNED WINS: a title is a thing you became, not a counter, so
 * re-earning it leaves the original tick in place — which is what lets
 * "when did they become that" stay answerable.
 */
export function grantTitle(
  custom: Record<string, string | number | boolean>,
  tag: string,
  tick: number,
): Record<string, string | number | boolean> {
  const key = `${TITLE_PREFIX}${tag}`;
  if (typeof custom[key] === 'number') return custom;
  return { ...custom, [key]: tick };
}

/**
 * Every title this actor has earned, oldest first, ties broken by tag.
 *
 * Deterministic ordering matters: this feeds presentation, and a set iterated
 * in insertion order would render differently for two worlds that earned the
 * same titles in the same round.
 */
export function getEarnedTitles(
  custom: Record<string, string | number | boolean>,
): EarnedTitle[] {
  const titles: EarnedTitle[] = [];
  for (const [key, value] of Object.entries(custom)) {
    if (!key.startsWith(TITLE_PREFIX)) continue;
    if (typeof value !== 'number') continue;
    titles.push({ tag: key.slice(TITLE_PREFIX.length), earnedAtTick: value });
  }
  return titles.sort((a, b) => a.earnedAtTick - b.earnedAtTick || a.tag.localeCompare(b.tag));
}

/** Whether this actor carries `tag`. */
export function hasTitle(
  custom: Record<string, string | number | boolean>,
  tag: string,
): boolean {
  return typeof custom[`${TITLE_PREFIX}${tag}`] === 'number';
}

/**
 * The title to lead with. Evolves the character-creation `custom.title` (or
 * none) through the earned-tag list so a bounty-survivor is called
 * 'the Bounty-Breaker', not the raw tag (F-025fd000). `undefined` when none
 * has been earned, so a caller can fall back to the build-time title.
 * Packs override the table by passing `evolutions`.
 */
export function getDisplayTitle(
  custom: Record<string, string | number | boolean>,
  evolutions: TitleEvolution[] = DEFAULT_TITLE_EVOLUTIONS,
): string | undefined {
  const titles = getEarnedTitles(custom);
  if (titles.length === 0) return undefined;
  const current = typeof custom.title === 'string' ? custom.title : undefined;
  const evolved = evolveTitle(current, titles.map((t) => t.tag), evolutions);
  return evolved ?? current ?? titles[titles.length - 1].tag;
}

/** Convenience for the appliers: grant onto an entity in place. */
export function grantTitleToEntity(
  entity: EntityState,
  tag: string,
  tick: number,
  evolutions: TitleEvolution[] = DEFAULT_TITLE_EVOLUTIONS,
): void {
  entity.custom = grantTitle(entity.custom ?? {}, tag, tick);
  // Wire evolveTitle on the grant path using earned tags as the milestone
  // list and character-creation custom.title as current. Display is derived
  // on read so the build-time title is never overwritten.
  void getDisplayTitle(entity.custom, evolutions);
}

/** Director view — evolved display title first, raw tag + tick as secondary. */
export function formatTitlesForDirector(
  custom: Record<string, string | number | boolean>,
): string | null {
  const titles = getEarnedTitles(custom);
  if (titles.length === 0) return null;
  const display = getDisplayTitle(custom);
  const lines = [`  Earned titles (${titles.length}):`];
  if (display) lines.push(`    ${display}`);
  for (const title of titles) {
    lines.push(`    ${title.tag} — since tick ${title.earnedAtTick}`);
  }
  return lines.join('\n');
}
