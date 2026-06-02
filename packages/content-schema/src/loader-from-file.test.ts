import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadContentFromFile } from './loader.js';

// CA-DX-01: loadContentFromFile reads a JSON file from local disk, parses it
// (guarding malformed JSON with a STRUCTURED error in the LoadResult shape — never
// a raw throw), and runs it through loadContent + validateGameContent. Deterministic,
// local fs only (no network, no clock, no RNG).

describe('loadContentFromFile', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-rpg-loadfile-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writePack(name: string, contents: string): string {
    const p = path.join(tmpDir, name);
    fs.writeFileSync(p, contents, 'utf-8');
    return p;
  }

  it('loads a valid content pack from a JSON file', () => {
    const pack = {
      entities: [
        { id: 'player', type: 'player', name: 'Wanderer' },
        { id: 'goblin', type: 'enemy', name: 'Goblin', baseResources: { hp: 10 } },
      ],
      zones: [{ id: 'cave', name: 'Cave', neighbors: [] }],
    };
    const file = writePack('good.json', JSON.stringify(pack));

    const r = loadContentFromFile(file);
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
    expect(r.summary).toContain('2 entities');
    expect(r.summary).toContain('1 zones');
  });

  it('reports a structured error (no raw throw) when the JSON is malformed', () => {
    const file = writePack('broken.json', '{ "entities": [  ');

    let r!: ReturnType<typeof loadContentFromFile>;
    expect(() => {
      r = loadContentFromFile(file);
    }).not.toThrow();
    expect(r.ok).toBe(false);
    // The error must name the file boundary, carry a parse hint, and NOT be a raw stack.
    const parseErr = r.errors.find((e) => e.path === 'file');
    expect(parseErr).toBeDefined();
    expect(parseErr!.message.toLowerCase()).toContain('json');
  });

  it('reports a structured error (no raw throw) when the file does not exist', () => {
    const file = path.join(tmpDir, 'does-not-exist.json');

    let r!: ReturnType<typeof loadContentFromFile>;
    expect(() => {
      r = loadContentFromFile(file);
    }).not.toThrow();
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.path === 'file')).toBe(true);
  });

  it('surfaces schema validation errors from the loaded pack', () => {
    // entity with an empty id is structurally invalid.
    const file = writePack('bad-schema.json', JSON.stringify({ entities: [{ id: '', type: 'x', name: 'Y' }] }));

    const r = loadContentFromFile(file);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.path.includes('id'))).toBe(true);
  });

  it('surfaces cross-reference (validateGameContent) errors — bad startingStatuses', () => {
    // A pack that is structurally fine but references a status that the pack's own
    // status registry does not define. validateGameContent derives the registry from
    // pack.statuses, so the dangling reference must be reported as an error.
    const pack = {
      entities: [{ id: 'hero', type: 'player', name: 'Hero', startingStatuses: ['ghost-buff'] }],
      statuses: [{ id: 'real-buff', name: 'Real Buff', tags: ['buff'], stacking: 'refresh' }],
    };
    const file = writePack('bad-ref.json', JSON.stringify(pack));

    const r = loadContentFromFile(file);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes('ghost-buff'))).toBe(true);
  });

  it('returns advisories separately from errors (does not flip ok)', () => {
    // One-way passage is an ADVISORY, not an error (CA-01) — the pack still loads ok.
    const pack = {
      zones: [
        { id: 'a', name: 'A', neighbors: ['b'] },
        { id: 'b', name: 'B', neighbors: [] },
      ],
    };
    const file = writePack('advisory.json', JSON.stringify(pack));

    const r = loadContentFromFile(file);
    expect(r.ok).toBe(true);
    expect(r.advisories.length).toBeGreaterThan(0);
    expect(r.advisories.some((a) => a.message.includes('one-way'))).toBe(true);
  });

  it('is deterministic — same file yields byte-identical result twice', () => {
    const pack = {
      entities: [{ id: 'p', type: 'player', name: 'P' }],
      zones: [{ id: 'z', name: 'Z', neighbors: [] }],
    };
    const file = writePack('determinism.json', JSON.stringify(pack));

    const a = loadContentFromFile(file);
    const b = loadContentFromFile(file);
    expect(JSON.stringify(a.errors)).toBe(JSON.stringify(b.errors));
    expect(JSON.stringify(a.advisories)).toBe(JSON.stringify(b.advisories));
    expect(a.summary).toBe(b.summary);
  });
});
