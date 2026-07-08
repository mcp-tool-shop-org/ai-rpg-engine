// Rule-effects wiring — dogfood v2.5 finding C1 (HIGH).
//
// `rules.registerEffect` is public module API (RuleRegistry.registerEffect),
// and the v2.5 audit found `ModuleManager.applyEffects` had ZERO callers: a
// registered effect was stored and silently never executed, while rule
// *checks* were wired into dispatch. These tests are the meta-test for that
// vacuous mechanism: they register a real RuleEffect and assert it RUNS
// through the normal dispatch pipeline with deterministic ids/ordering.
//
// Meta-test mutation that must go RED: delete the
// `dispatcher.registerEffectApplier(...)` wiring in the Engine constructor
// (or the effect-applier loop in ActionDispatcher.dispatch) and
// core-c1-001/002/003 fail — exactly the zero-caller state this finding
// started from.

import { describe, it, expect } from 'vitest';
import { Engine } from './engine.js';
import type {
  EngineModule,
  EntityState,
  ActionIntent,
  ResolvedEvent,
} from './types.js';

const manifest = {
  id: 'c1-game',
  title: 'C1',
  version: '0.1.0',
  engineVersion: '0.1.0',
  ruleset: 'test',
  modules: ['fx'],
  contentPacks: [],
};

function hero(): EntityState {
  return {
    id: 'hero',
    blueprintId: 'bp',
    type: 'player',
    name: 'Hero',
    tags: [],
    stats: {},
    resources: {},
    statuses: [],
  };
}

/** Module with an `echo` verb + a RuleEffect that fires on test.echo events. */
function effectModule(): EngineModule {
  return {
    id: 'fx',
    version: '0.1.0',
    register(ctx) {
      ctx.actions.registerVerb('echo', (action: ActionIntent): ResolvedEvent[] => [
        {
          id: '', // stamped by recordEvent — the makeEvent contract
          tick: action.issuedAtTick,
          type: 'test.echo',
          actorId: action.actorId,
          payload: {},
        },
      ]);
      ctx.rules.registerEffect({
        id: 'fx-on-echo',
        apply: (event) => {
          if (event.type !== 'test.echo') return [];
          return [
            {
              id: '', // must be stamped deterministically by recordEvent
              tick: event.tick,
              type: 'test.effect.fired',
              payload: { sourceType: event.type },
              causedBy: event.id,
            },
          ];
        },
      });
    },
  };
}

/** Module with two effects: the first throws, the second must still run. */
function throwingEffectModule(): EngineModule {
  return {
    id: 'fx-throw',
    version: '0.1.0',
    register(ctx) {
      ctx.actions.registerVerb('echo', (action: ActionIntent): ResolvedEvent[] => [
        { id: '', tick: action.issuedAtTick, type: 'test.echo', actorId: action.actorId, payload: {} },
      ]);
      ctx.rules.registerEffect({
        id: 'fx-boom',
        apply: (event) => {
          if (event.type !== 'test.echo') return [];
          throw new Error('effect exploded');
        },
      });
      ctx.rules.registerEffect({
        id: 'fx-survivor',
        apply: (event) => {
          if (event.type !== 'test.echo') return [];
          return [
            { id: '', tick: event.tick, type: 'test.survivor.fired', payload: {}, causedBy: event.id },
          ];
        },
      });
    },
  };
}

function engineWith(mod: () => EngineModule, seed: number): Engine {
  const engine = new Engine({ manifest, seed, modules: [mod()] });
  engine.store.addEntity(hero());
  engine.store.state.playerId = 'hero';
  return engine;
}

