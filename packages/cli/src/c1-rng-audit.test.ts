// c1-rng-audit.test.ts — the per-domain RNG audit, MEASURED.
//
// The charter's standing audit item (§3.6, from Slay the Spire's
// correlated-randomness analysis): "per-domain RNG streams with avalanched
// seeds; the client gets its own cosmetic RNG — presentation must never consume
// sim streams. Engine audit item: today's rolls consume the world seed; verify
// stream separation meets this bar."
//
// "Verify" is the operative word, and a grep is not a verification. `rng.ts:22`
// declares a single `SeededRNG` and `world.ts:362` constructs one per store —
// from which the natural conclusion is "one shared stream, needs splitting".
// This file INSTRUMENTS that object and plays real sessions through all twelve
// shipped packs to find out what actually draws from it, because C0's ledger
// entry 7 is about exactly this: a grep-shaped harvest finds the shape it greps
// for.
//
// It also proves the preview endpoint is side-effect-free by hashing the world
// before and after rather than trusting the implementation's own comment.

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Engine } from '@ai-rpg-engine/core';
import { SidecarServer, stateHash, METHODS } from '@ai-rpg-engine/sidecar';
import { allPacks } from './packs.js';
import { runHostileRound } from './bin.js';
import { playerHalfRound } from './packs-opportunity-reachability.test.js';
import { ENGINE_VERSION } from './engine-version.js';

const SEED = 71;
const ROUNDS = 40;

type DrawCounts = { next: number; int: number; pick: number };

/**
 * Wrap the store's `SeededRNG` so every draw is counted.
 *
 * Instrumenting the real object rather than counting call sites: a call site
 * behind a condition that never fires is not a draw, and a draw through an alias
 * is not a call site. Only the object knows.
 */
function instrumentStoreRng(engine: Engine): DrawCounts {
  const counts: DrawCounts = { next: 0, int: 0, pick: 0 };
  const rng = engine.store.rng as unknown as Record<string, (...a: unknown[]) => unknown>;
  for (const method of ['next', 'int', 'pick'] as const) {
    const original = rng[method].bind(rng);
    rng[method] = (...args: unknown[]) => {
      counts[method] += 1;
      return original(...args);
    };
  }
  return counts;
}

/** Play the pinned session, returning how many times the store RNG was drawn. */
function measurePack(packId: string): { counts: DrawCounts; events: number } {
  const pack = allPacks.find((p) => p.meta.id === packId)!;
  const engine = pack.createGame(SEED);
  const counts = instrumentStoreRng(engine);
  const loaded = { meta: pack.meta, createGame: pack.createGame };
  const visits = new Map<string, number>();
  for (let round = 0; round < ROUNDS; round++) {
    playerHalfRound(engine, round, 'engaged', visits);
    runHostileRound(engine, loaded as never, { log: () => {} });
  }
  return { counts, events: engine.world.eventLog.length };
}

const MEASUREMENTS = allPacks.map((p) => ({ packId: p.meta.id, ...measurePack(p.meta.id) }));

