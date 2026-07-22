// companion-core — party state and companion management
// Companions are NPCs with a CompanionState sidecar. Not a new entity type.
// Pure functions. No state mutation — returns new objects.
//
// v2.8 (F-7d5c3e28/F-834d0485/F-cf1ddc9f/F-2fe4be26/F-66cd1cd0): the party-
// state API below was fully authored and unit-tested with ZERO production
// callers — isCompanionRecruitable/addCompanion/removeCompanion appeared only
// in this file's own test. createCompanionCore is the write-wire: a 'recruit'
// verb (mirroring equipment-core.ts's equipItem reject()-then-mutate shape)
// that performs THREE dual-writes in one commit, so a companion is never
// half-real:
//   (a) party state    → world.modules['companion-core'], flat (getPartyState/
//       setPartyState below) — the exact shape director.test.ts and
//       endgame.test.ts already construct (F-834d0485; closes F-69d878cf).
//   (b) entity tags     → 'companion' + 'companion:<role>' (F-2fe4be26) —
//       lights up finale's COMPANIONS block, terminal-ui's ally coloring,
//       menu.ts's support-ability targeting, npc-agency's protect/abandon
//       goals, and combat-core's INTERCEPT_ROLE_BONUS table, none of which
//       need editing — they already read these tags.
//   (c) entity.faction  → the player's faction, set on both sides (F-cf1ddc9f)
//       — without it targeting.ts's affiliationOf falls back to the type
//       heuristic and resolves the companion as an ENEMY to ability/AI
//       targeting despite being tagged 'companion'.
// createCompanionCore is always included in buildWorldStack (world-stack.ts),
// the same always-on contract economy-core/trade-core have, so every starter
// gets the verb with zero per-starter setup.ts edits.

import type {
  EngineModule,
  ActionIntent,
  WorldState,
  ResolvedEvent,
  EntityState,
} from '@ai-rpg-engine/core';
import { makeEvent } from './make-event.js';
import { applyStatus, removeStatus } from './status-core.js';
import { registerStatusDefinitions } from './status-semantics.js';

// --- Types ---

export type CompanionRole = 'fighter' | 'scout' | 'healer' | 'diplomat' | 'smuggler' | 'scholar';

export type CompanionState = {
  npcId: string;           // Same ID as their EntityState
  role: CompanionRole;
  joinedAtTick: number;
  personalGoal?: string;   // "Find her brother", "Clear her name"
  abilityTags: string[];   // ['intimidation-backup', 'medical-support']
  morale: number;          // 0-100, tracks how companion feels about traveling with player
  active: boolean;         // In the active party (vs dismissed/away)
};

export type PartyState = {
  companions: CompanionState[];
  maxSize: number;          // Default 3
  cohesion: number;         // 0-100, derived from average companion morale
};

export type AbilityModifiers = {
  leverageCostDiscount: number;    // Subtracted from leverage costs
  hpRecoveryBonus: number;         // Added to post-combat HP recovery
  rumorSpreadScale: number;        // Multiplied onto rumor spread
  reputationBonus: Record<string, number>;  // Per-faction reputation bonus
  commerceGainBonus: number;       // Added to commerce leverage gains
  rumorSuppressionChance: number;  // 0-1, chance to bury negative rumors
  perceptionBonus: number;         // Added to perception clarity
};

// --- Party Management ---

const DEFAULT_MAX_SIZE = 3;

export function createPartyState(maxSize?: number): PartyState {
  return {
    companions: [],
    maxSize: maxSize ?? DEFAULT_MAX_SIZE,
    cohesion: 0,
  };
}

export type AddCompanionResult = {
  party: PartyState;
  success: boolean;
  /** Present only when success is false — why the companion was not added. */
  reason?: 'party-full' | 'already-present';
};

/**
 * Add a companion to the party. Returns a result wrapper (F-f0ca0e51) —
 * addCompanion used to silently return the unchanged `party` with no signal
 * of any kind when the party was already at maxSize or the companion was
 * already present, unlike every comparable state-changing operation
 * elsewhere in this package (unlockNode -> UnlockResult { success, reason },
 * resolveCraft/resolveRepair/resolveModify -> { success, ... },
 * resolveSocialAction/etc -> LeverageResolution { success, failReason }).
 * A caller can no longer distinguish "companion added" from "party was full,
 * nothing happened" only by comparing party.companions.length before/after.
 */
