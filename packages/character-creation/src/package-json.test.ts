// F-c6c02a60: the npm listing description must use a real em dash (U+2014),
// never the Windows-1252 mojibake sequence C3 A2 E2 82 AC.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const EXPECTED_DESCRIPTION =
  'Headless character creation system \u2014 archetypes, backgrounds, traits, multiclassing, and build validation for AI RPG Engine';

describe('character-creation package.json description (F-c6c02a60)', () => {
  it('uses a real UTF-8 em dash and the pinned listing string', () => {
    const raw = readFileSync(join(pkgRoot, 'package.json'));
    const desc = (JSON.parse(raw.toString('utf8')) as { description: string }).description;
    expect(desc).toBe(EXPECTED_DESCRIPTION);
    expect(Buffer.from(desc, 'utf8').includes(Buffer.from([0xe2, 0x80, 0x94]))).toBe(true);
    expect(raw.includes(Buffer.from([0xc3, 0xa2, 0xe2, 0x82, 0xac]))).toBe(false);
  });
});
