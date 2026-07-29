// c1-gate.test.ts — the load gate, with a RED control per check.
//
// C0 measured a pack stamped `engineVersion: '2.0.0'` passing the 3.8.0
// validators clean, a nonsense key producing a BYTE-IDENTICAL load report to
// real content, and nine phantom module ids riding along in every manifest
// because validation checked `modules` was an array of strings and never
// resolved an id (docs/c0-alignment/REPORT.md §3.1, §5).
//
// Four checks, four refusals, and — the part that makes them evidence — four
// controls proving each check ACCEPTS the corresponding good input. A gate that
// has only ever refused is as unproven as one that has only ever passed
// ([[feedback_proof_gates_that_cant_fail_prove_nothing]]).
//
// The module check resolves against a REAL BOOTED ENGINE's ModuleManager, which
// is why it lives in this repo: world-forge's engine dependencies are still
// installed at 2.x (C0 checklist item 1, open), so the forge cannot boot 3.8.0
// to resolve anything. Its half is structural; this half is live.

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  runLoadGate,
  computeContentHash,
  canonicalize,
  suggestModuleId,
  ALLOWED_PACK_KEYS,
  SIM_AFFECTING_KEYS,
  loadContentFromFile,
  applyContentPack,
  type ContentPack,
  type GateContext,
} from '@ai-rpg-engine/content-schema';
import { createStandardChannels } from '@ai-rpg-engine/modules';
import { allPacks } from './packs.js';
import { FIXTURE_PACK_PATH } from './c0/fixture-path.js';
import { ENGINE_VERSION } from './engine-version.js';

const HOST_PACK_ID = 'chapel-threshold';
const SEED = 71;

/** The manifest world-forge's exporter now writes, carried across byte-for-byte. */
const FORGE_MANIFEST_PATH = path.resolve(import.meta.dirname, '__fixtures__/c1-forge-manifest.json');

function hostPack() {
  const p = allPacks.find((x) => x.meta.id === HOST_PACK_ID);
  if (!p) throw new Error(`pack ${HOST_PACK_ID} not found`);
  return p;
}

/** Every module id a real booted engine registered. The gate's ground truth. */
function registeredIds(): string[] {
  return hostPack().createGame(SEED).moduleManager.getModules().map((m) => m.id);
}

function forgeManifest(): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(FORGE_MANIFEST_PATH, 'utf-8')) as Record<string, unknown>;
}

function fixturePack(): ContentPack {
  const r = loadContentFromFile(FIXTURE_PACK_PATH);
  if (!r.ok) throw new Error(`fixture failed to load: ${r.summary}`);
  return r.pack;
}

/** A pack that passes every check, as the baseline the RED controls deviate from. */
function goodPack(): ContentPack {
  return { schemaVersion: '1.0.0', zones: [{ id: 'z', name: 'Z' }], entities: [] };
}

function goodCtx(pack: ContentPack): GateContext {
  return {
    engineVersion: ENGINE_VERSION,
    registeredModuleIds: registeredIds(),
    manifest: {
      engineVersion: `>=${ENGINE_VERSION} <99.0.0`,
      modules: ['combat-core'],
      contentHash: computeContentHash(pack),
    },
  };
}

// --- Check 1: engine version ----------------------------------------------

