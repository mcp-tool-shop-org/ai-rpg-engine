// F-ENG005 — the Director's Ledger. Sections render ONLY for state that
// exists in this world, every section's content comes from the real
// director-mode formatter, and a throwing formatter degrades to one bounded
// line while its siblings render.

import { describe, it, expect } from 'vitest';
import { createGame } from '@ai-rpg-engine/starter-fantasy';
import {
  makePressure,
  makeOpportunity,
  createDistrictEconomy,
} from '@ai-rpg-engine/modules';
import type { WorldState } from '@ai-rpg-engine/core';
import { renderDirectorLedger } from './director.js';

/**
 * A real starter world stripped of everything strategic — factions, module
 * namespaces, globals, player custom. Deriving from createGame keeps the
 * fixture valid against the full WorldState shape forever.
 */
function bareWorld(): WorldState {
  const engine = createGame(42);
  const world = structuredClone(engine.world) as WorldState;
  world.factions = {};
  world.modules = {};
  world.globals = {};
  for (const entity of Object.values(world.entities)) delete entity.custom;
  return world;
}

/** renderDirectorLedger needs only `world` — the same fake-engine idiom menu.test.ts uses. */
function fakeEngine(world: WorldState): { world: WorldState } {
  return { world };
}

/** A well-formed pressure in the fixture voice. */
function testPressure(overrides: Partial<Parameters<typeof makePressure>[0]> = {}) {
  return makePressure({
    kind: 'faction-summons',
    sourceFactionId: 'iron-wardens',
    description: 'The Wardens demand an audience',
    triggeredBy: 'test-fixture',
    urgency: 0.6,
    visibility: 'known',
    turnsRemaining: 4,
    potentialOutcomes: ['pay the fine', 'arrive under escort'],
    tags: ['summons'],
    currentTick: 3,
    ...overrides,
  });
}

/**
 * Plant world-tick state the way the tick itself persists it (P8-SP-002:
 * world.modules['world-tick'] is the single pressure source of truth — these
 * tests used to hand-plant the phantom 'pressure-system' namespace nothing
 * in production ever wrote, which kept the sections green in tests while
 * they were permanently inert in real play).
 */
function plantWorldTick(
  world: WorldState,
  slice: { pressures?: unknown[]; resolvedPressures?: unknown[] },
): void {
  world.modules['world-tick'] = {
    pressures: slice.pressures ?? [],
    lastHeat: 0,
    quietRounds: 0,
    lastEventIndex: world.eventLog.length,
    milestones: [],
    ...(slice.resolvedPressures ? { resolvedPressures: slice.resolvedPressures } : {}),
  };
}

