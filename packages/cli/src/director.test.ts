// F-ENG005 — the Director's Ledger. Sections render ONLY for state that
// exists in this world, every section's content comes from the real
// director-mode formatter, and a throwing formatter degrades to one bounded
// line while its siblings render.

import { describe, it, expect } from 'vitest';
import { createGame } from '@ai-rpg-engine/starter-fantasy';
import { createGame as createGladiatorGame } from '@ai-rpg-engine/starter-gladiator';
import {
  makePressure,
  makeOpportunity,
  createDistrictEconomy,
} from '@ai-rpg-engine/modules';
import { EQUIPMENT_CATALOG_FORMULA, type ItemCatalog } from '@ai-rpg-engine/equipment';
import { FormulaRegistry, type Engine, type WorldState } from '@ai-rpg-engine/core';
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

/**
 * renderDirectorLedger needs `world` + `formulas` — the same fake-engine
 * idiom menu.test.ts uses, widened for F-ec5c7354's EQUIPMENT section.
 * `formulas` defaults to a fresh, empty registry: every pre-existing test
 * that calls fakeEngine(world) keeps working unchanged (engine.formulas.has
 * degrades to false, exactly the "no catalog available" path a pack that
 * never wired equipment-core takes in real play).
 */
function fakeEngine(world: WorldState, formulas?: FormulaRegistry): Pick<Engine, 'world' | 'formulas'> {
  return { world, formulas: formulas ?? new FormulaRegistry() };
}

