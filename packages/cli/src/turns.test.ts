// F1a — NPC turn driver. THE headline feature: after the player acts, the
// living hostiles in the zone act back through the engine's own AI selection
// (selectActionForEntity), submitted via submitActionAs so every NPC action is
// attributed to the NPC (Stage A actorId fix), guarded so one bad NPC cannot
// crash the session.

import { describe, it, expect, vi } from 'vitest';
import { Engine } from '@ai-rpg-engine/core';
import { createGame } from '@ai-rpg-engine/starter-fantasy';
import { selectActionForEntity, getPartyState, setPartyState, setCompanionActive } from '@ai-rpg-engine/modules';
import { runNpcTurns, runCompanionTurns, listHostilesInPlayerZone, getAbilityCatalog } from './turns.js';

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

/** Fantasy starter with the player standing in the crypt with both hostiles. */
function makeCryptGame() {
  const engine = createGame(42);
  engine.store.state.entities['player'].zoneId = 'crypt-chamber';
  engine.store.state.locationId = 'crypt-chamber';
  return engine;
}

/**
 * Fantasy starter with Sister Maren recruited (she starts in the player's own
 * zone, chapel-entrance — no move needed), then gathered with the player into
 * the crypt alongside both hostiles. Direct zoneId mutation for the
 * relocation mirrors makeCryptGame's own "teleport for test setup" idiom —
 * there is no party-follow mechanic that would move a companion on its own.
 */
function makeCryptGameWithCompanion(): Engine {
  const engine = createGame(42);
  const recruited = engine.submitAction('recruit', { targetIds: ['sister-maren'] });
  if (!recruited.some((e) => e.type === 'companion.recruited')) {
    throw new Error('test setup failed: sister-maren was not recruited');
  }
  engine.store.state.entities['player'].zoneId = 'crypt-chamber';
  engine.store.state.entities['sister-maren'].zoneId = 'crypt-chamber';
  engine.store.state.locationId = 'crypt-chamber';
  return engine;
}

/**
 * Fantasy starter with BOTH recruitable companions (Sister Maren, Brother
 * Aldric) gathered with the player into the crypt alongside both hostiles —
 * for tests proving companions never target each other or the player.
 */
