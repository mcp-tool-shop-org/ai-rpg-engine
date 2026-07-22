// F1b — win / lose / ending. Player at 0 HP must produce a DEFEAT ending and
// boss death a VICTORY ending (no more soft-lock / one-line boss kill), framed
// through the engine's endgame-detection when its campaign thresholds fire and
// rendered through campaign-memory's finale machinery.

import { describe, it, expect } from 'vitest';
import { Engine } from '@ai-rpg-engine/core';
import { createGame, combatMasteryTree } from '@ai-rpg-engine/starter-fantasy';
import type { ProgressionTreeDefinition } from '@ai-rpg-engine/content-schema';
import {
  addCurrency,
  createDistrictEconomy,
  type WorldPressure,
  type CompanionState,
} from '@ai-rpg-engine/modules';
import {
  detectBaseOutcome,
  evaluateSessionEnd,
  renderSessionEnd,
  journalFromEventLog,
  buildEndgameInputs,
  computeSessionStats,
  renderSessionStats,
} from './endgame.js';

function makeGame() {
  return createGame(42);
}

describe('detectBaseOutcome (F1b)', () => {
  it('a fresh game has no outcome', () => {
    const engine = makeGame();
    expect(detectBaseOutcome(engine.world)).toBeNull();
  });

  it('player at 0 HP is defeat', () => {
    const engine = makeGame();
    engine.store.state.entities['player'].resources.hp = 0;
    expect(detectBaseOutcome(engine.world)).toBe('defeat');
  });

  it('a missing player entity is defeat, not a crash', () => {
    const engine = makeGame();
    delete engine.store.state.entities['player'];
    expect(detectBaseOutcome(engine.world)).toBe('defeat');
  });

  it('boss down = victory, even with lesser enemies still standing', () => {
    const engine = makeGame();
    engine.store.state.entities['crypt-warden'].resources.hp = 0; // the role:boss
    expect(engine.store.state.entities['ash-ghoul'].resources.hp).toBeGreaterThan(0);
    expect(detectBaseOutcome(engine.world)).toBe('victory');
  });

  it('boss standing = no victory even if every other enemy is down', () => {
    const engine = makeGame();
    engine.store.state.entities['ash-ghoul'].resources.hp = 0;
    engine.store.state.entities['crypt-stalker'].resources.hp = 0;
    expect(detectBaseOutcome(engine.world)).toBeNull();
  });

  it('defeat wins over victory when both hold (dying to the boss\'s death throes)', () => {
    const engine = makeGame();
    engine.store.state.entities['player'].resources.hp = 0;
    engine.store.state.entities['crypt-warden'].resources.hp = 0;
    expect(detectBaseOutcome(engine.world)).toBe('defeat');
  });

  it('bossless packs: victory when every hostile is down, never on an empty roster', () => {
    const engine = new Engine({
      manifest: { id: 't', title: 't', version: '0', engineVersion: '0', ruleset: 't', modules: [], contentPacks: [] },
      seed: 1,
    });
    engine.store.state.zones = { z: { id: 'z', roomId: 'r', name: 'Z', tags: [], neighbors: [] } };
    engine.store.state.locationId = 'z';
    engine.store.addEntity({
      id: 'p', blueprintId: 'p', type: 'player', name: 'P', tags: ['player'],
      stats: {}, resources: { hp: 5 }, statuses: [], zoneId: 'z',
    });
    engine.store.state.playerId = 'p';

    // No hostiles at all → not an instant win.
    expect(detectBaseOutcome(engine.world)).toBeNull();

    engine.store.addEntity({
      id: 'e1', blueprintId: 'e', type: 'enemy', name: 'E1', tags: ['enemy'],
      stats: {}, resources: { hp: 0 }, statuses: [], zoneId: 'z',
    });
    expect(detectBaseOutcome(engine.world)).toBe('victory');
  });
});

