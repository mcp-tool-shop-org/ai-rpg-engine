// tag-taxonomy contract tests (PM-2 coverage + PM-3 lint wiring)
//
// Pins the classification table, the entity/zone validators, and the
// world-level aggregate `validateWorldTags` — the content-load lint that makes
// a tag typo (`role:brut`) loud instead of a silent roleless no-op.

import { describe, it, expect } from 'vitest';
import {
  TAG_CATEGORIES,
  classifyTag,
  validateEntityTags,
  validateZoneTags,
  validateWorldTags,
} from './tag-taxonomy.js';
import { BUILTIN_COMBAT_ROLES } from './combat-roles.js';
import { BUILTIN_PACK_BIASES } from './combat-intent.js';

describe('classifyTag', () => {
  it('classifies prefixed tags by prefix', () => {
    expect(classifyTag('role:brute')).toBe('role');
    expect(classifyTag('role:anything-even-unknown')).toBe('role');
    expect(classifyTag('companion:fighter')).toBe('companion');
  });

  it('classifies known unprefixed tags into their category', () => {
    expect(classifyTag('bodyguard')).toBe('engagement');
    expect(classifyTag('ranged')).toBe('engagement');
    expect(classifyTag('caster')).toBe('engagement');
    expect(classifyTag('undead')).toBe('pack-bias');
    expect(classifyTag('chokepoint')).toBe('zone');
    expect(classifyTag('poison')).toBe('status');
  });

  it('falls back to custom for unknown tags', () => {
    expect(classifyTag('human')).toBe('custom');
    expect(classifyTag('commander')).toBe('custom');
    expect(classifyTag('')).toBe('custom');
  });

  it('taxonomy examples cover every built-in combat role tag (no false-positive lint)', () => {
    const roleExamples = TAG_CATEGORIES.find((c) => c.category === 'role')!.examples;
    for (const template of Object.values(BUILTIN_COMBAT_ROLES)) {
      expect(roleExamples).toContain(`role:${template.role}`);
    }
  });

  it('taxonomy examples cover every built-in pack bias tag', () => {
    const packExamples = TAG_CATEGORIES.find((c) => c.category === 'pack-bias')!.examples;
    for (const bias of BUILTIN_PACK_BIASES) {
      expect(packExamples).toContain(bias.tag);
    }
  });
});

describe('validateEntityTags', () => {
  it('returns no warnings for clean canonical tags', () => {
    expect(validateEntityTags(['role:brute', 'undead', 'human'])).toEqual([]);
  });

  it('surfaces a role typo like role:brut (PM-3 silent no-op made loud)', () => {
    const warnings = validateEntityTags(['role:brut']);
    expect(warnings.length).toBe(1);
    expect(warnings[0].tag).toBe('role:brut');
    expect(warnings[0].message).toContain('Unknown role:*');
    expect(warnings[0].message).toContain('role:brute'); // suggests the known set
  });

  it('does NOT flag role:minion (built-in role, aligned with BUILTIN_COMBAT_ROLES)', () => {
    expect(validateEntityTags(['role:minion'])).toEqual([]);
  });

  it('warns on multiple role tags (only the first is used)', () => {
    const warnings = validateEntityTags(['role:brute', 'role:boss']);
    expect(warnings.some((w) => w.severity === 'warn' && w.message.includes('Multiple role tags'))).toBe(true);
  });

  it('warns on the bodyguard + role:backliner contradiction', () => {
    const warnings = validateEntityTags(['bodyguard', 'role:backliner']);
    expect(warnings.some((w) => w.message.includes('contradict'))).toBe(true);
  });

  it('ignores unprefixed unknown tags (author freedom for custom tags)', () => {
    expect(validateEntityTags(['weird-custom-tag', 'another_one'])).toEqual([]);
  });
});

describe('validateZoneTags', () => {
  it('returns no warnings for zone-level tags', () => {
    expect(validateZoneTags(['chokepoint', 'ambush_entry', 'safe'])).toEqual([]);
  });

  it('warns when a zone carries entity-level role/companion tags', () => {
    const warnings = validateZoneTags(['role:brute', 'companion:healer']);
    expect(warnings.length).toBe(2);
    expect(warnings.every((w) => w.severity === 'warn')).toBe(true);
    expect(warnings[0].message).toContain('belong on entities');
  });
});

describe('validateWorldTags (content-load lint — PM-3)', () => {
  const world = {
    entities: {
      'guard-2': { tags: ['role:brut'] },             // typo — must be surfaced
      'guard-1': { tags: ['role:brute', 'undead'] },  // clean
      'boss': { tags: ['role:boss', 'role:elite'] },  // multi-role — warn
    },
    zones: {
      'gate': { tags: ['chokepoint'] },               // clean
      'barracks': { tags: ['role:brute'] },           // entity tag on a zone — warn
    },
  };

  it('surfaces a bad entity tag with its owner id', () => {
    const warnings = validateWorldTags(world);
    const typo = warnings.find((w) => w.tag === 'role:brut');
    expect(typo).toBeDefined();
    expect(typo!.scope).toBe('entity');
    expect(typo!.ownerId).toBe('guard-2');
    expect(typo!.message).toContain('Unknown role:*');
  });

  it('surfaces zone-level violations with the zone id', () => {
    const warnings = validateWorldTags(world);
    const zoneWarn = warnings.find((w) => w.scope === 'zone');
    expect(zoneWarn).toBeDefined();
    expect(zoneWarn!.ownerId).toBe('barracks');
  });

  it('returns warnings in a total stable order (entities by id, then zones by id)', () => {
    const a = validateWorldTags(world);
    const b = validateWorldTags(world);
    expect(a).toEqual(b);
    // 'boss' sorts before 'guard-2'; entity warnings precede zone warnings.
    expect(a.map((w) => w.ownerId)).toEqual(['boss', 'guard-2', 'barracks']);
  });

  it('returns [] for a clean world', () => {
    expect(validateWorldTags({
      entities: { hero: { tags: ['role:brute', 'human'] } },
      zones: { start: { tags: ['safe'] } },
    })).toEqual([]);
  });
});
