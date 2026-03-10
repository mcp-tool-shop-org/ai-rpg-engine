// combat-summary — encounter review, summary, audit, query, and export surfaces
//
// Pure functions for inspecting, summarizing, and auditing combat content.
// Consumes types from combat-roles.ts. No runtime state, no EngineModule.
// Designed for World Forge, CLI tools, and test harnesses.

import type {
  EntityState,
  WorldState,
} from '@ai-rpg-engine/core';
import type { CombatStatMapping } from './combat-core.js';
import { DEFAULT_STAT_MAPPING } from './combat-core.js';
import type {
  CombatRole,
  EncounterDefinition,
  EncounterComposition,
  BossDefinition,
  DangerRating,
  EncounterAnalysis,
  TacticalExpectation,
} from './combat-roles.js';
import {
  COMBAT_ROLES,
  getEntityRole,
  analyzeEncounter,
  getTacticalExpectation,
  validateBossDefinition,
} from './combat-roles.js';
import {
  getDistrictForZone,
  getDistrictDefinition,
  getDistrictThreatLevel,
} from './district-core.js';

// ---------------------------------------------------------------------------
// Query Types
// ---------------------------------------------------------------------------

export type EncounterFilter = {
  /** Match encounters whose name includes this substring (case-insensitive) */
  nameContains?: string;
  /** Match encounters containing a participant with this role */
  hasRole?: CombatRole;
  /** Match encounters flagged as boss-fight or containing a boss participant */
  isBossFight?: boolean;
  /** Match encounters whose danger level matches (requires entities + player) */
  dangerLevel?: DangerRating['level'];
  /** Match encounters valid in this zone */
  validInZone?: string;
  /** Match encounters using this composition type */
  composition?: EncounterComposition;
};

// ---------------------------------------------------------------------------
// Review Types
// ---------------------------------------------------------------------------

export type BossProfile = {
  entityId: string;
  entityName: string;
  definition: BossDefinition;
  /** Current entity HP ratio (if entity state available) */
  currentHpRatio: number | undefined;
  /** Phase timeline sorted by threshold descending */
  phaseTimeline: Array<{
    phaseIndex: number;
    hpThreshold: number;
    narrativeKey: string;
    tagChanges: { add: string[]; remove: string[] };
    spawns: string[];
    biasShift: boolean;
  }>;
  /** Is this boss immovable (cannot flee)? */
  immovable: boolean;
  /** Total phases */
  phaseCount: number;
  /** Advisory: overall boss difficulty note */
  difficultyNote: string;
};

export type EncounterDetail = {
  encounter: EncounterDefinition;
  analysis: EncounterAnalysis;
  /** Boss profiles for any boss participants */
  bossProfiles: BossProfile[];
  /** Tactical expectations per participant */
  tacticalExpectations: Array<{
    entityId: string;
    role: CombatRole | undefined;
    expectation: TacticalExpectation | undefined;
  }>;
  /** Zone context (if world provided) */
  zoneContext: {
    validZoneNames: string[];
    districtId: string | undefined;
    districtName: string | undefined;
  } | undefined;
};

// ---------------------------------------------------------------------------
// Summary Types
// ---------------------------------------------------------------------------

export type CombatContentSummary = {
  /** Total encounters */
  encounterCount: number;
  /** Encounters by danger tier */
  dangerDistribution: Record<DangerRating['level'], number>;
  /** Role usage across all encounters */
  roleDistribution: Partial<Record<CombatRole, number>>;
  /** Composition type distribution */
  compositionDistribution: Partial<Record<EncounterComposition, number>>;
  /** Boss list with entity IDs */
  bossList: Array<{ entityId: string; entityName: string; encounterName: string }>;
  /** Encounters per zone */
  encountersByZone: Record<string, number>;
  /** Average participants per encounter */
  averageParticipants: number;
  /** Unique entities referenced across all encounters */
  uniqueEntityCount: number;
  /** Advisory: content health notes */
  advisories: string[];
};

export type RegionCombatOverview = {
  districtId: string;
  districtName: string;
  /** Encounters valid in this district's zones */
  encounterCount: number;
  /** Danger spread within the district */
  dangerSpread: Partial<Record<DangerRating['level'], number>>;
  /** Boss encounters in this region */
  bossEncounterCount: number;
  /** Dominant roles in this region */
  dominantRoles: CombatRole[];
  /** District threat level (from district-core, if available) */
  districtThreatLevel: number | undefined;
  /** Advisory notes specific to this region */
  advisories: string[];
};

// ---------------------------------------------------------------------------
// Audit Types
// ---------------------------------------------------------------------------

export type EncounterAuditWarning = {
  /** Which encounter (or 'project' for global) */
  encounterId: string;
  /** Warning severity */
  severity: 'info' | 'advisory' | 'warning';
  /** Warning category */
  category: 'role-diversity' | 'boss-structure' | 'danger-balance' | 'region-balance' | 'composition';
  /** Human-readable message */
  message: string;
};

