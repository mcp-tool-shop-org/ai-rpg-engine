// Unit tests — Ollama HTTP client contract
// The client promises a discriminated union PromptResult; it must NEVER throw,
// even when the server returns a 200 with a non-JSON body (reverse proxy,
// captive portal HTML, truncated body, wrong baseUrl).

import { describe, it, expect, afterEach, vi } from 'vitest';
import { createClient, MAX_GENERATE_BODY_BYTES, formatModelsReport } from './client.js';
import type { OllamaTextClient } from './client.js';
import { resolveConfig, MAX_OLLAMA_TIMEOUT_MS, MAX_OLLAMA_ATTEMPTS } from './config.js';

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

function streamedBytes(text: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

function makeResponse(init: {
  ok: boolean;
  status: number;
  payload?: unknown;
  bodyText?: string;
  contentLength?: string | null;
}): Response {
  const bodyText = init.bodyText ?? JSON.stringify(init.payload ?? {});
  const bytes = new TextEncoder().encode(bodyText);
  const headers = new Headers();
  if (init.contentLength !== null) {
    headers.set('content-length', init.contentLength ?? String(bytes.byteLength));
  }
  return {
    ok: init.ok,
    status: init.status,
    headers,
    body: streamedBytes(bodyText),
    json: async () => {
      throw new Error('response.json() must not buffer the body');
    },
    text: async () => {
      throw new Error('response.text() must not buffer the body');
    },
  } as unknown as Response;
}

describe('createClient.generate — contract safety', () => {
  it('returns {ok:true,text} for a normal JSON response', async () => {
    globalThis.fetch = vi.fn(async () =>
      makeResponse({ ok: true, status: 200, payload: { response: 'hello world' } }),
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
        bodyText: '<html>captive portal</html>',
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
      makeResponse({ ok: true, status: 200, payload: { notResponse: 42 } }),
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
        bodyText: '{"error":"model \\"qwen2.5-coder\\" not found, try pulling it first"}',
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
        bodyText: '{"error":"model \\"lama3\\" not found, try pulling it first"}',
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
        bodyText: '<html><head><title>404 Not Found</title></head></html>',
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
      return makeResponse({ ok: true, status: 200, payload: { response: 'recovered' } });
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
      return makeResponse({ ok: true, status: 200, payload: { response: 'recovered' } });
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
      makeResponse({ ok: false, status: 503, bodyText: 'overloaded' }),
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
      makeResponse({ ok: false, status: 400, bodyText: 'bad request' }),
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
      return makeResponse({ ok: true, status: 200, payload: { response: 'ok' } });
    }) as unknown as typeof fetch;
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const client = createClient(resolveConfig({ retryDelayMs: 0 }));
    const result = await client.generate({ system: 's', prompt: 'p' });

    expect(result.ok).toBe(true);
    const stderr = errSpy.mock.calls.flat().join('\n');
    expect(stderr).toContain('[ollama] attempt 1/3 failed');
    expect(stderr).toContain('retrying in 0ms');
  });

  it('treats a hand-built Infinity maxAttempts as the default, not an infinite loop (F-75b0ce0e)', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;

    const cfg = { ...resolveConfig({ retryDelayMs: 0 }), maxAttempts: Infinity };
    const client = createClient(cfg);
    const result = await client.generate({ system: 's', prompt: 'p' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/too many attempts|max retries exceeded/i);
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });

  it('caps 1e9 maxAttempts at the ceiling and generate() returns (F-75b0ce0e)', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;

    const client = createClient(resolveConfig({ retryDelayMs: 0, maxAttempts: 1e9 }));
    const result = await client.generate({ system: 's', prompt: 'p' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/too many attempts|max retries exceeded/i);
    expect(globalThis.fetch).toHaveBeenCalledTimes(MAX_OLLAMA_ATTEMPTS);
  });
});

