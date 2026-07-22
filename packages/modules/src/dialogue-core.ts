// dialogue-core — NPC dialogue trees with choices and conditions

import type {
  EngineModule,
  ActionIntent,
  WorldState,
  ResolvedEvent,
  ScalarValue,
} from '@ai-rpg-engine/core';
import { makeEvent } from './make-event.js';
import type { DialogueDefinition, DialogueNode, EffectDefinition } from '@ai-rpg-engine/content-schema';
// V3-DLG: dialogue vocabulary that reads/writes the social layer. Both are
// read-only imports (getLeverageState/applyLeverageDeltas from player-leverage.ts,
// deriveNpcRelationship from npc-agency.ts) — this file does not edit either
// module. Neither module imports dialogue-core.ts (nor does anything in their
// own dependency chains — cognition-core.ts, faction-cognition.ts,
// pressure-system.ts, player-rumor.ts), so this is a one-directional edge, not
// a cycle.
import { getLeverageState, applyLeverageDeltas } from './player-leverage.js';
import type { LeverageCurrency } from './player-leverage.js';
import { deriveNpcRelationship } from './npc-agency.js';
import type { NpcRelationship } from './npc-agency.js';

export type DialogueState = {
  activeDialogue: string | null;
  activeNodeId: string | null;
  speakerId: string | null;
};

export type DialogueRegistry = Map<string, DialogueDefinition>;

/**
 * Build an action.rejected event that NAMES the rejected verb.
 *
 * The dispatcher (core/actions.ts) stamps `verb: action.verb` into every
 * rejection it raises — unknown verb, a validator/handler throw. Consumers key
 * on that: the CLI's dialogue-trap fall-through (bin.ts `chooseRejected`,
 * CS-C-001) tests `payload.verb === 'choose'`, so a rejection that carried only
 * `{ reason }` was invisible to it — against the real module a mistyped
 * dialogue number was silently accepted as a valid choice and the fall-through
 * never engaged. Routing every rejection here makes "name the verb" structural
 * for this module instead of per-call-site discipline that a future branch can
 * forget (which is exactly how this bug arose).
 */
function rejected(action: ActionIntent, reason: string): ResolvedEvent {
  return makeEvent(action, 'action.rejected', { verb: action.verb, reason });
}

export function createDialogueCore(dialogues: DialogueDefinition[]): EngineModule {
  const registry: DialogueRegistry = new Map();
  for (const d of dialogues) {
    registry.set(d.id, d);
  }

  return {
    id: 'dialogue-core',
    version: '0.1.0',

    register(ctx) {
      ctx.actions.registerVerb('speak', (action, world) => speakHandler(action, world, registry));
      ctx.actions.registerVerb('choose', (action, world) => chooseHandler(action, world, registry));

      ctx.persistence.registerNamespace('dialogue-core', {
        activeDialogue: null,
        activeNodeId: null,
        speakerId: null,
      } satisfies DialogueState);
    },
  };
}

function speakHandler(
  action: ActionIntent,
  world: WorldState,
  registry: DialogueRegistry,
): ResolvedEvent[] {
  const targetId = action.targetIds?.[0];
  if (!targetId) {
    return [rejected(action, 'no one to speak to')];
  }

  const target = world.entities[targetId];
  if (!target) {
    return [rejected(action, `${targetId} not found`)];
  }

  // Find dialogue for this NPC
  const dialogueId = action.parameters?.dialogueId as string | undefined;
  let dialogue: DialogueDefinition | undefined;

  if (dialogueId) {
    dialogue = registry.get(dialogueId);
  } else {
    // Find first dialogue that includes this speaker
    for (const d of registry.values()) {
      if (d.speakers.includes(targetId)) {
        dialogue = d;
        break;
      }
    }
  }

  if (!dialogue) {
    return [rejected(action, `${target.name} has nothing to say`)];
  }

  const entryNode = dialogue.nodes[dialogue.entryNodeId];
  if (!entryNode) {
    return [rejected(action, 'dialogue has no entry node')];
  }

  // Set dialogue state
  const dState: DialogueState = {
    activeDialogue: dialogue.id,
    activeNodeId: dialogue.entryNodeId,
    speakerId: targetId,
  };
  world.modules['dialogue-core'] = dState;

  const events: ResolvedEvent[] = [
    makeEvent(action, 'dialogue.started', {
      dialogueId: dialogue.id,
      speakerId: targetId,
      speakerName: target.name,
    }),
  ];

  events.push(...enterNode(action, dialogue, entryNode, dState, world));

  return events;
}

