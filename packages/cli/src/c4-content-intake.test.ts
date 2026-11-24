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
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runSidecar } from './sidecar-command.js';
import { ENGINE_VERSION } from './engine-version.js';
import { FIXTURE_PACK_PATH } from './c0/fixture-path.js';

const FORGE_MANIFEST_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '__fixtures__/c1-forge-manifest.json',
);

// Fixture shaped like mcp-tool-shop-org/world-forge commit eb2514c4
// (packages/export-ai-rpg/src/convert-entities.ts:27-30, :144), where
// npc, merchant, and quest-giver roles default to aiProfile: 'passive'.
const FORGE_PASSIVE_PACK_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '__fixtures__/forge-passive-roles-pack.json',
);
const FORGE_PASSIVE_MANIFEST_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '__fixtures__/forge-passive-roles-manifest.json',
);

// Fixture shaped like mcp-tool-shop-org/world-forge commit eb2514c4
// (packages/export-ai-rpg/src/convert-entities.ts:9-33, :139-145 and
// packages/editor/src/templates/samples.ts:91-96), where companion roles
// default to aiProfile: 'follower'.
const FORGE_COMPANION_PACK_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '__fixtures__/forge-companion-roles-pack.json',
);
const FORGE_COMPANION_MANIFEST_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '__fixtures__/forge-companion-roles-manifest.json',
);

const HOST_PACK = 'chapel-threshold';

