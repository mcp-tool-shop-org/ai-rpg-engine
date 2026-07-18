// Tests — webfetch adapter: URL validation, HTML processing, formatting

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { lookup } from 'node:dns/promises';
import { isAllowedUrl, isAllowedUrlResolved, formatWebfetchForPrompt } from './chat-webfetch.js';
import type { WebfetchResult } from './chat-webfetch.js';

// DNS is mocked so isAllowedUrlResolved tests are deterministic and fully
// offline — no real resolver call ever leaves the test process.
vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
}));

// --- isAllowedUrl ---

describe('isAllowedUrl', () => {
  it('allows standard https URLs', () => {
    expect(isAllowedUrl('https://example.com')).toBe(true);
    expect(isAllowedUrl('https://docs.example.com/page')).toBe(true);
  });

  it('allows http URLs', () => {
    expect(isAllowedUrl('http://example.com')).toBe(true);
  });

  it('rejects localhost', () => {
    expect(isAllowedUrl('http://localhost:3000')).toBe(false);
    expect(isAllowedUrl('https://localhost')).toBe(false);
  });

  it('rejects 127.0.0.1', () => {
    expect(isAllowedUrl('http://127.0.0.1')).toBe(false);
    expect(isAllowedUrl('http://127.0.0.1:8080')).toBe(false);
  });

  it('rejects ::1 (IPv6 loopback)', () => {
    expect(isAllowedUrl('http://[::1]')).toBe(false);
  });

  it('rejects 0.0.0.0', () => {
    expect(isAllowedUrl('http://0.0.0.0')).toBe(false);
  });

  it('rejects private 10.x.x.x ranges', () => {
    expect(isAllowedUrl('http://10.0.0.1')).toBe(false);
    expect(isAllowedUrl('http://10.255.255.255')).toBe(false);
  });

  it('rejects private 192.168.x.x ranges', () => {
    expect(isAllowedUrl('http://192.168.1.1')).toBe(false);
    expect(isAllowedUrl('http://192.168.0.100')).toBe(false);
  });

  it('rejects private 172.16-31.x.x ranges', () => {
    expect(isAllowedUrl('http://172.16.0.1')).toBe(false);
    expect(isAllowedUrl('http://172.31.255.255')).toBe(false);
  });

  it('rejects .local and .internal domains', () => {
    expect(isAllowedUrl('http://myserver.local')).toBe(false);
    expect(isAllowedUrl('http://app.internal')).toBe(false);
  });

  it('rejects non-http protocols', () => {
    expect(isAllowedUrl('ftp://example.com')).toBe(false);
    expect(isAllowedUrl('file:///etc/passwd')).toBe(false);
    expect(isAllowedUrl('javascript:alert(1)')).toBe(false);
  });

  it('rejects path traversal attempts', () => {
    // URL parser normalizes ../../ but we still catch it via href check
    expect(isAllowedUrl('http://example.com/path/..%2f..%2fetc/passwd')).toBe(false);
  });

  it('rejects invalid URLs', () => {
    expect(isAllowedUrl('not a url')).toBe(false);
    expect(isAllowedUrl('')).toBe(false);
  });

  // ollama-03 — link-local range 169.254.0.0/16 incl. cloud metadata endpoint
  it('rejects link-local 169.254.x.x (cloud metadata IMDS)', () => {
    expect(isAllowedUrl('http://169.254.169.254/latest/meta-data/')).toBe(false);
    expect(isAllowedUrl('http://169.254.169.254')).toBe(false);
    expect(isAllowedUrl('http://169.254.0.1')).toBe(false);
  });

  it('rejects IPv4-mapped IPv6 form of the metadata endpoint', () => {
    expect(isAllowedUrl('http://[::ffff:169.254.169.254]/latest/meta-data/')).toBe(false);
    expect(isAllowedUrl('http://[::ffff:a9fe:a9fe]')).toBe(false);
  });

  it('rejects IPv6 link-local (fe80::/10)', () => {
    expect(isAllowedUrl('http://[fe80::1]')).toBe(false);
    expect(isAllowedUrl('http://[fe80::abcd:1234]')).toBe(false);
  });

  it('rejects IPv6 unique-local addresses (fc00::/7)', () => {
    expect(isAllowedUrl('http://[fc00::1]')).toBe(false);
    expect(isAllowedUrl('http://[fd12:3456::1]')).toBe(false);
  });

  it('still allows a normal public URL after SSRF hardening', () => {
    expect(isAllowedUrl('https://example.com/page')).toBe(true);
    expect(isAllowedUrl('http://93.184.216.34/')).toBe(true);
  });

  // ollama-sec-A — SSRF blocklist must canonicalize the host to an IP, not
  // rely on string prefixes. Each of these reaches a blocked address through
  // an encoding the prefix checks miss.
  it('rejects IPv4-compatible IPv6 of the metadata endpoint (::a.b.c.d)', () => {
    // ::169.254.169.254 and its hex form ::a9fe:a9fe both == link-local IMDS.
    expect(isAllowedUrl('http://[::169.254.169.254]/')).toBe(false);
    expect(isAllowedUrl('http://[::a9fe:a9fe]/')).toBe(false);
  });

  it('rejects IPv4-compatible IPv6 loopback (::127.0.0.1 / ::7f00:1)', () => {
    expect(isAllowedUrl('http://[::127.0.0.1]/')).toBe(false);
    expect(isAllowedUrl('http://[::7f00:1]/')).toBe(false);
  });

  it('rejects bare GCP metadata hostnames', () => {
    expect(isAllowedUrl('http://metadata/')).toBe(false);
    expect(isAllowedUrl('http://metadata.google.internal/')).toBe(false);
  });

  it('rejects NAT64-embedded metadata endpoint (64:ff9b::/96)', () => {
    expect(isAllowedUrl('http://[64:ff9b::a9fe:a9fe]/')).toBe(false);
  });

  it('rejects 6to4-embedded metadata endpoint (2002::/16)', () => {
    expect(isAllowedUrl('http://[2002:a9fe:a9fe::]/')).toBe(false);
  });

  it('rejects CGNAT range 100.64.0.0/10', () => {
    expect(isAllowedUrl('http://100.64.0.1/')).toBe(false);
    expect(isAllowedUrl('http://100.127.255.255/')).toBe(false);
  });

  it('rejects decimal-integer IPv4 encoding of the metadata endpoint', () => {
    // 2852039166 === 169.254.169.254
    expect(isAllowedUrl('http://2852039166/')).toBe(false);
  });

  it('rejects hex IPv4 encoding of the metadata endpoint', () => {
    // 0xA9FEA9FE === 169.254.169.254
    expect(isAllowedUrl('http://0xA9FEA9FE/')).toBe(false);
  });

  it('rejects octal dotted-quad IPv4 encoding of the metadata endpoint', () => {
    // 0251.0376.0251.0376 === 169.254.169.254
    expect(isAllowedUrl('http://0251.0376.0251.0376/')).toBe(false);
  });

  it('still rejects the plain IPv4-mapped form (regression)', () => {
    expect(isAllowedUrl('http://[::ffff:169.254.169.254]/')).toBe(false);
    expect(isAllowedUrl('http://[::ffff:a9fe:a9fe]')).toBe(false);
  });

  it('still allows public URLs after full canonicalization (regression)', () => {
    expect(isAllowedUrl('https://example.com/x')).toBe(true);
    expect(isAllowedUrl('http://93.184.216.34/')).toBe(true);
    // 8.8.8.8 in decimal-integer form is public and must still pass.
    expect(isAllowedUrl('http://134744072/')).toBe(true);
  });
});

