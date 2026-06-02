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

export function createClient(config: OllamaConfig): OllamaTextClient {
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

      const maxAttempts = 3;
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
            await new Promise(r => setTimeout(r, 1000));
            continue;
          }
          const message = err instanceof Error ? err.message : String(err);
          return { ok: false, error: `Ollama request failed: ${message}` };
        }

        if (!res.ok) {
          if (attempt < maxAttempts && res.status >= 500) {
            await new Promise(r => setTimeout(r, 1000));
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

      return { ok: false, error: 'Ollama request failed: max retries exceeded' };
    },
  };
}