/** A FormulaRegistry publishing `catalog` under EQUIPMENT_CATALOG_FORMULA — the exact per-engine transport equipment-core's createEquipmentCore registers at construction. */
function formulasWithEquipmentCatalog(catalog: ItemCatalog): FormulaRegistry {
  const formulas = new FormulaRegistry();
  formulas.register(EQUIPMENT_CATALOG_FORMULA, () => catalog);
  return formulas;
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
      'RECIPES',
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

  // F-d0b5edb5: before this wire, buildWorldStack never seeded economy-core,
  // so a REAL played session's world.modules['economy-core'] never existed
  // and this section could never render outside the hand-planted fixture
  // below. Now every starter (via buildWorldStack) seeds one, so the SAME
  // live createGame() engine the DISTRICTS assertion above already uses also
  // renders MARKET OVERVIEW — no test-only state-hacking required.
  it('F-d0b5edb5: a live starter engine now seeds economy-core too, so MARKET OVERVIEW renders from real play', () => {
    const engine = createGame(42);
    const report = renderDirectorLedger(engine);

    expect(report).toContain('  MARKET OVERVIEW');
    expect(report).toContain('  Chapel Grounds (chapel-grounds): ');
    expect(report).toContain('  Crypt Depths (crypt-depths): ');
  });

  // F-6cc633b9: economy-core (F-d0b5edb5, above) and companion-core
  // (F-7d5c3e28) are now BOTH always-included in buildWorldStack — MARKET
  // OVERVIEW and PARTY are no longer fixture-only, they light up together
  // from one real played session (recruit + a round), not just from a
  // zero-action engine. PEOPLE stays dark on purpose: npc-agency (its own
  // namespace) has zero production writer anywhere in the engine — pure
  // functions only, no EngineModule/register(ctx), confirmed by a repo-wide
  // grep — so no amount of real play can light it up yet (see
  // F-69ee0f88/F-f74770d2's skip notes). That is the honest ceiling, not a
  // missed wire.
  it('F-6cc633b9: a real played session (recruit + a round) lights up MARKET OVERVIEW and PARTY together — PEOPLE stays dark', () => {
    const engine = createGame(42);
    // Sister Maren starts in the player's own zone (chapel-entrance) — no
    // move needed to reach her.
    const recruited = engine.submitAction('recruit', { targetIds: ['sister-maren'] });
    expect(recruited.some((e) => e.type === 'companion.recruited')).toBe(true);
    engine.submitAction('move', { targetIds: ['chapel-nave'] }); // a played round

    const report = renderDirectorLedger(engine);

    expect(report).toContain('  MARKET OVERVIEW');
    expect(report).toContain('  Chapel Grounds (chapel-grounds): ');
    expect(report).toContain('  Crypt Depths (crypt-depths): ');

    expect(report).toContain('  PARTY (1/3 companions)');
    expect(report).toContain('  sister-maren (sister-maren) — Diplomat | Morale: 60');

    expect(report).not.toContain('PEOPLE —');
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

  // F-b595731a: director.ts's own comment used to read "No wiring persists
  // ... departure risks yet" — the departureRisks argument was always {}.
  // Morale-derived risk (evaluateDepartureRisk with no breakpoint) now feeds
  // it for real.
  it('a low-morale companion now shows a departure risk line (previously always empty)', () => {
    const world = bareWorld();
    world.modules['companion-core'] = {
      companions: [
        { npcId: 'sable', role: 'diplomat', joinedAtTick: 0, abilityTags: [], morale: 8, active: true },
      ],
    };
    const report = renderDirectorLedger(fakeEngine(world));
    expect(report).toContain('Departure risk: medium'); // morale <= 10, no breakpoint → 'medium' (evaluateDepartureRisk)
  });

  it('a healthy-morale companion shows NO departure risk line (risk: none is not rendered as noise)', () => {
    const world = bareWorld();
    world.modules['companion-core'] = {
      companions: [
        { npcId: 'sable', role: 'diplomat', joinedAtTick: 0, abilityTags: [], morale: 80, active: true },
      ],
    };
    const report = renderDirectorLedger(fakeEngine(world));
    expect(report).not.toContain('Departure risk');
  });

  // F-ec5c7354/F-efdb93d1: EQUIPMENT — the section this file's own header
  // used to name as designed-but-absent, now wired via the SAME
  // formula-registry transport turns.ts uses for the ability catalog.
  describe('EQUIPMENT (F-ec5c7354)', () => {
    it('renders from a REAL engine — starter-gladiator is the one starter that wires equipment-core', () => {
      // starter-gladiator's player starts carrying 'trident-and-net'
      // (uncarried, unequipped); the real 'equip' verb moves it into the
      // persisted Loadout equipment-core.ts's own namespace tracks.
      const engine = createGladiatorGame(42);
      const equipped = engine.submitAction('equip', { targetIds: ['trident-and-net'] });
      expect(equipped.some((e) => e.type === 'item.equipped')).toBe(true);

      const report = renderDirectorLedger(engine);

      expect(report).toContain('── EQUIPMENT (1) ──');
      expect(report).toContain('Trident & Net (weapon, uncommon)');
      expect(report).toContain('  Origin: Arena armory');
      expect(report).toContain('  Lore: Favored by fighters who prefer cunning to brawn');
      // The honest ceiling: recordItemEvent has zero production callers, so
      // no Chronicle line was ever passed and none renders.
      expect(report).not.toContain('Chronicle:');
    });

    // F-P9-005: economy-core and companion-core are always-included
    // (buildWorldStack, F-d0b5edb5/F-7d5c3e28) and equipment-core is wired
    // ONLY in starter-gladiator (F-ec5c7354/F-efdb93d1) — this is the one
    // starter where a single real played session can light up all three
    // sections at once. Mirrors F-6cc633b9's recruit+MARKET-OVERVIEW+PARTY
    // proof below, widened with the same engine's equip call.
    it('a real gladiator session (recruit + equip) lights up MARKET OVERVIEW + PARTY + EQUIPMENT together', () => {
      const engine = createGladiatorGame(42);
      const equipped = engine.submitAction('equip', { targetIds: ['trident-and-net'] });
      expect(equipped.some((e) => e.type === 'item.equipped')).toBe(true);

      // Nerva ('recruitable', 'fighter') starts in the player's own zone
      // (holding-cells) — no move needed.
      const recruited = engine.submitAction('recruit', { targetIds: ['nerva'] });
      expect(recruited.some((e) => e.type === 'companion.recruited')).toBe(true);

      const report = renderDirectorLedger(engine);

      expect(report).toContain('  MARKET OVERVIEW');
      expect(report).toContain('  Arena Grounds (arena-grounds): ');
      expect(report).toContain('  Patron Quarter (patron-quarter): ');

      expect(report).toContain('  PARTY (1/3 companions)');
      expect(report).toContain('  nerva (nerva) — Fighter | Morale: 60');

      expect(report).toContain('── EQUIPMENT (1) ──');
      expect(report).toContain('Trident & Net (weapon, uncommon)');
    });

    it('gates off for a fresh real engine — equipment-core IS wired (all 10 starters, v2.9) but nothing is equipped/carries provenance yet', () => {
      // createGame(42) DOES register EQUIPMENT_CATALOG_FORMULA now — v2.9 wave 3
      // wired createEquipmentCore into every starter (F-86b9145d). The section
      // gates in three layers: catalog registered, a persisted loadout exists,
      // AND at least one carried/equipped item has authored provenance. A
      // freshly built engine has nothing equipped and no provenance yet, so the
      // section correctly renders nothing — the "no invented data" contract,
      // not a missing module. (The genuinely-unwired path is covered by the
      // synthetic bare-engine test below, since no real starter shows it now.)
      const engine = createGame(42);
      const report = renderDirectorLedger(engine);
      expect(report).not.toContain('EQUIPMENT');
    });

    it('gates off cleanly when equipment-core is truly NOT wired at all (bare engine, no catalog formula registered)', () => {
      // Gate layer 1: readEquipmentCatalog returns [] when the engine has no
      // EQUIPMENT_CATALOG_FORMULA. No real starter demonstrates this anymore
      // (all 10 wire it as of v2.9), so this synthetic bare engine keeps the
      // "no catalog available, degrade — don't throw or fabricate" branch under
      // test. fakeEngine(world) defaults to an empty FormulaRegistry.
      const report = renderDirectorLedger(fakeEngine(bareWorld()));
      expect(report).not.toContain('EQUIPMENT');
    });

    it('a resolvable item with NO authored provenance does not earn a line — the gate is per-item, not per-loadout', () => {
      const world = bareWorld();
      const catalog: ItemCatalog = {
        items: [
          { id: 'plain-dagger', name: 'Plain Dagger', description: 'Unremarkable.', slot: 'weapon', rarity: 'common' },
        ],
      };
      world.modules['equipment-core'] = {
        loadouts: {
          [world.playerId]: {
            equipped: { weapon: 'plain-dagger', armor: null, accessory: null, tool: null, trinket: null },
            inventory: [],
          },
        },
      };
      const formulas = formulasWithEquipmentCatalog(catalog);

      const report = renderDirectorLedger(fakeEngine(world, formulas));

      expect(report).not.toContain('EQUIPMENT');
    });

    it('carried-but-unequipped provenance items render too, not just equipped ones', () => {
      const world = bareWorld();
      const catalog: ItemCatalog = {
        items: [
          {
            id: 'cursed-locket',
            name: 'Cursed Locket',
            description: 'It hums.',
            slot: 'trinket',
            rarity: 'rare',
            provenance: { flags: ['cursed'], lore: 'Best left closed.' },
          },
        ],
      };
      world.modules['equipment-core'] = {
        loadouts: {
          [world.playerId]: {
            equipped: { weapon: null, armor: null, accessory: null, tool: null, trinket: null },
            inventory: ['cursed-locket'],
          },
        },
      };
      const formulas = formulasWithEquipmentCatalog(catalog);

      const report = renderDirectorLedger(fakeEngine(world, formulas));

      expect(report).toContain('── EQUIPMENT (1) ──');
      expect(report).toContain('Cursed Locket (trinket, rare)');
      expect(report).toContain('  Flags: cursed');
    });
  });

  it('materials render through formatMaterialsForDirector from the player custom record', () => {
    const world = bareWorld();
    const player = world.entities[world.playerId];
    player.custom = { 'materials.components': 3 };

    const report = renderDirectorLedger(fakeEngine(world));

    expect(report).toContain('  MATERIALS');
    expect(report).toContain(`  components   [${'#'.repeat(3)}${'.'.repeat(17)}] 3`);
  });

  // F-239d0813: RECIPES — gated on the SAME signal MATERIALS renders on
  // (crafting-core, F-6631dd57, registers no namespace of its own to check;
  // recipes are static content, not persisted state).
  describe('RECIPES (F-239d0813)', () => {
    it('renders through getAvailableRecipes + formatAvailableRecipesForDirector once the player carries any materials', () => {
      const world = bareWorld();
      const player = world.entities[world.playerId];
      player.custom = { 'materials.medicine': 5 };

      const report = renderDirectorLedger(fakeEngine(world));

      expect(report).toContain('  RECIPES');
      // UNIVERSAL_RECIPES spans all three categories regardless of genre.
      expect(report).toContain('  Craft:');
      expect(report).toContain('  Repair:');
      expect(report).toContain('  Modify:');
      expect(report).toContain('Craft Bandage');
    });

    it('gates off cleanly when the player carries no materials — no invented recipe wishlist', () => {
      const world = bareWorld();
      const report = renderDirectorLedger(fakeEngine(world));
      expect(report).not.toContain('RECIPES');
    });
  });

  // F-6631dd57: the crafting write-wire. Before createCraftingCore, no played
  // session could ever invoke 'salvage', so getMaterialInventory always read
  // {} and MATERIALS (above) could only render from hand-planted fixtures —
  // never from a REAL engine. Mirrors F-6cc633b9's recruit+MARKET-OVERVIEW
  // proof: a real starter-fantasy session, one production verb call, the real
  // ledger.
  it('F-6631dd57: a production salvage (real engine, real verb) lights up MATERIALS — and RECIPES alongside it', () => {
    const engine = createGame(42);
    const player = engine.world.entities[engine.world.playerId];
    // The player starts carrying nothing (starter-fantasy) — seed one
    // salvageable item directly (no 'take'/'pickup' verb exists anywhere in
    // this engine), then salvage it through the REAL verb.
    player.inventory = [...(player.inventory ?? []), 'iron-sword'];

    const events = engine.submitAction('salvage', { targetIds: ['iron-sword'] });
    expect(events.some((e) => e.type === 'item.salvaged')).toBe(true);

    const report = renderDirectorLedger(engine);

    expect(report).toContain('  MATERIALS');
    // inferItemSlot('iron-sword') -> 'weapon'; SALVAGE_YIELDS.weapon.common
    // yields 1 components.
    expect(report).toContain(`  components   [${'#'.repeat(1)}${'.'.repeat(19)}] 1`);

    expect(report).toContain('  RECIPES');
    expect(report).toContain('Craft Bandage');
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
