// engine-version.ts — the running engine's version, read from the package.
//
// The load gate compares a pack's declared engineVersion RANGE against the
// engine actually running. That comparison is only meaningful if the version it
// reads is the real one, so this reads package.json rather than repeating a
// literal that would drift — a hardcoded '2.0.0' sitting unread against a 3.8.0
// engine is exactly how C0's version skew stayed invisible for eight minor
// releases (docs/c0-alignment/REPORT.md §5, item 2).

import * as fs from 'node:fs';
import * as path from 'node:path';

function readVersion(): string {
  // dist/ and src/ sit one level below the package root; walk up until a
  // package.json with a version appears, so this works from either.
  let dir = import.meta.dirname;
  for (let i = 0; i < 4; i++) {
    const candidate = path.join(dir, 'package.json');
    if (fs.existsSync(candidate)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(candidate, 'utf-8')) as { version?: unknown };
        if (typeof pkg.version === 'string') return pkg.version;
      } catch {
        // fall through to the parent
      }
    }
    dir = path.dirname(dir);
  }
  throw new Error(
    'Could not determine the engine version: no package.json with a "version" found above ' +
      `${import.meta.dirname}. The load gate cannot check a version claim without one.`,
  );
}

/** The running engine's semantic version, e.g. "3.8.0". */
export const ENGINE_VERSION: string = readVersion();
