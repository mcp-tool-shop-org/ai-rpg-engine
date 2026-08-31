// server.test.ts — protocol handler pins for the wire seam.
//
// The live engine is a real createTestEngine (not a transport stub) so preview
// isolation and actionLog/rng pins can fail for the reasons the findings name.

import { describe, it, expect } from 'vitest';
import { createTestEngine, type EngineModule, type EntityState, type WorldState } from '@ai-rpg-engine/core';
import { SidecarClient } from './client.js';
import { SidecarServer, attachedServerCount } from './server.js';
import { ERROR_CODES, METHODS, NOTIFICATIONS, type RpcMessage } from './protocol.js';
import { encodeMessage, MessageTooLargeError, MAX_MESSAGE_BYTES } from './framing.js';
import { applyPatches, canonicalStateHash, stateHash } from './serializer.js';
import type { StatePatch } from './protocol.js';

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
    // submitAction/shutdown may push a notification after the RPC reply;
    // pick the matching id so tests don't read sim/tick or sim/closing.
    for (let i = sent.length - 1; i >= 0; i--) {
      if (sent[i]?.id === id) return sent[i];
    }
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
    const err = errorOf(sent.find((m) => m.id === 2));
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

describe('F-aca8c299 — shutdown is sim-local, not session-local', () => {
  it('two sessions: A shutdown, B submitAction is SESSION_CLOSED and the live hero is untagged', () => {
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
    const sentA: RpcMessage[] = [];
    const sentB: RpcMessage[] = [];
    const a = new SidecarServer({ engine, engineVersion: '3.8.0-test' }, (m) => sentA.push(m));
    const b = new SidecarServer({ engine, engineVersion: '3.8.0-test' }, (m) => sentB.push(m));
    a.handle({ jsonrpc: '2.0', id: 1, method: METHODS.INITIALIZE, params: {} });
    b.handle({ jsonrpc: '2.0', id: 1, method: METHODS.INITIALIZE, params: {} });

    a.handle({ jsonrpc: '2.0', id: 2, method: METHODS.SHUTDOWN, params: {} });
    expect(sentA.find((m) => m.id === 2)?.result).toEqual({ ok: true });
    expect(a.isClosed).toBe(true);
    expect(b.isClosed).toBe(true);
    expect(sentA.some((m) => m.method === NOTIFICATIONS.CLOSING)).toBe(true);
    expect(sentB.some((m) => m.method === NOTIFICATIONS.CLOSING)).toBe(true);

    const hero = engine.world.entities['hero']!;
    const tagsBefore = [...hero.tags];
    const logBefore = engine.world.eventLog.length;
    const actionsBefore = engine.getActionLog().length;
    b.handle({ jsonrpc: '2.0', id: 3, method: METHODS.SUBMIT_ACTION, params: { verb: 'brand' } });
    const err = errorOf(sentB.find((m) => m.id === 3));
    expect(err.code).toBe(ERROR_CODES.SESSION_CLOSED);
    expect(err.message).toMatch(/closed/i);
    expect(hero.tags).toEqual(tagsBefore);
    expect(hero.tags).not.toContain('previewed');
    expect(engine.world.eventLog.length).toBe(logBefore);
    expect(engine.getActionLog().length).toBe(actionsBefore);
  });

  it('CONTROL: a second SidecarServer wrapping a different Engine stays open', () => {
    const { call: shutdownA, server: serverA } = boot();
    const { call: callB, server: serverB, hero } = boot();
    shutdownA(METHODS.SHUTDOWN, {});
    expect(serverA.isClosed).toBe(true);
    expect(serverB.isClosed).toBe(false);
    const ok = callB(METHODS.SUBMIT_ACTION, { verb: 'brand' });
    expect(ok?.error).toBeUndefined();
    expect(hero.tags).toContain('previewed');
  });

  it('dualLoopback B receives sim/closing and cannot spawn after A shutdown', async () => {
    const { a, b, engine } = dualLoopback(true);
    await a.client.initialize();
    await b.client.initialize();

    await a.client.request(METHODS.SHUTDOWN, {});
    expect(a.server.isClosed).toBe(true);
    expect(b.server.isClosed).toBe(true);
    expect(b.client.isClosed).toBe(true);

    const hadNpc = Boolean(engine.world.entities['npc-1']);
    await expect(b.client.request(METHODS.SUBMIT_ACTION, { verb: 'spawn-npc' })).rejects.toMatchObject({
      code: ERROR_CODES.SESSION_CLOSED,
    });
    expect(Boolean(engine.world.entities['npc-1'])).toBe(hadNpc);
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

function npcEntity(): EntityState {
  return {
    id: 'npc-1',
    blueprintId: 'npc',
    type: 'npc',
    name: 'Witness',
    tags: [],
    stats: {},
    resources: {},
    statuses: [],
    zoneId: 'room',
  };
}

function spawnModule(): EngineModule {
  return {
    id: 'spawn',
    version: '1.0.0',
    register(ctx) {
      ctx.actions.registerVerb('spawn-npc', (_action, world) => {
        world.entities['npc-1'] = npcEntity();
        return [
          {
            id: 'evt-spawn-npc',
            tick: world.meta.tick,
            type: 'probe.spawned',
            actorId: 'hero',
            payload: { id: 'npc-1' },
          },
        ];
      });
      ctx.actions.registerVerb('despawn-npc', (_action, world) => {
        delete world.entities['npc-1'];
        return [
          {
            id: 'evt-despawn-npc',
            tick: world.meta.tick,
            type: 'probe.despawned',
            actorId: 'hero',
            payload: { id: 'npc-1' },
          },
        ];
      });
    },
  };
}

function dualLoopback(fanout: boolean): {
  engine: ReturnType<typeof createTestEngine>;
  a: { server: SidecarServer; client: SidecarClient };
  b: { server: SidecarServer; client: SidecarClient };
} {
  const engine = createTestEngine({
    modules: [spawnModule()],
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

  const servers: SidecarServer[] = [];
  const notifyPeers = (origin: SidecarServer) => {
    if (!fanout) return;
    for (const peer of servers) {
      if (peer !== origin) peer.replicatePeerCommit();
    }
  };

  const pair = () => {
    // eslint-disable-next-line prefer-const -- assigned once; closes over construction
    let client!: SidecarClient;
    // eslint-disable-next-line prefer-const -- assigned once; closes over construction
    let server!: SidecarServer;
    server = new SidecarServer(
      { engine, engineVersion: '3.8.0-test', onWorldCommitted: () => notifyPeers(server) },
      (m) => client.handle(m),
    );
    client = new SidecarClient((msg) => server.handle(msg));
    servers.push(server);
    return { server, client };
  };

  return { engine, a: pair(), b: pair() };
}

function mirroredEntities(client: SidecarClient): Record<string, unknown> {
  const state = client.mirroredState as WorldState;
  return (state.entities ?? {}) as Record<string, unknown>;
}

describe('F-98b60cd0 — SNAPSHOT rebases lastState; 1:N sessions share ticks', () => {
  it('RED: B snapshots after A spawned, then despawns — B\'s mirror must not keep a ghost', async () => {
    // No fan-out: this is the documented resync path, which used to leave
    // lastState at construct-time so the despawn diff omitted the remove.
    const { a, b, engine } = dualLoopback(false);
    await a.client.initialize();
    await b.client.initialize();

    await a.client.request(METHODS.SUBMIT_ACTION, { verb: 'spawn-npc' });
    expect(engine.world.entities['npc-1']).toBeTruthy();
    expect(b.client.receivedTicks).toEqual([]);

    await b.client.snapshot();
    expect(mirroredEntities(b.client)['npc-1']).toBeTruthy();

    await b.client.request(METHODS.SUBMIT_ACTION, { verb: 'despawn-npc' });
    expect(engine.world.entities['npc-1']).toBeUndefined();
    expect(mirroredEntities(b.client)['npc-1']).toBeUndefined();
    expect(b.client.stalenessReports).toEqual([]);
  });

  it('an idle B receives A\'s sim/tick so the spawned entity lands without a snapshot', async () => {
    const { a, b } = dualLoopback(true);
    await a.client.initialize();
    await b.client.initialize();
    await a.client.snapshot();
    await b.client.snapshot();

    await a.client.request(METHODS.SUBMIT_ACTION, { verb: 'spawn-npc' });
    expect(b.client.receivedTicks.some((t) => t.delta.some((p) => p.path.includes('npc-1')))).toBe(true);
    expect(mirroredEntities(b.client)['npc-1']).toBeTruthy();
    expect(b.client.stalenessReports).toEqual([]);
  });
});

describe('F-c5d12205 — initialize and nested parameters are typed, not coerced', () => {
  it('initialize {capabilities:1} is INVALID_PARAMS', () => {
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
    server.handle({ jsonrpc: '2.0', id: 1, method: METHODS.INITIALIZE, params: { capabilities: 1 } });
    const err = errorOf(sent.find((m) => m.id === 1));
    expect(err.code).toBe(ERROR_CODES.INVALID_PARAMS);
    expect(err.message).toMatch(/capabilities/);
    expect(server.negotiatedClientCapabilities).toEqual({});
  });

  it('submitAction parameters:{n:{}} is INVALID_PARAMS and the verb does not fire', () => {
    const { engine, call } = boot();
    const logBefore = engine.world.eventLog.length;
    const actionsBefore = engine.getActionLog().length;
    const err = errorOf(call(METHODS.SUBMIT_ACTION, { verb: 'brand', parameters: { n: {} } }));
    expect(err.code).toBe(ERROR_CODES.INVALID_PARAMS);
    expect(err.message).toMatch(/parameters\.n/);
    expect(engine.world.eventLog.length).toBe(logBefore);
    expect(engine.getActionLog().length).toBe(actionsBefore);
  });

  it('CONTROL: initialize keeps clientName for logs; a boolean capability is stored', () => {
    const { engine } = boot();
    const sent: RpcMessage[] = [];
    const server = new SidecarServer({ engine, engineVersion: '3.8.0-test' }, (m) => sent.push(m));
    server.handle({
      jsonrpc: '2.0',
      id: 1,
      method: METHODS.INITIALIZE,
      params: { clientName: 'godot-stage', clientVersion: '4.7', capabilities: { hashes: true } },
    });
    expect(sent.find((m) => m.id === 1)?.error).toBeUndefined();
    expect(server.sessionClientName).toBe('godot-stage');
    expect(server.sessionClientVersion).toBe('4.7');
    expect(server.negotiatedClientCapabilities).toEqual({ hashes: true });
  });
});

describe('F-d76f8f25 — a known method without an id must not mutate', () => {
  it('submitAction without id does not append eventLog / actionLog and does not push sim/tick', () => {
    const { engine, server, sent, call } = boot();
    const logBefore = engine.world.eventLog.length;
    const actionsBefore = engine.getActionLog().length;
    const ticksBefore = sent.filter((m) => m.method === NOTIFICATIONS.TICK).length;
    server.handle({ jsonrpc: '2.0', method: METHODS.SUBMIT_ACTION, params: { verb: 'brand' } });
    expect(engine.world.eventLog.length).toBe(logBefore);
    expect(engine.getActionLog().length).toBe(actionsBefore);
    expect(sent.filter((m) => m.method === NOTIFICATIONS.TICK).length).toBe(ticksBefore);

    call(METHODS.SNAPSHOT, {});
    const ok = call(METHODS.SUBMIT_ACTION, { verb: 'brand' });
    expect(ok?.error).toBeUndefined();
    expect(engine.getActionLog().length).toBeGreaterThan(actionsBefore);
    expect(sent.some((m) => m.method === NOTIFICATIONS.TICK)).toBe(true);
  });

  it('shutdown without an id still stops the sim (fire-and-forget)', () => {
    const { server, call, engine } = boot();
    server.handle({ jsonrpc: '2.0', method: METHODS.SHUTDOWN, params: {} });
    expect(server.isClosed).toBe(true);
    const logBefore = engine.world.eventLog.length;
    const err = errorOf(call(METHODS.SUBMIT_ACTION, { verb: 'brand' }));
    expect(err.code).toBe(ERROR_CODES.SESSION_CLOSED);
    expect(engine.world.eventLog.length).toBe(logBefore);
  });
});

describe('F-f64330ad — SimGate unregisters on detach so reconnect cannot leak', () => {
  it('a loop of construct+detach against one Engine does not retain N lastState clones', () => {
    const { engine } = boot();
    expect(attachedServerCount(engine)).toBe(1);
    for (let i = 0; i < 8; i++) {
      const extra = new SidecarServer({ engine, engineVersion: '3.8.0-test' }, () => undefined);
      expect(attachedServerCount(engine)).toBe(2);
      extra.detach();
      expect(attachedServerCount(engine)).toBe(1);
    }
    expect(attachedServerCount(engine)).toBe(1);
  });

  it('SHUTDOWN fan-out detaches every session sharing the Engine', () => {
    const { engine, call, server } = boot();
    const sibling = new SidecarServer({ engine, engineVersion: '3.8.0-test' }, () => undefined);
    expect(attachedServerCount(engine)).toBe(2);
    call(METHODS.SHUTDOWN, {});
    expect(server.isClosed).toBe(true);
    expect(sibling.isClosed).toBe(true);
    expect(attachedServerCount(engine)).toBe(0);
  });
});

describe('F-8b1563f6 — an oversized snapshot fails the RPC rather than writing the frame', () => {
  it('a >16 MiB snapshot is SNAPSHOT_TOO_LARGE, not a frame the reader would refuse', () => {
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
    (engine.world as { blob?: string }).blob = 'x'.repeat(MAX_MESSAGE_BYTES);
    const sent: RpcMessage[] = [];
    const server = new SidecarServer(
      { engine, engineVersion: '3.8.0-test' },
      (m) => {
        encodeMessage(m);
        sent.push(m);
      },
    );
    server.handle({ jsonrpc: '2.0', id: 1, method: METHODS.INITIALIZE, params: {} });
    server.handle({ jsonrpc: '2.0', id: 2, method: METHODS.SNAPSHOT, params: {} });
    const err = errorOf(sent.find((m) => m.id === 2));
    expect(err.code).toBe(ERROR_CODES.SNAPSHOT_TOO_LARGE);
    expect(err.message).toMatch(/ceiling/i);
    expect(() => encodeMessage(sent.find((m) => m.id === 2)!)).not.toThrow(MessageTooLargeError);
    const errObj = sent.find((m) => m.id === 2)?.error as { data?: { byteLength: number; retry?: { omitEventLog?: boolean } } };
    expect(errObj.data?.byteLength).toBeGreaterThan(MAX_MESSAGE_BYTES);
    expect(errObj.data?.retry?.omitEventLog).toBe(true);
    expect(err.message).toMatch(/omitEventLog/);
  }, 30000);
});

describe('F-071522b2 — snapshot epoch: no incremental tick onto an empty mirror', () => {
  it('B initialize()s, A submitAction before B snapshot(): B is {} or complete, never partial', async () => {
    const { a, b, engine } = dualLoopback(true);
    await a.client.initialize();
    await b.client.initialize();
    await a.client.snapshot();

    await a.client.request(METHODS.SUBMIT_ACTION, { verb: 'spawn-npc' });
    expect(engine.world.entities['npc-1']).toBeTruthy();
    // Withheld until SNAPSHOT: empty, not a half-applied entity set.
    expect(b.client.mirroredState).toEqual({});
    expect(mirroredEntities(b.client)['npc-1']).toBeUndefined();
    expect(mirroredEntities(b.client)['hero']).toBeUndefined();

    await b.client.snapshot();
    expect(mirroredEntities(b.client)['npc-1']).toBeTruthy();
    expect(mirroredEntities(b.client)['hero']).toBeTruthy();
    expect(b.client.stalenessReports).toEqual([]);
  });
});

describe('F-bb72a8ab — observer sessions cannot write; they still receive ticks', () => {
  it('maxConnections 2, B writes:false: B submitAction is refused, A commits, B gets the tick', async () => {
    const { a, b, engine } = dualLoopback(true);
    await a.client.initialize({ notifications: true, hashes: true, writes: true });
    await b.client.initialize({ notifications: true, hashes: true, writes: false });
    expect(a.server.sessionRole).toBe('writer');
    expect(b.server.sessionRole).toBe('observer');
    expect(b.server.capabilities.writes).toBe(false);
    await a.client.snapshot();
    await b.client.snapshot();

    await expect(b.client.request(METHODS.SUBMIT_ACTION, { verb: 'spawn-npc' })).rejects.toMatchObject({
      code: ERROR_CODES.CAPABILITY_UNAVAILABLE,
    });
    expect(engine.world.entities['npc-1']).toBeUndefined();

    await a.client.request(METHODS.SUBMIT_ACTION, { verb: 'spawn-npc' });
    expect(engine.world.entities['npc-1']).toBeTruthy();
    expect(mirroredEntities(b.client)['npc-1']).toBeTruthy();
    expect(b.client.stalenessReports).toEqual([]);
  });
});

describe('F-3f53c837 — canonicalHashes is negotiated and additive', () => {
  it('canonicalHashes:false still only sees hash; true gets matching canonicalHash', async () => {
    const { a, b } = dualLoopback(false);
    await a.client.initialize({ notifications: true, hashes: true, canonicalHashes: false });
    await b.client.initialize({ notifications: true, hashes: true, canonicalHashes: true });
    const jsSnap = await a.client.snapshot();
    expect(jsSnap).not.toHaveProperty('canonicalHash');
    expect(jsSnap.hash).toBe(stateHash(a.client.mirroredState as WorldState));

    const canonSnap = await b.client.snapshot();
    expect(canonSnap.hash).toBe(stateHash(b.client.mirroredState as WorldState));
    expect(canonSnap.canonicalHash).toBe(canonicalStateHash(b.client.mirroredState));
    expect(canonSnap.canonicalHash).toMatch(/^[0-9a-f]{32}$/);
    expect(b.client.stalenessReports).toEqual([]);
  });
});

describe('F-decfe897 — omitEventLog snapshot is hash-matching and later ticks omit the log', () => {
  it('a world whose eventLog alone exceeds the ceiling still snapshots with omitEventLog', () => {
    const { engine } = boot();
    engine.world.eventLog.push({
      id: 'huge-log',
      tick: 0,
      type: 'probe.blob',
      payload: { blob: 'x'.repeat(MAX_MESSAGE_BYTES) },
    } as never);
    const sent: RpcMessage[] = [];
    const server = new SidecarServer(
      { engine, engineVersion: '3.8.0-test' },
      (m) => {
        encodeMessage(m);
        sent.push(m);
      },
    );
    server.handle({ jsonrpc: '2.0', id: 1, method: METHODS.INITIALIZE, params: {} });
    server.handle({ jsonrpc: '2.0', id: 2, method: METHODS.SNAPSHOT, params: {} });
    const fullErr = errorOf(sent.find((m) => m.id === 2));
    expect(fullErr.code).toBe(ERROR_CODES.SNAPSHOT_TOO_LARGE);
    expect(fullErr.message).toMatch(/omitEventLog/);
    const data = (sent.find((m) => m.id === 2)?.error as { data?: { byteLength: number } }).data;
    expect(data?.byteLength).toBeGreaterThan(MAX_MESSAGE_BYTES);

    server.handle({ jsonrpc: '2.0', id: 3, method: METHODS.SNAPSHOT, params: { omitEventLog: true } });
    const ok = sent.find((m) => m.id === 3);
    expect(ok?.error).toBeUndefined();
    const result = ok?.result as { hash: string; delta: readonly StatePatch[] };
    const mirrored = applyPatches({}, result.delta);
    expect(stateHash(mirrored)).toBe(result.hash);
    expect((mirrored as { eventLog?: unknown }).eventLog).toBeUndefined();
  }, 30000);

  it('a subsequent incremental tick does not assume the client has the omitted log', async () => {
    const { a } = dualLoopback(false);
    await a.client.initialize();
    await a.client.snapshot({ omitEventLog: true });
    expect((a.client.mirroredState as { eventLog?: unknown }).eventLog).toBeUndefined();

    await a.client.request(METHODS.SUBMIT_ACTION, { verb: 'spawn-npc' });
    const tick = a.client.receivedTicks.at(-1);
    expect(tick).toBeTruthy();
    expect((tick?.delta ?? []).filter((p) => p.path[0] === 'eventLog')).toEqual([]);
    expect(mirroredEntities(a.client)['npc-1']).toBeTruthy();
    expect((a.client.mirroredState as { eventLog?: unknown }).eventLog).toBeUndefined();
    expect(a.client.stalenessReports).toEqual([]);
  });
});

function catalogModule(): EngineModule {
  return {
    id: 'catalog',
    version: '1.0.0',
    register(ctx) {
      ctx.actions.registerVerb('echo', (action): { id: string; tick: number; type: string; payload: Record<string, unknown> }[] => [
        { id: '', tick: action.issuedAtTick, type: 'probe.echo', payload: {} },
      ]);
      ctx.actions.registerVerb('attack', (action): { id: string; tick: number; type: string; payload: Record<string, unknown> }[] => [
        { id: '', tick: action.issuedAtTick, type: 'combat.hit', payload: { target: action.targetIds?.[0] } },
      ]);
      ctx.actions.registerExpander('attack', (_verb, _actor, world) =>
        Object.values(world.entities)
          .filter((e) => e.tags.includes('hostile'))
          .map((e) => ({ targetIds: [e.id], label: e.name })),
      );
      ctx.ui.addChannelFilter('objective', (event) => {
        if (event.visibility === 'hidden') return null;
        if (event.payload && typeof event.payload === 'object' && 'secret' in event.payload) {
          return { ...event, payload: { ...event.payload, secret: '[redacted]' } };
        }
        return event;
      });
    },
  };
}

function catalogBoot() {
  const engine = createTestEngine({
    modules: [catalogModule()],
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
      {
        id: 'goblin',
        blueprintId: 'npc',
        type: 'npc',
        name: 'Goblin',
        tags: ['hostile'],
        stats: {},
        resources: {},
        statuses: [],
        zoneId: 'room',
      },
    ],
    zones: [{ id: 'room', roomId: 'room', name: 'Room', tags: [], neighbors: [] }],
  });
  engine.dispatcher.registerValidator((action) =>
    action.verb === 'attack' && (!action.targetIds || action.targetIds.length === 0)
      ? { valid: false, reason: 'no target' }
      : { valid: true },
  );
  const sent: RpcMessage[] = [];
  const server = new SidecarServer({ engine, engineVersion: '3.8.0-test' }, (m) => sent.push(m));
  const call = (method: string, params: Record<string, unknown> = {}, id = sent.length + 1) => {
    server.handle({ jsonrpc: '2.0', id, method, params });
    for (let i = sent.length - 1; i >= 0; i--) {
      if (sent[i]?.id === id) return sent[i];
    }
    return sent.at(-1);
  };
  return { engine, server, sent, call };
}

describe('F-71cddf22 — listActions wraps Engine.getAvailableActionsFor', () => {
  it('tick-0 catalog matches getAvailableActions and includes an expander row', () => {
    const { engine, call } = catalogBoot();
    call(METHODS.INITIALIZE, { capabilities: { listActions: true } });
    const reply = call(METHODS.LIST_ACTIONS, {});
    expect(reply?.error).toBeUndefined();
    const result = reply?.result as { actorId: string; actions: { verb: string; available: boolean; expansions?: { targetIds?: string[] }[] }[] };
    expect(result.actorId).toBe('hero');
    const passing = result.actions.filter((a) => a.available).map((a) => a.verb);
    expect(passing.sort()).toEqual([...engine.getAvailableActions()].sort());
    const attack = result.actions.find((a) => a.verb === 'attack');
    expect(attack?.available).toBe(true);
    expect(attack?.expansions?.some((e) => e.targetIds?.includes('goblin'))).toBe(true);
  });

  it('observers may call listActions', async () => {
    const { a, b } = dualLoopback(true);
    await a.client.initialize({ notifications: true, hashes: true, writes: true, listActions: true });
    await b.client.initialize({ notifications: true, hashes: true, writes: false, listActions: true });
    expect(b.server.capabilities.listActions).toBe(true);
    const listed = await b.client.listActions();
    expect(listed.actorId).toBe('hero');
    expect(Array.isArray(listed.actions)).toBe(true);
  });
});

describe('F-f62432fc — save/load round-trips Engine.serialize, not SNAPSHOT delta', () => {
  it('save → load keeps tick, canonicalHash, and the next submitAction id sequence', async () => {
    const { a, engine } = dualLoopback(false);
    await a.client.initialize({ notifications: true, hashes: true, canonicalHashes: true });
    await a.client.snapshot();
    await a.client.request(METHODS.SUBMIT_ACTION, { verb: 'spawn-npc' });
    const tickBefore = engine.store.tick;
    const hashBefore = canonicalStateHash(engine.world);
    const idsBefore = engine.world.eventLog.map((e) => e.id);

    const saved = await a.client.save();
    expect(saved.serialized).toContain('rngState');
    expect(saved.serialized).toContain('actionLog');
    expect(JSON.parse(saved.serialized).world.rngState).toEqual(expect.any(Number));

    await a.client.request(METHODS.SUBMIT_ACTION, { verb: 'despawn-npc' });
    expect(engine.world.entities['npc-1']).toBeUndefined();

    const loaded = await a.client.load(saved.serialized);
    expect(loaded.tick).toBe(tickBefore);
    expect(engine.store.tick).toBe(tickBefore);
    expect(canonicalStateHash(engine.world)).toBe(hashBefore);
    expect(loaded.canonicalHash).toBe(hashBefore);

    await a.client.request(METHODS.SUBMIT_ACTION, { verb: 'despawn-npc' });
    const newIds = engine.world.eventLog.map((e) => e.id).filter((id) => !idsBefore.includes(id));
    expect(newIds.every((id) => !idsBefore.includes(id))).toBe(true);
  });

  it('an omitEventLog client can still save a full store; observers cannot', async () => {
    const { a, b, engine } = dualLoopback(true);
    await a.client.initialize({ notifications: true, hashes: true, writes: true });
    await b.client.initialize({ notifications: true, hashes: true, writes: false });
    await a.client.snapshot({ omitEventLog: true });
    await b.client.snapshot({ omitEventLog: true });
    await a.client.request(METHODS.SUBMIT_ACTION, { verb: 'spawn-npc' });

    await expect(b.client.save()).rejects.toMatchObject({ code: ERROR_CODES.CAPABILITY_UNAVAILABLE });
    const saved = await a.client.save();
    expect(JSON.parse(saved.serialized).world.state.eventLog.length).toBeGreaterThan(0);
    expect(engine.world.entities['npc-1']).toBeTruthy();
  });
});

describe('F-b44675d2 — presentation-negotiated ticks drop hidden events; replay filters', () => {
  it('a hidden event is absent from a presentation tick and present on a raw observer tick', async () => {
    const { a, b, engine } = dualLoopback(true);
    engine.dispatcher.registerVerb('whisper', (action) => [
      {
        id: 'evt-hidden',
        tick: action.issuedAtTick,
        type: 'probe.secret',
        actorId: 'hero',
        payload: { secret: 'the-truth' },
        visibility: 'hidden',
        presentation: { channels: ['objective'] },
      },
    ]);
    await a.client.initialize({ notifications: true, hashes: true, presentation: true, writes: true });
    await b.client.initialize({ notifications: true, hashes: true, presentation: false, writes: false });
    expect(a.server.capabilities.presentation).toBe(true);
    await a.client.snapshot();
    await b.client.snapshot();

    await a.client.request(METHODS.SUBMIT_ACTION, { verb: 'whisper' });
    const viewTick = a.client.receivedTicks.at(-1);
    const overlayTick = b.client.receivedTicks.at(-1);
    expect(viewTick?.events.some((e) => e.id === 'evt-hidden' || e.type === 'probe.secret')).toBe(false);
    expect(overlayTick?.events.some((e) => e.id === 'evt-hidden' || e.type === 'probe.secret')).toBe(true);
  });

  it("replay typePrefix: 'combat.' returns only those types", () => {
    const { engine, call } = catalogBoot();
    call(METHODS.INITIALIZE, { capabilities: { presentation: true } });
    engine.store.emitEvent('combat.hit', { dmg: 1 }, { actorId: 'hero' });
    engine.store.emitEvent('probe.echo', { ok: true }, { actorId: 'hero' });
    engine.store.emitEvent('combat.miss', { dmg: 0 }, { actorId: 'hero' });
    const reply = call(METHODS.REPLAY, { typePrefix: 'combat.' });
    const events = (reply?.result as { events: { type: string }[] }).events;
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.type.startsWith('combat.'))).toBe(true);
  });
});

describe('F-bb72a8ab — N-writer serial queue (observers stay)', () => {
  it('two writers: B enqueued first still commits after A (sessionOrder, not arrival)', async () => {
    const { a, b } = dualLoopback(true);
    await a.client.initialize({ notifications: true, hashes: true, writes: true });
    await b.client.initialize({ notifications: true, hashes: true, writes: true });
    expect(a.server.sessionRole).toBe('writer');
    expect(b.server.sessionRole).toBe('writer');
    expect(a.server.sessionOrder).toBeLessThan(b.server.sessionOrder);

    const order: number[] = [];
    b.server.queueWrite(1, () => order.push(b.server.sessionOrder));
    a.server.queueWrite(1, () => order.push(a.server.sessionOrder));
    expect(order).toEqual([]);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(order).toEqual([a.server.sessionOrder, b.server.sessionOrder]);
  });
});

