// Ability pack cross-validation tests
// Proves: cost→resource refs, check→stat refs, effect→stat/resource refs, duplicate IDs, all 10 packs pass

import { describe, it, expect } from 'vitest';
import { validateAbilityPack, type AbilityPackRuleset } from './validate.js';

// Real packs + rulesets from all 10 wired starters
import { fantasyAbilities } from '../../starter-fantasy/src/content.js';
import { fantasyMinimalRuleset } from '../../starter-fantasy/src/ruleset.js';
import { cyberpunkAbilities } from '../../starter-cyberpunk/src/content.js';
import { cyberpunkMinimalRuleset } from '../../starter-cyberpunk/src/ruleset.js';
import { weirdWestAbilities } from '../../starter-weird-west/src/content.js';
import { weirdWestMinimalRuleset } from '../../starter-weird-west/src/ruleset.js';
import { vampireAbilities } from '../../starter-vampire/src/content.js';
import { vampireMinimalRuleset } from '../../starter-vampire/src/ruleset.js';
import { gladiatorAbilities } from '../../starter-gladiator/src/content.js';
import { gladiatorMinimalRuleset } from '../../starter-gladiator/src/ruleset.js';
import { roninAbilities } from '../../starter-ronin/src/content.js';
import { roninMinimalRuleset } from '../../starter-ronin/src/ruleset.js';
import { pirateAbilities } from '../../starter-pirate/src/content.js';
import { pirateMinimalRuleset } from '../../starter-pirate/src/ruleset.js';
import { detectiveAbilities } from '../../starter-detective/src/content.js';
import { detectiveMinimalRuleset } from '../../starter-detective/src/ruleset.js';
import { zombieAbilities } from '../../starter-zombie/src/content.js';
import { zombieMinimalRuleset } from '../../starter-zombie/src/ruleset.js';
import { colonyAbilities } from '../../starter-colony/src/content.js';
import { colonyMinimalRuleset } from '../../starter-colony/src/ruleset.js';

// Minimal ruleset for unit tests
const testRuleset: AbilityPackRuleset = {
  stats: [{ id: 'might' }, { id: 'agility' }, { id: 'will' }],
  resources: [{ id: 'mana' }, { id: 'rage' }],
};

const validAbility = {
  id: 'slash',
  name: 'Slash',
  verb: 'use-ability',
  tags: ['combat'],
  costs: [{ resourceId: 'stamina', amount: 2 }],
  target: { type: 'single' as const },
  checks: [{ stat: 'might', difficulty: 6 }],
  effects: [{ type: 'damage', target: 'target', params: { amount: 5 } }],
  cooldown: 2,
};

describe('validateAbilityPack — unit', () => {
  it('accepts a valid pack', () => {
    const r = validateAbilityPack([validAbility], testRuleset);
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('catches unknown resource in costs', () => {
    const bad = {
      ...validAbility,
      id: 'bad-cost',
      costs: [{ resourceId: 'pixie-dust', amount: 3 }],
    };
    const r = validateAbilityPack([bad], testRuleset);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes('pixie-dust'))).toBe(true);
    expect(r.errors.some((e) => e.message.includes('unknown resource'))).toBe(true);
  });

  it('allows implicit hp and stamina resources', () => {
    const hpCost = {
      ...validAbility,
      id: 'life-tap',
      costs: [{ resourceId: 'hp', amount: 5 }],
    };
    const staminaCost = {
      ...validAbility,
      id: 'sprint',
      costs: [{ resourceId: 'stamina', amount: 3 }],
    };
    const r = validateAbilityPack([hpCost, staminaCost], testRuleset);
    expect(r.ok).toBe(true);
  });

  it('catches unknown stat in checks', () => {
    const bad = {
      ...validAbility,
      id: 'bad-check',
      checks: [{ stat: 'telepathy', difficulty: 8 }],
    };
    const r = validateAbilityPack([bad], testRuleset);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes('telepathy'))).toBe(true);
    expect(r.errors.some((e) => e.message.includes('unknown stat'))).toBe(true);
  });

  it('catches unknown stat in stat-modify effects', () => {
    const bad = {
      ...validAbility,
      id: 'bad-stat-effect',
      effects: [{ type: 'stat-modify', target: 'actor', params: { stat: 'charisma', amount: 2 } }],
    };
    const r = validateAbilityPack([bad], testRuleset);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes('charisma'))).toBe(true);
    expect(r.errors.some((e) => e.message.includes('stat-modify'))).toBe(true);
  });

  it('catches unknown resource in resource-modify effects', () => {
    const bad = {
      ...validAbility,
      id: 'bad-resource-effect',
      effects: [{ type: 'resource-modify', target: 'actor', params: { resource: 'gold', amount: 10 } }],
    };
    const r = validateAbilityPack([bad], testRuleset);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes('gold'))).toBe(true);
    expect(r.errors.some((e) => e.message.includes('resource-modify'))).toBe(true);
  });

  it('catches duplicate ability IDs', () => {
    const dupe = { ...validAbility };
    const r = validateAbilityPack([validAbility, dupe], testRuleset);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes('duplicate ability id'))).toBe(true);
  });

  it('passes structural errors through', () => {
    // Missing effects = structural failure
    const broken = { id: 'x', name: 'X', verb: 'y', tags: [], target: { type: 'self' } };
    const r = validateAbilityPack([broken as any], testRuleset);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.path.includes('effects'))).toBe(true);
  });
});

