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

/** Only allow http/https URLs. Reject private/internal addresses. */
export function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    // Block private/loopback ranges
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return false;
    if (host === '0.0.0.0' || host.startsWith('10.') || host.startsWith('192.168.')) return false;
    if (host.startsWith('172.') && /^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
    if (host.endsWith('.local') || host.endsWith('.internal')) return false;
    // Block file: and data: patterns that might slip through
    if (parsed.pathname.includes('..') || parsed.href.includes('..')) return false;
    return true;
  } catch {
    return false;
  }
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
