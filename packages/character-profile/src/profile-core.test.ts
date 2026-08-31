// profile-core proof — the runtime consumer loop (F-1b1c077f).
//
// Pin: a played kill moves progression.xp; an active injury changes a live
// damage result. Does not re-open F-482da85d's deserialize element checks.

import { describe, it, expect, beforeEach } from 'vitest';
import { Engine } from '@ai-rpg-engine/core';
import type { EntityState, GameManifest, ZoneState } from '@ai-rpg-engine/core';
import {
  statusCore,
  applyStatus,
  removeStatus,
  registerStatusDefinitions,
  clearStatusRegistry,
  effectiveStat,
  createCombatCore,
} from '@ai-rpg-engine/modules';
import { createProfile } from './profile.js';
import {
  createProfileCore,
  getEntityProfile,
  getProfileState,
  injuryStatusId,
  PROFILE_STATE_KEY,
  DEFAULT_XP_PER_KILL,
  type ProfileStatusOps,
} from './profile-core.js';
import type { CharacterBuild } from '@ai-rpg-engine/character-creation';

const statusOps: ProfileStatusOps = {
  registerDefinitions: registerStatusDefinitions,
  apply: applyStatus,
  remove: removeStatus,
};

const testBuild: CharacterBuild = {
  name: 'Aldric',
  archetypeId: 'penitent-knight',
  backgroundId: 'oath-breaker',
  traitIds: ['iron-frame'],
};

const manifest: GameManifest = {
  id: 'profile-proof',
  title: 'Profile Proof',
  version: '0.0.1',
  engineVersion: '0.1.0',
  ruleset: 'minimal',
  modules: ['status-core', 'combat-core', 'character-profile-core'],
  contentPacks: [],
};

function makePlayer(): EntityState {
  return {
    id: 'player',
    blueprintId: 'penitent-knight',
    type: 'player',
    name: 'Aldric',
    tags: ['player'],
    stats: { vigor: 6, instinct: 4, will: 3 },
    resources: { hp: 25, maxHp: 25, stamina: 10 },
    statuses: [],
    inventory: [],
    zoneId: 'cell',
    custom: { archetypeId: 'penitent-knight', backgroundId: 'oath-breaker' },
    relations: { chapel: 5 },
  };
}

function makeEngine() {
  const profile = createProfile(testBuild, { vigor: 6, instinct: 4, will: 3 }, { hp: 25, maxHp: 25 }, ['player'], 'fantasy', 'player');
  const engine = new Engine({
    manifest,
    seed: 7,
    modules: [
      statusCore,
      createCombatCore({
        hitChance: () => 100,
        damage: (attacker, _target, world) => effectiveStat(attacker, 'vigor', world, 0),
      }),
      createProfileCore({ statuses: statusOps, packId: 'fantasy', profiles: { player: profile } }),
    ],
  });
  const zone: ZoneState = { id: 'cell', roomId: 'cell', name: 'Cell', tags: [], neighbors: [] };
  engine.store.addZone(zone);
  engine.store.addEntity(makePlayer());
  engine.store.addEntity({
    id: 'foe',
    blueprintId: 'foe',
    type: 'npc',
    name: 'Ash Ghoul',
    tags: ['enemy'],
    stats: { vigor: 1, instinct: 1, will: 1 },
    resources: { hp: 20, maxHp: 20 },
    statuses: [],
    zoneId: 'cell',
  });
  engine.store.state.playerId = 'player';
  engine.store.state.locationId = 'cell';
  return engine;
}

function defeat(engine: Engine, foeId: string, foeName: string, tick: number, killerId = 'player'): void {
  engine.store.recordEvent({
    id: '',
    tick,
    type: 'combat.entity.defeated',
    payload: {
      entityId: foeId,
      entityName: foeName,
      defeatedBy: killerId,
      defeatedByName: 'Aldric',
      defeatZoneId: 'cell',
      wasInterceptor: false,
    },
  });
}

beforeEach(() => {
  clearStatusRegistry();
});

