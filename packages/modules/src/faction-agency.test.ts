// faction-agency contract tests (PM-2 coverage)
//
// "Factions as strategic actors" — threshold-dense goal derivation, staggered
// deterministic action selection, and the verb → effects table. Pins the
// documented thresholds, the unknown-verb loudness (PM-5), and ordering
// determinism (PM-6: goal tie-break by id, action order by factionId).

import { describe, it, expect } from 'vitest';
import type { WorldState, EntityState } from '@ai-rpg-engine/core';
import type { FactionAction, FactionActionVerb, FactionProfile } from './faction-agency.js';
import {
  buildFactionProfile,
  evaluateFactionActions,
  resolveFactionAction,
  runFactionAgencyTick,
  formatFactionProfilesForDirector,
} from './faction-agency.js';
import { createDistrictEconomy } from './economy-core.js';
import type { DistrictEconomy } from './economy-core.js';

// --- World builder -----------------------------------------------------------

type CognitionSeed = { alertLevel: number; cohesion: number };

function makeMember(id: string, hp: number): EntityState {
  return {
    id,
    blueprintId: id,
    type: 'npc',
    name: id,
    tags: [],
    stats: {},
    resources: { hp },
    statuses: [],
    zoneId: 'z1',
  };
}

function makeWorld(opts: {
  factions: Record<string, CognitionSeed>;
  members?: Record<string, string[]>;
  districts?: Record<string, { controllingFaction?: string; alertPressure?: number; surveillance?: number; commerce?: number }>;
  entities?: EntityState[];
}): WorldState {
  const entities: Record<string, EntityState> = {};
  for (const e of opts.entities ?? []) entities[e.id] = e;

  const factionCognition: Record<string, { beliefs: never[]; alertLevel: number; cohesion: number }> = {};
  for (const [id, cog] of Object.entries(opts.factions)) {
    factionCognition[id] = { beliefs: [], alertLevel: cog.alertLevel, cohesion: cog.cohesion };
  }

  const districts: Record<string, unknown> = {};
  const definitions: Record<string, unknown> = {};
  for (const [id, d] of Object.entries(opts.districts ?? {})) {
    definitions[id] = { id, name: id, zoneIds: [], tags: [], controllingFaction: d.controllingFaction };
    districts[id] = {
      alertPressure: d.alertPressure ?? 0,
      rumorDensity: 0,
      intruderLikelihood: 0,
      surveillance: d.surveillance ?? 0,
      stability: 5,
      commerce: d.commerce ?? 50,
      morale: 50,
      lastUpdateTick: 0,
      eventCount: 0,
    };
  }

  const factions: WorldState['factions'] = {};
  for (const id of Object.keys(opts.factions)) {
    factions[id] = { id, name: id, reputation: 0, disposition: 'neutral' };
  }

  return {
    meta: { seed: 1, tick: 0, version: '1' },
    playerId: 'player',
    locationId: 'z1',
    entities,
    zones: {},
    quests: {},
    factions,
    globals: {},
    modules: {
      'faction-cognition': {
        factionCognition,
        membership: {},
        factionMembers: opts.members ?? {},
      },
      'district-core': { districts, zoneToDistrict: {}, definitions },
    },
    eventLog: [],
    pending: [],
  } as unknown as WorldState;
}

// --- buildFactionProfile ------------------------------------------------------

