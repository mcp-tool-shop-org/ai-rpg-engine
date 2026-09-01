// Fantasy setup integration tests
//
// ST-04: starter hazards apply their effect by mutating entity.resources
// directly (the environment-core hazard contract invokes effect() for its
// side-effects; its return value is not recorded by the engine). This test
// pins the *observable* behaviour we rely on: entering a hazardous zone
// reduces the affected resource deterministically and clamps at 0 — it never
// drives a resource negative.

import { describe, it, expect } from 'vitest';
import { createGame } from './setup.js';

describe('fantasy setup — unstable-floor hazard (ST-04)', () => {
  it('reduces stamina when the player is in the hazardous zone', () => {
    const engine = createGame(42);
    const player = engine.store.state.entities['player'];
    // vestry-door declares hazards: ['unstable floor'] in content.
    player.zoneId = 'vestry-door';
    const before = player.resources.stamina ?? 0;

    engine.store.emitEvent('world.zone.entered', { zoneId: 'vestry-door', entityId: 'player' });

    const after = engine.store.state.entities['player'].resources.stamina ?? 0;
    expect(after).toBe(before - 1);
  });

  it('clamps stamina at 0 rather than going negative', () => {
    const engine = createGame(42);
    const player = engine.store.state.entities['player'];
    player.zoneId = 'vestry-door';
    player.resources.stamina = 0;

    engine.store.emitEvent('world.zone.entered', { zoneId: 'vestry-door', entityId: 'player' });

    expect(engine.store.state.entities['player'].resources.stamina).toBe(0);
  });

  it('is deterministic — two same-seed engines reach identical stamina after the same hazard', () => {
    const run = () => {
      const engine = createGame(7);
      const player = engine.store.state.entities['player'];
      player.zoneId = 'vestry-door';
      engine.store.emitEvent('world.zone.entered', { zoneId: 'vestry-door', entityId: 'player' });
      return engine.store.state.entities['player'].resources.stamina;
    };
    expect(run()).toBe(run());
  });
});

// ═══════════════════════════════════════════════════════════════════
// CROSS-INSTANCE STATE ISOLATION
// setup.ts inserts entities from module-level constants. If insertion kept
// the caller's reference, the nested resources/stats/statuses/tags/ai
// objects would be SHARED across every engine built from this module in one
// process: combat damage (or the CLI's NPC turn driver killing an enemy) in
// engine A would permanently mutate the constant, so a LATER createGame()
// boots with a dead enemy. The invariant that prevents this is store-level:
// WorldStore.addEntity/addZone detach their argument at ingestion. Same
// class as F-71ec5dcd.
// ═══════════════════════════════════════════════════════════════════
describe('fantasy setup — EntityBlueprint relations/resistances survive apply (F-cf3fc257)', () => {
  it('Brother Aldric keeps player-trust and companion custom without an overlay loop', () => {
    const engine = createGame(42);
    const aldric = engine.store.state.entities['brother-aldric'];
    expect(aldric.relations).toEqual({ 'player-trust': 15 });
    expect(aldric.custom).toMatchObject({ companionRole: 'healer' });
  });

  it('Crypt Warden and Crypt Stalker keep holy resistances', () => {
    const engine = createGame(42);
    expect(engine.store.state.entities['crypt-warden'].resistances).toEqual({ holy: 'immune' });
    expect(engine.store.state.entities['crypt-stalker'].resistances).toEqual({ holy: 'vulnerable' });
  });
});

describe('fantasy setup — cross-instance state isolation', () => {
  it('killing an enemy in engine A does not carry into a fresh engine B', () => {
    const a = createGame(7);
    const fullHp = a.store.state.entities['ash-ghoul'].resources.hp;
    expect(fullHp).toBeGreaterThan(0);

    // Simulate combat/turn-driver damage in engine A.
    a.store.state.entities['ash-ghoul'].resources.hp = 0;
    a.store.state.entities['crypt-warden'].statuses.push({ id: 'st-enraged', statusId: 'enraged', stacks: 1, appliedAtTick: 0 });

    // A brand-new game must start from pristine content, not A's mutations.
    const b = createGame(7);
    expect(b.store.state.entities['ash-ghoul'].resources.hp).toBe(fullHp);
    expect(b.store.state.entities['crypt-warden'].statuses).toHaveLength(0);

    // And the two engines must not alias the same nested objects.
    expect(b.store.state.entities['ash-ghoul'].resources)
      .not.toBe(a.store.state.entities['ash-ghoul'].resources);
  });
});

describe('fantasy setup — WorldState.factions (F-749aba8e)', () => {
  it('chapel-undead lands in the registry from pack.factions / membership, not a third list', () => {
    const engine = createGame(42);
    expect(engine.store.state.factions['chapel-undead']).toEqual({
      id: 'chapel-undead',
      name: 'Chapel Undead',
      reputation: 0,
      disposition: 'neutral',
    });
  });
});

describe('fantasy setup — identity stamp owns playerId/locationId (F-bc7b8ab1)', () => {
  it('boots with playerId "player" and locationId "chapel-entrance" from applyContentPack\'s own identity stamp, with no manual override line', () => {
    // Pin, not a bug fix: this must read identically before and after
    // removing setup.ts's post-applyContentPack `engine.store.state.playerId
    // = 'player'; engine.store.state.locationId = 'chapel-entrance';` lines —
    // pack.entities carries exactly one type:'player' entity ('player'),
    // placed at 'chapel-entrance' (content.ts), so applyContentPack's own
    // identity stamp (F-67786a6c) already derives the same values. The
    // manual lines were the pre-fix-style override the stamp was written to
    // obsolete; a content author who moves the starting zone without
    // updating the matching literal here would have gotten silent
    // divergence — the stamp tracks the change for free.
    const engine = createGame(42);
    expect(engine.store.state.playerId).toBe('player');
    expect(engine.store.state.locationId).toBe('chapel-entrance');
  });
});
