/**
 * Profile Templates — tests.
 *
 * The 10 starter playstyles must be clean, coherent, and pure data:
 *  - each builds with no warnings,
 *  - the whole set validates with no errors/advisories (unique ids, no shared
 *    ability ids, no cross-role stat drift), and
 *  - each round-trips through JSON unchanged (no closures / Date / undefined).
 */

import { describe, it, expect } from 'vitest';
import { buildProfile, validateProfileSet } from './profile.js';
import {
  starterProfiles,
  starterProfileList,
  gladiatorProfile,
  fantasyProfile,
} from './profile-templates.js';

describe('Profile Templates (starter playstyles)', () => {
  it('exports all 10 starters, keyed by matching id', () => {
    expect(starterProfileList).toHaveLength(10);
    expect(Object.keys(starterProfiles)).toHaveLength(10);
    for (const [key, profile] of Object.entries(starterProfiles)) {
      expect(profile.id).toBe(key);
    }
  });

  it('every template builds with no warnings', () => {
    for (const template of starterProfileList) {
      const { warnings } = buildProfile(template);
      expect(warnings, `${template.id} should build clean`).toEqual([]);
    }
  });

  it('the full set validates cleanly (unique ids, no shared abilities, no stat drift)', () => {
    const result = validateProfileSet(starterProfileList);
    expect(result.errors).toEqual([]);
    expect(result.advisories).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('each template is pure JSON data (round-trips unchanged — no closures/Date)', () => {
    for (const template of starterProfileList) {
      expect(JSON.parse(JSON.stringify(template))).toEqual(template);
    }
  });

  it('captures the real starter stat mapping verbatim (gladiator = might/agility/showmanship)', () => {
    expect(gladiatorProfile.statMapping).toEqual({
      attack: 'might', precision: 'agility', resolve: 'showmanship',
    });
  });

  it('resolves the starter bias tags into built-in pack biases', () => {
    // gladiator wires biasTags: ['feral', 'beast'] → two resolved biases.
    const tags = (gladiatorProfile.packBiases ?? []).map((b) => b.tag).sort();
    expect(tags).toEqual(['beast', 'feral']);
  });

  it('the fantasy template uses the engine default stat mapping', () => {
    expect(fantasyProfile.statMapping).toEqual({
      attack: 'vigor', precision: 'instinct', resolve: 'will',
    });
  });

  it('templates ship without abilities (game-specific content is layered by the author)', () => {
    for (const template of starterProfileList) {
      expect(template.abilities).toEqual([]);
    }
  });
});
