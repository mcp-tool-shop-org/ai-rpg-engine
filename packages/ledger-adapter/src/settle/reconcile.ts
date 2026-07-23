// settle-impl — the pure reconciliation verifier (the EXTERNAL_VERIFIER).
// Ports escape-the-valley's ledger_proof.py::reconcile() to the generic
// (non-fixed-resource-set) TS contract. PURE: no network, no xrpl import, no
// imports beyond ../contracts.js — unit-testable entirely offline, exactly
// like the Python original (tests/test_ledger_proof.py).
//
// The ledger is a DIFFERENT SYSTEM FAMILY than the engine: a PASS here means
// on-ledger token balances independently confirm the engine's settlement
// deltas. The engine cannot fake the ledger (ANDON_AUTHORITY: any per-resource
// or memo mismatch fails the whole report — no green-washing a partial pass).

import type {
  NFTCheck,
  ReconcileFn,
  ReconcileInput,
  ReconcileReport,
  ResourceCheck,
  SettlementRecord,
} from '../contracts.js';
import { settlementMemoPrefix } from '../contracts.js';

// ── Currency-code derivation ─────────────────────────────────────────────
//
// ledger_proof.py looks up a fixed 5-resource XRPL_TOKEN_MAP (food->FOD, ...).
// This package's TradeableSnapshot is generic (`coin` + an open-ended `items`
// record), so there is no fixed map — and ReconcileInput deliberately carries
// no tokenMap (it is a pure, network-free input shape owned by contracts.ts).
// `code` is therefore a STATELESS, deterministic function of the resource key
// alone. adapter.ts imports this exact function (rather than inventing a
// second mapping) so the two derivations can never drift apart — the only
// property that matters for internal consistency. A real XRPL standard
// currency code is exactly 3 chars; Phase 1 (dry-run) does not need that
// constraint, so this is intentionally simple over strictly protocol-shaped.
// If a future phase needs true 3-char codes reconciled externally, thread an
// explicit tokenMap through ReconcileInput (a contracts.ts change) rather
// than smuggling one in here.
export function deriveCurrencyCode(resourceKey: string): string {
  return resourceKey.toUpperCase();
}

// ── Memo grammar helpers ─────────────────────────────────────────────────
//
// buildSettlementMemo's grammar is `ARPG|GAME:<id>|RUN:<id>|CHECKPOINT:<n>|...`
// (contracts.ts). ReconcileInput carries `runId` but no `gameId` — gameId is
// embedded IN the memo itself, so we read it back out of the very memo we are
// validating (matches the task grounding: "derive gameId from the memo").

function extractMemoField(memo: string, field: string): string | null {
  const prefix = `${field}:`;
  const segment = memo.split('|').find((part) => part.startsWith(prefix));
  return segment === undefined ? null : segment.slice(prefix.length);
}

function extractGameId(memo: string): string | null {
  return extractMemoField(memo, 'GAME');
}

// ── Aggregation helpers ──────────────────────────────────────────────────

/** Sum signed deltas for `key` across SETTLED records only (mirrors
 *  ledger_proof.py: pending deltas have not happened on-chain yet, so they
 *  must not be folded into the conservation equation). */
function sumSettledDeltas(settlements: SettlementRecord[], key: string): number {
  let total = 0;
  for (const rec of settlements) {
    const delta = rec.deltas[key];
    if (delta !== undefined) total += delta;
  }
  return total;
}

/** Every resource key ever mentioned anywhere in the input — the union of
 *  mintedInitial, lastSettled, and every settlement/pending record's deltas.
 *  Sorted for deterministic report ordering (mirrors `sorted(XRPL_RESOURCES)`
 *  in the Python original). */
function collectResourceKeys(input: ReconcileInput): string[] {
  const keys = new Set<string>();
  for (const key of Object.keys(input.mintedInitial)) keys.add(key);
  for (const key of Object.keys(input.lastSettled)) keys.add(key);
  for (const rec of input.settlements) {
    for (const key of Object.keys(rec.deltas)) keys.add(key);
  }
  for (const rec of input.pending) {
    for (const key of Object.keys(rec.deltas)) keys.add(key);
  }
  return Array.from(keys).sort();
}

// ── reconcile() ───────────────────────────────────────────────────────────