function chooseHandler(
  action: ActionIntent,
  world: WorldState,
  registry: DialogueRegistry,
): ResolvedEvent[] {
  const dState = world.modules['dialogue-core'] as DialogueState | undefined;
  if (!dState?.activeDialogue || !dState.activeNodeId) {
    return [rejected(action, 'no active dialogue')];
  }

  const dialogue = registry.get(dState.activeDialogue);
  if (!dialogue) {
    return [rejected(action, 'dialogue not found')];
  }

  const currentNode = dialogue.nodes[dState.activeNodeId];
  if (!currentNode?.choices) {
    return [rejected(action, 'no choices available')];
  }

  const choiceId = action.parameters?.choiceId as string;
  const choiceIndex = action.parameters?.choiceIndex as number | undefined;

  let choice;
  if (choiceId) {
    choice = currentNode.choices.find(c => c.id === choiceId);
  } else if (choiceIndex !== undefined) {
    const available = currentNode.choices.filter(c => !c.condition || evaluateCondition(c.condition, world));
    choice = available[choiceIndex];
  }

  if (!choice) {
    return [rejected(action, 'invalid choice')];
  }

  const events: ResolvedEvent[] = [
    makeEvent(action, 'dialogue.choice.selected', {
      dialogueId: dialogue.id,
      choiceId: choice.id,
      choiceText: choice.text,
    }),
  ];

  // Apply choice effects
  if (choice.effects) {
    for (const effect of choice.effects) {
      events.push(...applyDialogueEffect(action, effect, world));
    }
  }

  // Navigate to next node
  const nextNode = dialogue.nodes[choice.nextNodeId];
  if (nextNode) {
    dState.activeNodeId = choice.nextNodeId;
    events.push(...enterNode(action, dialogue, nextNode, dState, world));
  } else {
    // End dialogue (choice's nextNodeId points at no real node)
    dState.activeDialogue = null;
    dState.activeNodeId = null;
    dState.speakerId = null;
    events.push(makeEvent(action, 'dialogue.ended', { dialogueId: dialogue.id }));
  }

  return events;
}

/**
 * Enter a node: emit dialogue.node.entered, apply the node's own effects, and —
 * when the node offers no available choices — end the conversation cleanly.
 *
 * MOD-C-BH-02: before this, dialogue.ended only fired when a choice's
 * nextNodeId pointed at a MISSING node. Advancing into a REAL node with no
 * choices left activeDialogue set forever: every later 'choose' rejected, the
 * choice menu died for the rest of the session, and end-of-conversation hooks
 * (starter-fantasy grants the healing draught on dialogue.ended) never ran —
 * and all 10 starter packs end conversations on choiceless leaf nodes. A node
 * whose choices are ALL condition-hidden is the same dead end, so leaf-ness is
 * judged on the condition-filtered list the player actually sees.
 *
 * Node effects (schema DialogueNode.effects — previously never wired) apply on
 * entry, BEFORE the ended event, so a leaf that grants something on entry does
 * so while listeners can still observe the conversation's final state.
 */
function enterNode(
  action: ActionIntent,
  dialogue: DialogueDefinition,
  node: DialogueNode,
  dState: DialogueState,
  world: WorldState,
): ResolvedEvent[] {
  const text = typeof node.text === 'string' ? node.text : node.text[0]?.text ?? '';

  const availableChoices = node.choices
    ?.filter(c => !c.condition || evaluateCondition(c.condition, world))
    .map((c, i) => ({ id: c.id, text: c.text, index: i })) ?? [];

  const events: ResolvedEvent[] = [
    makeEvent(action, 'dialogue.node.entered', {
      nodeId: node.id,
      speaker: node.speaker,
      text,
      choices: availableChoices,
      hasChoices: availableChoices.length > 0,
    }, {
      presentation: {
        channels: ['dialogue'],
        priority: 'high',
      },
    }),
  ];

  // The node's own effects fire on entry.
  if (node.effects) {
    for (const effect of node.effects) {
      events.push(...applyDialogueEffect(action, effect, world));
    }
  }

  if (availableChoices.length === 0) {
    // Leaf node — the conversation ends here. Its text has rendered and its
    // effects have applied; clear the active state so the next speak/choose
    // starts fresh instead of hitting "no choices available" forever.
    dState.activeDialogue = null;
    dState.activeNodeId = null;
    dState.speakerId = null;
    events.push(makeEvent(action, 'dialogue.ended', {
      dialogueId: dialogue.id,
      nodeId: node.id,
      reason: 'leaf-node',
    }));
  }

  return events;
}

