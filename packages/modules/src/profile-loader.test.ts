/**
 * Profile Loader — tests for applyProfile (Profile System Phase 2).
 *
 * Proves the wire that Phase 1 was missing:
 *  - Part A: a profile's stat mapping registers as a RuleProfile and the entity
 *    points at it, so CR-1 per-entity resolution kicks in — a `might` fighter and
 *    a `focus` mystic read their OWN attack stat in ONE world (the design-lock
 *    regression). Resource pools go live on the entity.
 *  - Part B: a profile's ability, unknown to the construction-frozen base pack,
 *    RESOLVES through `use-ability` once applied.
 *  - Determinism / idempotency / structured error / serialization round-trip.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { EntityState, WorldState, ActionIntent } from '@ai-rpg-engine/core';
import { createTestEngine, WorldStore } from '@ai-rpg-engine/core';
import type { AbilityDefinition } from '@ai-rpg-engine/content-schema';
import { applyProfile } from './profile-loader.js';
import { buildProfile } from './profile.js';
import type { Profile } from './profile.js';
import { resolveEntityMapping, DEFAULT_STAT_MAPPING } from './combat-core.js';
import { createAbilityCore } from './ability-core.js';
import { statusCore } from './status-core.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const zones = [
  { id: 'arena', roomId: 'arena', name: 'Arena', tags: [] as string[], neighbors: [] as string[] },
];

/** A self-targeted, effect-free ability — resolves to `ability.used` with only a
 *  stamina cost, so it needs no target, status registry, or effects module. */
const flourish: AbilityDefinition = {
  id: 'flourish',
  name: 'Flourish',
  verb: 'use-ability',
  tags: ['combat'],
  target: { type: 'self' },
  costs: [{ resourceId: 'stamina', amount: 1 }],
  cooldown: 0,
  effects: [],
};

function makeEntity(id: string, type = 'fighter'): EntityState {
  return {
    id, blueprintId: id, type, name: id,
    tags: [],
    stats: { might: 8, focus: 7, agility: 6, edge: 5, nerve: 4, showmanship: 3 },
    resources: { hp: 20, maxHp: 20, stamina: 10, maxStamina: 10 },
    statuses: [], zoneId: 'arena',
  };
}

/** A minimal WorldState for unit-level (no-engine) Part A assertions. */
function makeMinimalWorld(entities: EntityState[]): WorldState {
  const map: Record<string, EntityState> = {};
  for (const e of entities) map[e.id] = e;
  return {
    meta: { tick: 0 },
    playerId: entities[0]?.id ?? 'player',
    locationId: 'arena',
    entities: map,
    zones: {}, quests: {}, factions: {}, globals: {}, modules: {},
    eventLog: [], pending: [],
  } as unknown as WorldState;
}

/** A might-axis fighter profile (no abilities, no resources). */
function mightProfile(): Profile {
  return buildProfile({
    id: 'brute', name: 'Brute',
    statMapping: { attack: 'might', precision: 'agility', resolve: 'showmanship' },
    abilities: [],
  }).profile;
}

/** A focus-axis mystic profile with a resource economy. */
function focusProfile(): Profile {
  return buildProfile({
    id: 'mystic', name: 'Mystic',
    statMapping: { attack: 'focus', precision: 'edge', resolve: 'nerve' },
    abilities: [],
    resourceProfile: {
      packId: 'mystic',
      gains: [{ trigger: 'attack-hit', resourceId: 'mana', amount: 2 }],
      spends: [],
      drains: [],
      aiModifiers: [],
      resourceCaps: { mana: 30 },
    },
  }).profile;
}

function useFlourish(actorId: string): ActionIntent {
  return {
    id: `act-${actorId}-flourish`,
    actorId,
    verb: 'use-ability',
    parameters: { abilityId: 'flourish' },
    source: 'player',
    issuedAtTick: 1,
  };
}

// ---------------------------------------------------------------------------
// Part A — rule-profile registration + resource pools
// ---------------------------------------------------------------------------

