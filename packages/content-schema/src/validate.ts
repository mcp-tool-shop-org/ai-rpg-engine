// Runtime content validators — clear errors, no external deps

import type {
  EntityBlueprint,
  AbilityDefinition,
  StatusDefinition,
  ZoneDefinition,
  RoomDefinition,
  QuestDefinition,
  DialogueDefinition,
  ProgressionTreeDefinition,
  SoundCueDefinition,
  TargetSpec,
  ResourceCost,
  ConditionSpec,
  CheckDefinition,
  EffectDefinition,
  DurationSpec,
  ModifierDefinition,
  TriggerDefinition,
  TextBlock,
  ExitDefinition,
  DialogueChoice,
  DialogueNode,
  QuestStage,
  ProgressionNode,
} from './schemas.js';

// --- Result type ---

export type ValidationError = {
  path: string;
  message: string;
};

export type ValidationResult = {
  ok: boolean;
  errors: ValidationError[];
};

function ok(): ValidationResult {
  return { ok: true, errors: [] };
}

function fail(errors: ValidationError[]): ValidationResult {
  return { ok: false, errors };
}

function merge(...results: ValidationResult[]): ValidationResult {
  const errors = results.flatMap((r) => r.errors);
  return { ok: errors.length === 0, errors };
}

// --- Helpers ---

type Checker = { errors: ValidationError[]; path: string };

function checker(path: string): Checker {
  return { errors: [], path };
}

function reqStr(c: Checker, obj: Record<string, unknown>, field: string): void {
  const v = obj[field];
  if (typeof v !== 'string' || v.length === 0) {
    c.errors.push({ path: `${c.path}.${field}`, message: `required non-empty string` });
  }
}

function reqNum(c: Checker, obj: Record<string, unknown>, field: string): void {
  if (typeof obj[field] !== 'number') {
    c.errors.push({ path: `${c.path}.${field}`, message: `required number` });
  }
}

function optStr(c: Checker, obj: Record<string, unknown>, field: string): void {
  const v = obj[field];
  if (v !== undefined && typeof v !== 'string') {
    c.errors.push({ path: `${c.path}.${field}`, message: `must be a string if provided` });
  }
}

function optNum(c: Checker, obj: Record<string, unknown>, field: string): void {
  const v = obj[field];
  if (v !== undefined && typeof v !== 'number') {
    c.errors.push({ path: `${c.path}.${field}`, message: `must be a number if provided` });
  }
}

function optStrArr(c: Checker, obj: Record<string, unknown>, field: string): void {
  const v = obj[field];
  if (v === undefined) return;
  if (!Array.isArray(v)) {
    c.errors.push({ path: `${c.path}.${field}`, message: `must be an array if provided` });
    return;
  }
  for (let i = 0; i < v.length; i++) {
    if (typeof v[i] !== 'string') {
      c.errors.push({ path: `${c.path}.${field}[${i}]`, message: `must be a string` });
    }
  }
}

function reqStrArr(c: Checker, obj: Record<string, unknown>, field: string): void {
  const v = obj[field];
  if (!Array.isArray(v)) {
    c.errors.push({ path: `${c.path}.${field}`, message: `required array` });
    return;
  }
  for (let i = 0; i < v.length; i++) {
    if (typeof v[i] !== 'string') {
      c.errors.push({ path: `${c.path}.${field}[${i}]`, message: `must be a string` });
    }
  }
}

function optRecord(c: Checker, obj: Record<string, unknown>, field: string, valType: 'string' | 'number'): void {
  const v = obj[field];
  if (v === undefined) return;
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    c.errors.push({ path: `${c.path}.${field}`, message: `must be an object if provided` });
    return;
  }
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val !== valType) {
      c.errors.push({ path: `${c.path}.${field}.${k}`, message: `must be a ${valType}` });
    }
  }
}

function reqEnum<T extends string>(c: Checker, obj: Record<string, unknown>, field: string, values: T[]): void {
  const v = obj[field];
  if (!values.includes(v as T)) {
    c.errors.push({ path: `${c.path}.${field}`, message: `must be one of: ${values.join(', ')}` });
  }
}

