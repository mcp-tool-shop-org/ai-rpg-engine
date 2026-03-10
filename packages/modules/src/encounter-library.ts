// encounter-library — reusable encounter archetypes, boss templates, pack audit
//
// Pure factory functions. NOT an EngineModule.
// Content authors call these to build EncounterDefinitions and BossDefinitions
// from archetype patterns rather than assembling them manually.

import type {
  EncounterDefinition,
  EncounterParticipant,
  BossDefinition,
  CombatRole,
} from './combat-roles.js';

// ---------------------------------------------------------------------------
// Encounter Archetype Types
// ---------------------------------------------------------------------------

export type EncounterArchetype = 'patrol' | 'ambush' | 'boss-fight' | 'horde' | 'duel';

export type EncounterArchetypeConfig = {
  /** Unique encounter ID */
  id: string;
  /** Display name */
  name: string;
  /** Zone IDs where this encounter is valid */
  validZoneIds?: string[];
  /** Narrative hooks for the AI narrator */
  narrativeHooks?: {
    tone?: string;
    trigger?: string;
    stakes?: string;
  };
};

// ---------------------------------------------------------------------------
// Encounter Archetype Factories
// ---------------------------------------------------------------------------

/** Create a patrol encounter: routine sweep, mixed roles. Composition: 'patrol'. */
export function createPatrolEncounter(
  config: EncounterArchetypeConfig,
  participants: EncounterParticipant[],
): EncounterDefinition {
  return {
    id: config.id,
    name: config.name,
    participants,
    composition: 'patrol',
    validZoneIds: config.validZoneIds,
    narrativeHooks: config.narrativeHooks,
  };
}

/** Create an ambush encounter: sudden surprise attack. Composition: 'ambush'. */
export function createAmbushEncounter(
  config: EncounterArchetypeConfig,
  participants: EncounterParticipant[],
): EncounterDefinition {
  return {
    id: config.id,
    name: config.name,
    participants,
    composition: 'ambush',
    validZoneIds: config.validZoneIds,
    narrativeHooks: config.narrativeHooks,
  };
}

/** Create a boss fight encounter: boss + support participants. Composition: 'boss-fight'. */
export function createBossFightEncounter(
  config: EncounterArchetypeConfig,
  bossParticipant: EncounterParticipant,
  supportParticipants: EncounterParticipant[],
): EncounterDefinition {
  return {
    id: config.id,
    name: config.name,
    participants: [bossParticipant, ...supportParticipants],
    composition: 'boss-fight',
    validZoneIds: config.validZoneIds,
    narrativeHooks: config.narrativeHooks,
  };
}

/** Create a horde encounter: many minions, optionally led. Composition: 'horde'. */
export function createHordeEncounter(
  config: EncounterArchetypeConfig,
  minionParticipants: EncounterParticipant[],
  leader?: EncounterParticipant,
): EncounterDefinition {
  const participants = leader
    ? [leader, ...minionParticipants]
    : [...minionParticipants];
  return {
    id: config.id,
    name: config.name,
    participants,
    composition: 'horde',
    validZoneIds: config.validZoneIds,
    narrativeHooks: config.narrativeHooks,
  };
}

/** Create a duel encounter: 1-on-1 or small elite fight. Composition: 'duel'. */
export function createDuelEncounter(
  config: EncounterArchetypeConfig,
  opponents: EncounterParticipant[],
): EncounterDefinition {
  return {
    id: config.id,
    name: config.name,
    participants: opponents,
    composition: 'duel',
    validZoneIds: config.validZoneIds,
    narrativeHooks: config.narrativeHooks,
  };
}

// ---------------------------------------------------------------------------
// Boss Template Types
// ---------------------------------------------------------------------------

export type BossPattern = 'escalating' | 'summoner' | 'phase-shift';

export type BossTemplateConfig = {
  entityId: string;
  immovable?: boolean;
};

// ---------------------------------------------------------------------------
// Boss Template Factories
// ---------------------------------------------------------------------------

/**
 * Escalating boss: 2 phases at 50% and 25% HP.
 * Each phase adds aggression tags and shifts behavior.
 */
export function createEscalatingBoss(
  config: BossTemplateConfig,
  narrativeKeys?: { phase1?: string; phase2?: string },
): BossDefinition {
  return {
    entityId: config.entityId,
    phases: [
      {
        hpThreshold: 0.5,
        narrativeKey: narrativeKeys?.phase1 ?? 'enraged',
        addTags: ['enraged'],
      },
      {
        hpThreshold: 0.25,
        narrativeKey: narrativeKeys?.phase2 ?? 'desperate',
        addTags: ['desperate'],
        removeTags: ['enraged'],
      },
    ],
    immovable: config.immovable,
  };
}

/**
 * Summoner boss: 3 phases at 75%, 50%, 25% HP.
 * Each phase spawns reinforcement entity IDs.
 */