describe('C1/P2 — gate check: engineVersion as a range', () => {
  it('GREEN: a range the running engine satisfies is accepted', () => {
    const pack = goodPack();
    const r = runLoadGate(pack, goodCtx(pack));
    expect(r.ok, r.report).toBe(true);
  });

  it('RED: a stale range is REFUSED with a diff report', () => {
    const pack = goodPack();
    const ctx = goodCtx(pack);
    ctx.manifest!.engineVersion = '>=2.0.0 <3.0.0';
    const r = runLoadGate(pack, ctx);

    expect(r.ok).toBe(false);
    const check = r.checks.find((c) => c.check === 'engine-version')!;
    expect(check.ok).toBe(false);
    expect(check.actual).toContain('2.0.0');
    expect(check.expected).toContain(ENGINE_VERSION);
    expect(r.report).toContain('engine-version');
    expect(r.report).toContain('expected:');
    expect(r.report).toContain('actual:');
  });

  it('the exact C0 skew — a bare "2.0.0" against this engine — is refused', () => {
    const pack = goodPack();
    const ctx = goodCtx(pack);
    ctx.manifest!.engineVersion = '2.0.0';
    const r = runLoadGate(pack, ctx);
    expect(r.ok).toBe(false);
  });

  it('a bare version that DOES match is accepted, and advised against', () => {
    // Backward compatibility for packs written before ranges existed — with the
    // advisory that made C0's skew invisible now stated out loud.
    const pack = goodPack();
    const ctx = goodCtx(pack);
    ctx.manifest!.engineVersion = ENGINE_VERSION;
    const r = runLoadGate(pack, ctx);
    expect(r.ok).toBe(true);
    expect(r.advisories.some((a) => a.message.includes('bare version'))).toBe(true);
  });

  it('RED: an unparseable range is refused, not silently permitted', () => {
    const pack = goodPack();
    const ctx = goodCtx(pack);
    ctx.manifest!.engineVersion = '1.0.0 - 2.0.0'; // hyphen ranges are out of grammar
    const r = runLoadGate(pack, ctx);
    expect(r.ok).toBe(false);
    expect(r.report).toContain('Hyphen ranges are not supported');
  });

  it('a missing manifest reports UNVERIFIED — never a silent pass', () => {
    const r = runLoadGate(goodPack(), { engineVersion: ENGINE_VERSION });
    expect(r.ok).toBe(true);
    const check = r.checks.find((c) => c.check === 'engine-version')!;
    expect(check.skipped).toBeDefined();
    expect(r.advisories.some((a) => a.path === 'gate.engine-version')).toBe(true);
  });
});

// --- Check 2: module ids, resolved LIVE -----------------------------------

describe('C1/P2 — gate check: module ids resolved against a booted engine', () => {
  it('the ground truth is real — a booted engine registers many modules', () => {
    // Calibration: if this returned [] the "phantom refused" test below would
    // pass for the wrong reason.
    const ids = registeredIds();
    expect(ids.length).toBeGreaterThan(20);
    expect(ids).toContain('combat-core');
  });

  it('GREEN: ids the engine actually registered are accepted', () => {
    const pack = goodPack();
    const ctx = goodCtx(pack);
    ctx.manifest!.modules = registeredIds().slice(0, 5);
    expect(runLoadGate(pack, ctx).ok).toBe(true);
  });

  it('RED: each of C0\'s nine phantoms is refused', () => {
    const phantoms = [
      'movement-core', 'npc-ai-core', 'faction-core', 'leverage-core', 'rumor-core',
      'pressure-core', 'relationship-core', 'arc-core', 'endgame-core',
    ];
    for (const phantom of phantoms) {
      const pack = goodPack();
      const ctx = goodCtx(pack);
      ctx.manifest!.modules = ['combat-core', phantom];
      const r = runLoadGate(pack, ctx);
      expect(r.ok, `${phantom} must be refused`).toBe(false);
      expect(r.report).toContain(phantom);
    }
  });

  it('the near-miss suggester fires where it can, and stays silent where it cannot', () => {
    // ⚠ THE CEILING, ASSERTED. `rumor-core → rumor-propagation` shares a stem and
    // is recoverable. `movement-core → traversal-core` and
    // `npc-ai-core → cognition-core` share no surface at all — no string metric
    // finds them. Rather than hardcode an alias table that would rot, the forge
    // is fixed at the source and this test pins what the suggester really does.
    const ids = registeredIds();
    expect(suggestModuleId('rumor-core', ids)).toBe('rumor-propagation');
    expect(suggestModuleId('movement-core', ids)).not.toBe('traversal-core');
    expect(suggestModuleId('npc-ai-core', ids)).not.toBe('cognition-core');
  });

  it('a pack-LOCAL module is accepted — the reason resolution is live', () => {
    // starter-merchant ships its own `contract-core` (C0 REPORT §4). A static
    // engine catalog would refuse a legitimate pack; the running engine knows.
    const merchant = allPacks.find((p) => p.meta.id === 'salt-road-ledger');
    expect(merchant, 'the merchant starter should exist').toBeDefined();
    const merchantIds = merchant!.createGame(SEED).moduleManager.getModules().map((m) => m.id);
    expect(merchantIds).toContain('contract-core');

    const pack = goodPack();
    const ctx: GateContext = {
      engineVersion: ENGINE_VERSION,
      registeredModuleIds: merchantIds,
      manifest: { engineVersion: `>=${ENGINE_VERSION} <99.0.0`, modules: ['contract-core'] },
    };
    expect(runLoadGate(pack, ctx).ok).toBe(true);
  });

  it('without a booted engine the check reports UNVERIFIED, not passed', () => {
    const r = runLoadGate(goodPack(), {
      engineVersion: ENGINE_VERSION,
      manifest: { engineVersion: `>=${ENGINE_VERSION} <99.0.0`, modules: ['anything-at-all'] },
    });
    const check = r.checks.find((c) => c.check === 'module-ids')!;
    expect(check.skipped).toContain('booted engine');
  });
});

