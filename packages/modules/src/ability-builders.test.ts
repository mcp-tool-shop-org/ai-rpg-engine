// Ability builders tests — convenience constructors and suite validation

import { describe, it, expect } from 'vitest';
import {
  buildDamageAbility,
  buildHealAbility,
  buildStatusAbility,
  buildCleanseAbility,
  buildBuffAbility,
  buildReviveAbility,
  buildAbilitySuite,
} from './ability-builders.js';
import { validateAbilityPack, normalizeTargetSpec, type AbilityPackRuleset } from '@ai-rpg-engine/content-schema';

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

  it('can target a single ally (party-JRPG heal) without breaking back-compat', () => {
    const ab = buildHealAbility({
      id: 'mend',
      name: 'Mend',
      healAmount: 8,
      affiliation: 'ally',
      costs: [{ resourceId: 'mana', amount: 4 }],
      cooldown: 2,
    });
    // Single-target ally heal: routed through the normal single-target path so the
    // effect lands on the chosen target.
    expect(ab.target.type).toBe('single');
    expect(ab.target.affiliation).toBe('ally');
    expect(ab.target.includeSelf).toBe(true);
    expect(ab.effects[0].target).toBe('target');
    const norm = normalizeTargetSpec(ab.target);
    expect(norm.affiliation).toBe('ally');
    expect(norm.life).toBe('alive');

    const r = validateAbilityPack([ab], testRuleset);
    expect(r.ok).toBe(true);
  });

  it('can target the whole party (group heal via zone scope)', () => {
    const ab = buildHealAbility({
      id: 'group-mend',
      name: 'Group Mend',
      healAmount: 6,
      affiliation: 'ally',
      scope: 'all',
      costs: [{ resourceId: 'mana', amount: 6 }],
      cooldown: 3,
    });
    // scope:'all' ally heal routes through the zone effect target so the AoE filter runs.
    expect(ab.target.scope).toBe('all');
    expect(ab.effects[0].target).toBe('zone');
    const r = validateAbilityPack([ab], testRuleset);
    expect(r.ok).toBe(true);
  });
});

describe('buildBuffAbility', () => {
  it('builds an ally-targeted buff (apply-status, includeSelf)', () => {
    const ab = buildBuffAbility({
      id: 'bless',
      name: 'Bless',
      statusId: 'blessed',
      duration: 3,
      statModify: { stat: 'might', amount: 2 },
      costs: [{ resourceId: 'mana', amount: 3 }],
      cooldown: 2,
    });
    expect(ab.target.affiliation).toBe('ally');
    expect(ab.target.includeSelf).toBe(true);
    expect(ab.tags).toContain('buff');
    expect(ab.effects[0].type).toBe('apply-status');
    expect(ab.effects[0].params.statusId).toBe('blessed');
    // stat-modify is included when requested
    expect(ab.effects.some((e) => e.type === 'stat-modify')).toBe(true);

    const r = validateAbilityPack([ab], testRuleset);
    expect(r.ok).toBe(true);
  });

  it('supports group buffs (scope:all routes through zone effect target)', () => {
    const ab = buildBuffAbility({
      id: 'war-cry',
      name: 'War Cry',
      statusId: 'inspired',
      duration: 2,
      scope: 'all',
      costs: [{ resourceId: 'mana', amount: 5 }],
      cooldown: 4,
    });
    expect(ab.target.scope).toBe('all');
    expect(ab.effects[0].target).toBe('zone');
    const r = validateAbilityPack([ab], testRuleset);
    expect(r.ok).toBe(true);
  });
});

describe('buildReviveAbility', () => {
  it('builds an ally + life:dead revive that heals', () => {
    const ab = buildReviveAbility({
      id: 'raise',
      name: 'Raise',
      healAmount: 15,
      costs: [{ resourceId: 'mana', amount: 8 }],
      cooldown: 6,
    });
    const norm = normalizeTargetSpec(ab.target);
    expect(norm.affiliation).toBe('ally');
    expect(norm.life).toBe('dead');
    // Routed through the zone effect target so the (defeated) ally is reachable.
    expect(ab.effects[0].type).toBe('heal');
    expect(ab.effects[0].target).toBe('zone');
    expect(ab.effects[0].params.amount).toBe(15);
    expect(ab.tags).toContain('revive');

    const r = validateAbilityPack([ab], testRuleset);
    expect(r.ok).toBe(true);
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
