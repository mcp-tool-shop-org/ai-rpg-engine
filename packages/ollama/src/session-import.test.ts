import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSession } from './session.js';
import { extractIdsFromContentTs, importSessionArtifacts } from './session-import.js';

describe('extractIdsFromContentTs', () => {
  it('pulls entity ids out of a TS content export', () => {
    const src = `
      export const pack = {
        entities: [
          { id: 'chapel_guard', type: 'npc', name: 'Guard' },
          { id: 'pilgrim', type: 'npc', name: 'Pilgrim' },
        ],
        quests: [{ id: 'threshold', name: 'The Threshold' }],
      };
    `;
    const ids = extractIdsFromContentTs(src);
    expect(ids.entities).toEqual(['chapel_guard', 'pilgrim']);
    expect(ids.quests).toEqual(['threshold']);
  });
});

describe('importSessionArtifacts', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'session-import-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('imports ids from a conventional content/pack.json', async () => {
    await mkdir(join(root, 'content'), { recursive: true });
    await writeFile(join(root, 'content', 'pack.json'), JSON.stringify({
      entities: [{ id: 'chapel_guard', type: 'npc', name: 'Guard' }],
      quests: [{ id: 'threshold', name: 'The Threshold', stages: [] }],
      archetypes: [{ id: 'warden' }],
      backgrounds: [{ id: 'pilgrim' }],
      buildCatalog: { packId: 'chapel' },
    }));
    const session = createSession('chapel');
    const result = await importSessionArtifacts(root, session);
    expect(result.added).toBeGreaterThan(0);
    expect(result.session.artifacts.entities).toContain('chapel_guard');
    expect(result.session.artifacts.quests).toContain('threshold');
    expect(result.session.artifacts.archetypes).toContain('warden');
    expect(result.session.artifacts.backgrounds).toContain('pilgrim');
    expect(result.session.artifacts.catalogs).toContain('chapel');
    expect(result.session.history.some((e) => e.kind === 'session_imported')).toBe(true);
  });

  it('falls back to a yaml glob when no pack JSON exists', async () => {
    await writeFile(join(root, 'guard.yaml'), 'id: chapel_guard\ntype: npc\nname: Chapel Guard\n');
    await writeFile(join(root, 'nave.yaml'), [
      'id: chapel',
      'name: Chapel',
      'zones:',
      '  - id: nave',
      '    name: Nave',
    ].join('\n'));
    const result = await importSessionArtifacts(root, null);
    expect(result.session.name).toBe('imported');
    expect(result.session.artifacts.entities).toContain('chapel_guard');
    expect(result.session.artifacts.rooms).toContain('chapel');
  });

  // F-0bf295ac / F-bd8034ea family-of-call-sites probe: idsFromDoc is the
  // same doc.kind -> SessionArtifacts-bucket switch shape as emit-pack's
  // idsFromPack, with the same silent-default-drop fallback — a standalone
  // rule-profile/item-placement yaml glob-imported here must not vanish.
  it('imports a standalone rule-profile yaml via the glob fallback', async () => {
    await writeFile(join(root, 'profile.yaml'), [
      'id: veteran_soldier',
      'statMapping:',
      '  attack: strength',
      '  precision: dexterity',
      '  resolve: willpower',
    ].join('\n'));
    const result = await importSessionArtifacts(root, null);
    expect(result.session.artifacts.ruleProfiles).toContain('veteran_soldier');
  });

  it('imports a standalone item-placement yaml via the glob fallback', async () => {
    await writeFile(join(root, 'ip.yaml'), 'itemId: rusty_key\nentityId: chapel_guard\n');
    const result = await importSessionArtifacts(root, null);
    expect(result.session.artifacts.itemPlacements).toContain('rusty_key@chapel_guard');
  });
});