/** Capture the command's diagnostics. Everything it says goes to stderr by contract. */
async function run(args: string[]): Promise<{ code: number | null; lines: string[] }> {
  const lines: string[] = [];
  const code = await runSidecar(args, { error: (m) => lines.push(m) });
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

/** Sibling manifest the four-check gate can actually run against. */
function writeManifest(
  packFile: string,
  manifest: unknown = { engineVersion: `>=${ENGINE_VERSION}` },
): string {
  const file = path.join(path.dirname(packFile), 'manifest.json');
  fs.writeFileSync(file, JSON.stringify(manifest), 'utf-8');
  return file;
}

function readyLine(text: string): boolean {
  return /\[sidecar\] \S+ ready/.test(text);
}

/** `--listen` prints the bound port from net.Server's listening callback (next tick). */
async function waitForListening(lines: string[], ms = 1000): Promise<string> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const text = lines.join('\n');
    if (text.includes('listening')) return text;
    await new Promise((r) => setTimeout(r, 15));
  }
  return lines.join('\n');
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
  it('routes an authored pack into the booted world', async () => {
    const file = writePack(MINIMAL_PACK);
    const man = writeManifest(file);
    const { code, lines } = await run([
      HOST_PACK, '--seed', '1', '--content', file, '--manifest', man, '--start', 'quay-probe', '--listen', '0',
    ]);
    // `null` means the server is running — the command does not exit.
    expect(code).toBeNull();
    expect(lines.join('\n')).toContain('applied');
    expect(lines.join('\n')).toContain('zones=1');
  });

  it('REPORTS what it dropped rather than eating it', async () => {
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
    const man = writeManifest(file);
    const { lines } = await run([
      HOST_PACK, '--content', file, '--manifest', man, '--start', 'quay-probe', '--listen', '0',
    ]);
    const text = lines.join('\n');
    expect(text).toContain('dropped');
    expect(text).toContain('description');
  });

  it('dropped evaluated-not-mapped keys print the ANDON/EVALUATED rationale', async () => {
    // F-2b1709d0: reason-only reporting discarded DroppedField.detail, so a real
    // forge export's items/factionPresences/pressureHotspots landed as jargon
    // (`evaluated-not-mapped`) without the recorded rationale.
    const file = writePack({
      ...MINIMAL_PACK,
      items: [{ id: 'crate' }],
      factionPresences: [{ factionId: 'tide' }],
      pressureHotspots: [{ zoneId: 'quay-probe', pressureType: 'patrol', baseProbability: 0.1 }],
    });
    const man = writeManifest(file);
    const { lines } = await run([
      HOST_PACK, '--content', file, '--manifest', man, '--start', 'quay-probe', '--listen', '0',
    ]);
    const text = lines.join('\n');
    expect(text).toContain('items=1');
    expect(text).toContain('pack.factionPresences');
    expect(text).toContain('EVALUATED');
    expect(text).toContain('pack.pressureHotspots');
    expect(text).toContain('evaluated-not-mapped');
  });

  it('refuses a missing file with a path and a reason', async () => {
    const { code, lines } = await run([HOST_PACK, '--content', 'E:/nowhere/absent-pack.json']);
    expect(code).toBe(1);
    const text = lines.join('\n');
    expect(text).toContain('SIDECAR_CONTENT_INVALID');
    expect(text).toContain('absent-pack.json');
  });

  it('refuses a pack the load gate rejects, naming the offending key', async () => {
    // The four-check gate runs BEFORE any mutation, so a bad pack cannot leave the
    // world half-populated. An unknown top-level key is the cheapest of the four to
    // trigger and the one C0 measured passing silently.
    const file = writePack({ ...MINIMAL_PACK, thisKeyIsNotInTheAllowlist: [1, 2, 3] });
    const man = writeManifest(file);
    const { code, lines } = await run([HOST_PACK, '--content', file, '--manifest', man]);
    expect(code).toBe(1);
    const text = lines.join('\n');
    expect(text).toContain('SIDECAR_CONTENT_REFUSED');
    expect(text).toContain('thisKeyIsNotInTheAllowlist');
  });

  it('refuses --content with no path', async () => {
    const { code, lines } = await run([HOST_PACK, '--content']);
    expect(code).toBe(1);
    expect(lines.join('\n')).toContain('SIDECAR_CONTENT_MISSING_PATH');
  });

  it('a content path is not mistaken for the pack id', async () => {
    // The parser's own failure mode, guarded. The original shape hard-coded ONE
    // value-flag and excluded exactly one index; its comment warned that getting this
    // wrong "eats the pack id", which with three more value-flags is exactly what it
    // would have done.
    const file = writePack(MINIMAL_PACK);
    const man = writeManifest(file);
    const { code, lines } = await run([
      '--content', file, '--manifest', man, '--seed', '3', HOST_PACK, '--start', 'quay-probe', '--listen', '0',
    ]);
    expect(code).toBeNull();
    expect(lines.join('\n')).not.toContain('SIDECAR_PACK_UNKNOWN');
  });

  it('--content without --start does not print a bare ready line', async () => {
    // F-1b1ccd30: apply MERGES authored zones into the host graph; without --start
    // the player remains in the host opening zone. Ready without a start is a lie.
    const file = writePack(MINIMAL_PACK);
    const man = writeManifest(file);
    const { code, lines } = await run([HOST_PACK, '--content', file, '--manifest', man, '--listen', '0']);
    expect(code).toBe(1);
    const text = lines.join('\n');
    expect(text).toContain('SIDECAR_START_REQUIRED');
    expect(text).toContain('quay-probe');
    expect(readyLine(text)).toBe(false);
  });

  it('--content without --manifest is refused rather than skipping the three checks', async () => {
    // F-73174f4e: without a GateContext.manifest the version/module/hash checks
    // skip as 'not verified' and the server still starts. That is a documented
    // gate that cannot fire.
    const file = writePack(MINIMAL_PACK);
    const { code, lines } = await run([HOST_PACK, '--content', file, '--start', 'quay-probe', '--listen', '0']);
    expect(code).toBe(1);
    const text = lines.join('\n');
    expect(text).toContain('SIDECAR_MANIFEST_REQUIRED');
    expect(readyLine(text)).toBe(false);
    expect(text).not.toContain('not verified');
  });

  it('a sibling manifest claiming engine 2.x is refused, not ready', async () => {
    const file = writePack(MINIMAL_PACK);
    const man = writeManifest(file, { engineVersion: '2.0.0' });
    const { code, lines } = await run([
      HOST_PACK, '--content', file, '--manifest', man, '--start', 'quay-probe', '--listen', '0',
    ]);
    expect(code).toBe(1);
    const text = lines.join('\n');
    expect(text).toContain('SIDECAR_CONTENT_REFUSED');
    expect(text).toContain('2.0.0');
    expect(readyLine(text)).toBe(false);
  });

  it('unresolved aiProfile values are refused with SIDECAR_CONTENT_REFUSED naming every entity and profile', async () => {
    const file = writePack({
      ...MINIMAL_PACK,
      entities: [
        { id: 'grunt', type: 'npc', name: 'Grunt', aiProfile: 'ghost-brain' },
        { id: 'stalker', type: 'enemy', name: 'Stalker', aiProfile: 'feral-mind' },
      ],
    });
    const man = writeManifest(file);
    const { code, lines } = await run([
      HOST_PACK, '--content', file, '--manifest', man, '--start', 'quay-probe', '--listen', '0',
    ]);
    expect(code).toBe(1);
    const text = lines.join('\n');
    expect(text).toContain('SIDECAR_CONTENT_REFUSED');
    expect(text).toContain('grunt');
    expect(text).toContain('ghost-brain');
    expect(text).toContain('stalker');
    expect(text).toContain('feral-mind');
    expect(readyLine(text)).toBe(false);
  });

  it('a content entity whose aiProfile matches a registered cognition profile loads cleanly', async () => {
    const file = writePack({
      ...MINIMAL_PACK,
      entities: [
        { id: 'lookout', type: 'npc', name: 'Lookout', aiProfile: 'cautious' },
      ],
    });
    const man = writeManifest(file);
    const { code, lines } = await run([
      HOST_PACK, '--content', file, '--manifest', man, '--start', 'quay-probe', '--listen', '0',
    ]);
    expect(code).toBeNull();
    const text = lines.join('\n');
    expect(readyLine(text)).toBe(true);
    expect(text).toContain('entities=1');
    expect(text).toContain('entityAi=1');
    expect(text).not.toContain('SIDECAR_CONTENT_REFUSED');
    expect(text).not.toContain('dropped entities[0](lookout).aiProfile');
  });

  it('accepts a custom profile registered by an external host pack and refuses it on a stock host', async () => {
    const packFile = writePack({
      ...MINIMAL_PACK,
      entities: [
        { id: 'watchman', type: 'npc', name: 'Watchman', aiProfile: 'sentinel' },
      ],
    });
    const manFile = writeManifest(packFile);

    const stockRes = await run([
      HOST_PACK, '--content', packFile, '--manifest', manFile, '--start', 'quay-probe', '--listen', '0',
    ]);
    expect(stockRes.code).toBe(1);
    expect(stockRes.lines.join('\n')).toContain('SIDECAR_CONTENT_REFUSED');
    expect(stockRes.lines.join('\n')).toContain('sentinel');

    const hostDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-custom-host-'));
    try {
      const cliSrcDir = path.dirname(fileURLToPath(import.meta.url));
      const coreEntry = pathToFileURL(path.resolve(cliSrcDir, '../../core/dist/index.js')).href;
      const modulesEntry = pathToFileURL(path.resolve(cliSrcDir, '../../modules/dist/index.js')).href;
      const hostFile = path.join(hostDir, 'host.mjs');
      fs.writeFileSync(
        hostFile,
        [
          `import { Engine } from ${JSON.stringify(coreEntry)};`,
          `import { traversalCore, createCognitionCore } from ${JSON.stringify(modulesEntry)};`,
          'export const manifest = {',
          '  id: "custom-profile-host",',
          '  title: "Custom Profile Host",',
          '  version: "1.0.0",',
          '  engineVersion: "1.0.0",',
          '  ruleset: "standard-v1",',
          '  modules: ["traversal-core", "cognition-core"],',
          '  contentPacks: [],',
          '};',
          'export function createGame(seed = 1) {',
          '  return new Engine({',
          '    manifest,',
          '    seed,',
          '    modules: [traversalCore, createCognitionCore([{ id: "sentinel", evaluate: () => [] }])],',
          '  });',
          '}',
        ].join('\n'),
        'utf-8',
      );

      const customRes = await run([
        hostFile, '--content', packFile, '--manifest', manFile, '--start', 'quay-probe', '--listen', '0',
      ]);
      expect(customRes.code).toBeNull();
      const customText = customRes.lines.join('\n');
      expect(readyLine(customText)).toBe(true);
      expect(customText).toContain('entities=1');
      expect(customText).toContain('entityAi=1');
    } finally {
      fs.rmSync(hostDir, { recursive: true, force: true });
    }
  });

  it('refuses the committed forge fixture when npc-gantry-runner names unregistered skirmisher', async () => {
    const { code, lines } = await run([
      HOST_PACK,
      '--content',
      FIXTURE_PACK_PATH,
      '--manifest',
      FORGE_MANIFEST_PATH,
      '--start',
      'zone-surface-yard',
      '--listen',
      '0',
    ]);
    expect(code).toBe(1);
    const text = lines.join('\n');
    expect(text).toContain('SIDECAR_CONTENT_REFUSED');
    expect(text).toContain('npc-gantry-runner');
    expect(text).toContain('skirmisher');
    expect(readyLine(text)).toBe(false);
  });

  it('escapes control/ANSI characters and caps echoed entity/profile ids on stderr', async () => {
    const file = writePack({
      ...MINIMAL_PACK,
      entities: [
        {
          id: `\x1b[31mbad\nnpc_${'a'.repeat(100)}`,
          type: 'npc',
          name: 'Bad',
          aiProfile: `\x1b[2Jbad\x07_${'b'.repeat(100)}`,
        },
      ],
    });
    const man = writeManifest(file);
    const { code, lines } = await run([
      HOST_PACK, '--content', file, '--manifest', man, '--start', 'quay-probe', '--listen', '0',
    ]);
    expect(code).toBe(1);
    for (const line of lines) {
      expect(line).not.toMatch(/[\x00-\x1f\x7f-\x9f]/);
    }
    const text = lines.join('\n');
    expect(text).toContain('\\x1b[31m');
    expect(text).toContain('...');
  });

  it('loads the World Forge default-roles fixture (npc/merchant/quest-giver passive) under default fail mode', async () => {
    const { code, lines } = await run([
      HOST_PACK,
      '--content',
      FORGE_PASSIVE_PACK_PATH,
      '--manifest',
      FORGE_PASSIVE_MANIFEST_PATH,
      '--start',
      'market-square',
      '--listen',
      '0',
    ]);
    expect(code).toBeNull();
    const text = lines.join('\n');
    expect(readyLine(text)).toBe(true);
    expect(text).toContain('entities=5');
    expect(text).toContain('entityAi=5');
    expect(text).not.toContain('SIDECAR_CONTENT_REFUSED');
  });

  it('loads the World Forge default-roles fixture with companions (aiProfile follower) under default fail mode', async () => {
    const { code, lines } = await run([
      HOST_PACK,
      '--content',
      FORGE_COMPANION_PACK_PATH,
      '--manifest',
      FORGE_COMPANION_MANIFEST_PATH,
      '--start',
      'sanctuary-nave',
      '--listen',
      '0',
    ]);
    expect(code).toBeNull();
    const text = lines.join('\n');
    expect(readyLine(text)).toBe(true);
    expect(text).toContain('entities=7');
    expect(text).toContain('entityAi=7');
    expect(text).not.toContain('SIDECAR_CONTENT_REFUSED');
  });

  it('--unresolved-ai-profile warn loads an unknown-profile pack and writes sanitized per-entity warnings to stderr', async () => {
    const rawId = `\x1b[31mevil-npc\n_${'x'.repeat(80)}`;
    const rawProfile = `bad\x07mind_${'p'.repeat(80)}`;
    const pack = {
      ...MINIMAL_PACK,
      entities: [
        { id: 'lookout', type: 'npc', name: 'Lookout', aiProfile: 'skirmisher' },
        { id: rawId, type: 'npc', name: 'Bad', aiProfile: rawProfile },
      ],
    };
    const file = writePack(pack);
    const man = writeManifest(file);

    for (const flagArgs of [
      ['--unresolved-ai-profile', 'warn'],
      ['--unresolved-ai-profile=warn'],
    ]) {
      const { code, lines } = await run([
        HOST_PACK, '--content', file, '--manifest', man, '--start', 'quay-probe', '--listen', '0', ...flagArgs,
      ]);
      expect(code).toBeNull();
      const text = lines.join('\n');
      expect(readyLine(text)).toBe(true);
      expect(text).not.toContain('SIDECAR_CONTENT_REFUSED');
      for (const line of lines) {
        expect(line).not.toMatch(/[\x00-\x1f\x7f-\x9f]/);
      }
      const warningLines = lines.filter((l) => l.includes('UNRESOLVED_AI_PROFILE'));
      expect(warningLines).toHaveLength(2);
      expect(warningLines[0]).toContain('lookout');
      expect(warningLines[0]).toContain('skirmisher');
      expect(warningLines[1]).toContain('\\x1b[31m');
      expect(warningLines[1]).toContain('bad\\x07mind');
    }

    const explicitFail = await run([
      HOST_PACK, '--content', file, '--manifest', man, '--start', 'quay-probe', '--listen', '0',
      '--unresolved-ai-profile', 'fail',
    ]);
    expect(explicitFail.code).toBe(1);
    expect(explicitFail.lines.join('\n')).toContain('SIDECAR_CONTENT_REFUSED');

    const prePositionalWarn = await run([
      '--unresolved-ai-profile', 'warn', HOST_PACK, '--content', file, '--manifest', man, '--start', 'quay-probe', '--listen', '0',
    ]);
    expect(prePositionalWarn.code).toBeNull();
    expect(prePositionalWarn.lines.join('\n')).not.toContain('SIDECAR_PACK_UNKNOWN');

    const defaultFail = await run([
      HOST_PACK, '--content', file, '--manifest', man, '--start', 'quay-probe', '--listen', '0',
    ]);
    expect(defaultFail.code).toBe(1);
    expect(defaultFail.lines.join('\n')).toContain('SIDECAR_CONTENT_REFUSED');
  });

  it('refuses invalid --unresolved-ai-profile flag values with exit 1 and a usage error', async () => {
    for (const badArgs of [
      ['--unresolved-ai-profile', 'loud'],
      ['--unresolved-ai-profile=ignore'],
      ['--unresolved-ai-profile='],
      ['--unresolved-ai-profile'],
      ['--unresolved-ai-profile', '--listen', '0'],
    ]) {
      const { code, lines } = await run([HOST_PACK, ...badArgs]);
      expect(code).toBe(1);
      const text = lines.join('\n');
      expect(text).toContain('SIDECAR_INVALID_UNRESOLVED_AI_PROFILE');
      expect(text).toContain('--unresolved-ai-profile');
      expect(text).toContain('fail');
      expect(text).toContain('warn');
      expect(readyLine(text)).toBe(false);
    }
  });
});

