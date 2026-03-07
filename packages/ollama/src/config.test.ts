// Unit tests — config resolution

import { describe, it, expect, afterEach } from 'vitest';
import { resolveConfig } from './config.js';

describe('resolveConfig', () => {
  const envKeys = [
    'AI_RPG_ENGINE_OLLAMA_URL',
    'AI_RPG_ENGINE_OLLAMA_MODEL',
    'AI_RPG_ENGINE_OLLAMA_TIMEOUT_MS',
  ] as const;

  afterEach(() => {
    for (const key of envKeys) {
      delete process.env[key];
    }
  });

  it('returns defaults when nothing is set', () => {
    const cfg = resolveConfig();
    expect(cfg.baseUrl).toBe('http://localhost:11434');
    expect(cfg.model).toBe('qwen2.5-coder');
    expect(cfg.timeoutMs).toBe(30_000);
    expect(cfg.temperature).toBe(0.2);
    expect(cfg.maxTokens).toBeUndefined();
  });

  it('overrides take highest priority', () => {
    process.env['AI_RPG_ENGINE_OLLAMA_URL'] = 'http://env:1234';
    const cfg = resolveConfig({ baseUrl: 'http://explicit:5678' });
    expect(cfg.baseUrl).toBe('http://explicit:5678');
  });

  it('env vars take priority over defaults', () => {
    process.env['AI_RPG_ENGINE_OLLAMA_MODEL'] = 'llama3.1';
    process.env['AI_RPG_ENGINE_OLLAMA_TIMEOUT_MS'] = '60000';
    const cfg = resolveConfig();
    expect(cfg.model).toBe('llama3.1');
    expect(cfg.timeoutMs).toBe(60_000);
  });

  it('respects maxTokens override', () => {
    const cfg = resolveConfig({ maxTokens: 2048 });
    expect(cfg.maxTokens).toBe(2048);
  });
});