describe('evaluateSessionEnd (F1b) — outcome + campaign framing', () => {
  it('plain defeat: base outcome with a narrator line, no campaign trigger for a thin campaign', () => {
    const engine = makeGame();
    engine.store.state.entities['player'].resources.hp = 0;

    const end = evaluateSessionEnd(engine);
    expect(end).not.toBeNull();
    expect(end!.kind).toBe('defeat');
    expect(end!.resolutionClass).toBe('defeat');
    expect(end!.narratorLine.length).toBeGreaterThan(0);
    expect(end!.trigger).toBeNull();
  });

  it('plain victory when the boss falls', () => {
    const engine = makeGame();
    engine.store.state.entities['crypt-warden'].resources.hp = 0;
    const end = evaluateSessionEnd(engine);
    expect(end!.kind).toBe('victory');
    expect(end!.resolutionClass).toBe('victory');
  });

  it('a live session has no end', () => {
    const engine = makeGame();
    expect(evaluateSessionEnd(engine)).toBeNull();
  });

  it('the campaign layer takes over the framing when evaluateEndgame fires (martyrdom: die beloved)', () => {
    const engine = makeGame();
    // A campaign-rich death: positive faction reputation crosses checkMartyrdom's
    // threshold (avgRep >= 20, player dead) — the REAL evaluateEndgame fires.
    engine.store.state.factions['chapel-order'] = {
      id: 'chapel-order', name: 'Chapel Order', reputation: 55, disposition: 'friendly',
    };
    engine.store.state.entities['player'].resources.hp = 0;

    const end = evaluateSessionEnd(engine);
    expect(end!.kind).toBe('defeat');
    expect(end!.trigger).not.toBeNull();
    expect(end!.resolutionClass).toBe('martyrdom');
    // formatEndgameForNarrator's framing, verbatim from the modules layer.
    expect(end!.narratorLine).toContain('Campaign turning point: martyrdom');
  });

  it('buildEndgameInputs reads faction alert/cohesion from the faction-cognition module', () => {
    const engine = makeGame();
    const inputs = buildEndgameInputs(engine.world);
    // starter-fantasy wires chapel-undead into faction-cognition (cohesion 0.7).
    const chapelUndead = inputs.factionStates.find((f) => f.factionId === 'chapel-undead');
    expect(chapelUndead).toBeDefined();
    expect(chapelUndead!.cohesion).toBe(70); // 0-1 scaled to 0-100
  });
});

