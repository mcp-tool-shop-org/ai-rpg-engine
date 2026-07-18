// Interactive character creation flow for the CLI

import type { RulesetDefinition } from '@ai-rpg-engine/core';
import type { BuildCatalog, CharacterBuild } from '@ai-rpg-engine/character-creation';
import {
  getAvailableArchetypes,
  getAvailableBackgrounds,
  getAvailableTraits,
  getAvailableDisciplines,
  getStatBudgetRemaining,
  validateBuild,
  resolveTitle,
} from '@ai-rpg-engine/character-creation';
import { validateBuildCatalog } from '@ai-rpg-engine/content-schema';
import { promptText, promptMenu, promptMultiSelect, promptOptionalMenu, promptConfirm } from './prompts.js';

function formatStatPriorities(stats: Record<string, number>): string {
  return Object.entries(stats)
    .map(([k, v]) => `${k} ${v}`)
    .join(' / ');
}

function formatModifiers(mods: Record<string, number>): string {
  return Object.entries(mods)
    .map(([k, v]) => `${v > 0 ? '+' : ''}${v} ${k}`)
    .join(', ');
}

export async function buildCharacter(
  catalog: BuildCatalog,
  ruleset: RulesetDefinition,
): Promise<CharacterBuild> {
  // F-2ae7c051: the retry gate below `continue`s on ANY validation failure —
  // correct for every satisfiable catalog, but an UNSATISFIABLE one (more
  // required flaws than the pack defines, requiredFlaws > maxTraits, or every
  // flaw mutually incompatibleWith every other) would trap the player in a
  // structurally un-winnable retry loop with zero diagnosis. No shipped
  // starter is affected; this guards future/third-party/hand-authored packs.
  // Fail loud BEFORE the loop, in the CLI's [CODE]-prefixed error style.
  const catalogCheck = validateBuildCatalog(catalog);
  if (!catalogCheck.ok) {
    const detail = catalogCheck.errors.map((e) => `${e.path}: ${e.message}`).join('; ');
    throw new Error(
      `[CATALOG_UNSATISFIABLE] Character creation cannot start — the build catalog is not self-consistent: ${detail}. ` +
      'Hint: fix the pack (add compatible flaw traits, lower requiredFlaws, or raise maxTraits) — no possible selection can satisfy it as authored.',
    );
  }

  while (true) {
    const name = await promptText('What is your name?');

    console.log('\n  Choose your archetype:\n');
    const archetypes = getAvailableArchetypes(catalog);
    const archIdx = await promptMenu(
      archetypes.map((a) => ({
        label: a.name,
        detail: `${a.description}  (${formatStatPriorities(a.statPriorities)})`,
      })),
    );
    const archetype = archetypes[archIdx];

    console.log('\n  Choose your background:\n');
    const backgrounds = getAvailableBackgrounds(catalog);
    const bgIdx = await promptMenu(
      backgrounds.map((b) => ({
        label: b.name,
        detail: `${b.description}  (${formatModifiers(b.statModifiers)})`,
      })),
    );
    const background = backgrounds[bgIdx];

    console.log(`\n  Choose your traits (up to ${catalog.maxTraits}, at least ${catalog.requiredFlaws} flaw required):\n`);
    const selectedTraitIds: string[] = [];
    let selecting = true;

    while (selecting) {
      const available = getAvailableTraits(catalog, selectedTraitIds);
      if (available.length === 0 || selectedTraitIds.length >= catalog.maxTraits) break;

      const perks = available.filter((t) => t.category === 'perk');
      const flaws = available.filter((t) => t.category === 'flaw');
      const items: { label: string; detail?: string; id: string }[] = [];

      if (perks.length > 0) {
        console.log('  [Perks]');
        for (const p of perks) {
          items.push({ label: p.name, detail: p.description, id: p.id });
        }
      }
      if (flaws.length > 0) {
        if (perks.length > 0) console.log('  [Flaws]');
        for (const f of flaws) {
          items.push({ label: `${f.name} (flaw)`, detail: f.description, id: f.id });
        }
      }

      const selected = await promptMultiSelect(
        items.map((i) => ({ label: i.label, detail: i.detail })),
        { min: catalog.requiredFlaws > 0 ? 1 : 0, max: catalog.maxTraits - selectedTraitIds.length },
      );

      for (const idx of selected) {
        selectedTraitIds.push(items[idx].id);
      }
      selecting = false;
    }

    console.log('\n  Choose a discipline (optional secondary class):\n');
    const currentTags = [...archetype.startingTags, ...background.startingTags];
    const disciplines = getAvailableDisciplines(catalog, archetype.id, currentTags);
    let disciplineId: string | undefined;

    if (disciplines.length > 0) {
      const discIdx = await promptOptionalMenu(
        disciplines.map((d) => ({
          label: d.name,
          detail: `${d.description}  Verb: ${d.grantedVerb}`,
        })),
      );
      if (discIdx >= 0) {
        disciplineId = disciplines[discIdx].id;
      }
    } else {
      console.log('  No disciplines available for this combination.');
    }

    const partialBuild: CharacterBuild = {
      name,
      archetypeId: archetype.id,
      backgroundId: background.id,
      traitIds: selectedTraitIds,
      disciplineId,
    };

    const budget = getStatBudgetRemaining(partialBuild, catalog);
    const allocations: Record<string, number> = {};

    if (budget > 0) {
      console.log(`\n  You have ${budget} stat points to allocate.`);
      console.log(`  Base stats: ${formatStatPriorities(archetype.statPriorities)}\n`);

      const statNames = Object.keys(archetype.statPriorities);
      let remaining = budget;

      while (remaining > 0) {
        console.log(`  Points remaining: ${remaining}`);
        const idx = await promptMenu(
          statNames.map((s) => ({
            label: `${s} (+1)`,
            detail: `Current: ${(archetype.statPriorities[s] ?? 0) + (allocations[s] ?? 0)}`,
          })),
        );
        const stat = statNames[idx];
        allocations[stat] = (allocations[stat] ?? 0) + 1;
        remaining--;
      }
    }

    const build: CharacterBuild = {
      ...partialBuild,
      statAllocations: Object.keys(allocations).length > 0 ? allocations : undefined,
    };

    const validation = validateBuild(build, catalog, ruleset);

    // F-2c013eff: this build can be invalid — e.g. the trait-selection step
    // above offers perks and flaws in a single batch, so a player can satisfy
    // the pick-count minimum while choosing zero flaws (every shipping pack
    // sets requiredFlaws >= 1), or select two traits that declare each other
    // incompatibleWith in that same batch (getAvailableTraits only excludes
    // traits blocked by ALREADY-recorded selections, and selectedTraitIds is
    // still empty on the first offer). Previously nothing checked
    // validation.ok here, so an invalid build sailed past this screen and
    // resolveEntity() threw `Invalid build: ...` uncaught, crashing the CLI
    // right after a summary that implied everything was fine. Gate on it: an
    // invalid build must never reach the "ready" summary or be returned —
    // show the errors and let the player redo character creation instead.
    if (!validation.ok) {
      console.log('\n  ═══════════════════════════════════════');
      console.log('  This build is not valid:');
      for (const err of validation.errors) {
        console.log(`  ✗ ${err}`);
      }
      console.log('  ═══════════════════════════════════════');
      console.log("\n  Let's fix that — starting over...\n");
      continue;
    }

    const title = disciplineId ? resolveTitle(archetype.id, disciplineId, catalog) : undefined;

    console.log('\n  ═══════════════════════════════════════');
    console.log(`  ${name.toUpperCase()}${title ? ` — ${title}` : ''}`);
    console.log(`  ${archetype.name}${disciplineId ? ` / ${disciplines.find((d) => d.id === disciplineId)?.name}` : ''} / ${background.name}`);
    console.log(`  ${formatStatPriorities(validation.finalStats)}`);

    const resEntries = Object.entries(validation.finalResources);
    if (resEntries.length > 0) {
      console.log(`  ${resEntries.map(([k, v]) => `${k.toUpperCase()} ${v}`).join(' / ')}`);
    }

    if (validation.resolvedTags.length > 0) {
      const displayTags = validation.resolvedTags.filter((t) => t !== 'player');
      if (displayTags.length > 0) {
        console.log(`  Tags: ${displayTags.join(', ')}`);
      }
    }

    if (validation.warnings.length > 0) {
      for (const w of validation.warnings) {
        console.log(`  ⚠ ${w}`);
      }
    }

    console.log('  ═══════════════════════════════════════\n');

    const confirmed = await promptConfirm('Begin your journey?');
    if (!confirmed) {
      console.log('\n  Starting over...\n');
      continue;
    }

    return build;
  }
}
