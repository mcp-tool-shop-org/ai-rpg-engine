// Pins for typed-hazard choke points that the CLI c3 suite left lying:
//   F-2cd298dd — on-enter instakill must emit combat.entity.defeated so
//     defeat-fallout / companion combat-lost actually move.
//   F-d4256636 — trigger:'on-exit' and 'timed' must fire, not just intake-green.

import { describe, it, expect, afterEach } from 'vitest';
import { createTestEngine } from '@ai-rpg-engine/core';
import type { EngineModule, EntityState } from '@ai-rpg-engine/core';
import type { QuestDefinition } from '@ai-rpg-engine/content-schema';
import { statusCore, applyStatus } from './status-core.js';
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
import { createCombatCore } from './combat-core.js';
import { createQuestCore, unregisterQuestContent } from './quest-core.js';
import { registerStatusDefinitions, clearStatusRegistry } from './status-semantics.js';
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
  unregisterQuestContent(GAME_ID);
  clearStatusRegistry();
});

function spec(partial: Partial<HazardSpec> & Pick<HazardSpec, 'id' | 'trigger' | 'effects'>): HazardSpec {
  return { name: partial.id, tags: [], ...partial };
}

/** No-op verb so a resolved action can drive status-core's periodic pass. */
const waitModule: EngineModule = {
  id: 'wait-test',
  version: '0.0.0',
  register(ctx) {
    ctx.actions.registerVerb('wait', (action) => [
      { id: '', tick: action.issuedAtTick, type: 'wait.done', actorId: action.actorId, payload: {} },
    ]);
  },
};

const killHunt: QuestDefinition = {
  id: 'kill-hunt',
  name: 'Kill Hunt',
  triggers: [
    { event: 'combat.entity.defeated', effect: { type: 'offer', params: {} } },
  ],
  stages: [{ id: 'cull', name: 'Cull' }],
};

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
    // Quest-core treats missing actorId as a system-attributed world
    // reaction. Stamp the hazard spec so a swamp death does not look
    // like a journal-owned kill (F-94928c2e).
    expect(defeat!.actorId).toBe('void-drop');
    expect(defeat!.actorId).not.toBe('player');

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

describe('typed-hazard writeHp actorId does not advance kill quests (F-94928c2e)', () => {
  function makeWolf(): EntityState {
    return {
      id: 'wolf',
      blueprintId: 'wolf',
      type: 'enemy',
      name: 'Wolf',
      tags: ['enemy', 'wolf'],
      stats: { vigor: 1, instinct: 1, will: 1 },
      resources: { hp: 1, maxHp: 1, stamina: 1 },
      statuses: [],
      zoneId: 'zone-a',
    };
  }

  it('NPC on-enter instakill emits combat.entity.defeated but does not offer a kill quest; player attack-kill still does', () => {
    const engine = createTestEngine({
      modules: [
        statusCore,
        createCombatCore(),
        createEnvironmentCore(),
        createQuestCore({ gameId: GAME_ID, quests: [killHunt] }),
      ],
      entities: [
        makePlayer({ stats: { vigor: 5, instinct: 50, will: 3 } }),
        makeNpc(),
        makeWolf(),
      ],
      zones,
    });

    registerTypedHazards(
      engine.world.meta.gameId,
      [spec({ id: 'void-drop', name: 'Void Drop', trigger: 'on-enter', effects: [{ kind: 'instakill' }] })],
      { 'zone-b': ['void-drop'] },
    );

    engine.store.emitEvent(
      'world.zone.entered',
      { zoneId: 'zone-b', previousZoneId: 'zone-a' },
      { actorId: 'mira' },
    );
    runTypedHazardEntryStep(engine);

    const npcDefeat = engine.world.eventLog.find(
      (e) => e.type === 'combat.entity.defeated' && e.payload.entityId === 'mira',
    );
    expect(npcDefeat, 'NPC walking into an on-enter instakill must emit combat.entity.defeated').toBeDefined();
    expect(npcDefeat!.actorId).toBe('void-drop');
    expect(npcDefeat!.actorId).not.toBe('mira');
    expect(npcDefeat!.actorId).not.toBe('player');
    expect(engine.world.quests['kill-hunt'], 'swamp kill must not offer a combat.entity.defeated quest').toBeUndefined();

    let wolfDied = false;
    for (let i = 0; i < 20 && !wolfDied; i++) {
      engine.world.entities.player.resources.stamina = 5;
      const swing = engine.submitAction('attack', { targetIds: ['wolf'] });
      wolfDied = swing.some((e) => e.type === 'combat.entity.defeated' && e.payload.entityId === 'wolf');
    }

    const wolfDefeat = engine.world.eventLog.find(
      (e) => e.type === 'combat.entity.defeated' && e.payload.entityId === 'wolf',
    );
    expect(wolfDefeat, 'player attack-kill must still emit combat.entity.defeated').toBeDefined();
    expect(wolfDefeat!.actorId).toBe('player');
    expect(engine.world.quests['kill-hunt'], 'player attack-kill must still offer the kill quest').toBeDefined();
  });
});