describe('sidecar --start', () => {
  it('stands the player in an authored zone', async () => {
    const file = writePack(MINIMAL_PACK);
    const man = writeManifest(file);
    const { code, lines } = await run([
      HOST_PACK, '--content', file, '--manifest', man, '--start', 'quay-probe', '--listen', '0',
    ]);
    expect(code).toBeNull();
    expect(lines.join('\n')).toContain('player starts in quay-probe');
  });

  it('refuses an unknown zone AND lists the zones that exist', async () => {
    // Checked against the world after intake. A typo that silently put the player
    // nowhere would surface as a mysteriously failing first move.
    const file = writePack(MINIMAL_PACK);
    const man = writeManifest(file);
    const { code, lines } = await run([HOST_PACK, '--content', file, '--manifest', man, '--start', 'quayprobe']);
    expect(code).toBe(1);
    const text = lines.join('\n');
    expect(text).toContain('SIDECAR_START_UNKNOWN_ZONE');
    // The actionable half.
    expect(text).toContain('quay-probe');
  });

  it('refuses --start with no zone id', async () => {
    const { code, lines } = await run([HOST_PACK, '--start']);
    expect(code).toBe(1);
    expect(lines.join('\n')).toContain('SIDECAR_START_MISSING_ZONE');
  });

  it('works without --content, against the host pack\'s own zones', async () => {
    // `--start` is not coupled to `--content`. A host pack's zones are zones.
    const { code, lines } = await run([HOST_PACK, '--start', 'chapel-nave', '--listen', '0']);
    expect(code).toBeNull();
    expect(lines.join('\n')).toContain('player starts in chapel-nave');
  });
});

