// Detective content integrity tests
//
// ST-05: the pack applies an 'exposed' status. The engine combat layer also
// has an "exposed" combat state, but it is namespaced as COMBAT_STATES.EXPOSED
// ('combat:exposed'). These are distinct status ids and must NOT shadow or
// collide with one another — applying the pack status must not register the
// engine combat state, and vice versa. This test pins that separation so a
// future rename of either side cannot silently introduce a collision.

import { describe, it, expect } from 'vitest';
import type { EntityState } from '@ai-rpg-engine/core';
import { COMBAT_STATES, applyStatus, hasStatus } from '@ai-rpg-engine/modules';
import { validateGameContent, validateAbilityPack } from '@ai-rpg-engine/content-schema';
import type { ContentPack } from '@ai-rpg-engine/content-schema';
import { createGame } from './setup.js';
import {
  detectiveStatusDefinitions,
  widowDialogue,
  deductionTree,
  detectiveAbilities,
  buildCatalog,
} from './content.js';
import { detectiveMinimalRuleset } from './ruleset.js';

function makeEntity(): EntityState {
  return {
    id: 'subject', blueprintId: 'subject', type: 'enemy', name: 'Subject',
    tags: [], stats: {}, resources: { hp: 10 }, statuses: [], zoneId: 'z',
  };
}

describe('detective content — exposed status disambiguation (ST-05)', () => {
  const packExposed = detectiveStatusDefinitions.find((s) => s.id === 'exposed');

  it('declares an "exposed" pack status', () => {
    expect(packExposed).toBeDefined();
  });

  it('pack "exposed" id is distinct from the engine COMBAT_STATES.EXPOSED id', () => {
    expect(packExposed!.id).toBe('exposed');
    expect(COMBAT_STATES.EXPOSED).toBe('combat:exposed');
    expect(packExposed!.id).not.toBe(COMBAT_STATES.EXPOSED);
  });

  it('applying the pack "exposed" status does not register the engine combat state', () => {
    const e = makeEntity();
    applyStatus(e, 'exposed', 0, { duration: 2 });
    expect(hasStatus(e, 'exposed')).toBe(true);
    // The engine's combat "exposed" state is a different id and must be absent.
    expect(hasStatus(e, COMBAT_STATES.EXPOSED)).toBe(false);
  });

  it('applying the engine combat state does not register the pack "exposed" status', () => {
    const e = makeEntity();
    applyStatus(e, COMBAT_STATES.EXPOSED, 0, { duration: 2 });
    expect(hasStatus(e, COMBAT_STATES.EXPOSED)).toBe(true);
    expect(hasStatus(e, 'exposed')).toBe(false);
  });
});

// F-4806a2c9 / F-d95c600a: none of the 10 starters ran their own content
// through @ai-rpg-engine/content-schema's cross-reference validators
// (validateRefs / validateGameContent / validateAbilityPack), even though
// those exist specifically to catch dangling zone/dialogue/ability
// references, duplicate ids, and one-way zone passages. These tests wire
// the real shipped content (built via createGame(), not a hand-duplicated
// copy) through those validators.
describe('detective content — cross-reference integrity (F-4806a2c9)', () => {
  it('zones, dialogue speakers, and ids have no dangling references or duplicate ids', () => {
    const engine = createGame(1);
    const pack: ContentPack = {
      zones: Object.values(engine.store.state.zones) as unknown as ContentPack['zones'],
      entities: Object.values(engine.store.state.entities) as unknown as ContentPack['entities'],
      dialogues: [widowDialogue],
      abilities: detectiveAbilities,
      statuses: detectiveStatusDefinitions,
    };

    const result = validateGameContent(pack);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  // Live bug caught by the cross-reference test above: widowDialogue's
  // speakers listed the entity's display name ("Lady Ashford") instead of
  // its real id ("widow_ashford"). dialogue-core's speakHandler
  // auto-discovers a dialogue by `d.speakers.includes(targetId)` — the real
  // entity id — when the caller doesn't pass an explicit dialogueId (the
  // normal "talk to this NPC" path). With the display name in speakers[],
  // talking to Lady Ashford without already knowing her internal dialogue id
  // silently failed with "has nothing to say".
  it('speaking to Lady Ashford without an explicit dialogueId finds her dialogue', () => {
    const engine = createGame(1);
    const events = engine.submitAction('speak', { targetIds: ['widow_ashford'] });
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
    const treeIds = new Set([deductionTree.id]);
    for (const archetype of buildCatalog.archetypes) {
      if (archetype.progressionTreeId === undefined) continue;
      expect(
        treeIds.has(archetype.progressionTreeId),
        `archetype "${archetype.id}" references missing tree "${archetype.progressionTreeId}" (known: ${[...treeIds].join(', ')})`,
      ).toBe(true);
    }
  });

  it('abilities reference only stats/resources declared in the ruleset', () => {
    const result = validateAbilityPack(detectiveAbilities, detectiveMinimalRuleset);
    expect(result.errors).toEqual([]);
  });
});
