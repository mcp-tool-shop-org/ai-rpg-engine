// strategic-map contract tests (PM-2 coverage)
//
// Read-only aggregation for director/player views. Pins the district/faction
// view derivation, hot-rumor and hot-goods list determinism (PM-6), and the
// formatting surfaces.

import { describe, it, expect } from 'vitest';
import type { WorldState } from '@ai-rpg-engine/core';
import type { PlayerRumor } from './player-rumor.js';
import { createDistrictEconomy } from './economy-core.js';
import type { DistrictEconomy } from './economy-core.js';
import {
  buildStrategicMap,
  formatStrategicMapForDirector,
  formatStrategicMapForPlayer,
} from './strategic-map.js';

function makeWorld(opts?: {
  factions?: Record<string, { alertLevel: number; cohesion: number }>;
  districts?: Record<string, { controllingFaction?: string; stability?: number; alertPressure?: number; surveillance?: number }>;
}): WorldState {
  const factionCognition: Record<string, unknown> = {};
  const factions: Record<string, unknown> = {};
  for (const [id, cog] of Object.entries(opts?.factions ?? {})) {
    factionCognition[id] = { beliefs: [], alertLevel: cog.alertLevel, cohesion: cog.cohesion };
    factions[id] = { id, name: id, reputation: 0, disposition: 'neutral' };
  }

  const districts: Record<string, unknown> = {};
  const definitions: Record<string, unknown> = {};
  for (const [id, d] of Object.entries(opts?.districts ?? {})) {
    definitions[id] = { id, name: `The ${id}`, zoneIds: [], tags: [], controllingFaction: d.controllingFaction };
    districts[id] = {
      alertPressure: d.alertPressure ?? 0,
      rumorDensity: 0,
      intruderLikelihood: 0,
      surveillance: d.surveillance ?? 0,
      stability: d.stability ?? 5,
      commerce: 50,
      morale: 50,
      lastUpdateTick: 0,
      eventCount: 0,
    };
  }

  return {
    meta: { seed: 1, tick: 0, version: '1' },
    playerId: 'player',
    locationId: 'z1',
    entities: {},
    zones: {},
    quests: {},
    factions,
    globals: {},
    modules: {
      'faction-cognition': { factionCognition, membership: {}, factionMembers: {} },
      'district-core': { districts, zoneToDistrict: {}, definitions },
    },
    eventLog: [],
    pending: [],
  } as unknown as WorldState;
}

function makeRumor(id: string, spreadTo: string[], overrides?: Partial<PlayerRumor>): PlayerRumor {
  return {
    id,
    claim: `claim-${id}`,
    subjectDescriptor: 'the outsider',
    sourceEvent: 'test',
    confidence: 0.8,
    distortion: 0,
    mutationCount: 0,
    valence: 'heroic',
    spreadTo,
    originTick: 0,
    ...overrides,
  } as PlayerRumor;
}

describe('buildStrategicMap — districts', () => {
  it('derives hotspot tags from metric thresholds', () => {
    const world = makeWorld({
      districts: {
        slums: { stability: 10, alertPressure: 40, surveillance: 50 },
        garden: { stability: 40 },
      },
    });
    const map = buildStrategicMap(world, [], [], [], []);

    const slums = map.districts.find((d) => d.districtId === 'slums')!;
    expect(slums.hotspotTags).toEqual(expect.arrayContaining(['unstable', 'high-alert', 'heavily-watched']));
    const garden = map.districts.find((d) => d.districtId === 'garden')!;
    expect(garden.hotspotTags).toEqual([]);
  });

  it('marks the controlling faction as dominant presence', () => {
    const world = makeWorld({
      factions: { watch: { alertLevel: 0, cohesion: 0.8 } },
      districts: { market: { controllingFaction: 'watch' } },
    });
    const map = buildStrategicMap(world, [], [], [], []);
    expect(map.districts[0].factionPresence).toEqual([{ factionId: 'watch', strength: 'dominant' }]);
  });
});

