// F1e — `ai-rpg-engine run <path>`: load a scaffolded game from disk.
//
// `run` was hardcoded to the 10 bundled starters, so `create-starter` output
// could be built and tested but never PLAYED. This loader dynamically imports
// a module at <path> that exports the same contract packs.ts wires for the
// bundled starters, validates it with actionable errors, and hands back a
// pack the shared run loop treats identically.
//
// Contract (what the module must export):
//   createGame(seed?) => Engine      — REQUIRED
//   packMeta { id, name } | manifest { id, title } — REQUIRED (id keys saves,
//                                      name titles the screen)
//   buildCatalog                     — optional: enables character creation
//   <anything>Ruleset | ruleset      — optional: powers help + creation
//   progressionTrees                 — optional: enables the XP spend menu

import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Engine, RulesetDefinition } from '@ai-rpg-engine/core';
import type { PackMetadata } from '@ai-rpg-engine/pack-registry';
import type { BuildCatalog } from '@ai-rpg-engine/character-creation';
import type { ProgressionTreeDefinition } from '@ai-rpg-engine/content-schema';

/**
 * Pack identity the run loop actually reads. Bundled packs carry a full
 * PackMetadata; an external pack that exports only `manifest` still yields a
 * valid id + name, without pretending marketing fields exist.
 */
export type LoadedPackMeta = Pick<PackMetadata, 'id' | 'name'> & Partial<PackMetadata>;

/** A playable pack — bundled PackInfo satisfies this; external packs may omit the optionals. */
export type LoadedPack = {
  meta: LoadedPackMeta;
  createGame: (seed?: number) => Engine;
  buildCatalog?: BuildCatalog;
  ruleset?: RulesetDefinition;
  progressionTrees?: ProgressionTreeDefinition[];
};

/** Structured load failure — message states what was wrong AND what the contract expects. */
export class PackLoadError extends Error {
  readonly code: string;
  readonly hint: string;
  constructor(opts: { code: string; message: string; hint: string }) {
    super(opts.message);
    this.name = 'PackLoadError';
    this.code = opts.code;
    this.hint = opts.hint;
  }
}

const CONTRACT_HINT =
  'A runnable pack module must export createGame(seed?) returning an Engine, and packMeta ' +
  '({ id, name }) or manifest ({ id, title }). Optional: buildCatalog, a *Ruleset export, progressionTrees. ' +
  'Scaffolds from `create-starter` gain this shape once built (npm install && npx tsc) — point run at the package dir or its built entry file.';

/**
 * Resolve <path> to the JS module file to import. Pure fs — exported for
 * tests. Accepts:
 *  - a .js/.mjs/.cjs file directly
 *  - a directory: package.json "main" → dist/index.js → index.js
 * Rejects .ts sources (needs a build) and missing paths, with hints.
 */
export function resolveExternalEntry(rawPath: string): string {
  const abs = path.resolve(rawPath);

  if (!fs.existsSync(abs)) {
    throw new PackLoadError({
      code: 'PACK_PATH_NOT_FOUND',
      message: `No file or directory at ${abs}.`,
      hint: 'Check the path. ' + CONTRACT_HINT,
    });
  }

  const stat = fs.statSync(abs);
  if (stat.isFile()) {
    if (/\.(ts|tsx|mts|cts)$/.test(abs)) {
      throw new PackLoadError({
        code: 'PACK_NOT_BUILT',
        message: `${abs} is a TypeScript source file — the runner imports built JavaScript.`,
        hint: 'Build the pack first (npx tsc inside it), then run its built entry (e.g. dist/index.js) or the package directory.',
      });
    }
    return abs;
  }

  // Directory: package.json main → dist/index.js → index.js
  const tried: string[] = [];
  const pkgJsonPath = path.join(abs, 'package.json');
  if (fs.existsSync(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8')) as { main?: string };
      if (typeof pkg.main === 'string' && pkg.main.length > 0) {
        const mainPath = path.join(abs, pkg.main);
        if (fs.existsSync(mainPath)) return mainPath;
        tried.push(`package.json main → ${mainPath} (missing — is the pack built?)`);
      }
    } catch {
      tried.push(`${pkgJsonPath} (unreadable JSON)`);
    }
  }
  for (const candidate of ['dist/index.js', 'index.js', 'index.mjs']) {
    const candidatePath = path.join(abs, candidate);
    if (fs.existsSync(candidatePath)) return candidatePath;
    tried.push(candidatePath);
  }

  throw new PackLoadError({
    code: 'PACK_ENTRY_NOT_FOUND',
    message: `Cannot find a JS entry for ${abs}. Tried: ${tried.join(', ')}.`,
    hint: 'Build the pack (npm install && npx tsc) so dist/index.js exists, or pass the built file directly. ' + CONTRACT_HINT,
  });
}

