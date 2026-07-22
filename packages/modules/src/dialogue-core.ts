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
  return true;
}