describe("renderDirectorLedger (F-ENG005) — the Director's Ledger", () => {
  it('a zero-state world renders the honest minimal ledger (exact shape)', () => {
    const world = bareWorld();
    const hereId = world.entities[world.playerId]?.zoneId ?? world.locationId;
    const hereName = world.zones[hereId]?.name ?? hereId;

    const report = renderDirectorLedger(fakeEngine(world));

    expect(report).toBe(
      [
        `  ${'═'.repeat(60)}`,
        "  THE DIRECTOR'S LEDGER",
        `  ${'═'.repeat(60)}`,
        `  Turn ${world.meta.tick} — ${hereName}`,
        '',
        '  Nothing on the books yet — no strategic system carries state',
        '  in this world. Play on; the ledger fills itself.',
      ].join('\n'),
    );
  });

  it('a world with only heat + pressures shows exactly those sections — short and honest', () => {
    const world = bareWorld();
    world.globals['player_heat'] = 35;
    plantWorldTick(world, { pressures: [testPressure()] });

    const report = renderDirectorLedger(fakeEngine(world));

    // The two live sections, fed by the real formatters.
    expect(report).toContain('── ACTIVE PRESSURES (1) ──');
    expect(report).toContain('  [faction-summons] The Wardens demand an audience');
    expect(report).toContain('    Expires: 4 turns | Triggered by: test-fixture');
    expect(report).toContain('PLAYER LEVERAGE');
    // formatLeverageForDirector's own bar row: floor(35/5)=7 filled cells.
    expect(report).toContain(`  Heat         ${'█'.repeat(7)}${'░'.repeat(13)} 35`);

    // And no others — no empty scaffolds, no invented data.
    for (const absent of [
      'PRESSURE FALLOUT',
      'FACTION AGENCY',
      'DISTRICTS',
      'MARKET OVERVIEW',
      'OPPORTUNIT', // covers OPPORTUNITIES + OPPORTUNITY FALLOUT
      'RUMORS ABOUT YOU',
      'PEOPLE —',
      'NARRATIVE ARCS',
      'ENDGAME TRAJECTORY',
      'PARTY',
      'MATERIALS',
      'Nothing on the books',
    ]) {
      expect(report).not.toContain(absent);
    }
  });

  it('factions render through buildFactionProfile + formatFactionProfilesForDirector', () => {
    const world = bareWorld();
    world.factions['iron-wardens'] = {
      id: 'iron-wardens',
      name: 'The Iron Wardens',
      reputation: 10,
      disposition: 'neutral',
    };

    const report = renderDirectorLedger(fakeEngine(world));

    expect(report).toContain('FACTION AGENCY — 1 faction');
    expect(report).toContain('  iron-wardens');
    expect(report).toContain('Goals:'); // profile body, not a bare id dump
  });

  it('a live starter engine renders its real district state — and rendering is side-effect free', () => {
    const engine = createGame(42);
    const before = JSON.stringify(engine.world);

    const report = renderDirectorLedger(engine);

    // starter-fantasy ships district-core state for its two districts.
    expect(report).toContain('  DISTRICTS');
    expect(report).toContain('  Chapel Grounds (chapel-grounds) — "');
    expect(report).toContain('  Crypt Depths (crypt-depths) — "');
    // No dominant arc at turn 0 — baseline scorer noise is not a story.
    expect(report).not.toContain('NARRATIVE ARCS');

    // Inspection is side-effect free: rendering must not write default
    // namespaces (getFactionCognition's synthesize-and-attach) into live
    // state — the clone absorbs them. A save after rendering is byte-
    // identical to one before.
    expect(JSON.stringify(engine.world)).toBe(before);
  });

  it('districts + market overview render from district-core and economy-core state', () => {
    const world = bareWorld();
    world.modules['district-core'] = {
      districts: {
        docks: {
          alertPressure: 10,
          rumorDensity: 0,
          intruderLikelihood: 0,
          surveillance: 20,
          stability: 6,
          commerce: 55,
          morale: 60,
          lastUpdateTick: 0,
          eventCount: 0,
        },
      },
      zoneToDistrict: {},
      definitions: {
        docks: { id: 'docks', name: 'The Docks', zoneIds: ['pier-1'], tags: ['public'] },
      },
    };
    world.modules['economy-core'] = { districts: { docks: createDistrictEconomy() } };

    const report = renderDirectorLedger(fakeEngine(world));

    // formatAllDistrictsForDirector's own banner + per-district line.
    expect(report).toContain('  DISTRICTS');
    expect(report).toContain('  The Docks (docks) — "');
    // formatAllDistrictEconomiesForDirector resolves the district's real name.
    expect(report).toContain('  MARKET OVERVIEW');
    expect(report).toContain('  The Docks (docks): ');
  });

  it('opportunities render through formatOpportunityListForDirector (and its per-item formatter)', () => {
    const world = bareWorld();
    const opp = makeOpportunity({
      kind: 'recovery',
      sourceFactionId: 'iron-wardens',
      title: 'Recover the sunken reliquary',
      description: 'A barge went down with chapel property aboard.',
      objectiveDescription: 'Bring the reliquary back intact.',
      urgency: 0.8,
      turnsRemaining: 6,
      visibility: 'offered',
      rewards: [],
      risks: [],
      genre: 'fantasy',
      currentTick: 5,
    });
    world.modules['opportunity-core'] = { opportunities: [opp] };

    const report = renderDirectorLedger(fakeEngine(world));

    expect(report).toContain('=== OPPORTUNITIES ===');
    expect(report).toContain('  AVAILABLE:');
    expect(report).toContain('RECOVERY: Recover the sunken reliquary');
    expect(report).toContain('    Status: available | Urgency: URGENT | Deadline: 6 turns');
  });

  it('rumors render through formatRumorForDirector', () => {
    const world = bareWorld();
    world.modules['player-rumor'] = {
      rumors: [
        {
          id: 'rumor_1',
          claim: 'defeated the Bone Collector',
          subjectDescriptor: 'the stranger in grave-dust',
          sourceEvent: 'combat.entity.defeated',
          confidence: 0.8,
          distortion: 0.25,
          mutationCount: 1,
          valence: 'heroic',
          spreadTo: ['market-ward'],
          originFactionId: 'chapel-undead',
          originDistrictId: 'crypt-ward',
          originTick: 9,
        },
      ],
    };

    const report = renderDirectorLedger(fakeEngine(world));

    expect(report).toContain('── RUMORS ABOUT YOU (1) ──');
    expect(report).toContain('  "defeated the Bone Collector"');
    expect(report).toContain('    Valence: heroic | Confidence: 80% | Distortion: 25%');
    expect(report).toContain('    Spread: market-ward');
  });

  it('companions render through formatPartyForDirector, with cohesion computed by the module', () => {
    const world = bareWorld();
    world.modules['companion-core'] = {
      companions: [
        {
          npcId: 'mira',
          role: 'muscle',
          joinedAtTick: 2,
          personalGoal: 'Clear her name',
          abilityTags: [],
          morale: 70,
          active: true,
        },
      ],
    };

    const report = renderDirectorLedger(fakeEngine(world));

    expect(report).toContain('  PARTY (1/3 companions)');
    expect(report).toContain('  mira (mira) — Muscle | Morale: 70');
    expect(report).toContain('    Personal goal: Clear her name');
    expect(report).toContain('  Cohesion: 70');
  });

  it('materials render through formatMaterialsForDirector from the player custom record', () => {
    const world = bareWorld();
    const player = world.entities[world.playerId];
    player.custom = { 'materials.components': 3 };

    const report = renderDirectorLedger(fakeEngine(world));

    expect(report).toContain('  MATERIALS');
    expect(report).toContain(`  components   [${'#'.repeat(3)}${'.'.repeat(17)}] 3`);
  });

  it('a hostile, hot campaign renders NARRATIVE ARCS and ENDGAME TRAJECTORY from the live evaluators', () => {
    const world = bareWorld();
    world.globals['player_heat'] = 80;
    world.factions['iron-wardens'] = {
      id: 'iron-wardens',
      name: 'The Iron Wardens',
      reputation: -50,
      disposition: 'hostile',
    };

    const report = renderDirectorLedger(fakeEngine(world));

    // Arc snapshot: rep -50 + heat 80 + no companions makes descent dominant
    // (0.8), with hunted right behind it (0.35 + 0.25 + 0.1 = 0.7).
    expect(report).toContain('── NARRATIVE ARCS ──');
    expect(report).toContain('  Dominant Arc: descent');
    expect(report).toContain('all factions hostile, heat: 80, no companions');

    // The same state crosses evaluateEndgame's exile threshold — the
    // trajectory section consumes formatEndgameForDirector.
    expect(report).toContain('── ENDGAME TRAJECTORY ──');
    expect(report).toContain('  Resolution: EXILE');
    expect(report).toContain('    heat: 80');
  });

  it('a throwing formatter degrades to ONE bounded attributed line and siblings still render', () => {
    const world = bareWorld();
    world.globals['player_heat'] = 35;
    // tags: undefined makes formatPressureForDirector throw (pressure.tags.join).
    plantWorldTick(world, { pressures: [{ ...testPressure(), tags: undefined }] });

    const report = renderDirectorLedger(fakeEngine(world));

    const failLines = report.split('\n').filter((l) => l.includes('[section failed:'));
    expect(failLines).toHaveLength(1);
    expect(failLines[0].length).toBeLessThan(280); // bounded, no stack
    expect(report).toContain('── ACTIVE PRESSURES ──'); // failure is attributed
    expect(report).toContain('PLAYER LEVERAGE'); // sibling section survives
    expect(report).toContain(`  Heat         ${'█'.repeat(7)}${'░'.repeat(13)} 35`);
  });

  it('a malformed namespace (non-object) is treated as absent, not an error', () => {
    const world = bareWorld();
    world.modules['world-tick'] = 'corrupted';
    world.modules['player-rumor'] = 42;

    const report = renderDirectorLedger(fakeEngine(world));

    expect(report).not.toContain('[section failed:');
    expect(report).toContain('Nothing on the books yet');
  });

  // P8-SP-002: the fallout ledger world-tick now persists (bounded
  // resolvedPressures) is what makes this section renderable at all — before,
  // fallout records only rode the pressure.expired payload and died with the
  // round, so PRESSURE FALLOUT could never appear in a real session.
  it('PRESSURE FALLOUT renders from world-tick\'s persisted fallout ledger via the real formatter', () => {
    const world = bareWorld();
    plantWorldTick(world, {
      resolvedPressures: [
        {
          resolution: {
            pressureId: 'wp-9',
            pressureKind: 'bounty-issued',
            resolutionType: 'expired',
            resolvedBy: 'expiry',
            resolvedAtTick: 12,
            resolutionVisibility: 'known',
          },
          effects: [{ type: 'reputation', factionId: 'iron-wardens', delta: -5 }],
          summary: 'bounty issued expired without resolution',
        },
      ],
    });

    const report = renderDirectorLedger(fakeEngine(world));

    expect(report).toContain('── PRESSURE FALLOUT (1) ──');
    expect(report).toContain('[bounty-issued] → expired');
    expect(report).toContain('Resolved by: expiry at tick 12');
    expect(report).toContain('Summary: bounty issued expired without resolution');
    expect(report).toContain('rep -5 with iron-wardens');
    // Absent active pressures → no ACTIVE PRESSURES scaffold alongside it.
    expect(report).not.toContain('ACTIVE PRESSURES');
  });
});
