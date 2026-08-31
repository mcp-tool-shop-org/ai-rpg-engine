// Ollama HTTP client — thin wrapper around /api/generate, /api/tags, /api/version

import { clampTimeoutMs, clampMaxAttempts, clampRetryDelayMs, type OllamaConfig } from './config.js';
import { readBodyWithByteCap } from './chat-webfetch.js';

/** Finite generate() body budget (F-b67b6830). Multi-GB 200s are refused before any concatenate. */
export const MAX_GENERATE_BODY_BYTES = 8 * 1024 * 1024;

export type PromptInput = {
  system: string;
  prompt: string;
};

export type GenerateOptions = {
  signal?: AbortSignal;
  onToken?: (token: string) => void;
};

export type GenerateStreamInput = PromptInput & GenerateOptions;

export type GenerateStreamChunk = {
  response: string;
  done: boolean;
};

export type PromptResult = {
  ok: true;
  text: string;
} | {
  ok: false;
  error: string;
};

export type OllamaModelInfo = {
  name: string;
  size?: number;
  digest?: string;
  modifiedAt?: string;
};

export type ListModelsResult = {
  ok: true;
  models: OllamaModelInfo[];
} | {
  ok: false;
  error: string;
};

export type VersionResult = {
  ok: true;
  version: string;
} | {
  ok: false;
  error: string;
};

export interface OllamaTextClient {
  generate(input: PromptInput, options?: GenerateOptions): Promise<PromptResult>;
  generateStream?(input: GenerateStreamInput): AsyncGenerator<GenerateStreamChunk, PromptResult, void>;
  listModels?(): Promise<ListModelsResult>;
  version?(): Promise<VersionResult>;
}

/** What the client knows about a failed attempt it is about to retry (v2.5 audit PA-3). */
export type OllamaRetryInfo = {
  /** 1-based number of the attempt that just failed. */
  attempt: number;
  /** Total attempts the client will make (from OllamaConfig.maxAttempts). */
  maxAttempts: number;
  /** Why the attempt failed, e.g. 'network error: fetch failed' or 'HTTP 503'. */
  reason: string;
  /** How long the client will wait before the next attempt, in milliseconds. */
  delayMs: number;
};

export type OllamaClientOptions = {
  /**
   * Called once per retry, before the delay. Default: a one-line breadcrumb on
   * stderr — a retrying client can otherwise freeze the author for up to
   * maxAttempts × timeoutMs with no signal at all (PA-3). Pass a no-op to
   * silence it, or your own hook to route it elsewhere.
   */
  onRetry?: (info: OllamaRetryInfo) => void;
};