export function addCompanion(party: PartyState, companion: CompanionState): AddCompanionResult {
  if (party.companions.length >= party.maxSize) {
    return { party, success: false, reason: 'party-full' };
  }
  if (party.companions.some((c) => c.npcId === companion.npcId)) {
    return { party, success: false, reason: 'already-present' };
  }
  const companions = [...party.companions, companion];
  const newParty: PartyState = { ...party, companions, cohesion: computePartyCohesion({ ...party, companions }) };
  return { party: newParty, success: true };
}

export function removeCompanion(
  party: PartyState,
  npcId: string,
): { party: PartyState; removed: CompanionState | undefined } {
  const removed = party.companions.find((c) => c.npcId === npcId);
  if (!removed) return { party, removed: undefined };
  const companions = party.companions.filter((c) => c.npcId !== npcId);
  const newParty: PartyState = { ...party, companions, cohesion: computePartyCohesion({ ...party, companions }) };
  return { party: newParty, removed };
}

export function getCompanion(party: PartyState, npcId: string): CompanionState | undefined {
  return party.companions.find((c) => c.npcId === npcId);
}

export function isCompanion(party: PartyState, npcId: string): boolean {
  return party.companions.some((c) => c.npcId === npcId);
}

export function getActiveCompanions(party: PartyState): CompanionState[] {
  return party.companions.filter((c) => c.active);
}

export function setCompanionActive(party: PartyState, npcId: string, active: boolean): PartyState {
  const companions = party.companions.map((c) =>
    c.npcId === npcId ? { ...c, active } : c,
  );
  return { ...party, companions, cohesion: computePartyCohesion({ ...party, companions }) };
}

export function adjustCompanionMorale(party: PartyState, npcId: string, delta: number): PartyState {
  const companions = party.companions.map((c) =>
    c.npcId === npcId
      ? { ...c, morale: Math.max(0, Math.min(100, c.morale + delta)) }
      : c,
  );
  return { ...party, companions, cohesion: computePartyCohesion({ ...party, companions }) };
}

export function computePartyCohesion(party: PartyState): number {
  const active = party.companions.filter((c) => c.active);
  if (active.length === 0) return 0;
  const avg = active.reduce((sum, c) => sum + c.morale, 0) / active.length;
  return Math.round(avg);
}

export function computePartyAbilities(party: PartyState): string[] {
  const active = party.companions.filter((c) => c.active);
  const tags = new Set<string>();
  for (const c of active) {
    for (const tag of c.abilityTags) {
      tags.add(tag);
    }
  }
  return [...tags];
}

export function isCompanionRecruitable(entity: EntityState): boolean {
  return entity.tags.includes('recruitable') || entity.tags.includes('companion-ready');
}

// --- Ability Modifiers ---

const ABILITY_EFFECTS: Record<string, Partial<AbilityModifiers>> = {
  'intimidation-backup': { leverageCostDiscount: 1 },
  'medical-support': { hpRecoveryBonus: 2 },
  'smuggling-contact': { leverageCostDiscount: 1 },
  'witness-calming': { rumorSpreadScale: 0.7 },
  'trade-advantage': { commerceGainBonus: 1 },
  'rumor-suppression': { rumorSuppressionChance: 0.3 },
  'scholarly-insight': { perceptionBonus: 0.1 },
  // faction-route handled specially — needs companion's factionId
};

/**
 * Default abilityTags a fresh recruit starts with, one per role (F-66cd1cd0):
 * without this, the recruit handler's `abilityTags: []` would leave
 * computePartyAbilities/computeAbilityModifiers permanently fed an empty
 * array for every real recruit — the ability-modifier mirror would be wired
 * but never actually carry a value in play. A thematic pairing against
 * ABILITY_EFFECTS above (fighters back up threats, healers heal, ...);
 * 'rumor-suppression' is left as a non-default ability (no role maps to it),
 * available for future per-NPC content authoring to grant explicitly.
 * Content authors may always override — this is a default, not a lock.
 */
