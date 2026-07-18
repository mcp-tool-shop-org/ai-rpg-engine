// Webfetch adapter — optional external URL retrieval.
// Explicit, opt-in, source-citing, clearly separated from project truth.
// Chat must never silently mix external content with local project facts.
// Uses Node native fetch (>= 20) and the node:dns builtin. Zero npm deps.

import { lookup } from 'node:dns/promises';

// --- Types ---

export type WebfetchResult = {
  ok: boolean;
  url: string;
  /** Page title extracted from <title> or first heading. */
  title: string;
  /** Text content extracted from the page (HTML stripped). */
  content: string;
  /** Content was truncated to this length. */
  truncatedTo: number;
  /** ISO timestamp of when this was fetched. */
  fetchedAt: string;
  /** Error message if fetch failed. */
  error?: string;
};

export type WebfetchOptions = {
  /** Max content characters to extract. */
  maxChars?: number;
  /** Request timeout in milliseconds. */
  timeoutMs?: number;
};

// --- Validation ---

/** Is this IPv4 (as 4 octets) in a private/loopback/link-local/CGNAT range? */
function isBlockedV4(o: readonly number[]): boolean {
  const [a, b] = o;
  if (a === 0) return true; // 0.0.0.0/8 "this host"
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 10) return true; // 10.0.0.0/8 private
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local incl. cloud IMDS 169.254.169.254
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  return false;
}

/** Parse a normalized dotted-quad host to 4 octets, or null. The WHATWG URL
 *  parser already canonicalizes decimal/hex/octal IPv4 (e.g. 2852039166,
 *  0xA9FEA9FE, 0251.0376.0251.0376) to dotted-decimal, so we only see a.b.c.d. */
function parseV4(host: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const o = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  return o.every((n) => n <= 255) ? o : null;
}

/** Parse a (URL-normalized, compressed-hex) IPv6 literal to 16 bytes, or null.
 *  The URL parser converts embedded dotted-v4 forms to hex groups, so we only
 *  parse standard compressed hex here. */
function parseV6(host: string): number[] | null {
  const h = host.split('%')[0]; // drop any zone id
  if (!h.includes(':')) return null;
  const dbl = h.indexOf('::');
  let groups: string[];
  if (dbl >= 0) {
    if (h.indexOf('::', dbl + 1) >= 0) return null; // only one '::' allowed
    const left = h.slice(0, dbl).split(':').filter((s) => s !== '');
    const right = h.slice(dbl + 2).split(':').filter((s) => s !== '');
    const missing = 8 - left.length - right.length;
    if (missing < 0) return null;
    groups = [...left, ...Array(missing).fill('0'), ...right];
  } else {
    groups = h.split(':');
  }
  if (groups.length !== 8) return null;
  const bytes: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(g)) return null;
    const v = parseInt(g, 16);
    bytes.push((v >>> 8) & 255, v & 255);
  }
  return bytes;
}

/** Extract a tunnelled IPv4 from IPv6 embedding schemes (mapped/compatible/
 *  NAT64/6to4), so a blocked v4 cannot reach us wrapped in IPv6. */
function embeddedV4(b: readonly number[]): number[] | null {
  const zero = (lo: number, hi: number) => b.slice(lo, hi).every((x) => x === 0);
  // ::ffff:a.b.c.d  (IPv4-mapped) and ::a.b.c.d (deprecated IPv4-compatible)
  if (zero(0, 10) && b[10] === 0xff && b[11] === 0xff) return b.slice(12, 16);
  if (zero(0, 12)) return b.slice(12, 16);
  // 64:ff9b::/96 NAT64 (RFC 6052) — embedded v4 in the last 32 bits
  if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b && zero(4, 12)) return b.slice(12, 16);
  // 2002::/16 6to4 — embedded v4 in bytes 2..5
  if (b[0] === 0x20 && b[1] === 0x02) return b.slice(2, 6);
  return null;
}

/**
 * Only allow http/https URLs to PUBLIC hosts. Canonicalizes the host to an IP
 * (the URL parser normalizes decimal/hex/octal IPv4 and compresses IPv6) and
 * rejects private/loopback/link-local/CGNAT ranges and their IPv6 tunnels
 * (IPv4-mapped/compatible, NAT64, 6to4), plus known internal hostnames.
 */
