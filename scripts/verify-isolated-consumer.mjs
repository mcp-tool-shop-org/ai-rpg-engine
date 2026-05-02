#!/usr/bin/env node

/**
 * verify-isolated-consumer.mjs
 *
 * True artifact proof — leaves the monorepo and proves npm package behavior.
 *
 * Steps:
 *   1. Packs core, modules, content-schema, character-profile into tarballs
 *   2. Creates a fresh temp project (outside the monorepo)
 *   3. Installs from tarballs (no workspace resolution)
 *   4. Writes a TypeScript consumer file (README quickstart pattern)
 *   5. Compiles with tsc --noEmit (type-check only)
 *   6. Compiles with tsc and runs the proof
 *   7. Cleans up
 *
 * Usage:
 *   node scripts/verify-isolated-consumer.mjs
 *
 * Exit 0 = consumer artifact is proven
 * Exit 1 = broken consumer experience
 */

import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const PACKAGES = ['core', 'modules', 'content-schema', 'character-profile'];

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: 'pipe', ...opts });
  } catch (e) {
    console.error(`Command failed: ${cmd}`);
    console.error(e.stderr || e.stdout || e.message);
    process.exit(1);
  }
}

console.log('=== Isolated Consumer Verification ===\n');

// 1. Create temp directories
const tmpBase = mkdtempSync(join(tmpdir(), 'ai-rpg-isolated-'));
const tarballDir = join(tmpBase, 'tarballs');
const appDir = join(tmpBase, 'app');
mkdirSync(tarballDir);
mkdirSync(appDir);

console.log(`Temp: ${tmpBase}`);

try {
  // 2. Pack tarballs
  console.log('\n[1/5] Packing tarballs...');
  const workspaces = PACKAGES.map(p => `--workspace packages/${p}`).join(' ');
  run(`npm pack ${workspaces} --pack-destination "${tarballDir}"`, { cwd: ROOT });
  console.log('      Done — 4 tarballs packed');

  // 3. Init fresh project
  console.log('[2/5] Creating fresh project...');
  run('npm init -y', { cwd: appDir });
  // Set ESM
  const { readFileSync: readF } = await import('node:fs');
  const appPkg = JSON.parse(readF(join(appDir, 'package.json'), 'utf-8'));
  appPkg.type = 'module';
  writeFileSync(join(appDir, 'package.json'), JSON.stringify(appPkg, null, 2));

  // 4. Install from tarballs
  console.log('[3/5] Installing from tarballs...');
  const { readdirSync } = await import('node:fs');
  const tarballs = readdirSync(tarballDir).filter(f => f.endsWith('.tgz')).map(f => join(tarballDir, f));
  run(`npm install ${tarballs.map(t => `"${t}"`).join(' ')}`, { cwd: appDir });
  run('npm install -D typescript@~5.7 @types/node', { cwd: appDir });
  console.log('      Done — installed from artifacts');

  // 5. Write tsconfig + proof file
  console.log('[4/5] Writing consumer proof...');

  writeFileSync(join(appDir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      strict: true,
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      target: 'ES2022',
      outDir: 'dist',
      esModuleInterop: true,
      skipLibCheck: true,
    },
    include: ['src'],
  }, null, 2));

  mkdirSync(join(appDir, 'src'));

  writeFileSync(join(appDir, 'src', 'proof.ts'), `
import { Engine } from '@ai-rpg-engine/core';
import type { GameManifest, EntityState, ZoneState } from '@ai-rpg-engine/core';
import { buildCombatStack, traversalCore, statusCore, createDialogueCore } from '@ai-rpg-engine/modules';

const manifest: GameManifest = {
  id: 'isolated-proof',
  title: 'Isolated Consumer Proof',
  version: '1.0.0',
  engineVersion: '2.3.3',
  ruleset: 'proof',
  modules: ['combat', 'traversal', 'dialogue'],
  contentPacks: [],
};

const combat = buildCombatStack({
  statMapping: { attack: 'might', precision: 'agility', resolve: 'will' },
  playerId: 'hero',
  biasTags: ['undead', 'beast'],
});

const engine = new Engine({
  manifest,
  modules: [statusCore, ...combat.modules, traversalCore, createDialogueCore([])],
});

const player: EntityState = {
  id: 'hero', blueprintId: 'hero', type: 'player', name: 'Hero',
  tags: ['human', 'player'], stats: { might: 14, agility: 12, will: 10 },
  resources: { hp: 30, stamina: 20 }, statuses: [], zoneId: 'arena',
};

const enemy: EntityState = {
  id: 'wolf-1', blueprintId: 'wolf', type: 'npc', name: 'Wolf',
  tags: ['beast', 'hostile'], stats: { might: 10, agility: 14, will: 5 },
  resources: { hp: 18, stamina: 12 }, statuses: [], zoneId: 'arena',
  ai: { profileId: 'aggressive', goals: ['kill-player'], fears: [], alertLevel: 90, knowledge: {} },
};

const zones: ZoneState[] = [
  { id: 'arena', roomId: 'arena', name: 'Arena', tags: ['outdoor', 'combat-zone'], neighbors: [] },
];

engine.store.state.playerId = 'hero';
engine.store.state.locationId = 'arena';
engine.store.state.entities['hero'] = player;
engine.store.state.entities['wolf-1'] = enemy;
for (const z of zones) engine.store.state.zones[z.id] = { ...z };

const events = engine.submitAction('attack', { targetIds: ['wolf-1'] });
const aiEvents = engine.submitActionAs('wolf-1', 'attack', { targetIds: ['hero'] });

const failures: string[] = [];
if (engine.tick !== 2) failures.push('tick !== 2');
if (events.length === 0) failures.push('no player events');
if (aiEvents.length === 0) failures.push('no AI events');
if (!engine.getAvailableActions().includes('attack')) failures.push('missing attack verb');
if (!engine.getAvailableActions().includes('move')) failures.push('missing move verb');

const serialized = JSON.parse(engine.serialize());
if (!serialized.world) failures.push('missing world in serialized');
if (!serialized.actionLog || serialized.actionLog.length !== 2) failures.push('bad action log');

if (failures.length > 0) {
  console.error('FAILED:', failures.join(', '));
  process.exit(1);
}
console.log('PASSED');
`);

  // 6. Compile (type-check)
  console.log('[5/5] Compiling and running...');
  run('npx tsc --noEmit', { cwd: appDir });
  console.log('      Type-check passed');

  // Build and run
  run('npx tsc', { cwd: appDir });
  const output = run('node dist/proof.js', { cwd: appDir });
  if (!output.includes('PASSED')) {
    console.error('Proof did not output PASSED');
    process.exit(1);
  }
  console.log('      Runtime proof passed');

  console.log('\n✅ ISOLATED CONSUMER PROOF VERIFIED');
  console.log('   Artifact packages are consumer-ready.\n');
} finally {
  // Cleanup
  rmSync(tmpBase, { recursive: true, force: true });
}
