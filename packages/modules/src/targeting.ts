// targeting — pure, deterministic ability target resolution.
//
// Implements design-lock section B (feature-architecture.md):
//  - Friend/foe is a faction PREDICATE, not a hardcoded `e.type !== source.type`
//    check (finding 9: GAS target-data filters leave faction logic to the game).
//  - `TargetSpec` resolves through independent orthogonal axes — scope ×
//    affiliation × life (+ optional area) — instead of a flat enum (finding 8).
//  - Selectors (lowestHp, random-N) pick from the candidate set with a TOTAL,
//    stable tie-break by entity id; random-N consumes ONLY a seeded RNG derived
//    from world state, never Date.now/Math.random (finding 10 + determinism
//    guardrails).
//
// Everything here is a pure function of (spec, source, world): same inputs →
// byte-identical output, across platforms and across save/load.

import type { EntityState, WorldState } from '@ai-rpg-engine/core';
import { SeededRNG } from '@ai-rpg-engine/core';
import type { TargetSpec, NormalizedTargetSpec, TargetAffiliation } from '@ai-rpg-engine/content-schema';
import { normalizeTargetSpec } from '@ai-rpg-engine/content-schema';

// ---------------------------------------------------------------------------
// Affiliation predicate (finding 9)
// ---------------------------------------------------------------------------

/** Relationship of `candidate` to `source`. */
export type Affiliation = 'self' | 'ally' | 'enemy';

/**
 * Pure friend-or-foe predicate.
 *
 * - `candidate === source` (same id) → `'self'`.
 * - If BOTH carry a `faction`, same faction → `'ally'`, else `'enemy'`. This is
 *   the explicit team field the design calls for, letting PCs + recruited NPCs
 *   share a side even with different `type`s.
 * - Otherwise fall back to the legacy heuristic: same `type` → `'ally'`, else
 *   `'enemy'`. This is exactly what the old `e.type !== entity.type` check
 *   encoded, so content that never sets a faction behaves identically.
 */
export function affiliationOf(source: EntityState, candidate: EntityState): Affiliation {
  if (candidate.id === source.id) return 'self';
  const sf = source.faction;
  const cf = candidate.faction;
  if (sf !== undefined && cf !== undefined) {
    return sf === cf ? 'ally' : 'enemy';
  }
  return candidate.type === source.type ? 'ally' : 'enemy';
}