export type EncounterAuditResult = {
  encounterId: string;
  encounterName: string;
  warnings: EncounterAuditWarning[];
};

export type ProjectCombatAudit = {
  /** Per-encounter audit results */
  encounterResults: EncounterAuditResult[];
  /** Project-level advisories */
  projectAdvisories: EncounterAuditWarning[];
  /** Summary stats */
  totalEncounters: number;
  totalWarnings: number;
  totalAdvisories: number;
};

// ---------------------------------------------------------------------------
// Query Functions
// ---------------------------------------------------------------------------

/** Filter encounters by criteria */
export function findEncounters(
  encounters: EncounterDefinition[],
  filter: EncounterFilter,
  entities?: Record<string, EntityState>,
  player?: EntityState,
  statMapping?: CombatStatMapping,
): EncounterDefinition[] {
  return encounters.filter(enc => {
    if (filter.nameContains) {
      if (!enc.name.toLowerCase().includes(filter.nameContains.toLowerCase())) return false;
    }

    if (filter.composition) {
      if (enc.composition !== filter.composition) return false;
    }

    if (filter.validInZone) {
      if (!enc.validZoneIds?.includes(filter.validInZone)) return false;
    }

    if (filter.hasRole) {
      const hasMatch = enc.participants.some(p => {
        if (p.role === filter.hasRole) return true;
        if (entities) {
          const entity = entities[p.entityId];
          if (entity && getEntityRole(entity) === filter.hasRole) return true;
        }
        return false;
      });
      if (!hasMatch) return false;
    }

    if (filter.isBossFight != null) {
      const isBoss = enc.composition === 'boss-fight' || enc.participants.some(p => {
        if (p.role === 'boss') return true;
        if (entities) {
          const entity = entities[p.entityId];
          if (entity && getEntityRole(entity) === 'boss') return true;
        }
        return false;
      });
      if (isBoss !== filter.isBossFight) return false;
    }

    if (filter.dangerLevel && entities && player) {
      const analysis = analyzeEncounter(enc, entities, player, statMapping);
      if (analysis.dangerRating.level !== filter.dangerLevel) return false;
    }

    return true;
  });
}

/** Group encounters by their validZoneIds */
export function getEncountersByZone(
  encounters: EncounterDefinition[],
): Record<string, EncounterDefinition[]> {
  const result: Record<string, EncounterDefinition[]> = {};
  for (const enc of encounters) {
    if (!enc.validZoneIds || enc.validZoneIds.length === 0) {
      (result['_unzoned'] ??= []).push(enc);
    } else {
      for (const zoneId of enc.validZoneIds) {
        (result[zoneId] ??= []).push(enc);
      }
    }
  }
  return result;
}

/** Group encounters by district using zone-to-district mapping */
export function getEncountersByDistrict(
  encounters: EncounterDefinition[],
  world: WorldState,
): Record<string, EncounterDefinition[]> {
  const result: Record<string, EncounterDefinition[]> = {};
  for (const enc of encounters) {
    const assignedDistricts = new Set<string>();
    if (enc.validZoneIds) {
      for (const zoneId of enc.validZoneIds) {
        const districtId = getDistrictForZone(world, zoneId);
        if (districtId && !assignedDistricts.has(districtId)) {
          assignedDistricts.add(districtId);
          (result[districtId] ??= []).push(enc);
        }
      }
    }
    if (assignedDistricts.size === 0) {
      (result['_unassigned'] ??= []).push(enc);
    }
  }
  return result;
}

/** Extract boss profiles from encounters matched against boss definitions */
export function getEncounterBosses(
  encounters: EncounterDefinition[],
  bossDefs: BossDefinition[],
  entities?: Record<string, EntityState>,
): BossProfile[] {
  const bossMap = new Map<string, BossDefinition>();
  for (const def of bossDefs) {
    bossMap.set(def.entityId, def);
  }

  const profiles: BossProfile[] = [];
  const seen = new Set<string>();

  for (const enc of encounters) {
    for (const p of enc.participants) {
      const def = bossMap.get(p.entityId);
      if (def && !seen.has(def.entityId)) {
        seen.add(def.entityId);
        profiles.push(buildBossProfile(def, entities?.[def.entityId]));
      }
    }
  }

  return profiles;
}

// ---------------------------------------------------------------------------
// Review Functions
// ---------------------------------------------------------------------------