function optEnum<T extends string>(c: Checker, obj: Record<string, unknown>, field: string, values: T[]): void {
  const v = obj[field];
  if (v === undefined) return;
  if (!values.includes(v as T)) {
    c.errors.push({ path: `${c.path}.${field}`, message: `must be one of: ${values.join(', ')}` });
  }
}

function reqObj(c: Checker, obj: Record<string, unknown>, field: string): boolean {
  const v = obj[field];
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    c.errors.push({ path: `${c.path}.${field}`, message: `required object` });
    return false;
  }
  return true;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// --- Sub-schema validators ---

function vConditionSpec(path: string, v: unknown): ValidationError[] {
  if (!isObj(v)) return [{ path, message: 'must be an object' }];
  const c = checker(path);
  reqStr(c, v, 'type');
  if (v.params !== undefined && !isObj(v.params)) {
    c.errors.push({ path: `${path}.params`, message: 'must be an object' });
  }
  return c.errors;
}

function vEffectDefinition(path: string, v: unknown): ValidationError[] {
  if (!isObj(v)) return [{ path, message: 'must be an object' }];
  const c = checker(path);
  reqStr(c, v, 'type');
  optEnum(c, v, 'target', ['actor', 'target', 'zone']);
  if (v.params !== undefined && !isObj(v.params)) {
    c.errors.push({ path: `${path}.params`, message: 'must be an object' });
  }
  return c.errors;
}

function vTargetSpec(path: string, v: unknown): ValidationError[] {
  if (!isObj(v)) return [{ path, message: 'must be an object' }];
  const c = checker(path);
  reqEnum(c, v, 'type', ['self', 'single', 'zone', 'all-enemies', 'none']);
  optNum(c, v, 'range');
  optStrArr(c, v, 'filter');
  return c.errors;
}

function vResourceCost(path: string, v: unknown): ValidationError[] {
  if (!isObj(v)) return [{ path, message: 'must be an object' }];
  const c = checker(path);
  reqStr(c, v, 'resourceId');
  reqNum(c, v, 'amount');
  return c.errors;
}

function vCheckDefinition(path: string, v: unknown): ValidationError[] {
  if (!isObj(v)) return [{ path, message: 'must be an object' }];
  const c = checker(path);
  reqStr(c, v, 'stat');
  reqNum(c, v, 'difficulty');
  optStr(c, v, 'onFail');
  return c.errors;
}

function vDurationSpec(path: string, v: unknown): ValidationError[] {
  if (!isObj(v)) return [{ path, message: 'must be an object' }];
  const c = checker(path);
  reqEnum(c, v, 'type', ['ticks', 'permanent', 'conditional']);
  optNum(c, v, 'value');
  if (v.condition !== undefined) {
    c.errors.push(...vConditionSpec(`${path}.condition`, v.condition));
  }
  return c.errors;
}

function vModifierDefinition(path: string, v: unknown): ValidationError[] {
  if (!isObj(v)) return [{ path, message: 'must be an object' }];
  const c = checker(path);
  reqStr(c, v, 'stat');
  reqEnum(c, v, 'operation', ['add', 'multiply']);
  reqNum(c, v, 'value');
  return c.errors;
}

function vTriggerDefinition(path: string, v: unknown): ValidationError[] {
  if (!isObj(v)) return [{ path, message: 'must be an object' }];
  const c = checker(path);
  reqStr(c, v, 'event');
  if (v.condition !== undefined) {
    c.errors.push(...vConditionSpec(`${path}.condition`, v.condition));
  }
  c.errors.push(...vEffectDefinition(`${path}.effect`, v.effect));
  return c.errors;
}

function vTextBlock(path: string, v: unknown): ValidationError[] {
  if (!isObj(v)) return [{ path, message: 'must be an object' }];
  const c = checker(path);
  reqStr(c, v, 'text');
  if (v.condition !== undefined) {
    c.errors.push(...vConditionSpec(`${path}.condition`, v.condition));
  }
  return c.errors;
}

function vExitDefinition(path: string, v: unknown): ValidationError[] {
  if (!isObj(v)) return [{ path, message: 'must be an object' }];
  const c = checker(path);
  reqStr(c, v, 'targetZoneId');
  optStr(c, v, 'label');
  if (v.condition !== undefined) {
    c.errors.push(...vConditionSpec(`${path}.condition`, v.condition));
  }
  return c.errors;
}