describe('sidecar — argument hygiene across four value-flags', () => {
  it('--host without --listen is refused rather than silently ignored', async () => {
    // A flag accepted and ignored is worse than one refused: the operator believes
    // they bound an interface they did not.
    const { code, lines } = await run([HOST_PACK, '--host', '0.0.0.0']);
    expect(code).toBe(1);
    expect(lines.join('\n')).toContain('SIDECAR_HOST_WITHOUT_LISTEN');
  });

  it('an out-of-range port is refused with the range stated', async () => {
    const { code, lines } = await run([HOST_PACK, '--listen', '70000']);
    expect(code).toBe(1);
    expect(lines.join('\n')).toContain('SIDECAR_INVALID_PORT');
    expect(lines.join('\n')).toContain('0..65535');
  });

  it('--help documents every transport and both content flags', async () => {
    // The help is the only place an operator learns the loopback default and the
    // one-client rule, both of which are load-bearing decisions rather than trivia.
    const { code, lines } = await run(['--help']);
    expect(code).toBe(0);
    const text = lines.join('\n');
    expect(text).toContain('--listen');
    expect(text).toContain('--host');
    expect(text).toContain('--content');
    expect(text).toContain('--start');
    expect(text).toContain('[--start <zone-id>]');
    expect(text).toContain('--manifest');
    expect(text).toContain('127.0.0.1');
    expect(text).toContain('not deterministic');
  });
});

