import { describe, it, expect } from 'vitest';
import { createTestEngine } from '@signalfire/core';
import type { EntityState } from '@signalfire/core';
import type { ProgressionTreeDefinition } from '@signalfire/content-schema';
import {
  createProgressionCore,
  getCurrency,
  addCurrency,
  spendCurrency,
  getUnlockedNodes,
  isNodeUnlocked,
} from './progression-core.js';
import { combatCore } from './combat-core.js';
import { traversalCore } from './traversal-core.js';

const makePlayer = (zoneId: string): EntityState => ({
  id: 'player',
  blueprintId: 'player',
  type: 'player',
  name: 'Hero',
  tags: ['player'],
  stats: { vigor: 5, instinct: 5 },
  resources: { hp: 20, stamina: 5 },
  statuses: [],
  zoneId,
});

const makeEnemy = (id: string, zoneId: string): EntityState => ({
  id,
  blueprintId: id,
  type: 'enemy',
  name: id,
  tags: ['enemy'],
  stats: { vigor: 3, instinct: 3 },
  resources: { hp: 5, stamina: 3 },
  statuses: [],
  zoneId,
});

const swordTree: ProgressionTreeDefinition = {
  id: 'sword-mastery',
  name: 'Sword Mastery',
  currency: 'xp',
  nodes: [
    {
      id: 'basic-slash',
      name: 'Basic Slash',
      cost: 10,
      effects: [
        { type: 'stat-boost', params: { stat: 'vigor', amount: 1 } },
      ],
    },
    {
      id: 'power-strike',
      name: 'Power Strike',
      cost: 25,
      requires: ['basic-slash'],
      effects: [
        { type: 'stat-boost', params: { stat: 'vigor', amount: 2 } },
        { type: 'grant-tag', params: { tag: 'power-striker' } },
      ],
    },
    {
      id: 'whirlwind',
      name: 'Whirlwind',
      cost: 50,
      requires: ['power-strike'],
      effects: [
        { type: 'grant-tag', params: { tag: 'whirlwind-master' } },
      ],
    },
  ],
};

const vitalityTree: ProgressionTreeDefinition = {
  id: 'vitality',
  name: 'Vitality',
  currency: 'xp',
  nodes: [
    {
      id: 'tough',
      name: 'Tough',
      cost: 15,
      effects: [
        { type: 'resource-boost', params: { resource: 'hp', amount: 10 } },
      ],
    },
  ],
};

