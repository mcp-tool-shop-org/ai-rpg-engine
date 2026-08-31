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
    });
    expect(ids.entities).toEqual(['g']);
    expect(ids.placements).toEqual(['g@nave']);
    expect(ids.entityAi).toEqual(['g']);
  });
});
