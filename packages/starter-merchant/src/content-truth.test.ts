// T0-verb-honesty-content — the help table and the registered handlers agree.
//
// Both directions matter, and the catalog has been bitten by each:
//   - advertising a verb with no handler (colony shipped `scan`/`allocate` as
//     flavour rows that rejected on use)
//   - registering a verb the help table never mentions (V3R-MENU-3b: 21 leverage
//     verbs were reachable by free text but untaught, so no player found them)
//
// This is the first test in the pack that needs a live engine, so it is also the
// first that can catch a wiring mistake in setup.ts.

import { describe, it, expect } from 'vitest';
import { resolveEntity, type CharacterBuild } from '@ai-rpg-engine/character-creation';
import { getAvailableAbilities } from '@ai-rpg-engine/modules';
import type { AbilityDefinition } from '@ai-rpg-engine/content-schema';
import { createGame, merchantIntentProfiles } from './setup.js';
import { merchantMinimalRuleset } from './ruleset.js';
import { buildCatalog, itemCatalog, player, merchantAbilities } from './content.js';

// --- The canonical T0 creation family (F-merchant-C) ----------------------
//
// Every other starter proves its creation path by running `resolveEntity`
// exactly as bin.ts does after character creation, then asserting the resulting
// entity is playable. Salt Road Ledger shipped without any of it — the one pack
// in the catalog whose three archetypes, two disciplines, six crossTitles and
// one entanglement had never once been resolved into an entity.
//
// What that cost: the `runner` archetype carried `standing` in its
// resourceOverrides, and `standing` is a stat. Creation writes every override
// key into entity.resources regardless of the ruleset, and the clamp pass that
// follows visits only declared resources — so `runner` minted an unbounded
// phantom `resources.standing` on every character built from it. Nothing in
// this package could see that, because nothing in this package ever built one.

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
  const engine = createGame(71);
  const entity = resolveEntity(buildFor(archetypeId), buildCatalog, merchantMinimalRuleset);
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
      // Every merchant ability gates on the pack-identity tag 'merchant'; a
      // creation path that failed to grant it would hide the entire kit.
      const open = merchantAbilities.filter((a) => gateOpen(a, entity.tags));
      expect(open.length, `${archetype.id} opens no abilities — check startingTags`).toBe(merchantAbilities.length);
      const available = getAvailableAbilities(engine.store.state, playerId, [...merchantAbilities]);
      expect(available.length).toBeGreaterThan(0);
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
  const declared = new Set(merchantMinimalRuleset.resources.map((r) => r.id));
  // maxHp/maxStamina are engine-derived companions to their base resource, not
  // ruleset rows — every pack's created entities carry them.
  const derived = new Set(['maxHp', 'maxStamina']);

  for (const archetype of buildCatalog.archetypes) {
    it(`${archetype.id} resolves to declared resources only`, () => {
      const { entity } = insertCreatedCharacter(archetype.id);
      const phantom = Object.keys(entity.resources).filter((k) => !declared.has(k) && !derived.has(k));
      expect(
        phantom,
        `${archetype.id} minted resources the ruleset never declared — nothing clamps or reads these`,
      ).toEqual([]);
    });

    it(`${archetype.id} keeps every declared resource inside its ruleset bounds`, () => {
      const { entity } = insertCreatedCharacter(archetype.id);
      for (const def of merchantMinimalRuleset.resources) {
        const value = entity.resources[def.id];
        if (value === undefined) continue;
        expect(value, `${archetype.id}.${def.id}=${value} is below min ${def.min}`).toBeGreaterThanOrEqual(def.min ?? 0);
        expect(value, `${archetype.id}.${def.id}=${value} is above max ${def.max}`).toBeLessThanOrEqual(def.max ?? 999);
      }
    });
  }

  it('meta: a stat smuggled into resourceOverrides DOES mint a phantom', () => {
    // The negative control. This is the shipped defect reproduced against the
    // live engine: without it, the assertions above could pass because
    // resolveEntity silently dropped unknown keys rather than because the
    // content is clean. It does not drop them.
    const runner = buildCatalog.archetypes.find((a) => a.id === 'runner')!;
    const mutatedCatalog = {
      ...buildCatalog,
      archetypes: buildCatalog.archetypes.map((a) =>
        a.id === 'runner' ? { ...a, resourceOverrides: { ...(a.resourceOverrides ?? {}), standing: 2 } } : a,
      ),
    };
    expect(runner.resourceOverrides).not.toHaveProperty('standing');
    const entity = resolveEntity(buildFor('runner'), mutatedCatalog, merchantMinimalRuleset);
    expect(entity.resources).toHaveProperty('standing');
    expect(merchantMinimalRuleset.resources.map((r) => r.id)).not.toContain('standing');
  });
});