// F-ENG005 — the evaluator's inputs come from LIVE state, not hardcoded zeros.
// Each test pins one input's source namespace at the buildEndgameInputs
// boundary: the exact key read, the exact value that flows through.
describe('buildEndgameInputs (F-ENG005) — live inputs from persisted state', () => {
  /** A minimal valid WorldPressure for namespace-pinning tests. */
  function makeTestPressure(id: string): WorldPressure {
    return {
      id,
      kind: 'bounty-issued',
      sourceFactionId: 'chapel-undead',
      description: 'A bounty circulates',
      triggeredBy: 'test',
      urgency: 0.6,
      visibility: 'known',
      turnsRemaining: 5,
      potentialOutcomes: [],
      tags: [],
      createdAtTick: 1,
    };
  }

  it('a zero-state world reproduces the previous behavior: zero heat, level 1, empty pressures/companions', () => {
    const engine = makeGame();
    const inputs = buildEndgameInputs(engine.world);
    expect(inputs.playerLeverage.heat).toBe(0);
    expect(inputs.playerLevel).toBe(1);
    expect(inputs.activePressures).toEqual([]);
    expect(inputs.companions).toEqual([]);
  });

  // F-d0b5edb5: buildWorldStack now seeds economy-core unconditionally (the
  // write-wire this fix is for), so districtEconomies is no longer
  // permanently empty for a REAL played session — this replaces the old
  // assertion above, which pinned the exact bug F-d0b5edb5 closes. The
  // "pack never registered economy-core at all" case is covered separately
  // below and still degrades to an empty Map.
  it('F-d0b5edb5: a live starter engine seeds economy-core, so districtEconomies reflects real play', () => {
    const engine = makeGame();
    const inputs = buildEndgameInputs(engine.world);
    expect(inputs.districtEconomies.size).toBe(2); // starter-fantasy's two districts
    expect(inputs.districtEconomies.has('chapel-grounds')).toBe(true);
    expect(inputs.districtEconomies.has('crypt-depths')).toBe(true);
  });

  it('districtEconomies degrades to an empty Map for a world whose pack never registered economy-core', () => {
    const engine = makeGame();
    const world = structuredClone(engine.world);
    delete world.modules['economy-core'];
    expect(buildEndgameInputs(world).districtEconomies.size).toBe(0);
  });

  it('heat is sourced from defeat-fallout\'s exact global key world.globals["player_heat"]', () => {
    const engine = makeGame();
    engine.store.state.globals['player_heat'] = 42;
    expect(buildEndgameInputs(engine.world).playerLeverage.heat).toBe(42);
    // The other leverage axes have no persisting writer — they stay 0.
    const lev = buildEndgameInputs(engine.world).playerLeverage;
    expect(lev.favor).toBe(0);
    expect(lev.influence).toBe(0);
    expect(lev.legitimacy).toBe(0);
  });

  it('heat accrued by the REAL defeat-fallout module flows into the evaluator (5 per kill)', () => {
    const engine = makeGame();
    // starter-fantasy wires createDefeatFallout with the default heatPerKill: 5.
    // Its listener reads entityId/defeatedBy off combat.entity.defeated.
    engine.store.emitEvent(
      'combat.entity.defeated',
      { entityId: 'ash-ghoul', entityName: 'Ash Ghoul', defeatedBy: 'player' },
      { actorId: 'player' },
    );
    expect(engine.world.globals['player_heat']).toBe(5);
    expect(buildEndgameInputs(engine.world).playerLeverage.heat).toBe(5);
  });

  it('a non-numeric heat global degrades to 0, never NaN', () => {
    const engine = makeGame();
    engine.store.state.globals['player_heat'] = 'hot' as never;
    expect(buildEndgameInputs(engine.world).playerLeverage.heat).toBe(0);
  });

  // P8-SP-002/WL-003: pressures read the namespace the world tick actually
  // persists — world.modules['world-tick'] via getActivePressures — instead
  // of the phantom 'pressure-system' namespace these tests used to hand-plant
  // (nothing in production ever wrote it, so the axis was permanently empty
  // in real play while the planted tests stayed green).
  it("active pressures are read from world-tick's persisted state (the REAL writer's namespace)", () => {
    const engine = makeGame();
    const pressure = makeTestPressure('wp-1');
    // The starter registers world-tick (module identity, P8-SP-003), so the
    // namespace exists from construction — mutate the real slice, exactly
    // what the tick does when it persists the round's working set.
    const tickState = engine.store.state.modules['world-tick'] as { pressures: unknown[] };
    expect(tickState).toBeDefined();
    tickState.pressures = [pressure];

    const inputs = buildEndgameInputs(engine.world);
    expect(inputs.activePressures).toHaveLength(1);
    expect(inputs.activePressures[0].id).toBe('wp-1');
    expect(inputs.activePressures[0].kind).toBe('bounty-issued');
  });

  it('malformed world-tick shapes degrade to empty (the accessor contract), and the phantom namespace is dead', () => {
    const engine = makeGame();
    engine.store.state.modules['world-tick'] = { pressures: 'not-an-array' };
    expect(buildEndgameInputs(engine.world).activePressures).toEqual([]);

    // Planting the OLD phantom namespace does nothing now — the axis reads
    // only the world tick's truth.
    const phantom = makeGame();
    phantom.store.state.modules['pressure-system'] = { activePressures: [makeTestPressure('wp-x')] };
    (phantom.store.state.modules['world-tick'] as { pressures: unknown[] }).pressures = [];
    expect(buildEndgameInputs(phantom.world).activePressures).toEqual([]);
  });

  it("resolved pressures flow from world-tick's fallout ledger into the evaluator's resolvedPressures axis", () => {
    const engine = makeGame();
    const tickState = engine.store.state.modules['world-tick'] as { resolvedPressures?: unknown[] };
    tickState.resolvedPressures = [
      { summary: 'bounty issued expired without resolution', resolution: { pressureKind: 'bounty-issued' } },
    ];
    const inputs = buildEndgameInputs(engine.world);
    expect(inputs.resolvedPressures).toHaveLength(1);
    expect((inputs.resolvedPressures[0] as { summary?: string }).summary).toBe(
      'bounty issued expired without resolution',
    );
  });

  // P8-SP-002 (accrual half): endgame's faction axes read the same two
  // channels world-tick's buildPressureInputs merges — defeat-fallout's
  // faction_alert_<id>/reputation_<id> globals plus the authored/cognition
  // state — so the endgame and the pressure tick can never disagree.
  it('faction alert takes the MAX of the combat global and the cognition channel', () => {
    const engine = makeGame();
    engine.store.state.globals['faction_alert_chapel-undead'] = 60;
    // starter-fantasy wires chapel-undead into faction-cognition (alert 0).
    let inputs = buildEndgameInputs(engine.world);
    expect(inputs.factionStates.find((f) => f.factionId === 'chapel-undead')!.alertLevel).toBe(60);

    // The hotter channel wins in either direction.
    const cog = (engine.store.state.modules['faction-cognition'] as {
      factionCognition: Record<string, { alertLevel: number }>;
    }).factionCognition;
    cog['chapel-undead'].alertLevel = 75;
    inputs = buildEndgameInputs(engine.world);
    expect(inputs.factionStates.find((f) => f.factionId === 'chapel-undead')!.alertLevel).toBe(75);
  });

  it('a faction known only through its accrual globals still enters the faction axes', () => {
    const engine = makeGame();
    engine.store.state.globals['faction_alert_arena-guild'] = 40;
    engine.store.state.globals['reputation_arena-guild'] = -15;
    const inputs = buildEndgameInputs(engine.world);
    expect(inputs.factionStates.find((f) => f.factionId === 'arena-guild')!.alertLevel).toBe(40);
    expect(inputs.playerReputations.find((r) => r.factionId === 'arena-guild')!.value).toBe(-15);
  });

  it('player reputation merges the authored baseline with the accrued delta (base + reputation_<id>)', () => {
    const engine = makeGame();
    engine.store.state.factions['chapel-order'] = {
      id: 'chapel-order', name: 'Chapel Order', reputation: 10, disposition: 'neutral',
    };
    engine.store.state.globals['reputation_chapel-order'] = -25;
    const inputs = buildEndgameInputs(engine.world);
    expect(inputs.playerReputations.find((r) => r.factionId === 'chapel-order')!.value).toBe(-15);
  });

  it('cognition-only factions stay OUT of playerReputations — no invented neutral zeros diluting averages', () => {
    const engine = makeGame(); // chapel-undead lives in faction-cognition only
    const inputs = buildEndgameInputs(engine.world);
    expect(inputs.factionStates.some((f) => f.factionId === 'chapel-undead')).toBe(true);
    expect(inputs.playerReputations.some((r) => r.factionId === 'chapel-undead')).toBe(false);
  });

  it('companions are read from world.modules["companion-core"].companions', () => {
    const engine = makeGame();
    const companion: CompanionState = {
      npcId: 'sister-maren',
      role: 'healer',
      joinedAtTick: 3,
      abilityTags: [],
      morale: 80,
      active: true,
    };
    engine.store.state.modules['companion-core'] = { companions: [companion] };
    const inputs = buildEndgameInputs(engine.world);
    expect(inputs.companions).toHaveLength(1);
    expect(inputs.companions[0].npcId).toBe('sister-maren');
    expect(inputs.companions[0].morale).toBe(80);
  });

  it('district economies are read from world.modules["economy-core"].districts', () => {
    const engine = makeGame();
    engine.store.state.modules['economy-core'] = {
      districts: { 'chapel-grounds': createDistrictEconomy('fantasy') },
    };
    const inputs = buildEndgameInputs(engine.world);
    expect(inputs.districtEconomies.size).toBe(1);
    expect(inputs.districtEconomies.get('chapel-grounds')?.supplies.food.level).toBeGreaterThan(0);
  });

  // Phase-9 remediation, FIX 3: buildEndgameInputs used to hardcode
  // activeOpportunities/resolvedOpportunities to [] behind a comment claiming
  // "opportunity-core keeps no world.modules state" — false as of v2.9;
  // opportunity-core persists world.modules['opportunity-core'] every round
  // (world-tick.ts's spawn/tick wire) and opportunity-resolution.ts's
  // 'opportunity' verb appends to the SAME resolved-opportunity ledger. RED-
  // PROOF: before this fix these two axes were ALWAYS empty for every played
  // session, so arc-detection's completedOpportunityCount fed
  // scoreRisingPower/scoreMerchantPrince zero records forever, no matter how
  // many opportunities the player actually completed.
  it("F-P9-A2: activeOpportunities/resolvedOpportunities are read from the LIVE opportunity-core namespace (not hardcoded [])", () => {
    const engine = makeGame();
    engine.store.state.modules['opportunity-core'] = {
      opportunities: [{
        id: 'opp-open', kind: 'bounty', status: 'available', title: 'Open bounty',
        description: '', objectiveDescription: '', linkedRumorIds: [], linkedNpcIds: [],
        tags: [], rewards: [], risks: [], visibility: 'known', urgency: 0.4,
        turnsRemaining: 5, createdAtTick: 1, genre: 'fantasy',
      }],
      resolvedOpportunities: [
        { resolution: { opportunityId: 'c1', opportunityKind: 'contract', resolutionType: 'completed', resolvedAtTick: 1 }, effects: [], summary: 'contract completed' },
        { resolution: { opportunityId: 'c2', opportunityKind: 'contract', resolutionType: 'completed', resolvedAtTick: 2 }, effects: [], summary: 'contract completed' },
        { resolution: { opportunityId: 'c3', opportunityKind: 'contract', resolutionType: 'completed', resolvedAtTick: 3 }, effects: [], summary: 'contract completed' },
        { resolution: { opportunityId: 's1', opportunityKind: 'supply-run', resolutionType: 'completed', resolvedAtTick: 4 }, effects: [], summary: 'supply-run completed' },
        { resolution: { opportunityId: 's2', opportunityKind: 'supply-run', resolutionType: 'completed', resolvedAtTick: 5 }, effects: [], summary: 'supply-run completed' },
      ],
    };

    const inputs = buildEndgameInputs(engine.world);
    expect(inputs.activeOpportunities).toHaveLength(1);
    expect(inputs.activeOpportunities[0].id).toBe('opp-open');
    expect(inputs.resolvedOpportunities).toHaveLength(5);

    // Arc scoring reflects it: scoreRisingPower's "≥3 completed contracts"
    // (+0.15) and scoreMerchantPrince's "≥2 supply-runs" (+0.2) drivers both
    // fire — today (hardcoded []) neither driver could ever appear for any
    // played session, no matter how many opportunities were completed.
    const rising = inputs.arcSnapshot.signals.find((s) => s.kind === 'rising-power');
    expect(rising?.primaryDrivers.some((d) => d.includes('contracts completed'))).toBe(true);

    const merchant = inputs.arcSnapshot.signals.find((s) => s.kind === 'merchant-prince');
    expect(merchant?.primaryDrivers.some((d) => d.includes('supply runs completed'))).toBe(true);
  });

  it('a zero-state world still reads [] for both opportunity axes — no invented state, same as before this fix for an untouched world', () => {
    const engine = makeGame();
    const inputs = buildEndgameInputs(engine.world);
    expect(inputs.activeOpportunities).toEqual([]);
    expect(inputs.resolvedOpportunities).toEqual([]);
  });

  it('playerLevel derives from progression-core unlocks (the HUD\'s notion: 1 + nodes unlocked)', () => {
    const engine = makeGame();
    expect(buildEndgameInputs(engine.world).playerLevel).toBe(1);

    addCurrency(engine.store.state, 'player', 'xp', 30, engine.tick);
    engine.submitAction('unlock', { parameters: { treeId: 'combat-mastery', nodeId: 'toughened' } });
    expect(
      combatMasteryTree.nodes.some((n) => n.id === 'toughened'), // the real tree, not a synthetic one
    ).toBe(true);
    expect(buildEndgameInputs(engine.world).playerLevel).toBe(2);
  });

  it('a lived-in world reaches a DIFFERENT ending than a zero-state world (exile vs plain defeat)', () => {
    // Zero-state death: plain defeat framing.
    const fresh = makeGame();
    fresh.store.state.entities['player'].resources.hp = 0;
    expect(evaluateSessionEnd(fresh)!.resolutionClass).toBe('defeat');

    // Same death after a hunted, hated run: heat 85 (defeat-fallout's global),
    // every faction hostile, no companions → checkExile's thresholds fire.
    const lived = makeGame();
    lived.store.state.factions['chapel-order'] = {
      id: 'chapel-order', name: 'Chapel Order', reputation: -60, disposition: 'hostile',
    };
    lived.store.state.globals['player_heat'] = 85;
    (lived.store.state.modules['world-tick'] as { pressures: unknown[] }).pressures = [
      makeTestPressure('wp-a'),
      makeTestPressure('wp-b'),
    ];
    lived.store.state.entities['player'].resources.hp = 0;

    const end = evaluateSessionEnd(lived)!;
    expect(end.kind).toBe('defeat');
    expect(end.resolutionClass).toBe('exile');
    expect(end.trigger?.evidence.heat).toBe(85);

    // And the differentiation is visible at the inputs boundary itself.
    const freshInputs = buildEndgameInputs(fresh.world);
    const livedInputs = buildEndgameInputs(lived.world);
    expect(freshInputs.playerLeverage.heat).toBe(0);
    expect(livedInputs.playerLeverage.heat).toBe(85);
    expect(freshInputs.activePressures).toHaveLength(0);
    expect(livedInputs.activePressures).toHaveLength(2);
  });
});

