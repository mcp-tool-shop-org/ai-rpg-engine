/**
 * Profile System — Phase 1 (the honest first slice).
 *
 * A `Profile` is an à-la-carte bundle of the mechanical config a single entity
 * archetype needs: a combat stat mapping, an optional combat resource profile,
 * an ability pack, optional pack biases, optional engagement overrides, and
 * tags. It is **data referenced by value**, never a closure or subclass, so it
 * stays JSON-serializable and byte-identical across runs (design-lock finding 5,
 * Nystrom Component + Type Object; Bevy/EnTT archetype-as-data).
 *
 * ---------------------------------------------------------------------------
 * HONEST SCOPE (design-lock section C, "Scope note"):
 *
 *   This slice differentiates **AI scoring + content packaging** and works
 *   TODAY, with no engine change:
 *     - buildProfile      — validate + package a bundle (warn-and-degrade)
 *     - validateProfileSet — cross-profile linter built on existing primitives
 *     - selectActionForProfile — the first real consumer of the shipped-but-
 *                                unused selectBestAction(), so a profile's stat
 *                                mapping + abilities drive that entity's AI.
 *
 *   It does NOT make per-entity *combat resolution* real. A `grit` attacker and
 *   a `focus` attacker still resolve damage through the world's single combat
 *   formula set; routing attacker-stats-via-attacker-mapping and
 *   target-stats-via-target-mapping inside one formula is the deferred **CR-1**
 *   slice (design-lock section C / finding 1). When CR-1 lands, a Profile's
 *   `statMapping` becomes a `WorldState.ruleProfiles` entry referenced by
 *   `EntityState.ruleProfileId`. Until then, selectActionForProfile feeds the
 *   mapping to the AI advisor only.
 *
 * Determinism: this module performs no resolution. selectActionForProfile wraps
 * the pure advisory selectBestAction (no Date.now / Math.random; tie-breaks are
 * the advisors' own stable ordering). buildProfile / validateProfileSet are pure
 * over their inputs and sort every aggregation by a stable key.
 *
 * See docs/feature-architecture.md for the full grounded design.
 * ---------------------------------------------------------------------------
 */

import type { EntityState, WorldState } from '@ai-rpg-engine/core';
import type { AbilityDefinition, ValidationError } from '@ai-rpg-engine/content-schema';
import { validateAbilityPack } from '@ai-rpg-engine/content-schema';
import type { CombatStatMapping } from './combat-core.js';
import type { CombatResourceProfile } from './combat-resources.js';
import type { EngagementConfig } from './engagement-core.js';
import type { PackBias, CombatIntentConfig } from './combat-intent.js';
import { validateEntityTags } from './tag-taxonomy.js';
import { selectBestAction } from './unified-decision.js';
import type { UnifiedDecision, UnifiedDecisionConfig } from './unified-decision.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A complete per-archetype mechanical bundle. Pure data — safe to serialize and
 * to compare byte-for-byte across runs.
 */
export type Profile = {
  /** Stable id (used in cross-profile collision reporting). */
  id: string;
  /** Author-facing display name. */
  name: string;
  /** Maps generic combat roles (attack/precision/resolve) to this archetype's stat names. */
  statMapping: CombatStatMapping;
  /** Optional combat resource economy (momentum/focus/etc.). */
  resourceProfile?: CombatResourceProfile;
  /** The archetype's ability pack. */
  abilities: AbilityDefinition[];
  /** Optional AI personality biases keyed by tag. */
  packBiases?: PackBias[];
  /** Optional engagement positioning overrides (backline/protector/chokepoint tags). */
  engagement?: Partial<EngagementConfig>;
  /** Optional entity tags (role:*, pack-bias, engagement, custom). */
  tags?: string[];
};

/** Input to buildProfile — same shape as Profile (validated + normalized on build). */
export type ProfileConfig = Profile;

export type BuildProfileResult = {
  /** The packaged profile. Always returned (warn-and-degrade — never throws on content issues). */
  profile: Profile;
  /**
   * Non-fatal author warnings (mirrors buildCombatStack's warn-and-degrade).
   * Surfaces likely mistakes that would otherwise vanish silently:
   *  - ability pack structural/cross errors (duplicate id, unknown resource/stat)
   *  - ability pack advisories (zero-cost+zero-cooldown, overbroad cleanse, …)
   *  - entity-tag warnings (multi-role, contradictory engagement+role, unknown prefixed tag)
   * Empty array when the bundle is clean.
   */
  warnings: string[];
};

