// Schema conformance — F-0cc0f2e2 (the root-cause fix).
//
// content-schema ships structural + cross-reference validators
// (validateQuestDefinition, validateDialogueDefinition, validateAbilityPack,
// validateStatusDefinitionPack) that are type-compatible with this pack's real
// quests/dialogue/abilities/statuses — every starter imports its content types
// directly from content-schema. But before this file existed, nothing ran
// those validators against any starter's SHIPPED content: they were only
// exercised against content-schema's own synthetic fixtures and packages/
// ollama's AI-draft content. That gap let F-b34a5c82 (alphaQuest's
// 'antibiotics' reward missing from itemCatalog) ship silently — no suite
// anywhere checked that a quest's item rewards actually resolve.
//
// This file closes the gap for ashfall-dead: every quest, the dialogue, the
// ability pack, and the status pack now run through content-schema on every
// test run.

import { describe, it, expect } from 'vitest';
import {
  validateQuestDefinition,
  validateDialogueDefinition,
  validateAbilityPack,
  validateStatusDefinitionPack,
  formatErrors,
} from '@ai-rpg-engine/content-schema';
import { zombieMinimalRuleset } from './ruleset.js';
import {
  zombieQuests,
  medicDialogue,
  zombieAbilities,
  zombieStatusDefinitions,
  itemCatalog,
} from './content.js';

describe('schema-conformance: Ashfall Dead content validates against content-schema', () => {
  for (const quest of zombieQuests) {
    it(`quest "${quest.id}" is structurally valid`, () => {
      const result = validateQuestDefinition(quest);
      expect(result.ok, formatErrors(result)).toBe(true);
    });

    it(`quest "${quest.id}" item rewards resolve in itemCatalog`, () => {
      const itemIds = new Set(itemCatalog.items.map((i) => i.id));
      const missing = (quest.rewards ?? [])
        .filter((r) => r.type === 'item')
        .map((r) => r.params.itemId)
        .filter((itemId) => typeof itemId !== 'string' || !itemIds.has(itemId));
      expect(missing, `quest "${quest.id}" grants item reward(s) missing from itemCatalog: ${missing.join(', ')}`).toEqual([]);
    });
  }

  it('dialogue is structurally valid', () => {
    const result = validateDialogueDefinition(medicDialogue);
    expect(result.ok, formatErrors(result)).toBe(true);
  });

  it('ability pack cross-validates against the ruleset', () => {
    const result = validateAbilityPack(zombieAbilities, zombieMinimalRuleset);
    expect(result.ok, formatErrors(result)).toBe(true);
  });

  it('status definitions are structurally valid with unique ids', () => {
    const result = validateStatusDefinitionPack(zombieStatusDefinitions);
    expect(result.ok, formatErrors(result)).toBe(true);
  });
});
