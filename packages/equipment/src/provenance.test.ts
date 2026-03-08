import { describe, it, expect } from 'vitest';
import {
  normalizeProvenance,
  getItemProvenance,
  hasProvenanceFlag,
  isFactionalItem,
  getItemFaction,
  computeItemNotoriety,
  formatProvenanceForNarrator,
  formatProvenanceForDirector,
} from './provenance.js';
import type { ItemDefinition, ItemChronicleEntry } from './types.js';

const baseItem: ItemDefinition = {
  id: 'test-sword',
  name: 'Test Sword',
  description: 'A test sword.',
  slot: 'weapon',
  rarity: 'common',
};

describe('normalizeProvenance', () => {
  it('returns undefined for undefined', () => {
    expect(normalizeProvenance(undefined)).toBeUndefined();
  });

  it('normalizes string to { lore }', () => {
    expect(normalizeProvenance('Old blacksmith')).toEqual({ lore: 'Old blacksmith' });
  });

  it('passes through structured provenance unchanged', () => {
    const prov = { origin: 'Forge', factionId: 'smiths', flags: ['heirloom' as const] };
    expect(normalizeProvenance(prov)).toBe(prov);
  });
});

describe('getItemProvenance', () => {
  it('returns undefined for items without provenance', () => {
    expect(getItemProvenance(baseItem)).toBeUndefined();
  });

  it('returns normalized provenance', () => {
    const item: ItemDefinition = {
      ...baseItem,
      provenance: { origin: 'Chapel', factionId: 'chapel-order' },
    };
    expect(getItemProvenance(item)).toEqual({ origin: 'Chapel', factionId: 'chapel-order' });
  });
});

describe('hasProvenanceFlag', () => {
  it('returns false for items without provenance', () => {
    expect(hasProvenanceFlag(baseItem, 'cursed')).toBe(false);
  });

  it('returns true when flag is present', () => {
    const item: ItemDefinition = {
      ...baseItem,
      provenance: { flags: ['cursed', 'stolen'] },
    };
    expect(hasProvenanceFlag(item, 'cursed')).toBe(true);
    expect(hasProvenanceFlag(item, 'stolen')).toBe(true);
  });

  it('returns false when flag is absent', () => {
    const item: ItemDefinition = {
      ...baseItem,
      provenance: { flags: ['blessed'] },
    };
    expect(hasProvenanceFlag(item, 'cursed')).toBe(false);
  });
});

describe('isFactionalItem / getItemFaction', () => {
  it('returns false/undefined for non-factional items', () => {
    expect(isFactionalItem(baseItem)).toBe(false);
    expect(getItemFaction(baseItem)).toBeUndefined();
  });

  it('returns true/factionId for factional items', () => {
    const item: ItemDefinition = {
      ...baseItem,
      provenance: { factionId: 'iron-wardens' },
    };
    expect(isFactionalItem(item)).toBe(true);
    expect(getItemFaction(item)).toBe('iron-wardens');
  });
});

describe('computeItemNotoriety', () => {
  it('returns 0 for common items with no provenance or chronicle', () => {
    expect(computeItemNotoriety(baseItem, [])).toBe(0);
  });

  it('accounts for rarity', () => {
    const rare: ItemDefinition = { ...baseItem, rarity: 'rare' };
    expect(computeItemNotoriety(rare, [])).toBeCloseTo(0.3);
  });

  it('accounts for provenance flags', () => {
    const cursed: ItemDefinition = {
      ...baseItem,
      provenance: { flags: ['cursed', 'stolen'] },
    };
    // cursed (0.2) + stolen (0.1) = 0.3
    expect(computeItemNotoriety(cursed, [])).toBeCloseTo(0.3);
  });

  it('accounts for faction association', () => {
    const factional: ItemDefinition = {
      ...baseItem,
      provenance: { factionId: 'guild' },
    };
    expect(computeItemNotoriety(factional, [])).toBeCloseTo(0.1);
  });

  it('accounts for kill chronicle entries', () => {
    const kills: ItemChronicleEntry[] = [
      { event: 'used-in-kill', tick: 1, detail: 'kill 1' },
      { event: 'used-in-kill', tick: 2, detail: 'kill 2' },
      { event: 'used-in-kill', tick: 3, detail: 'kill 3' },
    ];
    // 3 kills × 0.05 = 0.15
    expect(computeItemNotoriety(baseItem, kills)).toBeCloseTo(0.15);
  });

  it('caps at 1.0', () => {
    const legendary: ItemDefinition = {
      ...baseItem,
      rarity: 'legendary',
      provenance: { factionId: 'guild', flags: ['cursed', 'stolen', 'trophy', 'contraband'] },
    };
    const manyKills: ItemChronicleEntry[] = Array.from({ length: 20 }, (_, i) => ({
      event: 'used-in-kill' as const, tick: i, detail: `kill ${i}`,
    }));
    expect(computeItemNotoriety(legendary, manyKills)).toBe(1);
  });
});

describe('formatProvenanceForNarrator', () => {
  it('returns item name for items without provenance', () => {
    expect(formatProvenanceForNarrator(baseItem)).toBe('Test Sword');
  });

  it('includes flags', () => {
    const item: ItemDefinition = {
      ...baseItem,
      provenance: { flags: ['cursed', 'stolen'] },
    };
    expect(formatProvenanceForNarrator(item)).toBe('Test Sword (cursed, stolen)');
  });

  it('includes kill count from chronicle', () => {
    const kills: ItemChronicleEntry[] = [
      { event: 'used-in-kill', tick: 1, detail: 'k1' },
      { event: 'used-in-kill', tick: 2, detail: 'k2' },
    ];
    expect(formatProvenanceForNarrator(baseItem, kills)).toBe('Test Sword 2 kills');
  });
});

describe('formatProvenanceForDirector', () => {
  it('includes all provenance details', () => {
    const item: ItemDefinition = {
      ...baseItem,
      provenance: { origin: 'Old forge', factionId: 'smiths', flags: ['heirloom'], lore: 'Ancient blade' },
    };
    const output = formatProvenanceForDirector(item);
    expect(output).toContain('Origin: Old forge');
    expect(output).toContain('Faction: smiths');
    expect(output).toContain('Flags: heirloom');
    expect(output).toContain('Lore: Ancient blade');
  });

  it('includes chronicle stats', () => {
    const kills: ItemChronicleEntry[] = [
      { event: 'used-in-kill', tick: 1, detail: 'k1' },
      { event: 'recognized', tick: 2, detail: 'r1' },
    ];
    const output = formatProvenanceForDirector(baseItem, kills);
    expect(output).toContain('2 events');
    expect(output).toContain('1 kills');
    expect(output).toContain('1 recognitions');
  });
});
