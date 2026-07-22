// world-stack (F-ENG005-build-world-stack) — the strategic-tier one-call
// assembly. Two test families:
//
//   1. BUILDER UNIT TESTS — composition and order, presence-optional
//      encounter-spawn, warn-and-degrade on unspawnable content, and a
//      pass-through PROBE per config concern: each probe drives an engine
//      built from the stack and observes the concern's own state surface
//      (hazard drains a resource, faction roster lands in the cognition
//      namespace, custom defeat-fallout tuning moves the reputation ledger by
//      the custom amount, propagationDelay stamps the pending effect, spawn
//      content actually spawns through the world tick).
//
//   2. PER-STARTER STRUCTURAL PINS — the behavior-preservation contract for
//      the refactor that moved all ten shipped starters onto buildWorldStack.
//      Each pin hardcodes the starter's registered module id list LIFTED FROM
//      THE PRE-REFACTOR setup.ts (captured by enumerating the module manager
//      of a freshly built pre-refactor engine) and asserts the post-refactor
//      engine registers exactly that list. Nine starters are pinned
//      order-identical. Gladiator is pinned to the same SET with one adjacent
//      swap (encounter-spawn now registers before its boss-phase listener,
//      not after): the swap is inert because createEncounterSpawn.register()
//      subscribes to no events, registers no verbs, and emits nothing — it
//      only claims a persistence namespace and stores content in a
//      module-side registry keyed by gameId. Measured proof: a fresh
//      createGame(42) world serialized after three played rounds is
//      byte-identical pre/post refactor for the nine, and deep-equal
//      (key-order-insensitive) for gladiator — the lone diff is the JSON key
//      order of two adjacent world.modules namespaces with identical values.

import { describe, it, expect } from 'vitest';
import { Engine, createTestEngine } from '@ai-rpg-engine/core';
import type { EngineModule, EntityState, ZoneState } from '@ai-rpg-engine/core';
import type { QuestDefinition } from '@ai-rpg-engine/content-schema';
import { traversalCore } from './traversal-core.js';
import { createCognitionCore, getCognition, setBelief } from './cognition-core.js';
import { createPerceptionFilter } from './perception-filter.js';
import { runWorldTick } from './world-tick.js';
import type { EncounterDefinition } from './combat-roles.js';
import type { PresentationRule } from './observer-presentation.js';
import { buildWorldStack } from './world-stack.js';

// The ten shipped starters — resolved to their BUILT packages (the same
// artifacts the CLI loads), so the pins verify what actually ships.
import { createGame as createColonyGame } from '@ai-rpg-engine/starter-colony';
import { createGame as createCyberpunkGame } from '@ai-rpg-engine/starter-cyberpunk';
import { createGame as createDetectiveGame } from '@ai-rpg-engine/starter-detective';
import { createGame as createFantasyGame } from '@ai-rpg-engine/starter-fantasy';
import { createGame as createGladiatorGame } from '@ai-rpg-engine/starter-gladiator';
import { createGame as createPirateGame } from '@ai-rpg-engine/starter-pirate';
import { createGame as createRoninGame } from '@ai-rpg-engine/starter-ronin';
import { createGame as createVampireGame } from '@ai-rpg-engine/starter-vampire';
import { createGame as createWeirdWestGame } from '@ai-rpg-engine/starter-weird-west';
import { createGame as createZombieGame } from '@ai-rpg-engine/starter-zombie';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Registered module ids in registration order (ModuleManager.getModules —
 *  the public accessor the CLI restore path uses for the migration seam). */
function registeredIds(engine: { moduleManager: unknown }): string[] {
  const mm = engine.moduleManager as { getModules(): readonly EngineModule[] };
  return mm.getModules().map((m) => m.id);
}

const stackIds = (config: Parameters<typeof buildWorldStack>[0] = {}) =>
  buildWorldStack(config).modules.map((m) => m.id);

/** The always-included strategic tier before world-tick joined (P8-SP-003) —
 *  kept verbatim as the pre-refactor historical baseline. */
const WORLD_STACK_PRE_WORLD_TICK = [
  'environment-core',
  'faction-cognition',
  'rumor-propagation',
  'district-core',
  'belief-provenance',
  'observer-presentation',
  'defeat-fallout',
];

