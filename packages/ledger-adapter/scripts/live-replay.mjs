#!/usr/bin/env node
// live-replay.mjs — the LIVE synthetic-vs-live acceptance for
// @ai-rpg-engine/ledger-adapter. The `run_proof()` analogue (see
// escape-the-valley/src/escape_the_valley/ledger_proof.py): drives the FULL
// adapter end-to-end against REAL XRPL Testnet — faucet wallets, issuer
// opt-in flags, trust lines, mint, a real token-escrow settlement
// (create -> wait out FinishAfter -> finish), then independently
// RECONCILEs on-chain balances + on-chain memos against the engine's own
// bookkeeping. The ledger is an EXTERNAL VERIFIER (a different system family
// than the adapter): a PASS here means real XRPL state independently
// confirms the adapter's settlement math — the adapter cannot fake this.
//
// Deliberately NOT part of the vitest suite (CI must never hit testnet from
// a unit-test run) and NOT auto-run by anything — a human (or a script
// runner) invokes this explicitly, once, when a live proof is wanted:
//
//   npx tsc -p packages/ledger-adapter/tsconfig.json   # build dist/ first
//   node packages/ledger-adapter/scripts/live-replay.mjs
//
// Imports from the BUILT dist/ (not src/) because this is a plain Node ESM
// script with no TypeScript loader — `tsc` above is what makes it runnable.
//
// Exit 0 iff reconcile() PASSES. Exit 1 on a reconcile FAIL or a setup/
// settlement failure. Writes scripts/live-replay-receipt.json (addresses +
// txids + balances + the full reconcile report) so the result is
// independently checkable without re-running the chain. NEVER writes a
// seed anywhere (DECOMPOSE_BY_SECRETS) — the receipt holds addresses only;
// every wallet here is a throwaway testnet faucet wallet regardless.

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { TestnetTransport, createLedgerAdapter, createInitialState, reconcile, deriveCurrencyCode } from '../dist/index.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const RECEIPT_PATH = join(SCRIPT_DIR, 'live-replay-receipt.json');

const TESTNET_WSS = 'wss://s.altnet.rippletest.net:51233';
const EXPLORER = (hash) => `https://testnet.xrpl.org/transactions/${hash}`;

const GAME_ID = 'live-replay';
const RUN_ID = `run-${Date.now()}`;
const RUN_SEED = Date.now();

const ENABLE_SNAPSHOT = { coin: 1000, items: { potion: 3 } };
const SPEND_SNAPSHOT = { coin: 750, items: { potion: 3 } }; // coin -250 (one token-escrow create->finish)
const CHECKPOINT = 1;
const LOCATION = 'live-replay-market';

// ── LIVE FINDING (discovered by this run against real testnet; NOT
// reproducible in the dry-run suite, which never validates currency-code
// SYNTAX) ────────────────────────────────────────────────────────────────
//
// settle-impl's `deriveCurrencyCode` (src/settle/reconcile.ts) is a bare
// `resourceKey.toUpperCase()` with no length handling. XRPL standard
// currency codes must be EXACTLY 3 ASCII characters; `deriveCurrencyCode`
// turns the MANDATORY `coin` field (fixed by TradeableSnapshot's contract —
// every snapshot has one) into `'COIN'` (4 chars) and `'potion'` into
// `'POTION'` (6 chars). xrpl.js rejects both client-side before submission
// ("Unsupported Currency representation: COIN") — confirmed live against
// real testnet in this script's first run (two real AccountSet txs landed,
// then trustSet(player, COIN) failed this way; see live-replay-receipt.json
// history / this session's report for the txids). state-impl's
// `assignTokenCode` (src/state/state.ts) already solves this correctly
// (collision-safe 3-char codes) but adapter.ts never calls it — it wires up
// `deriveCurrencyCode` instead. Root-cause fix belongs in settle-impl
// (src/settle/reconcile.ts and/or adapter.ts), which is OUT OF SCOPE for
// this worktree (transport-impl may only touch src/transport/** and
// scripts/**). Two workarounds below, both entirely within this script:
//
//  1. Pre-seed `state.tokenMap` with valid 3-char codes BEFORE enable().
//     `currencyCodeFor` (adapter.ts) checks `state.tokenMap[key]` FIRST and
//     only falls back to the buggy deriver when absent — and `tokenMap` is
//     PUBLIC, documented state (contracts.ts's own doc comment gives
//     `coin->'COI'` as the example). This keeps enable()/settle() on valid
//     wire codes end-to-end with zero settle-impl edits.
//  2. reconcile() (settle-impl) independently calls the SAME
//     `deriveCurrencyCode` when building its resource-check rows — it does
//     NOT consult `state.tokenMap` (ReconcileInput carries no tokenMap by
//     design, per reconcile.ts's own header comment). So reconcile() will
//     look for the `coin` resource under 'COIN', not the real wire code
//     'COI' this script actually queries. When building `ledgerBalances`
//     for the reconcile() call (Stage 5 below), each REAL, live-queried
//     balance is re-keyed under `deriveCurrencyCode(resourceKey)` — the
//     NUMBER is 100% live chain data either way; only the dictionary KEY is
//     translated to match reconcile()'s independent derivation. The raw
//     wire-code balances are ALSO printed/receipted unmodified alongside
//     the translated map, so nothing is obscured.
const WIRE_CURRENCY_CODE = { coin: 'COI', potion: 'POT' };