const DEFAULT_ROLE_ABILITY_TAG: Record<CompanionRole, string> = {
  fighter: 'intimidation-backup',
  scout: 'trade-advantage',
  healer: 'medical-support',
  diplomat: 'witness-calming',
  smuggler: 'smuggling-contact',
  scholar: 'scholarly-insight',
};

const DEFAULT_MODIFIERS: AbilityModifiers = {
  leverageCostDiscount: 0,
  hpRecoveryBonus: 0,
  rumorSpreadScale: 1.0,
  reputationBonus: {},
  commerceGainBonus: 0,
  rumorSuppressionChance: 0,
  perceptionBonus: 0,
};

export function computeAbilityModifiers(
  abilities: string[],
  companionFactionIds?: Record<string, string | null>,
): AbilityModifiers {
  const mods: AbilityModifiers = { ...DEFAULT_MODIFIERS, reputationBonus: {} };

  for (const ability of abilities) {
    const effects = ABILITY_EFFECTS[ability];
    if (effects) {
      // F-a8156c3b (folded F-fce3683b): `!== undefined`, not truthy — a
      // future ability effect authored with an explicit 0 override (e.g. a
      // role variant with hpRecoveryBonus: 0) must still apply, not be
      // silently skipped. Was fairly harmless while this function had zero
      // callers; F-COMP-007 gives it its first production caller, which
      // changes the risk calculus. Mirrors the `!== undefined` pattern
      // rumorSpreadScale already used below.
      if (effects.leverageCostDiscount !== undefined) mods.leverageCostDiscount += effects.leverageCostDiscount;
      if (effects.hpRecoveryBonus !== undefined) mods.hpRecoveryBonus += effects.hpRecoveryBonus;
      if (effects.rumorSpreadScale !== undefined) mods.rumorSpreadScale *= effects.rumorSpreadScale;
      if (effects.commerceGainBonus !== undefined) mods.commerceGainBonus += effects.commerceGainBonus;
      if (effects.rumorSuppressionChance !== undefined) {
        // Combine probabilities: 1 - (1-a)(1-b)
        mods.rumorSuppressionChance = 1 - (1 - mods.rumorSuppressionChance) * (1 - effects.rumorSuppressionChance);
      }
      if (effects.perceptionBonus !== undefined) mods.perceptionBonus += effects.perceptionBonus;
    }

    // faction-route: +10 reputation bonus for companion's faction
    if (ability === 'faction-route' && companionFactionIds) {
      for (const [, factionId] of Object.entries(companionFactionIds)) {
        if (factionId) {
          mods.reputationBonus[factionId] = (mods.reputationBonus[factionId] ?? 0) + 10;
        }
      }
    }
  }

  return mods;
}

// --- Formatting ---

export function formatPartyForDirector(
  party: PartyState,
  companionProfiles: Array<{
    npcId: string;
    name: string;
    breakpoint: string;
    goals: Array<{ label: string; priority: number }>;
  }>,
  departureRisks: Record<string, { risk: string; reason?: string }>,
): string {
  const DIVIDER = '─'.repeat(60);
  const lines: string[] = [];
  const active = getActiveCompanions(party);

  lines.push('');
  lines.push(DIVIDER);
  lines.push(`  PARTY (${active.length}/${party.maxSize} companions)`);
  lines.push(DIVIDER);
  lines.push('');

  if (party.companions.length === 0) {
    lines.push('  No companions recruited.');
  } else {
    for (const comp of party.companions) {
      const profile = companionProfiles.find((p) => p.npcId === comp.npcId);
      const name = profile?.name ?? comp.npcId;
      const breakpoint = profile?.breakpoint ?? 'unknown';
      const activeStr = comp.active ? '' : ' [inactive]';
      const role = comp.role.charAt(0).toUpperCase() + comp.role.slice(1);

      lines.push(`  ${name} (${comp.npcId}) — ${role} | Morale: ${comp.morale} | Breakpoint: ${breakpoint}${activeStr}`);

      if (comp.abilityTags.length > 0) {
        lines.push(`    Abilities: ${comp.abilityTags.join(', ')}`);
      }

      if (profile?.goals && profile.goals.length > 0) {
        const goalStr = profile.goals.slice(0, 3).map((g) => `${g.label} (${g.priority.toFixed(1)})`).join(', ');
        lines.push(`    Goals: ${goalStr}`);
      }

      const risk = departureRisks[comp.npcId];
      if (risk) {
        lines.push(`    Departure risk: ${risk.risk}${risk.reason ? ` — ${risk.reason}` : ''}`);
      }

      if (comp.personalGoal) {
        lines.push(`    Personal goal: ${comp.personalGoal}`);
      }

      lines.push(`    Joined: tick ${comp.joinedAtTick}`);
      lines.push('');
    }

    const abilities = computePartyAbilities(party);
    lines.push(`  Cohesion: ${party.cohesion}${abilities.length > 0 ? ` | Party abilities: ${abilities.join(', ')}` : ''}`);
  }

  lines.push('');
  lines.push(DIVIDER);
  lines.push('');

  return lines.join('\n');
}

