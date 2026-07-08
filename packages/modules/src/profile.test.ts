/**
 * Profile System Phase 1 — tests.
 *
 * Covers the honest first slice (design-lock section C, scope note):
 *  - buildProfile validates a good bundle and warns on a bad one
 *  - validateProfileSet catches a duplicate ability id across two profiles
 *  - selectActionForProfile returns a deterministic action for a profiled entity
 *
 * See docs/feature-architecture.md. This slice differentiates AI scoring +
 * packaging; per-entity *combat resolution* is the deferred CR-1 slice and is
 * NOT exercised here.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { EntityState, WorldState } from '@ai-rpg-engine/core';
import type { AbilityDefinition } from '@ai-rpg-engine/content-schema';
import { registerStatusDefinitions, clearStatusRegistry } from './status-semantics.js';
import {
  buildProfile,
  validateProfileSet,
  selectActionForProfile,
} from './profile.js';
import type { Profile, ProfileConfig } from './profile.js';

// ---------------------------------------------------------------------------
// Minimal world builder (pure advisory — no engine needed).
// Mirrors unified-decision.test.ts so selectBestAction has what it reads.
// ---------------------------------------------------------------------------

function makeWorld(entities: EntityState[], tick = 1): WorldState {
  const entityMap: Record<string, EntityState> = {};
  for (const e of entities) entityMap[e.id] = e;

  const entityCognition: Record<string, unknown> = {};
  for (const e of entities) {
    entityCognition[e.id] = {
      beliefs: [], memories: [], currentIntent: null,
      morale: 50, suspicion: 0,
    };
  }

  return {
    meta: { tick },
    locationId: 'arena',
    playerId: 'player',
    entities: entityMap,
    zones: {
      arena: {
        id: 'arena', roomId: 'arena', name: 'Arena',
        tags: ['combat'], neighbors: [],
      },
    },
    globals: {},
    modules: {
      'cognition-core': { entityCognition },
    },
  } as unknown as WorldState;
}

function makeBruiser(): EntityState {
  return {
    id: 'bruiser', blueprintId: 'bruiser', type: 'enemy', name: 'Bruiser',
    tags: ['beast'], stats: { grit: 9, edge: 5, nerve: 3, maxHp: 30 },
    resources: { hp: 30, maxHp: 30, stamina: 10, maxStamina: 10, mana: 20, maxMana: 20 },
    statuses: [], zoneId: 'arena',
  };
}

function makeDefender(): EntityState {
  return {
    id: 'defender', blueprintId: 'defender', type: 'player', name: 'Defender',
    tags: ['human'], stats: { grit: 5, edge: 5, nerve: 5 },
    resources: { hp: 30, maxHp: 30, stamina: 10, maxStamina: 10 },
    statuses: [], zoneId: 'arena',
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const cleave: AbilityDefinition = {
  id: 'cleave', name: 'Cleave', verb: 'use-ability',
  tags: ['combat', 'damage'],
  target: { type: 'all-enemies' },
  costs: [{ resourceId: 'stamina', amount: 4 }],
  cooldown: 3,
  effects: [{ type: 'damage', params: { amount: 8 } }],
};

const guardUp: AbilityDefinition = {
  id: 'guard-up', name: 'Guard Up', verb: 'use-ability',
  tags: ['support', 'buff'],
  target: { type: 'self' },
  costs: [{ resourceId: 'stamina', amount: 2 }],
  cooldown: 2,
  effects: [{ type: 'apply-status', params: { statusId: 'guarded', duration: 2 } }],
};

const hex: AbilityDefinition = {
  id: 'hex', name: 'Hex', verb: 'use-ability',
  tags: ['combat', 'debuff'],
  target: { type: 'single' },
  costs: [{ resourceId: 'mana', amount: 5 }],
  cooldown: 2,
  effects: [
    { type: 'damage', params: { amount: 3 } },
    { type: 'apply-status', params: { statusId: 'cursed', duration: 3 } },
  ],
};

/** A good might-axis warrior profile. */
function warriorConfig(): ProfileConfig {
  return {
    id: 'warrior',
    name: 'Warrior',
    statMapping: { attack: 'grit', precision: 'edge', resolve: 'nerve' },
    abilities: [cleave, guardUp],
    packBiases: [{ tag: 'beast', name: 'beast', modifiers: { attack: 10 } }],
    tags: ['role:brute', 'beast'],
  };
}

