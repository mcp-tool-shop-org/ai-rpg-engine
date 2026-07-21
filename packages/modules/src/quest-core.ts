// quest-core — the minimal quest loop: offer → accept → track → complete →
// reward (F-ENG005-quest-loop-min — "the explicit reason to return").
//
// The schema has been waiting for this runtime since content-schema shipped:
// QuestDefinition/QuestStage (schemas.ts), validateQuestDefinition
// (validate.ts), and the stage ref-checker (refs.ts) all exist — and core's
// own WorldState carries a `quests: Record<string, QuestState>` container
// (types.ts) that NOTHING wrote until now. This module is the missing wire,
// not a new design: it honors both authorities exactly.
//
// WHAT THE SCHEMA MODELS → HOW THE RUNTIME MAPS IT
//   - `QuestDefinition.triggers` (TriggerDefinition[]: event + condition +
//     effect) → the OFFER surface. Each trigger is an event listener: when an
//     eventLog event of that type lands (and the condition passes), the quest
//     is offered. The trigger's effect must be `{ type: 'offer' }` — the one
//     verb a quest-level trigger can mean here.
//   - `QuestStage.triggers` → TRACKING. A stage listens while it is the
//     current stage. Effects: `advance` (stage done), `progress` (+1 toward
//     `params.count`, stage done at count — the counter persists in
//     QuestState.data), `fail` (branch to the stage's `failStage`).
//   - `nextStage` / `failStage` → the stage graph. A completed stage with no
//     `nextStage` completes the QUEST. `failStage` is a BRANCH target (the
//     quest continues down the fail path), not a terminal state.
//   - `QuestDefinition.rewards` (RewardDefinition: type + params) → grants at
//     completion: `xp` and `currency` ride progression-core's own ledger
//     (addCurrency — the same path the starters' progressionRewards use);
//     `item` rides inventory-core's giveItem and its `item.acquired` event.
//   - `QuestStage.objectives` (string[]) → display strings, surfaced verbatim
//     on quest events and the CLI journal. The schema models them as prose,
//     so the runtime never parses them — triggers carry the mechanics.
//   - Runtime state lives in core's own `world.quests` container (QuestState:
//     status/currentStage/stageStatuses/data), NOT a parallel module
//     namespace — offered = key present, active/completed = status, per-stage
//     progress = data[`progress:<stageId>`]. It rides every save natively.
//
// ATTRIBUTION: quest progress is the PLAYER's journal. An event drives offers
// and tracking only when it is player-attributed (`event.actorId` is the
// player) or system-attributed (no actorId — quest.* lifecycle events, world
// reactions). NPC movement and NPC kills never advance a quest — the same
// lesson the starters' firstVisit XP rewards learned with `playerOnly`.
// (`combat.entity.defeated` carries the attacker as actorId, so player kills
// pass and NPC-vs-NPC kills don't.)
//
// DETERMINISM: no randomness, no clock. Definitions iterate in authored
// (config) order; per event, at most ONE stage transition per quest (the
// first firing trigger wins); re-entrant events (a quest.completed offering a
// chained quest) drain FIFO through a local queue, so same events in ⇒ same
// events out, byte for byte. Emitted events carry `causedBy` provenance and
// go through the canonical recordEvent choke point (deterministic ids).
//
// FAIL LOUD: createQuestCore validates every definition at construction —
// first against validateQuestDefinition (the schema authority), then against
// this runtime's own vocabulary (validateQuestRuntimeContent: trigger
// effects, condition types, reward types, stage refs). Invalid content
// throws with every problem named — a quest that could never offer, a reward
// that would silently vanish, or a typo'd condition dies at assembly, not
// mid-session.
//
// HONEST CEILINGS (documented, not oversights):
//   - ACCEPT is automatic: an offered quest goes straight to 'active' at its
//     first stage. Core's QuestState models no 'offered' holding status, and
//     minting a new accept/decline verb is a player-surface decision beyond
//     this minimal slice. An accept-choice surface (offer → player decides)
//     is future work; `quest.offered` (payload `autoAccepted: true`) is the
//     honest event name for the moment the journal takes the quest.
//   - `QuestDefinition.failConditions` (quest-level ConditionSpec[]) are
//     validated but NOT evaluated — terminal quest failure needs a surface
//     for "the quest is lost" that this slice does not mint. Stage-level
//     `fail` triggers (the failStage branch) ARE live.
//   - Trigger `event` strings match event types exactly (no wildcards) — the
//     same contract progression-core's reward eventPattern subscriptions use.

