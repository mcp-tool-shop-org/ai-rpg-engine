// Zombie content integrity tests
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
  medicDialogue,
  survivalTree,
  zombieAbilities,
  zombieStatusDefinitions,
  buildCatalog,
} from './content.js';
import { zombieMinimalRuleset } from './ruleset.js';

describe('zombie content — cross-reference integrity (F-4806a2c9)', () => {
  it('zones, dialogue speakers, and ids have no dangling references or duplicate ids', () => {
    const engine = createGame(1);
    const pack: ContentPack = {
      zones: Object.values(engine.store.state.zones) as unknown as ContentPack['zones'],
      entities: Object.values(engine.store.state.entities) as unknown as ContentPack['entities'],
      dialogues: [medicDialogue],
      abilities: zombieAbilities,
      statuses: zombieStatusDefinitions,
    };

    const result = validateGameContent(pack);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  // Live bug caught by the cross-reference test above: medicDialogue's
  // speakers listed the entity's display name ("Dr. Chen") instead of its
  // real id ("medic_chen"). dialogue-core's speakHandler auto-discovers a
  // dialogue by `d.speakers.includes(targetId)` — the real entity id — when
  // the caller doesn't pass an explicit dialogueId (the normal "talk to this
  // NPC" path). With the display name in speakers[], talking to the medic
  // without already knowing her internal dialogue id silently failed with
  // "has nothing to say".
  it('speaking to the medic without an explicit dialogueId finds her dialogue', () => {
    const engine = createGame(1);
    const events = engine.submitAction('speak', { targetIds: ['medic_chen'] });
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
    const treeIds = new Set([survivalTree.id]);
    for (const archetype of buildCatalog.archetypes) {
      if (archetype.progressionTreeId === undefined) continue;
      expect(
        treeIds.has(archetype.progressionTreeId),
        `archetype "${archetype.id}" references missing tree "${archetype.progressionTreeId}" (known: ${[...treeIds].join(', ')})`,
      ).toBe(true);
    }
  });

  it('abilities reference only stats/resources declared in the ruleset', () => {
    const result = validateAbilityPack(zombieAbilities, zombieMinimalRuleset);
    expect(result.errors).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════
// CROSS-INSTANCE STATE ISOLATION
// setup.ts inserts entities from module-level constants. If insertion kept
// the caller's reference, the nested resources/stats/statuses objects would
// be shared across every engine built in one process, so combat damage (or
// the CLI's NPC turn driver killing a walker) in engine A would permanently
// mutate the constant and a LATER createGame() would boot with a dead
// walker. The invariant that prevents this is store-level: WorldStore
// addEntity/addZone detach their argument at ingestion. Same class as
// F-71ec5dcd.
// ═══════════════════════════════════════════════════════════════════
describe('zombie content — cross-instance state isolation', () => {
  it('killing a walker in engine A does not carry into a fresh engine B', () => {
    const a = createGame(1);
    const fullHp = a.store.state.entities['shambler_1'].resources.hp;
    expect(fullHp).toBeGreaterThan(0);

    a.store.state.entities['shambler_1'].resources.hp = 0;

    const b = createGame(1);
    expect(b.store.state.entities['shambler_1'].resources.hp).toBe(fullHp);
    expect(b.store.state.entities['shambler_1'].resources)
      .not.toBe(a.store.state.entities['shambler_1'].resources);
  });
});
