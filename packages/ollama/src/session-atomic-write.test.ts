// F-3eee19a1: EPERM fallback must not copyFile over dest. Isolated so the
// file-wide vi.mock of rename cannot change session.test.ts's other cases.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PathLike } from 'node:fs';

const renameControl = vi.hoisted(() => ({
  mode: 'passthrough' as 'passthrough' | 'eperm-first' | 'eperm-interrupt',
  dest: '',
}));

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  const eperm = (path: string): NodeJS.ErrnoException =>
    Object.assign(new Error(`EPERM: ${path}`), { code: 'EPERM' });
  return {
    ...actual,
    copyFile: async (src: PathLike, dest: PathLike, ...rest: unknown[]) => {
      if (renameControl.mode !== 'passthrough' && String(dest) === renameControl.dest) {
        throw new Error('copyFile over dest is forbidden (F-3eee19a1)');
      }
      return (actual.copyFile as (...a: unknown[]) => Promise<unknown>)(src, dest, ...rest);
    },
    rename: async (from: PathLike, to: PathLike, ...rest: unknown[]) => {
      const fromStr = String(from);
      const toStr = String(to);
      const dest = renameControl.dest;
      if (renameControl.mode !== 'passthrough' && dest) {
        if (toStr === dest) {
          try {
            await actual.access(toStr);
            throw eperm(toStr);
          } catch (err) {
            if ((err as NodeJS.ErrnoException | null)?.code === 'EPERM') throw err;
          }
        }
        if (renameControl.mode === 'eperm-interrupt' && fromStr === dest) {
          throw eperm(fromStr);
        }
      }
      return (actual.rename as (...a: unknown[]) => Promise<unknown>)(from, to, ...rest);
    },
  };
});

describe('atomic session writes (F-3eee19a1)', () => {
  let tempDir: string;
  let saveSession: typeof import('./session.js').saveSession;
  let createSession: typeof import('./session.js').createSession;
  let addThemes: typeof import('./session.js').addThemes;
  let switchSession: typeof import('./session.js').switchSession;
  let resumeNamedSession: typeof import('./session.js').resumeNamedSession;
  let endSession: typeof import('./session.js').endSession;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'session-atomic-'));
    renameControl.mode = 'passthrough';
    renameControl.dest = '';
    const session = await import('./session.js');
    saveSession = session.saveSession;
    createSession = session.createSession;
    addThemes = session.addThemes;
    switchSession = session.switchSession;
    resumeNamedSession = session.resumeNamedSession;
    endSession = session.endSession;
  });

  afterEach(async () => {
    renameControl.mode = 'passthrough';
    renameControl.dest = '';
    await rm(tempDir, { recursive: true, force: true });
  });

  function activePath(): string {
    return join(tempDir, '.ai-session.json');
  }

  it('EPERM fallback interrupted leaves dest bytes unchanged', async () => {
    const s = createSession('harbor');
    addThemes(s, ['keep-me']);
    await saveSession(tempDir, s);
    const dest = activePath();
    const original = await readFile(dest, 'utf-8');

    renameControl.dest = dest;
    renameControl.mode = 'eperm-interrupt';

    const next = createSession('harbor');
    addThemes(next, ['clobber-me']);
    await expect(saveSession(tempDir, next)).rejects.toMatchObject({ code: 'EPERM' });
    expect(await readFile(dest, 'utf-8')).toBe(original);
  });

  it('EPERM fallback does not copyFile over dest and still replaces once dest is moved aside', async () => {
    const s = createSession('harbor');
    addThemes(s, ['old-theme']);
    await saveSession(tempDir, s);
    const dest = activePath();

    renameControl.dest = dest;
    renameControl.mode = 'eperm-first';

    const next = createSession('harbor');
    addThemes(next, ['new-theme']);
    await saveSession(tempDir, next);
    expect(JSON.parse(await readFile(dest, 'utf-8')).themes).toEqual(['new-theme']);
  });

  it('switchSession EPERM interrupt leaves dest bytes unchanged', async () => {
    const harbor = createSession('harbor');
    addThemes(harbor, ['salt-road']);
    await saveSession(tempDir, harbor);
    const underdark = createSession('underdark');
    addThemes(underdark, ['mycelium']);
    await saveSession(tempDir, underdark);
    const dest = activePath();
    const original = await readFile(dest, 'utf-8');

    renameControl.dest = dest;
    renameControl.mode = 'eperm-interrupt';

    await expect(switchSession(tempDir, 'harbor')).rejects.toMatchObject({ code: 'EPERM' });
    expect(await readFile(dest, 'utf-8')).toBe(original);
  });

  it('resumeNamedSession EPERM interrupt leaves dest bytes unchanged', async () => {
    const s = createSession('harbor');
    addThemes(s, ['salt']);
    await saveSession(tempDir, s);
    await endSession(tempDir);

    const dest = activePath();
    // endSession unlinked the active file. Seed dest with in-flight crash-copy
    // bytes so resume cannot truncate them if the fallback is interrupted.
    const crashCopy = `${JSON.stringify({ ...s, themes: ['in-flight-crash-copy'] }, null, 2)}\n`;
    const { writeFile } = await import('node:fs/promises');
    await writeFile(dest, crashCopy, 'utf-8');

    renameControl.dest = dest;
    renameControl.mode = 'eperm-interrupt';

    await expect(resumeNamedSession(tempDir, 'harbor')).rejects.toMatchObject({ code: 'EPERM' });
    expect(await readFile(dest, 'utf-8')).toBe(crashCopy);
  });
});
