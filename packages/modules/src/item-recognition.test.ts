import { describe, it, expect } from 'vitest';
import {
  evaluateItemRecognition,
  recognitionProbability,
  shouldRecognize,
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

describe('shouldRecognize (deterministic — MW-3)', () => {
  // World truth is sacred & deterministic: recognition must NOT use Math.random.
  // The caller supplies a seeded roll; recognition fires iff roll < probability.
  it('is deterministic — same inputs always yield the same result', () => {
    // probability for (0.5, 0.5) = 0.3 + 0.15 + 0.2 = 0.65
    for (let i = 0; i < 50; i++) {
      expect(shouldRecognize(0.5, 0.5, 0.1)).toBe(true);
      expect(shouldRecognize(0.5, 0.5, 0.9)).toBe(false);
    }
  });

  it('recognizes when roll is below probability', () => {
    // probability(1, 1) caps at 1.0 → any roll < 1 recognizes
    expect(shouldRecognize(1, 1, 0.99)).toBe(true);
    expect(shouldRecognize(1, 1, 0)).toBe(true);
  });

  it('does not recognize when roll is at or above probability', () => {
    // probability(0, 0) = 0.3
    expect(shouldRecognize(0, 0, 0.3)).toBe(false);
    expect(shouldRecognize(0, 0, 0.5)).toBe(false);
    expect(shouldRecognize(0, 0, 0.29)).toBe(true);
  });

  it('agrees with recognitionProbability twin', () => {
    const clarity = 0.4;
    const notoriety = 0.6;
    const p = recognitionProbability(clarity, notoriety); // 0.3 + 0.12 + 0.24 = 0.66
    expect(shouldRecognize(clarity, notoriety, p - 0.0001)).toBe(true);
    expect(shouldRecognize(clarity, notoriety, p)).toBe(false);
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

// ---------------------------------------------------------------------------
// F-SEED-combat-rolls-seed-blind — the world seed threads into hint selection
// as a PURE hash input. WHICH items are recognized stays rule-driven and
// seed-independent; only the narrator hint stream varies per world seed.
// ---------------------------------------------------------------------------
describe('evaluateItemRecognition — world-seed threading (F-SEED-combat-rolls-seed-blind)', () => {
  const stolenItem: ItemDefinition = {
    ...baseItem,
    provenance: { flags: ['stolen'] },
  };

  it('worldSeed omitted === worldSeed 0 — the legacy tick-only stream is preserved', () => {
    for (let tick = 0; tick <= 50; tick++) {
      expect(evaluateItemRecognition([stolenItem], 'guild', {}, tick)).toEqual(
        evaluateItemRecognition([stolenItem], 'guild', {}, tick, 0),
      );
    }
  });

  it('same worldSeed → identical results (pure, replay-safe)', () => {
    for (const seed of [0, 1, 42, 999_983]) {
      expect(evaluateItemRecognition([stolenItem], 'guild', {}, 3, seed)).toEqual(
        evaluateItemRecognition([stolenItem], 'guild', {}, 3, seed),
      );
    }
  });

  it('different worldSeeds pick different narrator hints at the same tick (seeds 0 vs 1)', () => {
    const [r0] = evaluateItemRecognition([stolenItem], 'guild', {}, 1, 0);
    const [r1] = evaluateItemRecognition([stolenItem], 'guild', {}, 1, 1);
    expect(r0.narratorHint).not.toBe(r1.narratorHint);
    // The seed shifts the HINT only — recognition facts are unchanged.
    expect(r1.recognitionType).toBe(r0.recognitionType);
    expect(r1.stanceDelta).toBe(r0.stanceDelta);
    expect(r1.rumorClaim).toBe(r0.rumorClaim);
  });

  it('recognition facts (which items, type, stance) are seed-independent across a seed sweep', () => {
    const items: ItemDefinition[] = [
      { ...baseItem, id: 'sword-1', name: 'Stolen Blade', provenance: { flags: ['stolen'] } },
      { ...baseItem, id: 'ring-1', name: 'Cursed Ring', slot: 'accessory', provenance: { flags: ['cursed'] } },
      { ...baseItem, id: 'badge-1', name: 'Warden Badge', provenance: { factionId: 'iron-wardens' } },
    ];
    const facts = (seed: number) =>
      evaluateItemRecognition(items, 'iron-wardens', {}, 5, seed).map(
        (r) => `${r.itemId}:${r.recognitionType}:${r.stanceDelta}`,
      );
    const base = facts(0);
    for (const seed of [1, 2, 7, 42, 481_913]) {
      expect(facts(seed)).toEqual(base);
    }
  });

  it('a negative worldSeed still yields a real hint (defensive indexing, no crash)', () => {
    const [r] = evaluateItemRecognition([stolenItem], 'guild', {}, 1, -5);
    expect(typeof r.narratorHint).toBe('string');
    expect(r.narratorHint.length).toBeGreaterThan(0);
  });
});
