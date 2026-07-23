import { describe, test, expect } from 'vitest';
import {
  createInitialState,
  serializeState,
  deserializeState,
  assignTokenCode,
  getTokenCode,
  computeDeltas,
  advanceBaseline,
} from './state.js';
import type { LedgerAdapterConfig, LedgerAdapterState, SettlementRecord } from '../contracts.js';

const CONFIG: LedgerAdapterConfig = {
  mode: 'ledger',
  issuerMode: 'per-run',
  settlement: 'token-escrow',
  network: 'testnet',
};

function populatedState(): LedgerAdapterState {
  const state = createInitialState(CONFIG);
  state.enabled = true;
  state.issuerAddress = 'rIssuerAddressExample1111111111';
  state.playerAddress = 'rPlayerAddressExample11111111111';
  state.merchantAddress = 'rMerchantAddressExample111111111';
  state.trustLinesReady = true;
  assignTokenCode(state, 'coin');
  assignTokenCode(state, 'potion');
  state.lastSettled = { coin: 100, potion: 3 };

  const settled: SettlementRecord = {
    checkpoint: 1,
    location: 'market',
    deltas: { coin: -25, potion: 2 },
    txids: ['ABCDEF1234567890ABCDEF1234567890ABCDEF12'],
    status: 'settled',
    memo: 'ARPG|GAME:pirate|RUN:abc|CHECKPOINT:1|DELTA:coin-25,potion+2|VERB:sell|V:1',
    timestamp: '2026-07-23T00:00:00.000Z',
  };
  const pending: SettlementRecord = {
    checkpoint: 2,
    location: 'town',
    deltas: { coin: 10 },
    txids: [],
    status: 'pending',
    memo: 'ARPG|GAME:pirate|RUN:abc|CHECKPOINT:2|DELTA:coin+10|VERB:settle|V:1',
    timestamp: '2026-07-23T01:00:00.000Z',
  };
  state.settlements = [settled];
  state.pending = [pending];

  state.nfts = {
    cutlass: {
      gameItemId: 'cutlass',
      nftId: 'ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12345678',
      uri: 'ARPG-NFT|GAME:pirate|ITEM:cutlass|RELIC:1|TIER:1|V:1',
      relicVersion: 1,
      taxon: 0,
      mutable: true,
      mintTxid: 'FEDCBA9876543210FEDCBA9876543210FEDCBA98',
      status: 'minted',
    },
  };
  return state;
}

describe('createInitialState', () => {
  test('copies mode/issuerMode from config; everything else empty/disabled', () => {
    const state = createInitialState(CONFIG);
    expect(state).toEqual({
      mode: 'ledger',
      issuerMode: 'per-run',
      enabled: false,
      issuerAddress: '',
      playerAddress: '',
      merchantAddress: '',
      trustLinesReady: false,
      tokenMap: {},
      lastSettled: {},
      settlements: [],
      pending: [],
      lastSettleFailed: false,
      nfts: {},
    });
  });

  test('is a fresh object each call (no shared mutable references)', () => {
    const a = createInitialState(CONFIG);
    const b = createInitialState(CONFIG);
    a.tokenMap.coin = 'COI';
    a.settlements.push({
      checkpoint: 1,
      location: 'x',
      deltas: {},
      txids: [],
      status: 'settled',
      memo: '',
      timestamp: '',
    });
    a.nfts!.cutlass = {
      gameItemId: 'cutlass',
      nftId: 'NFT1',
      uri: 'ARPG-NFT|GAME:pirate|ITEM:cutlass|RELIC:0|TIER:0|V:1',
      relicVersion: 0,
      taxon: 0,
      mutable: true,
      mintTxid: 'HASH1',
      status: 'minted',
    };
    expect(b.tokenMap).toEqual({});
    expect(b.settlements).toEqual([]);
    expect(b.nfts).toEqual({});
  });

  test('nfts starts as an empty object (the NFT unique-gear layer, optional for v3.2 back-compat)', () => {
    const state = createInitialState(CONFIG);
    expect(state.nfts).toEqual({});
  });
});

