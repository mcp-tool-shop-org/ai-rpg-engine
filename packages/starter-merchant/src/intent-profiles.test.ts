// Enemies CAN act.
//
// The failure this guards against is silent: `buildCombatStack`'s cognition
// config takes a profile list, and a hostile whose declared `ai.profileId` has
// no matching profile never resolves an intent — so it simply never takes a
// turn. Nothing throws, no assertion about damage or HP necessarily fails, and
// the fight just quietly does nothing. content-truth.test.ts checks that every
// declared id is SUPPLIED; this file checks the supplied profiles actually
// produce intent options for the entities that declare them.

import { describe, it, expect } from 'vitest';
import { selectIntent } from '@ai-rpg-engine/modules';
import type { CognitionState } from '@ai-rpg-engine/modules';
import type { EntityState, WorldState } from '@ai-rpg-engine/core';
import { createGame, merchantIntentProfiles } from './setup.js';

/** The built-in intent profile ids shipped by @ai-rpg-engine/modules. */
const BUILTIN_PROFILE_IDS = ['aggressive', 'cautious', 'territorial', 'calculating'];

function hostilesOf(world: WorldState): EntityState[] {
  return Object.values(world.entities).filter((e) => e.type === 'enemy');
}

/**
 * A cognition state in which `aboutId` is believed hostile, at healthy morale.
 *
 * Shape matters and is easy to get wrong: a belief carries `key`, not
 * `predicate`, and the state carries `memories`/`currentIntent`/`morale`/
 * `suspicion` — not the `goals`/`fears`/`alertLevel` fields that live on
 * `EntityState.ai`. An invented shape here type-asserts fine and then makes
 * every profile see an entity that believes nothing.
 */
function combatCognition(world: WorldState, aboutId: string): CognitionState {
  return {
    beliefs: [{
      subject: aboutId,
      key: 'hostile',
      value: true,
      confidence: 1,
      source: 'observed',
      tick: world.meta.tick,
    }],
    memories: [],
    currentIntent: null,
    morale: 80,
    suspicion: 60,
  };
}

describe('merchant intent profiles', () => {
  it('provides a non-empty, built-in-only profile list', () => {
    expect(merchantIntentProfiles.length).toBeGreaterThan(0);
    for (const profile of merchantIntentProfiles) {
      expect(BUILTIN_PROFILE_IDS, `unexpected profile id '${profile.id}'`).toContain(profile.id);
      expect(typeof profile.evaluate).toBe('function');
    }
  });

  it('every hostile’s declared profile id is supplied', () => {
    const supplied = new Set(merchantIntentProfiles.map((p) => p.id));
    const world = createGame(71).world;
    const hostiles = hostilesOf(world);
    expect(hostiles.length).toBeGreaterThan(0);
    for (const hostile of hostiles) {
      const declared = hostile.ai?.profileId;
      expect(declared, `hostile '${hostile.id}' declares no profileId`).toBeTruthy();
      expect(supplied.has(String(declared)), `'${hostile.id}' -> unsupplied '${declared}'`).toBe(true);
    }
  });

  it('each hostile resolves at least one intent against an intruder it believes hostile', () => {
    // The load-bearing assertion: not "a profile exists" but "this entity, with
    // this profile, in this world, produces something to do."
    const engine = createGame(71);
    const world = engine.world;
    const player = world.entities[world.playerId];

    for (const hostile of hostilesOf(world)) {
      const profile = merchantIntentProfiles.find((p) => p.id === hostile.ai?.profileId);
      expect(profile, `'${hostile.id}' resolves no profile`).toBeDefined();

      // Stand the intruder in the hostile's own zone.
      player.zoneId = hostile.zoneId;
      const cognition = combatCognition(world, world.playerId);

      // Contract: a believed-hostile intruder in the entity's own zone at
      // healthy morale must draw SOME response from every profile.
      const options = profile!.evaluate(hostile, cognition, world);
      expect(Array.isArray(options)).toBe(true);
      expect(
        options.length,
        `'${hostile.id}' (${profile!.id}) produced no intent options`,
      ).toBeGreaterThan(0);

      // selectIntent takes (entity, cognition, world, profile) — the profile is
      // LAST, not first.
      const intent = selectIntent(hostile, cognition, world, profile!);
      expect(intent, `'${hostile.id}' (${profile!.id}) selected no intent`).not.toBeNull();
    }
  });

  it('the boss uses calculating — it does arithmetic, not violence', () => {
    const world = createGame(71).world;
    expect(world.entities['the-standing-account'].ai?.profileId).toBe('calculating');
  });
});
