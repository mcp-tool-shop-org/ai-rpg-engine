// Ollama HTTP client — thin wrapper around the /api/generate endpoint

import type { OllamaConfig } from './config.js';

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

export function createClient(config: OllamaConfig, options?: OllamaClientOptions): OllamaTextClient {
  const onRetry = options?.onRetry ?? defaultOnRetry;
  // Belt-and-braces for hand-built configs that predate the retry fields
  // (resolveConfig always sets them): missing values fall back to the
  // documented defaults instead of collapsing the loop to zero attempts.
  const maxAttempts = Math.max(1, Math.floor(config.maxAttempts ?? 3));
  const retryDelayMs = Math.max(0, Math.floor(config.retryDelayMs ?? 1000));

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
            signal: AbortSignal.timeout(config.timeoutMs),
          });
        } catch (err) {
          if (attempt < maxAttempts && err instanceof TypeError) {
            const message = err.message || 'fetch failed';
            onRetry({ attempt, maxAttempts, reason: `network error: ${message}`, delayMs: retryDelayMs });
            await sleep(retryDelayMs);
            continue;
          }
          const message = err instanceof Error ? err.message : String(err);
          return { ok: false, error: `Ollama request failed: ${message}. ${offlineHint(config.baseUrl)}` };
        }

        if (!res.ok) {
          if (attempt < maxAttempts && res.status >= 500) {
            onRetry({ attempt, maxAttempts, reason: `HTTP ${res.status}`, delayMs: retryDelayMs });
            await sleep(retryDelayMs);
            continue;
          }
          const text = await res.text().catch(() => '(no body)');
          return { ok: false, error: `Ollama HTTP ${res.status}: ${text}` };
        }

        let json: { response?: string };
        try {
          json = await res.json() as { response?: string };
        } catch {
          // A 200 with a non-JSON body (reverse proxy / captive-portal HTML,
          // truncated body, wrong baseUrl) makes res.json() throw a SyntaxError.
          // Keep it inside the discriminated-union contract instead of escaping.
          return { ok: false, error: `Ollama returned a non-JSON response (HTTP ${res.status})` };
        }
        if (typeof json.response !== 'string') {
          return { ok: false, error: 'Unexpected Ollama response shape' };
        }

        return { ok: true, text: json.response };
      }

      return { ok: false, error: `Ollama request failed: max retries exceeded. ${offlineHint(config.baseUrl)}` };
    },
  };
}