describe('round-trip (serializeState / deserializeState)', () => {
  test('deserializeState(serializeState(s)) deep-equals s for a populated state', () => {
    const state = populatedState();
    const json = serializeState(state);
    const restored = deserializeState(json);
    expect(restored).toEqual(state);
  });

  test('round-trips a fresh (empty) state too', () => {
    const state = createInitialState(CONFIG);
    expect(deserializeState(serializeState(state))).toEqual(state);
  });

  test('round-trips every LedgerMode / IssuerMode combination', () => {
    const modes: LedgerAdapterConfig['mode'][] = ['offline', 'ledger', 'diary'];
    const issuerModes: LedgerAdapterConfig['issuerMode'][] = ['per-run', 'persistent'];
    for (const mode of modes) {
      for (const issuerMode of issuerModes) {
        const state = createInitialState({ ...CONFIG, mode, issuerMode });
        expect(deserializeState(serializeState(state))).toEqual(state);
      }
    }
  });
});

describe('NFT unique-gear layer (state.nfts)', () => {
  test('round-trips a state with multiple nfts populated (mixed minted/pending status) — deep-equal', () => {
    const state = createInitialState(CONFIG);
    state.nfts = {
      cutlass: {
        gameItemId: 'cutlass',
        nftId: 'ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12345678',
        uri: 'ARPG-NFT|GAME:pirate|ITEM:cutlass|RELIC:2|TIER:1|V:1',
        relicVersion: 2,
        taxon: 0,
        mutable: true,
        mintTxid: 'FEDCBA9876543210FEDCBA9876543210FEDCBA98',
        status: 'minted',
      },
      lantern: {
        gameItemId: 'lantern',
        nftId: '1111111111111111111111111111111111111111111111111111111111111111',
        uri: 'ARPG-NFT|GAME:pirate|ITEM:lantern|RELIC:0|TIER:0|V:1',
        relicVersion: 0,
        taxon: 1,
        mutable: true,
        mintTxid: '2222222222222222222222222222222222222222',
        status: 'pending',
      },
    };

    const restored = deserializeState(serializeState(state));
    expect(restored).toEqual(state);
    expect(restored.nfts).toEqual(state.nfts);
  });

  test('back-compat: a serialized state that omits "nfts" entirely still deserializes, defaulting to {}', () => {
    const state = populatedState(); // includes an nfts entry via the shared fixture
    const obj = JSON.parse(serializeState(state)) as Record<string, unknown>;
    expect(obj.nfts).toBeDefined(); // sanity: the fixture really did serialize one

    delete obj.nfts; // simulate a v3.2 (pre-NFT-layer) save with no "nfts" key at all
    const json = JSON.stringify(obj);

    let restored: LedgerAdapterState | undefined;
    expect(() => {
      restored = deserializeState(json);
    }).not.toThrow();
    expect(restored?.nfts).toEqual({});
    // Everything else from the v3.2-shaped payload still deserialized intact.
    expect(restored?.issuerAddress).toBe(state.issuerAddress);
    expect(restored?.settlements).toEqual(state.settlements);
  });

  test('throws a clear Error on a malformed nfts entry (wrong-typed field)', () => {
    const state = createInitialState(CONFIG);
    state.nfts = {
      cutlass: {
        gameItemId: 'cutlass',
        nftId: 'ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12345678',
        uri: 'ARPG-NFT|GAME:pirate|ITEM:cutlass|RELIC:1|TIER:1|V:1',
        relicVersion: 1,
        taxon: 0,
        mutable: true,
        mintTxid: 'FEDCBA9876543210FEDCBA9876543210FEDCBA98',
        status: 'minted',
      },
    };
    const obj = JSON.parse(serializeState(state)) as { nfts: Record<string, Record<string, unknown>> };
    obj.nfts.cutlass.relicVersion = 'not-a-number'; // should be a number
    expect(() => deserializeState(JSON.stringify(obj))).toThrow(/nfts\.cutlass\.relicVersion/);
  });

  test('throws a clear Error on an invalid nfts status enum value', () => {
    const state = createInitialState(CONFIG);
    state.nfts = {
      cutlass: {
        gameItemId: 'cutlass',
        nftId: 'ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12345678',
        uri: 'ARPG-NFT|GAME:pirate|ITEM:cutlass|RELIC:1|TIER:1|V:1',
        relicVersion: 1,
        taxon: 0,
        mutable: true,
        mintTxid: 'FEDCBA9876543210FEDCBA9876543210FEDCBA98',
        status: 'minted',
      },
    };
    const obj = JSON.parse(serializeState(state)) as { nfts: Record<string, Record<string, unknown>> };
    obj.nfts.cutlass.status = 'confirmed'; // not 'minted' | 'pending'
    expect(() => deserializeState(JSON.stringify(obj))).toThrow(/nfts\.cutlass\.status/);
  });

  test('throws a clear Error when "nfts" itself is present but not an object', () => {
    const state = createInitialState(CONFIG);
    const obj = JSON.parse(serializeState(state)) as Record<string, unknown>;
    obj.nfts = 'not-an-object';
    expect(() => deserializeState(JSON.stringify(obj))).toThrow(/nfts/);
  });
});

