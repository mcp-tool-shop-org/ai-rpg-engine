// condition-eval.ts — the closed, total evaluator for compiled ConditionSpecs (C3/P2).
//
// World Forge authors conditions in a string grammar and COMPILES them at export
// into `ConditionSpec` ({type, params}) — RG-C1 Lane 2's ink pattern, where a rich
// authoring grammar compiles to a closed, engine-owned instruction format. The
// engine never parses author syntax. This file is the other half: it EVALUATES
// that closed format, and nothing else.
//
// The properties are the binding ones from Lane 2, and each is asserted in
// `condition-eval.test.ts`:
//
//   - CLOSED. Fourteen operand families, enumerated below. Content selects and
//     parameterizes; it never defines a predicate. (Bethesda's CTDA row: one
//     enumerated condition-function table reused across ~20 record types is what
//     makes mass data authoring safe.)
//   - TOTAL. No throw, ever. An unknown `type`, a missing operand, a malformed
//     param — all return `false` with a stated reason. A predicate that throws
//     inside a movement gate is a crash on a keypress.
//   - PURE. No RNG, no clock, no environment. `random-probability` is REFUSED for
//     gates at export, because a gate that rolls dice is not a lock.
//   - TERMINATING BY CONSTRUCTION. No recursion, no loops over authored data
//     beyond a fixed-length fold. (CEL / JsonLogic set this bar.)
//
// ⚠ AND ONE THING MEASURED BEFORE ANY OF IT WAS WRITTEN. C1's `light` finding is
// the standing lesson of this arc: carrying a field is necessary and NOT
// sufficient — a rule needs the REST of its inputs, and `light` crossed
// faithfully and measured inert because nothing exercised its reader. So every
// operand below was checked against a booted world FIRST, and the ones whose
// inputs do not exist are marked `unevaluable` rather than quietly returning
// false. A gate built on an unevaluable operand is NAMED at intake, not
// discovered by a player who cannot open a door.
//
// The measurement, on `chapel-threshold` at seed 71:
//
//   has-item        ✓ player.inventory: string[]
//   has-flag        ✓ world.globals (empty at boot; gameplay populates it)
//   quest-progress  ✓ world.quests
//   faction-rep     ✓ world.factions + `reputation_<id>` globals
//   faction-access  ✓ actor.custom `access.<factionId>` then reputation band (F-7d2c4c59)
//   party-size      ✓ companion-core: { companions: [], maxSize: 3, cohesion: 0 }
//   party-member    ✓ same
//   party-class     ✓ same
//   always / never  ✓ trivially
//   player-level    ✗ NO INPUT — progression-core state is { currencies, unlocked };
//                     player stats are vigor/instinct/will. This engine has no
//                     level concept at all.
//   party-level     ✗ NO INPUT — derived from player-level.
//   time-of-day     ✗ NO INPUT — nothing tracks time of day; `world.meta.tick` is
//                     a counter, not a clock. (C3/P4 gives `Zone.timeOfDay` a
//                     channel, which is what will supply this one.)
//   random-probability ⊘ REFUSED for gates by design, not for want of an input.

import type { WorldState, EntityState } from '@ai-rpg-engine/core';
import { getActiveCompanions, getPartyState } from './companion-core.js';
import { getFactionAccess } from './social-consequence.js';

type FactionAccessLevel = 'denied' | 'restricted' | 'normal' | 'privileged';

/** The compiled condition shape the wire carries. Structurally typed. */
export type ConditionSpecLike = {
  type: string;
  params?: Record<string, string | number | boolean>;
};

/**
 * Why an operand could not be decided, when it could not.
 *
 * `unevaluable` is the important one and the reason this returns a record rather
 * than a bare boolean: "the condition is false" and "this engine cannot answer
 * this question" are different facts, and collapsing them is how a gate silently
 * locks a door forever.
 */
export type ConditionVerdict = {
  /** The answer. Always present — an unevaluable condition is `false`, fail-closed. */
  ok: boolean;
  /** False when the engine has no input for this operand family. */
  evaluable: boolean;
  /** One sentence, present whenever `ok` is false or `evaluable` is false. */
  reason?: string;
};

