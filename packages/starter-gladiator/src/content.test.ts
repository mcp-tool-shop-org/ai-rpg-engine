// Gladiator content integrity tests
//
// F-4806a2c9 / F-d95c600a / F-7902facb: none of the 10 starters ran their own
// content through @ai-rpg-engine/content-schema's cross-reference validators
// (validateRefs / validateGameContent / validateAbilityPack), even though
// those exist specifically to catch dangling zone/dialogue/ability references
// and duplicate ids. This left F-7902facb's one-way zone passage (below) and
// the class of bug it represents completely unguarded. These tests wire the
// real shipped content (built via createGame(), not a hand-duplicated copy)
// through those validators.

import { describe, it, expect } from 'vitest';
import { validateGameContent, validateAbilityPack } from '@ai-rpg-engine/content-schema';
import type { ContentPack } from '@ai-rpg-engine/content-schema';
import { createGame } from './setup.js';
import {
  patronDialogue,
  arenaGloryTree,
  gladiatorAbilities,
  gladiatorStatusDefinitions,
  buildCatalog,
} from './content.js';
import { gladiatorMinimalRuleset } from './ruleset.js';

describe('gladiator content — cross-reference integrity (F-4806a2c9)', () => {
  it('zones, dialogue speakers, and ids have no dangling references or duplicate ids', () => {
    const engine = createGame(1);
    const pack: ContentPack = {
      zones: Object.values(engine.store.state.zones) as unknown as ContentPack['zones'],
      entities: Object.values(engine.store.state.entities) as unknown as ContentPack['entities'],
      dialogues: [patronDialogue],
      abilities: gladiatorAbilities,
      statuses: gladiatorStatusDefinitions,
    };

    const result = validateGameContent(pack);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  // F-7902facb: patron-gallery listed arena-floor/armory as neighbors, but
  // arena-floor did not list patron-gallery back — every other zone pair in
  // this pack is reciprocal, so this reads as an authoring mistake (a player
  // walking down from the patron gallery could not walk directly back up).
  // validateRefs surfaces asymmetric neighbor pairs as an advisory (never a
  // hard error, since a one-way drop/hazard passage can be intentional), so
  // this assertion is the only thing that would have caught it.
  it('has no one-way zone passages (neighbor symmetry advisory)', () => {
    const engine = createGame(1);
    const pack: ContentPack = {
      zones: Object.values(engine.store.state.zones) as unknown as ContentPack['zones'],
    };

    const result = validateGameContent(pack);
    expect(result.advisories).toEqual([]);
  });

  it('every archetype.progressionTreeId resolves to a defined tree', () => {
    const treeIds = new Set([arenaGloryTree.id]);
    for (const archetype of buildCatalog.archetypes) {
      if (archetype.progressionTreeId === undefined) continue;
      expect(
        treeIds.has(archetype.progressionTreeId),
        `archetype "${archetype.id}" references missing tree "${archetype.progressionTreeId}" (known: ${[...treeIds].join(', ')})`,
      ).toBe(true);
    }
  });

  it('abilities reference only stats/resources declared in the ruleset', () => {
    const result = validateAbilityPack(gladiatorAbilities, gladiatorMinimalRuleset);
    expect(result.errors).toEqual([]);
  });
});