function defaultOnRetry(info: OllamaRetryInfo): void {
  console.error(
    `[ollama] attempt ${info.attempt}/${info.maxAttempts} failed (${info.reason}); retrying in ${info.delayMs}ms`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * True for a fetch()-level failure worth retrying (v2.6 audit F-65938632).
 *
 * Empirically (Node 20+, undici): a connection-level failure (ECONNREFUSED,
 * DNS failure, etc.) surfaces from fetch() as `TypeError: fetch failed` —
 * that was the only case the old predicate accepted. But this client's own
 * `AbortSignal.timeout(config.timeoutMs)` firing surfaces as a `DOMException`
 * named 'TimeoutError', which is NOT an instanceof TypeError, so it fell
 * straight to the immediate-failure branch regardless of maxAttempts. Ollama
 * runs local LLM inference (cold model load into VRAM, long generations), so
 * a request timeout is arguably the single most common transient failure
 * mode for this client — it was also the one failure mode retry silently
 * excluded. A generic abort that is NOT our own timeout (caller-supplied
 * AbortController) is deliberately left alone: only a recognized transient
 * failure is retried.
 */
function isRetryableFetchError(err: unknown): err is TypeError | DOMException {
  if (err instanceof TypeError) return true;
  return err instanceof DOMException && err.name === 'TimeoutError';
}

function isAbortError(err: unknown): boolean {
  return (err instanceof DOMException || err instanceof Error) && err.name === 'AbortError';
}

function abortErrorMessage(err: unknown): string {
  if (isAbortError(err)) return 'Ollama request aborted';
  if (err instanceof DOMException && err.name === 'TimeoutError') {
    return `timeout after request`;
  }
  const message = err instanceof Error ? err.message : String(err);
  return message;
}

/**
 * Combine a per-request timeout with an optional caller AbortSignal.
 * Caller abort must not be treated as a retryable timeout.
 */
export function combineAbortSignals(timeoutMs: number, caller?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!caller) return timeout;
  const any = (AbortSignal as typeof AbortSignal & {
    any?: (signals: AbortSignal[]) => AbortSignal;
  }).any;
  if (typeof any === 'function') return any([timeout, caller]);
  if (caller.aborted) return caller;
  const ctrl = new AbortController();
  const onAbort = () => {
    if (!ctrl.signal.aborted) ctrl.abort();
  };
  caller.addEventListener('abort', onAbort, { once: true });
  timeout.addEventListener('abort', onAbort, { once: true });
  return ctrl.signal;
}

/**
 * Build a recovery hint for connection failures. Ollama is the only optional
 * network surface; when it's unreachable the most common cause is the server
 * not running or a misconfigured URL, so name both the attempted URL and the
 * concrete fixes rather than returning a bare "fetch failed".
 */
function offlineHint(baseUrl: string): string {
  return `Could not reach the Ollama server at ${baseUrl}. `
    + 'Is it running? Start it with "ollama serve", '
    + 'or point at a different host via AI_RPG_ENGINE_OLLAMA_URL.';
}

/**
 * Curate the daemon's model-not-found 404 into an actionable message
 * (v2.6 Stage C F-9d02e714). The raw failure is an escaped-JSON dump —
 * `Ollama HTTP 404: {"error":"model \"qwen2.5-coder\" not found, try pulling
 * it first"}` — which never names the exact `ollama pull` command or where
 * the model name came from. This is the likely #2 first-run failure (the
 * default model is rarely pre-pulled), so it deserves the same curated
 * treatment as the offline case.
 *
 * Returns null when the 404 does not carry the daemon's model-missing shape
 * (e.g. a reverse proxy's HTML 404 from a wrong baseUrl) — those fall through
 * to the generic HTTP error rather than misdiagnosing a missing model.
 */
function modelNotFoundError(status: number, body: string, model: string): string | null {
  if (status !== 404) return null;
  let detail: string | undefined;
  try {
    const parsed = JSON.parse(body) as { error?: unknown };
    if (typeof parsed.error === 'string') detail = parsed.error;
  } catch {
    return null; // non-JSON 404 body — not the daemon's model-missing response
  }
  if (!detail || !/not found/i.test(detail)) return null;
  return `Model "${model}" is not installed on the Ollama server (${detail}). `
    + `Pull it first with "ollama pull ${model}", `
    + 'or pick an installed model via AI_RPG_ENGINE_OLLAMA_MODEL or --model.';
}

async function cancelBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // already closed or mock without cancel
  }
}