function vArr<T>(path: string, arr: unknown, itemValidator: (p: string, v: unknown) => ValidationError[]): ValidationError[] {
  if (!Array.isArray(arr)) return [{ path, message: 'must be an array' }];
  const errors: ValidationError[] = [];
  for (let i = 0; i < arr.length; i++) {
    errors.push(...itemValidator(`${path}[${i}]`, arr[i]));
  }
  return errors;
}

function optArr(path: string, arr: unknown, itemValidator: (p: string, v: unknown) => ValidationError[]): ValidationError[] {
  if (arr === undefined) return [];
  return vArr(path, arr, itemValidator);
}

// --- Top-level validators ---

export function validateEntityBlueprint(v: unknown, path = 'EntityBlueprint'): ValidationResult {
  if (!isObj(v)) return fail([{ path, message: 'must be an object' }]);
  const c = checker(path);
  reqStr(c, v, 'id');
  reqStr(c, v, 'type');
  reqStr(c, v, 'name');
  optStrArr(c, v, 'tags');
  optRecord(c, v, 'baseStats', 'number');
  optRecord(c, v, 'baseResources', 'number');
  optStrArr(c, v, 'startingStatuses');
  optStrArr(c, v, 'inventory');
  optRecord(c, v, 'equipment', 'string');
  optStr(c, v, 'aiProfile');
  optStrArr(c, v, 'scripts');
  return { ok: c.errors.length === 0, errors: c.errors };
}

export function validateAbilityDefinition(v: unknown, path = 'AbilityDefinition'): ValidationResult {
  if (!isObj(v)) return fail([{ path, message: 'must be an object' }]);
  const c = checker(path);
  reqStr(c, v, 'id');
  reqStr(c, v, 'name');
  reqStr(c, v, 'verb');
  reqStrArr(c, v, 'tags');
  c.errors.push(...optArr(`${path}.costs`, v.costs, vResourceCost));
  c.errors.push(...vTargetSpec(`${path}.target`, v.target));
  c.errors.push(...optArr(`${path}.checks`, v.checks, vCheckDefinition));
  if (!Array.isArray(v.effects)) {
    c.errors.push({ path: `${path}.effects`, message: 'required array' });
  } else {
    c.errors.push(...vArr(`${path}.effects`, v.effects, vEffectDefinition));
  }
  optNum(c, v, 'cooldown');
  c.errors.push(...optArr(`${path}.requirements`, v.requirements, vConditionSpec));
  return { ok: c.errors.length === 0, errors: c.errors };
}

export function validateStatusDefinition(v: unknown, path = 'StatusDefinition'): ValidationResult {
  if (!isObj(v)) return fail([{ path, message: 'must be an object' }]);
  const c = checker(path);
  reqStr(c, v, 'id');
  reqStr(c, v, 'name');
  reqStrArr(c, v, 'tags');
  reqEnum(c, v, 'stacking', ['replace', 'stack', 'refresh']);
  optNum(c, v, 'maxStacks');
  if (v.duration !== undefined) {
    c.errors.push(...vDurationSpec(`${path}.duration`, v.duration));
  }
  c.errors.push(...optArr(`${path}.modifiers`, v.modifiers, vModifierDefinition));
  c.errors.push(...optArr(`${path}.triggers`, v.triggers, vTriggerDefinition));
  c.errors.push(...optArr(`${path}.removal`, v.removal, vConditionSpec));
  return { ok: c.errors.length === 0, errors: c.errors };
}

export function validateZoneDefinition(v: unknown, path = 'ZoneDefinition'): ValidationResult {
  if (!isObj(v)) return fail([{ path, message: 'must be an object' }]);
  const c = checker(path);
  reqStr(c, v, 'id');
  reqStr(c, v, 'name');
  optStrArr(c, v, 'tags');
  if (v.description !== undefined) {
    c.errors.push(...vArr(`${path}.description`, v.description, vTextBlock));
  }
  optStrArr(c, v, 'neighbors');
  optNum(c, v, 'light');
  optNum(c, v, 'noise');
  optStrArr(c, v, 'hazards');
  optStrArr(c, v, 'interactables');
  optStrArr(c, v, 'entities');
  c.errors.push(...optArr(`${path}.exits`, v.exits, vExitDefinition));
  return { ok: c.errors.length === 0, errors: c.errors };
}