/** Construct a BossProfile from a definition and optional entity state */
export function buildBossProfile(
  bossDef: BossDefinition,
  entity?: EntityState,
): BossProfile {
  const sorted = bossDef.phases
    .map((p, i) => ({ ...p, index: i }))
    .sort((a, b) => b.hpThreshold - a.hpThreshold);

  const phaseTimeline = sorted.map(p => ({
    phaseIndex: p.index,
    hpThreshold: p.hpThreshold,
    narrativeKey: p.narrativeKey,
    tagChanges: {
      add: p.addTags ?? [],
      remove: p.removeTags ?? [],
    },
    spawns: p.spawnEntityIds ?? [],
    biasShift: p.newBiasModifiers != null,
  }));

  let currentHpRatio: number | undefined;
  if (entity) {
    const hp = entity.resources.hp ?? 0;
    const maxHp = entity.resources.maxHp ?? hp;
    currentHpRatio = maxHp > 0 ? hp / maxHp : 0;
  }

  const totalSpawns = phaseTimeline.reduce((sum, p) => sum + p.spawns.length, 0);
  const notes: string[] = [];
  if (bossDef.immovable) notes.push('immovable');
  if (bossDef.phases.length >= 3) notes.push('multi-phase');
  if (totalSpawns > 0) notes.push(`spawns ${totalSpawns} reinforcement(s)`);
  const difficultyNote = notes.length > 0
    ? `Traits: ${notes.join(', ')}`
    : 'Standard boss encounter';

  return {
    entityId: bossDef.entityId,
    entityName: entity?.name ?? bossDef.entityId,
    definition: bossDef,
    currentHpRatio,
    phaseTimeline,
    immovable: bossDef.immovable ?? false,
    phaseCount: bossDef.phases.length,
    difficultyNote,
  };
}

/** Build comprehensive encounter detail with boss profiles and tactical expectations */
export function buildEncounterDetail(
  encounter: EncounterDefinition,
  entities: Record<string, EntityState>,
  player: EntityState,
  options?: {
    world?: WorldState;
    bossDefs?: BossDefinition[];
    statMapping?: CombatStatMapping;
  },
): EncounterDetail {
  const analysis = analyzeEncounter(encounter, entities, player, options?.statMapping);

  // Build boss profiles
  const bossProfiles: BossProfile[] = [];
  if (options?.bossDefs) {
    const bossMap = new Map<string, BossDefinition>();
    for (const def of options.bossDefs) bossMap.set(def.entityId, def);
    for (const p of encounter.participants) {
      const def = bossMap.get(p.entityId);
      if (def) bossProfiles.push(buildBossProfile(def, entities[def.entityId]));
    }
  }

  // Build tactical expectations
  const tacticalExpectations = encounter.participants.map(p => {
    const entity = entities[p.entityId];
    const role = p.role ?? getEntityRole(entity);
    return {
      entityId: p.entityId,
      role,
      expectation: role ? getTacticalExpectation(role) : undefined,
    };
  });

  // Build zone context
  let zoneContext: EncounterDetail['zoneContext'];
  if (options?.world && encounter.validZoneIds) {
    const validZoneNames = encounter.validZoneIds
      .map(zId => options.world!.zones[zId]?.name ?? zId)
      .filter(Boolean);
    const firstZone = encounter.validZoneIds[0];
    const districtId = firstZone ? getDistrictForZone(options.world, firstZone) : undefined;
    const districtDef = districtId ? getDistrictDefinition(options.world, districtId) : undefined;
    zoneContext = {
      validZoneNames,
      districtId,
      districtName: districtDef?.name,
    };
  }

  return { encounter, analysis, bossProfiles, tacticalExpectations, zoneContext };
}

// ---------------------------------------------------------------------------
// Summary Functions
// ---------------------------------------------------------------------------

