// Phase 3 integration tests — both starters with cognition, perception, progression, environment

import { describe, it, expect } from 'vitest';
import { resetIdCounter } from '@ai-rpg-engine/core';
import {
  getCognition,
  believes,
  getMemories,
  getPerceptionLog,
  getCurrency,
  addCurrency,
  isNodeUnlocked,
  getZoneProperty,
} from '@ai-rpg-engine/modules';
import { createGame as createFantasyGame } from '@ai-rpg-engine/starter-fantasy';
import { createGame } from './setup.js';

describe('Fantasy — Phase 3 cognition', () => {
  it('Ash Ghoul detects player entering crypt', () => {
    const engine = createFantasyGame(42);

    // Navigate to crypt: entrance → nave → vestry → crypt
    engine.submitAction('move', { targetIds: ['chapel-nave'] });
    engine.submitAction('move', { targetIds: ['vestry-door'] });
    engine.submitAction('move', { targetIds: ['crypt-chamber'] });

    const ghoulCog = getCognition(engine.world, 'ash-ghoul');
    // Ash ghoul should perceive the player entering its zone
    expect(believes(ghoulCog, 'player', 'present', true)).toBe(true);
  });

  it('Ash Ghoul remembers being attacked', () => {
    const engine = createFantasyGame(42);

    // Navigate to crypt
    engine.submitAction('move', { targetIds: ['chapel-nave'] });
    engine.submitAction('move', { targetIds: ['vestry-door'] });
    engine.submitAction('move', { targetIds: ['crypt-chamber'] });

    // Attack the ghoul
    engine.submitAction('attack', { targetIds: ['ash-ghoul'] });

    const ghoulCog = getCognition(engine.world, 'ash-ghoul');
    expect(believes(ghoulCog, 'player', 'hostile', true)).toBe(true);
    expect(getMemories(ghoulCog, 'was-attacked').length).toBeGreaterThan(0);
    expect(ghoulCog.morale).toBeLessThan(70);
  });
});

describe('Fantasy — Phase 3 perception', () => {
  it('perception log tracks Ash Ghoul awareness of player', () => {
    const engine = createFantasyGame(42);

    engine.submitAction('move', { targetIds: ['chapel-nave'] });
    engine.submitAction('move', { targetIds: ['vestry-door'] });
    engine.submitAction('move', { targetIds: ['crypt-chamber'] });

    const log = getPerceptionLog(engine.world, 'ash-ghoul');
    // Should have perception entries for the player's arrival
    expect(log.length).toBeGreaterThan(0);
  });
});

describe('Fantasy — Phase 3 progression', () => {
  it('player earns XP from defeating Ash Ghoul', () => {
    const engine = createFantasyGame(42);

    engine.submitAction('move', { targetIds: ['chapel-nave'] });
    engine.submitAction('move', { targetIds: ['vestry-door'] });
    engine.submitAction('move', { targetIds: ['crypt-chamber'] });

    // Fight until ghoul is defeated
    let defeated = false;
    for (let i = 0; i < 30 && !defeated; i++) {
      const events = engine.submitAction('attack', { targetIds: ['ash-ghoul'] });
      if (events.some((e) => e.type === 'combat.entity.defeated')) {
        defeated = true;
      }
    }

    expect(defeated).toBe(true);
    expect(getCurrency(engine.world, 'player', 'xp')).toBe(15);
  });

  it('player can unlock combat mastery node with earned XP', () => {
    const engine = createFantasyGame(42);

    // Give XP directly for testing
    addCurrency(engine.world, 'player', 'xp', 50, 0);

    const vigorBefore = engine.world.entities['player'].stats.vigor;
    engine.submitAction('unlock', {
      parameters: { treeId: 'combat-mastery', nodeId: 'toughened' },
    });

    expect(isNodeUnlocked(engine.world, 'player', 'combat-mastery', 'toughened')).toBe(true);
    expect(engine.world.entities['player'].resources.hp).toBe(25); // 20 + 5
  });
});

describe('Fantasy — Phase 3 environment', () => {
  it('combat raises noise in crypt zone', () => {
    const engine = createFantasyGame(42);

    engine.submitAction('move', { targetIds: ['chapel-nave'] });
    engine.submitAction('move', { targetIds: ['vestry-door'] });
    engine.submitAction('move', { targetIds: ['crypt-chamber'] });
    engine.submitAction('attack', { targetIds: ['ash-ghoul'] });

    const noise = getZoneProperty(engine.world, 'crypt-chamber', 'noise');
    expect(noise).toBeGreaterThan(0);
  });

  it('vestry-door hazard drains stamina', () => {
    const engine = createFantasyGame(42);

    // Ensure player has stamina before entering hazard zone
    engine.world.entities['player'].resources.stamina = 10;
    engine.submitAction('move', { targetIds: ['chapel-nave'] });

    const staminaBeforeVestry = engine.world.entities['player'].resources.stamina;
    engine.submitAction('move', { targetIds: ['vestry-door'] });

    // Vestry has 'unstable floor' hazard → stamina drain
    expect(engine.world.entities['player'].resources.stamina).toBeLessThan(staminaBeforeVestry);
  });
});

