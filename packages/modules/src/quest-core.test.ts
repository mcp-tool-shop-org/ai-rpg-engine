// quest-core unit tests (F-ENG005-quest-loop-min).
//
// Pins the loop's contracts:
//   - construction fails loud on invalid content (schema + runtime vocabulary)
//   - the offer condition fires ONCE (structural once-guard in world.quests)
//   - progress advances on matching, player-attributed events only
//   - completion grants rewards exactly once (xp/currency/item all land)
//   - QuestState serializes: a mid-quest save/load resumes and completes
//   - chains compose (a quest may offer on another's quest.completed)
//   - the fail branch routes to failStage with via:'fail'
//   - every quest event carries a narrator presentation block
//   - same script ⇒ byte-identical event stream (determinism)

import { describe, it, expect, afterEach } from 'vitest';
import { Engine } from '@ai-rpg-engine/core';
import type { EntityState, GameManifest } from '@ai-rpg-engine/core';
import type { QuestDefinition } from '@ai-rpg-engine/content-schema';
import {
  createQuestCore,
  unregisterQuestContent,
  validateQuestRuntimeContent,
  evaluateQuestCondition,
  getQuestDefinitions,
  questProgressCount,
  questProgressRequired,
} from './quest-core.js';
import { createProgressionCore, getCurrency } from './progression-core.js';

const GAME_ID = 'quest-core-test';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Offer on entering the wilds; cull two wolves; return home; three rewards. */
const huntQuest: QuestDefinition = {
  id: 'hunt',
  name: 'The Hunt',
  triggers: [
    {
      event: 'world.zone.entered',
      condition: { type: 'payload-equals', params: { key: 'zoneId', value: 'wilds' } },
      effect: { type: 'offer', params: {} },
    },
  ],
  stages: [
    {
      id: 'cull',
      name: 'Cull the Pack',
      description: 'Put down two wolves.',
      objectives: ['Kill two wolves in the wilds'],
      triggers: [
        {
          event: 'combat.entity.defeated',
          condition: { type: 'payload-entity-has-tag', params: { tag: 'wolf' } },
          effect: { type: 'progress', params: { count: 2 } },
        },
      ],
      nextStage: 'return',
    },
    {
      id: 'return',
      name: 'Return Home',
      description: 'Bring word back to the village.',
      triggers: [
        {
          event: 'world.zone.entered',
          condition: { type: 'payload-equals', params: { key: 'zoneId', value: 'home' } },
          effect: { type: 'advance', params: {} },
        },
      ],
    },
  ],
  rewards: [
    { type: 'xp', params: { amount: 25 } },
    { type: 'currency', params: { currencyId: 'coin', amount: 5 } },
    { type: 'item', params: { itemId: 'wolf-pelt' } },
  ],
};

/** Chains off huntQuest: offered the moment `hunt` completes. */
const feastQuest: QuestDefinition = {
  id: 'feast',
  name: 'The Feast',
  triggers: [
    {
      event: 'quest.completed',
      condition: { type: 'payload-equals', params: { key: 'questId', value: 'hunt' } },
      effect: { type: 'offer', params: {} },
    },
  ],
  stages: [
    {
      id: 'celebrate',
      name: 'Celebrate',
      triggers: [
        { event: 'feast.begun', effect: { type: 'advance', params: {} } },
      ],
    },
  ],
  rewards: [{ type: 'xp', params: { amount: 5 } }],
};

/** Fail-branch fixture: a broken oath reroutes to the penance stage. */
const oathQuest: QuestDefinition = {
  id: 'oath',
  name: 'The Oath',
  triggers: [
    { event: 'oath.sworn', effect: { type: 'offer', params: {} } },
  ],
  stages: [
    {
      id: 'keep-it',
      name: 'Keep the Oath',
      triggers: [
        { event: 'oath.kept', effect: { type: 'advance', params: {} } },
        { event: 'oath.broken', effect: { type: 'fail', params: {} } },
      ],
      nextStage: 'done',
      failStage: 'penance',
    },
    {
      id: 'penance',
      name: 'Do Penance',
      triggers: [{ event: 'penance.paid', effect: { type: 'advance', params: {} } }],
    },
    { id: 'done', name: 'Honored' },
  ],
};

