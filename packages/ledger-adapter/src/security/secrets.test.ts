// secrets.test.ts — the secrets sidecar and the DECOMPOSE_BY_SECRETS runtime gate.
//
// Proves: (1) seeds round-trip through the sidecar CRUD + (de)serialize pair;
// (2) `assertNoSeedsInState` is silent on a clean state and throws when a
// seed-shaped string is smuggled into ANY field of a `LedgerAdapterState`,
// however unrelated to seeds that field normally is; (3) the optional file IO
// round-trips through a real (temp, cleaned-up) file.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createSidecar,
  putSeed,
  getSeed,
  serializeSidecar,
  deserializeSidecar,
  sidecarPath,
  assertNoSeedsInState,
  loadSidecar,
  saveSidecar,
} from './secrets.js';
import type { LedgerAdapterState } from '../contracts.js';

// Synthetic, non-functional strings shaped like real XRPL seeds (base58,
// correct prefix + length) purely to exercise the pattern matcher. They are
// not tied to any real or testnet account and hold no value.
const FAKE_FAMILY_SEED = 's123456789ABCDEFGHJKLMNPQRSTU'; // classic family seed shape
const FAKE_ED25519_SEED = 'sEd123456789ABCDEFGHJKLM'; // Ed25519 seed shape

function cleanState(): LedgerAdapterState {
  return {
    mode: 'ledger',
    issuerMode: 'per-run',
    enabled: true,
    issuerAddress: 'rIssuerExampleAddress1111111111',
    playerAddress: 'rPlayerExampleAddress2222222222',
    merchantAddress: 'rMerchantExampleAddress33333333',
    trustLinesReady: true,
    tokenMap: { coin: 'COI', potion: 'POT' },
    lastSettled: { coin: 100, potion: 3 },
    settlements: [
      {
        checkpoint: 1,
        location: 'harbor-town',
        deltas: { coin: -25, potion: 2 },
        txids: ['ABCDEF0123456789'],
        status: 'settled',
        memo: 'ARPG|GAME:pirate|RUN:abc|CHECKPOINT:1|DELTA:coin-25,potion+2|VERB:sell|V:1',
        timestamp: '2026-07-23T00:00:00.000Z',
      },
    ],
    pending: [],
    lastSettleFailed: false,
  };
}

describe('sidecar CRUD — round trip', () => {
  it('put/get seeds round-trip through a fresh sidecar', () => {
    const sidecar = createSidecar();
    putSeed(sidecar, 'rPlayerExampleAddress2222222222', FAKE_FAMILY_SEED);
    putSeed(sidecar, 'rIssuerExampleAddress1111111111', FAKE_ED25519_SEED);

    expect(getSeed(sidecar, 'rPlayerExampleAddress2222222222')).toBe(FAKE_FAMILY_SEED);
    expect(getSeed(sidecar, 'rIssuerExampleAddress1111111111')).toBe(FAKE_ED25519_SEED);
  });

  it('getSeed returns undefined for an address the sidecar has never seen', () => {
    const sidecar = createSidecar();
    expect(getSeed(sidecar, 'rNeverStored0000000000000000000')).toBeUndefined();
  });

  it('putSeed overwrites an existing entry for the same address', () => {
    const sidecar = createSidecar();
    putSeed(sidecar, 'rAddr1', FAKE_FAMILY_SEED);
    putSeed(sidecar, 'rAddr1', FAKE_ED25519_SEED);
    expect(getSeed(sidecar, 'rAddr1')).toBe(FAKE_ED25519_SEED);
  });

  it('createSidecar starts empty', () => {
    expect(createSidecar()).toEqual({ seeds: {} });
  });
});

describe('sidecar serialize/deserialize — round trip', () => {
  it('serializeSidecar -> deserializeSidecar preserves all seeds', () => {
    const sidecar = createSidecar();
    putSeed(sidecar, 'rAddrA', FAKE_FAMILY_SEED);
    putSeed(sidecar, 'rAddrB', FAKE_ED25519_SEED);

    const json = serializeSidecar(sidecar);
    const restored = deserializeSidecar(json);

    expect(restored).toEqual(sidecar);
    expect(getSeed(restored, 'rAddrA')).toBe(FAKE_FAMILY_SEED);
    expect(getSeed(restored, 'rAddrB')).toBe(FAKE_ED25519_SEED);
  });

  it('serializeSidecar produces valid JSON text', () => {
    const sidecar = createSidecar();
    putSeed(sidecar, 'rAddrA', FAKE_FAMILY_SEED);
    expect(() => JSON.parse(serializeSidecar(sidecar))).not.toThrow();
  });

  it('deserializeSidecar throws on malformed JSON shape (missing seeds)', () => {
    expect(() => deserializeSidecar(JSON.stringify({ notSeeds: {} }))).toThrow();
  });

  it('deserializeSidecar throws on non-object JSON', () => {
    expect(() => deserializeSidecar(JSON.stringify('just a string'))).toThrow();
  });

  it('deserializeSidecar throws when a seed value is not a string', () => {
    expect(() => deserializeSidecar(JSON.stringify({ seeds: { rAddr: 12345 } }))).toThrow();
  });
});

