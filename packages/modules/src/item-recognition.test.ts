import { describe, it, expect } from 'vitest';
import {
  evaluateItemRecognition,
  recognitionProbability,
} from './item-recognition.js';
import type { ItemDefinition, ItemChronicleEntry } from '@ai-rpg-engine/equipment';

const baseItem: ItemDefinition = {
  id: 'test-sword',
  name: 'Test Sword',
  description: 'A test sword.',
  slot: 'weapon',
  rarity: 'common',
};

describe('recognitionProbability', () => {
  it('returns base probability with zero inputs', () => {
    expect(recognitionProbability(0, 0)).toBeCloseTo(0.3);
  });

  it('increases with perception clarity', () => {
    expect(recognitionProbability(1, 0)).toBeCloseTo(0.6);
  });

  it('increases with notoriety', () => {
    expect(recognitionProbability(0, 1)).toBeCloseTo(0.7);
  });

  it('caps at 1.0', () => {
    expect(recognitionProbability(1, 1)).toBe(1);
  });
});

describe('evaluateItemRecognition', () => {
  it('returns empty for items without provenance', () => {
    const results = evaluateItemRecognition([baseItem], 'guild', {}, 1);
    expect(results).toEqual([]);
  });

  it('detects faction item — positive match', () => {
    const item: ItemDefinition = {
      ...baseItem,
      provenance: { factionId: 'iron-wardens' },
    };
    const results = evaluateItemRecognition([item], 'iron-wardens', {}, 1);
    expect(results).toHaveLength(1);
    expect(results[0].recognitionType).toBe('faction-item');
    expect(results[0].stanceDelta).toBe(5);
    expect(results[0].rumorClaim).toBeUndefined();
  });

  it('detects faction item — suspicious (stolen flag)', () => {
    const item: ItemDefinition = {
      ...baseItem,
      provenance: { factionId: 'iron-wardens', flags: ['stolen'] },
    };
    const results = evaluateItemRecognition([item], 'iron-wardens', {}, 1);
    expect(results).toHaveLength(1);
    expect(results[0].recognitionType).toBe('faction-item');
    expect(results[0].stanceDelta).toBe(-10);
    expect(results[0].rumorClaim).toBeDefined();
  });

  it('does not match faction when NPC is different faction', () => {
    const item: ItemDefinition = {
      ...baseItem,
      provenance: { factionId: 'iron-wardens' },
    };
    const results = evaluateItemRecognition([item], 'merchants-guild', {}, 1);
    // No faction match, no flags, not notorious → empty
    expect(results).toEqual([]);
  });

  it('detects stolen item', () => {
    const item: ItemDefinition = {
      ...baseItem,
      provenance: { flags: ['stolen'] },
    };
    const results = evaluateItemRecognition([item], 'guild', {}, 1);
    expect(results).toHaveLength(1);
    expect(results[0].recognitionType).toBe('stolen-item');
    expect(results[0].stanceDelta).toBe(-5);
    expect(results[0].rumorClaim).toContain('stolen');
  });

  it('detects cursed item', () => {
    const item: ItemDefinition = {
      ...baseItem,
      provenance: { flags: ['cursed'] },
    };
    const results = evaluateItemRecognition([item], 'guild', {}, 1);
    expect(results).toHaveLength(1);
    expect(results[0].recognitionType).toBe('cursed-item');
    expect(results[0].stanceDelta).toBe(-3);
    expect(results[0].rumorClaim).toContain('cursed');
  });

  it('detects trophy item', () => {
    const item: ItemDefinition = {
      ...baseItem,
      provenance: { flags: ['trophy'] },
    };
    const results = evaluateItemRecognition([item], 'guild', {}, 1);
    expect(results).toHaveLength(1);
    expect(results[0].recognitionType).toBe('trophy-item');
    expect(results[0].stanceDelta).toBe(3);
  });

  it('detects notorious item (high chronicle)', () => {
    const item: ItemDefinition = {
      ...baseItem,
      rarity: 'rare',
      provenance: { factionId: 'guild' }, // factionId adds 0.1 + rare 0.3 = 0.4 base
    };
    // rare (0.3) + factionId (0.1) = 0.4 base
    // kills cap at 0.25, recognitions cap at 0.15 → need both to push > 0.7
    const chronicle: Record<string, ItemChronicleEntry[]> = {
      'test-sword': [
        { event: 'used-in-kill', tick: 1, detail: 'k1' },
        { event: 'used-in-kill', tick: 2, detail: 'k2' },
        { event: 'used-in-kill', tick: 3, detail: 'k3' },
        { event: 'used-in-kill', tick: 4, detail: 'k4' },
        { event: 'used-in-kill', tick: 5, detail: 'k5' },
        { event: 'recognized', tick: 6, detail: 'r1' },
        { event: 'recognized', tick: 7, detail: 'r2' },
      ],
    };
    // NPC faction doesn't match item faction, so no faction recognition
    const results = evaluateItemRecognition([item], 'other-faction', chronicle, 1);
    expect(results).toHaveLength(1);
    expect(results[0].recognitionType).toBe('notorious-item');
    expect(results[0].rumorClaim).toContain('legendary');
  });

  it('skips blessed/heirloom flags (no negative reaction)', () => {
    const item: ItemDefinition = {
      ...baseItem,
      provenance: { flags: ['blessed', 'heirloom'] },
    };
    const results = evaluateItemRecognition([item], 'guild', {}, 1);
    // blessed and heirloom don't trigger flag recognition
    expect(results).toEqual([]);
  });

  it('handles multiple items', () => {
    const items: ItemDefinition[] = [
      { ...baseItem, id: 'sword-1', name: 'Stolen Blade', provenance: { flags: ['stolen'] } },
      { ...baseItem, id: 'ring-1', name: 'Cursed Ring', slot: 'accessory', provenance: { flags: ['cursed'] } },
    ];
    const results = evaluateItemRecognition(items, 'guild', {}, 1);
    expect(results).toHaveLength(2);
    expect(results[0].itemId).toBe('sword-1');
    expect(results[1].itemId).toBe('ring-1');
  });

  it('only produces one recognition per item', () => {
    const item: ItemDefinition = {
      ...baseItem,
      provenance: { flags: ['stolen', 'cursed', 'trophy'] },
    };
    const results = evaluateItemRecognition([item], 'guild', {}, 1);
    // Should pick the first matching flag (stolen) and stop
    expect(results).toHaveLength(1);
  });
});
