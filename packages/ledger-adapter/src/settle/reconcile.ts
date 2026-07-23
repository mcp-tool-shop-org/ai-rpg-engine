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
    const code = deriveCurrencyCode(key);
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

      for (const txid of rec.txids) {
        const actual = onchainMemos[txid];
        if (actual === undefined) {
          onchainMemoOk = false;
          notes.push(
            `checkpoint ${rec.checkpoint}: no on-chain memo for txid ${JSON.stringify(txid)} (external integrity)`,
          );
        } else if (prefix === null || !actual.startsWith(prefix)) {
          onchainMemoOk = false;
          notes.push(
            `checkpoint ${rec.checkpoint}: on-chain memo ${JSON.stringify(actual)} does not start with expected prefix (external integrity)`,
          );
        }
      }
    }
  }

  // Authoritative verdict: external on-chain check when available, else
  // honestly-scoped local consistency.
  const memoOk = onchainMemoOk ?? memoLocalOk;

  if (input.pending.length > 0) {
    notes.push(`${input.pending.length} settlement(s) still pending (unsettled on ledger)`);
  }

  const txids: string[] = [];
  for (const rec of input.settlements) txids.push(...rec.txids);

  const passed =
    resources.every((r) => r.balanceOk && r.conservationOk) && memoOk && input.pending.length === 0;

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
    passed,
    notes,
  };
};
