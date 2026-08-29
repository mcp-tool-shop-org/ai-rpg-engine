// server.test.ts — protocol handler pins for the wire seam.
//
// The live engine is a real createTestEngine (not a transport stub) so preview
// isolation and actionLog/rng pins can fail for the reasons the findings name.

import { describe, it, expect } from 'vitest';
import { createTestEngine, type EngineModule, type EntityState } from '@ai-rpg-engine/core';
import { SidecarServer } from './server.js';
import { ERROR_CODES, METHODS, NOTIFICATIONS, type RpcMessage } from './protocol.js';

function brandModule(): EngineModule {
  return {
    id: 'brand',
    version: '1.0.0',
    register(ctx) {
      ctx.actions.registerVerb('brand', (_action, world) => {
        const hero = world.entities['hero'];
        if (hero) hero.tags = [...hero.tags, 'previewed'];
        return [
          {
            id: 'evt-brand',
            tick: 0,
            type: 'probe.brand',
            actorId: 'hero',
            payload: { tagged: true },
          },
        ];
      });
    },
  };
}

function boot(): {
  engine: ReturnType<typeof createTestEngine>;
  server: SidecarServer;
  sent: RpcMessage[];
  hero: EntityState;
  call: (method: string, params?: Record<string, unknown>, id?: number) => RpcMessage | undefined;
} {
  const engine = createTestEngine({
    modules: [brandModule()],
    playerId: 'hero',
    startZone: 'room',
    entities: [
      {
        id: 'hero',
        blueprintId: 'hero',
        type: 'player',
        name: 'Hero',
        tags: ['player'],
        stats: {},
        resources: { hp: 10 },
        statuses: [],
        zoneId: 'room',
      },
    ],
    zones: [{ id: 'room', roomId: 'room', name: 'Room', tags: [], neighbors: [] }],
  });
  const sent: RpcMessage[] = [];
  const server = new SidecarServer({ engine, engineVersion: '3.8.0-test' }, (m) => sent.push(m));
  const call = (method: string, params: Record<string, unknown> = {}, id = sent.length + 1) => {
    server.handle({ jsonrpc: '2.0', id, method, params });
    return sent.at(-1);
  };
  call(METHODS.INITIALIZE, {});
  return { engine, server, sent, hero: engine.world.entities['hero']!, call };
}

function errorOf(msg: RpcMessage | undefined): { code: number; message: string } {
  const err = msg?.error as { code: number; message: string } | undefined;
  if (!err) throw new Error(`expected error reply, got ${JSON.stringify(msg)}`);
  return err;
}

describe('F-a52b99cd — present fields with the wrong type are refused', () => {
  it('RED: targetIds as a lone string is INVALID_PARAMS, and the verb does not fire', () => {
    const { engine, call } = boot();
    const logBefore = engine.world.eventLog.length;
    const err = errorOf(call(METHODS.SUBMIT_ACTION, { verb: 'brand', targetIds: 'npc-1' }));
    expect(err.code).toBe(ERROR_CODES.INVALID_PARAMS);
    expect(err.message).toMatch(/targetIds/);
    expect(err.message).toMatch(/string\[\]/);
    expect(engine.world.eventLog.length).toBe(logBefore);
    expect(engine.getActionLog()).toHaveLength(0);
  });

  it('RED: rounds as the string "2" is INVALID_PARAMS, not silently one round', () => {
    const sent: RpcMessage[] = [];
    let advanced = 0;
    const { engine } = boot();
    const server = new SidecarServer(
      { engine, engineVersion: '3.8.0-test', advanceRound: () => { advanced += 1; } },
      (m) => sent.push(m),
    );
    server.handle({ jsonrpc: '2.0', id: 1, method: METHODS.INITIALIZE, params: {} });
    server.handle({ jsonrpc: '2.0', id: 2, method: METHODS.ADVANCE, params: { rounds: '2' } });
    const err = errorOf(sent.at(-1));
    expect(err.code).toBe(ERROR_CODES.INVALID_PARAMS);
    expect(err.message).toMatch(/rounds/);
    expect(err.message).toMatch(/safe integer|integer/i);
    expect(advanced).toBe(0);
  });

  it('RED: fromTick as the string "1" is INVALID_PARAMS, not silently tick 0', () => {
    const { call } = boot();
    const err = errorOf(call(METHODS.REPLAY, { fromTick: '1' }));
    expect(err.code).toBe(ERROR_CODES.INVALID_PARAMS);
    expect(err.message).toMatch(/fromTick/);
    expect(err.message).toMatch(/safe integer|integer/i);
  });

  it('a non-string toolId and a non-object parameters are refused the same way', () => {
    const { call, engine } = boot();
    const logBefore = engine.world.eventLog.length;
    expect(errorOf(call(METHODS.SUBMIT_ACTION, { verb: 'brand', toolId: 7 })).message).toMatch(/toolId/);
    expect(errorOf(call(METHODS.PREVIEW, { verb: 'brand', parameters: ['nope'] })).message).toMatch(
      /parameters/,
    );
    expect(engine.world.eventLog.length).toBe(logBefore);
  });

  it('CONTROL: omitted optional fields still run, and a real string[] targetIds is accepted', () => {
    const { call, engine } = boot();
    const ok = call(METHODS.SUBMIT_ACTION, { verb: 'brand', targetIds: ['npc-1'] });
    expect(ok?.error).toBeUndefined();
    expect(ok?.result).toBeTruthy();
    expect(engine.getActionLog().length).toBeGreaterThan(0);
  });
});

