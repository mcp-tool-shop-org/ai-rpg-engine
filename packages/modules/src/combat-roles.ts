// combat-roles — role templates, encounter composition, boss phases, danger rating
//
// Pure types + config + utility functions. NOT an EngineModule.
// Role templates are named bundles of PackBias + engagement tags + HP/stamina
// multipliers. Encounters are static content data for authoring, not runtime.
// Boss phases are the one runtime addition (thin event listener).

import type {
  EngineModule,
  EntityState,
  ResolvedEvent,
  WorldState,
} from '@ai-rpg-engine/core';
import { nextId } from '@ai-rpg-engine/core';
import type { PackBias, CombatIntentType } from './combat-intent.js';
import type { CombatStatMapping } from './combat-core.js';
import { DEFAULT_STAT_MAPPING } from './combat-core.js';

// ---------------------------------------------------------------------------
// Combat Role System
// ---------------------------------------------------------------------------

export type CombatRole =
  | 'brute'
  | 'skirmisher'
  | 'backliner'
  | 'bodyguard'
  | 'coward'
  | 'boss'
  | 'minion'
  | 'elite';

export type CombatRoleTemplate = {
  role: CombatRole;
  /** PackBias to apply when this role is active */
  bias: PackBias;
  /** Tags to add for engagement system (e.g. 'ranged' → BACKLINE, 'bodyguard' → PROTECTED) */
  engagementTags: string[];
  /** HP multiplier relative to base (1.0 = no change) */
  hpMultiplier: number;
  /** Stamina multiplier relative to base */
  staminaMultiplier: number;
  /** Stat emphasis hints (advisory for content authors) */
  statEmphasis: { primary: string; secondary?: string };
  /** Description for content authors */
  description: string;
};

export const BUILTIN_COMBAT_ROLES: Record<CombatRole, CombatRoleTemplate> = {
  brute: {
    role: 'brute',
    bias: {
      tag: 'role:brute',
      name: 'brute-aggression',
      modifiers: { attack: 5, guard: -2, disengage: -3, finish: 3 },
      moraleFleeThreshold: 15,
    },
    engagementTags: [],
    hpMultiplier: 1.5,
    staminaMultiplier: 1.0,
    statEmphasis: { primary: 'attack' },
    description: 'Heavy hitter. High HP, aggressive, hard to scare off.',
  },
  skirmisher: {
    role: 'skirmisher',
    bias: {
      tag: 'role:skirmisher',
      name: 'skirmisher-flanker',
      modifiers: { pressure: 5, attack: 2, disengage: 3, guard: -3 },
    },
    engagementTags: [],
    hpMultiplier: 0.8,
    staminaMultiplier: 1.3,
    statEmphasis: { primary: 'precision', secondary: 'attack' },
    description: 'Fast and evasive. Pressures backline, disengages when cornered.',
  },
  backliner: {
    role: 'backliner',
    bias: {
      tag: 'role:backliner',
      name: 'backliner-cautious',
      modifiers: { guard: 3, disengage: 5, attack: -2, protect: 2 },
    },
    engagementTags: ['ranged'],
    hpMultiplier: 0.7,
    staminaMultiplier: 1.0,
    statEmphasis: { primary: 'precision' },
    description: 'Fragile ranged attacker. Stays behind allies, flees if engaged.',
  },
  bodyguard: {
    role: 'bodyguard',
    bias: {
      tag: 'role:bodyguard',
      name: 'bodyguard-shield',
      modifiers: { protect: 5, guard: 4, attack: -2, disengage: -3 },
    },
    engagementTags: ['bodyguard'],
    hpMultiplier: 1.3,
    staminaMultiplier: 1.0,
    statEmphasis: { primary: 'resolve', secondary: 'attack' },
    description: 'Defensive anchor. Protects allies, rarely attacks first.',
  },
  coward: {
    role: 'coward',
    bias: {
      tag: 'role:coward',
      name: 'coward-flee',
      modifiers: { disengage: 8, attack: -3, guard: 2, finish: -3 },
      moraleFleeThreshold: 50,
    },
    engagementTags: [],
    hpMultiplier: 0.6,
    staminaMultiplier: 1.0,
    statEmphasis: { primary: 'precision' },
    description: 'Runs at the first sign of trouble. Low HP, high flee threshold.',
  },
  boss: {
    role: 'boss',
    bias: {
      tag: 'role:boss',
      name: 'boss-commanding',
      modifiers: { attack: 3, guard: 3, pressure: 3, finish: 2 },
      moraleFleeThreshold: 5,
    },
    engagementTags: [],
    hpMultiplier: 3.0,
    staminaMultiplier: 2.0,
    statEmphasis: { primary: 'attack', secondary: 'resolve' },
    description: 'Phase-shifting leader. High HP, multiple behavior states.',
  },
  minion: {
    role: 'minion',
    bias: {
      tag: 'role:minion',
      name: 'minion-swarm',
      modifiers: { attack: 3, pressure: 3, guard: -5, disengage: -3, protect: -3 },
      moraleFleeThreshold: 40,
    },
    engagementTags: [],
    hpMultiplier: 0.4,
    staminaMultiplier: 0.8,
    statEmphasis: { primary: 'attack' },
    description: 'Expendable fodder. Low HP, attacks in numbers, flees when alone.',
  },
  elite: {
    role: 'elite',
    bias: {
      tag: 'role:elite',
      name: 'elite-tactical',
      modifiers: { attack: 2, guard: 2, pressure: 2, finish: 2 },
      moraleFleeThreshold: 15,
    },
    engagementTags: [],
    hpMultiplier: 1.8,
    staminaMultiplier: 1.5,
    statEmphasis: { primary: 'attack', secondary: 'precision' },
    description: 'Tougher, smarter version of a standard enemy. Well-rounded.',
  },
};