describe('typed-hazard writeHp emits combat.damage.applied (F-b71568d0)', () => {
  it('non-lethal on-enter damage produces combat.damage.applied and fires a reactive status', () => {
    registerStatusDefinitions([
      {
        id: 'bramble-hide',
        name: 'Bramble Hide',
        tags: ['buff'],
        stacking: 'replace',
        triggers: [
          {
            event: 'combat.damage.applied',
            effect: { type: 'heal', target: 'actor', params: { amount: 1, triggerTarget: 'self' } },
          },
        ],
      },
    ]);

    const engine = createTestEngine({
      modules: [statusCore, createEnvironmentCore()],
      entities: [makePlayer()],
      zones,
    });
    applyStatus(engine.world.entities.player, 'bramble-hide', engine.tick, { duration: 10 }, engine.world);

    registerTypedHazards(
      engine.world.meta.gameId,
      [spec({
        id: 'swamp',
        name: 'Swamp',
        trigger: 'on-enter',
        effects: [{ kind: 'damage', amount: 3, tickOn: 'turn-end' }],
      })],
      { 'zone-a': ['swamp'] },
    );

    applyTypedHazards(engine, 'zone-a', engine.world.entities.player, 'on-enter');

    const dmg = engine.world.eventLog.find((e) => e.type === 'combat.damage.applied');
    expect(dmg, 'non-lethal swamp hit must emit combat.damage.applied').toBeDefined();
    expect(dmg!.payload.targetId).toBe('player');
    expect(dmg!.payload.damage).toBe(3);
    expect(dmg!.payload.previousHp).toBe(40);
    expect(dmg!.payload.currentHp).toBe(37);
    expect(dmg!.actorId).toBe('swamp');

    const rc = engine.world.eventLog.find(
      (e) => e.type === 'resource.changed' && e.payload.cause === 'hazard',
    );
    expect(rc, 'swamp hit must emit resource.changed with cause hazard').toBeDefined();
    expect(rc!.payload).toMatchObject({
      entityId: 'player',
      resource: 'hp',
      previous: 40,
      current: 37,
      delta: -3,
      cause: 'hazard',
    });

    expect(
      engine.world.eventLog.some((e) => e.type === 'status.trigger.fired'),
      'a reactive status on combat.damage.applied must fire on this swamp step',
    ).toBe(true);
    // Hazard wrote 37, then bramble-hide healed 1.
    expect(engine.world.entities.player.resources.hp).toBe(38);
  });
});

