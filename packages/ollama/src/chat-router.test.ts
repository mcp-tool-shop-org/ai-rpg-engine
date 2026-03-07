// Tests — intent classification via keyword patterns and LLM fallback

import { describe, it, expect } from 'vitest';
import type { OllamaTextClient, PromptInput, PromptResult } from './client.js';
import { classifyByKeywords, classifyByLLM, classifyIntent } from './chat-router.js';

function mockClient(response: string): OllamaTextClient {
  return {
    async generate(_input: PromptInput): Promise<PromptResult> {
      return { ok: true, text: response };
    },
  };
}

function failingClient(): OllamaTextClient {
  return {
    async generate(_input: PromptInput): Promise<PromptResult> {
      return { ok: false, error: 'connection refused' };
    },
  };
}

// --- Keyword classification ---

describe('classifyByKeywords', () => {
  it('detects suggest_next from "what should I do next"', () => {
    const r = classifyByKeywords('what should I do next');
    expect(r).not.toBeNull();
    expect(r!.intent).toBe('suggest_next');
    expect(r!.confidence).toBe('high');
  });

  it('detects suggest_next from "what\'s next"', () => {
    const r = classifyByKeywords("what's next");
    expect(r).not.toBeNull();
    expect(r!.intent).toBe('suggest_next');
  });

  it('detects suggest_next from "recommend something"', () => {
    const r = classifyByKeywords('recommend something');
    expect(r).not.toBeNull();
    expect(r!.intent).toBe('suggest_next');
  });

  it('detects scaffold + extracts kind=room', () => {
    const r = classifyByKeywords('create a room about a haunted library');
    expect(r).not.toBeNull();
    expect(r!.intent).toBe('scaffold');
    expect(r!.params.kind).toBe('room');
  });

  it('detects scaffold + extracts kind=faction', () => {
    const r = classifyByKeywords('generate a faction of paranoid librarians');
    expect(r).not.toBeNull();
    expect(r!.intent).toBe('scaffold');
    expect(r!.params.kind).toBe('faction');
  });

  it('detects scaffold + extracts kind=district', () => {
    const r = classifyByKeywords('build a district');
    expect(r).not.toBeNull();
    expect(r!.intent).toBe('scaffold');
    expect(r!.params.kind).toBe('district');
  });

  it('detects scaffold + extracts kind=quest', () => {
    const r = classifyByKeywords('create a quest about finding the orb');
    expect(r).not.toBeNull();
    expect(r!.intent).toBe('scaffold');
    expect(r!.params.kind).toBe('quest');
  });

  it('detects scaffold + extracts kind=location-pack', () => {
    const r = classifyByKeywords('generate a location pack for the docks');
    expect(r).not.toBeNull();
    expect(r!.intent).toBe('scaffold');
    expect(r!.params.kind).toBe('location-pack');
  });

  it('detects scaffold + extracts kind=encounter-pack', () => {
    const r = classifyByKeywords('make an encounter pack');
    expect(r).not.toBeNull();
    expect(r!.intent).toBe('scaffold');
    expect(r!.params.kind).toBe('encounter-pack');
  });

  it('detects critique from "review this content"', () => {
    const r = classifyByKeywords('review this content');
    expect(r).not.toBeNull();
    expect(r!.intent).toBe('critique');
  });

  it('detects critique from "critique the room"', () => {
    const r = classifyByKeywords('critique the room');
    expect(r).not.toBeNull();
    expect(r!.intent).toBe('critique');
  });

  it('detects improve + extracts goal', () => {
    const r = classifyByKeywords('improve the quest descriptions');
    expect(r).not.toBeNull();
    expect(r!.intent).toBe('improve');
    expect(r!.params.goal).toContain('quest descriptions');
  });

  it('detects improve from "make it better"', () => {
    const r = classifyByKeywords('make it better');
    expect(r).not.toBeNull();
    expect(r!.intent).toBe('improve');
  });

  it('detects compare_replays', () => {
    const r = classifyByKeywords('compare the two replay outputs');
    expect(r).not.toBeNull();
    expect(r!.intent).toBe('compare_replays');
  });

  it('detects analyze_replay', () => {
    const r = classifyByKeywords('analyze this replay');
    expect(r).not.toBeNull();
    expect(r!.intent).toBe('analyze_replay');
  });

  it('detects plan + extracts theme', () => {
    const r = classifyByKeywords('plan a district around smuggling');
    expect(r).not.toBeNull();
    expect(r!.intent).toBe('plan');
    expect(r!.params.theme).toContain('smuggling');
  });

  it('detects explain_why from "why did the guards never escalate"', () => {
    const r = classifyByKeywords('why did the guards never escalate');
    expect(r).not.toBeNull();
    expect(r!.intent).toBe('explain_why');
    expect(r!.params.question).toContain('guards');
  });

  it('detects session_info from "show me the session"', () => {
    const r = classifyByKeywords('show me the session');
    expect(r).not.toBeNull();
    expect(r!.intent).toBe('session_info');
  });

  it('detects session_info from "open issues"', () => {
    const r = classifyByKeywords('open issues');
    expect(r).not.toBeNull();
    expect(r!.intent).toBe('session_info');
  });

  it('detects session_info from "what\'s in my session"', () => {
    const r = classifyByKeywords("what's in my session");
    expect(r).not.toBeNull();
    expect(r!.intent).toBe('session_info');
  });

  it('detects help', () => {
    const r = classifyByKeywords('help');
    expect(r).not.toBeNull();
    expect(r!.intent).toBe('help');
  });

  it('detects help from "what can you do"', () => {
    const r = classifyByKeywords('what can you do');
    expect(r).not.toBeNull();
    expect(r!.intent).toBe('help');
  });

  it('detects apply_content from "write this to disk"', () => {
    const r = classifyByKeywords('write this to disk');
    expect(r).not.toBeNull();
    expect(r!.intent).toBe('apply_content');
  });

  it('detects apply_content + extracts path', () => {
    const r = classifyByKeywords('save it to chapel.yaml');
    expect(r).not.toBeNull();
    expect(r!.intent).toBe('apply_content');
    expect(r!.params.targetPath).toBe('chapel.yaml');
  });

  it('detects explain_state from "what\'s happening"', () => {
    const r = classifyByKeywords("what's happening");
    expect(r).not.toBeNull();
    expect(r!.intent).toBe('explain_state');
  });

  it('returns null for unrecognized messages', () => {
    const r = classifyByKeywords('the weather is nice today');
    expect(r).toBeNull();
  });

  it('returns null for empty string', () => {
    const r = classifyByKeywords('');
    expect(r).toBeNull();
  });
});