describe('T0-equipment-truth: every entry path can reach the equip loop', () => {
  const catalogIds = new Set(itemCatalog.items.map((i) => i.id));

  it('every archetype/background startingInventory item resolves in the item catalog', () => {
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

  it('every created character lands holding something the catalog knows', () => {
    for (const archetype of buildCatalog.archetypes) {
      const { entity } = insertCreatedCharacter(archetype.id);
      for (const itemId of entity.inventory ?? []) {
        expect(catalogIds.has(itemId), `${archetype.id} starts holding unknown item '${itemId}'`).toBe(true);
      }
    }
  });
});

/** Engine-internal verbs no pack advertises: per-tick drivers plus the two
 *  menu-driven surfaces (progression's `unlock`, opportunity-core's
 *  `opportunity`), which players reach through their own screens rather than by
 *  typing. Every other starter omits exactly these. */
const INTERNAL = new Set([
  'cognition-tick', 'environment-tick', 'faction-tick', 'district-tick',
  'unlock', 'opportunity',
]);

describe('T0-verb-honesty-content', () => {
  it('every advertised verb resolves to a registered handler', () => {
    const registered = new Set(createGame(71).getAvailableActions());
    for (const verb of merchantMinimalRuleset.verbs) {
      expect(registered.has(verb.id), `help advertises unregistered verb '${verb.id}'`).toBe(true);
    }
  });

  it('every registered player-facing verb appears in the help table', () => {
    const helped = new Set(merchantMinimalRuleset.verbs.map((v) => v.id));
    const registered = createGame(71).getAvailableActions();
    const untaught = registered.filter((v) => !helped.has(v) && !INTERNAL.has(v));
    expect(untaught, 'these verbs work but no player can discover them').toEqual([]);
  });

  it('buy and sell are taught — this is a trade pack', () => {
    // Most starters leave the world-stack trade verbs off the help table. That
    // is defensible for a gladiator and indefensible here.
    const helped = new Set(merchantMinimalRuleset.verbs.map((v) => v.id));
    expect(helped.has('buy')).toBe(true);
    expect(helped.has('sell')).toBe(true);
  });

  it('the five commerce verbs resolve through the real engine', () => {
    const registered = new Set(createGame(71).getAvailableActions());
    for (const verb of ['appraise', 'haggle', 'consign', 'underwrite', 'audit']) {
      expect(registered.has(verb), `contract-core did not register '${verb}'`).toBe(true);
    }
  });

  it('creation archetypes and disciplines grant no unregistered verb', () => {
    const registered = new Set(createGame(71).getAvailableActions());
    for (const a of buildCatalog.archetypes) {
      for (const v of a.grantedVerbs ?? []) {
        expect(registered.has(v), `archetype '${a.id}' grants unregistered '${v}'`).toBe(true);
      }
    }
    for (const d of buildCatalog.disciplines) {
      if (d.grantedVerb) {
        expect(registered.has(d.grantedVerb), `discipline '${d.id}' grants unregistered '${d.grantedVerb}'`).toBe(true);
      }
    }
  });

  it('item-granted verbs resolve too — the seal and the book are real affordances', () => {
    const registered = new Set(createGame(71).getAvailableActions());
    for (const item of itemCatalog.items) {
      for (const v of item.grantedVerbs ?? []) {
        expect(registered.has(v), `item '${item.id}' grants unregistered '${v}'`).toBe(true);
      }
    }
  });
});

describe('the wired game matches the authored content', () => {
  it('boots with the authored player in the authored start zone', () => {
    const engine = createGame(71);
    expect(engine.world.playerId).toBe('factor');
    expect(engine.world.entities.factor).toBeDefined();
    expect(engine.world.entities.factor.zoneId).toBe(player.zoneId);
  });

  it('every authored entity reaches the world', () => {
    const engine = createGame(71);
    for (const id of [
      'factor', 'assay-master-corvane', 'harbourmaster-drell', 'broker-inaya',
      'exchequer-null', 'collections-enforcer', 'warren-cutpurse', 'bonded-clerk-thrall', 'the-standing-account',
    ]) {
      expect(engine.world.entities[id], `entity '${id}' missing from the wired world`).toBeDefined();
    }
  });

  it('every hostile’s declared ai.profileId has a supplied intent profile', () => {
    // With an unresolved profile id an enemy never resolves an intent and simply
    // never acts — a fight that silently does nothing, which no combat assertion
    // would necessarily catch.
    //
    // The supplied set is read from `merchantIntentProfiles` — the ACTUAL array
    // setup.ts hands to the cognition config. An earlier draft of this test built
    // that set from a hardcoded literal, which meant it compared the content's
    // declarations against a list in the test file rather than against the wiring:
    // deleting a profile from setup.ts would have left it green.
    const engine = createGame(71);
    const supplied = new Set(merchantIntentProfiles.map((p) => p.id));
    expect(supplied.size).toBeGreaterThan(0);

    for (const id of ['collections-enforcer', 'warren-cutpurse', 'bonded-clerk-thrall', 'the-standing-account']) {
      const declared = engine.world.entities[id]?.ai?.profileId;
      expect(declared, `'${id}' declares no ai.profileId`).toBeTruthy();
      expect(supplied.has(String(declared)), `'${id}' declares unsupplied profile '${declared}'`).toBe(true);
    }
  });

  it('same-seed boots are byte-identical', () => {
    expect(createGame(71).serialize()).toBe(createGame(71).serialize());
  });
});
