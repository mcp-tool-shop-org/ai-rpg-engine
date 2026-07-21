// F1b — win / lose / ending. Player at 0 HP must produce a DEFEAT ending and
// boss death a VICTORY ending (no more soft-lock / one-line boss kill), framed
// through the engine's endgame-detection when its campaign thresholds fire and
// rendered through campaign-memory's finale machinery.

import { describe, it, expect } from 'vitest';
import { Engine } from '@ai-rpg-engine/core';
import { createGame } from '@ai-rpg-engine/starter-fantasy';
import type { ProgressionTreeDefinition } from '@ai-rpg-engine/content-schema';
import {
  detectBaseOutcome,
  evaluateSessionEnd,
  renderSessionEnd,
  journalFromEventLog,
  buildEndgameInputs,
  computeSessionStats,
  renderSessionStats,
} from './endgame.js';

function makeGame() {
  return createGame(42);
}

describe('detectBaseOutcome (F1b)', () => {
  it('a fresh game has no outcome', () => {
    const engine = makeGame();
    expect(detectBaseOutcome(engine.world)).toBeNull();
  });

  it('player at 0 HP is defeat', () => {
    const engine = makeGame();
    engine.store.state.entities['player'].resources.hp = 0;
    expect(detectBaseOutcome(engine.world)).toBe('defeat');
  });

  it('a missing player entity is defeat, not a crash', () => {
    const engine = makeGame();
    delete engine.store.state.entities['player'];
    expect(detectBaseOutcome(engine.world)).toBe('defeat');
  });

  it('boss down = victory, even with lesser enemies still standing', () => {
    const engine = makeGame();
    engine.store.state.entities['crypt-warden'].resources.hp = 0; // the role:boss
    expect(engine.store.state.entities['ash-ghoul'].resources.hp).toBeGreaterThan(0);
    expect(detectBaseOutcome(engine.world)).toBe('victory');
  });

  it('boss standing = no victory even if every other enemy is down', () => {
    const engine = makeGame();
    engine.store.state.entities['ash-ghoul'].resources.hp = 0;
    engine.store.state.entities['crypt-stalker'].resources.hp = 0;
    expect(detectBaseOutcome(engine.world)).toBeNull();
  });

  it('defeat wins over victory when both hold (dying to the boss\'s death throes)', () => {
    const engine = makeGame();
    engine.store.state.entities['player'].resources.hp = 0;
    engine.store.state.entities['crypt-warden'].resources.hp = 0;
    expect(detectBaseOutcome(engine.world)).toBe('defeat');
  });

  it('bossless packs: victory when every hostile is down, never on an empty roster', () => {
    const engine = new Engine({
      manifest: { id: 't', title: 't', version: '0', engineVersion: '0', ruleset: 't', modules: [], contentPacks: [] },
      seed: 1,
    });
    engine.store.state.zones = { z: { id: 'z', roomId: 'r', name: 'Z', tags: [], neighbors: [] } };
    engine.store.state.locationId = 'z';
    engine.store.addEntity({
      id: 'p', blueprintId: 'p', type: 'player', name: 'P', tags: ['player'],
      stats: {}, resources: { hp: 5 }, statuses: [], zoneId: 'z',
    });
    engine.store.state.playerId = 'p';

    // No hostiles at all → not an instant win.
    expect(detectBaseOutcome(engine.world)).toBeNull();

    engine.store.addEntity({
      id: 'e1', blueprintId: 'e', type: 'enemy', name: 'E1', tags: ['enemy'],
      stats: {}, resources: { hp: 0 }, statuses: [], zoneId: 'z',
    });
    expect(detectBaseOutcome(engine.world)).toBe('victory');
  });
});

describe('evaluateSessionEnd (F1b) — outcome + campaign framing', () => {
  it('plain defeat: base outcome with a narrator line, no campaign trigger for a thin campaign', () => {
    const engine = makeGame();
    engine.store.state.entities['player'].resources.hp = 0;

    const end = evaluateSessionEnd(engine);
    expect(end).not.toBeNull();
    expect(end!.kind).toBe('defeat');
    expect(end!.resolutionClass).toBe('defeat');
    expect(end!.narratorLine.length).toBeGreaterThan(0);
    expect(end!.trigger).toBeNull();
  });

  it('plain victory when the boss falls', () => {
    const engine = makeGame();
    engine.store.state.entities['crypt-warden'].resources.hp = 0;
    const end = evaluateSessionEnd(engine);
    expect(end!.kind).toBe('victory');
    expect(end!.resolutionClass).toBe('victory');
  });

  it('a live session has no end', () => {
    const engine = makeGame();
    expect(evaluateSessionEnd(engine)).toBeNull();
  });

  it('the campaign layer takes over the framing when evaluateEndgame fires (martyrdom: die beloved)', () => {
    const engine = makeGame();
    // A campaign-rich death: positive faction reputation crosses checkMartyrdom's
    // threshold (avgRep >= 20, player dead) — the REAL evaluateEndgame fires.
    engine.store.state.factions['chapel-order'] = {
      id: 'chapel-order', name: 'Chapel Order', reputation: 55, disposition: 'friendly',
    };
    engine.store.state.entities['player'].resources.hp = 0;

    const end = evaluateSessionEnd(engine);
    expect(end!.kind).toBe('defeat');
    expect(end!.trigger).not.toBeNull();
    expect(end!.resolutionClass).toBe('martyrdom');
    // formatEndgameForNarrator's framing, verbatim from the modules layer.
    expect(end!.narratorLine).toContain('Campaign turning point: martyrdom');
  });

  it('buildEndgameInputs reads faction alert/cohesion from the faction-cognition module', () => {
    const engine = makeGame();
    const inputs = buildEndgameInputs(engine.world);
    // starter-fantasy wires chapel-undead into faction-cognition (cohesion 0.7).
    const chapelUndead = inputs.factionStates.find((f) => f.factionId === 'chapel-undead');
    expect(chapelUndead).toBeDefined();
    expect(chapelUndead!.cohesion).toBe(70); // 0-1 scaled to 0-100
  });
});