describe('buildFactionProfile goal thresholds', () => {
  it('derives recruit / retaliate / investigate goals and caps at MAX_GOALS=3 by priority', () => {
    const world = makeWorld({
      factions: { watch: { alertLevel: 60, cohesion: 0.4 }, guild: { alertLevel: 45, cohesion: 0.8 } },
      members: { watch: ['g1', 'g2'] },
      entities: [makeMember('g1', 10), makeMember('g2', 0)], // 50% losses
    });

    const profile = buildFactionProfile('watch', world, -35, []);

    expect(profile.memberCount).toBe(1);
    // riskTolerance = cohesion*0.6 + (1 - alert/100)*0.4 = 0.24 + 0.16
    expect(profile.riskTolerance).toBeCloseTo(0.4, 10);
    // rep ≤ -30 and alert ≥ 30 → rivals with alert ≥ 40 tracked
    expect(profile.enemyFactions).toEqual(['guild']);

    // Candidate goals: retaliate (0.8), recruit (0.6), investigate (0.5),
    // hoard (0.48), spread-rumor (0.4) → top 3 survive, priority-ordered.
    expect(profile.goals).toHaveLength(3);
    expect(profile.goals.map((g) => g.verb)).toEqual(['retaliate', 'recruit', 'investigate']);
    expect(profile.goals[0].priority).toBeCloseTo(0.8, 10);
    expect(profile.goals[1].priority).toBeCloseTo(0.6, 10);
  });

  it('does not derive hostility goals for a faction in good standing', () => {
    const world = makeWorld({ factions: { watch: { alertLevel: 10, cohesion: 0.9 } } });
    const profile = buildFactionProfile('watch', world, 25, []);
    expect(profile.goals).toEqual([]);
    expect(profile.enemyFactions).toEqual([]);
  });

  it('skips retaliate when a retaliation pressure already exists', () => {
    const world = makeWorld({ factions: { watch: { alertLevel: 60, cohesion: 0.9 } } });
    const profile = buildFactionProfile('watch', world, -35, [{
      id: 'p1', kind: 'revenge-attempt', sourceFactionId: 'watch', description: '',
      triggeredBy: '', urgency: 0.6, visibility: 'known', turnsRemaining: 3,
      potentialOutcomes: [], tags: [], createdAtTick: 0,
    }]);
    expect(profile.goals.some((g) => g.verb === 'retaliate')).toBe(false);
  });

  it('patrol vs fortify keys off district surveillance when on alert', () => {
    const fortifyWorld = makeWorld({
      factions: { watch: { alertLevel: 10, cohesion: 0.9 } },
      districts: { market: { controllingFaction: 'watch', alertPressure: 35, surveillance: 10 } },
    });
    expect(buildFactionProfile('watch', fortifyWorld, 0, []).goals.map((g) => g.verb)).toContain('fortify');

    const patrolWorld = makeWorld({
      factions: { watch: { alertLevel: 10, cohesion: 0.9 } },
      districts: { market: { controllingFaction: 'watch', alertPressure: 35, surveillance: 50 } },
    });
    expect(buildFactionProfile('watch', patrolWorld, 0, []).goals.map((g) => g.verb)).toContain('patrol');
  });

  it('breaks equal-priority goal ties by goal id — stable order (PM-6)', () => {
    // investigate (0.5) and patrol (0.5) tie; 'watch-investigate' < 'watch-patrol-market'.
    const world = makeWorld({
      factions: { watch: { alertLevel: 40, cohesion: 0.9 } },
      districts: { market: { controllingFaction: 'watch', alertPressure: 35, surveillance: 50 } },
    });
    const profile = buildFactionProfile('watch', world, -25, []);
    const half = profile.goals.filter((g) => g.priority === 0.5);
    expect(half.map((g) => g.id)).toEqual(['watch-investigate', 'watch-patrol-market']);

    const again = buildFactionProfile('watch', world, -25, []);
    expect(again.goals).toEqual(profile.goals);
  });

  it('derives economy goals: scarce controlled district → open-trade (high cohesion) or smuggle', () => {
    const world = makeWorld({
      factions: { watch: { alertLevel: 10, cohesion: 0.7 }, rats: { alertLevel: 10, cohesion: 0.3 } },
      districts: {
        market: { controllingFaction: 'watch' },
        docks: { controllingFaction: 'rats' },
      },
    });
    // zombie genre: food 20 (< 25) → supply goal fires.
    const economies = new Map<string, DistrictEconomy>([
      ['market', createDistrictEconomy('zombie')],
      ['docks', createDistrictEconomy('zombie')],
    ]);

    const trader = buildFactionProfile('watch', world, 0, [], economies);
    expect(trader.goals.some((g) => g.verb === 'open-trade')).toBe(true); // cohesion > 0.6

    const smuggler = buildFactionProfile('rats', world, 0, [], economies);
    expect(smuggler.goals.some((g) => g.verb === 'smuggle')).toBe(true); // cohesion ≤ 0.6
  });
});