/** Offer AND first-stage trigger on the SAME event type (self-track guard). */
const echoQuest: QuestDefinition = {
  id: 'echo',
  name: 'The Echo',
  triggers: [
    {
      event: 'world.zone.entered',
      condition: { type: 'payload-equals', params: { key: 'zoneId', value: 'cave' } },
      effect: { type: 'offer', params: {} },
    },
  ],
  stages: [
    {
      id: 'listen',
      name: 'Listen Again',
      triggers: [
        {
          event: 'world.zone.entered',
          condition: { type: 'payload-equals', params: { key: 'zoneId', value: 'cave' } },
          effect: { type: 'advance', params: {} },
        },
      ],
    },
  ],
};

function entity(id: string, type: string, name: string, tags: string[], zoneId: string): EntityState {
  return {
    id,
    blueprintId: id,
    type,
    name,
    tags,
    stats: {},
    resources: { hp: 10 },
    statuses: [],
    inventory: [],
    zoneId,
  };
}

function questModules(quests: QuestDefinition[]) {
  return [createProgressionCore(), createQuestCore({ gameId: GAME_ID, quests })];
}

function makeEngine(quests: QuestDefinition[] = [huntQuest]): Engine {
  const manifest: GameManifest = {
    id: GAME_ID,
    title: 'Quest Core Test',
    version: '0.0.1',
    engineVersion: '0.1.0',
    ruleset: 'test-minimal',
    modules: [],
    contentPacks: [],
  };
  const engine = new Engine({ manifest, seed: 7, modules: questModules(quests) });
  engine.store.addEntity(entity('hero', 'player', 'Hero', ['player'], 'home'));
  engine.store.addEntity(entity('wolf-1', 'enemy', 'Grey Wolf', ['enemy', 'wolf'], 'wilds'));
  engine.store.addEntity(entity('wolf-2', 'enemy', 'Black Wolf', ['enemy', 'wolf'], 'wilds'));
  engine.store.addEntity(entity('villager', 'npc', 'Villager', ['npc'], 'home'));
  engine.store.state.playerId = 'hero';
  engine.store.state.locationId = 'home';
  return engine;
}

function enterZone(engine: Engine, zoneId: string, actorId = 'hero'): void {
  engine.store.emitEvent('world.zone.entered', { zoneId, zoneName: zoneId }, { actorId });
}

function kill(engine: Engine, entityId: string, actorId = 'hero'): void {
  const name = engine.world.entities[entityId]?.name ?? entityId;
  engine.store.emitEvent(
    'combat.entity.defeated',
    { entityId, entityName: name, defeatedBy: actorId },
    { actorId },
  );
}

function eventsOfType(engine: Engine, type: string) {
  return engine.world.eventLog.filter((e) => e.type === type);
}

afterEach(() => unregisterQuestContent(GAME_ID));

// ---------------------------------------------------------------------------
// Construction — fail loud on invalid content
// ---------------------------------------------------------------------------

