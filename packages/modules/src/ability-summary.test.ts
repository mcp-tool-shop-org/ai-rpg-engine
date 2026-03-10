// ability-summary tests — pack summary, Markdown/JSON formatters, balance audit
// Proves: correct counts, cost aggregation, cooldown bands, effect distribution, cross-pack audit

import { describe, it, expect } from 'vitest';
import type { AbilityDefinition } from '@ai-rpg-engine/content-schema';
import type { StatusDefinition } from '@ai-rpg-engine/content-schema';
import {
  summarizeAbilityPack,
  formatAbilityPackMarkdown,
  formatAbilityPackJSON,
  auditAbilityBalance,
  compareAbilityPacks,
  formatPackComparisonMarkdown,
} from './ability-summary.js';

// --- Test fixtures ---

const fireball: AbilityDefinition = {
  id: 'fireball', name: 'Fireball', verb: 'use-ability',
  tags: ['magic', 'fire', 'damage'],
  costs: [{ resourceId: 'stamina', amount: 3 }],
  target: { type: 'all-enemies' },
  checks: [{ stat: 'will', difficulty: 7 }],
  effects: [
    { type: 'damage', target: 'target', params: { amount: 5, damageType: 'fire' } },
  ],
  cooldown: 3,
};

const heal: AbilityDefinition = {
  id: 'heal', name: 'Heal', verb: 'use-ability',
  tags: ['magic', 'support'],
  costs: [{ resourceId: 'stamina', amount: 2 }, { resourceId: 'mana', amount: 5 }],
  target: { type: 'self' },
  checks: [],
  effects: [
    { type: 'heal', target: 'actor', params: { amount: 4, resource: 'hp' } },
    { type: 'stat-modify', target: 'actor', params: { stat: 'will', amount: 1 } },
  ],
  cooldown: 4,
};

const quickStrike: AbilityDefinition = {
  id: 'quick-strike', name: 'Quick Strike', verb: 'use-ability',
  tags: ['combat', 'damage'],
  costs: [{ resourceId: 'stamina', amount: 1 }],
  target: { type: 'single' },
  checks: [],
  effects: [
    { type: 'damage', target: 'target', params: { amount: 2, damageType: 'melee' } },
  ],
  cooldown: 1,
};

const testPack = [fireball, heal, quickStrike];

// --- Summary tests ---

describe('summarizeAbilityPack', () => {
  it('counts abilities correctly', () => {
    const s = summarizeAbilityPack('test', testPack);
    expect(s.abilityCount).toBe(3);
    expect(s.genre).toBe('test');
  });

  it('aggregates cost economy', () => {
    const s = summarizeAbilityPack('test', testPack);
    // stamina: 3 + 2 + 1 = 6, mana: 5
    expect(s.costSummary.stamina).toBe(6);
    expect(s.costSummary.mana).toBe(5);
  });

  it('distributes cooldown bands', () => {
    const s = summarizeAbilityPack('test', testPack);
    // quickStrike=1 → short, fireball=3 → medium, heal=4 → medium
    expect(s.cooldownBands.short).toBe(1);
    expect(s.cooldownBands.medium).toBe(2);
    expect(s.cooldownBands.instant).toBe(0);
    expect(s.cooldownBands.long).toBe(0);
  });

  it('computes average cooldown', () => {
    const s = summarizeAbilityPack('test', testPack);
    // (1 + 3 + 4) / 3 = 2.67
    expect(s.averageCooldown).toBeCloseTo(2.67, 1);
  });

  it('distributes effect types', () => {
    const s = summarizeAbilityPack('test', testPack);
    expect(s.effectDistribution.damage).toBe(2);
    expect(s.effectDistribution.heal).toBe(1);
    expect(s.effectDistribution['stat-modify']).toBe(1);
  });

  it('distributes target types', () => {
    const s = summarizeAbilityPack('test', testPack);
    expect(s.targetDistribution['all-enemies']).toBe(1);
    expect(s.targetDistribution.self).toBe(1);
    expect(s.targetDistribution.single).toBe(1);
  });

  it('sorts abilities by cooldown descending', () => {
    const s = summarizeAbilityPack('test', testPack);
    expect(s.abilitiesByCooldown[0].id).toBe('heal'); // cd 4
    expect(s.abilitiesByCooldown[1].id).toBe('fireball'); // cd 3
    expect(s.abilitiesByCooldown[2].id).toBe('quick-strike'); // cd 1
  });
});