export type ProfileSetResult = {
  /** True when there are no cross-profile errors. */
  ok: boolean;
  /** Hard cross-profile problems (duplicate ability ids, resource-id collisions). */
  errors: ValidationError[];
  /** Soft cross-profile concerns (stat-name semantic drift, contradictory pack biases). */
  advisories: ValidationError[];
};

// ---------------------------------------------------------------------------
// buildProfile
// ---------------------------------------------------------------------------

/**
 * Derive the minimal `AbilityPackRuleset` a Profile implies, so the EXISTING
 * `validateAbilityPack` cross-validator can run against it.
 *
 * - stats   = the three combat dimensions named by the stat mapping. References
 *             to any OTHER stat in checks / stat-modify effects are therefore
 *             flagged (a real mistake — the entity has no such combat stat).
 * - resources = whatever the resource profile declares (gains/spends/drains/
 *             aiModifiers/caps), plus the implicit hp + stamina that
 *             validateAbilityPack already treats as universal. Costs against an
 *             undeclared resource are therefore flagged.
 *
 * The id sets are sorted so the derived ruleset is stable across runs.
 */
function deriveRuleset(profile: Profile): { stats: { id: string }[]; resources: { id: string }[] } {
  const statIds = new Set<string>([
    profile.statMapping.attack,
    profile.statMapping.precision,
    profile.statMapping.resolve,
  ]);

  const resourceIds = new Set<string>();
  const rp = profile.resourceProfile;
  if (rp) {
    for (const g of rp.gains) resourceIds.add(g.resourceId);
    for (const s of rp.spends) resourceIds.add(s.resourceId);
    for (const d of rp.drains) resourceIds.add(d.resourceId);
    for (const m of rp.aiModifiers) resourceIds.add(m.resourceId);
    if (rp.resourceCaps) {
      for (const id of Object.keys(rp.resourceCaps)) resourceIds.add(id);
    }
  }

  return {
    stats: [...statIds].sort().map((id) => ({ id })),
    resources: [...resourceIds].sort().map((id) => ({ id })),
  };
}

/**
 * Validate and package a Profile bundle using the EXISTING validators
 * (validateAbilityPack + tag-taxonomy validateEntityTags). Returns the profile
 * plus a flat `warnings[]` of likely mistakes. Warn-and-degrade: content issues
 * never throw here (mirrors buildCombatStack), so authoring tools can surface
 * every problem at once instead of failing on the first.
 */
export function buildProfile(config: ProfileConfig): BuildProfileResult {
  const warnings: string[] = [];

  // 1. Ability pack — structural + cross-validation against the derived ruleset.
  const ruleset = deriveRuleset(config);
  const packResult = validateAbilityPack(config.abilities, ruleset, `Profile[${config.id}].abilities`);
  for (const err of packResult.errors) {
    warnings.push(`${err.path}: ${err.message}`);
  }
  for (const adv of packResult.advisories) {
    warnings.push(`advisory: ${adv.path}: ${adv.message}`);
  }

  // 2. Entity tags — multi-role / contradiction / unknown-prefix checks.
  if (config.tags && config.tags.length > 0) {
    for (const tw of validateEntityTags(config.tags)) {
      warnings.push(`tag (${tw.severity}): ${tw.message}`);
    }
  }

  // Profile is a plain-data passthrough (already the right shape). Returned even
  // when warnings exist — the caller decides whether to ship it.
  const profile: Profile = {
    id: config.id,
    name: config.name,
    statMapping: config.statMapping,
    ...(config.resourceProfile ? { resourceProfile: config.resourceProfile } : {}),
    abilities: config.abilities,
    ...(config.packBiases ? { packBiases: config.packBiases } : {}),
    ...(config.engagement ? { engagement: config.engagement } : {}),
    ...(config.tags ? { tags: config.tags } : {}),
  };

  return { profile, warnings };
}

// ---------------------------------------------------------------------------
// validateProfileSet
// ---------------------------------------------------------------------------

/** Get-or-create an owner set and record `owner` under `key` (stable-scan helper). */
function addOwner(map: Map<string, Set<string>>, key: string, owner: string): void {
  let owners = map.get(key);
  if (!owners) {
    owners = new Set<string>();
    map.set(key, owners);
  }
  owners.add(owner);
}

