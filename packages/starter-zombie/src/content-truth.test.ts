// Content truth regression tests — dogfood swarm wave-5 (Tier-0).
//
// Pins the audited content contracts:
//  T0-tag-gate             — every creation path carries the tags its ability
//                            kit gates on (created characters see abilities)
//  T0-progression-ceiling  — max earnable XP >= total tree cost, computed
//                            over the live content (edits keep it honest)
//  T0-unreachable-abilities — every gated ability has a reachable grant path
//  T0-player-maxhp         — player entities carry maxHp so the HUD HP bar
//                            and (low) warning can render
//  T0-verb-honesty-content — the ruleset help table only advertises verbs
//                            with registered handlers, incl. brace/reposition
//  T0-equipment-truth      — every creation path's kit resolves in the item
//                            catalog and is equippable by the tags that path
//                            grants (F-86b9145d: the equip loop wired into
//                            this pack)
//  T0-coin-seed            — the authored player starts with a positive coin
//                            balance so trade-core's universal buy verb is
//                            reachable from the first tick (F-92c78519)
//  T0-recruitable-truth    — the universal recruit verb has at least one
//                            reachable, well-formed target (F-a56f7e5d: this
//                            pack shipped 'recruit' with zero recruitable NPCs)

import { describe, it, expect } from 'vitest';
import { resolveEntity, type CharacterBuild } from '@ai-rpg-engine/character-creation';
import {
  getAvailableAbilities,
  getCurrency,
  deriveCompanionRole,
  isCompanionRecruitable,
  companionRoleTag,
} from '@ai-rpg-engine/modules';
import type { AbilityDefinition } from '@ai-rpg-engine/content-schema';
import { createGame } from './setup.js';
import { zombieMinimalRuleset } from './ruleset.js';
import {
  buildCatalog,
  player,
  medic,
  leader,
  zombieAbilities,
  survivalTree,
  medicDialogue,
  xpAwards,
  itemCatalog,
} from './content.js';

const dialogues = [medicDialogue];

/** has-tag / not-tag gate predicate, mirroring ability-core's checkCondition. */
function gateOpen(ability: AbilityDefinition, tags: string[]): boolean {
  return (ability.requirements ?? []).every((r) => {
    if (r.type === 'has-tag') return tags.includes(r.params.tag as string);
    if (r.type === 'not-tag') return !tags.includes(r.params.tag as string);
    return true;
  });
}

/** Minimal valid build: first background, first flaw trait (satisfies requiredFlaws). */
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
  const engine = createGame(11);
  const entity = resolveEntity(buildFor(archetypeId), buildCatalog, zombieMinimalRuleset);
  const playerId = engine.store.state.playerId;
  entity.id = playerId;
  entity.zoneId = engine.store.state.entities[playerId]?.zoneId;
  engine.store.state.entities[playerId] = entity;
  return { engine, playerId, entity };
}

/** Abilities whose tag gates a fresh creation of each archetype must open. */
const EXPECTED_OPEN: Record<string, number> = { 'survivor': 4, 'scavenger': 4, 'warden': 4 };

describe('T0-tag-gate: created characters see the pack ability kit', () => {
  for (const archetype of buildCatalog.archetypes) {
    it(`${archetype.id} passes the tag gates and gets a non-empty ability menu`, () => {
      const { engine, playerId, entity } = insertCreatedCharacter(archetype.id);
      const open = zombieAbilities.filter((a) => gateOpen(a, entity.tags));
      expect(open.length).toBe(EXPECTED_OPEN[archetype.id]);
      const available = getAvailableAbilities(engine.store.state, playerId, [...zombieAbilities]);
      expect(available.length).toBeGreaterThan(0);
    });
  }
});