/**
 * Operand families this engine has no input for, with what is missing.
 *
 * Exported as data so a test can assert the list rather than trust the prose, and
 * so intake can name them. Deliberately NOT a silent `false`: C0 measured four
 * silent fallbacks in this lane and every one turned an authoring mistake into a
 * behaviour change nobody could see.
 */
export const UNEVALUABLE_OPERANDS: Readonly<Record<string, string>> = {
  'player-level':
    'this engine has no character level — progression-core tracks currencies and unlocked nodes, and entity stats are vigor/instinct/will. Gate on a stat, an item or a flag instead.',
  'party-level':
    'derived from character level, which this engine does not have (see player-level).',
  'time-of-day':
    'nothing in the engine tracks time of day; world.meta.tick is a counter, not a clock. Zone.timeOfDay reaches the runtime at C3/P4 and will supply this operand.',
};

/**
 * Operand families deliberately refused in a GATE position, with why.
 *
 * Separate from {@link UNEVALUABLE_OPERANDS} because the distinction matters: one
 * is a missing input, the other is a design ruling. A reader who conflates them
 * will "fix" the wrong one.
 */
export const GATE_REFUSED_OPERANDS: Readonly<Record<string, string>> = {
  'random-probability':
    'a gate that rolls dice is not a lock — the same door would open on one attempt and refuse the next, which no player can read. Use it for spawns, not for access.',
};

/** Every family the evaluator knows. The closed vocabulary, enumerable at runtime. */
export const KNOWN_CONDITION_TYPES = [
  'always',
  'never',
  'has-item',
  'has-flag',
  'quest-progress',
  'faction-rep',
  'faction-access',
  'party-size',
  'party-member',
  'party-class',
  'player-level',
  'party-level',
  'time-of-day',
  'random-probability',
] as const;

/** Rank of a faction access level. denied is fail-closed against any higher gate. */
const ACCESS_RANK: Record<FactionAccessLevel, number> = {
  denied: 0,
  restricted: 1,
  normal: 2,
  privileged: 3,
};

function asAccessLevel(value: unknown): FactionAccessLevel | undefined {
  return typeof value === 'string' && value in ACCESS_RANK ? (value as FactionAccessLevel) : undefined;
}

// --- Operand readers ------------------------------------------------------

