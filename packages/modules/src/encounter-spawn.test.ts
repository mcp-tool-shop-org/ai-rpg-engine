// encounter-spawn (F-ENG005-encounter-spawn-wiring) — zone-entry-driven
// spawning from the starters' authored encounter tables. These tests pin the
// keystone-adjacent machinery hard:
//   - determinism: same seed + same path ⇒ byte-identical spawns (reports AND
//     entity ids); a different seed diverges
//   - safety modulation: lower district safety ⇒ more spawns, pinned as a
//     MONOTONIC property over a fixed seed set (not exact counts)
//   - zone-entry-only: no entry, no roll; NPC movement never rolls
//   - anti-restack: one live encounter per zone — re-entering cannot pile a
//     second while the first still stands; a cleared zone's table is live again
//   - boss protection: boss-fight compositions and role:boss participants are
//     refused by validation AND by the runtime candidate filter (the CLI's
//     victory check live-scans role:boss hostiles — a spawned boss clone could
//     un-win a won game)
//   - the ONE renderable event: `encounter.spawned`, public, narrator channel,
//     with the ready-to-render label + description contract
//   - packs that never registered content are a byte-identical no-op
//
// Forcing note: rolls are a pure hash of seed+tick+zone, and chance caps at
// MAX_SPAWN_CHANCE (0.95) — never 1. Tests that need a spawn therefore walk a
// bounded entry loop under the capped chance: with the engine seed fixed the
// outcome is fully deterministic, and the loop bound only exists so the pin
// survives retuning of the constants.

import { describe, it, expect } from 'vitest';
import { createTestEngine } from '@ai-rpg-engine/core';
import type { EntityState, ResolvedEvent, ZoneState } from '@ai-rpg-engine/core';
import { traversalCore } from './traversal-core.js';
import { createEnvironmentCore } from './environment-core.js';
import { createDistrictCore } from './district-core.js';
import type { EncounterDefinition } from './combat-roles.js';
import { runWorldTick } from './world-tick.js';
import {
  createEncounterSpawn,
  runEncounterSpawnStep,
  getEncounterSpawnState,
  validateEncounterSpawnContent,
  unregisterEncounterSpawnContent,
  spawnRoll,
  spawnChance,
  compositionLabel,
  encounterDescription,
  BASE_SPAWN_CHANCE,
  SAFETY_CHANCE_STEP,
  MIN_SPAWN_CHANCE,
  MAX_SPAWN_CHANCE,
  type EncounterSpawnContent,
  type SpawnedEncounterReport,
} from './encounter-spawn.js';

// The test harness's manifest id — every createTestEngine world shares it.
const HARNESS_GAME_ID = 'test-harness';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const zones: ZoneState[] = [
  { id: 'zone-a', roomId: 'r', name: 'Zone A', tags: ['safe'], neighbors: ['zone-b', 'zone-c'] },
  { id: 'zone-b', roomId: 'r', name: 'Zone B', tags: ['hostile'], neighbors: ['zone-a'] },
  { id: 'zone-c', roomId: 'r', name: 'Zone C', tags: ['hostile'], neighbors: ['zone-a'] },
];

const districts = [
  { id: 'd-low', name: 'Low Safety', zoneIds: ['zone-b'], tags: [] },
  { id: 'd-high', name: 'High Safety', zoneIds: ['zone-c'], tags: [] },
];

const makePlayer = (): EntityState => ({
  id: 'player',
  blueprintId: 'player',
  type: 'player',
  name: 'Hero',
  tags: ['player'],
  stats: { vigor: 5 },
  resources: { hp: 20, stamina: 10 },
  statuses: [],
  zoneId: 'zone-a',
});

const raiderTemplate: EntityState = {
  id: 'raider',
  blueprintId: 'raider',
  type: 'enemy',
  name: 'Raider',
  tags: ['enemy', 'role:skirmisher'],
  stats: { vigor: 4 },
  resources: { hp: 6, stamina: 6 },
  statuses: [],
  zoneId: 'nowhere', // template placement is irrelevant — clones get the entry zone
};

const bossTemplate: EntityState = {
  ...raiderTemplate,
  id: 'warlord',
  name: 'Warlord',
  tags: ['enemy', 'role:boss'],
};

