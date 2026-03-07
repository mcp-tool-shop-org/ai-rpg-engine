// dialogue-core — NPC dialogue trees with choices and conditions

import type {
  EngineModule,
  ActionIntent,
  WorldState,
  ResolvedEvent,
  ScalarValue,
} from '@ai-rpg-engine/core';
import { nextId } from '@ai-rpg-engine/core';
import type { DialogueDefinition, DialogueNode, EffectDefinition } from '@ai-rpg-engine/content-schema';

export type DialogueState = {
  activeDialogue: string | null;
  activeNodeId: string | null;
  speakerId: string | null;
};

export type DialogueRegistry = Map<string, DialogueDefinition>;

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
    return [makeEvent(action, 'action.rejected', { reason: 'no one to speak to' })];
  }

  const target = world.entities[targetId];
  if (!target) {
    return [makeEvent(action, 'action.rejected', { reason: `${targetId} not found` })];
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
    return [makeEvent(action, 'action.rejected', { reason: `${target.name} has nothing to say` })];
  }

  const entryNode = dialogue.nodes[dialogue.entryNodeId];
  if (!entryNode) {
    return [makeEvent(action, 'action.rejected', { reason: 'dialogue has no entry node' })];
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

  events.push(...renderNode(action, entryNode, world));

  return events;
}

function chooseHandler(
  action: ActionIntent,
  world: WorldState,
  registry: DialogueRegistry,
): ResolvedEvent[] {
  const dState = world.modules['dialogue-core'] as DialogueState | undefined;
  if (!dState?.activeDialogue || !dState.activeNodeId) {
    return [makeEvent(action, 'action.rejected', { reason: 'no active dialogue' })];
  }

  const dialogue = registry.get(dState.activeDialogue);
  if (!dialogue) {
    return [makeEvent(action, 'action.rejected', { reason: 'dialogue not found' })];
  }

  const currentNode = dialogue.nodes[dState.activeNodeId];
  if (!currentNode?.choices) {
    return [makeEvent(action, 'action.rejected', { reason: 'no choices available' })];
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
    return [makeEvent(action, 'action.rejected', { reason: 'invalid choice' })];
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
    events.push(...renderNode(action, nextNode, world));
  } else {
    // End dialogue
    dState.activeDialogue = null;
    dState.activeNodeId = null;
    dState.speakerId = null;
    events.push(makeEvent(action, 'dialogue.ended', { dialogueId: dialogue.id }));
  }

  return events;
}

function renderNode(
  action: ActionIntent,
  node: DialogueNode,
  world: WorldState,
): ResolvedEvent[] {
  const text = typeof node.text === 'string' ? node.text : node.text[0]?.text ?? '';

  const availableChoices = node.choices
    ?.filter(c => !c.condition || evaluateCondition(c.condition, world))
    .map((c, i) => ({ id: c.id, text: c.text, index: i }));

  return [
    makeEvent(action, 'dialogue.node.entered', {
      nodeId: node.id,
      speaker: node.speaker,
      text,
      choices: availableChoices ?? [],
      hasChoices: (availableChoices?.length ?? 0) > 0,
    }, {
      presentation: {
        channels: ['dialogue'],
        priority: 'high',
      },
    }),
  ];
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
  return [];
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

function makeEvent(
  action: ActionIntent,
  type: string,
  payload: Record<string, unknown>,
  extra?: Partial<ResolvedEvent>,
): ResolvedEvent {
  return {
    id: nextId('evt'),
    tick: action.issuedAtTick,
    type,
    actorId: action.actorId,
    payload,
    ...extra,
  };
}
