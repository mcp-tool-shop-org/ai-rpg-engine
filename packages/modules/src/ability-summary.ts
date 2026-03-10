// ability-summary — pack summary, audit, and export surfaces for ability content
//
// Pure functions for inspecting, summarizing, and auditing ability packs.
// Follows combat-summary.ts patterns. No runtime state, no EngineModule.
// Designed for World Forge, CLI tools, and test harnesses.

import type { AbilityDefinition, StatusDefinition } from '@ai-rpg-engine/content-schema';

// ---------------------------------------------------------------------------
// Summary Types
// ---------------------------------------------------------------------------

export type CooldownBand = 'instant' | 'short' | 'medium' | 'long';

export type AbilityPackSummary = {
  /** Genre label (e.g., 'fantasy', 'vampire') */
  genre: string;
  /** Total abilities in pack */
  abilityCount: number;
  /** Cost breakdown: resourceId → total cost across all abilities */
  costSummary: Record<string, number>;
  /** Cooldown distribution: band → count */
  cooldownBands: Record<CooldownBand, number>;
  /** Effect type distribution: effectType → count */
  effectDistribution: Record<string, number>;
  /** Target type distribution: targetType → count */
  targetDistribution: Record<string, number>;
  /** Tag distribution: tag → count */
  tagDistribution: Record<string, number>;
  /** Average cooldown (0 if none) */
  averageCooldown: number;
  /** Average cost per ability (total cost units / ability count) */
  averageCostPerAbility: number;
  /** Abilities sorted by cooldown descending */
  abilitiesByCooldown: Array<{ id: string; name: string; cooldown: number }>;
  /** Status IDs referenced by apply-status effects */
  statusesApplied: string[];
  /** Status IDs referenced by remove-status effects */
  statusesRemoved: string[];
  /** Tags referenced by remove-status-by-tag effects */
  cleanseTagsCovered: string[];
  /** Abilities grouped by category (derived from tags) */
  abilitiesByCategory: Record<'offensive' | 'defensive' | 'control' | 'utility', string[]>;
  /** Abilities grouped by cost resource type */
  abilitiesByResourceType: Record<string, string[]>;
  /** Count of entities with resistance profiles (requires entities param) */
  resistanceProfileCount: number;
  /** Auto-derived one-sentence pack identity */
  packIdentity: string;
};

export type BalanceFlag = {
  genre: string;
  abilityId: string;
  abilityName: string;
  severity: 'info' | 'advisory' | 'warning';
  category: 'zero-cost' | 'no-cooldown' | 'extreme-damage' | 'cross-pack-outlier' | 'no-cleanse' | 'status-heavy-low-counter' | 'resource-economy-skew' | 'signature-missing' | 'thin-pack' | 'no-tactical-triangle';
  message: string;
};

export type BalanceAudit = {
  flags: BalanceFlag[];
  totalAbilities: number;
  totalFlags: number;
  /** Per-genre flag counts */
  flagsByGenre: Record<string, number>;
};

// ---------------------------------------------------------------------------
// Summary Functions
// ---------------------------------------------------------------------------

function getCooldownBand(cooldown: number | undefined): CooldownBand {
  if (!cooldown || cooldown === 0) return 'instant';
  if (cooldown <= 2) return 'short';
  if (cooldown <= 4) return 'medium';
  return 'long';
}

