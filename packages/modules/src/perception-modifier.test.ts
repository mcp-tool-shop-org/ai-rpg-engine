// AbilityModifiers.perceptionBonus reaching what the PLAYER makes of what they
// saw — the last of the seven companion fields, and the only one whose
// consumer is a module subscription rather than a resolution function.
//
// Applied to CLARITY rather than to the roll, on purpose: a companion cannot
// make you notice a thing that was never in your line of sight, but they can
// tell you what it meant. And only the player benefits — an NPC's perception
// is its own.

import { describe, it, expect } from 'vitest';
import { createTestEngine } from '@ai-rpg-engine/core';
import type { EntityState, WorldState } from '@ai-rpg-engine/core';
import { computeAbilityModifiers, computePartyAbilities, createPartyState, setPartyState } from './companion-core.js';
import { createCognitionCore } from './cognition-core.js';
import { createPerceptionFilter, getPerceptionLog } from './perception-filter.js';

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

  it('F-a8c93f50: a scholar in the party raises the PLAYER log clarity 0.1 on a zone.entered they did not act', () => {
    const player: EntityState = {
      id: 'player',
      blueprintId: 'player',
      type: 'player',
      name: 'Hero',
      tags: ['player'],
      stats: { vigor: 5, instinct: 2 },
      resources: { hp: 20, stamina: 5 },
      statuses: [],
      zoneId: 'b',
    };
    const walker: EntityState = {
      id: 'walker',
      blueprintId: 'walker',
      type: 'npc',
      name: 'Walker',
      tags: ['npc'],
      stats: { vigor: 5, instinct: 5 },
      resources: { hp: 20, stamina: 5 },
      statuses: [],
      zoneId: 'b',
      visibility: { hidden: true },
      ai: { profileId: 'cautious', goals: [], fears: [], alertLevel: 0, knowledge: {} },
    };
    const bystander: EntityState = {
      id: 'guard',
      blueprintId: 'guard',
      type: 'npc',
      name: 'Guard',
      tags: ['npc'],
      stats: { vigor: 5, instinct: 2 },
      resources: { hp: 20, stamina: 5 },
      statuses: [],
      zoneId: 'b',
      ai: { profileId: 'cautious', goals: [], fears: [], alertLevel: 0, knowledge: {} },
    };
    const zones = [
      { id: 'a', roomId: 'test', name: 'A', tags: [], neighbors: ['b'] },
      { id: 'b', roomId: 'test', name: 'B', tags: [], neighbors: ['a'], light: 0 },
    ];

    function scene(withScholar: boolean) {
      const engine = createTestEngine({
        modules: [createCognitionCore(), createPerceptionFilter()],
        entities: [
          { ...player, stats: { ...player.stats }, resources: { ...player.resources }, statuses: [] },
          { ...walker, stats: { ...walker.stats }, resources: { ...walker.resources }, statuses: [], visibility: { hidden: true }, ai: { ...walker.ai! } },
          { ...bystander, stats: { ...bystander.stats }, resources: { ...bystander.resources }, statuses: [], ai: { ...bystander.ai! } },
        ],
        zones,
        playerId: 'player',
        startZone: 'b',
        seed: 1,
      });
      if (withScholar) setPartyState(engine.world, partyWith(['scholarly-insight']));
      engine.store.emitEvent('world.zone.entered', { zoneId: 'b' }, { actorId: 'walker' });
      return {
        playerLog: getPerceptionLog(engine.world, 'player'),
        guardLog: getPerceptionLog(engine.world, 'guard'),
      };
    }

    const without = scene(false);
    const withScholar = scene(true);

    expect(without.playerLog.length, 'player without ai must still perceive').toBeGreaterThan(0);
    expect(withScholar.playerLog.length).toBeGreaterThan(0);
    const base = without.playerLog[0].clarity;
    const boosted = withScholar.playerLog[0].clarity;
    expect(boosted).toBeCloseTo(Math.min(1, base + 0.1), 5);
    expect(boosted).toBeGreaterThan(base);

    // NPC perceivers do not get the party bonus.
    expect(without.guardLog[0].clarity).toBeCloseTo(withScholar.guardLog[0].clarity, 5);
  });
});
