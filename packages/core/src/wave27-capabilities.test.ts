// Wave 27 additive capabilities: stateHash, event query/retention, preview,
// available-action dry-run, advanceRound / onRound.

import { describe, it, expect } from 'vitest';
import { Engine } from './engine.js';
import { WorldStore } from './world.js';
import { ActionDispatcher } from './actions.js';
import { createTestEngine } from './test-harness.js';
import { stateHash, canonicalStateHash, canonicalizeForHash } from './state-hash.js';
import type { ActionIntent, EngineModule, ResolvedEvent, WorldState } from './types.js';

const manifest = {
  id: 'w27-game',
  title: 'W27',
  version: '0.1.0',
  engineVersion: '0.1.0',
  ruleset: 'test',
  modules: [] as string[],
  contentPacks: [] as string[],
};

function playerEntity(id = 'hero') {
  return {
    id,
    blueprintId: 'bp',
    type: 'player',
    name: 'Hero',
    tags: ['player'],
    stats: {},
    resources: { hp: 10 },
    statuses: [] as [],
    zoneId: 'room-a',
  };
}

function withPlayer(engine: Engine, id = 'hero'): void {
  engine.store.addEntity(playerEntity(id));
  engine.store.state.playerId = id;
}

function echoModule(id = 'echo'): EngineModule {
  return {
    id,
    version: '0.1.0',
    register(ctx) {
      ctx.actions.registerVerb('echo', (action: ActionIntent): ResolvedEvent[] => [
        {
          id: '',
          tick: action.issuedAtTick,
          type: 'test.echo',
          actorId: action.actorId,
          payload: { msg: 'echoed' },
          presentation: { channels: ['objective'] },
        },
      ]);
      ctx.actions.registerVerb('nudge', (action: ActionIntent, world: WorldState): ResolvedEvent[] => {
        const n = (typeof world.globals.n === 'number' ? world.globals.n : 0) + 1;
        world.globals.n = n;
        return [
          {
            id: '',
            tick: action.issuedAtTick,
            type: 'test.nudged',
            actorId: action.actorId,
            payload: { n },
          },
        ];
      });
    },
  };
}

describe('F-45f80b2b — canonical stateHash + Engine.present', () => {
  it('stateHash is deterministic and key-order insensitive', () => {
    const a = { tick: 5, flag: true, nested: { b: 2, a: 1 } };
    const b = { nested: { a: 1, b: 2 }, flag: true, tick: 5 };
    expect(JSON.stringify(canonicalizeForHash(a))).toBe(JSON.stringify(canonicalizeForHash(b)));
    const engine = new Engine({ manifest, seed: 7 });
    expect(engine.hash()).toBe(stateHash(engine.world));
    expect(canonicalStateHash(engine.world)).toBe(engine.hash());
    expect(engine.hash()).toMatch(/^[0-9a-f]{32}$/);
  });

  it('quantizes non-integers so nearby floats collapse', () => {
    const x = canonicalizeForHash(1.0000001);
    const y = canonicalizeForHash(1.0000004);
    expect(x).toBe(y);
  });

  it('Engine.present uses module-registered channel filters', () => {
    const fog: EngineModule = {
      id: 'fog',
      version: '0.1.0',
      register(ctx) {
        ctx.ui.addChannelFilter('objective', (event) => ({
          ...event,
          payload: { ...event.payload, secret: '[redacted]' },
        }));
      },
    };
    const engine = new Engine({
      manifest: { ...manifest, modules: ['fog'] },
      seed: 1,
      modules: [fog],
    });
    const event: ResolvedEvent = {
      id: 'e1',
      tick: 0,
      type: 'test.secret',
      payload: { secret: 'the-truth' },
      presentation: { channels: ['objective'] },
    };
    const presented = engine.present(event);
    expect(presented).toHaveLength(1);
    expect(presented[0]._channel).toBe('objective');
    expect(presented[0]._filtered).toBe(true);
    expect(presented[0].payload.secret).toBe('[redacted]');
    expect(event.payload.secret).toBe('the-truth');
    expect(engine.presentAll([event])).toHaveLength(1);
  });
});

