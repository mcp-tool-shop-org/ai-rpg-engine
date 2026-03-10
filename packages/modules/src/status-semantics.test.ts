// status-semantics tests — registry, resistance checking, vocabulary
// Proves: registration, lookup, tag retrieval, resistance priority, duration adjustment

import { describe, it, expect, beforeEach } from 'vitest';
import type { StatusDefinition } from '@ai-rpg-engine/content-schema';
import type { EntityState } from '@ai-rpg-engine/core';
import {
  STATUS_SEMANTIC_TAGS,
  isKnownStatusTag,
  registerStatusDefinitions,
  getStatusDefinition,
  getStatusTags,
  getRegisteredStatusIds,
  clearStatusRegistry,
  checkResistance,
  applyResistanceToDuration,
} from './status-semantics.js';

// --- Fixtures ---

const mesmerizedDef: StatusDefinition = {
  id: 'mesmerized',
  name: 'Mesmerized',
  tags: ['control', 'supernatural', 'debuff'],
  stacking: 'replace',
  duration: { type: 'ticks', value: 3 },
  ui: { icon: '🌀', description: 'Mind controlled' },
};

const terrifiedDef: StatusDefinition = {
  id: 'terrified',
  name: 'Terrified',
  tags: ['fear', 'supernatural', 'debuff'],
  stacking: 'replace',
  duration: { type: 'ticks', value: 2 },
  ui: { icon: '😱', description: 'Overcome with terror' },
};

const holyFireDef: StatusDefinition = {
  id: 'holy-fire',
  name: 'Holy Fire',
  tags: ['holy', 'debuff'],
  stacking: 'replace',
  duration: { type: 'ticks', value: 3 },
};

function makeEntity(overrides?: Partial<EntityState>): EntityState {
  return {
    id: 'test-entity',
    blueprintId: 'test',
    type: 'enemy',
    name: 'Test Entity',
    tags: ['enemy'],
    stats: { presence: 5, vitality: 5, cunning: 5 },
    resources: { hp: 20, stamina: 5 },
    statuses: [],
    ...overrides,
  };
}

// --- Tests ---

beforeEach(() => {
  clearStatusRegistry();
});

describe('STATUS_SEMANTIC_TAGS vocabulary', () => {
  it('contains all expected tags', () => {
    const expected = ['buff', 'debuff', 'fear', 'control', 'blind', 'stance', 'holy', 'breach', 'poison', 'supernatural', 'wound'];
    for (const tag of expected) {
      expect(STATUS_SEMANTIC_TAGS).toContain(tag);
    }
  });

  it('has exactly 11 tags', () => {
    expect(STATUS_SEMANTIC_TAGS).toHaveLength(11);
  });
});

describe('isKnownStatusTag', () => {
  it('returns true for known tags', () => {
    expect(isKnownStatusTag('fear')).toBe(true);
    expect(isKnownStatusTag('control')).toBe(true);
    expect(isKnownStatusTag('debuff')).toBe(true);
  });

  it('returns false for unknown tags', () => {
    expect(isKnownStatusTag('fireball')).toBe(false);
    expect(isKnownStatusTag('')).toBe(false);
  });
});

describe('registerStatusDefinitions + getStatusDefinition', () => {
  it('registers and retrieves definitions', () => {
    registerStatusDefinitions([mesmerizedDef, terrifiedDef]);
    expect(getStatusDefinition('mesmerized')).toBe(mesmerizedDef);
    expect(getStatusDefinition('terrified')).toBe(terrifiedDef);
  });

  it('returns undefined for unregistered status', () => {
    expect(getStatusDefinition('nonexistent')).toBeUndefined();
  });

  it('overwrites on re-registration', () => {
    registerStatusDefinitions([mesmerizedDef]);
    const updated = { ...mesmerizedDef, name: 'Updated Mesmerize' };
    registerStatusDefinitions([updated]);
    expect(getStatusDefinition('mesmerized')!.name).toBe('Updated Mesmerize');
  });

  it('getRegisteredStatusIds returns all IDs', () => {
    registerStatusDefinitions([mesmerizedDef, terrifiedDef, holyFireDef]);
    const ids = getRegisteredStatusIds();
    expect(ids).toHaveLength(3);
    expect(ids).toContain('mesmerized');
    expect(ids).toContain('terrified');
    expect(ids).toContain('holy-fire');
  });
});

describe('getStatusTags', () => {
  it('returns tags for registered status', () => {
    registerStatusDefinitions([mesmerizedDef]);
    expect(getStatusTags('mesmerized')).toEqual(['control', 'supernatural', 'debuff']);
  });

  it('returns empty array for unregistered status', () => {
    expect(getStatusTags('unknown')).toEqual([]);
  });
});

describe('checkResistance', () => {
  beforeEach(() => {
    registerStatusDefinitions([mesmerizedDef, terrifiedDef, holyFireDef]);
  });

  it('returns null when entity has no resistances', () => {
    const entity = makeEntity();
    expect(checkResistance(entity, 'mesmerized')).toBeNull();
  });

  it('returns null when entity has resistances but none match status tags', () => {
    const entity = makeEntity({ resistances: { poison: 'immune' } });
    expect(checkResistance(entity, 'mesmerized')).toBeNull();
  });

  it('returns null for unregistered status', () => {
    const entity = makeEntity({ resistances: { control: 'immune' } });
    expect(checkResistance(entity, 'unknown-status')).toBeNull();
  });

  it('returns immune when any tag matches immune', () => {
    const entity = makeEntity({ resistances: { control: 'immune' } });
    expect(checkResistance(entity, 'mesmerized')).toBe('immune');
  });

  it('returns resistant when tag matches resistant', () => {
    const entity = makeEntity({ resistances: { supernatural: 'resistant' } });
    expect(checkResistance(entity, 'mesmerized')).toBe('resistant');
  });

  it('returns vulnerable when tag matches vulnerable', () => {
    const entity = makeEntity({ resistances: { fear: 'vulnerable' } });
    expect(checkResistance(entity, 'terrified')).toBe('vulnerable');
  });

  it('immune takes priority over resistant', () => {
    // mesmerized has tags: control, supernatural, debuff
    const entity = makeEntity({
      resistances: { supernatural: 'resistant', control: 'immune' },
    });
    expect(checkResistance(entity, 'mesmerized')).toBe('immune');
  });

  it('resistant takes priority over vulnerable (defensive bias)', () => {
    // mesmerized has tags: control, supernatural, debuff
    const entity = makeEntity({
      resistances: { supernatural: 'resistant', debuff: 'vulnerable' },
    });
    expect(checkResistance(entity, 'mesmerized')).toBe('resistant');
  });
});

describe('applyResistanceToDuration', () => {
  it('returns original duration for null resistance', () => {
    expect(applyResistanceToDuration(4, null)).toBe(4);
  });

  it('returns undefined for undefined duration (permanent status)', () => {
    expect(applyResistanceToDuration(undefined, 'resistant')).toBeUndefined();
  });

  it('returns 0 for immune', () => {
    expect(applyResistanceToDuration(4, 'immune')).toBe(0);
  });

  it('halves duration for resistant (min 1)', () => {
    expect(applyResistanceToDuration(4, 'resistant')).toBe(2);
    expect(applyResistanceToDuration(3, 'resistant')).toBe(1);
    expect(applyResistanceToDuration(1, 'resistant')).toBe(1);
  });

  it('doubles duration for vulnerable', () => {
    expect(applyResistanceToDuration(3, 'vulnerable')).toBe(6);
    expect(applyResistanceToDuration(1, 'vulnerable')).toBe(2);
  });
});