import type {
  EngineModule,
  ModuleRegistrationContext,
  ResolvedEvent,
  WorldState,
  QuestState,
} from '@ai-rpg-engine/core';
import { genId } from '@ai-rpg-engine/core';
import {
  validateQuestDefinition,
  type QuestDefinition,
  type QuestStage,
  type ConditionSpec,
  type TriggerDefinition,
} from '@ai-rpg-engine/content-schema';
import { addCurrency } from './progression-core.js';
import { giveItem } from './inventory-core.js';

// ---------------------------------------------------------------------------
// Vocabulary (exported so tests and content tooling pin names, not strings)
// ---------------------------------------------------------------------------

/** The one effect type a quest-level (offer) trigger may carry. */
export const QUEST_OFFER_EFFECT = 'offer';

/** Effect types a stage trigger may carry. */
export const QUEST_STAGE_EFFECT_TYPES = ['advance', 'progress', 'fail'] as const;

/**
 * Condition types this runtime evaluates. `global-equals`/`global-set` mirror
 * dialogue-core's vocabulary; `payload-equals` matches an event payload field
 * (a specific zone, a specific entity id); `payload-entity-has-tag` resolves a
 * payload field as an entity id and checks its tags (kills by tag — the
 * defeated entity is still in world.entities as a corpse when the event
 * lands, so the lookup is reliable).
 */
export const QUEST_CONDITION_TYPES = [
  'global-equals',
  'global-set',
  'payload-equals',
  'payload-entity-has-tag',
] as const;

/** Reward types this runtime grants. Anything else is invalid content. */
export const QUEST_REWARD_TYPES = ['xp', 'currency', 'item'] as const;

// ---------------------------------------------------------------------------
// Config + content registry (the encounter-spawn idiom: definitions are code-
// side config keyed by world.meta.gameId, so the CLI journal can resolve
// display strings for whatever pack the loaded world belongs to)
// ---------------------------------------------------------------------------

export type QuestCoreConfig = {
  /** The pack's manifest id (world.meta.gameId) — the registry key. */
  gameId: string;
  /** The pack's authored quests. Validated at construction — fail loud. */
  quests: QuestDefinition[];
};

const registry = new Map<string, Map<string, QuestDefinition>>();

/** Exposed for tests: drop a pack's registered quest definitions. */
export function unregisterQuestContent(gameId: string): void {
  registry.delete(gameId);
}

/**
 * The authored quest definitions for THIS world's pack (world.meta.gameId),
 * in authored order. [] when the pack registered no quest content — journal
 * consumers degrade to the ids QuestState itself carries.
 */
export function getQuestDefinitions(world: WorldState): QuestDefinition[] {
  const byId = registry.get(world.meta.gameId);
  return byId ? [...byId.values()] : [];
}

// ---------------------------------------------------------------------------
// Content validation — the runtime's own vocabulary, layered on the schema
// ---------------------------------------------------------------------------

function checkCondition(cond: ConditionSpec | undefined, where: string, problems: string[]): void {
  if (!cond) return;
  if (!(QUEST_CONDITION_TYPES as readonly string[]).includes(cond.type)) {
    problems.push(
      `${where}: unknown condition type "${cond.type}" (known: ${QUEST_CONDITION_TYPES.join(', ')})`,
    );
  }
}

/**
 * Validate quests against THIS runtime's vocabulary (the schema's open
 * strings become closed sets where the runtime must act on them). Returns
 * human-readable problems ([] = valid). createQuestCore runs this after
 * validateQuestDefinition and throws on any problem — invalid quest content
 * must die at assembly, never degrade silently mid-session.
 */
