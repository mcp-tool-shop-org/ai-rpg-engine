# C1 — the load gate, run live (the before/after pair)

Captured on branch `feat/c1-contract-v1`. Engine v3.8.0 · world-forge v4.5.0.

This sits beside [`../c0-alignment/e2e-transcript.md`](../c0-alignment/e2e-transcript.md),
which recorded the same chain accepting the same pack. That is the pair.

## C0's transcript, for reference

A pack stamped `engineVersion: '2.0.0'`, carrying nine keys the engine does not
declare, validated clean against a 3.8.0 engine and exited 0:

```
$ node packages/cli/dist/bin.js validate packages/cli/src/__fixtures__/c0-forge-pack.json
✓ Content valid: packages/cli/src/__fixtures__/c0-forge-pack.json
  Content loaded: 3 entities, 3 zones, 1 dialogues, 0 quests
$ echo $?
0
```

---

## 1. The same pack, same command, gate on

The pack is now REFUSED on its own — no manifest needed, because the key
allowlist alone catches five undeclared keys. Note the three checks it could not
run: they say so rather than passing silently.

```
$ node packages/cli/dist/bin.js validate packages/cli/src/__fixtures__/c0-forge-pack.json

Content pack REFUSED — 1 of 4 load-gate checks failed.

✗ key-allowlist
  Content pack carries 5 keys the engine does not declare.
  expected: only these top-level keys: schemaVersion, entities, zones, dialogues, quests, abilities, statuses, verbs, archetypes, backgrounds, itemUseEffects, districts, buildCatalog, progressionTrees
  actual:   unknown keys: items, playerTemplate, encounterAnchors, factionPresences, pressureHotspots
  fix:      Remove the key, or add it to the engine's ContentPack type AND to ALLOWED_PACK_KEYS. Silently preserving unknown keys is what made a typo indistinguishable from real content (C0 REPORT §3.1).

⚠ NOT VERIFIED — engine-version: no manifest supplied to check against
⚠ NOT VERIFIED — module-ids: no manifest supplied to check against
⚠ NOT VERIFIED — content-hash: no manifest supplied to check against
$ echo $?
1
```

## 2. With the manifest the exporter USED to write — three of four fail

The old manifest verbatim: `engineVersion: '2.0.0'`, the eighteen module ids
including C0's nine phantoms, and a hash that does not match the content.

```
$ node packages/cli/dist/bin.js validate packages/cli/src/__fixtures__/c0-forge-pack.json --manifest ./stale-manifest.json

Content pack REFUSED — 3 of 4 load-gate checks failed.

✗ engine-version
  This pack targets "2.0.0"; the running engine is 3.8.0.
  expected: a range satisfied by engine 3.8.0
  actual:   engineVersion: "2.0.0"
  fix:      Re-export the pack against 3.8.0, or widen the range if it is genuinely compatible. A version claim nothing checks is how eight minor releases of drift went unnoticed (C0 REPORT §5).

✗ content-hash
  Content hash mismatch — the pack does not match the hash its manifest records.
  expected: sha256:0000000000000000000000000000000000000000000000000000000000000000
  actual:   sha256:d053d297128b2400ad44308362867e03e5f09a47f1e037b54dee37eff883473b
  fix:      The hash covers entities, zones, dialogues, quests, abilities, statuses, verbs, itemUseEffects, districts. Either the content was edited after export, or the manifest is stale. Re-export rather than updating the hash by hand.

✗ key-allowlist
  Content pack carries 5 keys the engine does not declare.
  expected: only these top-level keys: schemaVersion, entities, zones, dialogues, quests, abilities, statuses, verbs, archetypes, backgrounds, itemUseEffects, districts, buildCatalog, progressionTrees
  actual:   unknown keys: items, playerTemplate, encounterAnchors, factionPresences, pressureHotspots
  fix:      Remove the key, or add it to the engine's ContentPack type AND to ALLOWED_PACK_KEYS. Silently preserving unknown keys is what made a typo indistinguishable from real content (C0 REPORT §3.1).

⚠ NOT VERIFIED — module-ids: requires a booted engine to resolve ids against
$ echo $?
1
```

## 3. With the REPAIRED manifest — the version and hash checks pass

Same pack, same command, the manifest world-forge now writes:

```
$ node packages/cli/dist/bin.js validate packages/cli/src/__fixtures__/c0-forge-pack.json --manifest packages/cli/src/__fixtures__/c1-forge-manifest.json

Content pack REFUSED — 1 of 4 load-gate checks failed.

✗ key-allowlist
  ... (as above — five keys remain genuinely undeclared)

✓ passed: engine-version, content-hash
⚠ NOT VERIFIED — module-ids: requires a booted engine to resolve ids against
$ echo $?
1
```

**The pack still fails, and that is the correct outcome.** `items`,
`playerTemplate`, `encounterAnchors`, `factionPresences` and `pressureHotspots`
are genuinely unknown to the engine — the last three with zero hits repo-wide
(C0 REPORT §6.2, §6.4). C1 declared four of C0's nine unknown keys because those
four had real engine consumers; declaring the other five would be inventing a
vocabulary, which is C3's work. The gate names them instead of preserving them
in silence.

## 4. What only the engine can check: module ids, resolved live

`validate` has no booted engine, so it reports module resolution as unverified
rather than guessing. The resolution runs where a `ModuleManager` exists —
`packages/cli/src/c1-gate.test.ts`, against a real `createGame`:

- all twelve ids in the repaired manifest resolve
- each of C0's nine phantoms is refused, by name
- `starter-merchant`'s pack-local `contract-core` is ACCEPTED, which a static
  engine catalog would have wrongly refused

## Reproducing

```bash
cd E:/AI/ai-rpg-engine && npm run build
node packages/cli/dist/bin.js validate packages/cli/src/__fixtures__/c0-forge-pack.json
node packages/cli/dist/bin.js validate packages/cli/src/__fixtures__/c0-forge-pack.json --manifest packages/cli/src/__fixtures__/c1-forge-manifest.json
```

```bash
cd E:/AI/ai-rpg-engine && npx vitest run packages/cli/src/c1-
```

The fixtures are regenerated by world-forge's
`packages/export-ai-rpg/src/__tests__/c0-export-table.test.ts`, which writes both
the pack and (new in C1) the manifest.
