import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_EVENT_TYPES, type EngineEventType } from './index.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function extractAppendixEventTypes(markdownPath: string): string[] {
  const raw = readFileSync(markdownPath, 'utf8');
  const events: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const match = /^\|\s*`([^`]+)`\s*\|/.exec(line);
    if (match) events.push(match[1]);
  }
  return events;
}

describe('ENGINE_EVENT_TYPES vocabulary contract', () => {
  it('matches all 39 documented event table rows in docs/handbook/appendix-a-event-vocabulary.md', () => {
    const documented = extractAppendixEventTypes(
      resolve(repoRoot, 'docs/handbook/appendix-a-event-vocabulary.md'),
    );
    expect(documented).toHaveLength(39);
    expect(ENGINE_EVENT_TYPES).toHaveLength(documented.length);
    expect(new Set(ENGINE_EVENT_TYPES).size).toBe(ENGINE_EVENT_TYPES.length);
    expect([...ENGINE_EVENT_TYPES]).toEqual(documented);

    const sample: EngineEventType = ENGINE_EVENT_TYPES[0];
    expect(sample).toBe('world.zone.entered');
  });

  it('keeps the Starlight handbook mirror in parity with the canonical 39-event table', () => {
    const siteDocumented = extractAppendixEventTypes(
      resolve(repoRoot, 'site/src/content/docs/handbook/appendix-a-event-vocabulary.md'),
    );
    expect([...ENGINE_EVENT_TYPES]).toEqual(siteDocumented);
  });
});