/** All valid CombatRole values */
export const COMBAT_ROLES: CombatRole[] = Object.keys(BUILTIN_COMBAT_ROLES) as CombatRole[];

// ---------------------------------------------------------------------------
// Encounter Composition
// ---------------------------------------------------------------------------

export type EncounterComposition =
  | 'solo'
  | 'patrol'
  | 'ambush'
  | 'boss-fight'
  | 'horde'
  | 'duel'
  | 'custom';

export type EncounterParticipant = {
  entityId: string;
  role?: CombatRole;
  zoneId?: string;
};

export type EncounterDefinition = {
  id: string;
  name: string;
  participants: EncounterParticipant[];
  composition?: EncounterComposition;
  validZoneIds?: string[];
  validZoneTags?: string[];
  narrativeHooks?: {
    tone?: string;
    trigger?: string;
    stakes?: string;
  };
};

/** Create an encounter definition from a composition template */
export function createEncounter(
  id: string,
  name: string,
  composition: EncounterComposition,
  participants: EncounterParticipant[],
  overrides?: Partial<Omit<EncounterDefinition, 'id' | 'name' | 'participants' | 'composition'>>,
): EncounterDefinition {
  return {
    id,
    name,
    participants,
    composition,
    ...overrides,
  };
}

/** Validate an encounter definition, returning warning strings */
export function validateEncounter(
  encounter: EncounterDefinition,
  entities: Record<string, EntityState>,
): string[] {
  const warnings: string[] = [];

  // Check for missing entities
  for (const p of encounter.participants) {
    if (!entities[p.entityId]) {
      warnings.push(`Participant '${p.entityId}' not found in entities`);
    }
  }

  if (encounter.participants.length === 0) {
    warnings.push('Encounter has no participants');
    return warnings;
  }

  // Check role composition
  const roles = encounter.participants
    .map(p => p.role ?? getEntityRole(entities[p.entityId]))
    .filter((r): r is CombatRole => r != null);

  if (roles.length > 0) {
    const uniqueRoles = new Set(roles);

    // All same role warning
    if (uniqueRoles.size === 1 && roles.length > 1) {
      warnings.push(`All participants have the same role: ${roles[0]}`);
    }

    // Boss-fight composition without a boss
    if (encounter.composition === 'boss-fight' && !roles.includes('boss')) {
      warnings.push('Boss-fight composition has no boss participant');
    }

    // Horde without minions
    if (encounter.composition === 'horde' && !roles.includes('minion')) {
      warnings.push('Horde composition has no minion participants');
    }
  }

  return warnings;
}