describe('periodic/trigger actorId stamps combat.entity.defeated quests (F-1f8eb735)', () => {
  it('player-sourced burning that zeros an NPC offers a combat.entity.defeated quest', () => {
    registerStatusDefinitions([
      { id: 'burning', name: 'Burning', tags: ['poison', 'debuff'], stacking: 'refresh' },
    ]);
    const engine = createTestEngine({
      modules: [
        statusCore,
        waitModule,
        createQuestCore({ gameId: GAME_ID, quests: [killHunt] }),
      ],
      entities: [
        makePlayer(),
        makeNpc(),
        {
          id: 'wolf',
          blueprintId: 'wolf',
          type: 'enemy',
          name: 'Wolf',
          tags: ['enemy', 'wolf'],
          stats: { vigor: 1, instinct: 1, will: 1 },
          resources: { hp: 2, maxHp: 2, stamina: 1 },
          statuses: [],
          zoneId: 'zone-a',
        },
      ],
      zones,
    });

    applyStatus(
      engine.world.entities.wolf,
      'burning',
      engine.tick,
      { duration: 4, sourceId: 'player', data: { periodicKind: 'damage', periodTicks: 1, amount: 5 } },
      engine.world,
    );
    engine.submitAction('wait');

    const defeat = engine.world.eventLog.find(
      (e) => e.type === 'combat.entity.defeated' && e.payload.entityId === 'wolf',
    );
    expect(defeat, 'player-sourced burning must emit combat.entity.defeated').toBeDefined();
    expect(defeat!.actorId).toBe('player');
    expect(defeat!.actorId).not.toBe('wolf');
    expect(engine.world.quests['kill-hunt'], 'player burn-kill must offer the kill quest').toBeDefined();
  });

  it('hazard durationTicks that zeros the player does not offer a kill quest', () => {
    const engine = createTestEngine({
      modules: [
        statusCore,
        waitModule,
        createQuestCore({ gameId: GAME_ID, quests: [killHunt] }),
      ],
      entities: [makePlayer({ resources: { hp: 2, maxHp: 40, stamina: 5 } }), makeNpc()],
      zones,
    });

    registerTypedHazards(
      engine.world.meta.gameId,
      [spec({
        id: 'scalding-steam',
        name: 'Scalding Steam',
        trigger: 'on-enter',
        effects: [{ kind: 'damage', amount: 5, tickOn: 'turn-end', durationTicks: 3 }],
      })],
      { 'zone-a': ['scalding-steam'] },
    );

    applyTypedHazards(engine, 'zone-a', engine.world.entities.player, 'on-enter');
    engine.submitAction('wait');

    const defeat = engine.world.eventLog.find(
      (e) => e.type === 'combat.entity.defeated' && e.payload.entityId === 'player',
    );
    expect(defeat, 'hazard durationTicks that zeros the player must emit combat.entity.defeated').toBeDefined();
    expect(defeat!.actorId).toBe('scalding-steam');
    expect(defeat!.actorId).not.toBe('player');
    expect(engine.world.quests['kill-hunt'], 'player swamp-DoT death must not offer a kill quest').toBeUndefined();
  });

  it('hazard durationTicks that zeros an NPC does not offer a kill quest', () => {
    const engine = createTestEngine({
      modules: [
        statusCore,
        waitModule,
        createQuestCore({ gameId: GAME_ID, quests: [killHunt] }),
      ],
      entities: [makePlayer(), makeNpc()],
      zones,
    });

    registerTypedHazards(
      engine.world.meta.gameId,
      [spec({
        id: 'scalding-steam',
        name: 'Scalding Steam',
        trigger: 'on-enter',
        effects: [{ kind: 'damage', amount: 20, tickOn: 'turn-end', durationTicks: 3 }],
      })],
      { 'zone-a': ['scalding-steam'] },
    );

    applyTypedHazards(engine, 'zone-a', engine.world.entities.mira, 'on-enter');
    engine.submitAction('wait');

    const defeat = engine.world.eventLog.find(
      (e) => e.type === 'combat.entity.defeated' && e.payload.entityId === 'mira',
    );
    expect(defeat, 'hazard durationTicks that zeros an NPC must emit combat.entity.defeated').toBeDefined();
    expect(defeat!.actorId).toBe('scalding-steam');
    expect(defeat!.actorId).not.toBe('mira');
    expect(defeat!.actorId).not.toBe('player');
    expect(engine.world.quests['kill-hunt'], 'NPC swamp-DoT death must not offer a kill quest').toBeUndefined();
  });

  it('a thorns-kill of an NPC by the player still offers a combat.entity.defeated quest', () => {
    registerStatusDefinitions([
      {
        id: 'thorns',
        name: 'Thorns',
        tags: ['buff'],
        stacking: 'replace',
        triggers: [
          {
            event: 'combat.damage.applied',
            effect: { type: 'damage', target: 'target', params: { amount: 20, triggerTarget: 'attacker' } },
          },
        ],
      },
    ]);

    const wolf: EntityState = {
      id: 'wolf',
      blueprintId: 'wolf',
      type: 'enemy',
      name: 'Wolf',
      tags: ['enemy', 'wolf'],
      stats: { vigor: 1, instinct: 50, will: 1 },
      resources: { hp: 5, maxHp: 5, stamina: 5 },
      statuses: [],
      zoneId: 'zone-a',
    };

    const engine = createTestEngine({
      modules: [
        statusCore,
        createCombatCore(),
        createQuestCore({ gameId: GAME_ID, quests: [killHunt] }),
      ],
      entities: [makePlayer(), wolf],
      zones,
    });
    applyStatus(engine.world.entities.player, 'thorns', engine.tick, { duration: 10 }, engine.world);

    engine.submitActionAs('wolf', 'attack', { targetIds: ['player'] });

    const defeat = engine.world.eventLog.find(
      (e) => e.type === 'combat.entity.defeated' && e.payload.entityId === 'wolf',
    );
    expect(defeat, 'player thorns must emit combat.entity.defeated for the NPC').toBeDefined();
    expect(defeat!.actorId).toBe('player');
    expect(defeat!.actorId).not.toBe('wolf');
    expect(engine.world.quests['kill-hunt'], 'player thorns-kill must still offer the kill quest').toBeDefined();
  });
});