describe('validateAbilityPack — advisories', () => {
  it('flags zero-cost-zero-cooldown abilities', () => {
    const freebee = {
      ...validAbility,
      id: 'free-hit',
      costs: [],
      cooldown: 0,
    };
    const r = validateAbilityPack([freebee], testRuleset);
    expect(r.advisories.some((a) => a.message.includes('zero cost and zero cooldown'))).toBe(true);
  });

  it('flags overbroad cleanse (>3 tags)', () => {
    const broadCleanse = {
      ...validAbility,
      id: 'purge-all',
      effects: [{ type: 'remove-status-by-tag', target: 'actor', params: { tags: 'fear,control,blind,poison' } }],
    };
    const r = validateAbilityPack([broadCleanse], testRuleset);
    expect(r.advisories.some((a) => a.message.includes('overbroad'))).toBe(true);
  });

  it('flags excessive-duplicate-semantics (>50% apply same status)', () => {
    const ab1 = { ...validAbility, id: 'a1', effects: [{ type: 'apply-status', target: 'target', params: { statusId: 'burn', duration: 2 } }] };
    const ab2 = { ...validAbility, id: 'a2', effects: [{ type: 'apply-status', target: 'target', params: { statusId: 'burn', duration: 3 } }] };
    const ab3 = { ...validAbility, id: 'a3', effects: [{ type: 'damage', target: 'target', params: { amount: 3 } }] };
    const r = validateAbilityPack([ab1, ab2, ab3], testRuleset);
    expect(r.advisories.some((a) => a.message.includes('duplicate semantics'))).toBe(true);
  });

  it('returns empty advisories for well-designed packs', () => {
    const r = validateAbilityPack([validAbility], testRuleset);
    expect(r.advisories).toHaveLength(0);
  });
});

describe('validateAbilityPack — all 10 shipped packs', () => {
  const packs = [
    { name: 'Fantasy', abilities: fantasyAbilities, ruleset: fantasyMinimalRuleset },
    { name: 'Cyberpunk', abilities: cyberpunkAbilities, ruleset: cyberpunkMinimalRuleset },
    { name: 'Weird-West', abilities: weirdWestAbilities, ruleset: weirdWestMinimalRuleset },
    { name: 'Vampire', abilities: vampireAbilities, ruleset: vampireMinimalRuleset },
    { name: 'Gladiator', abilities: gladiatorAbilities, ruleset: gladiatorMinimalRuleset },
    { name: 'Ronin', abilities: roninAbilities, ruleset: roninMinimalRuleset },
    { name: 'Pirate', abilities: pirateAbilities, ruleset: pirateMinimalRuleset },
    { name: 'Detective', abilities: detectiveAbilities, ruleset: detectiveMinimalRuleset },
    { name: 'Zombie', abilities: zombieAbilities, ruleset: zombieMinimalRuleset },
    { name: 'Colony', abilities: colonyAbilities, ruleset: colonyMinimalRuleset },
  ];

  for (const { name, abilities, ruleset } of packs) {
    it(`${name} pack passes cross-validation against its ruleset`, () => {
      const r = validateAbilityPack(abilities, ruleset);
      if (!r.ok) {
        // Show errors in test output for debugging
        const msgs = r.errors.map((e) => `${e.path}: ${e.message}`).join('\n');
        expect.fail(`${name} pack validation failed:\n${msgs}`);
      }
      expect(r.ok).toBe(true);
    });
  }
});