// --- Formatter tests ---

describe('formatAbilityPackMarkdown', () => {
  it('produces valid Markdown with headers', () => {
    const s = summarizeAbilityPack('fantasy', testPack);
    const md = formatAbilityPackMarkdown(s);
    expect(md).toContain('# fantasy Ability Pack');
    expect(md).toContain('| Ability |');
    expect(md).toContain('Fireball');
    expect(md).toContain('## Cost Economy');
    expect(md).toContain('## Cooldown Distribution');
  });
});

describe('formatAbilityPackJSON', () => {
  it('produces a serializable object with correct counts', () => {
    const s = summarizeAbilityPack('fantasy', testPack);
    const json = formatAbilityPackJSON(s) as Record<string, unknown>;
    expect(json.genre).toBe('fantasy');
    expect(json.abilityCount).toBe(3);
    expect(typeof json.averageCooldown).toBe('number');
    expect(Array.isArray(json.abilities)).toBe(true);
    // Verify it's JSON-serializable
    expect(() => JSON.stringify(json)).not.toThrow();
  });
});

// --- Audit tests ---

describe('auditAbilityBalance', () => {
  it('finds no critical flags in balanced packs', () => {
    const audit = auditAbilityBalance([{ genre: 'test', abilities: testPack }]);
    const warnings = audit.flags.filter((f) => f.severity === 'warning');
    // No extreme damage: all damage is 2-5, mean ~3.5, threshold 7
    expect(warnings).toHaveLength(0);
  });

  it('flags zero-cost abilities', () => {
    const zeroCost: AbilityDefinition = {
      ...fireball,
      id: 'free-spell',
      name: 'Free Spell',
      costs: [],
    };
    const audit = auditAbilityBalance([{ genre: 'test', abilities: [zeroCost] }]);
    const zeroCostFlags = audit.flags.filter((f) => f.category === 'zero-cost');
    expect(zeroCostFlags.length).toBeGreaterThan(0);
    expect(zeroCostFlags[0].message).toContain('no resource costs');
  });

  it('flags no-cooldown abilities', () => {
    const noCd: AbilityDefinition = {
      ...fireball,
      id: 'instant-spell',
      name: 'Instant Spell',
      cooldown: 0,
    };
    const audit = auditAbilityBalance([{ genre: 'test', abilities: [noCd] }]);
    const noCdFlags = audit.flags.filter((f) => f.category === 'no-cooldown');
    expect(noCdFlags.length).toBeGreaterThan(0);
  });

  it('flags extreme damage outliers', () => {
    const nuke: AbilityDefinition = {
      ...fireball,
      id: 'nuke',
      name: 'Nuke',
      effects: [{ type: 'damage', target: 'target', params: { amount: 50, damageType: 'fire' } }],
    };
    // Mix with low damage to make the mean low, making nuke clearly an outlier
    const audit = auditAbilityBalance([
      { genre: 'test', abilities: [quickStrike, quickStrike, nuke] },
    ]);
    const dmgFlags = audit.flags.filter((f) => f.category === 'extreme-damage');
    expect(dmgFlags.length).toBeGreaterThan(0);
    expect(dmgFlags[0].abilityName).toBe('Nuke');
  });

  it('reports correct totalAbilities across packs', () => {
    const audit = auditAbilityBalance([
      { genre: 'pack-a', abilities: testPack },
      { genre: 'pack-b', abilities: [fireball, heal] },
    ]);
    expect(audit.totalAbilities).toBe(5);
  });

  it('flags no-cleanse when pack applies statuses but has no cleanse', () => {
    const statusAbility: AbilityDefinition = {
      ...fireball,
      id: 'debuff-spell',
      effects: [{ type: 'apply-status', target: 'target', params: { statusId: 'cursed', duration: 3 } }],
    };
    const audit = auditAbilityBalance([
      { genre: 'no-cleanse-pack', abilities: [statusAbility] },
    ]);
    const noCleanseFlags = audit.flags.filter((f) => f.category === 'no-cleanse');
    expect(noCleanseFlags.length).toBe(1);
    expect(noCleanseFlags[0].genre).toBe('no-cleanse-pack');
  });

  it('does not flag no-cleanse when pack has a cleanse ability', () => {
    const statusAbility: AbilityDefinition = {
      ...fireball,
      id: 'debuff-spell',
      effects: [{ type: 'apply-status', target: 'target', params: { statusId: 'cursed', duration: 3 } }],
    };
    const cleanseAbility: AbilityDefinition = {
      ...heal,
      id: 'purify',
      effects: [{ type: 'remove-status-by-tag', target: 'actor', params: { tags: 'debuff' } }],
    };
    const audit = auditAbilityBalance([
      { genre: 'balanced-pack', abilities: [statusAbility, cleanseAbility] },
    ]);
    const noCleanseFlags = audit.flags.filter((f) => f.category === 'no-cleanse');
    expect(noCleanseFlags).toHaveLength(0);
  });
});

