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
 *   4. Writes a TypeScript consumer file (README quickstart pattern, PLUS
 *      the per-entity rule-profile surface: two ruleProfileId entities
 *      resolving through their own mappings, buildProfile/validateProfileSet)
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
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const PACKAGES = ['core', 'modules', 'content-schema', 'character-profile'];

// The proof's manifest declares the engine version it targets. Read it from
// the packages being packed so the proof can never drift stale again.
const ENGINE_VERSION = JSON.parse(
  readFileSync(join(ROOT, 'packages', 'core', 'package.json'), 'utf-8'),
).version;

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
import type { GameManifest, EntityState, ZoneState, RuleProfile } from '@ai-rpg-engine/core';
import { buildCombatStack, traversalCore, statusCore, createDialogueCore, buildProfile, validateProfileSet } from '@ai-rpg-engine/modules';
import type { Profile } from '@ai-rpg-engine/modules';

const manifest: GameManifest = {
  id: 'isolated-proof',
  title: 'Isolated Consumer Proof',
  version: '1.0.0',
  engineVersion: '${ENGINE_VERSION}',
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

// --- Per-entity rule profiles at the artifact boundary (CR-1) ---
// A might fighter and a will mystic in ONE fight, each resolving through its
// OWN statMapping via world.ruleProfiles + entity.ruleProfileId. Both carry
// the world attack stat (edge = 2), so if the installed artifact resolved a
// single shared mapping, both would deal 2 — the assertions below prove the
// flagship feature survives packaging, not just its types.

const might: RuleProfile = { statMapping: { attack: 'brawn', precision: 'reflex', resolve: 'grit' } };
const will: RuleProfile = { statMapping: { attack: 'psyche', precision: 'reflex', resolve: 'calm' } };

const profileCombat = buildCombatStack({
  statMapping: { attack: 'edge', precision: 'reflex', resolve: 'lore' },
  playerId: 'fighter',
});

const profileEngine = new Engine({
  manifest: { ...manifest, id: 'isolated-profile-proof' },
  modules: [statusCore, ...profileCombat.modules],
});

const fighter: EntityState = {
  id: 'fighter', blueprintId: 'fighter', type: 'player', name: 'Fighter',
  tags: ['human'], faction: 'party', ruleProfileId: 'might',
  stats: { brawn: 9, edge: 2, reflex: 50, lore: 0 },
  resources: { hp: 30, stamina: 5 }, statuses: [], zoneId: 'yard',
};
const mystic: EntityState = {
  id: 'mystic', blueprintId: 'mystic', type: 'ally', name: 'Mystic',
  tags: ['human'], faction: 'party', ruleProfileId: 'will',
  stats: { psyche: 7, edge: 2, reflex: 50, lore: 0 },
  resources: { hp: 20, stamina: 5 }, statuses: [], zoneId: 'yard',
};
const foe: EntityState = {
  id: 'foe', blueprintId: 'foe', type: 'enemy', name: 'Foe',
  tags: ['beast'], stats: { edge: 0, reflex: 0, lore: 0 },
  resources: { hp: 40, stamina: 5 }, statuses: [], zoneId: 'yard',
};

profileEngine.store.state.playerId = 'fighter';
profileEngine.store.state.locationId = 'yard';
profileEngine.store.state.entities['fighter'] = fighter;
profileEngine.store.state.entities['mystic'] = mystic;
profileEngine.store.state.entities['foe'] = foe;
profileEngine.store.state.zones['yard'] = { id: 'yard', roomId: 'yard', name: 'Yard', tags: [], neighbors: [] };
profileEngine.store.state.ruleProfiles = { might, will };

const damageOf = (events: { type: string; payload: Record<string, unknown> }[]): number | undefined =>
  events.find((e) => e.type === 'combat.damage.applied')?.payload.damage as number | undefined;

const fighterDmg = damageOf(profileEngine.submitActionAs('fighter', 'attack', { targetIds: ['foe'] }));
const mysticDmg = damageOf(profileEngine.submitActionAs('mystic', 'attack', { targetIds: ['foe'] }));

if (fighterDmg !== 9) failures.push('fighter damage ' + fighterDmg + ' !== 9 (attack should resolve via its own profile: might -> brawn)');
if (mysticDmg !== 7) failures.push('mystic damage ' + mysticDmg + ' !== 7 (attack should resolve via its own profile: will -> psyche)');
if (fighterDmg === 2 || mysticDmg === 2) failures.push('an attack resolved via the shared world mapping (edge) — per-entity resolution is inert in the artifact');

// Profiles are data — they must ride the save.
const profileSave = JSON.parse(profileEngine.serialize());
if (!profileSave.world?.state?.ruleProfiles?.will) failures.push('ruleProfiles missing from serialized state');
if (profileSave.world?.state?.entities?.mystic?.ruleProfileId !== 'will') failures.push('ruleProfileId missing from serialized entity');

// The profile authoring surface packs too: buildProfile + validateProfileSet.
const sentinel = buildProfile({
  id: 'sentinel', name: 'Sentinel',
  statMapping: { attack: 'brawn', precision: 'reflex', resolve: 'grit' },
  abilities: [{
    id: 'bulwark-slam', name: 'Bulwark Slam', verb: 'use-ability',
    tags: ['combat', 'damage'], target: { type: 'single' },
    costs: [{ resourceId: 'stamina', amount: 2 }], cooldown: 1,
    effects: [{ type: 'damage', params: { amount: 5 } }],
  }],
});
const lorekeeper = buildProfile({
  id: 'lorekeeper', name: 'Lorekeeper',
  statMapping: { attack: 'psyche', precision: 'reflex', resolve: 'calm' },
  abilities: [{
    id: 'mind-spike', name: 'Mind Spike', verb: 'use-ability',
    tags: ['combat', 'damage'], target: { type: 'single' },
    costs: [{ resourceId: 'stamina', amount: 2 }], cooldown: 1,
    effects: [{ type: 'damage', params: { amount: 4 } }],
  }],
});
if (sentinel.warnings.length > 0) failures.push('buildProfile(sentinel) warned: ' + sentinel.warnings.join('; '));
if (lorekeeper.warnings.length > 0) failures.push('buildProfile(lorekeeper) warned: ' + lorekeeper.warnings.join('; '));

const packagedProfiles: Profile[] = [sentinel.profile, lorekeeper.profile];
const profileSet = validateProfileSet(packagedProfiles);
if (!profileSet.ok) failures.push('validateProfileSet rejected a coherent set: ' + profileSet.errors.map((e) => e.message).join('; '));

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
  console.log('   Artifact packages are consumer-ready.');
  console.log('   Per-entity rule profiles (CR-1) resolve correctly from the packed tarballs.\n');
} finally {
  // Cleanup
  rmSync(tmpBase, { recursive: true, force: true });
}