export function formatPartyStatusLine(
  party: PartyState,
  companionNames: Record<string, string>,
): string | undefined {
  const active = getActiveCompanions(party);
  if (active.length === 0) return undefined;

  const parts = active.map((c) => {
    const name = companionNames[c.npcId] ?? c.npcId;
    return `${name} (${c.role}, morale ${c.morale})`;
  });

  return `  Party: ${parts.join(' | ')} | Cohesion: ${party.cohesion}`;
}

export function formatPartyPresence(
  party: PartyState,
  companionNames: Record<string, string>,
): string | undefined {
  const active = getActiveCompanions(party);
  if (active.length === 0) return undefined;

  const parts = active.map((c) => {
    const name = companionNames[c.npcId] ?? c.npcId;
    const mood = c.morale >= 70 ? 'confident' : c.morale >= 40 ? 'cautious' : 'uneasy';
    return `${name} (${c.role}, ${mood})`;
  });

  return `Accompanied by ${parts.join(' and ')}`;
}

// ---------------------------------------------------------------------------
// Entity tags (F-2fe4be26) — the 'companion' + 'companion:<role>' pair
// tag-taxonomy.ts already formally registers under its 'companion' category.
// ---------------------------------------------------------------------------

/** Entity tag marking a recruited companion. Read (never before written) by
 *  endgame.ts's FinaleNpcInput.isCompanion, terminal-ui's entityKind (ally
 *  coloring), cli/menu.ts's menuTargetable (support-ability listing),
 *  npc-agency.ts's companion goal derivation, and combat-builders.ts's isAlly
 *  (F-64580086). */
export const COMPANION_TAG = 'companion';

/** Namespaced per-role tag — combat-core.ts's INTERCEPT_ROLE_BONUS table keys
 *  directly off this (e.g. 'companion:fighter' → +8 intercept chance). */
export function companionRoleTag(role: CompanionRole): string {
  return `companion:${role}`;
}

const COMPANION_ROLES: readonly CompanionRole[] = [
  'fighter', 'scout', 'healer', 'diplomat', 'smuggler', 'scholar',
];

/**
 * Derive a recruit's CompanionRole from its own authored tags. Every shipped
 * recruitable NPC already carries a bare role tag alongside 'recruitable'
 * (e.g. starter-fantasy's Sister Maren: ['npc','recruitable','healer']) — no
 * content changes needed in any of the 5 starters that author recruitable
 * NPCs today. Falls back to 'scout' so a future recruitable NPC authored
 * without an explicit role tag still recruits, with a role rather than a
 * rejection.
 */
export function deriveCompanionRole(entity: EntityState): CompanionRole {
  return COMPANION_ROLES.find((role) => entity.tags.includes(role)) ?? 'scout';
}

function isCompanionRole(value: unknown): value is CompanionRole {
  return typeof value === 'string' && (COMPANION_ROLES as readonly string[]).includes(value);
}

/**
 * Parse `entity.custom.companionAbilities` — a comma-separated string, the
 * only shape `EntityState.custom` (Record<string, ScalarValue>) can carry a
 * list in. All 5 starters that author recruitable NPCs already write this
 * (e.g. starter-fantasy's Brother Aldric: 'medical-support,witness-calming')
 * — content clearly prepared for this verb ahead of time. [] when absent,
 * empty, or not a string.
 */
function parseCompanionAbilities(value: unknown): string[] {
  if (typeof value !== 'string' || value.length === 0) return [];
  return value.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
}

