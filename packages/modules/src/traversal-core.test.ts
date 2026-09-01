import { describe, it, expect } from 'vitest';
import { createTestEngine } from '@ai-rpg-engine/core';
import type { EntityState, ZoneState } from '@ai-rpg-engine/core';
import { traversalCore, emitZoneEnteredForPlacement } from './traversal-core.js';
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

describe('traversal-core: moveHandler district-mood walk-in (F-99de2f57)', () => {
  const moodZones: ZoneState[] = [
    { id: 'zone-a', roomId: 'test', name: 'Zone A', tags: [], neighbors: ['zone-b'] },
    { id: 'zone-b', roomId: 'test', name: 'Zone B', tags: [], neighbors: ['zone-a'] },
  ];
  // zone-b -> district-1. Default district metrics (district-core's own
  // DEFAULT_METRICS) already derive a deterministic, non-empty descriptor —
  // 'calm and watchful', the SAME canonical example
  // formatDistrictMoodForNarrator's own doc comment cites — so no metric
  // forcing is needed to pin this.
  const districts = [{ id: 'district-1', name: 'Market', zoneIds: ['zone-b'], tags: [] }];

  function makeMoodEngine(startZone: string) {
    return createTestEngine({
      modules: [traversalCore, createEnvironmentCore(), createDistrictCore({ districts })],
      entities: [makePlayer(startZone)],
      zones: moodZones,
      playerId: 'player',
      startZone,
    });
  }

  it('moving into a zone that resolves to a district attaches moodHint', () => {
    const engine = makeMoodEngine('zone-a');

    const events = engine.submitAction('move', { targetIds: ['zone-b'] });
    const entered = events.find((e) => e.type === 'world.zone.entered');

    expect(entered).toBeDefined();
    expect(entered!.payload.moodHint).toBe('Market: calm and watchful');
  });

  it('moving into an unmapped zone stays byte-identical to today\'s four-key payload (no moodHint key at all)', () => {
    const engine = makeMoodEngine('zone-b');

    const events = engine.submitAction('move', { targetIds: ['zone-a'] });
    const entered = events.find((e) => e.type === 'world.zone.entered');

    expect(entered).toBeDefined();
    expect(Object.keys(entered!.payload).sort()).toEqual(
      ['zoneId', 'zoneName', 'previousZoneId', 'tags'].sort(),
    );
    expect(entered!.payload).not.toHaveProperty('moodHint');
  });

  // --- F-32948b79 tone-on-event: the raw 6-value tone enum, beside moodHint ---

  it('moving into a zone that resolves to a district attaches the raw tone value beside moodHint', () => {
    const engine = makeMoodEngine('zone-a');

    const events = engine.submitAction('move', { targetIds: ['zone-b'] });
    const entered = events.find((e) => e.type === 'world.zone.entered');

    expect(entered).toBeDefined();
    // Default district metrics (safety 75, prosperity 50, spirit 60) derive
    // deriveTone's 'calm' branch — the same fixture the moodHint test above
    // pins to descriptor 'calm and watchful'.
    expect(entered!.payload.tone).toBe('calm');
  });

  it('moving into an unmapped zone omits tone exactly like moodHint (truthy-gated sibling)', () => {
    const engine = makeMoodEngine('zone-b');

    const events = engine.submitAction('move', { targetIds: ['zone-a'] });
    const entered = events.find((e) => e.type === 'world.zone.entered');

    expect(entered).toBeDefined();
    expect(entered!.payload).not.toHaveProperty('tone');
  });
});

