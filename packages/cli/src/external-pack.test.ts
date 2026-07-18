// F1e — `run <path>`: load a scaffolded game module and run it through the
// same loop as the bundled starters. Contract violations produce structured,
// actionable errors — never a raw import stack.

import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadExternalPack,
  resolveExternalEntry,
  validatePackModule,
  PackLoadError,
} from './external-pack.js';
import { runNpcTurns } from './turns.js';
import { evaluateSessionEnd } from './endgame.js';
import { handlePlayerInput } from './bin.js';

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../test-fixtures');
const MINI_PACK_DIR = path.join(FIXTURES, 'mini-pack');

describe('resolveExternalEntry (F1e)', () => {
  it('a directory resolves through package.json main', () => {
    expect(resolveExternalEntry(MINI_PACK_DIR)).toBe(path.join(MINI_PACK_DIR, 'index.mjs'));
  });

  it('a direct file path is used as-is', () => {
    const file = path.join(MINI_PACK_DIR, 'index.mjs');
    expect(resolveExternalEntry(file)).toBe(file);
  });

  it('a directory without package.json main falls back to dist/index.js', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-rpg-extpack-'));
    try {
      fs.mkdirSync(path.join(tmp, 'dist'), { recursive: true });
      fs.writeFileSync(path.join(tmp, 'dist', 'index.js'), 'export const x = 1;', 'utf-8');
      expect(resolveExternalEntry(tmp)).toBe(path.join(tmp, 'dist', 'index.js'));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('a missing path is a structured PACK_PATH_NOT_FOUND', () => {
    try {
      resolveExternalEntry(path.join(MINI_PACK_DIR, 'no-such-place'));
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(PackLoadError);
      expect((err as PackLoadError).code).toBe('PACK_PATH_NOT_FOUND');
      expect((err as PackLoadError).hint).toContain('createGame');
    }
  });

  it('a TypeScript source file tells the author to build first', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-rpg-extpack-ts-'));
    try {
      const tsFile = path.join(tmp, 'index.ts');
      fs.writeFileSync(tsFile, 'export const x = 1;', 'utf-8');
      try {
        resolveExternalEntry(tsFile);
        expect.unreachable('should have thrown');
      } catch (err) {
        expect((err as PackLoadError).code).toBe('PACK_NOT_BUILT');
        expect((err as PackLoadError).hint).toContain('tsc');
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('an unbuildable directory lists what it tried', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-rpg-extpack-empty-'));
    try {
      resolveExternalEntry(tmp);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as PackLoadError).code).toBe('PACK_ENTRY_NOT_FOUND');
      expect((err as PackLoadError).message).toContain('dist');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('validatePackModule (F1e)', () => {
  const goodModule = {
    createGame: () => ({}) as never,
    packMeta: { id: 'x', name: 'X' },
    someRuleset: { id: 'r', verbs: [] },
  };

  it('accepts the contract and picks the *Ruleset export', () => {
    const pack = validatePackModule(goodModule as never, 'test');
    expect(pack.meta.id).toBe('x');
    expect(pack.ruleset).toBe(goodModule.someRuleset);
  });

  it('accepts manifest {id,title} in place of packMeta', () => {
    const pack = validatePackModule(
      { createGame: () => ({}), manifest: { id: 'm', title: 'Manifested' } } as never,
      'test',
    );
    expect(pack.meta).toEqual({ id: 'm', name: 'Manifested', tagline: '' });
  });

  it('missing createGame AND identity produces one error naming both', () => {
    try {
      validatePackModule({ somethingElse: 42 } as never, 'not-a-pack.mjs');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(PackLoadError);
      const e = err as PackLoadError;
      expect(e.code).toBe('PACK_CONTRACT_INVALID');
      expect(e.message).toContain('createGame');
      expect(e.message).toContain('packMeta');
      expect(e.hint).toContain('create-starter');
    }
  });

  it('an exact `ruleset` export wins over *Ruleset scanning', () => {
    const exact = { id: 'exact', verbs: [] };
    const pack = validatePackModule(
      { ...goodModule, ruleset: exact } as never,
      'test',
    );
    expect(pack.ruleset).toBe(exact);
  });
});

describe('loadExternalPack (F1e) — the full path', () => {
  it('loads the fixture pack and the game is PLAYABLE through the shared loop pieces', async () => {
    const pack = await loadExternalPack(MINI_PACK_DIR);
    expect(pack.meta.id).toBe('mini-quest');
    expect(pack.meta.name).toBe('Mini Quest');
    expect(pack.ruleset?.id).toBe('mini');
    expect(pack.buildCatalog).toBeUndefined(); // template-shaped packs skip character creation

    const engine = pack.createGame(7);

    // Player attacks the boss through the same input router the loop uses…
    const result = handlePlayerInput(engine, 'attack warden', { ruleset: pack.ruleset, log: vi.fn() });
    expect(result.kind).toBe('action');
    expect(engine.world.entities['warden'].resources.hp).toBe(2);

    // …the NPC turn driver makes the warden hit back…
    const turns = runNpcTurns(engine, { log: vi.fn() });
    expect(turns.map((t) => t.actorId)).toEqual(['warden']);
    expect(engine.world.entities['player'].resources.hp).toBe(8);

    // …and the endgame detector ends the session when the boss falls.
    handlePlayerInput(engine, 'attack warden', { ruleset: pack.ruleset, log: vi.fn() });
    expect(engine.world.entities['warden'].resources.hp).toBe(0);
    const end = evaluateSessionEnd(engine);
    expect(end?.kind).toBe('victory');
  });

  it('a module that is not a pack fails with the contract spelled out', async () => {
    await expect(loadExternalPack(path.join(FIXTURES, 'not-a-pack.mjs'))).rejects.toMatchObject({
      code: 'PACK_CONTRACT_INVALID',
    });
  });

  it('a file that fails to import is PACK_IMPORT_FAILED, not a raw stack', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-rpg-extpack-broken-'));
    try {
      const broken = path.join(tmp, 'broken.mjs');
      fs.writeFileSync(broken, 'import "nonexistent-module-xyz";\nexport const x = 1;', 'utf-8');
      await expect(loadExternalPack(broken)).rejects.toMatchObject({
        code: 'PACK_IMPORT_FAILED',
      });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