describe('no seed leakage', () => {
  test('serialized JSON contains no "seed" key and no XRPL-seed-shaped value', () => {
    const state = populatedState();
    const json = serializeState(state);
    expect(json.toLowerCase()).not.toContain('seed');
    // XRPL-family seeds are base58check strings starting with 's' (no 0/O/I/l).
    expect(json).not.toMatch(/"s[1-9A-HJ-NP-Za-km-z]{25,40}"/);
  });

  test('serializeState throws if a seed-shaped key is smuggled into state', () => {
    const contaminated = populatedState() as unknown as Record<string, unknown>;
    contaminated.issuerSeed = 'sEdT7wu2ZTQZ8FmzZ3v9Q6z1XkKq6vJ';
    expect(() => serializeState(contaminated as unknown as LedgerAdapterState)).toThrow(/seed/i);
  });
});

describe('token codes', () => {
  test('derives the naive 3-char uppercase code from a resource key', () => {
    const state = createInitialState(CONFIG);
    expect(assignTokenCode(state, 'coin')).toBe('COI');
    expect(assignTokenCode(state, 'potion')).toBe('POT');
    expect(getTokenCode(state, 'coin')).toBe('COI');
    expect(getTokenCode(state, 'potion')).toBe('POT');
  });

  test('is deterministic: same key gives the same code across separate calls and separate fresh states', () => {
    const a1 = createInitialState(CONFIG);
    const a2 = createInitialState(CONFIG);
    expect(assignTokenCode(a1, 'elixir')).toBe(assignTokenCode(a2, 'elixir'));

    // Idempotent: re-assigning an already-assigned key returns the same code
    // and does not perturb the rest of the map.
    const first = assignTokenCode(a1, 'elixir');
    const second = assignTokenCode(a1, 'elixir');
    expect(second).toBe(first);
  });

  test('getTokenCode returns undefined for an unassigned key and does not assign one', () => {
    const state = createInitialState(CONFIG);
    expect(getTokenCode(state, 'nope')).toBeUndefined();
    expect(state.tokenMap).toEqual({});
  });

  test('codes are always exactly 3 uppercase alphanumeric characters', () => {
    const state = createInitialState(CONFIG);
    for (const key of ['gunpowder', 'a', 'ab', '', 'Already-UPPER', 'x_y_z']) {
      const code = assignTokenCode(state, key);
      expect(code).toHaveLength(3);
      expect(code).toMatch(/^[A-Z0-9]{3}$/);
    }
  });

  test('is collision-safe: keys that collide on their naive first 3 letters get distinct codes', () => {
    const state = createInitialState(CONFIG);
    const codeCoin = assignTokenCode(state, 'coin');
    const codePurse = assignTokenCode(state, 'coinpurse'); // naive would also be "COI"
    expect(codeCoin).toBe('COI');
    expect(codePurse).not.toBe(codeCoin);
    expect(codePurse).toMatch(/^[A-Z0-9]{3}$/);
    expect(state.tokenMap.coin).toBe(codeCoin);
    expect(state.tokenMap.coinpurse).toBe(codePurse);
  });

  test('a whole cluster of naively-colliding keys all resolve to distinct codes', () => {
    const state = createInitialState(CONFIG);
    const keys = ['potion', 'potions', 'potionx', 'potionz', 'pot'];
    const codes = keys.map((k) => assignTokenCode(state, k));
    expect(new Set(codes).size).toBe(keys.length);
  });

  test('two different keys never share a code even after many assignments', () => {
    const state = createInitialState(CONFIG);
    const keys = Array.from({ length: 50 }, (_, i) => `item_${i}`);
    const codes = keys.map((k) => assignTokenCode(state, k));
    expect(new Set(codes).size).toBe(keys.length);
  });
});