// --- Status coverage tests (Phase 3) ---

describe('summarizeAbilityPack — status coverage', () => {
  it('tracks statusesApplied from apply-status effects', () => {
    const statusAbility: AbilityDefinition = {
      ...fireball,
      id: 'mesmerize',
      effects: [
        { type: 'apply-status', target: 'target', params: { statusId: 'mesmerized', duration: 3 } },
      ],
    };
    const s = summarizeAbilityPack('test', [statusAbility, quickStrike]);
    expect(s.statusesApplied).toEqual(['mesmerized']);
  });

  it('tracks cleanseTagsCovered from remove-status-by-tag effects', () => {
    const cleanseAbility: AbilityDefinition = {
      ...heal,
      id: 'purify',
      effects: [{ type: 'remove-status-by-tag', target: 'actor', params: { tags: 'control,fear' } }],
    };
    const s = summarizeAbilityPack('test', [cleanseAbility]);
    expect(s.cleanseTagsCovered).toEqual(['control', 'fear']);
  });

  it('returns empty arrays when pack has no status effects', () => {
    const s = summarizeAbilityPack('test', [quickStrike]);
    expect(s.statusesApplied).toEqual([]);
    expect(s.statusesRemoved).toEqual([]);
    expect(s.cleanseTagsCovered).toEqual([]);
  });
});

// --- Phase 4: audit expansion, export maturity, resistance profiles ---