function applyDialogueEffect(
  action: ActionIntent,
  effect: EffectDefinition,
  world: WorldState,
): ResolvedEvent[] {
  if (effect.type === 'set-global') {
    const key = effect.params.key as string;
    const value = effect.params.value;
    world.globals[key] = value;
    return [makeEvent(action, 'world.flag.changed', { key, value })];
  }

  // V3-DLG-2: social-state WRITE effects. Dialogue content can now move the
  // SAME stores player-leverage.ts's verb layer writes (bribe/intimidate/seed/
  // petition), so a dialogue choice's consequence lands in the identical place
  // a mechanical action's consequence would — trade pricing, faction-cognition
  // reads, a later leverage-at-least/reputation-at-least gate, etc. all see it.
  // Handled explicitly, BEFORE the generic unknown-effect fallback below
  // (V3-DLG-3) — that fallback's behavior/message for genuinely unhandled
  // types is untouched.
  if (effect.type === 'leverage-adjust') {
    const currency = effect.params.currency as LeverageCurrency;
    const delta = effect.params.delta as number;
    const player = world.entities[world.playerId];
    if (!player) {
      // Same warn-and-degrade posture as the fallback below — a dialogue
      // effect that cannot resolve its target is surfaced, never silently
      // dropped. world.playerId is always SET, but the entity it names is
      // not guaranteed to exist in every constructed WorldState (mirrors the
      // defensive `if (actor)` guard applyLeverageEffects itself uses).
      return [makeEvent(action, 'dialogue.effect.unknown', {
        effectType: effect.type,
        reason: `no player entity at world.playerId ('${world.playerId}')`,
      })];
    }
    // applyLeverageDeltas clamps 0-100 via player-leverage.ts's adjustLeverage
    // — write back, then re-read so the emitted value reflects the CLAMPED
    // result, not the raw requested delta.
    player.custom = applyLeverageDeltas(player.custom ?? {}, { [currency]: delta });
    const value = getLeverageState(player.custom)[currency];
    return [makeEvent(action, 'leverage.adjusted', { currency, delta, value })];
  }

  if (effect.type === 'reputation-adjust') {
    const factionId = effect.params.factionId as string;
    const delta = effect.params.delta as number;
    // The exact accrued-global store player-leverage.ts's applyLeverageEffects
    // writes for its own 'reputation' effect case (addGlobal(world,
    // `reputation_${factionId}`, delta)) and evaluateCondition's
    // factionReputationFor (below) reads back. Both addGlobal/numGlobal there
    // are unexported, so this ADDS to the existing value (never overwrites) —
    // inlined here rather than imported, same reasoning as the reputation
    // merge below: two unexported private helpers, kept in sync by hand
    // against the one documented contract instead of a fragile re-import.
    const key = `reputation_${factionId}`;
    const current = world.globals[key];
    const currentValue = typeof current === 'number' && Number.isFinite(current) ? current : 0;
    const value = currentValue + delta;
    world.globals[key] = value;
    return [makeEvent(action, 'reputation.adjusted', { factionId, delta, value })];
  }

  // Warn-and-degrade (F-db919552): dialogue-core only implements
  // 'set-global'. EffectDefinition is the SAME shared type ability-effects.ts
  // fully implements (damage, heal, apply-status, resource-modify, ...), so a
  // content author writing a dialogue choice's effects using that exact shape
  // silently saw it do nothing. Mirrors ability-effects.ts's
  // 'ability.effect.unknown' event for the same class of mistake.
  return [makeEvent(action, 'dialogue.effect.unknown', {
    effectType: effect.type,
    reason: `dialogue-core only handles 'set-global' effects; no handler for effect type: ${effect.type}`,
  })];
}

