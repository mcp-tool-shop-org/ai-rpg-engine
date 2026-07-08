/**
 * Profile Loader — Phase 2 (the wire that makes a Profile take effect).
 *
 * Phase 1 shipped the Profile SHAPE (buildProfile / validateProfileSet) and a
 * per-entity AI driver (selectActionForProfile), but nothing ATTACHED a profile
 * to a running entity — `selectActionForProfile` was exported-but-unwired, and a
 * profile's stat mapping never reached combat RESOLUTION.
 *
 * `applyProfile` is that missing wire. It attaches a Profile to one entity in a
 * WorldState so the CR-1 per-entity resolution kicks in:
 *
 *   Part A (definite) — register the profile's `statMapping` as a `RuleProfile`
 *     in `world.ruleProfiles[profile.id]`, point the entity at it via
 *     `entity.ruleProfileId`, and make the profile's resource pools live on the
 *     entity. After this, `resolveEntityMapping` (combat-core) reads THIS entity's
 *     own attack/precision/resolve stat names — so a `might` fighter and a `will`
 *     mystic resolve combat in one fight off the shared formula set.
 *
 *   Part B — register the profile's abilities (registerProfileAbilities) so the
 *     `use-ability` verb can RESOLVE an ability the AI chose, not just score it.
 *
 * Determinism: pure data mutation only — no ids, no Date.now, no Math.random.
 * Idempotent: applying the same profile twice yields byte-identical state.
 * Serialization: everything written here is plain data (RuleProfile, resource
 * numbers, pure-data AbilityDefinitions), so it rides `WorldStore.serialize()`
 * with the rest of world state and survives save/load unchanged.
 *
 * API note: this takes `world` (a WorldState), NOT an `engine`, so it is unit-
 * testable without an Engine and aligns with the serialize surface. An Engine
 * wrapper can call it as `applyProfile(engine.store.state, id, profile)`.
 *
 * See docs/feature-architecture.md and profile.ts for the full grounded design.
 */

import type { EntityState, WorldState, RuleProfile } from '@ai-rpg-engine/core';
import type { Profile } from './profile.js';
import { registerProfileAbilities } from './ability-core.js';

/**
 * Every resource id a profile's resource economy references (gains / spends /
 * drains / aiModifiers / caps), sorted for a stable, byte-identical iteration
 * order. Mirrors the resource half of `deriveRuleset` in profile.ts.
 */
function profileResourceIds(profile: Profile): string[] {
  const ids = new Set<string>();
  const rp = profile.resourceProfile;
  if (rp) {
    for (const g of rp.gains) ids.add(g.resourceId);
    for (const s of rp.spends) ids.add(s.resourceId);
    for (const d of rp.drains) ids.add(d.resourceId);
    for (const m of rp.aiModifiers) ids.add(m.resourceId);
    if (rp.resourceCaps) {
      for (const id of Object.keys(rp.resourceCaps)) ids.add(id);
    }
  }
  return [...ids].sort();
}

/**
 * Attach a Profile to one entity so its mechanics take effect at runtime.
 *
 * @param world     The world to mutate (the entity must already be in it).
 * @param entityId  Id of the entity to profile.
 * @param profile   The mechanical bundle to apply.
 * @throws Error (structured, names the missing id) when the entity is absent —
 *         assigning a profile to a nonexistent entity is a caller bug, not a
 *         warn-and-degrade case.
 */
export function applyProfile(world: WorldState, entityId: string, profile: Profile): void {
  const entity: EntityState | undefined = world.entities[entityId];
  if (!entity) {
    throw new Error(
      `applyProfile: entity "${entityId}" not found in world (profile "${profile.id}")`,
    );
  }

  // --- Part A: register the rule profile (stat mapping) + point the entity at it ---
  // A fresh RuleProfile object (copy the three fields explicitly) so the world's
  // rule data does not alias the Profile's statMapping — the registered entry is
  // the CR-1 shape (statMapping only; formulaOverrides is reserved) and stays
  // independent of the source Profile for clean serialization.
  const ruleProfile: RuleProfile = {
    statMapping: {
      attack: profile.statMapping.attack,
      precision: profile.statMapping.precision,
      resolve: profile.statMapping.resolve,
    },
  };
  if (!world.ruleProfiles) world.ruleProfiles = {};
  world.ruleProfiles[profile.id] = ruleProfile;
  entity.ruleProfileId = profile.id;

  // --- Part A (resources): make the profile's resource POOLS live on the entity ---
  // The resource ECONOMY (caps / gains / drains) is world-level config consumed
  // by combat-resources; what an entity needs is the resource pools PRESENT so
  // that module's `hasResource()` gate passes and gains/drains actually engage.
  // Initialize each referenced resource to 0 when absent; never clobber an
  // existing value (idempotent, deterministic — sorted keys append in a stable
  // order so JSON.stringify stays byte-identical across runs).
  for (const resourceId of profileResourceIds(profile)) {
    if (entity.resources[resourceId] === undefined) {
      entity.resources[resourceId] = 0;
    }
  }

  // --- Part B: register the profile's abilities so the entity can USE them ---
  // No-op for an empty ability pack; overwrites-idempotently otherwise.
  registerProfileAbilities(world, profile.abilities);
}