describe('auditAbilityBalance — Phase 4 flags', () => {
  it('flags status-heavy-low-counter', () => {
    const abilities: AbilityDefinition[] = [
      { ...fireball, id: 'a1', effects: [{ type: 'apply-status', target: 'target', params: { statusId: 's1', duration: 2 } }] },
      { ...fireball, id: 'a2', effects: [{ type: 'apply-status', target: 'target', params: { statusId: 's2', duration: 2 } }] },
      { ...fireball, id: 'a3', effects: [{ type: 'apply-status', target: 'target', params: { statusId: 's3', duration: 2 } }] },
    ];
    const audit = auditAbilityBalance([{ genre: 'heavy', abilities }]);
    const flags = audit.flags.filter((f) => f.category === 'status-heavy-low-counter');
    expect(flags.length).toBe(1);
    expect(flags[0].message).toContain('3 unique statuses');
  });

  it('flags resource-economy-skew', () => {
    const abilities: AbilityDefinition[] = [
      { ...fireball, id: 'a1', costs: [{ resourceId: 'mana', amount: 5 }] },
      { ...fireball, id: 'a2', costs: [{ resourceId: 'mana', amount: 3 }] },
      { ...fireball, id: 'a3', costs: [{ resourceId: 'mana', amount: 4 }] },
    ];
    const audit = auditAbilityBalance([{ genre: 'skewed', abilities }]);
    const flags = audit.flags.filter((f) => f.category === 'resource-economy-skew');
    expect(flags.length).toBe(1);
    expect(flags[0].message).toContain('mana');
  });

  it('flags signature-missing', () => {
    const simpleAbilities: AbilityDefinition[] = [
      { ...quickStrike, id: 'a1', cooldown: 2 },
      { ...quickStrike, id: 'a2', cooldown: 1 },
      { ...quickStrike, id: 'a3', cooldown: 2 },
    ];
    const audit = auditAbilityBalance([{ genre: 'simple', abilities: simpleAbilities }]);
    const flags = audit.flags.filter((f) => f.category === 'signature-missing');
    expect(flags.length).toBe(1);
  });

  it('does not flag signature-missing when pack has a signature ability', () => {
    const signatureAbilities: AbilityDefinition[] = [
      quickStrike,
      { ...fireball, id: 'sig', cooldown: 4, effects: [
        { type: 'damage', target: 'target', params: { amount: 5, damageType: 'melee' } },
        { type: 'apply-status', target: 'target', params: { statusId: 'stunned', duration: 2 } },
      ] },
      heal,
    ];
    const audit = auditAbilityBalance([{ genre: 'has-sig', abilities: signatureAbilities }]);
    const flags = audit.flags.filter((f) => f.category === 'signature-missing');
    expect(flags).toHaveLength(0);
  });
});

describe('summarizeAbilityPack — resistance profiles', () => {
  it('counts entities with resistances', () => {
    const entities = [
      { id: 'e1', resistances: { fear: 'immune' } },
      { id: 'e2', resistances: {} },
      { id: 'e3', resistances: { control: 'resistant', fear: 'immune' } },
    ];
    const s = summarizeAbilityPack('test', testPack, { entities });
    expect(s.resistanceProfileCount).toBe(2);
  });

  it('returns 0 when no entities provided', () => {
    const s = summarizeAbilityPack('test', testPack);
    expect(s.resistanceProfileCount).toBe(0);
  });
});

describe('formatAbilityPackMarkdown — Phase 4 sections', () => {
  it('includes Categories section', () => {
    const s = summarizeAbilityPack('test', testPack);
    const md = formatAbilityPackMarkdown(s);
    expect(md).toContain('## Categories');
    expect(md).toContain('offensive');
  });

  it('includes Status Ecosystem section for status-bearing packs', () => {
    const statusAbility: AbilityDefinition = {
      ...fireball,
      id: 'curse',
      effects: [{ type: 'apply-status', target: 'target', params: { statusId: 'cursed', duration: 2 } }],
    };
    const s = summarizeAbilityPack('test', [statusAbility]);
    const md = formatAbilityPackMarkdown(s);
    expect(md).toContain('## Status Interactions');
    expect(md).toContain('cursed');
  });

  it('includes Resistance Profiles section when entities provided', () => {
    const entities = [{ id: 'boss', resistances: { fear: 'immune' } }];
    const s = summarizeAbilityPack('test', testPack, { entities });
    const md = formatAbilityPackMarkdown(s);
    expect(md).toContain('## Resistance Profiles');
    expect(md).toContain('1');
  });
});

describe('formatAbilityPackJSON — Phase 4 fields', () => {
  it('includes new summary fields', () => {
    const s = summarizeAbilityPack('test', testPack);
    const json = formatAbilityPackJSON(s) as Record<string, unknown>;
    expect(json.abilitiesByCategory).toBeDefined();
    expect(json.abilitiesByResourceType).toBeDefined();
    expect(json.resistanceProfileCount).toBe(0);
  });
});

