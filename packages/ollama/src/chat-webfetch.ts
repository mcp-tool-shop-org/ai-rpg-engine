// Webfetch adapter — optional external URL retrieval.
// Explicit, opt-in, source-citing, clearly separated from project truth.
// Chat must never silently mix external content with local project facts.
// Uses Node native fetch (>= 20). Zero external deps.

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

    // Otherwise a DNS name: allow (NOTE: hostname checks cannot stop DNS
    // rebinding to a private IP after validation — the complete fix is to
    // resolve and validate the connected IP at fetch time; future hardening).
    return !traversal(parsed);
  } catch {
    return false;
  }
}

function traversal(parsed: URL): boolean {
  return parsed.pathname.includes('..') || parsed.href.includes('..');
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

export async function webfetch(url: string, options?: WebfetchOptions): Promise<WebfetchResult> {
  const maxChars = options?.maxChars ?? 4000;
  const timeoutMs = options?.timeoutMs ?? 10_000;
  const fetchedAt = new Date().toISOString();

  if (!isAllowedUrl(url)) {
    return {
      ok: false, url, title: '', content: '', truncatedTo: 0, fetchedAt,
      error: 'URL not allowed: must be public http/https',
    };
  }

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'User-Agent': 'ai-rpg-engine-chat/1.1 (design-assistant)',
        'Accept': 'text/html, text/plain, application/json',
      },
    });

    if (!response.ok) {
      return {
        ok: false, url, title: '', content: '', truncatedTo: 0, fetchedAt,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false, url, title: '', content: '', truncatedTo: 0, fetchedAt,
      error: msg,
    };
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
