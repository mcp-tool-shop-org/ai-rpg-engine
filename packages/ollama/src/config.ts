// Ollama configuration — resolution order: explicit > env > defaults

export type OllamaConfig = {
  baseUrl: string;
  model: string;
  timeoutMs: number;
  temperature: number;
  maxTokens?: number;
  /**
   * Total request attempts per generate() call, including the first
   * (1 = no retry). Default: 3. (v2.5 audit PA-3 — previously hardcoded.)
   */
  maxAttempts: number;
  /** Fixed delay between retry attempts, in milliseconds. Default: 1000. */
  retryDelayMs: number;
};

/** Absolute ceiling on generate() wait (F-b67b6830). Bounds AbortSignal.timeout; bytes are capped separately. */
export const MAX_OLLAMA_TIMEOUT_MS = 600_000;

const DEFAULTS: OllamaConfig = {
  baseUrl: 'http://localhost:11434',
  model: 'qwen2.5-coder',
  timeoutMs: 30_000,
  temperature: 0.2,
  maxAttempts: 3,
  retryDelayMs: 1000,
};

/**
 * Coerce a caller-supplied timeout to a finite integer in (0, MAX_OLLAMA_TIMEOUT_MS].
 * Infinity → ceiling; NaN / non-positive → default. Never returns non-finite.
 */
export function clampTimeoutMs(raw: number | undefined): number {
  if (raw === undefined) return DEFAULTS.timeoutMs;
  if (!Number.isFinite(raw)) {
    return raw === Infinity ? MAX_OLLAMA_TIMEOUT_MS : DEFAULTS.timeoutMs;
  }
  if (raw <= 0) return DEFAULTS.timeoutMs;
  return Math.min(Math.floor(raw), MAX_OLLAMA_TIMEOUT_MS);
}

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
    timeoutMs: clampTimeoutMs(
      overrides?.timeoutMs
      ?? resolveTimeoutMs(process.env['AI_RPG_ENGINE_OLLAMA_TIMEOUT_MS']),
    ),
    temperature: overrides?.temperature ?? DEFAULTS.temperature,
    maxTokens: overrides?.maxTokens,
    maxAttempts: resolveMaxAttempts(overrides?.maxAttempts),
    retryDelayMs: resolveRetryDelayMs(overrides?.retryDelayMs),
  };
}

/**
 * Clamp a caller-supplied attempt count to a sane integer ≥ 1. A non-finite or
 * sub-1 value falls back to the default — a NaN/0 count would silently skip
 * every attempt and return "max retries exceeded" without ever calling fetch.
 */
function resolveMaxAttempts(raw: number | undefined): number {
  if (raw === undefined || !Number.isFinite(raw)) return DEFAULTS.maxAttempts;
  return Math.max(1, Math.floor(raw));
}

/** Clamp a caller-supplied retry delay to a finite non-negative integer (0 is valid: retry immediately). */
function resolveRetryDelayMs(raw: number | undefined): number {
  if (raw === undefined || !Number.isFinite(raw) || raw < 0) return DEFAULTS.retryDelayMs;
  return Math.floor(raw);
}

/**
 * Parse the timeout env var into a number for clampTimeoutMs.
 * Non-numeric / empty / non-positive values become undefined so the clamp
 * falls back to the default — never a raw NaN handed to AbortSignal.timeout.
 */
function resolveTimeoutMs(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}