// --- evaluateFactionActions ---------------------------------------------------

describe('evaluateFactionActions', () => {
  function makeProfile(factionId: string, verb: FactionActionVerb = 'hoard'): FactionProfile {
    return {
      factionId,
      goals: [{ id: `${factionId}-${verb}`, label: verb, priority: 0.6, verb }],
      riskTolerance: 0.5,
      memberCount: 3,
      controlledDistricts: [],
      enemyFactions: [],
      alliedFactions: [],
    };
  }

  /** First tick in [0, limit) where the faction's stagger allows it to act. */
  function findActingTick(profile: FactionProfile, limit = 60): number {
    for (let t = 0; t < limit; t++) {
      if (evaluateFactionActions([profile], t).length > 0) return t;
    }
    throw new Error(`no acting tick found for ${profile.factionId} in ${limit} ticks`);
  }

  it('a goal-holding faction acts on some tick within a short window (stagger)', () => {
    const tick = findActingTick(makeProfile('watch'));
    const actions = evaluateFactionActions([makeProfile('watch')], tick);
    expect(actions).toHaveLength(1);
    expect(actions[0].verb).toBe('hoard');
    expect(actions[0].description.length).toBeGreaterThan(0);
  });

  it('is deterministic — same profiles + tick produce identical actions', () => {
    const tick = findActingTick(makeProfile('watch'));
    const a = evaluateFactionActions([makeProfile('watch'), makeProfile('guild')], tick);
    const b = evaluateFactionActions([makeProfile('watch'), makeProfile('guild')], tick);
    expect(a).toEqual(b);
  });

  it('idle factions (no goals) never act', () => {
    const idle: FactionProfile = { ...makeProfile('watch'), goals: [] };
    for (let t = 0; t < 10; t++) {
      expect(evaluateFactionActions([idle], t)).toEqual([]);
    }
  });

  it('caps global actions per turn at maxGlobal', () => {
    // Find a tick where BOTH factions would act, then cap to 1.
    const a = makeProfile('a-guild');
    const b = makeProfile('b-watch');
    let common = -1;
    for (let t = 0; t < 300; t++) {
      if (evaluateFactionActions([a], t).length > 0 && evaluateFactionActions([b], t).length > 0) {
        common = t;
        break;
      }
    }
    expect(common).toBeGreaterThanOrEqual(0);
    expect(evaluateFactionActions([a, b], common, 1)).toHaveLength(1);
    expect(evaluateFactionActions([a, b], common, 0)).toHaveLength(0);
  });

  it('evaluation order is pinned by factionId, not caller array order (PM-6)', () => {
    const a = makeProfile('a-guild');
    const b = makeProfile('b-watch');
    let common = -1;
    for (let t = 0; t < 300; t++) {
      if (evaluateFactionActions([a], t).length > 0 && evaluateFactionActions([b], t).length > 0) {
        common = t;
        break;
      }
    }
    expect(common).toBeGreaterThanOrEqual(0);
    // With one slot, 'a-guild' (lower factionId) must win in BOTH input orders.
    const fwd = evaluateFactionActions([a, b], common, 1);
    const rev = evaluateFactionActions([b, a], common, 1);
    expect(fwd).toEqual(rev);
    expect(fwd[0].factionId).toBe('a-guild');
  });
});

// --- resolveFactionAction -----------------------------------------------------