/**
 * Cross-profile linter. Composes existing primitives + small stable scans to
 * catch mistakes that only appear when profiles are used together:
 *
 *  ERRORS (hard — break a shared world):
 *   - duplicate profile id (an id keys WorldState.ruleProfiles; a duplicate
 *     silently overwrites one profile's rule data with another's AND masks the
 *     ability/stat owner scans below, which dedupe on profile.id)
 *   - duplicate ability id across two profiles (an id must resolve to ONE
 *     definition; two profiles claiming the same id is ambiguous)
 *   - resource-id collision with conflicting caps (the same resource declared
 *     with two different maximums across profiles)
 *
 *  ADVISORIES (soft — likely-but-legal):
 *   - stat-name semantic drift (one profile maps `attack→grit`, another maps
 *     `resolve→grit`; the name means two different combat dimensions)
 *   - contradictory pack biases (same tag pushed in opposite directions for the
 *     same intent across profiles)
 *   - stat/resource namespace collision (a name used as a combat STAT in one
 *     profile and a RESOURCE id in another — one key, two mechanical meanings)
 *   - engagement positioning conflict (a tag flagged BACKLINE by one profile and
 *     PROTECTOR by another — contradictory positioning for the same tag)
 *
 * Every scan sorts by a stable key so the report is byte-identical across runs.
 */