describe('renderSessionEnd + journalFromEventLog (F1b) — the end screen', () => {
  it('defeat renders a DEFEAT banner, the narrator line, and the finale epilogue', () => {
    const engine = makeGame();
    engine.store.state.entities['player'].resources.hp = 0;
    const end = evaluateSessionEnd(engine)!;

    const screen = renderSessionEnd(end, engine.world);
    expect(screen).toContain('DEFEAT');
    expect(screen).not.toContain('VICTORY');
    expect(screen).toContain(end.narratorLine);
    expect(screen).toContain('CAMPAIGN CONCLUSION');
    expect(screen).toContain('Resolution: DEFEAT');
  });

  it('victory renders a VICTORY banner with key moments from the event log', () => {
    const engine = makeGame();
    // Real events for the journal: the player explores, then the boss falls.
    engine.submitAction('move', { targetIds: ['chapel-nave'] });
    engine.store.emitEvent('combat.entity.defeated', { entityId: 'crypt-warden' }, { actorId: 'player' });
    engine.store.state.entities['crypt-warden'].resources.hp = 0;

    const end = evaluateSessionEnd(engine)!;
    const screen = renderSessionEnd(end, engine.world);
    expect(screen).toContain('VICTORY');
    expect(screen).toContain('KEY MOMENTS');
    expect(screen).toContain('defeated Crypt Warden — the boss falls');
    expect(screen).toContain('Entered Chapel Nave');
  });

  // T0-finale-stats: a live defeat's finale said "Chronicle Events: 2" and
  // little else — too thin a goodbye. The end screen now tallies the run from
  // the events the engine actually emitted.
  it('the end screen carries the run-in-numbers block', () => {
    const engine = makeGame();
    engine.store.state.entities['player'].resources.hp = 0;
    const end = evaluateSessionEnd(engine)!;

    const screen = renderSessionEnd(end, engine.world);
    expect(screen).toContain('THE RUN IN NUMBERS');
    expect(screen).toContain('Rounds Survived:');
    expect(screen).toContain('Enemies Defeated:');
    expect(screen).toContain('Damage Dealt:');
    expect(screen).toContain('Damage Taken:');
    expect(screen).toContain('Abilities Used:');
    expect(screen).toContain('XP Earned:');
    expect(screen).toContain('Advancements Unlocked:');
  });

  // F-2bf933bd: formatFinaleForDirector (the structured sibling of
  // formatFinaleForTerminal — resolution class, dominant arc, duration,
  // top-5 key moments, NPC fates, faction fates, legacy) had ZERO consumers
  // anywhere in the repo before this wire, despite being computed for free
  // from the SAME outline the narrative epilogue already builds.
  it("F-2bf933bd: the end screen also carries the director's structured summary trailer, after the narrative epilogue", () => {
    const engine = makeGame();
    engine.store.state.entities['player'].resources.hp = 0;
    const end = evaluateSessionEnd(engine)!;

    const screen = renderSessionEnd(end, engine.world);

    // The narrative epilogue (formatFinaleForTerminal) still renders first...
    expect(screen).toContain('CAMPAIGN CONCLUSION');
    // ...followed by a distinct trailer carrying formatFinaleForDirector's
    // own structured labels — title-case-colon, never produced by
    // formatFinaleForTerminal (which uses ALL-CAPS dividers instead: FACTION
    // OUTCOMES, LEGACY, ...), so these are unambiguous proof of the new wire.
    expect(screen).toContain("THE DIRECTOR'S SUMMARY");
    expect(screen).toContain('Key Moments:');
    expect(screen).toContain('NPC Fates:');
    expect(screen).toContain('Faction Fates:');
    expect(screen).toContain('Legacy:');

    // And it comes AFTER the narrative epilogue, not before — "the numbers
    // behind the story you just got", not a duplicate shown first.
    expect(screen.indexOf('CAMPAIGN CONCLUSION')).toBeLessThan(
      screen.indexOf("THE DIRECTOR'S SUMMARY"),
    );
  });

  // F-2fe4be26 — the DISCIPLINE section's own worked example: "tagging
  // activates a consumer (e.g. finale COMPANIONS renders)". End-to-end
  // through the REAL starter-fantasy game (createGame — now wired with
  // companion-core via buildWorldStack, F-7d5c3e28) and the real 'recruit'
  // verb: recruit → tags 'companion' → endgame.ts's FinaleNpcInput.isCompanion
  // → campaign-memory's finale.ts COMPANIONS block. RED-PROOF: before this
  // wave, nothing ever wrote the 'companion' tag, so this block never
  // rendered for any NPC in any played session.
  it('recruiting through the real verb makes the companion appear in the finale\'s COMPANIONS block', () => {
    const engine = makeGame();
    // Brother Aldric ('brother-aldric') starts in chapel-nave; move there first.
    engine.submitAction('move', { targetIds: ['chapel-nave'] });
    const recruited = engine.submitAction('recruit', { targetIds: ['brother-aldric'] });
    expect(recruited.some((e) => e.type === 'companion.recruited')).toBe(true);
    expect(engine.world.entities['brother-aldric'].tags).toContain('companion');

    engine.store.state.entities['player'].resources.hp = 0; // end the session
    const end = evaluateSessionEnd(engine)!;
    const screen = renderSessionEnd(end, engine.world);

    expect(screen).toContain('COMPANIONS');
    expect(screen).toContain('Brother Aldric');
  });

  it('an NPC who was never recruited does NOT appear in the COMPANIONS block, even if otherwise alive and well', () => {
    const engine = makeGame();
    engine.store.state.entities['player'].resources.hp = 0;
    const end = evaluateSessionEnd(engine)!;
    const screen = renderSessionEnd(end, engine.world);
    expect(screen).not.toContain('COMPANIONS');
  });

  // F-P9-001: renderSessionEnd used to pass buildFinaleOutline a hardcoded
  // `districts: []`, even after buildEndgameInputs started deriving live
  // districtEconomies (F-d0b5edb5) — the finale's DISTRICTS section never
  // rendered for any played session. starter-fantasy wires two districts via
  // buildWorldStack (chapel-grounds, crypt-depths — see "a live starter
  // engine seeds economy-core" above); a session ending with no district-tick
  // fired shows district-core's DEFAULT_METRICS.stability (5, untouched) and
  // economy-core's baseline 'normal' tone (neither district's starter tags
  // push any supply past a scarcity/surplus threshold). RED-PROOF: before
  // this wire, the DISTRICTS section never appeared at all.
  it("F-P9-001: a played session's finale DISTRICTS section renders real district economy data", () => {
    const engine = makeGame();
    engine.store.state.entities['player'].resources.hp = 0; // end the session
    const end = evaluateSessionEnd(engine)!;
    const screen = renderSessionEnd(end, engine.world);

    expect(screen).toContain('DISTRICTS');
    expect(screen).toContain('Chapel Grounds: stability 5, normal');
    expect(screen).toContain('Crypt Depths: stability 5, normal');
  });

  it('journalFromEventLog records kills, first-visit discoveries, and unlocks with bounded duplicates', () => {
    const engine = makeGame();
    engine.submitAction('move', { targetIds: ['chapel-nave'] });
    engine.submitAction('move', { targetIds: ['chapel-entrance'] });
    engine.submitAction('move', { targetIds: ['chapel-nave'] }); // revisit — no second discovery
    engine.store.emitEvent('combat.entity.defeated', { entityId: 'ash-ghoul' }, { actorId: 'player' });
    engine.store.emitEvent('progression.node.unlocked', { treeId: 'combat-mastery', nodeId: 'toughened' }, { actorId: 'player' });

    const journal = journalFromEventLog(engine.world);
    const kills = journal.query({ category: 'kill' });
    const discoveries = journal.query({ category: 'discovery' });
    const actions = journal.query({ category: 'action' });

    expect(kills).toHaveLength(1);
    expect(kills[0].targetId).toBe('ash-ghoul');
    // chapel-nave + chapel-entrance discovered once each, revisit ignored.
    expect(discoveries.map((d) => d.zoneId).sort()).toEqual(['chapel-entrance', 'chapel-nave']);
    expect(actions.some((a) => a.description.includes('toughened'))).toBe(true);
  });
});