/** The always-included strategic tier, in wiring order. world-tick joined
 *  this wave (P8-SP-003): the driver's slice enters the version-stamped set
 *  and the ENG-009 seam; registration is namespace-only (no verbs, no event
 *  subscriptions), so the addition is behavior-inert at registration time.
 *  economy-core + trade-core join THIS wave (F-d0b5edb5/F-6c3e4fde), inserted
 *  right after district-core — the same district roster it reads. economy-
 *  core is namespace-only like world-tick; trade-core registers exactly one
 *  new verb ('sell') and subscribes to no events, so neither addition
 *  touches any EXISTING module's own wiring or verb set. */
const WORLD_STACK_DEFAULT = [
  ...WORLD_STACK_PRE_WORLD_TICK.slice(0, 4), // environment-core, faction-cognition, rumor-propagation, district-core
  'economy-core',
  'trade-core',
  ...WORLD_STACK_PRE_WORLD_TICK.slice(4), // belief-provenance, observer-presentation, defeat-fallout
  'world-tick',
];

// --- Probe fixtures --------------------------------------------------------

const probeZones: ZoneState[] = [
  { id: 'zone-a', roomId: 'r', name: 'Zone A', tags: ['safe'], neighbors: ['zone-b'] },
  {
    id: 'zone-b',
    roomId: 'r',
    name: 'Zone B',
    tags: ['hostile'],
    neighbors: ['zone-a'],
    hazards: ['probe-haz'],
  },
];

const probeDistricts = [
  { id: 'probe-district', name: 'Probe District', zoneIds: ['zone-b'], tags: [] },
];

const makeHero = (): EntityState => ({
  id: 'hero',
  blueprintId: 'hero',
  type: 'player',
  name: 'Hero',
  tags: ['player'],
  stats: { vigor: 5 },
  resources: { hp: 20, stamina: 10 },
  statuses: [],
  zoneId: 'zone-a',
});

const makeThug = (): EntityState => ({
  id: 'thug',
  blueprintId: 'thug',
  type: 'enemy',
  name: 'Thug',
  tags: ['enemy'],
  stats: { vigor: 3 },
  resources: { hp: 5 },
  statuses: [],
  zoneId: 'zone-b',
});

/** Minimal valid quest for the presence-flag + pass-through probes: offered
 *  on entering zone-b, completed by returning to zone-a. No rewards — the
 *  probe watches the loop itself, not the grant path (quest-core.test.ts
 *  owns rewards). */
const probeQuest: QuestDefinition = {
  id: 'probe-quest',
  name: 'Probe Quest',
  triggers: [
    {
      event: 'world.zone.entered',
      condition: { type: 'payload-equals', params: { key: 'zoneId', value: 'zone-b' } },
      effect: { type: 'offer', params: {} },
    },
  ],
  stages: [
    {
      id: 'go-home',
      name: 'Go Home',
      triggers: [
        {
          event: 'world.zone.entered',
          condition: { type: 'payload-equals', params: { key: 'zoneId', value: 'zone-a' } },
          effect: { type: 'advance', params: {} },
        },
      ],
    },
  ],
};

type StackConfig = Parameters<typeof buildWorldStack>[0];

/** Engine with the stack's documented prerequisites: cognition-core + perception-filter. */
function makeStackEngine(config: StackConfig = {}, extraEntities: EntityState[] = []) {
  return createTestEngine({
    modules: [
      traversalCore,
      createCognitionCore(),
      createPerceptionFilter(),
      ...buildWorldStack({
        factions: [{ factionId: 'probe-faction', entityIds: ['thug'], cohesion: 0.42 }],
        districts: probeDistricts,
        ...config,
      }).modules,
    ],
    entities: [makeHero(), makeThug(), ...extraEntities],
    zones: probeZones,
    startZone: 'zone-a',
    seed: 7,
  });
}

// ---------------------------------------------------------------------------
// 1. Builder unit tests — composition, flags, warnings
// ---------------------------------------------------------------------------