export function validateProfileSet(profiles: Profile[]): ProfileSetResult {
  const errors: ValidationError[] = [];
  const advisories: ValidationError[] = [];

  // --- Duplicate profile ids (ERROR) ---
  // The keystone correctness check: a profile id keys WorldState.ruleProfiles, so
  // two profiles sharing an id means one silently OVERWRITES the other when
  // applied. Worse, the owner-by-id scans below dedupe on profile.id, so a
  // duplicate id can MASK a real ability or stat collision between the two.
  // Flagged first, as a hard error.
  const idCounts = new Map<string, number>();
  for (const profile of profiles) {
    idCounts.set(profile.id, (idCounts.get(profile.id) ?? 0) + 1);
  }
  for (const id of [...idCounts.keys()].sort()) {
    const count = idCounts.get(id)!;
    if (count > 1) {
      errors.push({
        path: `ProfileSet.id.${id}`,
        message: `profile id "${id}" is declared by ${count} profiles — profile ids must be unique (an id keys WorldState.ruleProfiles; a duplicate silently overwrites and can mask other collisions)`,
      });
    }
  }

  // --- Duplicate ability ids across profiles ---
  // abilityId -> sorted list of owning profile ids
  const abilityOwners = new Map<string, Set<string>>();
  for (const profile of profiles) {
    for (const ability of profile.abilities) {
      let owners = abilityOwners.get(ability.id);
      if (!owners) {
        owners = new Set<string>();
        abilityOwners.set(ability.id, owners);
      }
      owners.add(profile.id);
    }
  }
  for (const abilityId of [...abilityOwners.keys()].sort()) {
    const owners = abilityOwners.get(abilityId)!;
    if (owners.size > 1) {
      const ownerList = [...owners].sort().join(', ');
      errors.push({
        path: `ProfileSet.abilities.${abilityId}`,
        message: `ability id "${abilityId}" is defined by ${owners.size} profiles (${ownerList}) — an ability id must resolve to one definition`,
      });
    }
  }

  // --- Resource-id collisions with conflicting caps ---
  // resourceId -> Map<cap, sorted owner ids>
  const capsByResource = new Map<string, Map<number, Set<string>>>();
  for (const profile of profiles) {
    const caps = profile.resourceProfile?.resourceCaps;
    if (!caps) continue;
    for (const [resourceId, cap] of Object.entries(caps)) {
      let byCap = capsByResource.get(resourceId);
      if (!byCap) {
        byCap = new Map<number, Set<string>>();
        capsByResource.set(resourceId, byCap);
      }
      let owners = byCap.get(cap);
      if (!owners) {
        owners = new Set<string>();
        byCap.set(cap, owners);
      }
      owners.add(profile.id);
    }
  }
  for (const resourceId of [...capsByResource.keys()].sort()) {
    const byCap = capsByResource.get(resourceId)!;
    if (byCap.size > 1) {
      const detail = [...byCap.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([cap, owners]) => `${cap} (${[...owners].sort().join(', ')})`)
        .join(' vs ');
      errors.push({
        path: `ProfileSet.resourceCaps.${resourceId}`,
        message: `resource "${resourceId}" declared with conflicting caps across profiles: ${detail}`,
      });
    }
  }

  // --- Stat-name semantic drift (advisory) ---
  // statName -> Map<combatDimension, sorted owner ids>
  const ROLES: Array<keyof CombatStatMapping> = ['attack', 'precision', 'resolve'];
  const statRoles = new Map<string, Map<string, Set<string>>>();
  for (const profile of profiles) {
    for (const role of ROLES) {
      const statName = profile.statMapping[role];
      let byRole = statRoles.get(statName);
      if (!byRole) {
        byRole = new Map<string, Set<string>>();
        statRoles.set(statName, byRole);
      }
      let owners = byRole.get(role);
      if (!owners) {
        owners = new Set<string>();
        byRole.set(role, owners);
      }
      owners.add(profile.id);
    }
  }
  for (const statName of [...statRoles.keys()].sort()) {
    const byRole = statRoles.get(statName)!;
    if (byRole.size > 1) {
      const detail = [...byRole.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([role, owners]) => `${role} (${[...owners].sort().join(', ')})`)
        .join(' vs ');
      advisories.push({
        path: `ProfileSet.statMapping.${statName}`,
        message: `stat "${statName}" maps to different combat dimensions across profiles: ${detail}`,
      });
    }
  }

  // --- Contradictory pack biases (advisory) ---
  // tag -> intent -> Map<sign, sorted owner ids>   (sign: 'pos' | 'neg')
  const biasByTag = new Map<string, Map<string, Map<'pos' | 'neg', Set<string>>>>();
  for (const profile of profiles) {
    for (const bias of profile.packBiases ?? []) {
      let byIntent = biasByTag.get(bias.tag);
      if (!byIntent) {
        byIntent = new Map();
        biasByTag.set(bias.tag, byIntent);
      }
      for (const [intent, value] of Object.entries(bias.modifiers)) {
        if (typeof value !== 'number' || value === 0) continue;
        const sign: 'pos' | 'neg' = value > 0 ? 'pos' : 'neg';
        let bySign = byIntent.get(intent);
        if (!bySign) {
          bySign = new Map();
          byIntent.set(intent, bySign);
        }
        let owners = bySign.get(sign);
        if (!owners) {
          owners = new Set<string>();
          bySign.set(sign, owners);
        }
        owners.add(profile.id);
      }
    }
  }
  for (const tag of [...biasByTag.keys()].sort()) {
    const byIntent = biasByTag.get(tag)!;
    for (const intent of [...byIntent.keys()].sort()) {
      const bySign = byIntent.get(intent)!;
      if (bySign.has('pos') && bySign.has('neg')) {
        const pos = [...bySign.get('pos')!].sort().join(', ');
        const neg = [...bySign.get('neg')!].sort().join(', ');
        advisories.push({
          path: `ProfileSet.packBiases.${tag}.${intent}`,
          message: `pack bias tag "${tag}" pushes "${intent}" in opposite directions: + by (${pos}) vs - by (${neg})`,
        });
      }
    }
  }

  // --- Stat-name / resource-id namespace collision (advisory) ---
  // A name used as a combat STAT by one profile and as a RESOURCE id by another
  // is ambiguous in a shared world: one key, two mechanical meanings. Collect the
  // owners of each namespace, then report names that appear in both.
  const statNameOwners = new Map<string, Set<string>>();
  const resourceNameOwners = new Map<string, Set<string>>();
  for (const profile of profiles) {
    for (const role of ROLES) {
      addOwner(statNameOwners, profile.statMapping[role], profile.id);
    }
    const rp = profile.resourceProfile;
    if (rp) {
      for (const g of rp.gains) addOwner(resourceNameOwners, g.resourceId, profile.id);
      for (const s of rp.spends) addOwner(resourceNameOwners, s.resourceId, profile.id);
      for (const d of rp.drains) addOwner(resourceNameOwners, d.resourceId, profile.id);
      for (const m of rp.aiModifiers) addOwner(resourceNameOwners, m.resourceId, profile.id);
      if (rp.resourceCaps) {
        for (const id of Object.keys(rp.resourceCaps)) addOwner(resourceNameOwners, id, profile.id);
      }
    }
  }
  for (const name of [...statNameOwners.keys()].sort()) {
    if (resourceNameOwners.has(name)) {
      const statOwners = [...statNameOwners.get(name)!].sort().join(', ');
      const resOwners = [...resourceNameOwners.get(name)!].sort().join(', ');
      advisories.push({
        path: `ProfileSet.namespace.${name}`,
        message: `"${name}" is used as a combat stat by (${statOwners}) and as a resource by (${resOwners}) — one name, two mechanical meanings in a shared world`,
      });
    }
  }

  // --- Engagement positioning conflict (advisory) ---
  // A tag flagged BACKLINE (keep this entity back) by one profile and PROTECTOR
  // (this entity front-lines to shield allies) by another is contradictory
  // positioning for the same tag across a shared world.
  const backlineOwners = new Map<string, Set<string>>();
  const protectorOwners = new Map<string, Set<string>>();
  for (const profile of profiles) {
    const eng = profile.engagement;
    if (!eng) continue;
    for (const tag of eng.backlineTags ?? []) addOwner(backlineOwners, tag, profile.id);
    for (const tag of eng.protectorTags ?? []) addOwner(protectorOwners, tag, profile.id);
  }
  for (const tag of [...backlineOwners.keys()].sort()) {
    if (protectorOwners.has(tag)) {
      const back = [...backlineOwners.get(tag)!].sort().join(', ');
      const prot = [...protectorOwners.get(tag)!].sort().join(', ');
      advisories.push({
        path: `ProfileSet.engagement.${tag}`,
        message: `engagement tag "${tag}" is backline for (${back}) but protector for (${prot}) — contradictory positioning across profiles`,
      });
    }
  }

  return { ok: errors.length === 0, errors, advisories };
}

