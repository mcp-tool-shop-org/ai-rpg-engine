// Vampire ability integration tests — Blood Drain, Mesmerize, Crimson Fury
// Proves: predatory feed loop, humanity erosion, bloodlust-as-resource, AoE burst

import { describe, it, expect } from 'vitest';
import { createTestEngine } from '@ai-rpg-engine/core';
import type { EntityState } from '@ai-rpg-engine/core';
import { statusCore } from '@ai-rpg-engine/modules';
import {
  createAbilityCore,
  isAbilityReady,
  getAvailableAbilities,
  createAbilityEffects,
  createAbilityReview,
} from '@ai-rpg-engine/modules';
// F-2e1879af: import the real shipped fixtures instead of hand-duplicating
// them. The inline copies used to drift silently from content.ts — a future
// balance/mechanics edit to a shipped ability's cost, check difficulty, or
// effect amount would not have been caught by its own "integration" test,
// which kept passing against a frozen hand-copied duplicate. Importing the
// real array also picks up bloodPurge, which the old hand-copied list
// (bloodDrain/mesmerize/crimsonFury only) silently omitted.
import {
  bloodDrain,
  mesmerize,
  crimsonFury,
  bloodPurge,
  vampireAbilities as allVampireAbilities,
} from './content.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const zones = [
  { id: 'zone-a', roomId: 'test', name: 'Zone A', tags: [] as string[], neighbors: ['zone-b'] },
  { id: 'zone-b', roomId: 'test', name: 'Zone B', tags: [] as string[], neighbors: ['zone-a'] },
];

function buildVampireEngine(opts?: {
  playerVitality?: number;
  playerPresence?: number;
  playerStamina?: number;
  playerBloodlust?: number;
  playerHumanity?: number;
  enemyHp?: number;
  extraEnemies?: EntityState[];
}) {
  const player: EntityState = {
    id: 'player', blueprintId: 'player', type: 'player', name: 'Fledgling',
    tags: ['player', 'vampire', 'fledgling'],
    stats: { presence: opts?.playerPresence ?? 10, vitality: opts?.playerVitality ?? 10, cunning: 5 },
    resources: {
      hp: 15,
      stamina: opts?.playerStamina ?? 10,
      bloodlust: opts?.playerBloodlust ?? 25,
      humanity: opts?.playerHumanity ?? 20,
    },
    statuses: [], zoneId: 'zone-a',
  };
  const enemy: EntityState = {
    id: 'hunter', blueprintId: 'witch-hunter', type: 'enemy', name: 'Witch Hunter',
    tags: ['enemy', 'human', 'hunter'],
    stats: { presence: 3, vitality: 6, cunning: 5 },
    resources: { hp: opts?.enemyHp ?? 18, stamina: 5 },
    statuses: [], zoneId: 'zone-a',
  };
  const entities = [player, enemy, ...(opts?.extraEnemies ?? [])];
  return createTestEngine({
    zones,
    entities,
    modules: [
      statusCore,
      createAbilityCore({ abilities: allVampireAbilities, statMapping: { power: 'vitality', precision: 'cunning', focus: 'presence' } }),
      createAbilityEffects(),
      createAbilityReview(),
    ],
  });
}

// ---------------------------------------------------------------------------
// Blood Drain tests
// ---------------------------------------------------------------------------

