// F1d — abilities & XP reachable from the numbered menu.
//
// The engine's `use-ability` verb needs `parameters.abilityId`, which no menu
// or parser ever produced — abilities were unreachable in the shipped loop.
// Likewise XP: progression-core accrues it on kills and registers an `unlock`
// verb, but the CLI never showed a balance or offered a spend.
//
// This module extends the numbered action menu WITHOUT touching terminal-ui:
// terminal-ui's buildActionList stays the source of truth for entries
// 1..N; this module appends entries N+1..N+M (ready abilities with resolved
// targets, then affordable progression unlocks) that bin.ts renders below the
// base menu and resolves in handlePlayerInput before the free-text fallback.

import type { Engine, WorldState, EntityState, ScalarValue } from '@ai-rpg-engine/core';
import type { AbilityDefinition, ProgressionTreeDefinition } from '@ai-rpg-engine/content-schema';
import {
  getAvailableAbilities,
  normalizeAbilityTarget,
  matchesAffiliation,
  getCurrency,
  canUnlock,
} from '@ai-rpg-engine/modules';
import { getAbilityCatalog } from './turns.js';

/** One appended menu entry — shaped like terminal-ui's ActionOption plus a group label. */
export type ExtraAction = {
  verb: string;
  targetIds?: string[];
  parameters?: Record<string, ScalarValue>;
  label: string;
  group: 'ability' | 'advance';
};

/**
 * Menu-offer gate on top of the engine's affiliation check. The engine's
 * type-heuristic classifies EVERY differently-typed entity as an enemy, so a
 * bare offensive ability would list the friendly quest NPC as a smite target
 * (live-caught: "Holy Smite → Suspicious Pilgrim"). The MENU follows the
 * scene list's explicit-hostility convention instead: offensive entries are
 * offered only against `enemy`/`hostile`-tagged targets, support entries only
 * for self/`ally`/`companion`. Freeform text keeps full engine freedom — the
 * menu just never ADVERTISES friendly fire.
 */
function menuTargetable(
  world: WorldState,
  candidate: EntityState,
  affiliation: string,
): boolean {
  if (candidate.id === world.playerId) return true; // includeSelf already vetted
  if (affiliation === 'enemy') {
    return candidate.tags.includes('enemy') || candidate.tags.includes('hostile');
  }
  if (affiliation === 'ally') {
    return candidate.tags.includes('ally') || candidate.tags.includes('companion');
  }
  return true; // 'any' — the ability explicitly targets everyone
}

/**
 * Ability entries for every ability the player can use RIGHT NOW
 * (ability-core's own readiness check: cooldown, costs, tag requirements).
 * Single-target abilities expand to one entry per valid target in the
 * player's zone, using the same normalize/matchesAffiliation rules the
 * ability handler enforces — so every listed entry is submittable, never a
 * "menu offered it, engine rejected it" trap.
 */
export function buildAbilityActions(
  world: WorldState,
  catalog: AbilityDefinition[],
): ExtraAction[] {
  const player = world.entities[world.playerId];
  if (!player || catalog.length === 0) return [];

  const ready = getAvailableAbilities(world, world.playerId, catalog);
  const actions: ExtraAction[] = [];

  for (const ability of ready) {
    if (ability.target.type === 'single') {
      const norm = normalizeAbilityTarget(ability);
      const candidates = Object.values(world.entities)
        .filter(
          (e) =>
            (e.resources.hp ?? 0) > 0 &&
            (e.zoneId ?? world.locationId) === (player.zoneId ?? world.locationId) &&
            matchesAffiliation(player, e, norm.affiliation, norm.includeSelf) &&
            menuTargetable(world, e, norm.affiliation),
        )
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      for (const target of candidates) {
        actions.push({
          verb: ability.verb,
          targetIds: [target.id],
          parameters: { abilityId: ability.id },
          label: `${ability.name} → ${target.id === world.playerId ? 'yourself' : target.name}`,
          group: 'ability',
        });
      }
    } else {
      actions.push({
        verb: ability.verb,
        parameters: { abilityId: ability.id },
        label: ability.name,
        group: 'ability',
      });
    }
  }

  return actions;
}

