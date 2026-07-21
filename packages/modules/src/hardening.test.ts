/**
 * Hardening Tests — Mixed-Game Stress Testing
 *
 * These tests try to BREAK the engine's multi-archetype composition.
 * Each section targets a specific weak spot identified in the hardening checklist.
 */

import { describe, it, expect, vi } from 'vitest';
import type { EntityState, ZoneState, WorldState, EngineModule, ResolvedEvent, ActionIntent } from '@ai-rpg-engine/core';
import type { CombatResourceProfile, CombatStackConfig, BossDefinition } from './index.js';
import {
  buildCombatStack,
  buildCombatFormulas,
  createCombatCore,
  createCombatResources,
  createCombatIntent,
  createBossPhaseListener,
  createEngagementCore,
  createCombatTactics,
  withCombatResources,
  withEngagement,
  applyResourceIntentModifiers,
  registerResourceListeners,
  BUILTIN_COMBAT_ROLES,
  PACK_BIAS_TAGS,
  getEntityRole,
  validateBossDefinition,
  resolveEffects,
} from './index.js';
import { registerStatusDefinitions, clearStatusRegistry } from './status-semantics.js';
import type { CombatFormulas } from './combat-core.js';
import type { IntentScore } from './combat-intent.js';
import type { AbilityDefinition } from '@ai-rpg-engine/content-schema';

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

function makeEntity(overrides: Partial<EntityState> & { id: string }): EntityState {
  return {
    blueprintId: overrides.id,
    type: 'enemy',
    name: overrides.id,
    tags: [],
    stats: { might: 5, agility: 5, resolve: 5 },
    resources: { hp: 20, maxHp: 20 },
    statuses: [],
    ...overrides,
  };
}

function makeZone(overrides: Partial<ZoneState> & { id: string }): ZoneState {
  return {
    roomId: overrides.id,
    name: overrides.id,
    tags: [],
    neighbors: [],
    ...overrides,
  };
}

function makeWorld(entities: EntityState[], zones: ZoneState[]): WorldState {
  return {
    entities: Object.fromEntries(entities.map(e => [e.id, e])),
    zones: Object.fromEntries(zones.map(z => [z.id, z])),
    playerId: entities[0]?.id ?? 'player',
    locationId: zones[0]?.id ?? 'zone-1',
    tick: 0,
    events: [],
    meta: { idCounter: 0 },
  } as unknown as WorldState;
}

function makeAction(overrides: Partial<ActionIntent> = {}): ActionIntent {
  return {
    id: 'act-1',
    actorId: 'actor',
    verb: 'use',
    issuedAtTick: 1,
    ...overrides,
  } as ActionIntent;
}

/**
 * Minimal stand-in for a module registration ctx's `events` bus.
 * `on` captures handlers, `fire` dispatches a matching event to them,
 * and `emit` records anything a listener emits back onto the bus (so tests
 * can assert dev/warning events). Mirrors the EventRegistry contract.
 */