/**
 * Reputation merge: authored faction baseline + the accrued delta global —
 * the SAME merge player-leverage.ts's (unexported) playerReputationFor,
 * trade-core.ts's sellHandler, and world-tick.ts's buildPressureInputs all
 * use, so a dialogue-authored reputation gate can never disagree with a
 * leverage action or a sale about how a faction feels about the player.
 * INLINED here (not imported) — playerReputationFor is unexported; kept in
 * sync by hand against the one documented contract, not a private import.
 */
function factionReputationFor(world: WorldState, factionId: string): number {
  const baseline = world.factions?.[factionId]?.reputation ?? 0;
  const globalValue = world.globals[`reputation_${factionId}`];
  const accrued = typeof globalValue === 'number' && Number.isFinite(globalValue) ? globalValue : 0;
  return baseline + accrued;
}

function evaluateCondition(
  condition: import('@ai-rpg-engine/content-schema').ConditionSpec,
  world: WorldState,
): boolean {
  if (condition.type === 'global-equals') {
    return world.globals[condition.params.key as string] === condition.params.value;
  }
  if (condition.type === 'global-set') {
    return world.globals[condition.params.key as string] !== undefined;
  }

  // V3-DLG-1: social-state READ conditions. Dialogue content can now gate
  // choices/nodes on the player's leverage, a faction's reputation, and an
  // NPC's derived relationship — the same social layer player-leverage.ts and
  // npc-agency.ts already drive trade/pressure/companion decisions from.
  // Handled explicitly, BEFORE the generic unknown-condition fallback below
  // (V3-DLG-3) — that fallback's silent-true behavior for genuinely
  // unhandled types is untouched (existing content may rely on it).
  if (condition.type === 'leverage-at-least') {
    const player = world.entities[world.playerId];
    const currency = condition.params.currency as LeverageCurrency;
    const amount = condition.params.amount as number;
    const state = getLeverageState(player?.custom ?? {});
    // A currency string outside the known 6 reads as `undefined` here (not a
    // key of LeverageState) — `undefined >= amount` is always false, the same
    // NaN/undefined-guard reasoning player-leverage.ts's own balanceOf uses.
    return state[currency] >= amount;
  }

  if (condition.type === 'reputation-at-least') {
    const factionId = condition.params.factionId as string;
    const amount = condition.params.amount as number;
    return factionReputationFor(world, factionId) >= amount;
  }

  if (condition.type === 'npc-relationship-at-least') {
    const npcId = condition.params.npcId as string;
    const axis = condition.params.axis as keyof NpcRelationship;
    const amount = condition.params.amount as number;
    const rel = deriveNpcRelationship(world, npcId, world.playerId);
    // Same undefined-is-false safety as leverage-at-least above: an axis
    // string outside trust/fear/greed/loyalty reads as `undefined`, and
    // `undefined >= amount` is always false.
    return rel[axis] >= amount;
  }

  // 'obligation-exists' (npcId?/direction? params) is DEFERRED, not
  // implemented — not an oversight. Verified across this task's file-
  // ownership boundary: npc-agency.ts's NpcObligationLedger is never
  // persisted anywhere in WorldState in this engine —
  //   - npc-agency.ts registers NO ctx.persistence.registerNamespace call
  //     anywhere in the file (obligations are derived-per-call-into a ledger
  //     the CALLER supplies; nothing stores one on `world`);
  //   - world-tick.ts hardcodes `npcObligations: new Map()` into
  //     OpportunityInputs with an explicit comment: "npc-agency.ts persists
  //     neither profiles nor obligations anywhere in the engine";
  //   - packages/core/src/types.ts (WorldState, EntityState) has zero
  //     references to "obligation" — no field exists to read one from.
  // A condition kind that can only ever read state nothing in the engine
  // writes would be a fake gate (always false, forever, until an unrelated
  // future wave adds obligation persistence — out of this file's
  // dialogue-core*.ts ownership). Falls through to the existing
  // unknown-condition fallback below, same as any other unhandled kind.
  return true;
}

