// T0 content truth — the canonical creation family, run on the twelfth pack.
//
// Salt Road Ledger shipped WITHOUT this family and paid for it: its `runner`
// archetype carried `standing` in resourceOverrides, `standing` is a stat, and
// creation writes every override key into entity.resources regardless of the
// ruleset — so every runner minted an unbounded phantom resource nothing
// clamped or read. Nothing in that package could see it, because nothing in
// that package ever built a character.
//
// Hue and Cry ships with the family from birth. That is most of what "born
// conformant" means: not that the pack passes the catalog's gates, but that it
// carries the proofs the catalog learned it needed.

import { describe, it, expect } from 'vitest';
import { resolveEntity, type CharacterBuild } from '@ai-rpg-engine/character-creation';
import { getAvailableAbilities } from '@ai-rpg-engine/modules';
import type { AbilityDefinition } from '@ai-rpg-engine/content-schema';
import { createGame, bountyHunterIntentProfiles } from './setup.js';
import { bountyHunterMinimalRuleset } from './ruleset.js';
import {
  buildCatalog,
  itemCatalog,
  player,
  bountyHunterAbilities,
  zones,
  districts,
  rookeryRunner,
  bludger,
  nightman,
  jonathanQuill,
} from './content.js';

/** has-tag / not-tag gate predicate, mirroring ability-core's checkCondition. */
function gateOpen(ability: AbilityDefinition, tags: string[]): boolean {
  return (ability.requirements ?? []).every((r) => {
    if (r.type === 'has-tag') return tags.includes(r.params.tag as string);
    if (r.type === 'not-tag') return !tags.includes(r.params.tag as string);
    return true;
  });
}

function buildFor(archetypeId: string): CharacterBuild {
  const flaw = buildCatalog.traits.find((t) => t.category === 'flaw');
  return {
    name: 'Tester',
    archetypeId,
    backgroundId: buildCatalog.backgrounds[0].id,
    traitIds: flaw ? [flaw.id] : [],
  };
}

/** CLI-style insertion — exactly what bin.ts does after character creation. */
function insertCreatedCharacter(archetypeId: string) {
  const engine = createGame(71);
  const entity = resolveEntity(buildFor(archetypeId), buildCatalog, bountyHunterMinimalRuleset);
  const playerId = engine.store.state.playerId;
  entity.id = playerId;
  entity.zoneId = engine.store.state.entities[playerId]?.zoneId;
  engine.store.state.entities[playerId] = entity;
  return { engine, playerId, entity };
}

describe('T0-tag-gate: created characters see the pack ability kit', () => {
  for (const archetype of buildCatalog.archetypes) {
    it(`${archetype.id} passes the tag gates and gets a non-empty ability menu`, () => {
      const { engine, playerId, entity } = insertCreatedCharacter(archetype.id);
      const open = bountyHunterAbilities.filter((a) => gateOpen(a, entity.tags));
      expect(
        open.length,
        `${archetype.id} opens no abilities — check startingTags carries 'thief-taker'`,
      ).toBe(bountyHunterAbilities.length);
      expect(getAvailableAbilities(engine.store.state, playerId, [...bountyHunterAbilities]).length)
        .toBeGreaterThan(0);
    });
  }
});

describe('T0-player-maxhp: the HUD HP bar can render for the player', () => {
  it('pack player entity carries maxHp >= hp', () => {
    expect(player.resources.maxHp).toBeDefined();
    expect(player.resources.maxHp).toBeGreaterThanOrEqual(player.resources.hp);
  });

  for (const archetype of buildCatalog.archetypes) {
    it(`${archetype.id} carries maxHp >= hp`, () => {
      const { entity } = insertCreatedCharacter(archetype.id);
      expect(entity.resources.maxHp).toBeDefined();
      expect(entity.resources.maxHp).toBeGreaterThanOrEqual(entity.resources.hp);
    });
  }
});

describe('T0-resource-truth: creation mints no resource the ruleset does not declare', () => {
  const declared = new Set(bountyHunterMinimalRuleset.resources.map((r) => r.id));
  const derived = new Set(['maxHp', 'maxStamina']);

  for (const archetype of buildCatalog.archetypes) {
    it(`${archetype.id} resolves to declared resources only`, () => {
      const { entity } = insertCreatedCharacter(archetype.id);
      const phantom = Object.keys(entity.resources).filter((k) => !declared.has(k) && !derived.has(k));
      expect(
        phantom,
        `${archetype.id} minted resources the ruleset never declared — the merchant runner defect`,
      ).toEqual([]);
    });
  }
});