/** Collect all PackBias entries for participants that have role tags */
export function collectEncounterBiases(
  encounter: EncounterDefinition,
  entities: Record<string, EntityState>,
): PackBias[] {
  const biases: PackBias[] = [];
  for (const p of encounter.participants) {
    const entity = entities[p.entityId];
    if (!entity) continue;
    const role = p.role ?? getEntityRole(entity);
    if (role && BUILTIN_COMBAT_ROLES[role]) {
      biases.push(BUILTIN_COMBAT_ROLES[role].bias);
    }
  }
  return biases;
}

// ---------------------------------------------------------------------------
// Boss Phase System
// ---------------------------------------------------------------------------

export type BossPhaseTransition = {
  /** HP ratio threshold (0-1) — triggers when HP drops at or below this */
  hpThreshold: number;
  /** Tags to add when entering this phase */
  addTags?: string[];
  /** Tags to remove when entering this phase */
  removeTags?: string[];
  /** New bias modifiers to merge (applied as inline PackBias) */
  newBiasModifiers?: Partial<Record<CombatIntentType, number>>;
  /** Narrative key for the narrator (e.g. 'enraged', 'desperate') */
  narrativeKey: string;
  /** Entity IDs to spawn when this phase triggers */
  spawnEntityIds?: string[];
};

export type BossDefinition = {
  entityId: string;
  phases: BossPhaseTransition[];
  /** If true, boss cannot flee (moraleFleeThreshold forced to 0) */
  immovable?: boolean;
};

