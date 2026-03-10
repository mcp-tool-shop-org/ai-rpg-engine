// Ability builders tests — convenience constructors and suite validation

import { describe, it, expect } from 'vitest';
import {
  buildDamageAbility,
  buildHealAbility,
  buildStatusAbility,
  buildCleanseAbility,
  buildAbilitySuite,
} from './ability-builders.js';
import { validateAbilityPack, type AbilityPackRuleset } from '@ai-rpg-engine/content-schema';

const testRuleset: AbilityPackRuleset = {
  stats: [{ id: 'might' }, { id: 'agility' }, { id: 'will' }],
  resources: [{ id: 'mana' }, { id: 'rage' }],
};

describe('buildDamageAbility', () => {
  it('produces a valid single-target damage ability', () => {
    const ab = buildDamageAbility({
      id: 'test-slash',
      name: 'Test Slash',
      damage: 5,
      damageType: 'melee',
      stat: 'might',
      difficulty: 6,
      costs: [{ resourceId: 'stamina', amount: 2 }],
      cooldown: 2,
    });
    expect(ab.id).toBe('test-slash');
    expect(ab.verb).toBe('use-ability');
    expect(ab.target.type).toBe('single');
    expect(ab.effects[0].type).toBe('damage');
    expect(ab.effects[0].params.amount).toBe(5);
    expect(ab.cooldown).toBe(2);

    const r = validateAbilityPack([ab], testRuleset);
    expect(r.ok).toBe(true);
  });

  it('accepts custom tags and requirements', () => {
    const ab = buildDamageAbility({
      id: 'hero-strike',
      name: 'Hero Strike',
      damage: 8,
      damageType: 'holy',
      stat: 'will',
      difficulty: 8,
      costs: [{ resourceId: 'mana', amount: 5 }],
      cooldown: 3,
      tags: ['holy', 'combat', 'signature'],
      requirements: [{ type: 'has-tag', params: { tag: 'paladin' } }],
    });
    expect(ab.tags).toEqual(['holy', 'combat', 'signature']);
    expect(ab.requirements?.[0].params.tag).toBe('paladin');
  });
});

describe('buildHealAbility', () => {
  it('produces a valid self-target heal ability', () => {
    const ab = buildHealAbility({
      id: 'test-heal',
      name: 'Test Heal',
      healAmount: 8,
      costs: [{ resourceId: 'mana', amount: 4 }],
      cooldown: 3,
    });
    expect(ab.target.type).toBe('self');
    expect(ab.effects[0].type).toBe('heal');
    expect(ab.effects[0].params.amount).toBe(8);
    expect(ab.effects[0].params.resource).toBe('hp');

    const r = validateAbilityPack([ab], testRuleset);
    expect(r.ok).toBe(true);
  });

  it('supports custom resource healing', () => {
    const ab = buildHealAbility({
      id: 'restore-mana',
      name: 'Restore Mana',
      healAmount: 10,
      resource: 'mana',
      costs: [{ resourceId: 'stamina', amount: 2 }],
      cooldown: 4,
    });
    expect(ab.effects[0].params.resource).toBe('mana');
  });
});

describe('buildStatusAbility', () => {
  it('produces a valid single-target status ability', () => {
    const ab = buildStatusAbility({
      id: 'test-curse',
      name: 'Test Curse',
      statusId: 'cursed',
      duration: 3,
      costs: [{ resourceId: 'mana', amount: 3 }],
      cooldown: 4,
    });
    expect(ab.target.type).toBe('single');
    expect(ab.effects[0].type).toBe('apply-status');
    expect(ab.effects[0].params.statusId).toBe('cursed');

    const r = validateAbilityPack([ab], testRuleset);
    expect(r.ok).toBe(true);
  });

  it('supports AoE target and stat modification', () => {
    const ab = buildStatusAbility({
      id: 'mass-weaken',
      name: 'Mass Weaken',
      statusId: 'weakened',
      duration: 2,
      costs: [{ resourceId: 'mana', amount: 5 }],
      cooldown: 4,
      target: 'all-enemies',
      statModify: { stat: 'might', amount: -2 },
    });
    expect(ab.target.type).toBe('all-enemies');
    expect(ab.effects.length).toBe(2);
    expect(ab.effects[1].type).toBe('stat-modify');
  });
});

describe('buildCleanseAbility', () => {
  it('produces a valid self-target cleanse ability', () => {
    const ab = buildCleanseAbility({
      id: 'test-purify',
      name: 'Test Purify',
      cleanseTags: ['poison', 'blind'],
      costs: [{ resourceId: 'mana', amount: 2 }],
      cooldown: 3,
    });
    expect(ab.target.type).toBe('self');
    expect(ab.effects[0].type).toBe('remove-status-by-tag');
    expect(ab.effects[0].params.tags).toBe('poison,blind');

    const r = validateAbilityPack([ab], testRuleset);
    expect(r.ok).toBe(true);
  });
});

describe('buildAbilitySuite', () => {
  it('validates, summarizes, and audits in one call', () => {
    const abilities = [
      buildDamageAbility({
        id: 'slash', name: 'Slash', damage: 5, damageType: 'melee',
        stat: 'might', difficulty: 6,
        costs: [{ resourceId: 'stamina', amount: 2 }], cooldown: 2,
      }),
      buildHealAbility({
        id: 'heal', name: 'Heal', healAmount: 6,
        costs: [{ resourceId: 'mana', amount: 3 }], cooldown: 3,
      }),
      buildCleanseAbility({
        id: 'purify', name: 'Purify', cleanseTags: ['poison'],
        costs: [{ resourceId: 'mana', amount: 2 }], cooldown: 3,
      }),
    ];
    const result = buildAbilitySuite('test', abilities, testRuleset);

    expect(result.validation.ok).toBe(true);
    expect(result.summary.abilityCount).toBe(3);
    expect(result.summary.cleanseTagsCovered).toEqual(['poison']);
    expect(result.audit.totalAbilities).toBe(3);
  });

  it('catches validation errors through the suite', () => {
    const abilities = [
      buildDamageAbility({
        id: 'bad-slash', name: 'Bad Slash', damage: 5, damageType: 'melee',
        stat: 'charisma', difficulty: 6,
        costs: [{ resourceId: 'stamina', amount: 2 }], cooldown: 2,
      }),
    ];
    const result = buildAbilitySuite('test', abilities, testRuleset);
    expect(result.validation.ok).toBe(false);
    expect(result.validation.errors.some(e => e.message.includes('charisma'))).toBe(true);
  });
});