// F-b67b6830 — generate() used to res.json()/res.text() the raw body with no
// Content-Length check and no byte budget. Reuse the webfetch streamed cap:
// refuse missing/oversized/non-finite Content-Length; never concatenate a
// multi-GB 200. timeoutMs is clamped so Infinity/huge cannot disable the cap.
describe('createClient.generate — streamed body byte cap (F-b67b6830)', () => {
  function hugeLengthResponse(contentLength: string): {
    response: Response;
    counters: { pulled: number; textCalled: number; jsonCalled: number };
  } {
    const counters = { pulled: 0, textCalled: 0, jsonCalled: 0 };
    const response = {
      ok: true,
      status: 200,
      headers: new Headers({
        'content-type': 'application/json',
        'content-length': contentLength,
      }),
      body: new ReadableStream({
        pull(controller) {
          counters.pulled++;
          controller.enqueue(new Uint8Array(1024));
        },
      }, { highWaterMark: 0 }),
      text: async () => {
        counters.textCalled++;
        return 'SHOULD-NOT-MATERIALIZE';
      },
      json: async () => {
        counters.jsonCalled++;
        return { response: 'SHOULD-NOT-MATERIALIZE' };
      },
    } as unknown as Response;
    return { response, counters };
  }

  async function generateAgainstHuge(
    timeoutMs: number,
    contentLength = String(2_000_000_000),
  ): Promise<{
    result: Awaited<ReturnType<OllamaTextClient['generate']>>;
    counters: { pulled: number; textCalled: number; jsonCalled: number };
  }> {
    const { response, counters } = hugeLengthResponse(contentLength);
    globalThis.fetch = vi.fn(async () => response) as unknown as typeof fetch;
    const client = createClient(resolveConfig({
      timeoutMs,
      retryDelayMs: 0,
      maxAttempts: 1,
    }));
    const result = await client.generate({ system: 's', prompt: 'p' });
    return { result, counters };
  }

  it('rejects a 200 with multi-GB Content-Length without concatenating or calling json()/text()', async () => {
    expect(2_000_000_000).toBeGreaterThan(MAX_GENERATE_BODY_BYTES);
    const { result, counters } = await generateAgainstHuge(30_000);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/too large|byte cap|content-length/i);
    expect(counters.pulled).toBe(0);
    expect(counters.textCalled).toBe(0);
    expect(counters.jsonCalled).toBe(0);
  });

  it('rejects a 200 with multi-GB Content-Length when timeoutMs is Infinity', async () => {
    const { result, counters } = await generateAgainstHuge(Infinity);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/too large|byte cap|content-length|finite/i);
    expect(counters.pulled).toBe(0);
    expect(counters.textCalled).toBe(0);
    expect(counters.jsonCalled).toBe(0);
    expect(Number.isFinite(resolveConfig({ timeoutMs: Infinity }).timeoutMs)).toBe(true);
    expect(resolveConfig({ timeoutMs: Infinity }).timeoutMs).toBe(MAX_OLLAMA_TIMEOUT_MS);
  });

  it('rejects a 200 with multi-GB Content-Length when timeoutMs is MAX_SAFE_INTEGER', async () => {
    const { result, counters } = await generateAgainstHuge(Number.MAX_SAFE_INTEGER);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/too large|byte cap|content-length|finite/i);
    expect(counters.pulled).toBe(0);
    expect(counters.textCalled).toBe(0);
    expect(counters.jsonCalled).toBe(0);
    expect(resolveConfig({ timeoutMs: Number.MAX_SAFE_INTEGER }).timeoutMs).toBe(MAX_OLLAMA_TIMEOUT_MS);
    expect(Number.isFinite(resolveConfig({ timeoutMs: Number.MAX_SAFE_INTEGER }).timeoutMs)).toBe(true);
  });

  it('caps a missing Content-Length stream by byte budget without calling json()/text()', async () => {
    let pulled = 0;
    let textCalled = 0;
    let jsonCalled = 0;
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/x-ndjson' }),
      body: new ReadableStream({
        pull(controller) {
          pulled++;
          controller.enqueue(new Uint8Array(1024).fill(65));
        },
      }, { highWaterMark: 0 }),
      text: async () => {
        textCalled++;
        return 'SHOULD-NOT-MATERIALIZE';
      },
      json: async () => {
        jsonCalled++;
        return { response: 'SHOULD-NOT-MATERIALIZE' };
      },
    })) as unknown as typeof fetch;

    const client = createClient(resolveConfig({ retryDelayMs: 0, maxAttempts: 1 }));
    const result = await client.generate({ system: 's', prompt: 'p' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/byte cap|too large|non-JSON/i);
    expect(pulled).toBeGreaterThan(0);
    expect(pulled).toBeLessThan((MAX_GENERATE_BODY_BYTES / 1024) + 8);
    expect(textCalled).toBe(0);
    expect(jsonCalled).toBe(0);
  });

  it('fails closed on a lying Content-Length without concatenating the full stream', async () => {
    let enqueued = 0;
    const chunk = new Uint8Array(1024).fill(65);
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({
        'content-type': 'application/json',
        'content-length': '100',
      }),
      body: new ReadableStream({
        pull(controller) {
          enqueued += chunk.byteLength;
          controller.enqueue(chunk);
        },
      }),
      text: async () => {
        throw new Error('text() would materialize the full body');
      },
      json: async () => {
        throw new Error('json() would materialize the full body');
      },
    })) as unknown as typeof fetch;

    const client = createClient(resolveConfig({ retryDelayMs: 0, maxAttempts: 1 }));
    const result = await client.generate({ system: 's', prompt: 'p' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/exceeded|byte cap|content-length/i);
    expect(enqueued).toBeLessThan(16_384);
  });
});

