// Every authored content shape runs through content-schema's real validators.
//
// content-schema ships validators that are type-compatible with each starter's
// quests/dialogue/abilities/statuses, but nothing runs them against SHIPPED
// content by default — they were exercised only against content-schema's own
// synthetic fixtures. This file closes that gap for salt-road-ledger.
//
// content.test.ts already validates the quests and the ability pack (the latter
// cross-checked against this pack's ruleset). This adds dialogue and statuses,
// so all four families are covered.

import { describe, it, expect } from 'vitest';
import {
  validateQuestDefinition,
  validateDialogueDefinition,
  validateAbilityPack,
  validateStatusDefinitionPack,
} from '@ai-rpg-engine/content-schema';
import {
  merchantQuests,
  merchantAbilities,
  merchantStatusDefinitions,
  guildRegistrationDialogue,
  warrensTermsDialogue,
} from './content.js';
import { merchantMinimalRuleset } from './ruleset.js';

const fmt = (errors: { path: string; message: string }[]) =>
  errors.map((e) => `${e.path}: ${e.message}`).join('; ');

describe('schema conformance — salt-road-ledger shipped content', () => {
  it('every quest validates', () => {
    for (const quest of merchantQuests) {
      const r = validateQuestDefinition(quest);
      expect(r.ok, `quest '${quest.id}' — ${fmt(r.errors)}`).toBe(true);
    }
  });

  it('every dialogue validates', () => {
    for (const dialogue of [guildRegistrationDialogue, warrensTermsDialogue]) {
      const r = validateDialogueDefinition(dialogue);
      expect(r.ok, `dialogue '${dialogue.id}' — ${fmt(r.errors)}`).toBe(true);
    }
  });

  it('the ability pack validates against this pack’s ruleset', () => {
    const r = validateAbilityPack(merchantAbilities, merchantMinimalRuleset);
    expect(r.ok, fmt(r.errors)).toBe(true);
  });

  it('the status pack validates', () => {
    const r = validateStatusDefinitionPack(merchantStatusDefinitions);
    expect(r.ok, fmt(r.errors)).toBe(true);
  });

  it('content ids are unique within each family', () => {
    // Duplicate ids are the silent-shadowing bug: the later definition wins and
    // the earlier one becomes unreachable without any validator complaining.
    const families: Array<[string, string[]]> = [
      ['quests', merchantQuests.map((q) => q.id)],
      ['abilities', merchantAbilities.map((a) => a.id)],
      ['statuses', merchantStatusDefinitions.map((s) => s.id)],
      ['dialogues', [guildRegistrationDialogue.id, warrensTermsDialogue.id]],
    ];
    for (const [family, ids] of families) {
      expect(new Set(ids).size, `${family} has duplicate ids: ${ids.join(', ')}`).toBe(ids.length);
    }
  });
});
