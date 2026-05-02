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