export function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');

    // Known-internal hostnames (incl. the bare cloud-metadata alias).
    if (host === 'localhost' || host === 'metadata') return false;
    if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost')) return false;

    // IPv4 literal (already canonicalized to dotted-decimal by the URL parser).
    const v4 = parseV4(host);
    if (v4) return !isBlockedV4(v4) && !traversal(parsed);

    // IPv6 literal.
    const v6 = parseV6(host);
    if (v6) {
      if (v6.every((x, i) => x === 0 || (i === 15 && x === 1))) return false; // ::1 loopback (and :: unspecified)
      if (v6[0] === 0xfe && (v6[1] & 0xc0) === 0x80) return false; // fe80::/10 link-local
      if ((v6[0] & 0xfe) === 0xfc) return false; // fc00::/7 unique-local
      const emb = embeddedV4(v6);
      if (emb && isBlockedV4(emb)) return false;
      return !traversal(parsed);
    }

    // Otherwise a DNS name: syntactically fine, but NOT proven safe. A name
    // is not an address — it is only safe once resolved. This function does
    // not resolve DNS, so a hostname reaching this line has NOT been checked
    // against the blocklist above at all; a single attacker-controlled A/AAAA
    // record pointing at a blocked address sails straight through. Callers
    // that will actually issue the request MUST use isAllowedUrlResolved()
    // below instead of (or in addition to) this function — webfetch() does.
    return !traversal(parsed);
  } catch {
    return false;
  }
}

function traversal(parsed: URL): boolean {
  return parsed.pathname.includes('..') || parsed.href.includes('..');
}

// --- DNS-resolved validation (the gate webfetch() actually enforces) ---

/** Default budget for the DNS resolution step in isAllowedUrlResolved(). */
const DEFAULT_RESOLVE_TIMEOUT_MS = 5_000;

/**
 * The real SSRF gate: isAllowedUrl() plus DNS resolution for plain hostnames.
 *
 * isAllowedUrl() only proves a URL is *syntactically* safe — it blocks
 * IP-literal hosts (every encoding form: decimal/hex/octal v4, compressed
 * v6, IPv4-mapped/compatible/NAT64/6to4 tunnels) and a short list of known-
 * internal hostnames, but for any OTHER hostname it falls through to "DNS
 * name: allow" without ever resolving it. That gap needs no DNS-rebinding or
 * TOCTOU timing trick to exploit: an attacker registers any domain, points
 * its A record at 127.0.0.1 / 169.254.169.254 (cloud metadata) / an internal
 * 10.x address, and the resulting URL sails through every check above and
 * would be fetched for real (v2.6 audit F-f268b81a).
 *
 * This function closes that gap. A host that is already an IP literal is
 * fully validated by isAllowedUrl() alone. A DNS name is resolved (every
 * address it maps to, via dns.promises.lookup) and each resolved address is
 * run through the SAME blocklist isAllowedUrl() applies to literals — the
 * URL is rejected if any resolved address is blocked, or if resolution
 * itself fails or does not complete within resolveTimeoutMs (fail closed).
 */
export async function isAllowedUrlResolved(
  url: string,
  resolveTimeoutMs = DEFAULT_RESOLVE_TIMEOUT_MS,
): Promise<boolean> {
  if (!isAllowedUrl(url)) return false;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  // Already fully validated (or rejected) as an IP literal by isAllowedUrl().
  if (parseV4(host) || parseV6(host)) return true;

  // A plain DNS name: resolve it and validate every address it maps to
  // before this URL may be treated as allowed.
  return resolvesToOnlyPublicAddresses(host, resolveTimeoutMs);
}

/**
 * True only when `hostname` resolves to at least one address and every
 * resolved address is public. Any failure mode — resolver error, empty
 * answer, or a resolution that does not settle within `timeoutMs` — rejects
 * (fail closed): an SSRF guard that hangs open on a slow or broken resolver
 * defeats its own purpose.
 */
async function resolvesToOnlyPublicAddresses(hostname: string, timeoutMs: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const addresses = await Promise.race([
      lookup(hostname, { all: true, verbatim: true }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('DNS resolution timed out')), timeoutMs);
      }),
    ]);
    if (!Array.isArray(addresses) || addresses.length === 0) return false;
    return addresses.every(({ address, family }) => isPublicResolvedAddress(address, family));
  } catch {
    return false;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Applies the same blocklist isAllowedUrl() uses for literals to a resolved address. */
function isPublicResolvedAddress(address: string, family: number): boolean {
  if (family === 4) {
    const v4 = parseV4(address);
    return !!v4 && !isBlockedV4(v4);
  }
  if (family === 6) {
    const v6 = parseV6(address);
    if (!v6) return false;
    if (v6.every((x, i) => x === 0 || (i === 15 && x === 1))) return false; // ::1 loopback / :: unspecified
    if (v6[0] === 0xfe && (v6[1] & 0xc0) === 0x80) return false; // fe80::/10 link-local
    if ((v6[0] & 0xfe) === 0xfc) return false; // fc00::/7 unique-local
    const emb = embeddedV4(v6);
    if (emb && isBlockedV4(emb)) return false;
    return true;
  }
  return false; // unknown address family — fail closed
}

// --- HTML text extraction ---

function extractTitle(html: string): string {
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/is);
  if (titleMatch) return titleMatch[1].trim();
  const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/is);
  if (h1Match) return stripTags(h1Match[1]).trim();
  return '';
}

