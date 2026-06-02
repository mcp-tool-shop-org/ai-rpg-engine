// Unit tests — Ollama HTTP client contract
// The client promises a discriminated union PromptResult; it must NEVER throw,
// even when the server returns a 200 with a non-JSON body (reverse proxy,
// captive portal HTML, truncated body, wrong baseUrl).

import { describe, it, expect, afterEach, vi } from 'vitest';
import { createClient } from './client.js';
import { resolveConfig } from './config.js';

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

function makeResponse(init: {
  ok: boolean;
  status: number;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
}): Response {
  return {
    ok: init.ok,
    status: init.status,
    json: init.json ?? (async () => ({})),
    text: init.text ?? (async () => ''),
    headers: new Headers(),
  } as unknown as Response;
}

describe('createClient.generate — contract safety', () => {
  it('returns {ok:true,text} for a normal JSON response', async () => {
    globalThis.fetch = vi.fn(async () =>
      makeResponse({ ok: true, status: 200, json: async () => ({ response: 'hello world' }) }),
    ) as unknown as typeof fetch;

    const client = createClient(resolveConfig());
    const result = await client.generate({ system: 's', prompt: 'p' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.text).toBe('hello world');
  });

  // ollama-01 — a 200 with a non-JSON body must not let res.json()'s SyntaxError
  // escape the {ok:false} contract.
  it('returns {ok:false} (does not throw) on a 200 with a non-JSON body', async () => {
    globalThis.fetch = vi.fn(async () =>
      makeResponse({
        ok: true,
        status: 200,
        // Simulate res.json() throwing on HTML / truncated body
        json: async () => { throw new SyntaxError('Unexpected token < in JSON at position 0'); },
        text: async () => '<html>captive portal</html>',
      }),
    ) as unknown as typeof fetch;

    const client = createClient(resolveConfig());
    let result: Awaited<ReturnType<typeof client.generate>> | undefined;
    await expect(
      (async () => { result = await client.generate({ system: 's', prompt: 'p' }); })(),
    ).resolves.not.toThrow();

    expect(result).toBeDefined();
    expect(result!.ok).toBe(false);
    if (!result!.ok) {
      expect(result!.error).toMatch(/non-JSON/i);
      expect(result!.error).toContain('200');
    }
  });

  it('returns {ok:false} when JSON parses but response field is missing/non-string', async () => {
    globalThis.fetch = vi.fn(async () =>
      makeResponse({ ok: true, status: 200, json: async () => ({ notResponse: 42 }) }),
    ) as unknown as typeof fetch;

    const client = createClient(resolveConfig());
    const result = await client.generate({ system: 's', prompt: 'p' });
    expect(result.ok).toBe(false);
  });
});

// ollama-offline-no-recovery-hint — when the server is unreachable, the error
// must name the attempted base URL AND give an actionable recovery hint so the
// user isn't left with a bare "fetch failed".
describe('createClient.generate — offline recovery hint', () => {
  const baseUrl = 'http://localhost:9999';

  it('includes the base URL and a recovery hint on a connection failure', async () => {
    // A network refusal surfaces as a TypeError from fetch.
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;

    const client = createClient(resolveConfig({ baseUrl, timeoutMs: 50 }));
    const result = await client.generate({ system: 's', prompt: 'p' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Names the URL the client actually tried to reach.
      expect(result.error).toContain(baseUrl);
      // Actionable recovery guidance.
      expect(result.error).toMatch(/ollama serve/i);
      expect(result.error).toContain('AI_RPG_ENGINE_OLLAMA_URL');
    }
  });

  it('uses the configured URL (not the default) in the failure message', async () => {
    const customUrl = 'http://192.168.1.50:11434';
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;

    const client = createClient(resolveConfig({ baseUrl: customUrl, timeoutMs: 50 }));
    const result = await client.generate({ system: 's', prompt: 'p' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain(customUrl);
      expect(result.error).not.toContain('localhost:11434');
    }
  });
});
