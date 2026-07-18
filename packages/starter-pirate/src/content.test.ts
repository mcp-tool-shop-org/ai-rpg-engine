// Pirate content integrity tests
//
// F-4806a2c9 / F-d95c600a: none of the 10 starters ran their own content
// through @ai-rpg-engine/content-schema's cross-reference validators
// (validateRefs / validateGameContent / validateAbilityPack), even though
// those exist specifically to catch dangling zone/dialogue/ability
// references, duplicate ids, and one-way zone passages. These tests wire
// the real shipped content (built via createGame(), not a hand-duplicated
// copy) through those validators.

import { describe, it, expect } from 'vitest';
import { validateGameContent, validateAbilityPack } from '@ai-rpg-engine/content-schema';
import type { ContentPack } from '@ai-rpg-engine/content-schema';
import { createGame } from './setup.js';
import {
  cartographerDialogue,
  seamanshipTree,
  pirateAbilities,
  pirateStatusDefinitions,
  buildCatalog,
} from './content.js';
import { pirateMinimalRuleset } from './ruleset.js';

describe('pirate content — cross-reference integrity (F-4806a2c9)', () => {
  it('zones, dialogue speakers, and ids have no dangling references or duplicate ids', () => {
    const engine = createGame(1);
    const pack: ContentPack = {
      zones: Object.values(engine.store.state.zones) as unknown as ContentPack['zones'],
      entities: Object.values(engine.store.state.entities) as unknown as ContentPack['entities'],
      dialogues: [cartographerDialogue],
      abilities: pirateAbilities,
      statuses: pirateStatusDefinitions,
    };

    const result = validateGameContent(pack);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  // Live bug caught by the cross-reference test above: cartographerDialogue's
  // speakers listed the entity's display name ("Mara the Cartographer")
  // instead of its real id ("cartographer_mara"). dialogue-core's speakHandler
  // auto-discovers a dialogue by `d.speakers.includes(targetId)` — the real
  // entity id — when the caller doesn't pass an explicit dialogueId (the
  // normal "talk to this NPC" path). With the display name in speakers[],
  // talking to the cartographer without already knowing her internal
  // dialogue id silently failed with "has nothing to say".
  it('speaking to the cartographer without an explicit dialogueId finds her dialogue', () => {
    const engine = createGame(1);
    const events = engine.submitAction('speak', { targetIds: ['cartographer_mara'] });
    expect(events.some((e) => e.type === 'dialogue.started')).toBe(true);
    expect(events.some((e) => e.type === 'action.rejected')).toBe(false);
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
    const treeIds = new Set([seamanshipTree.id]);
    for (const archetype of buildCatalog.archetypes) {
      if (archetype.progressionTreeId === undefined) continue;
      expect(
        treeIds.has(archetype.progressionTreeId),
        `archetype "${archetype.id}" references missing tree "${archetype.progressionTreeId}" (known: ${[...treeIds].join(', ')})`,
      ).toBe(true);
    }
  });

  it('abilities reference only stats/resources declared in the ruleset', () => {
    const result = validateAbilityPack(pirateAbilities, pirateMinimalRuleset);
    expect(result.errors).toEqual([]);
  });
});