describe('resolveFactionAction effects table', () => {
  const ALL_VERBS: FactionActionVerb[] = [
    'recruit', 'investigate', 'retaliate', 'fortify', 'bribe', 'spread-rumor',
    'sanction', 'patrol', 'smuggle', 'hoard', 'declare-claim', 'blockade',
    'raid-supply', 'open-trade',
  ];

  it('every known verb resolves with a narrator hint, effects, and no warning', () => {
    for (const verb of ALL_VERBS) {
      const result = resolveFactionAction({
        factionId: 'watch', verb, targetDistrictId: 'market',
        description: 'test',
      });
      expect(result.narratorHint.length, `verb ${verb} hint`).toBeGreaterThan(0);
      expect(result.effects.length, `verb ${verb} effects`).toBeGreaterThan(0);
      expect(result.warning, `verb ${verb} warning`).toBeUndefined();
    }
  });

  it('recruit: member +1, cohesion +0.05, district morale +2', () => {
    const result = resolveFactionAction({
      factionId: 'watch', verb: 'recruit', targetDistrictId: 'market', description: '',
    });
    expect(result.effects).toContainEqual({ type: 'member-count', factionId: 'watch', delta: 1 });
    expect(result.effects).toContainEqual({ type: 'cohesion', factionId: 'watch', delta: 0.05 });
    expect(result.effects).toContainEqual({ type: 'district-metric', districtId: 'market', metric: 'morale', delta: 2 });
  });

  it('retaliate: spawns a revenge-attempt pressure and raises alert', () => {
    const result = resolveFactionAction({ factionId: 'watch', verb: 'retaliate', description: '' });
    const pressure = result.effects.find((e) => e.type === 'pressure');
    expect(pressure).toMatchObject({ kind: 'revenge-attempt', sourceFactionId: 'watch', urgency: 0.6 });
    expect(result.effects).toContainEqual({ type: 'alert', factionId: 'watch', delta: 15 });
  });

  it('blockade: commerce -8 plus food/luxuries economy shifts', () => {
    const result = resolveFactionAction({
      factionId: 'watch', verb: 'blockade', targetDistrictId: 'docks', description: '',
    });
    expect(result.effects).toContainEqual({ type: 'district-metric', districtId: 'docks', metric: 'commerce', delta: -8 });
    expect(result.effects).toContainEqual({ type: 'economy-shift', districtId: 'docks', category: 'food', delta: -10, cause: 'blockade' });
    expect(result.effects).toContainEqual({ type: 'economy-shift', districtId: 'docks', category: 'luxuries', delta: -8, cause: 'blockade' });
  });

  it('an unknown verb resolves LOUDLY: structured warning, zero effects (PM-5)', () => {
    const rogue = {
      factionId: 'watch',
      verb: 'annex-region' as FactionActionVerb, // extended enum, no table arm
      description: 'test',
    } satisfies FactionAction;

    const result = resolveFactionAction(rogue);
    expect(result.effects).toEqual([]);
    expect(result.warning).toBeDefined();
    expect(result.warning).toContain("'annex-region'");
    expect(result.warning).toContain('resolveFactionAction');
    expect(result.narratorHint.length).toBeGreaterThan(0);
  });
});

// --- runFactionAgencyTick + formatting -----------------------------------------

describe('runFactionAgencyTick', () => {
  it('runs end-to-end deterministically over a hostile world', () => {
    const world = makeWorld({
      factions: { watch: { alertLevel: 60, cohesion: 0.4 } },
      members: { watch: ['g1', 'g2'] },
      entities: [makeMember('g1', 10), makeMember('g2', 0)],
    });
    const reps = [{ factionId: 'watch', value: -35 }];

    // Across a stagger window the faction acts at least once, and every
    // resolved action carries effects + a hint (verbs come from real goals).
    let sawAction = false;
    for (let t = 0; t < 6; t++) {
      const a = runFactionAgencyTick(world, reps, [], t);
      const b = runFactionAgencyTick(world, reps, [], t);
      expect(a).toEqual(b);
      for (const result of a) {
        sawAction = true;
        expect(result.effects.length).toBeGreaterThan(0);
        expect(result.warning).toBeUndefined();
      }
    }
    expect(sawAction).toBe(true);
  });

  it('returns [] for a world without factions', () => {
    const world = makeWorld({ factions: {} });
    expect(runFactionAgencyTick(world, [], [], 0)).toEqual([]);
  });

  it('director formatting includes goals and risk tolerance', () => {
    const world = makeWorld({
      factions: { watch: { alertLevel: 60, cohesion: 0.4 } },
    });
    const profile = buildFactionProfile('watch', world, -35, []);
    const text = formatFactionProfilesForDirector([profile], []);
    expect(text).toContain('watch');
    expect(text).toContain('Risk tolerance');
    expect(text).toContain('Strike back');
  });
});
