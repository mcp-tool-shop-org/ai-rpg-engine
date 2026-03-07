// Content schema types — author-facing definitions
// These are the stable contracts for content packs.

import type { ScalarValue } from '@ai-rpg-engine/core';

// --- Entity Blueprint ---

export type EntityBlueprint = {
  id: string;
  type: string;
  name: string;
  tags?: string[];
  baseStats?: Record<string, number>;
  baseResources?: Record<string, number>;
  startingStatuses?: string[];
  inventory?: string[];
  equipment?: Record<string, string>;
  aiProfile?: string;
  scripts?: string[];
};

// --- Ability ---

export type TargetSpec = {
  type: 'self' | 'single' | 'zone' | 'all-enemies' | 'none';
  range?: number;
  filter?: string[];
};

export type ResourceCost = {
  resourceId: string;
  amount: number;
};

export type ConditionSpec = {
  type: string;
  params: Record<string, ScalarValue>;
};

export type CheckDefinition = {
  stat: string;
  difficulty: number;
  onFail?: string;
};

export type EffectDefinition = {
  type: string;
  target?: 'actor' | 'target' | 'zone';
  params: Record<string, ScalarValue>;
};

export type AbilityPresentation = {
  text?: string;
  hitText?: string;
  missText?: string;
  soundCue?: string;
};

export type AbilityDefinition = {
  id: string;
  name: string;
  verb: string;
  tags: string[];
  costs?: ResourceCost[];
  target: TargetSpec;
  checks?: CheckDefinition[];
  effects: EffectDefinition[];
  cooldown?: number;
  requirements?: ConditionSpec[];
  ui?: AbilityPresentation;
};

// --- Status ---

export type DurationSpec = {
  type: 'ticks' | 'permanent' | 'conditional';
  value?: number;
  condition?: ConditionSpec;
};

export type ModifierDefinition = {
  stat: string;
  operation: 'add' | 'multiply';
  value: number;
};

export type TriggerDefinition = {
  event: string;
  condition?: ConditionSpec;
  effect: EffectDefinition;
};

export type StatusPresentation = {
  icon?: string;
  color?: string;
  description?: string;
};

export type StatusDefinition = {
  id: string;
  name: string;
  tags: string[];
  stacking: 'replace' | 'stack' | 'refresh';
  maxStacks?: number;
  duration?: DurationSpec;
  modifiers?: ModifierDefinition[];
  triggers?: TriggerDefinition[];
  removal?: ConditionSpec[];
  ui?: StatusPresentation;
};

// --- Room / Zone ---

export type TextBlock = {
  text: string;
  condition?: ConditionSpec;
};

export type ExitDefinition = {
  targetZoneId: string;
  label?: string;
  condition?: ConditionSpec;
};

export type ZoneDefinition = {
  id: string;
  name: string;
  tags?: string[];
  description?: TextBlock[];
  neighbors?: string[];
  light?: number;
  noise?: number;
  hazards?: string[];
  interactables?: string[];
  entities?: string[];
  exits?: ExitDefinition[];
};

export type RoomDefinition = {
  id: string;
  name: string;
  zones: ZoneDefinition[];
  tags?: string[];
  ambientText?: TextBlock[];
  hazards?: string[];
  encounterTable?: string[];
  exits?: ExitDefinition[];
  scripts?: string[];
};

// --- Quest ---

export type QuestStage = {
  id: string;
  name: string;
  description?: string;
  objectives?: string[];
  triggers?: TriggerDefinition[];
  nextStage?: string;
  failStage?: string;
};

export type RewardDefinition = {
  type: string;
  params: Record<string, ScalarValue>;
};

export type QuestDefinition = {
  id: string;
  name: string;
  stages: QuestStage[];
  triggers?: TriggerDefinition[];
  rewards?: RewardDefinition[];
  failConditions?: ConditionSpec[];
};

// --- Dialogue ---

export type DialogueChoice = {
  id: string;
  text: string;
  nextNodeId: string;
  condition?: ConditionSpec;
  effects?: EffectDefinition[];
};

export type DialogueNode = {
  id: string;
  speaker: string;
  text: string | TextBlock[];
  choices?: DialogueChoice[];
  effects?: EffectDefinition[];
  nextNodeId?: string;
};

export type DialogueDefinition = {
  id: string;
  speakers: string[];
  nodes: Record<string, DialogueNode>;
  entryNodeId: string;
};

// --- Progression ---

export type ProgressionNode = {
  id: string;
  name: string;
  description?: string;
  cost: number;
  requires?: string[];
  effects: EffectDefinition[];
};

export type ProgressionTreeDefinition = {
  id: string;
  name: string;
  currency: string;
  nodes: ProgressionNode[];
};

// --- Sound Cue ---

export type SoundCueDefinition = {
  id: string;
  trigger: string;
  channel?: 'ambient' | 'stinger' | 'voice' | 'ui';
  priority?: 'low' | 'normal' | 'high';
  condition?: ConditionSpec;
  tags?: string[];
};
