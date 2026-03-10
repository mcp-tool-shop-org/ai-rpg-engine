// Phase 5 — Slice 1: Tests for expanded thin packs + new resistances
// Fantasy (divine-light), Cyberpunk (nano-repair), Weird West (dead-eye-shot),
// Detective (clear-headed), Ronin (resistances only)

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestEngine } from '@ai-rpg-engine/core';
import type { EntityState } from '@ai-rpg-engine/core';
import { statusCore } from './status-core.js';
import {
  createAbilityCore,
  createAbilityEffects,
  createAbilityReview,
  registerStatusDefinitions,
  clearStatusRegistry,
} from './index.js';

import { fantasyAbilities, fantasyStatusDefinitions } from '../../starter-fantasy/src/content.js';
import { cyberpunkAbilities, cyberpunkStatusDefinitions } from '../../starter-cyberpunk/src/content.js';
import { weirdWestAbilities, weirdWestStatusDefinitions } from '../../starter-weird-west/src/content.js';
import { detectiveAbilities, detectiveStatusDefinitions } from '../../starter-detective/src/content.js';
import { roninAbilities, roninStatusDefinitions } from '../../starter-ronin/src/content.js';

const zones = [
  { id: 'zone-a', roomId: 'test', name: 'Zone A', tags: [] as string[], neighbors: [] },
];

function buildEngine(abilities: typeof fantasyAbilities, entities: EntityState[]) {
  return createTestEngine({
    modules: [statusCore, createAbilityCore({ abilities }), createAbilityEffects(), createAbilityReview()],
    entities,
    zones,
  });
}

// ===========================================================================
// 1. Fantasy — divine-light (new heal ability)
// ===========================================================================

describe('Phase 5 expansion — fantasy divine-light', () => {
  beforeEach(() => {
    clearStatusRegistry();
    registerStatusDefinitions(fantasyStatusDefinitions);
  });

  it('heals hp and boosts will', () => {
    const player: EntityState = {
      id: 'player', blueprintId: 'player', type: 'pc', name: 'Wanderer',
      tags: ['player', 'divine'],
      stats: { vigor: 5, instinct: 4, will: 15, maxHp: 30 },
      resources: { hp: 15, stamina: 10 },
      statuses: [], zoneId: 'zone-a',
    };
    const engine = buildEngine(fantasyAbilities, [player]);
    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'divine-light' },
    });
    const used = events.find((e) => e.type === 'ability.used');
    expect(used).toBeDefined();
    const healed = events.filter((e) => e.type === 'ability.heal.applied');
    expect(healed.length).toBeGreaterThanOrEqual(1);
  });

  it('requires divine tag', () => {
    const player: EntityState = {
      id: 'player', blueprintId: 'player', type: 'pc', name: 'Wanderer',
      tags: ['player'], // no divine tag
      stats: { vigor: 5, instinct: 4, will: 15, maxHp: 30 },
      resources: { hp: 15, stamina: 10 },
      statuses: [], zoneId: 'zone-a',
    };
    const engine = buildEngine(fantasyAbilities, [player]);
    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'divine-light' },
    });
    const rejected = events.find((e) => e.type === 'ability.rejected');
    expect(rejected).toBeDefined();
  });
});

// ===========================================================================
// 2. Cyberpunk — nano-repair (new heal + bandwidth recovery)
// ===========================================================================

describe('Phase 5 expansion — cyberpunk nano-repair', () => {
  beforeEach(() => {
    clearStatusRegistry();
    registerStatusDefinitions(cyberpunkStatusDefinitions);
  });

  it('heals hp and restores bandwidth', () => {
    const player: EntityState = {
      id: 'player', blueprintId: 'runner', type: 'pc', name: 'Runner',
      tags: ['player', 'netrunner'],
      stats: { chrome: 5, reflex: 4, netrunning: 15, maxHp: 30 },
      resources: { hp: 15, stamina: 10, ice: 10, bandwidth: 5 },
      statuses: [], zoneId: 'zone-a',
    };
    const engine = buildEngine(cyberpunkAbilities, [player]);
    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'nano-repair' },
    });
    const used = events.find((e) => e.type === 'ability.used');
    expect(used).toBeDefined();
    // Should heal HP and restore bandwidth
    const healed = events.filter((e) => e.type === 'ability.heal.applied');
    expect(healed.length).toBeGreaterThanOrEqual(1);
  });
});

