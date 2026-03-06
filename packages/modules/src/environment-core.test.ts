import { describe, it, expect } from 'vitest';
import { createTestEngine } from '@signalfire/core';
import type { EntityState } from '@signalfire/core';
import {
  createEnvironmentCore,
  getZoneProperty,
  setZoneProperty,
  modifyZoneProperty,
  getHazardLog,
  processEnvironmentDecays,
} from './environment-core.js';
import { traversalCore } from './traversal-core.js';
import { combatCore } from './combat-core.js';

const makePlayer = (zoneId: string): EntityState => ({
  id: 'player',
  blueprintId: 'player',
  type: 'player',
  name: 'Hero',
  tags: ['player'],
  stats: { vigor: 5, instinct: 5 },
  resources: { hp: 20, stamina: 5 },
  statuses: [],
  zoneId,
});

const makeEnemy = (id: string, zoneId: string): EntityState => ({
  id,
  blueprintId: id,
  type: 'enemy',
  name: id,
  tags: ['enemy'],
  stats: { vigor: 3, instinct: 3 },
  resources: { hp: 5, stamina: 3 },
  statuses: [],
  zoneId,
});

describe('Zone property access', () => {
  it('reads base zone property', () => {
    const engine = createTestEngine({
      modules: [createEnvironmentCore()],
      entities: [makePlayer('a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [], light: 7 }],
    });

    expect(getZoneProperty(engine.world, 'a', 'light')).toBe(7);
    expect(getZoneProperty(engine.world, 'a', 'noise')).toBe(0); // Default
  });

  it('sets and reads dynamic zone property', () => {
    const engine = createTestEngine({
      modules: [createEnvironmentCore()],
      entities: [makePlayer('a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [], light: 5 }],
    });

    setZoneProperty(engine.world, 'a', 'noise', 10);
    expect(getZoneProperty(engine.world, 'a', 'noise')).toBe(10);
  });

  it('modifies zone property by delta', () => {
    const engine = createTestEngine({
      modules: [createEnvironmentCore()],
      entities: [makePlayer('a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [], light: 5 }],
    });

    setZoneProperty(engine.world, 'a', 'noise', 3);
    modifyZoneProperty(engine.world, 'a', 'noise', 5);
    expect(getZoneProperty(engine.world, 'a', 'noise')).toBe(8);
  });
});

describe('Combat raises noise (built-in rule)', () => {
  it('combat hit increases zone noise', () => {
    const engine = createTestEngine({
      modules: [traversalCore, combatCore, createEnvironmentCore()],
      entities: [makePlayer('a'), makeEnemy('rat', 'a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    engine.submitAction('attack', { targetIds: ['rat'] });

    // Combat should have raised noise (hit=3, miss=2)
    const noise = getZoneProperty(engine.world, 'a', 'noise');
    expect(noise).toBeGreaterThan(0);
  });

  it('zone entry adds minor noise', () => {
    const engine = createTestEngine({
      modules: [traversalCore, createEnvironmentCore()],
      entities: [makePlayer('a')],
      zones: [
        { id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: ['b'] },
        { id: 'b', roomId: 'test', name: 'B', tags: [], neighbors: ['a'] },
      ],
    });

    engine.submitAction('move', { targetIds: ['b'] });

    const noise = getZoneProperty(engine.world, 'b', 'noise');
    expect(noise).toBeGreaterThan(0);
  });
});

describe('Noise decay', () => {
  it('noise decays toward baseline over time', () => {
    const engine = createTestEngine({
      modules: [traversalCore, combatCore, createEnvironmentCore()],
      entities: [makePlayer('a'), makeEnemy('rat', 'a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: ['b'] },
              { id: 'b', roomId: 'test', name: 'B', tags: [], neighbors: ['a'] }],
    });

    engine.submitAction('attack', { targetIds: ['rat'] });
    const noiseAfterCombat = getZoneProperty(engine.world, 'a', 'noise');
    expect(noiseAfterCombat).toBeGreaterThan(0);

    // Explicitly process decays (in a game loop, this happens via environment-tick)
    processEnvironmentDecays(engine.world);

    const noiseAfterDecay = getZoneProperty(engine.world, 'a', 'noise');
    expect(noiseAfterDecay).toBeLessThan(noiseAfterCombat);
  });
});

describe('Custom environment rules', () => {
  it('custom rule modifies zone property on event', () => {
    const engine = createTestEngine({
      modules: [
        traversalCore,
        createEnvironmentCore({
          rules: [{
            id: 'torch-light',
            eventPattern: 'world.zone.entered',
            property: 'light',
            delta: 2, // Player brings light
          }],
        }),
      ],
      entities: [makePlayer('a')],
      zones: [
        { id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: ['b'] },
        { id: 'b', roomId: 'test', name: 'B', tags: [], neighbors: ['a'], light: 3 },
      ],
    });

    engine.submitAction('move', { targetIds: ['b'] });

    // Light in zone B should have increased by custom rule + base
    const light = getZoneProperty(engine.world, 'b', 'light');
    expect(light).toBe(5); // 3 base + 2 from torch rule
  });

  it('dynamic delta function uses event context', () => {
    const engine = createTestEngine({
      modules: [
        traversalCore,
        combatCore,
        createEnvironmentCore({
          rules: [{
            id: 'blood-stain',
            eventPattern: 'combat.contact.hit',
            property: 'stability',
            delta: (event) => -((event.payload.damage as number) ?? 1),
          }],
        }),
      ],
      entities: [makePlayer('a'), makeEnemy('rat', 'a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [], stability: 10 }],
    });

    engine.submitAction('attack', { targetIds: ['rat'] });

    const stability = getZoneProperty(engine.world, 'a', 'stability');
    // Stability should have decreased based on damage dealt
    expect(stability).toBeLessThanOrEqual(10);
  });
});

describe('Hazards', () => {
  it('hazard activates when condition is met', () => {
    let hazardTriggered = false;
    let affectedEntity = '';

    const engine = createTestEngine({
      modules: [
        traversalCore,
        createEnvironmentCore({
          hazards: [{
            id: 'exposed-wiring',
            triggerOn: 'world.zone.entered',
            condition: (zone) => zone.hazards?.includes('exposed wiring') ?? false,
            effect: (zone, entity, world, tick) => {
              hazardTriggered = true;
              affectedEntity = entity.id;
              // Deal 2 damage
              entity.resources.hp = Math.max(0, (entity.resources.hp ?? 0) - 2);
              return [{
                id: `hazard-${tick}`,
                tick,
                type: 'environment.hazard.triggered',
                actorId: entity.id,
                payload: {
                  hazardId: 'exposed-wiring',
                  zoneId: zone.id,
                  damage: 2,
                },
              }];
            },
          }],
        }),
      ],
      entities: [makePlayer('a')],
      zones: [
        { id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: ['b'] },
        { id: 'b', roomId: 'test', name: 'B', tags: ['hazardous'], neighbors: ['a'], hazards: ['exposed wiring'] },
      ],
    });

    const hpBefore = engine.player().resources.hp;
    engine.submitAction('move', { targetIds: ['b'] });

    expect(hazardTriggered).toBe(true);
    expect(affectedEntity).toBe('player');
    expect(engine.player().resources.hp).toBe(hpBefore - 2);
  });

  it('hazard log tracks activations', () => {
    const engine = createTestEngine({
      modules: [
        traversalCore,
        createEnvironmentCore({
          hazards: [{
            id: 'ice-floor',
            triggerOn: 'world.zone.entered',
            condition: (zone) => zone.tags.includes('icy'),
            effect: (_zone, _entity, _world, tick) => [],
          }],
        }),
      ],
      entities: [makePlayer('a')],
      zones: [
        { id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: ['b'] },
        { id: 'b', roomId: 'test', name: 'B', tags: ['icy'], neighbors: ['a'] },
      ],
    });

    engine.submitAction('move', { targetIds: ['b'] });

    const log = getHazardLog(engine.world, 'b');
    expect(log.length).toBeGreaterThan(0);
    expect(log[0].hazardId).toBe('ice-floor');
    expect(log[0].entityId).toBe('player');
  });
});

describe('Zone tick effects', () => {
  it('tick effect applies to qualifying zones', () => {
    const regenEvents: string[] = [];

    const engine = createTestEngine({
      modules: [
        createEnvironmentCore({
          tickEffects: [{
            id: 'healing-spring',
            condition: (zone) => zone.tags.includes('healing'),
            apply: (zone, world, tick) => {
              // Heal all entities in zone
              for (const entity of Object.values(world.entities)) {
                if (entity.zoneId === zone.id) {
                  entity.resources.hp = Math.min(20, (entity.resources.hp ?? 0) + 1);
                  regenEvents.push(entity.id);
                }
              }
              return [];
            },
          }],
        }),
      ],
      entities: [makePlayer('a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: ['healing'], neighbors: [] }],
    });

    // Manually lower HP
    engine.player().resources.hp = 15;

    // Trigger environment tick
    engine.submitAction('environment-tick', {});

    expect(engine.player().resources.hp).toBe(16);
    expect(regenEvents).toContain('player');
  });
});
