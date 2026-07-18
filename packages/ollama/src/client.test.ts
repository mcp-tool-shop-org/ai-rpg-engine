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

    const client = createClient(resolveConfig({ baseUrl, timeoutMs: 50, retryDelayMs: 0 }));
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

    const client = createClient(resolveConfig({ baseUrl: customUrl, timeoutMs: 50, retryDelayMs: 0 }));
    const result = await client.generate({ system: 's', prompt: 'p' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain(customUrl);
      expect(result.error).not.toContain('localhost:11434');
    }
  });
});

// v2.6 Stage C F-9d02e714 — model-not-installed is the likely #2 first-run
// failure (the default model is rarely pre-pulled) and used to surface as a
// raw escaped-JSON dump with no `ollama pull` guidance anywhere. The daemon's
// 404 body must be curated into: model name, the exact pull command, and the
// override knobs. A 404 that is NOT the daemon's model-missing shape (reverse
// proxy HTML from a wrong baseUrl) must fall through to the generic error.
describe('createClient.generate — model-not-pulled 404 (F-9d02e714)', () => {
  it('curates the daemon 404 into an actionable "ollama pull" message', async () => {
    globalThis.fetch = vi.fn(async () =>
      makeResponse({
        ok: false,
        status: 404,
        text: async () => '{"error":"model \\"qwen2.5-coder\\" not found, try pulling it first"}',
      }),
    ) as unknown as typeof fetch;

    const client = createClient(resolveConfig({ model: 'qwen2.5-coder' }));
    const result = await client.generate({ system: 's', prompt: 'p' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('ollama pull qwen2.5-coder');
      expect(result.error).toContain('AI_RPG_ENGINE_OLLAMA_MODEL');
      // No raw escaped-JSON dump.
      expect(result.error).not.toContain('{"error"');
    }
  });

  it('names the CONFIGURED model in the pull command (typo\'d --model case)', async () => {
    globalThis.fetch = vi.fn(async () =>
      makeResponse({
        ok: false,
        status: 404,
        text: async () => '{"error":"model \\"lama3\\" not found, try pulling it first"}',
      }),
    ) as unknown as typeof fetch;

    const client = createClient(resolveConfig({ model: 'lama3' }));
    const result = await client.generate({ system: 's', prompt: 'p' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('ollama pull lama3');
  });

  it('does NOT misdiagnose a non-daemon 404 (HTML body) as a missing model', async () => {
    globalThis.fetch = vi.fn(async () =>
      makeResponse({
        ok: false,
        status: 404,
        text: async () => '<html><head><title>404 Not Found</title></head></html>',
      }),
    ) as unknown as typeof fetch;

    const client = createClient(resolveConfig());
    const result = await client.generate({ system: 's', prompt: 'p' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('HTTP 404');
      expect(result.error).not.toContain('ollama pull');
    }
  });
});

// v2.5 audit PA-3 — the retry loop is defensive code on the single network
// path and previously had ZERO coverage: a refactor that broke the `continue`
// branches would still pass CI. It was also silent (up to maxAttempts ×
// timeoutMs of freeze with no breadcrumb) and hardcoded. The invariants:
// transient failures recover, retries are observable via onRetry (default: a
// stderr breadcrumb), and count/delay come from OllamaConfig.
describe('createClient.generate — retry/backoff (PA-3)', () => {
  type RetryCall = { attempt: number; maxAttempts: number; reason: string; delayMs: number };

  function collectRetries(): { calls: RetryCall[]; onRetry: (info: RetryCall) => void } {
    const calls: RetryCall[] = [];
    return { calls, onRetry: (info) => calls.push(info) };
  }

  it('recovers when a transient network error precedes a success', async () => {
    let call = 0;
    globalThis.fetch = vi.fn(async () => {
      call++;
      if (call === 1) throw new TypeError('fetch failed');
      return makeResponse({ ok: true, status: 200, json: async () => ({ response: 'recovered' }) });
    }) as unknown as typeof fetch;

    const { calls, onRetry } = collectRetries();
    const client = createClient(resolveConfig({ retryDelayMs: 0 }), { onRetry });
    const result = await client.generate({ system: 's', prompt: 'p' });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.text).toBe('recovered');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(calls).toEqual([
      { attempt: 1, maxAttempts: 3, reason: 'network error: fetch failed', delayMs: 0 },
    ]);
  });

  // v2.6 audit F-65938632 — AbortSignal.timeout(config.timeoutMs) firing
  // rejects fetch() with a DOMException named 'TimeoutError', which is NOT
  // an instanceof TypeError. The old predicate (`err instanceof TypeError`)
  // silently excluded the single most common transient failure for a local
  // Ollama daemon (cold model load / long generation blowing past
  // timeoutMs): a maxAttempts:3 caller got a hard failure on attempt 1.
  it('recovers when a request timeout (AbortSignal.timeout TimeoutError) precedes a success', async () => {
    let call = 0;
    globalThis.fetch = vi.fn(async () => {
      call++;
      if (call === 1) throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      return makeResponse({ ok: true, status: 200, json: async () => ({ response: 'recovered' }) });
    }) as unknown as typeof fetch;

    const { calls, onRetry } = collectRetries();
    const client = createClient(resolveConfig({ retryDelayMs: 0, timeoutMs: 5000 }), { onRetry });
    const result = await client.generate({ system: 's', prompt: 'p' });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.text).toBe('recovered');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(calls).toEqual([
      { attempt: 1, maxAttempts: 3, reason: 'timeout after 5000ms', delayMs: 0 },
    ]);
  });

  it('surfaces a final error (not a raw DOMException) once repeated timeouts exhaust retries', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    }) as unknown as typeof fetch;

    const { calls, onRetry } = collectRetries();
    const client = createClient(resolveConfig({ retryDelayMs: 0 }), { onRetry });
    const result = await client.generate({ system: 's', prompt: 'p' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/timeout/i);
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    expect(calls).toHaveLength(2); // one breadcrumb per retry, none for the final failure
  });

  it('does NOT retry an abort that is not our own timeout (e.g. name "AbortError")', async () => {
    // Guards the predicate's specificity: only OUR AbortSignal.timeout()
    // firing (name 'TimeoutError') is transient/retryable. A generic abort
    // is left alone, matching the pre-fix behavior for anything that isn't
    // a recognized transient failure.
    globalThis.fetch = vi.fn(async () => {
      throw new DOMException('The operation was aborted', 'AbortError');
    }) as unknown as typeof fetch;

    const { calls, onRetry } = collectRetries();
    const client = createClient(resolveConfig({ retryDelayMs: 0 }), { onRetry });
    const result = await client.generate({ system: 's', prompt: 'p' });

    expect(result.ok).toBe(false);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(0);
  });

  it('retries a 5xx and surfaces the final HTTP error after max attempts', async () => {
    globalThis.fetch = vi.fn(async () =>
      makeResponse({ ok: false, status: 503, text: async () => 'overloaded' }),
    ) as unknown as typeof fetch;

    const { calls, onRetry } = collectRetries();
    const client = createClient(resolveConfig({ retryDelayMs: 0 }), { onRetry });
    const result = await client.generate({ system: 's', prompt: 'p' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('HTTP 503');
      expect(result.error).toContain('overloaded');
    }
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    expect(calls.map((c) => c.reason)).toEqual(['HTTP 503', 'HTTP 503']);
    expect(calls.map((c) => c.attempt)).toEqual([1, 2]);
  });

  it('surfaces the offline hint once network retries are exhausted', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;

    const { calls, onRetry } = collectRetries();
    const client = createClient(resolveConfig({ retryDelayMs: 0 }), { onRetry });
    const result = await client.generate({ system: 's', prompt: 'p' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/ollama serve/i);
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    expect(calls).toHaveLength(2); // one breadcrumb per retry, none for the final failure
  });

  it('does not retry a 4xx client error', async () => {
    globalThis.fetch = vi.fn(async () =>
      makeResponse({ ok: false, status: 400, text: async () => 'bad request' }),
    ) as unknown as typeof fetch;

    const { calls, onRetry } = collectRetries();
    const client = createClient(resolveConfig({ retryDelayMs: 0 }), { onRetry });
    const result = await client.generate({ system: 's', prompt: 'p' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('HTTP 400');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(0);
  });

  it('maxAttempts: 1 disables retry entirely', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;

    const { calls, onRetry } = collectRetries();
    const client = createClient(resolveConfig({ maxAttempts: 1, retryDelayMs: 0 }), { onRetry });
    const result = await client.generate({ system: 's', prompt: 'p' });

    expect(result.ok).toBe(false);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(0);
  });

  it('configured maxAttempts and retryDelayMs flow into the loop and the breadcrumb payload', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;

    const { calls, onRetry } = collectRetries();
    const client = createClient(resolveConfig({ maxAttempts: 5, retryDelayMs: 1 }), { onRetry });
    const result = await client.generate({ system: 's', prompt: 'p' });

    expect(result.ok).toBe(false);
    expect(globalThis.fetch).toHaveBeenCalledTimes(5);
    expect(calls.map((c) => c.attempt)).toEqual([1, 2, 3, 4]);
    expect(calls.every((c) => c.maxAttempts === 5 && c.delayMs === 1)).toBe(true);
  });

  it('emits a stderr breadcrumb per retry by default (no onRetry hook)', async () => {
    let call = 0;
    globalThis.fetch = vi.fn(async () => {
      call++;
      if (call === 1) throw new TypeError('fetch failed');
      return makeResponse({ ok: true, status: 200, json: async () => ({ response: 'ok' }) });
    }) as unknown as typeof fetch;
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const client = createClient(resolveConfig({ retryDelayMs: 0 }));
    const result = await client.generate({ system: 's', prompt: 'p' });

    expect(result.ok).toBe(true);
    const stderr = errSpy.mock.calls.flat().join('\n');
    expect(stderr).toContain('[ollama] attempt 1/3 failed');
    expect(stderr).toContain('retrying in 0ms');
  });
});