/** Summarize an ability pack's structure and cost economy */
export function summarizeAbilityPack(
  genre: string,
  abilities: AbilityDefinition[],
  opts?: { entities?: Array<{ id: string; resistances?: Record<string, string> }> },
): AbilityPackSummary {
  const costSummary: Record<string, number> = {};
  const cooldownBands: Record<CooldownBand, number> = { instant: 0, short: 0, medium: 0, long: 0 };
  const effectDistribution: Record<string, number> = {};
  const targetDistribution: Record<string, number> = {};
  const tagDistribution: Record<string, number> = {};

  const statusesAppliedSet = new Set<string>();
  const statusesRemovedSet = new Set<string>();
  const cleanseTagsSet = new Set<string>();

  let totalCooldown = 0;
  let totalCostUnits = 0;
  let abilitiesWithCooldown = 0;

  for (const ability of abilities) {
    // Costs
    if (ability.costs) {
      for (const cost of ability.costs) {
        costSummary[cost.resourceId] = (costSummary[cost.resourceId] ?? 0) + cost.amount;
        totalCostUnits += cost.amount;
      }
    }

    // Cooldowns
    const cd = ability.cooldown ?? 0;
    cooldownBands[getCooldownBand(cd)]++;
    if (cd > 0) {
      totalCooldown += cd;
      abilitiesWithCooldown++;
    }

    // Effects
    for (const effect of ability.effects) {
      effectDistribution[effect.type] = (effectDistribution[effect.type] ?? 0) + 1;
    }

    // Target types
    targetDistribution[ability.target.type] = (targetDistribution[ability.target.type] ?? 0) + 1;

    // Tags
    for (const tag of ability.tags) {
      tagDistribution[tag] = (tagDistribution[tag] ?? 0) + 1;
    }

    // Status tracking
    for (const effect of ability.effects) {
      if (effect.type === 'apply-status' && typeof effect.params?.statusId === 'string') {
        statusesAppliedSet.add(effect.params.statusId as string);
      }
      if (effect.type === 'remove-status' && typeof effect.params?.statusId === 'string') {
        statusesRemovedSet.add(effect.params.statusId as string);
      }
      if (effect.type === 'remove-status-by-tag') {
        const tagsParam = (effect.params?.tags as string) ?? (effect.params?.tag as string) ?? '';
        for (const t of tagsParam.split(',').map((s) => s.trim()).filter((s) => s.length > 0)) {
          cleanseTagsSet.add(t);
        }
      }
    }
  }

  const abilitiesByCooldown = abilities
    .map((a) => ({ id: a.id, name: a.name, cooldown: a.cooldown ?? 0 }))
    .sort((a, b) => b.cooldown - a.cooldown);

  // Categorize abilities by function
  const abilitiesByCategory: Record<'offensive' | 'defensive' | 'control' | 'utility', string[]> = {
    offensive: [], defensive: [], control: [], utility: [],
  };
  const abilitiesByResourceType: Record<string, string[]> = {};

  for (const ability of abilities) {
    const tags = ability.tags;
    if (tags.includes('damage') || tags.includes('combat') && !tags.includes('debuff') && !tags.includes('buff')) {
      abilitiesByCategory.offensive.push(ability.id);
    } else if (tags.includes('heal') || tags.includes('buff') || tags.includes('cleanse')) {
      abilitiesByCategory.defensive.push(ability.id);
    } else if (tags.includes('debuff') || tags.includes('control')) {
      abilitiesByCategory.control.push(ability.id);
    } else {
      abilitiesByCategory.utility.push(ability.id);
    }

    // Group by cost resource
    if (ability.costs) {
      for (const cost of ability.costs) {
        if (!abilitiesByResourceType[cost.resourceId]) {
          abilitiesByResourceType[cost.resourceId] = [];
        }
        if (!abilitiesByResourceType[cost.resourceId].includes(ability.id)) {
          abilitiesByResourceType[cost.resourceId].push(ability.id);
        }
      }
    }
  }

  const resistanceProfileCount = opts?.entities
    ? opts.entities.filter((e) => e.resistances && Object.keys(e.resistances).length > 0).length
    : 0;

  return {
    genre,
    abilityCount: abilities.length,
    costSummary,
    cooldownBands,
    effectDistribution,
    targetDistribution,
    tagDistribution,
    averageCooldown: abilitiesWithCooldown > 0 ? totalCooldown / abilitiesWithCooldown : 0,
    averageCostPerAbility: abilities.length > 0 ? totalCostUnits / abilities.length : 0,
    abilitiesByCooldown,
    statusesApplied: [...statusesAppliedSet].sort(),
    statusesRemoved: [...statusesRemovedSet].sort(),
    cleanseTagsCovered: [...cleanseTagsSet].sort(),
    abilitiesByCategory,
    abilitiesByResourceType,
    resistanceProfileCount,
    packIdentity: derivePackIdentity(genre, abilitiesByCategory, cleanseTagsSet, costSummary),
  };
}

