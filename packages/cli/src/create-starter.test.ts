import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createStarter, validateScaffold } from './create-starter.js';

describe('create-starter', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-rpg-starter-test-'));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('scaffolds a named starter with correct package name', () => {
        const outDir = path.join(tmpDir, 'starter-western');
        createStarter({ name: 'western', outDir });

        const pkg = JSON.parse(fs.readFileSync(path.join(outDir, 'package.json'), 'utf-8'));
        expect(pkg.name).toBe('@ai-rpg-engine/starter-western');
    });

    it('replaces template placeholders in all files', () => {
        const outDir = path.join(tmpDir, 'starter-space-opera');
        createStarter({ name: 'space-opera', outDir });

        const setup = fs.readFileSync(path.join(outDir, 'src/setup.ts'), 'utf-8');
        expect(setup).not.toContain('YOURNAME');
        expect(setup).not.toContain('YOUR GAME TITLE');

        const ruleset = fs.readFileSync(path.join(outDir, 'src/ruleset.ts'), 'utf-8');
        expect(ruleset).toContain('space-opera');
        expect(ruleset).not.toContain('my-game');

        const content = fs.readFileSync(path.join(outDir, 'src/content.ts'), 'utf-8');
        expect(content).toContain('space-opera');
    });

    it('preserves buildCombatStack as default', () => {
        const outDir = path.join(tmpDir, 'starter-dungeon');
        createStarter({ name: 'dungeon', outDir });

        const setup = fs.readFileSync(path.join(outDir, 'src/setup.ts'), 'utf-8');
        expect(setup).toContain('buildCombatStack');
        expect(setup).toContain('statMapping');
    });

    it('preserves starter-owned systems section', () => {
        const outDir = path.join(tmpDir, 'starter-dungeon');
        createStarter({ name: 'dungeon', outDir });

        const setup = fs.readFileSync(path.join(outDir, 'src/setup.ts'), 'utf-8');
        expect(setup).toContain('STARTER-OWNED SYSTEMS');
        expect(setup).toContain('COMPOSITION CONTRACT');
    });

    it('refuses to overwrite existing directory without --force', () => {
        const outDir = path.join(tmpDir, 'starter-exists');
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(path.join(outDir, 'marker.txt'), 'existing');

        expect(() => createStarter({ name: 'exists', outDir })).toThrow(/already exists/);
    });

    it('overwrites with --force', () => {
        const outDir = path.join(tmpDir, 'starter-force');
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(path.join(outDir, 'old.txt'), 'old');

        createStarter({ name: 'force', outDir, force: true });

        expect(fs.existsSync(path.join(outDir, 'src/setup.ts'))).toBe(true);
    });

    it('rejects invalid names', () => {
        const outDir = path.join(tmpDir, 'starter-bad');
        expect(() => createStarter({ name: 'Bad Name!', outDir })).toThrow(/Invalid starter name/);
        expect(() => createStarter({ name: '123abc', outDir })).toThrow(/Invalid starter name/);
        expect(() => createStarter({ name: '', outDir })).toThrow(/Invalid starter name/);
    });

    // CLI-003 — name validator must reject consecutive and trailing hyphens
    it('rejects names with consecutive or trailing hyphens', () => {
        const outDir = path.join(tmpDir, 'starter-hyphen');
        expect(() => createStarter({ name: 'my--game', outDir })).toThrow(/Invalid starter name/);
        expect(() => createStarter({ name: 'my-game-', outDir })).toThrow(/Invalid starter name/);
        expect(() => createStarter({ name: 'ab-', outDir })).toThrow(/Invalid starter name/);
        expect(() => createStarter({ name: '-leading', outDir })).toThrow(/Invalid starter name/);
        expect(() => createStarter({ name: 'a---b', outDir })).toThrow(/Invalid starter name/);
    });

    it('accepts well-formed single- and multi-segment names', () => {
        // sanity: the tightened validator must still accept legitimate names
        expect(() => createStarter({ name: 'western', outDir: path.join(tmpDir, 'w1') })).not.toThrow();
        expect(() => createStarter({ name: 'space-opera', outDir: path.join(tmpDir, 'w2') })).not.toThrow();
        expect(() => createStarter({ name: 'dark-souls-2', outDir: path.join(tmpDir, 'w3') })).not.toThrow();
    });

    // CLI-004 — --force must not leave stale files from a previous scaffold
    it('--force clears stale files from the target directory', () => {
        const outDir = path.join(tmpDir, 'starter-stale');
        fs.mkdirSync(path.join(outDir, 'src'), { recursive: true });
        // A leftover file that is NOT part of the template — must be gone after --force.
        fs.writeFileSync(path.join(outDir, 'src/leftover-orphan.ts'), 'export const stale = true;');
        fs.writeFileSync(path.join(outDir, 'STALE_ROOT.md'), 'stale');

        createStarter({ name: 'stale', outDir, force: true });

        expect(fs.existsSync(path.join(outDir, 'src/leftover-orphan.ts'))).toBe(false);
        expect(fs.existsSync(path.join(outDir, 'STALE_ROOT.md'))).toBe(false);
        // The real scaffold is present
        expect(fs.existsSync(path.join(outDir, 'src/setup.ts'))).toBe(true);
    });

    // CLI-005 — a validation failure must not leave a half-written invalid scaffold
    it('does not leave a partial scaffold when validation would fail', () => {
        // Force validation failure by pointing at a template dir whose setup.ts
        // is missing the required composition-contract markers.
        const fakeTemplate = path.join(tmpDir, 'fake-template');
        fs.mkdirSync(path.join(fakeTemplate, 'src'), { recursive: true });
        // Minimal files so resolveTemplateDir-independent copy still produces something,
        // but setup.ts lacks buildCombatStack -> validateScaffold returns errors.
        fs.writeFileSync(path.join(fakeTemplate, 'src/setup.ts'), '// no markers here\nexport const x = 1;\n');
        fs.writeFileSync(path.join(fakeTemplate, 'src/content.ts'), 'export const c = 1;\n');
        fs.writeFileSync(path.join(fakeTemplate, 'src/ruleset.ts'), 'export const r = 1;\n');
        fs.writeFileSync(path.join(fakeTemplate, 'src/index.ts'), 'export const i = 1;\n');
        fs.writeFileSync(path.join(fakeTemplate, 'src/starter.test.ts'), '// test\n');
        fs.writeFileSync(path.join(fakeTemplate, 'package.json'), '{"name":"my-game"}\n');
        fs.writeFileSync(path.join(fakeTemplate, 'tsconfig.json'), '{}\n');
        fs.writeFileSync(path.join(fakeTemplate, 'README.md'), '# my-game\n');

        const outDir = path.join(tmpDir, 'starter-partial');
        expect(() =>
            createStarter({ name: 'partial', outDir, templateDir: fakeTemplate, validate: true }),
        ).toThrow(/validation/i);

        // The directory must NOT contain a half-written scaffold.
        expect(fs.existsSync(outDir)).toBe(false);
    });

    it('does not delete a pre-existing target directory on validation failure', () => {
        // If the user pointed --force at an existing dir and validation fails,
        // cleanup must not nuke a directory the tool did not create.
        const fakeTemplate = path.join(tmpDir, 'fake-template-2');
        fs.mkdirSync(path.join(fakeTemplate, 'src'), { recursive: true });
        fs.writeFileSync(path.join(fakeTemplate, 'src/setup.ts'), '// no markers\nexport const x = 1;\n');
        fs.writeFileSync(path.join(fakeTemplate, 'src/content.ts'), 'export const c = 1;\n');
        fs.writeFileSync(path.join(fakeTemplate, 'src/ruleset.ts'), 'export const r = 1;\n');
        fs.writeFileSync(path.join(fakeTemplate, 'package.json'), '{"name":"my-game"}\n');

        const outDir = path.join(tmpDir, 'starter-preexisting');
        fs.mkdirSync(outDir, { recursive: true });

        expect(() =>
            createStarter({ name: 'preexisting', outDir, templateDir: fakeTemplate, validate: true, force: true }),
        ).toThrow(/validation/i);

        // Pre-existing dir is preserved (it existed before the tool ran).
        expect(fs.existsSync(outDir)).toBe(true);
    });

    it('passes scaffold validation', () => {
        const outDir = path.join(tmpDir, 'starter-valid');
        createStarter({ name: 'valid', outDir });

        const errors = validateScaffold(outDir);
        expect(errors).toHaveLength(0);
    });

    it('generated ruleset name is camelCased', () => {
        const outDir = path.join(tmpDir, 'starter-dark-souls');
        createStarter({ name: 'dark-souls', outDir });

        const ruleset = fs.readFileSync(path.join(outDir, 'src/ruleset.ts'), 'utf-8');
        expect(ruleset).toContain('darkSoulsRuleset');

        const index = fs.readFileSync(path.join(outDir, 'src/index.ts'), 'utf-8');
        expect(index).toContain('darkSoulsRuleset');
    });
});
