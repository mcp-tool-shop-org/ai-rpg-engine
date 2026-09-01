import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { validateRulesetDefinition, validateGameContent, validateAbilityPack, loadContent, loadContentFromFile } from '@ai-rpg-engine/content-schema';
import type { AbilityDefinition, DialogueDefinition } from '@ai-rpg-engine/content-schema';
import { selectIntent } from '@ai-rpg-engine/modules';
import type { CognitionState } from '@ai-rpg-engine/modules';
import { myRuleset } from './ruleset.js';
import { createGame, myIntentProfiles } from './setup.js';
import {
    pack,
    toContentPack,
    buildCatalog,
    itemCatalog,
    districts,
    progressionTree,
    statusDefinitions,
} from './content.js';

describe('starter template', () => {
    it('ruleset validates against schema', () => {
        const r = validateRulesetDefinition(myRuleset);
        expect(r.ok).toBe(true);
        expect(r.errors).toHaveLength(0);
    });

    it('declares combat stats mapped in buildCombatStack', () => {
        const statIds = myRuleset.stats.map((s) => s.id);
        expect(statIds).toContain('power');
        expect(statIds).toContain('speed');
        expect(statIds).toContain('grit');
    });

    it('declares a starter-specific resource', () => {
        const resIds = myRuleset.resources.map((r) => r.id);
        expect(resIds).toContain('tension');
    });

    it('createGame boots without throwing', () => {
        const engine = createGame(1);
        expect(engine).toBeDefined();
    });

    it('F-749aba8e: pack.factions seeds WorldState.factions for controllingFaction my-game', () => {
        const engine = createGame(1);
        expect(engine.store.state.factions['my-game']).toEqual({
            id: 'my-game',
            name: 'My Game',
            reputation: 0,
            disposition: 'neutral',
        });
    });

    it('tension rises when combat damage lands (tension-pressure fires)', () => {
        const engine = createGame(1);
        expect(engine.world.entities['player']?.resources.tension).toBe(0);

        // Walk into the danger zone and fight. combat-core emits
        // 'combat.damage.applied' whenever a hit lands — that is the event
        // the tension-pressure module listens on.
        engine.submitAction('move', { targetIds: ['danger-zone'] });
        for (let i = 0; i < 8; i++) {
            engine.submitAction('attack', { targetIds: ['grunt'] });
            if ((engine.world.entities['player']?.resources.tension ?? 0) > 0) break;
        }

        // Meta-test property: deleting the tension-pressure listener in
        // setup.ts turns this RED — nothing else writes the tension resource.
        expect(engine.world.entities['player']?.resources.tension).toBeGreaterThan(0);
    });
});

// ═══════════════════════════════════════════════════════════════════
// CROSS-REFERENCE INTEGRITY
// The schema test above checks each piece in isolation. These tests check
// the connections BETWEEN pieces: dangling zone neighbors, duplicate ids,
// dialogue speakers that name an entity's display name instead of its id,
// abilities that reference undeclared stats/resources. They validate the
// REAL composed game (createGame()'s world state), so they automatically
// cover content you add — as long as you keep the two lists below in sync.
//
// Why this matters: dialogue-core finds a dialogue by matching its
// speakers[] against the target ENTITY ID. Writing the display name
// ('Grunt') instead of the id ('grunt') doesn't error — "talk to NPC"
// just silently reports "has nothing to say". validateGameContent catches
// exactly that class of bug at test time.
// ═══════════════════════════════════════════════════════════════════
describe('starter template — cross-reference integrity', () => {
    // Register your DialogueDefinitions here as you write them. Remember:
    // speakers: ['grunt'] (entity id), never speakers: ['Grunt'] (name).
    const myDialogues: DialogueDefinition[] = [];
    // Register your AbilityDefinitions here as you write them.
    const myAbilities: AbilityDefinition[] = [];

    function authoredPack() {
        return {
            ...toContentPack(),
            dialogues: [...(toContentPack().dialogues ?? []), ...myDialogues],
            abilities: [...(toContentPack().abilities ?? []), ...myAbilities],
        };
    }

    it('F-407729dc: authored pack is loadContent-valid (not a cast of live store state)', () => {
        const r = loadContent(pack);
        expect(r.ok).toBe(true);
        expect(r.errors).toEqual([]);
        expect(loadContent(toContentPack()).ok).toBe(true);
    });

    it('F-407729dc: src/content.json is a loadable fixture', () => {
        const file = fileURLToPath(new URL('./content.json', import.meta.url));
        const r = loadContentFromFile(file);
        expect(r.ok).toBe(true);
        expect(r.errors).toEqual([]);
    });

    it('F-82b17cb3: src/content.json equals toContentPack() (full pack, not a subset)', () => {
        const file = fileURLToPath(new URL('./content.json', import.meta.url));
        const fromFile = loadContentFromFile(file);
        expect(fromFile.ok).toBe(true);
        expect(JSON.parse(JSON.stringify(fromFile.pack))).toEqual(JSON.parse(JSON.stringify(toContentPack())));
    });

    it('zones, entities, dialogues, and abilities have no dangling references or duplicate ids', () => {
        const result = validateGameContent(authoredPack());
        expect(result.errors).toEqual([]);
        expect(result.ok).toBe(true);
    });

    it('has no one-way zone passages (neighbor symmetry advisory)', () => {
        // A zone listing a neighbor that doesn't list it back is legal but
        // almost always a mistake — the player can walk in and never back out.
        const result = validateGameContent(authoredPack());
        expect(result.advisories).toEqual([]);
    });

    it('abilities reference only stats/resources declared in the ruleset', () => {
        const result = validateAbilityPack(myAbilities, myRuleset);
        expect(result.errors).toEqual([]);
    });
});

