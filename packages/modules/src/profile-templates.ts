/**
 * Profile Templates — the 10 shipped starters as ready-to-use `Profile` bundles.
 *
 * Each of the 10 starter worlds wires combat with a `buildCombatStack({...})`
 * config whose `{ statMapping, biasTags }` IS a playstyle in disguise. This module
 * extracts those into named `Profile` constants an author can import, spread, and
 * tweak — a real starting point instead of a blank stat mapping. They also double
 * as test fixtures for the loader and validator.
 *
 * WHAT A TEMPLATE CAPTURES (and why): the game-agnostic *combat identity* —
 *   - `statMapping`: which of the archetype's stats drive attack / precision /
 *     resolve (verbatim from the starter), and
 *   - `packBiases`: the AI personality, resolved from the starter's `biasTags`
 *     against BUILTIN_PACK_BIASES (exactly what buildCombatStack does).
 *
 * WHAT IT DOES NOT (by design): `abilities` is left EMPTY and `resourceProfile`
 * is omitted. Those are game-specific content — a starter's ability pack and its
 * resource economy reference ids (`crowd-favor`, `chrome-heat`, `mana`, …) that
 * only exist inside that starter's ruleset and entities, and `@ai-rpg-engine/
 * modules` must not depend on the starter packages (that would be a dependency
 * cycle). Layer your own ability pack + resource profile on top; see the
 * `starter-*` packages for full, wired examples.
 *
 * Determinism: pure data. `biasesFor` filters BUILTIN_PACK_BIASES in its declared
 * order, so the resolved `packBiases` array is stable across runs.
 */

import type { Profile } from './profile.js';
import type { PackBias } from './combat-intent.js';
import { BUILTIN_PACK_BIASES } from './combat-intent.js';

/**
 * Resolve the built-in pack biases for the given tags, preserving
 * BUILTIN_PACK_BIASES' declared order (stable, byte-identical across runs).
 * Mirrors buildCombatStack's `biasTags` → `packBiases` resolution.
 */
function biasesFor(tags: string[]): PackBias[] {
  return BUILTIN_PACK_BIASES.filter((b) => tags.includes(b.tag));
}

/** Arena spectacle bruiser — might/agility/showmanship, feral + beast aggression. */
export const gladiatorProfile: Profile = {
  id: 'gladiator',
  name: 'Gladiator',
  statMapping: { attack: 'might', precision: 'agility', resolve: 'showmanship' },
  abilities: [],
  packBiases: biasesFor(['feral', 'beast']),
};

/** Hardboiled investigator — grit/perception/eloquence, criminal-coward AI. */
export const detectiveProfile: Profile = {
  id: 'detective',
  name: 'Detective',
  statMapping: { attack: 'grit', precision: 'perception', resolve: 'eloquence' },
  abilities: [],
  packBiases: biasesFor(['criminal']),
};

/** Frontier colony operator — engineering/awareness/command, drone + alien AI. */
export const colonyProfile: Profile = {
  id: 'colony',
  name: 'Colony',
  statMapping: { attack: 'engineering', precision: 'awareness', resolve: 'command' },
  abilities: [],
  packBiases: biasesFor(['drone', 'alien']),
};

/** Chrome-and-code runner — chrome/reflex/netrunning, ice-agent protocol AI. */
export const cyberpunkProfile: Profile = {
  id: 'cyberpunk',
  name: 'Cyberpunk',
  statMapping: { attack: 'chrome', precision: 'reflex', resolve: 'netrunning' },
  abilities: [],
  packBiases: biasesFor(['ice-agent']),
};

/** Cutlass swashbuckler — brawn/cunning/sea-legs, pirate-swarm + colonial + beast. */
export const pirateProfile: Profile = {
  id: 'pirate',
  name: 'Pirate',
  statMapping: { attack: 'brawn', precision: 'cunning', resolve: 'sea-legs' },
  abilities: [],
  packBiases: biasesFor(['pirate', 'colonial', 'beast']),
};

/** Night predator — vitality/cunning/presence, vampire + feral + hunter AI. */
export const vampireProfile: Profile = {
  id: 'vampire',
  name: 'Vampire',
  statMapping: { attack: 'vitality', precision: 'cunning', resolve: 'presence' },
  abilities: [],
  packBiases: biasesFor(['vampire', 'feral', 'hunter']),
};

/** Masterless swordsman — discipline/perception/composure, assassin + samurai AI. */
export const roninProfile: Profile = {
  id: 'ronin',
  name: 'Ronin',
  statMapping: { attack: 'discipline', precision: 'perception', resolve: 'composure' },
  abilities: [],
  packBiases: biasesFor(['assassin', 'samurai']),
};

/** Occult gunslinger — grit/draw-speed/lore, undead + spirit + beast AI. */
export const weirdWestProfile: Profile = {
  id: 'weird-west',
  name: 'Weird West',
  statMapping: { attack: 'grit', precision: 'draw-speed', resolve: 'lore' },
  abilities: [],
  packBiases: biasesFor(['undead', 'spirit', 'beast']),
};

/** Outbreak survivor — fitness/wits/nerve, zombie-mindless + undead AI. */
export const zombieProfile: Profile = {
  id: 'zombie',
  name: 'Zombie',
  statMapping: { attack: 'fitness', precision: 'wits', resolve: 'nerve' },
  abilities: [],
  packBiases: biasesFor(['zombie', 'undead']),
};

/** Classic adventurer — vigor/instinct/will (the engine defaults), undead AI. */
export const fantasyProfile: Profile = {
  id: 'fantasy',
  name: 'Fantasy',
  statMapping: { attack: 'vigor', precision: 'instinct', resolve: 'will' },
  abilities: [],
  packBiases: biasesFor(['undead']),
};

/**
 * All 10 starter playstyle templates, keyed by profile id. A stable, complete set
 * — `validateProfileSet(starterProfileList)` reports no errors (unique ids, no
 * shared ability ids, no cross-role stat-name drift).
 */
export const starterProfiles: Record<string, Profile> = {
  gladiator: gladiatorProfile,
  detective: detectiveProfile,
  colony: colonyProfile,
  cyberpunk: cyberpunkProfile,
  pirate: pirateProfile,
  vampire: vampireProfile,
  ronin: roninProfile,
  'weird-west': weirdWestProfile,
  zombie: zombieProfile,
  fantasy: fantasyProfile,
};

/** The starter templates as an array (declaration order), for iteration + set validation. */
export const starterProfileList: Profile[] = [
  gladiatorProfile,
  detectiveProfile,
  colonyProfile,
  cyberpunkProfile,
  pirateProfile,
  vampireProfile,
  roninProfile,
  weirdWestProfile,
  zombieProfile,
  fantasyProfile,
];
