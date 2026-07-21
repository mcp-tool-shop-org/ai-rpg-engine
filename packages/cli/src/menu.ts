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
//
// F-ENG006 adds a last, env-gated entry (AI_RPG_DEBUG=1): a debug view that
// renders every inspector the engine's modules registered (Engine.getInspectors
// previously had zero consumers). See buildDebugActions / renderInspectorReport.
//
// F-ENG005 adds the Director's Ledger entry — ALWAYS visible, because it is a
// player surface, not an operator one: the strategic-state screen that consumes
// the director-mode formatters (renderDirectorLedger in director.ts). Same
// sentinel-verb contract as debug: the wiring routes on `group: 'director'`
// and never submits the verb to the engine — reading the ledger costs no turn.
//
// F-ENG005-quest-loop-min adds the Journal entry — ALWAYS visible, the
// player's own book: active quests with stage progress, then the completed
// list (renderJournal below, reading core's world.quests + quest-core's
// registered definitions). Same sentinel-verb contract: the wiring routes on
// `group: 'journal'` and never submits the verb — reading the journal costs
// no turn. Menu order is personal → strategic → operator: journal, director,
// then the env-gated debug entry last.

import type { Engine, WorldState, EntityState, ScalarValue, QuestState } from '@ai-rpg-engine/core';
import type { AbilityDefinition, ProgressionTreeDefinition, QuestDefinition, QuestStage } from '@ai-rpg-engine/content-schema';
import {
  getAvailableAbilities,
  normalizeAbilityTarget,
  matchesAffiliation,
  getCurrency,
  canUnlock,
  getQuestDefinitions,
  questProgressCount,
  questProgressRequired,
} from '@ai-rpg-engine/modules';
import { getAbilityCatalog } from './turns.js';
import { describeActionError } from './guard.js';