// T0-finale-stats — the tally is derived ONLY from events the engine emits
// (the formatEventLine vocabulary): combat.damage.applied attribution,
// combat.entity.defeated hostility, ability.used / progression.node.unlocked
// actorship, DoT ticks. XP accrual has no event (progression-core addCurrency
// is silent), so xpEarned reconstructs earned = balance + unlock spends.
describe('computeSessionStats (T0-finale-stats)', () => {
  /** Bare engine — no module listeners, so emitted events are exactly the log. */
  function bareEngine() {
    const engine = new Engine({
      manifest: { id: 't', title: 't', version: '0', engineVersion: '0', ruleset: 't', modules: [], contentPacks: [] },
      seed: 1,
    });
    engine.store.state.zones = { z: { id: 'z', roomId: 'r', name: 'Z', tags: [], neighbors: [] } };
    engine.store.state.locationId = 'z';
    engine.store.addEntity({
      id: 'p', blueprintId: 'p', type: 'player', name: 'P', tags: ['player'],
      stats: {}, resources: { hp: 5 }, statuses: [], zoneId: 'z',
    });
    engine.store.addEntity({
      id: 'ghoul', blueprintId: 'e', type: 'enemy', name: 'Ghoul', tags: ['enemy'],
      stats: {}, resources: { hp: 0 }, statuses: [], zoneId: 'z',
    });
    engine.store.addEntity({
      id: 'friend', blueprintId: 'n', type: 'npc', name: 'Friend', tags: ['npc', 'companion'],
      stats: {}, resources: { hp: 0 }, statuses: [], zoneId: 'z',
    });
    engine.store.state.playerId = 'p';
    return engine;
  }

  const tree: ProgressionTreeDefinition = {
    id: 'mastery',
    name: 'Mastery',
    currency: 'xp',
    nodes: [{ id: 'toughened', name: 'Toughened', cost: 5, effects: [] }],
  };

  it('tallies a synthetic event log exactly', () => {
    const engine = bareEngine();
    const emit = engine.store.emitEvent.bind(engine.store);

    emit('combat.damage.applied', { attackerId: 'p', targetId: 'ghoul', damage: 4 }, { actorId: 'p' });
    emit('combat.damage.applied', { attackerId: 'ghoul', targetId: 'p', damage: 3 }, { actorId: 'ghoul' });
    emit('status.periodic.damage', { statusId: 'burning', amount: 2 }, { actorId: 'p' });
    emit('status.periodic.damage', { statusId: 'burning', amount: 9 }, { actorId: 'ghoul' }); // not the player
    emit('combat.entity.defeated', { entityId: 'ghoul', entityName: 'Ghoul' }, { actorId: 'p' });
    emit('combat.entity.defeated', { entityId: 'friend', entityName: 'Friend' }, { actorId: 'ghoul' }); // companion — not an enemy
    emit('combat.entity.defeated', { entityId: 'p', entityName: 'P' }, { actorId: 'ghoul' }); // the player — never a kill
    emit('ability.used', { abilityId: 'smite', abilityName: 'Smite' }, { actorId: 'p' });
    emit('ability.used', { abilityId: 'howl', abilityName: 'Howl' }, { actorId: 'ghoul' }); // enemy ability
    emit('progression.node.unlocked', { treeId: 'mastery', nodeId: 'toughened', effects: [] }, { actorId: 'p' });

    engine.store.state.meta.tick = 12;
    // Post-spend balance: 7 banked. Earned = 7 + the 5 the unlock cost.
    engine.store.state.modules['progression-core'] = { currencies: { p: { xp: 7 } }, unlocked: {} };

    expect(computeSessionStats(engine.world, [tree])).toEqual({
      rounds: 12,
      enemiesDefeated: 1,
      damageDealt: 4,
      damageTaken: 5,
      abilitiesUsed: 1,
      xpEarned: 12,
      unlocks: 1,
    });
  });

  it('a defeated entity already GONE from world state still counts as a kill', () => {
    const engine = bareEngine();
    engine.store.emitEvent('combat.entity.defeated', { entityId: 'long-gone', entityName: 'Gone' }, { actorId: 'p' });
    expect(computeSessionStats(engine.world).enemiesDefeated).toBe(1);
  });

  it('an empty log yields all-zero stats and renders gracefully', () => {
    const engine = bareEngine();
    const stats = computeSessionStats(engine.world);
    expect(stats).toEqual({
      rounds: 0,
      enemiesDefeated: 0,
      damageDealt: 0,
      damageTaken: 0,
      abilitiesUsed: 0,
      xpEarned: 0,
      unlocks: 0,
    });
    const block = renderSessionStats(stats);
    expect(block).toContain('THE RUN IN NUMBERS');
    expect(block).toContain('Rounds Survived: 0');
    expect(block).toContain('XP Earned: 0');
  });

  it('without trees, XP falls back to the raw balance under the default currency', () => {
    const engine = bareEngine();
    engine.store.state.modules['progression-core'] = { currencies: { p: { xp: 9 } }, unlocked: {} };
    expect(computeSessionStats(engine.world).xpEarned).toBe(9);
  });
});