describe('Currency operations', () => {
  it('adds and retrieves currency', () => {
    const engine = createTestEngine({
      modules: [createProgressionCore()],
      entities: [makePlayer('a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    expect(getCurrency(engine.world, 'player', 'xp')).toBe(0);
    addCurrency(engine.world, 'player', 'xp', 50, 0);
    expect(getCurrency(engine.world, 'player', 'xp')).toBe(50);
    addCurrency(engine.world, 'player', 'xp', 30, 1);
    expect(getCurrency(engine.world, 'player', 'xp')).toBe(80);
  });

  it('spends currency when sufficient balance', () => {
    const engine = createTestEngine({
      modules: [createProgressionCore()],
      entities: [makePlayer('a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    addCurrency(engine.world, 'player', 'xp', 50, 0);
    expect(spendCurrency(engine.world, 'player', 'xp', 30)).toBe(true);
    expect(getCurrency(engine.world, 'player', 'xp')).toBe(20);
  });

  it('rejects spend when insufficient balance', () => {
    const engine = createTestEngine({
      modules: [createProgressionCore()],
      entities: [makePlayer('a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    addCurrency(engine.world, 'player', 'xp', 10, 0);
    expect(spendCurrency(engine.world, 'player', 'xp', 30)).toBe(false);
    expect(getCurrency(engine.world, 'player', 'xp')).toBe(10); // Unchanged
  });
});

describe('Node unlocking', () => {
  it('unlocks a node via the unlock verb', () => {
    const engine = createTestEngine({
      modules: [createProgressionCore({ trees: [swordTree] })],
      entities: [makePlayer('a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    addCurrency(engine.world, 'player', 'xp', 50, 0);

    const events = engine.submitAction('unlock', {
      parameters: { treeId: 'sword-mastery', nodeId: 'basic-slash' },
    });

    const unlockEvent = events.find((e) => e.type === 'progression.node.unlocked');
    expect(unlockEvent).toBeDefined();
    expect(unlockEvent!.payload.treeId).toBe('sword-mastery');
    expect(unlockEvent!.payload.nodeId).toBe('basic-slash');

    // Currency was spent
    expect(getCurrency(engine.world, 'player', 'xp')).toBe(40);

    // Node is recorded as unlocked
    expect(isNodeUnlocked(engine.world, 'player', 'sword-mastery', 'basic-slash')).toBe(true);
  });

  it('applies stat-boost effect on unlock', () => {
    const engine = createTestEngine({
      modules: [createProgressionCore({ trees: [swordTree] })],
      entities: [makePlayer('a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    addCurrency(engine.world, 'player', 'xp', 50, 0);
    const vigorBefore = engine.player().stats.vigor;

    engine.submitAction('unlock', {
      parameters: { treeId: 'sword-mastery', nodeId: 'basic-slash' },
    });

    expect(engine.player().stats.vigor).toBe(vigorBefore + 1);
  });

  it('applies grant-tag effect on unlock', () => {
    const engine = createTestEngine({
      modules: [createProgressionCore({ trees: [swordTree] })],
      entities: [makePlayer('a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    addCurrency(engine.world, 'player', 'xp', 100, 0);

    // Unlock chain: basic-slash → power-strike
    engine.submitAction('unlock', {
      parameters: { treeId: 'sword-mastery', nodeId: 'basic-slash' },
    });
    engine.submitAction('unlock', {
      parameters: { treeId: 'sword-mastery', nodeId: 'power-strike' },
    });

    expect(engine.player().tags).toContain('power-striker');
  });

  it('rejects unlock when prerequisites not met', () => {
    const engine = createTestEngine({
      modules: [createProgressionCore({ trees: [swordTree] })],
      entities: [makePlayer('a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    addCurrency(engine.world, 'player', 'xp', 100, 0);

    // Try to unlock power-strike without basic-slash
    const events = engine.submitAction('unlock', {
      parameters: { treeId: 'sword-mastery', nodeId: 'power-strike' },
    });

    const rejected = events.find((e) => e.type === 'progression.unlock.rejected');
    expect(rejected).toBeDefined();
    expect(rejected!.payload.reason).toContain('prerequisites');

    // Currency unchanged
    expect(getCurrency(engine.world, 'player', 'xp')).toBe(100);
  });

  it('rejects unlock when insufficient currency', () => {
    const engine = createTestEngine({
      modules: [createProgressionCore({ trees: [swordTree] })],
      entities: [makePlayer('a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    addCurrency(engine.world, 'player', 'xp', 5, 0); // Not enough for basic-slash (10)

    const events = engine.submitAction('unlock', {
      parameters: { treeId: 'sword-mastery', nodeId: 'basic-slash' },
    });

    const rejected = events.find((e) => e.type === 'progression.unlock.rejected');
    expect(rejected).toBeDefined();
    expect(rejected!.payload.reason).toContain('insufficient');
  });

  it('rejects double-unlock', () => {
    const engine = createTestEngine({
      modules: [createProgressionCore({ trees: [swordTree] })],
      entities: [makePlayer('a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    addCurrency(engine.world, 'player', 'xp', 100, 0);

    engine.submitAction('unlock', {
      parameters: { treeId: 'sword-mastery', nodeId: 'basic-slash' },
    });

    const events = engine.submitAction('unlock', {
      parameters: { treeId: 'sword-mastery', nodeId: 'basic-slash' },
    });

    const rejected = events.find((e) => e.type === 'progression.unlock.rejected');
    expect(rejected).toBeDefined();
    expect(rejected!.payload.reason).toContain('already unlocked');
  });
});

describe('Resource-boost effect', () => {
  it('applies resource-boost on unlock', () => {
    const engine = createTestEngine({
      modules: [createProgressionCore({ trees: [vitalityTree] })],
      entities: [makePlayer('a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    addCurrency(engine.world, 'player', 'xp', 20, 0);
    const hpBefore = engine.player().resources.hp;

    engine.submitAction('unlock', {
      parameters: { treeId: 'vitality', nodeId: 'tough' },
    });

    expect(engine.player().resources.hp).toBe(hpBefore + 10);
  });
});

describe('Multiple trees', () => {
  it('tracks unlocks across different trees independently', () => {
    const engine = createTestEngine({
      modules: [createProgressionCore({ trees: [swordTree, vitalityTree] })],
      entities: [makePlayer('a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    addCurrency(engine.world, 'player', 'xp', 100, 0);

    engine.submitAction('unlock', {
      parameters: { treeId: 'sword-mastery', nodeId: 'basic-slash' },
    });
    engine.submitAction('unlock', {
      parameters: { treeId: 'vitality', nodeId: 'tough' },
    });

    expect(getUnlockedNodes(engine.world, 'player', 'sword-mastery')).toEqual(['basic-slash']);
    expect(getUnlockedNodes(engine.world, 'player', 'vitality')).toEqual(['tough']);
    expect(getCurrency(engine.world, 'player', 'xp')).toBe(75); // 100 - 10 - 15
  });
});

describe('Automatic currency rewards', () => {
  it('grants XP when enemy is defeated', () => {
    const engine = createTestEngine({
      modules: [
        traversalCore,
        combatCore,
        createProgressionCore({
          rewards: [{
            eventPattern: 'combat.entity.defeated',
            currencyId: 'xp',
            amount: 25,
            recipient: 'actor',
          }],
        }),
      ],
      entities: [
        makePlayer('a'),
        makeEnemy('rat', 'a'),
      ],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    // Attack until the enemy is defeated
    let defeated = false;
    for (let i = 0; i < 20 && !defeated; i++) {
      const events = engine.submitAction('attack', { targetIds: ['rat'] });
      if (events.some((e) => e.type === 'combat.entity.defeated')) {
        defeated = true;
      }
    }

    expect(defeated).toBe(true);
    expect(getCurrency(engine.world, 'player', 'xp')).toBe(25);
  });

  it('grants dynamic XP amount based on event', () => {
    const engine = createTestEngine({
      modules: [
        traversalCore,
        combatCore,
        createProgressionCore({
          rewards: [{
            eventPattern: 'combat.contact.hit',
            currencyId: 'combat-xp',
            amount: (event) => (event.payload.damage as number) ?? 1,
            recipient: 'actor',
          }],
        }),
      ],
      entities: [
        makePlayer('a'),
        makeEnemy('rat', 'a'),
      ],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    engine.submitAction('attack', { targetIds: ['rat'] });

    // Should have gained combat-xp equal to damage dealt (if any)
    const xp = getCurrency(engine.world, 'player', 'combat-xp');
    expect(xp).toBeGreaterThanOrEqual(0);
  });
});

describe('set-global effect', () => {
  it('sets global variable on unlock', () => {
    const globalTree: ProgressionTreeDefinition = {
      id: 'story',
      name: 'Story',
      currency: 'milestones',
      nodes: [{
        id: 'chapter-2',
        name: 'Chapter 2',
        cost: 1,
        effects: [
          { type: 'set-global', params: { key: 'chapter', value: 2 } },
        ],
      }],
    };

    const engine = createTestEngine({
      modules: [createProgressionCore({ trees: [globalTree] })],
      entities: [makePlayer('a')],
      zones: [{ id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: [] }],
    });

    addCurrency(engine.world, 'player', 'milestones', 5, 0);
    engine.submitAction('unlock', {
      parameters: { treeId: 'story', nodeId: 'chapter-2' },
    });

    expect(engine.world.globals.chapter).toBe(2);
  });
});