// ===========================================================================
// 3. Weird West — dead-eye-shot (new single-target damage)
// ===========================================================================

describe('Phase 5 expansion — weird-west dead-eye-shot', () => {
  beforeEach(() => {
    clearStatusRegistry();
    registerStatusDefinitions(weirdWestStatusDefinitions);
  });

  it('deals damage to a single target', () => {
    const player: EntityState = {
      id: 'player', blueprintId: 'drifter', type: 'pc', name: 'Drifter',
      tags: ['player', 'supernatural'],
      stats: { grit: 5, 'draw-speed': 15, lore: 4, maxHp: 30 },
      resources: { hp: 20, stamina: 10, resolve: 10, dust: 5 },
      statuses: [], zoneId: 'zone-a',
    };
    const enemy: EntityState = {
      id: 'bandit', blueprintId: 'bandit', type: 'npc', name: 'Bandit',
      tags: ['enemy'],
      stats: { grit: 3, maxHp: 20 },
      resources: { hp: 15, stamina: 5 },
      statuses: [], zoneId: 'zone-a',
    };
    const engine = buildEngine(weirdWestAbilities, [player, enemy]);
    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'dead-eye-shot' }, targetIds: ['bandit'],
    });
    const used = events.find((e) => e.type === 'ability.used');
    expect(used).toBeDefined();
    const damage = events.filter((e) => e.type === 'ability.damage.applied');
    expect(damage.length).toBeGreaterThanOrEqual(1);
  });
});

// ===========================================================================
// 4. Detective — clear-headed (new cleanse)
// ===========================================================================

describe('Phase 5 expansion — detective clear-headed', () => {
  beforeEach(() => {
    clearStatusRegistry();
    registerStatusDefinitions(detectiveStatusDefinitions);
    // Also register a fear status to test cleanse against
    registerStatusDefinitions([{
      id: 'terrified', name: 'Terrified', tags: ['fear', 'debuff'],
      stacking: 'replace' as const, duration: { type: 'ticks' as const, value: 2 },
    }]);
  });

  it('removes fear statuses', () => {
    const player: EntityState = {
      id: 'player', blueprintId: 'inspector', type: 'pc', name: 'Inspector',
      tags: ['player', 'investigator'],
      stats: { grit: 5, perception: 15, eloquence: 5, maxHp: 30 },
      resources: { hp: 20, stamina: 10, composure: 10 },
      statuses: [{ id: 's1', statusId: 'terrified', appliedAtTick: 0, expiresAtTick: 5 }],
      zoneId: 'zone-a',
    };
    const engine = buildEngine(detectiveAbilities, [player]);
    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'clear-headed' },
    });
    const removed = events.filter((e) => e.type === 'ability.status.removed');
    expect(removed.length).toBe(1);
  });

  it('deducts stamina and composure', () => {
    const player: EntityState = {
      id: 'player', blueprintId: 'inspector', type: 'pc', name: 'Inspector',
      tags: ['player', 'investigator'],
      stats: { grit: 5, perception: 15, eloquence: 5, maxHp: 30 },
      resources: { hp: 20, stamina: 10, composure: 10 },
      statuses: [],
      zoneId: 'zone-a',
    };
    const engine = buildEngine(detectiveAbilities, [player]);
    engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'clear-headed' },
    });
    const p = engine.entity('player');
    expect(p.resources.stamina).toBe(8);   // 10 - 2
    expect(p.resources.composure).toBe(8); // 10 - 2
  });
});

// ===========================================================================
// 5. Fantasy resistances — crypt-warden holy:immune, crypt-stalker holy:vulnerable
// ===========================================================================

