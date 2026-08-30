// Pack registry — in-memory catalog of starter packs

import type { PackEntry, PackFilter, PackSummary } from './types.js';

const entries: Map<string, PackEntry> = new Map();

function describeValue(v: unknown): string {
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  if (typeof v === 'string') return v.length === 0 ? '""' : JSON.stringify(v);
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

export function registerPack(entry: PackEntry): void {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new Error(
      `registerPack: entry must be a PackEntry object (got ${describeValue(entry)}) — pass { meta, manifest, ruleset, createGame } with meta.id a unique non-empty string`,
    );
  }
  const meta = (entry as PackEntry).meta as PackEntry['meta'] | undefined;
  if (meta === null || typeof meta !== 'object' || Array.isArray(meta)) {
    throw new Error(
      'registerPack: entry.meta is required — set meta.id to a unique non-empty string and meta.genres/tones/tags to arrays',
    );
  }
  const id = (meta as { id?: unknown }).id;
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error(
      `registerPack: entry.meta.id must be a non-empty string (got ${describeValue(id)}) — set meta.id to a unique pack id`,
    );
  }
  for (const field of ['genres', 'tones', 'tags'] as const) {
    const v = (meta as Record<string, unknown>)[field];
    if (!Array.isArray(v)) {
      const example = field === 'genres' ? "['fantasy']" : field === 'tones' ? "['dark']" : "['tag']";
      throw new Error(
        `registerPack: pack "${id}" meta.${field} must be an array (got ${describeValue(v)}) — set meta.${field} to an array of strings, e.g. ${example}`,
      );
    }
  }
  if (entries.has(id)) {
    throw new Error(`Pack "${id}" is already registered`);
  }
  entries.set(id, entry);
}

export function getPack(id: string): PackEntry | undefined {
  return entries.get(id);
}

export function getAllPacks(): PackEntry[] {
  return [...entries.values()];
}

export function filterPacks(filter: PackFilter): PackEntry[] {
  return getAllPacks().filter((entry) => {
    const meta = entry?.meta;
    if (!meta || typeof meta !== 'object') return false;
    if (filter.genre) {
      if (!Array.isArray(meta.genres) || !meta.genres.includes(filter.genre)) return false;
    }
    if (filter.difficulty && meta.difficulty !== filter.difficulty) return false;
    if (filter.tone) {
      if (!Array.isArray(meta.tones) || !meta.tones.includes(filter.tone)) return false;
    }
    if (filter.tag) {
      if (!Array.isArray(meta.tags) || !meta.tags.includes(filter.tag)) return false;
    }
    return true;
  });
}

export function getPackIds(): string[] {
  return [...entries.keys()];
}

export function getPackSummaries(): PackSummary[] {
  return getAllPacks().map((e) => ({
    id: e.meta.id,
    name: e.meta.name,
    tagline: e.meta.tagline,
    genres: e.meta.genres,
    difficulty: e.meta.difficulty,
  }));
}

export function clearRegistry(): void {
  entries.clear();
}
