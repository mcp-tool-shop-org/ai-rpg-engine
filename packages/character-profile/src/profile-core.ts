// profile-core — the runtime consumer loop for this package (F-1b1c077f).
//
// The wave-26/27 audits found packages/character-profile shipping a complete
// API (createProfile / grantXp / addInjury / computeInjuryPenalties /
// recordMilestone / adjustReputation) with ZERO production callers: CLI
// createNewSession resolveEntity + installCreatedPlayer never constructs a
// CharacterProfile, so a kill never grants XP, a broken-arm never reaches
// combat formulas, and profile.reputation never writes EntityState.relations.
// This module closes that loop the same way createEquipmentCore closed
// equipment's dormant surface: an opt-in EngineModule, status machinery
// INJECTED (this package cannot depend on @ai-rpg-engine/modules), persisted
// under a registered namespace so Engine.serialize round-trips it.
//
// - combat.entity.defeated → grantXp on the killer's profile; on leveledUp,
//   advanceArchetypeRank (and advanceDisciplineRank when a discipline is set)
// - combat.aftermath.injury / combat.defeat.survived → addInjury whose
//   computeInjuryPenalties become one `injured-<id>` status (same GAS band
//   as equipped-<itemId>)
// - rest.completed / ability.heal.applied / combat.injury.healed → healInjury
//   + statuses.remove(injured-<id>) so a Broken Arm does not last the campaign
// - profile.reputation is copied onto actor.relations after every write
// - profile.loadout / itemChronicle are copied from equipment-core and
//   item-chronicle on each write (getEntityLoadout stays a pure read)
//
// Distinct from still-open F-482da85d (deserialize element-shape of
// injuries/loadout) — this file does not touch serialize.ts.
// Distinct from closed F-1b1c077f — the injury apply path is unchanged.

import type {
  EngineModule,
  EntityState,
  ResolvedEvent,
  ScalarValue,
  WorldState,
} from '@ai-rpg-engine/core';
import type { CharacterBuild, PortraitOps } from '@ai-rpg-engine/character-creation';
import { getAllItems, getEntityLoadout, getItemChronicle } from '@ai-rpg-engine/equipment';
import type { CharacterProfile, Injury } from './types.js';
import { createProfile } from './profile.js';
import { grantXp, advanceArchetypeRank, advanceDisciplineRank } from './progression.js';
import { addInjury, computeInjuryPenalties, getActiveInjuries, healInjury } from './injuries.js';
import { adjustReputation, recordMilestone } from './milestones.js';

// ---------------------------------------------------------------------------
// Contract constants
// ---------------------------------------------------------------------------

/** Persisted module-state namespace key (world.modules[PROFILE_STATE_KEY]). */
export const PROFILE_STATE_KEY = 'character-profile';

/**
 * Status id carried by an entity while an injury is active. Colon-free for
 * the same HUD reason as equipStatusId: terminal-ui strips a `namespace:`
 * prefix, and "Injured" is player-meaningful.
 */
export function injuryStatusId(injuryId: string): string {
  return `injured-${injuryId}`;
}

/** Default XP granted to the killer on combat.entity.defeated. */
export const DEFAULT_XP_PER_KILL = 25;

/** Default XP granted when the defeated entity is tagged `boss` / `role:boss`. */
export const DEFAULT_XP_PER_BOSS = 100;

// ---------------------------------------------------------------------------
// Injected status machinery (same structural seam as EquipmentStatusOps)
// ---------------------------------------------------------------------------

export type ProfileStatusDefinition = {
  id: string;
  name: string;
  tags: string[];
  stacking: 'replace';
  duration: { type: 'permanent' };
  modifiers?: { stat: string; operation: 'add'; value: number }[];
  ui?: { icon?: string; color?: string; description?: string };
};

