// Ollama HTTP client — thin wrapper around the /api/generate endpoint

import { clampTimeoutMs, clampMaxAttempts, clampRetryDelayMs, type OllamaConfig } from './config.js';
import { readBodyWithByteCap } from './chat-webfetch.js';

/** Finite generate() body budget (F-b67b6830). Multi-GB 200s are refused before any concatenate. */
export const MAX_GENERATE_BODY_BYTES = 8 * 1024 * 1024;

export type PromptInput = {
  system: string;
  prompt: string;
};

export type PromptResult = {
  ok: true;
  text: string;
} | {
  ok: false;
  error: string;
};

export interface OllamaTextClient {
  generate(input: PromptInput): Promise<PromptResult>;
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
 * excluded. A generic abort that is NOT our own timeout (e.g. a
 * caller-supplied AbortController — not used by this client today, but kept
 * explicit for anyone who wires one in later) is deliberately left alone:
 * only a recognized transient failure is retried.
 */
function isRetryableFetchError(err: unknown): err is TypeError | DOMException {
  if (err instanceof TypeError) return true;
  return err instanceof DOMException && err.name === 'TimeoutError';
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

  return {
    async generate(input: PromptInput): Promise<PromptResult> {
      const url = `${config.baseUrl}/api/generate`;
      const body = {
        model: config.model,
        system: input.system,
        prompt: input.prompt,
        stream: false,
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
            signal: AbortSignal.timeout(timeoutMs),
          });
        } catch (err) {
          if (attempt < maxAttempts && isRetryableFetchError(err)) {
            const reason = err instanceof DOMException
              ? `timeout after ${timeoutMs}ms`
              : `network error: ${err.message || 'fetch failed'}`;
            onRetry({ attempt, maxAttempts, reason, delayMs: retryDelayMs });
            await sleep(retryDelayMs);
            continue;
          }
          if (attempt >= maxAttempts && isRetryableFetchError(err)) {
            const reason = err instanceof DOMException
              ? `timeout after ${timeoutMs}ms`
              : `network error: ${err.message || 'fetch failed'}`;
            return { ok: false, error: `Ollama request failed: too many attempts (max retries exceeded) (${reason}). ${offlineHint(config.baseUrl)}` };
          }
          const message = err instanceof Error ? err.message : String(err);
          return { ok: false, error: `Ollama request failed: ${message}. ${offlineHint(config.baseUrl)}` };
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
          if (!read.ok) {
            return { ok: false, error: `Ollama HTTP ${res.status}: ${read.error}` };
          }
          return { ok: false, error: `Ollama HTTP ${res.status}: ${text}` };
        }

        const read = await readGenerateBody(res);
        if (!read.ok) {
          return { ok: false, error: `Ollama response rejected: ${read.error}` };
        }
        let json: { response?: string };
        try {
          json = JSON.parse(read.text) as { response?: string };
        } catch {
          // A 200 with a non-JSON body (reverse proxy / captive-portal HTML,
          // truncated body, wrong baseUrl). Keep it inside the
          // discriminated-union contract instead of escaping.
          return { ok: false, error: `Ollama returned a non-JSON response (HTTP ${res.status})` };
        }
        if (typeof json.response !== 'string') {
          return { ok: false, error: 'Unexpected Ollama response shape' };
        }

        return { ok: true, text: json.response };
      }

      return { ok: false, error: `Ollama request failed: too many attempts (max retries exceeded). ${offlineHint(config.baseUrl)}` };
    },
  };
}