/** True when `candidate` satisfies the requested affiliation axis relative to `source`. */
function matchesAffiliation(
  source: EntityState,
  candidate: EntityState,
  affiliation: TargetAffiliation,
  includeSelf: boolean,
): boolean {
  const rel = affiliationOf(source, candidate);
  if (rel === 'self') {
    // Self is only ever a candidate for ally/any specs that opt in.
    return includeSelf && (affiliation === 'ally' || affiliation === 'any');
  }
  switch (affiliation) {
    case 'any':
      return true;
    case 'ally':
      return rel === 'ally';
    case 'enemy':
      return rel === 'enemy';
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Liveness
// ---------------------------------------------------------------------------

function isAlive(e: EntityState): boolean {
  return (e.resources.hp ?? 0) > 0;
}

function matchesLife(candidate: EntityState, life: NormalizedTargetSpec['life']): boolean {
  switch (life) {
    case 'any':
      return true;
    case 'dead':
      return !isAlive(candidate);
    case 'alive':
    default:
      return isAlive(candidate);
  }
}

// ---------------------------------------------------------------------------
// Candidate gathering
// ---------------------------------------------------------------------------

/**
 * Every entity that satisfies affiliation × life × tag-filter for this spec,
 * scoped to the source's zone. Returned in a STABLE order (sorted by entity id)
 * so downstream selection and AoE application are deterministic regardless of the
 * `world.entities` record's iteration order.
 *
 * `scope:'self'` short-circuits to just the source (the canonical self target),
 * subject to the life gate.
 */
export function candidateTargets(
  spec: TargetSpec,
  source: EntityState,
  world: WorldState,
): EntityState[] {
  const norm = normalizeTargetSpec(spec);

  if (norm.scope === 'self') {
    return matchesLife(source, norm.life) ? [source] : [];
  }

  const tagFilter = norm.filter && norm.filter.length > 0 ? new Set(norm.filter) : null;

  const pool = Object.values(world.entities).filter((e) => {
    // Same-zone gate (matches the engine's existing zone-scoped targeting).
    if (e.zoneId !== source.zoneId) return false;
    if (!matchesLife(e, norm.life)) return false;
    if (!matchesAffiliation(source, e, norm.affiliation, norm.includeSelf)) return false;
    if (tagFilter && !e.tags.some((t) => tagFilter.has(t))) return false;
    return true;
  });

  return pool.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a {@link TargetSpec} to the concrete entities it affects.
 *
 * - `scope:'self'`   → just the source (life-gated).
 * - `scope:'all'`    → every candidate (AoE; affiliation filter means an
 *   enemy-only blast SPARES allies, fixing the old zone-hits-everyone bug).
 * - `scope:'single'` → one candidate. `explicitTargetId` (e.g. the player's
 *   chosen target) is honored when it is itself a valid candidate; otherwise the
 *   spec's selector picks deterministically. With no selector and no explicit
 *   id, the lowest-id candidate is taken (a total, stable default).
 *
 * Pure: the only randomness is via {@link selectRandomN}, which draws from a
 * seeded RNG derived from `world` (no clock, no global RNG).
 */
export function resolveTargets(
  spec: TargetSpec,
  source: EntityState,
  world: WorldState,
  opts?: { explicitTargetId?: string; selector?: TargetSelector },
): EntityState[] {
  const norm = normalizeTargetSpec(spec);
  const candidates = candidateTargets(spec, source, world);

  if (norm.scope === 'self') return candidates;
  if (norm.scope === 'all') return candidates;

  // scope: 'single'
  if (candidates.length === 0) return [];

  // Honor an explicitly chosen target if it is a valid candidate.
  if (opts?.explicitTargetId) {
    const chosen = candidates.find((c) => c.id === opts.explicitTargetId);
    if (chosen) return [chosen];
  }

  if (opts?.selector) {
    const picked = opts.selector(candidates, world, source);
    return picked ? [picked] : [];
  }

  // Default: lowest entity id — total + stable, never RNG.
  return [candidates[0]];
}

// ---------------------------------------------------------------------------
// Selectors (finding 10)
// ---------------------------------------------------------------------------

/** A pure selector over an already-filtered candidate list. */
export type TargetSelector = (
  candidates: EntityState[],
  world: WorldState,
  source: EntityState,
) => EntityState | undefined;

function hpRatio(e: EntityState): number {
  const hp = e.resources.hp ?? 0;
  // Resources-first cap precedence (matches ability-intent.entityHpRatio): content
  // stores the cap in resources.maxHp; fall back to stats.maxHp, then current hp.
  const maxHp = e.resources.maxHp ?? e.stats.maxHp ?? hp ?? 0;
  return maxHp > 0 ? hp / maxHp : 0;
}

/**
 * The most-hurt candidate (lowest HP ratio). Ties break by lowest entity id, so
 * "heal the most-hurt ally" is fully deterministic. Pure — no RNG.
 */
export const lowestHp: TargetSelector = (candidates) => {
  if (candidates.length === 0) return undefined;
  let best = candidates[0];
  let bestRatio = hpRatio(best);
  for (let i = 1; i < candidates.length; i++) {
    const c = candidates[i];
    const r = hpRatio(c);
    if (r < bestRatio || (r === bestRatio && c.id < best.id)) {
      best = c;
      bestRatio = r;
    }
  }
  return best;
};

/**
 * The highest-HP candidate (lowest HP ratio inverted). Ties → lowest entity id.
 * Useful for "shield the tank" style buffs. Pure — no RNG.
 */
export const highestHp: TargetSelector = (candidates) => {
  if (candidates.length === 0) return undefined;
  let best = candidates[0];
  let bestRatio = hpRatio(best);
  for (let i = 1; i < candidates.length; i++) {
    const c = candidates[i];
    const r = hpRatio(c);
    if (r > bestRatio || (r === bestRatio && c.id < best.id)) {
      best = c;
      bestRatio = r;
    }
  }
  return best;
};

/**
 * Derive a deterministic, seeded RNG from world state for target selection.
 *
 * `WorldState` does not carry the live `SeededRNG` (that lives on the WorldStore
 * class), so a pure function reconstructs one from the serialized seed plus the
 * tick and a salt (source/ability id). This keeps the draw byte-identical across
 * same-seed runs and across save/load while never touching Math.random/Date.now.
 * The salt ensures two different random picks in the same tick don't correlate.
 */
function deriveRng(world: WorldState, salt: string): SeededRNG {
  let h = (world.meta.seed | 0) ^ Math.imul(world.meta.tick | 0, 0x9e3779b1);
  for (let i = 0; i < salt.length; i++) {
    h = (Math.imul(h, 31) + salt.charCodeAt(i)) | 0;
  }
  return new SeededRNG(h);
}

/**
 * Pick up to `n` distinct candidates uniformly at random using ONLY a seeded RNG
 * derived from `world` (deterministic + replayable). Candidates are pre-sorted by
 * id in {@link candidateTargets}, so the input order — and therefore the draw — is
 * stable. Returns the picks sorted by entity id for a stable result order.
 *
 * `salt` (e.g. an ability id) lets distinct selections in one tick diverge; pass a
 * fixed value when you want reproducibility within a single resolution.
 */
export function selectRandomN(
  candidates: EntityState[],
  world: WorldState,
  n: number,
  salt = 'random-n',
): EntityState[] {
  if (n <= 0 || candidates.length === 0) return [];
  if (n >= candidates.length) {
    return [...candidates].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  const rng = deriveRng(world, salt);
  // Fisher–Yates on a copy, drawing from the seeded stream; take the first n.
  const pool = [...candidates];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }
  return pool
    .slice(0, n)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Build a random-N {@link TargetSelector} (picks exactly one when used as a single selector). */
export function randomSelector(salt = 'random-n'): TargetSelector {
  return (candidates, world) => selectRandomN(candidates, world, 1, salt)[0];
}
