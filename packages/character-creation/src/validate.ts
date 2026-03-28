// Build validation — checks a CharacterBuild against a BuildCatalog and RulesetDefinition

import type { RulesetDefinition } from '@ai-rpg-engine/core';
import type {
  CharacterBuild,
  BuildCatalog,
  BuildValidationResult,
  TraitEffect,
} from './types.js';
import { resolveTitle, resolveEntanglements } from './titles.js';

/**
 * Validate a character build against a catalog and ruleset.
 * Returns computed final stats, resources, tags, title, and any errors/warnings.
 */
export function validateBuild(
  build: CharacterBuild,
  catalog: BuildCatalog,
  ruleset: RulesetDefinition,
): BuildValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const resolvedTags: string[] = ['player'];

  // --- Lookup archetype ---
  const archetype = catalog.archetypes.find((a) => a.id === build.archetypeId);
  if (!archetype) {
    errors.push(`Unknown archetype: ${build.archetypeId}`);
    return { ok: false, errors, warnings, resolvedTags, finalStats: {}, finalResources: {} };
  }

  // --- Lookup background ---
  const background = catalog.backgrounds.find((b) => b.id === build.backgroundId);
  if (!background) {
    errors.push(`Unknown background: ${build.backgroundId}`);
    return { ok: false, errors, warnings, resolvedTags, finalStats: {}, finalResources: {} };
  }

  // --- Lookup traits ---
  const traits = build.traitIds.map((tid) => catalog.traits.find((t) => t.id === tid));
  for (let i = 0; i < build.traitIds.length; i++) {
    if (!traits[i]) errors.push(`Unknown trait: ${build.traitIds[i]}`);
  }
  const validTraits = traits.filter((t) => t != null);

  // --- Check trait count ---
  if (build.traitIds.length > catalog.maxTraits) {
    errors.push(`Too many traits: ${build.traitIds.length} > max ${catalog.maxTraits}`);
  }

  // --- Check required flaws ---
  const flawCount = validTraits.filter((t) => t.category === 'flaw').length;
  if (flawCount < catalog.requiredFlaws) {
    errors.push(`Not enough flaws: ${flawCount} < required ${catalog.requiredFlaws}`);
  }

  // --- Check duplicate traits ---
  if (new Set(build.traitIds).size !== build.traitIds.length) {
    errors.push('Duplicate trait IDs detected');
  }

  // --- Check trait incompatibilities ---
  const selectedIds = new Set(build.traitIds);
  for (const trait of validTraits) {
    if (trait.incompatibleWith) {
      for (const incompat of trait.incompatibleWith) {
        if (selectedIds.has(incompat)) {
          errors.push(`Incompatible traits: ${trait.id} conflicts with ${incompat}`);
        }
      }
    }
  }

  // --- Lookup discipline (optional) ---
  let discipline = undefined;
  if (build.disciplineId) {
    discipline = catalog.disciplines.find((d) => d.id === build.disciplineId);
    if (!discipline) {
      errors.push(`Unknown discipline: ${build.disciplineId}`);
    }
  }

  // --- Check discipline required tags ---
  if (discipline?.requiredTags) {
    // Collect tags so far: archetype + background + traits
    const currentTags = new Set([...archetype.startingTags, ...background.startingTags]);
    for (const trait of validTraits) {
      for (const eff of trait.effects) {
        if (eff.type === 'grant-tag') currentTags.add(eff.tag);
      }
    }
    for (const reqTag of discipline.requiredTags) {
      if (!currentTags.has(reqTag)) {
        errors.push(`Discipline ${discipline.id} requires tag: ${reqTag}`);
      }
    }
  }

  // --- Compute final stats ---
  const finalStats: Record<string, number> = {};

  // Start with archetype base
  for (const [stat, val] of Object.entries(archetype.statPriorities)) {
    finalStats[stat] = val;
  }

  // Apply background modifiers
  for (const [stat, mod] of Object.entries(background.statModifiers)) {
    finalStats[stat] = (finalStats[stat] ?? 0) + mod;
  }

  // Apply trait stat effects
  for (const trait of validTraits) {
    applyStatEffects(trait.effects, finalStats);
  }

  // Apply discipline passive/drawback stat effects
  if (discipline) {
    applyStatEffects([discipline.passive], finalStats);
    applyStatEffects([discipline.drawback], finalStats);
  }

  // Apply stat allocations
  let allocTotal = 0;
  if (build.statAllocations) {
    for (const [stat, amount] of Object.entries(build.statAllocations)) {
      if (!(stat in finalStats)) {
        errors.push(`Cannot allocate to unknown stat: ${stat}`);
      } else {
        finalStats[stat] += amount;
        allocTotal += amount;
      }
    }
  }

  // Check stat budget
  if (allocTotal > catalog.statBudget) {
    errors.push(`Stat budget exceeded: ${allocTotal} > ${catalog.statBudget}`);
  }
  if (allocTotal < 0) {
    errors.push(`Negative stat allocation total: ${allocTotal}`);
  }

  // Clamp stats to ruleset bounds
  for (const statDef of ruleset.stats) {
    if (statDef.id in finalStats) {
      const lo = statDef.min ?? 0;
      const hi = statDef.max ?? 99;
      finalStats[statDef.id] = Math.max(lo, Math.min(hi, finalStats[statDef.id]));
    }
  }

  // --- Compute final resources ---
  const finalResources: Record<string, number> = {};

  // Start with ruleset defaults
  for (const resDef of ruleset.resources) {
    finalResources[resDef.id] = resDef.default;
  }

  // Apply archetype overrides
  if (archetype.resourceOverrides) {
    for (const [res, val] of Object.entries(archetype.resourceOverrides)) {
      finalResources[res] = val;
    }
  }

  // Apply trait resource effects
  for (const trait of validTraits) {
    applyResourceEffects(trait.effects, finalResources);
  }

  // Apply discipline resource effects
  if (discipline) {
    applyResourceEffects([discipline.passive], finalResources);
    applyResourceEffects([discipline.drawback], finalResources);
  }

  // Clamp resources to ruleset bounds
  for (const resDef of ruleset.resources) {
    if (resDef.id in finalResources) {
      const lo = resDef.min ?? 0;
      const hi = resDef.max ?? 999;
      finalResources[resDef.id] = Math.max(lo, Math.min(hi, finalResources[resDef.id]));
    }
  }

  // --- Collect tags ---
  resolvedTags.push(...archetype.startingTags);
  resolvedTags.push(...background.startingTags);
  for (const trait of validTraits) {
    for (const eff of trait.effects) {
      if (eff.type === 'grant-tag') resolvedTags.push(eff.tag);
    }
  }
  if (discipline) {
    for (const eff of [discipline.passive, discipline.drawback]) {
      if (eff.type === 'grant-tag') resolvedTags.push(eff.tag);
    }
  }

  // --- Resolve title ---
  let resolvedTitleStr: string | undefined;
  if (build.disciplineId) {
    resolvedTitleStr = resolveTitle(build.archetypeId, build.disciplineId, catalog);
    if (resolvedTitleStr) {
      const titleEntry = catalog.crossTitles.find(
        (ct) => ct.archetypeId === build.archetypeId && ct.disciplineId === build.disciplineId,
      );
      if (titleEntry) resolvedTags.push(...titleEntry.tags);
    }
  }

  // --- Resolve entanglements (warnings) ---
  if (build.disciplineId) {
    const entanglements = resolveEntanglements(build.archetypeId, build.disciplineId, catalog);
    for (const ent of entanglements) {
      warnings.push(`Entanglement: ${ent.description}`);
      applyStatEffects(ent.effects, finalStats);
      applyResourceEffects(ent.effects, finalResources);
      for (const eff of ent.effects) {
        if (eff.type === 'grant-tag') resolvedTags.push(eff.tag);
      }
    }
  }

  // --- Name check ---
  if (!build.name || build.name.trim().length === 0) {
    errors.push('Character name is required');
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    resolvedTitle: resolvedTitleStr,
    resolvedTags: [...new Set(resolvedTags)],
    finalStats,
    finalResources,
  };
}

function applyStatEffects(effects: TraitEffect[], stats: Record<string, number>): void {
  for (const eff of effects) {
    if (eff.type === 'stat-modifier') {
      stats[eff.stat] = (stats[eff.stat] ?? 0) + eff.amount;
    }
  }
}

function applyResourceEffects(effects: TraitEffect[], resources: Record<string, number>): void {
  for (const eff of effects) {
    if (eff.type === 'resource-modifier') {
      resources[eff.resource] = (resources[eff.resource] ?? 0) + eff.amount;
    }
  }
}
