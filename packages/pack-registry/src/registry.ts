// Pack registry — in-memory catalog of starter packs

import type { PackEntry, PackFilter, PackSummary } from './types.js';

const entries: Map<string, PackEntry> = new Map();

export function registerPack(entry: PackEntry): void {
  if (entries.has(entry.meta.id)) {
    throw new Error(`Pack "${entry.meta.id}" is already registered`);
  }
  entries.set(entry.meta.id, entry);
}

export function getPack(id: string): PackEntry | undefined {
  return entries.get(id);
}

export function getAllPacks(): PackEntry[] {
  return [...entries.values()];
}

export function filterPacks(filter: PackFilter): PackEntry[] {
  return getAllPacks().filter((entry) => {
    if (filter.genre && !entry.meta.genres.includes(filter.genre)) return false;
    if (filter.difficulty && entry.meta.difficulty !== filter.difficulty) return false;
    if (filter.tone && !entry.meta.tones.includes(filter.tone)) return false;
    if (filter.tag && !entry.meta.tags.includes(filter.tag)) return false;
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
