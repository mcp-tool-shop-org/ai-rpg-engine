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

  // PC-4: the silent-clobber case goes loud. Two structurally-valid entities
  // (or zones) sharing an id previously produced ok:true from loadContent, and
  // the second silently overwrote the first at WorldStore.addEntity/addZone.
  it('pc4-005: duplicate entity ids fail loadContent with a structured error (was: silent clobber)', () => {
    const r = loadContent({
      entities: [
        { id: 'pilgrim', type: 'npc', name: 'Suspicious Pilgrim' },
        { id: 'pilgrim', type: 'npc', name: 'Pasted Pilgrim' },
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes('duplicate entity id "pilgrim"'))).toBe(true);
    expect(r.summary).toContain('duplicate entity id');
  });

  it('pc4-006: duplicate zone ids fail loadContent with a structured error', () => {
    const r = loadContent({
      zones: [
        { id: 'chapel-nave', name: 'Chapel Nave' },
        { id: 'chapel-nave', name: 'Chapel Nave (copy)' },
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes('duplicate zone id "chapel-nave"'))).toBe(true);
  });

  it('summary includes error details when invalid', () => {
    const r = loadContent({
      zones: [{ id: 'a', name: 'A', neighbors: ['nowhere'] }],
    });
    expect(r.ok).toBe(false);
    expect(r.summary).toContain('errors');
    expect(r.summary).toContain('nowhere');
  });

  // CA-02: guard the boundary. A malformed pack must fail with a structured error
  // naming the offending field — never silently return ok:true and never throw a raw
  // TypeError on a null element.

  it('rejects null as a content pack with a structured error', () => {
    const r = loadContent(null as any);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.path === 'pack')).toBe(true);
  });

  it('rejects a non-object content pack (string)', () => {
    const r = loadContent('not-a-pack' as any);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.path === 'pack')).toBe(true);
  });

  it('rejects a content pack that is an array', () => {
    const r = loadContent([] as any);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.path === 'pack')).toBe(true);
  });

  it('rejects entities that is not an array (naming the field)', () => {
    const r = loadContent({ entities: 'nope' } as any);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.path === 'pack.entities')).toBe(true);
  });

  it('rejects zones that is not an array (naming the field)', () => {
    const r = loadContent({ zones: 42 } as any);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.path === 'pack.zones')).toBe(true);
  });

  it('does not throw on a null element in entities — reports it structurally', () => {
    let r!: ReturnType<typeof loadContent>;
    expect(() => {
      r = loadContent({ entities: [null] } as any);
    }).not.toThrow();
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.path.includes('entities'))).toBe(true);
  });

  it('does not throw on a null element in zones — reports it structurally', () => {
    let r!: ReturnType<typeof loadContent>;
    expect(() => {
      r = loadContent({ zones: [null] } as any);
    }).not.toThrow();
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.path.includes('zones'))).toBe(true);
  });
});
