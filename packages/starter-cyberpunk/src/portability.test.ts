import { describe, it, expect } from 'vitest';
import { validateRulesetDefinition } from '@signalfire/content-schema';
import { resetIdCounter } from '@signalfire/core';
import { createGame } from './setup.js';
import { cyberpunkMinimalRuleset } from './ruleset.js';
import { createGame as createFantasyGame } from '@signalfire/starter-fantasy';

describe('Neon Lockbox — cyberpunk micro-demo', () => {
  it('ruleset validates', () => {
    const r = validateRulesetDefinition(cyberpunkMinimalRuleset);
    expect(r.ok).toBe(true);
  });

  it('creates a game and starts in street-level', () => {
    const engine = createGame();
    expect(engine.world.locationId).toBe('street-level');
    expect(engine.world.entities['runner'].name).toBe('Ghost');
    expect(engine.world.entities['fixer'].name).toBe('Kira');
    expect(engine.world.entities['ice-sentry'].name).toBe('ICE Sentry');
  });

  it('player can move through zones', () => {
    const engine = createGame();
    const events1 = engine.submitAction('move', { targetIds: ['server-room'] });
    expect(events1.some((e) => e.type === 'world.zone.entered')).toBe(true);
    expect(engine.world.locationId).toBe('server-room');

    const events2 = engine.submitAction('move', { targetIds: ['data-vault'] });
    expect(events2.some((e) => e.type === 'world.zone.entered')).toBe(true);
    expect(engine.world.locationId).toBe('data-vault');
  });

  it('player can inspect zones', () => {
    const engine = createGame();
    const events = engine.submitAction('inspect');
    expect(events.some((e) => e.type === 'world.zone.inspected')).toBe(true);
  });

  it('player can attack ICE sentry', () => {
    const engine = createGame();
    // Move to data vault
    engine.submitAction('move', { targetIds: ['server-room'] });
    engine.submitAction('move', { targetIds: ['data-vault'] });

    const events = engine.submitAction('attack', { targetIds: ['ice-sentry'] });
    // Should have combat events (hit or miss)
    expect(events.some((e) =>
      e.type === 'combat.contact.hit' || e.type === 'combat.contact.miss'
    )).toBe(true);
  });
});

describe('Side-by-side portability proof', () => {
  it('both games use the same engine class', () => {
    const fantasy = createFantasyGame();
    const cyberpunk = createGame();

    // Same Engine constructor
    expect(fantasy.constructor).toBe(cyberpunk.constructor);
  });

  it('both games support the same core verbs', () => {
    const fantasy = createFantasyGame();
    const cyberpunk = createGame();

    const fantasyVerbs = fantasy.getAvailableActions();
    const cyberpunkVerbs = cyberpunk.getAvailableActions();

    // Both share traversal, combat, inventory, dialogue verbs
    for (const verb of ['move', 'inspect', 'attack', 'use', 'speak', 'choose']) {
      expect(fantasyVerbs).toContain(verb);
      expect(cyberpunkVerbs).toContain(verb);
    }
  });

  it('both games have different rulesets', () => {
    const fantasy = createFantasyGame();
    const cyberpunk = createGame();

    expect(fantasy.ruleset?.id).toBe('fantasy-minimal');
    expect(cyberpunk.ruleset?.id).toBe('cyberpunk-minimal');
  });

  it('both games have different stats', () => {
    const fantasy = createFantasyGame();
    const cyberpunk = createGame();

    const fantasyPlayer = fantasy.world.entities['player'];
    const cyberpunkPlayer = cyberpunk.world.entities['runner'];

    // Fantasy uses vigor/instinct/will
    expect(fantasyPlayer.stats).toHaveProperty('vigor');
    expect(fantasyPlayer.stats).toHaveProperty('instinct');

    // Cyberpunk uses chrome/reflex/netrunning
    expect(cyberpunkPlayer.stats).toHaveProperty('chrome');
    expect(cyberpunkPlayer.stats).toHaveProperty('reflex');
    expect(cyberpunkPlayer.stats).toHaveProperty('netrunning');
  });

  it('both games have different zones', () => {
    const fantasy = createFantasyGame();
    const cyberpunk = createGame();

    expect(Object.keys(fantasy.world.zones)).toContain('chapel-entrance');
    expect(Object.keys(cyberpunk.world.zones)).toContain('street-level');

    // No overlap
    const fantasyZones = new Set(Object.keys(fantasy.world.zones));
    const cyberpunkZones = new Set(Object.keys(cyberpunk.world.zones));
    const overlap = [...fantasyZones].filter((z) => cyberpunkZones.has(z));
    expect(overlap).toHaveLength(0);
  });

  it('both games serialize/deserialize independently', () => {
    const fantasy = createFantasyGame();
    const cyberpunk = createGame();

    // Play a bit of each
    fantasy.submitAction('inspect');
    cyberpunk.submitAction('inspect');

    const fantasySave = fantasy.serialize();
    const cyberpunkSave = cyberpunk.serialize();

    // Both produce valid JSON
    const fp = JSON.parse(fantasySave);
    const cp = JSON.parse(cyberpunkSave);

    expect(fp.world.state.meta.gameId).toBe('chapel-threshold');
    expect(cp.world.state.meta.gameId).toBe('neon-lockbox');
  });

  it('both games use deterministic RNG independently', () => {
    // Reset ID counter to get identical IDs for same-seed runs
    resetIdCounter(0);
    const fantasy1 = createFantasyGame(42);
    fantasy1.submitAction('inspect');
    const f1 = fantasy1.serialize();

    resetIdCounter(0);
    const fantasy2 = createFantasyGame(42);
    fantasy2.submitAction('inspect');
    const f2 = fantasy2.serialize();

    resetIdCounter(0);
    const cyberpunk1 = createGame(77);
    cyberpunk1.submitAction('inspect');
    const c1 = cyberpunk1.serialize();

    resetIdCounter(0);
    const cyberpunk2 = createGame(77);
    cyberpunk2.submitAction('inspect');
    const c2 = cyberpunk2.serialize();

    // Same seed = same results
    expect(f1).toBe(f2);
    expect(c1).toBe(c2);

    // Different games = different state
    expect(f1).not.toBe(c1);
  });
});