/** One appended menu entry — shaped like terminal-ui's ActionOption plus a group label. */
export type ExtraAction = {
  verb: string;
  targetIds?: string[];
  parameters?: Record<string, ScalarValue>;
  label: string;
  group: 'ability' | 'advance' | 'journal' | 'director' | 'debug';
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

// ---------------------------------------------------------------------------
// Journal — the quest book entry (F-ENG005-quest-loop-min)
// ---------------------------------------------------------------------------

/** The journal entry's label. Sentinel verb: routed by `group === 'journal'`
 *  in the extras dispatch, never meant to reach the engine as an action. */
export const JOURNAL_MENU_LABEL = 'Journal — quests and undertakings';
export const JOURNAL_MENU_VERB = 'journal';

/**
 * The extras menu's Journal entry — ALWAYS present, no env gate: the quest
 * loop is the shipped reason to return, and its book must never hide.
 * Selecting it renders {@link renderJournal}; the wiring routes on
 * `group: 'journal'` instead of submitting the sentinel verb — consulting
 * the journal must not advance the world.
 */
export function buildJournalActions(): ExtraAction[] {
  return [{ verb: JOURNAL_MENU_VERB, label: JOURNAL_MENU_LABEL, group: 'journal' }];
}

const JOURNAL_RULE = '═'.repeat(60);

/** One active quest's journal lines: banner, stage position + hook, objectives. */
function journalQuestLines(instance: QuestState, def: QuestDefinition | undefined): string[] {
  const lines: string[] = [''];
  const name = def?.name ?? instance.questId;
  lines.push(`  ── ${name} ──`);

  const stage: QuestStage | undefined = def?.stages.find((s) => s.id === instance.currentStage);
  if (!def || !stage) {
    // Definitions unavailable (foreign save / pack without registered quest
    // content): the journal still renders what the state itself knows.
    lines.push(`  Stage: ${instance.currentStage}`);
    return lines;
  }

  const stageIndex = def.stages.findIndex((s) => s.id === stage.id) + 1;
  const required = questProgressRequired(stage);
  const progress = required !== undefined
    ? ` (${Math.min(questProgressCount(instance, stage.id), required)}/${required})`
    : '';
  const hook = stage.description ? ` — ${stage.description}` : '';
  lines.push(`  Stage ${stageIndex}/${def.stages.length}: ${stage.name}${progress}${hook}`);
  for (const objective of stage.objectives ?? []) {
    lines.push(`    • ${objective}`);
  }
  return lines;
}

/**
 * Render the Journal: active quests (name, current stage x/y with progress
 * counts, the stage hook, its objectives), then the completed list — read
 * from core's own world.quests container plus quest-core's registered
 * definitions for this world's pack. Same voice family as the inspector
 * report and the Director's Ledger; pure over state (no writes), so a save
 * taken after rendering is byte-identical to one taken before.
 */
export function renderJournal(world: WorldState): string {
  const defs = new Map(getQuestDefinitions(world).map((q) => [q.id, q]));
  const instances = Object.values(world.quests);
  const active = instances.filter((q) => q.status === 'active');
  const completed = instances.filter((q) => q.status === 'completed');
  const failed = instances.filter((q) => q.status === 'failed');

  const lines: string[] = [];
  lines.push(`  ${JOURNAL_RULE}`);
  lines.push(`  JOURNAL — ACTIVE QUESTS (${active.length}) · COMPLETED (${completed.length})`);
  lines.push(`  ${JOURNAL_RULE}`);

  if (instances.length === 0) {
    lines.push('');
    lines.push('  Nothing undertaken yet. The world will ask soon enough.');
    return lines.join('\n');
  }

  for (const instance of active) {
    lines.push(...journalQuestLines(instance, defs.get(instance.questId)));
  }

  if (completed.length > 0) {
    lines.push('');
    lines.push('  ── Completed ──');
    for (const instance of completed) {
      lines.push(`  • ${defs.get(instance.questId)?.name ?? instance.questId}`);
    }
  }

  // quest-core never marks a quest 'failed' today (failStage is a branch, not
  // a terminal state — its documented ceiling), but core's QuestState models
  // the status, so a save that carries one still renders honestly.
  if (failed.length > 0) {
    lines.push('');
    lines.push('  ── Failed ──');
    for (const instance of failed) {
      lines.push(`  • ${defs.get(instance.questId)?.name ?? instance.questId}`);
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Director — the ledger entry (F-ENG005)
// ---------------------------------------------------------------------------

/** The ledger entry's label. Sentinel verb: routed by `group === 'director'`
 *  in the extras dispatch, never meant to reach the engine as an action. */
export const DIRECTOR_MENU_LABEL = "Director's Ledger — the strategic picture";
export const DIRECTOR_MENU_VERB = 'director-ledger';

/**
 * The extras menu's Director's Ledger entry — ALWAYS present, no env gate:
 * unlike the operator-only debug view, the ledger is part of the shipped
 * player surface. Selecting it renders renderDirectorLedger (director.ts);
 * the wiring routes on `group: 'director'` instead of submitting the sentinel
 * verb — consulting the ledger must not advance the world.
 */
export function buildDirectorActions(): ExtraAction[] {
  return [{ verb: DIRECTOR_MENU_VERB, label: DIRECTOR_MENU_LABEL, group: 'director' }];
}

// ---------------------------------------------------------------------------
// Debug — inspector report (F-ENG006)
// ---------------------------------------------------------------------------

/** The debug entry's label. Sentinel verb: routed by `group === 'debug'` in the
 *  extras dispatch, never meant to reach the engine as an action. */
export const DEBUG_MENU_LABEL = 'Debug: inspect simulation state';
export const DEBUG_MENU_VERB = 'debug-inspect';

/**
 * The extras menu's debug entry — present ONLY when the operator set
 * AI_RPG_DEBUG=1, so the player surface stays clean. Selecting it renders
 * renderInspectorReport (the wiring routes on `group: 'debug'` instead of
 * submitting the sentinel verb to the engine — inspection must not advance
 * the world).
 */
export function buildDebugActions(
  env: Record<string, string | undefined> = process.env,
): ExtraAction[] {
  if (env.AI_RPG_DEBUG !== '1') return [];
  return [{ verb: DEBUG_MENU_VERB, label: DEBUG_MENU_LABEL, group: 'debug' }];
}

const DEBUG_RULE = '═'.repeat(60);

/**
 * Render every registered inspector's output (Engine.getInspectors — the 14
 * per-starter inspectors that previously had zero consumers): label + id as a
 * section title, then the inspected state pretty-printed as JSON. Plain text,
 * two-space indented like the rest of the CLI — no new styling system.
 *
 * Guarded per inspector: a throwing `inspect` (or unserializable return, e.g.
 * a circular structure) degrades to ONE bounded line via describeActionError
 * and the report moves on — a buggy inspector can never take down the session
 * or hide its siblings.
 */
export function renderInspectorReport(
  engine: Pick<Engine, 'getInspectors' | 'world'>,
): string {
  const inspectors = engine.getInspectors();
  const lines: string[] = [];
  lines.push(`  ${DEBUG_RULE}`);
  lines.push(`  DEBUG — SIMULATION INSPECTORS (${inspectors.length})`);
  lines.push(`  ${DEBUG_RULE}`);

  if (inspectors.length === 0) {
    lines.push('');
    lines.push('  No debug inspectors are registered for this pack.');
    return lines.join('\n');
  }

  for (const inspector of inspectors) {
    lines.push('');
    lines.push(`  ── ${inspector.label} (${inspector.id}) ──`);
    try {
      const value = inspector.inspect(engine.world);
      const body = JSON.stringify(value, null, 2) ?? String(value);
      for (const bodyLine of body.split('\n')) lines.push(`  ${bodyLine}`);
    } catch (err) {
      lines.push(`  [inspector failed: ${describeActionError(err)}]`);
    }
  }

  return lines.join('\n');
}

/** All appended entries — abilities, then unlocks, then the always-on player
 *  surfaces in reading order (the Journal, then the Director's Ledger), then
 *  the env-gated debug entry last (the operator surface stays at the
 *  bottom). Stable order, pure over state. */
export function buildExtraActions(
  engine: Engine,
  trees: ProgressionTreeDefinition[] = [],
): ExtraAction[] {
  return [
    ...buildAbilityActions(engine.world, getAbilityCatalog(engine)),
    ...buildUnlockActions(engine.world, trees),
    ...buildJournalActions(),
    ...buildDirectorActions(),
    ...buildDebugActions(),
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
 * The player's level as the CLI understands it: 1 + total progression nodes
 * the player unlocked across all trees (progression-core persists no explicit
 * level of its own). Single authority shared by the HUD (buildHudWorld) and
 * the endgame evaluator (buildEndgameInputs) so the two can never disagree.
 */
export function derivePlayerLevel(world: WorldState): number {
  const unlockedByTree = (world.modules['progression-core'] as
    | { unlocked?: Record<string, Record<string, string[]>> }
    | undefined)?.unlocked?.[world.playerId] ?? {};
  return 1 + Object.values(unlockedByTree).reduce((sum, nodes) => sum + nodes.length, 0);
}

/**
 * Display-only copy of the world whose player carries `xp` and `level`
 * pseudo-resources, so terminal-ui's existing vitals renderer (which renders
 * every player resource it is handed) shows them with zero terminal-ui
 * changes. Never mutates live state — a save taken after rendering is
 * byte-identical to one taken before.
 *
 * xp    — progression-core currency balance (the trees' currency, default 'xp')
 * level — derivePlayerLevel (1 + total progression nodes unlocked across all trees)
 */
export function buildHudWorld(
  world: WorldState,
  trees: ProgressionTreeDefinition[] = [],
): WorldState {
  const player = world.entities[world.playerId];
  if (!player) return world;

  const currencyId = trees[0]?.currency ?? 'xp';
  const xp = getCurrency(world, world.playerId, currencyId);
  const level = derivePlayerLevel(world);

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
