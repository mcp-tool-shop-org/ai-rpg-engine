import { describe, it, expect } from 'vitest';
import { createTestEngine } from '@ai-rpg-engine/core';
import type { EntityState } from '@ai-rpg-engine/core';
import { createCombatCore } from './combat-core.js';
import { statusCore, applyStatus, removeStatus } from './status-core.js';
import { createEngagementCore, ENGAGEMENT_STATES } from './engagement-core.js';
import { createEngagementNarration } from './engagement-narration.js';

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

describe('engagement narration', () => {
  it('narrates ENGAGED application', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(), createEngagementCore(), createEngagementNarration()],
      entities: [makePlayer('a'), makeEntity('foe', 'Goblin', 'a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    const event = applyStatus(engine.world.entities.player, ENGAGEMENT_STATES.ENGAGED, engine.world.meta.tick, { stacking: 'refresh' });
    engine.store.recordEvent(event);

    expect(event.payload.description).toBe('Hero closes to melee range');
    expect(event.presentation?.channels).toContain('narrator');
  });

  it('narrates PROTECTED application', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(), createEngagementCore(), createEngagementNarration()],
      entities: [makePlayer('a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    const event = applyStatus(engine.world.entities.player, ENGAGEMENT_STATES.PROTECTED, engine.world.meta.tick, { stacking: 'refresh' });
    engine.store.recordEvent(event);

    expect(event.payload.description).toBe('Hero is shielded by an ally');
  });

  it('narrates BACKLINE application', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(), createEngagementCore(), createEngagementNarration()],
      entities: [makePlayer('a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    const event = applyStatus(engine.world.entities.player, ENGAGEMENT_STATES.BACKLINE, engine.world.meta.tick, { stacking: 'refresh' });
    engine.store.recordEvent(event);

    expect(event.payload.description).toBe('Hero holds the backline');
  });

  it('narrates ISOLATED application', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(), createEngagementCore(), createEngagementNarration()],
      entities: [makePlayer('a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    const event = applyStatus(engine.world.entities.player, ENGAGEMENT_STATES.ISOLATED, engine.world.meta.tick, { stacking: 'refresh' });
    engine.store.recordEvent(event);

    expect(event.payload.description).toBe('Hero is cut off from allies');
  });

  it('narrates ENGAGED removal', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(), createEngagementCore(), createEngagementNarration()],
      entities: [makePlayer('a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    // Apply then remove
    applyStatus(engine.world.entities.player, ENGAGEMENT_STATES.ENGAGED, engine.world.meta.tick, { stacking: 'refresh' });

    const collected: import('@ai-rpg-engine/core').ResolvedEvent[] = [];
    engine.store.events.on('status.removed', (e: import('@ai-rpg-engine/core').ResolvedEvent) => {
      collected.push(e);
    });

    // Remove via status-core (triggers status.removed event through recordEvent)
    const removeEvt = removeStatus(engine.world.entities.player, ENGAGEMENT_STATES.ENGAGED, engine.world.meta.tick);
    if (removeEvt) engine.store.recordEvent(removeEvt);

    const narrated = collected.find(e => e.payload.statusId === ENGAGEMENT_STATES.ENGAGED);
    expect(narrated).toBeDefined();
    expect(narrated!.payload.description).toBe('Hero breaks free from melee');
  });

  it('ignores non-engagement statuses', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(), createEngagementCore(), createEngagementNarration()],
      entities: [makePlayer('a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    const event = applyStatus(engine.world.entities.player, 'buff:strength', engine.world.meta.tick, { duration: 3 });
    engine.store.recordEvent(event);

    expect(event.payload.description).toBeUndefined();
    expect(event.presentation).toBeUndefined();
  });
});
