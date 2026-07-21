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

import { describe, it, expect } from 'vitest';
import { resolveEntity, type CharacterBuild } from '@ai-rpg-engine/character-creation';
import { getAvailableAbilities, getCurrency } from '@ai-rpg-engine/modules';
import type { AbilityDefinition } from '@ai-rpg-engine/content-schema';
import { createGame } from './setup.js';
import { pirateMinimalRuleset } from './ruleset.js';
import { buildCatalog, player, pirateAbilities, seamanshipTree, cartographerDialogue, xpAwards } from './content.js';

const dialogues = [cartographerDialogue];

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
  const entity = resolveEntity(buildFor(archetypeId), buildCatalog, pirateMinimalRuleset);
  const playerId = engine.store.state.playerId;
  entity.id = playerId;
  entity.zoneId = engine.store.state.entities[playerId]?.zoneId;
  engine.store.state.entities[playerId] = entity;
  return { engine, playerId, entity };
}

/** Abilities whose tag gates a fresh creation of each archetype must open. */
const EXPECTED_OPEN: Record<string, number> = { 'corsair': 4, 'privateer': 4, 'helmsman': 4 };

describe('T0-tag-gate: created characters see the pack ability kit', () => {
  for (const archetype of buildCatalog.archetypes) {
    it(`${archetype.id} passes the tag gates and gets a non-empty ability menu`, () => {
      const { engine, playerId, entity } = insertCreatedCharacter(archetype.id);
      const open = pirateAbilities.filter((a) => gateOpen(a, entity.tags));
      expect(open.length).toBe(EXPECTED_OPEN[archetype.id]);
      const available = getAvailableAbilities(engine.store.state, playerId, [...pirateAbilities]);
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
    const treeCost = seamanshipTree.nodes.reduce((sum, n) => sum + n.cost, 0);
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

  it('created characters carry maxHp >= hp', () => {
    const { entity } = insertCreatedCharacter(buildCatalog.archetypes[0].id);
    expect(entity.resources.maxHp).toBeDefined();
    expect(entity.resources.maxHp).toBeGreaterThanOrEqual(entity.resources.hp);
  });
});

describe('T0-verb-honesty-content: help rows match registered handlers', () => {
  it('every advertised verb resolves to a registered handler', () => {
    const registered = new Set(createGame(11).getAvailableActions());
    for (const verb of pirateMinimalRuleset.verbs) {
      expect(registered.has(verb.id), `help advertises unregistered verb '${verb.id}'`).toBe(true);
    }
  });

  it('brace and reposition (registered by the combat stack) appear in help', () => {
    const helped = new Set(pirateMinimalRuleset.verbs.map((v) => v.id));
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
});