describe('sidecar — equals-form value flags', () => {
  it('--listen=0 enters ATTACH rather than stdio', async () => {
    const { code, lines } = await run([HOST_PACK, '--listen=0']);
    expect(code).toBeNull();
    expect(await waitForListening(lines)).toContain('listening');
  });

  it('--seed=N pins the world', async () => {
    const { code, lines } = await run([HOST_PACK, '--seed=42', '--listen=0']);
    expect(code).toBeNull();
    expect(lines.join('\n')).toContain('seed 42');
  });

  it('--content=<file> --manifest=<file> --start=<zone> apply and boot the pack', async () => {
    const file = writePack(MINIMAL_PACK);
    const man = writeManifest(file);
    const { code, lines } = await run([
      HOST_PACK, `--content=${file}`, `--manifest=${man}`, '--start=quay-probe', '--listen=0',
    ]);
    expect(code).toBeNull();
    const text = lines.join('\n');
    expect(text).toContain('applied');
    expect(text).toContain('player starts in quay-probe');
  });

  it('--start=<zone> moves the player against the host pack', async () => {
    const { code, lines } = await run([HOST_PACK, '--start=chapel-nave', '--listen=0']);
    expect(code).toBeNull();
    expect(lines.join('\n')).toContain('player starts in chapel-nave');
  });

  it('--host=0.0.0.0 without --listen is refused rather than ignored', async () => {
    const { code, lines } = await run([HOST_PACK, '--host=0.0.0.0']);
    expect(code).toBe(1);
    expect(lines.join('\n')).toContain('SIDECAR_HOST_WITHOUT_LISTEN');
  });

  it('--host=0.0.0.0 with --listen=0 binds that interface', async () => {
    const { code, lines } = await run([HOST_PACK, '--listen=0', '--host=0.0.0.0']);
    expect(code).toBeNull();
    expect(await waitForListening(lines)).toContain('listening 0.0.0.0:');
  });

  it('whitespace-only --host is trimmed to unset and falls back to 127.0.0.1 loopback', async () => {
    const { code, lines } = await run([HOST_PACK, '--listen=0', '--host=   ']);
    expect(code).toBeNull();
    expect(await waitForListening(lines)).toContain('listening 127.0.0.1:');

    const spaceForm = await run([HOST_PACK, '--listen', '0', '--host', '  \t ']);
    expect(spaceForm.code).toBeNull();
    expect(await waitForListening(spaceForm.lines)).toContain('listening 127.0.0.1:');
  });

  it('--shock=malformed is refused rather than ignored', async () => {
    const { code, lines } = await run([HOST_PACK, '--shock=not-a-spec']);
    expect(code).toBe(1);
    expect(lines.join('\n')).toContain('SIDECAR_SHOCK_MALFORMED');
  });

  it('empty equals form is the existing MISSING_* error for every value flag', async () => {
    expect((await run([HOST_PACK, '--content='])).lines.join('\n')).toContain('SIDECAR_CONTENT_MISSING_PATH');
    expect((await run([HOST_PACK, '--listen='])).lines.join('\n')).toContain('SIDECAR_LISTEN_MISSING_PORT');
    expect((await run([HOST_PACK, '--start='])).lines.join('\n')).toContain('SIDECAR_START_MISSING_ZONE');
    expect((await run([HOST_PACK, '--shock='])).lines.join('\n')).toContain('SIDECAR_SHOCK_MISSING_SPEC');
    expect((await run([HOST_PACK, '--seed='])).lines.join('\n')).toContain('SIDECAR_INVALID_SEED');
    const file = writePack(MINIMAL_PACK);
    expect((await run([HOST_PACK, '--content', file, '--manifest='])).lines.join('\n')).toContain(
      'SIDECAR_MANIFEST_MISSING_PATH',
    );
  });

  // F-3d3c8eb5 — sidecar --seed/--listen must share run's whole-token digit gate.
  it('--seed=1e2 is SIDECAR_INVALID_SEED (not Number() → 100)', async () => {
    const { code, lines } = await run([HOST_PACK, '--seed=1e2']);
    expect(code).toBe(1);
    const text = lines.join('\n');
    expect(text).toContain('SIDECAR_INVALID_SEED');
    expect(text).toContain('--seed');
    expect(text).toMatch(/--seed /);
    expect(text).toMatch(/--seed=/);
  });

  it('--seed=0x10 is SIDECAR_INVALID_SEED (not Number() → 16)', async () => {
    const { code, lines } = await run([HOST_PACK, '--seed=0x10']);
    expect(code).toBe(1);
    expect(lines.join('\n')).toContain('SIDECAR_INVALID_SEED');
  });

  it('a seed above MAX_SEED is SIDECAR_INVALID_SEED', async () => {
    const { code, lines } = await run([HOST_PACK, '--seed=2147483648']);
    expect(code).toBe(1);
    expect(lines.join('\n')).toContain('SIDECAR_INVALID_SEED');
  });

  it('--listen=1e3 is SIDECAR_INVALID_PORT (not Number() → 1000)', async () => {
    const { code, lines } = await run([HOST_PACK, '--listen=1e3']);
    expect(code).toBe(1);
    const text = lines.join('\n');
    expect(text).toContain('SIDECAR_INVALID_PORT');
    expect(text).toContain('--listen');
    expect(text).toMatch(/--listen /);
    expect(text).toMatch(/--listen=/);
  });
});