// ── Stage reporting (mirrors the Phase-0 spike's PASS/FAIL banner style) ──

const stages = [];
function record(stage, ok, note) {
  stages.push({ stage, ok, note });
  const tag = ok ? 'PASS' : 'FAIL';
  console.log(`[${tag}] ${stage}${note ? '  — ' + note : ''}`);
}

// ── A recording transport wrapper (scripts/-local; does not touch src/) ──
//
// Delegates every call to the real TestnetTransport, additionally logging
// (and collecting) every produced tx hash + explorer URL as it happens, for
// BOTH the enable() phase and the settle() phase — the adapter's public
// EnableResult/SettlementResult don't surface every intermediate hash, so
// this is the only way to print (and receipt) the complete tx list.
function wrapWithRecorder(transport, txLog) {
  const record = (method) => async (...args) => {
    const result = await transport[method](...args);
    if (result && typeof result === 'object') {
      if (result.ok && result.hash) {
        txLog.push({ method, hash: result.hash, code: result.code });
        console.log(`  [OK]   ${method.padEnd(14)} ${result.hash}`);
        console.log(`         ${EXPLORER(result.hash)}`);
      } else if (!result.ok) {
        console.log(`  [FAIL] ${method.padEnd(14)} code=${result.code ?? '?'} ${result.error ?? ''}`);
      }
    }
    return result;
  };
  return {
    get networkName() {
      return transport.networkName;
    },
    connect: (...a) => transport.connect(...a),
    disconnect: (...a) => transport.disconnect(...a),
    fundWallet: (...a) => transport.fundWallet(...a),
    walletFromSeed: (...a) => transport.walletFromSeed(...a),
    setAccountFlag: record('setAccountFlag'),
    trustSet: record('trustSet'),
    payment: record('payment'),
    escrowCreate: record('escrowCreate'),
    escrowFinish: record('escrowFinish'),
    accountLines: (...a) => transport.accountLines(...a),
    accountTx: (...a) => transport.accountTx(...a),
  };
}

/** Scan `addresses` via account_tx and merge every decoded on-chain memo
 *  into one `{ txid: memoText }` map — the genuinely EXTERNAL half of memo
 *  verification (ledger_proof.py's `fetch_onchain_memos`). Scans every
 *  party (issuer/player/merchant) rather than assuming which account ends
 *  up carrying which memo. */
async function fetchOnchainMemos(transport, addresses) {
  const memos = {};
  for (const address of addresses) {
    const entries = await transport.accountTx(address, 100);
    for (const entry of entries) {
      if (entry.memo !== undefined && !(entry.hash in memos)) {
        memos[entry.hash] = entry.memo;
      }
    }
  }
  return memos;
}

