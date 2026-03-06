// Cross-reference validation — checks that IDs reference real content

import type { ValidationError, ValidationResult } from './validate.js';
import type {
  EntityBlueprint,
  ZoneDefinition,
  DialogueDefinition,
  QuestDefinition,
} from './schemas.js';

export type ContentPack = {
  entities?: EntityBlueprint[];
  zones?: ZoneDefinition[];
  dialogues?: DialogueDefinition[];
  quests?: QuestDefinition[];
};

export function validateRefs(pack: ContentPack): ValidationResult {
  const errors: ValidationError[] = [];
  const path = 'refs';

  const entityIds = new Set((pack.entities ?? []).map((e) => e.id));
  const zoneIds = new Set((pack.zones ?? []).map((z) => z.id));
  const dialogueIds = new Set((pack.dialogues ?? []).map((d) => d.id));

  // Zone neighbors must reference existing zones
  for (const zone of pack.zones ?? []) {
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
  for (const dialogue of pack.dialogues ?? []) {
    for (const speaker of dialogue.speakers) {
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
  for (const entity of pack.entities ?? []) {
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
  for (const quest of pack.quests ?? []) {
    const stageIds = new Set(quest.stages.map((s) => s.id));
    for (const stage of quest.stages) {
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

  // Zone neighbor symmetry warning (A→B but B↛A)
  for (const zone of pack.zones ?? []) {
    for (const neighbor of zone.neighbors ?? []) {
      const neighborZone = (pack.zones ?? []).find((z) => z.id === neighbor);
      if (neighborZone && !(neighborZone.neighbors ?? []).includes(zone.id)) {
        errors.push({
          path: `${path}.zone(${zone.id}).neighbors`,
          message: `one-way neighbor: "${zone.id}" → "${neighbor}" but not "${neighbor}" → "${zone.id}"`,
        });
      }
    }
  }

  return { ok: errors.length === 0, errors };
}
