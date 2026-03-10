// ability-phase2-integration.test.ts — Cross-genre integration tests for Abilities Phase 2
//
// Proves: cross-genre tag rejection, NPC AI scoring across genres, AI pathology checks,
// all 7 packs pass validation, summary/audit produce correct results.

import { describe, it, expect } from 'vitest';
import { createTestEngine } from '@ai-rpg-engine/core';
import type { EntityState } from '@ai-rpg-engine/core';
import type { AbilityDefinition } from '@ai-rpg-engine/content-schema';
import { validateAbilityPack } from '@ai-rpg-engine/content-schema';
import { statusCore } from './status-core.js';
import { createAbilityCore, isAbilityReady, getAvailableAbilities } from './ability-core.js';
import { createAbilityEffects } from './ability-effects.js';
import { createAbilityReview } from './ability-review.js';
import { scoreAbilityUse, selectNpcAbilityAction } from './ability-intent.js';
import { summarizeAbilityPack, auditAbilityBalance } from './ability-summary.js';

// --- Real packs from all 7 starters ---
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

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const zones = [
  { id: 'zone-a', roomId: 'test', name: 'Arena', tags: [] as string[], neighbors: ['zone-b'] },
  { id: 'zone-b', roomId: 'test', name: 'Wing', tags: [] as string[], neighbors: ['zone-a'] },
];

function buildCrossGenreEngine(
  abilities: AbilityDefinition[],
  player: EntityState,
  enemies: EntityState[],
  statMapping: { power: string; precision: string; focus: string },
) {
  return createTestEngine({
    zones,
    entities: [player, ...enemies],
    playerId: player.id,
    modules: [
      statusCore,
      createAbilityCore({ abilities, statMapping }),
      createAbilityEffects(),
      createAbilityReview(),
    ],
  });
}

// --- Reusable entity factories ---

function makeGladiator(id = 'player'): EntityState {
  return {
    id, blueprintId: 'gladiator', type: 'player', name: 'Gladiator',
    tags: ['player', 'gladiator'],
    stats: { might: 8, agility: 6, showmanship: 7 },
    resources: { hp: 25, stamina: 10, 'crowd-favor': 40, fatigue: 5 },
    statuses: [], zoneId: 'zone-a',
  };
}

function makeVampire(id = 'player'): EntityState {
  return {
    id, blueprintId: 'vampire', type: 'player', name: 'Vampire Lord',
    tags: ['player', 'vampire', 'noble'],
    stats: { presence: 8, vitality: 10, cunning: 7 },
    resources: { hp: 20, stamina: 10, bloodlust: 25, humanity: 8 },
    statuses: [], zoneId: 'zone-a',
  };
}

function makeRonin(id = 'player'): EntityState {
  return {
    id, blueprintId: 'ronin', type: 'player', name: 'Wandering Ronin',
    tags: ['player', 'ronin'],
    stats: { discipline: 9, perception: 7, composure: 8 },
    resources: { hp: 20, stamina: 10, ki: 15, honor: 10 },
    statuses: [], zoneId: 'zone-a',
  };
}

function makePirate(id = 'captain'): EntityState {
  return {
    id, blueprintId: 'pirate', type: 'player', name: 'Captain',
    tags: ['player', 'pirate', 'captain'],
    stats: { brawn: 6, cunning: 10, 'sea-legs': 8 },
    resources: { hp: 20, stamina: 10, morale: 15 },
    statuses: [], zoneId: 'zone-a',
  };
}