describe('traversal-core: inspectHandler moodHint/tone (F-96c7710a)', () => {
  const moodZones: ZoneState[] = [
    { id: 'zone-a', roomId: 'test', name: 'Zone A', tags: [], neighbors: ['zone-b'] },
    { id: 'zone-b', roomId: 'test', name: 'Zone B', tags: [], neighbors: ['zone-a'] },
  ];
  const districts = [{ id: 'district-1', name: 'Market', zoneIds: ['zone-b'], tags: [] }];

  function makeMoodEngine(startZone: string) {
    return createTestEngine({
      modules: [traversalCore, createEnvironmentCore(), createDistrictCore({ districts })],
      entities: [makePlayer(startZone)],
      zones: moodZones,
      playerId: 'player',
      startZone,
    });
  }

  it('district inspect attaches the same moodHint and tone a subsequent move into that zone would', () => {
    const inspectEngine = makeMoodEngine('zone-b');
    const inspected = inspectEngine.submitAction('inspect', {}).find((e) => e.type === 'world.zone.inspected');

    const moveEngine = makeMoodEngine('zone-a');
    const entered = moveEngine.submitAction('move', { targetIds: ['zone-b'] }).find((e) => e.type === 'world.zone.entered');

    expect(inspected!.payload.moodHint).toBe(entered!.payload.moodHint);
    expect(inspected!.payload.tone).toBe(entered!.payload.tone);
    expect(inspected!.payload.moodHint).toBe('Market: calm and watchful');
    expect(inspected!.payload.tone).toBe('calm');
  });

  it('unmapped inspect still matches today\'s seven-key shape (no moodHint, no tone)', () => {
    const engine = makeMoodEngine('zone-a');
    const inspected = engine.submitAction('inspect', {}).find((e) => e.type === 'world.zone.inspected');

    expect(Object.keys(inspected!.payload).sort()).toEqual(
      ['zoneId', 'zoneName', 'tags', 'entities', 'interactables', 'exits', 'hazards'].sort(),
    );
    expect(inspected!.payload).not.toHaveProperty('moodHint');
    expect(inspected!.payload).not.toHaveProperty('tone');
  });
});

describe('traversal-core: emitZoneEnteredForPlacement — session-start zone entry (F-96e9a5f4)', () => {
  // Same fixture shape as the F-99de2f57 block above, reused so the
  // moodHint/tone assertions below are directly comparable to a walked-in
  // arrival's own pinned values ('Market: calm and watchful' / 'calm').
  const placementZones: ZoneState[] = [
    { id: 'zone-a', roomId: 'test', name: 'Zone A', tags: [], neighbors: ['zone-b'] },
    { id: 'zone-b', roomId: 'test', name: 'Zone B', tags: [], neighbors: ['zone-a'] },
  ];
  const placementDistricts = [{ id: 'district-1', name: 'Market', zoneIds: ['zone-b'], tags: [] }];

  function makePlacementEngine(startZone: string) {
    return createTestEngine({
      modules: [traversalCore, createEnvironmentCore(), createDistrictCore({ districts: placementDistricts })],
      entities: [makePlayer(startZone)],
      zones: placementZones,
      playerId: 'player',
      startZone,
    });
  }

  it('RED-PROOF control: Engine.setPlayerLocation alone (the CLI --start boot path\'s primitive, packages/core) places the player but emits nothing -- the exact silent gap F-96e9a5f4 describes', () => {
    const engine = makePlacementEngine('zone-a');

    engine.store.setPlayerLocation('zone-b');

    expect(engine.world.entities.player.zoneId).toBe('zone-b');
    expect(engine.world.locationId).toBe('zone-b');
    expect(engine.world.eventLog.some((e) => e.type === 'world.zone.entered')).toBe(false);
  });

  it('emits world.zone.entered for the placed zone, actorId the player, WITHOUT previousZoneId (a session start has no "from" zone)', () => {
    const engine = makePlacementEngine('zone-a');
    engine.store.setPlayerLocation('zone-b');

    const entered = emitZoneEnteredForPlacement(engine, 'zone-b');

    expect(entered).toBeDefined();
    expect(entered!.type).toBe('world.zone.entered');
    expect(entered!.actorId).toBe('player');
    expect(entered!.payload.zoneId).toBe('zone-b');
    expect(entered!.payload.zoneName).toBe('Zone B');
    expect(entered!.payload.tags).toEqual([]);
    expect(entered!.payload).not.toHaveProperty('previousZoneId');
    // Actually recorded to the eventLog, not just constructed.
    expect(engine.world.eventLog.some((e) => e.type === 'world.zone.entered')).toBe(true);
  });

  it('attaches moodHint/tone exactly like a walked-in arrival, computed from the same computeDistrictMood call', () => {
    const engine = makePlacementEngine('zone-b');
    engine.store.setPlayerLocation('zone-b');

    const entered = emitZoneEnteredForPlacement(engine, 'zone-b');

    expect(entered!.payload.moodHint).toBe('Market: calm and watchful');
    expect(entered!.payload.tone).toBe('calm');
  });

  it('an unmapped zone omits moodHint/tone exactly like moveHandler (truthy-gated, byte-identical shape otherwise)', () => {
    const engine = makePlacementEngine('zone-a');

    const entered = emitZoneEnteredForPlacement(engine, 'zone-a');

    expect(entered!.payload).not.toHaveProperty('moodHint');
    expect(entered!.payload).not.toHaveProperty('tone');
    expect(Object.keys(entered!.payload).sort()).toEqual(['tags', 'zoneId', 'zoneName'].sort());
  });

  it('returns undefined and records nothing for a zone that does not exist (fail-closed, mirrors moveHandler\'s own zone-existence check)', () => {
    const engine = makePlacementEngine('zone-a');
    const before = engine.world.eventLog.length;

    const entered = emitZoneEnteredForPlacement(engine, 'no-such-zone');

    expect(entered).toBeUndefined();
    expect(engine.world.eventLog.length).toBe(before);
  });
});