function derivePackIdentity(
  genre: string,
  categories: Record<'offensive' | 'defensive' | 'control' | 'utility', string[]>,
  cleanseTags: Set<string>,
  costSummary: Record<string, number>,
): string {
  const dominant = (['offensive', 'defensive', 'control', 'utility'] as const)
    .reduce((best, cat) => categories[cat].length > categories[best].length ? cat : best, 'offensive' as const);
  const nonStaminaCosts = Object.keys(costSummary).filter((r) => r !== 'stamina');
  const resource = nonStaminaCosts.length > 0 ? nonStaminaCosts[0] : 'stamina';
  const cleanse = cleanseTags.size > 0 ? ` + ${[...cleanseTags].join('/') } cleanse` : '';
  return `${genre}: ${dominant}-dominant, ${resource}-powered${cleanse}`;
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

/** Format ability pack summary as Markdown table */
export function formatAbilityPackMarkdown(summary: AbilityPackSummary): string {
  const lines: string[] = [];

  lines.push(`# ${summary.genre} Ability Pack`);
  lines.push('');
  lines.push(`**Abilities:** ${summary.abilityCount} | **Avg Cooldown:** ${summary.averageCooldown.toFixed(1)} | **Avg Cost/Ability:** ${summary.averageCostPerAbility.toFixed(1)}`);
  lines.push('');

  // Pack Identity
  lines.push('## Pack Identity');
  lines.push('');
  lines.push(summary.packIdentity);
  lines.push('');

  // Tactical Triangle
  const hasOffense = summary.abilitiesByCategory.offensive.length > 0;
  const hasDefense = summary.abilitiesByCategory.defensive.length > 0;
  const hasControl = summary.abilitiesByCategory.control.length > 0;
  lines.push(`**Tactical Triangle:** ${hasOffense ? 'Offense' : '—'} / ${hasDefense ? 'Defense' : '—'} / ${hasControl ? 'Control' : '—'} ${hasOffense && hasDefense && hasControl ? '(complete)' : '(incomplete)'}`);
  lines.push('');

  // Abilities table
  lines.push('## Abilities');
  lines.push('');
  lines.push('| Ability | Cooldown | Target |');
  lines.push('|---------|----------|--------|');
  for (const ab of summary.abilitiesByCooldown) {
    lines.push(`| ${ab.name} | ${ab.cooldown} | — |`);
  }
  lines.push('');

  // Cost summary
  const costEntries = Object.entries(summary.costSummary);
  if (costEntries.length > 0) {
    lines.push('## Cost Economy');
    lines.push('');
    lines.push('| Resource | Total Cost |');
    lines.push('|----------|-----------|');
    for (const [resource, total] of costEntries) {
      lines.push(`| ${resource} | ${total} |`);
    }
    lines.push('');
  }

  // Cooldown bands
  lines.push('## Cooldown Distribution');
  lines.push('');
  lines.push('| Band | Count |');
  lines.push('|------|-------|');
  for (const [band, count] of Object.entries(summary.cooldownBands)) {
    if (count > 0) lines.push(`| ${band} | ${count} |`);
  }
  lines.push('');

  // Effect types
  const effectEntries = Object.entries(summary.effectDistribution);
  if (effectEntries.length > 0) {
    lines.push('## Effect Types');
    lines.push('');
    lines.push('| Type | Count |');
    lines.push('|------|-------|');
    for (const [type, count] of effectEntries) {
      lines.push(`| ${type} | ${count} |`);
    }
    lines.push('');
  }

  // Categories
  const catEntries = Object.entries(summary.abilitiesByCategory).filter(([, ids]) => ids.length > 0);
  if (catEntries.length > 0) {
    lines.push('## Categories');
    lines.push('');
    for (const [category, ids] of catEntries) {
      lines.push(`- **${category}**: ${ids.join(', ')}`);
    }
    lines.push('');
  }

  // Status Interactions
  if (summary.statusesApplied.length > 0 || summary.cleanseTagsCovered.length > 0) {
    lines.push('## Status Interactions');
    lines.push('');
    if (summary.statusesApplied.length > 0) {
      lines.push(`- **Applies:** ${summary.statusesApplied.join(', ')}`);
    }
    if (summary.statusesRemoved.length > 0) {
      lines.push(`- **Removes:** ${summary.statusesRemoved.join(', ')}`);
    }
    if (summary.cleanseTagsCovered.length > 0) {
      lines.push(`- **Cleanse Coverage:** ${summary.cleanseTagsCovered.join(', ')}`);
    }
    lines.push('');
  }

  // Resistance Profiles
  if (summary.resistanceProfileCount > 0) {
    lines.push('## Resistance Profiles');
    lines.push('');
    lines.push(`- **Entities with resistances:** ${summary.resistanceProfileCount}`);
    lines.push('');
  }

  return lines.join('\n');
}

/** Format ability pack summary as JSON-serializable object */
export function formatAbilityPackJSON(summary: AbilityPackSummary): object {
  return {
    genre: summary.genre,
    abilityCount: summary.abilityCount,
    averageCooldown: Math.round(summary.averageCooldown * 10) / 10,
    averageCostPerAbility: Math.round(summary.averageCostPerAbility * 10) / 10,
    costSummary: { ...summary.costSummary },
    cooldownBands: { ...summary.cooldownBands },
    effectDistribution: { ...summary.effectDistribution },
    targetDistribution: { ...summary.targetDistribution },
    tagDistribution: { ...summary.tagDistribution },
    abilities: summary.abilitiesByCooldown,
    statusesApplied: summary.statusesApplied,
    statusesRemoved: summary.statusesRemoved,
    cleanseTagsCovered: summary.cleanseTagsCovered,
    abilitiesByCategory: { ...summary.abilitiesByCategory },
    abilitiesByResourceType: { ...summary.abilitiesByResourceType },
    resistanceProfileCount: summary.resistanceProfileCount,
  };
}

// ---------------------------------------------------------------------------
// Audit Functions
// ---------------------------------------------------------------------------

/** Audit multiple ability packs for balance outliers */
export function auditAbilityBalance(
  packs: Array<{ genre: string; abilities: AbilityDefinition[] }>,
): BalanceAudit {
  const flags: BalanceFlag[] = [];
  const flagsByGenre: Record<string, number> = {};

  // Collect per-ability metrics for cross-pack comparison
  const allDamageAmounts: Array<{ genre: string; abilityId: string; abilityName: string; amount: number }> = [];

  for (const { genre, abilities } of packs) {
    for (const ability of abilities) {
      // Zero-cost check
      if (!ability.costs || ability.costs.length === 0) {
        flags.push({
          genre,
          abilityId: ability.id,
          abilityName: ability.name,
          severity: 'advisory',
          category: 'zero-cost',
          message: `${ability.name} has no resource costs`,
        });
        flagsByGenre[genre] = (flagsByGenre[genre] ?? 0) + 1;
      }

      // No cooldown check
      if (!ability.cooldown || ability.cooldown === 0) {
        flags.push({
          genre,
          abilityId: ability.id,
          abilityName: ability.name,
          severity: 'info',
          category: 'no-cooldown',
          message: `${ability.name} has no cooldown`,
        });
        flagsByGenre[genre] = (flagsByGenre[genre] ?? 0) + 1;
      }

      // Collect damage amounts for cross-pack analysis
      for (const effect of ability.effects) {
        if (effect.type === 'damage' && typeof effect.params?.amount === 'number') {
          allDamageAmounts.push({
            genre,
            abilityId: ability.id,
            abilityName: ability.name,
            amount: effect.params.amount,
          });
        }
      }
    }
  }

  // Extreme damage check (>= 2x the mean damage across all packs)
  if (allDamageAmounts.length > 0) {
    const meanDamage = allDamageAmounts.reduce((sum, d) => sum + d.amount, 0) / allDamageAmounts.length;
    const threshold = meanDamage * 2;

    for (const entry of allDamageAmounts) {
      if (entry.amount >= threshold && threshold > 0) {
        flags.push({
          genre: entry.genre,
          abilityId: entry.abilityId,
          abilityName: entry.abilityName,
          severity: 'warning',
          category: 'extreme-damage',
          message: `${entry.abilityName} deals ${entry.amount} damage (mean across packs: ${meanDamage.toFixed(1)})`,
        });
        flagsByGenre[entry.genre] = (flagsByGenre[entry.genre] ?? 0) + 1;
      }
    }
  }

  // Cross-pack outlier: ability with vastly different cooldown (>= 2x average across packs)
  const allCooldowns = packs.flatMap(({ abilities }) =>
    abilities.filter((a) => a.cooldown && a.cooldown > 0).map((a) => a.cooldown!),
  );
  if (allCooldowns.length > 0) {
    const meanCooldown = allCooldowns.reduce((s, c) => s + c, 0) / allCooldowns.length;
    const cooldownThreshold = meanCooldown * 2.5;

    for (const { genre, abilities } of packs) {
      for (const ability of abilities) {
        if (ability.cooldown && ability.cooldown >= cooldownThreshold && cooldownThreshold > 0) {
          flags.push({
            genre,
            abilityId: ability.id,
            abilityName: ability.name,
            severity: 'advisory',
            category: 'cross-pack-outlier',
            message: `${ability.name} cooldown ${ability.cooldown} is >2.5x the cross-pack mean (${meanCooldown.toFixed(1)})`,
          });
          flagsByGenre[genre] = (flagsByGenre[genre] ?? 0) + 1;
        }
      }
    }
  }

  // No-cleanse advisory: pack applies statuses but has no cleanse ability
  for (const { genre, abilities } of packs) {
    const appliesStatuses = abilities.some((a) =>
      a.effects.some((e) => e.type === 'apply-status'),
    );
    const hasCleanse = abilities.some((a) =>
      a.effects.some((e) => e.type === 'remove-status-by-tag' || e.type === 'remove-status'),
    );
    if (appliesStatuses && !hasCleanse) {
      flags.push({
        genre,
        abilityId: '',
        abilityName: '',
        severity: 'advisory',
        category: 'no-cleanse',
        message: `${genre} pack applies statuses but has no cleanse/dispel ability`,
      });
      flagsByGenre[genre] = (flagsByGenre[genre] ?? 0) + 1;
    }
  }

  // Status-heavy-low-counter: pack applies ≥3 unique statuses but has ≤1 cleanse ability
  for (const { genre, abilities } of packs) {
    const appliedStatuses = new Set<string>();
    let cleanseCount = 0;
    for (const ability of abilities) {
      for (const effect of ability.effects) {
        if (effect.type === 'apply-status' && typeof effect.params?.statusId === 'string') {
          appliedStatuses.add(effect.params.statusId as string);
        }
        if (effect.type === 'remove-status-by-tag' || effect.type === 'remove-status') {
          cleanseCount++;
        }
      }
    }
    if (appliedStatuses.size >= 3 && cleanseCount <= 1) {
      flags.push({
        genre,
        abilityId: '',
        abilityName: '',
        severity: 'advisory',
        category: 'status-heavy-low-counter',
        message: `${genre} pack applies ${appliedStatuses.size} unique statuses but has only ${cleanseCount} cleanse ability`,
      });
      flagsByGenre[genre] = (flagsByGenre[genre] ?? 0) + 1;
    }
  }

  // Resource-economy-skew: one resource used in >70% of pack ability costs
  for (const { genre, abilities } of packs) {
    if (abilities.length < 3) continue;
    const resourceUse: Record<string, number> = {};
    for (const ability of abilities) {
      if (ability.costs) {
        const seen = new Set<string>();
        for (const cost of ability.costs) {
          if (!seen.has(cost.resourceId)) {
            resourceUse[cost.resourceId] = (resourceUse[cost.resourceId] ?? 0) + 1;
            seen.add(cost.resourceId);
          }
        }
      }
    }
    for (const [resource, count] of Object.entries(resourceUse)) {
      if (count / abilities.length > 0.7 && resource !== 'stamina') {
        flags.push({
          genre,
          abilityId: '',
          abilityName: '',
          severity: 'info',
          category: 'resource-economy-skew',
          message: `${genre} pack: ${resource} used in ${count}/${abilities.length} abilities (>70%)`,
        });
        flagsByGenre[genre] = (flagsByGenre[genre] ?? 0) + 1;
      }
    }
  }

  // Signature-missing: pack has ≥3 abilities but none with cooldown ≥4 and ≥2 effect types
  for (const { genre, abilities } of packs) {
    if (abilities.length < 3) continue;
    const hasSignature = abilities.some((a) => {
      const cd = a.cooldown ?? 0;
      const effectTypes = new Set(a.effects.map((e) => e.type));
      return cd >= 4 && effectTypes.size >= 2;
    });
    if (!hasSignature) {
      flags.push({
        genre,
        abilityId: '',
        abilityName: '',
        severity: 'info',
        category: 'signature-missing',
        message: `${genre} pack has ${abilities.length} abilities but none with cooldown ≥4 and ≥2 effect types`,
      });
      flagsByGenre[genre] = (flagsByGenre[genre] ?? 0) + 1;
    }
  }

  // Thin-pack advisory: pack has <= 2 abilities
  for (const { genre, abilities } of packs) {
    if (abilities.length <= 2) {
      flags.push({
        genre,
        abilityId: '',
        abilityName: '',
        severity: 'advisory',
        category: 'thin-pack',
        message: `${genre} pack has only ${abilities.length} abilities — lacks tactical variety`,
      });
      flagsByGenre[genre] = (flagsByGenre[genre] ?? 0) + 1;
    }
  }

  // No tactical triangle: pack missing offense + defense + control
  for (const { genre, abilities } of packs) {
    if (abilities.length < 3) continue;
    const hasOffense = abilities.some((a) => a.tags.includes('damage') || (a.tags.includes('combat') && !a.tags.includes('debuff')));
    const hasDefense = abilities.some((a) => a.tags.includes('heal') || a.tags.includes('buff') || a.tags.includes('cleanse'));
    const hasControl = abilities.some((a) => a.tags.includes('debuff') || a.tags.includes('control'));
    if (!hasOffense || !hasDefense || !hasControl) {
      const missing = [!hasOffense && 'offense', !hasDefense && 'defense', !hasControl && 'control'].filter(Boolean);
      flags.push({
        genre,
        abilityId: '',
        abilityName: '',
        severity: 'info',
        category: 'no-tactical-triangle',
        message: `${genre} pack missing ${missing.join(' + ')} in tactical triangle`,
      });
      flagsByGenre[genre] = (flagsByGenre[genre] ?? 0) + 1;
    }
  }

  const totalAbilities = packs.reduce((sum, p) => sum + p.abilities.length, 0);

  return {
    flags,
    totalAbilities,
    totalFlags: flags.length,
    flagsByGenre,
  };
}

// ---------------------------------------------------------------------------
// Pack Comparison
// ---------------------------------------------------------------------------

export type PackIdentityProfile = {
  genre: string;
  abilityCount: number;
  dominantCategory: 'offensive' | 'defensive' | 'control' | 'utility';
  signatureAbility: string | null;
  resourceIdentity: string;
  statusFamily: string[];
  cleanseTags: string[];
  resistanceCount: number;
  hasTacticalTriangle: boolean;
  distinctivenessScore: number;
};

export type StatusEcosystemSummary = {
  tagUsage: Record<string, number>;
  tagCleanseCoverage: Record<string, number>;
  uncleansableTags: string[];
  overrepresentedTags: string[];
  underrepresentedTags: string[];
};

export type PackComparisonMatrix = {
  packs: PackIdentityProfile[];
  statusEcosystem: StatusEcosystemSummary;
  recommendations: string[];
};

/** Compare all ability packs and produce a cross-pack analysis matrix */
export function compareAbilityPacks(
  packs: Array<{ genre: string; abilities: AbilityDefinition[]; statuses: StatusDefinition[] }>,
  opts?: { entities?: Array<{ genre: string; entities: Array<{ id: string; resistances?: Record<string, string> }> }> },
): PackComparisonMatrix {
  const profiles: PackIdentityProfile[] = [];
  const statusTagUsage: Record<string, number> = {};
  const cleanseCoverage: Record<string, number> = {};
  const allSignatures: Array<{ genre: string; statusFamily: string[]; dominant: string }> = [];

  for (const pack of packs) {
    const summary = summarizeAbilityPack(pack.genre, pack.abilities, {
      entities: opts?.entities?.find((e) => e.genre === pack.genre)?.entities,
    });

    // Dominant category
    const dominant = (['offensive', 'defensive', 'control', 'utility'] as const)
      .reduce((best, cat) => summary.abilitiesByCategory[cat].length > summary.abilitiesByCategory[best].length ? cat : best, 'offensive' as const);

    // Signature: highest cooldown ability with ≥2 effect types
    const sig = pack.abilities
      .filter((a) => (a.cooldown ?? 0) >= 3 && new Set(a.effects.map((e) => e.type)).size >= 2)
      .sort((a, b) => (b.cooldown ?? 0) - (a.cooldown ?? 0))[0] ?? null;

    // Resource identity: most expensive non-stamina resource
    const nonStaminaCosts: Record<string, number> = {};
    for (const a of pack.abilities) {
      for (const c of a.costs ?? []) {
        if (c.resourceId !== 'stamina') {
          nonStaminaCosts[c.resourceId] = (nonStaminaCosts[c.resourceId] ?? 0) + c.amount;
        }
      }
    }
    const resourceIdentity = Object.entries(nonStaminaCosts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'stamina';

    // Status family
    const statusFamily = pack.statuses.flatMap((s) => s.tags).filter((t) => t !== 'debuff');

    // Tactical triangle
    const hasOffense = pack.abilities.some((a) => a.tags.includes('damage') || (a.tags.includes('combat') && !a.tags.includes('debuff')));
    const hasDefense = pack.abilities.some((a) => a.tags.includes('heal') || a.tags.includes('buff') || a.tags.includes('cleanse'));
    const hasControl = pack.abilities.some((a) => a.tags.includes('debuff') || a.tags.includes('control'));

    // Status ecosystem tracking
    for (const status of pack.statuses) {
      for (const tag of status.tags) {
        statusTagUsage[tag] = (statusTagUsage[tag] ?? 0) + 1;
      }
    }
    for (const tag of summary.cleanseTagsCovered) {
      cleanseCoverage[tag] = (cleanseCoverage[tag] ?? 0) + 1;
    }

    const resistanceCount = opts?.entities?.find((e) => e.genre === pack.genre)?.entities
      .filter((e) => e.resistances && Object.keys(e.resistances).length > 0).length ?? 0;

    allSignatures.push({ genre: pack.genre, statusFamily, dominant });

    profiles.push({
      genre: pack.genre,
      abilityCount: pack.abilities.length,
      dominantCategory: dominant,
      signatureAbility: sig?.id ?? null,
      resourceIdentity,
      statusFamily: [...new Set(statusFamily)],
      cleanseTags: summary.cleanseTagsCovered,
      resistanceCount,
      hasTacticalTriangle: hasOffense && hasDefense && hasControl,
      distinctivenessScore: 0, // computed below
    });
  }

  // Distinctiveness: penalize packs that share dominant category + status family with another
  for (const profile of profiles) {
    let score = 50;
    // Unique resource identity: +15
    const sameResource = profiles.filter((p) => p.genre !== profile.genre && p.resourceIdentity === profile.resourceIdentity);
    if (sameResource.length === 0) score += 15;
    // Unique status family: +15
    const sameStatus = profiles.filter((p) =>
      p.genre !== profile.genre &&
      p.statusFamily.some((t) => profile.statusFamily.includes(t)),
    );
    if (sameStatus.length === 0) score += 15;
    // Has signature: +10
    if (profile.signatureAbility) score += 10;
    // Has tactical triangle: +10
    if (profile.hasTacticalTriangle) score += 10;
    // Has resistances: +5
    if (profile.resistanceCount > 0) score += 5;
    // Penalty for shared dominant category
    const sameDominant = profiles.filter((p) => p.genre !== profile.genre && p.dominantCategory === profile.dominantCategory);
    score -= sameDominant.length * 3;
    profile.distinctivenessScore = Math.max(0, Math.min(100, score));
  }

  // Status ecosystem summary
  const knownTags = ['buff', 'debuff', 'fear', 'control', 'blind', 'stance', 'holy', 'breach', 'poison', 'supernatural', 'wound'];
  const uncleansableTags = knownTags.filter((t) => (statusTagUsage[t] ?? 0) > 0 && (cleanseCoverage[t] ?? 0) === 0);
  const overrepresentedTags = Object.entries(statusTagUsage).filter(([, count]) => count > packs.length * 0.4).map(([tag]) => tag);
  const underrepresentedTags = knownTags.filter((t) => (statusTagUsage[t] ?? 0) === 0);

  const statusEcosystem: StatusEcosystemSummary = {
    tagUsage: statusTagUsage,
    tagCleanseCoverage: cleanseCoverage,
    uncleansableTags,
    overrepresentedTags,
    underrepresentedTags,
  };

  // Recommendations
  const recommendations: string[] = [];
  for (const tag of uncleansableTags) {
    if (tag !== 'debuff' && tag !== 'buff') {
      recommendations.push(`No pack can cleanse '${tag}' statuses — consider adding a cleanse option`);
    }
  }
  for (const profile of profiles) {
    if (!profile.hasTacticalTriangle) {
      recommendations.push(`${profile.genre} lacks a complete tactical triangle`);
    }
    if (profile.distinctivenessScore < 40) {
      recommendations.push(`${profile.genre} has low distinctiveness (${profile.distinctivenessScore}) — consider strengthening identity`);
    }
  }

  return { packs: profiles, statusEcosystem, recommendations };
}

/** Format comparison matrix as Markdown */
export function formatPackComparisonMarkdown(matrix: PackComparisonMatrix): string {
  const lines: string[] = [];
  lines.push('# Ability Pack Comparison');
  lines.push('');
  lines.push('| Pack | Abilities | Dominant | Signature | Resource | Status Family | Cleanse | Resistances | Triangle | Score |');
  lines.push('|------|-----------|----------|-----------|----------|---------------|---------|-------------|----------|-------|');
  for (const p of matrix.packs) {
    lines.push(`| ${p.genre} | ${p.abilityCount} | ${p.dominantCategory} | ${p.signatureAbility ?? '—'} | ${p.resourceIdentity} | ${p.statusFamily.join(', ') || '—'} | ${p.cleanseTags.join(', ') || '—'} | ${p.resistanceCount} | ${p.hasTacticalTriangle ? 'Yes' : 'No'} | ${p.distinctivenessScore} |`);
  }
  lines.push('');

  if (matrix.statusEcosystem.uncleansableTags.length > 0) {
    lines.push(`**Uncleansable tags:** ${matrix.statusEcosystem.uncleansableTags.join(', ')}`);
    lines.push('');
  }
  if (matrix.statusEcosystem.underrepresentedTags.length > 0) {
    lines.push(`**Unused vocabulary tags:** ${matrix.statusEcosystem.underrepresentedTags.join(', ')}`);
    lines.push('');
  }
  if (matrix.recommendations.length > 0) {
    lines.push('## Recommendations');
    lines.push('');
    for (const rec of matrix.recommendations) {
      lines.push(`- ${rec}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
