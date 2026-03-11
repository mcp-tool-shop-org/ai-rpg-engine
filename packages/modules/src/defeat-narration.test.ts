import { describe, it, expect } from 'vitest';
import { createTestEngine, nextId } from '@ai-rpg-engine/core';
import type { EntityState, ResolvedEvent } from '@ai-rpg-engine/core';
import { createCombatCore } from './combat-core.js';
import { statusCore } from './status-core.js';
import { createDefeatNarration } from './defeat-narration.js';

const makeEntity = (id: string, name: string, type: string, zoneId: string, overrides?: Partial<EntityState>): EntityState => ({
  id,
  blueprintId: id,
  type,
  name,
  tags: [type],
  stats: { vigor: 5, instinct: 5, will: 3 },
  resources: { hp: 20, stamina: 5 },
  statuses: [],
  zoneId,
  ...overrides,
});

function buildEngine(entities: EntityState[], narrationConfig?: Parameters<typeof createDefeatNarration>[0]) {
  return createTestEngine({
    modules: [statusCore, createCombatCore(), createDefeatNarration(narrationConfig)],
    entities,
    zones: [{ id: 'zone-a', roomId: 'test', name: 'Zone A', tags: [] as string[], neighbors: [] as string[] }],
  });
}

describe('defeat narration', () => {
  it('patches description text onto defeat events', () => {
    const engine = buildEngine([
      makeEntity('player', 'Hero', 'player', 'zone-a'),
      makeEntity('bandit', 'Bandit', 'enemy', 'zone-a', { resources: { hp: 1, stamina: 5 } }),
    ]);

    // Emit a defeat event
    const defeatEvent: ResolvedEvent = {
      id: nextId('evt'),
      tick: engine.store.tick,
      type: 'combat.entity.defeated',
      actorId: 'player',
      payload: {
        entityId: 'bandit',
        entityName: 'Bandit',
        defeatedBy: 'player',
        defeatedByName: 'Hero',
        defeatZoneId: 'zone-a',
        wasInterceptor: false,
      },
      presentation: {
        channels: ['objective', 'narrator'],
        priority: 'critical',
        soundCues: ['combat.defeat'],
      },
    };
    engine.store.recordEvent(defeatEvent);

    expect(defeatEvent.payload.description).toBeDefined();
    expect(typeof defeatEvent.payload.description).toBe('string');
    expect((defeatEvent.payload.description as string)).toContain('Bandit');
  });

  it('enriched defeat payload includes defeatedByName and defeatZoneId', () => {
    const engine = buildEngine([
      makeEntity('player', 'Hero', 'player', 'zone-a'),
      makeEntity('bandit', 'Bandit', 'enemy', 'zone-a', { resources: { hp: 1, stamina: 5 } }),
    ]);

    const defeatEvent: ResolvedEvent = {
      id: nextId('evt'),
      tick: engine.store.tick,
      type: 'combat.entity.defeated',
      actorId: 'player',
      payload: {
        entityId: 'bandit',
        entityName: 'Bandit',
        defeatedBy: 'player',
        defeatedByName: 'Hero',
        defeatZoneId: 'zone-a',
        wasInterceptor: false,
      },
    };
    engine.store.recordEvent(defeatEvent);

    expect(defeatEvent.payload.defeatedByName).toBe('Hero');
    expect(defeatEvent.payload.defeatZoneId).toBe('zone-a');
    expect(defeatEvent.payload.wasInterceptor).toBe(false);
  });

  it('interceptor defeat has wasInterceptor true', () => {
    const engine = buildEngine([
      makeEntity('player', 'Hero', 'player', 'zone-a'),
      makeEntity('guard', 'Guard', 'ally', 'zone-a', { resources: { hp: 1, stamina: 5 } }),
    ]);

    const defeatEvent: ResolvedEvent = {
      id: nextId('evt'),
      tick: engine.store.tick,
      type: 'combat.entity.defeated',
      actorId: 'bandit',
      payload: {
        entityId: 'guard',
        entityName: 'Guard',
        defeatedBy: 'bandit',
        defeatedByName: 'Bandit',
        defeatZoneId: 'zone-a',
        wasInterceptor: true,
      },
    };
    engine.store.recordEvent(defeatEvent);

    expect(defeatEvent.payload.wasInterceptor).toBe(true);
    expect(defeatEvent.payload.description).toContain('Guard');
  });

  it('applies pack flavor when entity tag matches', () => {
    const engine = buildEngine(
      [
        makeEntity('player', 'Hero', 'player', 'zone-a'),
        makeEntity('zombie', 'Shambler', 'enemy', 'zone-a', { tags: ['enemy', 'undead'] }),
      ],
      {
        packFlavor: {
          undead: ['{name} collapses but keeps twitching'],
        },
      },
    );

    const defeatEvent: ResolvedEvent = {
      id: nextId('evt'),
      tick: engine.store.tick,
      type: 'combat.entity.defeated',
      actorId: 'player',
      payload: {
        entityId: 'zombie',
        entityName: 'Shambler',
        defeatedBy: 'player',
      },
    };
    engine.store.recordEvent(defeatEvent);

    expect(defeatEvent.payload.description).toBe('Shambler collapses but keeps twitching');
  });

  it('ignores non-defeat events', () => {
    const engine = buildEngine([
      makeEntity('player', 'Hero', 'player', 'zone-a'),
    ]);

    const otherEvent: ResolvedEvent = {
      id: nextId('evt'),
      tick: engine.store.tick,
      type: 'combat.damage.applied',
      actorId: 'player',
      payload: { damage: 5 },
    };
    engine.store.recordEvent(otherEvent);

    expect(otherEvent.payload.description).toBeUndefined();
  });
});
