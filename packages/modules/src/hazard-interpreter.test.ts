// Pins for typed-hazard choke points that the CLI c3 suite left lying:
//   F-2cd298dd — on-enter instakill must emit combat.entity.defeated so
//     defeat-fallout / companion combat-lost actually move.
//   F-d4256636 — trigger:'on-exit' and 'timed' must fire, not just intake-green.

import { describe, it, expect, afterEach } from 'vitest';
import { createTestEngine } from '@ai-rpg-engine/core';
import type { EntityState } from '@ai-rpg-engine/core';
import { statusCore } from './status-core.js';
import { traversalCore } from './traversal-core.js';
import { createEnvironmentCore } from './environment-core.js';
import { createDistrictCore } from './district-core.js';
import { createDefeatFallout } from './defeat-fallout.js';
import {
  createCompanionCore,
  getPartyState,
} from './companion-core.js';
import { runWorldTick, getWorldTickState } from './world-tick.js';
import { hazardDefinitionsChannel } from './intake-channels.js';
import {
  applyTypedHazards,
  registerTypedHazards,
  unregisterTypedHazards,
  runTypedHazardEntryStep,
  runTypedHazardStep,
  type HazardSpec,
} from './hazard-interpreter.js';

const GAME_ID = 'test-harness';

const zones = [
  { id: 'zone-a', roomId: 'test', name: 'Zone A', tags: [], neighbors: ['zone-b'] },
  { id: 'zone-b', roomId: 'test', name: 'Zone B', tags: [], neighbors: ['zone-a'] },
];

const districts = [{ id: 'district-1', name: 'Market', zoneIds: ['zone-a', 'zone-b'], tags: [] }];

function makePlayer(overrides?: Partial<EntityState>): EntityState {
  return {
    id: 'player',
    blueprintId: 'player',
    type: 'player',
    name: 'Hero',
    tags: ['player'],
    stats: { vigor: 5, instinct: 5, will: 3 },
    resources: { hp: 40, maxHp: 40, stamina: 5 },
    statuses: [],
    zoneId: 'zone-a',
    ...overrides,
  };
}

function makeNpc(): EntityState {
  return {
    id: 'mira',
    blueprintId: 'mira',
    type: 'npc',
    name: 'Mira',
    tags: ['npc', 'recruitable', 'fighter'],
    stats: {},
    resources: { hp: 10 },
    statuses: [],
    zoneId: 'zone-a',
  };
}

afterEach(() => {
  unregisterTypedHazards(GAME_ID);
});

function spec(partial: Partial<HazardSpec> & Pick<HazardSpec, 'id' | 'trigger' | 'effects'>): HazardSpec {
  return { name: partial.id, tags: [], ...partial };
}