/**
 * The status operations this module needs, shaped to match what
 * @ai-rpg-engine/modules already exports — a pack wires them verbatim:
 *
 * ```ts
 * import { registerStatusDefinitions, applyStatus, removeStatus } from '@ai-rpg-engine/modules';
 * createProfileCore({
 *   statuses: { registerDefinitions: registerStatusDefinitions, apply: applyStatus, remove: removeStatus },
 * });
 * ```
 */
export type ProfileStatusOps = {
  registerDefinitions: (defs: ProfileStatusDefinition[]) => void;
  apply: (
    entity: EntityState,
    statusId: string,
    tick: number,
    options?: {
      stacking?: 'replace' | 'stack' | 'refresh';
      sourceId?: string;
      data?: Record<string, ScalarValue>;
    },
    world?: WorldState,
  ) => ResolvedEvent;
  remove: (entity: EntityState, statusId: string, tick: number) => ResolvedEvent | null;
};

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

export type ProfileModuleState = {
  profiles: Record<string, CharacterProfile>;
};

function isPlainProfilesMap(value: unknown): value is Record<string, CharacterProfile> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getProfileState(world: WorldState): ProfileModuleState {
  const existing = world.modules[PROFILE_STATE_KEY];
  if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
    const profiles = (existing as ProfileModuleState).profiles;
    if (isPlainProfilesMap(profiles)) {
      return existing as ProfileModuleState;
    }
  }
  const fresh: ProfileModuleState = { profiles: {} };
  world.modules[PROFILE_STATE_KEY] = fresh;
  return fresh;
}

/**
 * Overlay live equipment-core loadout and item-chronicle history onto a
 * profile. getEntityLoadout is a pure read (F-5164895e / F-c95f4820) — this
 * copies, it does not auto-wear.
 */
function syncGearOntoProfile(world: WorldState, entityId: string, profile: CharacterProfile): CharacterProfile {
  const loadout = getEntityLoadout(world, entityId);
  let next = profile;
  let changed = false;
  if (loadout) {
    next = { ...next, loadout: structuredClone(loadout) };
    changed = true;
  }
  const chronicle = getItemChronicle(world);
  const itemIds = getAllItems(loadout ?? next.loadout);
  if (itemIds.length === 0) return changed ? next : profile;
  const itemChronicle = { ...next.itemChronicle };
  for (const itemId of itemIds) {
    const entries = chronicle[itemId];
    if (entries && entries.length > 0) {
      itemChronicle[itemId] = entries;
      changed = true;
    }
  }
  return changed ? { ...next, itemChronicle } : profile;
}

/** An entity's current profile, or undefined when it has never been tracked. */
export function getEntityProfile(world: WorldState, entityId: string): CharacterProfile | undefined {
  const stored = (world.modules[PROFILE_STATE_KEY] as ProfileModuleState | undefined)?.profiles?.[entityId];
  if (!stored) return undefined;
  return syncGearOntoProfile(world, entityId, stored);
}

function commitProfile(world: WorldState, entityId: string, profile: CharacterProfile): void {
  const state = getProfileState(world);
  state.profiles[entityId] = syncGearOntoProfile(world, entityId, profile);
  world.modules[PROFILE_STATE_KEY] = state;
}

function stampTick(profile: CharacterProfile, tick: number): CharacterProfile {
  return { ...profile, updatedAt: `tick:${tick}` };
}

// ---------------------------------------------------------------------------
// Status definitions from an injury
// ---------------------------------------------------------------------------

/** One StatusDefinition per active injury: `injured-<id>`, mirroring statPenalties. */
export function buildInjuryStatusDefinition(injury: Injury): ProfileStatusDefinition {
  return {
    id: injuryStatusId(injury.id),
    name: `Injured: ${injury.name}`,
    tags: ['debuff', 'wound'],
    stacking: 'replace',
    duration: { type: 'permanent' },
    modifiers: Object.entries(injury.statPenalties ?? {})
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([stat, value]) => ({ stat, operation: 'add' as const, value })),
    ui: { description: injury.description },
  };
}