// --- Phase 5: packIdentity, thin-pack, no-tactical-triangle, compareAbilityPacks ---

// Shared fixtures for comparison tests
const makeStatus = (id: string, tags: string[]): StatusDefinition => ({
  id, name: id, tags, stacking: 'replace' as const,
});

const offenseAbility: AbilityDefinition = {
  id: 'slash', name: 'Slash', verb: 'use-ability',
  tags: ['combat', 'damage'],
  costs: [{ resourceId: 'stamina', amount: 2 }],
  target: { type: 'single' },
  checks: [],
  effects: [{ type: 'damage', target: 'target', params: { amount: 3, damageType: 'melee' } }],
  cooldown: 2,
};

const defenseAbility: AbilityDefinition = {
  id: 'mend', name: 'Mend', verb: 'use-ability',
  tags: ['support', 'heal'],
  costs: [{ resourceId: 'stamina', amount: 2 }, { resourceId: 'mana', amount: 3 }],
  target: { type: 'self' },
  checks: [],
  effects: [{ type: 'heal', target: 'actor', params: { amount: 4, resource: 'hp' } }],
  cooldown: 3,
};

const controlAbility: AbilityDefinition = {
  id: 'hex', name: 'Hex', verb: 'use-ability',
  tags: ['magic', 'debuff', 'control'],
  costs: [{ resourceId: 'mana', amount: 4 }],
  target: { type: 'single' },
  checks: [{ stat: 'will', difficulty: 6 }],
  effects: [{ type: 'apply-status', target: 'target', params: { statusId: 'hexed', duration: 3 } }],
  cooldown: 3,
};

const cleanseAbilityDef: AbilityDefinition = {
  id: 'purify', name: 'Purify', verb: 'use-ability',
  tags: ['support', 'cleanse'],
  costs: [{ resourceId: 'stamina', amount: 2 }],
  target: { type: 'self' },
  checks: [],
  effects: [{ type: 'remove-status-by-tag', target: 'actor', params: { tags: 'fear,control' } }],
  cooldown: 3,
};

const signatureAbility: AbilityDefinition = {
  id: 'ultimate-strike', name: 'Ultimate Strike', verb: 'use-ability',
  tags: ['combat', 'damage'],
  costs: [{ resourceId: 'stamina', amount: 4 }, { resourceId: 'fury', amount: 5 }],
  target: { type: 'single' },
  checks: [{ stat: 'might', difficulty: 7 }],
  effects: [
    { type: 'damage', target: 'target', params: { amount: 6, damageType: 'melee' } },
    { type: 'apply-status', target: 'target', params: { statusId: 'stunned', duration: 2 } },
  ],
  cooldown: 4,
};

describe('summarizeAbilityPack — packIdentity (Phase 5)', () => {
  it('derives pack identity string', () => {
    const s = summarizeAbilityPack('warrior', [offenseAbility, defenseAbility, controlAbility]);
    expect(s.packIdentity).toContain('warrior');
    expect(s.packIdentity.length).toBeGreaterThan(10);
  });

  it('mentions resource identity for non-stamina packs', () => {
    const s = summarizeAbilityPack('mage', [controlAbility, defenseAbility]);
    expect(s.packIdentity).toContain('mana');
  });

  it('mentions cleanse in identity when present', () => {
    const s = summarizeAbilityPack('cleric', [cleanseAbilityDef, defenseAbility]);
    expect(s.packIdentity).toContain('cleanse');
  });
});

