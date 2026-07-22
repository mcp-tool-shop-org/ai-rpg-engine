// F-ENG005-encounter-spawn-wiring — end-to-end against the REAL shipped pack.
//
// The CLI round is: player action → NPC turns → runWorldTick → narrate the
// round's eventLog delta. This test drives that exact order (minus NPC turns,
// which are CLI-side) on the live Ashfall Dead content: force the district
// safety low (the accrued defeat-fallout global — chance caps at 0.95), walk
// into a tabled zone under a fixed seed, and pin that:
//   - the encounter spawns real entities INTO the entered zone
//   - the ONE renderable `encounter.spawned` event rides the same round delta
//     the narration layer presents, public, narrator channel, with the
//     authored trigger line as its description
//   - same seed ⇒ same spawn, byte for byte

import { describe, it, expect } from 'vitest';
import type { ResolvedEvent } from '@ai-rpg-engine/core';
import { runWorldTick } from '@ai-rpg-engine/modules';
import { createGame } from './setup.js';

type Spawned = { round: number; delta: ResolvedEvent[]; entityIds: string[] };

/**
 * Play CLI-shaped rounds bouncing safehouse-lobby ⇄ overrun-street (a tabled
 * hostile zone) until a spawn lands. Deterministic under the fixed seed; the
 * bound exists only so the pin survives constant retuning.
 */
function walkUntilSpawn(seed: number, maxRounds = 40): Spawned {
  const engine = createGame(seed);
  // The dead-zone district covers overrun-street; violence has soaked it.
  engine.store.state.globals['district_dead-zone_safety'] = -40;

  const targets = ['overrun-street', 'safehouse-lobby'];
  for (let round = 0; round < maxRounds; round++) {
    const logLenBefore = engine.store.state.eventLog.length;
    engine.submitAction('move', { targetIds: [targets[round % 2]] });
    const result = runWorldTick(engine, { genre: 'horror' });
    expect(result.ok).toBe(true);
    if (result.encounters.length > 0) {
      return {
        round,
        delta: engine.store.state.eventLog.slice(logLenBefore),
        entityIds: result.encounters[0].entityIds,
      };
    }
  }
  throw new Error(`no spawn within ${maxRounds} rounds at seed ${seed}`);
}

describe('zombie starter — live encounter spawn (F-ENG005-encounter-spawn-wiring)', () => {
  it('walking the overrun street under low safety spawns the authored street patrol into the zone', () => {
    const engine = createGame(42);
    engine.store.state.globals['district_dead-zone_safety'] = -40;

    let spawnedIds: string[] = [];
    let delta: ResolvedEvent[] = [];
    const targets = ['overrun-street', 'safehouse-lobby'];
    for (let round = 0; round < 40 && spawnedIds.length === 0; round++) {
      const logLenBefore = engine.store.state.eventLog.length;
      engine.submitAction('move', { targetIds: [targets[round % 2]] });
      const result = runWorldTick(engine, { genre: 'horror' });
      if (result.encounters.length > 0) {
        expect(result.encounters[0].encounterId).toBe('street-patrol');
        expect(result.encounters[0].zoneId).toBe('overrun-street');
        spawnedIds = result.encounters[0].entityIds;
        delta = engine.store.state.eventLog.slice(logLenBefore);
      }
    }
    expect(spawnedIds.length).toBeGreaterThan(0);

    // The entities are real and standing in the entered zone.
    for (const id of spawnedIds) {
      const entity = engine.store.state.entities[id];
      expect(entity).toBeDefined();
      expect(entity.zoneId).toBe('overrun-street');
      expect((entity.resources.hp ?? 0)).toBeGreaterThan(0);
      expect(entity.type).toBe('enemy');
    }
    expect(spawnedIds.map((id) => engine.store.state.entities[id].name).sort()).toEqual([
      'Runner',
      'Shambler',
    ]);
    // The authored originals are untouched — these are clones, not moves.
    expect(engine.store.state.entities['shambler_1']).toBeDefined();
    expect(engine.store.state.entities['runner_1']).toBeDefined();
    expect(spawnedIds).not.toContain('shambler_1');
    expect(spawnedIds).not.toContain('runner_1');

    // The ONE renderable event rides the round delta the narration presents.
    const spawnEvents = delta.filter((e) => e.type === 'encounter.spawned');
    expect(spawnEvents).toHaveLength(1);
    const [event] = spawnEvents;
    expect(event.visibility).toBe('public');
    expect(event.presentation).toEqual({ channels: ['narrator'], priority: 'high' });
    expect(event.payload.label).toBe('Patrol');
    // The authored trigger hook, verbatim minus terminal punctuation — the
    // renderer seam line is `> ${label}: ${description}.`
    expect(event.payload.description).toBe('Noise attracts the dead from nearby blocks');
    expect(delta.some((e) => e.type === 'world.zone.entered')).toBe(true);
  });

  it('the spawn is deterministic: same seed, same walk, same round, same entity ids', () => {
    const a = walkUntilSpawn(42);
    const b = walkUntilSpawn(42);
    expect(a.round).toBe(b.round);
    expect(a.entityIds).toEqual(b.entityIds);
    expect(a.delta.map((e) => e.type)).toEqual(b.delta.map((e) => e.type));
  });

  it('re-entering the street while the patrol still stands never restacks a second one', () => {
    const engine = createGame(42);
    engine.store.state.globals['district_dead-zone_safety'] = -40;

    const targets = ['overrun-street', 'safehouse-lobby'];
    let firstSpawnRound = -1;
    for (let round = 0; round < 60; round++) {
      engine.submitAction('move', { targetIds: [targets[round % 2]] });
      const result = runWorldTick(engine, { genre: 'horror' });
      if (result.encounters.length > 0 && firstSpawnRound < 0) firstSpawnRound = round;
    }
    expect(firstSpawnRound).toBeGreaterThanOrEqual(0);

    const streetSpawns = engine.store.state.eventLog.filter(
      (e) => e.type === 'encounter.spawned' && e.payload.zoneId === 'overrun-street',
    );
    // One live encounter per zone: the standing patrol blocks every later roll.
    expect(streetSpawns).toHaveLength(1);
  });
});
