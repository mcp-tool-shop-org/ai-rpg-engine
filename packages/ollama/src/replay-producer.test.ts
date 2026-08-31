import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDefaultReplayProducer, loadProjectPack, type EngineConstructor } from './replay-producer.js';
import { runExperiment } from './chat-experiments.js';

describe('createDefaultReplayProducer (F-fc88ce5e)', () => {
  it('runs an injected Engine and returns parseable replay JSON', () => {
    const FakeEngine = function FakeEngine(this: {
      store: { state: { globals: Record<string, string | number | boolean> } };
      advanceRound: (n?: number) => unknown[];
      queryEvents: () => Array<{ tick: number; type: string }>;
    }, options: { seed?: number }) {
      this.store = { state: { globals: { seed: options.seed ?? 0 } } };
      this.advanceRound = () => [];
      this.queryEvents = () => [{ tick: 0, type: 'round.advanced' }];
    } as unknown as EngineConstructor;

    const producer = createDefaultReplayProducer({ Engine: FakeEngine });
    const replay = producer(7, { alertGain: 0.4 }, 5);
    const parsed = JSON.parse(replay) as Array<{ tick: number }>;
    expect(parsed).toHaveLength(5);
    expect(parsed[0].tick).toBe(0);
  });

  it('is injectable: runExperiment uses the producer it is given', () => {
    const producer = createDefaultReplayProducer({
      Engine: function Stub(this: {
        store: { state: { globals: Record<string, string | number | boolean> } };
        advanceRound: () => unknown[];
        queryEvents: () => [];
      }) {
        this.store = { state: { globals: {} } };
        this.advanceRound = () => [];
        this.queryEvents = () => [];
      } as unknown as EngineConstructor,
    });
    const summary = runExperiment({ id: 't', label: 't', runs: 3, seedStart: 1, tickLimit: 4 }, producer);
    expect(summary.completedRuns).toBe(3);
    expect(summary.failedRuns).toBe(0);
    expect(summary.runs).toHaveLength(3);
  });

  it('falls back to synthetic ticks when Engine construction throws', () => {
    const Boom = function Boom() {
      throw new Error('no engine');
    } as unknown as EngineConstructor;
    const producer = createDefaultReplayProducer({ Engine: Boom });
    const replay = producer(1, undefined, 3);
    const parsed = JSON.parse(replay) as Array<{ tick: number }>;
    expect(parsed).toHaveLength(3);
  });

  it('derives metrics from store globals instead of the synthetic seed formula', () => {
    const FakeEngine = function FakeEngine(this: {
      store: { state: { globals: Record<string, string | number | boolean> } };
      advanceRound: () => unknown[];
      queryEvents: () => Array<{ tick: number; type: string }>;
    }, options: { seed?: number }) {
      this.store = { state: { globals: { seed: options.seed ?? 0 } } };
      this.advanceRound = () => [];
      this.queryEvents = () => [];
    } as unknown as EngineConstructor;

    const producer = createDefaultReplayProducer({ Engine: FakeEngine });
    const parsed = JSON.parse(producer(7, { alertGain: 0.4 }, 5)) as Array<{
      tick: number;
      alertPressure: number;
    }>;
    // Synthetic formula at t=0, seed 7, alertGain 0.4 was 0.45. Derived globals stay 0.4.
    expect(parsed[0].alertPressure).toBe(0.4);
    expect(parsed[0].alertPressure).not.toBeCloseTo(0.45);
  });

  it('loads a project pack.json and applies it before ticking', () => {
    const root = mkdtempSync(join(tmpdir(), 'replay-pack-'));
    mkdirSync(join(root, 'content'));
    writeFileSync(join(root, 'content', 'pack.json'), JSON.stringify({
      entities: [{ id: 'chapel_guard', type: 'npc', name: 'Guard' }],
      zones: [{ id: 'nave', name: 'Nave' }],
    }));
    let applied: unknown = null;
    const FakeEngine = function FakeEngine(this: {
      store: { state: { globals: Record<string, string | number | boolean> } };
      advanceRound: () => unknown[];
      queryEvents: () => [];
    }) {
      this.store = { state: { globals: {} } };
      this.advanceRound = () => [];
      this.queryEvents = () => [];
    } as unknown as EngineConstructor;

    const producer = createDefaultReplayProducer({
      Engine: FakeEngine,
      projectRoot: root,
      applyContentPack: (_engine, pack) => { applied = pack; },
    });
    producer(1, undefined, 2);
    expect(applied).toEqual(expect.objectContaining({
      entities: [expect.objectContaining({ id: 'chapel_guard' })],
    }));
    expect(loadProjectPack(root)).toEqual(expect.objectContaining({
      zones: [expect.objectContaining({ id: 'nave' })],
    }));
    rmSync(root, { recursive: true, force: true });
  });
});
