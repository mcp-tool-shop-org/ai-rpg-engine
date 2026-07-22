// Fantasy content determinism tests
//
// DETERMINISM: the healing-draught item-use effect previously minted its
// resource.changed event id from the deprecated process-global nextId(), which
// breaks the "same seed + same actions => byte-identical event ids" guarantee
// (two engines share the global counter; a reloaded game restarts it and
// collides with existing ids). The effect now leaves the id falsy so the
// per-instance WorldStore.recordEvent choke point assigns a deterministic id
// from state.meta.idCounter. This test proves the resulting id is non-empty
// and identical across two same-seed engines, and pins it against regression.

import { describe, it, expect } from 'vitest';
import { validateEncounterSpawnContent } from '@ai-rpg-engine/modules';
import { encounterSpawnContent, zones as authoredZones } from './content.js';
import { validateGameContent, validateAbilityPack } from '@ai-rpg-engine/content-schema';
import type { ContentPack } from '@ai-rpg-engine/content-schema';
import { createGame } from './setup.js';
import {
  pilgrimDialogue,
  combatMasteryTree,
  fantasyAbilities,
  fantasyStatusDefinitions,
  buildCatalog,
} from './content.js';
import { fantasyMinimalRuleset } from './ruleset.js';

function useHealingDraught() {
  const engine = createGame(42);
  // Put the player below max HP so the heal produces an observable delta, and
  // give them the consumable to use.
  const player = engine.store.state.entities['player'];
  player.resources.hp = 5;
  player.inventory = ['healing-draught'];

  const events = engine.submitAction('use', { toolId: 'healing-draught' });
  return events.find((e) => e.type === 'resource.changed');
}

describe('fantasy content — healing-draught event id determinism', () => {
  it('emits a resource.changed event with a non-empty id', () => {
    const evt = useHealingDraught();
    expect(evt).toBeDefined();
    expect(evt!.id).toBeTruthy();
    expect(evt!.id.length).toBeGreaterThan(0);
  });

  it('produces byte-identical event ids across two same-seed engines', () => {
    const a = useHealingDraught();
    const b = useHealingDraught();
    expect(a!.id).toBe(b!.id);
  });

  it('does not reference the deprecated global counter format collision', () => {
    // The id must be drawn from the per-instance counter via recordEvent's
    // genId; it should be a prefixed counter token, not an empty string.
    const evt = useHealingDraught();
    expect(evt!.id).toMatch(/^evt_/);
  });
});

// F-4806a2c9 / F-d95c600a: none of the 10 starters ran their own content
// through @ai-rpg-engine/content-schema's cross-reference validators
// (validateRefs / validateGameContent / validateAbilityPack), even though
// those exist specifically to catch dangling zone/dialogue/ability
// references, duplicate ids, and one-way zone passages. These tests wire
// the real shipped content (built via createGame(), not a hand-duplicated
// copy) through those validators.
describe('fantasy content — cross-reference integrity (F-4806a2c9)', () => {
  it('zones, dialogue speakers, and ids have no dangling references or duplicate ids', () => {
    const engine = createGame(1);
    const pack: ContentPack = {
      zones: Object.values(engine.store.state.zones) as unknown as ContentPack['zones'],
      entities: Object.values(engine.store.state.entities) as unknown as ContentPack['entities'],
      dialogues: [pilgrimDialogue],
      abilities: fantasyAbilities,
      statuses: fantasyStatusDefinitions,
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
    const treeIds = new Set([combatMasteryTree.id]);
    for (const archetype of buildCatalog.archetypes) {
      if (archetype.progressionTreeId === undefined) continue;
      expect(
        treeIds.has(archetype.progressionTreeId),
        `archetype "${archetype.id}" references missing tree "${archetype.progressionTreeId}" (known: ${[...treeIds].join(', ')})`,
      ).toBe(true);
    }
  });

  it('abilities reference only stats/resources declared in the ruleset', () => {
    const result = validateAbilityPack(fantasyAbilities, fantasyMinimalRuleset);
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
describe('fantasy encounter tables (F-ENG005-encounter-spawn-wiring)', () => {
  it('every table entry references an authored, spawnable encounter valid for its zone', () => {
    expect(validateEncounterSpawnContent(encounterSpawnContent, authoredZones)).toEqual([]);
  });
});