// ═══════════════════════════════════════════════════════════════════
// INTENT PROFILE WIRING
// Enemies act only if their ai.profileId resolves to a profile provided
// in setup.ts's `cognition.profiles`. An empty profiles list is the #1
// reason a pack's enemies stand still forever. These tests keep every
// declared profileId resolvable as you add content.
// ═══════════════════════════════════════════════════════════════════
describe('starter template — intent profile wiring', () => {
    it('provides a non-empty intent profile list to cognition', () => {
        expect(myIntentProfiles.length).toBeGreaterThan(0);
        for (const profile of myIntentProfiles) {
            expect(typeof profile.id).toBe('string');
            expect(typeof profile.evaluate).toBe('function');
        }
    });

    it('every hostile entity declares a profileId that resolves to a provided profile', () => {
        const engine = createGame(1);
        const hostiles = Object.values(engine.world.entities).filter(
            (e) => e.type === 'enemy' || e.tags.includes('enemy'),
        );
        expect(hostiles.length).toBeGreaterThan(0);

        const provided = new Set(myIntentProfiles.map((p) => p.id));
        for (const hostile of hostiles) {
            expect(hostile.ai?.profileId, `${hostile.id} must declare ai.profileId`).toBeTruthy();
            expect(
                provided.has(hostile.ai!.profileId),
                `${hostile.id} declares "${hostile.ai!.profileId}" — not in cognition.profiles`,
            ).toBe(true);
        }
    });

    it('resolved profiles produce intents — hostiles can act on an intruder', () => {
        const engine = createGame(1);
        const world = engine.world;
        const player = world.entities[world.playerId || 'player'];
        expect(player).toBeDefined();

        for (const hostile of Object.values(world.entities)) {
            if (!(hostile.type === 'enemy' || hostile.tags.includes('enemy'))) continue;
            const profile = myIntentProfiles.find((p) => p.id === hostile.ai?.profileId);
            expect(profile, `${hostile.id} must resolve an intent profile`).toBeDefined();

            // Stand the player in the hostile's zone as a believed-hostile intruder.
            player!.zoneId = hostile.zoneId;
            const cognition: CognitionState = {
                beliefs: [{
                    subject: player!.id,
                    key: 'hostile',
                    value: true,
                    confidence: 1,
                    source: 'observed',
                    tick: world.meta.tick,
                }],
                memories: [],
                currentIntent: null,
                morale: 80,
                suspicion: 60,
            };
            const intent = selectIntent(hostile, cognition, world, profile!);
            expect(intent, `${hostile.id} (${profile!.id}) selected no intent`).not.toBeNull();
        }
    });
});

