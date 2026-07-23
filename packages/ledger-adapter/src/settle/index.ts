// settle-impl barrel — the adapter's enable/settle logic and the pure
// reconciliation verifier. Internal helpers (the seed cache, executeDeltas,
// retryPending, memo-field parsing) stay private to their owning modules.
//
// settleEquipmentNFTs (P3) is the NFT unique-gear settlement path — the
// sibling of createLedgerAdapter's enable/settle for the fungible layer. See
// nft.ts's header for its determinism + idempotency discipline.

export { createLedgerAdapter } from './adapter.js';
export type { LedgerAdapterDeps } from './adapter.js';

export { reconcile, deriveCurrencyCode } from './reconcile.js';

export { settleEquipmentNFTs, ARPG_NFT_TAXON } from './nft.js';
export type { NFTSettlementResult } from './nft.js';