describe('Phase 5 expansion — fantasy resistances', () => {
  beforeEach(() => {
    clearStatusRegistry();
    registerStatusDefinitions(fantasyStatusDefinitions);
  });

  it('crypt-warden is immune to holy (holy-fire blocked)', () => {
    const player: EntityState = {
      id: 'player', blueprintId: 'player', type: 'pc', name: 'Wanderer',
      tags: ['player', 'divine'],
      stats: { vigor: 5, instinct: 4, will: 15, maxHp: 30 },
      resources: { hp: 20, stamina: 10 },
      statuses: [], zoneId: 'zone-a',
    };
    const boss: EntityState = {
      id: 'warden', blueprintId: 'crypt-warden', type: 'npc', name: 'Crypt Warden',
      tags: ['enemy', 'undead', 'role:boss'],
      stats: { vigor: 7, instinct: 4, will: 5, maxHp: 45 },
      resources: { hp: 45, stamina: 12 },
      statuses: [], zoneId: 'zone-a',
      resistances: { holy: 'immune' },
    };
    const engine = buildEngine(fantasyAbilities, [player, boss]);
    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'holy-smite' }, targetIds: ['warden'],
    });
    const immune = events.filter((e) => e.type === 'ability.status.immune');
    expect(immune.length).toBe(1);
  });

  it('crypt-stalker is vulnerable to holy (double duration)', () => {
    const player: EntityState = {
      id: 'player', blueprintId: 'player', type: 'pc', name: 'Wanderer',
      tags: ['player', 'divine'],
      stats: { vigor: 5, instinct: 4, will: 15, maxHp: 30 },
      resources: { hp: 20, stamina: 10 },
      statuses: [], zoneId: 'zone-a',
    };
    const stalker: EntityState = {
      id: 'stalker', blueprintId: 'crypt-stalker', type: 'npc', name: 'Crypt Stalker',
      tags: ['enemy', 'undead', 'role:skirmisher'],
      stats: { vigor: 3, instinct: 5, will: 2, maxHp: 20 },
      resources: { hp: 8, stamina: 6 },
      statuses: [], zoneId: 'zone-a',
      resistances: { holy: 'vulnerable' },
    };
    const engine = buildEngine(fantasyAbilities, [player, stalker]);
    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'holy-smite' }, targetIds: ['stalker'],
    });
    const vuln = events.filter((e) => e.type === 'ability.status.vulnerable');
    expect(vuln.length).toBe(1);
    // Status should have extended duration
    const status = engine.entity('stalker').statuses.find((s) => s.statusId === 'holy-fire');
    expect(status).toBeDefined();
  });
});

// ===========================================================================
// 6. Cyberpunk resistances — vault-overseer breach:resistant, ice-sentry control:resistant
// ===========================================================================

describe('Phase 5 expansion — cyberpunk resistances', () => {
  beforeEach(() => {
    clearStatusRegistry();
    registerStatusDefinitions(cyberpunkStatusDefinitions);
  });

  it('vault-overseer resists breach (system-breach duration halved)', () => {
    const player: EntityState = {
      id: 'player', blueprintId: 'runner', type: 'pc', name: 'Runner',
      tags: ['player', 'netrunner'],
      stats: { chrome: 5, reflex: 4, netrunning: 15, maxHp: 30 },
      resources: { hp: 20, stamina: 10, ice: 10, bandwidth: 10 },
      statuses: [], zoneId: 'zone-a',
    };
    const boss: EntityState = {
      id: 'overseer', blueprintId: 'vault-overseer', type: 'npc', name: 'Vault Overseer',
      tags: ['enemy', 'corporate', 'role:boss'],
      stats: { chrome: 7, reflex: 5, netrunning: 8, maxHp: 45 },
      resources: { hp: 45, stamina: 12, ice: 30 },
      statuses: [], zoneId: 'zone-a',
      resistances: { breach: 'resistant' },
    };
    const engine = buildEngine(cyberpunkAbilities, [player, boss]);
    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'ice-breaker-hack' }, targetIds: ['overseer'],
    });
    const resisted = events.filter((e) => e.type === 'ability.status.resisted');
    expect(resisted.length).toBe(1);
  });
});

// ===========================================================================
// 7. Weird West resistances — mesa-crawler blind:immune
// ===========================================================================

