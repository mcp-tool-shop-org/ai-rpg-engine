import { describe, it, expect } from 'vitest';
import { validateRefs } from './refs.js';
import type { ContentPack } from './refs.js';

describe('validateRefs', () => {
  const validPack: ContentPack = {
    entities: [
      { id: 'player', type: 'player', name: 'Player' },
      { id: 'goblin', type: 'enemy', name: 'Goblin' },
      { id: 'merchant', type: 'npc', name: 'Merchant' },
    ],
    zones: [
      { id: 'town', name: 'Town', neighbors: ['forest'], entities: ['merchant'] },
      { id: 'forest', name: 'Forest', neighbors: ['town', 'cave'], entities: ['goblin'] },
      { id: 'cave', name: 'Cave', neighbors: ['forest'] },
    ],
    dialogues: [
      {
        id: 'merchant-talk',
        speakers: ['merchant'],
        entryNodeId: 'start',
        nodes: { start: { id: 'start', speaker: 'Merchant', text: 'Hello.' } },
      },
    ],
    quests: [
      {
        id: 'slay-goblin',
        name: 'Slay the Goblin',
        stages: [
          { id: 'find', name: 'Find the goblin', nextStage: 'kill' },
          { id: 'kill', name: 'Kill the goblin' },
        ],
      },
    ],
  };

  it('passes for valid content pack', () => {
    const r = validateRefs(validPack);
    expect(r.ok).toBe(true);
  });

  it('catches unknown zone neighbor', () => {
    const r = validateRefs({
      zones: [{ id: 'a', name: 'A', neighbors: ['nonexistent'] }],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes('unknown zone "nonexistent"'))).toBe(true);
  });

  it('catches unknown exit target', () => {
    const r = validateRefs({
      zones: [{ id: 'a', name: 'A', exits: [{ targetZoneId: 'ghost' }] }],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes('unknown zone "ghost"'))).toBe(true);
  });

  it('catches unknown entity in zone', () => {
    const r = validateRefs({
      entities: [{ id: 'player', type: 'player', name: 'P' }],
      zones: [{ id: 'a', name: 'A', entities: ['player', 'missing'] }],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes('unknown entity "missing"'))).toBe(true);
  });

  it('catches dialogue speaker not in entities', () => {
    const r = validateRefs({
      entities: [{ id: 'player', type: 'player', name: 'P' }],
      dialogues: [
        {
          id: 'd1',
          speakers: ['ghost-npc'],
          entryNodeId: 'start',
          nodes: { start: { id: 'start', speaker: 'Ghost', text: 'Boo.' } },
        },
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes('ghost-npc'))).toBe(true);
  });

  it('catches duplicate inventory items', () => {
    const r = validateRefs({
      entities: [{ id: 'p', type: 'player', name: 'P', inventory: ['sword', 'sword'] }],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes('duplicate item "sword"'))).toBe(true);
  });

  it('catches bad quest stage references', () => {
    const r = validateRefs({
      quests: [
        {
          id: 'q1',
          name: 'Q',
          stages: [{ id: 's1', name: 'S', nextStage: 'missing-stage' }],
        },
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes('unknown stage "missing-stage"'))).toBe(true);
  });

  it('catches one-way neighbor asymmetry', () => {
    const r = validateRefs({
      zones: [
        { id: 'a', name: 'A', neighbors: ['b'] },
        { id: 'b', name: 'B', neighbors: [] },
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes('one-way neighbor'))).toBe(true);
  });

  it('passes with empty pack', () => {
    const r = validateRefs({});
    expect(r.ok).toBe(true);
  });
});