// --- isAllowedUrlResolved — F-f268b81a: isAllowedUrl() only proves a URL is
// syntactically safe. Any hostname that is not already an IP literal sails
// through it unresolved, so a single attacker-controlled DNS record (no
// rebinding/TOCTOU needed) pointing at a blocked address defeats the entire
// IP-literal blocklist. isAllowedUrlResolved() is the check webfetch() must
// actually gate on: it resolves the hostname and runs every returned address
// through the same blocklist before allowing the real fetch.
describe('isAllowedUrlResolved', () => {
  beforeEach(() => {
    vi.mocked(lookup).mockReset();
  });

  it('rejects a hostname whose DNS record resolves to the cloud metadata address', async () => {
    vi.mocked(lookup).mockResolvedValue([{ address: '169.254.169.254', family: 4 }] as never);
    await expect(isAllowedUrlResolved('http://attacker-controlled.example/')).resolves.toBe(false);
  });

  it('rejects a hostname whose DNS record resolves to a loopback address', async () => {
    vi.mocked(lookup).mockResolvedValue([{ address: '127.0.0.1', family: 4 }] as never);
    await expect(isAllowedUrlResolved('http://rebind.example/')).resolves.toBe(false);
  });

  it('rejects a hostname whose DNS record resolves to a private RFC1918 address', async () => {
    vi.mocked(lookup).mockResolvedValue([{ address: '10.0.0.5', family: 4 }] as never);
    await expect(isAllowedUrlResolved('http://internal.example/')).resolves.toBe(false);
  });

  it('allows a hostname that resolves to a normal public IP', async () => {
    vi.mocked(lookup).mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
    await expect(isAllowedUrlResolved('https://example.com/')).resolves.toBe(true);
  });

  it('rejects when ANY resolved address is blocked, even if others are public', async () => {
    vi.mocked(lookup).mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ] as never);
    await expect(isAllowedUrlResolved('https://mixed.example/')).resolves.toBe(false);
  });

  it('rejects a blocked IPv6 resolution (unique-local)', async () => {
    vi.mocked(lookup).mockResolvedValue([{ address: 'fd12:3456::1', family: 6 }] as never);
    await expect(isAllowedUrlResolved('https://v6.example/')).resolves.toBe(false);
  });

  it('rejects when DNS resolution fails (NXDOMAIN etc.)', async () => {
    vi.mocked(lookup).mockRejectedValue(Object.assign(new Error('queryA ENOTFOUND'), { code: 'ENOTFOUND' }));
    await expect(isAllowedUrlResolved('https://nonexistent.example/')).resolves.toBe(false);
  });

  it('rejects when DNS resolution does not settle within the resolve timeout', async () => {
    vi.mocked(lookup).mockImplementation(() => new Promise(() => {})); // never resolves
    await expect(isAllowedUrlResolved('https://slow-dns.example/', 20)).resolves.toBe(false);
  });

  it('rejects a resolution with zero addresses', async () => {
    vi.mocked(lookup).mockResolvedValue([] as never);
    await expect(isAllowedUrlResolved('https://empty.example/')).resolves.toBe(false);
  });

  it('short-circuits on a syntactically-blocked host without ever calling DNS', async () => {
    await expect(isAllowedUrlResolved('http://localhost/')).resolves.toBe(false);
    await expect(isAllowedUrlResolved('http://127.0.0.1/')).resolves.toBe(false);
    await expect(isAllowedUrlResolved('http://myserver.internal/')).resolves.toBe(false);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('short-circuits on an already-public IP literal without calling DNS', async () => {
    await expect(isAllowedUrlResolved('https://93.184.216.34/')).resolves.toBe(true);
    expect(lookup).not.toHaveBeenCalled();
  });
});

