/**
 * Mixed-Party Composition Example — per-entity rule resolution (CR-1)
 *
 * Two playstyles — a brute fighter and a cunning mystic — coexisting in the
 * same fight, each resolving combat through its OWN stat mapping. Rule
 * profiles are plain data: `world.ruleProfiles` registers named mappings,
 * and each entity opts in by id via `ruleProfileId`. ONE formula set,
 * per-entity data — the fighter's damage derives from `might`, the mystic's
 * from `will`, in the same encounter.
 *
 * The wolf deliberately carries NO ruleProfileId: it resolves through the
 * world mapping passed to buildCombatStack, which is the back-compat path
 * every pre-profile game already uses. Older versions of this example said
 * the stat mapping "is shared (as it must be)" — that constraint is gone.
 *
 * Inspired by: Fantasy (simple combat), Ronin (dual protector roles)
 */

import { Engine } from '@ai-rpg-engine/core';
import type { GameManifest, EntityState, ZoneState, RuleProfile, EngineModule } from '@ai-rpg-engine/core';
import {
  traversalCore, statusCore, buildCombatStack,
  createSimulationInspector,
} from '@ai-rpg-engine/modules';

// --- The two playstyles, as data ---
// A RuleProfile maps the generic combat roles (attack / precision / resolve)
// to the stat names THIS archetype reads. Profiles are serialized with world
// state (never closures), so they survive save/load byte-identically.

/** Fighter: damage from `might`, accuracy from `agility`, defense from `grit`. */
export const FIGHTER_PROFILE: RuleProfile = {
  statMapping: { attack: 'might', precision: 'agility', resolve: 'grit' },
};

/** Mystic: damage from `will`, accuracy from `focus`, defense from `grit`. */
export const MYSTIC_PROFILE: RuleProfile = {
  statMapping: { attack: 'will', precision: 'focus', resolve: 'grit' },
};

/** The registry installed on `world.ruleProfiles` — profile id → profile. */
export const RULE_PROFILES: Record<string, RuleProfile> = {
  fighter: FIGHTER_PROFILE,
  mystic: MYSTIC_PROFILE,
};

/**
 * Module set for this game. Exported separately because save/load needs it:
 * `Engine.deserialize` restores state only — code (modules) is re-supplied
 * by the caller, so a loader calls this again and passes the result in.
 */
export function createMixedPartyModules(): EngineModule[] {
  // The stack's statMapping is the WORLD mapping — the fallback every entity
  // without a ruleProfileId (here: the wolf) resolves through.
  const combat = buildCombatStack({
    statMapping: { attack: 'vigor', precision: 'instinct', resolve: 'will' },
    playerId: 'fighter',
  });
  return [
    traversalCore,
    statusCore,
    ...combat.modules,
    createSimulationInspector(),
  ];
}

export function createMixedPartyGame(seed = 42): Engine {
  const manifest: GameManifest = {
    id: 'mixed-party',
    title: 'Mixed Party',
    version: '1.0.0',
    engineVersion: '1.0.0',
    ruleset: 'mixed-party',
    modules: ['traversal-core', 'status-core', 'combat-core'],
    contentPacks: ['mixed-party'],
  };

  const engine = new Engine({ manifest, seed, modules: createMixedPartyModules() });

  // --- Entities ---
  // All three share zoneId 'ruined-hall' and carry stamina so combat
  // resolves rather than being rejected for zone/stamina reasons.

  // The fighter reads FIGHTER_PROFILE: attack → might (9). It has no `vigor`
  // stat, so under the old shared-mapping rules it would have dealt the
  // fallback 3 — per-entity resolution is what makes this statline work.
  const fighter: EntityState = {
    id: 'fighter',
    blueprintId: 'fighter',
    type: 'player',
    name: 'Iron Valk',
    tags: ['human', 'bodyguard'],
    faction: 'party',
    ruleProfileId: 'fighter',
    stats: { might: 9, agility: 4, grit: 6 },
    resources: { hp: 35, maxHp: 35, stamina: 5 },
    zoneId: 'ruined-hall',
    statuses: [],
  };

  // The mystic reads MYSTIC_PROFILE: attack → will (7). Note the stat NAME
  // `will` means "the mystic's damage stat" here, while the same name is the
  // wolf's resolve stat under the world mapping — names are per-entity now.
  const mystic: EntityState = {
    id: 'mystic',
    blueprintId: 'mystic',
    type: 'ally',
    name: 'Sera of the Veil',
    tags: ['human', 'caster', 'companion:scholar'],
    faction: 'party',
    ruleProfileId: 'mystic',
    stats: { will: 7, focus: 6, grit: 3 },
    resources: { hp: 18, maxHp: 18, stamina: 5 },
    zoneId: 'ruined-hall',
    statuses: [],
  };

  // The wolf has NO ruleProfileId — it resolves through the world mapping
  // (attack → vigor, 5). Entities that never heard of profiles behave
  // exactly as they always did.
  const wolf: EntityState = {
    id: 'wolf',
    blueprintId: 'dire-wolf',
    type: 'enemy',
    name: 'Dire Wolf',
    tags: ['beast'],
    faction: 'monsters',
    stats: { vigor: 5, instinct: 6, will: 3 },
    resources: { hp: 20, maxHp: 20, stamina: 5 },
    zoneId: 'ruined-hall',
    statuses: [],
  };

  const hall: ZoneState = {
    id: 'ruined-hall',
    roomId: 'ruined-hall',
    name: 'Ruined Hall',
    tags: ['indoor'],
    neighbors: [],
  };

  engine.store.addZone(hall);
  engine.store.addEntity(fighter);
  engine.store.addEntity(mystic);
  engine.store.addEntity(wolf);
  engine.store.state.playerId = 'fighter';
  engine.store.setPlayerLocation('ruined-hall');

  // The whole wiring for mixed playstyles is this one line: register the
  // profiles as data. Each entity's `ruleProfileId` does the rest.
  engine.store.state.ruleProfiles = { ...RULE_PROFILES };

  return engine;
}

// Fighter and mystic strike the wolf — same formula set, different mappings:
// the fighter's damage derives from might (9), the mystic's from will (7),
// and the wolf answers through the world mapping's vigor (5).
const engine = createMixedPartyGame();
const fighterEvents = engine.submitActionAs('fighter', 'attack', { targetIds: ['wolf'] });
const mysticEvents = engine.submitActionAs('mystic', 'attack', { targetIds: ['wolf'] });
void fighterEvents; // e.g. find 'combat.damage.applied' — payload.damage === 9
void mysticEvents;  // e.g. find 'combat.damage.applied' — payload.damage === 7
