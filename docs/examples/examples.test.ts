/**
 * Composition Examples — compile + behavior proof
 *
 * The handbook (Chapter 57) and the root README both point readers at the
 * files in docs/examples as "runnable TypeScript examples". Nothing compiled
 * or ran them, so they drifted: a stale `targetId` comment, and combatants
 * that never set `zoneId`/`stamina` — which means a copied-out attack is
 * silently rejected ("target not in same zone" / "not enough stamina") and
 * the example looks like it does nothing.
 *
 * This test imports every example (so `vitest run` and the docs/examples
 * tsconfig both fail if an example stops type-checking) and drives a real
 * attack through the from-scratch game to prove the documented combat loop
 * actually resolves end to end.
 */

import { describe, it, expect } from 'vitest';
import { createFromScratchGame } from './from-scratch.js';
import { createTundraWorld, createDesertWorld } from './cross-world.js';
import { createMixedPartyGame } from './mixed-party.js';
import { createMultiEncounterGame } from './multi-encounter.js';

describe('docs/examples — boot proof', () => {
  it('from-scratch boots with combat verbs registered', () => {
    const engine = createFromScratchGame(42);
    expect(engine.tick).toBe(0);
    expect(engine.getAvailableActions()).toContain('attack');
  });

  it('cross-world builds two worlds from one combat identity', () => {
    expect(createTundraWorld(1).tick).toBe(0);
    expect(createDesertWorld(2).tick).toBe(0);
  });

  it('mixed-party and multi-encounter boot', () => {
    expect(createMixedPartyGame(42).tick).toBe(0);
    expect(createMultiEncounterGame(42).tick).toBe(0);
  });
});

describe('docs/examples — from-scratch combat actually resolves', () => {
  it('a player attack against a co-located enemy is NOT rejected', () => {
    const engine = createFromScratchGame(42);

    // The exact call the from-scratch.ts footer documents.
    const events = engine.submitAction('attack', { targetIds: ['rat'] });

    // The bug this guards: if entities lack a matching zoneId, combat-core
    // rejects with 'target not in same zone'; if they lack stamina, it
    // rejects with 'not enough stamina'. Either way the attack no-ops.
    const rejected = events.find((e) => e.type === 'action.rejected');
    expect(rejected, `attack was rejected: ${rejected?.payload?.reason as string}`).toBeUndefined();

    // A resolved attack emits a hit or a miss against the rat.
    const contact = events.find(
      (e) => e.type.startsWith('combat.contact.') || e.type === 'combat.contact.miss',
    );
    expect(contact).toBeDefined();
  });

  it('placing the enemy in a different zone DOES get rejected (proves the zone gate is real)', () => {
    const engine = createFromScratchGame(42);
    // Move the rat out of the arena — combat must now refuse.
    engine.store.state.entities['rat'].zoneId = 'somewhere-else';

    const events = engine.submitAction('attack', { targetIds: ['rat'] });
    const rejected = events.find((e) => e.type === 'action.rejected');
    expect(rejected?.payload?.reason).toBe('target not in same zone');
  });
});
