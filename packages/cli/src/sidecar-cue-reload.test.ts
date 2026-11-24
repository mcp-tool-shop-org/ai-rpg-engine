// sidecar-cue-reload.test.ts — the --shock cue re-arms when a LOAD rewinds the world.
//
// Found 2026-10-02 by ai-playtest driving ai-rpg-stage through its engine bridge
// (mcp-tool-shop-org/ai-rpg-stage#15). The bridge resets between seats with a save
// taken at the start and a LOAD of it. The cue counted rounds in a process-local
// variable that no save carried, so after seat 1 advanced past the cue round, every
// later seat loaded an earlier world while the counter stayed past the cue: in a
// 4-seat panel only seat 1 ever saw the shock.
//
// The transport is mocked to capture the serverOptions sidecar-command builds, and a
// REAL SidecarServer is constructed from them, so SAVE and LOAD run the production
// path (Engine.serialize / restoreFromSerialized) rather than a test double. This
// file mocks @ai-rpg-engine/sidecar for the same reason sidecar-pack-intake.test.ts
// does, and stays separate from c4-content-intake.test.ts for the same reason.

import { describe, it, expect, vi } from 'vitest';
import type { Engine } from '@ai-rpg-engine/core';

const startStdioServer = vi.fn();

vi.mock('@ai-rpg-engine/sidecar', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ai-rpg-engine/sidecar')>();
  return {
    ...actual,
    startStdioServer: (...args: unknown[]) => startStdioServer(...args),
  };
});

import { SidecarServer, METHODS, type RpcMessage, type SidecarServerOptions } from '@ai-rpg-engine/sidecar';
import { runSidecar, CUE_CLOCK_KEY } from './sidecar-command.js';

const HOST_PACK = 'chapel-threshold';
const DISTRICT = 'chapel-grounds';
const CUE = `${DISTRICT}:stability:-25@2`;

async function boot(args: string[]) {
  startStdioServer.mockClear();
  const lines: string[] = [];
  const code = await runSidecar([HOST_PACK, '--seed', '1', ...args], { error: (m) => lines.push(m) });
  expect(code).toBeNull();
  const options = startStdioServer.mock.calls[0]![0] as SidecarServerOptions;
  const sent: RpcMessage[] = [];
  const server = new SidecarServer(options, (m) => sent.push(m));
  let nextId = 1;
  const call = (method: string, params: Record<string, unknown> = {}): Record<string, unknown> => {
    const id = nextId++;
    server.handle({ jsonrpc: '2.0', id, method, params });
    const reply = sent.find((m) => m.id === id);
    if (!reply || reply.error) throw new Error(`${method} failed: ${JSON.stringify(reply?.error)}`);
    return reply.result as Record<string, unknown>;
  };
  call(METHODS.INITIALIZE);
  const engine: Engine = options.engine;
  const stability = (): number =>
    (engine.world.modules['district-core'] as { districts: Record<string, { stability: number }> })
      .districts[DISTRICT]!.stability;
  const cueLines = (): string[] => lines.filter((l) => l.startsWith('[sidecar] cue:'));
  return { engine, call, stability, cueLines };
}

describe('sidecar --shock across save/load', () => {
  it('a LOAD to before the cue round re-arms the cue, and it fires again', async () => {
    const { call, stability, cueLines } = await boot(['--shock', CUE]);
    const baseline = stability();
    const shocked = Math.max(0, baseline - 25);
    expect(shocked, 'the fixture district must be able to move').not.toBe(baseline);

    const start = call(METHODS.SAVE).serialized as string;

    call(METHODS.ADVANCE, { rounds: 3 });
    expect(cueLines()).toHaveLength(1);
    expect(stability()).toBe(shocked);

    call(METHODS.LOAD, { serialized: start });
    expect(stability(), 'LOAD restores the unshocked district').toBe(baseline);

    call(METHODS.ADVANCE, { rounds: 3 });
    expect(cueLines(), 'the cue must fire again after rewinding past it').toHaveLength(2);
    expect(stability()).toBe(shocked);
  });

  it('a LOAD of a world already past the cue does NOT fire it again', async () => {
    const { call, stability, cueLines } = await boot(['--shock', CUE]);
    call(METHODS.ADVANCE, { rounds: 3 });
    const after = call(METHODS.SAVE).serialized as string;
    const shocked = stability();

    call(METHODS.ADVANCE, { rounds: 2 });
    call(METHODS.LOAD, { serialized: after });
    call(METHODS.ADVANCE, { rounds: 3 });

    expect(cueLines()).toHaveLength(1);
    expect(stability()).toBe(shocked);
  });

  it('the cue still fires BEFORE the round it names', async () => {
    const { call, stability, cueLines } = await boot(['--shock', CUE]);
    const baseline = stability();
    call(METHODS.ADVANCE, { rounds: 1 });
    expect(cueLines()).toHaveLength(0);
    expect(stability()).toBe(baseline);
    call(METHODS.ADVANCE, { rounds: 1 });
    expect(cueLines()).toHaveLength(1);
  });

  it('without --shock no clock is written into the world', async () => {
    const { engine, call } = await boot([]);
    call(METHODS.ADVANCE, { rounds: 3 });
    expect(engine.world.modules[CUE_CLOCK_KEY]).toBeUndefined();
  });
});