/** Create an EngineModule that listens for damage and triggers boss phase transitions */
export function createBossPhaseListener(bossDef: BossDefinition): EngineModule {
  const activatedPhases = new Set<number>();

  return {
    id: `boss-phase:${bossDef.entityId}`,
    version: '0.1.0',

    register(ctx) {
      ctx.events.on('combat.damage.applied', (event: ResolvedEvent, world: WorldState) => {
        const targetId = event.payload.targetId as string;
        if (targetId !== bossDef.entityId) return;

        const entity = world.entities[bossDef.entityId];
        if (!entity) return;

        const hp = entity.resources.hp ?? 0;
        const maxHp = entity.resources.maxHp ?? hp;
        if (maxHp <= 0) return;
        const hpRatio = hp / maxHp;

        // Check phases in order (sorted by threshold descending)
        const sorted = bossDef.phases
          .map((p, i) => ({ ...p, index: i }))
          .sort((a, b) => b.hpThreshold - a.hpThreshold);

        for (const phase of sorted) {
          if (activatedPhases.has(phase.index)) continue;
          if (hpRatio > phase.hpThreshold) continue;

          // Activate this phase
          activatedPhases.add(phase.index);

          // Swap tags
          if (phase.removeTags) {
            entity.tags = entity.tags.filter(t => !phase.removeTags!.includes(t));
          }
          if (phase.addTags) {
            for (const tag of phase.addTags) {
              if (!entity.tags.includes(tag)) entity.tags.push(tag);
            }
          }

          // Emit phase transition event
          ctx.events.emit({
            id: nextId('evt'),
            type: 'boss.phase.transition',
            tick: event.tick,
            actorId: bossDef.entityId,
            payload: {
              entityId: bossDef.entityId,
              phaseIndex: phase.index,
              narrativeKey: phase.narrativeKey,
              hpRatio,
              addedTags: phase.addTags ?? [],
              removedTags: phase.removeTags ?? [],
            },
            targetIds: [bossDef.entityId],
            presentation: {
              channels: ['narrator', 'objective'],
              priority: 'critical',
            },
          });
        }
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Danger Rating
// ---------------------------------------------------------------------------

export type DangerRating = {
  /** Numeric danger score (0-100) */
  score: number;
  /** Human-readable danger level */
  level: 'trivial' | 'routine' | 'dangerous' | 'deadly' | 'overwhelming';
  /** Breakdown of contributing factors */
  factors: {
    entityCount: number;
    totalHp: number;
    totalAttack: number;
    hasBoss: boolean;
    roleBalance: string;
  };
};

/** Calculate danger rating for a set of enemies relative to a player entity */
export function calculateDangerRating(
  participants: EntityState[],
  playerEntity: EntityState,
  statMapping: CombatStatMapping = DEFAULT_STAT_MAPPING,
): DangerRating {
  if (participants.length === 0) {
    return {
      score: 0,
      level: 'trivial',
      factors: { entityCount: 0, totalHp: 0, totalAttack: 0, hasBoss: false, roleBalance: 'empty' },
    };
  }

  let totalHp = 0;
  let totalAttack = 0;
  let hasBoss = false;
  const roleCounts: Partial<Record<CombatRole, number>> = {};

  for (const e of participants) {
    totalHp += e.resources.hp ?? e.resources.maxHp ?? 0;
    totalAttack += e.stats[statMapping.attack] ?? 0;
    const role = getEntityRole(e);
    if (role) {
      roleCounts[role] = (roleCounts[role] ?? 0) + 1;
      if (role === 'boss') hasBoss = true;
    }
  }

  const playerHp = playerEntity.resources.maxHp ?? playerEntity.resources.hp ?? 1;
  const playerAttack = playerEntity.stats[statMapping.attack] ?? 1;

  // Score: weighted combination of HP ratio, attack ratio, count, boss presence
  const hpRatio = Math.min(totalHp / playerHp, 10);
  const attackRatio = Math.min(totalAttack / playerAttack, 10);
  const countFactor = Math.min(participants.length / 3, 3);
  const bossFactor = hasBoss ? 1.5 : 1.0;

  const rawScore = (hpRatio * 3 + attackRatio * 2 + countFactor * 2) * bossFactor;
  const score = Math.min(100, Math.round(rawScore * 5));

  // Role balance description
  const roleKeys = Object.keys(roleCounts);
  let roleBalance = 'untagged';
  if (roleKeys.length > 0) {
    if (roleKeys.length === 1 && participants.length > 1) {
      roleBalance = `all-${roleKeys[0]}`;
    } else if (roleKeys.length >= 3) {
      roleBalance = 'balanced';
    } else {
      roleBalance = roleKeys.join('+');
    }
  }

  const level = score <= 20 ? 'trivial'
    : score <= 40 ? 'routine'
    : score <= 60 ? 'dangerous'
    : score <= 80 ? 'deadly'
    : 'overwhelming';

  return {
    score,
    level,
    factors: {
      entityCount: participants.length,
      totalHp,
      totalAttack,
      hasBoss,
      roleBalance,
    },
  };
}

/** Format danger rating as a narrative signal for the AI narrator */
export function formatDangerForNarrator(rating: DangerRating): string {
  const lines: string[] = [];
  lines.push(`Danger: ${rating.level} (${rating.score}/100)`);
  lines.push(`  Enemies: ${rating.factors.entityCount}`);
  lines.push(`  Total HP: ${rating.factors.totalHp}  Total Attack: ${rating.factors.totalAttack}`);
  if (rating.factors.hasBoss) lines.push('  Boss present');
  lines.push(`  Composition: ${rating.factors.roleBalance}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Encounter Analysis
// ---------------------------------------------------------------------------

export type EncounterAnalysis = {
  encounter: EncounterDefinition;
  dangerRating: DangerRating;
  warnings: string[];
  participantPower: Array<{
    entityId: string;
    role: CombatRole | undefined;
    combatPower: number;
  }>;
};

/** Analyze an encounter for the simulation inspector / director prompt */
export function analyzeEncounter(
  encounter: EncounterDefinition,
  entities: Record<string, EntityState>,
  playerEntity: EntityState,
  statMapping: CombatStatMapping = DEFAULT_STAT_MAPPING,
): EncounterAnalysis {
  const warnings = validateEncounter(encounter, entities);

  const participantEntities: EntityState[] = [];
  const participantPower: EncounterAnalysis['participantPower'] = [];

  for (const p of encounter.participants) {
    const entity = entities[p.entityId];
    if (!entity) continue;
    participantEntities.push(entity);

    const role = p.role ?? getEntityRole(entity);
    const hp = entity.resources.hp ?? entity.resources.maxHp ?? 0;
    const attack = entity.stats[statMapping.attack] ?? 0;
    const combatPower = hp + attack * 3;

    participantPower.push({ entityId: p.entityId, role, combatPower });
  }

  const dangerRating = calculateDangerRating(participantEntities, playerEntity, statMapping);

  return { encounter, dangerRating, warnings, participantPower };
}

/** Format encounter analysis for the AI director prompt */
export function formatEncounterForDirector(analysis: EncounterAnalysis): string {
  const lines: string[] = [];
  const enc = analysis.encounter;
  lines.push(`Encounter: ${enc.name} (${enc.id})`);
  if (enc.composition) lines.push(`  Composition: ${enc.composition}`);
  lines.push(`  Danger: ${analysis.dangerRating.level} (${analysis.dangerRating.score}/100)`);

  if (enc.narrativeHooks) {
    if (enc.narrativeHooks.tone) lines.push(`  Tone: ${enc.narrativeHooks.tone}`);
    if (enc.narrativeHooks.trigger) lines.push(`  Trigger: ${enc.narrativeHooks.trigger}`);
    if (enc.narrativeHooks.stakes) lines.push(`  Stakes: ${enc.narrativeHooks.stakes}`);
  }

  lines.push(`  Participants (${analysis.participantPower.length}):`);
  for (const p of analysis.participantPower) {
    const roleStr = p.role ? ` [${p.role}]` : '';
    lines.push(`    ${p.entityId}${roleStr} — power ${p.combatPower}`);
  }

  if (analysis.warnings.length > 0) {
    lines.push(`  Warnings:`);
    for (const w of analysis.warnings) {
      lines.push(`    ! ${w}`);
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Authoring Helpers
// ---------------------------------------------------------------------------

/** Get the combat role from an entity's tags (first matching 'role:xxx') */
export function getEntityRole(entity: EntityState | undefined): CombatRole | undefined {
  if (!entity) return undefined;
  const roleTag = entity.tags.find(t => t.startsWith('role:'));
  if (!roleTag) return undefined;
  const role = roleTag.slice(5) as CombatRole;
  return BUILTIN_COMBAT_ROLES[role] ? role : undefined;
}

/** Collect all role biases from an array of entities */
export function getRoleBiases(entities: EntityState[]): PackBias[] {
  const biases: PackBias[] = [];
  const seen = new Set<CombatRole>();
  for (const entity of entities) {
    const role = getEntityRole(entity);
    if (role && !seen.has(role)) {
      seen.add(role);
      biases.push(BUILTIN_COMBAT_ROLES[role].bias);
    }
  }
  return biases;
}

// ---------------------------------------------------------------------------
// Tactical Expectations (Role Vocabulary)
// ---------------------------------------------------------------------------

export type TacticalExpectation = {
  role: CombatRole;
  /** What this role likely does in combat */
  likelyBehavior: string;
  /** What the player should expect facing this role */
  playerThreat: string;
  /** Advisory: how to counter this role */
  counterHint: string;
  /** Engagement position tendency */
  positionTendency: 'frontline' | 'backline' | 'flanker' | 'variable';
  /** Morale behavior */
  moraleProfile: 'stands-firm' | 'breaks-early' | 'never-flees' | 'unpredictable';
};

const TACTICAL_EXPECTATIONS: Record<CombatRole, TacticalExpectation> = {
  brute: {
    role: 'brute',
    likelyBehavior: 'Aggressive frontline pressure, rarely retreats, finishes wounded targets.',
    playerThreat: 'High damage, hard to dislodge, absorbs a lot of punishment.',
    counterHint: 'Focus fire before support arrives. Low precision makes guard effective.',
    positionTendency: 'frontline',
    moraleProfile: 'stands-firm',
  },
  skirmisher: {
    role: 'skirmisher',
    likelyBehavior: 'Pressures backline, repositions frequently, disengages when cornered.',
    playerThreat: 'Disrupts positioning, hard to pin down, chips away at vulnerable targets.',
    counterHint: 'Force engagement — once cornered, low HP makes them fragile.',
    positionTendency: 'flanker',
    moraleProfile: 'unpredictable',
  },
  backliner: {
    role: 'backliner',
    likelyBehavior: 'Stays behind allies, guards cautiously, disengages immediately if threatened.',
    playerThreat: 'Steady ranged damage from safety. Protected by bodyguards and frontline.',
    counterHint: 'Pressure or flank to force engagement. Very fragile once exposed.',
    positionTendency: 'backline',
    moraleProfile: 'breaks-early',
  },
  bodyguard: {
    role: 'bodyguard',
    likelyBehavior: 'Shields allies, absorbs damage, rarely attacks offensively.',
    playerThreat: 'Prevents targeting key enemies. Must be removed or bypassed.',
    counterHint: 'Ignore or overwhelm — focusing the bodyguard wastes damage on high HP.',
    positionTendency: 'frontline',
    moraleProfile: 'stands-firm',
  },
  coward: {
    role: 'coward',
    likelyBehavior: 'Attacks only when safe, flees at the first sign of real danger.',
    playerThreat: 'Low direct threat. May waste player actions chasing.',
    counterHint: 'Ignore unless blocking an objective. Will flee on its own.',
    positionTendency: 'variable',
    moraleProfile: 'breaks-early',
  },
  boss: {
    role: 'boss',
    likelyBehavior: 'Balanced aggression with phase shifts at HP thresholds. Changes tactics mid-fight.',
    playerThreat: 'Massive HP pool, multiple behavior states, often spawns reinforcements.',
    counterHint: 'Prepare for phase transitions. Clear support first when possible.',
    positionTendency: 'frontline',
    moraleProfile: 'never-flees',
  },
  minion: {
    role: 'minion',
    likelyBehavior: 'Swarms aggressively, ignores defense, flees when isolated.',
    playerThreat: 'Dangerous in numbers. Individually weak but collectively overwhelming.',
    counterHint: 'AoE or focus fire to thin the pack. Isolated minions flee quickly.',
    positionTendency: 'frontline',
    moraleProfile: 'breaks-early',
  },
  elite: {
    role: 'elite',
    likelyBehavior: 'Well-rounded tactics, adapts to situation, finishes wounded targets.',
    playerThreat: 'No obvious weakness. High HP and consistent damage output.',
    counterHint: 'Treat as a priority target. No single counter — requires sustained focus.',
    positionTendency: 'frontline',
    moraleProfile: 'stands-firm',
  },
};

/** Get tactical expectations for a combat role (advisory, not deterministic) */
export function getTacticalExpectation(role: CombatRole): TacticalExpectation {
  return TACTICAL_EXPECTATIONS[role];
}

/** Validate a BossDefinition, returning warning strings */
export function validateBossDefinition(
  bossDef: BossDefinition,
  entities?: Record<string, EntityState>,
): string[] {
  const warnings: string[] = [];

  if (bossDef.phases.length === 0) {
    warnings.push('Boss definition has no phases');
    return warnings;
  }

  const seenThresholds = new Set<number>();
  let prevThreshold = Infinity;

  for (let i = 0; i < bossDef.phases.length; i++) {
    const phase = bossDef.phases[i];

    if (phase.hpThreshold < 0 || phase.hpThreshold > 1) {
      warnings.push(`Phase ${i}: hpThreshold ${phase.hpThreshold} out of range (0-1)`);
    }

    if (seenThresholds.has(phase.hpThreshold)) {
      warnings.push(`Phase ${i}: duplicate hpThreshold ${phase.hpThreshold}`);
    }
    seenThresholds.add(phase.hpThreshold);

    if (phase.hpThreshold > prevThreshold) {
      warnings.push(`Phase ${i}: thresholds not in descending order (${phase.hpThreshold} > ${prevThreshold})`);
    }
    prevThreshold = phase.hpThreshold;

    if (!phase.narrativeKey || phase.narrativeKey.trim() === '') {
      warnings.push(`Phase ${i}: missing narrativeKey`);
    }
  }

  // Trace tag add/remove across phases to detect conflicts
  const tagState = new Set<string>();
  if (entities) {
    const entity = entities[bossDef.entityId];
    if (!entity) {
      warnings.push(`Entity '${bossDef.entityId}' not found`);
    } else {
      if (!entity.tags.includes('role:boss')) {
        warnings.push(`Entity '${bossDef.entityId}' missing 'role:boss' tag`);
      }
      // Seed tag state from entity's initial tags
      for (const t of entity.tags) tagState.add(t);
    }
  }

  for (let i = 0; i < bossDef.phases.length; i++) {
    const phase = bossDef.phases[i];

    // Warn if removing a tag that was never added (by entity or prior phase)
    if (phase.removeTags) {
      for (const tag of phase.removeTags) {
        if (!tagState.has(tag)) {
          warnings.push(`Phase ${i} (${phase.narrativeKey}): removes tag "${tag}" which is not present at this point`);
        }
        tagState.delete(tag);
      }
    }

    // Track added tags
    if (phase.addTags) {
      for (const tag of phase.addTags) {
        if (tagState.has(tag)) {
          warnings.push(`Phase ${i} (${phase.narrativeKey}): adds tag "${tag}" which is already present`);
        }
        tagState.add(tag);
      }
    }
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// Authoring Helpers
// ---------------------------------------------------------------------------

/** Create an enemy entity with role template applied (HP/stamina multipliers, tags) */
export function createRoledEnemy(
  base: EntityState,
  role: CombatRole,
  overrides?: Partial<EntityState>,
): EntityState {
  const template = BUILTIN_COMBAT_ROLES[role];
  if (!template) return { ...base, ...overrides };

  const roleTag = `role:${role}`;
  const newTags = [...base.tags];
  if (!newTags.includes(roleTag)) newTags.push(roleTag);
  for (const tag of template.engagementTags) {
    if (!newTags.includes(tag)) newTags.push(tag);
  }

  const baseHp = base.resources.maxHp ?? base.resources.hp ?? 0;
  const baseStamina = base.resources.maxStamina ?? base.resources.stamina ?? 0;
  const scaledHp = Math.round(baseHp * template.hpMultiplier);
  const scaledStamina = Math.round(baseStamina * template.staminaMultiplier);

  return {
    ...base,
    tags: newTags,
    resources: {
      ...base.resources,
      hp: scaledHp,
      maxHp: scaledHp,
      stamina: scaledStamina,
      maxStamina: scaledStamina,
    },
    ...overrides,
  };
}