// --- LLM classification ---

describe('classifyByLLM', () => {
  it('parses valid JSON intent from LLM', async () => {
    const client = mockClient('{"intent":"scaffold","params":{"kind":"room","theme":"haunted"}}');
    const r = await classifyByLLM(client, 'make me something spooky');
    expect(r.intent).toBe('scaffold');
    expect(r.confidence).toBe('medium');
    expect(r.params.kind).toBe('room');
    expect(r.params.theme).toBe('haunted');
  });

  it('handles LLM response with extra text around JSON', async () => {
    const client = mockClient('Here is the classification: {"intent":"suggest_next","params":{}} Done.');
    const r = await classifyByLLM(client, 'what next');
    expect(r.intent).toBe('suggest_next');
    expect(r.confidence).toBe('medium');
  });

  it('returns unknown for invalid intent', async () => {
    const client = mockClient('{"intent":"dance_party","params":{}}');
    const r = await classifyByLLM(client, 'throw a dance party');
    expect(r.intent).toBe('unknown');
    expect(r.confidence).toBe('medium');
  });

  it('returns unknown on LLM failure', async () => {
    const client = failingClient();
    const r = await classifyByLLM(client, 'anything');
    expect(r.intent).toBe('unknown');
    expect(r.confidence).toBe('low');
  });

  it('returns unknown on non-JSON LLM response', async () => {
    const client = mockClient('I cannot determine the intent');
    const r = await classifyByLLM(client, 'random gibberish');
    expect(r.intent).toBe('unknown');
    expect(r.confidence).toBe('low');
  });

  it('handles params as non-object gracefully', async () => {
    const client = mockClient('{"intent":"help","params":"none"}');
    const r = await classifyByLLM(client, 'help me');
    expect(r.intent).toBe('help');
    expect(r.params).toEqual({});
  });
});

// --- Unified classifyIntent ---

describe('classifyIntent', () => {
  it('uses keyword path when match exists', async () => {
    // Keywords match "help" — LLM should not be called
    const client = failingClient(); // Would fail if called
    const r = await classifyIntent(client, 'help');
    expect(r.intent).toBe('help');
    expect(r.confidence).toBe('high');
  });

  it('falls back to LLM when keywords miss', async () => {
    const client = mockClient('{"intent":"scaffold","params":{"kind":"room"}}');
    const r = await classifyIntent(client, 'I want something entirely new for my game');
    expect(r.intent).toBe('scaffold');
    expect(r.confidence).toBe('medium');
  });

  it('returns unknown when both paths fail', async () => {
    const client = failingClient();
    const r = await classifyIntent(client, 'asdfjkl;');
    expect(r.intent).toBe('unknown');
    expect(r.confidence).toBe('low');
  });
});