// --- formatWebfetchForPrompt ---

describe('formatWebfetchForPrompt', () => {
  it('formats successful result with external markers', () => {
    const result: WebfetchResult = {
      ok: true,
      url: 'https://example.com/article',
      title: 'Game Design Patterns',
      content: 'This article discusses faction-based game design.',
      truncatedTo: 47,
      fetchedAt: '2025-01-15T10:00:00Z',
    };
    const formatted = formatWebfetchForPrompt(result);
    expect(formatted).toContain('--- EXTERNAL REFERENCE (not project truth) ---');
    expect(formatted).toContain('Source: https://example.com/article');
    expect(formatted).toContain('Title: Game Design Patterns');
    expect(formatted).toContain('Fetched: 2025-01-15T10:00:00Z');
    expect(formatted).toContain('faction-based game design');
    expect(formatted).toContain('--- End External Reference ---');
  });

  it('formats failed result with error', () => {
    const result: WebfetchResult = {
      ok: false,
      url: 'https://example.com/gone',
      title: '',
      content: '',
      truncatedTo: 0,
      fetchedAt: '2025-01-15T10:00:00Z',
      error: 'HTTP 404: Not Found',
    };
    const formatted = formatWebfetchForPrompt(result);
    expect(formatted).toContain('[EXTERNAL — fetch failed]');
    expect(formatted).toContain('https://example.com/gone');
    expect(formatted).toContain('HTTP 404');
  });

  it('clearly separates external from project truth', () => {
    const result: WebfetchResult = {
      ok: true,
      url: 'https://example.com',
      title: 'Test',
      content: 'Content',
      truncatedTo: 7,
      fetchedAt: '2025-01-01T00:00:00Z',
    };
    const formatted = formatWebfetchForPrompt(result);
    // Must contain the "not project truth" marker
    expect(formatted).toMatch(/not project truth/i);
  });
});

// --- webfetch (structural tests — no real HTTP) ---

describe('webfetch — URL validation pre-check', () => {
  // Import lazily since webfetch makes real HTTP calls
  it('rejects disallowed URLs without network call', async () => {
    const { webfetch } = await import('./chat-webfetch.js');
    const result = await webfetch('http://localhost:3000/secret');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('not allowed');
  });

  it('rejects private IP without network call', async () => {
    const { webfetch } = await import('./chat-webfetch.js');
    const result = await webfetch('http://192.168.1.1/admin');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('not allowed');
  });

  it('rejects file: protocol without network call', async () => {
    const { webfetch } = await import('./chat-webfetch.js');
    const result = await webfetch('file:///etc/passwd');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('not allowed');
  });
});

// v2.6 audit F-f268b81a — webfetch() must gate the real fetch() call on the
// DNS-RESOLVED address, not just the syntactic hostname check. A domain an
// attacker controls (any registrable domain, A record pointed at a blocked
// address) previously sailed straight through to fetch().
describe('webfetch — DNS-resolution SSRF gate (F-f268b81a)', () => {
  beforeEach(() => {
    vi.mocked(lookup).mockReset();
  });

  it('rejects a hostname whose DNS record resolves to a blocked IP, and never calls fetch', async () => {
    vi.mocked(lookup).mockResolvedValue([{ address: '169.254.169.254', family: 4 }] as never);
    const realFetch = globalThis.fetch;
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    try {
      const { webfetch } = await import('./chat-webfetch.js');
      const result = await webfetch('http://attacker-controlled.example/');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('not allowed');
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('allows a hostname that resolves to a normal public address through to fetch', async () => {
    vi.mocked(lookup).mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
    const realFetch = globalThis.fetch;
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      headers: new Headers({ 'content-type': 'text/plain' }),
      text: async () => 'hello',
    })) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;
    try {
      const { webfetch } = await import('./chat-webfetch.js');
      const result = await webfetch('https://public.example/');
      expect(result.ok).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
