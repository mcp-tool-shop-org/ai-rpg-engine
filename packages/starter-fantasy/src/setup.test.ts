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
describe('fantasy setup — cross-instance state isolation', () => {
  it('killing an enemy in engine A does not carry into a fresh engine B', () => {
    const a = createGame(7);
    const fullHp = a.store.state.entities['ash-ghoul'].resources.hp;
    expect(fullHp).toBeGreaterThan(0);

    // Simulate combat/turn-driver damage in engine A.
    a.store.state.entities['ash-ghoul'].resources.hp = 0;
    a.store.state.entities['crypt-warden'].statuses.push({ statusId: 'enraged', stacks: 1, appliedTick: 0 });

    // A brand-new game must start from pristine content, not A's mutations.
    const b = createGame(7);
    expect(b.store.state.entities['ash-ghoul'].resources.hp).toBe(fullHp);
    expect(b.store.state.entities['crypt-warden'].statuses).toHaveLength(0);

    // And the two engines must not alias the same nested objects.
    expect(b.store.state.entities['ash-ghoul'].resources)
      .not.toBe(a.store.state.entities['ash-ghoul'].resources);
  });
});