describe('applyProfile — Part A (rule profile + resources)', () => {
  it('registers the stat mapping as a RuleProfile and points the entity at it', () => {
    const hero = makeEntity('hero');
    const world = makeMinimalWorld([hero]);

    applyProfile(world, 'hero', focusProfile());

    expect(world.ruleProfiles?.['mystic']).toEqual({
      statMapping: { attack: 'focus', precision: 'edge', resolve: 'nerve' },
    });
    expect(hero.ruleProfileId).toBe('mystic');
  });

  it('makes the profile resource pools live on the entity (initialized to 0)', () => {
    const hero = makeEntity('hero');
    const world = makeMinimalWorld([hero]);

    expect(hero.resources.mana).toBeUndefined();
    applyProfile(world, 'hero', focusProfile());
    expect(hero.resources.mana).toBe(0);
  });

  it('never clobbers an existing resource value (idempotent resource init)', () => {
    const hero = makeEntity('hero');
    hero.resources.mana = 15;
    const world = makeMinimalWorld([hero]);

    applyProfile(world, 'hero', focusProfile());
    expect(hero.resources.mana).toBe(15);
  });

  it('CR-1 resolution: a might fighter and a focus mystic read their OWN attack stat in one world', () => {
    const fighter = makeEntity('fighter');
    const mystic = makeEntity('mystic-e');
    const world = makeMinimalWorld([fighter, mystic]);

    applyProfile(world, 'fighter', mightProfile());
    applyProfile(world, 'mystic-e', focusProfile());

    // Fallback is the world/DEFAULT mapping; each entity overrides with its own.
    expect(resolveEntityMapping(fighter, world, DEFAULT_STAT_MAPPING).attack).toBe('might');
    expect(resolveEntityMapping(mystic, world, DEFAULT_STAT_MAPPING).attack).toBe('focus');
  });

  it('an unprofiled entity still resolves to the fallback (additive, no regression)', () => {
    const plain = makeEntity('plain');
    const world = makeMinimalWorld([plain]);
    expect(resolveEntityMapping(plain, world, DEFAULT_STAT_MAPPING)).toEqual(DEFAULT_STAT_MAPPING);
  });

  it('throws a structured error when the entity is not in the world', () => {
    const world = makeMinimalWorld([makeEntity('hero')]);
    expect(() => applyProfile(world, 'ghost', mightProfile())).toThrow(/ghost/);
  });

  it('is idempotent — applying the same profile twice yields byte-identical state', () => {
    const hero = makeEntity('hero');
    const world = makeMinimalWorld([hero]);

    applyProfile(world, 'hero', focusProfile());
    const snap1 = JSON.stringify(world);
    applyProfile(world, 'hero', focusProfile());
    const snap2 = JSON.stringify(world);

    expect(snap2).toBe(snap1);
  });
});

// ---------------------------------------------------------------------------
// Part B — ability registration (the profile's ability actually resolves)
// ---------------------------------------------------------------------------