describe('buildStrategicMap — factions', () => {
  it('derives vulnerability from cohesion and alert thresholds', () => {
    const world = makeWorld({
      factions: {
        fractured: { alertLevel: 10, cohesion: 0.3 },   // cohesion < 0.4
        strained: { alertLevel: 75, cohesion: 0.8 },    // alert > 70
        solid: { alertLevel: 30, cohesion: 0.8 },       // neither
      },
    });
    const map = buildStrategicMap(world, [], [], [], []);
    const byId = Object.fromEntries(map.factions.map((f) => [f.factionId, f]));

    expect(byId.fractured.vulnerability).toBe('low cohesion — internal fractures');
    expect(byId.strained.vulnerability).toBe('overextended — alert fatigue');
    expect(byId.solid.vulnerability).toBeUndefined();
  });

  it('derives hostile stance from deep-negative reputation', () => {
    const world = makeWorld({ factions: { watch: { alertLevel: 10, cohesion: 0.8 } } });
    const map = buildStrategicMap(world, [], [], [{ factionId: 'watch', value: -60 }], []);
    expect(map.factions[0].stance).toBe('hostile');
    expect(map.factions[0].playerReputation).toBe(-60);
  });

  it('surfaces recent faction actions on the view', () => {
    const world = makeWorld({ factions: { watch: { alertLevel: 10, cohesion: 0.8 } } });
    const map = buildStrategicMap(world, [], [], [], [{
      action: { factionId: 'watch', verb: 'patrol', description: 'watch increases patrols' },
      effects: [],
      narratorHint: '',
    }]);
    expect(map.factions[0].recentActions).toEqual(['watch increases patrols']);
  });
});

describe('buildStrategicMap — hot lists (PM-6 determinism)', () => {
  it('hotRumors: top 5 by spread, ties broken by rumor id regardless of input order', () => {
    const rumors = [
      makeRumor('r-c', ['a', 'b']),
      makeRumor('r-a', ['a', 'b']),
      makeRumor('r-b', ['a', 'b']),
      makeRumor('r-low', []),
      makeRumor('r-filtered', ['a', 'b', 'c'], { confidence: 0.1 }), // below confidence gate
    ];
    const world = makeWorld();

    const fwd = buildStrategicMap(world, rumors, [], [], []);
    const rev = buildStrategicMap(world, [...rumors].reverse(), [], [], []);

    // All three ties order by id: r-a, r-b, r-c — in BOTH input orders.
    expect(fwd.hotRumors.map((r) => r.claim)).toEqual(['claim-r-a', 'claim-r-b', 'claim-r-c', 'claim-r-low']);
    expect(rev.hotRumors).toEqual(fwd.hotRumors);
    // The confidence-gated rumor never appears despite the widest spread.
    expect(fwd.hotRumors.some((r) => r.claim === 'claim-r-filtered')).toBe(false);
  });

  it('hotGoods: categories and district lists in stable sorted order regardless of Map insertion', () => {
    const world = makeWorld({
      districts: { docks: {}, market: {} },
    });
    // zombie economy: food is the scarcest category (20).
    const e1 = createDistrictEconomy('zombie');
    const e2 = createDistrictEconomy('zombie');

    const fwd = buildStrategicMap(world, [], [], [], [], new Map<string, DistrictEconomy>([['market', e1], ['docks', e2]]));
    const rev = buildStrategicMap(world, [], [], [], [], new Map<string, DistrictEconomy>([['docks', e2], ['market', e1]]));

    expect(fwd.hotGoods).toEqual(rev.hotGoods);
    expect(fwd.hotGoods).toEqual([{ category: 'food', reason: 'scarce in docks, market' }]);
  });

  it('two identical calls produce a byte-identical map', () => {
    const world = makeWorld({
      factions: { watch: { alertLevel: 75, cohesion: 0.3 } },
      districts: { slums: { stability: 10, alertPressure: 40 } },
    });
    const rumors = [makeRumor('r1', ['watch'])];
    const a = buildStrategicMap(world, rumors, [], [{ factionId: 'watch', value: -20 }], []);
    const b = buildStrategicMap(world, rumors, [], [{ factionId: 'watch', value: -20 }], []);
    expect(a).toEqual(b);
  });
});

describe('formatting', () => {
  it('director view renders districts, factions, rumors, and hot goods', () => {
    const world = makeWorld({
      factions: { watch: { alertLevel: 75, cohesion: 0.3 } },
      districts: { slums: { stability: 10, controllingFaction: 'watch' } },
    });
    const map = buildStrategicMap(
      world,
      [makeRumor('r1', ['watch'])],
      [],
      [],
      [],
      new Map([['slums', createDistrictEconomy('zombie')]]),
    );
    const text = formatStrategicMapForDirector(map);
    expect(text).toContain('STRATEGIC MAP');
    expect(text).toContain('The slums');
    expect(text).toContain('watch');
    expect(text).toContain('HOT RUMORS');
    expect(text).toContain('HOT GOODS');
  });

  it('player view surfaces the hot district and the alerted faction', () => {
    const world = makeWorld({
      factions: { watch: { alertLevel: 75, cohesion: 0.8 } },
      districts: { slums: { stability: 10 } },
    });
    const map = buildStrategicMap(world, [], [], [], []);
    const line = formatStrategicMapForPlayer(map);
    expect(line).toContain('The slums');
    expect(line).toContain('watch');
  });
});