describe('quest-core construction validation', () => {
  const make = (quests: QuestDefinition[]) => () =>
    createQuestCore({ gameId: GAME_ID, quests });

  it('accepts the valid fixtures (and the runtime validator agrees)', () => {
    expect(make([huntQuest, feastQuest, oathQuest, echoQuest])).not.toThrow();
    expect(validateQuestRuntimeContent([huntQuest, feastQuest, oathQuest, echoQuest])).toEqual([]);
  });

  it('throws on schema-invalid content (stage missing name)', () => {
    const bad = {
      ...huntQuest,
      stages: [{ id: 'broken' }],
    } as unknown as QuestDefinition;
    expect(make([bad])).toThrow(/name/);
  });

  it('throws on a quest with no stages', () => {
    expect(make([{ ...huntQuest, stages: [] }])).toThrow(/at least one stage/);
  });

  it('throws on a quest with no offer trigger (dead content)', () => {
    expect(make([{ ...huntQuest, triggers: [] }])).toThrow(/offer surface/);
  });

  it('throws when a quest-level trigger is not an offer', () => {
    const bad: QuestDefinition = {
      ...huntQuest,
      triggers: [{ event: 'x', effect: { type: 'advance', params: {} } }],
    };
    expect(make([bad])).toThrow(/must use "offer"/);
  });

  it('throws on an unknown stage effect type', () => {
    const bad: QuestDefinition = {
      ...huntQuest,
      stages: [
        {
          id: 's1',
          name: 'S1',
          triggers: [{ event: 'x', effect: { type: 'teleport', params: {} } }],
        },
      ],
    };
    expect(make([bad])).toThrow(/unknown effect type "teleport"/);
  });

  it('throws on a progress effect without a valid count', () => {
    const bad: QuestDefinition = {
      ...huntQuest,
      stages: [
        {
          id: 's1',
          name: 'S1',
          triggers: [{ event: 'x', effect: { type: 'progress', params: {} } }],
        },
      ],
    };
    expect(make([bad])).toThrow(/params\.count/);
  });

  it('throws on a fail effect without a failStage', () => {
    const bad: QuestDefinition = {
      ...huntQuest,
      stages: [
        {
          id: 's1',
          name: 'S1',
          triggers: [{ event: 'x', effect: { type: 'fail', params: {} } }],
        },
      ],
    };
    expect(make([bad])).toThrow(/no failStage/);
  });

  it('throws on a dangling nextStage reference', () => {
    const bad: QuestDefinition = {
      ...huntQuest,
      stages: [{ id: 's1', name: 'S1', nextStage: 'ghost' }],
    };
    expect(make([bad])).toThrow(/nextStage "ghost" does not exist/);
  });

  it('throws on duplicate quest ids', () => {
    expect(make([huntQuest, huntQuest])).toThrow(/duplicate quest id/);
  });

  it('throws on an unknown condition type (typos die at assembly)', () => {
    const bad: QuestDefinition = {
      ...huntQuest,
      triggers: [
        {
          event: 'world.zone.entered',
          condition: { type: 'payload-equalz', params: { key: 'zoneId', value: 'wilds' } },
          effect: { type: 'offer', params: {} },
        },
      ],
    };
    expect(make([bad])).toThrow(/unknown condition type "payload-equalz"/);
  });

  it('throws on an unknown reward type (nothing may silently vanish)', () => {
    const bad: QuestDefinition = {
      ...huntQuest,
      rewards: [{ type: 'fame', params: { amount: 3 } }],
    };
    expect(make([bad])).toThrow(/unknown reward type/);
  });
});

// ---------------------------------------------------------------------------
// Offer
// ---------------------------------------------------------------------------

describe('quest offer', () => {
  it('offers (auto-accepts) when the entry condition hits, into world.quests', () => {
    const engine = makeEngine();
    enterZone(engine, 'wilds');

    const instance = engine.world.quests['hunt'];
    expect(instance).toBeDefined();
    expect(instance.status).toBe('active');
    expect(instance.questId).toBe('hunt');
    expect(instance.currentStage).toBe('cull');
    expect(instance.stageStatuses).toEqual({ cull: 'active', return: 'locked' });

    const offered = eventsOfType(engine, 'quest.offered');
    expect(offered).toHaveLength(1);
    expect(offered[0].payload.questName).toBe('The Hunt');
    expect(offered[0].payload.autoAccepted).toBe(true);
    expect(offered[0].payload.stageName).toBe('Cull the Pack');
    expect(offered[0].payload.objectives).toEqual(['Kill two wolves in the wilds']);
  });

  it('fires ONCE — re-triggering the entry condition never re-offers', () => {
    const engine = makeEngine();
    enterZone(engine, 'wilds');
    enterZone(engine, 'home');
    enterZone(engine, 'wilds');
    expect(eventsOfType(engine, 'quest.offered')).toHaveLength(1);
  });

  it('does not offer on a non-matching payload', () => {
    const engine = makeEngine();
    enterZone(engine, 'meadow');
    expect(engine.world.quests['hunt']).toBeUndefined();
    expect(eventsOfType(engine, 'quest.offered')).toHaveLength(0);
  });

  it('ignores NPC-attributed events (the journal belongs to the player)', () => {
    const engine = makeEngine();
    enterZone(engine, 'wilds', 'villager');
    expect(engine.world.quests['hunt']).toBeUndefined();
  });

  it('the offering event never doubles as first-stage progress (echo guard)', () => {
    const engine = makeEngine([echoQuest]);
    enterZone(engine, 'cave');
    expect(engine.world.quests['echo'].status).toBe('active'); // offered, not completed
    enterZone(engine, 'cave');
    expect(engine.world.quests['echo'].status).toBe('completed'); // the NEXT visit tracks
  });
});