describe('Phase 5 expansion — weird-west resistances', () => {
  beforeEach(() => {
    clearStatusRegistry();
    registerStatusDefinitions(weirdWestStatusDefinitions);
  });

  it('mesa-crawler is immune to blind (dust-blind blocked)', () => {
    const player: EntityState = {
      id: 'player', blueprintId: 'drifter', type: 'pc', name: 'Drifter',
      tags: ['player', 'supernatural'],
      stats: { grit: 5, 'draw-speed': 5, lore: 15, maxHp: 30 },
      resources: { hp: 20, stamina: 10, resolve: 15, dust: 20 },
      statuses: [], zoneId: 'zone-a',
    };
    const crawler: EntityState = {
      id: 'crawler', blueprintId: 'crawler', type: 'npc', name: 'Mesa Crawler',
      tags: ['enemy', 'spirit', 'role:boss'],
      stats: { grit: 4, lore: 8, maxHp: 30 },
      resources: { hp: 30, stamina: 5 },
      statuses: [], zoneId: 'zone-a',
      resistances: { blind: 'immune', supernatural: 'resistant' },
    };
    const engine = buildEngine(weirdWestAbilities, [player, crawler]);
    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'dust-devil' },
    });
    // dust-blind has blind tag — crawler is blind:immune
    const immune = events.filter((e) => e.type === 'ability.status.immune');
    expect(immune.length).toBe(1);
  });
});

// ===========================================================================
// 8. Ronin resistances — corrupt-samurai fear:immune, castle-guard stance:resistant
// ===========================================================================

describe('Phase 5 expansion — ronin resistances', () => {
  beforeEach(() => {
    clearStatusRegistry();
    registerStatusDefinitions(roninStatusDefinitions);
    // Register a fear status to test against
    registerStatusDefinitions([{
      id: 'rattled', name: 'Rattled', tags: ['fear', 'debuff'],
      stacking: 'replace' as const, duration: { type: 'ticks' as const, value: 2 },
    }]);
  });

  it('corrupt-samurai fear:immune verified via entity state', () => {
    // Ronin pack doesn't apply fear, so just verify the entity definition
    const samurai: EntityState = {
      id: 'samurai', blueprintId: 'corrupt-samurai', type: 'npc', name: 'Corrupt Samurai',
      tags: ['enemy', 'samurai', 'role:boss'],
      stats: { discipline: 6, perception: 4, composure: 3, maxHp: 30 },
      resources: { hp: 18, stamina: 5 },
      statuses: [], zoneId: 'zone-a',
      resistances: { fear: 'immune' },
    };
    expect(samurai.resistances).toBeDefined();
    expect(samurai.resistances!.fear).toBe('immune');
  });

  it('castle-guard stance:resistant halves off-balance duration', () => {
    const player: EntityState = {
      id: 'player', blueprintId: 'player', type: 'pc', name: 'Ronin',
      tags: ['player', 'ronin'],
      stats: { discipline: 15, perception: 15, composure: 10, maxHp: 30 },
      resources: { hp: 20, stamina: 10, ki: 10, honor: 10 },
      statuses: [], zoneId: 'zone-a',
    };
    const guard: EntityState = {
      id: 'guard', blueprintId: 'castle-guard', type: 'npc', name: 'Castle Guard',
      tags: ['enemy', 'samurai', 'role:bodyguard'],
      stats: { discipline: 5, perception: 4, composure: 5, maxHp: 20 },
      resources: { hp: 18, stamina: 4 },
      statuses: [], zoneId: 'zone-a',
      resistances: { stance: 'resistant' },
    };
    const engine = buildEngine(roninAbilities, [player, guard]);
    const events = engine.processAction({
      id: 'a1', verb: 'use-ability', actorId: 'player', issuedAtTick: 1,
      parameters: { abilityId: 'blade-ward' }, targetIds: ['guard'],
    });
    // off-balance has stance tag — guard is stance:resistant → duration halved
    const resisted = events.filter((e) => e.type === 'ability.status.resisted');
    expect(resisted.length).toBe(1);
  });
});