const MINI_PACK_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../test-fixtures/mini-pack');

describe('sidecar <path> (F-dda90fe8)', () => {
  it('sidecar of mini-pack with --listen 0 prints ready for that module id, never SIDECAR_PACK_UNKNOWN', async () => {
    const { code, lines } = await run([MINI_PACK_DIR, '--listen', '0']);
    const text = lines.join('\n');
    expect(code).toBeNull();
    expect(text).toContain('[sidecar] mini-quest ready');
    expect(text).not.toContain('SIDECAR_PACK_UNKNOWN');
  });

  it('an unknown bundled id still lists available packs', async () => {
    const { code, lines } = await run(['not-a-real-pack']);
    const text = lines.join('\n');
    expect(code).toBe(1);
    expect(text).toContain('SIDECAR_PACK_UNKNOWN');
    expect(text).toContain('Available:');
    expect(text).toContain('sidecar <path>');
  });

  it('a missing path hints sidecar <path>, not only bundled ids', async () => {
    const missing = path.join(os.tmpdir(), 'no-such-sidecar-pack', 'module.mjs');
    const { code, lines } = await run([missing]);
    const text = lines.join('\n');
    expect(code).toBe(1);
    expect(text).toContain('SIDECAR_PACK_UNKNOWN');
    expect(text).toContain('sidecar <path>');
  });
});
