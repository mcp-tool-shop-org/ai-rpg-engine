// Content-addressable sound registry

import type { SoundEntry, SoundPackManifest, SoundQuery } from './types.js';
import { validateManifest } from './validate.js';

/** A structured, actionable warning surfaced by {@link SoundRegistry.load}. */
export type LoadWarning = {
  /** The offending location (e.g. an id or `entries[2].domain`). */
  field: string;
  /** What is wrong and, where applicable, what to do about it. */
  message: string;
};

/** Options for {@link SoundRegistry.load}. */
export type LoadOptions = {
  /**
   * Run {@link validateManifest} and fold any schema errors into the returned
   * warnings. Off by default so the hot path stays cheap; turn it on when
   * loading untrusted/third-party packs.
   */
  validate?: boolean;
};

/** Result of {@link SoundRegistry.load}. */
export type LoadResult = {
  /** Number of entries written into the registry by this call. */
  loaded: number;
  /**
   * Structured, actionable warnings (duplicate ids, optional schema errors).
   * Empty when the manifest loaded cleanly. Mirrors the
   * validateManifest/validateAbilityPack warning convention so consumers can
   * surface them in dev tooling instead of hitting silent overwrites.
   */
  warnings: LoadWarning[];
};

/** Registry of sound entries from loaded packs. */
export class SoundRegistry {
  private entries = new Map<string, SoundEntry>();

  /**
   * Load a sound pack manifest into the registry.
   *
   * Returns a {@link LoadResult}. Per the engine's warn-and-degrade contract,
   * `load` does not throw on consumer mistakes: a duplicate id (within the
   * manifest or colliding with an already-loaded entry) is applied last-write
   * and reported as a warning naming the collision and the winning pack, and —
   * when `opts.validate` is set — schema errors from {@link validateManifest}
   * are folded in as warnings too. A malformed manifest (non-object, or
   * `entries` not an array) is the one case that throws, since there is nothing
   * to load and proceeding would crash on the `for…of` anyway.
   *
   * @param manifest The sound pack to load.
   * @param opts     `{ validate }` to additionally run schema validation.
   */
  load(manifest: SoundPackManifest, opts?: LoadOptions): LoadResult {
    const warnings: LoadWarning[] = [];

    if (!manifest || typeof manifest !== 'object' || !Array.isArray((manifest as SoundPackManifest).entries)) {
      throw new Error(
        '[soundpack-core] load() requires a manifest object with an `entries` array; ' +
          'received ' + describeType(manifest) + '. Build it via the SoundPackManifest shape.',
      );
    }

    if (opts?.validate) {
      for (const e of validateManifest(manifest)) {
        warnings.push({ field: e.field, message: e.message });
      }
    }

    for (const entry of manifest.entries) {
      // Defensive: with validation off, a malformed entry could still be a
      // primitive. Skip it with a warning rather than throwing on entry.id.
      if (!entry || typeof entry !== 'object') {
        warnings.push({
          field: 'entries[]',
          message: `skipped a non-object entry in pack "${manifest.name}"; each entry must be a SoundEntry object`,
        });
        continue;
      }

      if (this.entries.has(entry.id)) {
        warnings.push({
          field: entry.id,
          message:
            `duplicate sound id "${entry.id}" while loading pack "${manifest.name}"; ` +
            `the newly loaded entry wins (last write). Rename one of the entries to keep both.`,
        });
      }

      this.entries.set(entry.id, entry);
    }

    return { loaded: manifest.entries.length, warnings };
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

  /**
   * Pick a variant filename for an entry from a caller-supplied roll.
   *
   * Determinism: the engine bills itself reproducible, so variant selection must
   * not draw from a hidden RNG. The caller passes `roll` — a value in [0, 1]
   * (typically from the project's seeded dice/RNG) — and the variant index is
   * `floor(roll * length)`, clamped so `roll === 1` maps to the last variant
   * rather than overflowing. Same roll ⇒ same variant, every run.
   *
   * @param id   The entry id.
   * @param roll Deterministic selector in [0, 1]. Out-of-range values are clamped.
   */
  pickVariant(id: string, roll: number): string | undefined {
    const entry = this.entries.get(id);
    if (!entry || entry.variants.length === 0) return undefined;
    const clamped = Math.min(Math.max(roll, 0), 1);
    const idx = Math.min(Math.floor(clamped * entry.variants.length), entry.variants.length - 1);
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

/** Human-readable type description for error messages. */
function describeType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  return typeof value;
}