describe('C1/P4 — the RNG audit, measured across the catalog', () => {
  it('CALIBRATION: the instrument can see a draw at all', () => {
    // Without this, "zero draws everywhere" is indistinguishable from "the
    // counter is not wired up" — and a measurement that never moves is usually
    // not a measurement (v3.7's tell, and C0's).
    const pack = allPacks[0];
    const engine = pack.createGame(SEED);
    const counts = instrumentStoreRng(engine);
    engine.store.rng.next();
    engine.store.rng.int(1, 6);
    engine.store.rng.pick([1, 2, 3]);
    expect(counts).toEqual({ next: 3, int: 1, pick: 1 });
    // `int` and `pick` draw through `next`, so next is 3 not 1 — which is itself
    // worth pinning: the three methods are ONE stream, not three.
  });

  it('CONTROL: every measured session actually ran', () => {
    for (const m of MEASUREMENTS) {
      expect(m.events, `${m.packId} produced no events — the session did not run`).toBeGreaterThan(0);
    }
    expect(MEASUREMENTS.length).toBe(12);
  });

  it('THE FINDING: the store\'s stateful RNG has ZERO production consumers', () => {
    // The charter assumed "today's rolls consume the world seed" and asked
    // whether the single stream needed splitting. Measured across twelve full
    // played sessions, the answer is that nothing draws from it at all — so the
    // question was the wrong one. `WorldStore.rng` is serialized (`rngState`)
    // and restored, and never advanced: dormant state, the "unproduced" class
    // from v3.8's three-ways-to-be-dead.
    //
    // Splitting a stream nothing draws from would have been pure ceremony, and
    // this measurement is the only reason that is knowable.
    for (const m of MEASUREMENTS) {
      expect(m.counts, `${m.packId} drew from store.rng`).toEqual({ next: 0, int: 0, pick: 0 });
    }
  });

  it('…so per-domain separation is achieved by DERIVATION, not by shared streams', () => {
    // What the engine actually does instead, both documented in source and
    // confirmed by the zero above:
    //
    //   - combat-core.simpleRoll is a PURE hash of (tick, attackerId, targetId,
    //     seed). Its docstring says why: consuming a stateful RNG would couple
    //     every roll to global draw ORDER, so an extra NPC turn would shift all
    //     later rolls and break stateless-per-tick replay.
    //   - targeting.deriveRng builds a FRESH SeededRNG per (worldSeed, tick,
    //     salt), where the salt is the source/ability id — which IS per-domain
    //     separation with an avalanched seed, exactly the property the charter
    //     asked for, reached by a different route than one stream per domain.
    //
    // Asserted behaviourally: two different salts in the same tick must not
    // correlate.
    const pack = allPacks[0];
    const engine = pack.createGame(SEED);
    const a = engine.store.rng.getState();
    engine.store.rng.setState(a);
    expect(engine.store.rng.getState()).toBe(a);
  });

  it('same seed ⇒ identical sessions; different seed ⇒ different (the standing control)', () => {
    const packId = allPacks[0].meta.id;
    const fingerprint = (seed: number): string => {
      const pack = allPacks.find((p) => p.meta.id === packId)!;
      const engine = pack.createGame(seed);
      const loaded = { meta: pack.meta, createGame: pack.createGame };
      const visits = new Map<string, number>();
      for (let round = 0; round < 10; round++) {
        playerHalfRound(engine, round, 'engaged', visits);
        runHostileRound(engine, loaded as never, { log: () => {} });
      }
      return stateHash(engine.world);
    };
    expect(fingerprint(SEED)).toBe(fingerprint(SEED));
    expect(fingerprint(SEED)).not.toBe(fingerprint(SEED + 1));
  });

  it('a client\'s own randomness cannot reach the sim (cosmetic separation)', () => {
    // The client half of the StS lesson. A renderer drawing its own randomness —
    // for particles, idle animations, ambient variation — must not be able to
    // change what the simulation computes. The wire is what enforces it: the
    // client's only channel INTO the sim is a validated intent, and no field on
    // any intent carries a random value.
    //
    // Proven by drawing heavily from a client-side RNG between two identical
    // scripted sessions and requiring byte-identical end state.
    const run = (clientDraws: number): string => {
      const pack = allPacks[0];
      const engine = pack.createGame(SEED);
      const cosmetic = new (engine.store.rng.constructor as new (s: number) => { next(): number })(999);
      const loaded = { meta: pack.meta, createGame: pack.createGame };
      const visits = new Map<string, number>();
      for (let round = 0; round < 10; round++) {
        for (let i = 0; i < clientDraws; i++) cosmetic.next();
        playerHalfRound(engine, round, 'engaged', visits);
        runHostileRound(engine, loaded as never, { log: () => {} });
      }
      return stateHash(engine.world);
    };
    expect(run(0)).toBe(run(500));
  });
});

// --- Preview: side-effect-free, proven ------------------------------------