describe('sidecarPath — the gitignored convention path', () => {
  it('joins gameDir + .secrets + ledger-secrets.json', () => {
    const p = sidecarPath('/games/pirate-run');
    expect(p).toBe(join('/games/pirate-run', '.secrets', 'ledger-secrets.json'));
  });

  it('is a pure function: same input always yields the same path, no IO', () => {
    expect(sidecarPath('/games/pirate-run')).toBe(sidecarPath('/games/pirate-run'));
  });
});

describe('assertNoSeedsInState — the DECOMPOSE_BY_SECRETS runtime gate', () => {
  it('does not throw for a clean state (addresses only, no seeds)', () => {
    expect(() => assertNoSeedsInState(cleanState())).not.toThrow();
  });

  it('throws when a family-seed-shaped string is smuggled into issuerAddress', () => {
    const dirty = cleanState();
    dirty.issuerAddress = FAKE_FAMILY_SEED;
    expect(() => assertNoSeedsInState(dirty)).toThrow(/DECOMPOSE_BY_SECRETS/);
  });

  it('throws when an Ed25519-seed-shaped string is smuggled into a nested settlement memo', () => {
    const dirty = cleanState();
    dirty.settlements[0].memo = `leaked seed in memo: ${FAKE_ED25519_SEED}`;
    expect(() => assertNoSeedsInState(dirty)).toThrow(/DECOMPOSE_BY_SECRETS/);
  });

  it('throws when a seed is smuggled into an unrelated Record field (tokenMap value)', () => {
    const dirty = cleanState();
    dirty.tokenMap.oops = FAKE_FAMILY_SEED;
    expect(() => assertNoSeedsInState(dirty)).toThrow();
  });

  it('the thrown message redacts the seed rather than echoing it whole', () => {
    const dirty = cleanState();
    dirty.playerAddress = FAKE_FAMILY_SEED;
    let message = '';
    try {
      assertNoSeedsInState(dirty);
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).not.toContain(FAKE_FAMILY_SEED);
    expect(message).toContain('...');
  });

  it('does not false-positive on ordinary long addresses/JSON keys', () => {
    // issuerAddress/playerAddress/merchantAddress are long alphanumeric
    // strings starting with 'r', and property names like "settlements" start
    // with 's' — neither should trip the seed matcher.
    expect(() => assertNoSeedsInState(cleanState())).not.toThrow();
  });
});

describe('sidecar file IO — round trip through a real temp file', () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
      dir = undefined;
    }
  });

  it('saveSidecar + loadSidecar round-trips seeds through disk', () => {
    dir = mkdtempSync(join(tmpdir(), 'ledger-adapter-secrets-test-'));
    const path = sidecarPath(dir);

    const sidecar = createSidecar();
    putSeed(sidecar, 'rAddrA', FAKE_FAMILY_SEED);
    putSeed(sidecar, 'rAddrB', FAKE_ED25519_SEED);

    saveSidecar(path, sidecar);
    const loaded = loadSidecar(path);

    expect(loaded).toEqual(sidecar);
    expect(getSeed(loaded, 'rAddrA')).toBe(FAKE_FAMILY_SEED);
    expect(getSeed(loaded, 'rAddrB')).toBe(FAKE_ED25519_SEED);
  });

  it('saveSidecar creates the .secrets parent directory if missing', () => {
    dir = mkdtempSync(join(tmpdir(), 'ledger-adapter-secrets-test-'));
    const path = sidecarPath(dir); // <dir>/.secrets/ledger-secrets.json — .secrets does not exist yet
    expect(() => saveSidecar(path, createSidecar())).not.toThrow();
    expect(() => loadSidecar(path)).not.toThrow();
  });

  it('loadSidecar throws for a missing file', () => {
    dir = mkdtempSync(join(tmpdir(), 'ledger-adapter-secrets-test-'));
    const path = sidecarPath(dir);
    expect(() => loadSidecar(path)).toThrow();
  });
});
