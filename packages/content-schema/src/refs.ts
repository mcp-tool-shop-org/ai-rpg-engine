// Cross-reference validation — checks that IDs reference real content

import type { ValidationError, ValidationResult } from './validate.js';
import type {
  EntityBlueprint,
  ZoneDefinition,
  DialogueDefinition,
  QuestDefinition,
  AbilityDefinition,
  StatusDefinition,
} from './schemas.js';

export type ContentPack = {
  entities?: EntityBlueprint[];
  zones?: ZoneDefinition[];
  dialogues?: DialogueDefinition[];
  quests?: QuestDefinition[];
  /** Optional ability definitions — used by validateGameContent to build a verb/status web */
  abilities?: AbilityDefinition[];
  /** Optional status definitions — used by validateGameContent to resolve status references */
  statuses?: StatusDefinition[];
  /** Optional verb definitions — used by validateGameContent to resolve ability verbs */
  verbs?: { id: string }[];
};

/**
 * Result of a cross-reference pass.
 *
 * `errors` set `ok` to false (genuinely broken references). `advisories` never affect
 * `ok` — they are likely-mistake signals the author should look at (mirrors the
 * `validateAbilityPack` / `validateStatusDefinitionPack` warning pattern).
 */
export type RefsResult = ValidationResult & { advisories: ValidationError[] };

export function validateRefs(pack: ContentPack): RefsResult {
  const errors: ValidationError[] = [];
  const advisories: ValidationError[] = [];
  const path = 'refs';

  // Boundary guard: validateRefs is a public export (and the base of
  // validateGameContent), so a caller may hand it malformed input directly
  // (loadContent guards before calling, but other callers may not). Return a
  // structured error rather than a raw TypeError from `.map(e => e.id)`.
  if (pack === null || typeof pack !== 'object' || Array.isArray(pack)) {
    return { ok: false, errors: [{ path: 'pack', message: 'content pack must be a plain object' }], advisories: [] };
  }

  const isRecord = (v: unknown): boolean => v !== null && typeof v === 'object';
  // Normalize every collection to a safe array of record elements once, so the
  // cross-ref loops below can never raw-throw on a null/non-array collection or a
  // null element (the per-type validators enforce element shape; validateRefs is
  // cross-reference only, but as a public boundary it must degrade, not crash).
  const zones = (Array.isArray(pack.zones) ? pack.zones : []).filter(isRecord) as NonNullable<ContentPack['zones']>;
  const entities = (Array.isArray(pack.entities) ? pack.entities : []).filter(isRecord) as NonNullable<ContentPack['entities']>;
  const dialogues = (Array.isArray(pack.dialogues) ? pack.dialogues : []).filter(isRecord) as NonNullable<ContentPack['dialogues']>;
  const quests = (Array.isArray(pack.quests) ? pack.quests : []).filter(isRecord) as NonNullable<ContentPack['quests']>;
  const entityIds = new Set(entities.map((e) => e.id));
  const zoneIds = new Set(zones.map((z) => z.id));

  // Zone neighbors must reference existing zones
  for (const zone of zones) {
    for (const neighbor of zone.neighbors ?? []) {
      if (!zoneIds.has(neighbor)) {
        errors.push({
          path: `${path}.zone(${zone.id}).neighbors`,
          message: `references unknown zone "${neighbor}"`,
        });
      }
    }
    // Exit targets must reference existing zones
    for (const exit of zone.exits ?? []) {
      if (!zoneIds.has(exit.targetZoneId)) {
        errors.push({
          path: `${path}.zone(${zone.id}).exits`,
          message: `exit target references unknown zone "${exit.targetZoneId}"`,
        });
      }
    }
    // Entities placed in zones must exist
    for (const entityId of zone.entities ?? []) {
      if (!entityIds.has(entityId)) {
        errors.push({
          path: `${path}.zone(${zone.id}).entities`,
          message: `references unknown entity "${entityId}"`,
        });
      }
    }
  }

  // Dialogue speakers should reference known entities
  for (const dialogue of dialogues) {
    for (const speaker of dialogue.speakers ?? []) {
      if (!entityIds.has(speaker)) {
        errors.push({
          path: `${path}.dialogue(${dialogue.id}).speakers`,
          message: `speaker "${speaker}" not found in entities`,
        });
      }
    }
  }

  // Entity starting statuses, inventory — can't fully validate without status/item registries,
  // but we flag duplicates
  for (const entity of entities) {
    if (entity.inventory) {
      const seen = new Set<string>();
      for (const item of entity.inventory) {
        if (seen.has(item)) {
          errors.push({
            path: `${path}.entity(${entity.id}).inventory`,
            message: `duplicate item "${item}"`,
          });
        }
        seen.add(item);
      }
    }
  }

  // Quest stage self-references
  for (const quest of quests) {
    const stages = quest.stages ?? [];
    const stageIds = new Set(stages.map((s) => s.id));
    for (const stage of stages) {
      if (stage.nextStage && !stageIds.has(stage.nextStage)) {
        errors.push({
          path: `${path}.quest(${quest.id}).stage(${stage.id}).nextStage`,
          message: `references unknown stage "${stage.nextStage}"`,
        });
      }
      if (stage.failStage && !stageIds.has(stage.failStage)) {
        errors.push({
          path: `${path}.quest(${quest.id}).stage(${stage.id}).failStage`,
          message: `references unknown stage "${stage.failStage}"`,
        });
      }
    }
  }

  // Zone neighbor symmetry — ADVISORY only (CA-01). A one-way passage (A→B but B↛A) is a
  // legitimate design choice (a ledge you drop off, a collapsing bridge), so it must not
  // force ok:false. We surface it as an actionable advisory instead.
  for (const zone of zones) {
    for (const neighbor of zone.neighbors ?? []) {
      const neighborZone = zones.find((z) => z.id === neighbor);
      if (neighborZone && !(neighborZone.neighbors ?? []).includes(zone.id)) {
        advisories.push({
          path: `${path}.zone(${zone.id}).neighbors`,
          message: `one-way passage: zone '${zone.id}' lists '${neighbor}' as neighbor but not vice versa — add '${zone.id}' to '${neighbor}'.neighbors if the passage should be two-way`,
        });
      }
    }
  }

  return { ok: errors.length === 0, errors, advisories };
}