/**
 * Unlock entries for every progression node the player can afford right now
 * (progression-core's own canUnlock: prerequisites + currency). Selecting one
 * submits the engine's `unlock` verb with the treeId/nodeId it requires.
 */
export function buildUnlockActions(
  world: WorldState,
  trees: ProgressionTreeDefinition[],
): ExtraAction[] {
  if (trees.length === 0) return [];
  const treeMap = new Map(trees.map((t) => [t.id, t]));
  const actions: ExtraAction[] = [];

  for (const tree of trees) {
    for (const node of tree.nodes) {
      const check = canUnlock(world, world.playerId, tree.id, node.id, treeMap);
      if (!check.can) continue;
      actions.push({
        verb: 'unlock',
        parameters: { treeId: tree.id, nodeId: node.id },
        label: `Unlock ${node.name} (${node.cost} ${tree.currency})`,
        group: 'advance',
      });
    }
  }

  return actions;
}

/** All appended entries, abilities first then unlocks — stable order, pure over state. */
export function buildExtraActions(
  engine: Engine,
  trees: ProgressionTreeDefinition[] = [],
): ExtraAction[] {
  return [
    ...buildAbilityActions(engine.world, getAbilityCatalog(engine)),
    ...buildUnlockActions(engine.world, trees),
  ];
}

/**
 * Render the appended entries, numbered to continue the base menu
 * (base entries are 1..baseCount, these are baseCount+1..). Returns '' when
 * there is nothing to append so the caller can skip the section cleanly.
 */
export function renderExtraActions(extras: ExtraAction[], baseCount: number): string {
  if (extras.length === 0) return '';
  const width = String(baseCount + extras.length).length;
  const lines: string[] = [];
  let prevGroup: ExtraAction['group'] | undefined;
  extras.forEach((extra, i) => {
    if (prevGroup !== undefined && extra.group !== prevGroup) lines.push('');
    prevGroup = extra.group;
    lines.push(`  [${String(baseCount + i + 1).padStart(width)}] ${extra.label}`);
  });
  return lines.join('\n') + '\n';
}

/**
 * Map a numeric input beyond the base menu range onto an appended entry.
 * Returns null when the input is not a number or is out of range — the caller
 * falls through to free-text parsing exactly as before.
 */
export function parseExtraSelection(
  input: string,
  baseCount: number,
  extras: ExtraAction[],
): ExtraAction | null {
  if (!/^\d+$/.test(input.trim())) return null;
  const n = parseInt(input, 10);
  if (isNaN(n) || n <= baseCount || n > baseCount + extras.length) return null;
  return extras[n - baseCount - 1];
}

// ---------------------------------------------------------------------------
// HUD decoration — XP / level in the vitals line
// ---------------------------------------------------------------------------

/**
 * Display-only copy of the world whose player carries `xp` and `level`
 * pseudo-resources, so terminal-ui's existing vitals renderer (which renders
 * every player resource it is handed) shows them with zero terminal-ui
 * changes. Never mutates live state — a save taken after rendering is
 * byte-identical to one taken before.
 *
 * xp    — progression-core currency balance (the trees' currency, default 'xp')
 * level — 1 + total progression nodes unlocked across all trees
 */
export function buildHudWorld(
  world: WorldState,
  trees: ProgressionTreeDefinition[] = [],
): WorldState {
  const player = world.entities[world.playerId];
  if (!player) return world;

  const currencyId = trees[0]?.currency ?? 'xp';
  const xp = getCurrency(world, world.playerId, currencyId);

  const unlockedByTree = (world.modules['progression-core'] as
    | { unlocked?: Record<string, Record<string, string[]>> }
    | undefined)?.unlocked?.[world.playerId] ?? {};
  const level = 1 + Object.values(unlockedByTree).reduce((sum, nodes) => sum + nodes.length, 0);

  return {
    ...world,
    entities: {
      ...world.entities,
      [world.playerId]: {
        ...player,
        resources: { ...player.resources, xp, level },
      },
    },
  };
}