describe('typed-hazard instakill emits combat.entity.defeated (F-2cd298dd)', () => {
  it('on-enter instakill produces combat.entity.defeated and moves defeat-fallout / companion combat-lost', () => {
    const engine = createTestEngine({
      modules: [
        traversalCore,
        statusCore,
        createEnvironmentCore(),
        createDistrictCore({ districts }),
        createDefeatFallout({ playerId: 'player' }),
        createCompanionCore(),
      ],
      entities: [makePlayer(), makeNpc()],
      zones,
      startZone: 'zone-a',
      seed: 3,
    });

    registerTypedHazards(
      engine.world.meta.gameId,
      [spec({ id: 'void-drop', name: 'Void Drop', trigger: 'on-enter', effects: [{ kind: 'instakill' }] })],
      { 'zone-b': ['void-drop'] },
    );

    getWorldTickState(engine.store.state);
    engine.submitAction('recruit', { targetIds: ['mira'] });
    const moraleBefore = getPartyState(engine.world).companions.find((c) => c.npcId === 'mira')!.morale;
    expect(moraleBefore).toBe(60);

    const moved = engine.submitAction('move', { targetIds: ['zone-b'] });
    expect(moved.some((e) => e.type === 'world.zone.entered'), 'move must succeed').toBe(true);

    const tick = runWorldTick(engine);
    expect(tick.ok).toBe(true);

    const player = engine.world.entities.player;
    expect(player.resources.hp).toBe(0);

    const defeat = engine.world.eventLog.find((e) => e.type === 'combat.entity.defeated');
    expect(defeat, 'on-enter instakill must emit combat.entity.defeated').toBeDefined();
    expect(defeat!.payload).toMatchObject({
      entityId: 'player',
      entityName: 'Hero',
      defeatedBy: 'void-drop',
      defeatZoneId: 'zone-b',
    });

    const fallen = engine.world.eventLog.find((e) => e.type === 'defeat.fallout.player-fallen');
    expect(fallen, 'defeat-fallout must see the hazard kill').toBeDefined();
    const companionLost = engine.world.eventLog.find(
      (e) => e.type === 'defeat.fallout.companion' && e.payload.trigger === 'combat-lost',
    );
    expect(companionLost, 'defeat-fallout companion combat-lost must fire').toBeDefined();

    const moraleAfter = getPartyState(engine.world).companions.find((c) => c.npcId === 'mira')!.morale;
    expect(moraleAfter).toBe(moraleBefore - 2);
  });

  it('lethal instant damage also emits combat.entity.defeated when hp hits 0', () => {
    const engine = createTestEngine({
      modules: [createEnvironmentCore()],
      entities: [makePlayer({ resources: { hp: 5, maxHp: 40 } })],
      zones,
    });
    registerTypedHazards(
      engine.world.meta.gameId,
      [spec({
        id: 'acid',
        name: 'Acid',
        trigger: 'on-enter',
        effects: [{ kind: 'damage', amount: 10, tickOn: 'turn-end' }],
      })],
      { 'zone-a': ['acid'] },
    );

    applyTypedHazards(engine, 'zone-a', engine.world.entities.player, 'on-enter');
    expect(engine.world.entities.player.resources.hp).toBe(0);
    const defeat = engine.world.eventLog.find((e) => e.type === 'combat.entity.defeated');
    expect(defeat).toBeDefined();
    expect(defeat!.payload.defeatedBy).toBe('acid');
    expect(defeat!.payload.entityId).toBe('player');
  });

  it('damage then status in one spec applies the status to the live entity, not a clone', () => {
    const engine = createTestEngine({
      modules: [createEnvironmentCore()],
      entities: [makePlayer()],
      zones,
    });
    registerTypedHazards(
      engine.world.meta.gameId,
      [spec({
        id: 'swamp',
        name: 'Swamp',
        trigger: 'on-enter',
        effects: [
          { kind: 'damage', amount: 3, tickOn: 'turn-end' },
          { kind: 'status', statusId: 'status-chilled', chance: 1, stacking: 'refresh' },
        ],
      })],
      { 'zone-a': ['swamp'] },
    );

    applyTypedHazards(engine, 'zone-a', engine.world.entities.player, 'on-enter');
    const live = engine.store.getEntity('player')!;
    expect(live.resources.hp).toBe(37);
    expect(live.statuses.map((s) => s.statusId)).toContain('status-chilled');
    expect(engine.world.eventLog.some((e) => e.type === 'status.applied')).toBe(true);
  });
});

describe('typed-hazard on-exit and timed dispatch (F-d4256636)', () => {
  it("trigger:'on-exit' is accepted at intake and fires when the actor leaves the zone", () => {
    const engine = createTestEngine({
      modules: [traversalCore, createEnvironmentCore()],
      entities: [makePlayer()],
      zones: [
        { ...zones[0], hazardRefs: ['exit-burn'] },
        zones[1],
      ],
      startZone: 'zone-a',
    });

    const report = hazardDefinitionsChannel().apply(engine, [
      {
        id: 'exit-burn',
        name: 'Exit Burn',
        trigger: 'on-exit',
        effects: [{ kind: 'damage', amount: 4, tickOn: 'turn-end' }],
        tags: [],
      },
    ]);
    expect(report.applied).toBe(1);
    expect(report.errors ?? []).toEqual([]);

    const hpBefore = engine.world.entities.player.resources.hp;
    const moved = engine.submitAction('move', { targetIds: ['zone-b'] });
    expect(moved.some((e) => e.type === 'world.zone.entered')).toBe(true);

    const applications = runTypedHazardEntryStep(engine);
    expect(applications.some((a) => a.hazardId === 'exit-burn' && a.applied.includes('damage'))).toBe(true);
    expect(engine.world.entities.player.resources.hp).toBe(hpBefore - 4);
    expect(engine.world.eventLog.some((e) => e.type === 'hazard.damage.applied')).toBe(true);
  });

  it("trigger:'timed' fires on an elapsed-tick cursor, not on the same observation", () => {
    const engine = createTestEngine({
      modules: [createEnvironmentCore()],
      entities: [makePlayer()],
      zones,
    });
    registerTypedHazards(
      engine.world.meta.gameId,
      [spec({
        id: 'gas',
        name: 'Gas',
        trigger: 'timed',
        effects: [{ kind: 'damage', amount: 2, tickOn: 'turn-end' }],
      })],
      { 'zone-a': ['gas'] },
    );

    const hp0 = engine.world.entities.player.resources.hp;
    const first = runTypedHazardStep(engine);
    expect(first.some((a) => a.hazardId === 'gas')).toBe(false);
    expect(engine.world.entities.player.resources.hp).toBe(hp0);

    engine.store.advanceTick();
    const second = runTypedHazardStep(engine);
    expect(second.some((a) => a.hazardId === 'gas' && a.applied.includes('damage'))).toBe(true);
    expect(engine.world.entities.player.resources.hp).toBe(hp0 - 2);
  });
});