function str(params: ConditionSpecLike['params'], key: string): string | undefined {
  const v = params?.[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function num(params: ConditionSpecLike['params'], key: string): number | undefined {
  const v = params?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** Apply a comparator from the closed set. Unknown operator ⇒ undefined, never a guess. */
function compare(op: string | undefined, left: number, right: number): boolean | undefined {
  switch (op) {
    case '>': return left > right;
    case '<': return left < right;
    case '>=': return left >= right;
    case '<=': return left <= right;
    case '==': return left === right;
    default: return undefined;
  }
}

/**
 * The party, as the engine actually models it: the acting entity plus its ACTIVE
 * companions. `getActiveCompanions` is companion-core's own reader, so "party"
 * here means exactly what it means everywhere else in the engine rather than a
 * second definition invented for gates.
 */
function partyOf(world: WorldState, actor: EntityState): EntityState[] {
  const members: EntityState[] = [actor];
  // `getPartyState` reads companion-core's namespace and repairs a malformed one;
  // `getActiveCompanions` filters to the ACTIVE party (dismissed companions are
  // still recorded). Both are companion-core's own readers, so "party" here means
  // exactly what it means everywhere else rather than a second definition
  // invented for gates. The identity field is `npcId` — the same id as the
  // EntityState, by that type's own comment.
  for (const companion of getActiveCompanions(getPartyState(world))) {
    const entity = world.entities[companion.npcId];
    if (entity && entity.id !== actor.id) members.push(entity);
  }
  return members;
}

// --- The evaluator --------------------------------------------------------

/**
 * Evaluate one compiled condition against a world and an acting entity.
 *
 * Total: returns a verdict for every input, including `null`, a non-object, an
 * unknown type and a known type with garbage params. Never throws.
 */
export function evaluateCondition(
  spec: unknown,
  world: WorldState,
  actorId: string,
): ConditionVerdict {
  if (spec === null || typeof spec !== 'object' || Array.isArray(spec)) {
    return { ok: false, evaluable: false, reason: 'condition is not an object' };
  }
  const { type, params } = spec as ConditionSpecLike;
  if (typeof type !== 'string' || type.length === 0) {
    return { ok: false, evaluable: false, reason: 'condition has no `type`' };
  }

  const refused = GATE_REFUSED_OPERANDS[type];
  if (refused) return { ok: false, evaluable: false, reason: refused };

  const missing = UNEVALUABLE_OPERANDS[type];
  if (missing) return { ok: false, evaluable: false, reason: `"${type}" has no input in this engine: ${missing}` };

  const actor = world.entities[actorId];
  if (!actor) {
    return { ok: false, evaluable: false, reason: `no acting entity "${actorId}"` };
  }

  switch (type) {
    case 'always':
      return { ok: true, evaluable: true };

    case 'never':
      return { ok: false, evaluable: true, reason: 'condition is `never`' };

    case 'has-item': {
      const id = str(params, 'id');
      if (!id) return { ok: false, evaluable: false, reason: 'has-item needs a non-empty `id`' };
      // Party-wide, not actor-only: a key one companion is carrying opens the
      // door for the group, which is what "the party holds an item" means in the
      // grammar's own docstring.
      const held = partyOf(world, actor).some((m) => (m.inventory ?? []).includes(id));
      return held
        ? { ok: true, evaluable: true }
        : { ok: false, evaluable: true, reason: `the party does not hold "${id}"` };
    }

    case 'has-flag': {
      const id = str(params, 'id');
      if (!id) return { ok: false, evaluable: false, reason: 'has-flag needs a non-empty `id`' };
      const value = world.globals[id];
      // Presence is not truth: a flag explicitly set to `false` or `0` is NOT
      // set. Treating any present key as true would make `flag:x` unclearable.
      const set = value !== undefined && value !== false && value !== 0 && value !== '';
      return set
        ? { ok: true, evaluable: true }
        : { ok: false, evaluable: true, reason: `flag "${id}" is not set` };
    }

    case 'quest-progress': {
      const id = str(params, 'id');
      const stage = str(params, 'stage');
      if (!id || !stage) {
        return { ok: false, evaluable: false, reason: 'quest-progress needs `id` and `stage`' };
      }
      const quest = world.quests[id];
      if (!quest) return { ok: false, evaluable: true, reason: `quest "${id}" has not started` };
      // Exact stage match. "At or past a given stage" (the grammar's docstring)
      // needs a stage ORDERING the engine does not expose — QuestState carries a
      // current stage id, not an index — so the honest implementation is equality,
      // and the limit is stated rather than approximated with a guess.
      const current = (quest as { currentStage?: unknown; stage?: unknown }).currentStage
        ?? (quest as { stage?: unknown }).stage;
      return current === stage
        ? { ok: true, evaluable: true }
        : { ok: false, evaluable: true, reason: `quest "${id}" is at "${String(current)}", not "${stage}"` };
    }

    case 'faction-access': {
      const factionId = str(params, 'factionId');
      const minLevel = asAccessLevel(params?.minLevel);
      if (!factionId || !minLevel) {
        return { ok: false, evaluable: false, reason: 'faction-access needs `factionId` and `minLevel`' };
      }
      const faction = world.factions[factionId] as { reputation?: number } | undefined;
      const global = world.globals[`reputation_${factionId}`];
      const rep = (faction?.reputation ?? 0) + (typeof global === 'number' ? global : 0);
      const storedRaw = actor.custom?.[`access.${factionId}`];
      const stored = asAccessLevel(storedRaw);
      const level = getFactionAccess(rep, stored);
      // Denied is fail-closed against any gate that asks for more than denied.
      const ok = ACCESS_RANK[level] >= ACCESS_RANK[minLevel];
      return ok
        ? { ok: true, evaluable: true }
        : { ok: false, evaluable: true, reason: `access with "${factionId}" is ${level}, not ${minLevel}` };
    }

    case 'faction-rep': {
      const id = str(params, 'id');
      const op = str(params, 'op');
      const value = num(params, 'value');
      if (!id || value === undefined) {
        return { ok: false, evaluable: false, reason: 'faction-rep needs `id` and a numeric `value`' };
      }
      // Both readers the engine already uses, summed the same way
      // crafting-recipes.ts does it — one definition of "reputation", not two.
      const faction = world.factions[id] as { reputation?: number } | undefined;
      const global = world.globals[`reputation_${id}`];
      const rep = (faction?.reputation ?? 0) + (typeof global === 'number' ? global : 0);
      const result = compare(op, rep, value);
      if (result === undefined) {
        return { ok: false, evaluable: false, reason: `unknown comparator "${String(op)}"` };
      }
      return result
        ? { ok: true, evaluable: true }
        : { ok: false, evaluable: true, reason: `reputation with "${id}" is ${rep}, not ${op}${value}` };
    }

    case 'party-size': {
      const op = str(params, 'op');
      const value = num(params, 'value');
      if (value === undefined) {
        return { ok: false, evaluable: false, reason: 'party-size needs a numeric `value`' };
      }
      const size = partyOf(world, actor).length;
      const result = compare(op, size, value);
      if (result === undefined) {
        return { ok: false, evaluable: false, reason: `unknown comparator "${String(op)}"` };
      }
      return result
        ? { ok: true, evaluable: true }
        : { ok: false, evaluable: true, reason: `the party is ${size}, not ${op}${value}` };
    }

    case 'party-member': {
      const id = str(params, 'id');
      if (!id) return { ok: false, evaluable: false, reason: 'party-member needs a non-empty `id`' };
      const present = partyOf(world, actor).some((m) => m.id === id);
      return present
        ? { ok: true, evaluable: true }
        : { ok: false, evaluable: true, reason: `"${id}" is not with the party` };
    }

    case 'party-class': {
      const id = str(params, 'id');
      if (!id) return { ok: false, evaluable: false, reason: 'party-class needs a non-empty `id`' };
      // Class is expressed as a tag — the engine's own idiom (`role:boss`,
      // `merchant`, `companion` are all tags), and `tags` is the richest carried
      // entity field in the lane. Both the bare form and the `class:`-prefixed
      // form are accepted, because content authors both.
      const present = partyOf(world, actor).some(
        (m) => m.tags.includes(id) || m.tags.includes(`class:${id}`),
      );
      return present
        ? { ok: true, evaluable: true }
        : { ok: false, evaluable: true, reason: `no party member is "${id}"` };
    }

    default:
      // Unknown to the closed vocabulary. Fail-closed with the vocabulary named,
      // so an author sees what they could have written.
      return {
        ok: false,
        evaluable: false,
        reason:
          `unknown condition type "${type}" — this engine evaluates: ` +
          `${KNOWN_CONDITION_TYPES.filter((t) => !GATE_REFUSED_OPERANDS[t] && !UNEVALUABLE_OPERANDS[t]).join(', ')}`,
      };
  }
}

/** One unmet condition, for the refusal payload. */
export type UnmetCondition = {
  condition: ConditionSpecLike;
  reason: string;
  /** True when the engine could not answer, as opposed to answered "no". */
  unevaluable: boolean;
};

/**
 * Evaluate an AND-array of conditions. ALL must hold.
 *
 * Returns every unmet condition, not just the first: an author fixing a gate
 * should see the whole reason it refused, and a player-facing message built from
 * one of three unmet requirements is a worse "show the lock" than one built from
 * three. (The same reasoning as the load gate running all four checks.)
 *
 * An EMPTY array is `met: true` — vacuously, and that is why the exporter refuses
 * to emit a gate whose conditions all failed to compile: an empty AND-array would
 * silently unlock the zone.
 */
export function evaluateConditions(
  conditions: readonly unknown[],
  world: WorldState,
  actorId: string,
): { met: boolean; unmet: UnmetCondition[] } {
  const unmet: UnmetCondition[] = [];
  for (const condition of conditions) {
    const verdict = evaluateCondition(condition, world, actorId);
    if (!verdict.ok) {
      unmet.push({
        condition: (condition ?? {}) as ConditionSpecLike,
        reason: verdict.reason ?? 'unmet',
        unevaluable: !verdict.evaluable,
      });
    }
  }
  return { met: unmet.length === 0, unmet };
}