async function readGenerateBody(response: Response): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  try {
    const text = await readBodyWithByteCap(response, MAX_GENERATE_BODY_BYTES);
    return { ok: true, text };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

function parseNdjsonLine(line: string, status: number): { response: string; done: boolean } | { error: string } {
  let json: { response?: unknown; done?: unknown };
  try {
    json = JSON.parse(line) as { response?: unknown; done?: unknown };
  } catch {
    return { error: `Ollama returned a non-JSON response (HTTP ${status})` };
  }
  if (typeof json.response !== 'string') {
    return { error: 'Unexpected Ollama response shape' };
  }
  return { response: json.response, done: json.done === true };
}

/**
 * Stream an NDJSON generate body, calling onToken for each `response` chunk.
 * Caps bytes as they arrive. Missing Content-Length is allowed (Ollama's
 * stream:true is typically chunked); a declared length above the cap is
 * refused before any read.
 */
async function* streamNdjsonBody(
  response: Response,
  onToken?: (token: string) => void,
): AsyncGenerator<GenerateStreamChunk, PromptResult, void> {
  const status = response.status;
  const rawLen = response.headers.get('content-length');
  if (rawLen !== null && rawLen.trim() !== '') {
    const declared = Number(rawLen);
    if (!Number.isFinite(declared) || declared < 0) {
      await cancelBody(response);
      return { ok: false, error: 'Content-Length invalid; refusing body' };
    }
    if (declared > MAX_GENERATE_BODY_BYTES) {
      await cancelBody(response);
      return { ok: false, error: `Response too large (${declared} bytes; cap ${MAX_GENERATE_BODY_BYTES})` };
    }
  }

  const body = response.body;
  if (!body) {
    return { ok: false, error: 'Response body missing; refusing unstreamable body' };
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let received = 0;
  let assembled = '';
  let sawResponse = false;

  const consumeLine = (line: string): PromptResult | GenerateStreamChunk | null => {
    const trimmed = line.trim();
    if (!trimmed) return null;
    const parsed = parseNdjsonLine(trimmed, status);
    if ('error' in parsed) return { ok: false, error: parsed.error };
    sawResponse = true;
    assembled += parsed.response;
    if (parsed.response) onToken?.(parsed.response);
    return { response: parsed.response, done: parsed.done };
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      received += value.byteLength;
      const declared = rawLen !== null && rawLen.trim() !== '' ? Number(rawLen) : undefined;
      if (declared !== undefined && Number.isFinite(declared) && received > declared) {
        await reader.cancel();
        return { ok: false, error: 'Content-Length exceeded; refusing body' };
      }
      if (received > MAX_GENERATE_BODY_BYTES) {
        await reader.cancel();
        return { ok: false, error: `Response body exceeded byte cap (${MAX_GENERATE_BODY_BYTES})` };
      }
      buf += decoder.decode(value, { stream: true });
      if (buf.length > 65_536 && !buf.includes('\n')) {
        await reader.cancel();
        return { ok: false, error: `Response body exceeded byte cap (${MAX_GENERATE_BODY_BYTES})` };
      }
      let nl = buf.indexOf('\n');
      while (nl >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        const consumed = consumeLine(line);
        if (consumed && 'ok' in consumed) return consumed;
        if (consumed && 'response' in consumed) {
          yield consumed;
          if (consumed.done) return { ok: true, text: assembled };
        }
        nl = buf.indexOf('\n');
      }
    }
    buf += decoder.decode();
    if (buf.trim()) {
      const consumed = consumeLine(buf);
      if (consumed && 'ok' in consumed) return consumed;
      if (consumed && 'response' in consumed) {
        yield consumed;
        if (consumed.done) return { ok: true, text: assembled };
      }
    }
    if (sawResponse) return { ok: true, text: assembled };
    return { ok: false, error: 'Unexpected Ollama response shape' };
  } catch (err) {
    if (isAbortError(err)) return { ok: false, error: 'Ollama request aborted' };
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Ollama response rejected: ${message}` };
  } finally {
    try { reader.releaseLock(); } catch { /* already released */ }
  }
}

function fetchFailureResult(
  err: unknown,
  attempt: number,
  maxAttempts: number,
  timeoutMs: number,
  baseUrl: string,
): PromptResult | { retry: true; reason: string } {
  if (isAbortError(err)) {
    return { ok: false, error: 'Ollama request aborted' };
  }
  if (attempt < maxAttempts && isRetryableFetchError(err)) {
    const reason = err instanceof DOMException
      ? `timeout after ${timeoutMs}ms`
      : `network error: ${err.message || 'fetch failed'}`;
    return { retry: true, reason };
  }
  if (attempt >= maxAttempts && isRetryableFetchError(err)) {
    const reason = err instanceof DOMException
      ? `timeout after ${timeoutMs}ms`
      : `network error: ${err.message || 'fetch failed'}`;
    return {
      ok: false,
      error: `Ollama request failed: too many attempts (max retries exceeded) (${reason}). ${offlineHint(baseUrl)}`,
    };
  }
  const message = abortErrorMessage(err);
  return { ok: false, error: `Ollama request failed: ${message}. ${offlineHint(baseUrl)}` };
}

export function formatModelsReport(input: {
  configuredModel: string;
  models?: OllamaModelInfo[];
  version?: string;
  error?: string;
}): string {
  const lines: string[] = [`Configured model: ${input.configuredModel}`];
  if (input.version) lines.push(`Ollama version: ${input.version}`);
  if (input.error) {
    lines.push(input.error);
    return lines.join('\n');
  }
  const models = input.models ?? [];
  if (models.length === 0) {
    lines.push('Installed models: (none)');
  } else {
    lines.push('Installed models:');
    for (const model of models) {
      lines.push(`  ${model.name}`);
    }
  }
  const configured = input.configuredModel;
  const installed = models.some((m) =>
    m.name === configured || m.name.startsWith(`${configured}:`),
  );
  if (!installed) {
    lines.push('');
    lines.push(`Configured model "${configured}" is not installed.`);
    lines.push(`Pull it with: ollama pull ${configured}`);
  }
  return lines.join('\n');
}

export function createClient(config: OllamaConfig, options?: OllamaClientOptions): OllamaTextClient {
  const onRetry = options?.onRetry ?? defaultOnRetry;
  // Belt-and-braces for hand-built configs that predate the retry fields
  // (resolveConfig always sets them): missing / non-finite values fall back
  // to the documented defaults instead of collapsing the loop to zero
  // attempts or looping forever on Infinity (F-75b0ce0e).
  const maxAttempts = clampMaxAttempts(config.maxAttempts);
  const retryDelayMs = clampRetryDelayMs(config.retryDelayMs);
  // F-b67b6830 — timeout bounds wait, not bytes; still clamp so Infinity /
  // MAX_SAFE_INTEGER cannot disable AbortSignal.timeout or the body cap.
  const timeoutMs = clampTimeoutMs(config.timeoutMs);

  async function jsonGet<T>(
    path: string,
    parse: (json: unknown) => T | { error: string },
  ): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
    const url = `${config.baseUrl}${path}`;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let res: Response;
      try {
        res = await fetch(url, {
          method: 'GET',
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        const outcome = fetchFailureResult(err, attempt, maxAttempts, timeoutMs, config.baseUrl);
        if ('retry' in outcome) {
          onRetry({ attempt, maxAttempts, reason: outcome.reason, delayMs: retryDelayMs });
          await sleep(retryDelayMs);
          continue;
        }
        if (outcome.ok) return { ok: false, error: 'Ollama fetch failed' };
        return { ok: false, error: outcome.error };
      }

      if (!res.ok) {
        if (attempt < maxAttempts && res.status >= 500) {
          await cancelBody(res);
          onRetry({ attempt, maxAttempts, reason: `HTTP ${res.status}`, delayMs: retryDelayMs });
          await sleep(retryDelayMs);
          continue;
        }
        const read = await readGenerateBody(res);
        const text = read.ok ? read.text : '(no body)';
        if (!read.ok) return { ok: false, error: `Ollama HTTP ${res.status}: ${read.error}` };
        return { ok: false, error: `Ollama HTTP ${res.status}: ${text}` };
      }

      const read = await readGenerateBody(res);
      if (!read.ok) return { ok: false, error: `Ollama response rejected: ${read.error}` };
      let json: unknown;
      try {
        json = JSON.parse(read.text);
      } catch {
        return { ok: false, error: `Ollama returned a non-JSON response (HTTP ${res.status})` };
      }
      const parsed = parse(json);
      if (parsed && typeof parsed === 'object' && 'error' in parsed && !('ok' in parsed)) {
        return { ok: false, error: (parsed as { error: string }).error };
      }
      return { ok: true, value: parsed as T };
    }
    return { ok: false, error: `Ollama request failed: too many attempts (max retries exceeded). ${offlineHint(config.baseUrl)}` };
  }

  async function* generateStream(
    input: GenerateStreamInput,
  ): AsyncGenerator<GenerateStreamChunk, PromptResult, void> {
    const url = `${config.baseUrl}/api/generate`;
    const body = {
      model: config.model,
      system: input.system,
      prompt: input.prompt,
      stream: true,
      options: {
        temperature: config.temperature,
        ...(config.maxTokens ? { num_predict: config.maxTokens } : {}),
      },
    };

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: combineAbortSignals(timeoutMs, input.signal),
        });
      } catch (err) {
        const outcome = fetchFailureResult(err, attempt, maxAttempts, timeoutMs, config.baseUrl);
        if ('retry' in outcome) {
          onRetry({ attempt, maxAttempts, reason: outcome.reason, delayMs: retryDelayMs });
          await sleep(retryDelayMs);
          continue;
        }
        return outcome;
      }

      if (!res.ok) {
        if (attempt < maxAttempts && res.status >= 500) {
          await cancelBody(res);
          onRetry({ attempt, maxAttempts, reason: `HTTP ${res.status}`, delayMs: retryDelayMs });
          await sleep(retryDelayMs);
          continue;
        }
        const read = await readGenerateBody(res);
        const text = read.ok ? read.text : '(no body)';
        const notPulled = modelNotFoundError(res.status, text, config.model);
        if (notPulled) return { ok: false, error: notPulled };
        if (!read.ok) return { ok: false, error: `Ollama HTTP ${res.status}: ${read.error}` };
        return { ok: false, error: `Ollama HTTP ${res.status}: ${text}` };
      }

      // Stream tokens. Do not retry after the first chunk — that would
      // duplicate already-yielded text.
      const stream = streamNdjsonBody(res, input.onToken);
      while (true) {
        const step = await stream.next();
        if (step.done) return step.value;
        yield step.value;
      }
    }

    return { ok: false, error: `Ollama request failed: too many attempts (max retries exceeded). ${offlineHint(config.baseUrl)}` };
  }

  async function generate(input: PromptInput, options?: GenerateOptions): Promise<PromptResult> {
    const stream = generateStream({
      system: input.system,
      prompt: input.prompt,
      signal: options?.signal,
      onToken: options?.onToken,
    });
    while (true) {
      const step = await stream.next();
      if (step.done) return step.value;
    }
  }

  async function listModels(): Promise<ListModelsResult> {
    const result = await jsonGet<{ models: OllamaModelInfo[] }>('/api/tags', (json) => {
      if (!json || typeof json !== 'object') return { error: 'Unexpected Ollama response shape' };
      const raw = (json as { models?: unknown }).models;
      if (!Array.isArray(raw)) return { error: 'Unexpected Ollama response shape' };
      const models: OllamaModelInfo[] = [];
      for (const item of raw) {
        if (!item || typeof item !== 'object') continue;
        const rec = item as Record<string, unknown>;
        if (typeof rec['name'] !== 'string') continue;
        models.push({
          name: rec['name'],
          size: typeof rec['size'] === 'number' ? rec['size'] : undefined,
          digest: typeof rec['digest'] === 'string' ? rec['digest'] : undefined,
          modifiedAt: typeof rec['modified_at'] === 'string' ? rec['modified_at'] : undefined,
        });
      }
      return { models };
    });
    if (!result.ok) return result;
    return { ok: true, models: result.value.models };
  }

  async function version(): Promise<VersionResult> {
    const result = await jsonGet<{ version: string }>('/api/version', (json) => {
      if (!json || typeof json !== 'object') return { error: 'Unexpected Ollama response shape' };
      const version = (json as { version?: unknown }).version;
      if (typeof version !== 'string') return { error: 'Unexpected Ollama response shape' };
      return { version };
    });
    if (!result.ok) return result;
    return { ok: true, version: result.value.version };
  }

  return {
    generate,
    generateStream,
    listModels,
    version,
  };
}
