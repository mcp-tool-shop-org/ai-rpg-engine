// json-boot-recipe.test.ts — proves the corrected extractSessionContent
// JSDoc boot recipe (packages/content-schema/src/intake.ts, F-c9309691)
// actually constructs, end-to-end, against a hand-authored, in-memory
// JSON-shaped ContentPack: boot, identity stamp, factions/ruleProfiles
// registries, itemPlacements giveItem, and a first player action that is
// not the unknown-actor refusal.
//
// Ported from the coordinator's working reference script (same fixture
// pack, same module list, same assertions): .swarm/phase9-boot-proof.mjs
// (swarm-1788159243-5e8c, F-c9309691). That script stays a manual repro;
// this file is the permanent, CI-run home for the same proof. No test
// previously exercised the documented recipe end-to-end — intake.test.ts's
// extractSessionContent assertions stop at confirming a field is lifted,
// never feed the result into module construction.
//
// Two adaptations from the .mjs original, both required to compile as
// typed TS and both preserving the original's intent exactly:
//   - the final "not unknown-actor" check reads engine.world.eventLog for
//     an action.rejected event instead of pattern-matching submitAction's
//     return value. Engine.submitAction's ghost-actor branch returns []
//     directly (engine.ts:170-190) — the rejection is only observable on
//     the event log — so the .mjs version's JSON.stringify(returnValue)
//     check could never actually see an unknown-actor rejection either
//     way. Reading eventLog is the mechanism core/src/actions.test.ts
//     already uses for this exact class of assertion.
//   - submitAction(verb) takes a plain verb string and always acts as
//     state.playerId (Engine.submitAction's real signature, engine.ts:170)
//     — 'look' is passed directly rather than as { actorId, type }.
//
// Lives here, not in content-schema: content-schema must NOT import
// @ai-rpg-engine/modules (this package sits below it in the layering — see
// intake.ts's own file header), so it cannot exercise its own documented
// recipe end-to-end. starter-fantasy already depends on @ai-rpg-engine/core,
// @ai-rpg-engine/content-schema and @ai-rpg-engine/modules (content-packs
// domain glob), so it is a legal home for this proof.

import { describe, it, expect } from 'vitest';
import { Engine } from '@ai-rpg-engine/core';
import {
  loadContent,
  extractSessionContent,
  applyContentPack,
  type ContentPack,
} from '@ai-rpg-engine/content-schema';
import {
  traversalCore,
  statusCore,
  combatCore,
  inventoryCore,
  createCognitionCore,
  createEnvironmentCore,
  createDistrictCore,
  createEncounterSpawn,
  createAbilityCore,
  createQuestCore,
  createProgressionCore,
  createWorldTick,
  createStandardChannels,
  registerStatusDefinitions,
} from '@ai-rpg-engine/modules';

// A hand-authored pack, independent of this starter's own content.ts — the
// point is to prove the DOCUMENTED RECIPE boots a conforming pack, not to
// re-exercise the starter's own (already-covered) fixture.
const pack = {
  meta: { id: 'chapel-threshold-proof', name: 'Chapel Threshold Proof' },
  manifest: {
    id: 'chapel-threshold-proof',
    title: 'Chapel Threshold Proof',
    version: '0.1.0',
    engineVersion: '0.1.0',
    ruleset: 'chapel-rules',
    modules: [],
    contentPacks: [],
  },
  ruleset: {
    id: 'chapel-rules',
    name: 'Chapel Rules',
    version: '0.1.0',
    stats: [
      { id: 'vigor', name: 'Vigor', default: 5 },
      { id: 'will', name: 'Will', default: 5 },
      { id: 'instinct', name: 'Instinct', default: 5 },
    ],
    resources: [{ id: 'hp', name: 'HP', default: 10, max: 10 }],
    verbs: [
      { id: 'look', name: 'Look' },
      { id: 'move', name: 'Move' },
      { id: 'speak', name: 'Speak' },
    ],
    formulas: [],
    defaultModules: [],
    progressionModels: [],
  },
  zones: [
    { id: 'chapel-yard', name: 'Chapel Yard', tags: ['exterior'], neighbors: ['nave'] },
    { id: 'nave', name: 'Nave', tags: ['interior', 'sacred'], neighbors: ['chapel-yard'] },
  ],
  entities: [
    {
      id: 'hero', type: 'player', name: 'The Gravewalker', tags: ['player'],
      baseStats: { vigor: 5, will: 4, instinct: 4 }, baseResources: { hp: 10, maxHp: 10 }, inventory: [],
    },
    {
      id: 'warden', type: 'npc', name: 'Warden Sel', tags: ['npc'], faction: 'navy', ruleProfileId: 'healer',
      baseStats: { vigor: 4, will: 5, instinct: 3 }, baseResources: { hp: 8, maxHp: 8 }, inventory: [],
    },
  ],
  placements: [
    { entityId: 'hero', zoneId: 'chapel-yard' },
    { entityId: 'warden', zoneId: 'chapel-yard' },
  ],
  items: [{ id: 'lantern', name: 'Storm Lantern', description: 'Dented brass.', slot: 'hand', rarity: 'common' }],
  itemPlacements: [{ itemId: 'lantern', entityId: 'hero' }],
  factions: {
    navy: { id: 'navy', name: 'The Navy', reputation: -40, disposition: 'hostile' },
  },
  ruleProfiles: {
    healer: { statMapping: { attack: 'will', precision: 'instinct', resolve: 'will' } },
  },
} as unknown as ContentPack;