// --- Check 3: content hash ------------------------------------------------

describe('C1/P2 — gate check: content hash', () => {
  it('canonicalization is order-independent for keys and order-SENSITIVE for arrays', () => {
    // Key order is formatting. Array order is content — reordering zones can
    // change which one a fallback picks — so it stays inside the hash.
    expect(canonicalize({ b: 1, a: 2 })).toBe(canonicalize({ a: 2, b: 1 }));
    expect(canonicalize([1, 2])).not.toBe(canonicalize([2, 1]));
  });

  it('REGRESSION: an undefined-valued key hashes as if absent, like JSON.stringify', () => {
    // The defect the cross-repo test caught. The hash's ONLY job is to be
    // computed on one side of a JSON serialization and verified on the other.
    // An in-memory `{ label: undefined }` used to hash as `{"label":null}` while
    // the same object after a write/read hashed as `{}` — so the exporter's hash
    // could never match the loader's, for byte-identical content.
    expect(canonicalize({ a: 1, b: undefined })).toBe(canonicalize({ a: 1 }));
    expect(canonicalize({ a: 1, b: undefined })).not.toBe(canonicalize({ a: 1, b: null }));

    // End to end: hashing before and after a JSON round-trip must agree.
    const inMemory = { zones: [{ id: 'z', name: 'Z', light: undefined }] } as unknown as ContentPack;
    const roundTripped = JSON.parse(JSON.stringify(inMemory)) as ContentPack;
    expect(computeContentHash(inMemory)).toBe(computeContentHash(roundTripped));
  });

  it('GREEN: a matching hash is accepted', () => {
    const pack = goodPack();
    expect(runLoadGate(pack, goodCtx(pack)).ok).toBe(true);
  });

  it('RED: a tampered pack is refused', () => {
    const pack = goodPack();
    const ctx = goodCtx(pack); // hash computed over the ORIGINAL
    (pack.zones as { id: string; name: string }[])[0].name = 'Tampered';
    const r = runLoadGate(pack, ctx);
    expect(r.ok).toBe(false);
    expect(r.report).toContain('Content hash mismatch');
  });

  it('the hash covers sim-affecting keys and IGNORES the rest', () => {
    const pack = goodPack();
    const before = computeContentHash(pack);

    // A session-scoped key is outside the hash by contract…
    (pack as Record<string, unknown>).buildCatalog = { archetypes: [{ id: 'a' }] };
    expect(computeContentHash(pack)).toBe(before);

    // …and a sim-affecting one is inside it.
    pack.zones!.push({ id: 'z2', name: 'Z2' });
    expect(computeContentHash(pack)).not.toBe(before);

    expect([...SIM_AFFECTING_KEYS]).toContain('zones');
    expect([...SIM_AFFECTING_KEYS]).not.toContain('buildCatalog');
  });

  it('a missing hash reports UNVERIFIED — "no hash" never reads as "hash verified"', () => {
    const pack = goodPack();
    const ctx = goodCtx(pack);
    delete ctx.manifest!.contentHash;
    const r = runLoadGate(pack, ctx);
    expect(r.ok).toBe(true);
    expect(r.checks.find((c) => c.check === 'content-hash')!.skipped).toBeDefined();
  });
});