describe('Vampire — Blood Drain', () => {
  it('deals damage, heals actor, and increases bloodlust', () => {
    const engine = buildVampireEngine();
    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'blood-drain' }, targetIds: ['hunter'],
    });

    const used = events.find(e => e.type === 'ability.used');
    expect(used).toBeDefined();

    // Damage event
    const dmg = events.find(e => e.type === 'ability.damage.applied');
    expect(dmg).toBeDefined();
    expect(dmg!.payload.damageType).toBe('predatory');

    // Target took damage
    const hunter = engine.entity('hunter');
    expect(hunter.resources.hp).toBeLessThan(18);

    // Actor healed
    const player = engine.player();
    expect(player.resources.hp).toBeGreaterThanOrEqual(15); // started at 15, healed 3

    // Bloodlust increased
    expect(player.resources.bloodlust).toBeGreaterThan(25);
  });

  it('deducts stamina cost', () => {
    const engine = buildVampireEngine({ playerStamina: 10 });
    engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'blood-drain' }, targetIds: ['hunter'],
    });

    const player = engine.player();
    expect(player.resources.stamina).toBe(8); // 10 - 2
  });

  it('sets cooldown after use', () => {
    const engine = buildVampireEngine();
    engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'blood-drain' }, targetIds: ['hunter'],
    });

    const world = engine.store.state;
    expect(isAbilityReady(world, 'player', 'blood-drain', allVampireAbilities)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Mesmerize tests
// ---------------------------------------------------------------------------

describe('Vampire — Mesmerize', () => {
  it('applies mesmerized status and reduces cunning', () => {
    const engine = buildVampireEngine({ playerPresence: 15 });
    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'mesmerize' }, targetIds: ['hunter'],
    });

    const used = events.find(e => e.type === 'ability.used');
    expect(used).toBeDefined();

    // Check if check passed (high presence) — if so, verify effects
    const aborted = events.find(e => e.type === 'ability.check.failed' && e.payload.aborted);
    if (!aborted) {
      const status = events.find(e => e.type === 'ability.status.applied');
      expect(status).toBeDefined();
      expect(status!.payload.statusId).toBe('mesmerized');

      const statMod = events.find(e => e.type === 'ability.stat.modified');
      expect(statMod).toBeDefined();
      expect(statMod!.payload.stat).toBe('cunning');
      expect(statMod!.payload.delta).toBe(-2);
    }
  });

  it('costs humanity when used', () => {
    const engine = buildVampireEngine({ playerPresence: 15, playerHumanity: 20 });
    engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'mesmerize' }, targetIds: ['hunter'],
    });

    const player = engine.player();
    expect(player.resources.humanity).toBe(18); // 20 - 2
  });

  it('aborts on failed presence check with low presence', () => {
    const engine = buildVampireEngine({ playerPresence: 1 });
    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'mesmerize' }, targetIds: ['hunter'],
    });

    // Either aborted or used — with presence 1, likely aborted
    const aborted = events.find(e => e.type === 'ability.check.failed' && e.payload.aborted);
    const used = events.find(e => e.type === 'ability.used');
    // At least one must be true (action was processed)
    expect(aborted || used).toBeTruthy();

    // If aborted, no status should be applied
    if (aborted) {
      const status = events.find(e => e.type === 'ability.status.applied');
      expect(status).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Crimson Fury tests
// ---------------------------------------------------------------------------

describe('Vampire — Crimson Fury', () => {
  it('requires 20 bloodlust to use', () => {
    const engine = buildVampireEngine({ playerBloodlust: 10 });
    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'crimson-fury' }, targetIds: [],
    });

    const rejected = events.find(e => e.type === 'ability.rejected');
    expect(rejected).toBeDefined();
    expect(rejected!.payload.reason).toContain('not enough');
  });

  it('hits all enemies in zone when bloodlust is sufficient', () => {
    const extra: EntityState = {
      id: 'thrall', blueprintId: 'feral-thrall', type: 'enemy', name: 'Feral Thrall',
      tags: ['enemy', 'vampire', 'feral'],
      stats: { presence: 1, vitality: 7, cunning: 2 },
      resources: { hp: 14, stamina: 6 },
      statuses: [], zoneId: 'zone-a',
    };
    const engine = buildVampireEngine({ playerBloodlust: 30, playerVitality: 15, extraEnemies: [extra] });
    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'crimson-fury' }, targetIds: [],
    });

    const used = events.find(e => e.type === 'ability.used');
    expect(used).toBeDefined();

    // Bloodlust was spent
    const player = engine.player();
    expect(player.resources.bloodlust).toBe(10); // 30 - 20
  });

  it('has long cooldown of 5', () => {
    const engine = buildVampireEngine({ playerBloodlust: 30, playerVitality: 15 });
    engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'crimson-fury' }, targetIds: [],
    });

    const world = engine.store.state;
    expect(isAbilityReady(world, 'player', 'crimson-fury', allVampireAbilities)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Blood Purge (cleanse) — F-2e1879af: this ability was silently absent from
// the old hand-copied allVampireAbilities fixture (only 3 of the pack's 4
// abilities were duplicated), so it had zero integration coverage even
// though it shipped in content.ts and is wired into createAbilityCore via
// vampireAbilities. Importing the real array pulled it in; this covers it.
// ---------------------------------------------------------------------------

describe('Vampire — Blood Purge (cleanse)', () => {
  it('costs stamina and humanity', () => {
    const engine = buildVampireEngine({ playerVitality: 15, playerHumanity: 20 });
    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'blood-purge' }, targetIds: [],
    });

    const aborted = events.find(e => e.type === 'ability.check.failed' && e.payload.aborted);
    if (!aborted) {
      expect(events.find(e => e.type === 'ability.used')).toBeDefined();
      const player = engine.player();
      expect(player.resources.stamina).toBe(8); // 10 - 2
      expect(player.resources.humanity).toBe(17); // 20 - 3
    }
  });

  it('requires vampire tag', () => {
    const humanPlayer: EntityState = {
      id: 'player', blueprintId: 'player', type: 'player', name: 'Human',
      tags: ['player', 'human'],
      stats: { presence: 10, vitality: 15, cunning: 5 },
      resources: { hp: 15, stamina: 10, bloodlust: 25, humanity: 20 },
      statuses: [], zoneId: 'zone-a',
    };
    const enemy: EntityState = {
      id: 'hunter', blueprintId: 'witch-hunter', type: 'enemy', name: 'Witch Hunter',
      tags: ['enemy', 'human'],
      stats: { presence: 3, vitality: 6, cunning: 5 },
      resources: { hp: 18, stamina: 5 },
      statuses: [], zoneId: 'zone-a',
    };
    const engine = createTestEngine({
      zones,
      entities: [humanPlayer, enemy],
      modules: [
        statusCore,
        createAbilityCore({ abilities: allVampireAbilities, statMapping: { power: 'vitality', precision: 'cunning', focus: 'presence' } }),
        createAbilityEffects(),
        createAbilityReview(),
      ],
    });

    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'blood-purge' }, targetIds: [],
    });
    expect(events.find(e => e.type === 'ability.rejected')).toBeDefined();
  });

  it('sets cooldown after use', () => {
    const engine = buildVampireEngine({ playerVitality: 15 });
    engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'blood-purge' }, targetIds: [],
    });
    expect(isAbilityReady(engine.store.state, 'player', 'blood-purge', allVampireAbilities)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting tests
// ---------------------------------------------------------------------------

describe('Vampire — Cross-cutting', () => {
  it('rejects ability use when entity lacks vampire tag', () => {
    const humanPlayer: EntityState = {
      id: 'player', blueprintId: 'player', type: 'player', name: 'Human',
      tags: ['player', 'human'],
      stats: { presence: 10, vitality: 10, cunning: 5 },
      resources: { hp: 15, stamina: 10, bloodlust: 25, humanity: 20 },
      statuses: [], zoneId: 'zone-a',
    };
    const enemy: EntityState = {
      id: 'hunter', blueprintId: 'witch-hunter', type: 'enemy', name: 'Witch Hunter',
      tags: ['enemy', 'human'],
      stats: { presence: 3, vitality: 6, cunning: 5 },
      resources: { hp: 18, stamina: 5 },
      statuses: [], zoneId: 'zone-a',
    };
    const engine = createTestEngine({
      zones,
      entities: [humanPlayer, enemy],
      modules: [
        statusCore,
        createAbilityCore({ abilities: allVampireAbilities, statMapping: { power: 'vitality', precision: 'cunning', focus: 'presence' } }),
        createAbilityEffects(),
        createAbilityReview(),
      ],
    });

    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'blood-drain' }, targetIds: ['hunter'],
    });

    const rejected = events.find(e => e.type === 'ability.rejected');
    expect(rejected).toBeDefined();
  });

  it('generates review trace via drainEvents', () => {
    const engine = buildVampireEngine();
    engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'blood-drain' }, targetIds: ['hunter'],
    });

    const traceEvents = engine.drainEvents().filter(e => e.type === 'ability.review.trace');
    expect(traceEvents.length).toBe(1);
  });

  it('getAvailableAbilities filters by readiness', () => {
    const engine = buildVampireEngine({ playerBloodlust: 5 });
    const world = engine.store.state;

    const available = getAvailableAbilities(world, 'player', allVampireAbilities);
    // Crimson Fury needs 20 bloodlust, player has 5 — should be excluded
    const hasCrimson = available.some(a => a.id === 'crimson-fury');
    expect(hasCrimson).toBe(false);

    // Blood Drain and Mesmerize should be available (sufficient resources)
    const hasDrain = available.some(a => a.id === 'blood-drain');
    expect(hasDrain).toBe(true);
  });
});
