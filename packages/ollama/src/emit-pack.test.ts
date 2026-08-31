import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assembleContentPack, classifyDocument, idsFromPack } from './commands/emit-pack.js';
import { parseYamlish } from './validators.js';

describe('classifyDocument', () => {
  it('classifies a room and lifts zone.entities conceptually', () => {
    const yaml = [
      'id: chapel',
      'name: Ruined Chapel',
      'zones:',
      '  - id: nave',
      '    name: Nave',
      '    entities:',
      '      - chapel_guard',
    ].join('\n');
    const doc = classifyDocument(parseYamlish(yaml), 'chapel.yaml');
    expect(doc?.kind).toBe('room');
    expect(doc?.id).toBe('chapel');
  });

  it('classifies an entity blueprint', () => {
    const doc = classifyDocument({ id: 'chapel_guard', type: 'npc', name: 'Chapel Guard' }, 'g.yaml');
    expect(doc?.kind).toBe('entity');
  });

  it('classifies a placement', () => {
    const doc = classifyDocument({ entityId: 'chapel_guard', zoneId: 'nave' }, 'p.yaml');
    expect(doc?.kind).toBe('placement');
  });

  it('classifies an entity AI overlay', () => {
    const doc = classifyDocument({ entityId: 'chapel_guard', profileId: 'sentinel', goals: ['hold'] }, 'ai.yaml');
    expect(doc?.kind).toBe('entityAi');
  });

  it('classifies an encounter anchor (spawn SET)', () => {
    const doc = classifyDocument({
      id: 'nave_ambush',
      zoneId: 'nave',
      encounterType: 'ambush',
      enemyIds: ['ash_ghoul'],
      probability: 0.35,
      cooldownTurns: 4,
      tags: ['undead'],
    }, 'anchor.yaml');
    expect(doc?.kind).toBe('encounter-anchor');
    expect(doc?.id).toBe('nave_ambush');
  });

  it('classifies a progression tree', () => {
    const doc = classifyDocument({
      id: 'combat_mastery',
      name: 'Combat Mastery',
      currency: 'xp',
      nodes: [{ id: 'toughened', name: 'Toughened', cost: 10, effects: [] }],
    }, 'tree.yaml');
    expect(doc?.kind).toBe('progression-tree');
    expect(doc?.id).toBe('combat_mastery');
  });

  // F-8ec253bf: classifyDocument had no branch recognizing a standalone
  // ruleset document — such a file dropped into a project was never picked
  // up by assembleContentPack's walk.
  it('classifies a ruleset', () => {
    const doc = classifyDocument({
      id: 'fantasy-minimal',
      name: 'Fantasy Minimal',
      version: '0.1.0',
      stats: [{ id: 'vigor', name: 'Vigor', default: 5 }],
      resources: [{ id: 'hp', name: 'HP', default: 20 }],
      verbs: [{ id: 'move', name: 'Move' }],
      formulas: [],
      defaultModules: [],
      progressionModels: [],
    }, 'ruleset.yaml');
    expect(doc?.kind).toBe('ruleset');
    expect(doc?.id).toBe('fantasy-minimal');
  });

  // F-0bf295ac: no branch matched a bare PackRuleProfile document
  // ({ statMapping: { attack, precision, resolve } }).
  it('classifies a rule profile', () => {
    const doc = classifyDocument({
      id: 'veteran_soldier',
      statMapping: { attack: 'strength', precision: 'dexterity', resolve: 'willpower' },
    }, 'profile.yaml');
    expect(doc?.kind).toBe('rule-profile');
    expect(doc?.id).toBe('veteran_soldier');
  });

  // F-bd8034ea: the nearest branch (kind 'placement') requires zoneId, so a
  // bare {itemId, entityId} document fell through every check unclassified.
  it('classifies an item placement, disjoint from entity placement', () => {
    const doc = classifyDocument({ itemId: 'rusty_key', entityId: 'chapel_guard' }, 'ip.yaml');
    expect(doc?.kind).toBe('item-placement');
    expect(doc?.id).toBe('rusty_key@chapel_guard');
  });

  it('still classifies an entity placement when zoneId is present', () => {
    const doc = classifyDocument({ entityId: 'chapel_guard', zoneId: 'nave' }, 'p.yaml');
    expect(doc?.kind).toBe('placement');
  });
});