function stripTags(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// --- Fetch ---

/** Max redirect hops webfetch() will follow before giving up (fail closed). */
const MAX_REDIRECTS = 5;

export async function webfetch(url: string, options?: WebfetchOptions): Promise<WebfetchResult> {
  const maxChars = options?.maxChars ?? 4000;
  const timeoutMs = options?.timeoutMs ?? 10_000;
  const fetchedAt = new Date().toISOString();

  const failClosed = (error: string): WebfetchResult => ({
    ok: false, url, title: '', content: '', truncatedTo: 0, fetchedAt, error,
  });

  // Validating only the initial URL is NOT enough: fetch()'s default
  // redirect:'follow' would follow a 3xx to an internal/loopback/link-local/
  // metadata address entirely inside undici, re-resolving and connecting to
  // each hop with no further SSRF check — a public URL that redirects to
  // 127.0.0.1 / 169.254.169.254 / a 10.x host bypasses the guard outright,
  // no DNS control required (v2.6 audit F-23749236). So we drive the redirect
  // chain by hand: redirect:'manual', and re-run the FULL DNS-resolving gate
  // (isAllowedUrlResolved) against EVERY hop — the initial URL and each
  // Location — before following it, bounded by MAX_REDIRECTS. The whole chain
  // shares one deadline, so a redirect loop cannot multiply the caller's
  // timeout budget.
  //
  // Residual ceiling (v2.6 audit F-3d66e5c9, DNS-rebinding TOCTOU): the address
  // isAllowedUrlResolved() validates via dns.lookup() is NOT pinned to the
  // socket fetch() ultimately connects to — undici performs its own
  // independent resolution, so an attacker controlling authoritative DNS with
  // a low/zero TTL could still answer "public" to our lookup and "private" to
  // undici's. Fully closing that needs connecting to a pinned, pre-validated IP
  // via a custom undici dispatcher (with an explicit Host header / SNI), which
  // native fetch() cannot express without one. This fix closes the redirect
  // and static-record variants completely; the timing-race rebinding variant
  // remains a documented, higher-cost residual, not a silently-open hole.
  let currentUrl = url;
  const deadline = Date.now() + timeoutMs;

  try {
    for (let hop = 0; ; hop++) {
      // Gate EVERY hop, not just the first — the entire point of the fix.
      if (!(await isAllowedUrlResolved(currentUrl))) {
        return failClosed('URL not allowed: must be public http/https');
      }

      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        return failClosed(`Request timed out after ${timeoutMs}ms`);
      }

      const response = await fetch(currentUrl, {
        signal: AbortSignal.timeout(remaining),
        redirect: 'manual',
        headers: {
          'User-Agent': 'ai-rpg-engine-chat/1.1 (design-assistant)',
          'Accept': 'text/html, text/plain, application/json',
        },
      });

      // A 3xx under redirect:'manual' exposes the real status + Location
      // (undici returns a basic, non-opaque response). Re-validate the target
      // through the gate on the next loop iteration before following it.
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
          return failClosed(`HTTP ${response.status}: redirect response with no Location header`);
        }
        if (hop >= MAX_REDIRECTS) {
          return failClosed(`Too many redirects (followed ${MAX_REDIRECTS})`);
        }
        let next: string;
        try {
          next = new URL(location, currentUrl).toString();
        } catch {
          return failClosed(`Invalid redirect Location: ${location}`);
        }
        currentUrl = next;
        continue;
      }

      if (!response.ok) {
        return failClosed(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') ?? '';
      const raw = await response.text();

      let title: string;
      let content: string;

      if (contentType.includes('text/html')) {
        title = extractTitle(raw);
        content = stripTags(raw);
      } else if (contentType.includes('application/json')) {
        title = url;
        content = raw;
      } else {
        // Plain text or other
        title = url;
        content = raw;
      }

      const truncated = content.slice(0, maxChars);

      return {
        ok: true,
        url,
        title: title || url,
        content: truncated,
        truncatedTo: Math.min(content.length, maxChars),
        fetchedAt,
      };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return failClosed(msg);
  }
}

// --- Format for prompt injection (clearly marked as external) ---

export function formatWebfetchForPrompt(result: WebfetchResult): string {
  if (!result.ok) {
    return `[EXTERNAL — fetch failed] ${result.url}: ${result.error}`;
  }
  return [
    `--- EXTERNAL REFERENCE (not project truth) ---`,
    `Source: ${result.url}`,
    `Title: ${result.title}`,
    `Fetched: ${result.fetchedAt}`,
    ``,
    result.content,
    ``,
    `--- End External Reference ---`,
  ].join('\n');
}