/** A good will-axis caster profile (distinct stat names + resource). */
function casterConfig(): ProfileConfig {
  return {
    id: 'caster',
    name: 'Caster',
    statMapping: { attack: 'focus', precision: 'edge', resolve: 'nerve' },
    abilities: [hex],
    tags: ['role:caster', 'caster'],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Profile System Phase 1', () => {
  beforeEach(() => {
    clearStatusRegistry();
    registerStatusDefinitions([
      { id: 'guarded', name: 'Guarded', tags: ['buff'], duration: 2 },
      { id: 'cursed', name: 'Cursed', tags: ['debuff'], duration: 3 },
    ]);
  });

  describe('buildProfile', () => {
    it('validates a good profile bundle with no warnings', () => {
      const { profile, warnings } = buildProfile(warriorConfig());

      expect(profile.id).toBe('warrior');
      expect(profile.name).toBe('Warrior');
      expect(profile.statMapping).toEqual({ attack: 'grit', precision: 'edge', resolve: 'nerve' });
      expect(profile.abilities).toHaveLength(2);
      expect(warnings).toEqual([]);
    });

    it('warns (warn-and-degrade) on a likely-mistake profile rather than throwing', () => {
      // Bad bundle: a duplicate ability id within the pack (validateAbilityPack error),
      // contradictory tags (bodyguard + role:backliner — validateEntityTags warn),
      // and an ability cost referencing a resource that is neither implicit nor
      // declared by the resourceProfile (validateAbilityPack error).
      const dupCleave: AbilityDefinition = { ...cleave };
      const ghostCost: AbilityDefinition = {
        id: 'ghost-strike', name: 'Ghost Strike', verb: 'use-ability',
        tags: ['combat', 'damage'],
        target: { type: 'single' },
        costs: [{ resourceId: 'ectoplasm', amount: 3 }], // unknown resource
        cooldown: 1,
        effects: [{ type: 'damage', params: { amount: 4 } }],
      };

      const { profile, warnings } = buildProfile({
        id: 'messy',
        name: 'Messy',
        statMapping: { attack: 'grit', precision: 'edge', resolve: 'nerve' },
        abilities: [cleave, dupCleave, ghostCost],
        tags: ['bodyguard', 'role:backliner'],
      });

      // It still returns a profile (warn-and-degrade, like buildCombatStack)
      expect(profile.id).toBe('messy');
      // ...but surfaces the problems instead of vanishing them
      expect(warnings.length).toBeGreaterThan(0);
      const joined = warnings.join('\n');
      expect(joined).toContain('cleave'); // duplicate ability id
      expect(joined).toContain('ectoplasm'); // unknown resource
      expect(joined.toLowerCase()).toContain('backliner'); // tag contradiction
    });

    it('treats declared resourceProfile resources as known (no false unknown-resource warning)', () => {
      // hex costs mana; declare mana via a resource profile so it is not flagged.
      const { warnings } = buildProfile({
        id: 'mage',
        name: 'Mage',
        statMapping: { attack: 'focus', precision: 'edge', resolve: 'nerve' },
        abilities: [hex],
        resourceProfile: {
          packId: 'mage',
          gains: [{ trigger: 'attack-hit', resourceId: 'mana', amount: 2 }],
          spends: [],
          drains: [],
          aiModifiers: [],
        },
        tags: ['caster'],
      });

      const joined = warnings.join('\n');
      expect(joined).not.toContain('mana');
    });
  });

  describe('validateProfileSet', () => {
    it('passes a clean set of distinct profiles', () => {
      const a = buildProfile(warriorConfig()).profile;
      const b = buildProfile(casterConfig()).profile;

      const result = validateProfileSet([a, b]);

      expect(result.ok).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('catches a duplicate ability id shared across two profiles', () => {
      const a = buildProfile(warriorConfig()).profile;
      // Second profile re-uses the 'cleave' ability id from the first.
      const sharedCleave: AbilityDefinition = { ...cleave, name: 'Cleave (copy)' };
      const b = buildProfile({
        id: 'duelist',
        name: 'Duelist',
        statMapping: { attack: 'grit', precision: 'edge', resolve: 'nerve' },
        abilities: [sharedCleave],
        tags: ['role:skirmisher'],
      }).profile;

      const result = validateProfileSet([a, b]);

      expect(result.ok).toBe(false);
      const joined = result.errors.map((e) => e.message).join('\n');
      expect(joined).toContain('cleave');
      // Names both owning profiles so the author can find the collision.
      expect(joined).toContain('warrior');
      expect(joined).toContain('duelist');
    });

    it('catches a stat-name semantic conflict (same name, different role) as an advisory', () => {
      // Profile A maps attack→grit; Profile B maps resolve→grit. The name 'grit'
      // means two different combat dimensions across the set — a likely mistake.
      const a = buildProfile(warriorConfig()).profile; // attack: grit
      const b = buildProfile({
        id: 'monk',
        name: 'Monk',
        statMapping: { attack: 'edge', precision: 'focus', resolve: 'grit' }, // resolve: grit
        abilities: [hex],
        tags: ['role:caster'],
      }).profile;

      const result = validateProfileSet([a, b]);

      const joined = result.advisories.map((adv) => adv.message).join('\n');
      expect(joined).toContain('grit');
    });

    it('flags contradictory pack biases for the same tag', () => {
      const a = buildProfile(warriorConfig()).profile; // beast: attack +10
      const b = buildProfile({
        id: 'coward-beast',
        name: 'Coward Beast',
        statMapping: { attack: 'grit', precision: 'edge', resolve: 'nerve' },
        abilities: [guardUp],
        packBiases: [{ tag: 'beast', name: 'beast', modifiers: { attack: -10 } }], // opposite sign
        tags: ['role:coward'],
      }).profile;

      const result = validateProfileSet([a, b]);

      const joined = [...result.errors, ...result.advisories].map((e) => e.message).join('\n');
      expect(joined).toContain('beast');
    });

    it('flags a DUPLICATE profile id as an ERROR (the masking hazard)', () => {
      // Two DIFFERENT profiles share the id 'warrior'. Registering both would key
      // WorldState.ruleProfiles['warrior'] twice — one silently overwrites the
      // other. This is the one true correctness hole the linter previously missed.
      const a = buildProfile(warriorConfig()).profile;          // id 'warrior'
      const bDup = { ...buildProfile(casterConfig()).profile, id: 'warrior' };

      const result = validateProfileSet([a, bDup]);

      expect(result.ok).toBe(false);
      const dupIdError = result.errors.find((e) => e.path.startsWith('ProfileSet.id.'));
      expect(dupIdError).toBeDefined();
      expect(dupIdError!.message).toContain('warrior');
      expect(dupIdError!.message.toLowerCase()).toContain('unique');
    });

    it('flags a name used as a STAT in one profile and a RESOURCE in another (advisory)', () => {
      // Profile A maps resolve→'focus'; Profile B declares 'focus' as a resource.
      const a = buildProfile({
        id: 'a', name: 'A',
        statMapping: { attack: 'grit', precision: 'edge', resolve: 'focus' },
        abilities: [],
      }).profile;
      const b = buildProfile({
        id: 'b', name: 'B',
        statMapping: { attack: 'might', precision: 'agility', resolve: 'nerve' },
        abilities: [],
        resourceProfile: {
          packId: 'b', gains: [], spends: [], drains: [], aiModifiers: [],
          resourceCaps: { focus: 20 },
        },
      }).profile;

      const result = validateProfileSet([a, b]);

      const adv = result.advisories.find((x) => x.path === 'ProfileSet.namespace.focus');
      expect(adv).toBeDefined();
      expect(adv!.message).toContain('focus');
    });

    it('flags an engagement tag that is backline in one profile and protector in another (advisory)', () => {
      const a = buildProfile({
        id: 'a', name: 'A',
        statMapping: { attack: 'grit', precision: 'edge', resolve: 'nerve' },
        abilities: [],
        engagement: { backlineTags: ['mystic'] },
      }).profile;
      const b = buildProfile({
        id: 'b', name: 'B',
        statMapping: { attack: 'might', precision: 'agility', resolve: 'will' },
        abilities: [],
        engagement: { protectorTags: ['mystic'] },
      }).profile;

      const result = validateProfileSet([a, b]);

      const adv = result.advisories.find((x) => x.path === 'ProfileSet.engagement.mystic');
      expect(adv).toBeDefined();
    });
  });

  describe('selectActionForProfile', () => {
    it('returns an action for a profiled entity driven by the profile mapping', () => {
      const { profile } = buildProfile(warriorConfig());
      const bruiser = makeBruiser();
      const defender = makeDefender();
      const world = makeWorld([bruiser, defender]);

      const decision = selectActionForProfile(bruiser.id, profile, world);

      expect(decision.entityId).toBe('bruiser');
      // A verb is always chosen (combat or ability)
      expect(typeof decision.chosen.verb).toBe('string');
      expect(decision.chosen.verb.length).toBeGreaterThan(0);
      // The profile's stat mapping reached the combat advisor: grit (=9) drives
      // an aggressive attack rather than the engine's default 'vigor' (absent here).
      expect(decision.combatDecision.entityId).toBe('bruiser');
    });

    it('is deterministic — same inputs produce byte-identical decisions', () => {
      const { profile } = buildProfile(warriorConfig());

      const d1 = selectActionForProfile(
        'bruiser', profile, makeWorld([makeBruiser(), makeDefender()]),
      );
      const d2 = selectActionForProfile(
        'bruiser', profile, makeWorld([makeBruiser(), makeDefender()]),
      );

      expect(JSON.stringify(d1)).toBe(JSON.stringify(d2));
    });

    it('honors the profile pack bias (beast attack bonus keeps combat dominant)', () => {
      const { profile } = buildProfile(warriorConfig());
      const bruiser = makeBruiser();
      const defender = makeDefender();
      const world = makeWorld([bruiser, defender]);

      const decision = selectActionForProfile(bruiser.id, profile, world);

      // beast bias (+10 attack) is wired through from the profile's packBiases.
      expect(decision.combatDecision.packBias).toBe('beast');
    });

    it('throws a structured error when the entity is not in the world', () => {
      const { profile } = buildProfile(warriorConfig());
      const world = makeWorld([makeDefender()]);

      expect(() => selectActionForProfile('ghost', profile, world)).toThrow(/ghost/);
    });

    it('passes the unified-decision threshold override through to selectBestAction', () => {
      const { profile } = buildProfile(warriorConfig());
      const bruiser = makeBruiser();
      const d1 = { ...makeDefender(), id: 'd1', zoneId: 'arena' as string };
      const d2 = { ...makeDefender(), id: 'd2', zoneId: 'arena' as string };
      const d3 = { ...makeDefender(), id: 'd3', zoneId: 'arena' as string };
      const world = makeWorld([bruiser, d1, d2, d3]);

      // With a very high threshold, the AoE cleave can never beat combat.
      const decision = selectActionForProfile(bruiser.id, profile, world, {
        abilityAdvantageThreshold: 1000,
      });

      expect(decision.chosen.source).toBe('combat');
    });
  });
});
