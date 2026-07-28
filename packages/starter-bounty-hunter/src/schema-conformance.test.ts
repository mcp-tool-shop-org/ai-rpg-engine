// Every authored content shape runs through content-schema's real validators.
//
// content-schema ships validators type-compatible with each starter's
// quests/dialogue/abilities/statuses, and nothing runs them against SHIPPED
// content by default. This closes that gap for hue-and-cry on its first commit.

import { describe, it, expect } from 'vitest';
import {
  validateQuestDefinition,
  validateDialogueDefinition,
  validateAbilityPack,
  validateStatusDefinitionPack,
} from '@ai-rpg-engine/content-schema';
import {
  bountyHunterQuests,
  bountyHunterAbilities,
  bountyHunterStatusDefinitions,
  swearingInDialogue,
  flashHouseDialogue,
} from './content.js';
import { bountyHunterMinimalRuleset } from './ruleset.js';

const fmt = (errors: { path: string; message: string }[]) =>
  errors.map((e) => `${e.path}: ${e.message}`).join('; ');

describe('schema conformance — hue-and-cry shipped content', () => {
  it('every quest validates', () => {
    for (const quest of bountyHunterQuests) {
      const r = validateQuestDefinition(quest);
      expect(r.ok, `quest '${quest.id}' — ${fmt(r.errors)}`).toBe(true);
    }
  });

  it('every dialogue validates', () => {
    for (const dialogue of [swearingInDialogue, flashHouseDialogue]) {
      const r = validateDialogueDefinition(dialogue);
      expect(r.ok, `dialogue '${dialogue.id}' — ${fmt(r.errors)}`).toBe(true);
    }
  });

  it('the ability pack validates against this pack own ruleset', () => {
    const r = validateAbilityPack(bountyHunterAbilities, bountyHunterMinimalRuleset);
    expect(r.ok, fmt(r.errors)).toBe(true);
  });

  it('the status pack validates', () => {
    const r = validateStatusDefinitionPack(bountyHunterStatusDefinitions);
    expect(r.ok, fmt(r.errors)).toBe(true);
  });
});
