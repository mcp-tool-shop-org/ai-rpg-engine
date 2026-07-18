// F1a — NPC turn driver. THE headline feature: after the player acts, the
// living hostiles in the zone act back through the engine's own AI selection
// (selectActionForEntity), submitted via submitActionAs so every NPC action is
// attributed to the NPC (Stage A actorId fix), guarded so one bad NPC cannot
// crash the session.

import { describe, it, expect, vi } from 'vitest';
import { Engine } from '@ai-rpg-engine/core';
import { createGame } from '@ai-rpg-engine/starter-fantasy';
import { runNpcTurns, listHostilesInPlayerZone, getAbilityCatalog } from './turns.js';

const testManifest = {
  id: 'test-game',
  title: 'Test Game',
  version: '0.1.0',
  engineVersion: '0.1.0',
  ruleset: 'test',
  modules: [],
  contentPacks: [],
};

/** Bare engine with a player and one AI-driven hostile in the same zone. */
function makeBareEngine(): Engine {
  const engine = new Engine({ manifest: testManifest, seed: 7 });
  engine.store.state.zones = {
    cell: { id: 'cell', roomId: 'r1', name: 'Cell', tags: [], neighbors: ['hall'] },
    hall: { id: 'hall', roomId: 'r1', name: 'Hall', tags: [], neighbors: ['cell'] },
  };
  engine.store.state.locationId = 'cell';
  engine.store.addEntity({
    id: 'hero',
    blueprintId: 'bp',
    type: 'player',
    name: 'Hero',
    tags: ['player'],
    stats: {},
    resources: { hp: 10 },
    statuses: [],
    zoneId: 'cell',
  });
  engine.store.addEntity({
    id: 'gnasher',
    blueprintId: 'bp',
    type: 'enemy',
    name: 'Gnasher',
    tags: ['enemy'],
    stats: {},
    resources: { hp: 6 },
    statuses: [],
    zoneId: 'cell',
    ai: { profileId: 'aggressive', goals: [], fears: [], alertLevel: 0, knowledge: {} },
  });
  engine.store.state.playerId = 'hero';
  return engine;
}

/**
 * Starter setup.ts spreads module-level entity constants SHALLOWLY into each
 * engine, so nested state (resources/stats/statuses) is shared across every
 * createGame() in one process — a test that downs the ghoul in engine A downs
 * it in engine B. Detach nested state immediately after creation so tests
 * stay independent. (Root cause flagged to the starters' owner — same
 * cross-instance bleed class as F-71ec5dcd.)
 */
function detachEntityState(engine: Engine): void {
  for (const e of Object.values(engine.store.state.entities)) {
    engine.store.state.entities[e.id] = structuredClone(e);
  }
}

/** Fantasy starter with the player standing in the crypt with both hostiles. */
function makeCryptGame() {
  const engine = createGame(42);
  detachEntityState(engine);
  engine.store.state.entities['player'].zoneId = 'crypt-chamber';
  engine.store.state.locationId = 'crypt-chamber';
  return engine;
}

describe('listHostilesInPlayerZone', () => {
  it('lists only living enemy-tagged entities sharing the player zone, sorted by id', () => {
    const engine = makeCryptGame();
    const hostiles = listHostilesInPlayerZone(engine.world);
    expect(hostiles.map((h) => h.id)).toEqual(['ash-ghoul', 'crypt-warden']);
  });

  it('friendly NPCs are never hostiles — the pilgrim does not go to war', () => {
    const engine = createGame(42); // player at chapel-entrance with the pilgrim
    detachEntityState(engine);
    const hostiles = listHostilesInPlayerZone(engine.world);
    expect(hostiles).toEqual([]);
  });

  it('downed enemies are excluded', () => {
    const engine = makeCryptGame();
    engine.store.state.entities['ash-ghoul'].resources.hp = 0;
    expect(listHostilesInPlayerZone(engine.world).map((h) => h.id)).toEqual(['crypt-warden']);
  });
});