export function validateQuestRuntimeContent(quests: QuestDefinition[]): string[] {
  const problems: string[] = [];
  const seenQuestIds = new Set<string>();

  for (const quest of quests) {
    const q = `quest "${quest.id}"`;
    if (seenQuestIds.has(quest.id)) {
      problems.push(`${q}: duplicate quest id`);
      continue;
    }
    seenQuestIds.add(quest.id);

    if (quest.stages.length === 0) {
      problems.push(`${q}: must have at least one stage`);
      continue;
    }

    // A quest with no offer trigger can never enter play — dead content.
    if (!quest.triggers || quest.triggers.length === 0) {
      problems.push(`${q}: needs at least one quest-level trigger (the offer surface)`);
    }
    for (const trigger of quest.triggers ?? []) {
      if (trigger.effect.type !== QUEST_OFFER_EFFECT) {
        problems.push(
          `${q}: quest-level trigger on "${trigger.event}" has effect type "${trigger.effect.type}" — quest-level triggers must use "${QUEST_OFFER_EFFECT}"`,
        );
      }
      checkCondition(trigger.condition, `${q}: offer trigger on "${trigger.event}"`, problems);
    }

    const stageIds = new Set<string>();
    for (const stage of quest.stages) {
      const s = `${q} stage "${stage.id}"`;
      if (stageIds.has(stage.id)) problems.push(`${s}: duplicate stage id`);
      stageIds.add(stage.id);
    }
    for (const stage of quest.stages) {
      const s = `${q} stage "${stage.id}"`;
      // Ref integrity (refs.ts parity — re-checked here so construction is
      // self-contained even for packs that never run the cross-content checker).
      if (stage.nextStage && !stageIds.has(stage.nextStage)) {
        problems.push(`${s}: nextStage "${stage.nextStage}" does not exist`);
      }
      if (stage.failStage && !stageIds.has(stage.failStage)) {
        problems.push(`${s}: failStage "${stage.failStage}" does not exist`);
      }
      for (const trigger of stage.triggers ?? []) {
        const t = `${s} trigger on "${trigger.event}"`;
        const effectType = trigger.effect.type;
        if (!(QUEST_STAGE_EFFECT_TYPES as readonly string[]).includes(effectType)) {
          problems.push(
            `${t}: unknown effect type "${effectType}" (known: ${QUEST_STAGE_EFFECT_TYPES.join(', ')})`,
          );
        }
        if (effectType === 'progress') {
          const count = trigger.effect.params.count;
          if (typeof count !== 'number' || !Number.isInteger(count) || count < 1) {
            problems.push(`${t}: progress effect needs params.count (integer >= 1)`);
          }
        }
        if (effectType === 'fail' && !stage.failStage) {
          problems.push(`${t}: fail effect on a stage with no failStage`);
        }
        checkCondition(trigger.condition, t, problems);
      }
    }

    for (const reward of quest.rewards ?? []) {
      const r = `${q} reward "${reward.type}"`;
      if (!(QUEST_REWARD_TYPES as readonly string[]).includes(reward.type)) {
        problems.push(`${r}: unknown reward type (known: ${QUEST_REWARD_TYPES.join(', ')})`);
        continue;
      }
      if (reward.type === 'xp' || reward.type === 'currency') {
        const amount = reward.params.amount;
        if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
          problems.push(`${r}: needs params.amount (number > 0)`);
        }
      }
      if (reward.type === 'currency' && typeof reward.params.currencyId !== 'string') {
        problems.push(`${r}: needs params.currencyId (string)`);
      }
      if (reward.type === 'item' && typeof reward.params.itemId !== 'string') {
        problems.push(`${r}: needs params.itemId (string)`);
      }
    }

    // failConditions: validated by the schema pass; explicitly a documented
    // ceiling at runtime (see file header) — nothing to check here.
  }

  return problems;
}

// ---------------------------------------------------------------------------
// Condition evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate one authored condition against the triggering event + world.
 * Unknown types fail CLOSED (an unknown condition silently passing would
 * auto-fire offers) — construction validation makes this branch unreachable
 * for content that came through createQuestCore.
 */
