// guard.ts — the mainnet-impossible-in-code guard (security-impl domain).
//
// Ports escape-the-valley's backpack.py `BackpackManager.__init__` host check
// (see TESTNET_HOSTS / the ValueError on a non-testnet host). The "no real
// value at risk" guarantee for this package is STRUCTURAL: it is enforced by
// this function running before any transport ever opens a connection, not by
// a config flag someone could flip. `LedgerAdapterConfig.network` is typed as
// the literal `'testnet'` (contracts.ts) — the only way a non-testnet host
// could ever reach a transport is a hand-constructed URL, which is exactly
// what this guard exists to catch.
//
// Unlike backpack.py's `allow_non_testnet` escape hatch, there is DELIBERATELY
// no override here. escape-the-valley's own comment on that flag calls it
// "not a supported configuration" — v1 of this package simply does not offer
// it: every endpoint URL must resolve through `resolveTestnetEndpoint` before
// a transport uses it, full stop.

/**
 * Ripple's public XRPL Testnet + Devnet hosts — the ONLY hosts this package
 * will ever connect to. Mirrors escape-the-valley's `TESTNET_HOSTS`.
 */
export const TESTNET_HOSTS: ReadonlySet<string> = new Set([
  's.altnet.rippletest.net', // XRPL Testnet
  's.devnet.rippletest.net', // XRPL Devnet
]);

/** XRPL `server_info` network_id values this package will sign against.
 *  1 = Testnet, 2 = Devnet. Mainnet is 0 and is refused. */
export const TESTNET_NETWORK_IDS: ReadonlySet<number> = new Set([1, 2]);

/** Mainnet's `server_info.network_id` — named so a refuse path never uses a bare 0. */
export const MAINNET_NETWORK_ID = 0;

function coerceNetworkId(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return Number(value.trim());
  return undefined;
}

/**
 * Post-connect identity check: `server_info` must name a known test/dev
 * network. Hostname allowlisting alone is not enough — a DNS/proxy that
 * presents an allowed host (or an operator pointed at Devnet) has to be
 * matched against the ledger's own `network_id` / `network`. Fails closed
 * on missing identity, mainnet (0 / "mainnet"), and anything else.
 * Throws a plain `Error` (same class as {@link assertTestnetHost}).
 */
export function assertTestnetLedgerIdentity(info: {
  network_id?: unknown;
  network?: unknown;
}): void {
  const id = coerceNetworkId(info.network_id);
  const name = typeof info.network === 'string' ? info.network.trim().toLowerCase() : '';
  const idOk = id !== undefined && TESTNET_NETWORK_IDS.has(id);
  const nameOk = name === 'testnet' || name === 'devnet';

  if (id === MAINNET_NETWORK_ID || name === 'mainnet') {
    throw new Error(
      `ledger-adapter refuses non-testnet ledger identity (network_id=${String(info.network_id)}, ` +
        `network=${JSON.stringify(info.network)}): the "no real value at risk" guarantee is ` +
        `testnet-only and is enforced in code, not by configuration. Allowed network_id: 1 (testnet), ` +
        `2 (devnet). There is no override in this package.`,
    );
  }

  if (idOk || nameOk) return;

  throw new Error(
    `ledger-adapter refuses unrecognized ledger identity (network_id=${String(info.network_id)}, ` +
      `network=${JSON.stringify(info.network)}): the "no real value at risk" guarantee requires a ` +
      `known test/dev network after connect(). Allowed network_id: 1 (testnet), 2 (devnet). ` +
      `There is no override in this package.`,
  );
}

/**
 * `testnet` vs `devnet` from an already-allowed host. Unknown-but-allowed
 * hosts (there are none today) default to `testnet`.
 */
export function networkNameFromEndpoint(url: string): 'testnet' | 'devnet' {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === 's.devnet.rippletest.net') return 'devnet';
  } catch {
    // Unparseable URLs are refused by assertTestnetHost before this runs.
  }
  return 'testnet';
}

function allowedHostsList(): string {
  return [...TESTNET_HOSTS].sort().join(', ');
}

/**
 * Parse `url`'s host and throw a clear, actionable `Error` if it is not on
 * `TESTNET_HOSTS`. Accepts `ws://`, `wss://`, `http://`, `https://` — all four
 * are "special schemes" under the WHATWG URL Standard, so `URL#hostname`
 * parses the authority correctly for each (port is stripped automatically).
 *
 * An unparseable `url` is refused too (never silently treated as "not
 * obviously mainnet, so allow it") — the guard fails closed on garbage input
 * exactly as it fails closed on a real mainnet host.
 */
export function assertTestnetHost(url: string): void {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch (cause) {
    throw new Error(
      `ledger-adapter refuses unparseable endpoint ${JSON.stringify(url)}: the "no real value ` +
        `at risk" guarantee requires a well-formed ws(s)/http(s) testnet URL. ` +
        `Allowed hosts: ${allowedHostsList()}.`,
      { cause },
    );
  }

  if (!TESTNET_HOSTS.has(host)) {
    throw new Error(
      `ledger-adapter refuses non-testnet host ${JSON.stringify(host)} (from ${JSON.stringify(url)}): ` +
        `the "no real value at risk" guarantee is testnet-only and is enforced in code, not by ` +
        `configuration. Allowed hosts: ${allowedHostsList()}. There is no override in this package ` +
        `— point the transport at one of the allowed hosts.`,
    );
  }
}

/**
 * Returns `url` unchanged iff `assertTestnetHost(url)` passes; throws
 * otherwise. The single call every transport constructor should route its
 * endpoint URL through before opening a connection.
 */
export function resolveTestnetEndpoint(url: string): string {
  assertTestnetHost(url);
  return url;
}