describe('runNpcTurns (F1a) — enemies act after the player', () => {
  it('every living hostile in the zone takes one action through the real engine', () => {
    const engine = makeCryptGame();
    const results = runNpcTurns(engine, { log: vi.fn() });

    // Deterministic roster order, one action each.
    expect(results.map((r) => r.actorId)).toEqual(['ash-ghoul', 'crypt-warden']);
    expect(results.every((r) => r.submitted)).toBe(true);

    // The actions went through the pipeline attributed to the NPCs (Stage A
    // submitActionAs actorId fix): declared actions exist with NPC actorIds.
    const declaredActors = engine.world.eventLog
      .filter((e) => e.type === 'action.declared')
      .map((e) => e.actorId);
    expect(declaredActors).toContain('ash-ghoul');
    expect(declaredActors).toContain('crypt-warden');
  });

  it('an enemy attack actually reaches the player: HP moves or a miss is recorded against the PLAYER', () => {
    const engine = makeCryptGame();
    const hpBefore = engine.world.entities['player'].resources.hp;

    const results = runNpcTurns(engine, { log: vi.fn() });
    const attacks = results.filter((r) => r.verb === 'attack');
    expect(attacks.length).toBeGreaterThan(0);
    expect(attacks.every((a) => a.targetIds?.[0] === 'player')).toBe(true);

    const hpAfter = engine.world.entities['player'].resources.hp;
    const contactEvents = engine.world.eventLog.filter(
      (e) => e.type === 'combat.contact.hit' || e.type === 'combat.contact.miss',
    );
    // Either damage landed on the player, or the swing missed — but the swing
    // HAPPENED, aimed by the NPC at the player, never the reverse.
    expect(contactEvents.length).toBeGreaterThan(0);
    for (const e of contactEvents) {
      expect(e.payload.attackerId).not.toBe('player');
      expect(e.payload.targetId).toBe('player');
    }
    if (contactEvents.some((e) => e.type === 'combat.contact.hit')) {
      expect(hpAfter).toBeLessThan(hpBefore);
    }
    // And the NPCs never damaged themselves by mis-attribution.
    expect(engine.world.entities['ash-ghoul'].resources.hp).toBe(12);
    expect(engine.world.entities['crypt-warden'].resources.hp).toBe(45);
  });

  it('hostiles in OTHER zones do not act (cadence is zone-scoped)', () => {
    const engine = createGame(42); // player at chapel-entrance; hostiles in crypt/vestry
    detachEntityState(engine);
    const results = runNpcTurns(engine, { log: vi.fn() });
    expect(results).toEqual([]);
  });

  it('a downed player ends the round immediately — no pile-on', () => {
    const engine = makeCryptGame();
    engine.store.state.entities['player'].resources.hp = 0;
    const results = runNpcTurns(engine, { log: vi.fn() });
    expect(results).toEqual([]);
  });

  it('a hostile downed mid-round loses its turn', () => {
    const engine = makeCryptGame();
    // Simulate a reactive kill: the ghoul acts first (sorted), and its action
    // advances state; kill the warden before the round to prove liveness is
    // re-checked per entry rather than from the snapshot.
    engine.store.state.entities['crypt-warden'].resources.hp = 0;
    const results = runNpcTurns(engine, { log: vi.fn() });
    expect(results.map((r) => r.actorId)).toEqual(['ash-ghoul']);
  });

  it('an unknown ai.profileId degrades to the aggressive fallback, not a frozen NPC', () => {
    const engine = makeBareEngine();
    engine.store.state.entities['gnasher'].ai!.profileId = 'typo-profile';
    engine.dispatcher.registerVerb('attack', (action) => [
      { id: '', tick: action.issuedAtTick, type: 'test.attacked', actorId: action.actorId, payload: {} },
    ]);

    const results = runNpcTurns(engine, { log: vi.fn() });
    expect(results).toHaveLength(1);
    expect(results[0].usedFallback).toBe(true);
    expect(results[0].profileId).toBe('aggressive');
    expect(results[0].submitted).toBe(true);
  });

  it('a THROWING verb handler cannot crash the round — the engine contains it as action.rejected', () => {
    const engine = makeBareEngine();
    engine.dispatcher.registerVerb('attack', () => {
      throw new Error('combat module blew up');
    });

    let results: ReturnType<typeof runNpcTurns> = [];
    expect(() => {
      results = runNpcTurns(engine, { log: vi.fn() });
    }).not.toThrow();

    // The dispatcher's own guard converts the handler throw into a structured
    // action.rejected event, so from the driver's side the SUBMISSION worked
    // and the session (and the rest of the round) lives on.
    expect(results).toHaveLength(1);
    expect(results[0].submitted).toBe(true);
    const rejected = engine.world.eventLog.find((e) => e.type === 'action.rejected');
    expect(rejected).toBeDefined();
    expect(String((rejected!.payload as { reason?: unknown }).reason)).toContain('threw');
  });

  it('a submission that throws OUTSIDE the dispatcher is caught by the CLI-010 guard', () => {
    const engine = makeBareEngine();
    // Corrupt the submission path itself (worse than a bad handler — the
    // dispatcher guard never runs). The driver's guard must hold the line.
    (engine as unknown as { submitActionAs: () => never }).submitActionAs = () => {
      throw new Error('engine plumbing blew up');
    };
    const log = vi.fn();

    let results: ReturnType<typeof runNpcTurns> = [];
    expect(() => {
      results = runNpcTurns(engine, { log });
    }).not.toThrow();

    expect(results).toHaveLength(1);
    expect(results[0].submitted).toBe(false);
    const logged = log.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('That action could not be completed');
    expect(logged).toContain('engine plumbing blew up');
  });

  it('entities without ai state are skipped silently (selectActionForEntity returns null)', () => {
    const engine = makeBareEngine();
    delete (engine.store.state.entities['gnasher'] as { ai?: unknown }).ai;
    const results = runNpcTurns(engine, { log: vi.fn() });
    expect(results).toEqual([]);
  });

  it('an idle NPC (profile chose inspect) passes its turn instead of narrating as the player', () => {
    const engine = makeBareEngine();
    // Make the hero read as a same-side non-hostile: the aggressive profile
    // finds nothing to attack and idles with 'inspect' — which must NOT be
    // submitted (it burns a tick and renders through the player-anchored
    // narrator as "You look around…", spoken by the NPC).
    engine.store.state.entities['hero'].tags = [];
    engine.store.state.entities['hero'].type = 'enemy'; // same type as gnasher → ally

    const tickBefore = engine.tick;
    const results = runNpcTurns(engine, { log: vi.fn() });

    expect(results).toEqual([]); // idle turn passed, nothing submitted
    expect(engine.tick).toBe(tickBefore); // no tick burned on idling
  });
});

describe('getAbilityCatalog', () => {
  it('returns the pack catalog when ability-core is wired', () => {
    const engine = createGame(42);
    const catalog = getAbilityCatalog(engine);
    expect(catalog.map((a) => a.id)).toContain('holy-smite');
  });

  it('returns [] for an engine without ability-core', () => {
    const engine = makeBareEngine();
    expect(getAbilityCatalog(engine)).toEqual([]);
  });
});
