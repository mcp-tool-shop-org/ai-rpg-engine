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
import {
  createEquipmentCore,
  createItemChronicleCore,
  ensureStartingLoadouts,
  getEntityLoadout,
} from '@ai-rpg-engine/equipment';
import type { ItemCatalog } from '@ai-rpg-engine/equipment';
import { createProfile } from './profile.js';
import { serializeProfile } from './serialize.js';
import { getActiveInjuries } from './injuries.js';
import { getReputation } from './milestones.js';
import { XP_THRESHOLDS } from './types.js';
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

describe('F-10a6f10c: healInjury + statuses.remove on rest/heal', () => {
  it('after addInjury, rest.completed clears active injuries and the vigor penalty', () => {
    const engine = makeEngine();
    const player = engine.world.entities['player'];
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
    expect(effectiveStat(player, 'vigor', engine.world, 0)).toBe(4);
    const injuryId = getEntityProfile(engine.world, 'player')!.injuries[0]!.id;
    expect(player.statuses.some((s) => s.statusId === injuryStatusId(injuryId))).toBe(true);

    engine.store.recordEvent({
      id: '',
      tick: 2,
      type: 'rest.completed',
      actorId: 'player',
      payload: { healed: 5 },
    });

    const profile = getEntityProfile(engine.world, 'player')!;
    expect(getActiveInjuries(profile)).toHaveLength(0);
    expect(profile.injuries[0]!.healed).toBe(true);
    expect(profile.injuries[0]!.healedAt).toBe('tick:2');
    expect(player.statuses.some((s) => s.statusId === injuryStatusId(injuryId))).toBe(false);
    expect(effectiveStat(player, 'vigor', engine.world, 0)).toBe(6);
  });
});

describe('F-8e83bda3: leveledUp advances archetype (and discipline) rank', () => {
  it('crossing XP_THRESHOLDS[1] sets progression.archetypeRank to 2', () => {
    const engine = makeEngine();
    const killsNeeded = Math.ceil(XP_THRESHOLDS[1]! / DEFAULT_XP_PER_KILL);
    for (let i = 0; i < killsNeeded; i++) {
      const foeId = `foe-${i}`;
      engine.store.addEntity({
        id: foeId,
        blueprintId: 'foe',
        type: 'npc',
        name: `Foe ${i}`,
        tags: ['enemy'],
        stats: { vigor: 1 },
        resources: { hp: 1, maxHp: 1 },
        statuses: [],
        zoneId: 'cell',
      });
      defeat(engine, foeId, `Foe ${i}`, i + 1);
    }
    const profile = getEntityProfile(engine.world, 'player')!;
    expect(profile.progression.xp).toBeGreaterThanOrEqual(XP_THRESHOLDS[1]!);
    expect(profile.progression.level).toBeGreaterThanOrEqual(2);
    expect(profile.progression.archetypeRank).toBe(2);
  });

  it('also advances disciplineRank when a discipline is set', () => {
    const disciplined = createProfile(
      { ...testBuild, disciplineId: 'occultist' },
      { vigor: 6, instinct: 4, will: 3 },
      { hp: 25, maxHp: 25 },
      ['player'],
      'fantasy',
      'player',
    );
    const engine = new Engine({
      manifest,
      seed: 7,
      modules: [
        statusCore,
        createCombatCore(),
        createProfileCore({ statuses: statusOps, packId: 'fantasy', profiles: { player: disciplined } }),
      ],
    });
    const zone: ZoneState = { id: 'cell', roomId: 'cell', name: 'Cell', tags: [], neighbors: [] };
    engine.store.addZone(zone);
    engine.store.addEntity(makePlayer());
    engine.store.state.playerId = 'player';
    engine.store.state.locationId = 'cell';

    const killsNeeded = Math.ceil(XP_THRESHOLDS[1]! / DEFAULT_XP_PER_KILL);
    for (let i = 0; i < killsNeeded; i++) {
      const foeId = `foe-${i}`;
      engine.store.addEntity({
        id: foeId,
        blueprintId: 'foe',
        type: 'npc',
        name: `Foe ${i}`,
        tags: ['enemy'],
        stats: { vigor: 1 },
        resources: { hp: 1, maxHp: 1 },
        statuses: [],
        zoneId: 'cell',
      });
      defeat(engine, foeId, `Foe ${i}`, i + 1);
    }
    const profile = getEntityProfile(engine.world, 'player')!;
    expect(profile.progression.archetypeRank).toBe(2);
    expect(profile.progression.disciplineRank).toBe(2);
  });
});

