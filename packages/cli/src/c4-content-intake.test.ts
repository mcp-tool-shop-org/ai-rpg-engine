// c4-content-intake.test.ts — authored content reaches a SERVED world.
//
// C1 built `applyContentPack` and proved it in tests. Until C4 nothing in production
// ever called it, which meant the authoring layer could not reach a renderer: the
// sidecar booted a bundled starter and that was the only world a client could ever
// see. `--content` closes that, and `--start` closes the thing that closing it
// revealed — authored zones are MERGED into the host pack's world and the two graphs
// are not connected, so without a start zone the player stands in the host's opening
// room with no path to the authored one.
//
// The subject here is the COMMAND's behaviour: what it accepts, what it refuses, and
// whether a refusal says enough to act on. The intake mechanism itself is C1's and is
// tested there.

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runSidecar } from './sidecar-command.js';

const HOST_PACK = 'chapel-threshold';

/** Capture the command's diagnostics. Everything it says goes to stderr by contract. */
function run(args: string[]): { code: number | null; lines: string[] } {
  const lines: string[] = [];
  const code = runSidecar(args, { error: (m) => lines.push(m) });
  return { code, lines };
}

/**
 * A minimal pack the load gate accepts.
 *
 * Deliberately hand-built rather than generated from world-forge: this suite must fail
 * for reasons about the COMMAND, and depending on a sibling repo's exporter would make
 * a forge change able to turn these red.
 */
function writePack(pack: unknown): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-content-'));
  const file = path.join(dir, 'pack.json');
  fs.writeFileSync(file, JSON.stringify(pack), 'utf-8');
  return file;
}

const MINIMAL_PACK = {
  schemaVersion: '1.0.0',
  zones: [
    {
      id: 'quay-probe',
      name: 'A Probe Quay',
      tags: ['exterior'],
      neighbors: [],
      light: 6,
      noise: 4,
      scene: { biome: 'harbour-stone', timeOfDay: 'morning', dressingDensity: 'normal' },
    },
  ],
};

describe('sidecar --content', () => {
  it('routes an authored pack into the booted world', () => {
    const file = writePack(MINIMAL_PACK);
    const { code, lines } = run([HOST_PACK, '--seed', '1', '--content', file, '--listen', '0']);
    // `null` means the server is running — the command does not exit.
    expect(code).toBeNull();
    expect(lines.join('\n')).toContain('applied');
    expect(lines.join('\n')).toContain('zones=1');
  });

  it('REPORTS what it dropped rather than eating it', () => {
    // C0's headline failure was not that data was lost; it was that data was lost
    // SILENTLY while an instrument reported 100% lossless. A transport whose whole
    // premise is that a renderer can trust what it received cannot start by hiding
    // what it discarded.
    const file = writePack({
      ...MINIMAL_PACK,
      // A TextBlock[], which is what a ZoneDefinition's `description` actually is.
      // A first draft passed a bare string; the loader refused it and the test failed
      // for a reason unrelated to drop reporting.
      zones: [
        {
          ...MINIMAL_PACK.zones[0],
          description: [{ text: 'Prose the runtime has no field for.' }],
        },
      ],
    });
    const { lines } = run([HOST_PACK, '--content', file, '--listen', '0']);
    const text = lines.join('\n');
    expect(text).toContain('dropped');
    expect(text).toContain('description');
  });

  it('refuses a missing file with a path and a reason', () => {
    const { code, lines } = run([HOST_PACK, '--content', 'E:/nowhere/absent-pack.json']);
    expect(code).toBe(1);
    const text = lines.join('\n');
    expect(text).toContain('SIDECAR_CONTENT_INVALID');
    expect(text).toContain('absent-pack.json');
  });

  it('refuses a pack the load gate rejects, naming the offending key', () => {
    // The four-check gate runs BEFORE any mutation, so a bad pack cannot leave the
    // world half-populated. An unknown top-level key is the cheapest of the four to
    // trigger and the one C0 measured passing silently.
    const file = writePack({ ...MINIMAL_PACK, thisKeyIsNotInTheAllowlist: [1, 2, 3] });
    const { code, lines } = run([HOST_PACK, '--content', file]);
    expect(code).toBe(1);
    const text = lines.join('\n');
    expect(text).toContain('SIDECAR_CONTENT_REFUSED');
    expect(text).toContain('thisKeyIsNotInTheAllowlist');
  });

  it('refuses --content with no path', () => {
    const { code, lines } = run([HOST_PACK, '--content']);
    expect(code).toBe(1);
    expect(lines.join('\n')).toContain('SIDECAR_CONTENT_MISSING_PATH');
  });

  it('a content path is not mistaken for the pack id', () => {
    // The parser's own failure mode, guarded. The original shape hard-coded ONE
    // value-flag and excluded exactly one index; its comment warned that getting this
    // wrong "eats the pack id", which with three more value-flags is exactly what it
    // would have done.
    const file = writePack(MINIMAL_PACK);
    const { code, lines } = run(['--content', file, '--seed', '3', HOST_PACK, '--listen', '0']);
    expect(code).toBeNull();
    expect(lines.join('\n')).not.toContain('SIDECAR_PACK_UNKNOWN');
  });
});