describe('F-849723fd — queryEvents + keep-all default retention', () => {
  it('queryEvents filters by type, prefix, actor, tick window, and limit', () => {
    const engine = new Engine({ manifest, seed: 1, modules: [echoModule()] });
    withPlayer(engine);
    engine.submitAction('echo');
    engine.submitAction('nudge');
    engine.store.emitEvent('combat.hit', { dmg: 1 }, { actorId: 'hero' });
    engine.store.emitEvent('combat.miss', { dmg: 0 }, { actorId: 'other' });

    expect(engine.queryEvents({ type: 'test.echo' }).every((e) => e.type === 'test.echo')).toBe(true);
    expect(engine.queryEvents({ typePrefix: 'combat.' }).map((e) => e.type)).toEqual([
      'combat.hit',
      'combat.miss',
    ]);
    expect(engine.queryEvents({ actorId: 'hero', typePrefix: 'combat.' }).map((e) => e.type)).toEqual([
      'combat.hit',
    ]);
    expect(engine.queryEvents({ fromTick: 1, toTick: 1 }).every((e) => e.tick === 1)).toBe(true);
    expect(engine.queryEvents({ typePrefix: 'combat.', limit: 1 })).toHaveLength(1);
  });

  it('keep-all serialize does not drop the log or emit compacted', () => {
    const engine = new Engine({ manifest, seed: 3, modules: [echoModule()] });
    withPlayer(engine);
    engine.submitAction('echo');
    const before = engine.world.eventLog.length;
    const json = engine.serialize();
    expect(engine.world.eventLog.length).toBe(before);
    expect(engine.world.eventLog.some((e) => e.type === 'event.log.compacted')).toBe(false);
    const parsed = JSON.parse(json) as { world: { state: WorldState } };
    expect(parsed.world.state.eventLog).toHaveLength(before);
  });

  it('keep-last-ticks compact drops a prefix and emits event.log.compacted', () => {
    const store = new WorldStore({ manifest, seed: 1, eventLogRetention: { mode: 'keep-last-ticks', ticks: 1 } });
    store.addEntity(playerEntity());
    store.state.playerId = 'hero';
    store.emitEvent('old.event', { n: 1 });
    store.advanceTick();
    store.emitEvent('new.event', { n: 2 });
    const compacted = store.compactEventLog();
    expect(compacted?.type).toBe('event.log.compacted');
    expect(store.state.eventLog.some((e) => e.type === 'old.event')).toBe(false);
    expect(store.state.eventLog.some((e) => e.type === 'new.event')).toBe(true);
    expect(compacted?.payload.droppedCount).toBeGreaterThan(0);
  });

  it('checkpoint-compact seals a prefix and leaves the live tail', () => {
    const store = new WorldStore({
      manifest,
      seed: 1,
      eventLogRetention: { mode: 'checkpoint-compact', sealedThroughTick: 0 },
    });
    store.emitEvent('sealed', {});
    store.advanceTick();
    store.emitEvent('live', {});
    store.compactEventLog();
    expect(store.state.eventLog.some((e) => e.type === 'sealed')).toBe(false);
    expect(store.state.eventLog.some((e) => e.type === 'live')).toBe(true);
    expect(store.state.eventLog.some((e) => e.type === 'event.log.compacted')).toBe(true);
  });
});

describe('F-b55ac621 — validate without emit + Engine.preview isolation', () => {
  it('ActionDispatcher.validate does not record events', () => {
    const store = new WorldStore({ manifest, seed: 1 });
    const dispatcher = new ActionDispatcher();
    dispatcher.registerVerb('echo', (action): ResolvedEvent[] => [
      { id: '', tick: action.issuedAtTick, type: 'test.echo', payload: {} },
    ]);
    dispatcher.registerValidator(() => ({ valid: false, reason: 'blocked' }));
    const action = dispatcher.createAction('echo', 'hero', 0);
    const before = store.state.eventLog.length;
    const result = dispatcher.validate(action, store.state);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('blocked');
    expect(store.state.eventLog.length).toBe(before);
  });

  it('Engine.preview does not change live tick, actionLog, rng, eventLog, or globals', () => {
    const engine = new Engine({
      manifest: { ...manifest, modules: ['echo'] },
      seed: 42,
      modules: [echoModule()],
    });
    withPlayer(engine);
    engine.store.state.globals.n = 0;
    const tick = engine.tick;
    const logLen = engine.world.eventLog.length;
    const rng = engine.store.rng.getState();
    const actions = engine.getActionLog().length;
    const hash = engine.hash();

    const previewed = engine.preview('nudge');
    expect(previewed.some((e) => e.type === 'test.nudged')).toBe(true);

    expect(engine.tick).toBe(tick);
    expect(engine.world.eventLog.length).toBe(logLen);
    expect(engine.store.rng.getState()).toBe(rng);
    expect(engine.getActionLog().length).toBe(actions);
    expect(engine.world.globals.n).toBe(0);
    expect(engine.hash()).toBe(hash);

    engine.submitAction('nudge');
    expect(engine.world.globals.n).toBe(1);
    expect(engine.tick).toBe(tick + 1);
  });
});