describe('renderSessionEnd + journalFromEventLog (F1b) — the end screen', () => {
  it('defeat renders a DEFEAT banner, the narrator line, and the finale epilogue', () => {
    const engine = makeGame();
    engine.store.state.entities['player'].resources.hp = 0;
    const end = evaluateSessionEnd(engine)!;

    const screen = renderSessionEnd(end, engine.world);
    expect(screen).toContain('DEFEAT');
    expect(screen).not.toContain('VICTORY');
    expect(screen).toContain(end.narratorLine);
    expect(screen).toContain('CAMPAIGN CONCLUSION');
    expect(screen).toContain('Resolution: DEFEAT');
  });

  it('victory renders a VICTORY banner with key moments from the event log', () => {
    const engine = makeGame();
    // Real events for the journal: the player explores, then the boss falls.
    engine.submitAction('move', { targetIds: ['chapel-nave'] });
    engine.store.emitEvent('combat.entity.defeated', { entityId: 'crypt-warden' }, { actorId: 'player' });
    engine.store.state.entities['crypt-warden'].resources.hp = 0;

    const end = evaluateSessionEnd(engine)!;
    const screen = renderSessionEnd(end, engine.world);
    expect(screen).toContain('VICTORY');
    expect(screen).toContain('KEY MOMENTS');
    expect(screen).toContain('defeated Crypt Warden — the boss falls');
    expect(screen).toContain('Entered Chapel Nave');
  });

  // T0-finale-stats: a live defeat's finale said "Chronicle Events: 2" and
  // little else — too thin a goodbye. The end screen now tallies the run from
  // the events the engine actually emitted.
  it('the end screen carries the run-in-numbers block', () => {
    const engine = makeGame();
    engine.store.state.entities['player'].resources.hp = 0;
    const end = evaluateSessionEnd(engine)!;

    const screen = renderSessionEnd(end, engine.world);
    expect(screen).toContain('THE RUN IN NUMBERS');
    expect(screen).toContain('Rounds Survived:');
    expect(screen).toContain('Enemies Defeated:');
    expect(screen).toContain('Damage Dealt:');
    expect(screen).toContain('Damage Taken:');
    expect(screen).toContain('Abilities Used:');
    expect(screen).toContain('XP Earned:');
    expect(screen).toContain('Advancements Unlocked:');
  });

  it('journalFromEventLog records kills, first-visit discoveries, and unlocks with bounded duplicates', () => {
    const engine = makeGame();
    engine.submitAction('move', { targetIds: ['chapel-nave'] });
    engine.submitAction('move', { targetIds: ['chapel-entrance'] });
    engine.submitAction('move', { targetIds: ['chapel-nave'] }); // revisit — no second discovery
    engine.store.emitEvent('combat.entity.defeated', { entityId: 'ash-ghoul' }, { actorId: 'player' });
    engine.store.emitEvent('progression.node.unlocked', { treeId: 'combat-mastery', nodeId: 'toughened' }, { actorId: 'player' });

    const journal = journalFromEventLog(engine.world);
    const kills = journal.query({ category: 'kill' });
    const discoveries = journal.query({ category: 'discovery' });
    const actions = journal.query({ category: 'action' });

    expect(kills).toHaveLength(1);
    expect(kills[0].targetId).toBe('ash-ghoul');
    // chapel-nave + chapel-entrance discovered once each, revisit ignored.
    expect(discoveries.map((d) => d.zoneId).sort()).toEqual(['chapel-entrance', 'chapel-nave']);
    expect(actions.some((a) => a.description.includes('toughened'))).toBe(true);
  });
});

