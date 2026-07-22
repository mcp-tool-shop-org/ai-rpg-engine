import { describe, it, expect } from 'vitest';
import { createTestEngine } from '@ai-rpg-engine/core';
import type { EntityState, ZoneState } from '@ai-rpg-engine/core';
import { traversalCore } from './traversal-core.js';
import { createEnvironmentCore } from './environment-core.js';
import { createDistrictCore } from './district-core.js';
import { createEconomyCore } from './economy-core.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makePlayer = (zoneId: string, overrides?: Partial<EntityState>): EntityState => ({
  id: 'player',
  blueprintId: 'player',
  type: 'player',
  name: 'Hero',
  tags: ['player'],
  stats: { vigor: 5, instinct: 5, will: 3 },
  resources: { hp: 20 },
  statuses: [],
  zoneId,
  ...overrides,
});

const makeNpc = (id: string, zoneId: string, overrides?: Partial<EntityState>): EntityState => ({
  id,
  blueprintId: id,
  type: 'npc',
  name: id,
  tags: ['npc'],
  stats: { vigor: 5, instinct: 5, will: 3 },
  resources: { hp: 20 },
  statuses: [],
  zoneId,
  ...overrides,
});

describe('traversal-core: moveHandler actor resolution (F-5ce40588)', () => {
  it('player move works exactly as before (baseline)', () => {
    const engine = createTestEngine({
      modules: [traversalCore],
      entities: [makePlayer('zone-a')],
      zones: [
        { id: 'zone-a', roomId: 'test', name: 'Zone A', tags: [], neighbors: ['zone-b'] },
        { id: 'zone-b', roomId: 'test', name: 'Zone B', tags: [], neighbors: ['zone-a'] },
      ],
      playerId: 'player',
      startZone: 'zone-a',
    });

    const events = engine.submitAction('move', { targetIds: ['zone-b'] });
    expect(events.some((e) => e.type === 'world.zone.entered')).toBe(true);
    expect(engine.world.locationId).toBe('zone-b');
    expect(engine.world.entities.player.zoneId).toBe('zone-b');
  });

  it('a non-player actor moving checks adjacency from ITS OWN zone, not the player zone (invariant: NPC move must not be rejected just because the target is not adjacent to the player)', () => {
    const engine = createTestEngine({
      modules: [traversalCore],
      entities: [
        makePlayer('zone-a'),
        makeNpc('npc-1', 'zone-b'),
      ],
      zones: [
        // zone-a and zone-c are NOT neighbors — only reachable via the
        // player's zone if (bug) adjacency is checked from world.locationId.
        { id: 'zone-a', roomId: 'test', name: 'Zone A', tags: [], neighbors: ['zone-b'] },
        { id: 'zone-b', roomId: 'test', name: 'Zone B', tags: [], neighbors: ['zone-a', 'zone-c'] },
        { id: 'zone-c', roomId: 'test', name: 'Zone C', tags: [], neighbors: ['zone-b'] },
      ],
      playerId: 'player',
      startZone: 'zone-a',
    });

    // npc-1 is in zone-b; zone-c IS adjacent to zone-b (the npc's own zone)
    // but is NOT adjacent to zone-a (the player's zone). A correct
    // implementation resolves adjacency from the ACTOR's zone and allows this.
    const events = engine.submitActionAs('npc-1', 'move', { targetIds: ['zone-c'] });

    expect(events.some((e) => e.type === 'action.rejected')).toBe(false);
    expect(events.some((e) => e.type === 'world.zone.entered')).toBe(true);
    expect(engine.world.entities['npc-1'].zoneId).toBe('zone-c');
  });

  it('a non-player actor moving updates ITS OWN zoneId, never the player entity or world.locationId (invariant: NPC move must not teleport the player)', () => {
    const engine = createTestEngine({
      modules: [traversalCore],
      entities: [
        // Player and NPC start co-located, so the move target IS adjacent to
        // the player's zone too — this is the scenario where the bug's
        // "coincidentally adjacent to the player" teleport silently succeeds.
        makePlayer('zone-a'),
        makeNpc('npc-1', 'zone-a'),
      ],
      zones: [
        { id: 'zone-a', roomId: 'test', name: 'Zone A', tags: [], neighbors: ['zone-b'] },
        { id: 'zone-b', roomId: 'test', name: 'Zone B', tags: [], neighbors: ['zone-a'] },
      ],
      playerId: 'player',
      startZone: 'zone-a',
    });

    const events = engine.submitActionAs('npc-1', 'move', { targetIds: ['zone-b'] });
    expect(events.some((e) => e.type === 'world.zone.entered')).toBe(true);

    // The actor (npc-1) must have moved.
    expect(engine.world.entities['npc-1'].zoneId).toBe('zone-b');
    // The player must NOT have moved, and the scene pointer must be untouched.
    expect(engine.world.entities.player.zoneId).toBe('zone-a');
    expect(engine.world.locationId).toBe('zone-a');
  });
});