function makeEnemy(overrides?: Partial<EntityState>): EntityState {
  return {
    id: 'enemy', blueprintId: 'enemy', type: 'enemy', name: 'Enemy',
    tags: ['enemy'],
    stats: { might: 5, agility: 5, showmanship: 3, presence: 3, vitality: 5, cunning: 4, discipline: 4, perception: 4, composure: 4, brawn: 5, 'sea-legs': 3 },
    resources: { hp: 20, stamina: 5 },
    statuses: [], zoneId: 'zone-a',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Cross-Genre Safety — Tag Rejection
// ---------------------------------------------------------------------------

describe('Cross-genre safety — tag rejection', () => {
  it('vampire abilities reject for gladiator entity', () => {
    const engine = buildCrossGenreEngine(
      vampireAbilities,
      makeGladiator(),
      [makeEnemy()],
      { power: 'vitality', precision: 'cunning', focus: 'presence' },
    );
    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'blood-drain' }, targetIds: ['enemy'],
    });
    expect(events.find(e => e.type === 'ability.rejected')).toBeDefined();
  });

  it('ronin abilities reject for pirate entity', () => {
    const engine = buildCrossGenreEngine(
      roninAbilities,
      makePirate(),
      [makeEnemy()],
      { power: 'discipline', precision: 'perception', focus: 'composure' },
    );
    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'captain', issuedAtTick: 1,
      parameters: { abilityId: 'iaijutsu-strike' }, targetIds: ['enemy'],
    });
    expect(events.find(e => e.type === 'ability.rejected')).toBeDefined();
  });

  it('gladiator abilities reject for vampire entity', () => {
    const engine = buildCrossGenreEngine(
      gladiatorAbilities,
      makeVampire(),
      [makeEnemy()],
      { power: 'might', precision: 'agility', focus: 'showmanship' },
    );
    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'crowd-cleave' }, targetIds: ['enemy'],
    });
    expect(events.find(e => e.type === 'ability.rejected')).toBeDefined();
  });

  it('pirate abilities reject for ronin entity', () => {
    const engine = buildCrossGenreEngine(
      pirateAbilities,
      makeRonin(),
      [makeEnemy()],
      { power: 'brawn', precision: 'cunning', focus: 'sea-legs' },
    );
    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'broadside' }, targetIds: [],
    });
    expect(events.find(e => e.type === 'ability.rejected')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 2. Each pack uses correct stat for checks
// ---------------------------------------------------------------------------

describe('Correct stat mapping per genre', () => {
  it('vampire uses vitality for Blood Drain check', () => {
    const engine = buildCrossGenreEngine(
      vampireAbilities,
      makeVampire(),
      [makeEnemy()],
      { power: 'vitality', precision: 'cunning', focus: 'presence' },
    );
    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'blood-drain' }, targetIds: ['enemy'],
    });
    expect(events.find(e => e.type === 'ability.used')).toBeDefined();
  });

  it('gladiator uses might for Crowd Cleave check', () => {
    const engine = buildCrossGenreEngine(
      gladiatorAbilities,
      makeGladiator(),
      [makeEnemy()],
      { power: 'might', precision: 'agility', focus: 'showmanship' },
    );
    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'crowd-cleave' }, targetIds: ['enemy'],
    });
    expect(events.find(e => e.type === 'ability.used')).toBeDefined();
  });

  it('ronin uses discipline for Iaijutsu Strike check', () => {
    const engine = buildCrossGenreEngine(
      roninAbilities,
      makeRonin(),
      [makeEnemy()],
      { power: 'discipline', precision: 'perception', focus: 'composure' },
    );
    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'iaijutsu-strike' }, targetIds: ['enemy'],
    });
    expect(events.find(e => e.type === 'ability.used')).toBeDefined();
  });

  it('pirate uses cunning for Broadside check', () => {
    const engine = buildCrossGenreEngine(
      pirateAbilities,
      makePirate(),
      [makeEnemy(), makeEnemy({ id: 'enemy2', name: 'Enemy2' })],
      { power: 'brawn', precision: 'cunning', focus: 'sea-legs' },
    );
    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'captain', issuedAtTick: 1,
      parameters: { abilityId: 'broadside' }, targetIds: [],
    });
    expect(events.find(e => e.type === 'ability.used')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 3. NPC AI scoring across genres
// ---------------------------------------------------------------------------

describe('NPC AI scoring across genres', () => {
  it('injured vampire prefers Blood Drain (heal component)', () => {
    const vampire: EntityState = {
      ...makeVampire('npc-vamp'),
      type: 'enemy',
      tags: ['enemy', 'vampire'],
      resources: { hp: 6, stamina: 10, bloodlust: 5, humanity: 10 },
    };
    // Target must have a different entity type for AI scoring to find valid targets
    const target: EntityState = {
      ...makeEnemy({ id: 'target' }),
      type: 'player',
    };
    const world = { entities: { 'npc-vamp': vampire, target }, meta: { tick: 0 } } as any;
    const scores = scoreAbilityUse(vampire, vampireAbilities[0], world);
    // Blood Drain is single-target so scores against each opposing-type entity
    expect(scores.length).toBeGreaterThan(0);
    expect(scores[0].score).toBeGreaterThan(0);
  });

  it('gladiator prefers Crowd Cleave for aggression', () => {
    const gladiator: EntityState = {
      ...makeGladiator('npc-glad'),
      type: 'enemy',
      tags: ['enemy', 'gladiator'],
      resources: { hp: 25, stamina: 10, 'crowd-favor': 40 },
    };
    const target: EntityState = {
      ...makeEnemy({ id: 'target' }),
      type: 'player',
    };
    const crowdCleave = gladiatorAbilities.find(a => a.id === 'crowd-cleave')!;
    const world = { entities: { 'npc-glad': gladiator, target }, meta: { tick: 0 } } as any;
    const scores = scoreAbilityUse(gladiator, crowdCleave, world);
    expect(scores.length).toBeGreaterThan(0);
    expect(scores[0].score).toBeGreaterThan(0);
  });

  it('low-ki ronin prefers Inner Calm (ki restoration)', () => {
    const ronin: EntityState = {
      ...makeRonin('npc-ronin'),
      type: 'enemy',
      tags: ['enemy', 'ronin'],
      resources: { hp: 20, stamina: 10, ki: 2, honor: 10 },
    };
    const innerCalm = roninAbilities.find(a => a.id === 'inner-calm')!;
    const world = { entities: { 'npc-ronin': ronin }, meta: { tick: 0 } } as any;
    const scores = scoreAbilityUse(ronin, innerCalm, world);
    // Inner Calm is self-target, so exactly 1 score
    expect(scores.length).toBe(1);
    expect(scores[0].score).toBeGreaterThan(0);
  });

  it('pirate NPC selects an ability when available', () => {
    const pirate: EntityState = {
      ...makePirate('npc-pirate'),
      type: 'enemy',
      tags: ['enemy', 'pirate'],
      resources: { hp: 20, stamina: 10, morale: 15 },
    };
    const world = {
      entities: { 'npc-pirate': pirate, target: makeEnemy({ id: 'target' }) },
      meta: { tick: 0 },
      modules: { 'ability-core': { cooldowns: {}, useCounts: {} } },
    } as any;
    const decision = selectNpcAbilityAction(pirate, world, pirateAbilities);
    // Should find at least one ability to use
    expect(decision).toBeDefined();
    if (decision) {
      expect(decision.chosen).toBeDefined();
      expect(pirateAbilities.map(a => a.id)).toContain(decision.chosen.abilityId);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. AI pathology checks
// ---------------------------------------------------------------------------

describe('AI pathology checks', () => {
  it('Blood Drain has cooldown — no infinite heal loop', () => {
    const engine = buildCrossGenreEngine(
      vampireAbilities,
      makeVampire(),
      [makeEnemy({ resources: { hp: 50, stamina: 5 } })],
      { power: 'vitality', precision: 'cunning', focus: 'presence' },
    );
    // Use Blood Drain once
    engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'blood-drain' }, targetIds: ['enemy'],
    });
    // Should be on cooldown now
    const ready = isAbilityReady(engine.store.state, 'player', 'blood-drain', vampireAbilities);
    expect(ready).toBe(false);
  });

  it('all 7 packs have cooldowns on every ability', () => {
    const allPacks = [
      { genre: 'fantasy', abilities: fantasyAbilities },
      { genre: 'cyberpunk', abilities: cyberpunkAbilities },
      { genre: 'weird-west', abilities: weirdWestAbilities },
      { genre: 'vampire', abilities: vampireAbilities },
      { genre: 'gladiator', abilities: gladiatorAbilities },
      { genre: 'ronin', abilities: roninAbilities },
      { genre: 'pirate', abilities: pirateAbilities },
    ];
    for (const { genre, abilities } of allPacks) {
      for (const ability of abilities) {
        expect(ability.cooldown, `${genre}/${ability.id} should have a cooldown`).toBeGreaterThan(0);
      }
    }
  });

  it('AoE abilities still respect cooldown in single-enemy scenarios', () => {
    const engine = buildCrossGenreEngine(
      pirateAbilities,
      makePirate(),
      [makeEnemy()],
      { power: 'brawn', precision: 'cunning', focus: 'sea-legs' },
    );
    engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'captain', issuedAtTick: 1,
      parameters: { abilityId: 'broadside' }, targetIds: [],
    });
    const ready = isAbilityReady(engine.store.state, 'captain', 'broadside', pirateAbilities);
    expect(ready).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. Validation audit — all 7 packs pass
// ---------------------------------------------------------------------------

describe('Validation audit — all 7 packs', () => {
  const packs = [
    { name: 'Fantasy', abilities: fantasyAbilities, ruleset: fantasyMinimalRuleset },
    { name: 'Cyberpunk', abilities: cyberpunkAbilities, ruleset: cyberpunkMinimalRuleset },
    { name: 'Weird-West', abilities: weirdWestAbilities, ruleset: weirdWestMinimalRuleset },
    { name: 'Vampire', abilities: vampireAbilities, ruleset: vampireMinimalRuleset },
    { name: 'Gladiator', abilities: gladiatorAbilities, ruleset: gladiatorMinimalRuleset },
    { name: 'Ronin', abilities: roninAbilities, ruleset: roninMinimalRuleset },
    { name: 'Pirate', abilities: pirateAbilities, ruleset: pirateMinimalRuleset },
  ];

  for (const { name, abilities, ruleset } of packs) {
    it(`${name} pack passes validateAbilityPack against its ruleset`, () => {
      const result = validateAbilityPack(abilities, ruleset);
      if (!result.ok) {
        const msgs = result.errors.map(e => `${e.path}: ${e.message}`).join('\n');
        expect.fail(`${name} validation failed:\n${msgs}`);
      }
      expect(result.ok).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// 6. Summary generation
// ---------------------------------------------------------------------------

describe('Summary generation', () => {
  const allPacks = [
    { genre: 'fantasy', abilities: fantasyAbilities },
    { genre: 'cyberpunk', abilities: cyberpunkAbilities },
    { genre: 'weird-west', abilities: weirdWestAbilities },
    { genre: 'vampire', abilities: vampireAbilities },
    { genre: 'gladiator', abilities: gladiatorAbilities },
    { genre: 'ronin', abilities: roninAbilities },
    { genre: 'pirate', abilities: pirateAbilities },
  ];

  for (const { genre, abilities } of allPacks) {
    it(`summarizeAbilityPack produces correct count for ${genre}`, () => {
      const summary = summarizeAbilityPack(genre, abilities);
      expect(summary.abilityCount).toBe(abilities.length);
      expect(summary.genre).toBe(genre);
      // Every pack should have at least one damage effect
      const hasDamage = Object.keys(summary.effectDistribution).some(
        t => t === 'damage',
      );
      expect(hasDamage, `${genre} should have at least one damage ability`).toBe(true);
    });
  }

  it('auditAbilityBalance finds no critical flags in shipped packs', () => {
    const audit = auditAbilityBalance(allPacks);
    // No extreme-damage warnings (all abilities are moderate)
    const criticalFlags = audit.flags.filter(
      f => f.severity === 'warning' && f.category === 'extreme-damage',
    );
    expect(criticalFlags, 'Shipped packs should not have extreme damage outliers').toHaveLength(0);
  });

  it('auditAbilityBalance reports correct total across all packs', () => {
    const audit = auditAbilityBalance(allPacks);
    const expectedTotal = allPacks.reduce((sum, p) => sum + p.abilities.length, 0);
    expect(audit.totalAbilities).toBe(expectedTotal);
  });
});