/** Aggregate combat content statistics across all encounters */
export function summarizeCombatContent(
  encounters: EncounterDefinition[],
  entities: Record<string, EntityState>,
  player?: EntityState,
  bossDefs?: BossDefinition[],
  statMapping: CombatStatMapping = DEFAULT_STAT_MAPPING,
): CombatContentSummary {
  const dangerDistribution: Record<DangerRating['level'], number> = {
    trivial: 0, routine: 0, dangerous: 0, deadly: 0, overwhelming: 0,
  };
  const roleDistribution: Partial<Record<CombatRole, number>> = {};
  const compositionDistribution: Partial<Record<EncounterComposition, number>> = {};
  const bossList: CombatContentSummary['bossList'] = [];
  const encountersByZone: Record<string, number> = {};
  const uniqueEntities = new Set<string>();
  let totalParticipants = 0;

  const bossMap = new Map<string, BossDefinition>();
  if (bossDefs) {
    for (const def of bossDefs) bossMap.set(def.entityId, def);
  }

  for (const enc of encounters) {
    // Composition
    if (enc.composition) {
      compositionDistribution[enc.composition] = (compositionDistribution[enc.composition] ?? 0) + 1;
    }

    // Zones
    if (enc.validZoneIds) {
      for (const zoneId of enc.validZoneIds) {
        encountersByZone[zoneId] = (encountersByZone[zoneId] ?? 0) + 1;
      }
    }

    // Participants
    totalParticipants += enc.participants.length;
    for (const p of enc.participants) {
      uniqueEntities.add(p.entityId);
      const entity = entities[p.entityId];
      const role = p.role ?? getEntityRole(entity);
      if (role) {
        roleDistribution[role] = (roleDistribution[role] ?? 0) + 1;
        if (role === 'boss') {
          bossList.push({
            entityId: p.entityId,
            entityName: entity?.name ?? p.entityId,
            encounterName: enc.name,
          });
        }
      }
    }

    // Danger
    if (player) {
      const analysis = analyzeEncounter(enc, entities, player, statMapping);
      dangerDistribution[analysis.dangerRating.level]++;
    }
  }

  // Generate advisories
  const advisories: string[] = [];
  const totalRoleAssignments = Object.values(roleDistribution).reduce((s, n) => s + n, 0);

  if (totalRoleAssignments > 0) {
    for (const [role, count] of Object.entries(roleDistribution)) {
      if (count > totalRoleAssignments * 0.5 && totalRoleAssignments > 2) {
        advisories.push(`Role '${role}' is used in ${count}/${totalRoleAssignments} assignments (>50%)`);
      }
    }

    const usedRoles = new Set(Object.keys(roleDistribution));
    const unusedRoles = COMBAT_ROLES.filter(r => !usedRoles.has(r));
    if (unusedRoles.length > 0 && encounters.length >= 3) {
      advisories.push(`Unused roles: ${unusedRoles.join(', ')}`);
    }
  }

  if (player) {
    const tiers = Object.entries(dangerDistribution).filter(([, n]) => n > 0);
    if (tiers.length === 1 && encounters.length > 2) {
      advisories.push(`All encounters are ${tiers[0][0]} — consider varying danger levels`);
    }
  }

  return {
    encounterCount: encounters.length,
    dangerDistribution,
    roleDistribution,
    compositionDistribution,
    bossList,
    encountersByZone,
    averageParticipants: encounters.length > 0 ? totalParticipants / encounters.length : 0,
    uniqueEntityCount: uniqueEntities.size,
    advisories,
  };
}

/** Combat overview for one district */
export function summarizeRegionCombat(
  districtId: string,
  encounters: EncounterDefinition[],
  entities: Record<string, EntityState>,
  world: WorldState,
  player?: EntityState,
  bossDefs?: BossDefinition[],
  statMapping: CombatStatMapping = DEFAULT_STAT_MAPPING,
): RegionCombatOverview {
  const districtDef = getDistrictDefinition(world, districtId);
  const districtName = districtDef?.name ?? districtId;
  const districtZones = new Set(districtDef?.zoneIds ?? []);

  // Filter encounters valid in this district
  const regionEncounters = encounters.filter(enc =>
    enc.validZoneIds?.some(z => districtZones.has(z)),
  );

  const dangerSpread: Partial<Record<DangerRating['level'], number>> = {};
  let bossEncounterCount = 0;
  const roleCounts: Partial<Record<CombatRole, number>> = {};

  for (const enc of regionEncounters) {
    // Danger
    if (player) {
      const analysis = analyzeEncounter(enc, entities, player, statMapping);
      dangerSpread[analysis.dangerRating.level] = (dangerSpread[analysis.dangerRating.level] ?? 0) + 1;
    }

    // Roles + boss detection
    let hasBoss = false;
    for (const p of enc.participants) {
      const entity = entities[p.entityId];
      const role = p.role ?? getEntityRole(entity);
      if (role) {
        roleCounts[role] = (roleCounts[role] ?? 0) + 1;
        if (role === 'boss') hasBoss = true;
      }
    }
    if (hasBoss || enc.composition === 'boss-fight') bossEncounterCount++;
  }

  // Dominant roles (top 2 by count)
  const dominantRoles = (Object.entries(roleCounts) as [CombatRole, number][])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([role]) => role);

  let districtThreatLevel: number | undefined;
  try {
    districtThreatLevel = getDistrictThreatLevel(world, districtId);
  } catch {
    districtThreatLevel = undefined;
  }

  const advisories: string[] = [];
  if (regionEncounters.length === 0) {
    advisories.push('No encounters assigned to this region');
  }
  if (bossEncounterCount > 1) {
    advisories.push(`Multiple boss encounters (${bossEncounterCount}) in one region`);
  }

  return {
    districtId,
    districtName,
    encounterCount: regionEncounters.length,
    dangerSpread,
    bossEncounterCount,
    dominantRoles,
    districtThreatLevel,
    advisories,
  };
}

// ---------------------------------------------------------------------------
// Audit Functions
// ---------------------------------------------------------------------------