// --- Check 4: key allowlist -----------------------------------------------

describe('C1/P2 — gate check: top-level key allowlist', () => {
  it('GREEN: a pack of declared keys only is accepted', () => {
    const pack = goodPack();
    expect(runLoadGate(pack, goodCtx(pack)).ok).toBe(true);
  });

  it('RED: C0\'s nonsense key is now REFUSED, listing the allowlist', () => {
    // C0's control: `thisKeyIsNotAThing` produced a byte-identical load report
    // to `districts`. Acceptance was not comprehension. Now it is a refusal.
    const pack = { ...goodPack(), thisKeyIsNotAThing: [{ id: 'x' }] } as unknown as ContentPack;
    const r = runLoadGate(pack, { engineVersion: ENGINE_VERSION });
    expect(r.ok).toBe(false);
    expect(r.report).toContain('thisKeyIsNotAThing');
    for (const k of ALLOWED_PACK_KEYS) expect(r.report).toContain(k);
  });

  it('the three cheap wire gaps are now DECLARED, so they pass', () => {
    const pack = {
      zones: [],
      districts: [],
      buildCatalog: {},
      progressionTrees: [],
      schemaVersion: '1.0.0',
    } as unknown as ContentPack;
    const r = runLoadGate(pack, { engineVersion: ENGINE_VERSION });
    expect(r.ok, r.report).toBe(true);
  });
});

// --- The end-to-end pair: the real forge export ---------------------------