describe('deltas', () => {
  test('computes positive and negative deltas against the baseline', () => {
    const state = createInitialState(CONFIG);
    state.lastSettled = { coin: 100, potion: 5 };
    const deltas = computeDeltas(state, { coin: 125, items: { potion: 3 } });
    expect(deltas).toEqual({ coin: 25, potion: -2 });
  });

  test('omits zero-delta keys', () => {
    const state = createInitialState(CONFIG);
    state.lastSettled = { coin: 100, potion: 5 };
    const deltas = computeDeltas(state, { coin: 100, items: { potion: 5 } });
    expect(deltas).toEqual({});
  });

  test('a resource not yet in the baseline is a full positive delta', () => {
    const state = createInitialState(CONFIG);
    state.lastSettled = { coin: 100 };
    const deltas = computeDeltas(state, { coin: 100, items: { potion: 4 } });
    expect(deltas).toEqual({ potion: 4 });
  });

  test('a resource dropped entirely from the snapshot still yields a negative delta', () => {
    const state = createInitialState(CONFIG);
    state.lastSettled = { coin: 100, potion: 5 };
    // potion fully consumed -- trade-core's tally omits the zero-count key.
    const deltas = computeDeltas(state, { coin: 100, items: {} });
    expect(deltas).toEqual({ potion: -5 });
  });

  test('advanceBaseline then computeDeltas on the same snapshot yields empty', () => {
    const state = createInitialState(CONFIG);
    state.lastSettled = { coin: 100, potion: 5 };
    const snapshot = { coin: 125, items: { potion: 3 } };

    const deltas = computeDeltas(state, snapshot);
    expect(deltas).toEqual({ coin: 25, potion: -2 });

    advanceBaseline(state, deltas);
    expect(state.lastSettled).toEqual({ coin: 125, potion: 3 });
    expect(computeDeltas(state, snapshot)).toEqual({});
  });

  test('advanceBaseline folds by delta rather than resetting to current (partial-retry safe)', () => {
    const state = createInitialState(CONFIG);
    state.lastSettled = { coin: 100 };
    advanceBaseline(state, { coin: 10 });
    expect(state.lastSettled.coin).toBe(110);
    advanceBaseline(state, { coin: -3 });
    expect(state.lastSettled.coin).toBe(107);
  });

  test('advanceBaseline on an empty delta set is a no-op', () => {
    const state = createInitialState(CONFIG);
    state.lastSettled = { coin: 100, potion: 2 };
    advanceBaseline(state, {});
    expect(state.lastSettled).toEqual({ coin: 100, potion: 2 });
  });
});

describe('malformed deserialize', () => {
  test('throws a clear Error on invalid JSON', () => {
    expect(() => deserializeState('{not valid json')).toThrow(/deserializeState/);
  });

  test('throws a clear Error on a missing required key', () => {
    const state = createInitialState(CONFIG);
    const obj = JSON.parse(serializeState(state)) as Record<string, unknown>;
    delete obj.tokenMap;
    expect(() => deserializeState(JSON.stringify(obj))).toThrow(/tokenMap/);
  });

  test('throws a clear Error on a wrong-typed field', () => {
    const state = createInitialState(CONFIG);
    const obj = JSON.parse(serializeState(state)) as Record<string, unknown>;
    obj.enabled = 'yes'; // should be boolean
    expect(() => deserializeState(JSON.stringify(obj))).toThrow(/enabled/);
  });

  test('throws a clear Error on an invalid mode enum value', () => {
    const state = createInitialState(CONFIG);
    const obj = JSON.parse(serializeState(state)) as Record<string, unknown>;
    obj.mode = 'mainnet';
    expect(() => deserializeState(JSON.stringify(obj))).toThrow(/mode/);
  });

  test('throws a clear Error on a malformed settlement record', () => {
    const state = createInitialState(CONFIG);
    state.settlements = [
      {
        checkpoint: 1,
        location: 'market',
        deltas: { coin: -1 },
        txids: [],
        status: 'settled',
        memo: 'x',
        timestamp: 'now',
      },
    ];
    const obj = JSON.parse(serializeState(state)) as { settlements: Record<string, unknown>[] };
    obj.settlements[0].status = 'bogus';
    expect(() => deserializeState(JSON.stringify(obj))).toThrow(/settlements\[0\]\.status/);
  });

  test('throws on a non-object root value', () => {
    expect(() => deserializeState('"just a string"')).toThrow(/deserializeState/);
    expect(() => deserializeState('42')).toThrow(/deserializeState/);
    expect(() => deserializeState('null')).toThrow(/deserializeState/);
    expect(() => deserializeState('[]')).toThrow(/deserializeState/);
  });
});
