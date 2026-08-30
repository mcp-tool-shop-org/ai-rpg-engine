import { describe, it, expect } from 'vitest';
import { validateRefs, validateGameContent } from './refs.js';
import type { ContentPack } from './refs.js';
import * as fantasy from '../../starter-fantasy/src/content.js';
import * as cyberpunk from '../../starter-cyberpunk/src/content.js';
import * as detective from '../../starter-detective/src/content.js';
import * as pirate from '../../starter-pirate/src/content.js';
import * as zombie from '../../starter-zombie/src/content.js';
import * as weirdWest from '../../starter-weird-west/src/content.js';
import * as colony from '../../starter-colony/src/content.js';
import * as vampire from '../../starter-vampire/src/content.js';
import * as gladiator from '../../starter-gladiator/src/content.js';
import * as ronin from '../../starter-ronin/src/content.js';
import * as merchant from '../../starter-merchant/src/content.js';
import * as bountyHunter from '../../starter-bounty-hunter/src/content.js';

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

  // PC-4: a copy-pasted entity/zone with an unrenamed id used to pass validation
  // clean (the ref Sets silently dedup), then silently clobber at
  // WorldStore.addEntity/addZone — one authored thing missing from the shipped
  // game with zero diagnostic. Dedup was already enforced for statuses, verbs,
  // abilities, and per-entity inventory; entities/zones were the gap.
  it('pc4-001: catches duplicate entity ids', () => {
    const r = validateRefs({
      entities: [
        { id: 'goblin', type: 'enemy', name: 'Goblin' },
        { id: 'goblin', type: 'enemy', name: 'Goblin Copy' },
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes('duplicate entity id "goblin"'))).toBe(true);
  });

  it('pc4-002: catches duplicate zone ids', () => {
    const r = validateRefs({
      zones: [
        { id: 'town', name: 'Town' },
        { id: 'town', name: 'Second Town' },
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes('duplicate zone id "town"'))).toBe(true);
  });

  it('pc4-003: a triple-duplicate reports one error per extra copy (deterministic count)', () => {
    const r = validateRefs({
      entities: [
        { id: 'mob', type: 'enemy', name: 'A' },
        { id: 'mob', type: 'enemy', name: 'B' },
        { id: 'mob', type: 'enemy', name: 'C' },
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.filter((e) => e.message.includes('duplicate entity id "mob"'))).toHaveLength(2);
  });

  it('pc4-004: unique entity/zone ids produce no duplicate errors (control)', () => {
    const r = validateRefs(validPack);
    expect(r.ok).toBe(true);
    expect(r.errors.some((e) => e.message.includes('duplicate'))).toBe(false);
  });

  it('F-9c5db864: duplicate hazard ids fail with a unique-id error naming the field', () => {
    const r = validateRefs({
      hazardDefinitions: [
        { id: 'fire', effects: [], trigger: 'enter' },
        { id: 'fire', effects: [], trigger: 'enter' },
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes('duplicate hazard id "fire"') && e.message.includes('unique'))).toBe(true);
  });

  it('F-9c5db864: duplicate district ids fail with a unique-id error naming the field', () => {
    const r = validateRefs({
      districts: [
        { id: 'docks', name: 'Docks', zoneIds: [], tags: [] },
        { id: 'docks', name: 'Docks copy', zoneIds: [], tags: [] },
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes('duplicate district id "docks"') && e.message.includes('rename'))).toBe(true);
  });

  it('F-9c5db864: duplicate quest ids fail with a unique-id error naming the field', () => {
    const r = validateRefs({
      quests: [
        { id: 'rescue', name: 'A', stages: [] },
        { id: 'rescue', name: 'B', stages: [] },
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes('duplicate quest id "rescue"'))).toBe(true);
  });

  it('F-9c5db864: duplicate dialogue ids fail with a unique-id error naming the field', () => {
    const r = validateRefs({
      dialogues: [
        { id: 'talk', speakers: [], entryNodeId: 's', nodes: {} },
        { id: 'talk', speakers: [], entryNodeId: 's', nodes: {} },
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes('duplicate dialogue id "talk"'))).toBe(true);
  });

  it('F-9c5db864: duplicate item ids fail with a unique-id error naming the field', () => {
    const r = validateRefs({
      items: [{ id: 'rope' }, { id: 'rope' }],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes('duplicate item id "rope"'))).toBe(true);
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

  // CA-01: a one-way passage is a legitimate design choice (a ledge you drop off,
  // a collapsing bridge). It must NOT force ok:false — it is an advisory, not an error.
  it('one-way neighbor asymmetry passes with an advisory, not an error', () => {
    const r = validateRefs({
      zones: [
        { id: 'a', name: 'A', neighbors: ['b'] },
        { id: 'b', name: 'B', neighbors: [] },
      ],
    });
    // Valid map: ok stays true.
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
    // The asymmetry surfaces as an actionable advisory.
    expect(
      r.advisories.some((a) => a.message.includes('not vice versa') && a.message.includes("'b'")),
    ).toBe(true);
  });

  it('symmetric neighbors produce no advisory', () => {
    const r = validateRefs({
      zones: [
        { id: 'a', name: 'A', neighbors: ['b'] },
        { id: 'b', name: 'B', neighbors: ['a'] },
      ],
    });
    expect(r.ok).toBe(true);
    expect(r.advisories).toHaveLength(0);
  });

  it('a genuine unknown-zone neighbor is still an error (not just an advisory)', () => {
    const r = validateRefs({
      zones: [{ id: 'a', name: 'A', neighbors: ['nonexistent'] }],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes('unknown zone "nonexistent"'))).toBe(true);
  });

  it('passes with empty pack', () => {
    const r = validateRefs({});
    expect(r.ok).toBe(true);
    expect(r.advisories).toHaveLength(0);
  });
});

describe('validateGameContent', () => {
  // CA-05: tie entity-referenced ability/status/verb/item ids to the registries that
  // define them, so a misspelled id is caught at validation time, not silently at runtime.

  it('reports a dangling startingStatus reference', () => {
    const r = validateGameContent(
      {
        entities: [
          { id: 'goblin', type: 'enemy', name: 'Goblin', startingStatuses: ['enraged', 'bleeding'] },
        ],
      },
      { statusIds: ['enraged'] }, // 'bleeding' is not defined anywhere
    );
    expect(r.ok).toBe(false);
    expect(
      r.errors.some(
        (e) => e.message.includes('"bleeding"') && e.message.includes('status'),
      ),
    ).toBe(true);
    // The valid one is not flagged.
    expect(r.errors.some((e) => e.message.includes('"enraged"'))).toBe(false);
  });

  it('reports a dangling inventory item reference', () => {
    const r = validateGameContent(
      {
        entities: [{ id: 'p', type: 'player', name: 'P', inventory: ['rusty-key'] }],
      },
      { itemIds: ['torch'] },
    );
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes('"rusty-key"') && e.message.includes('item'))).toBe(true);
  });

  // F-703048a5: the item-registry check originally covered only entity
  // inventory/equipment (above). The same "typo'd itemId ships silently" bug class
  // recurs on three more itemId-shaped surfaces — chargen startingInventory kits,
  // bespoke item-use-effect ids, and quest item rewards. Each gets a RED (dangling
  // ref) / GREEN (clean, control) pair below, fixture-only per the content-validator
  // domain contract — no starter content is imported.

  it('reports a dangling archetype startingInventory item reference', () => {
    const r = validateGameContent(
      // Mirrors the real fantasy-starter shape: an archetype's startingInventory
      // names an item ('torch') that is not defined anywhere in the item registry.
      { archetypes: [{ id: 'gravewalker', startingInventory: ['torch'] }] },
      { itemIds: ['sword'] },
    );
    expect(r.ok).toBe(false);
    expect(
      r.errors.some(
        (e) =>
          e.message.includes('"torch"') &&
          e.message.includes('item') &&
          e.path.includes('archetype(gravewalker).startingInventory'),
      ),
    ).toBe(true);
  });

  it('a clean archetype startingInventory passes (control)', () => {
    const r = validateGameContent(
      { archetypes: [{ id: 'gravewalker', startingInventory: ['torch'] }] },
      { itemIds: ['torch'] },
    );
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('reports a dangling background startingInventory item reference', () => {
    const r = validateGameContent(
      { backgrounds: [{ id: 'oath-breaker', startingInventory: ['rusty-key'] }] },
      { itemIds: ['torch'] },
    );
    expect(r.ok).toBe(false);
    expect(
      r.errors.some(
        (e) => e.message.includes('"rusty-key"') && e.path.includes('background(oath-breaker).startingInventory'),
      ),
    ).toBe(true);
  });

  it('a clean background startingInventory passes (control)', () => {
    const r = validateGameContent(
      { backgrounds: [{ id: 'oath-breaker', startingInventory: ['torch'] }] },
      { itemIds: ['torch'] },
    );
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('reports a dangling item-use-effect itemId reference', () => {
    const r = validateGameContent(
      { itemUseEffects: [{ itemId: 'healing-salve' }] },
      { itemIds: ['torch'] },
    );
    expect(r.ok).toBe(false);
    expect(
      r.errors.some((e) => e.message.includes('"healing-salve"') && e.path.includes('itemUseEffect[0].itemId')),
    ).toBe(true);
  });

  it('a clean item-use-effect itemId passes (control)', () => {
    const r = validateGameContent(
      { itemUseEffects: [{ itemId: 'torch' }] },
      { itemIds: ['torch'] },
    );
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('reports a dangling quest item-reward reference', () => {
    const r = validateGameContent(
      {
        quests: [
          {
            id: 'find-torch',
            name: 'Find the Torch',
            stages: [{ id: 's1', name: 'Search' }],
            rewards: [{ type: 'item', params: { itemId: 'ancient-relic' } }],
          },
        ],
      },
      { itemIds: ['torch'] },
    );
    expect(r.ok).toBe(false);
    expect(
      r.errors.some(
        (e) => e.message.includes('"ancient-relic"') && e.path.includes('quest(find-torch).rewards[0].params.itemId'),
      ),
    ).toBe(true);
  });

  it('a clean quest item-reward passes (control)', () => {
    const r = validateGameContent(
      {
        quests: [
          {
            id: 'find-torch',
            name: 'Find the Torch',
            stages: [{ id: 's1', name: 'Search' }],
            rewards: [{ type: 'item', params: { itemId: 'torch' } }],
          },
        ],
      },
      { itemIds: ['torch'] },
    );
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('does not flag non-item quest rewards even when the item registry is present', () => {
    // A gold/xp reward has no itemId at all — must not be misread as a dangling item ref.
    const r = validateGameContent(
      {
        quests: [
          {
            id: 'q1',
            name: 'Q',
            stages: [{ id: 's1', name: 'S' }],
            rewards: [{ type: 'gold', params: { amount: 50 } }],
          },
        ],
      },
      { itemIds: ['torch'] },
    );
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('skips all new item-reference surfaces uniformly when no item registry is available (warn-and-degrade)', () => {
    const r = validateGameContent({
      archetypes: [{ id: 'a1', startingInventory: ['mystery-torch'] }],
      backgrounds: [{ id: 'b1', startingInventory: ['mystery-cloak'] }],
      itemUseEffects: [{ itemId: 'mystery-potion' }],
      quests: [
        {
          id: 'q1',
          name: 'Q',
          stages: [{ id: 's1', name: 'S' }],
          rewards: [{ type: 'item', params: { itemId: 'mystery-relic' } }],
        },
      ],
    });
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('does not throw on a null element inside the new item-reference collections', () => {
    // Unlike the pre-existing null-element test below, this one supplies an item
    // registry so itemReg is truthy and every new loop actually executes its guard.
    expect(() =>
      validateGameContent(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { archetypes: [null], backgrounds: [null], itemUseEffects: [null], quests: [null] } as any,
        { itemIds: ['torch'] },
      ),
    ).not.toThrow();
  });

  // Non-vacuity: a validator that can never fire is worse than none. Prove the gate
  // is RED-capable by taking one clean, multi-surface fixture through both states —
  // passing as authored, then failing after a single-field mutation that reproduces
  // the real fantasy-starter 'torch' bug shape (a typo'd startingInventory id).
  it('non-vacuity: a passing multi-surface fixture goes RED when one startingInventory id is mutated to a typo', () => {
    const itemIds = ['torch', 'sword', 'healing-salve', 'ancient-relic'];
    const cleanPack: ContentPack = {
      archetypes: [{ id: 'gravewalker', startingInventory: ['torch'] }],
      backgrounds: [{ id: 'oath-breaker', startingInventory: ['sword'] }],
      itemUseEffects: [{ itemId: 'healing-salve' }],
      quests: [
        {
          id: 'find-torch',
          name: 'Find the Torch',
          stages: [{ id: 's1', name: 'Search' }],
          rewards: [{ type: 'item', params: { itemId: 'ancient-relic' } }],
        },
      ],
    };

    const clean = validateGameContent(cleanPack, { itemIds });
    expect(clean.ok).toBe(true);
    expect(clean.errors).toHaveLength(0);

    const mutated: ContentPack = {
      ...cleanPack,
      archetypes: [{ id: 'gravewalker', startingInventory: ['torch-typo'] }],
    };
    const broken = validateGameContent(mutated, { itemIds });
    expect(broken.ok).toBe(false);
    expect(
      broken.errors.some(
        (e) => e.message.includes('"torch-typo"') && e.path.includes('archetype(gravewalker).startingInventory'),
      ),
    ).toBe(true);
    // Only the mutated surface fires — the other three untouched surfaces stay clean.
    expect(broken.errors).toHaveLength(1);
  });

  it('reports an ability verb not in the verb registry', () => {
    const r = validateGameContent(
      {
        abilities: [
          { id: 'fb', name: 'Fireball', verb: 'incinerate', tags: [], target: { type: 'single' }, effects: [] },
        ],
      },
      { verbIds: ['cast', 'attack'] },
    );
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes('"incinerate"') && e.message.includes('verb'))).toBe(true);
  });

  it('reports an apply-status effect referencing an unknown status', () => {
    const r = validateGameContent(
      {
        abilities: [
          {
            id: 'curse',
            name: 'Curse',
            verb: 'cast',
            tags: [],
            target: { type: 'single' },
            effects: [{ type: 'apply-status', params: { statusId: 'doomed' } }],
          },
        ],
      },
      { statusIds: ['burning'], verbIds: ['cast'] },
    );
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes('"doomed"') && e.message.includes('status'))).toBe(true);
  });

  it('builds registries from the pack itself when none are supplied', () => {
    // statuses + verbs defined inside the pack should satisfy references — no error.
    const r = validateGameContent({
      statuses: [{ id: 'burning', name: 'Burning', tags: [], stacking: 'refresh' }],
      verbs: [{ id: 'cast' }],
      entities: [{ id: 'mob', type: 'enemy', name: 'Mob', startingStatuses: ['burning'] }],
      abilities: [
        {
          id: 'fb',
          name: 'Fireball',
          verb: 'cast',
          tags: [],
          target: { type: 'single' },
          effects: [{ type: 'apply-status', params: { statusId: 'burning' } }],
        },
      ],
    });
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('skips a category of checks when neither pack-defined nor a registry is supplied', () => {
    // No status registry and no statuses in pack → startingStatuses cannot be cross-checked,
    // so we do NOT invent errors. (Warn-and-degrade: surface only what we can verify.)
    const r = validateGameContent({
      entities: [{ id: 'mob', type: 'enemy', name: 'Mob', startingStatuses: ['mystery'] }],
    });
    expect(r.ok).toBe(true);
  });

  it('still runs structural ref validation (unknown zone neighbor)', () => {
    const r = validateGameContent({
      zones: [{ id: 'a', name: 'A', neighbors: ['ghost'] }],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes('unknown zone "ghost"'))).toBe(true);
  });

  it('surfaces one-way neighbor asymmetry as an advisory, not an error', () => {
    const r = validateGameContent({
      zones: [
        { id: 'a', name: 'A', neighbors: ['b'] },
        { id: 'b', name: 'B', neighbors: [] },
      ],
    });
    expect(r.ok).toBe(true);
    expect(r.advisories.some((a) => a.message.includes('not vice versa'))).toBe(true);
  });

  // Boundary: public validators must DEGRADE on malformed input, never raw-throw.
  it('returns a structured error (no throw) for a non-object pack', () => {
    for (const bad of [null, undefined, 'pack', 42, []]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = validateGameContent(bad as any);
      expect(r.ok).toBe(false);
      expect(r.errors.some((e) => e.path === 'pack')).toBe(true);
    }
  });

  it('does not throw on a null element inside a collection', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => validateGameContent({ entities: [null], zones: [null] } as any)).not.toThrow();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => validateRefs({ dialogues: [null], quests: [null] } as any)).not.toThrow();
  });

  // F-b6ded9eb: validateGameContent built registries with `.map((s) => s.id)`
  // on abilities/statuses/verbs. A null element TypeError'd. Filter isRecord
  // (and optional-chain .id) the same way validateRefs and pack.items already do.
  it('does not throw on abilities:[null] / statuses:[null] / verbs:[null]', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => validateGameContent({ abilities: [null] } as any)).not.toThrow();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => validateGameContent({ statuses: [null] } as any)).not.toThrow();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => validateGameContent({ verbs: [null] } as any)).not.toThrow();
  });

  it('derives the item registry from pack.items when no explicit itemIds are supplied', () => {
    const r = validateGameContent({
      items: [{ id: 'chapel-lantern' }],
      entities: [{ id: 'p', type: 'player', name: 'P', inventory: ['torch'] }],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes('"torch"') && e.path.includes('inventory'))).toBe(true);
  });

  it('a pack.items catalog that covers inventory stays green (control)', () => {
    const r = validateGameContent({
      items: [{ id: 'chapel-lantern' }],
      entities: [{ id: 'p', type: 'player', name: 'P', inventory: ['chapel-lantern'] }],
    });
    expect(r.ok).toBe(true);
  });

  it('walks buildCatalog archetypes/backgrounds startingInventory against pack.items', () => {
    const r = validateGameContent({
      items: [{ id: 'chapel-lantern' }],
      buildCatalog: {
        archetypes: [{ id: 'gravewalker', startingInventory: ['torch'] }],
        backgrounds: [{ id: 'oath-breaker', startingInventory: ['chapel-lantern'] }],
      },
    });
    expect(r.ok).toBe(false);
    expect(
      r.errors.some(
        (e) => e.message.includes('"torch"') && e.path.includes('archetype(gravewalker).startingInventory'),
      ),
    ).toBe(true);
    expect(r.errors.some((e) => e.path.includes('background(oath-breaker)'))).toBe(false);
  });

  it('errors when apply-status is missing duration against a timed status definition', () => {
    const r = validateGameContent({
      statuses: [{ id: 'on-the-scent', name: 'On the Scent', tags: ['buff'], stacking: 'replace', duration: { type: 'ticks', value: 3 } }],
      abilities: [
        {
          id: 'read-the-board',
          name: 'Read the Board',
          verb: 'use-ability',
          tags: [],
          target: { type: 'self' },
          effects: [{ type: 'apply-status', target: 'actor', params: { statusId: 'on-the-scent' } }],
        },
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.path.includes('params.duration') && e.message.includes('on-the-scent'))).toBe(true);
  });

  it('apply-status with duration matching a timed definition is green (control)', () => {
    const r = validateGameContent({
      statuses: [{ id: 'on-the-scent', name: 'On the Scent', tags: ['buff'], stacking: 'replace', duration: { type: 'ticks', value: 3 } }],
      abilities: [
        {
          id: 'read-the-board',
          name: 'Read the Board',
          verb: 'use-ability',
          tags: [],
          target: { type: 'self' },
          effects: [{ type: 'apply-status', target: 'actor', params: { statusId: 'on-the-scent', duration: 3 } }],
        },
      ],
    });
    expect(r.ok).toBe(true);
  });
});

describe('validateRefs hazardRefs', () => {
  it('errors when a hazardRef names no hazardDefinitions id', () => {
    const r = validateRefs({
      zones: [{ id: 'void', name: 'Void', hazardRefs: ['hazard-void-drop'] }],
      hazardDefinitions: [{ id: 'hazard-other', effects: [], trigger: 'enter' }],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes('hazard-void-drop') && e.path.includes('hazardRefs'))).toBe(true);
  });

  it('a resolving hazardRef is green (control)', () => {
    const r = validateRefs({
      zones: [{ id: 'void', name: 'Void', hazardRefs: ['hazard-void-drop'] }],
      hazardDefinitions: [{ id: 'hazard-void-drop', effects: [], trigger: 'enter' }],
    });
    expect(r.ok).toBe(true);
  });

  it('does not treat a string hazardRefs as ids (shape is validateZoneDefinition\'s job)', () => {
    const r = validateRefs({
      zones: [{ id: 'void', name: 'Void', hazardRefs: 'hazard-void-drop' as unknown as string[] }],
      hazardDefinitions: [{ id: 'hazard-void-drop', effects: [], trigger: 'enter' }],
    });
    expect(r.ok).toBe(true);
  });
});

describe('validateRefs districts', () => {
  it('errors when a district zoneId names no pack.zones id', () => {
    const r = validateRefs({
      zones: [{ id: 'town', name: 'Town' }],
      districts: [{ id: 'd1', name: 'D', zoneIds: ['ghost'], tags: [] }],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes('ghost') && e.path.includes('district'))).toBe(true);
  });

  it('errors when two districts claim the same zone (last-wins at intake)', () => {
    const r = validateRefs({
      zones: [{ id: 'town', name: 'Town' }],
      districts: [
        { id: 'alpha', name: 'Alpha', zoneIds: ['town'], tags: [] },
        { id: 'beta', name: 'Beta', zoneIds: ['town'], tags: [] },
      ],
    });
    expect(r.ok).toBe(false);
    expect(
      r.errors.some(
        (e) => e.message.includes('town') && e.message.includes('already claimed'),
      ),
    ).toBe(true);
  });

  it('a resolving district zoneId is green (control)', () => {
    const r = validateRefs({
      zones: [{ id: 'town', name: 'Town' }],
      districts: [{ id: 'd1', name: 'D', zoneIds: ['town'], tags: [] }],
    });
    expect(r.ok).toBe(true);
  });

  it("the 12 starters' district zoneIds resolve", () => {
    const starters: Array<{ name: string; zones: { id: string; name?: string }[]; districts: ContentPack['districts'] }> = [
      { name: 'fantasy', zones: fantasy.zones, districts: fantasy.districts },
      { name: 'cyberpunk', zones: cyberpunk.zones, districts: cyberpunk.districts },
      { name: 'detective', zones: detective.zones, districts: detective.districts },
      { name: 'pirate', zones: pirate.zones, districts: pirate.districts },
      { name: 'zombie', zones: zombie.zones, districts: zombie.districts },
      { name: 'weird-west', zones: weirdWest.zones, districts: weirdWest.districts },
      { name: 'colony', zones: colony.zones, districts: colony.districts },
      { name: 'vampire', zones: vampire.zones, districts: vampire.districts },
      { name: 'gladiator', zones: gladiator.zones, districts: gladiator.districts },
      { name: 'ronin', zones: ronin.zones, districts: ronin.districts },
      { name: 'merchant', zones: merchant.zones, districts: merchant.districts },
      { name: 'hue-and-cry', zones: bountyHunter.zones, districts: bountyHunter.districts },
    ];
    expect(starters).toHaveLength(12);
    for (const pack of starters) {
      const r = validateRefs({
        zones: pack.zones.map((z) => ({ id: z.id, name: z.name ?? z.id })),
        districts: pack.districts,
      });
      expect(r.ok, pack.name).toBe(true);
    }
  });
});