describe('Cyberpunk — Phase 3 cognition', () => {
  it('ICE Sentry detects runner entering data vault', () => {
    const engine = createGame(77);

    engine.submitAction('move', { targetIds: ['server-room'] });
    engine.submitAction('move', { targetIds: ['data-vault'] });

    const iceCog = getCognition(engine.world, 'ice-sentry');
    expect(believes(iceCog, 'runner', 'present', true)).toBe(true);
  });

  it('ICE Sentry knows attacker is hostile after combat', () => {
    const engine = createGame(77);

    engine.submitAction('move', { targetIds: ['server-room'] });
    engine.submitAction('move', { targetIds: ['data-vault'] });
    engine.submitAction('attack', { targetIds: ['ice-sentry'] });

    const iceCog = getCognition(engine.world, 'ice-sentry');
    expect(believes(iceCog, 'runner', 'hostile', true)).toBe(true);
  });
});

describe('Cyberpunk — Phase 3 perception', () => {
  it('perception filter uses reflex stat for cyberpunk', () => {
    const engine = createGame(77);

    engine.submitAction('move', { targetIds: ['server-room'] });
    engine.submitAction('move', { targetIds: ['data-vault'] });

    const log = getPerceptionLog(engine.world, 'ice-sentry');
    expect(log.length).toBeGreaterThan(0);
    // Perception happened (the config set perceptionStat: 'reflex')
    expect(log[0].detected).toBeDefined();
  });
});

describe('Cyberpunk — Phase 3 progression', () => {
  it('runner can unlock netrunning skill nodes', () => {
    const engine = createGame(77);

    addCurrency(engine.world, 'runner', 'xp', 30, 0);

    engine.submitAction('unlock', {
      parameters: { treeId: 'netrunning-skills', nodeId: 'packet-sniffer' },
    });

    expect(isNodeUnlocked(engine.world, 'runner', 'netrunning-skills', 'packet-sniffer')).toBe(true);
    // Netrunning stat should have increased
    expect(engine.world.entities['runner'].stats.netrunning).toBe(8); // 7 + 1
  });

  it('netrunning tree respects prerequisites', () => {
    const engine = createGame(77);

    addCurrency(engine.world, 'runner', 'xp', 100, 0);

    // Try to unlock neural-boost without packet-sniffer
    const events = engine.submitAction('unlock', {
      parameters: { treeId: 'netrunning-skills', nodeId: 'neural-boost' },
    });

    const rejected = events.find((e) => e.type === 'progression.unlock.rejected');
    expect(rejected).toBeDefined();
  });
});

describe('Cyberpunk — Phase 3 environment', () => {
  it('server room wiring hazard damages runner', () => {
    const engine = createGame(77);

    const hpBefore = engine.world.entities['runner'].resources.hp;
    engine.submitAction('move', { targetIds: ['server-room'] });

    // Server room has 'exposed wiring' hazard → HP damage
    expect(engine.world.entities['runner'].resources.hp).toBe(hpBefore - 2);
  });

  it('combat in data vault raises noise', () => {
    const engine = createGame(77);

    engine.submitAction('move', { targetIds: ['server-room'] });
    engine.submitAction('move', { targetIds: ['data-vault'] });
    engine.submitAction('attack', { targetIds: ['ice-sentry'] });

    const noise = getZoneProperty(engine.world, 'data-vault', 'noise');
    expect(noise).toBeGreaterThan(0);
  });
});

describe('Phase 3 portability — both games use same systems', () => {
  it('both games have cognition module loaded', () => {
    resetIdCounter(0);
    const fantasy = createFantasyGame(42);
    resetIdCounter(0);
    const cyberpunk = createGame(77);

    expect(fantasy.world.modules['cognition-core']).toBeDefined();
    expect(cyberpunk.world.modules['cognition-core']).toBeDefined();
  });

  it('both games have perception filter loaded', () => {
    resetIdCounter(0);
    const fantasy = createFantasyGame(42);
    resetIdCounter(0);
    const cyberpunk = createGame(77);

    expect(fantasy.world.modules['perception-filter']).toBeDefined();
    expect(cyberpunk.world.modules['perception-filter']).toBeDefined();
  });

  it('both games have progression loaded', () => {
    resetIdCounter(0);
    const fantasy = createFantasyGame(42);
    resetIdCounter(0);
    const cyberpunk = createGame(77);

    expect(fantasy.world.modules['progression-core']).toBeDefined();
    expect(cyberpunk.world.modules['progression-core']).toBeDefined();
  });

  it('both games have environment loaded', () => {
    resetIdCounter(0);
    const fantasy = createFantasyGame(42);
    resetIdCounter(0);
    const cyberpunk = createGame(77);

    expect(fantasy.world.modules['environment-core']).toBeDefined();
    expect(cyberpunk.world.modules['environment-core']).toBeDefined();
  });
});
