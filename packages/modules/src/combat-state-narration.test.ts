import { describe, it, expect } from 'vitest';
import { createTestEngine, nextId } from '@ai-rpg-engine/core';
import type { EntityState } from '@ai-rpg-engine/core';
import { createCombatCore, COMBAT_STATES } from './combat-core.js';
import { statusCore, applyStatus, hasStatus } from './status-core.js';
import { createCombatStateNarration } from './combat-state-narration.js';

const makePlayer = (zoneId: string, overrides?: Partial<EntityState>): EntityState => ({
  id: 'player',
  blueprintId: 'player',
  type: 'player',
  name: 'Hero',
  tags: ['player'],
  stats: { vigor: 5, instinct: 5, will: 3 },
  resources: { hp: 20, stamina: 5 },
  statuses: [],
  zoneId,
  ...overrides,
});

const makeEntity = (id: string, name: string, zoneId: string, overrides?: Partial<EntityState>): EntityState => ({
  id,
  blueprintId: id,
  type: 'enemy',
  name,
  tags: ['enemy'],
  stats: { vigor: 5, instinct: 5, will: 3 },
  resources: { hp: 20, stamina: 5 },
  statuses: [],
  zoneId,
  ...overrides,
});

describe('combat state narration', () => {
  it('narrates GUARDED application via guard action', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(), createCombatStateNarration()],
      entities: [makePlayer('a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    const events = engine.submitAction('guard');
    const narrated = events.find(
      e => e.type === 'status.applied' && e.payload.statusId === COMBAT_STATES.GUARDED,
    );
    expect(narrated).toBeDefined();
    expect(narrated!.payload.description).toBe('Hero raises their guard');
    expect(narrated!.presentation?.channels).toContain('narrator');
  });

  it('narrates GUARDED removal when attacking breaks guard', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(), createCombatStateNarration()],
      entities: [makePlayer('a'), makeEntity('foe', 'Goblin', 'a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    // Guard first
    engine.submitAction('guard');
    expect(hasStatus(engine.world.entities.player, COMBAT_STATES.GUARDED)).toBe(true);

    // Attack — clears own guard
    engine.world.entities.player.resources.stamina = 5;
    const events = engine.submitAction('attack', { targetIds: ['foe'] });
    const narrated = events.find(
      e => e.type === 'status.removed' && e.payload.statusId === COMBAT_STATES.GUARDED,
    );
    expect(narrated).toBeDefined();
    expect(narrated!.payload.description).toBe('Hero guard drops');
    expect(narrated!.presentation?.channels).toContain('narrator');
  });

  it('narrates GUARDED expiration on tick', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(), createCombatStateNarration()],
      entities: [makePlayer('a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    // Guard at tick 0 (submitAction auto-advances tick to 1)
    engine.submitAction('guard');
    expect(hasStatus(engine.world.entities.player, COMBAT_STATES.GUARDED)).toBe(true);

    // Advance past duration (2 ticks from application)
    const collected: import('@ai-rpg-engine/core').ResolvedEvent[] = [];
    engine.store.events.on('status.expired', (e: import('@ai-rpg-engine/core').ResolvedEvent) => {
      collected.push(e);
    });
    for (let i = 0; i < 2; i++) {
      engine.store.advanceTick();
      engine.store.recordEvent({
        id: nextId('evt'),
        tick: engine.store.tick,
        type: 'action.resolved',
        payload: { verb: 'wait' },
      });
    }

    const narrated = collected.find(
      e => e.payload.statusId === COMBAT_STATES.GUARDED,
    );
    expect(narrated).toBeDefined();
    expect(narrated!.payload.description).toBe('Hero guard stance fades');
  });

  it('narrates OFF_BALANCE application', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(), createCombatStateNarration()],
      entities: [makePlayer('a'), makeEntity('foe', 'Goblin', 'a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    const event = applyStatus(engine.world.entities.foe, COMBAT_STATES.OFF_BALANCE, engine.world.meta.tick, { duration: 1 });
    engine.store.recordEvent(event);

    expect(event.payload.description).toBe('Goblin is thrown off balance');
    expect(event.presentation?.channels).toContain('narrator');
  });

  it('narrates EXPOSED application', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(), createCombatStateNarration()],
      entities: [makePlayer('a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    const event = applyStatus(engine.world.entities.player, COMBAT_STATES.EXPOSED, engine.world.meta.tick, { duration: 1 });
    engine.store.recordEvent(event);

    expect(event.payload.description).toBe('Hero is left exposed');
  });

  it('narrates FLEEING application', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(), createCombatStateNarration()],
      entities: [makePlayer('a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    const event = applyStatus(engine.world.entities.player, COMBAT_STATES.FLEEING, engine.world.meta.tick, { duration: 2 });
    engine.store.recordEvent(event);

    expect(event.payload.description).toBe('Hero breaks away and flees');
  });

  it('ignores non-combat statuses', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(), createCombatStateNarration()],
      entities: [makePlayer('a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    const event = applyStatus(engine.world.entities.player, 'buff:strength', engine.world.meta.tick, { duration: 3 });
    engine.store.recordEvent(event);

    expect(event.payload.description).toBeUndefined();
    expect(event.presentation).toBeUndefined();
  });

  it('handles missing entity gracefully', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(), createCombatStateNarration()],
      entities: [makePlayer('a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    const event = applyStatus(engine.world.entities.player, COMBAT_STATES.GUARDED, engine.world.meta.tick, { duration: 2 });
    event.actorId = 'ghost';
    engine.store.recordEvent(event);

    expect(event.payload.description).toBe('ghost raises their guard');
  });
});
