// Weird-West content integrity tests
//
// ST-01: archetypes referenced a progression tree id with a "-path" suffix
// ("gunslinger-path") that did not match the actual tree id ("gunslinger"). The
// reference must resolve to a real tree, otherwise character creation hands the
// player a build pointing at a non-existent progression tree.

import { describe, it, expect } from 'vitest';
import { validateGameContent, validateAbilityPack } from '@ai-rpg-engine/content-schema';
import type { ContentPack } from '@ai-rpg-engine/content-schema';
import { createGame } from './setup.js';
import { buildCatalog, gunslingerTree, bartenderDialogue, weirdWestAbilities, weirdWestStatusDefinitions } from './content.js';
import { weirdWestMinimalRuleset } from './ruleset.js';

describe('weird-west content — progression tree references', () => {
  it('every archetype.progressionTreeId resolves to a defined tree', () => {
    const treeIds = new Set([gunslingerTree.id]);
    for (const archetype of buildCatalog.archetypes) {
      if (archetype.progressionTreeId === undefined) continue;
      expect(
        treeIds.has(archetype.progressionTreeId),
        `archetype "${archetype.id}" references missing tree "${archetype.progressionTreeId}" (known: ${[...treeIds].join(', ')})`,
      ).toBe(true);
    }
  });

  it('the gunslinger tree id is "gunslinger"', () => {
    expect(gunslingerTree.id).toBe('gunslinger');
  });
});

// F-4806a2c9: none of the 10 starters ran their own content through
// @ai-rpg-engine/content-schema's cross-reference validators (validateRefs /
// validateGameContent / validateAbilityPack), even though those exist
// specifically to catch dangling zone/dialogue/ability references,
// duplicate ids, and one-way zone passages. These tests wire the real
// shipped content (built via createGame(), not a hand-duplicated copy)
// through those validators.
describe('weird-west content — cross-reference integrity (F-4806a2c9)', () => {
  it('zones, dialogue speakers, and ids have no dangling references or duplicate ids', () => {
    const engine = createGame(1);
    const pack: ContentPack = {
      zones: Object.values(engine.store.state.zones) as unknown as ContentPack['zones'],
      entities: Object.values(engine.store.state.entities) as unknown as ContentPack['entities'],
      dialogues: [bartenderDialogue],
      abilities: weirdWestAbilities,
      statuses: weirdWestStatusDefinitions,
    };

    const result = validateGameContent(pack);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  // Live bug caught by the cross-reference test above: bartenderDialogue's
  // speakers listed the entity's display name ("Silas") instead of its real
  // id ("bartender_silas"). dialogue-core's speakHandler auto-discovers a
  // dialogue by `d.speakers.includes(targetId)` — the real entity id — when
  // the caller doesn't pass an explicit dialogueId (the normal "talk to this
  // NPC" path). With the display name in speakers[], talking to Silas
  // without already knowing his internal dialogue id silently failed with
  // "has nothing to say".
  it('speaking to Silas without an explicit dialogueId finds his dialogue', () => {
    const engine = createGame(1);
    const events = engine.submitAction('speak', { targetIds: ['bartender_silas'] });
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

  it('abilities reference only stats/resources declared in the ruleset', () => {
    const result = validateAbilityPack(weirdWestAbilities, weirdWestMinimalRuleset);
    expect(result.errors).toEqual([]);
  });
});
