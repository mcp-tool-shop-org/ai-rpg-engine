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
// V3-DLG: dialogue vocabulary that reads/writes the social layer. Social
// READ conditions route through condition-eval (F-d7bab077 / F-6469b38f).
// Last-action dialogueHint, live pressureHint, and generateNpcTextures
// demeanor attach on enterNode without rewriting authored node.text. Write
// effects still call player-leverage. Neither player-leverage nor npc-agency
// import dialogue-core.ts, so this stays a one-directional edge.
import { getLeverageState, applyLeverageDeltas, getStoredFactionAccess } from './player-leverage.js';
import { evaluateCondition as evaluateCompiledCondition, KNOWN_CONDITION_TYPES } from './condition-eval.js';
import type { LeverageCurrency } from './player-leverage.js';
import { generateNpcTextures, getPersistedNpcLastActions, getPersistedNpcProfiles } from './npc-agency.js';
import { getReputationConsequence } from './social-consequence.js';
import { getEntityFaction } from './faction-cognition.js';
import { getVisiblePressures, formatPressureForDialogue, type WorldPressure } from './pressure-system.js';
import { getPartyState, getActiveCompanions, formatPartyPresence } from './companion-core.js';
import { getPersistedOpportunities, getOpportunitiesForNpc, formatOpportunityForDialogue } from './opportunity-core.js';

const KNOWN_CONDITION_TYPE_SET: ReadonlySet<string> = new Set(KNOWN_CONDITION_TYPES);

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

  const speakerId = node.speaker || dState.speakerId;
  const dialogueBias = dialogueBiasForSpeaker(world, speakerId);
  const dialogueHint = dialogueHintForSpeaker(world, speakerId);
  const pressureHint = pressureHintForWorld(world);
  const textureHint = textureHintForSpeaker(world, speakerId);
  const partyPresence = partyPresenceHint(world);
  const opportunityHint = opportunityHintForSpeaker(world, speakerId);

  const events: ResolvedEvent[] = [
    makeEvent(action, 'dialogue.node.entered', {
      nodeId: node.id,
      speaker: node.speaker,
      text,
      choices: availableChoices,
      hasChoices: availableChoices.length > 0,
      ...(dialogueBias ? { dialogueBias } : {}),
      ...(dialogueHint ? { dialogueHint } : {}),
      ...(pressureHint ? { pressureHint } : {}),
      ...(textureHint ? { textureHint } : {}),
      ...(partyPresence ? { partyPresence } : {}),
      ...(opportunityHint ? { opportunityHint } : {}),
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

/**
 * Faction-band one-liner for a speaker. Empty when the speaker has no
 * faction or the band is the middle (authored node.text stays untouched).
 */
function dialogueBiasForSpeaker(world: WorldState, speakerId: string | null | undefined): string {
  if (!speakerId) return '';
  const factionId = getEntityFaction(world, speakerId);
  if (!factionId) return '';
  const player = world.entities[world.playerId];
  const stored = getStoredFactionAccess(player?.custom, factionId);
  return getReputationConsequence(factionReputationFor(world, factionId), stored).dialogueBias;
}

/**
 * Last-action dialogueHint for this speaker (F-0e4732b4). Reads the same
 * NpcActionResult.dialogueHint resolveNpcAction authors; empty last-action
 * (or a speaker with none) leaves the field off the payload.
 */
function dialogueHintForSpeaker(world: WorldState, speakerId: string | null | undefined): string {
  if (!speakerId) return '';
  const last = getPersistedNpcLastActions(world).find((r) => r.action.npcId === speakerId);
  return typeof last?.dialogueHint === 'string' ? last.dialogueHint : '';
}

/**
 * Zone-scoped demeanor from generateNpcTextures (F-3a991ee0). Speakers in
 * another zone, empty profiles, or a profile with no goal omit the field.
 * Authored node.text is never rewritten.
 */
function textureHintForSpeaker(world: WorldState, speakerId: string | null | undefined): string {
  if (!speakerId) return '';
  const profiles = getPersistedNpcProfiles(world).filter((p) => p.npcId === speakerId);
  if (profiles.length === 0) return '';
  return generateNpcTextures(profiles, world, world.playerId)[0] ?? '';
}

/**
 * Active-party presence line (F-472cf3c4). World-scoped, not speaker-scoped —
 * whoever the player is talking to, an active party still travels with them.
 * An empty or fully-inactive party omits the field, matching the other
 * hints' byte-identical-when-absent guarantee (formatPartyPresence already
 * returns undefined in that case).
 */
function partyPresenceHint(world: WorldState): string {
  const party = getPartyState(world);
  if (getActiveCompanions(party).length === 0) return '';
  const names: Record<string, string> = {};
  for (const c of party.companions) {
    const name = world.entities[c.npcId]?.name;
    if (name) names[c.npcId] = name;
  }
  return formatPartyPresence(party, names, world) ?? '';
}

/**
 * Highest-urgency open opportunity linked to this speaker, NPC-facing
 * (F-e7fc9018). Only 'available'/'accepted' status and non-'hidden'
 * visibility surface — a speaker with no open, visible offer omits the field.
 */
function opportunityHintForSpeaker(world: WorldState, speakerId: string | null | undefined): string {
  if (!speakerId) return '';
  const open = getOpportunitiesForNpc(getPersistedOpportunities(world), speakerId)
    .filter((o) => (o.status === 'available' || o.status === 'accepted') && o.visibility !== 'hidden');
  if (open.length === 0) return '';
  let highest = open[0];
  for (let i = 1; i < open.length; i++) {
    if (open[i].urgency > highest.urgency) highest = open[i];
  }
  return formatOpportunityForDialogue(highest);
}

/**
 * Highest-urgency visible pressure, formatted by formatPressureForDialogue
 * (F-da7751a0). Peeks the world-tick namespace rather than importing the
 * tick driver (player-leverage already cycles with world-tick). Empty when
 * no visible pressure is persisted.
 */
function peekActivePressures(world: WorldState): WorldPressure[] {
  const ns = world.modules['world-tick'];
  if (!ns || typeof ns !== 'object' || Array.isArray(ns)) return [];
  const pressures = (ns as { pressures?: unknown }).pressures;
  return Array.isArray(pressures)
    ? pressures.filter((p): p is WorldPressure => typeof p === 'object' && p !== null)
    : [];
}

function pressureHintForWorld(world: WorldState): string {
  const visible = getVisiblePressures(peekActivePressures(world));
  if (visible.length === 0) return '';
  let highest = visible[0];
  for (let i = 1; i < visible.length; i++) {
    if (visible[i].urgency > highest.urgency) highest = visible[i];
  }
  return formatPressureForDialogue(highest);
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

  // Every evaluable KNOWN_CONDITION_TYPES family routes through the one
  // closed evaluator (F-6469b38f / F-d7bab077) so a dusk chapel line and a
  // traversal exit cannot disagree. player-level / party-level stay
  // unevaluable (fail-closed); random-probability stays GATE_REFUSED.
  // Unknown kinds still fall through to the silent-true default below
  // (V3-DLG-3) so existing content is unchanged.
  if (KNOWN_CONDITION_TYPE_SET.has(condition.type)) {
    return evaluateCompiledCondition(condition, world, world.playerId).ok;
  }

  // Unknown condition kind: warn-and-degrade default of true (V3-DLG-3,
  // untouched — existing content may rely on it).
  return true;
}

