import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CORE_SOUND_PACK } from './core-pack.js';
import { cueMapCoverage, cueMapTargetIds, cueMapIsCoveredBy } from './cue-map.js';
import { loadJson, loadFile, scaffoldManifest } from './authoring.js';

const validEntry = {
  id: 'tavern_chatter',
  tags: ['ambient', 'social'],
  domain: 'ambient',
  intensity: 'low',
  mood: ['calm'],
  durationClass: 'long-loop',
  cooldownMs: 0,
  variants: ['tavern_chatter_01.wav'],
  source: 'file',
};

const validPack = {
  name: 'medieval-tavern',
  version: '1.0.0',
  description: 'Tavern ambience',
  author: 'test',
  entries: [validEntry],
};

describe('loadJson / loadFile (F-2181892d)', () => {
  it('parses a valid JSON pack and validates by default', () => {
    const pack = loadJson(JSON.stringify(validPack));
    expect(pack.name).toBe('medieval-tavern');
    expect(pack.entries[0].id).toBe('tavern_chatter');
  });

  it('throws on invalid JSON', () => {
    expect(() => loadJson('{nope')).toThrow(/invalid JSON/);
  });

  it('throws on schema errors when validate is default-on', () => {
    const bad = { ...validPack, entries: [{ ...validEntry, domain: 'not-a-domain' }] };
    expect(() => loadJson(JSON.stringify(bad))).toThrow(/manifest is invalid/);
    expect(() => loadJson(JSON.stringify(bad))).toThrow(/domain/);
  });

  it('skips schema validation when validate: false', () => {
    const bad = { ...validPack, entries: [{ ...validEntry, domain: 'not-a-domain' }] };
    const pack = loadJson(JSON.stringify(bad), { validate: false });
    expect(pack.entries[0].id).toBe('tavern_chatter');
  });

  it('loadFile reads a JSON document from disk', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sp-auth-'));
    const path = join(dir, 'pack.json');
    await writeFile(path, JSON.stringify(validPack), 'utf8');
    const pack = await loadFile(path);
    expect(pack.author).toBe('test');
  });
});

describe('scaffoldManifest (F-2181892d)', () => {
  it('clones CORE_SOUND_PACK with a new name and author', () => {
    const pack = scaffoldManifest({ name: 'my-pack', author: 'ada' });
    expect(pack.name).toBe('my-pack');
    expect(pack.author).toBe('ada');
    expect(pack.version).toBe('1.0.0');
    expect(pack.entries.map((e) => e.id)).toEqual(CORE_SOUND_PACK.entries.map((e) => e.id));
  });

  it('does not alias nested arrays back to CORE_SOUND_PACK', () => {
    const pack = scaffoldManifest({ name: 'x', author: 'y' });
    pack.entries[0].tags.push('poison');
    pack.entries[0].variants.push('evil.wav');
    expect(CORE_SOUND_PACK.entries[0].tags).not.toContain('poison');
    expect(CORE_SOUND_PACK.entries[0].variants).toEqual([]);
  });

  it('accepts an explicit from pack', () => {
    const pack = scaffoldManifest({ name: 'tavern', author: 'ada', from: validPack as typeof CORE_SOUND_PACK });
    expect(pack.entries).toHaveLength(1);
    expect(pack.entries[0].id).toBe('tavern_chatter');
  });
});

describe('cueMapCoverage (F-2181892d)', () => {
  it('reports the core pack as covering every built-in target, with extras for unused entries', () => {
    const ids = CORE_SOUND_PACK.entries.map((e) => e.id);
    const cov = cueMapCoverage(ids);
    expect(cov.missing).toEqual([]);
    expect(cov.covered).toEqual(cueMapTargetIds());
    expect(cueMapIsCoveredBy(ids)).toBe(true);
    expect(cov.extra.length).toBeGreaterThan(0);
    expect(cov.extra).toContain('ui_click');
  });

  it('lists holy_smite_01 as missing when an extendCueMap target is absent from entries', () => {
    const ids = CORE_SOUND_PACK.entries.map((e) => e.id);
    const cov = cueMapCoverage(ids, ['holy_smite_01']);
    expect(cov.missing).toContain('holy_smite_01');
    expect(cov.covered).not.toContain('holy_smite_01');
  });

  it('moves holy_smite_01 from missing to covered once the pack implements it', () => {
    const ids = [...CORE_SOUND_PACK.entries.map((e) => e.id), 'holy_smite_01'];
    const cov = cueMapCoverage(ids, ['holy_smite_01']);
    expect(cov.missing).not.toContain('holy_smite_01');
    expect(cov.covered).toContain('holy_smite_01');
    expect(cov.extra).not.toContain('holy_smite_01');
  });
});
