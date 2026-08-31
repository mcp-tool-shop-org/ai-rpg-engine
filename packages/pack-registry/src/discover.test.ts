import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
    expect(entry!.content).toBeDefined();
    expect(Array.isArray(entry!.content?.entities) && entry!.content!.entities!.length >= 1).toBe(true);
  });

  it('registers the lifted entry; a second call is idempotent', () => {
    const first = registerFromModule(fantasy, '@ai-rpg-engine/starter-fantasy');
    const second = registerFromModule(fantasy, '@ai-rpg-engine/starter-fantasy');
    expect(second).toBe(first);
    expect(getPack('chapel-threshold')).toBe(first);
  });

  it('refuses a module that does not advertise packMeta + createGame', () => {
    expect(() => registerFromModule({ packMeta: { id: 'x' } }, 'partial')).toThrow(
      /does not advertise packMeta \+ \(createGame or pack\/toContentPack\)/,
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

  it('F-4374f28f: named TS catalog exports override content-derived catalogs', () => {
    const entry = packEntryFromModule({
      packMeta: {
        id: 'override-pack',
        name: 'Override',
        tagline: '',
        genres: [],
        difficulty: 'beginner',
        tones: [],
        tags: [],
        engineVersion: '*',
        version: '1',
        description: '',
        narratorTone: '',
      },
      manifest: {
        id: 'override-pack',
        title: 'Override',
        version: '1',
        engineVersion: '*',
        ruleset: 'r',
        modules: [],
        contentPacks: [],
      },
      ruleset: {
        id: 'r',
        name: 'R',
        version: '1',
        stats: [],
        resources: [],
        verbs: [],
        formulas: [],
        defaultModules: [],
        progressionModels: [],
      },
      createGame: () => ({}),
      buildCatalog: { packId: 'from-export' },
      pack: {
        buildCatalog: { packId: 'from-content' },
        items: [{ id: 'from-content-item' }],
        districts: [{ id: 'd', controllingFaction: 'f' }],
      },
    });
    expect(entry).not.toBeNull();
    expect(entry!.buildCatalog).toEqual({ packId: 'from-export' });
    expect(entry!.itemCatalog).toEqual({ items: [{ id: 'from-content-item' }] });
    expect(entry!.districts).toEqual([{ id: 'd', controllingFaction: 'f' }]);
  });

  it('F-91a5ec29: lifts mod.pack / toContentPack() onto PackEntry.content', () => {
    const entry = packEntryFromModule(starterTemplate);
    expect(entry).not.toBeNull();
    expect(entry!.content).toBeDefined();
    expect(Array.isArray(entry!.content!.entities) && entry!.content!.entities!.length >= 1).toBe(true);
    expect(Array.isArray(entry!.content!.zones) && entry!.content!.zones!.length >= 1).toBe(true);
  });

  it('F-91a5ec29: JSON specifiers load via loadContentFromFile as catalog-only entries', async () => {
    const jsonUrl = new URL('../../../templates/starter/src/content.json', import.meta.url);
    const packs = await discoverInstalledPacks({
      from: { moduleUrls: [jsonUrl.href] },
    });
    expect(packs).toHaveLength(1);
    expect(packs[0].content).toBeDefined();
    expect(Array.isArray(packs[0].content!.entities)).toBe(true);
    expect(packs[0].needsRuntimeHost).toBe(true);
    expect(typeof packs[0].createGame).not.toBe('function');
    const [summary] = getPackSummaries();
    expect(summary.needsRuntimeHost).toBe(true);
  });

  it('F-4374f28f: JSON specifier with buildCatalog lifts entry.buildCatalog from content', async () => {
    const jsonUrl = new URL('../../../templates/starter/src/content.json', import.meta.url);
    const packs = await discoverInstalledPacks({
      from: { moduleUrls: [jsonUrl.href] },
    });
    expect(packs[0].buildCatalog).toBeDefined();
    expect(packs[0].itemCatalog).toBeDefined();
    expect(Array.isArray(packs[0].itemCatalog?.items) && packs[0].itemCatalog!.items!.length >= 1).toBe(true);
    expect(Array.isArray(packs[0].progressionTrees) && packs[0].progressionTrees!.length >= 1).toBe(true);
    expect(Array.isArray(packs[0].districts) && packs[0].districts!.length >= 1).toBe(true);
    expect(Array.isArray(packs[0].statusDefinitions)).toBe(true);
  });

  it('F-b2d31aad: JSON specifier prefers authored meta/manifest over the filename stub', async () => {
    const jsonUrl = new URL('../../../templates/starter/src/content.json', import.meta.url);
    const packs = await discoverInstalledPacks({
      from: { moduleUrls: [jsonUrl.href] },
    });
    expect(packs[0].meta.id).toBe('my-game');
    expect(packs[0].meta.name).toBe('My Game');
    expect(packs[0].manifest.id).toBe('my-game');
    expect(packs[0].manifest.title).toBe('My Game');
  });

  it('F-b2d31aad / F-4374f28f: starter-fantasy content.json lists as Chapel Threshold with catalogs', async () => {
    const jsonUrl = new URL('../../starter-fantasy/src/content.json', import.meta.url);
    const packs = await discoverInstalledPacks({
      from: { moduleUrls: [jsonUrl.href] },
    });
    expect(packs[0].meta.id).toBe('chapel-threshold');
    expect(packs[0].meta.name).toBe('The Chapel Threshold');
    expect(packs[0].buildCatalog).toBeDefined();
    expect(Array.isArray(packs[0].itemCatalog?.items) && packs[0].itemCatalog!.items!.length >= 1).toBe(true);
    expect(Array.isArray(packs[0].statusDefinitions) && packs[0].statusDefinitions!.length >= 1).toBe(true);
    expect(packs[0].needsRuntimeHost).toBe(true);
  });

  it('F-b2d31aad: overlay JSON without meta/manifest keeps the filename stub', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'w31-json-pack-'));
    const file = join(dir, 'overlay-only.json');
    writeFileSync(file, JSON.stringify({
      entities: [{ id: 'e', type: 'npc', name: 'E' }],
      zones: [{ id: 'z', name: 'Z' }],
    }));
    try {
      const packs = await discoverInstalledPacks({ from: { moduleUrls: [file] } });
      expect(packs[0].meta.id).toBe('overlay-only');
      expect(packs[0].meta.name).toBe('overlay-only');
      expect(packs[0].meta.tagline).toBe('JSON content pack');
      expect(packs[0].needsRuntimeHost).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