// T0-finale-stats — the tally is derived ONLY from events the engine emits
// (the formatEventLine vocabulary): combat.damage.applied attribution,
// combat.entity.defeated hostility, ability.used / progression.node.unlocked
// actorship, DoT ticks. XP accrual has no event (progression-core addCurrency
// is silent), so xpEarned reconstructs earned = balance + unlock spends.
describe('computeSessionStats (T0-finale-stats)', () => {
  /** Bare engine — no module listeners, so emitted events are exactly the log. */
  function bareEngine() {
    const engine = new Engine({
      manifest: { id: 't', title: 't', version: '0', engineVersion: '0', ruleset: 't', modules: [], contentPacks: [] },
      seed: 1,
    });
    engine.store.state.zones = { z: { id: 'z', roomId: 'r', name: 'Z', tags: [], neighbors: [] } };
    engine.store.state.locationId = 'z';
    engine.store.addEntity({
      id: 'p', blueprintId: 'p', type: 'player', name: 'P', tags: ['player'],
      stats: {}, resources: { hp: 5 }, statuses: [], zoneId: 'z',
    });
    engine.store.addEntity({
      id: 'ghoul', blueprintId: 'e', type: 'enemy', name: 'Ghoul', tags: ['enemy'],
      stats: {}, resources: { hp: 0 }, statuses: [], zoneId: 'z',
    });
    engine.store.addEntity({
      id: 'friend', blueprintId: 'n', type: 'npc', name: 'Friend', tags: ['npc', 'companion'],
      stats: {}, resources: { hp: 0 }, statuses: [], zoneId: 'z',
    });
    engine.store.state.playerId = 'p';
    return engine;
  }

  const tree: ProgressionTreeDefinition = {
    id: 'mastery',
    name: 'Mastery',
    currency: 'xp',
    nodes: [{ id: 'toughened', name: 'Toughened', cost: 5, effects: [] }],
  };

  it('tallies a synthetic event log exactly', () => {
    const engine = bareEngine();
    const emit = engine.store.emitEvent.bind(engine.store);

    emit('combat.damage.applied', { attackerId: 'p', targetId: 'ghoul', damage: 4 }, { actorId: 'p' });
    emit('combat.damage.applied', { attackerId: 'ghoul', targetId: 'p', damage: 3 }, { actorId: 'ghoul' });
    emit('status.periodic.damage', { statusId: 'burning', amount: 2 }, { actorId: 'p' });
    emit('status.periodic.damage', { statusId: 'burning', amount: 9 }, { actorId: 'ghoul' }); // not the player
    emit('combat.entity.defeated', { entityId: 'ghoul', entityName: 'Ghoul' }, { actorId: 'p' });
    emit('combat.entity.defeated', { entityId: 'friend', entityName: 'Friend' }, { actorId: 'ghoul' }); // companion — not an enemy
    emit('combat.entity.defeated', { entityId: 'p', entityName: 'P' }, { actorId: 'ghoul' }); // the player — never a kill
    emit('ability.used', { abilityId: 'smite', abilityName: 'Smite' }, { actorId: 'p' });
    emit('ability.used', { abilityId: 'howl', abilityName: 'Howl' }, { actorId: 'ghoul' }); // enemy ability
    emit('progression.node.unlocked', { treeId: 'mastery', nodeId: 'toughened', effects: [] }, { actorId: 'p' });

    engine.store.state.meta.tick = 12;
    // Post-spend balance: 7 banked. Earned = 7 + the 5 the unlock cost.
    engine.store.state.modules['progression-core'] = { currencies: { p: { xp: 7 } }, unlocked: {} };

    expect(computeSessionStats(engine.world, [tree])).toEqual({
      rounds: 12,
      enemiesDefeated: 1,
      damageDealt: 4,
      damageTaken: 5,
      abilitiesUsed: 1,
      xpEarned: 12,
      unlocks: 1,
    });
  });

  it('a defeated entity already GONE from world state still counts as a kill', () => {
    const engine = bareEngine();
    engine.store.emitEvent('combat.entity.defeated', { entityId: 'long-gone', entityName: 'Gone' }, { actorId: 'p' });
    expect(computeSessionStats(engine.world).enemiesDefeated).toBe(1);
  });

  it('an empty log yields all-zero stats and renders gracefully', () => {
    const engine = bareEngine();
    const stats = computeSessionStats(engine.world);
    expect(stats).toEqual({
      rounds: 0,
      enemiesDefeated: 0,
      damageDealt: 0,
      damageTaken: 0,
      abilitiesUsed: 0,
      xpEarned: 0,
      unlocks: 0,
    });
    const block = renderSessionStats(stats);
    expect(block).toContain('THE RUN IN NUMBERS');
    expect(block).toContain('Rounds Survived: 0');
    expect(block).toContain('XP Earned: 0');
  });

  it('without trees, XP falls back to the raw balance under the default currency', () => {
    const engine = bareEngine();
    engine.store.state.modules['progression-core'] = { currencies: { p: { xp: 9 } }, unlocked: {} };
    expect(computeSessionStats(engine.world).xpEarned).toBe(9);
  });
});