async function main() {
  console.log('=== @ai-rpg-engine/ledger-adapter — LIVE testnet replay ===');
  console.log(`network: ${TESTNET_WSS}`);
  console.log(`game=${GAME_ID} run=${RUN_ID}\n`);

  const rawTransport = new TestnetTransport(TESTNET_WSS);
  record('0-guard', true, `constructed against ${TESTNET_WSS} without throwing (mainnet-impossible-in-code guard passed)`);

  const txLog = [];
  const transport = wrapWithRecorder(rawTransport, txLog);

  const config = { mode: 'ledger', issuerMode: 'per-run', settlement: 'token-escrow', network: 'testnet' };
  const adapter = createLedgerAdapter(transport, config, {
    gameId: GAME_ID,
    runId: RUN_ID,
    now: () => new Date().toISOString(),
  });
  const state = createInitialState(config);
  // Workaround 1 (see the LIVE FINDING note above `WIRE_CURRENCY_CODE`):
  // pre-seed the public, documented tokenMap so enable()/settle() submit
  // valid 3-char XRPL currency codes instead of falling back to the buggy
  // deriveCurrencyCode() for these keys.
  state.tokenMap = { ...WIRE_CURRENCY_CODE };

  try {
    console.log('\n=== Stage 1: connect ===');
    await rawTransport.connect();
    record('1-connect', true, 'connected to testnet');

    console.log('\n=== Stage 2: enable() — faucet 3 wallets, issuer flags, trust lines, mint ===');
    const enableResult = await adapter.enable(state, ENABLE_SNAPSHOT);
    record('2-enable', enableResult.success, enableResult.message);
    if (!enableResult.success) {
      throw new Error(`enable() failed: ${enableResult.message}`);
    }
    console.log(`  issuer:   ${state.issuerAddress}`);
    console.log(`  player:   ${state.playerAddress}`);
    console.log(`  merchant: ${state.merchantAddress}`);

    // Captured right after enable() completes — exactly what got minted,
    // before any settlement delta. Mirrors ledger_proof.py's
    // `minted_initial = dict(state.backpack.last_settled_supplies)`.
    const mintedInitial = { ...state.lastSettled };

    console.log(
      `\n=== Stage 3: settle() checkpoint ${CHECKPOINT} — spend coin ${ENABLE_SNAPSHOT.coin} -> ${SPEND_SNAPSHOT.coin} ` +
        '(drives a real token EscrowCreate -> wait out FinishAfter -> EscrowFinish) ===',
    );
    const settleResult = await adapter.settle(state, SPEND_SNAPSHOT, CHECKPOINT, LOCATION);
    record('3-settle', settleResult.success, settleResult.message);
    if (!settleResult.success) {
      throw new Error(`settle() failed: ${settleResult.message}`);
    }

    console.log('\n=== Stage 4: fetch on-chain memos (account_tx, external verification) ===');
    const onchainMemos = await fetchOnchainMemos(rawTransport, [
      state.issuerAddress,
      state.playerAddress,
      state.merchantAddress,
    ]);
    record('4-onchain-memos', Object.keys(onchainMemos).length > 0, `${Object.keys(onchainMemos).length} memo(s) fetched`);

    console.log("\n=== Stage 5: fetch on-chain balances (account_lines, player's trust lines) ===");
    const playerLines = await rawTransport.accountLines(state.playerAddress);
    const rawWireBalances = {};
    for (const line of playerLines) {
      rawWireBalances[line.currency] = Number(line.balance);
    }
    console.log('  raw wire-code balances (real, unmodified account_lines read):');
    for (const [code, balance] of Object.entries(rawWireBalances)) {
      console.log(`    ${code}: ${balance}`);
    }

    // Workaround 2 (LIVE FINDING note above `WIRE_CURRENCY_CODE`): reconcile()
    // independently re-derives the currency code per resource key via the
    // same buggy deriveCurrencyCode(), ignoring tokenMap. Re-key each REAL
    // queried balance under that expected key so the comparison is
    // meaningful — the NUMBER is unmodified live chain data either way.
    const ledgerBalances = {};
    for (const resourceKey of Object.keys(WIRE_CURRENCY_CODE)) {
      const wireCode = WIRE_CURRENCY_CODE[resourceKey];
      ledgerBalances[deriveCurrencyCode(resourceKey)] = rawWireBalances[wireCode] ?? 0;
    }
    console.log('  translated for reconcile() (see LIVE FINDING note — same numbers, reconcile-expected keys):');
    for (const [code, balance] of Object.entries(ledgerBalances)) {
      console.log(`    ${code}: ${balance}`);
    }
    record('5-balances', true, `${playerLines.length} trust line(s) read`);

    console.log('\n=== Stage 6: reconcile() — the external verifier ===');

    function printReport(report, label) {
      console.log(`\n  -- ${label} --`);
      console.log('  Resource   Code  Minted  ΣDeltas  Engine  Ledger  Balance  Conservation');
      for (const r of report.resources) {
        console.log(
          `  ${r.resource.padEnd(9)} ${r.code.padEnd(5)} ${String(r.minted).padStart(6)}  ${String(r.sumDeltas).padStart(6)}  ` +
            `${String(r.engineSettled).padStart(6)}  ${String(r.ledger ?? '—').padStart(6)}  ` +
            `${r.balanceOk ? 'OK' : 'FAIL'}       ${r.conservationOk ? 'OK' : 'FAIL'}`,
        );
      }
      console.log(`  memoOk=${report.memoOk} (local=${report.memoLocalOk} onchain=${report.onchainMemoOk})`);
      console.log(`  settlements=${report.settlementsCount} pending=${report.pendingCount}`);
      if (report.notes.length > 0) {
        console.log('  notes:');
        for (const note of report.notes) console.log(`    - ${note}`);
      }
      console.log(`  passed=${report.passed}`);
    }

    const strictInput = {
      runId: RUN_ID,
      seed: RUN_SEED,
      mintedInitial,
      ledgerBalances,
      lastSettled: state.lastSettled,
      settlements: state.settlements,
      pending: state.pending,
      playerAddress: state.playerAddress,
      issuerAddress: state.issuerAddress,
      onchainMemos,
    };
    const reportStrict = reconcile(strictInput);
    printReport(reportStrict, 'STRICT — onchainMemos supplied (authoritative for exit code)');

    // LIVE FINDING #2 (also settle-impl, out of scope; also NOT reproducible
    // by the dry-run suite in the same way — dry-run/adapter tests never feed
    // a REAL escrow's two distinct txids through a REAL memo fetch): reconcile()
    // requires EVERY txid in a settlement record to carry a matching on-chain
    // memo (src/settle/reconcile.ts's onchain-memo loop iterates ALL of
    // `rec.txids`). But the escrow settlement primitive's EscrowFinish NEVER
    // carries a memo BY DESIGN — contracts.ts's frozen `escrowFinish` signature
    // has no memo parameter at all, matching dry-run.ts's explicit comment
    // ("the interface gives escrowFinish no memo parameter of its own").
    // adapter.ts's executeDeltas() pushes BOTH the EscrowCreate hash (memo)
    // AND the EscrowFinish hash (no memo) into the SAME settlement record's
    // `txids`. So onchainMemoOk is structurally unreachable for ANY
    // escrow-settled (i.e. any spend/negative-delta) record — confirmed here
    // against REAL testnet data, not a transport or on-chain problem: every
    // transaction above landed tesSUCCESS with correct balances and
    // conservation. reconcile.test.ts's own only passing on-chain-memo test
    // (settle/reconcile.test.ts: "passes external memo integrity when
    // onchainMemos correctly resolves every txid") only exercises this by
    // fabricating a memo for BOTH of two fake txids — a shape that does not
    // occur on a real escrow settlement's actual chain data.
    //
    // Shown here for transparency using reconcile()'s OWN documented
    // "network-free / local-only" call shape (omitting `onchainMemos` is a
    // first-class supported mode per reconcile.ts's header comment and its
    // own "passes on a fully consistent run" test) — not a script-side
    // workaround, and NOT what determines this script's exit code.
    const { onchainMemos: _omittedForLocalOnly, ...localOnlyInput } = strictInput;
    const reportLocalOnly = reconcile(localOnlyInput);
    printReport(reportLocalOnly, "LOCAL-ONLY — no onchainMemos (reconcile's own documented fallback mode; informational)");

    const report = reportStrict; // authoritative: determines exit code + receipt.passed
    record(
      '6-reconcile',
      report.passed,
      report.passed ? 'PASS' : `FAIL (strict on-chain-memo check) — local-only=${reportLocalOnly.passed ? 'PASS' : 'FAIL'}; see LIVE FINDING #2`,
    );

    console.log('\n=== Receipts ===');
    for (const entry of txLog) {
      console.log(`  ${entry.method.padEnd(14)} ${entry.hash}  ${EXPLORER(entry.hash)}`);
    }

    const receipt = {
      network: 'testnet',
      gameId: GAME_ID,
      runId: RUN_ID,
      timestamp: new Date().toISOString(),
      wallets: {
        issuer: state.issuerAddress,
        player: state.playerAddress,
        merchant: state.merchantAddress,
      },
      enableResult,
      settleResult,
      txLog: txLog.map((e) => ({ ...e, explorer: EXPLORER(e.hash) })),
      // Raw = real, unmodified account_lines read (real wire currency codes
      // from state.tokenMap). translatedForReconcile = same real numbers,
      // re-keyed under reconcile()'s independently-derived expected codes —
      // see the LIVE FINDING note near WIRE_CURRENCY_CODE above.
      finalBalances: { raw: rawWireBalances, translatedForReconcile: ledgerBalances },
      reconcile: report, // strict (onchainMemos supplied) — authoritative
      reconcileLocalOnly: reportLocalOnly, // informational — see LIVE FINDING #2
      knownFindings: [
        {
          id: 'LIVE-FINDING-1-CURRENCY-CODE-LENGTH',
          file: 'packages/ledger-adapter/src/settle/reconcile.ts',
          function: 'deriveCurrencyCode',
          description:
            "deriveCurrencyCode(resourceKey) is a bare resourceKey.toUpperCase() with no length handling. " +
            "TradeableSnapshot's mandatory 'coin' field derives to 'COIN' (4 chars); real XRPL standard " +
            "currency codes must be exactly 3 characters. xrpl.js rejects it client-side before submission " +
            '("Unsupported Currency representation: COIN") — confirmed against real testnet in an earlier ' +
            'run of this script (2 real AccountSet txs landed, then trustSet(player, COIN) failed this way). ' +
            'state-impl already solves this correctly (src/settle/../state/state.ts assignTokenCode, ' +
            'collision-safe 3-char codes) but adapter.ts never calls it. NOT reproducible by the dry-run ' +
            'suite: DryRunTransport never validates currency-code syntax. Worked around in THIS script only ' +
            '(out of transport-impl scope to fix at the source) by pre-seeding the public, documented ' +
            'state.tokenMap before enable() — see WIRE_CURRENCY_CODE above.',
          workaroundInThisScript: 'pre-seed state.tokenMap with 3-char codes before enable()',
        },
        {
          id: 'LIVE-FINDING-2-ESCROW-MEMO-INTEGRITY-GAP',
          file: 'packages/ledger-adapter/src/settle/reconcile.ts',
          function: 'reconcile (external on-chain memo check)',
          description:
            'The on-chain memo loop requires EVERY txid in a settlement record to resolve to a matching ' +
            'on-chain memo. adapter.ts\'s escrow settlement path (executeDeltas, for any negative/spend ' +
            'delta) pushes BOTH the EscrowCreate hash (carries the memo) and the EscrowFinish hash (NEVER ' +
            'carries a memo — contracts.ts\'s frozen escrowFinish signature has no memo parameter, matching ' +
            "dry-run.ts's explicit design) into the SAME record's txids. onchainMemoOk is therefore " +
            'structurally unreachable for any escrow-settled record. Confirmed against real testnet data in ' +
            'this run: every transaction (including EscrowCreate and EscrowFinish) landed tesSUCCESS with ' +
            "correct balances and conservation — reconcileLocalOnly (reconcile()'s own documented " +
            'onchainMemos-omitted mode) passes on the identical data. reconcile.test.ts\'s only passing ' +
            'on-chain-memo test fabricates a memo for both of two FAKE txids, a shape a real escrow ' +
            'settlement never actually produces on-chain.',
          evidence: { note: 'see txLog above for the real EscrowCreate/EscrowFinish hashes from this run' },
        },
      ],
      stages,
      passed: report.passed,
    };
    writeFileSync(RECEIPT_PATH, JSON.stringify(receipt, null, 2));
    console.log(`\nReceipt written to ${RECEIPT_PATH}`);

    const passCount = stages.filter((s) => s.ok).length;
    console.log(`\n=== SUMMARY: ${passCount}/${stages.length} stages PASS — reconcile ${report.passed ? 'PASS' : 'FAIL'} ===`);

    process.exitCode = report.passed ? 0 : 1;
  } catch (err) {
    record('FATAL', false, err?.message ?? String(err));
    console.error('\nFATAL:', err);
    try {
      writeFileSync(
        RECEIPT_PATH,
        JSON.stringify(
          {
            network: 'testnet',
            gameId: GAME_ID,
            runId: RUN_ID,
            timestamp: new Date().toISOString(),
            wallets: {
              issuer: state.issuerAddress,
              player: state.playerAddress,
              merchant: state.merchantAddress,
            },
            txLog: txLog.map((e) => ({ ...e, explorer: EXPLORER(e.hash) })),
            stages,
            error: err?.message ?? String(err),
            passed: false,
          },
          null,
          2,
        ),
      );
      console.error(`Partial receipt written to ${RECEIPT_PATH}`);
    } catch {
      // Best-effort only — never let receipt-writing mask the real failure.
    }
    process.exitCode = 1;
  } finally {
    await rawTransport.disconnect();
  }
}

main().catch((err) => {
  console.error('FATAL (unhandled):', err);
  process.exitCode = 2;
});
