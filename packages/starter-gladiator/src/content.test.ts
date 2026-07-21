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
  itemCatalog,
  encounterSpawnContent,
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

    // F-ENG008: supply the real item registry so entity.inventory /
    // entity.equipment references validate against the pack armory instead of
    // being skipped (validateGameContent skips categories with no registry).
    const result = validateGameContent(pack, {
      itemIds: itemCatalog.items.map((i) => i.id),
    });
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

// W7-gladiator-encounter-tables: computed validity for the zone-entry spawn
// content, mirroring encounter-spawn's fail-closed validator constraints
// structurally (this branch predates the module, so the assertions are
// module-free; post-merge the sibling-standard one-liner also holds:
//   expect(validateEncounterSpawnContent(encounterSpawnContent, zones)).toEqual([]); ).
describe('gladiator encounter spawn tables — computed validity', () => {
  const declaredIds = new Set(encounterSpawnContent.encounters.map((e) => e.id));
  const templateIds = new Set(encounterSpawnContent.entityTemplates.map((t) => t.id));

  it('every zone table key is a real zone in the shipped world', () => {
    const zoneIds = new Set(Object.keys(createGame(1).store.state.zones));
    for (const zoneId of Object.keys(encounterSpawnContent.zoneTables)) {
      expect(zoneIds.has(zoneId), `zone table references unknown zone '${zoneId}'`).toBe(true);
    }
  });

  it('every table entry references a declared encounter (weight = repetition)', () => {
    for (const [zoneId, table] of Object.entries(encounterSpawnContent.zoneTables)) {
      expect(table.length, `zone '${zoneId}' has an empty table`).toBeGreaterThan(0);
      for (const encounterId of table) {
        expect(declaredIds.has(encounterId), `zone '${zoneId}' lists undeclared encounter '${encounterId}'`).toBe(true);
      }
    }
  });

  it('every placement honors the encounter’s own validZoneIds', () => {
    for (const [zoneId, table] of Object.entries(encounterSpawnContent.zoneTables)) {
      for (const encounterId of table) {
        const enc = encounterSpawnContent.encounters.find((e) => e.id === encounterId);
        if (!enc?.validZoneIds) continue;
        expect(
          enc.validZoneIds.includes(zoneId),
          `'${encounterId}' placed in '${zoneId}' outside its validZoneIds [${enc.validZoneIds.join(', ')}]`,
        ).toBe(true);
      }
    }
  });

  it('no boss-fight composition and no role:boss participant or template (fail-closed constraint)', () => {
    for (const enc of encounterSpawnContent.encounters) {
      expect(enc.composition, `'${enc.id}' is a boss-fight — spawn-refused by the module`).not.toBe('boss-fight');
      for (const p of enc.participants) {
        expect(p.role, `'${enc.id}' carries a boss participant`).not.toBe('boss');
      }
    }
    for (const t of encounterSpawnContent.entityTemplates) {
      expect(t.tags, `template '${t.id}' is tagged role:boss`).not.toContain('role:boss');
    }
  });

  it('every participant resolves to a spawnable entity template that is a living enemy', () => {
    for (const enc of encounterSpawnContent.encounters) {
      for (const p of enc.participants) {
        expect(templateIds.has(p.entityId), `'${enc.id}' participant '${p.entityId}' has no entity template`).toBe(true);
      }
    }
    for (const t of encounterSpawnContent.entityTemplates) {
      expect(t.type).toBe('enemy');
      expect(t.resources.hp ?? 0).toBeGreaterThan(0);
    }
  });
});
