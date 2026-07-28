// PFA-1 — catalog-wide FACTION ATTRIBUTION.
//
// defeat-fallout resolves a defeated entity's faction by instance id OR
// blueprintId (P8-WL-004), and its own comment states the assumption that
// makes the second half work: "shipped content authors instances with
// id === blueprintId, so a roster naming an authored entity also claims that
// entity's spawned clones."
//
// FIVE of eleven packs did not. Encounter-spawn clones its templates under
// fresh `enc_*` ids and keeps the template's blueprintId, so in those packs
// every spawned patrol the player cut down accrued heat and NOTHING else — no
// reputation, no alert, no step toward the faction caring. Measured on a
// played pirate session where three of four kills were clones and faction
// standing never moved once, which is most of why `bounty` had never fired in
// any world.
//
// A guard rather than five one-off fixes, because the assumption is invisible:
// nothing about writing `blueprintId: 'navy-sailor'` next to `id: 'navy_sailor'`
// looks wrong, and the consequence shows up two systems away as a pressure
// that never spawns.

import { describe, it, expect } from 'vitest';
import type { EntityState } from '@ai-rpg-engine/core';
import { allPacks, type PackInfo } from './packs.js';

const SEED = 71;

function authoredEntities(pack: PackInfo): EntityState[] {
  return Object.values(pack.createGame(SEED).world.entities);
}

/** Entities whose faction a defeat could never attribute to their clones. */
function unattributable(entities: EntityState[]): string[] {
  return entities
    .filter((e) => e.blueprintId && e.blueprintId !== e.id)
    .map((e) => `${e.id} (blueprintId '${e.blueprintId}')`)
    .sort();
}

describe('faction attribution survives cloning × real catalog (PFA-1)', () => {
  for (const pack of allPacks) {
    it(`${pack.meta.id}: every authored entity's blueprintId matches its id`, () => {
      expect(
        unattributable(authoredEntities(pack)),
        `${pack.meta.id} authors entities whose blueprintId differs from their id.\n` +
          '  Encounter-spawn clones keep the blueprintId and get a fresh `enc_*` id, so a faction\n' +
          '  roster naming the authored instance does NOT claim its clones — their kills accrue\n' +
          '  heat and nothing else. Make the two agree.',
      ).toEqual([]);
    });
  }
});

describe('meta: the attribution gate fires on a mismatch (PFA-1 negative control)', () => {
  it('an entity whose blueprintId differs IS caught', () => {
    const injected = {
      id: 'patrol_guard',
      blueprintId: 'patrol-guard',
      type: 'enemy',
      name: 'Patrol Guard',
      tags: [],
      stats: {},
      resources: {},
      statuses: [],
    } as unknown as EntityState;
    expect(
      unattributable([injected]),
      'the gate accepted an entity whose clones could never answer for its faction',
    ).toEqual(["patrol_guard (blueprintId 'patrol-guard')"]);
  });

  it('and a matching one is NOT — the gate is not simply flagging everything', () => {
    const conformant = { id: 'x', blueprintId: 'x' } as unknown as EntityState;
    expect(unattributable([conformant])).toEqual([]);
  });
});