const roadAmbush: EncounterDefinition = {
  id: 'road-ambush',
  name: 'Road Ambush',
  participants: [{ entityId: 'raider' }, { entityId: 'raider' }],
  composition: 'ambush',
  validZoneIds: ['zone-b', 'zone-c'],
  narrativeHooks: { tone: 'sudden', trigger: 'Dust rises on the road.', stakes: 'Your cargo.' },
};

const content: EncounterSpawnContent = {
  encounters: [roadAmbush],
  entityTemplates: [raiderTemplate],
  zoneTables: { 'zone-b': ['road-ambush'], 'zone-c': ['road-ambush'] },
};

type EngineOpts = {
  seed?: number;
  baseChance?: number;
  safetyStep?: number;
  globals?: Record<string, number>;
  content?: EncounterSpawnContent;
  withDistricts?: boolean;
};

function makeEngine(opts: EngineOpts = {}) {
  return createTestEngine({
    modules: [
      traversalCore,
      ...(opts.withDistricts === false
        ? []
        : [createEnvironmentCore(), createDistrictCore({ districts })]),
      createEncounterSpawn({
        gameId: HARNESS_GAME_ID,
        ...(opts.content ?? content),
        ...(opts.baseChance !== undefined ? { baseChance: opts.baseChance } : {}),
        ...(opts.safetyStep !== undefined ? { safetyStep: opts.safetyStep } : {}),
      }),
    ],
    entities: [makePlayer()],
    zones,
    startZone: 'zone-a',
    seed: opts.seed ?? 7,
    globals: opts.globals,
  });
}

type Harness = ReturnType<typeof makeEngine>;

/** One CLI-shaped round: the player moves, then the world takes its ONE tick. */
function moveRound(engine: Harness, zoneId: string): SpawnedEncounterReport[] {
  engine.submitAction('move', { targetIds: [zoneId] });
  return runWorldTick(engine).encounters;
}

/**
 * Walk b→a→b→… until the first spawn (bounded — see forcing note in header).
 * Returns the reports of the spawning round.
 */
function walkUntilSpawn(engine: Harness, zoneId = 'zone-b', maxEntries = 30): SpawnedEncounterReport[] {
  for (let i = 0; i < maxEntries; i++) {
    const spawned = moveRound(engine, zoneId);
    if (spawned.length > 0) return spawned;
    moveRound(engine, 'zone-a');
  }
  throw new Error(`no spawn within ${maxEntries} entries`);
}

function spawnEvents(engine: Harness): ResolvedEvent[] {
  return engine.world.eventLog.filter((e) => e.type === 'encounter.spawned');
}

// ---------------------------------------------------------------------------
// Pure pieces
// ---------------------------------------------------------------------------

