// intent-profiles.test.ts — F1-cs-a: hostile entities resolve to real intent profiles.
//
// The shipped game's enemies never acted in part because this pack passed a
// cognition config with NO profiles — an empty profileMap — so no entity's
// ai.profileId resolved to any behavior. These tests pin the wiring:
//   1. the pack provides a non-empty, built-in-only intent profile list,
//   2. every hostile entity's declared ai.profileId resolves to a provided
//      profile (the profileMap is not empty for this pack),
//   3. each resolved profile produces intent options for its entity when a
//      believed-hostile intruder stands in its zone — i.e. enemies CAN act.

import { describe, it, expect } from 'vitest';
import { selectIntent } from '@ai-rpg-engine/modules';
import type { CognitionState } from '@ai-rpg-engine/modules';
import type { EntityState, WorldState } from '@ai-rpg-engine/core';
import { createGame, detectiveIntentProfiles } from './setup.js';

/** The built-in intent profile ids shipped by @ai-rpg-engine/modules. */
const BUILTIN_PROFILE_IDS = ['aggressive', 'cautious', 'territorial', 'calculating'];

function hostilesOf(world: WorldState): EntityState[] {
  return Object.values(world.entities).filter(
    (e) => e.type === 'enemy' || e.tags.includes('enemy'),
  );
}

/** A combat-adjacent cognition snapshot: confident hostile belief, healthy morale. */
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

describe('starter-detective — intent profile wiring (F1-cs-a)', () => {
  it('provides a non-empty list of built-in intent profiles to cognition', () => {
    expect(detectiveIntentProfiles.length).toBeGreaterThan(0);
    for (const profile of detectiveIntentProfiles) {
      expect(BUILTIN_PROFILE_IDS).toContain(profile.id);
      expect(typeof profile.evaluate).toBe('function');
    }
  });

  it('every hostile entity declares a profileId that resolves to a provided profile', () => {
    const engine = createGame(7);
    const hostiles = hostilesOf(engine.world);
    expect(hostiles.length).toBeGreaterThan(0);

    const provided = new Set(detectiveIntentProfiles.map((p) => p.id));
    for (const hostile of hostiles) {
      expect(hostile.ai?.profileId, `${hostile.id} must declare ai.profileId`).toBeTruthy();
      expect(
        provided.has(hostile.ai!.profileId),
        `${hostile.id} declares "${hostile.ai!.profileId}" — not provided to the cognition config`,
      ).toBe(true);
    }
  });

  it('resolved profiles produce intents — hostiles can act on an intruder', () => {
    const engine = createGame(7);
    const world = engine.world;
    const playerId = world.playerId || 'player';
    const player = world.entities[playerId];
    expect(player).toBeDefined();

    for (const hostile of hostilesOf(world)) {
      const profile = detectiveIntentProfiles.find((p) => p.id === hostile.ai?.profileId);
      expect(profile, `${hostile.id} must resolve an intent profile`).toBeDefined();

      // Stand the player in the hostile's zone as a believed-hostile intruder.
      player!.zoneId = hostile.zoneId;
      const cognition = combatCognition(world, playerId);

      // Contract: a believed-hostile intruder standing in the entity's own
      // zone at healthy morale must draw SOME response from every profile.
      const options = profile!.evaluate(hostile, cognition, world);
      expect(Array.isArray(options)).toBe(true);
      expect(
        options.length,
        `${hostile.id} (${profile!.id}) produced no intent options`,
      ).toBeGreaterThan(0);

      const intent = selectIntent(hostile, cognition, world, profile!);
      expect(intent, `${hostile.id} (${profile!.id}) selected no intent`).not.toBeNull();
    }
  });
});