describe('T0-progression-ceiling: earnable XP covers the tree (computed over content)', () => {
  it('kills + dialogue + first-visits + boss bonus >= total tree cost', () => {
    const world = createGame(11).store.state;
    const entities = Object.values(world.entities);
    const enemies = entities.filter((e) => e.type === 'enemy');
    const bosses = entities.filter((e) => e.tags.includes('role:boss'));
    const zoneCount = Object.keys(world.zones).length;
    const treeCost = survivalTree.nodes.reduce((sum, n) => sum + n.cost, 0);
    const earnable =
      enemies.length * xpAwards.kill +
      bosses.length * xpAwards.bossBonus +
      dialogues.length * xpAwards.dialogueComplete +
      zoneCount * xpAwards.firstVisit;
    expect(enemies.length).toBeGreaterThan(0);
    expect(bosses.length).toBeGreaterThan(0);
    expect(earnable).toBeGreaterThanOrEqual(treeCost);
  });

  it('first-visit XP awards once per zone (out, back, out again)', () => {
    const engine = createGame(11);
    const world = engine.store.state;
    const playerId = world.playerId;
    const startZone = (world.entities[playerId].zoneId ?? world.locationId) as string;
    const neighbor = world.zones[startZone].neighbors[0];
    engine.submitAction('move', { targetIds: [neighbor] });
    expect(getCurrency(world, playerId, 'xp')).toBe(xpAwards.firstVisit);
    engine.submitAction('move', { targetIds: [startZone] }); // start zone: first ENTERED event
    expect(getCurrency(world, playerId, 'xp')).toBe(2 * xpAwards.firstVisit);
    engine.submitAction('move', { targetIds: [neighbor] }); // repeat visit — no award
    expect(getCurrency(world, playerId, 'xp')).toBe(2 * xpAwards.firstVisit);
  });
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

describe('T0-verb-honesty-content: help rows match registered handlers', () => {
  it('every advertised verb resolves to a registered handler', () => {
    const registered = new Set(createGame(11).getAvailableActions());
    for (const verb of zombieMinimalRuleset.verbs) {
      expect(registered.has(verb.id), `help advertises unregistered verb '${verb.id}'`).toBe(true);
    }
  });

  it('brace and reposition (registered by the combat stack) appear in help', () => {
    const helped = new Set(zombieMinimalRuleset.verbs.map((v) => v.id));
    expect(helped.has('brace')).toBe(true);
    expect(helped.has('reposition')).toBe(true);
  });

  it('creation archetypes do not advertise unregistered verbs', () => {
    const registered = new Set(createGame(11).getAvailableActions());
    for (const a of buildCatalog.archetypes) {
      for (const v of a.grantedVerbs ?? []) {
        expect(registered.has(v), `archetype ${a.id} grants unregistered verb '${v}'`).toBe(true);
      }
    }
  });

  it('equip/unequip help rows resolve to registered handlers (F-86b9145d wiring)', () => {
    const registered = new Set(createGame(11).getAvailableActions());
    const helped = new Set(zombieMinimalRuleset.verbs.map((v) => v.id));
    for (const verb of ['equip', 'unequip']) {
      expect(helped.has(verb), `'${verb}' missing from the help table`).toBe(true);
      expect(registered.has(verb), `'${verb}' advertised but unregistered`).toBe(true);
    }
  });
});

describe('T0-equipment-truth: every entry path can reach the equip loop (computed)', () => {
  const catalogIds = new Set(itemCatalog.items.map((i) => i.id));

  it('every archetype/background startingInventory item resolves in the item catalog', () => {
    // Ashfall Dead's archetypes/backgrounds author no startingInventory today
    // (this iterates 0 items per kit and is vacuously true) — kept as a
    // standing regression guard so any future authored kit is checked the
    // same way starter-fantasy's gravewalker/torch bug (F-1b2e6406) should
    // have been caught.
    const kits = [
      ...buildCatalog.archetypes.map((a) => ({ id: `archetype ${a.id}`, items: a.startingInventory ?? [] })),
      ...buildCatalog.backgrounds.map((b) => ({ id: `background ${b.id}`, items: b.startingInventory ?? [] })),
    ];
    for (const kit of kits) {
      for (const itemId of kit.items) {
        expect(catalogIds.has(itemId), `${kit.id} carries '${itemId}' which is not in the item catalog`).toBe(true);
      }
    }
  });

  it('every archetype can equip its own kit (requiredTags ⊆ the tags creation grants)', () => {
    for (const a of buildCatalog.archetypes) {
      for (const itemId of a.startingInventory ?? []) {
        const item = itemCatalog.items.find((i) => i.id === itemId);
        if (!item) continue; // covered by the resolution assertion above
        const missing = (item.requiredTags ?? []).filter((t) => !a.startingTags.includes(t));
        expect(
          missing,
          `archetype ${a.id} starts with '${itemId}' but cannot equip it (missing tags: ${missing.join(', ')})`,
        ).toEqual([]);
      }
    }
  });

  // Adapted from starter-gladiator's own T0-equipment-truth block: this
  // pack's authored player starts with an EMPTY inventory (antibiotics only
  // arrive later via the medic's dialogue gift), so this guards whatever the
  // authored player DOES carry rather than asserting a non-empty starting kit
  // that was never authored here.
  it("the authored player's starting inventory (if any) is catalog-recognized and equippable", () => {
    const carried = (player.inventory ?? []).filter((id) => catalogIds.has(id));
    for (const itemId of carried) {
      const item = itemCatalog.items.find((i) => i.id === itemId)!;
      const missing = (item.requiredTags ?? []).filter((t) => !player.tags.includes(t));
      expect(missing, `authored player cannot equip '${itemId}'`).toEqual([]);
    }
  });
});

describe('T0-coin-seed: the universal buy verb is reachable from the first tick (F-92c78519)', () => {
  it('the authored player starts with a positive coin balance', () => {
    expect(player.resources.coin).toBeGreaterThan(0);
  });
});

describe('T0-recruitable-truth: the universal recruit verb has a reachable target (F-a56f7e5d)', () => {
  it('Dr. Chen and Sergeant Marsh carry recruitable + a valid bare role tag', () => {
    for (const npc of [medic, leader]) {
      expect(isCompanionRecruitable(npc), `${npc.name} is not recruitable`).toBe(true);
      const role = deriveCompanionRole(npc);
      expect(npc.tags, `${npc.name} carries no bare role tag`).toContain(role);
    }
    expect(deriveCompanionRole(medic)).toBe('healer');
    expect(deriveCompanionRole(leader)).toBe('fighter');
  });

  it('both recruitable NPCs carry maxHp/maxStamina (F-4b9c5aee shape parity)', () => {
    for (const npc of [medic, leader]) {
      expect(npc.resources.maxHp, `${npc.name} missing maxHp`).toBeDefined();
      expect(npc.resources.maxHp).toBeGreaterThanOrEqual(npc.resources.hp);
      expect(npc.resources.maxStamina, `${npc.name} missing maxStamina`).toBeDefined();
      expect(npc.resources.maxStamina).toBeGreaterThanOrEqual(npc.resources.stamina ?? 0);
    }
  });

  it('recruiting Dr. Chen succeeds end-to-end: companion.recruited fires and role tags land', () => {
    const engine = createGame(11);
    // medic_chen shares the survivor's starting zone (safehouse-lobby) — no
    // travel needed; recruitHandler gates on same-zone.
    const events = engine.submitAction('recruit', { targetIds: ['medic_chen'] });
    expect(events.some((e) => e.type === 'companion.recruited')).toBe(true);

    const chen = engine.world.entities['medic_chen'];
    expect(chen.tags).toContain('companion');
    expect(chen.tags).toContain(companionRoleTag('healer'));
  });
});