describe('assembleContentPack', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'emit-pack-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('lifts zone.entities into placements and merges entityAi', async () => {
    await writeFile(join(root, 'chapel.yaml'), [
      'id: chapel',
      'name: Ruined Chapel',
      'zones:',
      '  - id: nave',
      '    name: Nave',
      '    entities:',
      '      - chapel_guard',
    ].join('\n'));
    await writeFile(join(root, 'chapel_guard.yaml'), 'id: chapel_guard\ntype: npc\nname: Chapel Guard\n');
    await writeFile(join(root, 'guard.ai.yaml'), [
      'entityId: chapel_guard',
      'profileId: sentinel',
      'goals:',
      '  - hold_the_gate',
      'alertLevel: 0.3',
    ].join('\n'));

    const result = await assembleContentPack(root);
    expect(result.pack.zones?.some((z) => z.id === 'nave')).toBe(true);
    expect(result.pack.entities?.some((e) => e.id === 'chapel_guard')).toBe(true);
    expect(result.pack.placements).toEqual(
      expect.arrayContaining([expect.objectContaining({ entityId: 'chapel_guard', zoneId: 'nave' })]),
    );
    expect(result.pack.entityAi?.chapel_guard).toEqual(
      expect.objectContaining({ profileId: 'sentinel' }),
    );
    expect(result.load.ok).toBe(true);
  });

  it('loadContent fails closed on a pack missing required entity fields', async () => {
    await writeFile(join(root, 'broken.yaml'), 'id: nope\nname: Nope\n');
    const result = await assembleContentPack(root);
    // A name+id with no type is not an entity; empty pack is structurally ok.
    expect(result.pack.entities ?? []).toEqual([]);
  });

  it('idsFromPack extracts bucket ids', () => {
    const ids = idsFromPack({
      entities: [{ id: 'g', type: 'npc', name: 'G' }],
      placements: [{ entityId: 'g', zoneId: 'nave' }],
      entityAi: { g: { profileId: 'sentinel' } },
      encounterAnchors: [{
        id: 'nave_ambush', zoneId: 'nave', encounterType: 'ambush',
        enemyIds: ['g'], probability: 0.3, cooldownTurns: 2, tags: ['undead'],
      }],
      progressionTrees: [{ id: 'combat_mastery', name: 'Combat Mastery', currency: 'xp', nodes: [] }],
    });
    expect(ids.entities).toEqual(['g']);
    expect(ids.placements).toEqual(['g@nave']);
    expect(ids.entityAi).toEqual(['g']);
    expect(ids.anchors).toEqual(['nave_ambush']);
    expect(ids.trees).toEqual(['combat_mastery']);
  });

  // F-0bf295ac / F-bd8034ea: idsFromPack had no ruleProfiles/itemPlacements bucket.
  it('idsFromPack extracts ruleProfiles and itemPlacements buckets', () => {
    const ids = idsFromPack({
      ruleProfiles: { veteran_soldier: { statMapping: { attack: 'strength', precision: 'dexterity', resolve: 'willpower' } } },
      itemPlacements: [{ itemId: 'rusty_key', entityId: 'chapel_guard' }],
    });
    expect(ids.ruleProfiles).toEqual(['veteran_soldier']);
    expect(ids.itemPlacements).toEqual(['rusty_key@chapel_guard']);
  });

  it('keeps encounterAnchors, progressionTrees, and meta when walking pack JSON', async () => {
    await writeFile(join(root, 'content.json'), JSON.stringify({
      schemaVersion: '1',
      meta: { id: 'chapel-threshold', name: 'The Chapel Threshold', tagline: 'JSON content pack' },
      manifest: { id: 'chapel-threshold', title: 'The Chapel Threshold', version: '1.0.0', engineVersion: '>=1', ruleset: 'fantasy', modules: [], contentPacks: [] },
      ruleset: { id: 'fantasy', name: 'Fantasy' },
      entities: [{ id: 'chapel_guard', type: 'npc', name: 'Chapel Guard' }],
      zones: [{ id: 'nave', name: 'Nave' }],
      encounterAnchors: [{
        id: 'nave_ambush', zoneId: 'nave', encounterType: 'ambush',
        enemyIds: ['chapel_guard'], probability: 0.4, cooldownTurns: 3, tags: ['undead'],
      }],
      progressionTrees: [{
        id: 'combat_mastery', name: 'Combat Mastery', currency: 'xp',
        nodes: [{ id: 'toughened', name: 'Toughened', cost: 10, effects: [{ type: 'resource-boost', params: { resource: 'hp', amount: 5 } }] }],
      }],
    }));

    const result = await assembleContentPack(root);
    expect(result.pack.encounterAnchors).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'nave_ambush', zoneId: 'nave' })]),
    );
    expect(result.pack.progressionTrees).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'combat_mastery' })]),
    );
    expect(result.pack.meta).toEqual(expect.objectContaining({ id: 'chapel-threshold', name: 'The Chapel Threshold' }));
    expect(result.pack.manifest).toEqual(expect.objectContaining({ id: 'chapel-threshold' }));
    expect(result.pack.ruleset).toEqual(expect.objectContaining({ id: 'fantasy' }));
  });

  it('fills pack.meta from session identity when sources omit it', async () => {
    await writeFile(join(root, 'guard.yaml'), 'id: chapel_guard\ntype: npc\nname: Chapel Guard\n');
    const result = await assembleContentPack(root, {
      session: { name: 'Haunted Chapel', themes: ['gothic', 'undead'] },
    });
    expect(result.pack.meta).toEqual(expect.objectContaining({
      id: 'haunted-chapel',
      name: 'Haunted Chapel',
      tagline: 'Haunted Chapel',
      genres: ['gothic', 'undead'],
    }));
  });

  it('does not invent meta on overlay-only packs with no session', async () => {
    await writeFile(join(root, 'guard.yaml'), 'id: chapel_guard\ntype: npc\nname: Chapel Guard\n');
    const result = await assembleContentPack(root);
    expect(result.pack.meta).toBeUndefined();
  });

  it('lifts an encounter-pack nested anchor into encounterAnchors', async () => {
    await writeFile(join(root, 'ambush.yaml'), [
      'room:',
      '  id: chapel',
      '  name: Chapel',
      '  zones:',
      '    - id: nave',
      '      name: Nave',
      'entities:',
      '  - id: ash_ghoul',
      '    type: enemy',
      '    name: Ash Ghoul',
      'quest:',
      '  id: hush_the_nave',
      '  name: Hush the Nave',
      '  stages:',
      '    - id: enter',
      '      name: Enter',
      'anchor:',
      '  id: nave_ambush',
      '  zoneId: nave',
      '  encounterType: ambush',
      '  enemyIds:',
      '    - ash_ghoul',
      '  probability: 0.4',
      '  cooldownTurns: 3',
      '  tags:',
      '    - undead',
    ].join('\n'));
    const result = await assembleContentPack(root);
    expect(result.pack.encounterAnchors).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'nave_ambush', zoneId: 'nave' })]),
    );
  });

  // F-8ec253bf: walking a standalone ruleset file into pack.ruleset.
  it('walks a standalone ruleset file into pack.ruleset', async () => {
    await writeFile(join(root, 'ruleset.yaml'), [
      'id: fantasy-minimal',
      'name: Fantasy Minimal',
      'version: 0.1.0',
      'stats:',
      '  - id: vigor',
      '    name: Vigor',
      '    default: 5',
      'resources:',
      '  - id: hp',
      '    name: HP',
      '    default: 20',
      'verbs:',
      '  - id: move',
      '    name: Move',
      'formulas:',
      '  - id: hit-chance',
      '    name: Hit Chance',
      '    inputs:',
      '      - attacker.vigor',
      '    output: number',
      'defaultModules:',
      '  - combat-core',
      'progressionModels:',
      '  - linear',
    ].join('\n'));
    const result = await assembleContentPack(root);
    expect(result.pack.ruleset).toEqual(expect.objectContaining({ id: 'fantasy-minimal' }));
  });

  // F-0bf295ac: walking a standalone rule-profile file into pack.ruleProfiles,
  // keyed by the doc's id (with `id` itself stripped from the stored value).
  it('walks a standalone rule-profile file into pack.ruleProfiles', async () => {
    await writeFile(join(root, 'profile.yaml'), [
      'id: veteran_soldier',
      'statMapping:',
      '  attack: strength',
      '  precision: dexterity',
      '  resolve: willpower',
    ].join('\n'));
    const result = await assembleContentPack(root);
    expect(result.pack.ruleProfiles?.veteran_soldier).toEqual({
      statMapping: { attack: 'strength', precision: 'dexterity', resolve: 'willpower' },
    });
  });

  // F-bd8034ea: walking a standalone item-placement file into pack.itemPlacements.
  it('walks a standalone item-placement file into pack.itemPlacements', async () => {
    await writeFile(join(root, 'ip.yaml'), 'itemId: rusty_key\nentityId: chapel_guard\n');
    const result = await assembleContentPack(root);
    expect(result.pack.itemPlacements).toEqual(
      expect.arrayContaining([expect.objectContaining({ itemId: 'rusty_key', entityId: 'chapel_guard' })]),
    );
  });

  it('does not double-classify an item placement as an entity placement', async () => {
    await writeFile(join(root, 'ip.yaml'), 'itemId: rusty_key\nentityId: chapel_guard\n');
    const result = await assembleContentPack(root);
    expect(result.pack.placements ?? []).toEqual([]);
  });

  // mergePackJson: re-walking an existing pack JSON that already carries
  // ruleProfiles/itemPlacements must not silently drop them. (classifyDocument's
  // pack-json detection keys off entities/zones/quests, so a realistic
  // re-emitted pack.json — the actual scenario the finding describes — always
  // carries at least one of those alongside ruleProfiles/itemPlacements.)
  it('merges ruleProfiles and itemPlacements when re-walking pack JSON', async () => {
    await writeFile(join(root, 'content.json'), JSON.stringify({
      schemaVersion: '1',
      entities: [{ id: 'chapel_guard', type: 'npc', name: 'Chapel Guard' }],
      ruleProfiles: { veteran_soldier: { statMapping: { attack: 'strength', precision: 'dexterity', resolve: 'willpower' } } },
      itemPlacements: [{ itemId: 'rusty_key', entityId: 'chapel_guard' }],
    }));
    const result = await assembleContentPack(root);
    expect(result.pack.ruleProfiles?.veteran_soldier).toBeDefined();
    expect(result.pack.itemPlacements).toEqual(
      expect.arrayContaining([expect.objectContaining({ itemId: 'rusty_key', entityId: 'chapel_guard' })]),
    );
  });

  it('dedups itemPlacements on the compound itemId+entityId key when re-walking pack JSON', async () => {
    await writeFile(join(root, 'content.json'), JSON.stringify({
      schemaVersion: '1',
      entities: [{ id: 'chapel_guard', type: 'npc', name: 'Chapel Guard' }],
      itemPlacements: [
        { itemId: 'rusty_key', entityId: 'chapel_guard' },
        { itemId: 'rusty_key', entityId: 'chapel_guard' },
        { itemId: 'rusty_key', entityId: 'sacristan' },
      ],
    }));
    const result = await assembleContentPack(root);
    expect(result.pack.itemPlacements).toHaveLength(2);
  });
});
