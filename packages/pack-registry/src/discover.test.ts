import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearRegistry,
  getPack,
  getPackSummaries,
  registerFromModule,
  packEntryFromModule,
  discoverInstalledPacks,
} from './index.js';
import * as fantasy from '@ai-rpg-engine/starter-fantasy';
import * as starterTemplate from '../../../templates/starter/src/index.js';

describe('registerFromModule / packEntryFromModule', () => {
  beforeEach(() => {
    clearRegistry();
  });

  it('lifts a shipped starter barrel into a PackEntry with session catalogs', () => {
    const entry = packEntryFromModule(fantasy);
    expect(entry).not.toBeNull();
    expect(entry!.meta.id).toBe('chapel-threshold');
    expect(entry!.manifest.id).toBe('chapel-threshold');
    expect(entry!.ruleset.id).toBe('fantasy-minimal');
    expect(typeof entry!.createGame).toBe('function');
    expect(Array.isArray(entry!.districts) && entry!.districts!.length >= 1).toBe(true);
    expect(entry!.buildCatalog).toBeDefined();
    expect(entry!.itemCatalog).toBeDefined();
    expect(Array.isArray(entry!.itemCatalog?.items) && entry!.itemCatalog!.items!.length >= 1).toBe(true);
    expect(Array.isArray(entry!.progressionTrees) && entry!.progressionTrees!.length >= 1).toBe(true);
    expect(Array.isArray(entry!.statusDefinitions) && entry!.statusDefinitions!.length >= 1).toBe(true);
  });

  it('registers the lifted entry; a second call is idempotent', () => {
    const first = registerFromModule(fantasy, '@ai-rpg-engine/starter-fantasy');
    const second = registerFromModule(fantasy, '@ai-rpg-engine/starter-fantasy');
    expect(second).toBe(first);
    expect(getPack('chapel-threshold')).toBe(first);
  });

  it('refuses a module that does not advertise packMeta + createGame', () => {
    expect(() => registerFromModule({ packMeta: { id: 'x' } }, 'partial')).toThrow(
      /does not advertise packMeta \+ createGame/,
    );
  });
});

describe('discoverInstalledPacks', () => {
  beforeEach(() => {
    clearRegistry();
  });

  it('imports a node-resolved starter, registers it, and preserves getPackSummaries display fields', async () => {
    const packs = await discoverInstalledPacks({
      from: { nodeResolution: ['@ai-rpg-engine/starter-fantasy'] },
    });
    expect(packs).toHaveLength(1);
    expect(packs[0].meta.id).toBe('chapel-threshold');
    expect(packs[0].buildCatalog).toBeDefined();
    expect(packs[0].itemCatalog).toBeDefined();
    expect(getPack('chapel-threshold')).toBe(packs[0]);

    const [summary] = getPackSummaries();
    expect(summary).toMatchObject({
      id: 'chapel-threshold',
      name: packs[0].meta.name,
      tagline: packs[0].meta.tagline,
      description: packs[0].meta.description,
      version: packs[0].meta.version,
      genres: packs[0].meta.genres,
      tones: packs[0].meta.tones,
    });
    expect(summary).toHaveProperty('genreLabels');
    expect(summary).not.toHaveProperty('buildCatalog');
  });

  it('accepts moduleUrls alongside nodeResolution', async () => {
    const packs = await discoverInstalledPacks({
      from: { moduleUrls: [], nodeResolution: ['@ai-rpg-engine/starter-fantasy'] },
    });
    expect(packs[0].meta.id).toBe('chapel-threshold');
  });

  it('throws when from has no specifiers', async () => {
    await expect(discoverInstalledPacks({ from: {} })).rejects.toThrow(/both empty/);
  });

  it('throws when a specifier cannot be imported', async () => {
    await expect(
      discoverInstalledPacks({ from: { nodeResolution: ['@ai-rpg-engine/definitely-not-a-pack'] } }),
    ).rejects.toThrow(/failed to import/);
  });

  it('lifts the published starter template as a catalog member (F-2abeea73 / F-77de12b0)', () => {
    const entry = registerFromModule(starterTemplate, 'starter-template');
    expect(entry.meta.id).toBe('my-game');
    expect(entry.buildCatalog).toBeDefined();
    expect(entry.itemCatalog).toBeDefined();
    expect(Array.isArray(entry.progressionTrees) && entry.progressionTrees!.length >= 1).toBe(true);
    expect(Array.isArray(entry.statusDefinitions)).toBe(true);
    expect(Array.isArray(entry.districts) && entry.districts!.length >= 1).toBe(true);
  });
});
