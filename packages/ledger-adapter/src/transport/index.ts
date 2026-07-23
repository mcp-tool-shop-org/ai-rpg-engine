// Transport barrel — the dry-run implementation of LedgerTransport (Phase 1,
// offline/deterministic). Phase 2 adds a sibling testnet transport behind the
// same LedgerTransport contract declared in ../contracts.ts.

export { DryRunTransport } from './dry-run.js';
