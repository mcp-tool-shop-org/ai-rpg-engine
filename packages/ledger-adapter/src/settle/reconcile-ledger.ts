// settle-impl — fetch on-ledger truth, then call the PURE reconcile().
//
// Hosts used to copy the same glue: accountLines → ledgerBalances,
// accountTx → onchainMemos, accountNfts → buildLedgerNfts. This module is
// that glue. It does NOT change reconcile()'s contract (reconcile.ts stays
// network-free). mintedInitial prefers the caller's stash, then
// state.mintedInitial (persisted at first enable), never lastSettled.

import type {
  LedgerAdapterState,
  LedgerTransport,
  NFTInfo,
  NFTTransport,
  ReconcileReport,
} from '../contracts.js';
import { reconcile } from './reconcile.js';
import { buildLedgerNfts } from './nft.js';

export type ReconcileAgainstLedgerOpts = {
  runId: string;
  seed: number;
  /** Override opening mint. Defaults to `state.mintedInitial` (not lastSettled). */
  mintedInitial?: Record<string, number>;
  /** Accepted for the advertised API; reconcile() still reads gameId from memos. */
  gameId?: string;
};

function asNftTransport(transport: LedgerTransport): NFTTransport | undefined {
  const candidate = transport as LedgerTransport & Partial<NFTTransport>;
  return typeof candidate.accountNfts === 'function' ? (candidate as NFTTransport) : undefined;
}

async function ledgerBalancesOf(
  transport: LedgerTransport,
  address: string,
): Promise<Record<string, number>> {
  const lines = await transport.accountLines(address);
  const balances: Record<string, number> = {};
  for (const line of lines) balances[line.currency] = Number(line.balance);
  return balances;
}

async function onchainMemosOf(
  transport: LedgerTransport,
  addresses: readonly string[],
): Promise<Record<string, string>> {
  const memos: Record<string, string> = {};
  for (const address of addresses) {
    if (!address) continue;
    const entries = await transport.accountTx(address, 50);
    for (const entry of entries) {
      if (entry.memo !== undefined && !(entry.hash in memos)) {
        memos[entry.hash] = entry.memo;
      }
    }
  }
  return memos;
}

/**
 * Fetch account_lines / account_tx / (when unique-gear is tracked) account_nfts
 * and run {@link reconcile}. Coordinator-invoked — never inside the tick.
 */
export async function reconcileAgainstLedger(
  transport: LedgerTransport,
  state: LedgerAdapterState,
  opts: ReconcileAgainstLedgerOpts,
): Promise<ReconcileReport> {
  const ledgerBalances = state.playerAddress
    ? await ledgerBalancesOf(transport, state.playerAddress)
    : {};
  const onchainMemos = await onchainMemosOf(transport, [
    state.issuerAddress,
    state.playerAddress,
    state.merchantAddress,
  ]);

  const nftRefs = Object.values(state.nfts ?? {});
  let ledgerNfts: Record<string, { owner: string; uri: string }> | undefined;
  if (nftRefs.length > 0 && state.playerAddress) {
    const nftTransport = asNftTransport(transport);
    if (nftTransport) {
      const owned: NFTInfo[] = await nftTransport.accountNfts(state.playerAddress);
      ledgerNfts = buildLedgerNfts(owned, state.playerAddress);
    }
  }

  return reconcile({
    runId: opts.runId,
    seed: opts.seed,
    mode: state.mode,
    mintedInitial: opts.mintedInitial ?? state.mintedInitial ?? {},
    ledgerBalances,
    lastSettled: state.lastSettled,
    settlements: state.settlements,
    pending: state.pending,
    playerAddress: state.playerAddress,
    issuerAddress: state.issuerAddress,
    onchainMemos,
    tokenMap: state.tokenMap,
    nfts: nftRefs.length > 0 ? nftRefs : undefined,
    ledgerNfts,
  });
}