describe('traversal-core: inspectHandler actor resolution (F-08f214dd)', () => {
  it('a non-player actor inspecting with no target reports ITS OWN zone, not the player zone', () => {
    const engine = createTestEngine({
      modules: [traversalCore],
      entities: [
        makePlayer('zone-a'),
        makeNpc('npc-1', 'zone-b'),
      ],
      zones: [
        { id: 'zone-a', roomId: 'test', name: 'Zone A', tags: [], neighbors: ['zone-b'] },
        { id: 'zone-b', roomId: 'test', name: 'Zone B', tags: [], neighbors: ['zone-a'] },
      ],
      playerId: 'player',
      startZone: 'zone-a',
    });

    const events = engine.submitActionAs('npc-1', 'inspect', {});
    const inspected = events.find((e) => e.type === 'world.zone.inspected');
    expect(inspected).toBeDefined();
    expect(inspected!.payload.zoneId).toBe('zone-b');
  });
});

describe('traversal-core: inspectHandler district drill-down (F-5ef2c8f5)', () => {
  const districtZones: ZoneState[] = [
    { id: 'zone-a', roomId: 'test', name: 'Zone A', tags: [], neighbors: ['zone-b'] },
    { id: 'zone-b', roomId: 'test', name: 'Zone B', tags: [], neighbors: ['zone-a'] },
  ];
  const districts = [{ id: 'district-1', name: 'Market District', zoneIds: ['zone-b'], tags: [] }];

  function makeInspectEngine(startZone: string) {
    return createTestEngine({
      modules: [
        traversalCore,
        createEnvironmentCore(),
        createDistrictCore({ districts }),
        createEconomyCore({ districts: districts.map((d) => ({ id: d.id, tags: d.tags })) }),
      ],
      entities: [makePlayer(startZone)],
      zones: districtZones,
      playerId: 'player',
      startZone,
    });
  }

  it('a zone that resolves to a district carries the detailed single-district economy report on the inspected payload', () => {
    const engine = makeInspectEngine('zone-b'); // zone-b -> district-1

    const events = engine.submitAction('inspect', {});
    const inspected = events.find((e) => e.type === 'world.zone.inspected');

    expect(inspected).toBeDefined();
    expect(inspected!.payload.districtId).toBe('district-1');
    expect(typeof inspected!.payload.economyReport).toBe('string');
    expect(inspected!.payload.economyReport as string).toContain('ECONOMY: Market District (district-1)');
  });

  it('a zone with NO district resolves the exact same payload shape as before the fix (byte-shape unchanged — no districtId/economyReport keys at all)', () => {
    const engine = makeInspectEngine('zone-a'); // zone-a maps to no district

    const events = engine.submitAction('inspect', {});
    const inspected = events.find((e) => e.type === 'world.zone.inspected');

    expect(inspected).toBeDefined();
    expect(Object.keys(inspected!.payload).sort()).toEqual(
      ['zoneId', 'zoneName', 'tags', 'entities', 'interactables', 'exits', 'hazards'].sort(),
    );
    expect(inspected!.payload).not.toHaveProperty('districtId');
    expect(inspected!.payload).not.toHaveProperty('economyReport');
  });

  it('a district zone whose economy was never seeded (economy-core not registered) also stays byte-shape unchanged', () => {
    const engine = createTestEngine({
      modules: [traversalCore, createEnvironmentCore(), createDistrictCore({ districts })], // no createEconomyCore
      entities: [makePlayer('zone-b')],
      zones: districtZones,
      playerId: 'player',
      startZone: 'zone-b',
    });

    const events = engine.submitAction('inspect', {});
    const inspected = events.find((e) => e.type === 'world.zone.inspected');

    expect(inspected).toBeDefined();
    expect(inspected!.payload).not.toHaveProperty('districtId');
    expect(inspected!.payload).not.toHaveProperty('economyReport');
  });
});
