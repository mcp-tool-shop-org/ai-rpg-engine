// combat-builders.test.ts (F-64580086) — buildCombatFormulas' isAlly wiring.
//
// combat-core.ts already implements a full companion-interception mechanic
// (isAlly/shouldIntercept/interceptChance, the INTERCEPT_ROLE_BONUS table)
// covered by combat-states.test.ts — but every one of those tests hand-builds
// a CombatFormulas object with isAlly set directly
// (`isAlly: (id) => id === 'companion'`). Every SHIPPED starter instead
// wires combat through buildCombatFormulas/buildCombatStack, and THAT path
// never set isAlly — so the mechanic was 100% dark in real play regardless of
// party contents. These tests exercise the DX-helper path specifically: RED
// (bare createCombatCore(), no isAlly) proves the pre-fix dark state;
// GREEN (createCombatCore(buildCombatFormulas(mapping))) proves the fix.

import { describe, it, expect } from 'vitest';
import { createTestEngine } from '@ai-rpg-engine/core';
import type { EntityState } from '@ai-rpg-engine/core';
import { buildCombatFormulas } from './combat-builders.js';
import { createCombatCore, DEFAULT_STAT_MAPPING, defaultInterceptChance } from './combat-core.js';
import { statusCore } from './status-core.js';

const makePlayer = (zoneId: string, overrides?: Partial<EntityState>): EntityState => ({
  id: 'player',
  blueprintId: 'player',
  type: 'player',
  name: 'Hero',
  tags: ['player'],
  stats: { vigor: 5, instinct: 5, will: 3 },
  resources: { hp: 20, stamina: 5 },
  statuses: [],
  zoneId,
  ...overrides,
});

const makeEntity = (id: string, name: string, zoneId: string, overrides?: Partial<EntityState>): EntityState => ({
  id,
  blueprintId: id,
  type: 'enemy',
  name,
  tags: ['enemy'],
  stats: { vigor: 5, instinct: 5, will: 3 },
  resources: { hp: 20, stamina: 5 },
  statuses: [],
  zoneId,
  ...overrides,
});

describe('buildCombatFormulas — isAlly (F-64580086)', () => {
  it('unit: isAlly resolves purely from live entity tags — true for "companion", false otherwise', () => {
    const formulas = buildCombatFormulas(DEFAULT_STAT_MAPPING);
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore()],
      entities: [
        makePlayer('a'),
        makeEntity('ally', 'Ally', 'a', { tags: ['companion'] }),
        makeEntity('thug', 'Thug', 'a'),
      ],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });
    expect(formulas.isAlly).toBeDefined();
    expect(formulas.isAlly!('ally', engine.world)).toBe(true);
    expect(formulas.isAlly!('thug', engine.world)).toBe(false);
    expect(formulas.isAlly!('does-not-exist', engine.world)).toBe(false);
  });

  it('RED: a bare createCombatCore() (no isAlly) never intercepts, even with a companion-tagged ally present', () => {
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore()], // pre-fix shape: no formulas at all
      entities: [
        makePlayer('a'),
        makeEntity('ally', 'Ally', 'a', { tags: ['enemy', 'companion', 'companion:fighter'] }),
        makeEntity('thug', 'Thug', 'a', { stats: { vigor: 20, instinct: 50, will: 3 } }),
      ],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
      playerId: 'player',
      seed: 0,
    });

    for (let tick = 1; tick <= 30; tick++) {
      engine.world.entities.player.resources.hp = 20;
      engine.world.entities.ally.resources.hp = 20;
      engine.world.entities.thug.resources.stamina = 5;
      const events = engine.submitActionAs('thug', 'attack', { targetIds: ['player'] });
      expect(events.some((e) => e.type === 'combat.companion.intercepted')).toBe(false);
    }
  });

  it('GREEN: createCombatCore(buildCombatFormulas(mapping)) — the exact wiring every starter uses — intercepts for a companion-tagged ally', () => {
    const formulas = { ...buildCombatFormulas(DEFAULT_STAT_MAPPING), interceptChance: () => 100 };
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore(formulas)],
      entities: [
        makePlayer('a'),
        makeEntity('ally', 'Ally', 'a', { tags: ['enemy', 'companion', 'companion:fighter'] }),
        makeEntity('thug', 'Thug', 'a', { stats: { vigor: 20, instinct: 50, will: 3 } }),
      ],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
      playerId: 'player',
      seed: 0,
    });

    for (let tick = 1; tick <= 30; tick++) {
      engine.world.entities.player.resources.hp = 20;
      engine.world.entities.ally.resources.hp = 20;
      engine.world.entities.thug.resources.stamina = 5;
      const events = engine.submitActionAs('thug', 'attack', { targetIds: ['player'] });
      const intercepted = events.find((e) => e.type === 'combat.companion.intercepted');
      if (intercepted) {
        expect(intercepted.payload.interceptorId).toBe('ally');
        expect(engine.world.entities.player.resources.hp).toBe(20); // player untouched
        return;
      }
    }
    expect.unreachable('expected at least one interception through the buildCombatFormulas wiring');
  });

  it('INTERCEPT_ROLE_BONUS activates through the companion:<role> tag this wave writes (F-2fe4be26) — a fighter escort is meaningfully more likely to step in than a healer escort', () => {
    const mapping = DEFAULT_STAT_MAPPING;
    const engine = createTestEngine({
      modules: [statusCore, createCombatCore()],
      entities: [makePlayer('a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });
    const target = engine.world.entities.player;

    const fighter = makeEntity('fighter', 'Fighter', 'a', { tags: ['companion', 'companion:fighter'] });
    const healer = makeEntity('healer', 'Healer', 'a', { tags: ['companion', 'companion:healer'] });

    // Same stats/HP/morale baseline for both — the ONLY difference is the
    // role tag buildCombatFormulas' isAlly path now makes reachable in play.
    const fighterChance = defaultInterceptChance(fighter, target, engine.world, mapping);
    const healerChance = defaultInterceptChance(healer, target, engine.world, mapping);
    expect(fighterChance - healerChance).toBe(16); // +8 (fighter) − (−8) (healer), INTERCEPT_ROLE_BONUS
  });
});
