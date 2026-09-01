// F-749aba8e — every shipped districts[].controllingFaction id must land in
// WorldState.factions (id/name/reputation/disposition). Membership already
// lists those ids; pack.factions is the JSON twin. This file pins the union
// after createGame, not a third hand-written list.

import { describe, it, expect } from 'vitest';
import { createGame as createBountyHunter } from '../../starter-bounty-hunter/src/setup.js';
import { createGame as createColony } from '../../starter-colony/src/setup.js';
import { createGame as createCyberpunk } from '../../starter-cyberpunk/src/setup.js';
import { createGame as createDetective } from '../../starter-detective/src/setup.js';
import { createGame as createFantasy } from '../../starter-fantasy/src/setup.js';
import { createGame as createGladiator } from '../../starter-gladiator/src/setup.js';
import { createGame as createMerchant } from '../../starter-merchant/src/setup.js';
import { createGame as createPirate } from '../../starter-pirate/src/setup.js';
import { createGame as createRonin } from '../../starter-ronin/src/setup.js';
import { createGame as createVampire } from '../../starter-vampire/src/setup.js';
import { createGame as createWeirdWest } from '../../starter-weird-west/src/setup.js';
import { createGame as createZombie } from '../../starter-zombie/src/setup.js';
import { createGame as createTemplate } from '../../../templates/starter/src/setup.js';

const CASES: { name: string; create: (seed?: number) => { store: { state: { factions: Record<string, { id: string; name: string; reputation: number; disposition: string }> } } }; ids: string[] }[] = [
  { name: 'bounty-hunter', create: createBountyHunter, ids: ['bounty-office', 'parish-watch'] },
  { name: 'colony', create: createColony, ids: ['colony-council'] },
  { name: 'cyberpunk', create: createCyberpunk, ids: ['vault-ice'] },
  { name: 'detective', create: createDetective, ids: ['dockworkers'] },
  { name: 'fantasy', create: createFantasy, ids: ['chapel-undead'] },
  { name: 'gladiator', create: createGladiator, ids: ['arena-stable', 'patron-circle'] },
  { name: 'merchant', create: createMerchant, ids: ['assay-guild', 'harbour-authority', 'crown-exchequer'] },
  { name: 'pirate', create: createPirate, ids: ['colonial-navy', 'brethren-of-the-coast'] },
  { name: 'ronin', create: createRonin, ids: ['takeda-clan'] },
  { name: 'vampire', create: createVampire, ids: ['house-morvaine'] },
  { name: 'weird-west', create: createWeirdWest, ids: ['townsfolk', 'red-congregation'] },
  { name: 'zombie', create: createZombie, ids: ['survivors'] },
  { name: 'template', create: createTemplate, ids: ['my-game'] },
];

describe('F-749aba8e — controllingFaction ids land in WorldState.factions', () => {
  for (const c of CASES) {
    it(`${c.name}: registry contains ${c.ids.join(', ')}`, () => {
      const engine = c.create(42);
      for (const id of c.ids) {
        const rec = engine.store.state.factions[id];
        expect(rec, `${c.name} missing WorldState.factions[${id}]`).toBeDefined();
        expect(rec.id).toBe(id);
        expect(typeof rec.name).toBe('string');
        expect(rec.name.length).toBeGreaterThan(0);
        expect(typeof rec.reputation).toBe('number');
        expect(typeof rec.disposition).toBe('string');
        expect(rec.disposition.length).toBeGreaterThan(0);
      }
    });
  }

  it('pirate lifts Navy/Brethren baselines onto membership (no post-Engine third list)', () => {
    const engine = createPirate(42);
    expect(engine.store.state.factions['colonial-navy']).toEqual({
      id: 'colonial-navy',
      name: 'The Colonial Navy',
      reputation: -35,
      disposition: 'hostile',
    });
    expect(engine.store.state.factions['brethren-of-the-coast']).toEqual({
      id: 'brethren-of-the-coast',
      name: 'The Brethren of the Coast',
      reputation: 15,
      disposition: 'wary',
    });
    expect(engine.store.state.globals['faction_alert_colonial-navy']).toBe(30);
  });

  it('uncontrolled districts stay omitted from the registry', () => {
    const merchant = createMerchant(42);
    expect(merchant.store.state.factions['the-warrens']).toBeUndefined();
    const bounty = createBountyHunter(42);
    expect(bounty.store.state.factions['the-rookery']).toBeUndefined();
  });
});
