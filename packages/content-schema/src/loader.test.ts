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

  // F-b6ded9eb: abilities/statuses/verbs were unwalked, so a null element
  // survived loadContent as ok:true then TypeError'd in validateGameContent.
  it('does not throw on a null element in abilities — reports it structurally', () => {
    let r!: ReturnType<typeof loadContent>;
    expect(() => {
      r = loadContent({ abilities: [null] } as any);
    }).not.toThrow();
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.path.includes('abilities'))).toBe(true);
  });

  it('does not throw on a null element in statuses — reports it structurally', () => {
    let r!: ReturnType<typeof loadContent>;
    expect(() => {
      r = loadContent({ statuses: [null] } as any);
    }).not.toThrow();
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.path.includes('statuses'))).toBe(true);
  });

  it('does not throw on a null element in verbs — reports it structurally', () => {
    let r!: ReturnType<typeof loadContent>;
    expect(() => {
      r = loadContent({ verbs: [null] } as any);
    }).not.toThrow();
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.path.includes('verbs'))).toBe(true);
  });

  // F-6fbd6e71: districts were an unvalidated collection; a null element or a
  // record missing id/name/zoneIds/tags must fail structurally, not green.
  it('does not throw on a null element in districts — reports it structurally', () => {
    let r!: ReturnType<typeof loadContent>;
    expect(() => {
      r = loadContent({ districts: [null] } as any);
    }).not.toThrow();
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.path.includes('districts'))).toBe(true);
  });

  it('rejects a district missing zoneIds', () => {
    const r = loadContent({
      districts: [{ id: 'd', name: 'D', tags: [] } as any],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.path.includes('zoneIds'))).toBe(true);
  });

  it('F-9c5db864: duplicate ability ids fail loadContent with a unique-id error', () => {
    const ability = { id: 'slash', name: 'Slash', verb: 'attack', tags: [], effects: [], target: { type: 'single' as const } };
    const r = loadContent({ abilities: [ability, { ...ability }] });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes('duplicate ability id "slash"') && e.message.includes('unique'))).toBe(true);
  });

  it('F-9c5db864: duplicate status ids fail loadContent with a unique-id error', () => {
    const status = { id: 'burn', name: 'Burn', tags: ['fire'], stacking: 'replace' as const };
    const r = loadContent({ statuses: [status, { ...status }] });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes('duplicate status id "burn"') && e.message.includes('unique'))).toBe(true);
  });

  it('F-da9018b8: summary names present REFS_ITERATED_KEYS collections after the four cores', () => {
    const r = loadContent({
      entities: [{ id: 'p', type: 'player', name: 'P' }],
      zones: [{ id: 'z', name: 'Z' }],
      hazardDefinitions: [{ id: 'fire', effects: [], trigger: 'enter' }],
      districts: [{ id: 'd', name: 'D', zoneIds: ['z'], tags: [] }],
      items: [{ id: 'rope' }],
    } as any);
    expect(r.ok).toBe(true);
    expect(r.summary).toContain('1 entities');
    expect(r.summary).toContain('1 zones');
    expect(r.summary).toContain('0 dialogues');
    expect(r.summary).toContain('0 quests');
    expect(r.summary).toContain('1 hazardDefinitions');
    expect(r.summary).toContain('1 districts');
    expect(r.summary).toContain('1 items');
    expect(r.summary.indexOf('entities')).toBeLessThan(r.summary.indexOf('hazardDefinitions'));
  });

  it('F-da9018b8: absent extra collections are omitted from the summary', () => {
    const r = loadContent({ entities: [{ id: 'p', type: 'player', name: 'P' }] });
    expect(r.summary).toContain('1 entities');
    expect(r.summary).not.toContain('hazardDefinitions');
    expect(r.summary).not.toContain('abilities');
  });

  it('F-8ff6c29c: JSON 1e1000 cooldown fails loadContent, not ok:true', () => {
    const parsed = JSON.parse(
      '{"abilities":[{"id":"slash","name":"Slash","verb":"attack","tags":[],"effects":[],"cooldown":1e1000}]}',
    );
    const r = loadContent(parsed);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.path.includes('cooldown') && e.message.includes('finite'))).toBe(true);
  });

  it('F-b6a8aa78: a hazard with non-array effects fails loadContent', () => {
    const r = loadContent({
      hazardDefinitions: [{ trigger: 'whenever', effects: 'nope' }] as any,
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.path.includes('hazardDefinitions') && e.path.includes('effects'))).toBe(true);
  });

  it('F-b6a8aa78: items:[{id:1}] fails loadContent', () => {
    const r = loadContent({ items: [{ id: 1 }] as any });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.path.includes('items') && e.path.includes('id'))).toBe(true);
  });

  it('F-b6a8aa78: a null item element is a structured error, not ok:true', () => {
    let r!: ReturnType<typeof loadContent>;
    expect(() => {
      r = loadContent({ items: [null] as any });
    }).not.toThrow();
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.path.includes('items'))).toBe(true);
  });

  it('F-b6a8aa78: duplicate hazard ids fail loadContent', () => {
    const h = { id: 'fire', trigger: 'on-enter', effects: [] };
    const r = loadContent({ hazardDefinitions: [h, { ...h }] });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes('duplicate hazard id "fire"'))).toBe(true);
  });

  it('F-53fd73dc: pack.ruleset is validated and binds ability costs to declared resources', () => {
    const r = loadContent({
      ruleset: {
        id: 'test',
        name: 'Test',
        version: '1.0.0',
        stats: [{ id: 'might', name: 'Might', default: 1 }],
        resources: [{ id: 'mana', name: 'Mana', default: 5 }],
        verbs: [{ id: 'cast', name: 'Cast' }],
        formulas: [],
        defaultModules: [],
        progressionModels: [],
      },
      abilities: [{
        id: 'bolt',
        name: 'Bolt',
        verb: 'cast',
        tags: [],
        target: { type: 'single' },
        costs: [{ resourceId: 'ghost-mana', amount: 1 }],
        effects: [{ type: 'damage', params: { amount: 1 } }],
      }],
    } as ContentPack);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes('ghost-mana') || e.path.includes('resource'))).toBe(true);
  });

  it('F-53fd73dc: overlay packs without a ruleset still load (key is optional)', () => {
    const r = loadContent({
      entities: [{ id: 'p', type: 'player', name: 'P' }],
    });
    expect(r.ok).toBe(true);
  });

  it('F-0987c369: overlay packs without ruleProfiles still load (key is optional)', () => {
    const r = loadContent({
      entities: [{ id: 'p', type: 'player', name: 'P', ruleProfileId: 'healer' }],
    });
    expect(r.ok).toBe(true);
  });

  it('F-0987c369: pack.ruleProfiles entries are shape-checked', () => {
    const r = loadContent({
      ruleProfiles: {
        healer: { statMapping: { attack: 'will' } },
      },
    } as ContentPack);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.path.includes('precision') || e.path.includes('statMapping'))).toBe(true);
  });
});
