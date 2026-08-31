// Discover / load installed packs into the in-memory registry.
//
// PackEntry used to be meta + manifest + ruleset + districts? + createGame.
// Hosts then invented a parallel PackInfo with buildCatalog / itemCatalog /
// progression trees / statusDefinitions and a 12-row static import table.
// This module is the missing pack API: import() a module that advertises
// packMeta + createGame, lift the session catalogs with the same structural
// typing districts already uses, registerPack, return PackEntry[].

import type { Engine, GameManifest, RulesetDefinition } from '@ai-rpg-engine/core';
import { getPack, registerPack } from './registry.js';
import type {
  DiscoverInstalledPacksOptions,
  PackBuildCatalog,
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

/**
 * Lift a pack module (the public barrel: packMeta + createGame + catalogs)
 * into a {@link PackEntry}. Does not register. Returns null when the module
 * does not advertise packMeta + createGame.
 */
export function packEntryFromModule(mod: unknown): PackEntry | null {
  if (!isObj(mod)) return null;
  if (!isPackMeta(mod.packMeta)) return null;
  if (typeof mod.createGame !== 'function') return null;

  const ruleset = findRuleset(mod);
  const manifest = isManifest(mod.manifest) ? mod.manifest : undefined;
  if (!ruleset || !manifest) return null;

  const entry: PackEntry = {
    meta: mod.packMeta,
    manifest,
    ruleset,
    createGame: mod.createGame as (seed?: number) => Engine,
  };

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
      `registerFromModule: ${source} does not advertise packMeta + createGame ` +
        `(got ${describeValue(mod)}) — export packMeta, createGame, manifest, and a RulesetDefinition`,
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
        'or file URLs in from.moduleUrls',
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

/**
 * Import packages that advertise packMeta + createGame, register each, and
 * return the resulting {@link PackEntry}[]. Hosts pass the specifiers — this
 * is the replacement for a hardcoded 12-import table.
 *
 * Already-registered ids are returned as-is (idempotent).
 */
export async function discoverInstalledPacks(
  options: DiscoverInstalledPacksOptions,
): Promise<PackEntry[]> {
  const specs = collectSpecs(options);
  const found: PackEntry[] = [];
  for (const spec of specs) {
    let mod: unknown;
    try {
      mod = await import(spec);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(
        `discoverInstalledPacks: failed to import "${spec}": ${reason} — ` +
          'check the package is installed and exports packMeta + createGame',
      );
    }
    const entry = packEntryFromModule(mod);
    if (!entry) {
      throw new Error(
        `discoverInstalledPacks: "${spec}" does not advertise packMeta + createGame — ` +
          'export packMeta, createGame, manifest, and a RulesetDefinition from the package barrel',
      );
    }
    found.push(registerFromModule(mod, spec));
  }
  return found;
}