export function validateRoomDefinition(v: unknown, path = 'RoomDefinition'): ValidationResult {
  if (!isObj(v)) return fail([{ path, message: 'must be an object' }]);
  const c = checker(path);
  reqStr(c, v, 'id');
  reqStr(c, v, 'name');
  if (!Array.isArray(v.zones)) {
    c.errors.push({ path: `${path}.zones`, message: 'required array of ZoneDefinition' });
  } else {
    for (let i = 0; i < (v.zones as unknown[]).length; i++) {
      const zr = validateZoneDefinition((v.zones as unknown[])[i], `${path}.zones[${i}]`);
      c.errors.push(...zr.errors);
    }
  }
  optStrArr(c, v, 'tags');
  if (v.ambientText !== undefined) {
    c.errors.push(...vArr(`${path}.ambientText`, v.ambientText, vTextBlock));
  }
  optStrArr(c, v, 'hazards');
  optStrArr(c, v, 'encounterTable');
  c.errors.push(...optArr(`${path}.exits`, v.exits, vExitDefinition));
  optStrArr(c, v, 'scripts');
  return { ok: c.errors.length === 0, errors: c.errors };
}

export function validateQuestDefinition(v: unknown, path = 'QuestDefinition'): ValidationResult {
  if (!isObj(v)) return fail([{ path, message: 'must be an object' }]);
  const c = checker(path);
  reqStr(c, v, 'id');
  reqStr(c, v, 'name');
  if (!Array.isArray(v.stages)) {
    c.errors.push({ path: `${path}.stages`, message: 'required array of QuestStage' });
  } else {
    for (let i = 0; i < (v.stages as unknown[]).length; i++) {
      const s = (v.stages as unknown[])[i];
      const sp = `${path}.stages[${i}]`;
      if (!isObj(s)) {
        c.errors.push({ path: sp, message: 'must be an object' });
      } else {
        const sc = checker(sp);
        reqStr(sc, s, 'id');
        reqStr(sc, s, 'name');
        optStr(sc, s, 'description');
        optStrArr(sc, s, 'objectives');
        c.errors.push(...sc.errors);
        c.errors.push(...optArr(`${sp}.triggers`, s.triggers, vTriggerDefinition));
        optStr(sc, s, 'nextStage');
        optStr(sc, s, 'failStage');
      }
    }
  }
  c.errors.push(...optArr(`${path}.triggers`, v.triggers, vTriggerDefinition));
  c.errors.push(...optArr(`${path}.failConditions`, v.failConditions, vConditionSpec));
  return { ok: c.errors.length === 0, errors: c.errors };
}

