import { describe, it, expect } from 'vitest';
import { createDefaultReplayProducer, type EngineConstructor } from './replay-producer.js';
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
});