describe('F-d5f56a6c — getAvailableActions dry-run + expander', () => {
  it('returns passing verbs as strings and reasons on getAvailableActionsFor', () => {
    const engine = new Engine({
      manifest: { ...manifest, modules: ['echo'] },
      seed: 1,
      modules: [echoModule()],
    });
    withPlayer(engine);
    engine.dispatcher.registerValidator((action) =>
      action.verb === 'nudge' ? { valid: false, reason: 'not now' } : { valid: true },
    );

    expect(engine.getRegisteredVerbs()).toEqual(expect.arrayContaining(['echo', 'nudge']));
    expect(engine.getAvailableActions()).toContain('echo');
    expect(engine.getAvailableActions()).not.toContain('nudge');

    const details = engine.getAvailableActionsFor('hero');
    const blocked = details.find((d) => d.verb === 'nudge');
    expect(blocked).toEqual({ verb: 'nudge', available: false, reason: 'not now' });
    expect(details.find((d) => d.verb === 'echo')?.available).toBe(true);
  });

  it('expander can make a verb available via a legal parameterization', () => {
    const pack: EngineModule = {
      id: 'atk',
      version: '0.1.0',
      register(ctx) {
        ctx.actions.registerVerb('attack', (action): ResolvedEvent[] => [
          {
            id: '',
            tick: action.issuedAtTick,
            type: 'test.hit',
            payload: { target: action.targetIds?.[0] },
          },
        ]);
        ctx.actions.registerExpander('attack', (_verb, _actor, world) =>
          Object.values(world.entities)
            .filter((e) => e.tags.includes('hostile'))
            .map((e) => ({ targetIds: [e.id], label: e.name })),
        );
      },
    };
    const engine = new Engine({
      manifest: { ...manifest, modules: ['atk'] },
      seed: 1,
      modules: [pack],
    });
    withPlayer(engine);
    engine.store.addEntity({
      id: 'goblin',
      blueprintId: 'bp',
      type: 'npc',
      name: 'Goblin',
      tags: ['hostile'],
      stats: {},
      resources: {},
      statuses: [],
      zoneId: 'room-a',
    });
    engine.dispatcher.registerValidator((action) =>
      action.verb === 'attack' && (!action.targetIds || action.targetIds.length === 0)
        ? { valid: false, reason: 'no target' }
        : { valid: true },
    );

    expect(engine.getAvailableActions()).toContain('attack');
    const attack = engine.getAvailableActionsFor('hero').find((d) => d.verb === 'attack');
    expect(attack?.available).toBe(true);
    expect(attack?.reason).toBe('no target');
    expect(attack?.expansions).toEqual([{ targetIds: ['goblin'], label: 'Goblin' }]);
  });

  it('returns [] after shutdown', () => {
    const engine = new Engine({ manifest, seed: 1, modules: [echoModule()] });
    withPlayer(engine);
    engine.shutdown();
    expect(engine.getAvailableActions()).toEqual([]);
    expect(engine.getAvailableActionsFor('hero')).toEqual([]);
  });
});

describe('F-e01841ad — Engine.advanceRound + onRound isolation', () => {
  it('runs onRound hooks in registration order and advances the tick', () => {
    const order: string[] = [];
    const a: EngineModule = {
      id: 'a',
      version: '0.1.0',
      register(ctx) {
        ctx.lifecycle.onRound(() => {
          order.push('a');
        });
      },
    };
    const b: EngineModule = {
      id: 'b',
      version: '0.1.0',
      register(ctx) {
        ctx.lifecycle.onRound((c) => {
          order.push('b');
          c.events.emit({
            id: '',
            tick: 0,
            type: 'round.b',
            payload: {},
          });
        });
      },
    };
    const engine = new Engine({
      manifest: { ...manifest, modules: ['a', 'b'] },
      seed: 1,
      modules: [a, b],
    });
    expect(engine.tick).toBe(0);
    const events = engine.advanceRound();
    expect(order).toEqual(['a', 'b']);
    expect(engine.tick).toBe(1);
    expect(events.some((e) => e.type === 'round.b')).toBe(true);
    engine.advanceRound(2);
    expect(engine.tick).toBe(3);
  });

  it('isolates a throwing onRound hook so later modules still run', () => {
    const ran: string[] = [];
    const boom: EngineModule = {
      id: 'boom',
      version: '0.1.0',
      register(ctx) {
        ctx.lifecycle.onRound(() => {
          ran.push('boom');
          throw new Error('round exploded');
        });
      },
    };
    const ok: EngineModule = {
      id: 'ok',
      version: '0.1.0',
      register(ctx) {
        ctx.lifecycle.onRound(() => {
          ran.push('ok');
        });
      },
    };
    const engine = new Engine({
      manifest: { ...manifest, modules: ['boom', 'ok'] },
      seed: 1,
      modules: [boom, ok],
    });
    expect(() => engine.advanceRound()).not.toThrow();
    expect(ran).toEqual(['boom', 'ok']);
    expect(engine.world.eventLog.some((e) => e.type === 'module.round.failed')).toBe(true);
    expect(engine.tick).toBe(1);
  });

  it('createTestEngine advanceRoundAfterSubmit runs one round after submitAction', () => {
    let rounds = 0;
    const mod: EngineModule = {
      id: 'tick-mod',
      version: '0.1.0',
      register(ctx) {
        ctx.actions.registerVerb('ping', (action): ResolvedEvent[] => [
          { id: '', tick: action.issuedAtTick, type: 'test.ping', payload: {} },
        ]);
        ctx.lifecycle.onRound(() => {
          rounds += 1;
        });
      },
    };
    const engine = createTestEngine({
      modules: [mod],
      entities: [playerEntity('player')],
      playerId: 'player',
      zones: [{ id: 'room-a', roomId: 'r', name: 'A', tags: [], neighbors: [] }],
      advanceRoundAfterSubmit: true,
    });
    engine.drainEvents();
    engine.submitAction('ping');
    expect(rounds).toBe(1);
  });
});