describe('core-c1 — registered rule effects actually execute (meta-test)', () => {
  it('core-c1-001: a rules.registerEffect effect runs during dispatch and its events are recorded + returned', () => {
    const engine = engineWith(effectModule, 42);

    const events = engine.submitAction('echo');

    // The effect must have executed: its event is in the eventLog…
    const fired = engine.world.eventLog.find((e) => e.type === 'test.effect.fired');
    expect(fired).toBeDefined();
    // …carries the deterministic causedBy link to the triggering event…
    const echo = engine.world.eventLog.find((e) => e.type === 'test.echo');
    expect(fired!.causedBy).toBe(echo!.id);
    // …and is surfaced to the caller alongside the handler's events.
    expect(events.some((e) => e.type === 'test.effect.fired')).toBe(true);
  });

  it('core-c1-002: effect events get deterministic ids — two same-seed engines stay byte-identical', () => {
    const a = engineWith(effectModule, 7);
    const b = engineWith(effectModule, 7);

    a.submitAction('echo');
    a.submitAction('echo');
    b.submitAction('echo');
    b.submitAction('echo');

    // Effects fired on both and ids came from the per-world counter.
    const firedA = a.world.eventLog.filter((e) => e.type === 'test.effect.fired');
    expect(firedA.length).toBe(2);
    expect(firedA.every((e) => e.id.startsWith('evt_'))).toBe(true);

    // The headline guarantee survives the wiring: byte-identical serialize().
    expect(a.serialize()).toBe(b.serialize());
  });

  it('core-c1-003: effect events are recorded after the handler events and before action.resolved', () => {
    const engine = engineWith(effectModule, 3);
    engine.submitAction('echo');

    const types = engine.world.eventLog.map((e) => e.type);
    const echoIdx = types.indexOf('test.echo');
    const firedIdx = types.indexOf('test.effect.fired');
    const resolvedIdx = types.indexOf('action.resolved');
    expect(echoIdx).toBeGreaterThanOrEqual(0);
    expect(firedIdx).toBeGreaterThan(echoIdx);
    expect(resolvedIdx).toBeGreaterThan(firedIdx);
  });

  it('core-c1-004: a throwing effect degrades to rule.effect.failed; later effects still run; tick survives', () => {
    const engine = engineWith(throwingEffectModule, 5);

    expect(() => engine.submitAction('echo')).not.toThrow();

    const failed = engine.world.eventLog.find((e) => e.type === 'rule.effect.failed');
    expect(failed).toBeDefined();
    expect(failed!.payload.effectId).toBe('fx-boom');
    expect(String(failed!.payload.reason)).toContain('effect exploded');

    // The second registered effect was not aborted by the first one throwing.
    expect(engine.world.eventLog.some((e) => e.type === 'test.survivor.fired')).toBe(true);
    expect(engine.tick).toBe(1);
  });

  it('core-c1-005: save/load mid-stream with effects registered stays deterministic vs an un-saved twin', () => {
    const a = engineWith(effectModule, 55);
    a.submitAction('echo');
    const saved = a.serialize();
    const loaded = Engine.deserialize(saved, { modules: [effectModule()] });
    loaded.submitAction('echo');

    const b = engineWith(effectModule, 55);
    b.submitAction('echo');
    b.submitAction('echo');

    expect(loaded.serialize()).toBe(b.serialize());
  });

  it('core-c1-006: with no effects registered the pipeline is unchanged (eventCount pins handler events)', () => {
    const bare: EngineModule = {
      id: 'fx',
      version: '0.1.0',
      register(ctx) {
        ctx.actions.registerVerb('echo', (action: ActionIntent): ResolvedEvent[] => [
          { id: '', tick: action.issuedAtTick, type: 'test.echo', actorId: action.actorId, payload: {} },
        ]);
      },
    };
    const engine = new Engine({ manifest, seed: 1, modules: [bare] });
    engine.store.addEntity(hero());
    engine.store.state.playerId = 'hero';

    const events = engine.submitAction('echo');
    expect(events.length).toBe(1);
    const resolved = engine.world.eventLog.find((e) => e.type === 'action.resolved');
    expect(resolved!.payload.eventCount).toBe(1);
    expect(engine.world.eventLog.some((e) => e.type === 'rule.effect.failed')).toBe(false);
  });
});