describe('T0-inventory-truth: every authored starting item exists in the catalog', () => {
  const known = new Set(itemCatalog.items.map((i) => i.id));

  it('the pack player carries only real items', () => {
    for (const id of player.inventory ?? []) {
      expect(known.has(id), `player starts with '${id}', which no catalog entry defines`).toBe(true);
    }
  });

  for (const archetype of buildCatalog.archetypes) {
    it(`${archetype.id} starts with only real items`, () => {
      for (const id of archetype.startingInventory ?? []) {
        expect(known.has(id), `${archetype.id} starts with '${id}', undefined in the catalog`).toBe(true);
      }
    });
  }
});

describe('T0-world-truth: the authored world is navigable and populated', () => {
  it('every zone neighbor is a zone that exists, and the graph is connected', () => {
    const ids = new Set(zones.map((z) => z.id));
    for (const zone of zones) {
      for (const n of zone.neighbors ?? []) {
        expect(ids.has(n), `${zone.id} lists neighbor '${n}', which does not exist`).toBe(true);
      }
    }
    // Reachability from the start zone — a pack with an unreachable zone has
    // authored content no session can ever see.
    const seen = new Set([player.zoneId]);
    const queue = [player.zoneId];
    while (queue.length > 0) {
      // ⚠ `zones.find((z) => z.id === queue.shift())` reads fine and is a bug:
      // `find` runs its predicate ONCE PER ZONE, so the queue drains by the
      // length of the zone list on every step. The first draft of this test
      // did exactly that and reported four unreachable zones in a graph that
      // is fully connected — the probe wrong, the content fine, which is this
      // release's most repeated lesson arriving one more time.
      const id = queue.shift();
      const here = zones.find((z) => z.id === id);
      for (const n of here?.neighbors ?? []) {
        if (!seen.has(n)) { seen.add(n); queue.push(n); }
      }
    }
    expect([...ids].filter((z) => !seen.has(z)), 'these zones cannot be walked to').toEqual([]);
  });

  it('every district names zones that exist, and every zone belongs to one', () => {
    const ids = new Set(zones.map((z) => z.id));
    const claimed = new Set<string>();
    for (const d of districts) {
      for (const z of d.zoneIds) {
        expect(ids.has(z), `district '${d.id}' claims zone '${z}', which does not exist`).toBe(true);
        claimed.add(z);
      }
    }
    expect([...ids].filter((z) => !claimed.has(z)), 'these zones are in no district').toEqual([]);
  });

  it('every hostile declares an intent profile the pack actually supplies', () => {
    // The v3.0 lesson: with an unresolved profileId no enemy ever picks an
    // intent, so no enemy ever acts — and a pack full of hostiles reads as a
    // pack full of furniture.
    const supplied = new Set(bountyHunterIntentProfiles.map((p) => p.id));
    for (const hostile of [rookeryRunner, bludger, nightman, jonathanQuill]) {
      const id = hostile.ai?.profileId;
      expect(id, `${hostile.id} declares no ai.profileId`).toBeTruthy();
      expect(supplied.has(id!), `${hostile.id} wants profile '${id}', which setup.ts does not supply`).toBe(true);
    }
  });

  it('every hostile is typed `enemy` — the v3.7 probe bug, from the content side', () => {
    // A probe filtering for `npc` found no hostiles anywhere in the catalog,
    // because hostiles are `enemy`. The declaration side of that is pinned by
    // PCC-1; this is the content side, in the pack that ships knowing it.
    for (const hostile of [rookeryRunner, bludger, nightman, jonathanQuill]) {
      expect(hostile.type, `${hostile.id} is not typed 'enemy'`).toBe('enemy');
    }
  });
});

describe('PFA-1 parity: entity id and blueprintId agree', () => {
  it('every authored entity has id === blueprintId', () => {
    // The catalog-wide gate checks this too; carrying it locally means the
    // pack's own suite fails first, where the fix is.
    for (const e of [player, rookeryRunner, bludger, nightman, jonathanQuill]) {
      expect(e.blueprintId, `${e.id} has a blueprintId that is not its id`).toBe(e.id);
    }
  });
});
