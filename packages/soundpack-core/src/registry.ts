// Content-addressable sound registry

import type { SoundEntry, SoundPackManifest, SoundQuery } from './types.js';

/** Registry of sound entries from loaded packs. */
export class SoundRegistry {
  private entries = new Map<string, SoundEntry>();

  /** Load a sound pack manifest into the registry. */
  load(manifest: SoundPackManifest): void {
    for (const entry of manifest.entries) {
      this.entries.set(entry.id, entry);
    }
  }

  /** Query entries by tags, domain, mood, or intensity. */
  query(q: SoundQuery): SoundEntry[] {
    const results: SoundEntry[] = [];
    for (const entry of this.entries.values()) {
      if (q.domain && entry.domain !== q.domain) continue;
      if (q.intensity && entry.intensity !== q.intensity) continue;
      if (q.tags && q.tags.length > 0) {
        const hasTag = q.tags.some((t) => entry.tags.includes(t));
        if (!hasTag) continue;
      }
      if (q.mood && q.mood.length > 0) {
        const hasMood = q.mood.some((m) => entry.mood.includes(m));
        if (!hasMood) continue;
      }
      results.push(entry);
    }
    return results;
  }

  /** Get a specific entry by ID. */
  get(id: string): SoundEntry | undefined {
    return this.entries.get(id);
  }

  /** Pick a random variant filename for an entry. */
  pickVariant(id: string): string | undefined {
    const entry = this.entries.get(id);
    if (!entry || entry.variants.length === 0) return undefined;
    const idx = Math.floor(Math.random() * entry.variants.length);
    return entry.variants[idx];
  }

  /** Get all loaded entry IDs. */
  getIds(): string[] {
    return [...this.entries.keys()];
  }

  /** Get total number of entries. */
  get size(): number {
    return this.entries.size;
  }
}
