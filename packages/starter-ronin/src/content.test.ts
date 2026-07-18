// Ronin content integrity tests
//
// ST-05: the pack applies an 'off-balance' status. The engine combat layer also
// has an "off balance" combat state, but it is namespaced as
// COMBAT_STATES.OFF_BALANCE ('combat:off_balance'). These are distinct status
// ids and must NOT shadow or collide — applying the pack status must not
// register the engine combat state, and vice versa. This test pins that
// separation so a future rename of either side cannot silently collide.

import { describe, it, expect } from 'vitest';
import type { EntityState } from '@ai-rpg-engine/core';
import { COMBAT_STATES, applyStatus, hasStatus } from '@ai-rpg-engine/modules';
import { validateGameContent, validateAbilityPack } from '@ai-rpg-engine/content-schema';
import type { ContentPack } from '@ai-rpg-engine/content-schema';
import { createGame } from './setup.js';
import {
  roninStatusDefinitions,
  magistrateDialogue,
  wayOfTheBladeTree,
  roninAbilities,
  buildCatalog,
} from './content.js';
import { roninMinimalRuleset } from './ruleset.js';

function makeEntity(): EntityState {
  return {
    id: 'subject', blueprintId: 'subject', type: 'enemy', name: 'Subject',
    tags: [], stats: {}, resources: { hp: 10 }, statuses: [], zoneId: 'z',
  };
}

describe('ronin content — off-balance status disambiguation (ST-05)', () => {
  const packOffBalance = roninStatusDefinitions.find((s) => s.id === 'off-balance');

  it('declares an "off-balance" pack status', () => {
    expect(packOffBalance).toBeDefined();
  });

  it('pack "off-balance" id is distinct from the engine COMBAT_STATES.OFF_BALANCE id', () => {
    expect(packOffBalance!.id).toBe('off-balance');
    expect(COMBAT_STATES.OFF_BALANCE).toBe('combat:off_balance');
    expect(packOffBalance!.id).not.toBe(COMBAT_STATES.OFF_BALANCE);
  });

  it('applying the pack "off-balance" status does not register the engine combat state', () => {
    const e = makeEntity();
    applyStatus(e, 'off-balance', 0, { duration: 2 });
    expect(hasStatus(e, 'off-balance')).toBe(true);
    expect(hasStatus(e, COMBAT_STATES.OFF_BALANCE)).toBe(false);
  });

  it('applying the engine combat state does not register the pack "off-balance" status', () => {
    const e = makeEntity();
    applyStatus(e, COMBAT_STATES.OFF_BALANCE, 0, { duration: 2 });
    expect(hasStatus(e, COMBAT_STATES.OFF_BALANCE)).toBe(true);
    expect(hasStatus(e, 'off-balance')).toBe(false);
  });
});

// F-4806a2c9 / F-d95c600a: none of the 10 starters ran their own content
// through @ai-rpg-engine/content-schema's cross-reference validators
// (validateRefs / validateGameContent / validateAbilityPack), even though
// those exist specifically to catch dangling zone/dialogue/ability
// references, duplicate ids, and one-way zone passages. These tests wire
// the real shipped content (built via createGame(), not a hand-duplicated
// copy) through those validators.
describe('ronin content — cross-reference integrity (F-4806a2c9)', () => {
  it('zones, dialogue speakers, and ids have no dangling references or duplicate ids', () => {
    const engine = createGame(1);
    const pack: ContentPack = {
      zones: Object.values(engine.store.state.zones) as unknown as ContentPack['zones'],
      entities: Object.values(engine.store.state.entities) as unknown as ContentPack['entities'],
      dialogues: [magistrateDialogue],
      abilities: roninAbilities,
      statuses: roninStatusDefinitions,
    };

    const result = validateGameContent(pack);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('has no one-way zone passages (neighbor symmetry advisory)', () => {
    const engine = createGame(1);
    const pack: ContentPack = {
      zones: Object.values(engine.store.state.zones) as unknown as ContentPack['zones'],
    };

    const result = validateGameContent(pack);
    expect(result.advisories).toEqual([]);
  });

  it('every archetype.progressionTreeId resolves to a defined tree', () => {
    const treeIds = new Set([wayOfTheBladeTree.id]);
    for (const archetype of buildCatalog.archetypes) {
      if (archetype.progressionTreeId === undefined) continue;
      expect(
        treeIds.has(archetype.progressionTreeId),
        `archetype "${archetype.id}" references missing tree "${archetype.progressionTreeId}" (known: ${[...treeIds].join(', ')})`,
      ).toBe(true);
    }
  });

  it('abilities reference only stats/resources declared in the ruleset', () => {
    const result = validateAbilityPack(roninAbilities, roninMinimalRuleset);
    expect(result.errors).toEqual([]);
  });
});