describe('sidecar --start', () => {
  it('stands the player in an authored zone', () => {
    const file = writePack(MINIMAL_PACK);
    const { code, lines } = run([HOST_PACK, '--content', file, '--start', 'quay-probe', '--listen', '0']);
    expect(code).toBeNull();
    expect(lines.join('\n')).toContain('player starts in quay-probe');
  });

  it('refuses an unknown zone AND lists the zones that exist', () => {
    // Checked against the world after intake. A typo that silently put the player
    // nowhere would surface as a mysteriously failing first move.
    const file = writePack(MINIMAL_PACK);
    const { code, lines } = run([HOST_PACK, '--content', file, '--start', 'quayprobe']);
    expect(code).toBe(1);
    const text = lines.join('\n');
    expect(text).toContain('SIDECAR_START_UNKNOWN_ZONE');
    // The actionable half.
    expect(text).toContain('quay-probe');
  });

  it('refuses --start with no zone id', () => {
    const { code, lines } = run([HOST_PACK, '--start']);
    expect(code).toBe(1);
    expect(lines.join('\n')).toContain('SIDECAR_START_MISSING_ZONE');
  });

  it('works without --content, against the host pack\'s own zones', () => {
    // `--start` is not coupled to `--content`. A host pack's zones are zones.
    const { code, lines } = run([HOST_PACK, '--start', 'chapel-nave', '--listen', '0']);
    expect(code).toBeNull();
    expect(lines.join('\n')).toContain('player starts in chapel-nave');
  });
});

describe('sidecar — argument hygiene across four value-flags', () => {
  it('--host without --listen is refused rather than silently ignored', () => {
    // A flag accepted and ignored is worse than one refused: the operator believes
    // they bound an interface they did not.
    const { code, lines } = run([HOST_PACK, '--host', '0.0.0.0']);
    expect(code).toBe(1);
    expect(lines.join('\n')).toContain('SIDECAR_HOST_WITHOUT_LISTEN');
  });

  it('an out-of-range port is refused with the range stated', () => {
    const { code, lines } = run([HOST_PACK, '--listen', '70000']);
    expect(code).toBe(1);
    expect(lines.join('\n')).toContain('SIDECAR_INVALID_PORT');
    expect(lines.join('\n')).toContain('0..65535');
  });

  it('--help documents every transport and both content flags', () => {
    // The help is the only place an operator learns the loopback default and the
    // one-client rule, both of which are load-bearing decisions rather than trivia.
    const { code, lines } = run(['--help']);
    expect(code).toBe(0);
    const text = lines.join('\n');
    expect(text).toContain('--listen');
    expect(text).toContain('--host');
    expect(text).toContain('--content');
    expect(text).toContain('--start');
    expect(text).toContain('127.0.0.1');
    expect(text).toContain('not deterministic');
  });
});
