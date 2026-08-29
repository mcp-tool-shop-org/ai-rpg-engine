// client.test.ts — the official client must treat hashes as consequential.
//
// Snapshot is the documented resync path; a hasher that never runs there is how
// a stale mirror goes unnoticed. capabilities.hashes=false is the off switch.

import { describe, it, expect } from 'vitest';
import { SidecarClient } from './client.js';
import { METHODS, NOTIFICATIONS, type RpcMessage, type StatePatch } from './protocol.js';
import { snapshotDelta, stateHash } from './serializer.js';
import type { WorldState } from '@ai-rpg-engine/core';

const world = {
  locationId: 'chapel',
  playerId: 'hero',
  entities: {},
  zones: {},
  eventLog: [],
} as unknown as WorldState;

function loopback(hashState?: (state: unknown) => string): {
  client: SidecarClient;
  replyWith: (handler: (msg: RpcMessage) => RpcMessage | void) => void;
} {
  let handler: ((msg: RpcMessage) => RpcMessage | void) | undefined;
  const client = new SidecarClient((msg) => {
    const reply = handler?.(msg);
    if (reply) client.handle(reply);
  }, hashState);
  return {
    client,
    replyWith(h) {
      handler = h;
    },
  };
}

function initOk(msg: RpcMessage): RpcMessage {
  return {
    jsonrpc: '2.0',
    id: msg.id,
    result: {
      serverName: 'test',
      engineVersion: '3.8.0-test',
      capabilities: { preview: true, hashes: true, replay: true, snapshot: true },
      tick: 0,
    },
  };
}

describe('F-21521435 — hashes are consequential on the official client', () => {
  it('defaults to the package hasher and reports staleness from snapshot() on mismatch', async () => {
    const { client, replyWith } = loopback(() => 'not-the-real-hash');
    replyWith((msg) => {
      if (msg.method === METHODS.INITIALIZE) return initOk(msg);
      if (msg.method === METHODS.SNAPSHOT) {
        return {
          jsonrpc: '2.0',
          id: msg.id,
          result: { tick: 3, hash: 'server-hash', delta: snapshotDelta(world) },
        };
      }
      return undefined;
    });

    const init = await client.initialize();
    expect(init.capabilities.hashes).toBe(true);
    await client.snapshot();
    expect(client.stalenessReports).toEqual([
      { tick: 3, expected: 'server-hash', actual: 'not-the-real-hash' },
    ]);
  });

  it('an honest default hasher agrees with snapshot() and records nothing', async () => {
    const { client, replyWith } = loopback();
    const delta = snapshotDelta(world);
    const hash = stateHash(world);
    replyWith((msg) => {
      if (msg.method === METHODS.INITIALIZE) return initOk(msg);
      if (msg.method === METHODS.SNAPSHOT) {
        return { jsonrpc: '2.0', id: msg.id, result: { tick: 0, hash, delta } };
      }
      return undefined;
    });

    await client.initialize();
    await client.snapshot();
    expect(client.stalenessReports).toEqual([]);
    expect(stateHash(client.mirroredState as WorldState)).toBe(hash);
  });

  it('honors capabilities.hashes=false: snapshot mismatch is not a staleness report', async () => {
    const { client, replyWith } = loopback(() => 'nope');
    replyWith((msg) => {
      if (msg.method === METHODS.INITIALIZE) return initOk(msg);
      if (msg.method === METHODS.SNAPSHOT) {
        return {
          jsonrpc: '2.0',
          id: msg.id,
          result: { tick: 1, hash: 'server-hash', delta: snapshotDelta(world) },
        };
      }
      return undefined;
    });

    await client.initialize({ hashes: false, notifications: true });
    await client.snapshot();
    expect(client.stalenessReports).toEqual([]);
  });

  it('when notifications are off, submitAction result.delta updates the mirror', async () => {
    const { client, replyWith } = loopback();
    const delta: StatePatch[] = [{ op: 'set', path: ['locationId'], value: 'elsewhere' }];
    replyWith((msg) => {
      if (msg.method === METHODS.INITIALIZE) return initOk(msg);
      if (msg.method === METHODS.SUBMIT_ACTION) {
        return {
          jsonrpc: '2.0',
          id: msg.id,
          result: { tick: 2, hash: 'h', events: [], delta },
        };
      }
      return undefined;
    });

    await client.initialize({ hashes: false, notifications: false });
    await client.request(METHODS.SUBMIT_ACTION, { verb: 'look' });
    expect(client.mirroredState).toMatchObject({ locationId: 'elsewhere' });

    // A TICK the client said it cannot take must not also apply (double-patch).
    client.handle({
      jsonrpc: '2.0',
      method: NOTIFICATIONS.TICK,
      params: { tick: 2, hash: 'h', events: [], delta: [{ op: 'set', path: ['leaked'], value: true }] },
    });
    expect(client.receivedTicks).toEqual([]);
    expect(client.mirroredState).not.toMatchObject({ leaked: true });
  });
});