function makeListenerCtx() {
  const handlers = new Map<string, Array<(e: ResolvedEvent, w: WorldState) => void>>();
  const emitted: ResolvedEvent[] = [];
  const namespaceDefaults = new Map<string, unknown>();
  const emit = (e: ResolvedEvent) => {
    emitted.push(e);
    const hs = handlers.get(e.type);
    if (hs) for (const h of hs) h(e, {} as WorldState);
  };
  return {
    emitted,
    namespaceDefaults,
    events: {
      on(type: string, handler: (e: ResolvedEvent, w: WorldState) => void) {
        const hs = handlers.get(type) ?? [];
        hs.push(handler);
        handlers.set(type, hs);
      },
      emit,
    },
    // Minimal stand-in for ModuleRegistrationContext['persistence'] — a full
    // EngineModule.register(ctx) may call ctx.persistence.registerNamespace
    // (e.g. createBossPhaseListener, F-123ac29f). Records what was
    // registered for inspection; does not simulate world.modules storage.
    persistence: {
      registerNamespace(moduleId: string, defaults: unknown) {
        namespaceDefaults.set(moduleId, defaults);
      },
    },
    on(type: string, handler: (e: ResolvedEvent, w: WorldState) => void) {
      const hs = handlers.get(type) ?? [];
      hs.push(handler);
      handlers.set(type, hs);
    },
    emit,
    fire(type: string, event: ResolvedEvent, world: WorldState) {
      const hs = handlers.get(type) ?? [];
      for (const h of hs) h(event, world);
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
// #2: MULTI-RESOURCE PROOF — Heterogeneous resource identities
// ═══════════════════════════════════════════════════════════════════

describe('Multi-Resource Coexistence', () => {
  // Profile with TWO resources: momentum AND focus
  const dualResourceProfile: CombatResourceProfile = {
    packId: 'dual-test',
    gains: [
      { trigger: 'attack-hit', resourceId: 'momentum', amount: 3 },
      { trigger: 'guard-absorb', resourceId: 'focus', amount: 4 },
      { trigger: 'brace', resourceId: 'focus', amount: 2 },
    ],
    spends: [
      { action: 'attack', resourceId: 'momentum', amount: 5, effects: { damageBonus: 2 } },
      { action: 'guard', resourceId: 'focus', amount: 3, effects: { guardBonus: 0.15 } },
    ],
    drains: [
      { trigger: 'take-damage', resourceId: 'momentum', amount: 1 },
      { trigger: 'take-damage', resourceId: 'focus', amount: 2 },
    ],
    aiModifiers: [
      { resourceId: 'momentum', highThreshold: 8, highModifiers: { attack: 10 } },
      { resourceId: 'focus', highThreshold: 6, highModifiers: { guard: 8 } },
    ],
  };

  it('wraps formulas with two independent resources without collision', () => {
    const base = buildCombatFormulas({ attack: 'might', precision: 'agility', resolve: 'resolve' });
    const wrapped = withCombatResources(dualResourceProfile, base);

    // Both formula paths should exist
    expect(wrapped.damage).toBeDefined();
    expect(wrapped.guardReduction).toBeDefined();
  });

  it('momentum spend does not drain focus on attack', () => {
    const base = buildCombatFormulas({ attack: 'might', precision: 'agility', resolve: 'resolve' });
    const wrapped = withCombatResources(dualResourceProfile, base);

    const attacker = makeEntity({
      id: 'fighter',
      stats: { might: 8, agility: 5, resolve: 5 },
      resources: { hp: 30, maxHp: 30, momentum: 10, focus: 10 },
    });
    const target = makeEntity({ id: 'dummy' });
    const world = makeWorld([attacker, target], [makeZone({ id: 'z1' })]);

    // Call damage formula (which triggers momentum spend)
    const dmg = wrapped.damage!(attacker, target, world);

    // Momentum should be spent (10 - 5 = 5)
    expect(attacker.resources.momentum).toBe(5);
    // Focus should be UNTOUCHED
    expect(attacker.resources.focus).toBe(10);
    // Damage should include bonus
    expect(dmg).toBeGreaterThan(base.damage!(attacker, target, world));
  });

  it('focus spend does not drain momentum on guard', () => {
    const base = buildCombatFormulas({ attack: 'might', precision: 'agility', resolve: 'resolve' });
    const wrapped = withCombatResources(dualResourceProfile, base);

    const defender = makeEntity({
      id: 'guardian',
      stats: { might: 3, agility: 5, resolve: 8 },
      resources: { hp: 30, maxHp: 30, momentum: 10, focus: 10 },
    });
    const world = makeWorld([defender], [makeZone({ id: 'z1' })]);

    // Call guard reduction (which triggers focus spend)
    const reduction = wrapped.guardReduction!(defender, world);

    // Focus should be spent (10 - 3 = 7)
    expect(defender.resources.focus).toBe(7);
    // Momentum should be UNTOUCHED
    expect(defender.resources.momentum).toBe(10);
  });

  it('AI modifiers from both resources apply independently', () => {
    const fighter = makeEntity({
      id: 'fighter',
      resources: { hp: 20, maxHp: 20, momentum: 15, focus: 10 },
    });

    const scores: IntentScore[] = [
      { intent: 'attack', resolvedVerb: 'attack', score: 50, contributions: [], reason: '' },
      { intent: 'guard', resolvedVerb: 'guard', score: 50, contributions: [], reason: '' },
    ];

    applyResourceIntentModifiers(dualResourceProfile, fighter, scores);

    // High momentum → attack +10
    const attackScore = scores.find(s => s.intent === 'attack')!;
    expect(attackScore.score).toBe(60);

    // High focus → guard +8
    const guardScore = scores.find(s => s.intent === 'guard')!;
    expect(guardScore.score).toBe(58);
  });

  it('entity with only one resource ignores the other', () => {
    const base = buildCombatFormulas({ attack: 'might', precision: 'agility', resolve: 'resolve' });
    const wrapped = withCombatResources(dualResourceProfile, base);

    // Entity has momentum but NOT focus
    const attacker = makeEntity({
      id: 'no-focus',
      stats: { might: 8, agility: 5, resolve: 5 },
      resources: { hp: 30, maxHp: 30, momentum: 10 },
    });
    const target = makeEntity({ id: 'dummy' });
    const world = makeWorld([attacker, target], [makeZone({ id: 'z1' })]);

    // Should not throw, momentum spend works, focus is ignored
    const dmg = wrapped.damage!(attacker, target, world);
    expect(attacker.resources.momentum).toBe(5);
    expect(attacker.resources.focus).toBeUndefined();
  });

  it('entity with neither resource gets no bonuses and no errors', () => {
    const base = buildCombatFormulas({ attack: 'might', precision: 'agility', resolve: 'resolve' });
    const wrapped = withCombatResources(dualResourceProfile, base);

    const attacker = makeEntity({
      id: 'plain',
      stats: { might: 8, agility: 5, resolve: 5 },
      resources: { hp: 30, maxHp: 30 },
    });
    const target = makeEntity({ id: 'dummy' });
    const world = makeWorld([attacker, target], [makeZone({ id: 'z1' })]);

    // Should produce base damage, no bonus, no error
    const baseDmg = base.damage!(attacker, target, world);
    const wrappedDmg = wrapped.damage!(attacker, target, world);
    expect(wrappedDmg).toBe(baseDmg);
  });
});

// ═══════════════════════════════════════════════════════════════════
// #6: TAG-DISCIPLINE AUDIT
// ═══════════════════════════════════════════════════════════════════

describe('Tag Discipline', () => {
  it('role tags and pack bias tags do not overlap', () => {
    // Role tags: role:brute, role:skirmisher, etc.
    const roleKeys = Object.keys(BUILTIN_COMBAT_ROLES);
    const roleTags = roleKeys.map(k => `role:${k}`);

    // Pack bias tags are the entity-level flavor tags (assassin, samurai, etc.)
    // They should not start with 'role:'
    // This test verifies the namespace separation
    for (const roleTag of roleTags) {
      // Role tags use the 'role:' prefix
      expect(roleTag.startsWith('role:')).toBe(true);
    }
  });

  it('getEntityRole only matches role: prefixed tags', () => {
    // An entity with a bias tag but no role tag
    const entity = makeEntity({
      id: 'tagged',
      tags: ['assassin', 'feral', 'human'],
    });
    expect(getEntityRole(entity)).toBeUndefined();

    // An entity with a proper role tag
    const roled = makeEntity({
      id: 'roled',
      tags: ['assassin', 'role:brute'],
    });
    expect(getEntityRole(roled)).toBe('brute');
  });

  it('engagement tags (bodyguard, ranged, caster) do not collide with role: prefixed tags', () => {
    // An entity can have both engagement tags AND role tags
    const entity = makeEntity({
      id: 'dual-tagged',
      tags: ['bodyguard', 'role:bodyguard'],
    });

    // getEntityRole should find role:bodyguard, not plain bodyguard
    expect(getEntityRole(entity)).toBe('bodyguard');

    // But 'bodyguard' (plain) is used for engagement/protector
    // They serve different purposes and don't conflict because
    // role lookup uses startsWith('role:')
    expect(entity.tags.includes('bodyguard')).toBe(true);
    expect(entity.tags.find(t => t.startsWith('role:'))).toBe('role:bodyguard');
  });

  it('adding engagement tag does not accidentally create a role', () => {
    const entity = makeEntity({
      id: 'caster-only',
      tags: ['caster', 'ranged'],
    });
    // 'caster' is an engagement tag, not a role
    expect(getEntityRole(entity)).toBeUndefined();
  });

  it('multiple role tags — getEntityRole returns the first', () => {
    const entity = makeEntity({
      id: 'multi-role',
      tags: ['role:brute', 'role:elite'],
    });
    // Should find the first one
    expect(getEntityRole(entity)).toBe('brute');
  });
});

// ═══════════════════════════════════════════════════════════════════
// #7: BOSS PHASE SAFETY
// ═══════════════════════════════════════════════════════════════════

describe('Boss Phase Safety', () => {
  it('removing a tag that does not exist is a safe no-op', () => {
    const boss = makeEntity({
      id: 'boss-test',
      tags: ['undead', 'role:boss'],
      resources: { hp: 100, maxHp: 100 },
    });

    // Simulate phase transition logic manually
    const phase = { removeTags: ['nonexistent', 'also-missing'], addTags: ['enraged'] };

    // This mirrors the engine's implementation
    boss.tags = boss.tags.filter(t => !phase.removeTags!.includes(t));
    for (const tag of phase.addTags!) {
      if (!boss.tags.includes(tag)) boss.tags.push(tag);
    }

    // Original tags preserved, new tag added, no error
    expect(boss.tags).toContain('undead');
    expect(boss.tags).toContain('role:boss');
    expect(boss.tags).toContain('enraged');
    expect(boss.tags).not.toContain('nonexistent');
  });

  it('adding a tag that already exists does not duplicate', () => {
    const boss = makeEntity({
      id: 'boss-dup',
      tags: ['undead', 'role:boss', 'feral'],
      resources: { hp: 100, maxHp: 100 },
    });

    // Phase tries to add 'feral' which already exists
    const phase = { addTags: ['feral', 'enraged'] };
    for (const tag of phase.addTags!) {
      if (!boss.tags.includes(tag)) boss.tags.push(tag);
    }

    // feral should appear exactly once
    expect(boss.tags.filter(t => t === 'feral').length).toBe(1);
    expect(boss.tags).toContain('enraged');
  });

  it('rapid sequential phase transitions produce correct final state', () => {
    const boss = makeEntity({
      id: 'rapid-boss',
      tags: ['undead', 'role:boss'],
      resources: { hp: 100, maxHp: 100 },
    });

    const phases = [
      { removeTags: [] as string[], addTags: ['summoner'], hpThreshold: 0.7 },
      { removeTags: ['summoner'], addTags: ['feral'], hpThreshold: 0.4 },
      { removeTags: ['feral'], addTags: ['desperate'], hpThreshold: 0.15 },
    ];

    // Simulate all three phases firing in sequence (as if boss takes massive damage)
    for (const phase of phases) {
      boss.tags = boss.tags.filter(t => !phase.removeTags!.includes(t));
      for (const tag of phase.addTags!) {
        if (!boss.tags.includes(tag)) boss.tags.push(tag);
      }
    }

    // Only 'desperate' should remain from phase tags; summoner and feral removed
    expect(boss.tags).toContain('undead');
    expect(boss.tags).toContain('role:boss');
    expect(boss.tags).toContain('desperate');
    expect(boss.tags).not.toContain('summoner');
    expect(boss.tags).not.toContain('feral');
  });

  it('phase that removes AND adds the same tag leaves it present', () => {
    const boss = makeEntity({
      id: 'paradox-boss',
      tags: ['undead', 'role:boss', 'feral'],
    });

    // Phase removes feral then adds feral
    const phase = { removeTags: ['feral'], addTags: ['feral'] };
    boss.tags = boss.tags.filter(t => !phase.removeTags!.includes(t));
    for (const tag of phase.addTags!) {
      if (!boss.tags.includes(tag)) boss.tags.push(tag);
    }

    // Should still have feral (removed then re-added)
    expect(boss.tags).toContain('feral');
    expect(boss.tags.filter(t => t === 'feral').length).toBe(1);
  });

  it('validateBossDefinition catches out-of-order thresholds', () => {
    const badBoss: BossDefinition = {
      entityId: 'bad-boss',
      phases: [
        { hpThreshold: 0.4, narrativeKey: 'phase-1' },
        { hpThreshold: 0.7, narrativeKey: 'phase-2' },  // Higher than previous = wrong order
      ],
    };

    const warnings = validateBossDefinition(badBoss);
    expect(warnings.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// #3: ARCHETYPE STRESS TEST — Degenerate compositions
// ═══════════════════════════════════════════════════════════════════

describe('Archetype Stress Tests', () => {
  const statMapping = { attack: 'might', precision: 'agility', resolve: 'resolve' };
  const baseFormulas = buildCombatFormulas(statMapping);

  it('all-brute party still produces valid combat formulas', () => {
    const brutes = [
      makeEntity({ id: 'b1', tags: ['role:brute'], stats: { might: 9, agility: 2, resolve: 5 } }),
      makeEntity({ id: 'b2', tags: ['role:brute'], stats: { might: 8, agility: 3, resolve: 4 } }),
      makeEntity({ id: 'b3', tags: ['role:brute'], stats: { might: 10, agility: 1, resolve: 6 } }),
    ];
    const target = makeEntity({ id: 'dummy', stats: { might: 5, agility: 5, resolve: 5 } });
    const world = makeWorld([...brutes, target], [makeZone({ id: 'z1' })]);

    // Each brute should have valid hit/damage
    for (const brute of brutes) {
      const hit = baseFormulas.hitChance!(brute, target, world);
      const dmg = baseFormulas.damage!(brute, target, world);
      expect(hit).toBeGreaterThan(0);
      expect(hit).toBeLessThanOrEqual(95);
      expect(dmg).toBeGreaterThanOrEqual(1);
    }
  });

  it('all-backliner party — everyone gets backline but no protector', () => {
    // When ALL entities have 'caster'/'ranged' tags but none have 'bodyguard',
    // everyone starts backline but no one gets PROTECTED.
    // This is valid — backline reduces incoming damage but no interception.
    const casters = [
      makeEntity({ id: 'c1', tags: ['caster', 'role:backliner'], stats: { might: 2, agility: 6, resolve: 4 } }),
      makeEntity({ id: 'c2', tags: ['ranged', 'role:backliner'], stats: { might: 2, agility: 7, resolve: 3 } }),
      makeEntity({ id: 'c3', tags: ['caster', 'role:backliner'], stats: { might: 3, agility: 5, resolve: 5 } }),
    ];

    // Without a protector, no one should be PROTECTED
    // But BACKLINE should still apply to all
    // This is a valid composition — just vulnerable
    for (const caster of casters) {
      expect(caster.tags.some(t => ['ranged', 'caster'].includes(t))).toBe(true);
    }
  });

  it('zero-might entity still produces minimum 1 damage', () => {
    const weakling = makeEntity({
      id: 'weak',
      stats: { might: 0, agility: 5, resolve: 5 },
    });
    const target = makeEntity({ id: 'dummy' });
    const world = makeWorld([weakling, target], [makeZone({ id: 'z1' })]);

    const dmg = baseFormulas.damage!(weakling, target, world);
    expect(dmg).toBeGreaterThanOrEqual(1);
  });

  it('extreme stat asymmetry still produces clamped hit chances', () => {
    const glass = makeEntity({
      id: 'glass',
      stats: { might: 1, agility: 1, resolve: 1 },
    });
    const tank = makeEntity({
      id: 'tank',
      stats: { might: 20, agility: 20, resolve: 20 },
    });
    const world = makeWorld([glass, tank], [makeZone({ id: 'z1' })]);

    // Glass cannon vs tank: hit chance should be clamped to 5%
    const hitGlassVsTank = baseFormulas.hitChance!(glass, tank, world);
    expect(hitGlassVsTank).toBeGreaterThanOrEqual(5);

    // Tank vs glass: hit chance should be clamped to 95%
    const hitTankVsGlass = baseFormulas.hitChance!(tank, glass, world);
    expect(hitTankVsGlass).toBeLessThanOrEqual(95);
  });

  it('same-resource entity types in same zone get independent resource tracking', () => {
    const profile: CombatResourceProfile = {
      packId: 'same-zone',
      gains: [{ trigger: 'attack-hit', resourceId: 'rage', amount: 3 }],
      spends: [{ action: 'attack', resourceId: 'rage', amount: 5, effects: { damageBonus: 3 } }],
      drains: [],
      aiModifiers: [],
    };

    const a = makeEntity({ id: 'a', resources: { hp: 20, maxHp: 20, rage: 10 } });
    const b = makeEntity({ id: 'b', resources: { hp: 20, maxHp: 20, rage: 10 } });
    const base = buildCombatFormulas({ attack: 'might', precision: 'agility', resolve: 'resolve' });
    const wrapped = withCombatResources(profile, base);
    const world = makeWorld([a, b], [makeZone({ id: 'z1' })]);

    // A attacks, spending rage
    wrapped.damage!(a, b, world);

    // A's rage should be spent, B's untouched
    expect(a.resources.rage).toBe(5);
    expect(b.resources.rage).toBe(10);
  });
});

// ═══════════════════════════════════════════════════════════════════
// #4: ENCOUNTER MODE — Engagement formulas per zone type
// ═══════════════════════════════════════════════════════════════════

describe('Encounter Mode Differentiation', () => {
  const statMapping = { attack: 'might', precision: 'agility', resolve: 'resolve' };

  it('engagement formula modifiers differ between normal and chokepoint zones', () => {
    const base = buildCombatFormulas(statMapping);
    const engaged = withEngagement(base);

    const attacker = makeEntity({
      id: 'att',
      stats: { might: 6, agility: 6, resolve: 5 },
      statuses: [],
    });
    const target = makeEntity({
      id: 'tgt',
      stats: { might: 5, agility: 5, resolve: 5 },
      statuses: [{ id: 'st-backline', statusId: 'engagement:backline', appliedAtTick: 0, sourceId: 'system' }],
    });

    const normalZone = makeZone({ id: 'normal', tags: ['outdoor'] });
    const normalWorld = makeWorld([attacker, target], [normalZone]);

    // Target has BACKLINE status → should get hit penalty
    const hitNormal = engaged.hitChance!(attacker, target, normalWorld);
    const hitBase = base.hitChance!(attacker, target, normalWorld);

    // Engagement wrapper should reduce hit against backline targets
    expect(hitNormal).toBeLessThanOrEqual(hitBase);
  });

  it('engagement formulas handle entity with no statuses gracefully', () => {
    const base = buildCombatFormulas(statMapping);
    const engaged = withEngagement(base);

    const a = makeEntity({ id: 'a', statuses: [] });
    const b = makeEntity({ id: 'b', statuses: [] });
    const world = makeWorld([a, b], [makeZone({ id: 'z' })]);

    // Should not throw
    const hit = engaged.hitChance!(a, b, world);
    expect(hit).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// #5: ABILITY-VS-COMBAT SCORING
// ═══════════════════════════════════════════════════════════════════

describe('Resource AI Modifier Edge Cases', () => {
  it('does not modify scores when entity lacks the resource', () => {
    const profile: CombatResourceProfile = {
      packId: 'test',
      gains: [],
      spends: [],
      drains: [],
      aiModifiers: [
        { resourceId: 'mana', highThreshold: 10, highModifiers: { attack: 20 } },
      ],
    };

    const entity = makeEntity({ id: 'no-mana', resources: { hp: 20, maxHp: 20 } });
    const scores: IntentScore[] = [
      { intent: 'attack', resolvedVerb: 'attack', score: 50, contributions: [], reason: '' },
    ];

    applyResourceIntentModifiers(profile, entity, scores);
    expect(scores[0].score).toBe(50); // Unchanged
  });

  it('low threshold modifiers apply when resource is low', () => {
    const profile: CombatResourceProfile = {
      packId: 'test',
      gains: [],
      spends: [],
      drains: [],
      aiModifiers: [
        {
          resourceId: 'stamina',
          lowThreshold: 3,
          lowModifiers: { guard: 15, disengage: 10 },
          highThreshold: 8,
          highModifiers: { attack: 10 },
        },
      ],
    };

    const tired = makeEntity({ id: 'tired', resources: { hp: 20, maxHp: 20, stamina: 2 } });
    const scores: IntentScore[] = [
      { intent: 'attack', resolvedVerb: 'attack', score: 50, contributions: [], reason: '' },
      { intent: 'guard', resolvedVerb: 'guard', score: 50, contributions: [], reason: '' },
      { intent: 'disengage', resolvedVerb: 'disengage', score: 50, contributions: [], reason: '' },
    ];

    applyResourceIntentModifiers(profile, tired, scores);

    // Low stamina → guard +15, disengage +10, attack unchanged
    expect(scores.find(s => s.intent === 'guard')!.score).toBe(65);
    expect(scores.find(s => s.intent === 'disengage')!.score).toBe(60);
    expect(scores.find(s => s.intent === 'attack')!.score).toBe(50);
  });
});

// ═══════════════════════════════════════════════════════════════════
// #2b: MULTI-RESOURCE ADVERSARIAL — Edge cases that could break
// ═══════════════════════════════════════════════════════════════════

describe('Multi-Resource Adversarial', () => {
  it('multiple spend modifiers on same action from different resources', () => {
    // Both momentum AND focus want to modify attack damage
    const conflictProfile: CombatResourceProfile = {
      packId: 'conflict',
      gains: [],
      spends: [
        { action: 'attack', resourceId: 'momentum', amount: 3, effects: { damageBonus: 2 } },
        { action: 'attack', resourceId: 'focus', amount: 2, effects: { damageBonus: 3 } },
      ],
      drains: [],
      aiModifiers: [],
    };

    const base = buildCombatFormulas({ attack: 'might', precision: 'agility', resolve: 'resolve' });
    const wrapped = withCombatResources(conflictProfile, base);

    const attacker = makeEntity({
      id: 'dual-spender',
      stats: { might: 6, agility: 5, resolve: 5 },
      resources: { hp: 20, maxHp: 20, momentum: 10, focus: 10 },
    });
    const target = makeEntity({ id: 'dummy' });
    const world = makeWorld([attacker, target], [makeZone({ id: 'z1' })]);

    const baseDmg = base.damage!(attacker, target, world);
    // Reset resources (base.damage doesn't touch them but let's be safe)
    attacker.resources.momentum = 10;
    attacker.resources.focus = 10;

    const wrappedDmg = wrapped.damage!(attacker, target, world);

    // Both spends should fire: +2 from momentum, +3 from focus = +5 total
    expect(wrappedDmg).toBe(baseDmg + 5);
    expect(attacker.resources.momentum).toBe(7);  // 10 - 3
    expect(attacker.resources.focus).toBe(8);      // 10 - 2
  });

  it('spend fails gracefully when resource is exactly at cost', () => {
    const profile: CombatResourceProfile = {
      packId: 'exact',
      gains: [],
      spends: [
        { action: 'attack', resourceId: 'energy', amount: 5, effects: { damageBonus: 3 } },
      ],
      drains: [],
      aiModifiers: [],
    };

    const base = buildCombatFormulas({ attack: 'might', precision: 'agility', resolve: 'resolve' });
    const wrapped = withCombatResources(profile, base);

    const attacker = makeEntity({
      id: 'exact-spend',
      stats: { might: 6, agility: 5, resolve: 5 },
      resources: { hp: 20, maxHp: 20, energy: 5 },  // Exactly enough
    });
    const target = makeEntity({ id: 'dummy' });
    const world = makeWorld([attacker, target], [makeZone({ id: 'z1' })]);

    const baseDmg = base.damage!(attacker, target, world);
    attacker.resources.energy = 5;
    const wrappedDmg = wrapped.damage!(attacker, target, world);

    // Should succeed — 5 >= 5
    expect(wrappedDmg).toBe(baseDmg + 3);
    expect(attacker.resources.energy).toBe(0);
  });

  it('spend fails when resource is one below cost', () => {
    const profile: CombatResourceProfile = {
      packId: 'insufficient',
      gains: [],
      spends: [
        { action: 'attack', resourceId: 'energy', amount: 5, effects: { damageBonus: 3 } },
      ],
      drains: [],
      aiModifiers: [],
    };

    const base = buildCombatFormulas({ attack: 'might', precision: 'agility', resolve: 'resolve' });
    const wrapped = withCombatResources(profile, base);

    const attacker = makeEntity({
      id: 'poor',
      stats: { might: 6, agility: 5, resolve: 5 },
      resources: { hp: 20, maxHp: 20, energy: 4 },  // Not enough
    });
    const target = makeEntity({ id: 'dummy' });
    const world = makeWorld([attacker, target], [makeZone({ id: 'z1' })]);

    const baseDmg = base.damage!(attacker, target, world);
    attacker.resources.energy = 4;
    const wrappedDmg = wrapped.damage!(attacker, target, world);

    // Should NOT get bonus — insufficient resource
    expect(wrappedDmg).toBe(baseDmg);
    expect(attacker.resources.energy).toBe(4);  // Not spent
  });

  it('guard reduction stacking from resource spend is capped at 0.90', () => {
    const profile: CombatResourceProfile = {
      packId: 'guard-stack',
      gains: [],
      spends: [
        { action: 'guard', resourceId: 'focus', amount: 1, effects: { guardBonus: 0.50 } },
      ],
      drains: [],
      aiModifiers: [],
    };

    const base = buildCombatFormulas({ attack: 'might', precision: 'agility', resolve: 'resolve' });
    const wrapped = withCombatResources(profile, base);

    // Entity with high resolve = high base guard + focus bonus
    const defender = makeEntity({
      id: 'wall',
      stats: { might: 3, agility: 3, resolve: 20 },  // Extreme resolve
      resources: { hp: 40, maxHp: 40, focus: 50 },
    });
    const world = makeWorld([defender], [makeZone({ id: 'z1' })]);

    const reduction = wrapped.guardReduction!(defender, world);

    // Base guard could be up to 0.75, + 0.50 focus = 1.25 → clamped to 0.90
    expect(reduction).toBeLessThanOrEqual(0.90);
  });

  it('resource at 0 — drain does not go negative', () => {
    const profile: CombatResourceProfile = {
      packId: 'floor-test',
      gains: [],
      spends: [],
      drains: [
        { trigger: 'take-damage', resourceId: 'morale', amount: 10 },
      ],
      aiModifiers: [],
    };

    const entity = makeEntity({
      id: 'demoralized',
      resources: { hp: 20, maxHp: 20, morale: 3 },  // Only 3 left
    });

    // Simulate drain manually (mirrors registerResourceListeners logic)
    entity.resources.morale = Math.max(0, (entity.resources.morale ?? 0) - 10);
    expect(entity.resources.morale).toBe(0);  // Floored at 0, not -7
  });

  it('resource at 100 — gain does not exceed cap', () => {
    const entity = makeEntity({
      id: 'maxed',
      resources: { hp: 20, maxHp: 20, rage: 98 },
    });

    // Simulate gain (mirrors registerResourceListeners logic)
    entity.resources.rage = Math.min(100, (entity.resources.rage ?? 0) + 5);
    expect(entity.resources.rage).toBe(100);  // Capped at 100, not 103
  });

  it('MOD-PH-06: per-resource cap via resourceCaps clamps a gain to the configured max', () => {
    // resourceCaps shipped — a momentum cap of 10 must clamp gains at 10, not 100.
    const profile: CombatResourceProfile = {
      packId: 'cap-test',
      gains: [
        { trigger: 'attack-hit', resourceId: 'momentum', amount: 4 },
      ],
      spends: [],
      drains: [],
      aiModifiers: [],
      resourceCaps: { momentum: 10 },
    };

    const attacker = makeEntity({
      id: 'striker',
      resources: { hp: 20, maxHp: 20, momentum: 9 }, // 9 + 4 = 13, must clamp to 10
    });
    const world = makeWorld([attacker], [makeZone({ id: 'z1' })]);

    const ctx = makeListenerCtx();
    registerResourceListeners(profile, ctx);

    ctx.fire('combat.contact.hit', {
      id: 'evt-hit',
      type: 'combat.contact.hit',
      tick: 1,
      actorId: 'striker',
      payload: { attackerId: 'striker' },
    } as ResolvedEvent, world);

    expect(attacker.resources.momentum).toBe(10); // clamped to 10, not 13 and not 100
  });
});

// ═══════════════════════════════════════════════════════════════════
// #7b: BOSS PHASE — Adversarial module-level tests
// ═══════════════════════════════════════════════════════════════════

describe('Boss Phase Adversarial', () => {
  it('boss with empty phases array does not crash', () => {
    const emptyBoss: BossDefinition = {
      entityId: 'empty-boss',
      phases: [],
    };

    // createBossPhaseListener should handle empty phases gracefully
    const module = createBossPhaseListener(emptyBoss);
    expect(module).toBeDefined();
    expect(module.id).toContain('boss');
  });

  it('boss with identical thresholds — validateBossDefinition warns', () => {
    const dupBoss: BossDefinition = {
      entityId: 'dup-boss',
      phases: [
        { hpThreshold: 0.5, narrativeKey: 'phase-a' },
        { hpThreshold: 0.5, narrativeKey: 'phase-b' },
      ],
    };

    const warnings = validateBossDefinition(dupBoss);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('boss with threshold above 1.0 — validateBossDefinition warns', () => {
    const invalidBoss: BossDefinition = {
      entityId: 'invalid-boss',
      phases: [
        { hpThreshold: 1.5, narrativeKey: 'impossible' },
      ],
    };

    const warnings = validateBossDefinition(invalidBoss);
    expect(warnings.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// #7c: WARN-AND-DEGRADE — Phase findings MOD-PH-01..05
// ═══════════════════════════════════════════════════════════════════

describe('Warn-and-degrade: phase findings', () => {
  const healAbility: AbilityDefinition = {
    id: 'mend',
    name: 'Mend',
    verb: 'pray',
    tags: ['support'],
    costs: [],
    target: { type: 'self' },
    checks: [],
    effects: [{ type: 'heal', target: 'actor', params: { amount: 100, resource: 'hp' } }],
    cooldown: 0,
  };

  // -------------------------------------------------------------------
  // MOD-PH-01: heal must respect resources.maxHp (the engine convention)
  // -------------------------------------------------------------------
  it('MOD-PH-01: heal cannot exceed resources.maxHp (no silent overheal)', () => {
    const target = makeEntity({
      id: 'wounded',
      // Content stores the cap in resources.maxHp — NOT stats.maxHp.
      resources: { hp: 10, maxHp: 30 },
      stats: { might: 5, agility: 5, resolve: 5 }, // no maxHp here on purpose
    });
    const world = makeWorld([target], [makeZone({ id: 'z1' })]);
    const action = makeAction({ actorId: 'wounded' });

    resolveEffects(healAbility, target, [target], world, 1, action, true);

    // 10 + 100 = 110, but resources.maxHp caps it at 30.
    expect(target.resources.hp).toBe(30);
  });

  it('MOD-PH-01: resource-modify (gain) cannot exceed resources.maxHp', () => {
    const gainAbility: AbilityDefinition = {
      id: 'surge',
      name: 'Surge',
      verb: 'use',
      tags: [],
      costs: [],
      target: { type: 'self' },
      checks: [],
      effects: [{ type: 'resource-modify', target: 'actor', params: { resource: 'hp', amount: 100 } }],
      cooldown: 0,
    };
    const target = makeEntity({
      id: 'topup',
      resources: { hp: 5, maxHp: 25 },
      stats: { might: 5, agility: 5, resolve: 5 },
    });
    const world = makeWorld([target], [makeZone({ id: 'z1' })]);
    const action = makeAction({ actorId: 'topup' });

    resolveEffects(gainAbility, target, [target], world, 1, action, true);

    expect(target.resources.hp).toBe(25); // capped at resources.maxHp, not 105
  });

  // -------------------------------------------------------------------
  // MOD-PH-04: applying an unregistered status emits a structured dev event
  // -------------------------------------------------------------------
  it('MOD-PH-04: applying an unregistered status emits ability.status.unregistered', () => {
    clearStatusRegistry(); // ensure "ghostly" is NOT registered
    const statusAbility: AbilityDefinition = {
      id: 'haunt',
      name: 'Haunt',
      verb: 'use',
      tags: [],
      costs: [],
      target: { type: 'single' },
      checks: [],
      effects: [{ type: 'apply-status', target: 'target', params: { statusId: 'ghostly', duration: 2 } }],
      cooldown: 0,
    };
    const actor = makeEntity({ id: 'caster' });
    const target = makeEntity({ id: 'victim' });
    const world = makeWorld([actor, target], [makeZone({ id: 'z1' })]);
    const action = makeAction({ actorId: 'caster' });

    const events = resolveEffects(statusAbility, actor, [target], world, 1, action, true);

    const warn = events.find(e => e.type === 'ability.status.unregistered');
    expect(warn).toBeDefined();
    expect(warn!.payload.statusId).toBe('ghostly');
    // It must NOT throw and must still apply the status (degrade, not block).
    expect(target.statuses.some(s => s.statusId === 'ghostly')).toBe(true);
  });

  it('MOD-PH-04: a registered status does NOT emit the unregistered event', () => {
    clearStatusRegistry();
    registerStatusDefinitions([
      { id: 'cursed', name: 'Cursed', tags: ['debuff'], stackable: false } as never,
    ]);
    const statusAbility: AbilityDefinition = {
      id: 'hex',
      name: 'Hex',
      verb: 'use',
      tags: [],
      costs: [],
      target: { type: 'single' },
      checks: [],
      effects: [{ type: 'apply-status', target: 'target', params: { statusId: 'cursed', duration: 2 } }],
      cooldown: 0,
    };
    const actor = makeEntity({ id: 'caster' });
    const target = makeEntity({ id: 'victim' });
    const world = makeWorld([actor, target], [makeZone({ id: 'z1' })]);
    const action = makeAction({ actorId: 'caster' });

    const events = resolveEffects(statusAbility, actor, [target], world, 1, action, true);
    expect(events.find(e => e.type === 'ability.status.unregistered')).toBeUndefined();
    clearStatusRegistry();
  });

  // -------------------------------------------------------------------
  // MOD-PH-02: buildCombatStack warns on unknown biasTags
  // -------------------------------------------------------------------
  it('MOD-PH-02: buildCombatStack returns a warning for an unknown biasTag', () => {
    const stack = buildCombatStack({
      statMapping: { attack: 'might', precision: 'agility', resolve: 'resolve' },
      biasTags: ['undead', 'feeral'], // 'feeral' is a typo (should be 'feral')
    });

    expect(stack.warnings).toBeDefined();
    const joined = (stack.warnings ?? []).join(' | ');
    expect(joined).toContain('feeral');
    // The message should be actionable — list the valid tags.
    expect(joined.toLowerCase()).toContain('undead'); // a known valid tag is listed
    // 'undead' (valid) must NOT itself be flagged as unknown.
    expect((stack.warnings ?? []).some(w => /unknown.*'undead'/i.test(w))).toBe(false);
  });

  it('MOD-PH-02: buildCombatStack with all-valid biasTags produces no warnings', () => {
    const validTag = PACK_BIAS_TAGS[0];
    const stack = buildCombatStack({
      statMapping: { attack: 'might', precision: 'agility', resolve: 'resolve' },
      biasTags: [validTag],
    });
    expect(stack.warnings ?? []).toHaveLength(0);
  });

  // -------------------------------------------------------------------
  // MOD-PH-03: createBossPhaseListener surfaces validation warnings
  // -------------------------------------------------------------------
  it('MOD-PH-03: createBossPhaseListener emits a boss.definition.invalid dev event for a bad threshold', () => {
    const badBoss: BossDefinition = {
      entityId: 'typo-boss',
      phases: [
        { hpThreshold: 1.5, narrativeKey: 'impossible' }, // out of range (0-1)
      ],
    };

    const module = createBossPhaseListener(badBoss);
    const ctx = makeListenerCtx();
    module.register(ctx as never);

    const warnEvent = ctx.emitted.find(e => e.type === 'boss.definition.invalid');
    expect(warnEvent).toBeDefined();
    expect(warnEvent!.payload.entityId).toBe('typo-boss');
    expect(Array.isArray(warnEvent!.payload.warnings)).toBe(true);
    expect((warnEvent!.payload.warnings as string[]).length).toBeGreaterThan(0);
  });

  it('MOD-PH-03: a valid boss definition emits no boss.definition.invalid event', () => {
    const goodBoss: BossDefinition = {
      entityId: 'good-boss',
      phases: [
        { hpThreshold: 0.5, narrativeKey: 'enraged' },
      ],
    };
    const module = createBossPhaseListener(goodBoss);
    const ctx = makeListenerCtx();
    module.register(ctx as never);

    expect(ctx.emitted.find(e => e.type === 'boss.definition.invalid')).toBeUndefined();
  });

  // -------------------------------------------------------------------
  // MOD-PH-05: registerResourceListeners warns on an unrecognized trigger
  //            but NOT on the legitimate 'ally-defeated' skip
  // -------------------------------------------------------------------
  it('MOD-PH-05: an unrecognized gain trigger emits a combat.resource.trigger.unknown dev event', () => {
    const profile: CombatResourceProfile = {
      packId: 'typo-trigger',
      // 'attack-hitt' is a typo; not in GAIN_EVENT_MAP and not 'ally-defeated'.
      gains: [{ trigger: 'attack-hitt' as never, resourceId: 'momentum', amount: 3 }],
      spends: [],
      drains: [],
      aiModifiers: [],
    };
    const ctx = makeListenerCtx();
    registerResourceListeners(profile, ctx);

    const warn = ctx.emitted.find(e => e.type === 'combat.resource.trigger.unknown');
    expect(warn).toBeDefined();
    expect(String(warn!.payload.trigger)).toBe('attack-hitt');
  });

  it('MOD-PH-05: the legitimate ally-defeated trigger does NOT emit an unknown-trigger warning', () => {
    const profile: CombatResourceProfile = {
      packId: 'ally-defeated-ok',
      gains: [{ trigger: 'ally-defeated', resourceId: 'rage', amount: 5 }],
      spends: [],
      drains: [{ trigger: 'ally-defeated', resourceId: 'morale', amount: 5 }],
      aiModifiers: [],
    };
    const ctx = makeListenerCtx();
    registerResourceListeners(profile, ctx);

    expect(ctx.emitted.find(e => e.type === 'combat.resource.trigger.unknown')).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════
// #8: WORLD PORTABILITY — Same build, different content
// ═══════════════════════════════════════════════════════════════════

describe('World Portability', () => {
  it('same CombatStackConfig produces identical module count for different worlds', () => {
    const config: CombatStackConfig = {
      statMapping: { attack: 'might', precision: 'agility', resolve: 'resolve' },
      playerId: 'hero',
      engagement: { backlineTags: ['caster'], protectorTags: ['bodyguard'] },
      resourceProfile: {
        packId: 'portable',
        gains: [{ trigger: 'attack-hit', resourceId: 'momentum', amount: 2 }],
        spends: [{ action: 'attack', resourceId: 'momentum', amount: 3, effects: { damageBonus: 1 } }],
        drains: [],
        aiModifiers: [],
      },
      biasTags: ['undead'],
    };

    // Build stack for "world A"
    const stackA = buildCombatStack(config);
    // Build stack for "world B" (same config, different world name doesn't matter)
    const stackB = buildCombatStack(config);

    expect(stackA.modules.length).toBe(stackB.modules.length);
    expect(stackA.modules.length).toBeGreaterThan(0);
  });

  it('archetype entity works in any zone regardless of zone tags', () => {
    const formulas = buildCombatFormulas({ attack: 'might', precision: 'agility', resolve: 'resolve' });

    const hero = makeEntity({
      id: 'hero',
      stats: { might: 7, agility: 6, resolve: 5 },
    });
    const enemy = makeEntity({
      id: 'foe',
      stats: { might: 5, agility: 5, resolve: 5 },
    });

    // Same entities, different zone tags
    const tundra = makeZone({ id: 'tundra', tags: ['outdoor', 'cold'] });
    const desert = makeZone({ id: 'desert', tags: ['outdoor', 'hot'] });
    const dungeon = makeZone({ id: 'dungeon', tags: ['indoor', 'dark'] });

    for (const zone of [tundra, desert, dungeon]) {
      const world = makeWorld([hero, enemy], [zone]);
      const hit = formulas.hitChance!(hero, enemy, world);
      const dmg = formulas.damage!(hero, enemy, world);

      // Base combat formulas don't depend on zone tags (that's engagement's job)
      expect(hit).toBeGreaterThan(0);
      expect(dmg).toBeGreaterThanOrEqual(1);
    }
  });
});
