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

/**
 * The legacy flat target enum. Retained as the stable, required field so every
 * existing content pack, starter, and consumer (ability-core resolveTargets,
 * ability-summary distribution, ability-intent scoring) keeps working byte-for-byte.
 */
export type TargetType = 'self' | 'single' | 'zone' | 'all-enemies' | 'none';

/** How many entities the spec can reach (orthogonal to who/which — finding 8). */
export type TargetScope = 'self' | 'single' | 'all';

/** Which side relative to the source the spec selects (faction predicate — finding 9). */
export type TargetAffiliation = 'ally' | 'enemy' | 'any';

/** Liveness gate on candidates. Named `life` (not `filter`) to avoid colliding with
 * the pre-existing `filter: string[]` tag filter, which is load-bearing for callers. */
export type TargetLife = 'alive' | 'dead' | 'any';

/**
 * Ability targeting spec.
 *
 * Targeting decomposes into independent orthogonal axes — Scope × Affiliation ×
 * Life (+ optional area) — per the design lock (finding 8: Liquid Fire tactics-RPG
 * Range×Area×EffectTarget; corroborated by GAS Spec/Filter split and the 5e SRD
 * valid-target contract).
 *
 * BACK-COMPAT: `type` (the flat enum) remains required and is the single source of
 * truth when the axes are omitted — old content `{ type: 'self' }` is mapped to
 * `{ scope:self, affiliation:ally, life:alive, includeSelf:true }` by
 * {@link normalizeTargetSpec}. New ally-support content sets the axes explicitly
 * (e.g. a heal = `{ type:'single', scope:'single', affiliation:'ally', life:'alive', includeSelf:true }`).
 * When both are present the axes win; `type` should be set to the nearest legacy
 * value so distribution/summary tooling stays meaningful.
 */
export type TargetSpec = {
  type: TargetType;
  range?: number;
  /** Tag filter — candidate must carry at least one of these tags. Unchanged. */
  filter?: string[];
  // --- Independent axes (optional; derived from `type` when absent) ---
  /** How many: self / single / all. Defaults from `type`. */
  scope?: TargetScope;
  /** Whose side: ally / enemy / any. Defaults from `type`. */
  affiliation?: TargetAffiliation;
  /** Liveness gate: alive / dead / any. Defaults to 'alive'. */
  life?: TargetLife;
  /** Optional named area shape for `scope:'all'` (e.g. 'zone'). Reserved for future shapes; resolution treats any value as the source's zone today. */
  area?: string;
  /** Whether the source is a valid candidate for an ally/any spec. Defaults from `type` (true only for legacy 'self'). */
  includeSelf?: boolean;
};

/** Fully-resolved axes — every field present. Output of {@link normalizeTargetSpec}. */
export type NormalizedTargetSpec = {
  scope: TargetScope;
  affiliation: TargetAffiliation;
  life: TargetLife;
  filter?: string[];
  range?: number;
  area?: string;
  includeSelf: boolean;
};

/**
 * Resolve a (possibly legacy/partial) {@link TargetSpec} to a fully-populated
 * {@link NormalizedTargetSpec}. Pure and deterministic — no RNG, no clock.
 *
 * Mapping of the flat `type` (used only as the default when an axis is absent):
 * - `self`        → scope:self,   affiliation:ally,  life:alive, includeSelf:true
 * - `single`      → scope:single, affiliation:enemy, life:alive, includeSelf:false
 * - `all-enemies` → scope:all,    affiliation:enemy, life:alive, includeSelf:false
 * - `zone`        → scope:all,    affiliation:any,   life:alive, includeSelf:false
 * - `none`        → scope:self,   affiliation:any,   life:any,   includeSelf:false
 *
 * Explicit axes always override the `type`-derived default, so new content composes
 * freely (e.g. an ally revive: `{ type:'single', affiliation:'ally', life:'dead' }`).
 */
export function normalizeTargetSpec(spec: TargetSpec): NormalizedTargetSpec {
  const fromType = legacyAxesForType(spec.type);
  return {
    scope: spec.scope ?? fromType.scope,
    affiliation: spec.affiliation ?? fromType.affiliation,
    life: spec.life ?? fromType.life,
    filter: spec.filter,
    range: spec.range,
    area: spec.area,
    includeSelf: spec.includeSelf ?? fromType.includeSelf,
  };
}

function legacyAxesForType(type: TargetType): NormalizedTargetSpec {
  switch (type) {
    case 'self':
      return { scope: 'self', affiliation: 'ally', life: 'alive', includeSelf: true };
    case 'single':
      return { scope: 'single', affiliation: 'enemy', life: 'alive', includeSelf: false };
    case 'all-enemies':
      return { scope: 'all', affiliation: 'enemy', life: 'alive', includeSelf: false };
    case 'zone':
      return { scope: 'all', affiliation: 'any', life: 'alive', includeSelf: false };
    case 'none':
    default:
      return { scope: 'self', affiliation: 'any', life: 'any', includeSelf: false };
  }
}

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