/** Per-encounter health check */
export function auditEncounters(
  encounters: EncounterDefinition[],
  entities: Record<string, EntityState>,
  bossDefs?: BossDefinition[],
): EncounterAuditResult[] {
  const bossMap = new Map<string, BossDefinition>();
  if (bossDefs) {
    for (const def of bossDefs) bossMap.set(def.entityId, def);
  }

  return encounters.map(enc => {
    const warnings: EncounterAuditWarning[] = [];

    // Missing entities
    for (const p of enc.participants) {
      if (!entities[p.entityId]) {
        warnings.push({
          encounterId: enc.id,
          severity: 'warning',
          category: 'composition',
          message: `Participant '${p.entityId}' not found in entities`,
        });
      }
    }

    // Role analysis
    const roles = enc.participants
      .map(p => p.role ?? getEntityRole(entities[p.entityId]))
      .filter((r): r is CombatRole => r != null);

    if (roles.length > 1) {
      const uniqueRoles = new Set(roles);

      // All same role
      if (uniqueRoles.size === 1 && enc.participants.length >= 3) {
        warnings.push({
          encounterId: enc.id,
          severity: 'warning',
          category: 'role-diversity',
          message: `All ${roles.length} participants have role '${roles[0]}' — consider varying roles`,
        });
      }
    }

    // Boss structure checks
    const hasBossParticipant = roles.includes('boss');
    if (enc.composition === 'boss-fight' && !hasBossParticipant) {
      warnings.push({
        encounterId: enc.id,
        severity: 'warning',
        category: 'boss-structure',
        message: 'Boss-fight composition has no boss participant',
      });
    }

    if (hasBossParticipant) {
      const hasSupport = roles.some(r => r === 'minion' || r === 'bodyguard');
      if (!hasSupport && enc.participants.length > 1) {
        warnings.push({
          encounterId: enc.id,
          severity: 'advisory',
          category: 'boss-structure',
          message: 'Boss has no minion or bodyguard support — consider adding support roles',
        });
      }

      // Validate boss definition if available
      const bossParticipants = enc.participants.filter(p => {
        const role = p.role ?? getEntityRole(entities[p.entityId]);
        return role === 'boss';
      });
      for (const bp of bossParticipants) {
        if (!bossMap.has(bp.entityId)) {
          warnings.push({
            encounterId: enc.id,
            severity: 'advisory',
            category: 'boss-structure',
            message: `Boss '${bp.entityId}' has no BossDefinition — phases won't trigger`,
          });
        }
      }
    }

    // Composition mismatches
    if (enc.composition === 'horde' && !roles.includes('minion')) {
      warnings.push({
        encounterId: enc.id,
        severity: 'advisory',
        category: 'composition',
        message: 'Horde composition has no minion participants',
      });
    }

    if (enc.composition === 'duel' && enc.participants.length > 2) {
      warnings.push({
        encounterId: enc.id,
        severity: 'advisory',
        category: 'composition',
        message: `Duel composition has ${enc.participants.length} participants (expected 1-2)`,
      });
    }

    return { encounterId: enc.id, encounterName: enc.name, warnings };
  });
}