describe('auditAbilityBalance — Phase 5 flags', () => {
  it('flags thin-pack for packs with ≤ 2 abilities', () => {
    const audit = auditAbilityBalance([
      { genre: 'thin', abilities: [offenseAbility, defenseAbility] },
    ]);
    const thinFlags = audit.flags.filter((f) => f.category === 'thin-pack');
    expect(thinFlags).toHaveLength(1);
    expect(thinFlags[0].severity).toBe('advisory');
    expect(thinFlags[0].message).toContain('thin');
  });

  it('does not flag thin-pack for packs with 3+ abilities', () => {
    const audit = auditAbilityBalance([
      { genre: 'healthy', abilities: [offenseAbility, defenseAbility, controlAbility] },
    ]);
    const thinFlags = audit.flags.filter((f) => f.category === 'thin-pack');
    expect(thinFlags).toHaveLength(0);
  });

  it('flags no-tactical-triangle for offense-only packs with 3+ abilities', () => {
    const audit = auditAbilityBalance([
      { genre: 'glass-cannon', abilities: [
        offenseAbility,
        { ...offenseAbility, id: 'slash-2' },
        { ...offenseAbility, id: 'slash-3' },
      ] },
    ]);
    const triFlags = audit.flags.filter((f) => f.category === 'no-tactical-triangle');
    expect(triFlags).toHaveLength(1);
    expect(triFlags[0].severity).toBe('info');
    expect(triFlags[0].message).toContain('defense');
    expect(triFlags[0].message).toContain('control');
  });

  it('does not flag no-tactical-triangle for balanced 3-ability packs', () => {
    const audit = auditAbilityBalance([
      { genre: 'balanced', abilities: [offenseAbility, defenseAbility, controlAbility] },
    ]);
    const triFlags = audit.flags.filter((f) => f.category === 'no-tactical-triangle');
    expect(triFlags).toHaveLength(0);
  });

  it('skips no-tactical-triangle for packs under 3 abilities', () => {
    const audit = auditAbilityBalance([
      { genre: 'small', abilities: [offenseAbility] },
    ]);
    const triFlags = audit.flags.filter((f) => f.category === 'no-tactical-triangle');
    expect(triFlags).toHaveLength(0);
  });
});

describe('compareAbilityPacks', () => {
  const packA = {
    genre: 'arcane',
    abilities: [offenseAbility, defenseAbility, controlAbility],
    statuses: [makeStatus('hexed', ['control', 'debuff'])],
  };
  const packB = {
    genre: 'holy',
    abilities: [offenseAbility, cleanseAbilityDef, signatureAbility],
    statuses: [makeStatus('stunned', ['control']), makeStatus('blessed', ['buff', 'holy'])],
  };

  it('produces profiles for each pack', () => {
    const matrix = compareAbilityPacks([packA, packB]);
    expect(matrix.packs).toHaveLength(2);
    expect(matrix.packs[0].genre).toBe('arcane');
    expect(matrix.packs[1].genre).toBe('holy');
  });

  it('identifies dominant category', () => {
    const matrix = compareAbilityPacks([packA]);
    // packA has offense (slash) + defense (mend) + control (hex) — equal counts, defaults to first
    expect(['offensive', 'defensive', 'control', 'utility']).toContain(matrix.packs[0].dominantCategory);
  });

  it('detects signature abilities', () => {
    const matrix = compareAbilityPacks([packB]);
    // signatureAbility: cooldown 4, 2 effects → qualifies
    expect(matrix.packs[0].signatureAbility).toBe('ultimate-strike');
  });

  it('identifies resource identity', () => {
    const matrix = compareAbilityPacks([packA]);
    // mend uses mana:3, hex uses mana:4 → mana is dominant non-stamina resource
    expect(matrix.packs[0].resourceIdentity).toBe('mana');
  });

  it('tracks status family from statuses', () => {
    const matrix = compareAbilityPacks([packA]);
    expect(matrix.packs[0].statusFamily).toContain('control');
  });

  it('tracks cleanse tags', () => {
    const matrix = compareAbilityPacks([packB]);
    expect(matrix.packs[0].cleanseTags).toContain('fear');
    expect(matrix.packs[0].cleanseTags).toContain('control');
  });

  it('computes tactical triangle', () => {
    const matrix = compareAbilityPacks([packA]);
    // packA has offense + defense + control
    expect(matrix.packs[0].hasTacticalTriangle).toBe(true);
  });

  it('detects missing tactical triangle', () => {
    const offenseOnlyPack = {
      genre: 'brute',
      abilities: [offenseAbility, { ...offenseAbility, id: 's2' }, { ...offenseAbility, id: 's3' }],
      statuses: [] as StatusDefinition[],
    };
    const matrix = compareAbilityPacks([offenseOnlyPack]);
    expect(matrix.packs[0].hasTacticalTriangle).toBe(false);
  });

  it('computes distinctiveness scores', () => {
    const matrix = compareAbilityPacks([packA, packB]);
    for (const p of matrix.packs) {
      expect(p.distinctivenessScore).toBeGreaterThanOrEqual(0);
      expect(p.distinctivenessScore).toBeLessThanOrEqual(100);
    }
  });

  it('resistance count reflects entity data', () => {
    const matrix = compareAbilityPacks([packA], {
      entities: [{ genre: 'arcane', entities: [
        { id: 'boss', resistances: { control: 'immune' } },
        { id: 'minion', resistances: {} },
        { id: 'guard', resistances: { fear: 'resistant' } },
      ] }],
    });
    expect(matrix.packs[0].resistanceCount).toBe(2);
  });
});