describe('traversal-core: faction-access gate (F-7d2c4c59)', () => {
  const gatedZones: ZoneState[] = [
    { id: 'zone-a', roomId: 'test', name: 'Street', tags: [], neighbors: ['guild-hall'] },
    {
      id: 'guild-hall', roomId: 'test', name: 'Guild Hall', tags: [], neighbors: ['zone-a'],
      entryGate: {
        conditions: [{ type: 'faction-access', params: { factionId: 'guild', minLevel: 'normal' } }],
        mode: 'hard',
        reason: 'The guild door stays shut.',
      },
    },
  ];

  it('negotiate-access then walk a previously locked exit', () => {
    const engine = createTestEngine({
      modules: [traversalCore],
      entities: [makePlayer('zone-a')],
      zones: gatedZones,
      playerId: 'player',
      startZone: 'zone-a',
    });

    const refused = engine.submitAction('move', { targetIds: ['guild-hall'] });
    expect(refused.some((e) => e.type === 'world.zone.gate.refused')).toBe(true);
    expect(engine.world.entities.player.zoneId).toBe('zone-a');

    engine.world.entities.player.custom = { 'access.guild': 'normal' };
    const entered = engine.submitAction('move', { targetIds: ['guild-hall'] });
    expect(entered.some((e) => e.type === 'world.zone.entered')).toBe(true);
    expect(engine.world.entities.player.zoneId).toBe('guild-hall');
  });

  it('denied is fail-closed', () => {
    const engine = createTestEngine({
      modules: [traversalCore],
      entities: [makePlayer('zone-a', { custom: { 'access.guild': 'denied' } })],
      zones: gatedZones,
      playerId: 'player',
      startZone: 'zone-a',
    });
    const events = engine.submitAction('move', { targetIds: ['guild-hall'] });
    expect(events.some((e) => e.type === 'world.zone.gate.refused')).toBe(true);
    expect(engine.world.entities.player.zoneId).toBe('zone-a');
  });
});

describe('traversal-core: leverage-at-least gate (F-d7bab077)', () => {
  const favorZones: ZoneState[] = [
    { id: 'zone-a', roomId: 'test', name: 'Street', tags: [], neighbors: ['guild-hall'] },
    {
      id: 'guild-hall', roomId: 'test', name: 'Guild Hall', tags: [], neighbors: ['zone-a'],
      entryGate: {
        conditions: [{ type: 'leverage-at-least', params: { currency: 'favor', amount: 20 } }],
        mode: 'hard',
        reason: 'The guild door stays shut.',
      },
    },
  ];

  it('favor>=20 then walk a previously locked exit', () => {
    const engine = createTestEngine({
      modules: [traversalCore],
      entities: [makePlayer('zone-a')],
      zones: favorZones,
      playerId: 'player',
      startZone: 'zone-a',
    });

    const refused = engine.submitAction('move', { targetIds: ['guild-hall'] });
    expect(refused.some((e) => e.type === 'world.zone.gate.refused')).toBe(true);
    expect(engine.world.entities.player.zoneId).toBe('zone-a');

    engine.world.entities.player.custom = { 'leverage.favor': 20 };
    const entered = engine.submitAction('move', { targetIds: ['guild-hall'] });
    expect(entered.some((e) => e.type === 'world.zone.entered')).toBe(true);
    expect(engine.world.entities.player.zoneId).toBe('guild-hall');
  });
});