/** Project-wide combat health audit */
export function auditProjectCombat(
  encounters: EncounterDefinition[],
  entities: Record<string, EntityState>,
  world?: WorldState,
  bossDefs?: BossDefinition[],
  player?: EntityState,
  statMapping: CombatStatMapping = DEFAULT_STAT_MAPPING,
): ProjectCombatAudit {
  const encounterResults = auditEncounters(encounters, entities, bossDefs);
  const projectAdvisories: EncounterAuditWarning[] = [];

  // Role distribution analysis
  const totalRoleCounts: Partial<Record<CombatRole, number>> = {};
  for (const enc of encounters) {
    for (const p of enc.participants) {
      const entity = entities[p.entityId];
      const role = p.role ?? getEntityRole(entity);
      if (role) {
        totalRoleCounts[role] = (totalRoleCounts[role] ?? 0) + 1;
      }
    }
  }

  const totalAssignments = Object.values(totalRoleCounts).reduce((s, n) => s + n, 0);
  if (totalAssignments > 2) {
    for (const [role, count] of Object.entries(totalRoleCounts)) {
      if (count > totalAssignments * 0.5) {
        projectAdvisories.push({
          encounterId: 'project',
          severity: 'advisory',
          category: 'role-diversity',
          message: `Role '${role}' represents ${count}/${totalAssignments} assignments (>50%) — consider diversifying`,
        });
      }
    }

    const usedRoles = new Set(Object.keys(totalRoleCounts));
    const unused = COMBAT_ROLES.filter(r => !usedRoles.has(r));
    if (unused.length > 0) {
      projectAdvisories.push({
        encounterId: 'project',
        severity: 'info',
        category: 'role-diversity',
        message: `Unused combat roles: ${unused.join(', ')}`,
      });
    }
  }

  // Danger tier analysis
  if (player && encounters.length > 2) {
    const tierCounts: Partial<Record<DangerRating['level'], number>> = {};
    for (const enc of encounters) {
      const analysis = analyzeEncounter(enc, entities, player, statMapping);
      tierCounts[analysis.dangerRating.level] = (tierCounts[analysis.dangerRating.level] ?? 0) + 1;
    }
    const usedTiers = Object.entries(tierCounts).filter(([, n]) => n > 0);
    if (usedTiers.length === 1) {
      projectAdvisories.push({
        encounterId: 'project',
        severity: 'advisory',
        category: 'danger-balance',
        message: `All ${encounters.length} encounters are '${usedTiers[0][0]}' — consider varying danger levels`,
      });
    }
  }

  // Region balance analysis
  if (world) {
    const byDistrict = getEncountersByDistrict(encounters, world);
    const districtCounts = Object.entries(byDistrict).filter(([k]) => k !== '_unassigned');
    if (districtCounts.length > 1) {
      const total = districtCounts.reduce((s, [, encs]) => s + encs.length, 0);
      for (const [districtId, encs] of districtCounts) {
        if (encs.length > total * 0.8 && total > 2) {
          const def = getDistrictDefinition(world, districtId);
          projectAdvisories.push({
            encounterId: 'project',
            severity: 'advisory',
            category: 'region-balance',
            message: `${encs.length}/${total} encounters in '${def?.name ?? districtId}' (>80%) — consider spreading across regions`,
          });
        }
      }
    }
  }

  // Boss definition validation
  if (bossDefs) {
    for (const def of bossDefs) {
      const bossWarnings = validateBossDefinition(def, entities);
      for (const w of bossWarnings) {
        projectAdvisories.push({
          encounterId: 'project',
          severity: 'advisory',
          category: 'boss-structure',
          message: `Boss '${def.entityId}': ${w}`,
        });
      }
    }
  }

  const totalWarnings = encounterResults.reduce(
    (s, r) => s + r.warnings.filter(w => w.severity === 'warning').length, 0,
  ) + projectAdvisories.filter(w => w.severity === 'warning').length;

  const totalAdvisories = encounterResults.reduce(
    (s, r) => s + r.warnings.filter(w => w.severity !== 'warning').length, 0,
  ) + projectAdvisories.filter(w => w.severity !== 'warning').length;

  return {
    encounterResults,
    projectAdvisories,
    totalEncounters: encounters.length,
    totalWarnings,
    totalAdvisories,
  };
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

const DIVIDER = '\u2500'.repeat(50);

/** Comprehensive encounter detail for the AI director */
export function formatEncounterDetailForDirector(detail: EncounterDetail): string {
  const lines: string[] = [];
  const enc = detail.encounter;

  lines.push(DIVIDER);
  lines.push(`Encounter: ${enc.name} (${enc.id})`);
  if (enc.composition) lines.push(`  Composition: ${enc.composition}`);
  lines.push(`  Danger: ${detail.analysis.dangerRating.level} (${detail.analysis.dangerRating.score}/100)`);

  if (detail.zoneContext) {
    lines.push(`  Zones: ${detail.zoneContext.validZoneNames.join(', ')}`);
    if (detail.zoneContext.districtName) {
      lines.push(`  District: ${detail.zoneContext.districtName}`);
    }
  }

  if (enc.narrativeHooks) {
    if (enc.narrativeHooks.tone) lines.push(`  Tone: ${enc.narrativeHooks.tone}`);
    if (enc.narrativeHooks.trigger) lines.push(`  Trigger: ${enc.narrativeHooks.trigger}`);
    if (enc.narrativeHooks.stakes) lines.push(`  Stakes: ${enc.narrativeHooks.stakes}`);
  }

  lines.push(`  Participants (${detail.tacticalExpectations.length}):`);
  for (const te of detail.tacticalExpectations) {
    const power = detail.analysis.participantPower.find(p => p.entityId === te.entityId);
    const roleStr = te.role ? ` [${te.role}]` : '';
    const powerStr = power ? ` — power ${power.combatPower}` : '';
    lines.push(`    ${te.entityId}${roleStr}${powerStr}`);
    if (te.expectation) {
      lines.push(`      Behavior: ${te.expectation.likelyBehavior}`);
      lines.push(`      Threat: ${te.expectation.playerThreat}`);
    }
  }

  for (const boss of detail.bossProfiles) {
    lines.push(`  Boss: ${boss.entityName} (${boss.phaseCount} phases)`);
    lines.push(`    ${boss.difficultyNote}`);
    for (const phase of boss.phaseTimeline) {
      const adds = phase.tagChanges.add.length > 0 ? ` +[${phase.tagChanges.add.join(', ')}]` : '';
      const removes = phase.tagChanges.remove.length > 0 ? ` -[${phase.tagChanges.remove.join(', ')}]` : '';
      lines.push(`    Phase @${Math.round(phase.hpThreshold * 100)}% HP: ${phase.narrativeKey}${adds}${removes}`);
    }
  }

  if (detail.analysis.warnings.length > 0) {
    lines.push('  Warnings:');
    for (const w of detail.analysis.warnings) {
      lines.push(`    ! ${w}`);
    }
  }
  lines.push(DIVIDER);

  return lines.join('\n');
}

/** Compact atmospheric encounter summary for the narrator */
export function formatEncounterDetailForNarrator(detail: EncounterDetail): string {
  const enc = detail.encounter;
  const danger = detail.analysis.dangerRating;
  const bossNames = detail.bossProfiles.map(b => b.entityName);
  const parts: string[] = [];

  parts.push(`${enc.name}: ${danger.level} encounter (${detail.tacticalExpectations.length} combatants)`);

  if (bossNames.length > 0) {
    parts.push(`Led by ${bossNames.join(' and ')}`);
  }

  if (enc.narrativeHooks?.tone) {
    parts.push(enc.narrativeHooks.tone);
  }

  return parts.join('. ') + '.';
}

/** Boss profile detail for the AI director */
export function formatBossProfileForDirector(profile: BossProfile): string {
  const lines: string[] = [];
  lines.push(`Boss: ${profile.entityName} (${profile.entityId})`);
  lines.push(`  ${profile.difficultyNote}`);
  if (profile.currentHpRatio != null) {
    lines.push(`  Current HP: ${Math.round(profile.currentHpRatio * 100)}%`);
  }
  lines.push(`  Phases (${profile.phaseCount}):`);
  for (const phase of profile.phaseTimeline) {
    const adds = phase.tagChanges.add.length > 0 ? ` +[${phase.tagChanges.add.join(', ')}]` : '';
    const removes = phase.tagChanges.remove.length > 0 ? ` -[${phase.tagChanges.remove.join(', ')}]` : '';
    const spawns = phase.spawns.length > 0 ? ` spawns: ${phase.spawns.join(', ')}` : '';
    const bias = phase.biasShift ? ' [bias shift]' : '';
    lines.push(`    @${Math.round(phase.hpThreshold * 100)}% HP → ${phase.narrativeKey}${adds}${removes}${spawns}${bias}`);
  }
  return lines.join('\n');
}

/** Format a tactical expectation for display */
export function formatTacticalExpectation(expectation: TacticalExpectation): string {
  const lines: string[] = [];
  lines.push(`Role: ${expectation.role}`);
  lines.push(`  Behavior: ${expectation.likelyBehavior}`);
  lines.push(`  Threat: ${expectation.playerThreat}`);
  lines.push(`  Counter: ${expectation.counterHint}`);
  lines.push(`  Position: ${expectation.positionTendency} | Morale: ${expectation.moraleProfile}`);
  return lines.join('\n');
}

/** Full combat content overview for the AI director */
export function formatCombatSummaryForDirector(summary: CombatContentSummary): string {
  const lines: string[] = [];
  lines.push(DIVIDER);
  lines.push('Combat Content Summary');
  lines.push(DIVIDER);
  lines.push(`  Encounters: ${summary.encounterCount}`);
  lines.push(`  Unique entities: ${summary.uniqueEntityCount}`);
  lines.push(`  Avg participants: ${summary.averageParticipants.toFixed(1)}`);

  lines.push('  Danger distribution:');
  for (const [level, count] of Object.entries(summary.dangerDistribution)) {
    if (count > 0) lines.push(`    ${level}: ${count}`);
  }

  const roleEntries = Object.entries(summary.roleDistribution);
  if (roleEntries.length > 0) {
    lines.push('  Role distribution:');
    for (const [role, count] of roleEntries) {
      lines.push(`    ${role}: ${count}`);
    }
  }

  const compEntries = Object.entries(summary.compositionDistribution);
  if (compEntries.length > 0) {
    lines.push('  Composition types:');
    for (const [comp, count] of compEntries) {
      lines.push(`    ${comp}: ${count}`);
    }
  }

  if (summary.bossList.length > 0) {
    lines.push('  Bosses:');
    for (const boss of summary.bossList) {
      lines.push(`    ${boss.entityName} in "${boss.encounterName}"`);
    }
  }

  if (summary.advisories.length > 0) {
    lines.push('  Advisories:');
    for (const a of summary.advisories) {
      lines.push(`    ~ ${a}`);
    }
  }
  lines.push(DIVIDER);

  return lines.join('\n');
}

/** Compact combat overview for the narrator */
export function formatCombatSummaryForNarrator(summary: CombatContentSummary): string {
  const parts: string[] = [];
  parts.push(`${summary.encounterCount} encounters across ${Object.keys(summary.encountersByZone).length} zones`);

  const dangerParts: string[] = [];
  for (const [level, count] of Object.entries(summary.dangerDistribution)) {
    if (count > 0) dangerParts.push(`${count} ${level}`);
  }
  if (dangerParts.length > 0) parts.push(dangerParts.join(', '));

  if (summary.bossList.length > 0) {
    parts.push(`${summary.bossList.length} boss encounter(s)`);
  }

  return parts.join('. ') + '.';
}

/** Per-region combat detail for the AI director */
export function formatRegionCombatForDirector(overview: RegionCombatOverview): string {
  const lines: string[] = [];
  lines.push(`Region: ${overview.districtName} (${overview.districtId})`);
  lines.push(`  Encounters: ${overview.encounterCount}`);
  if (overview.districtThreatLevel != null) {
    lines.push(`  Threat level: ${overview.districtThreatLevel}`);
  }
  if (overview.bossEncounterCount > 0) {
    lines.push(`  Boss encounters: ${overview.bossEncounterCount}`);
  }
  if (overview.dominantRoles.length > 0) {
    lines.push(`  Dominant roles: ${overview.dominantRoles.join(', ')}`);
  }

  const dangerParts: string[] = [];
  for (const [level, count] of Object.entries(overview.dangerSpread)) {
    if (count > 0) dangerParts.push(`${level}: ${count}`);
  }
  if (dangerParts.length > 0) {
    lines.push(`  Danger spread: ${dangerParts.join(', ')}`);
  }

  if (overview.advisories.length > 0) {
    for (const a of overview.advisories) {
      lines.push(`  ~ ${a}`);
    }
  }

  return lines.join('\n');
}

/** Audit results formatted for the AI director */
export function formatAuditForDirector(audit: ProjectCombatAudit): string {
  const lines: string[] = [];
  lines.push(DIVIDER);
  lines.push(`Combat Audit: ${audit.totalEncounters} encounters, ${audit.totalWarnings} warnings, ${audit.totalAdvisories} advisories`);
  lines.push(DIVIDER);

  for (const result of audit.encounterResults) {
    if (result.warnings.length === 0) continue;
    lines.push(`  ${result.encounterName} (${result.encounterId}):`);
    for (const w of result.warnings) {
      const icon = w.severity === 'warning' ? '!' : w.severity === 'advisory' ? '~' : 'i';
      lines.push(`    [${icon}] ${w.message}`);
    }
  }

  if (audit.projectAdvisories.length > 0) {
    lines.push('  Project-level:');
    for (const w of audit.projectAdvisories) {
      const icon = w.severity === 'warning' ? '!' : w.severity === 'advisory' ? '~' : 'i';
      lines.push(`    [${icon}] ${w.message}`);
    }
  }

  lines.push(DIVIDER);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Export Functions
// ---------------------------------------------------------------------------

/** Combat content summary as Markdown */
export function formatCombatSummaryMarkdown(summary: CombatContentSummary): string {
  const lines: string[] = [];
  lines.push('# Combat Content Summary');
  lines.push('');
  lines.push(`**Encounters:** ${summary.encounterCount} | **Unique Entities:** ${summary.uniqueEntityCount} | **Avg Participants:** ${summary.averageParticipants.toFixed(1)}`);
  lines.push('');

  // Danger table
  const dangerEntries = Object.entries(summary.dangerDistribution).filter(([, n]) => n > 0);
  if (dangerEntries.length > 0) {
    lines.push('## Danger Distribution');
    lines.push('');
    lines.push('| Tier | Count |');
    lines.push('|------|-------|');
    for (const [level, count] of dangerEntries) {
      lines.push(`| ${level} | ${count} |`);
    }
    lines.push('');
  }

  // Role table
  const roleEntries = Object.entries(summary.roleDistribution);
  if (roleEntries.length > 0) {
    lines.push('## Role Distribution');
    lines.push('');
    lines.push('| Role | Count |');
    lines.push('|------|-------|');
    for (const [role, count] of roleEntries) {
      lines.push(`| ${role} | ${count} |`);
    }
    lines.push('');
  }

  // Bosses
  if (summary.bossList.length > 0) {
    lines.push('## Bosses');
    lines.push('');
    for (const boss of summary.bossList) {
      lines.push(`- **${boss.entityName}** in "${boss.encounterName}"`);
    }
    lines.push('');
  }

  // Advisories
  if (summary.advisories.length > 0) {
    lines.push('## Advisories');
    lines.push('');
    for (const a of summary.advisories) {
      lines.push(`> ${a}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/** Combat content summary as clean JSON-serializable object */
export function formatCombatSummaryJSON(summary: CombatContentSummary): object {
  return {
    encounterCount: summary.encounterCount,
    uniqueEntityCount: summary.uniqueEntityCount,
    averageParticipants: Math.round(summary.averageParticipants * 10) / 10,
    dangerDistribution: Object.fromEntries(
      Object.entries(summary.dangerDistribution).filter(([, n]) => n > 0),
    ),
    roleDistribution: { ...summary.roleDistribution },
    compositionDistribution: { ...summary.compositionDistribution },
    bossList: summary.bossList,
    encountersByZone: { ...summary.encountersByZone },
    advisories: summary.advisories,
  };
}