describe('buildWorldStack — composition', () => {
  it('default composition is the ten always-on strategic modules, in wiring order', () => {
    const stack = buildWorldStack();
    expect(stack.modules.map((m) => m.id)).toEqual(WORLD_STACK_DEFAULT);
    expect(stack.warnings).toEqual([]);
  });

  it('encounterSpawn presence appends the encounter-spawn module last; omission excludes it', () => {
    expect(stackIds()).not.toContain('encounter-spawn');
    const withSpawn = stackIds({
      encounterSpawn: { gameId: 'g', encounters: [], entityTemplates: [], zoneTables: {} },
    });
    expect(withSpawn).toEqual([...WORLD_STACK_DEFAULT, 'encounter-spawn']);
  });

  it('quests presence appends the quest-core module; omission excludes it (flag both ways)', () => {
    expect(stackIds()).not.toContain('quest-core');
    const withQuests = stackIds({ quests: { gameId: 'g', quests: [probeQuest] } });
    expect(withQuests).toEqual([...WORLD_STACK_DEFAULT, 'quest-core']);
  });

  it('quests + encounterSpawn compose: both presence-optional modules append after the default eight', () => {
    const both = stackIds({
      encounterSpawn: { gameId: 'g', encounters: [], entityTemplates: [], zoneTables: {} },
      quests: { gameId: 'g', quests: [probeQuest] },
    });
    expect(both).toEqual([...WORLD_STACK_DEFAULT, 'encounter-spawn', 'quest-core']);
  });

  it('fail-loud: invalid quest content THROWS at assembly (quest-core contract, not a warning)', () => {
    const dead: QuestDefinition = { id: 'dead', name: 'Dead Quest', stages: [], triggers: [] };
    expect(() => buildWorldStack({ quests: { gameId: 'g', quests: [dead] } })).toThrow(
      /quest-core: invalid quest content/,
    );
  });

  it('registration fails loudly when the documented prerequisite (cognition-core) is missing', () => {
    expect(
      () =>
        new Engine({
          manifest: {
            id: 'no-prereq',
            title: 'No Prereq',
            version: '0.0.0',
            engineVersion: '0.1.0',
            ruleset: 'test',
            modules: [],
            contentPacks: [],
          },
          modules: buildWorldStack().modules,
        }),
    ).toThrow(/faction-cognition.*depends on.*cognition-core/);
  });

  it('warn-and-degrade: unspawnable encounter table entries surface as warnings', () => {
    const stack = buildWorldStack({
      encounterSpawn: {
        gameId: 'g',
        encounters: [],
        entityTemplates: [],
        zoneTables: { 'zone-b': ['not-authored'] },
      },
    });
    expect(stack.warnings).toHaveLength(1);
    expect(stack.warnings[0]).toContain('not-authored');
    expect(stack.warnings[0]).toContain('encounterSpawn:');
    // Warn, not fail: the module is still included (runtime filter fails closed).
    expect(stack.modules.map((m) => m.id)).toContain('encounter-spawn');
  });

  it('valid spawn content produces zero warnings', () => {
    const raider: EntityState = { ...makeThug(), id: 'raider', name: 'Raider' };
    const ambush: EncounterDefinition = {
      id: 'ambush-1',
      name: 'Ambush',
      participants: [{ entityId: 'raider' }],
      composition: 'ambush',
    };
    const stack = buildWorldStack({
      encounterSpawn: {
        gameId: 'g',
        encounters: [ambush],
        entityTemplates: [raider],
        zoneTables: { 'zone-b': ['ambush-1'] },
      },
    });
    expect(stack.warnings).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 1b. Config pass-through probes — each concern reaches its module factory
// ---------------------------------------------------------------------------

describe('buildWorldStack — config pass-through probes', () => {
  it('environment: an authored hazard fires on zone entry (hazards reached environment-core)', () => {
    const engine = makeStackEngine({
      environment: {
        hazards: [
          {
            id: 'probe-haz',
            triggerOn: 'world.zone.entered',
            condition: (zone) => zone.hazards?.includes('probe-haz') ?? false,
            effect: (_zone, entity) => {
              entity.resources.stamina = Math.max(0, (entity.resources.stamina ?? 0) - 4);
              return [];
            },
          },
        ],
      },
    });
    engine.submitAction('move', { targetIds: ['zone-b'] });
    expect(engine.world.entities['hero'].resources.stamina).toBe(6);
  });

  it('quests: an authored quest offers and completes through the stack engine’s live event stream', () => {
    const engine = makeStackEngine({ quests: { gameId: 'probe', quests: [probeQuest] } });

    engine.submitAction('move', { targetIds: ['zone-b'] });
    expect(engine.world.quests['probe-quest']?.status).toBe('active');
    expect(engine.world.eventLog.some((e) => e.type === 'quest.offered')).toBe(true);

    engine.submitAction('move', { targetIds: ['zone-a'] });
    expect(engine.world.quests['probe-quest']?.status).toBe('completed');
    expect(engine.world.eventLog.some((e) => e.type === 'quest.completed')).toBe(true);
  });

  it('factions: the roster (members + cohesion) lands in the faction-cognition namespace', () => {
    const engine = makeStackEngine();
    const state = engine.world.modules['faction-cognition'] as {
      factionMembers: Record<string, string[]>;
      membership: Record<string, string>;
      factionCognition: Record<string, { cohesion: number }>;
    };
    expect(state.factionMembers['probe-faction']).toEqual(['thug']);
    expect(state.membership['thug']).toBe('probe-faction');
    expect(state.factionCognition['probe-faction'].cohesion).toBe(0.42);
  });

  it('districts: zone-to-district mapping lands in the district-core namespace', () => {
    const engine = makeStackEngine();
    const state = engine.world.modules['district-core'] as {
      zoneToDistrict: Record<string, string>;
      districts: Record<string, unknown>;
    };
    expect(state.zoneToDistrict['zone-b']).toBe('probe-district');
    expect(state.districts['probe-district']).toBeDefined();
  });

  it('presentationRules: a custom rule changes the observer-presentation registry id', () => {
    const rule: PresentationRule = {
      id: 'probe-rule',
      eventPatterns: ['world.zone.entered'],
      condition: () => false,
      transform: (event) => event,
    };
    const withRule = makeStackEngine({ presentationRules: [rule] });
    const without = makeStackEngine();
    const registryId = (engine: typeof withRule) =>
      (engine.world.modules['observer-presentation'] as { _registryId: string })._registryId;
    expect(registryId(withRule)).toContain('probe-rule');
    expect(registryId(without)).toBe('op:builtin');
  });

  it('defeatFallout + playerId + factions: a player kill moves the ledgers by the CUSTOM amounts', () => {
    const engine = makeStackEngine({
      playerId: 'hero',
      defeatFallout: { reputationPerKill: -7, heatPerKill: 3 },
    });
    engine.store.emitEvent('combat.entity.defeated', {
      entityId: 'thug',
      entityName: 'Thug',
      defeatedBy: 'hero',
    });
    // Custom tuning reached defeat-fallout (defaults are -10 / +5).
    expect(engine.world.globals['reputation_probe-faction']).toBe(-7);
    expect(engine.world.globals['player_heat']).toBe(3);
    // And defeat-fallout resolved the district through district-core's mapping.
    expect(engine.world.globals['district_probe-district_safety']).toBe(-3);
  });

  it('rumors: propagationDelay stamps the pending propagation (delay reached rumor-propagation)', () => {
    const witness: EntityState = {
      id: 'witness',
      blueprintId: 'witness',
      type: 'npc',
      name: 'Witness',
      tags: ['npc'],
      stats: {},
      resources: { hp: 5 },
      statuses: [],
      zoneId: 'zone-b',
      ai: { profileId: 'cautious', goals: [], fears: [], alertLevel: 0, knowledge: {} },
    };
    const engine = makeStackEngine(
      {
        factions: [{ factionId: 'probe-faction', entityIds: ['witness'], cohesion: 0.42 }],
        rumors: { propagationDelay: 7 },
      },
      [witness],
    );
    // The witness holds a confident belief that the hero is present…
    setBelief(getCognition(engine.world, 'witness'), 'hero', 'present', true, 0.9, 'seen', 0);
    // …and the hero walking into the witness's zone triggers propagation.
    engine.store.emitEvent('world.zone.entered', { zoneId: 'zone-b' }, { actorId: 'hero' });
    const pending = engine.world.pending.find((p) => p.type === 'rumor.belief.propagated');
    expect(pending).toBeDefined();
    // Last matching event; .findLast needs the es2023 lib and this repo targets ES2022.
    const trigger = [...engine.world.eventLog].reverse().find((e) => e.type === 'world.zone.entered');
    expect(pending!.executeAtTick).toBe(trigger!.tick + 7);
  });

  it('encounterSpawn: registered content spawns through the world tick (the tick chain is intact)', () => {
    const raider: EntityState = {
      ...makeThug(),
      id: 'raider',
      name: 'Raider',
      tags: ['enemy', 'role:skirmisher'],
      zoneId: 'nowhere',
    };
    const ambush: EncounterDefinition = {
      id: 'probe-ambush',
      name: 'Probe Ambush',
      participants: [{ entityId: 'raider' }],
      composition: 'ambush',
      narrativeHooks: { tone: 'sudden', trigger: 'Boots scrape the gravel.' },
    };
    const engine = makeStackEngine({
      encounterSpawn: {
        gameId: 'test-harness', // createTestEngine's manifest id — the registry key
        encounters: [ambush],
        entityTemplates: [raider],
        zoneTables: { 'zone-b': ['probe-ambush'] },
      },
    });
    // Chance caps below 1, so walk entries until the deterministic roll lands
    // (bounded loop — the encounter-spawn suite's own forcing idiom).
    let spawned = false;
    for (let i = 0; i < 30 && !spawned; i++) {
      engine.submitAction('move', { targetIds: ['zone-b'] });
      spawned = runWorldTick(engine).encounters.length > 0;
      engine.submitAction('move', { targetIds: ['zone-a'] });
    }
    expect(spawned).toBe(true);
    const event = engine.world.eventLog.find((e) => e.type === 'encounter.spawned');
    expect(event).toBeDefined();
    expect(event!.payload.encounterId).toBe('probe-ambush');
    const spawnedIds = event!.payload.spawnedEntityIds as string[];
    expect(engine.world.entities[spawnedIds[0]]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 2. Per-starter structural pins — behavior preservation for the refactor
// ---------------------------------------------------------------------------

// Shared prefix/suffix shapes keep the per-starter constants honest AND
// readable: every starter registers the same tactical prefix (modulo its
// pack-specific combat-resources id) and the same interaction/ability suffix.
const COMBAT_PREFIX = (resourcesId: string | null) => [
  'traversal-core',
  'status-core',
  'cognition-core',
  'engagement-core',
  'combat-review',
  'combat-core',
  'combat-tactics',
  ...(resourcesId ? [resourcesId] : []),
  'combat-intent',
  'combat-recovery',
  'combat-state-narration',
];

const CONTENT_MID = ['inventory-core', 'dialogue-core', 'perception-filter', 'progression-core'];

const WORLD_RUN = [...WORLD_STACK_DEFAULT, 'encounter-spawn'];

const ABILITY_SUFFIX = ['ability-core', 'ability-effects', 'ability-review', 'simulation-inspector'];

/**
 * Expected registered module ids per starter, in registration order — lifted
 * from the PRE-refactor setup.ts files (captured from each freshly built
 * engine's module manager before the migration to buildWorldStack). If a
 * starter's list drifts from its pre-refactor expectation, the refactor
 * stopped being behavior-preserving — that is a STOP, not a test to adapt.
 *
 * One deliberate amendment since the capture: fantasy and zombie now pin
 * `quest-core` after `encounter-spawn` (F-ENG005-quest-loop-min — those two
 * packs author quests and pass the stack's presence-optional `quests`
 * config). That is an INTENDED composition change shipped with the feature,
 * not refactor drift; the other eight starters remain byte-identical to the
 * pre-refactor capture.
 */
const EXPECTED: Record<string, string[]> = {
  colony: [
    ...COMBAT_PREFIX('combat-resources-colony'),
    ...CONTENT_MID,
    ...WORLD_RUN,
    'boss-phase:resonance_entity',
    ...ABILITY_SUFFIX,
  ],
  cyberpunk: [
    ...COMBAT_PREFIX('combat-resources-cyberpunk'),
    ...CONTENT_MID,
    ...WORLD_RUN,
    'boss-phase:vault-overseer',
    ...ABILITY_SUFFIX,
  ],
  detective: [
    ...COMBAT_PREFIX('combat-resources-detective'),
    ...CONTENT_MID,
    ...WORLD_RUN,
    'boss-phase:crime-boss',
    ...ABILITY_SUFFIX,
  ],
  // Fantasy is the one starter with no combat resource profile. Authors
  // quests (F-ENG005-quest-loop-min) → quest-core joins its world stack.
  fantasy: [
    ...COMBAT_PREFIX(null),
    ...CONTENT_MID,
    ...WORLD_RUN,
    'quest-core',
    'boss-phase:crypt-warden',
    ...ABILITY_SUFFIX,
  ],
  // Gladiator: pre-refactor order had boss-phase:arena-overlord BEFORE
  // encounter-spawn (the only starter that did). The stack registers
  // encounter-spawn directly after defeat-fallout, so the two swap — the SET
  // is unchanged (asserted separately below) and the swap is inert:
  // createEncounterSpawn.register() subscribes to no events, registers no
  // verbs, and emits nothing. Measured: pre/post fresh worlds are deep-equal;
  // the lone serialization diff is the JSON key order of these two adjacent
  // world.modules namespaces (identical values).
  gladiator: [
    ...COMBAT_PREFIX('combat-resources-gladiator'),
    ...CONTENT_MID,
    ...WORLD_RUN,
    'boss-phase:arena-overlord',
    'equipment-core',
    ...ABILITY_SUFFIX,
  ],
  pirate: [
    ...COMBAT_PREFIX('combat-resources-pirate'),
    ...CONTENT_MID,
    ...WORLD_RUN,
    'boss-phase:drowned_guardian',
    ...ABILITY_SUFFIX,
  ],
  ronin: [
    ...COMBAT_PREFIX('combat-resources-ronin'),
    ...CONTENT_MID,
    ...WORLD_RUN,
    'boss-phase:corrupt-samurai',
    ...ABILITY_SUFFIX,
  ],
  vampire: [
    ...COMBAT_PREFIX('combat-resources-vampire'),
    ...CONTENT_MID,
    ...WORLD_RUN,
    'boss-phase:elder-vampire',
    ...ABILITY_SUFFIX,
  ],
  'weird-west': [
    ...COMBAT_PREFIX('combat-resources-weird-west'),
    ...CONTENT_MID,
    ...WORLD_RUN,
    'boss-phase:mesa_crawler',
    ...ABILITY_SUFFIX,
  ],
  // Zombie authors quests too (F-ENG005-quest-loop-min) → quest-core joins.
  zombie: [
    ...COMBAT_PREFIX('combat-resources-zombie'),
    ...CONTENT_MID,
    ...WORLD_RUN,
    'quest-core',
    'boss-phase:bloater-alpha',
    ...ABILITY_SUFFIX,
  ],
};

const STARTERS: Array<[keyof typeof EXPECTED, (seed?: number) => { moduleManager: unknown }]> = [
  ['colony', createColonyGame],
  ['cyberpunk', createCyberpunkGame],
  ['detective', createDetectiveGame],
  ['fantasy', createFantasyGame],
  ['gladiator', createGladiatorGame],
  ['pirate', createPirateGame],
  ['ronin', createRoninGame],
  ['vampire', createVampireGame],
  ['weird-west', createWeirdWestGame],
  ['zombie', createZombieGame],
];

describe('world-stack refactor — per-starter module registration pins', () => {
  it.each(STARTERS.map(([name]) => [name] as const))(
    '%s registers exactly its pre-refactor module list',
    (name) => {
      const create = STARTERS.find(([n]) => n === name)![1];
      const ids = registeredIds(create(42));
      expect(ids).toEqual(EXPECTED[name]);
    },
  );

  it('gladiator: the module SET is the pre-refactor set plus world-tick/economy-core/trade-core (order swap + P8-SP-003 + F-d0b5edb5/F-6c3e4fde are the only deltas)', () => {
    // The literal pre-refactor gladiator order, boss-phase before
    // encounter-spawn — carried verbatim so the set-equality claim is
    // auditable against the captured baseline, not derived from EXPECTED.
    // world-tick, economy-core, and trade-core are the post-baseline
    // additions (P8-SP-003's driver identity; F-d0b5edb5/F-6c3e4fde's
    // write-wire), asserted explicitly on top.
    const preRefactorOrder = [
      ...COMBAT_PREFIX('combat-resources-gladiator'),
      ...CONTENT_MID,
      ...WORLD_STACK_PRE_WORLD_TICK,
      'boss-phase:arena-overlord',
      'encounter-spawn',
      'equipment-core',
      ...ABILITY_SUFFIX,
    ];
    const ids = registeredIds(createGladiatorGame(42));
    expect([...ids].sort()).toEqual(
      [...preRefactorOrder, 'world-tick', 'economy-core', 'trade-core'].sort(),
    );
  });

  it('every starter world stack is duplicate-free (the engine would throw otherwise — belt and braces)', () => {
    for (const [name, create] of STARTERS) {
      const ids = registeredIds(create(42));
      expect(new Set(ids).size, `${name} has duplicate module ids`).toBe(ids.length);
    }
  });
});