describe('applyProfile — Part B (ability resolution)', () => {
  it('a profile ability unknown to the base pack resolves through use-ability after applyProfile', () => {
    const profile = buildProfile({
      id: 'showman', name: 'Showman',
      statMapping: { attack: 'might', precision: 'agility', resolve: 'showmanship' },
      abilities: [flourish],
    }).profile;

    const engine = createTestEngine({
      modules: [statusCore, createAbilityCore({ abilities: [] })], // EMPTY base pack
      entities: [makeEntity('hero')],
      zones,
    });

    // Before: the base pack has no 'flourish' → rejected as not found.
    const before = engine.processAction(useFlourish('hero'));
    expect(before[0].type).toBe('action.rejected');
    expect(String(before[0].payload.reason)).toContain('not found');

    applyProfile(engine.store.state, 'hero', profile);

    // After: the profile-registered ability resolves and fires ability.used.
    const after = engine.processAction(useFlourish('hero'));
    const used = after.find((e) => e.type === 'ability.used');
    expect(used).toBeDefined();
    expect(used!.payload.abilityId).toBe('flourish');
  });

  it('base-pack abilities still win over a colliding profile id (shadowing)', () => {
    // Base pack defines 'flourish' with a stamina cost of 1; profile re-declares
    // it with a cost of 9. The base definition must win (checked first).
    const profileFlourish: AbilityDefinition = { ...flourish, costs: [{ resourceId: 'stamina', amount: 9 }] };
    const profile = buildProfile({
      id: 'showman', name: 'Showman',
      statMapping: { attack: 'might', precision: 'agility', resolve: 'showmanship' },
      abilities: [profileFlourish],
    }).profile;

    const engine = createTestEngine({
      modules: [statusCore, createAbilityCore({ abilities: [flourish] })], // base cost 1
      entities: [makeEntity('hero')],
      zones,
    });
    applyProfile(engine.store.state, 'hero', profile);

    const events = engine.processAction(useFlourish('hero'));
    const resourceEvt = events.find((e) => e.type === 'resource.changed' && e.payload.resource === 'stamina');
    // Base cost (1) applied, not the profile's shadowed cost (9).
    expect(resourceEvt!.payload.delta).toBe(-1);
  });

  it('registering an empty ability pack leaves the module state byte-identical (no `registered` key)', () => {
    const engine = createTestEngine({
      modules: [statusCore, createAbilityCore({ abilities: [] })],
      entities: [makeEntity('hero')],
      zones,
    });
    const before = JSON.stringify(engine.store.state.modules['ability-core']);
    applyProfile(engine.store.state, 'hero', mightProfile()); // no abilities
    const after = JSON.stringify(engine.store.state.modules['ability-core']);
    expect(after).toBe(before);
  });

  it('is deterministic — two engines applying the same profile serialize byte-identically', () => {
    const profile = buildProfile({
      id: 'showman', name: 'Showman',
      statMapping: { attack: 'might', precision: 'agility', resolve: 'showmanship' },
      abilities: [flourish],
    }).profile;

    const build = () => {
      const engine = createTestEngine({
        modules: [statusCore, createAbilityCore({ abilities: [] })],
        entities: [makeEntity('hero')],
        zones,
        seed: 7,
      });
      applyProfile(engine.store.state, 'hero', profile);
      engine.processAction(useFlourish('hero'));
      return engine.store.serialize();
    };

    expect(build()).toBe(build());
  });
});

// ---------------------------------------------------------------------------
// Serialization round-trip (data, not closures)
// ---------------------------------------------------------------------------

describe('applyProfile — serialization round-trip', () => {
  it('ruleProfiles, ruleProfileId, resources, and registered abilities survive save/load byte-identically', () => {
    const profile = buildProfile({
      id: 'showman', name: 'Showman',
      statMapping: { attack: 'might', precision: 'agility', resolve: 'showmanship' },
      abilities: [flourish],
      resourceProfile: {
        packId: 'showman',
        gains: [], spends: [], drains: [], aiModifiers: [],
        resourceCaps: { 'crowd-favor': 50 },
      },
    }).profile;

    const engine = createTestEngine({
      modules: [statusCore, createAbilityCore({ abilities: [] })],
      entities: [makeEntity('hero')],
      zones,
    });
    applyProfile(engine.store.state, 'hero', profile);

    const saved = engine.store.serialize();
    const reloaded = WorldStore.deserialize(saved);

    // State survived.
    expect(reloaded.state.ruleProfiles?.['showman']).toEqual({
      statMapping: { attack: 'might', precision: 'agility', resolve: 'showmanship' },
    });
    expect(reloaded.state.entities['hero'].ruleProfileId).toBe('showman');
    expect(reloaded.state.entities['hero'].resources['crowd-favor']).toBe(0);
    const abilityState = reloaded.state.modules['ability-core'] as { registered?: Record<string, unknown> };
    expect(abilityState.registered?.['flourish']).toBeDefined();

    // Byte-identical re-serialize (the engine's determinism contract).
    expect(reloaded.serialize()).toBe(saved);
  });
});