// ---------------------------------------------------------------------------
// Tracking
// ---------------------------------------------------------------------------

describe('stage tracking', () => {
  it('progress advances on matching events only, and persists per stage', () => {
    const engine = makeEngine();
    enterZone(engine, 'wilds');

    kill(engine, 'villager'); // no wolf tag — must not count
    expect(questProgressCount(engine.world.quests['hunt'], 'cull')).toBe(0);

    kill(engine, 'wolf-1');
    expect(questProgressCount(engine.world.quests['hunt'], 'cull')).toBe(1);
    expect(engine.world.quests['hunt'].currentStage).toBe('cull');
    expect(eventsOfType(engine, 'quest.stage.advanced')).toHaveLength(0);

    kill(engine, 'wolf-2'); // 2/2 — the stage completes
    const instance = engine.world.quests['hunt'];
    expect(instance.currentStage).toBe('return');
    expect(instance.stageStatuses.cull).toBe('completed');
    expect(instance.stageStatuses.return).toBe('active');

    const advanced = eventsOfType(engine, 'quest.stage.advanced');
    expect(advanced).toHaveLength(1);
    expect(advanced[0].payload.via).toBe('advance');
    expect(advanced[0].payload.fromStageName).toBe('Cull the Pack');
    expect(advanced[0].payload.stageName).toBe('Return Home');
  });

  it('kills by another actor never advance the player journal', () => {
    const engine = makeEngine();
    enterZone(engine, 'wilds');
    kill(engine, 'wolf-1', 'villager');
    expect(questProgressCount(engine.world.quests['hunt'], 'cull')).toBe(0);
  });

  it('questProgressRequired reads the authored count off the stage', () => {
    expect(questProgressRequired(huntQuest.stages[0])).toBe(2);
    expect(questProgressRequired(huntQuest.stages[1])).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Completion + rewards
// ---------------------------------------------------------------------------

function playHuntToCompletion(engine: Engine): void {
  enterZone(engine, 'wilds');
  kill(engine, 'wolf-1');
  kill(engine, 'wolf-2');
  enterZone(engine, 'home');
}

describe('completion and rewards', () => {
  it('final stage done → quest completed, xp + currency + item all land', () => {
    const engine = makeEngine();
    playHuntToCompletion(engine);

    const instance = engine.world.quests['hunt'];
    expect(instance.status).toBe('completed');
    expect(instance.stageStatuses.return).toBe('completed');

    expect(getCurrency(engine.world, 'hero', 'xp')).toBe(25);
    expect(getCurrency(engine.world, 'hero', 'coin')).toBe(5);
    expect(engine.world.entities['hero'].inventory).toContain('wolf-pelt');

    const completed = eventsOfType(engine, 'quest.completed');
    expect(completed).toHaveLength(1);
    expect(completed[0].payload.questName).toBe('The Hunt');
    expect(completed[0].payload.rewardSummary).toEqual(['25 xp', '5 coin', 'wolf-pelt']);
    // The item grant narrates through the existing item.acquired case.
    expect(eventsOfType(engine, 'item.acquired')).toHaveLength(1);
  });

  it('rewards grant EXACTLY once — replaying the completing events changes nothing', () => {
    const engine = makeEngine();
    playHuntToCompletion(engine);
    playHuntToCompletion(engine); // every beat again, post-completion

    expect(eventsOfType(engine, 'quest.completed')).toHaveLength(1);
    expect(getCurrency(engine.world, 'hero', 'xp')).toBe(25);
    expect(getCurrency(engine.world, 'hero', 'coin')).toBe(5);
    expect(
      engine.world.entities['hero'].inventory!.filter((i) => i === 'wolf-pelt'),
    ).toHaveLength(1);
  });

  it('a chained quest offers on quest.completed, after it in the log (FIFO drain)', () => {
    const engine = makeEngine([huntQuest, feastQuest]);
    playHuntToCompletion(engine);

    expect(engine.world.quests['feast']?.status).toBe('active');
    const log = engine.world.eventLog;
    const completedAt = log.findIndex((e) => e.type === 'quest.completed');
    const feastOfferedAt = log.findIndex(
      (e) => e.type === 'quest.offered' && e.payload.questId === 'feast',
    );
    expect(completedAt).toBeGreaterThanOrEqual(0);
    expect(feastOfferedAt).toBeGreaterThan(completedAt);
  });
});

// ---------------------------------------------------------------------------
// Fail branch
// ---------------------------------------------------------------------------

describe('fail branch (failStage routing)', () => {
  it("a fail trigger reroutes to the stage's failStage with via:'fail'", () => {
    const engine = makeEngine([oathQuest]);
    engine.store.emitEvent('oath.sworn', {});
    expect(engine.world.quests['oath'].currentStage).toBe('keep-it');

    engine.store.emitEvent('oath.broken', {});
    const instance = engine.world.quests['oath'];
    expect(instance.status).toBe('active'); // a branch, not a terminal state
    expect(instance.currentStage).toBe('penance');
    expect(instance.stageStatuses['keep-it']).toBe('failed');
    expect(instance.stageStatuses['penance']).toBe('active');

    const advanced = eventsOfType(engine, 'quest.stage.advanced');
    expect(advanced).toHaveLength(1);
    expect(advanced[0].payload.via).toBe('fail');
    expect(advanced[0].payload.stageName).toBe('Do Penance');
  });
});

// ---------------------------------------------------------------------------
// Serialization — mid-quest round trip
// ---------------------------------------------------------------------------

describe('serialization', () => {
  it('a mid-quest save restores stage + progress and completes on the restored engine', () => {
    const engine = makeEngine();
    enterZone(engine, 'wilds');
    kill(engine, 'wolf-1'); // 1/2 — mid-stage

    const restored = Engine.deserialize(engine.serialize(), {
      modules: questModules([huntQuest]),
    });

    const instance = restored.world.quests['hunt'];
    expect(instance.status).toBe('active');
    expect(instance.currentStage).toBe('cull');
    expect(questProgressCount(instance, 'cull')).toBe(1);

    // The loop keeps running on the restored engine.
    kill(restored, 'wolf-2');
    enterZone(restored, 'home');
    expect(restored.world.quests['hunt'].status).toBe('completed');
    expect(getCurrency(restored.world, 'hero', 'xp')).toBe(25);
    expect(restored.world.entities['hero'].inventory).toContain('wolf-pelt');
  });
});

// ---------------------------------------------------------------------------
// Events, registry, determinism
// ---------------------------------------------------------------------------

describe('event contracts', () => {
  it('all three quest events carry public narrator presentation blocks', () => {
    const engine = makeEngine();
    playHuntToCompletion(engine);
    const questEvents = engine.world.eventLog.filter((e) => e.type.startsWith('quest.'));
    expect(questEvents.length).toBeGreaterThanOrEqual(3);
    for (const event of questEvents) {
      expect(event.visibility).toBe('public');
      expect(event.presentation?.channels).toContain('narrator');
      expect(event.presentation?.priority).toBeDefined();
      expect(event.causedBy).toBeTruthy();
    }
  });

  it('getQuestDefinitions resolves this world’s authored quests via meta.gameId', () => {
    const engine = makeEngine([huntQuest, feastQuest]);
    expect(getQuestDefinitions(engine.world).map((q) => q.id)).toEqual(['hunt', 'feast']);
  });

  it('evaluateQuestCondition fails CLOSED on unknown types', () => {
    const engine = makeEngine();
    const event = engine.store.emitEvent('probe', {});
    expect(
      evaluateQuestCondition({ type: 'nonsense', params: {} }, event, engine.world),
    ).toBe(false);
  });

  it('same script ⇒ byte-identical quest event stream (determinism)', () => {
    const trace = (): string[] => {
      const engine = makeEngine([huntQuest, feastQuest]);
      playHuntToCompletion(engine);
      return engine.world.eventLog.map((e) => `${e.id}:${e.type}`);
    };
    expect(trace()).toEqual(trace());
  });
});
