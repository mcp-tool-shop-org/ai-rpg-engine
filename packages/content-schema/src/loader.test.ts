import { describe, it, expect } from 'vitest';
import { loadContent } from './loader.js';
import type { ContentPack } from './refs.js';

// Fixture: valid chapel-threshold-style content
const chapelPack: ContentPack = {
  entities: [
    { id: 'player', type: 'player', name: 'Wanderer', tags: ['player'], baseStats: { vigor: 5, instinct: 4 }, baseResources: { hp: 20, stamina: 8 } },
    { id: 'pilgrim', type: 'npc', name: 'Suspicious Pilgrim', tags: ['npc'], baseStats: { vigor: 2 } },
    { id: 'ash-ghoul', type: 'enemy', name: 'Ash Ghoul', tags: ['enemy', 'undead'], baseStats: { vigor: 4 }, baseResources: { hp: 12 } },
  ],
  zones: [
    { id: 'chapel-entrance', name: 'Ruined Chapel Entrance', tags: ['interior'], neighbors: ['chapel-nave', 'chapel-alcove'], light: 3 },
    { id: 'chapel-nave', name: 'Chapel Nave', tags: ['interior'], neighbors: ['chapel-entrance', 'vestry-door'], light: 4 },
    { id: 'chapel-alcove', name: 'Shadowed Alcove', tags: ['interior', 'dark'], neighbors: ['chapel-entrance'], light: 1 },
    { id: 'vestry-door', name: 'Vestry Passage', tags: ['interior'], neighbors: ['chapel-nave', 'crypt-chamber'], light: 2 },
    { id: 'crypt-chamber', name: 'Crypt Antechamber', tags: ['interior', 'cursed'], neighbors: ['vestry-door'], light: 1 },
  ],
  dialogues: [
    {
      id: 'pilgrim-talk',
      speakers: ['pilgrim'],
      entryNodeId: 'greeting',
      nodes: {
        greeting: { id: 'greeting', speaker: 'Pilgrim', text: 'You should not be here.', choices: [{ id: 'ask', text: 'Why?', nextNodeId: 'warn' }] },
        warn: { id: 'warn', speaker: 'Pilgrim', text: 'Danger below.' },
      },
    },
  ],
  quests: [],
};

describe('loadContent', () => {
  it('loads valid chapel content', () => {
    const r = loadContent(chapelPack);
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
    expect(r.summary).toContain('3 entities');
    expect(r.summary).toContain('5 zones');
    expect(r.summary).toContain('1 dialogues');
  });

  it('loads empty pack', () => {
    const r = loadContent({});
    expect(r.ok).toBe(true);
    expect(r.summary).toContain('0 entities');
  });

  it('catches schema errors in entities', () => {
    const r = loadContent({
      entities: [{ id: '', type: 'x', name: 'Y' } as any],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.path.includes('id'))).toBe(true);
  });

  it('catches schema errors in zones', () => {
    const r = loadContent({
      zones: [{ id: 'z1' } as any],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.path.includes('name'))).toBe(true);
  });

  it('catches schema + ref errors together', () => {
    const r = loadContent({
      entities: [{ id: 'p', type: 'player', name: 'P' }],
      zones: [
        { id: 'a', name: 'A', neighbors: ['ghost-zone'] },
      ],
      dialogues: [
        {
          id: 'd1',
          speakers: ['missing-npc'],
          entryNodeId: 'start',
          nodes: { start: { id: 'start', speaker: 'X', text: 'Hi.' } },
        },
      ],
    });
    expect(r.ok).toBe(false);
    // ref error: ghost-zone
    expect(r.errors.some((e) => e.message.includes('ghost-zone'))).toBe(true);
    // ref error: missing-npc
    expect(r.errors.some((e) => e.message.includes('missing-npc'))).toBe(true);
  });

  it('summary includes error details when invalid', () => {
    const r = loadContent({
      zones: [{ id: 'a', name: 'A', neighbors: ['nowhere'] }],
    });
    expect(r.ok).toBe(false);
    expect(r.summary).toContain('errors');
    expect(r.summary).toContain('nowhere');
  });
});