function applyInjuryStatus(
  actor: EntityState,
  injury: Injury,
  tick: number,
  statuses: ProfileStatusOps,
  world: WorldState,
): void {
  statuses.registerDefinitions([buildInjuryStatusDefinition(injury)]);
  statuses.apply(
    actor,
    injuryStatusId(injury.id),
    tick,
    { stacking: 'replace', sourceId: actor.id, data: { injuryId: injury.id } },
    world,
  );
  // Resource penalties have no GAS channel — apply once onto the live pool.
  for (const [res, amount] of Object.entries(injury.resourcePenalties ?? {})) {
    if (!Number.isFinite(amount)) continue;
    actor.resources[res] = (actor.resources[res] ?? 0) + amount;
  }
}

// ---------------------------------------------------------------------------
// Reputation → EntityState.relations
// ---------------------------------------------------------------------------

function copyReputation(profile: CharacterProfile, actor: EntityState): void {
  if (profile.reputation.length === 0) return;
  const relations: Record<string, ScalarValue> = { ...(actor.relations ?? {}) };
  for (const entry of profile.reputation) {
    relations[entry.factionId] = entry.value;
  }
  actor.relations = relations;
}

function seedReputationFromEntity(profile: CharacterProfile, actor: EntityState): CharacterProfile {
  if (!actor.relations) return profile;
  let next = profile;
  for (const [factionId, value] of Object.entries(actor.relations)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value === 0) continue;
    next = adjustReputation(next, factionId, value);
  }
  return next;
}

// ---------------------------------------------------------------------------
// Profile ensure
// ---------------------------------------------------------------------------

function buildFromEntity(entity: EntityState): CharacterBuild {
  const custom = entity.custom ?? {};
  const build: CharacterBuild = {
    name: entity.name,
    archetypeId: typeof custom.archetypeId === 'string' ? custom.archetypeId : entity.blueprintId,
    backgroundId: typeof custom.backgroundId === 'string' ? custom.backgroundId : entity.blueprintId,
    traitIds: [],
  };
  if (typeof custom.disciplineId === 'string') build.disciplineId = custom.disciplineId;
  if (typeof custom.portraitRef === 'string') build.portraitRef = custom.portraitRef;
  return build;
}

function ensureProfile(
  world: WorldState,
  entity: EntityState,
  config: ProfileCoreConfig,
  tick: number,
): CharacterProfile {
  const state = getProfileState(world);
  const existing = state.profiles[entity.id];
  if (existing) {
    for (const injury of getActiveInjuries(existing)) {
      config.statuses.registerDefinitions([buildInjuryStatusDefinition(injury)]);
    }
    if (existing.reputation.length === 0 && entity.relations) {
      const seeded = stampTick(seedReputationFromEntity(existing, entity), tick);
      commitProfile(world, entity.id, seeded);
      copyReputation(seeded, entity);
      return getEntityProfile(world, entity.id) ?? seeded;
    }
    copyReputation(existing, entity);
    commitProfile(world, entity.id, existing);
    return getEntityProfile(world, entity.id) ?? existing;
  }

  const seeded = config.profiles?.[entity.id];
  let profile =
    seeded ??
    createProfile(
      buildFromEntity(entity),
      { ...entity.stats },
      { ...entity.resources },
      [...entity.tags],
      config.packId ?? 'unknown',
      entity.id,
      config.portraits,
    );
  profile = seedReputationFromEntity(profile, entity);
  profile = stampTick(profile, tick);
  if (!profile.createdAt.startsWith('tick:')) {
    profile = { ...profile, createdAt: `tick:${tick}` };
  }
  commitProfile(world, entity.id, profile);
  copyReputation(profile, entity);
  return profile;
}

// ---------------------------------------------------------------------------
// Injury templates for the defeat-survived hook
// ---------------------------------------------------------------------------

