// Transport barrel — the two LedgerTransport implementations behind one
// contract (../contracts.ts): DryRunTransport (Phase 1, offline/
// deterministic) and TestnetTransport (Phase 2, real xrpl.js testnet I/O).

export { DryRunTransport } from './dry-run.js';
export { TestnetTransport } from './testnet.js';
// XrplClientLike is deliberately NOT re-exported: the injected-client seam is
// test-only (`TestnetTransport.forTests`) and must not appear on the public barrel.