describe('typed-hazard durationTicks emits combat.damage.applied (F-b000f36d)', () => {
  it('non-lethal durationTicks on-enter tick produces combat.damage.applied and fires a reactive status', () => {
    registerStatusDefinitions([
      {
        id: 'bramble-hide',
        name: 'Bramble Hide',
        tags: ['buff'],
        stacking: 'replace',
        triggers: [
          {
            event: 'combat.damage.applied',
            effect: { type: 'heal', target: 'actor', params: { amount: 1, triggerTarget: 'self' } },
          },
        ],
      },
    ]);

    const engine = createTestEngine({
      modules: [statusCore, waitModule, createEnvironmentCore()],
      entities: [makePlayer()],
      zones,
    });
    applyStatus(engine.world.entities.player, 'bramble-hide', engine.tick, { duration: 10 }, engine.world);

    registerTypedHazards(
      engine.world.meta.gameId,
      [spec({
        id: 'scalding-steam',
        name: 'Scalding Steam',
        trigger: 'on-enter',
        effects: [{ kind: 'damage', amount: 3, tickOn: 'turn-end', durationTicks: 3 }],
      })],
      { 'zone-a': ['scalding-steam'] },
    );

    applyTypedHazards(engine, 'zone-a', engine.world.entities.player, 'on-enter');
    engine.submitAction('wait');

    const dmg = engine.world.eventLog.find((e) => e.type === 'combat.damage.applied');
    expect(dmg, 'non-lethal durationTicks pulse must emit combat.damage.applied').toBeDefined();
    expect(dmg!.payload.targetId).toBe('player');
    expect(dmg!.payload.damage).toBe(3);
    expect(dmg!.payload.previousHp).toBe(40);
    expect(dmg!.payload.currentHp).toBe(37);
    expect(dmg!.payload.cause).toBe('hazard');
    expect(dmg!.actorId).toBe('scalding-steam');

    expect(
      engine.world.eventLog.some((e) => e.type === 'status.trigger.fired'),
      'a reactive status on combat.damage.applied must fire on this durationTicks pulse',
    ).toBe(true);
    // DoT wrote 37, then bramble-hide healed 1.
    expect(engine.world.entities.player.resources.hp).toBe(38);
  });

  it('non-lethal durationTicks per-turn tick produces combat.damage.applied with targetId of the walker', () => {
    const engine = createTestEngine({
      modules: [statusCore, waitModule, createEnvironmentCore()],
      entities: [makePlayer()],
      zones,
    });

    registerTypedHazards(
      engine.world.meta.gameId,
      [spec({
        id: 'acid',
        name: 'Acid',
        trigger: 'per-turn',
        effects: [{ kind: 'damage', amount: 3, tickOn: 'turn-end', durationTicks: 3 }],
      })],
      { 'zone-a': ['acid'] },
    );

    runTypedHazardStep(engine);
    engine.submitAction('wait');

    const dmg = engine.world.eventLog.find((e) => e.type === 'combat.damage.applied');
    expect(dmg, 'per-turn durationTicks pulse must emit combat.damage.applied').toBeDefined();
    expect(dmg!.payload.targetId).toBe('player');
    expect(dmg!.payload.damage).toBe(3);
    expect(dmg!.actorId).toBe('acid');
  });
});