function injuryFromHook(
  payload: Record<string, unknown>,
  tick: number,
): Omit<Injury, 'id' | 'healed' | 'healedAt'> {
  const severity = typeof payload.severity === 'string' ? payload.severity : 'serious';
  const name =
    typeof payload.injuryName === 'string'
      ? payload.injuryName
      : severity === 'critical'
        ? 'Broken Arm'
        : severity === 'light'
          ? 'Light Wound'
          : 'Serious Wound';
  const description =
    typeof payload.description === 'string'
      ? payload.description
      : 'Sustained surviving a defeat.';
  const statPenalties =
    payload.statPenalties && typeof payload.statPenalties === 'object' && !Array.isArray(payload.statPenalties)
      ? { ...(payload.statPenalties as Record<string, number>) }
      : severity === 'light'
        ? { vigor: -1 }
        : { vigor: -2 };
  const resourcePenalties =
    payload.resourcePenalties &&
    typeof payload.resourcePenalties === 'object' &&
    !Array.isArray(payload.resourcePenalties)
      ? { ...(payload.resourcePenalties as Record<string, number>) }
      : {};
  const grantedTags = Array.isArray(payload.grantedTags)
    ? (payload.grantedTags as unknown[]).filter((t): t is string => typeof t === 'string')
    : ['injured'];
  return {
    name,
    description,
    statPenalties,
    resourcePenalties,
    grantedTags,
    sustainedAt: `tick:${tick}`,
  };
}

function isBoss(entity: EntityState | undefined): boolean {
  return (entity?.tags ?? []).some((t) => t === 'boss' || t === 'role:boss');
}

function xpForKill(config: ProfileCoreConfig, defeated: EntityState | undefined): number {
  if (isBoss(defeated)) return config.xpPerBoss ?? DEFAULT_XP_PER_BOSS;
  return config.xpPerKill ?? DEFAULT_XP_PER_KILL;
}

// ---------------------------------------------------------------------------
// Module factory
// ---------------------------------------------------------------------------

export type ProfileCoreConfig = {
  /** The engine build's status machinery (modules' register / apply / remove). */
  statuses: ProfileStatusOps;
  /** Pack id stamped onto profiles created from live entities. */
  packId?: string;
  /** XP granted per regular kill. Default {@link DEFAULT_XP_PER_KILL}. */
  xpPerKill?: number;
  /** XP granted when the defeated entity is a boss. Default {@link DEFAULT_XP_PER_BOSS}. */
  xpPerBoss?: number;
  /** Optional pre-built profiles, keyed by entity id (chargen hand-off). */
  profiles?: Record<string, CharacterProfile>;
  /** Optional portrait inject, forwarded to createProfile. */
  portraits?: PortraitOps;
};

/**
 * Progression / injury / reputation EngineModule over this package's
 * CharacterProfile model.
 *
 * OPT-IN: a pack adds this to its module list to turn XP, injuries, and
 * reputation into live play. Packs that do not are byte-identical to the
 * engine as it shipped without it.
 */
