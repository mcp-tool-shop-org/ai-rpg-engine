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
    // F-833dedfc: count actual writes, not manifest.entries.length. A
    // malformed entry is warned-and-skipped below without ever reaching
    // this.entries.set(), so the raw input length overstates the real
    // write count by the number of skipped entries — most likely to matter
    // exactly when opts.validate is used, i.e. loading an untrusted pack.
    let loaded = 0;

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

      this.entries.set(entry.id, cloneEntry(entry));
      loaded++;
    }

    return { loaded, warnings };
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
      results.push(cloneEntry(entry));
    }
    return results;
  }

  /** Get a specific entry by ID. Returned object is a clone (F-74ba230b). */
  get(id: string): SoundEntry | undefined {
    const entry = this.entries.get(id);
    return entry ? cloneEntry(entry) : undefined;
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

  /**
   * Pick an ambient bed from a query using a deterministic roll (F-57203b5e).
   * Forces `domain: 'ambient'` and keeps loop duration classes, then indexes
   * the id-sorted matches the same way {@link pickVariant} indexes variants.
   */
  pickAmbientBed(query: SoundQuery, roll: number): SoundEntry | undefined {
    return pickLoop(this.query({ ...query, domain: 'ambient' }), roll);
  }

  /**
   * Pick a music stem from a query using a deterministic roll (F-768980bb).
   * Forces `domain: 'music'` and keeps loop duration classes, then indexes
   * the id-sorted matches the same way {@link pickAmbientBed} indexes beds.
   */
  pickMusicStem(query: SoundQuery, roll: number): SoundEntry | undefined {
    return pickLoop(this.query({ ...query, domain: 'music' }), roll);
  }

  /**
   * Pick a music sting — a one-shot overlay (victory fanfare, defeat
   * stinger) meant to play OVER the current stem, never replace it
   * (F-fa44e956). Forces `domain: 'music'` and keeps only
   * `durationClass: 'oneshot'` entries — the inverse of
   * {@link pickMusicStem}'s loop-only filter — then indexes the id-sorted
   * matches the same way {@link pickMusicStem} indexes stems. Play the
   * result via `AudioDirector.scheduleSting`, not `scheduleMusic`/`musicCue`.
   */
  pickMusicSting(query: SoundQuery, roll: number): SoundEntry | undefined {
    return pickOneshot(this.query({ ...query, domain: 'music' }), roll);
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

/** A start/stop pair for bringing active ambient layers in line with a desired set. */
export type AmbientLayerDiff = {
  start: string[];
  stop: string[];
};

type AmbientLayerRef = { domain?: string; resourceId: string };

/**
 * Diff desired ambient ids against currently active layers (F-57203b5e).
 * Accepts `AudioDirector.getActiveLayers()` (a Map), an iterable of ids, or
 * `{resourceId, domain}` records. Non-ambient map entries are ignored.
 */
export function diffAmbientLayers(
  desiredIds: readonly string[],
  activeLayers: Iterable<string> | Map<string, AmbientLayerRef> | readonly AmbientLayerRef[],
): AmbientLayerDiff {
  const active = new Set<string>();
  if (activeLayers instanceof Map) {
    for (const [key, val] of activeLayers) {
      if (val?.domain && val.domain !== 'ambient') continue;
      active.add(val?.resourceId ?? key);
    }
  } else {
    for (const item of activeLayers) {
      if (typeof item === 'string') {
        active.add(item);
      } else if (item && typeof item === 'object' && typeof item.resourceId === 'string') {
        if (item.domain && item.domain !== 'ambient') continue;
        active.add(item.resourceId);
      }
    }
  }
  const desired = new Set(desiredIds);
  const start = [...desired].filter((id) => !active.has(id)).sort();
  const stop = [...active].filter((id) => !desired.has(id)).sort();
  return { start, stop };
}

/**
 * Deterministic roll in [0, 1) from a string id — FNV-1a 32-bit then / 2^32
 * (F-cf6a6952). Copied locally so soundpack-core stays dependency-free
 * (do not import encounter-spawn). Behavior-neutral on a 1-match
 * {@link SoundRegistry.pickMusicStem} / {@link SoundRegistry.pickAmbientBed}
 * list; a richer pack with two stems in one mood family can pass
 * `hashRoll(zoneId)` as the roll so each zone stays stable but distinct.
 */
export function hashRoll(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 4294967296;
}

function pickLoop(entries: SoundEntry[], roll: number): SoundEntry | undefined {
  const matches = entries
    .filter((e) => e.durationClass === 'long-loop' || e.durationClass === 'short-loop')
    .sort((a, b) => a.id.localeCompare(b.id));
  if (matches.length === 0) return undefined;
  const clamped = Math.min(Math.max(roll, 0), 1);
  const idx = Math.min(Math.floor(clamped * matches.length), matches.length - 1);
  return matches[idx];
}

/** Mirrors {@link pickLoop}'s id-sort-then-index pattern, kept to oneshots only (F-fa44e956). */
function pickOneshot(entries: SoundEntry[], roll: number): SoundEntry | undefined {
  const matches = entries
    .filter((e) => e.durationClass === 'oneshot')
    .sort((a, b) => a.id.localeCompare(b.id));
  if (matches.length === 0) return undefined;
  const clamped = Math.min(Math.max(roll, 0), 1);
  const idx = Math.min(Math.floor(clamped * matches.length), matches.length - 1);
  return matches[idx];
}

/** Copy tags/mood/variants so the Map is not aliased to caller handles (F-74ba230b). */
function cloneEntry(entry: SoundEntry): SoundEntry {
  const cloned: SoundEntry = {
    ...entry,
    tags: Array.isArray(entry.tags) ? [...entry.tags] : [],
    mood: Array.isArray(entry.mood) ? [...entry.mood] : [],
    variants: Array.isArray(entry.variants) ? [...entry.variants] : [],
  };
  if (entry.hashes) cloned.hashes = { ...entry.hashes };
  else delete cloned.hashes;
  return cloned;
}

/** Human-readable type description for error messages. */
function describeType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  return typeof value;
}
