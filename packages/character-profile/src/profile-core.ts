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
//   advanceArchetypeRank (and advanceDisciplineRank when a discipline is set),
//   copy ranks onto actor.custom, optional ProgressionOps spend/evolve
// - combat.aftermath.injury / combat.defeat.survived → addInjury whose
//   computeInjuryPenalties become one `injured-<id>` status (same GAS band
//   as equipped-<itemId>)
// - rest.completed / ability.heal.applied / combat.injury.healed → healInjury
//   + statuses.remove(injured-<id>) so a Broken Arm does not last the campaign
// - profile.reputation is copied onto actor.relations after every write
// - reputation.adjusted (and a fold of world.globals['reputation_*'] on
//   combat.entity.defeated / action.resolved) calls adjustReputation so
//   live dialogue + defeat-fallout move the sheet (F-31e2e33f)
// - profile.loadout / itemChronicle are copied from equipment-core and
//   item-chronicle on each write (getEntityLoadout stays a pure read)
// - actor.stats / resources / tags + world.meta.tick (totalTurns) copy onto
//   the profile on each write and ensure (F-6379b7cf)
// - Injury.grantedTags union onto actor.tags while active and strip on heal
//   (F-b0b7f592)
//
// Distinct from still-open F-482da85d (deserialize element-shape of
// injuries/loadout) — this file does not touch serialize.ts.
// Distinct from closed F-1b1c077f — the injury apply path is unchanged.
// Distinct from still-open F-e6aa4d28 — equipment grantedTags are a
// different channel.

import type {
  EngineModule,
  EntityState,
  ResolvedEvent,
  ScalarValue,
  WorldState,
} from '@ai-rpg-engine/core';
import type { BuildCatalog, CharacterBuild, PortraitOps } from '@ai-rpg-engine/character-creation';
import { getAllItems, getEntityLoadout, getItemChronicle } from '@ai-rpg-engine/equipment';
import type { CharacterProfile, Injury } from './types.js';
import { createProfile, incrementTurns } from './profile.js';
import { grantXp, advanceArchetypeRank, advanceDisciplineRank, evolveTrait } from './progression.js';
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

/**
 * Optional rank-up inject (F-4016307c). Pack wiring of createProgressionCore
 * is out of domain — this is the missing spend/evolve hook on the owned
 * profile write. Omit it and ranks still copy onto actor.custom.
 */
export type ProgressionOps = {
  /**
   * Spend the archetype's progressionTreeId (pack wires unlockNode, or a stub).
   * Called after advanceArchetypeRank; getEntityLoadout stays a pure read.
   */
  spendTree?: (
    world: WorldState,
    entityId: string,
    treeId: string,
    rank: number,
    tick: number,
  ) => void;
  /**
   * When the catalog names an evolved form for a trait at this rank, return
   * the evolved id so profile-core can call evolveTrait.
   */
  evolvedFormFor?: (traitId: string, rank: number) => string | undefined;
};

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