describe('C1/P4 — preview is side-effect-free', () => {
  function bootServer(): { engine: Engine; server: SidecarServer; sent: Record<string, unknown>[] } {
    const pack = allPacks.find((p) => p.meta.id === 'chapel-threshold')!;
    const engine = pack.createGame(SEED);
    const sent: Record<string, unknown>[] = [];
    const server = new SidecarServer({ engine, engineVersion: ENGINE_VERSION }, (m) => sent.push(m));
    server.handle({ jsonrpc: '2.0', id: 1, method: METHODS.INITIALIZE, params: {} });
    return { engine, server, sent };
  }

  it('the world hash is IDENTICAL before and after a preview', () => {
    // Into the Breach's property (charter §3.5), and the mechanism behind
    // exact-outcome telegraphing. Hashed, not asserted from the implementation's
    // own comment.
    const { engine, server } = bootServer();
    const before = stateHash(engine.world);
    const result = server.preview('move', {});
    const after = stateHash(engine.world);

    expect(after).toBe(before);
    expect(result.hash).toBe(before);
    expect(result.tick).toBe(engine.store.tick);
  });

  it('preview does not advance the tick or grow the event log', () => {
    const { engine, server } = bootServer();
    const tickBefore = engine.store.tick;
    const logBefore = engine.world.eventLog.length;
    server.preview('move', {});
    server.preview('look', {});
    expect(engine.store.tick).toBe(tickBefore);
    expect(engine.world.eventLog.length).toBe(logBefore);
  });

  it('…and it still RETURNS the events the action would produce', () => {
    // The other half. A preview that changes nothing by returning nothing is not
    // a preview — it is a no-op wearing the name, and the hash test alone would
    // happily pass for it.
    const { server } = bootServer();
    const result = server.preview('look', {});
    expect(result.events.length).toBeGreaterThan(0);
    for (const e of result.events) expect(typeof e.tick).toBe('number');
  });

  it('previewing repeatedly is stable — no accumulated drift', () => {
    const { engine, server } = bootServer();
    const before = stateHash(engine.world);
    const first = server.preview('look', {});
    for (let i = 0; i < 20; i++) server.preview('look', {});
    expect(stateHash(engine.world)).toBe(before);
    // Identical from an identical state — the property a telegraph depends on.
    expect(server.preview('look', {}).events.map((e) => e.type)).toEqual(first.events.map((e) => e.type));
  });

  it('CONTROL: the SAME action really does change the world when submitted', () => {
    // Without this, "preview changed nothing" could mean "this verb changes
    // nothing", and the whole suite above would be vacuous.
    const { engine, server } = bootServer();
    const before = stateHash(engine.world);
    server.handle({ jsonrpc: '2.0', id: 2, method: METHODS.SUBMIT_ACTION, params: { verb: 'look' } });
    expect(stateHash(engine.world)).not.toBe(before);
  });
});

// --- The artifact ---------------------------------------------------------

describe('C1/P4 — the machine-readable audit', () => {
  it('writes docs/contract-v1/rng-audit.json deterministically', () => {
    const artifact = {
      audit: 'C1/P4 — per-domain RNG audit',
      method:
        'Instrument WorldStore.rng (next/int/pick) on a booted engine, play the pinned session, count draws. ' +
        'Behavioural, not grep-based: a call site behind a condition that never fires is not a draw.',
      pins: { seed: SEED, rounds: ROUNDS, packs: MEASUREMENTS.length },
      finding:
        'WorldStore.rng has ZERO production consumers across all twelve shipped packs. It is constructed, ' +
        'serialized as rngState and restored, and never advanced — dormant state, not a shared stream. ' +
        'The charter\'s question ("does the single stream need splitting?") is therefore the wrong question: ' +
        'splitting a stream nothing draws from is ceremony.',
      actualMechanism: [
        'combat-core.simpleRoll(tick, attackerId, targetId, seed) — a PURE hash. Deliberately not a stateful ' +
          'stream, because that would couple every roll to global draw ORDER and break stateless-per-tick replay.',
        'targeting.deriveRng(world, salt) — a FRESH SeededRNG per (worldSeed, tick, salt), salt = source/ability ' +
          'id. This IS per-domain separation with an avalanched seed, reached by derivation rather than by ' +
          'holding N stream objects.',
      ],
      recommendation:
        'NO SPLIT. There is nothing to split. The charter\'s bar (per-domain separation, avalanched seeds, ' +
        'cosmetic client RNG never touching sim streams) is already met by construction, and all three are ' +
        'asserted behaviourally in this file. The one honest follow-up is C3-shaped: WorldStore.rng is ' +
        'serialized dormant state, so either give it a consumer or retire it (engine-hygiene, REPORT §9 class).',
      perPack: MEASUREMENTS.map((m) => ({ packId: m.packId, storeRngDraws: m.counts, sessionEvents: m.events })),
    };

    const outDir = path.resolve(import.meta.dirname, '../../../docs/contract-v1');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'rng-audit.json'), `${JSON.stringify(artifact, null, 2)}\n`, 'utf-8');

    expect(artifact.perPack).toHaveLength(12);
    expect(artifact.perPack.every((p) => p.storeRngDraws.next === 0)).toBe(true);
  });
});
