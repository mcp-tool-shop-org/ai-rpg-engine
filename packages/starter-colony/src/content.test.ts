// Colony content integrity tests
//
// ST-01: archetypes referenced a progression tree id with a "-path" suffix
// ("commander-path") that did not match the actual tree id ("commander"). The
// reference must resolve to a real tree, otherwise character creation hands the
// player a build pointing at a non-existent progression tree.

import { describe, it, expect } from 'vitest';
import { validateEncounterSpawnContent } from '@ai-rpg-engine/modules';
import { encounterSpawnContent, zones as authoredZones } from './content.js';
import { validateGameContent, validateAbilityPack } from '@ai-rpg-engine/content-schema';
import type { ContentPack } from '@ai-rpg-engine/content-schema';
import { createGame } from './setup.js';
import {
  buildCatalog,
  commanderTree,
  scientistDialogue,
  colonyAbilities,
  colonyStatusDefinitions,
  itemCatalog,
  emergencyCellEffect,
} from './content.js';
import { colonyMinimalRuleset } from './ruleset.js';

describe('colony content — progression tree references', () => {
  it('every archetype.progressionTreeId resolves to a defined tree', () => {
    const treeIds = new Set([commanderTree.id]);
    for (const archetype of buildCatalog.archetypes) {
      if (archetype.progressionTreeId === undefined) continue;
      expect(
        treeIds.has(archetype.progressionTreeId),
        `archetype "${archetype.id}" references missing tree "${archetype.progressionTreeId}" (known: ${[...treeIds].join(', ')})`,
      ).toBe(true);
    }
  });

  it('the commander tree id is "commander"', () => {
    expect(commanderTree.id).toBe('commander');
  });
});

// F-4806a2c9: none of the 10 starters ran their own content through
// @ai-rpg-engine/content-schema's cross-reference validators (validateRefs /
// validateGameContent / validateAbilityPack), even though those exist
// specifically to catch dangling zone/dialogue/ability references,
// duplicate ids, and one-way zone passages. These tests wire the real
// shipped content (built via createGame(), not a hand-duplicated copy)
// through those validators.
describe('colony content — cross-reference integrity (F-4806a2c9)', () => {
  it('zones, dialogue speakers, and ids have no dangling references or duplicate ids', () => {
    const engine = createGame(1);
    const pack: ContentPack = {
      zones: Object.values(engine.store.state.zones) as unknown as ContentPack['zones'],
      entities: Object.values(engine.store.state.entities) as unknown as ContentPack['entities'],
      dialogues: [scientistDialogue],
      abilities: colonyAbilities,
      statuses: colonyStatusDefinitions,
    };

    const result = validateGameContent(pack);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  // Live bug caught by the cross-reference test above: scientistDialogue's
  // speakers listed the entity's display name ("Dr. Vasquez") instead of its
  // real id ("dr_vasquez"). dialogue-core's speakHandler auto-discovers a
  // dialogue by `d.speakers.includes(targetId)` — the real entity id — when
  // the caller doesn't pass an explicit dialogueId (the normal "talk to this
  // NPC" path). With the display name in speakers[], talking to Dr. Vasquez
  // without already knowing her internal dialogue id silently failed with
  // "has nothing to say".
  it('speaking to Dr. Vasquez without an explicit dialogueId finds her dialogue', () => {
    const engine = createGame(1);
    const events = engine.submitAction('speak', { targetIds: ['dr_vasquez'] });
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
    const result = validateAbilityPack(colonyAbilities, colonyMinimalRuleset);
    expect(result.errors).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════
// F-ENG005-encounter-spawn-wiring: the per-zone encounter tables are
// computed-validated against the live authored content — every table entry
// must reference an authored, spawnable (non-boss) encounter that its own
// validZoneIds/validZoneTags allow in that zone, with all participant
// templates present.
// ═══════════════════════════════════════════════════════════════════
describe('colony encounter tables (F-ENG005-encounter-spawn-wiring)', () => {
  it('every table entry references an authored, spawnable encounter valid for its zone', () => {
    expect(validateEncounterSpawnContent(encounterSpawnContent, authoredZones)).toEqual([]);
  });
});

// F-d70c722d: emergency-cell is granted via the dialogue.ended listener in
// setup.ts (emergencyCellEffect) but had no itemCatalog entry — the same
// shape as F-a7a22999/F-b34a5c82 (healing-draught/antibiotics).
describe('colony content — item catalog completeness (F-d70c722d)', () => {
  it('every item-use effect has a matching itemCatalog entry', () => {
    const itemIds = new Set(itemCatalog.items.map((i) => i.id));
    for (const effect of [emergencyCellEffect]) {
      expect(itemIds.has(effect.itemId), `granted item "${effect.itemId}" missing from itemCatalog`).toBe(true);
    }
  });
});
