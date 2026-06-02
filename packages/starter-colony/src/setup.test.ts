// Colony setup integration tests
//
// ST-02: the custom "ally defeated morale penalty" listener guarded on
// `defeated.tags.includes('ally')`, but no colony entity carries an 'ally'
// tag — the player and allied NPCs are tagged 'colonist'. The guard therefore
// never fired, so losing a colonist ally cost the commander no morale. The
// listener must fire when an allied colonist (not the commander) is defeated
// by something other than the commander.

import { describe, it, expect } from 'vitest';
import { createGame } from './setup.js';

describe('colony setup — ally defeated morale penalty (ST-02)', () => {
  it('drops commander morale when an allied colonist is defeated by an enemy', () => {
    const engine = createGame(42);
    const before = engine.store.state.entities['commander'].resources.morale ?? 0;

    // dr_vasquez is a colonist ally; breached_drone is the enemy that defeats them.
    engine.store.emitEvent('combat.entity.defeated', {
      entityId: 'dr_vasquez',
      defeatedBy: 'breached_drone',
    });

    const after = engine.store.state.entities['commander'].resources.morale ?? 0;
    expect(after).toBeLessThan(before);
    expect(after).toBe(Math.max(0, before - 5));
  });

  it('does not drop commander morale when an enemy is defeated', () => {
    const engine = createGame(42);
    const before = engine.store.state.entities['commander'].resources.morale ?? 0;

    // Defeating the enemy drone must not penalize the commander.
    engine.store.emitEvent('combat.entity.defeated', {
      entityId: 'breached_drone',
      defeatedBy: 'commander',
    });

    const after = engine.store.state.entities['commander'].resources.morale ?? 0;
    expect(after).toBe(before);
  });

  it('does not penalize when the commander themselves is the one defeated', () => {
    const engine = createGame(42);
    const before = engine.store.state.entities['commander'].resources.morale ?? 0;

    engine.store.emitEvent('combat.entity.defeated', {
      entityId: 'commander',
      defeatedBy: 'resonance_entity',
    });

    const after = engine.store.state.entities['commander'].resources.morale ?? 0;
    expect(after).toBe(before);
  });
});
