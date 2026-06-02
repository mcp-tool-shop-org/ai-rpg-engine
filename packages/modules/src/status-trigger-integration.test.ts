// Integration test — reactive status triggers fire through the REAL engine.
//
// The unit tests call processStatusTriggers() directly; that left a gap where the
// trigger system worked as a function but nothing in the run loop invoked it. This
// test drives a real attack via submitActionAs and asserts the attacker takes
// reflect ("spiked armor") damage — proving statusCore's action.resolved hook wires
// reactive triggers into actual gameplay. It also proves the change is additive: a
// status WITHOUT triggers reflects nothing.

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestEngine } from '@ai-rpg-engine/core';
import type { EntityState } from '@ai-rpg-engine/core';
import { createCombatCore } from './combat-core.js';
import { statusCore, applyStatus } from './status-core.js';
import { registerStatusDefinitions, clearStatusRegistry } from './status-semantics.js';

const makeEntity = (id: string, zoneId: string, overrides?: Partial<EntityState>): EntityState => ({
  id,
  blueprintId: id,
  type: 'enemy',
  name: id,
  tags: ['enemy'],
  // High instinct on the attacker forces the deterministic hit roll to land.
  stats: { vigor: 5, instinct: 50, will: 3 },
  resources: { hp: 50, maxHp: 50, stamina: 5 },
  statuses: [],
  zoneId,
  ...overrides,
});

beforeEach(() => {
  clearStatusRegistry();
});

describe('reactive status triggers — engine integration', () => {
  it('a defender with spiked armor reflects damage onto the attacker on a real attack', () => {
    registerStatusDefinitions([
      {
        id: 'spiked',
        name: 'Spiked Armor',
        tags: ['buff'],
        stacking: 'replace',
        triggers: [
          {
            event: 'combat.damage.applied',
            effect: { type: 'damage', target: 'actor', params: { amount: 3, triggerTarget: 'attacker' } },
          },
        ],
      },
    ]);

    const attacker = makeEntity('atk', 'z');
    const defender = makeEntity('def', 'z');
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore()],
      entities: [attacker, defender],
      zones: [{ id: 'z', roomId: 'r', name: 'Z', tags: [], neighbors: [] }],
      playerId: 'atk',
    });
    applyStatus(engine.world.entities.def, 'spiked', engine.tick, { duration: 10 }, engine.world as never);

    const atkHpBefore = engine.world.entities.atk.resources.hp;
    engine.submitActionAs('atk', 'attack', { targetIds: ['def'] });

    // The attacker must have taken the reflect damage (3) via the statusCore hook.
    expect(engine.world.entities.atk.resources.hp).toBe(atkHpBefore - 3);
    // And it must be recorded as an event (observable, deterministic id).
    const reflect = engine.world.eventLog.find(
      (e) => e.type === 'status.trigger.fired' || (e.type === 'combat.damage.applied' && (e.payload?.targetId === 'atk')),
    );
    expect(reflect, 'a reflect event should be recorded').toBeTruthy();
  });

  it('is additive — a status without triggers reflects nothing (back-compat)', () => {
    registerStatusDefinitions([
      { id: 'plain', name: 'Plain Buff', tags: ['buff'], stacking: 'replace' },
    ]);
    const attacker = makeEntity('atk', 'z');
    const defender = makeEntity('def', 'z');
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore()],
      entities: [attacker, defender],
      zones: [{ id: 'z', roomId: 'r', name: 'Z', tags: [], neighbors: [] }],
      playerId: 'atk',
    });
    applyStatus(engine.world.entities.def, 'plain', engine.tick, { duration: 10 }, engine.world as never);

    const atkHpBefore = engine.world.entities.atk.resources.hp;
    engine.submitActionAs('atk', 'attack', { targetIds: ['def'] });
    // No trigger → attacker untouched.
    expect(engine.world.entities.atk.resources.hp).toBe(atkHpBefore);
  });
});