describe('compareAbilityPacks — status ecosystem', () => {
  it('tracks tag usage across all packs', () => {
    const packs = [
      { genre: 'a', abilities: [offenseAbility], statuses: [makeStatus('s1', ['fear', 'debuff'])] },
      { genre: 'b', abilities: [offenseAbility], statuses: [makeStatus('s2', ['fear', 'control'])] },
    ];
    const matrix = compareAbilityPacks(packs);
    expect(matrix.statusEcosystem.tagUsage['fear']).toBe(2);
    expect(matrix.statusEcosystem.tagUsage['control']).toBe(1);
  });

  it('identifies uncleansable tags', () => {
    const packs = [
      { genre: 'a', abilities: [offenseAbility], statuses: [makeStatus('s1', ['breach'])] },
    ];
    const matrix = compareAbilityPacks(packs);
    expect(matrix.statusEcosystem.uncleansableTags).toContain('breach');
  });

  it('identifies unused vocabulary tags', () => {
    const packs = [
      { genre: 'a', abilities: [offenseAbility], statuses: [makeStatus('s1', ['fear'])] },
    ];
    const matrix = compareAbilityPacks(packs);
    // Many known tags are unused when we only define one status
    expect(matrix.statusEcosystem.underrepresentedTags).toContain('poison');
    expect(matrix.statusEcosystem.underrepresentedTags).toContain('wound');
  });

  it('generates recommendations for uncleansable tags', () => {
    const packs = [
      { genre: 'a', abilities: [offenseAbility], statuses: [makeStatus('s1', ['breach'])] },
    ];
    const matrix = compareAbilityPacks(packs);
    expect(matrix.recommendations.some((r) => r.includes('breach') && r.includes('cleanse'))).toBe(true);
  });

  it('generates recommendations for missing tactical triangle', () => {
    const packs = [
      { genre: 'brute', abilities: [offenseAbility, { ...offenseAbility, id: 's2' }, { ...offenseAbility, id: 's3' }], statuses: [] as StatusDefinition[] },
    ];
    const matrix = compareAbilityPacks(packs);
    expect(matrix.recommendations.some((r) => r.includes('brute') && r.includes('tactical triangle'))).toBe(true);
  });
});

