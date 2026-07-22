// Schema conformance — F-0cc0f2e2 (the root-cause fix).
//
// content-schema ships structural + cross-reference validators
// (validateDialogueDefinition, validateAbilityPack,
// validateStatusDefinitionPack) that are type-compatible with this pack's
// real dialogue/abilities/statuses — every starter imports its content types
// directly from content-schema. But before this file existed, nothing ran
// those validators against any starter's SHIPPED content: they were only
// exercised against content-schema's own synthetic fixtures and packages/
// ollama's AI-draft content.
//
// This file closes the gap for signal-loss: the dialogue, the ability pack,
// and the status pack now run through content-schema on every test run.
// (This pack defines no quests today — the quest check lives in
// starter-fantasy/starter-zombie, the only two packs that have any.)

import { describe, it, expect } from 'vitest';
import {
  validateDialogueDefinition,
  validateAbilityPack,
  validateStatusDefinitionPack,
  formatErrors,
} from '@ai-rpg-engine/content-schema';
import { colonyMinimalRuleset } from './ruleset.js';
import { scientistDialogue, colonyAbilities, colonyStatusDefinitions } from './content.js';

describe('schema-conformance: Signal Loss content validates against content-schema', () => {
  it('dialogue is structurally valid', () => {
    const result = validateDialogueDefinition(scientistDialogue);
    expect(result.ok, formatErrors(result)).toBe(true);
  });

  it('ability pack cross-validates against the ruleset', () => {
    const result = validateAbilityPack(colonyAbilities, colonyMinimalRuleset);
    expect(result.ok, formatErrors(result)).toBe(true);
  });

  it('status definitions are structurally valid with unique ids', () => {
    const result = validateStatusDefinitionPack(colonyStatusDefinitions);
    expect(result.ok, formatErrors(result)).toBe(true);
  });
});
