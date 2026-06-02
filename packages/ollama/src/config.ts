// Ollama configuration — resolution order: explicit > env > defaults

export type OllamaConfig = {
  baseUrl: string;
  model: string;
  timeoutMs: number;
  temperature: number;
  maxTokens?: number;
};

const DEFAULTS: OllamaConfig = {
  baseUrl: 'http://localhost:11434',
  model: 'qwen2.5-coder',
  timeoutMs: 30_000,
  temperature: 0.2,
};

export function resolveConfig(overrides?: Partial<OllamaConfig>): OllamaConfig {
  return {
    baseUrl:
      overrides?.baseUrl
      ?? process.env['AI_RPG_ENGINE_OLLAMA_URL']
      ?? DEFAULTS.baseUrl,
    model:
      overrides?.model
      ?? process.env['AI_RPG_ENGINE_OLLAMA_MODEL']
      ?? DEFAULTS.model,
    timeoutMs:
      overrides?.timeoutMs
      ?? resolveTimeoutMs(process.env['AI_RPG_ENGINE_OLLAMA_TIMEOUT_MS']),
    temperature: overrides?.temperature ?? DEFAULTS.temperature,
    maxTokens: overrides?.maxTokens,
  };
}

/**
 * Parse the timeout env var into a valid milliseconds value.
 * A malformed (NaN), empty, zero, or negative value falls back to the default —
 * an unvalidated Number() yields NaN, which makes AbortSignal.timeout misbehave.
 */
function resolveTimeoutMs(raw: string | undefined): number {
  if (raw === undefined) return DEFAULTS.timeoutMs;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULTS.timeoutMs;
  return parsed;
}