export function validateDialogueDefinition(v: unknown, path = 'DialogueDefinition'): ValidationResult {
  if (!isObj(v)) return fail([{ path, message: 'must be an object' }]);
  const c = checker(path);
  reqStr(c, v, 'id');
  reqStrArr(c, v, 'speakers');
  reqStr(c, v, 'entryNodeId');

  if (!isObj(v.nodes)) {
    c.errors.push({ path: `${path}.nodes`, message: 'required object mapping nodeId → DialogueNode' });
  } else {
    const nodes = v.nodes as Record<string, unknown>;
    const nodeIds = new Set(Object.keys(nodes));

    // Verify entryNodeId exists
    if (typeof v.entryNodeId === 'string' && !nodeIds.has(v.entryNodeId)) {
      c.errors.push({ path: `${path}.entryNodeId`, message: `references missing node "${v.entryNodeId}"` });
    }

    for (const [nodeId, node] of Object.entries(nodes)) {
      const np = `${path}.nodes.${nodeId}`;
      if (!isObj(node)) {
        c.errors.push({ path: np, message: 'must be an object' });
        continue;
      }
      const nc = checker(np);
      reqStr(nc, node, 'id');
      reqStr(nc, node, 'speaker');

      // text can be string or TextBlock[]
      if (typeof node.text !== 'string' && !Array.isArray(node.text)) {
        nc.errors.push({ path: `${np}.text`, message: 'must be a string or TextBlock[]' });
      } else if (Array.isArray(node.text)) {
        nc.errors.push(...vArr(`${np}.text`, node.text, vTextBlock));
      }

      // Validate id matches key
      if (typeof node.id === 'string' && node.id !== nodeId) {
        nc.errors.push({ path: `${np}.id`, message: `node id "${node.id}" does not match key "${nodeId}"` });
      }

      // choices
      if (node.choices !== undefined) {
        if (!Array.isArray(node.choices)) {
          nc.errors.push({ path: `${np}.choices`, message: 'must be an array' });
        } else {
          for (let i = 0; i < (node.choices as unknown[]).length; i++) {
            const ch = (node.choices as unknown[])[i];
            const cp = `${np}.choices[${i}]`;
            if (!isObj(ch)) {
              nc.errors.push({ path: cp, message: 'must be an object' });
            } else {
              const cc = checker(cp);
              reqStr(cc, ch, 'id');
              reqStr(cc, ch, 'text');
              reqStr(cc, ch, 'nextNodeId');
              if (typeof ch.nextNodeId === 'string' && !nodeIds.has(ch.nextNodeId)) {
                cc.errors.push({ path: `${cp}.nextNodeId`, message: `references missing node "${ch.nextNodeId}"` });
              }
              if (ch.condition !== undefined) {
                cc.errors.push(...vConditionSpec(`${cp}.condition`, ch.condition));
              }
              cc.errors.push(...optArr(`${cp}.effects`, ch.effects, vEffectDefinition));
              nc.errors.push(...cc.errors);
            }
          }
        }
      }

      // effects on node
      nc.errors.push(...optArr(`${np}.effects`, node.effects, vEffectDefinition));
      // nextNodeId
      if (node.nextNodeId !== undefined) {
        if (typeof node.nextNodeId !== 'string') {
          nc.errors.push({ path: `${np}.nextNodeId`, message: 'must be a string' });
        } else if (!nodeIds.has(node.nextNodeId)) {
          nc.errors.push({ path: `${np}.nextNodeId`, message: `references missing node "${node.nextNodeId}"` });
        }
      }

      c.errors.push(...nc.errors);
    }
  }

  return { ok: c.errors.length === 0, errors: c.errors };
}

export function validateProgressionTreeDefinition(v: unknown, path = 'ProgressionTreeDefinition'): ValidationResult {
  if (!isObj(v)) return fail([{ path, message: 'must be an object' }]);
  const c = checker(path);
  reqStr(c, v, 'id');
  reqStr(c, v, 'name');
  reqStr(c, v, 'currency');
  if (!Array.isArray(v.nodes)) {
    c.errors.push({ path: `${path}.nodes`, message: 'required array of ProgressionNode' });
  } else {
    const nodeIds = new Set((v.nodes as unknown[]).filter(isObj).map((n) => n.id));
    for (let i = 0; i < (v.nodes as unknown[]).length; i++) {
      const n = (v.nodes as unknown[])[i];
      const np = `${path}.nodes[${i}]`;
      if (!isObj(n)) {
        c.errors.push({ path: np, message: 'must be an object' });
      } else {
        const nc = checker(np);
        reqStr(nc, n, 'id');
        reqStr(nc, n, 'name');
        optStr(nc, n, 'description');
        reqNum(nc, n, 'cost');
        if (n.requires !== undefined) {
          if (!Array.isArray(n.requires)) {
            nc.errors.push({ path: `${np}.requires`, message: 'must be an array' });
          } else {
            for (let j = 0; j < (n.requires as unknown[]).length; j++) {
              const req = (n.requires as unknown[])[j];
              if (typeof req !== 'string') {
                nc.errors.push({ path: `${np}.requires[${j}]`, message: 'must be a string' });
              } else if (!nodeIds.has(req)) {
                nc.errors.push({ path: `${np}.requires[${j}]`, message: `references missing node "${req}"` });
              }
            }
          }
        }
        if (!Array.isArray(n.effects)) {
          nc.errors.push({ path: `${np}.effects`, message: 'required array' });
        } else {
          nc.errors.push(...vArr(`${np}.effects`, n.effects, vEffectDefinition));
        }
        c.errors.push(...nc.errors);
      }
    }
  }
  return { ok: c.errors.length === 0, errors: c.errors };
}