// ═══════════════════════════════════════════════════════════════════
// STANDALONE SCAFFOLD
// The scaffold must work OUTSIDE the engine monorepo: its tsconfig may
// not reach for ../../tsconfig.json or ../../packages/* (that is TS5083
// for anyone who scaffolds a project of their own), and its package.json
// must carry real dependency versions plus the typescript/vitest
// devDependencies the printed "next steps" rely on.
// ═══════════════════════════════════════════════════════════════════
describe('starter template — standalone scaffold', () => {
    const read = (rel: string): string =>
        readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf-8');

    it('tsconfig is self-contained (no extends, no references, no ../.. paths)', () => {
        const raw = read('../tsconfig.json');
        expect(raw).not.toContain('../..');
        const tsconfig = JSON.parse(raw) as Record<string, unknown>;
        expect(tsconfig.extends).toBeUndefined();
        expect(tsconfig.references).toBeUndefined();
        expect(tsconfig.compilerOptions).toBeDefined();
        // The inlined options every scaffold needs to compile on its own:
        const opts = tsconfig.compilerOptions as Record<string, unknown>;
        expect(opts.module).toBeDefined();
        expect(opts.moduleResolution).toBeDefined();
        expect(opts.strict).toBe(true);
    });

    it('package.json declares real dependency versions and its own toolchain', () => {
        const pkg = JSON.parse(read('../package.json')) as {
            dependencies?: Record<string, string>;
            devDependencies?: Record<string, string>;
        };
        const deps = pkg.dependencies ?? {};
        expect(Object.keys(deps).length).toBeGreaterThan(0);
        for (const [name, range] of Object.entries(deps)) {
            expect(range, `${name} must pin a real semver range, not "*"`).not.toBe('*');
        }
        const devDeps = pkg.devDependencies ?? {};
        expect(devDeps.typescript, 'typescript devDependency required for `npx tsc`').toBeTruthy();
        expect(devDeps.vitest, 'vitest devDependency required for `npx vitest`').toBeTruthy();
    });

    it('README does not send users into the monorepo', () => {
        const readme = read('../README.md');
        expect(readme).not.toContain('../../');
        expect(readme.toLowerCase()).not.toContain('copy this directory to `packages/');
        expect(readme).not.toMatch(/cp -r templates\/starter/);
    });

    it('F-3dcac63f: first-run README is the game title, not a scaffold-yourself instruction', () => {
        const readme = read('../README.md');
        expect(readme).toMatch(/^# My Game$/m);
        expect(readme).not.toMatch(/scaffold your own copy/i);
        expect(readme).not.toContain('templates/starter');
        expect(readme).toContain('standalone');
        expect(readme).toContain('Getting started');
    });

    it('F-3dcac63f: packMeta carries the catalog fields getPackSummaries() lists on', () => {
        const src = read('./content.ts');
        for (const field of ['tagline', 'genres', 'difficulty', 'tones', 'tags', 'description', 'version', 'narratorTone']) {
            expect(src, `packMeta must declare ${field}`).toMatch(new RegExp(`\\b${field}\\s*:`));
        }
        const index = read('./index.ts');
        expect(index).toContain('@ai-rpg-engine/starter-template');
        expect(index).not.toContain('starter-YOURNAME');
    });

    it('F-2abeea73: barrel exports session catalogs under stable names', () => {
        expect(buildCatalog.archetypes.length).toBeGreaterThanOrEqual(1);
        expect(buildCatalog.backgrounds.length).toBeGreaterThanOrEqual(1);
        expect(itemCatalog.items.length).toBeGreaterThanOrEqual(1);
        expect(districts.length).toBeGreaterThanOrEqual(1);
        expect(progressionTree.nodes.length).toBeGreaterThanOrEqual(1);
        expect(Array.isArray(statusDefinitions)).toBe(true);
        const index = read('./index.ts');
        for (const name of ['buildCatalog', 'itemCatalog', 'districts', 'progressionTree', 'statusDefinitions', 'pack', 'toContentPack']) {
            expect(index, `index.ts must re-export ${name}`).toContain(name);
        }
        const pkg = JSON.parse(read('../package.json')) as { dependencies?: Record<string, string> };
        const deps = pkg.dependencies ?? {};
        expect(deps['@ai-rpg-engine/pack-registry']).toBeTruthy();
        expect(deps['@ai-rpg-engine/character-creation']).toBeTruthy();
        expect(deps['@ai-rpg-engine/equipment']).toBeTruthy();
    });
});

// ═══════════════════════════════════════════════════════════════════
// CROSS-INSTANCE STATE ISOLATION
// setup.ts inserts entities from module-level constants. A shallow spread
// (`addEntity({ ...enemy })`) shares the nested resources/stats/statuses
// objects across every engine built in one process, so combat damage (or
// the NPC turn driver killing the grunt) in engine A would permanently
// mutate the constant and a LATER createGame() would boot with a dead
// grunt. structuredClone at insertion is the fix. Same class as F-71ec5dcd.
// ═══════════════════════════════════════════════════════════════════
describe('starter template — cross-instance state isolation', () => {
    it('killing the enemy in engine A does not carry into a fresh engine B', () => {
        const a = createGame(1);
        const fullHp = a.world.entities['grunt'].resources.hp;
        expect(fullHp).toBeGreaterThan(0);

        a.world.entities['grunt'].resources.hp = 0;

        const b = createGame(1);
        expect(b.world.entities['grunt'].resources.hp).toBe(fullHp);
        expect(b.world.entities['grunt'].resources)
            .not.toBe(a.world.entities['grunt'].resources);
    });
});

// ═══════════════════════════════════════════════════════════════════
// IDENTITY STAMP (F-bc7b8ab1)
// Pin, not a bug fix: this must read identically before and after removing
// setup.ts's post-applyContentPack `engine.store.state.playerId = 'player';
// engine.store.state.locationId = 'start';` lines — content.ts's
// placements[] places { entityId: 'player', zoneId: 'start' }, and pack
// carries exactly one type:'player' entity, so applyContentPack's own
// identity stamp (F-67786a6c) already derives the same values. The manual
// lines were the pre-fix-style override the stamp was written to obsolete —
// this is the scaffold every new game is copied from, so the leftover
// pattern would otherwise keep propagating into new starters.
// ═══════════════════════════════════════════════════════════════════
describe('starter template — identity stamp owns playerId/locationId (F-bc7b8ab1)', () => {
    it('boots with playerId "player" and locationId "start" from applyContentPack\'s own identity stamp, with no manual override line', () => {
        const engine = createGame(1);
        expect(engine.world.playerId).toBe('player');
        expect(engine.world.locationId).toBe('start');
    });
});