describe('F-c95f4820: profile copies loadout + item chronicle on write', () => {
  it('after ensureStartingLoadouts + a kill credited to the weapon, serializeProfile has the slot and used-in-kill', () => {
    const catalog: ItemCatalog = {
      items: [
        {
          id: 'chapel-lantern',
          name: 'Chapel Lantern',
          description: 'A flickering lantern.',
          slot: 'tool',
          rarity: 'common',
        },
        {
          id: 'ash-blade',
          name: 'Ash Blade',
          description: 'A charred short sword.',
          slot: 'weapon',
          rarity: 'common',
          statModifiers: { vigor: 1 },
        },
      ],
    };
    const profile = createProfile(
      testBuild,
      { vigor: 6, instinct: 4, will: 3 },
      { hp: 25, maxHp: 25 },
      ['player'],
      'fantasy',
      'player',
    );
    const engine = new Engine({
      manifest: {
        ...manifest,
        modules: ['status-core', 'equipment-core', 'item-chronicle-core', 'character-profile-core'],
      },
      seed: 7,
      modules: [
        statusCore,
        createEquipmentCore({ catalog, statuses: statusOps }),
        createItemChronicleCore({ catalog }),
        createProfileCore({ statuses: statusOps, packId: 'fantasy', profiles: { player: profile } }),
      ],
    });
    const zone: ZoneState = { id: 'cell', roomId: 'cell', name: 'Cell', tags: [], neighbors: [] };
    engine.store.addZone(zone);
    const player = makePlayer();
    player.inventory = ['ash-blade', 'chapel-lantern'];
    engine.store.addEntity(player);
    engine.store.addEntity({
      id: 'foe',
      blueprintId: 'foe',
      type: 'npc',
      name: 'Ash Ghoul',
      tags: ['enemy'],
      stats: { vigor: 1 },
      resources: { hp: 20, maxHp: 20 },
      statuses: [],
      zoneId: 'cell',
    });
    engine.store.state.playerId = 'player';
    engine.store.state.locationId = 'cell';

    ensureStartingLoadouts(engine.world);
    expect(getEntityLoadout(engine.world, 'player')?.equipped.weapon).toBe('ash-blade');

    defeat(engine, 'foe', 'Ash Ghoul', 1);

    const live = getEntityProfile(engine.world, 'player')!;
    expect(live.loadout.equipped.weapon).toBe('ash-blade');
    const json = serializeProfile(live);
    expect(json).toContain('ash-blade');
    expect(json).toContain('used-in-kill');
  });
});

describe('F-31e2e33f: live reputation.adjusted moves the sheet', () => {
  it('after reputation.adjusted -10, profile reputation and actor.relations match', () => {
    const engine = makeEngine();
    engine.store.recordEvent({
      id: '',
      tick: 2,
      type: 'reputation.adjusted',
      actorId: 'player',
      payload: { factionId: 'chapel-undead', delta: -10, value: -10 },
    });

    const profile = getEntityProfile(engine.world, 'player')!;
    expect(getReputation(profile, 'chapel-undead')).toBe(-10);
    expect(engine.world.entities['player'].relations?.['chapel-undead']).toBe(-10);
    expect(engine.world.entities['player'].relations?.['chapel-undead']).toBe(
      getReputation(profile, 'chapel-undead'),
    );
  });

  it('folds a defeat-fallout reputation_<faction> global on combat.entity.defeated', () => {
    const engine = makeEngine();
    engine.world.globals['reputation_chapel-undead'] = -10;
    defeat(engine, 'foe', 'Ash Ghoul', 1);

    const profile = getEntityProfile(engine.world, 'player')!;
    expect(getReputation(profile, 'chapel-undead')).toBe(-10);
    expect(engine.world.entities['player'].relations?.['chapel-undead']).toBe(-10);
  });
});

describe('F-6379b7cf: live stats/resources/tags and totalTurns copy onto the profile', () => {
  it('after a damaging hit, getEntityProfile resources.hp matches the entity and totalTurns > 0', () => {
    const engine = makeEngine();
    const player = engine.world.entities['player'];
    player.resources.hp = 17;
    engine.submitAction('attack', { targetIds: ['foe'] });

    const profile = getEntityProfile(engine.world, 'player')!;
    expect(profile.resources.hp).toBe(player.resources.hp);
    expect(profile.resources.hp).not.toBe(25);
    expect(profile.totalTurns).toBeGreaterThan(0);
    expect(profile.stats.vigor).toBe(player.stats.vigor);
    expect(profile.tags).toEqual(player.tags);
  });
});

describe('F-b0b7f592: injury grantedTags land on actor.tags while active', () => {
  it('after defeat.survived, actor.tags includes injured; after rest.completed it does not', () => {
    const engine = makeEngine();
    const player = engine.world.entities['player'];
    expect(player.tags).not.toContain('injured');

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
    expect(player.tags).toContain('injured');
    expect(getEntityProfile(engine.world, 'player')!.tags).toContain('injured');

    engine.store.recordEvent({
      id: '',
      tick: 2,
      type: 'rest.completed',
      actorId: 'player',
      payload: { healed: 5 },
    });
    expect(player.tags).not.toContain('injured');
    expect(getEntityProfile(engine.world, 'player')!.tags).not.toContain('injured');
  });
});