describe('F-009da546 — shutdown actually stops serving', () => {
  it('calls engine.shutdown, announces closing, and refuses submitAction as closed', () => {
    const { engine, server, call, sent } = boot();
    let shutdowns = 0;
    const inner = engine.shutdown.bind(engine);
    engine.shutdown = () => {
      shutdowns += 1;
      inner();
    };

    const reply = call(METHODS.SHUTDOWN, {});
    expect(reply?.result).toEqual({ ok: true });
    expect(sent.some((m) => m.method === NOTIFICATIONS.CLOSING)).toBe(true);
    expect(shutdowns).toBe(1);
    expect(server.isClosed).toBe(true);

    const logBefore = engine.world.eventLog.length;
    const actionsBefore = engine.getActionLog().length;
    const err = errorOf(call(METHODS.SUBMIT_ACTION, { verb: 'brand' }));
    expect([ERROR_CODES.SESSION_CLOSED, ERROR_CODES.INVALID_REQUEST]).toContain(err.code);
    expect(err.message).toMatch(/closed/i);
    expect(engine.world.eventLog.length).toBe(logBefore);
    expect(engine.getActionLog().length).toBe(actionsBefore);
  });

  it('snapshot / advance / preview / replay after shutdown are refused too', () => {
    const { call } = boot();
    call(METHODS.SHUTDOWN, {});
    for (const [method, params] of [
      [METHODS.SNAPSHOT, {}],
      [METHODS.ADVANCE, { rounds: 1 }],
      [METHODS.PREVIEW, { verb: 'brand' }],
      [METHODS.REPLAY, {}],
    ] as const) {
      const err = errorOf(call(method, params));
      expect([ERROR_CODES.SESSION_CLOSED, ERROR_CODES.INVALID_REQUEST]).toContain(err.code);
      expect(err.message).toMatch(/closed/i);
    }
  });
});

describe('F-4dbb32eb — preview never dispatches on the live engine', () => {
  it('leaves getActionLog, rng state, nested entity identity, and live EventBus draws untouched', () => {
    const { engine, server, hero } = boot();
    const rngBefore = engine.store.rng.getState();
    const logBefore = engine.getActionLog().length;
    const tagsBefore = [...hero.tags];
    let liveBusFires = 0;
    engine.store.events.onAny(() => {
      liveBusFires += 1;
      engine.store.rng.next();
    });

    const result = server.preview('brand', {});

    expect(result.events.some((e) => e.type === 'probe.brand' || e.type === 'action.declared')).toBe(true);
    expect(engine.getActionLog()).toHaveLength(logBefore);
    expect(engine.store.rng.getState()).toBe(rngBefore);
    expect(hero.tags).toEqual(tagsBefore);
    expect(hero.tags).not.toContain('previewed');
    expect(engine.world.entities['hero']).toBe(hero);
    expect(liveBusFires).toBe(0);
  });

  it('CONTROL: the same verb submitted for real mutates log, tags, and fires the live bus', () => {
    const { engine, call, hero } = boot();
    const rngBefore = engine.store.rng.getState();
    let liveBusFires = 0;
    engine.store.events.onAny(() => {
      liveBusFires += 1;
      engine.store.rng.next();
    });

    const reply = call(METHODS.SUBMIT_ACTION, { verb: 'brand' });
    expect(reply?.error).toBeUndefined();
    expect(engine.getActionLog().length).toBeGreaterThan(0);
    expect(hero.tags).toContain('previewed');
    expect(liveBusFires).toBeGreaterThan(0);
    expect(engine.store.rng.getState()).not.toBe(rngBefore);
  });
});