export function evaluateQuestCondition(
  cond: ConditionSpec,
  event: ResolvedEvent,
  world: WorldState,
): boolean {
  switch (cond.type) {
    case 'global-equals':
      return world.globals[String(cond.params.key)] === cond.params.value;
    case 'global-set':
      return world.globals[String(cond.params.key)] !== undefined;
    case 'payload-equals':
      return event.payload[String(cond.params.key)] === cond.params.value;
    case 'payload-entity-has-tag': {
      const key = typeof cond.params.key === 'string' ? cond.params.key : 'entityId';
      const entityId = event.payload[key];
      const tag = cond.params.tag;
      if (typeof entityId !== 'string' || typeof tag !== 'string') return false;
      return world.entities[entityId]?.tags.includes(tag) ?? false;
    }
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Journal read helpers (the CLI's Journal screen builds on these)
// ---------------------------------------------------------------------------

/** Key under which a stage's progress counter persists in QuestState.data. */
function progressKey(stageId: string): string {
  return `progress:${stageId}`;
}

/** Accumulated progress for a stage (0 when none recorded). */
export function questProgressCount(instance: QuestState, stageId: string): number {
  const value = instance.data?.[progressKey(stageId)];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * The stage's progress requirement, when it has a `progress` trigger
 * (undefined for advance/fail-only stages — nothing to count).
 */
export function questProgressRequired(stage: QuestStage): number | undefined {
  for (const trigger of stage.triggers ?? []) {
    if (trigger.effect.type === 'progress') {
      const count = trigger.effect.params.count;
      if (typeof count === 'number' && Number.isFinite(count)) return count;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Presentation — display-ready strings ride the payload so the renderer's
// cases stay dumb (the encounter-spawn `label: description` contract)
// ---------------------------------------------------------------------------

/** Strip terminal punctuation so the renderer's own `.` never doubles up. */
function stripTerminal(text: string): string {
  return text.replace(/[\s.!?]+$/u, '');
}

/** The stage's one-line player hook: description first, then name. */
function stageHook(stage: QuestStage): string {
  return stripTerminal(stage.description ?? stage.name);
}

// ---------------------------------------------------------------------------
// The loop
// ---------------------------------------------------------------------------

function emitQuestEvent(
  ctx: ModuleRegistrationContext,
  cause: ResolvedEvent,
  type: string,
  payload: Record<string, unknown>,
  priority: 'normal' | 'high',
): void {
  // id '' → stamped deterministically by recordEvent (the makeEvent contract).
  // No actorId: quest lifecycle events are system-attributed, which also lets
  // them drive chained offers through the attribution gate.
  ctx.events.emit({
    id: '',
    tick: cause.tick,
    type,
    payload,
    causedBy: cause.id,
    visibility: 'public',
    presentation: { channels: ['narrator'], priority },
  });
}

function offerQuest(
  world: WorldState,
  quest: QuestDefinition,
  cause: ResolvedEvent,
  ctx: ModuleRegistrationContext,
): void {
  const first = quest.stages[0];
  const stageStatuses: QuestState['stageStatuses'] = {};
  for (const stage of quest.stages) {
    stageStatuses[stage.id] = stage.id === first.id ? 'active' : 'locked';
  }
  // Keyed by DEFINITION id: one instance per quest, and the key's presence is
  // the structural "offered once" guard (no separate ledger to drift).
  world.quests[quest.id] = {
    id: genId(world, 'quest'),
    questId: quest.id,
    status: 'active',
    currentStage: first.id,
    stageStatuses,
    data: {},
  };
  emitQuestEvent(ctx, cause, 'quest.offered', {
    questId: quest.id,
    questName: quest.name,
    autoAccepted: true, // documented ceiling — see file header
    stageId: first.id,
    stageName: first.name,
    stageDescription: stageHook(first),
    objectives: first.objectives ?? [],
  }, 'high');
}

function completeQuest(
  world: WorldState,
  quest: QuestDefinition,
  instance: QuestState,
  cause: ResolvedEvent,
  ctx: ModuleRegistrationContext,
): void {
  instance.status = 'completed';
  const rewardSummary = grantRewards(world, quest, cause, ctx);
  emitQuestEvent(ctx, cause, 'quest.completed', {
    questId: quest.id,
    questName: quest.name,
    rewardSummary,
  }, 'high');
}

/**
 * Grant a completed quest's rewards to the player. Returns the human summary
 * strings the quest.completed payload (and its rendered line) carries.
 *
 * xp/currency ride progression-core's own ledger via its exported
 * addCurrency. getProgressionState synthesizes-but-does-not-attach when the
 * namespace is absent, so the ledger is attached first — in the shipped
 * starters progression-core registered it long before any quest completes,
 * and the defaults here are byte-identical to that module's own.
 */
function grantRewards(
  world: WorldState,
  quest: QuestDefinition,
  cause: ResolvedEvent,
  ctx: ModuleRegistrationContext,
): string[] {
  const summary: string[] = [];
  for (const reward of quest.rewards ?? []) {
    switch (reward.type) {
      case 'xp': {
        const amount = reward.params.amount as number;
        ensureProgressionLedger(world);
        addCurrency(world, world.playerId, 'xp', amount, cause.tick);
        summary.push(`${amount} xp`);
        break;
      }
      case 'currency': {
        const amount = reward.params.amount as number;
        const currencyId = reward.params.currencyId as string;
        ensureProgressionLedger(world);
        addCurrency(world, world.playerId, currencyId, amount, cause.tick);
        summary.push(`${amount} ${currencyId}`);
        break;
      }
      case 'item': {
        const itemId = reward.params.itemId as string;
        const player = world.entities[world.playerId];
        if (player) {
          // giveItem mutates the inventory and returns the item.acquired
          // event — recorded through the same canonical choke point, so the
          // grant narrates with the renderer's existing case.
          ctx.events.emit(giveItem(player, itemId, cause.tick));
          summary.push(itemId);
        }
        break;
      }
      default:
        break; // unreachable for validated content (construction throws)
    }
  }
  return summary;
}

function ensureProgressionLedger(world: WorldState): void {
  if (!world.modules['progression-core']) {
    world.modules['progression-core'] = { currencies: {}, unlocked: {} };
  }
}

function transitionToStage(
  world: WorldState,
  quest: QuestDefinition,
  instance: QuestState,
  from: QuestStage,
  toStageId: string,
  via: 'advance' | 'fail',
  cause: ResolvedEvent,
  ctx: ModuleRegistrationContext,
): void {
  const next = quest.stages.find((s) => s.id === toStageId);
  if (!next) return; // construction-checked refs make this unreachable
  instance.currentStage = next.id;
  instance.stageStatuses[next.id] = 'active';
  emitQuestEvent(ctx, cause, 'quest.stage.advanced', {
    questId: quest.id,
    questName: quest.name,
    via,
    fromStageId: from.id,
    fromStageName: from.name,
    stageId: next.id,
    stageName: next.name,
    stageDescription: stageHook(next),
    objectives: next.objectives ?? [],
  }, via === 'fail' ? 'high' : 'normal');
}

function completeStage(
  world: WorldState,
  quest: QuestDefinition,
  instance: QuestState,
  stage: QuestStage,
  cause: ResolvedEvent,
  ctx: ModuleRegistrationContext,
): void {
  instance.stageStatuses[stage.id] = 'completed';
  if (stage.nextStage) {
    transitionToStage(world, quest, instance, stage, stage.nextStage, 'advance', cause, ctx);
    return;
  }
  completeQuest(world, quest, instance, cause, ctx);
}

function applyStageTrigger(
  world: WorldState,
  quest: QuestDefinition,
  instance: QuestState,
  stage: QuestStage,
  trigger: TriggerDefinition,
  cause: ResolvedEvent,
  ctx: ModuleRegistrationContext,
): void {
  switch (trigger.effect.type) {
    case 'progress': {
      const data = instance.data ?? (instance.data = {});
      const key = progressKey(stage.id);
      const current = typeof data[key] === 'number' ? (data[key] as number) : 0;
      const next = current + 1;
      data[key] = next;
      const required = trigger.effect.params.count as number;
      // Below the count: quiet accumulation — the journal shows x/y, and
      // event scarcity keeps the three quest events meaning something.
      if (next >= required) completeStage(world, quest, instance, stage, cause, ctx);
      break;
    }
    case 'advance':
      completeStage(world, quest, instance, stage, cause, ctx);
      break;
    case 'fail':
      if (stage.failStage) {
        instance.stageStatuses[stage.id] = 'failed';
        transitionToStage(world, quest, instance, stage, stage.failStage, 'fail', cause, ctx);
      }
      break;
    default:
      break; // unreachable for validated content
  }
}

function processQuestEvent(
  event: ResolvedEvent,
  world: WorldState,
  questsById: Map<string, QuestDefinition>,
  ctx: ModuleRegistrationContext,
): void {
  // Attribution gate (see file header): player-attributed or system events
  // only. NPC actions never write the player's journal.
  if (event.actorId !== undefined && event.actorId !== world.playerId) return;

  // OFFER phase — authored order. Quests offered by THIS event are excluded
  // from the tracking phase below: their first stage begins after the
  // offering moment, so the offering event can never double as its own
  // objective progress.
  const offeredNow = new Set<string>();
  for (const quest of questsById.values()) {
    if (world.quests[quest.id]) continue; // structural once-guard
    const fired = (quest.triggers ?? []).some(
      (t) =>
        t.event === event.type &&
        (!t.condition || evaluateQuestCondition(t.condition, event, world)),
    );
    if (!fired) continue;
    offerQuest(world, quest, event, ctx);
    offeredNow.add(quest.id);
  }

  // TRACK phase — active quests only; first firing trigger wins; at most one
  // stage transition per quest per event.
  for (const quest of questsById.values()) {
    if (offeredNow.has(quest.id)) continue;
    const instance = world.quests[quest.id];
    if (!instance || instance.status !== 'active') continue;
    const stage = quest.stages.find((s) => s.id === instance.currentStage);
    if (!stage) continue; // foreign/corrupt currentStage — journal still renders raw state
    for (const trigger of stage.triggers ?? []) {
      if (trigger.event !== event.type) continue;
      if (trigger.condition && !evaluateQuestCondition(trigger.condition, event, world)) continue;
      applyStageTrigger(world, quest, instance, stage, trigger, event, ctx);
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Module factory
// ---------------------------------------------------------------------------

/**
 * The quest runtime. Validates {@link QuestCoreConfig.quests} at construction
 * (schema pass + runtime vocabulary — THROWS on any problem, naming all of
 * them), registers the definitions for journal lookups, and subscribes ONE
 * wildcard listener that drives the whole loop off the live event stream.
 *
 * Re-entrancy: handler-emitted events (quest.offered, quest.stage.advanced,
 * quest.completed, reward item.acquired) fan out synchronously through the
 * same bus and re-enter this listener; a FIFO queue drains them in recorded
 * order, so chained quests (offer on `quest.completed`) resolve
 * deterministically and never recurse.
 */
export function createQuestCore(config: QuestCoreConfig): EngineModule {
  const problems: string[] = [];
  for (const quest of config.quests) {
    const result = validateQuestDefinition(quest, `QuestDefinition(${quest?.id ?? '?'})`);
    for (const error of result.errors) problems.push(`${error.path}: ${error.message}`);
  }
  if (problems.length === 0) problems.push(...validateQuestRuntimeContent(config.quests));
  if (problems.length > 0) {
    throw new Error(
      `quest-core: invalid quest content (${problems.length} problem${problems.length === 1 ? '' : 's'}):\n  - ${problems.join('\n  - ')}`,
    );
  }

  const questsById = new Map(config.quests.map((q) => [q.id, q]));

  return {
    id: 'quest-core',
    version: '1.0.0',

    register(ctx) {
      registry.set(config.gameId, questsById);

      const pending: Array<{ event: ResolvedEvent; world: WorldState }> = [];
      let draining = false;
      ctx.events.on('*', (event, world) => {
        pending.push({ event, world });
        if (draining) return;
        draining = true;
        try {
          while (pending.length > 0) {
            const next = pending.shift()!;
            processQuestEvent(next.event, next.world, questsById, ctx);
          }
        } finally {
          draining = false;
        }
      });
    },
  };
}