/** Add the companion + companion:<role> tags. Idempotent. */
function addCompanionTags(entity: EntityState, role: CompanionRole): void {
  const roleTag = companionRoleTag(role);
  if (!entity.tags.includes(COMPANION_TAG)) entity.tags.push(COMPANION_TAG);
  if (!entity.tags.includes(roleTag)) entity.tags.push(roleTag);
}

/**
 * Mirror role + morale onto entity.custom. npc-agency.ts's deriveCompanionGoals
 * reads `entity.custom.companionRole`/`companionMorale` DIRECTLY — not the
 * `companion:<role>` tag — per its own comment ("read from custom field set
 * by product layer"). The 'companion' tag alone gates goal generation
 * (F-2fe4be26's outer check), but the protect-at-low-HP (fighter) and
 * abandon-at-low-morale sub-behaviors need the REAL role/morale here, not
 * deriveCompanionGoals' own `?? 'fighter'` / `?? 50` fallback defaults.
 * Called at recruit and on every morale change (companion-reactions wiring,
 * world-tick.ts) so this mirror never drifts from the party-state source of
 * truth (world.modules['companion-core']).
 */
export function syncCompanionCustomFields(entity: EntityState, role: CompanionRole, morale: number): void {
  entity.custom = { ...entity.custom, companionRole: role, companionMorale: morale };
}

/**
 * Strip the companion + companion:<role> tags — the symmetric un-write a
 * departure needs (F-b595731a's companion-reactions wiring calls this) so a
 * companion who leaves the party stops rendering green, stops listing as a
 * heal/buff target, and stops scoring ally bonuses in combat-AI and
 * interception. A companion who departs but keeps these tags would be its
 * own confusing regression.
 */
export function removeCompanionTags(entity: EntityState, role: CompanionRole): void {
  const roleTag = companionRoleTag(role);
  entity.tags = entity.tags.filter((t) => t !== COMPANION_TAG && t !== roleTag);
}

// ---------------------------------------------------------------------------
// Namespace accessors (F-834d0485) — world.modules['companion-core'], FLAT:
// PartyState's own { companions, maxSize, cohesion } fields at the namespace
// TOP, no `party:` wrapper. This is the shape director.test.ts:~270 and
// endgame.test.ts:~320 already construct and assert against (the CLOSED,
// passing read-side test suites) — the canonical shape was already decided
// by existing tests; this is the wiring that finally honors it. Mirrors
// economy-core.ts's getEconomyCoreState/setDistrictEconomy: non-attaching
// read (safe on a structuredClone'd director-mode world), tolerant writer
// (no-op when the namespace is absent — a pack that never wired
// companion-core has nothing to write into).
// ---------------------------------------------------------------------------

const COMPANION_MODULE_ID = 'companion-core';

/** Non-attaching read of this world's companion-core namespace (PartyState).
 *  Degrades to a fresh empty party when absent or malformed — a pack that
 *  never wired the module, or a hand-built WorldState in a test. */
export function getPartyState(world: WorldState): PartyState {
  const ns = world.modules[COMPANION_MODULE_ID];
  if (
    ns && typeof ns === 'object' && !Array.isArray(ns) &&
    Array.isArray((ns as PartyState).companions)
  ) {
    return ns as PartyState;
  }
  return createPartyState();
}

/** Persist the party back to world.modules['companion-core'], flat (F-834d0485). */
export function setPartyState(world: WorldState, party: PartyState): void {
  world.modules[COMPANION_MODULE_ID] = party;
}

// ---------------------------------------------------------------------------
// Ability-modifier mirror (F-66cd1cd0) — v2.8-shippable cut: hpRecoveryBonus
// only, delivered as a periodic 'heal' status via status-effects.ts's
// already-generic processPeriodicStatuses HoT engine (status-core ticks it
// every action.resolved) — zero combat-core/combat-recovery.ts changes, the
// same status-carries-the-number pattern equipment-core's stat mirror uses.
// `stacking: 'replace'` (not 'refresh'): a refresh leaves `data` untouched,
// so the magnitude must be recomputed fresh, not just the expiry extended.
//
// The other six AbilityModifiers fields (leverageCostDiscount,
// commerceGainBonus, rumorSpreadScale, rumorSuppressionChance,
// perceptionBonus, reputationBonus) have NO equivalent generic consumption
// layer to piggyback on today — player-leverage.ts's resolveSocialAction
// takes a hardcoded SOCIAL_REQUIREMENTS cost table with no external-modifier
// parameter, and district-mood.ts's own DistrictModifiers sit in the
// identical unwired gap. Deferred to a follow-up wave explicitly scoped to
// thread BOTH modifier bundles into their resolution functions together —
// named here so it isn't silently dropped.
// ---------------------------------------------------------------------------