describe('createClient.generateStream — NDJSON tokens and abort (F-5b193212)', () => {
  it('yields NDJSON response chunks and generate() concatenates them', async () => {
    const ndjson = [
      JSON.stringify({ response: 'Hel', done: false }),
      JSON.stringify({ response: 'lo', done: false }),
      JSON.stringify({ response: '', done: true }),
    ].join('\n');
    globalThis.fetch = vi.fn(async () =>
      makeResponse({ ok: true, status: 200, bodyText: ndjson }),
    ) as unknown as typeof fetch;

    const client = createClient(resolveConfig());
    const tokens: string[] = [];
    const chunks: string[] = [];
    const stream = client.generateStream!({ system: 's', prompt: 'p', onToken: (t) => tokens.push(t) });
    for await (const chunk of stream) {
      if (chunk.response) chunks.push(chunk.response);
    }
    expect(chunks.join('')).toBe('Hello');
    expect(tokens.join('')).toBe('Hello');

    const result = await client.generate({ system: 's', prompt: 'p' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.text).toBe('Hello');

    const body = JSON.parse((globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string);
    expect(body.stream).toBe(true);
  });

  it('aborts an in-flight generate via caller AbortSignal without retrying', async () => {
    const controller = new AbortController();
    globalThis.fetch = vi.fn(async (_url, init) => {
      const signal = (init as RequestInit).signal;
      return await new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          const err = new DOMException('The operation was aborted.', 'AbortError');
          reject(err);
        });
        controller.abort();
      });
    }) as unknown as typeof fetch;

    const client = createClient(resolveConfig({ retryDelayMs: 0, maxAttempts: 3 }));
    const result = await client.generate({ system: 's', prompt: 'p' }, { signal: controller.signal });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/aborted/i);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('createClient.listModels / version (F-65c2b778)', () => {
  it('lists installed model names from /api/tags', async () => {
    globalThis.fetch = vi.fn(async () =>
      makeResponse({
        ok: true,
        status: 200,
        payload: { models: [{ name: 'llama3:latest', size: 1 }, { name: 'qwen2.5-coder:latest' }] },
      }),
    ) as unknown as typeof fetch;

    const client = createClient(resolveConfig({ model: 'qwen2.5-coder' }));
    const result = await client.listModels!();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.models.map((m) => m.name)).toEqual(['llama3:latest', 'qwen2.5-coder:latest']);
    }
    expect((globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatch(/\/api\/tags$/);
  });

  it('reads /api/version', async () => {
    globalThis.fetch = vi.fn(async () =>
      makeResponse({ ok: true, status: 200, payload: { version: '0.9.0' } }),
    ) as unknown as typeof fetch;

    const client = createClient(resolveConfig());
    const result = await client.version!();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.version).toBe('0.9.0');
    expect((globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatch(/\/api\/version$/);
  });

  it('formatModelsReport names the pull command when the configured model is missing', () => {
    const report = formatModelsReport({
      configuredModel: 'qwen2.5-coder',
      version: '0.9.0',
      models: [{ name: 'llama3:latest' }],
    });
    expect(report).toContain('Configured model: qwen2.5-coder');
    expect(report).toContain('llama3:latest');
    expect(report).toContain('ollama pull qwen2.5-coder');
  });
});
