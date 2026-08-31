// Deterministic proof of F-bceff599's fix (wave-4, content-packs' filed
// design F-b04d6f1e), independent of the host OS's actual readdir() order.
//
// emit-pack.test.ts's black-box fixture ('resolves a same-id collision by
// sorted path order, independent of write order') already covers this from
// the public API, but on THIS dev machine's filesystem it happens to pass
// even against unfixed code -- Windows/NTFS enumerates directory entries
// alphabetically already, so it cannot by itself prove the fix (verified:
// `readdirSync` on a 2-file temp dir here already returns
// ['a-chapel-order.yaml', 'z-chapel-order.yaml'], sorted, regardless of
// write order). This file mocks readdir to hand back entries in a
// deliberately UNSORTED (reversed) order, independent of whatever the real
// OS does, so the assertion is provably about walkFiles' own sort rather
// than an accident of this machine's filesystem. Isolated in its own file
// (rather than added to emit-pack.test.ts) so the file-wide vi.mock this
// requires cannot change readdir's behavior for that file's other 30+ tests.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  return {
    ...actual,
    // Only readdir is intercepted; every other fs/promises export (used by
    // this file's own beforeEach/afterEach AND by emit-pack.ts's readFile/
    // stat) passes straight through to the real implementation.
    readdir: async (...args: unknown[]) => {
      const entries = await (actual.readdir as (...a: unknown[]) => Promise<unknown>)(...args);
      return Array.isArray(entries) ? [...entries].sort().reverse() : entries;
    },
  };
});

describe('walkFiles sorts its result regardless of readdir order (F-bceff599)', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'emit-pack-order-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('resolves a same-id collision by sorted path order even when readdir hands back reverse order', async () => {
    const { assembleContentPack } = await import('./commands/emit-pack.js');
    await writeFile(join(root, 'a-chapel-order.yaml'), [
      'id: chapel_order',
      'name: Chapel Order (a, sorts first)',
      'members:',
      '  - guard_1',
    ].join('\n'));
    await writeFile(join(root, 'z-chapel-order.yaml'), [
      'id: chapel_order',
      'name: Chapel Order (z, sorts last)',
      'members:',
      '  - guard_2',
    ].join('\n'));

    const result = await assembleContentPack(root);
    // readdir is mocked to hand back entries in reverse-sorted order; if
    // walkFiles trusted that order (the pre-fix bug), 'a' (processed last
    // under the mock) would win. A walk that sorts its own output must
    // still apply 'z' last, since 'z' sorts after 'a' by path.
    expect(result.pack.factions?.chapel_order?.name).toBe('Chapel Order (z, sorts last)');
  });
});
