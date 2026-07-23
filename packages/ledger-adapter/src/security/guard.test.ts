// guard.test.ts — the mainnet-impossible-in-code guard.
//
// Proves the STRUCTURAL half of "no real value at risk": a non-testnet host
// is rejected by code (no config flag involved), and the two Ripple public
// test networks are accepted.

import { describe, it, expect } from 'vitest';
import { TESTNET_HOSTS, assertTestnetHost, resolveTestnetEndpoint } from './guard.js';

describe('guard — TESTNET_HOSTS', () => {
  it('contains exactly the two allowed testnet hosts', () => {
    expect([...TESTNET_HOSTS].sort()).toEqual(['s.altnet.rippletest.net', 's.devnet.rippletest.net']);
  });
});

describe('guard — rejects mainnet (structural, not config)', () => {
  const mainnetUrls = ['wss://s1.ripple.com', 'wss://xrplcluster.com', 'https://s2.ripple.com'];

  for (const url of mainnetUrls) {
    it(`assertTestnetHost throws for ${url}`, () => {
      expect(() => assertTestnetHost(url)).toThrow();
    });

    it(`the thrown message names the offending host for ${url}`, () => {
      const host = new URL(url).hostname;
      let message = '';
      try {
        assertTestnetHost(url);
      } catch (err) {
        message = (err as Error).message;
      }
      expect(message).toContain(host);
      // Also names the allowed set so the error is actionable.
      expect(message).toContain('s.altnet.rippletest.net');
      expect(message).toContain('s.devnet.rippletest.net');
    });

    it(`resolveTestnetEndpoint also throws for ${url}`, () => {
      expect(() => resolveTestnetEndpoint(url)).toThrow();
    });
  }

  it('is case-insensitive when rejecting a mainnet host (still rejected)', () => {
    expect(() => assertTestnetHost('wss://S1.RIPPLE.COM')).toThrow();
  });

  it('throws (fails closed) on an unparseable URL rather than allowing it', () => {
    expect(() => assertTestnetHost('not a url at all')).toThrow();
  });

  it('rejects a plausible-but-wrong lookalike host', () => {
    // Not on the allowlist even though it echoes "rippletest.net" as a suffix
    // of a longer, different hostname.
    expect(() => assertTestnetHost('wss://evil.s.altnet.rippletest.net.attacker.example')).toThrow();
  });
});

describe('guard — accepts testnet', () => {
  it('assertTestnetHost passes for the altnet Testnet host with a port', () => {
    expect(() => assertTestnetHost('wss://s.altnet.rippletest.net:51233')).not.toThrow();
  });

  it('assertTestnetHost passes for the Devnet host with a port', () => {
    expect(() => assertTestnetHost('wss://s.devnet.rippletest.net:51233')).not.toThrow();
  });

  it('accepts http(s) schemes too, not just ws(s)', () => {
    expect(() => assertTestnetHost('https://s.altnet.rippletest.net:51234/')).not.toThrow();
    expect(() => assertTestnetHost('http://s.devnet.rippletest.net:51234/')).not.toThrow();
  });

  it('is case-insensitive when accepting a testnet host', () => {
    expect(() => assertTestnetHost('wss://S.ALTNET.RIPPLETEST.NET:51233')).not.toThrow();
  });

  it('resolveTestnetEndpoint returns the altnet url unchanged', () => {
    const url = 'wss://s.altnet.rippletest.net:51233';
    expect(resolveTestnetEndpoint(url)).toBe(url);
  });

  it('resolveTestnetEndpoint returns the devnet url unchanged', () => {
    const url = 'wss://s.devnet.rippletest.net:51233';
    expect(resolveTestnetEndpoint(url)).toBe(url);
  });
});