describe('typed-hazard durationTicks apply-tick pulse and refresh clock (F-7793de81 / F-09c95e49)', () => {
  function hazardDamagePulses() {
    return (e: { type: string; payload: Record<string, unknown> }) =>
      e.type === 'combat.damage.applied' && e.payload.cause === 'hazard';
  }

  it('F-09c95e49: durationTicks:3 per-turn, three waits in the zone, three pulses and no skip', () => {
    const engine = createTestEngine({
      modules: [statusCore, waitModule, createEnvironmentCore()],
      entities: [makePlayer()],
      zones,
    });
    registerTypedHazards(
      engine.world.meta.gameId,
      [spec({
        id: 'scalding-steam',
        name: 'Scalding Steam',
        trigger: 'per-turn',
        effects: [{ kind: 'damage', amount: 3, tickOn: 'turn-end', durationTicks: 3 }],
      })],
      { 'zone-a': ['scalding-steam'] },
    );

    const hpStart = engine.world.entities.player.resources.hp as number;
    const cumulative: number[] = [];
    for (let i = 0; i < 3; i++) {
      engine.submitAction('wait');
      runWorldTick(engine);
      cumulative.push(engine.world.eventLog.filter(hazardDamagePulses()).length);
    }

    expect(cumulative, 'standing steam must pulse every round with no skip tick').toEqual([1, 2, 3]);
    expect(engine.world.entities.player.resources.hp).toBe(hpStart - 9);
  });

  it('F-7793de81: durationTicks:1 on-enter then one wait deals the amount', () => {
    const engine = createTestEngine({
      modules: [traversalCore, statusCore, waitModule, createEnvironmentCore()],
      entities: [makePlayer()],
      zones,
      startZone: 'zone-a',
    });
    registerTypedHazards(
      engine.world.meta.gameId,
      [spec({
        id: 'scalding-steam',
        name: 'Scalding Steam',
        trigger: 'on-enter',
        effects: [{ kind: 'damage', amount: 5, tickOn: 'turn-end', durationTicks: 1 }],
      })],
      { 'zone-b': ['scalding-steam'] },
    );

    getWorldTickState(engine.store.state);
    const moved = engine.submitAction('move', { targetIds: ['zone-b'] });
    expect(moved.some((e) => e.type === 'world.zone.entered'), 'move must succeed').toBe(true);
    runWorldTick(engine);

    expect(engine.world.entities.player.resources.hp).toBe(35);
    const dmg = engine.world.eventLog.find(hazardDamagePulses());
    expect(dmg, 'durationTicks:1 must deal its amount on the enter round').toBeDefined();
    expect(dmg!.payload.damage).toBe(5);
    expect(dmg!.payload.currentHp).toBe(35);
  });

  it('F-7793de81: durationTicks:3 on-enter then three waits deals three pulses then expires', () => {
    const engine = createTestEngine({
      modules: [traversalCore, statusCore, waitModule, createEnvironmentCore()],
      entities: [makePlayer()],
      zones,
      startZone: 'zone-a',
    });
    registerTypedHazards(
      engine.world.meta.gameId,
      [spec({
        id: 'scalding-steam',
        name: 'Scalding Steam',
        trigger: 'on-enter',
        effects: [{ kind: 'damage', amount: 3, tickOn: 'turn-end', durationTicks: 3 }],
      })],
      { 'zone-b': ['scalding-steam'] },
    );

    getWorldTickState(engine.store.state);
    engine.submitAction('move', { targetIds: ['zone-b'] });
    runWorldTick(engine);
    engine.submitAction('wait');
    runWorldTick(engine);
    engine.submitAction('wait');
    runWorldTick(engine);

    const afterThree = engine.world.eventLog.filter(hazardDamagePulses());
    expect(afterThree).toHaveLength(3);
    expect(engine.world.entities.player.resources.hp).toBe(31);

    engine.submitAction('wait');
    runWorldTick(engine);
    expect(engine.world.eventLog.filter(hazardDamagePulses())).toHaveLength(3);
    expect(
      engine.world.entities.player.statuses.some((s) => s.statusId === 'hazard:scalding-steam'),
    ).toBe(false);
  });

  it('F-7793de81: instant damage of the same amount still hits on the enter round without a wait', () => {
    const engine = createTestEngine({
      modules: [traversalCore, statusCore, waitModule, createEnvironmentCore()],
      entities: [makePlayer()],
      zones,
      startZone: 'zone-a',
    });
    registerTypedHazards(
      engine.world.meta.gameId,
      [spec({
        id: 'acid',
        name: 'Acid',
        trigger: 'on-enter',
        effects: [{ kind: 'damage', amount: 5, tickOn: 'turn-end' }],
      })],
      { 'zone-b': ['acid'] },
    );

    getWorldTickState(engine.store.state);
    engine.submitAction('move', { targetIds: ['zone-b'] });
    runWorldTick(engine);

    expect(engine.world.entities.player.resources.hp).toBe(35);
    const dmg = engine.world.eventLog.find(hazardDamagePulses());
    expect(dmg, 'instant hazard damage must hit on the enter round').toBeDefined();
    expect(dmg!.payload.damage).toBe(5);
  });
});