describe('C1/P2 — the forge export, gated live', () => {
  it('the repaired manifest resolves EVERY module id against a booted engine', () => {
    // The decisive cross-repo check, and the reason it lives in this repo:
    // world-forge cannot boot a 3.8.0 engine (its engine deps are still 2.x).
    const manifest = forgeManifest();
    const ids = registeredIds();
    const unresolved = (manifest.modules as string[]).filter((id) => !ids.includes(id));
    expect(unresolved, `unresolved: ${unresolved.join(', ')}`).toEqual([]);
    expect((manifest.modules as string[]).length).toBe(12);
  });

  it('the repaired manifest declares a range this engine satisfies', () => {
    const manifest = forgeManifest();
    expect(manifest.engineVersion).toBe('>=3.8.0 <4.0.0');
    const r = runLoadGate(fixturePack(), {
      engineVersion: ENGINE_VERSION,
      registeredModuleIds: registeredIds(),
      manifest: manifest as GateContext['manifest'],
    });
    expect(r.checks.find((c) => c.check === 'engine-version')!.ok).toBe(true);
    expect(r.checks.find((c) => c.check === 'module-ids')!.ok).toBe(true);
  });

  it('the exported pack STILL fails the key allowlist — five keys remain undeclared', () => {
    // The honest remainder. C1 declared four of C0's nine unknown keys; five are
    // genuinely unknown to the engine (`items`, `playerTemplate` and the three
    // raw pass-throughs with zero hits repo-wide). The gate says so instead of
    // preserving them silently, and closing them is C3's vocabulary work.
    const r = runLoadGate(fixturePack(), {
      engineVersion: ENGINE_VERSION,
      registeredModuleIds: registeredIds(),
      manifest: forgeManifest() as GateContext['manifest'],
    });
    expect(r.ok).toBe(false);
    const check = r.checks.find((c) => c.check === 'key-allowlist')!;
    expect(check.actual).toContain('items');
    expect(check.actual).toContain('playerTemplate');
    expect(check.actual).toContain('encounterAnchors');
    expect(check.actual).toContain('factionPresences');
    expect(check.actual).toContain('pressureHotspots');
  });

  it('CROSS-REPO: the forge\'s hash implementation agrees with the engine\'s', () => {
    // ⚠ THE CHECK THAT DEFENDS A DELIBERATE DUPLICATE. world-forge cannot import
    // `computeContentHash` — its @ai-rpg-engine/* dependencies are installed at
    // 2.x (C0 checklist item 1, open), and 2.x has no such export — so it ships
    // its own copy in `content-hash.ts`. Two implementations of one algorithm in
    // two repos is exactly how DEFAULT_MODULES drifted into nine phantoms.
    //
    // So it is checked rather than trusted: the value below was computed by the
    // FORGE and committed into the manifest fixture; this recomputes it with the
    // ENGINE's implementation over the committed pack. If the two ever diverge,
    // this fails, and the divergence cannot hide.
    const manifest = forgeManifest();
    expect(manifest.contentHash, 'the exporter must stamp a hash').toBeDefined();
    expect(computeContentHash(fixturePack())).toBe(manifest.contentHash);
  });

  it('…and that hash VERIFIES through the real gate', () => {
    const r = runLoadGate(fixturePack(), {
      engineVersion: ENGINE_VERSION,
      registeredModuleIds: registeredIds(),
      manifest: forgeManifest() as GateContext['manifest'],
    });
    expect(r.checks.find((c) => c.check === 'content-hash')!.ok).toBe(true);
  });

  it('the compiled exit conditions arrived — the carried-garbled row is closed', () => {
    const pack = fixturePack();
    const conditions = (pack.zones ?? [])
      .flatMap((z) => (z as { exits?: { condition?: { type: string; params?: object } }[] }).exits ?? [])
      .map((e) => e.condition)
      .filter((c): c is { type: string; params?: object } => c !== undefined);

    expect(conditions.length).toBeGreaterThan(0);
    for (const c of conditions) {
      // `type` names a KIND from the closed grammar, never a raw source string.
      expect(c.type, `"${c.type}" should be a kind, not a grammar string`).not.toContain(':');
    }
    expect(conditions.some((c) => Object.keys(c.params ?? {}).length > 0)).toBe(true);
  });
});

// --- The seam refuses before it mutates -----------------------------------

describe('C1/P2 — applyContentPack refuses BEFORE touching the world', () => {
  it('a gate failure applies nothing at all', () => {
    // A gate that refuses after half the pack has landed is not a gate: the
    // world would carry content the engine just said it would not accept.
    const engine = hostPack().createGame(SEED);
    const before = Object.keys(engine.world.zones).length;

    const r = applyContentPack(
      engine,
      { ...goodPack(), somethingUnknown: [1] } as unknown as ContentPack,
      { channels: createStandardChannels(), gate: { engineVersion: ENGINE_VERSION } },
    );

    expect(r.ok).toBe(false);
    expect(r.gate?.ok).toBe(false);
    expect(r.applied).toEqual({});
    expect(Object.keys(engine.world.zones).length).toBe(before);
  });

  it('GREEN: a gated pack that passes DOES apply', () => {
    const engine = hostPack().createGame(SEED);
    const before = Object.keys(engine.world.zones).length;
    const pack = goodPack();

    const r = applyContentPack(engine, pack, {
      channels: createStandardChannels(),
      gate: goodCtx(pack),
    });

    expect(r.ok, JSON.stringify(r.errors)).toBe(true);
    expect(r.gate?.ok).toBe(true);
    expect(Object.keys(engine.world.zones).length).toBe(before + 1);
  });
});
