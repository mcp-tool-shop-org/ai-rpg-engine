// Test fixture for F1e (`run <path>`): the smallest module satisfying the
// PackInfo contract — createGame + packMeta + a *Ruleset export. Plays a
// one-zone boss fight so the shared loop (NPC turns, endgame) fully engages.

import { Engine } from '@ai-rpg-engine/core';

export const packMeta = {
  id: 'mini-quest',
  name: 'Mini Quest',
  tagline: 'A tiny fixture game: one cell, one warden, one way out.',
};

export const miniRuleset = {
  id: 'mini',
  name: 'Mini',
  version: '1.0.0',
  stats: [],
  resources: [{ id: 'hp', name: 'HP', default: 10 }],
  verbs: [
    { id: 'attack', name: 'Attack', description: 'Strike a target for 2 damage' },
    { id: 'inspect', name: 'Inspect', description: 'Look around' },
  ],
  formulas: [],
  defaultModules: [],
  progressionModels: [],
};

export function createGame(seed = 1) {
  const engine = new Engine({
    manifest: {
      id: 'mini-quest',
      title: 'Mini Quest',
      version: '0.1.0',
      engineVersion: '0.1.0',
      ruleset: 'mini',
      modules: [],
      contentPacks: [],
    },
    seed,
    ruleset: miniRuleset,
  });

  engine.store.state.zones = {
    cell: { id: 'cell', roomId: 'r1', name: 'The Cell', tags: ['interior'], neighbors: [] },
  };
  engine.store.state.locationId = 'cell';

  engine.store.addEntity({
    id: 'player',
    blueprintId: 'player',
    type: 'player',
    name: 'Prisoner',
    tags: ['player'],
    stats: {},
    resources: { hp: 10, maxHp: 10 },
    statuses: [],
    zoneId: 'cell',
  });
  engine.store.addEntity({
    id: 'warden',
    blueprintId: 'warden',
    type: 'enemy',
    name: 'The Warden',
    tags: ['enemy', 'role:boss'],
    stats: {},
    resources: { hp: 4, maxHp: 4 },
    statuses: [],
    zoneId: 'cell',
    ai: { profileId: 'aggressive', goals: [], fears: [], alertLevel: 0, knowledge: {} },
  });
  engine.store.state.playerId = 'player';

  engine.dispatcher.registerVerb('attack', (action, world) => {
    const targetId = action.targetIds?.[0];
    const target = targetId ? world.entities[targetId] : undefined;
    if (!target) return [];
    const previous = target.resources.hp ?? 0;
    target.resources.hp = Math.max(0, previous - 2);
    return [
      {
        id: '',
        tick: action.issuedAtTick,
        type: 'combat.damage.applied',
        actorId: action.actorId,
        payload: {
          attackerId: action.actorId,
          targetId,
          damage: 2,
          previousHp: previous,
          currentHp: target.resources.hp,
        },
      },
    ];
  });
  engine.dispatcher.registerVerb('inspect', (action) => [
    {
      id: '',
      tick: action.issuedAtTick,
      type: 'zone.inspected',
      actorId: action.actorId,
      payload: {},
    },
  ]);

  return engine;
}
