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
  // `type` stays required (the back-compat flat enum and the default source for
  // the independent axes when they are omitted).
  reqEnum(c, v, 'type', ['self', 'single', 'zone', 'all-enemies', 'none']);
  optNum(c, v, 'range');
  optStrArr(c, v, 'filter');
  // Independent axes (optional) — accepted alongside the flat `type`.
  optEnum(c, v, 'scope', ['self', 'single', 'all']);
  optEnum(c, v, 'affiliation', ['ally', 'enemy', 'any']);
  optEnum(c, v, 'life', ['alive', 'dead', 'any']);
  optStr(c, v, 'area');
  if (v.includeSelf !== undefined && typeof v.includeSelf !== 'boolean') {
    c.errors.push({ path: `${path}.includeSelf`, message: `must be a boolean if provided` });
  }
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

/**
 * Cross-validates a collection of StatusDefinitions.
 *
 * Runs `validateStatusDefinition()` on each entry, then checks:
 * - No duplicate IDs
 * - Tags reference known vocabulary (advisory, not error — returned as separate list)
 */
export function validateStatusDefinitionPack(
  defs: unknown[],
  knownTags?: string[],
  path = 'StatusDefinitionPack',
): ValidationResult & { advisories: ValidationError[] } {
  const errors: ValidationError[] = [];
  const advisories: ValidationError[] = [];

  if (!Array.isArray(defs)) {
    return { ok: false, errors: [{ path, message: 'must be an array' }], advisories: [] };
  }

  const seenIds = new Set<string>();
  const tagSet = knownTags ? new Set(knownTags) : null;

  for (let i = 0; i < defs.length; i++) {
    const def = defs[i];
    const defPath = `${path}[${i}]`;

    // Structural validation
    const structResult = validateStatusDefinition(def, defPath);
    errors.push(...structResult.errors);

    if (!isObj(def)) continue;

    // Duplicate ID check
    const id = def.id;
    if (typeof id === 'string') {
      if (seenIds.has(id)) {
        errors.push({ path: `${defPath}.id`, message: `duplicate status id "${id}"` });
      }
      seenIds.add(id);
    }

    // Advisory: tags not in known vocabulary
    if (tagSet && Array.isArray(def.tags)) {
      for (let j = 0; j < (def.tags as unknown[]).length; j++) {
        const tag = (def.tags as unknown[])[j];
        if (typeof tag === 'string' && !tagSet.has(tag)) {
          advisories.push({
            path: `${defPath}.tags[${j}]`,
            message: `tag "${tag}" is not in the known vocabulary`,
          });
        }
      }
    }
  }

  return { ok: errors.length === 0, errors, advisories };
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

export function validateDialogueDefinition(
  v: unknown,
  path = 'DialogueDefinition',
): ValidationResult & { advisories: ValidationError[] } {
  if (!isObj(v)) return { ...fail([{ path, message: 'must be an object' }]), advisories: [] };
  const c = checker(path);
  const advisories: ValidationError[] = [];
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

    // CA-07: reachability — walk from entryNodeId following choices + nextNodeId; any node
    // never visited is an orphan (unreachable). This is an advisory (the dialogue still
    // loads), not an error. Only walk when the entry node actually exists.
    if (typeof v.entryNodeId === 'string' && nodeIds.has(v.entryNodeId)) {
      const reachable = new Set<string>();
      const stack: string[] = [v.entryNodeId];
      while (stack.length > 0) {
        const current = stack.pop()!;
        if (reachable.has(current)) continue;
        reachable.add(current);
        const node = nodes[current];
        if (!isObj(node)) continue;
        if (Array.isArray(node.choices)) {
          for (const ch of node.choices as unknown[]) {
            if (isObj(ch) && typeof ch.nextNodeId === 'string' && nodeIds.has(ch.nextNodeId)) {
              stack.push(ch.nextNodeId);
            }
          }
        }
        if (typeof node.nextNodeId === 'string' && nodeIds.has(node.nextNodeId)) {
          stack.push(node.nextNodeId);
        }
      }
      for (const nodeId of nodeIds) {
        if (!reachable.has(nodeId)) {
          advisories.push({
            path: `${path}.nodes.${nodeId}`,
            message: `node "${nodeId}" is unreachable from entry node "${v.entryNodeId}" — link a choice/nextNodeId to it or remove it`,
          });
        }
      }
    }
  }

  return { ok: c.errors.length === 0, errors: c.errors, advisories };
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

/**
 * Cross-checks numeric bounds on a stat/resource definition (CA-04): min <= max, and
 * min <= default <= max. Only compares fields that are actually numbers, so a missing
 * (optional) min/max imposes no constraint. Reports structured errors naming the field.
 */
function checkBounds(c: Checker, v: Record<string, unknown>): void {
  const min = v.min;
  const max = v.max;
  const def = v.default;
  const hasMin = typeof min === 'number';
  const hasMax = typeof max === 'number';
  const hasDef = typeof def === 'number';

  if (hasMin && hasMax && (min as number) > (max as number)) {
    c.errors.push({
      path: `${c.path}.min`,
      message: `min (${min}) must be <= max (${max})`,
    });
  }
  if (hasDef && hasMin && (def as number) < (min as number)) {
    c.errors.push({
      path: `${c.path}.default`,
      message: `default (${def}) must be >= min (${min})`,
    });
  }
  if (hasDef && hasMax && (def as number) > (max as number)) {
    c.errors.push({
      path: `${c.path}.default`,
      message: `default (${def}) must be <= max (${max})`,
    });
  }
}

function vStatDefinition(path: string, v: unknown): ValidationError[] {
  if (!isObj(v)) return [{ path, message: 'must be an object' }];
  const c = checker(path);
  reqStr(c, v, 'id');
  reqStr(c, v, 'name');
  optNum(c, v, 'min');
  optNum(c, v, 'max');
  reqNum(c, v, 'default');
  checkBounds(c, v);
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
  checkBounds(c, v);
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

// --- Ability Pack cross-validator ---

/** Minimal ruleset shape for cross-validation (compatible with RulesetDefinition) */
export type AbilityPackRuleset = {
  stats: { id: string }[];
  resources: { id: string }[];
};

/** Implicit resources that every engine provides — no need to declare in ruleset */
const IMPLICIT_RESOURCES = new Set(['hp', 'stamina']);

/**
 * Cross-validates an ability pack against a ruleset.
 *
 * Runs `validateAbilityDefinition()` on each ability, then checks:
 * - Costs reference resources that exist in the ruleset (or implicit: hp, stamina)
 * - Checks reference stats that exist in the ruleset
 * - `stat-modify` effects reference valid stats
 * - `resource-modify` effects reference valid resources (or implicit)
 * - No duplicate ability IDs within the pack
 */
export function validateAbilityPack(
  abilities: unknown[],
  ruleset: AbilityPackRuleset,
  path = 'AbilityPack',
): ValidationResult & { advisories: ValidationError[] } {
  const errors: ValidationError[] = [];
  const advisories: ValidationError[] = [];

  if (!Array.isArray(abilities)) {
    return { ...fail([{ path, message: 'abilities must be an array' }]), advisories: [] };
  }

  // CA-03: never trust the ruleset shape. A malformed ruleset must produce a structured
  // failure here, not a raw TypeError ("ruleset.stats.map is not a function") deeper down.
  if (!isObj(ruleset)) {
    return {
      ...fail([{ path: `${path}.ruleset`, message: `ruleset must be an object (got ${ruleset === null ? 'null' : Array.isArray(ruleset) ? 'array' : typeof ruleset})` }]),
      advisories: [],
    };
  }
  const rulesetErrors: ValidationError[] = [];
  if (!Array.isArray((ruleset as Record<string, unknown>).stats)) {
    rulesetErrors.push({ path: `${path}.ruleset.stats`, message: 'must be an array of { id }' });
  }
  if (!Array.isArray((ruleset as Record<string, unknown>).resources)) {
    rulesetErrors.push({ path: `${path}.ruleset.resources`, message: 'must be an array of { id }' });
  }
  if (rulesetErrors.length > 0) {
    return { ...fail(rulesetErrors), advisories: [] };
  }

  // Build lookup sets from ruleset (shape now guaranteed). Each entry is read defensively
  // so a non-object element does not throw.
  const statIds = new Set(
    ruleset.stats.filter((s): s is { id: string } => isObj(s) && typeof s.id === 'string').map((s) => s.id),
  );
  const resourceIds = new Set([
    ...ruleset.resources
      .filter((r): r is { id: string } => isObj(r) && typeof r.id === 'string')
      .map((r) => r.id),
    ...IMPLICIT_RESOURCES,
  ]);

  // Duplicate ID detection
  const seenIds = new Set<string>();

  // Track data for pack-level advisories
  const statusTagCounts: Record<string, number> = {};
  let totalApplyStatusAbilities = 0;
  // F-1ba7db23: keyed by the ability's REAL index (not push order). A plain
  // `number[]` filled with `.push()` inside a loop that `continue`s past
  // non-object entries desyncs from `abilities` by one slot per malformed
  // entry that precedes a given index — the high-cost-low-value advisory
  // below re-indexes the original `abilities` array, so that desync silently
  // attributed one ability's cost to a different ability (or read undefined
  // past the shortened array's end). A Map keyed by the true index can never
  // drift out of alignment.
  const abilityCostByIndex = new Map<number, number>();
  const damageAmounts: number[] = [];

  for (let i = 0; i < abilities.length; i++) {
    const ab = abilities[i];
    const abPath = `${path}[${i}]`;

    // Run structural validation first
    const structResult = validateAbilityDefinition(ab, abPath);
    errors.push(...structResult.errors);

    // Skip cross-validation if not an object
    if (!isObj(ab)) continue;

    // Duplicate ID check
    const id = ab.id;
    if (typeof id === 'string') {
      if (seenIds.has(id)) {
        errors.push({ path: `${abPath}.id`, message: `duplicate ability id "${id}"` });
      }
      seenIds.add(id);
    }

    // Cross-validate costs → resources
    let abCost = 0;
    if (Array.isArray(ab.costs)) {
      for (let j = 0; j < (ab.costs as unknown[]).length; j++) {
        const cost = (ab.costs as unknown[])[j];
        if (isObj(cost) && typeof cost.resourceId === 'string') {
          if (!resourceIds.has(cost.resourceId)) {
            errors.push({
              path: `${abPath}.costs[${j}].resourceId`,
              message: `references unknown resource "${cost.resourceId}" (not in ruleset or implicit)`,
            });
          }
          if (typeof cost.amount === 'number') abCost += cost.amount;
        }
      }
    }
    abilityCostByIndex.set(i, abCost);

    // Cross-validate checks → stats
    if (Array.isArray(ab.checks)) {
      for (let j = 0; j < (ab.checks as unknown[]).length; j++) {
        const check = (ab.checks as unknown[])[j];
        if (isObj(check) && typeof check.stat === 'string') {
          if (!statIds.has(check.stat)) {
            errors.push({
              path: `${abPath}.checks[${j}].stat`,
              message: `references unknown stat "${check.stat}" (not in ruleset)`,
            });
          }
        }
      }
    }

    // Cross-validate effects → stats/resources + gather advisory data
    if (Array.isArray(ab.effects)) {
      for (let j = 0; j < (ab.effects as unknown[]).length; j++) {
        const effect = (ab.effects as unknown[])[j];
        if (!isObj(effect)) continue;
        const effectPath = `${abPath}.effects[${j}]`;
        const params = effect.params;
        if (!isObj(params)) continue;

        if (effect.type === 'stat-modify') {
          if (typeof params.stat === 'string' && !statIds.has(params.stat)) {
            errors.push({
              path: `${effectPath}.params.stat`,
              message: `stat-modify references unknown stat "${params.stat}" (not in ruleset)`,
            });
          }
        }

        if (effect.type === 'resource-modify') {
          if (typeof params.resource === 'string' && !resourceIds.has(params.resource)) {
            errors.push({
              path: `${effectPath}.params.resource`,
              message: `resource-modify references unknown resource "${params.resource}" (not in ruleset or implicit)`,
            });
          }
        }

        // Track apply-status tags for pack-level advisory
        if (effect.type === 'apply-status' && typeof params.statusId === 'string') {
          totalApplyStatusAbilities++;
          statusTagCounts[params.statusId] = (statusTagCounts[params.statusId] ?? 0) + 1;
        }

        // Track damage
        if (effect.type === 'damage' && typeof params.amount === 'number') {
          damageAmounts.push(params.amount);
        }
      }
    }

    // Per-ability advisory: zero-cost-zero-cooldown
    const cooldown = typeof ab.cooldown === 'number' ? ab.cooldown : 0;
    if (abCost === 0 && cooldown === 0) {
      advisories.push({
        path: abPath,
        message: `"${typeof ab.name === 'string' ? ab.name : ab.id}" has zero cost and zero cooldown — suspicious free+instant ability`,
      });
    }

    // Per-ability advisory: overbroad-cleanse
    if (Array.isArray(ab.effects)) {
      for (const effect of (ab.effects as unknown[])) {
        if (isObj(effect) && effect.type === 'remove-status-by-tag' && isObj(effect.params)) {
          const tags = typeof effect.params.tags === 'string' ? effect.params.tags : '';
          const tagList = tags.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
          if (tagList.length > 3) {
            advisories.push({
              path: `${abPath}`,
              message: `"${typeof ab.name === 'string' ? ab.name : ab.id}" cleanse covers ${tagList.length} tags (>3) — may be overbroad`,
            });
          }
        }
      }
    }
  }

  // Pack-level advisory: excessive-duplicate-semantics
  if (totalApplyStatusAbilities > 0 && abilities.length > 1) {
    for (const [statusId, count] of Object.entries(statusTagCounts)) {
      if (count / abilities.length > 0.5) {
        advisories.push({
          path,
          message: `>50% of pack abilities apply "${statusId}" — excessive duplicate semantics`,
        });
      }
    }
  }

  // Pack-level advisory: high-cost-low-value
  if (abilityCostByIndex.size > 1 && damageAmounts.length > 0) {
    const costValues = [...abilityCostByIndex.values()];
    const avgCost = costValues.reduce((a, b) => a + b, 0) / costValues.length;
    const minDamage = Math.min(...damageAmounts);
    for (let i = 0; i < abilities.length; i++) {
      const ab = abilities[i];
      if (!isObj(ab)) continue;
      const abCost = abilityCostByIndex.get(i);
      if (abCost === undefined) continue;
      if (abCost > avgCost * 0.6) {
        // Check if this ability has the lowest damage in the pack
        const abDamages: number[] = [];
        if (Array.isArray(ab.effects)) {
          for (const effect of (ab.effects as unknown[])) {
            if (isObj(effect) && effect.type === 'damage' && isObj(effect.params) && typeof effect.params.amount === 'number') {
              abDamages.push(effect.params.amount);
            }
          }
        }
        if (abDamages.length > 0 && Math.max(...abDamages) === minDamage && abCost > avgCost * 1.5) {
          advisories.push({
            path: `${path}[${i}]`,
            message: `"${typeof ab.name === 'string' ? ab.name : ab.id}" has high cost (${abCost}) but lowest damage in pack (${minDamage})`,
          });
        }
      }
    }
  }

  return { ok: errors.length === 0, errors, advisories };
}

// --- Convenience: format errors as readable string ---

export function formatErrors(result: ValidationResult): string {
  if (result.ok) return 'Valid';
  return result.errors.map((e) => `  ${e.path}: ${e.message}`).join('\n');
}
