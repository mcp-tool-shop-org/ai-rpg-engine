// Module event-emit rebinding across deserialize — dogfood v2.5 finding PC-1 (HIGH).
//
// A module event HANDLER that emits a follow-on event does so via
// `ctx.events.emit` → `store.recordEvent`, where `store` was captured in the
// context closure at register() time. `Engine.deserialize` builds a THROWAWAY
// store, registers modules against it, then swaps in the restored store — but
// the emit closure still pointed at the throwaway. So after save→load→continue,
// every module-emitted reactive event (status reflect/DoT, cognition updates,
// defeat cascades — all `ctx.events.emit` users) recorded into the ORPHANED
// store: missing from `engine.world.eventLog`, id-stamped from the wrong
// counter, and published to listeners with the throwaway's near-empty state.
// That breaks byte-identical replay on the primary save/load path — the
// headline determinism guarantee.
//
// NOTE this is DISTINCT from the effect path (core-c1-005, already load-safe):
// rule effects return events to the dispatcher, which records them on the store
// PASSED to dispatch (the restored one). Only the ctx.events.emit path captures.
//
// Meta-test that must go RED: delete the `moduleManager.rebindStore(restored)`
// call in Engine.deserialize and pc1-001/pc1-002 fail (the orphaned-store state
// this finding started from).

import { describe, it, expect } from 'vitest';
import { Engine } from './engine.js';
import type { EngineModule, EntityState, ActionIntent, ResolvedEvent } from './types.js';

const manifest = {
  id: 'pc1-game',
  title: 'PC1',
  version: '0.1.0',
  engineVersion: '0.1.0',
  ruleset: 'test',
  modules: ['emitter'],
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

/**
 * A module whose event handler emits a follow-on event via `ctx.events.emit` —
 * the store-capturing path. `ping` → `ping.done`; a listener on `ping.done`
 * emits `ping.echo`. This is the reactive-emit shape status-core/cognition use.
 */
function emitterModule(): EngineModule {
  return {
    id: 'emitter',
    version: '0.1.0',
    register(ctx) {
      ctx.actions.registerVerb('ping', (action: ActionIntent): ResolvedEvent[] => [
        { id: '', tick: action.issuedAtTick, type: 'ping.done', actorId: action.actorId, payload: {} },
      ]);
      ctx.events.on('ping.done', (event: ResolvedEvent): void => {
        ctx.events.emit({ id: '', tick: event.tick, type: 'ping.echo', payload: {}, causedBy: event.id });
      });
    },
  };
}

function build(seed: number): Engine {
  const engine = new Engine({ manifest, seed, modules: [emitterModule()] });
  engine.store.addEntity(hero());
  engine.store.state.playerId = 'hero';
  return engine;
}

describe('pc1 — module event emits rebind to the restored store on deserialize', () => {
  it('pc1-001: a module-emitted follow-on event lands in the live eventLog after save→load→continue', () => {
    const a = build(9);
    a.submitAction('ping'); // records one ping.echo into a's store
    const loaded = Engine.deserialize(a.serialize(), { modules: [emitterModule()] });

    loaded.submitAction('ping'); // the post-load reactive emit must hit the RESTORED store

    const echoes = loaded.world.eventLog.filter((e) => e.type === 'ping.echo');
    // one restored from the pre-save action + one from the post-load action
    expect(echoes.length).toBe(2);
  });

  it('pc1-002: save/load mid-stream stays byte-identical to an un-saved twin (module-emit path)', () => {
    const a = build(21);
    a.submitAction('ping');
    const loaded = Engine.deserialize(a.serialize(), { modules: [emitterModule()] });
    loaded.submitAction('ping');

    const twin = build(21);
    twin.submitAction('ping');
    twin.submitAction('ping');

    expect(loaded.serialize()).toBe(twin.serialize());
  });
});