export function validateSoundCueDefinition(v: unknown, path = 'SoundCueDefinition'): ValidationResult {
  if (!isObj(v)) return fail([{ path, message: 'must be an object' }]);
  const c = checker(path);
  reqStr(c, v, 'id');
  reqStr(c, v, 'trigger');
  optEnum(c, v, 'channel', ['ambient', 'stinger', 'voice', 'ui']);
  optEnum(c, v, 'priority', ['low', 'normal', 'high']);
  if (v.condition !== undefined) {
    c.errors.push(...vConditionSpec(`${path}.condition`, v.condition));
  }
  optStrArr(c, v, 'tags');
  return { ok: c.errors.length === 0, errors: c.errors };
}

// --- Ruleset validator ---

function vStatDefinition(path: string, v: unknown): ValidationError[] {
  if (!isObj(v)) return [{ path, message: 'must be an object' }];
  const c = checker(path);
  reqStr(c, v, 'id');
  reqStr(c, v, 'name');
  optNum(c, v, 'min');
  optNum(c, v, 'max');
  reqNum(c, v, 'default');
  return c.errors;
}

function vResourceDefinition(path: string, v: unknown): ValidationError[] {
  if (!isObj(v)) return [{ path, message: 'must be an object' }];
  const c = checker(path);
  reqStr(c, v, 'id');
  reqStr(c, v, 'name');
  optNum(c, v, 'min');
  optNum(c, v, 'max');
  reqNum(c, v, 'default');
  optNum(c, v, 'regenRate');
  return c.errors;
}

function vVerbDefinition(path: string, v: unknown): ValidationError[] {
  if (!isObj(v)) return [{ path, message: 'must be an object' }];
  const c = checker(path);
  reqStr(c, v, 'id');
  reqStr(c, v, 'name');
  optStrArr(c, v, 'tags');
  optStr(c, v, 'description');
  return c.errors;
}

function vFormulaDeclaration(path: string, v: unknown): ValidationError[] {
  if (!isObj(v)) return [{ path, message: 'must be an object' }];
  const c = checker(path);
  reqStr(c, v, 'id');
  reqStr(c, v, 'name');
  optStr(c, v, 'description');
  reqStrArr(c, v, 'inputs');
  reqStr(c, v, 'output');
  return c.errors;
}

export function validateRulesetDefinition(v: unknown, path = 'RulesetDefinition'): ValidationResult {
  if (!isObj(v)) return fail([{ path, message: 'must be an object' }]);
  const c = checker(path);
  reqStr(c, v, 'id');
  reqStr(c, v, 'name');
  reqStr(c, v, 'version');

  if (!Array.isArray(v.stats)) {
    c.errors.push({ path: `${path}.stats`, message: 'required array of StatDefinition' });
  } else {
    c.errors.push(...vArr(`${path}.stats`, v.stats, vStatDefinition));
  }

  if (!Array.isArray(v.resources)) {
    c.errors.push({ path: `${path}.resources`, message: 'required array of ResourceDefinition' });
  } else {
    c.errors.push(...vArr(`${path}.resources`, v.resources, vResourceDefinition));
  }

  if (!Array.isArray(v.verbs)) {
    c.errors.push({ path: `${path}.verbs`, message: 'required array of VerbDefinition' });
  } else {
    c.errors.push(...vArr(`${path}.verbs`, v.verbs, vVerbDefinition));
    // Check for duplicate verb ids
    const verbIds = new Set<string>();
    for (const verb of v.verbs as Array<Record<string, unknown>>) {
      if (typeof verb.id === 'string') {
        if (verbIds.has(verb.id)) {
          c.errors.push({ path: `${path}.verbs`, message: `duplicate verb id "${verb.id}"` });
        }
        verbIds.add(verb.id);
      }
    }
  }

  if (!Array.isArray(v.formulas)) {
    c.errors.push({ path: `${path}.formulas`, message: 'required array of FormulaDeclaration' });
  } else {
    c.errors.push(...vArr(`${path}.formulas`, v.formulas, vFormulaDeclaration));
  }

  reqStrArr(c, v, 'defaultModules');
  reqStrArr(c, v, 'progressionModels');

  return { ok: c.errors.length === 0, errors: c.errors };
}

// --- Convenience: format errors as readable string ---

export function formatErrors(result: ValidationResult): string {
  if (result.ok) return 'Valid';
  return result.errors.map((e) => `  ${e.path}: ${e.message}`).join('\n');
}