export const reconcile: ReconcileFn = (input: ReconcileInput): ReconcileReport => {
  const notes: string[] = [];

  // Per-resource balance + conservation checks.
  const resources: ResourceCheck[] = collectResourceKeys(input).map((key) => {
    // Prefer the adapter's OWN minted code (state.tokenMap, threaded via
    // ReconcileInput.tokenMap) so the verifier looks up `ledgerBalances` by the
    // exact currency code that reached the ledger. Fall back to the stateless
    // derivation only for a synthetic/local reconcile that controls both sides.
    const code = input.tokenMap?.[key] ?? deriveCurrencyCode(key);
    const minted = input.mintedInitial[key] ?? 0;
    const engineSettled = input.lastSettled[key] ?? 0;
    const sumDeltas = sumSettledDeltas(input.settlements, key);
    const ledger: number | null = code in input.ledgerBalances ? input.ledgerBalances[code] : null;

    const balanceOk = ledger !== null && ledger === engineSettled;
    const conservationOk = minted + sumDeltas === engineSettled;

    if (ledger === null) {
      notes.push(`${key}: no on-ledger balance for ${code}`);
    } else if (!balanceOk) {
      notes.push(`${key}: ledger ${ledger} != engine settled ${engineSettled} (${code})`);
    }
    if (!conservationOk) {
      notes.push(
        `${key}: minted ${minted} + deltas ${sumDeltas} (${minted + sumDeltas}) != settled ${engineSettled}`,
      );
    }

    return { resource: key, code, minted, sumDeltas, engineSettled, ledger, balanceOk, conservationOk };
  });

  // Local consistency: the engine-stored memo on each SETTLED record must
  // begin with ARPG|GAME:<id>|RUN:<runId>|CHECKPOINT:<n> for ITS OWN
  // checkpoint, where <id> is read back out of the memo itself (no gameId is
  // threaded through ReconcileInput — see deriveCurrencyCode's comment for
  // why). This proves the record is internally consistent — the engine wrote
  // this string, so it is NOT an integrity proof on its own.
  let memoLocalOk = true;
  for (const rec of input.settlements) {
    const gameId = extractGameId(rec.memo);
    if (gameId === null) {
      memoLocalOk = false;
      notes.push(
        `checkpoint ${rec.checkpoint}: stored memo ${JSON.stringify(rec.memo)} has no GAME segment (local consistency)`,
      );
      continue;
    }
    const prefix = settlementMemoPrefix(gameId, input.runId, rec.checkpoint);
    if (!rec.memo.startsWith(prefix)) {
      memoLocalOk = false;
      notes.push(
        `checkpoint ${rec.checkpoint}: stored memo ${JSON.stringify(rec.memo)} does not start with ${JSON.stringify(prefix)} (local consistency)`,
      );
    }
  }

  // External integrity: the decoded ON-CHAIN memo (supplied by the driver,
  // keyed by txid) must begin with the same header. The engine cannot fake
  // this — it is reading signed bytes back off the ledger. `undefined` input
  // means "no on-chain memos supplied" -> stays network-free, verdict is null.
  let onchainMemoOk: boolean | null;
  if (input.onchainMemos === undefined) {
    onchainMemoOk = null;
    notes.push(
      'memo: no on-chain memos supplied — external integrity NOT verified; memoOk reflects local consistency only',
    );
  } else {
    const onchainMemos = input.onchainMemos;
    onchainMemoOk = true;
    for (const rec of input.settlements) {
      const gameId = extractGameId(rec.memo);
      const prefix = gameId === null ? null : settlementMemoPrefix(gameId, input.runId, rec.checkpoint);

      // A settled record with NO txids cannot be verified on-chain. Without
      // this guard the loop below is simply empty and the record would pass
      // external integrity VACUOUSLY — a proof must never pass without any
      // on-ledger evidence for a claimed settlement.
      if (rec.txids.length === 0) {
        onchainMemoOk = false;
        notes.push(`checkpoint ${rec.checkpoint}: no txids to verify on-chain (external integrity)`);
        continue;
      }

      // Attestation requires that AT LEAST ONE of the record's txids carries the
      // expected on-chain memo — not that EVERY txid does. An escrow settlement
      // legitimately produces two txids: EscrowCreate (carries the memo) and
      // EscrowFinish (carries NONE — contracts.ts's escrowFinish has no memo
      // parameter, matching a real on-chain EscrowFinish). A memo-less txid is
      // therefore skipped, not failed; a PRESENT-but-WRONG memo is tampering and
      // fails; and a record where no txid carried the expected memo fails (no
      // external attestation). (LIVE-FINDING-2, wave-2: the prior "every txid
      // must match" made onchainMemoOk structurally unreachable for any escrow-
      // settled record — invisible to the dry-run suite, caught by the live
      // testnet replay.)
      let matched = false;
      for (const txid of rec.txids) {
        const actual = onchainMemos[txid];
        if (actual === undefined) continue; // this tx carries no memo (e.g. EscrowFinish) — legitimate
        if (prefix !== null && actual.startsWith(prefix)) {
          matched = true;
        } else {
          onchainMemoOk = false;
          notes.push(
            `checkpoint ${rec.checkpoint}: on-chain memo ${JSON.stringify(actual)} does not start with expected prefix (external integrity)`,
          );
        }
      }
      if (!matched) {
        onchainMemoOk = false;
        notes.push(
          `checkpoint ${rec.checkpoint}: no txid carried the expected on-chain memo (external integrity)`,
        );
      }
    }
  }

  // Authoritative verdict: external on-chain check when available, else
  // honestly-scoped local consistency.
  const memoOk = onchainMemoOk ?? memoLocalOk;

  // Per-item NFT ownership + URI checks (P4) — the 1-of-1 OWNERSHIP family,
  // distinct from the fungible ResourceCheck balance/conservation family
  // above. ADDITIVE: input.nfts absent/empty -> nftChecks stays undefined and
  // the fungible-only verdict is completely unchanged (nftOk below is then
  // vacuously true). When present, EVERY NFTCheck must pass for the overall
  // report to pass — the engine cannot fake unique-gear ownership any more
  // than it can fake a fungible ledger balance.
  let nftChecks: NFTCheck[] | undefined;
  if (input.nfts !== undefined && input.nfts.length > 0) {
    if (input.ledgerNfts === undefined) {
      notes.push(
        'nfts: no on-ledger NFT data supplied — NFT ownership NOT verified; every check fails (no vacuous pass)',
      );
    }
    nftChecks = input.nfts.map((ref) => {
      const gameItemId = ref.gameItemId;
      const nftId = ref.nftId;
      const expectedOwner = input.playerAddress ?? '';
      const expectedUri = ref.uri;

      // On-ledger truth (account_nfts, keyed by nftId). `led === undefined`
      // covers BOTH "ledgerNfts wasn't supplied at all" and "this specific
      // nftId is absent from what WAS supplied" — either way there is no
      // on-ledger evidence, so ownedOnLedger/ledgerUri/uriOk/ok are honestly
      // false (never a vacuous pass — the NFT analogue of the settled-record
      // "no txids to verify on-chain" guard above).
      const led = input.ledgerNfts?.[nftId];
      const ownedOnLedger = led !== undefined && led.owner === expectedOwner;
      const ledgerUri = led?.uri ?? null;
      const uriOk = ledgerUri !== null && ledgerUri === expectedUri;
      const ok = ownedOnLedger && uriOk;

      if (!ownedOnLedger) {
        notes.push(`${gameItemId}: NFT ${nftId} not owned by ${expectedOwner} on-ledger`);
      }
      if (!uriOk) {
        notes.push(
          `${gameItemId}: NFT ${nftId} on-ledger URI ${JSON.stringify(ledgerUri)} != expected URI ${JSON.stringify(expectedUri)}`,
        );
      }

      return { gameItemId, nftId, expectedOwner, ownedOnLedger, expectedUri, ledgerUri, uriOk, ok };
    });
  }

  if (input.pending.length > 0) {
    notes.push(`${input.pending.length} settlement(s) still pending (unsettled on ledger)`);
  }

  const txids: string[] = [];
  for (const rec of input.settlements) txids.push(...rec.txids);

  // NFT checks fold into `passed` exactly like resources/memoOk/pending: an
  // absent input.nfts leaves nftChecks undefined -> nftOk vacuously true ->
  // existing fungible-only behavior is UNCHANGED (all pre-P4 reconcile tests
  // stay green).
  const nftOk = nftChecks === undefined || nftChecks.every((c) => c.ok);

  const passed =
    resources.every((r) => r.balanceOk && r.conservationOk) &&
    memoOk &&
    input.pending.length === 0 &&
    nftOk;

  return {
    runId: input.runId,
    seed: input.seed,
    playerAddress: input.playerAddress ?? '',
    issuerAddress: input.issuerAddress ?? '',
    settlementsCount: input.settlements.length,
    pendingCount: input.pending.length,
    txids,
    resources,
    memoOk,
    memoLocalOk,
    onchainMemoOk,
    nftChecks,
    passed,
    notes,
  };
};