/**
 * Optional registries that define the ids entities/abilities reference. Each is optional:
 * when a registry is absent AND the pack itself does not define that category, the
 * corresponding cross-check is skipped (warn-and-degrade — we only flag what we can verify).
 */
export type GameContentRegistries = {
  /** Known status ids (e.g. from a StatusDefinition pack) */
  statusIds?: string[];
  /** Known verb ids (e.g. from a ruleset's verbs) */
  verbIds?: string[];
  /** Known ability ids */
  abilityIds?: string[];
  /** Known item ids (inventory / equipment) */
  itemIds?: string[];
};

/**
 * Whole-game cross-validator (CA-05).
 *
 * Runs the structural `validateRefs` pass, then — when the relevant registry is available
 * (supplied explicitly OR derivable from the pack itself) — ties entity- and ability-level
 * references to the ids that actually define them:
 *
 * - entity.startingStatuses → status registry
 * - entity.inventory / entity.equipment → item registry
 * - ability.verb → verb registry
 * - ability `apply-status` effects (params.statusId) → status registry
 *
 * A misspelled status/verb/item id is reported as an ERROR here, instead of failing
 * silently at runtime. Categories with no available registry are skipped (not invented as
 * errors). One-way neighbor advisories from `validateRefs` flow through unchanged.
 */
export function validateGameContent(
  pack: ContentPack,
  registries: GameContentRegistries = {},
): RefsResult {
  const base = validateRefs(pack);
  // If the pack is not a usable object, validateRefs already produced the
  // structured 'pack' error — return before dereferencing pack.statuses/verbs/
  // abilities/entities below (e.g. `null.statuses` would raw-throw).
  if (pack === null || typeof pack !== 'object' || Array.isArray(pack)) return base;
  const errors: ValidationError[] = [...base.errors];
  const advisories: ValidationError[] = [...base.advisories];
  const path = 'game';

  // Build effective registries: explicit input first, otherwise derive from the pack.
  const statusReg = buildRegistry(
    registries.statusIds,
    pack.statuses?.map((s) => s.id),
  );
  const verbReg = buildRegistry(
    registries.verbIds,
    pack.verbs?.map((v) => v.id),
  );
  const itemReg = buildRegistry(registries.itemIds, undefined);
  const abilityReg = buildRegistry(
    registries.abilityIds,
    pack.abilities?.map((a) => a.id),
  );
  void abilityReg; // reserved for future entity→ability references; no current source field

  // entity.startingStatuses → status registry
  if (statusReg) {
    for (const entity of pack.entities ?? []) {
      for (const statusId of entity.startingStatuses ?? []) {
        if (!statusReg.has(statusId)) {
          errors.push({
            path: `${path}.entity(${entity.id}).startingStatuses`,
            message: `references unknown status "${statusId}" — define it in the status registry or fix the id`,
          });
        }
      }
    }
  }

  // entity.inventory + entity.equipment → item registry
  if (itemReg) {
    for (const entity of pack.entities ?? []) {
      for (const item of entity.inventory ?? []) {
        if (!itemReg.has(item)) {
          errors.push({
            path: `${path}.entity(${entity.id}).inventory`,
            message: `references unknown item "${item}" — define it in the item registry or fix the id`,
          });
        }
      }
      for (const [slot, item] of Object.entries(entity.equipment ?? {})) {
        if (!itemReg.has(item)) {
          errors.push({
            path: `${path}.entity(${entity.id}).equipment.${slot}`,
            message: `references unknown item "${item}" — define it in the item registry or fix the id`,
          });
        }
      }
    }
  }

  // ability.verb → verb registry; apply-status effects → status registry
  for (const ability of pack.abilities ?? []) {
    if (verbReg && typeof ability.verb === 'string' && !verbReg.has(ability.verb)) {
      errors.push({
        path: `${path}.ability(${ability.id}).verb`,
        message: `references unknown verb "${ability.verb}" — declare it in the ruleset's verbs or fix the id`,
      });
    }

    if (statusReg) {
      for (let i = 0; i < (ability.effects ?? []).length; i++) {
        const effect = ability.effects[i];
        if (effect && effect.type === 'apply-status') {
          const statusId = effect.params?.statusId;
          if (typeof statusId === 'string' && !statusReg.has(statusId)) {
            errors.push({
              path: `${path}.ability(${ability.id}).effects[${i}].params.statusId`,
              message: `apply-status references unknown status "${statusId}" — define it in the status registry or fix the id`,
            });
          }
        }
      }
    }
  }

  return { ok: errors.length === 0, errors, advisories };
}

/**
 * Returns a Set of ids when at least one source is present, otherwise `null` to signal
 * "no registry available — skip this category" (warn-and-degrade).
 */
function buildRegistry(
  explicit: string[] | undefined,
  fromPack: string[] | undefined,
): Set<string> | null {
  if (explicit === undefined && fromPack === undefined) return null;
  return new Set([...(explicit ?? []), ...(fromPack ?? [])]);
}