/** Status id carrying the party's passive HP-recovery bonus. */
export const COMPANION_HP_RECOVERY_STATUS = 'companion-hp-recovery';

/** Ticks between periodic-heal pulses (status-core: one tick == one resolved action). */
export const COMPANION_HP_RECOVERY_PERIOD_TICKS = 3;

/**
 * Recompute the active party's ability modifiers and apply (mods.hpRecoveryBonus
 * > 0) or clear (0) the periodic HP-recovery status on `player`. Called
 * wherever active party composition changes: the recruit handler below, and
 * companion-reactions' departure wiring (world-tick.ts, F-b595731a). Returns
 * the status event to record, or null when there was nothing to remove and
 * nothing to apply (no active companion carries 'medical-support').
 */
export function refreshCompanionAbilityStatus(
  world: WorldState,
  party: PartyState,
  player: EntityState,
  tick: number,
): ResolvedEvent | null {
  const mods = computeAbilityModifiers(computePartyAbilities(party));
  if (mods.hpRecoveryBonus > 0) {
    return applyStatus(player, COMPANION_HP_RECOVERY_STATUS, tick, {
      stacking: 'replace',
      sourceId: 'companion-core',
      data: {
        periodicKind: 'heal',
        periodTicks: COMPANION_HP_RECOVERY_PERIOD_TICKS,
        amount: mods.hpRecoveryBonus,
        resource: 'hp',
      },
    }, world);
  }
  return removeStatus(player, COMPANION_HP_RECOVERY_STATUS, tick);
}

// ---------------------------------------------------------------------------
// The recruit verb (F-7d5c3e28) — the single missing link between this
// file's fully-authored party-state API and the fully-authored
// recruitable-NPC content vocabulary (5 of 10 starters already tag NPCs
// 'recruitable': fantasy, gladiator, ronin, vampire, cyberpunk). Mirrors
// equipment-core.ts's equipItem reject()-then-mutate shape: existence +
// same-zone gate, then isCompanionRecruitable (reject otherwise), then
// addCompanion — whose own AddCompanionResult.reason ('party-full' /
// 'already-present') maps directly onto the remaining rejections. On success
// this is also the ONE place the three dual-writes (party state, tags,
// faction) land together, so there is never a tick where a companion exists
// in one system but not another.
// ---------------------------------------------------------------------------

/** Shared faction string set on the player and every recruit (F-cf1ddc9f). */
const DEFAULT_PARTY_FACTION = 'party';

function reject(
  action: ActionIntent,
  reason: string,
  hint: string,
  extra?: Record<string, unknown>,
): ResolvedEvent[] {
  return [makeEvent(action, 'action.rejected', { verb: action.verb, reason, hint, ...extra })];
}