export function createSummonerBoss(
  config: BossTemplateConfig,
  spawnWaves: {
    phase1Spawns?: string[];
    phase2Spawns?: string[];
    phase3Spawns?: string[];
  },
  narrativeKeys?: { phase1?: string; phase2?: string; phase3?: string },
): BossDefinition {
  return {
    entityId: config.entityId,
    phases: [
      {
        hpThreshold: 0.75,
        narrativeKey: narrativeKeys?.phase1 ?? 'summoning',
        spawnEntityIds: spawnWaves.phase1Spawns,
        addTags: ['summoning'],
      },
      {
        hpThreshold: 0.5,
        narrativeKey: narrativeKeys?.phase2 ?? 'rallying',
        spawnEntityIds: spawnWaves.phase2Spawns,
        addTags: ['rallying'],
        removeTags: ['summoning'],
      },
      {
        hpThreshold: 0.25,
        narrativeKey: narrativeKeys?.phase3 ?? 'desperate',
        spawnEntityIds: spawnWaves.phase3Spawns,
        addTags: ['desperate'],
        removeTags: ['rallying'],
      },
    ],
    immovable: config.immovable,
  };
}

/**
 * Phase-shift boss: custom phases with tag swaps.
 * Caller defines each phase's thresholds, tags, and spawns.
 */
export function createPhaseShiftBoss(
  config: BossTemplateConfig,
  phases: Array<{
    hpThreshold: number;
    narrativeKey: string;
    addTags?: string[];
    removeTags?: string[];
    spawnEntityIds?: string[];
  }>,
): BossDefinition {
  return {
    entityId: config.entityId,
    phases: phases.map(p => ({
      hpThreshold: p.hpThreshold,
      narrativeKey: p.narrativeKey,
      addTags: p.addTags,
      removeTags: p.removeTags,
      spawnEntityIds: p.spawnEntityIds,
    })),
    immovable: config.immovable,
  };
}

// ---------------------------------------------------------------------------
// Pack Coverage Audit
// ---------------------------------------------------------------------------

export type PackCoverageResult = {
  packId: string;
  enemyCount: number;
  roleTaggedCount: number;
  encounterCount: number;
  bossDefinitionCount: number;
  bossEncounterCount: number;
  zonesWithEncounters: number;
  totalZones: number;
  rolesUsed: CombatRole[];
  missingMinimumBar: string[];
};

/**
 * Audit a pack's combat content against the minimum bar:
 * - 3+ role-tagged enemies
 * - 3+ encounters (including at least one patrol and one boss-fight)
 * - 1+ boss definition with 2+ phases
 * - encounters spread across zones
 */
export function auditPackCoverage(
  packId: string,
  enemies: Array<{ id: string; tags: string[] }>,
  encounters: EncounterDefinition[],
  bossDefs: BossDefinition[],
  zoneIds: string[],
): PackCoverageResult {
  const missing: string[] = [];

  // Count role-tagged enemies
  const roleTagged = enemies.filter(e =>
    e.tags.some(t => t.startsWith('role:')),
  );
  const rolesUsed = new Set<CombatRole>();
  for (const e of roleTagged) {
    const roleTag = e.tags.find(t => t.startsWith('role:'));
    if (roleTag) rolesUsed.add(roleTag.slice(5) as CombatRole);
  }

  if (enemies.length < 3) {
    missing.push(`Need 3+ enemies, have ${enemies.length}`);
  }
  if (roleTagged.length < 3) {
    missing.push(`Need 3+ role-tagged enemies, have ${roleTagged.length}`);
  }

  // Encounters
  if (encounters.length < 3) {
    missing.push(`Need 3+ encounters, have ${encounters.length}`);
  }

  const hasPatrol = encounters.some(e => e.composition === 'patrol');
  const hasBossFight = encounters.some(e => e.composition === 'boss-fight');
  if (!hasPatrol) missing.push('Need at least one patrol encounter');
  if (!hasBossFight) missing.push('Need at least one boss-fight encounter');

  // Boss definitions
  if (bossDefs.length < 1) {
    missing.push('Need 1+ boss definition');
  }
  for (const bd of bossDefs) {
    if (bd.phases.length < 2) {
      missing.push(`Boss '${bd.entityId}' needs 2+ phases, has ${bd.phases.length}`);
    }
  }

  // Zone spread
  const encounterZones = new Set<string>();
  for (const enc of encounters) {
    for (const zid of enc.validZoneIds ?? []) {
      encounterZones.add(zid);
    }
  }
  const bossEncounterCount = encounters.filter(e => e.composition === 'boss-fight').length;

  return {
    packId,
    enemyCount: enemies.length,
    roleTaggedCount: roleTagged.length,
    encounterCount: encounters.length,
    bossDefinitionCount: bossDefs.length,
    bossEncounterCount,
    zonesWithEncounters: encounterZones.size,
    totalZones: zoneIds.length,
    rolesUsed: [...rolesUsed],
    missingMinimumBar: missing,
  };
}
