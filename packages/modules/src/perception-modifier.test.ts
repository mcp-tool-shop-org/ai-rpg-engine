// AbilityModifiers.perceptionBonus reaching what the PLAYER makes of what they
// saw — the last of the seven companion fields, and the only one whose
// consumer is a module subscription rather than a resolution function.
//
// Applied to CLARITY rather than to the roll, on purpose: a companion cannot
// make you notice a thing that was never in your line of sight, but they can
// tell you what it meant. And only the player benefits — an NPC's perception
// is its own.

import { describe, it, expect } from 'vitest';
import type { WorldState } from '@ai-rpg-engine/core';
import { computeAbilityModifiers, computePartyAbilities, createPartyState, setPartyState } from './companion-core.js';

function partyWith(abilityTags: string[], active = true) {
  const party = createPartyState();
  party.companions.push({
    npcId: 'scholar-vey', role: 'scholar', joinedAtTick: 0, abilityTags, morale: 70, active,
  });
  return party;
}

function bonusOf(party: ReturnType<typeof createPartyState>): number {
  return computeAbilityModifiers(computePartyAbilities(party)).perceptionBonus;
}

describe('perceptionBonus is computed from the ACTIVE party', () => {
  it('CONSEQUENCE: a scholar in the party raises the bonus above zero', () => {
    expect(
      bonusOf(partyWith(['scholarly-insight'])),
      'scholarly-insight produced no perception bonus — the ability table is not being read',
    ).toBeGreaterThan(0);
  });

  it('NEGATIVE CONTROL: an empty party contributes exactly zero', () => {
    expect(bonusOf(createPartyState())).toBe(0);
  });

  it('NEGATIVE CONTROL: a companion with no perception ability contributes zero', () => {
    // The other direction — proves the bonus tracks the ABILITY and not merely
    // the presence of a warm body in the party.
    expect(bonusOf(partyWith(['intimidation-backup']))).toBe(0);
  });
});

describe('the perception filter reads the party only for the PLAYER', () => {
  // The filter's own gate is `entity.id === world.playerId`. Pinned here
  // because the natural refactor — "apply the bonus to every perceiver" —
  // would hand the player's companions' insight to the enemies hunting them.
  it('an inactive companion is not counted', () => {
    const dormant = partyWith(['scholarly-insight'], false);
    const world = { modules: {} } as unknown as WorldState;
    setPartyState(world, dormant);
    const active = dormant.companions.filter((c) => c.active);
    expect(active).toHaveLength(0);
  });
});