export type ProfileModuleState = {
  profiles: Record<string, CharacterProfile>;
  /**
   * Last folded `world.globals['reputation_<factionId>']` values so a later
   * defeat-fallout / action.resolved pass applies only the delta (F-31e2e33f).
   */
  reputationLedger?: Record<string, number>;
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

/**
 * Overlay live EntityState stats/resources/tags and world.meta.tick onto a
 * profile (F-6379b7cf). Gear copy stays a pure read of getEntityLoadout.
 */
function syncLiveOntoProfile(world: WorldState, entityId: string, profile: CharacterProfile): CharacterProfile {
  let next = syncGearOntoProfile(world, entityId, profile);
  const actor = world.entities[entityId];
  if (actor) {
    next = {
      ...next,
      stats: { ...actor.stats },
      resources: { ...actor.resources },
      tags: [...actor.tags],
    };
  }
  const tick = world.meta?.tick;
  if (typeof tick === 'number' && Number.isFinite(tick) && tick > next.totalTurns) {
    next = { ...next, totalTurns: tick };
  }
  return next;
}

/** An entity's current profile, or undefined when it has never been tracked. */
export function getEntityProfile(world: WorldState, entityId: string): CharacterProfile | undefined {
  const stored = (world.modules[PROFILE_STATE_KEY] as ProfileModuleState | undefined)?.profiles?.[entityId];
  if (!stored) return undefined;
  return syncLiveOntoProfile(world, entityId, stored);
}

function commitProfile(world: WorldState, entityId: string, profile: CharacterProfile): void {
  const state = getProfileState(world);
  state.profiles[entityId] = syncLiveOntoProfile(world, entityId, profile);
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

/** Union injury.grantedTags onto actor.tags while the injury is active (F-b0b7f592). */
function unionGrantedTags(actor: EntityState, tags: string[]): void {
  const have = new Set(actor.tags);
  for (const tag of tags) {
    if (typeof tag !== 'string' || tag.length === 0 || have.has(tag)) continue;
    actor.tags.push(tag);
    have.add(tag);
  }
}

/**
 * Strip tags no remaining active injury still grants. Chargen / other-channel
 * tags that were never in `released` stay (F-b0b7f592). Equipment grantedTags
 * are a different channel (F-e6aa4d28).
 */
function stripReleasedInjuryTags(actor: EntityState, profile: CharacterProfile, released: string[]): void {
  const still = new Set(computeInjuryPenalties(profile).grantedTags);
  const drop = new Set(
    released.filter((tag) => typeof tag === 'string' && tag.length > 0 && !still.has(tag)),
  );
  if (drop.size === 0) return;
  actor.tags = actor.tags.filter((tag) => !drop.has(tag));
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

/**
 * Stamp progression ranks onto actor.custom the same way resolveEntity
 * stamps custom.title (F-4016307c). Combat formulas / verb lists that
 * read EntityState.custom can then see the live rank.
 */
function copyRanksOntoActor(profile: CharacterProfile, actor: EntityState): void {
  const custom: Record<string, ScalarValue> = { ...(actor.custom ?? {}) };
  custom.archetypeRank = profile.progression.archetypeRank;
  custom.disciplineRank = profile.progression.disciplineRank;
  actor.custom = custom;
}

/**
 * Optional ProgressionOps on rank-up (F-4016307c). Rank increment itself is
 * F-8e83bda3 and is not reopened here. Failures in the inject must not
 * roll back the rank stamp.
 */
function applyRankUpInject(
  world: WorldState,
  actor: EntityState,
  profile: CharacterProfile,
  config: ProfileCoreConfig,
  tick: number,
): CharacterProfile {
  const ops = config.progression;
  if (!ops) return profile;

  const treeId = config.catalog?.archetypes.find((a) => a.id === profile.build.archetypeId)?.progressionTreeId;
  if (treeId && ops.spendTree) {
    try {
      ops.spendTree(world, actor.id, treeId, profile.progression.archetypeRank, tick);
    } catch {
      // Keep the rank copy even if the injected spend throws.
    }
  }

  if (!ops.evolvedFormFor) return profile;
  let next = profile;
  const already = new Set(next.progression.traitEvolutions.map((e) => e.originalTraitId));
  for (const traitId of next.build.traitIds) {
    if (already.has(traitId)) continue;
    let evolved: string | undefined;
    try {
      evolved = ops.evolvedFormFor(traitId, next.progression.archetypeRank);
    } catch {
      continue;
    }
    if (typeof evolved !== 'string' || evolved.length === 0) continue;
    next = evolveTrait(next, traitId, evolved, `tick:${tick}`);
    already.add(traitId);
  }
  return next;
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

function reputationLedger(world: WorldState): Record<string, number> {
  const state = getProfileState(world);
  if (!state.reputationLedger || typeof state.reputationLedger !== 'object' || Array.isArray(state.reputationLedger)) {
    state.reputationLedger = {};
  }
  return state.reputationLedger;
}

/**
 * Apply a live reputation.adjusted delta and pin the ledger to the current
 * global so a later fold does not double-count (F-31e2e33f). copyReputation
 * is unchanged (F-1b1c077f).
 */
function applyReputationDelta(
  world: WorldState,
  profile: CharacterProfile,
  factionId: string,
  delta: number,
): CharacterProfile {
  const next =
    typeof delta === 'number' && Number.isFinite(delta) && delta !== 0
      ? adjustReputation(profile, factionId, delta)
      : profile;
  const ledger = reputationLedger(world);
  const live = world.globals[`reputation_${factionId}`];
  ledger[factionId] =
    typeof live === 'number' && Number.isFinite(live)
      ? live
      : (ledger[factionId] ?? 0) + (typeof delta === 'number' && Number.isFinite(delta) ? delta : 0);
  return next;
}

/**
 * Fold world.globals['reputation_*'] deltas that live play wrote without
 * emitting reputation.adjusted (defeat-fallout). Ledger makes this idempotent
 * across combat.entity.defeated then action.resolved (F-31e2e33f).
 */
function foldReputationGlobals(world: WorldState, profile: CharacterProfile): CharacterProfile {
  const ledger = reputationLedger(world);
  let next = profile;
  for (const [key, value] of Object.entries(world.globals)) {
    if (!key.startsWith('reputation_')) continue;
    const factionId = key.slice('reputation_'.length);
    if (!factionId) continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    const last = ledger[factionId] ?? 0;
    const delta = value - last;
    ledger[factionId] = value;
    if (delta !== 0) {
      next = adjustReputation(next, factionId, delta);
    }
  }
  return next;
}

function playerActor(world: WorldState, fallbackId?: string): EntityState | undefined {
  if (world.playerId && world.entities[world.playerId]) return world.entities[world.playerId];
  if (fallbackId && world.entities[fallbackId]) return world.entities[fallbackId];
  return undefined;
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
  /**
   * Optional chargen catalog — used to resolve ArchetypeDefinition.progressionTreeId
   * when ProgressionOps.spendTree is wired (F-4016307c).
   */
  catalog?: BuildCatalog;
  /** Optional rank-up inject (progression-core spend / trait evolution). */
  progression?: ProgressionOps;
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
          // F-4016307c: copy ranks onto actor.custom (same stamp as
          // custom.title). Optional inject spends progressionTreeId /
          // evolveTrait — pack wiring of createProgressionCore is out of
          // domain. getEntityLoadout stays a pure read.
          profile = applyRankUpInject(world, killer, profile, config, tick);
          copyRanksOntoActor(profile, killer);
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

        // Defeat-fallout writes reputation_<faction> on this same event
        // without emitting reputation.adjusted. Fold whatever has moved
        // (and action.resolved will catch a later-running fallout listener).
        if (killer.id === world.playerId || killer.type === 'player') {
          profile = foldReputationGlobals(world, profile);
        }

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
          unionGrantedTags(actor, added.grantedTags ?? []);
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
        const released: string[] = [];
        for (const injuryId of requested) {
          const current = profile.injuries.find((injury) => injury.id === injuryId);
          const result = healInjury(profile, injuryId, `tick:${tick}`);
          if (!result.found) continue;
          profile = result.profile;
          healedAny = true;
          if (current && !current.healed) {
            released.push(...(current.grantedTags ?? []));
          }
          try {
            config.statuses.remove(actor, injuryStatusId(injuryId), tick);
          } catch {
            // Keep the profile heal even if the injected remove throws.
          }
        }
        if (!healedAny) return;

        stripReleasedInjuryTags(actor, profile, released);
        profile = stampTick(profile, tick);
        commitProfile(world, actor.id, profile);
        copyReputation(profile, actor);
      };

      ctx.events.on('rest.completed', onHeal);
      ctx.events.on('ability.heal.applied', onHeal);
      ctx.events.on('combat.injury.healed', onHeal);

      // F-31e2e33f: dialogue-core emits reputation.adjusted after writing
      // world.globals['reputation_<id>']. adjustReputation then copyReputation
      // so the identity sheet and HUD relations stay live.
      ctx.events.on('reputation.adjusted', (event, world) => {
        const factionId = event.payload?.factionId;
        if (typeof factionId !== 'string' || factionId.length === 0) return;
        const actor = playerActor(world, event.actorId);
        if (!actor) return;
        const tick = event.tick;
        let profile = ensureProfile(world, actor, config, tick);
        const delta = event.payload?.delta;
        profile = applyReputationDelta(
          world,
          profile,
          factionId,
          typeof delta === 'number' ? delta : 0,
        );
        profile = stampTick(profile, tick);
        commitProfile(world, actor.id, profile);
        copyReputation(profile, actor);
      });

      // F-6379b7cf: copy live stats/resources/tags and incrementTurns after
      // the actor's action. Also fold reputation globals so a pack that only
      // has defeat-fallout (no reputation.adjusted) still updates the sheet.
      ctx.events.on('action.resolved', (event, world) => {
        const actorId =
          event.actorId ??
          (typeof event.payload?.actorId === 'string' ? event.payload.actorId : undefined);
        if (!actorId) return;
        const actor = world.entities[actorId];
        if (!actor) return;
        const tracked =
          actorId === world.playerId ||
          actor.type === 'player' ||
          Boolean(getProfileState(world).profiles[actorId]) ||
          Boolean(config.profiles?.[actorId]);
        if (!tracked) return;

        const tick = event.tick;
        let profile = ensureProfile(world, actor, config, tick);
        profile = incrementTurns(profile, 1);
        if (actorId === world.playerId || actor.type === 'player') {
          profile = foldReputationGlobals(world, profile);
        }
        profile = stampTick(profile, tick);
        commitProfile(world, actor.id, profile);
        copyReputation(profile, actor);
      });
    },
  };
}
