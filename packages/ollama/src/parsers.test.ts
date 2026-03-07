// Unit tests — parsers, validators, config, prompt assembly, CLI dispatch
// No live Ollama needed. Client is mocked.

import { describe, it, expect } from 'vitest';
import { extractYaml, extractJson, extractText } from './parsers.js';

describe('extractYaml', () => {
  it('extracts from fenced yaml block', () => {
    const raw = 'Here is the room:\n```yaml\nid: chapel\nname: Chapel\n```\nDone.';
    expect(extractYaml(raw)).toBe('id: chapel\nname: Chapel');
  });

  it('extracts from fenced yml block', () => {
    const raw = '```yml\nid: crypt\n```';
    expect(extractYaml(raw)).toBe('id: crypt');
  });

  it('strips leading prose and finds YAML start', () => {
    const raw = 'Sure, here is your room:\n\nid: chapel\nname: Ruined Chapel';
    expect(extractYaml(raw)).toBe('id: chapel\nname: Ruined Chapel');
  });

  it('returns raw when no YAML detected', () => {
    expect(extractYaml('just plain text')).toBe('just plain text');
  });
});

describe('extractJson', () => {
  it('extracts from fenced json block', () => {
    const raw = '```json\n{"id":"chapel"}\n```';
    expect(extractJson(raw)).toBe('{"id":"chapel"}');
  });

  it('extracts bare JSON object', () => {
    const raw = 'Result: {"id": "chapel", "name": "Chapel"}. Done.';
    expect(extractJson(raw)).toBe('{"id": "chapel", "name": "Chapel"}');
  });

  it('extracts JSON array', () => {
    const raw = 'Errors: [{"path":"a","message":"b"}]';
    expect(extractJson(raw)).toBe('[{"path":"a","message":"b"}]');
  });

  it('returns raw when no JSON found', () => {
    expect(extractJson('no json here')).toBe('no json here');
  });
});

describe('extractText', () => {
  it('strips markdown fences', () => {
    const raw = '```\nplain content\n```';
    expect(extractText(raw)).toBe('plain content');
  });

  it('returns raw when no fences', () => {
    expect(extractText('hello world')).toBe('hello world');
  });
});