describe('formatPackComparisonMarkdown', () => {
  it('produces Markdown table with all pack rows', () => {
    const matrix = compareAbilityPacks([
      { genre: 'alpha', abilities: [offenseAbility, defenseAbility, controlAbility], statuses: [makeStatus('s1', ['fear'])] },
      { genre: 'beta', abilities: [offenseAbility, cleanseAbilityDef], statuses: [] as StatusDefinition[] },
    ]);
    const md = formatPackComparisonMarkdown(matrix);
    expect(md).toContain('# Ability Pack Comparison');
    expect(md).toContain('| alpha |');
    expect(md).toContain('| beta |');
    expect(md).toContain('| Pack |');
  });

  it('includes recommendations section when present', () => {
    const matrix = compareAbilityPacks([
      { genre: 'lonely', abilities: [offenseAbility], statuses: [makeStatus('s1', ['breach'])] },
    ]);
    const md = formatPackComparisonMarkdown(matrix);
    expect(md).toContain('## Recommendations');
  });
});

// --- Phase 5 Slice 5: Markdown maturity, builder ergonomics ---

describe('formatAbilityPackMarkdown — Phase 5 sections', () => {
  it('includes Pack Identity section', () => {
    const s = summarizeAbilityPack('warrior', [offenseAbility, defenseAbility, controlAbility]);
    const md = formatAbilityPackMarkdown(s);
    expect(md).toContain('## Pack Identity');
    expect(md).toContain('warrior');
  });

  it('includes Tactical Triangle indicator', () => {
    const s = summarizeAbilityPack('hero', [offenseAbility, defenseAbility, controlAbility]);
    const md = formatAbilityPackMarkdown(s);
    expect(md).toContain('Tactical Triangle');
    expect(md).toContain('(complete)');
  });

  it('shows incomplete tactical triangle', () => {
    const s = summarizeAbilityPack('brute', [offenseAbility, { ...offenseAbility, id: 'bash' }]);
    const md = formatAbilityPackMarkdown(s);
    expect(md).toContain('(incomplete)');
  });

  it('includes Status Interactions section for status-bearing packs', () => {
    const statusAbility: AbilityDefinition = {
      ...controlAbility,
      id: 'dark-hex',
    };
    const s = summarizeAbilityPack('caster', [statusAbility]);
    const md = formatAbilityPackMarkdown(s);
    expect(md).toContain('## Status Interactions');
    expect(md).toContain('Applies:');
  });

  it('shows Cleanse Coverage in Status Interactions', () => {
    const s = summarizeAbilityPack('healer', [cleanseAbilityDef]);
    const md = formatAbilityPackMarkdown(s);
    expect(md).toContain('Cleanse Coverage:');
    expect(md).toContain('fear');
    expect(md).toContain('control');
  });
});

describe('builder ergonomics (Phase 5)', () => {
  // Verify builders can construct the new Slice 1 abilities correctly
  it('buildHealAbility constructs divine-light equivalent', async () => {
    const { buildHealAbility } = await import('./ability-builders.js');
    const divineLight = buildHealAbility({
      id: 'divine-light', name: 'Divine Light',
      tags: ['divine', 'support', 'heal'],
      costs: [{ resourceId: 'stamina', amount: 2 }],
      healAmount: 4, healResource: 'hp',
      cooldown: 3,
    });
    expect(divineLight.id).toBe('divine-light');
    expect(divineLight.tags).toContain('heal');
    expect(divineLight.cooldown).toBe(3);
    expect(divineLight.effects[0].type).toBe('heal');
  });

  it('buildCleanseAbility constructs clear-headed equivalent', async () => {
    const { buildCleanseAbility } = await import('./ability-builders.js');
    const clearHeaded = buildCleanseAbility({
      id: 'clear-headed', name: 'Clear-Headed',
      tags: ['support', 'cleanse'],
      costs: [{ resourceId: 'stamina', amount: 2 }, { resourceId: 'composure', amount: 2 }],
      cleanseTags: ['fear', 'control'],
      cooldown: 3,
    });
    expect(clearHeaded.id).toBe('clear-headed');
    expect(clearHeaded.tags).toContain('cleanse');
    expect(clearHeaded.effects[0].type).toBe('remove-status-by-tag');
    expect(clearHeaded.effects[0].params.tags).toBe('fear,control');
  });
});