function recruitHandler(action: ActionIntent, world: WorldState): ResolvedEvent[] {
  const actor = world.entities[action.actorId];
  if (!actor) {
    return reject(action, 'actor not found', 'Only a live entity in the world can recruit.');
  }
  if ((actor.resources.hp ?? 0) <= 0) {
    return reject(action, 'actor is defeated', 'The defeated recruit no one.');
  }

  const targetId = action.targetIds?.[0];
  if (!targetId) {
    return reject(action, 'no target specified', 'recruit <name>');
  }
  const target = world.entities[targetId];
  if (!target) {
    return reject(action, `target ${targetId} not found`, 'recruit <name>');
  }
  if (actor.zoneId !== target.zoneId) {
    return reject(action, 'target not in same zone', 'Stand with them first.');
  }
  if (!isCompanionRecruitable(target)) {
    return reject(
      action,
      `${target.name} cannot be recruited`,
      "They aren't looking for a traveling companion.",
      { targetId: target.id },
    );
  }

  const tick = world.meta.tick;
  // Prefer AUTHORED content over derived defaults: all 5 starters that ship
  // recruitable NPCs already write custom.companionRole/companionAbilities/
  // personalGoal (content prepared ahead of this verb) — deriveCompanionRole
  // and DEFAULT_ROLE_ABILITY_TAG exist for content that hasn't authored
  // these fields yet, not to override content that has.
  const role = isCompanionRole(target.custom?.companionRole)
    ? target.custom.companionRole
    : deriveCompanionRole(target);
  const authoredAbilities = parseCompanionAbilities(target.custom?.companionAbilities);
  const abilityTags = authoredAbilities.length > 0 ? authoredAbilities : [DEFAULT_ROLE_ABILITY_TAG[role]];
  const personalGoal = typeof target.custom?.personalGoal === 'string' ? target.custom.personalGoal : undefined;

  const party = getPartyState(world);
  const companion: CompanionState = {
    npcId: target.id,
    role,
    joinedAtTick: tick,
    abilityTags,
    ...(personalGoal !== undefined ? { personalGoal } : {}),
    morale: 60,
    active: true,
  };

  const result = addCompanion(party, companion);
  if (!result.success) {
    const reason = result.reason === 'party-full'
      ? `party is full (${party.maxSize} companions)`
      : `${target.name} is already in your party`;
    const hint = result.reason === 'party-full'
      ? 'Dismiss a companion first.'
      : 'They are already traveling with you.';
    return reject(action, reason, hint, { targetId: target.id, partyReason: result.reason });
  }

  // (a) Party state — flat shape (F-834d0485).
  setPartyState(world, result.party);

  // (b) Entity tags (F-2fe4be26) — lights up finale/terminal-ui/menu/
  // npc-agency/combat-core consumers; none of them need touching.
  addCompanionTags(target, role);
  // npc-agency's own consumer reads role/morale from .custom, not the tag —
  // keep both mirrors in sync from the same recruit commit.
  syncCompanionCustomFields(target, role, companion.morale);

  // (c) Faction (F-cf1ddc9f) — idempotent on the player (first recruit only)
  // so targeting.ts's affiliationOf resolves the companion as an ALLY, not
  // the type-heuristic's default enemy (a recruit's `type` is always 'npc',
  // never 'player', so without a shared faction the heuristic would fail).
  const partyFaction = actor.faction ?? DEFAULT_PARTY_FACTION;
  actor.faction = partyFaction;
  target.faction = partyFaction;

  const events: ResolvedEvent[] = [];
  events.push(makeEvent(action, 'companion.recruited', {
    npcId: target.id,
    npcName: target.name,
    role,
    faction: partyFaction,
    partySize: result.party.companions.length,
    maxSize: result.party.maxSize,
  }, {
    targetIds: [target.id],
    tags: ['companion'],
    presentation: { channels: ['objective', 'narrator'], priority: 'high' },
  }));

  // Ability-modifier mirror (F-66cd1cd0) — recompute now the roster changed.
  const statusEvent = refreshCompanionAbilityStatus(world, result.party, actor, tick);
  if (statusEvent) events.push(statusEvent);

  return events;
}

/**
 * companion-core the EngineModule: registers the 'recruit' verb and the
 * 'companion-core' persistence namespace (flat PartyState default). Always
 * included in buildWorldStack (world-stack.ts) — same always-on contract
 * economy-core/trade-core have, so every starter gets recruit with zero
 * per-starter setup.ts edits.
 */
export function createCompanionCore(): EngineModule {
  return {
    id: 'companion-core',
    version: '1.0.0',

    register(ctx) {
      registerStatusDefinitions([{
        id: COMPANION_HP_RECOVERY_STATUS,
        name: 'Companion Care',
        tags: ['buff'],
        stacking: 'replace',
        duration: { type: 'permanent' },
        ui: { description: "A companion's steady care mends your wounds over time." },
      }]);

      ctx.actions.registerVerb('recruit', (action, world) => recruitHandler(action, world));
      ctx.persistence.registerNamespace(COMPANION_MODULE_ID, createPartyState());
    },
  };
}

export const companionCore: EngineModule = createCompanionCore();