describe('encounter-spawn — deterministic roll + chance curve', () => {
  it('spawnRoll is pure, in [0,1), and keyed by every input', () => {
    const base = spawnRoll(1, 5, 'zone-b', 'gate');
    expect(base).toBe(spawnRoll(1, 5, 'zone-b', 'gate'));
    expect(base).toBeGreaterThanOrEqual(0);
    expect(base).toBeLessThan(1);
    expect(spawnRoll(2, 5, 'zone-b', 'gate')).not.toBe(base);
    expect(spawnRoll(1, 6, 'zone-b', 'gate')).not.toBe(base);
    expect(spawnRoll(1, 5, 'zone-c', 'gate')).not.toBe(base);
    expect(spawnRoll(1, 5, 'zone-b', 'pick')).not.toBe(base);
  });

  it('spawnChance is monotonic in falling safety and clamps to the floor/ceiling', () => {
    const at = (safety: number) => spawnChance(BASE_SPAWN_CHANCE, SAFETY_CHANCE_STEP, safety);
    expect(at(-10)).toBeGreaterThan(at(0));
    expect(at(0)).toBeGreaterThan(at(10));
    expect(at(-1000)).toBe(MAX_SPAWN_CHANCE);
    expect(at(1000)).toBe(MIN_SPAWN_CHANCE);
    expect(at(0)).toBe(BASE_SPAWN_CHANCE);
  });

  it('compositionLabel covers the telegraph family', () => {
    expect(compositionLabel('ambush')).toBe('Ambush');
    expect(compositionLabel('patrol')).toBe('Patrol');
    expect(compositionLabel('horde')).toBe('Horde');
    expect(compositionLabel('duel')).toBe('Challenge');
    expect(compositionLabel(undefined)).toBe('Encounter');
    expect(compositionLabel('boss-fight')).toBe('Encounter');
  });

  it('encounterDescription prefers the authored trigger and strips terminal punctuation', () => {
    expect(encounterDescription(roadAmbush)).toBe('Dust rises on the road');
    expect(
      encounterDescription({ ...roadAmbush, narrativeHooks: { tone: 'grim tone' } }),
    ).toBe('grim tone');
    expect(encounterDescription({ ...roadAmbush, narrativeHooks: undefined })).toBe('Road Ambush');
  });
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe('encounter-spawn — determinism', () => {
  const script = ['zone-b', 'zone-a', 'zone-c', 'zone-a', 'zone-b', 'zone-a', 'zone-c', 'zone-a'];

  function signature(seed: number): string {
    const engine = makeEngine({ seed, baseChance: 0.5 });
    const rounds: SpawnedEncounterReport[][] = [];
    for (const zone of script) rounds.push(moveRound(engine, zone));
    return JSON.stringify(rounds);
  }

  it('same seed + same path ⇒ byte-identical spawn reports and entity ids', () => {
    expect(signature(11)).toBe(signature(11));
  });

  it('a different seed diverges on the same path', () => {
    // Pinned pair — deterministic forever under the fixed hash.
    expect(signature(11)).not.toBe(signature(12));
  });
});

// ---------------------------------------------------------------------------
// Safety modulation
// ---------------------------------------------------------------------------

describe('encounter-spawn — district safety modulates spawn chance', () => {
  it('a blood-soaked district spawns more than a quiet one over a fixed seed set (monotonic property)', () => {
    // zone-b sits in d-low (safety −40 ⇒ capped high chance); zone-c in
    // d-high (safety +40 ⇒ floored low chance). Same base, same seeds — only
    // the safety global differs. Pin the ORDER, not exact counts.
    let low = 0;
    let high = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const engine = makeEngine({
        seed,
        globals: { 'district_d-low_safety': -40, 'district_d-high_safety': 40 },
      });
      if (moveRound(engine, 'zone-b').length > 0) low++;
      moveRound(engine, 'zone-a');
      if (moveRound(engine, 'zone-c').length > 0) high++;
    }
    expect(low).toBeGreaterThan(high);
    // The floor/ceiling keep both outcomes possible in principle; the pinned
    // seed set must show the modulation actually biting.
    expect(low).toBeGreaterThan(20); // ~0.95 per entry over 30 seeds
    expect(high).toBeLessThan(10); // ~0.05 per entry over 30 seeds
  });
});

// ---------------------------------------------------------------------------
// Zone-entry-only + anti-restack
// ---------------------------------------------------------------------------

describe('encounter-spawn — entry-driven, one live encounter per zone', () => {
  it('no zone entry ⇒ no roll (ticks alone never spawn)', () => {
    const engine = makeEngine({ baseChance: 0.95 });
    for (let i = 0; i < 10; i++) {
      expect(runWorldTick(engine).encounters).toEqual([]);
    }
    expect(spawnEvents(engine)).toEqual([]);
  });

  it("an NPC's zone entry never rolls — only the player's", () => {
    const engine = makeEngine({ baseChance: 0.95 });
    // Fabricate NPC entries across many ticks (fresh roll inputs each time).
    for (let i = 0; i < 20; i++) {
      engine.store.emitEvent(
        'world.zone.entered',
        { zoneId: 'zone-b', zoneName: 'Zone B', previousZoneId: 'zone-a' },
        { actorId: 'npc-7' },
      );
      engine.store.advanceTick();
      expect(runWorldTick(engine).encounters).toEqual([]);
    }
  });

  it('re-entering while the spawn still stands cannot restack; a cleared zone spawns again', () => {
    const engine = makeEngine();
    const first = walkUntilSpawn(engine);
    expect(first).toHaveLength(1);
    const firstIds = first[0].entityIds;
    expect(firstIds).toHaveLength(2);

    // Hammer re-entry: the live pack blocks every subsequent roll.
    for (let i = 0; i < 12; i++) {
      moveRound(engine, 'zone-a');
      expect(moveRound(engine, 'zone-b')).toEqual([]);
    }
    const zoneBSpawns = spawnEvents(engine).filter((e) => e.payload.zoneId === 'zone-b');
    expect(zoneBSpawns).toHaveLength(1);

    // Clear the pack — the table is live again.
    for (const id of firstIds) {
      engine.world.entities[id].resources.hp = 0;
    }
    const second = walkUntilSpawn(engine);
    expect(second).toHaveLength(1);
    // Fresh clones, never recycled ids.
    expect(second[0].entityIds.some((id) => firstIds.includes(id))).toBe(false);
  });

  it('spawned entities are fresh clones in the entered zone; the template is untouched', () => {
    const engine = makeEngine();
    const [report] = walkUntilSpawn(engine);

    for (const id of report.entityIds) {
      const entity = engine.world.entities[id];
      expect(entity).toBeDefined();
      expect(entity.zoneId).toBe('zone-b');
      expect(entity.name).toBe('Raider');
      expect(entity.id).not.toBe('raider');
      expect((entity.resources.hp ?? 0)).toBeGreaterThan(0);
    }
    // Module constant untouched (the store detaches AND we clone-then-override).
    expect(raiderTemplate.id).toBe('raider');
    expect(raiderTemplate.zoneId).toBe('nowhere');
  });
});

// ---------------------------------------------------------------------------
// The ONE renderable event
// ---------------------------------------------------------------------------

describe('encounter-spawn — the encounter.spawned event contract', () => {
  it('emits exactly one public narrator-channel event per spawn with the label/description contract', () => {
    const engine = makeEngine();
    const [report] = walkUntilSpawn(engine);

    const events = spawnEvents(engine);
    expect(events).toHaveLength(1);
    const [event] = events;

    expect(event.visibility).toBe('public');
    expect(event.presentation).toEqual({ channels: ['narrator'], priority: 'high' });
    expect(event.payload).toMatchObject({
      encounterId: 'road-ambush',
      encounterName: 'Road Ambush',
      composition: 'ambush',
      zoneId: 'zone-b',
      zoneName: 'Zone B',
      label: 'Ambush',
      description: 'Dust rises on the road',
      spawnedEntityIds: report.entityIds,
      spawnedEntityNames: ['Raider', 'Raider'],
      tone: 'sudden',
      stakes: 'Your cargo.',
    });
    // The renderer seam line (owned by terminal-ui): `> ${label}: ${description}.`
    expect(`> ${event.payload.label}: ${event.payload.description}.`).toBe(
      '> Ambush: Dust rises on the road.',
    );
  });

  it('rides the same round delta as the world tick that spawned it (ONE tick per round)', () => {
    const engine = makeEngine({ baseChance: 0.95 });
    for (let i = 0; i < 30; i++) {
      const logLenBefore = engine.world.eventLog.length;
      engine.submitAction('move', { targetIds: [i % 2 === 0 ? 'zone-b' : 'zone-a'] });
      const result = runWorldTick(engine);
      const delta = engine.world.eventLog.slice(logLenBefore);
      if (result.encounters.length > 0) {
        expect(delta.some((e) => e.type === 'encounter.spawned')).toBe(true);
        expect(delta.some((e) => e.type === 'world.zone.entered')).toBe(true);
        return;
      }
    }
    throw new Error('no spawn within 30 rounds');
  });
});

// ---------------------------------------------------------------------------
// Boss protection + candidate filtering
// ---------------------------------------------------------------------------

describe('encounter-spawn — bosses are placed set-pieces, never random spawns', () => {
  const bossFight: EncounterDefinition = {
    id: 'warlord-stand',
    name: "Warlord's Stand",
    participants: [{ entityId: 'warlord' }, { entityId: 'raider' }],
    composition: 'boss-fight',
    validZoneIds: ['zone-b'],
  };
  const bossPatrol: EncounterDefinition = {
    id: 'warlord-walk',
    name: "Warlord's Walk",
    participants: [{ entityId: 'warlord' }],
    composition: 'patrol',
    validZoneIds: ['zone-b'],
  };

  it('validation refuses boss-fight compositions and role:boss participants in tables', () => {
    const bad: EncounterSpawnContent = {
      encounters: [bossFight, bossPatrol],
      entityTemplates: [raiderTemplate, bossTemplate],
      zoneTables: { 'zone-b': ['warlord-stand', 'warlord-walk'] },
    };
    const errors = validateEncounterSpawnContent(bad, zones);
    expect(errors.some((e) => e.includes('boss-fight'))).toBe(true);
    expect(errors.some((e) => e.includes('role:boss'))).toBe(true);
  });

  it('the runtime candidate filter fail-closes even if a bad table sneaks past authoring', () => {
    const engine = makeEngine({
      baseChance: 0.95,
      content: {
        encounters: [bossFight, bossPatrol],
        entityTemplates: [raiderTemplate, bossTemplate],
        zoneTables: { 'zone-b': ['warlord-stand', 'warlord-walk'] },
      },
    });
    for (let i = 0; i < 15; i++) {
      expect(moveRound(engine, 'zone-b')).toEqual([]);
      moveRound(engine, 'zone-a');
    }
    expect(spawnEvents(engine)).toEqual([]);
    // No warlord clone ever entered the world.
    expect(
      Object.values(engine.world.entities).filter((e) => e.tags.includes('role:boss')),
    ).toEqual([]);
  });

  it("validation refuses entries that a definition's own validZoneIds exclude", () => {
    const errors = validateEncounterSpawnContent(
      {
        encounters: [roadAmbush],
        entityTemplates: [raiderTemplate],
        zoneTables: { 'zone-a': ['road-ambush'] }, // roadAmbush allows b/c only
      },
      zones,
    );
    expect(errors.some((e) => e.includes('validZoneIds'))).toBe(true);
  });

  it('validation refuses unknown encounters, unknown zones, and missing templates', () => {
    const errors = validateEncounterSpawnContent(
      {
        encounters: [roadAmbush],
        entityTemplates: [], // raider template missing
        zoneTables: { 'zone-z': ['road-ambush', 'ghost-encounter'] },
      },
      zones,
    );
    expect(errors.some((e) => e.includes('no such zone'))).toBe(true);
    expect(errors.some((e) => e.includes('"ghost-encounter" is not authored'))).toBe(true);
    expect(errors.some((e) => e.includes('no entity template'))).toBe(true);
  });

  it('valid content validates clean', () => {
    expect(validateEncounterSpawnContent(content, zones)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Unregistered packs + cursor discipline
// ---------------------------------------------------------------------------

describe('encounter-spawn — packs without registered content are a no-op', () => {
  it('no registration ⇒ no spawns, and the cursor still advances (no stale replay)', () => {
    unregisterEncounterSpawnContent(HARNESS_GAME_ID);
    const engine = createTestEngine({
      modules: [traversalCore],
      entities: [makePlayer()],
      zones,
      startZone: 'zone-a',
      seed: 7,
    });

    engine.submitAction('move', { targetIds: ['zone-b'] });
    expect(runEncounterSpawnStep(engine)).toEqual([]);
    expect(spawnEvents(engine)).toEqual([]);
    // Cursor advanced past the entry — a late registration must not replay it.
    expect(getEncounterSpawnState(engine.store.state).cursor).toBe(
      engine.world.eventLog.length,
    );
  });

  it('runWorldTick without spawn content keeps its full result shape (encounters: [])', () => {
    unregisterEncounterSpawnContent(HARNESS_GAME_ID);
    const engine = createTestEngine({
      modules: [traversalCore],
      entities: [makePlayer()],
      zones,
      startZone: 'zone-a',
      seed: 7,
    });
    engine.submitAction('move', { targetIds: ['zone-b'] });
    const result = runWorldTick(engine);
    expect(result.ok).toBe(true);
    expect(result.encounters).toEqual([]);
  });
});
