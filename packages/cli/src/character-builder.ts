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

/**
 * CS-C-004 (in-step guard): problems with a prospective trait selection,
 * phrased as the REAL rules ("pick at least 1 flaw", "these two are
 * incompatible") rather than the generic selection-count constraint. Checked
 * at the trait STEP so a bad batch re-prompts immediately — before the player
 * invests in discipline choice and point-by-point stat allocation, and long
 * before the end-of-wizard validateBuild backstop.
 */
function traitSelectionProblems(pickedIds: string[], catalog: BuildCatalog): string[] {
  const problems: string[] = [];
  const picked = pickedIds
    .map((id) => catalog.traits.find((t) => t.id === id))
    .filter((t): t is BuildCatalog['traits'][number] => t !== undefined);

  const flawCount = picked.filter((t) => t.category === 'flaw').length;
  if (flawCount < catalog.requiredFlaws) {
    const noun = catalog.requiredFlaws === 1 ? 'flaw' : 'flaws';
    problems.push(
      `Pick at least ${catalog.requiredFlaws} ${noun} — the items marked "(flaw)". This selection has ${flawCount}.`,
    );
  }

  for (let i = 0; i < picked.length; i++) {
    for (let j = i + 1; j < picked.length; j++) {
      const a = picked[i];
      const b = picked[j];
      if (a.incompatibleWith?.includes(b.id) || b.incompatibleWith?.includes(a.id)) {
        problems.push(`${a.name} and ${b.name} are incompatible — pick one or the other.`);
      }
    }
  }
  return problems;
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

  outer: while (true) {
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

    // CS-C-004: everything from the trait step onward runs inside this loop.
    // A validation failure used to `continue` the OUTER loop — discarding
    // name, archetype, and background and restarting the whole wizard from
    // name entry ("maximally punishing recovery"). The realistic invalid-build
    // causes all live in the trait step (missing required flaw, incompatible
    // picks in one batch), so failures re-prompt from HERE with the earlier
    // answers preserved.
    while (true) {
      const flawNoun = catalog.requiredFlaws === 1 ? 'flaw' : 'flaws';
      const flawRule =
        catalog.requiredFlaws > 0
          ? `, at least ${catalog.requiredFlaws} ${flawNoun} required`
          : '';
      console.log(`\n  Choose your traits (up to ${catalog.maxTraits}${flawRule}):\n`);
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
          {
            min: catalog.requiredFlaws > 0 ? 1 : 0,
            max: catalog.maxTraits - selectedTraitIds.length,
            // CS-C-004: state the REAL rule at the constraint line — the bare
            // count ("select 1-3 items") let a zero-flaw pick look valid.
            hint:
              catalog.requiredFlaws > 0
                ? `include at least ${catalog.requiredFlaws} ${flawNoun}`
                : undefined,
          },
        );

        const pickedIds = selected.map((idx) => items[idx].id);
        const problems = traitSelectionProblems([...selectedTraitIds, ...pickedIds], catalog);
        if (problems.length > 0) {
          console.log('');
          for (const p of problems) console.log(`  ✗ ${p}`);
          console.log("\n  Let's choose traits again:\n");
          continue; // re-prompt just this trait batch — nothing else is lost
        }

        for (const id of pickedIds) {
          selectedTraitIds.push(id);
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

      // F-2c013eff: an invalid build must never reach the "ready" summary or
      // be returned — resolveEntity() re-validates and its `Invalid build:`
      // throw used to crash the CLI right after a summary that implied
      // everything was fine. The in-step trait guard above (CS-C-004) now
      // catches the realistic causes (missing required flaw, incompatible
      // picks in one batch) at the trait screen itself; this gate remains as
      // the structural backstop for anything else. On failure it re-prompts
      // from the TRAIT step — name, archetype, and background are preserved —
      // instead of restarting the whole wizard from name entry.
      if (!validation.ok) {
        console.log('\n  ═══════════════════════════════════════');
        console.log('  This build is not valid:');
        for (const err of validation.errors) {
          console.log(`  ✗ ${err}`);
        }
        console.log('  ═══════════════════════════════════════');
        console.log("\n  Let's fix that — back to trait selection (your name, archetype, and background are kept)...\n");
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
        // Declining the final confirm is a deliberate "start over" — the one
        // case where a full wizard restart is what the player asked for.
        console.log('\n  Starting over...\n');
        continue outer;
      }

      return build;
    }
  }
}