// ---------------------------------------------------------------------------
// selectActionForProfile
// ---------------------------------------------------------------------------

/**
 * Per-entity AI driver — the FIRST real consumer of the shipped-but-unused
 * `selectBestAction` (unified-decision.ts). Routes a profile's stat mapping,
 * pack biases, resource profile, and ability pack into the unified combat +
 * ability advisor so THIS entity's decision reflects THIS archetype's config.
 *
 * Honest scope: this drives **decision-making** (which action the AI picks), not
 * combat *resolution*. The chosen action still resolves through the world's
 * single combat formula set — per-entity resolution is the deferred CR-1 slice
 * (see the module header / docs/feature-architecture.md).
 *
 * Deterministic: selectBestAction is pure advisory (no Date.now / Math.random);
 * its internal tie-breaks are stable, so identical (entity, profile, world)
 * inputs yield byte-identical decisions.
 *
 * @param entityId  Id of the entity in `world` making the decision.
 * @param profile   The entity's mechanical bundle.
 * @param world     Current world state (read-only).
 * @param opts      Optional unified-decision overrides (e.g. abilityAdvantageThreshold).
 *                  The profile's combat config is merged in and takes precedence
 *                  for stat mapping / biases / resource profile.
 * @throws Error (structured, names the missing id) when the entity is absent.
 */
export function selectActionForProfile(
  entityId: string,
  profile: Profile,
  world: WorldState,
  opts?: Omit<UnifiedDecisionConfig, 'combatConfig'> & { combatConfig?: CombatIntentConfig },
): UnifiedDecision {
  const entity: EntityState | undefined = world.entities[entityId];
  if (!entity) {
    throw new Error(
      `selectActionForProfile: entity "${entityId}" not found in world (profile "${profile.id}")`,
    );
  }

  // Build the combat intent config from the profile. Profile values win over any
  // partial combatConfig passed in opts (the profile is the source of truth for
  // this entity's mechanics); the caller can still override the threshold etc.
  const combatConfig: CombatIntentConfig = {
    ...opts?.combatConfig,
    statMapping: profile.statMapping,
    ...(profile.packBiases ? { packBiases: profile.packBiases } : {}),
    ...(profile.resourceProfile ? { resourceProfile: profile.resourceProfile } : {}),
  };

  const config: UnifiedDecisionConfig = {
    ...opts,
    combatConfig,
  };

  return selectBestAction(entity, world, profile.abilities, config);
}