function makeCryptGameWithParty(): Engine {
  const engine = createGame(42);
  const r1 = engine.submitAction('recruit', { targetIds: ['sister-maren'] });
  if (!r1.some((e) => e.type === 'companion.recruited')) {
    throw new Error('test setup failed: sister-maren was not recruited');
  }
  // Brother Aldric starts in chapel-nave — teleport the player there to
  // recruit him too (same direct-mutation idiom as above).
  engine.store.state.entities['player'].zoneId = 'chapel-nave';
  const r2 = engine.submitAction('recruit', { targetIds: ['brother-aldric'] });
  if (!r2.some((e) => e.type === 'companion.recruited')) {
    throw new Error('test setup failed: brother-aldric was not recruited');
  }

  engine.store.state.entities['player'].zoneId = 'crypt-chamber';
  engine.store.state.entities['sister-maren'].zoneId = 'crypt-chamber';
  engine.store.state.entities['brother-aldric'].zoneId = 'crypt-chamber';
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

describe('runCompanionTurns (F-4b9c5aee) — companions act after the player and hostiles', () => {
  it('an empty party submits ZERO actions — companion-less packs never submit from this path', () => {
    const engine = createGame(42); // no recruit call — the party is empty
    const spy = vi.spyOn(engine, 'submitActionAs');

    const results = runCompanionTurns(engine, { log: vi.fn() });

    expect(results).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it('a recruited companion with stamina takes a real combat action against an in-zone hostile', () => {
    const engine = makeCryptGameWithCompanion();
    const staminaBefore = engine.world.entities['sister-maren'].resources.stamina ?? 0;
    expect(staminaBefore).toBeGreaterThan(0); // the F-4b9c5aee(3) content fix — not still absent/zero

    const results = runCompanionTurns(engine, { log: vi.fn() });

    expect(results).toHaveLength(1);
    expect(results[0].actorId).toBe('sister-maren');
    expect(results[0].submitted).toBe(true);
    expect(results[0].verb).toBe('attack');
    expect(['ash-ghoul', 'crypt-warden']).toContain(results[0].targetIds?.[0]);

    // The action actually reached the real combat pipeline: declared and a
    // contact event recorded with sister-maren as attacker, not a rejection.
    const declared = engine.world.eventLog.filter(
      (e) => e.type === 'action.declared' && e.actorId === 'sister-maren',
    );
    expect(declared.length).toBeGreaterThan(0);
    const contactEvents = engine.world.eventLog.filter(
      (e) => e.type === 'combat.contact.hit' || e.type === 'combat.contact.miss',
    );
    expect(contactEvents.some((e) => e.payload.attackerId === 'sister-maren')).toBe(true);
    const rejected = engine.world.eventLog.find(
      (e) => e.type === 'action.rejected' && e.actorId === 'sister-maren',
    );
    expect(rejected).toBeUndefined();

    // Stamina actually spent by the attack handler itself (not merely
    // present-but-unused) — proves the content fix is load-bearing, not
    // cosmetic. Checked via the resource.changed event rather than final
    // state: combat-recovery's own per-tick regen (unconditional, on the
    // SAME action.resolved event) immediately refills 1 point back, so the
    // net final value legitimately returns to staminaBefore — that is a
    // separate, correct mechanic, not evidence the attack was free.
    const staminaSpend = engine.world.eventLog.find(
      (e) =>
        e.type === 'resource.changed' &&
        e.payload.entityId === 'sister-maren' &&
        e.payload.resource === 'stamina' &&
        e.payload.delta === -1,
    );
    expect(staminaSpend).toBeDefined();
    expect(staminaSpend!.payload.previous).toBe(staminaBefore);
  });

  it('a companion never targets the player or another companion with an attack', () => {
    const engine = makeCryptGameWithParty();
    // Wound the player too — proves the invariant holds even when protect
    // scoring is in play, not just in the common healthy-party case.
    engine.store.state.entities['player'].resources.hp = 4;

    const results = runCompanionTurns(engine, { log: vi.fn() });

    expect(results.length).toBeGreaterThan(0);
    const partyIds = new Set(['player', 'sister-maren', 'brother-aldric']);
    for (const r of results) {
      if (r.verb === 'attack') {
        expect(partyIds.has(r.targetIds?.[0] ?? '')).toBe(false);
      }
    }
  });

  it('a downed player ends the round immediately — no pile-on', () => {
    const engine = makeCryptGameWithCompanion();
    engine.store.state.entities['player'].resources.hp = 0;
    const results = runCompanionTurns(engine, { log: vi.fn() });
    expect(results).toEqual([]);
  });

  it('a downed companion does not act, and does not block the other companion\'s turn', () => {
    const engine = makeCryptGameWithParty();
    engine.store.state.entities['brother-aldric'].resources.hp = 0;
    const results = runCompanionTurns(engine, { log: vi.fn() });
    expect(results.map((r) => r.actorId)).toEqual(['sister-maren']);
  });

  it('a dismissed (inactive) companion does not act', () => {
    const engine = makeCryptGameWithCompanion();
    const party = getPartyState(engine.world);
    setPartyState(engine.world, setCompanionActive(party, 'sister-maren', false));

    const results = runCompanionTurns(engine, { log: vi.fn() });
    expect(results).toEqual([]);
  });

  it('a companion in a different zone than the player does not act (cadence is zone-scoped, mirrors hostile turns)', () => {
    const engine = createGame(42);
    engine.submitAction('recruit', { targetIds: ['sister-maren'] }); // chapel-entrance
    // The player moves on without her — no party-follow mechanic exists yet.
    engine.store.state.entities['player'].zoneId = 'crypt-chamber';
    engine.store.state.locationId = 'crypt-chamber';

    const results = runCompanionTurns(engine, { log: vi.fn() });
    expect(results).toEqual([]);
  });

  it('a THROWING verb handler cannot crash the round — the engine contains it as action.rejected', () => {
    const engine = makeCryptGameWithCompanion();
    engine.dispatcher.registerVerb('attack', () => {
      throw new Error('combat module blew up');
    });

    let results: ReturnType<typeof runCompanionTurns> = [];
    expect(() => {
      results = runCompanionTurns(engine, { log: vi.fn() });
    }).not.toThrow();

    expect(results).toHaveLength(1);
    expect(results[0].submitted).toBe(true);
    const rejected = engine.world.eventLog.find(
      (e) => e.type === 'action.rejected' && e.actorId === 'sister-maren',
    );
    expect(rejected).toBeDefined();
  });

  it('a decision that throws during selection is guarded — skipped, not crashing the round', () => {
    const engine = makeCryptGameWithCompanion();
    // Corrupt the entity so combat-intent's buildContext throws (missing
    // .tags breaks the role-tag scan with a TypeError).
    (engine.store.state.entities['sister-maren'] as unknown as { tags?: unknown }).tags = undefined;
    const log = vi.fn();

    let results: ReturnType<typeof runCompanionTurns> = [];
    expect(() => {
      results = runCompanionTurns(engine, { log });
    }).not.toThrow();

    expect(results).toEqual([]);
    const logged = log.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('hesitates');
  });

  it('a submission that throws OUTSIDE the dispatcher is caught by the CLI-010 guard', () => {
    const engine = makeCryptGameWithCompanion();
    (engine as unknown as { submitActionAs: () => never }).submitActionAs = () => {
      throw new Error('engine plumbing blew up');
    };
    const log = vi.fn();

    let results: ReturnType<typeof runCompanionTurns> = [];
    expect(() => {
      results = runCompanionTurns(engine, { log });
    }).not.toThrow();

    expect(results).toHaveLength(1);
    expect(results[0].submitted).toBe(false);
    const logged = log.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('That action could not be completed');
    expect(logged).toContain('engine plumbing blew up');
  });
});

describe('runCompanionTurns routes through selectBestAction, not cognition-core (F-3a52cc91)', () => {
  it('a real companion has no .ai field — cognition-core\'s selectActionForEntity would never act for it', () => {
    const engine = makeCryptGameWithCompanion();
    expect(engine.world.entities['sister-maren'].ai).toBeUndefined();
    expect(selectActionForEntity(engine.world, 'sister-maren')).toBeNull();
  });

  it('yet runCompanionTurns DOES act for that same companion — proving the entity-agnostic selectBestAction stack (unified-decision + combat-intent) is the real decision path, first production caller', () => {
    const engine = makeCryptGameWithCompanion();
    const results = runCompanionTurns(engine, { log: vi.fn() });
    expect(results).toHaveLength(1);
    expect(results[0].submitted).toBe(true);
  });

  it('a wounded player with no hostiles present produces a protect-flavored choice — combat-intent\'s scoreProtect, reachable through selectBestAction', () => {
    const engine = createGame(42); // sister-maren starts in the player's own zone (chapel-entrance), no hostiles there
    engine.submitAction('recruit', { targetIds: ['sister-maren'] });
    engine.store.state.entities['player'].resources.hp = 2; // 2/20 — badly wounded ally

    const results = runCompanionTurns(engine, { log: vi.fn() });

    expect(results).toHaveLength(1);
    expect(results[0].verb).toBe('guard');
    expect(results[0].source).toBe('combat');
    expect(results[0].reason.startsWith('protect:')).toBe(true);
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
