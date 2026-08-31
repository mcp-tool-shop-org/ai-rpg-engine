// Discover / load installed packs into the in-memory registry.
//
// PackEntry used to be meta + manifest + ruleset + districts? + createGame.
// Hosts then invented a parallel PackInfo with buildCatalog / itemCatalog /
// progression trees / statusDefinitions and a 12-row static import table.
// This module is the missing pack API: import() a module that advertises
// packMeta + createGame, lift the session catalogs with the same structural
// typing districts already uses, registerPack, return PackEntry[].

import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Engine, GameManifest, RulesetDefinition } from '@ai-rpg-engine/core';
import { getPack, registerPack } from './registry.js';
import type {
  DiscoverInstalledPacksOptions,
  PackBuildCatalog,
  PackContent,
  PackEntry,
  PackItemCatalog,
  PackMetadata,
  PackProgressionTree,
  PackStatusDefinition,
} from './types.js';

function isObj(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function describeValue(v: unknown): string {
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  if (typeof v === 'string') return v.length === 0 ? '""' : JSON.stringify(v);
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function isRuleset(v: unknown): v is RulesetDefinition {
  return (
    isObj(v) &&
    typeof v.id === 'string' &&
    v.id.length > 0 &&
    typeof v.name === 'string' &&
    Array.isArray(v.stats) &&
    Array.isArray(v.resources) &&
    Array.isArray(v.verbs)
  );
}

function isManifest(v: unknown): v is GameManifest {
  return (
    isObj(v) &&
    typeof v.id === 'string' &&
    v.id.length > 0 &&
    typeof v.title === 'string' &&
    typeof v.version === 'string' &&
    typeof v.engineVersion === 'string' &&
    typeof v.ruleset === 'string' &&
    Array.isArray(v.modules)
  );
}

function isPackMeta(v: unknown): v is PackMetadata {
  return (
    isObj(v) &&
    typeof v.id === 'string' &&
    v.id.length > 0 &&
    typeof v.name === 'string' &&
    Array.isArray(v.genres) &&
    Array.isArray(v.tones) &&
    Array.isArray(v.tags)
  );
}

function isProgressionTree(v: unknown): v is PackProgressionTree {
  return isObj(v) && Array.isArray(v.nodes) && typeof v.currency === 'string';
}

function findRuleset(mod: Record<string, unknown>): RulesetDefinition | undefined {
  const named = mod.ruleset ?? mod.myRuleset;
  if (isRuleset(named)) return named;
  for (const [k, v] of Object.entries(mod)) {
    if (/ruleset/i.test(k) && isRuleset(v)) return v;
  }
  for (const v of Object.values(mod)) {
    if (isRuleset(v)) return v;
  }
  return undefined;
}

function findProgressionTrees(mod: Record<string, unknown>): PackProgressionTree[] | undefined {
  if (Array.isArray(mod.progressionTrees)) {
    return mod.progressionTrees.filter(isProgressionTree);
  }
  const trees: PackProgressionTree[] = [];
  for (const [k, v] of Object.entries(mod)) {
    if ((k === 'progressionTree' || /Tree$/.test(k)) && isProgressionTree(v)) {
      trees.push(v);
    }
  }
  return trees.length > 0 ? trees : undefined;
}

function findStatusDefinitions(mod: Record<string, unknown>): PackStatusDefinition[] | undefined {
  if (Array.isArray(mod.statusDefinitions)) {
    return mod.statusDefinitions as PackStatusDefinition[];
  }
  for (const [k, v] of Object.entries(mod)) {
    if (/StatusDefinitions$/.test(k) && Array.isArray(v)) {
      return v as PackStatusDefinition[];
    }
  }
  return undefined;
}

function liftContent(mod: Record<string, unknown>): PackContent | undefined {
  if (typeof mod.toContentPack === 'function') {
    try {
      const packed = (mod.toContentPack as () => unknown)();
      if (isObj(packed)) return packed as PackContent;
    } catch {
      // fall through to mod.pack
    }
  }
  if (isObj(mod.pack)) return mod.pack as PackContent;
  return undefined;
}

function stubRuleset(meta: PackMetadata): RulesetDefinition {
  return {
    id: meta.id,
    name: meta.name,
    version: meta.version,
    stats: [],
    resources: [],
    verbs: [],
    formulas: [],
    defaultModules: [],
    progressionModels: [],
  };
}

function stubManifest(meta: PackMetadata, ruleset: RulesetDefinition): GameManifest {
  return {
    id: meta.id,
    title: meta.name,
    version: meta.version,
    engineVersion: meta.engineVersion,
    ruleset: ruleset.id,
    modules: [],
    contentPacks: [meta.id],
  };
}

function attachCatalogs(entry: PackEntry, mod: Record<string, unknown>): void {
  if (Array.isArray(mod.districts)) {
    entry.districts = mod.districts as PackEntry['districts'];
  }
  if (isObj(mod.buildCatalog)) {
    entry.buildCatalog = mod.buildCatalog as PackBuildCatalog;
  }
  if (isObj(mod.itemCatalog)) {
    entry.itemCatalog = mod.itemCatalog as PackItemCatalog;
  }
  const trees = findProgressionTrees(mod);
  if (trees) entry.progressionTrees = trees;
  const statuses = findStatusDefinitions(mod);
  if (statuses) entry.statusDefinitions = statuses;
}

/**
 * Fill PackEntry catalog fields from a ContentPack when the module export
 * (or JSON path) did not already set them. Named TS exports remain the
 * override — call this AFTER attachCatalogs.
 *
 * Mapping: districts, buildCatalog, progressionTrees, statuses→statusDefinitions,
 * items→itemCatalog:{items}.
 */
function attachCatalogsFromContent(entry: PackEntry, content: PackContent): void {
  if (entry.districts === undefined && Array.isArray(content.districts)) {
    entry.districts = content.districts as PackEntry['districts'];
  }
  if (entry.buildCatalog === undefined && isObj(content.buildCatalog)) {
    entry.buildCatalog = content.buildCatalog as PackBuildCatalog;
  }
  if (entry.itemCatalog === undefined && Array.isArray(content.items)) {
    entry.itemCatalog = { items: content.items as NonNullable<PackItemCatalog['items']> };
  }
  if (entry.progressionTrees === undefined && Array.isArray(content.progressionTrees)) {
    const trees = content.progressionTrees.filter(isProgressionTree);
    if (trees.length > 0) entry.progressionTrees = trees;
  }
  if (entry.statusDefinitions === undefined && Array.isArray(content.statuses)) {
    entry.statusDefinitions = content.statuses as PackStatusDefinition[];
  }
}

/**
 * Lift a pack module (the public barrel: packMeta + createGame + catalogs,
 * and/or pack / toContentPack()) into a {@link PackEntry}. Does not register.
 * Returns null when the module advertises neither a playable factory nor a
 * data pack.
 */
export function packEntryFromModule(mod: unknown): PackEntry | null {
  if (!isObj(mod)) return null;
  if (!isPackMeta(mod.packMeta)) return null;

  const content = liftContent(mod);
  const hasCreateGame = typeof mod.createGame === 'function';
  if (!hasCreateGame && !content) return null;

  const fromContent = content && isRuleset(content.ruleset) ? content.ruleset : undefined;
  const ruleset = findRuleset(mod) ?? fromContent;
  const manifest = isManifest(mod.manifest) ? mod.manifest : undefined;

  // Playable entries still need ruleset + manifest. Catalog-only JSON/data
  // packs synthesize both so they can list in getPackSummaries.
  if (hasCreateGame && (!ruleset || !manifest)) return null;

  const resolvedRuleset = ruleset ?? stubRuleset(mod.packMeta);
  const entry: PackEntry = {
    meta: mod.packMeta,
    manifest: manifest ?? stubManifest(mod.packMeta, resolvedRuleset),
    ruleset: resolvedRuleset,
  };
  if (hasCreateGame) {
    entry.createGame = mod.createGame as (seed?: number) => Engine;
  } else {
    entry.needsRuntimeHost = true;
  }
  if (content) entry.content = content;
  attachCatalogs(entry, mod);
  if (content) attachCatalogsFromContent(entry, content);
  return entry;
}

/**
 * Register a module that already advertises packMeta + createGame.
 * Idempotent: a second call for the same meta.id returns the existing entry.
 */
export function registerFromModule(mod: unknown, source = 'module'): PackEntry {
  const entry = packEntryFromModule(mod);
  if (!entry) {
    throw new Error(
      `registerFromModule: ${source} does not advertise packMeta + (createGame or pack/toContentPack) ` +
        `(got ${describeValue(mod)}) — export packMeta and either createGame or a ContentPack ` +
        '(mod.pack / toContentPack()), plus manifest and a RulesetDefinition for a playable entry',
    );
  }
  const existing = getPack(entry.meta.id);
  if (existing) return existing;
  registerPack(entry);
  return entry;
}

function collectSpecs(options: DiscoverInstalledPacksOptions): string[] {
  const from = options.from;
  if (!from || typeof from !== 'object' || Array.isArray(from)) {
    throw new Error(
      'discoverInstalledPacks: pass { from: { moduleUrls?: string[], nodeResolution?: string[] } } ' +
        'with at least one specifier — hosts must name the packages that advertise packMeta+createGame',
    );
  }
  const specs = [...(from.moduleUrls ?? []), ...(from.nodeResolution ?? [])];
  if (specs.length === 0) {
    throw new Error(
      'discoverInstalledPacks: from.moduleUrls and from.nodeResolution are both empty — ' +
        "pass package names (e.g. { from: { nodeResolution: ['@ai-rpg-engine/starter-fantasy'] } }) " +
        'or file URLs / .json ContentPack paths in from.moduleUrls',
    );
  }
  for (let i = 0; i < specs.length; i++) {
    if (typeof specs[i] !== 'string' || specs[i].length === 0) {
      throw new Error(
        `discoverInstalledPacks: specifier at index ${i} must be a non-empty string (got ${describeValue(specs[i])})`,
      );
    }
  }
  return specs;
}

function isJsonSpecifier(spec: string): boolean {
  const path = spec.startsWith('file:') ? spec.slice('file:'.length) : spec;
  return path.split('?')[0].toLowerCase().endsWith('.json');
}

function jsonFilePath(spec: string): string {
  if (spec.startsWith('file:')) return fileURLToPath(spec);
  return spec;
}

function metaFromJsonSpec(pack: PackContent, spec: string): PackMetadata {
  const stem = basename(jsonFilePath(spec)).replace(/\.json$/i, '') || 'json-pack';
  return {
    id: stem,
    name: stem,
    tagline: 'JSON content pack',
    genres: [],
    difficulty: 'beginner',
    tones: [],
    tags: ['json'],
    engineVersion: '*',
    version: typeof pack.schemaVersion === 'string' ? pack.schemaVersion : '0.0.0',
    description: `Loaded from ${spec}. Catalog-only until a runtime host supplies createGame.`,
    narratorTone: '',
  };
}

/**
 * Prefer authored ContentPack.meta / ContentPack.manifest over the filename
 * stub. Overlay packs that omit both keep the stub.
 */
function metaFromJsonPack(pack: PackContent, spec: string): PackMetadata {
  const stub = metaFromJsonSpec(pack, spec);
  const authored = pack.meta;
  if (isObj(authored) && typeof authored.id === 'string' && authored.id.length > 0 && typeof authored.name === 'string') {
    return {
      ...stub,
      ...(authored as Partial<PackMetadata>),
      id: authored.id,
      name: authored.name,
      genres: Array.isArray(authored.genres) ? (authored.genres as PackMetadata['genres']) : stub.genres,
      tones: Array.isArray(authored.tones) ? (authored.tones as PackMetadata['tones']) : stub.tones,
      tags: Array.isArray(authored.tags) ? (authored.tags as string[]) : stub.tags,
    };
  }
  if (isManifest(pack.manifest)) {
    const m = pack.manifest;
    return {
      ...stub,
      id: m.id,
      name: m.title,
      version: m.version,
      engineVersion: m.engineVersion,
    };
  }
  return stub;
}

async function packEntryFromJsonFile(
  spec: string,
  options: DiscoverInstalledPacksOptions,
): Promise<PackEntry> {
  const filePath = jsonFilePath(spec);
  const { loadContentFromFile } = await import('@ai-rpg-engine/content-schema');
  const loaded = loadContentFromFile(filePath);
  if (!loaded.ok) {
    throw new Error(
      `discoverInstalledPacks: JSON "${spec}" failed loadContentFromFile: ${loaded.summary}`,
    );
  }
  const content = loaded.pack as PackContent;
  const meta = metaFromJsonPack(content, spec);
  const ruleset = isRuleset(content.ruleset) ? content.ruleset : stubRuleset(meta);
  const entry: PackEntry = {
    meta,
    manifest: isManifest(content.manifest) ? content.manifest : stubManifest(meta, ruleset),
    ruleset,
    content,
  };
  if (typeof options.createGame === 'function') {
    const host = options.createGame;
    entry.createGame = (seed?: number) => host(content, seed);
  } else {
    entry.needsRuntimeHost = true;
  }
  attachCatalogsFromContent(entry, content);
  return entry;
}

/**
 * Import packages that advertise packMeta + createGame (and/or pack /
 * toContentPack), register each, and return the resulting {@link PackEntry}[].
 * JSON specifiers in `from.moduleUrls` go through loadContentFromFile.
 *
 * Already-registered ids are returned as-is (idempotent).
 */
export async function discoverInstalledPacks(
  options: DiscoverInstalledPacksOptions,
): Promise<PackEntry[]> {
  const specs = collectSpecs(options);
  const found: PackEntry[] = [];
  for (const spec of specs) {
    if (isJsonSpecifier(spec)) {
      const jsonEntry = await packEntryFromJsonFile(spec, options);
      const existing = getPack(jsonEntry.meta.id);
      if (existing) {
        found.push(existing);
        continue;
      }
      registerPack(jsonEntry);
      found.push(jsonEntry);
      continue;
    }
    let mod: unknown;
    try {
      mod = await import(spec);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(
        `discoverInstalledPacks: failed to import "${spec}": ${reason} — ` +
          'check the package is installed and exports packMeta + createGame (or pack / toContentPack)',
      );
    }
    const entry = packEntryFromModule(mod);
    if (!entry) {
      throw new Error(
        `discoverInstalledPacks: "${spec}" does not advertise packMeta + createGame ` +
          '(or pack / toContentPack) — export packMeta and either a playable factory or a ContentPack',
      );
    }
    found.push(registerFromModule(mod, spec));
  }
  return found;
}
