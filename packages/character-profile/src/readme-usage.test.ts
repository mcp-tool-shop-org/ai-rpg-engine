// F-ca340f5d: README Usage must show getProfileSummary as a display-ready
// print path (humanized ids, injury names with compact penalties).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const README_FILES = [
  'README.md',
  'README.ja.md',
  'README.zh.md',
  'README.es.md',
  'README.fr.md',
  'README.hi.md',
  'README.it.md',
  'README.pt-BR.md',
];

function typescriptFences(readme: string, file: string): string[] {
  const fences = [...readme.matchAll(/```typescript\r?\n([\s\S]*?)```/g)].map(
    (m) => m[1],
  );
  if (fences.length === 0) throw new Error(`${file} has no typescript fence`);
  return fences;
}

describe('character-profile README Usage shows getProfileSummary (F-ca340f5d)', () => {
  it('every README prints a display-ready summary layout', () => {
    for (const file of README_FILES) {
      const fences = typescriptFences(
        readFileSync(join(pkgRoot, file), 'utf8'),
        file,
      );
      const joined = fences.join('\n');
      expect(joined, file).toContain('getProfileSummary');
      expect(joined, file).toContain("summary.archetype === 'Penitent Knight'");
      expect(joined, file).toContain("summary.background === 'Oath Breaker'");
      expect(joined, file).toContain("summary.discipline === 'Occultist'");
      expect(joined, file).toContain("summary.activeInjuries === ['Broken Arm (vigor -2)']");
    }
  });
});
