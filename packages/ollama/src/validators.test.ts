// Unit tests — YAML-ish parser and room validation pipeline

import { describe, it, expect } from 'vitest';
import { parseYamlish, validateGeneratedRoom } from './validators.js';

describe('parseYamlish', () => {
  it('parses flat key-value YAML', () => {
    const result = parseYamlish('id: chapel\nname: Ruined Chapel') as Record<string, unknown>;
    expect(result['id']).toBe('chapel');
    expect(result['name']).toBe('Ruined Chapel');
  });

  it('coerces numbers and booleans', () => {
    const result = parseYamlish('light: 0.5\nactive: true\ncount: 3') as Record<string, unknown>;
    expect(result['light']).toBe(0.5);
    expect(result['active']).toBe(true);
    expect(result['count']).toBe(3);
  });

  it('falls back to JSON parse', () => {
    const result = parseYamlish('{"id": "chapel"}') as Record<string, unknown>;
    expect(result['id']).toBe('chapel');
  });

  it('returns empty object for garbage input', () => {
    const result = parseYamlish('☃☃☃');
    expect(result).toBeDefined();
  });
});

describe('validateGeneratedRoom', () => {
  it('reports errors for incomplete room', () => {
    const result = validateGeneratedRoom('id: test', { id: 'test' });
    expect(result.valid).toBe(false);
    expect(result.validation.errors.length).toBeGreaterThan(0);
  });

  it('preserves raw output', () => {
    const raw = 'id: test\nname: Test';
    const result = validateGeneratedRoom(raw, { id: 'test', name: 'Test' });
    expect(result.raw).toBe(raw);
  });
});