/**
 * Validate an imported module against the PackInfo contract and assemble a
 * LoadedPack. Pure over the module namespace — exported for tests.
 */
export function validatePackModule(mod: Record<string, unknown>, source: string): LoadedPack {
  const problems: string[] = [];

  const createGame = mod.createGame;
  if (typeof createGame !== 'function') {
    problems.push('missing export createGame (a function returning an Engine)');
  }

  // Identity: packMeta { id, name } preferred; manifest { id, title } accepted.
  let meta: LoadedPackMeta | undefined;
  const packMeta = mod.packMeta as { id?: unknown; name?: unknown } | undefined;
  const manifest = mod.manifest as { id?: unknown; title?: unknown } | undefined;
  if (packMeta && typeof packMeta.id === 'string' && typeof packMeta.name === 'string') {
    meta = mod.packMeta as LoadedPackMeta;
  } else if (manifest && typeof manifest.id === 'string' && typeof manifest.title === 'string') {
    meta = { id: manifest.id, name: manifest.title, tagline: '' };
  } else {
    problems.push('missing export packMeta ({ id, name }) or manifest ({ id, title })');
  }

  if (problems.length > 0) {
    throw new PackLoadError({
      code: 'PACK_CONTRACT_INVALID',
      message: `${source} does not export the pack contract: ${problems.join('; ')}.`,
      hint: CONTRACT_HINT,
    });
  }

  // Ruleset: exact `ruleset` export wins; else the single export named *Ruleset
  // (deterministic pick: sorted key order) that looks like a RulesetDefinition.
  let ruleset: RulesetDefinition | undefined;
  const exact = mod.ruleset as RulesetDefinition | undefined;
  const looksLikeRuleset = (v: unknown): v is RulesetDefinition =>
    typeof v === 'object' && v !== null && Array.isArray((v as { verbs?: unknown }).verbs);
  if (looksLikeRuleset(exact)) {
    ruleset = exact;
  } else {
    const rulesetKey = Object.keys(mod)
      .filter((k) => /Ruleset$/.test(k) && looksLikeRuleset(mod[k]))
      .sort()[0];
    if (rulesetKey) ruleset = mod[rulesetKey] as RulesetDefinition;
  }

  const buildCatalog =
    typeof mod.buildCatalog === 'object' && mod.buildCatalog !== null
      ? (mod.buildCatalog as BuildCatalog)
      : undefined;

  const progressionTrees = Array.isArray(mod.progressionTrees)
    ? (mod.progressionTrees as ProgressionTreeDefinition[])
    : undefined;

  return {
    meta: meta as LoadedPackMeta,
    createGame: createGame as (seed?: number) => Engine,
    buildCatalog,
    ruleset,
    progressionTrees,
  };
}

/** Resolve, import, and validate a pack module at <rawPath>. */
export async function loadExternalPack(rawPath: string): Promise<LoadedPack> {
  const entry = resolveExternalEntry(rawPath);

  let mod: Record<string, unknown>;
  try {
    mod = (await import(pathToFileURL(entry).href)) as Record<string, unknown>;
  } catch (err) {
    throw new PackLoadError({
      code: 'PACK_IMPORT_FAILED',
      message: `Failed to import ${entry}: ${err instanceof Error ? err.message : String(err)}`,
      hint: 'The module must be valid ESM JavaScript whose own imports resolve (run npm install in the pack). ' + CONTRACT_HINT,
    });
  }

  return validatePackModule(mod, entry);
}