describe('createProfileCore — registration', () => {
  it('registers the persisted namespace default', () => {
    const engine = makeEngine();
    const state = engine.world.modules[PROFILE_STATE_KEY];
    expect(state).toEqual({ profiles: {} });
  });
});

describe('F-1b1c077f: a played kill moves progression.xp', () => {
  it('grants XP on combat.entity.defeated', () => {
    const engine = makeEngine();
    expect(getEntityProfile(engine.world, 'player')).toBeUndefined();

    defeat(engine, 'foe', 'Ash Ghoul', 1);

    const profile = getEntityProfile(engine.world, 'player');
    expect(profile).toBeDefined();
    expect(profile!.progression.xp).toBe(DEFAULT_XP_PER_KILL);
    expect(profile!.progression.xp).toBeGreaterThan(0);
  });

  it('round-trips the profile through Engine.serialize', () => {
    const engine = makeEngine();
    defeat(engine, 'foe', 'Ash Ghoul', 1);
    const saved = engine.serialize();

    clearStatusRegistry();
    const restored = Engine.deserialize(saved, {
      modules: [
        statusCore,
        createCombatCore(),
        createProfileCore({ statuses: statusOps, packId: 'fantasy' }),
      ],
    });
    expect(getEntityProfile(restored.world, 'player')?.progression.xp).toBe(DEFAULT_XP_PER_KILL);
    expect(getProfileState(restored.world).profiles['player']?.progression.xp).toBe(DEFAULT_XP_PER_KILL);
  });
});

describe('F-1b1c077f: an active injury changes a live damage result', () => {
  it('defeat-survived applies injured-<id> and drops effectiveStat used by combat', () => {
    const engine = makeEngine();
    const player = engine.world.entities['player'];
    const baseline = effectiveStat(player, 'vigor', engine.world, 0);
    expect(baseline).toBe(6);

    engine.store.recordEvent({
      id: '',
      tick: 1,
      type: 'combat.defeat.survived',
      payload: {
        entityId: 'player',
        entityName: 'Aldric',
        severity: 'critical',
        injuryName: 'Broken Arm',
        statPenalties: { vigor: -2 },
      },
    });

    const profile = getEntityProfile(engine.world, 'player');
    expect(profile).toBeDefined();
    expect(profile!.injuries).toHaveLength(1);
    expect(profile!.injuries[0]!.name).toBe('Broken Arm');
    const injuryId = profile!.injuries[0]!.id;
    expect(player.statuses.some((s) => s.statusId === injuryStatusId(injuryId))).toBe(true);
    expect(effectiveStat(player, 'vigor', engine.world, 0)).toBe(4);
  });

  it('the vigor penalty lowers live attack damage vs the uninjured baseline', () => {
    const healthy = makeEngine();
    healthy.submitAction('attack', { targetIds: ['foe'] });
    const healthyHp = healthy.world.entities['foe'].resources.hp ?? 0;

    const wounded = makeEngine();
    wounded.store.recordEvent({
      id: '',
      tick: 0,
      type: 'combat.aftermath.injury',
      payload: {
        entityId: 'player',
        severity: 'critical',
        statPenalties: { vigor: -2 },
      },
    });
    expect(effectiveStat(wounded.world.entities['player'], 'vigor', wounded.world, 0)).toBe(4);
    wounded.submitAction('attack', { targetIds: ['foe'] });
    const woundedHp = wounded.world.entities['foe'].resources.hp ?? 0;

    // Default combat damage is the attacker's vigor. A -2 injury must leave
    // the foe with more HP than the uninjured swing (or miss-equivalent).
    expect(woundedHp).toBeGreaterThan(healthyHp);
  });
});

describe('F-1b1c077f: reputation copies onto actor.relations', () => {
  it('seeds profile reputation from entity.relations and writes it back', () => {
    const engine = makeEngine();
    defeat(engine, 'foe', 'Ash Ghoul', 1);
    const profile = getEntityProfile(engine.world, 'player')!;
    expect(profile.reputation.some((r) => r.factionId === 'chapel' && r.value === 5)).toBe(true);
    expect(engine.world.entities['player'].relations?.chapel).toBe(5);
  });
});