describe('F-c9309691 — the corrected JSDoc boot recipe actually constructs', () => {
  it('boots, stamps identity, merges factions/ruleProfiles, gives the item, and accepts the first action', () => {
    const load = loadContent(pack);
    expect(load.ok).toBe(true);
    const loaded = (load.pack ?? pack) as ContentPack;

    const session = extractSessionContent(loaded);
    expect(session.manifest).toBeDefined();
    expect((session.manifest as { id: string }).id).toBe('chapel-threshold-proof');
    expect(session.ruleset).toBeDefined();
    expect((session.ruleset as { id: string }).id).toBe('chapel-rules');

    // --- the recipe, verbatim shape (content-schema/src/intake.ts's
    // extractSessionContent JSDoc, corrected this wave — mirrors
    // @ai-rpg-engine/ollama's loadPlayableModules, the engine's own tested
    // minimal playable stack, rather than buildWorldStack) ---
    registerStatusDefinitions((session.statuses ?? []) as never);
    const engine = new Engine({
      manifest: session.manifest as never,
      ruleset: session.ruleset as never,
      modules: [
        traversalCore,
        statusCore,
        // Presence-gated, NOT length-gated (contrast quests below): an
        // authored `abilities: []` still constructs the module.
        ...(session.abilities ? [createAbilityCore({ abilities: session.abilities as never })] : []),
        combatCore,
        inventoryCore,
        createCognitionCore(),
        createEnvironmentCore(),
        createDistrictCore({ districts: (session.districts ?? []) as never }),
        createEncounterSpawn({ gameId: 'chapel-threshold-proof', encounters: [], entityTemplates: [], zoneTables: {} }),
        // This fixture authors no quests — proves the length-gate does NOT
        // construct quest-core on an absent/empty session.quests (see the
        // regression tests below for what the OLD bare-array shape did).
        ...(session.quests && session.quests.length > 0
          ? [createQuestCore({ gameId: 'chapel-threshold-proof', quests: session.quests as never })]
          : []),
        createProgressionCore({ trees: (session.progressionTrees ?? []) as never }),
        createWorldTick(),
      ],
    });
    const result = applyContentPack(engine, loaded, { channels: createStandardChannels() });
    expect(result.ok).toBe(true);

    const state = engine.store.state;
    // Identity stamp (F-67786a6c): applyContentPack alone resolves
    // playerId/locationId from the pack's single type:'player' entity + its
    // placement — no manual engine.store.state.playerId = ... line above.
    expect(state.playerId).toBe('hero');
    expect(state.locationId).toBe('chapel-yard');
    // factions/ruleProfiles registries landed (this wave's merge fixes).
    expect(state.factions['navy']?.reputation).toBe(-40);
    expect(state.ruleProfiles!.healer).toBeDefined();
    expect(state.entities['warden'].faction).toBe('navy');
    // itemPlacements giveItem landed.
    expect(state.entities['hero'].inventory).toContain('lantern');

    // First action must not be the unknown-actor refusal — the exact
    // failure mode the identity stamp exists to close (pre-fix, every host
    // had to hand-stamp playerId/locationId after applyContentPack for this
    // to work at all — see F-bc7b8ab1, fixed this wave). submitAction's
    // ghost-actor branch returns [] either way, so the observable signal is
    // the event log, same mechanism core/src/actions.test.ts uses for this
    // class of assertion.
    const beforeLen = engine.world.eventLog.length;
    engine.submitAction('look');
    const newEvents = engine.world.eventLog.slice(beforeLen);
    const unknownActorRejection = newEvents.find(
      (e) => e.type === 'action.rejected' && /unknown actor/i.test(String(e.payload.reason ?? '')),
    );
    expect(unknownActorRejection).toBeUndefined();
  });
});

describe('F-c9309691 regression — QuestCoreConfig is never a bare array', () => {
  it('a bare quests array — the old buildWorldStack({ quests: session.quests ?? [] }) shape — throws inside createQuestCore', () => {
    // The exact defect this recipe used to carry: an empty array is truthy
    // in JS, so `session.quests ?? []` was never falsy, and
    // buildWorldStack's own `if (config.quests) modules.push(createQuestCore
    // (config.quests))` always fired with a bare array as the WHOLE config.
    // createQuestCore then does `for (const quest of config.quests)` —
    // `.quests` read off an array is undefined, and iterating undefined
    // throws immediately, quest content or not.
    expect(() => createQuestCore([] as never)).toThrow(/iterable/i);
  });

  it('the corrected { gameId, quests } shape constructs without throwing on an empty quest list', () => {
    expect(() => createQuestCore({ gameId: 'gate-check', quests: [] })).not.toThrow();
  });
});
