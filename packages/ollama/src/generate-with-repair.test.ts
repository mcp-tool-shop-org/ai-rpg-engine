import { describe, it, expect } from 'vitest';
import type { OllamaTextClient, PromptInput, PromptResult } from './client.js';
import { generateWithRepair } from './generate-with-repair.js';
import { validateGeneratedFaction } from './validators.js';

function sequencedClient(responses: PromptResult[]): OllamaTextClient {
  let i = 0;
  return {
    async generate(_input: PromptInput): Promise<PromptResult> {
      const next = responses[i] ?? { ok: false, error: 'no more responses' };
      i++;
      return next;
    },
  };
}

describe('generateWithRepair', () => {
  it('returns the first draft when valid', async () => {
    const yaml = [
      'id: dock_rats',
      'name: The Dock Rats',
      'members:',
      '  - rat_boss',
    ].join('\n');
    const client = sequencedClient([{ ok: true, text: yaml }]);
    const result = await generateWithRepair({
      client,
      system: 'sys',
      prompt: 'go',
      repair: true,
      kindLabel: 'faction',
      validate: validateGeneratedFaction,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.yaml).toContain('dock_rats');
      expect(result.repaired).toBeUndefined();
    }
  });

  it('skips the second generate when repair is off', async () => {
    const calls: string[] = [];
    const client: OllamaTextClient = {
      async generate(input: PromptInput): Promise<PromptResult> {
        calls.push(input.prompt);
        return { ok: true, text: 'id: broken' };
      },
    };
    const result = await generateWithRepair({
      client,
      system: 'sys',
      prompt: 'first',
      repair: false,
      kindLabel: 'faction',
      validate: validateGeneratedFaction,
    });
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    if (result.ok) expect(result.validation.valid).toBe(false);
  });

  it('runs one repair generate when the first draft is invalid', async () => {
    const fixed = [
      'id: dock_rats',
      'name: The Dock Rats',
      'members:',
      '  - rat_boss',
    ].join('\n');
    const client = sequencedClient([
      { ok: true, text: 'id: broken' },
      { ok: true, text: fixed },
    ]);
    const result = await generateWithRepair({
      client,
      system: 'sys',
      prompt: 'first',
      repair: true,
      kindLabel: 'faction',
      validate: validateGeneratedFaction,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.repaired).toBe(true);
      expect(result.yaml).toContain('dock_rats');
      expect(result.repairNote).toMatch(/Repaired|Repair attempted/);
    }
  });

  it('surfaces a failed repair generate without dropping the original draft', async () => {
    const client = sequencedClient([
      { ok: true, text: 'id: broken' },
      { ok: false, error: 'Could not reach the Ollama server. Start it with "ollama serve".' },
    ]);
    const result = await generateWithRepair({
      client,
      system: 'sys',
      prompt: 'first',
      repair: true,
      kindLabel: 'faction',
      validate: validateGeneratedFaction,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.repaired).toBe(false);
      expect(result.yaml).toContain('broken');
      expect(result.repairNote).toMatch(/Repair failed/i);
      expect(result.repairNote).toContain('ollama serve');
    }
  });
});