export function createProfileCore(config: ProfileCoreConfig): EngineModule {
  return {
    id: 'character-profile-core',
    version: '1.0.0',
    dependsOn: ['status-core'],

    register(ctx) {
      ctx.persistence.registerNamespace(PROFILE_STATE_KEY, {
        profiles: {},
      } satisfies ProfileModuleState);

      ctx.events.on('combat.entity.defeated', (event, world) => {
        const killerId = (event.payload.defeatedBy as string | undefined) ?? event.actorId;
        if (!killerId) return;
        const killer = world.entities[killerId];
        if (!killer) return;

        const defeatedId = event.payload.entityId as string | undefined;
        const defeated = defeatedId ? world.entities[defeatedId] : undefined;
        const tick = event.tick;

        let profile = ensureProfile(world, killer, config, tick);
        const amount = xpForKill(config, defeated);
        const granted = grantXp(profile, amount);
        profile = stampTick(granted.profile, tick);

        // F-8e83bda3: a level-up spends rank, not just a counter. grantXp
        // itself is unchanged (F-1b1c077f).
        if (granted.leveledUp) {
          profile = advanceArchetypeRank(profile).profile;
          if (profile.build.disciplineId) {
            profile = advanceDisciplineRank(profile).profile;
          }
        }

        const defeatedName =
          (event.payload.entityName as string | undefined) ?? defeated?.name ?? 'a foe';
        profile = recordMilestone(profile, {
          label: granted.leveledUp ? `Level ${granted.newLevel}` : 'Kill',
          description: `Defeated ${defeatedName}`,
          at: `tick:${tick}`,
          tags: granted.leveledUp ? ['kill', 'level-up'] : ['kill'],
        });
        profile = stampTick(profile, tick);

        commitProfile(world, killer.id, profile);
        copyReputation(profile, killer);
      });

      // Defeat-survived hook: combat-recovery emits combat.aftermath.injury
      // for living survivors when a zone clears. Hosts (and tests) may also
      // emit combat.defeat.survived with the same payload shape.
      const onSurvived = (event: ResolvedEvent, world: WorldState) => {
        const entityId = event.payload.entityId as string | undefined;
        if (!entityId) return;
        const actor = world.entities[entityId];
        if (!actor) return;
        if ((actor.resources.hp ?? 0) <= 0) return;

        const tick = event.tick;
        let profile = ensureProfile(world, actor, config, tick);
        const injuryInput = injuryFromHook(event.payload, tick);
        profile = addInjury(profile, injuryInput);
        profile = stampTick(profile, tick);

        const added = profile.injuries[profile.injuries.length - 1];
        if (added && !added.healed) {
          try {
            applyInjuryStatus(actor, added, tick, config.statuses, world);
          } catch {
            // Injected apply is fallible; keep the profile write even if the
            // status op throws so a later snapshot still has the injury.
          }
        }

        commitProfile(world, actor.id, profile);
        copyReputation(profile, actor);
        // Pin helper: expose aggregate penalties on the event for tests.
        event.payload.injuryPenalties = computeInjuryPenalties(profile);
      };

      ctx.events.on('combat.aftermath.injury', onSurvived);
      ctx.events.on('combat.defeat.survived', onSurvived);

      // F-10a6f10c: injuries used to stay permanent. Rest / healer / an
      // explicit combat.injury.healed event run healInjury and strip the
      // injured-<id> status. The apply path above is untouched (F-1b1c077f).
      const onHeal = (event: ResolvedEvent, world: WorldState) => {
        const payload = event.payload ?? {};
        const entityId = [payload.targetId, payload.entityId, event.actorId].find(
          (value): value is string => typeof value === 'string' && value.length > 0,
        );
        if (!entityId) return;
        const actor = world.entities[entityId];
        if (!actor) return;

        const stored = getProfileState(world).profiles[entityId];
        if (!stored) return;

        const tick = event.tick;
        const requested =
          typeof payload.injuryId === 'string' && payload.injuryId.length > 0
            ? [payload.injuryId]
            : getActiveInjuries(stored).map((injury) => injury.id);
        if (requested.length === 0) return;

        let profile = stored;
        let healedAny = false;
        for (const injuryId of requested) {
          const result = healInjury(profile, injuryId, `tick:${tick}`);
          if (!result.found) continue;
          profile = result.profile;
          healedAny = true;
          try {
            config.statuses.remove(actor, injuryStatusId(injuryId), tick);
          } catch {
            // Keep the profile heal even if the injected remove throws.
          }
        }
        if (!healedAny) return;

        profile = stampTick(profile, tick);
        commitProfile(world, actor.id, profile);
        copyReputation(profile, actor);
      };

      ctx.events.on('rest.completed', onHeal);
      ctx.events.on('ability.heal.applied', onHeal);
      ctx.events.on('combat.injury.healed', onHeal);
    },
  };
}
