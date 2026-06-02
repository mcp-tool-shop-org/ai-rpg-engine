// create-starter — scaffold a new starter from the published template

import * as fs from 'node:fs';
import * as path from 'node:path';

const TEMPLATE_FILES = [
    'src/index.ts',
    'src/content.ts',
    'src/ruleset.ts',
    'src/setup.ts',
    'src/starter.test.ts',
    'tsconfig.json',
    'package.json',
    'README.md',
];

/** Placeholders in template files that get replaced */
const REPLACEMENTS: Array<[RegExp, (name: string) => string]> = [
    [/starter-YOURNAME/g, (name) => `starter-${name}`],
    [/starter-template/g, (name) => `starter-${name}`],
    [/YOUR GAME TITLE/g, (name) => titleCase(name)],
    [/my-game/g, (name) => name],
    [/My Game/g, (name) => titleCase(name)],
    [/myRuleset/g, (name) => `${camelCase(name)}Ruleset`],
    [/my_game/g, (name) => name.replace(/-/g, '_')],
];

function titleCase(s: string): string {
    return s.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

function camelCase(s: string): string {
    return s.split('-').map((w, i) => i === 0 ? w : w[0].toUpperCase() + w.slice(1)).join('');
}

function resolveTemplateDir(): string {
    // 1. Check monorepo-relative path (dev mode)
    const monoRepo = path.resolve(import.meta.dirname, '../../../templates/starter');
    if (fs.existsSync(path.join(monoRepo, 'src/setup.ts'))) {
        return monoRepo;
    }

    // 2. Check for installed @ai-rpg-engine/starter-template package
    try {
        const pkgJson = path.resolve('node_modules/@ai-rpg-engine/starter-template/package.json');
        if (fs.existsSync(pkgJson)) {
            return path.dirname(pkgJson);
        }
    } catch { /* not installed */ }

    throw new Error(
        'Cannot locate starter template. Either run from the monorepo or install @ai-rpg-engine/starter-template.',
    );
}

export interface CreateStarterOptions {
    name: string;
    outDir?: string;
    force?: boolean;
    /**
     * Override the template directory. Primarily for tests; production callers
     * rely on `resolveTemplateDir()`.
     */
    templateDir?: string;
    /**
     * Validate the generated scaffold before returning. On validation failure
     * the freshly written files are cleaned up so no half-written, invalid
     * scaffold is left behind (CLI-005). Throws an Error listing the problems.
     */
    validate?: boolean;
}

export function createStarter(opts: CreateStarterOptions): string {
    const { name, force = false } = opts;

    // Validate name.
    // CLI-003: reject consecutive hyphens ("my--game"), leading hyphen
    // ("-game"), and trailing hyphens ("my-game-", "ab-"). The name must be a
    // run of lowercase-alphanumeric segments separated by single hyphens.
    if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)) {
        throw new Error(
            `Invalid starter name "${name}". Use lowercase letters and numbers in hyphen-separated segments (e.g. "my-game"). No leading, trailing, or consecutive hyphens.`,
        );
    }

    const targetDir = opts.outDir ?? path.resolve(`packages/starter-${name}`);

    // Safety: refuse to overwrite without --force.
    const targetExisted = fs.existsSync(targetDir);
    if (targetExisted && !force) {
        throw new Error(
            `Directory already exists: ${targetDir}\nUse --force to overwrite.`,
        );
    }

    // CLI-004: with --force, clear the target first so stale files from a
    // previous scaffold do not linger alongside the freshly generated ones.
    if (targetExisted && force) {
        fs.rmSync(targetDir, { recursive: true, force: true });
    }

    const templateDir = opts.templateDir ?? resolveTemplateDir();

    // Copy and transform.
    for (const relPath of TEMPLATE_FILES) {
        const srcFile = path.join(templateDir, relPath);
        if (!fs.existsSync(srcFile)) continue;

        let content = fs.readFileSync(srcFile, 'utf-8');

        // Apply replacements
        for (const [pattern, replacer] of REPLACEMENTS) {
            content = content.replace(pattern, replacer(name));
        }

        const destFile = path.join(targetDir, relPath);
        fs.mkdirSync(path.dirname(destFile), { recursive: true });
        fs.writeFileSync(destFile, content, 'utf-8');
    }

    // CLI-005: validate before handing back a scaffold. If it is invalid, undo
    // the write so callers never see a half-written, broken scaffold. We only
    // remove the directory if the tool created it (targetExisted === false);
    // a pre-existing directory the user pointed --force at is preserved.
    if (opts.validate) {
        const errors = validateScaffold(targetDir);
        if (errors.length > 0) {
            if (!targetExisted) {
                fs.rmSync(targetDir, { recursive: true, force: true });
            }
            throw new Error(
                `Scaffold validation failed:\n${errors.map((e) => `  - ${e}`).join('\n')}`,
            );
        }
    }

    return targetDir;
}

/** Validate that generated files look correct */
export function validateScaffold(dir: string): string[] {
    const errors: string[] = [];

    // Check required files exist
    const requiredFiles = ['src/setup.ts', 'src/content.ts', 'src/ruleset.ts', 'package.json'];
    for (const f of requiredFiles) {
        if (!fs.existsSync(path.join(dir, f))) {
            errors.push(`Missing file: ${f}`);
        }
    }

    // Check setup.ts contains buildCombatStack
    const setupPath = path.join(dir, 'src/setup.ts');
    if (fs.existsSync(setupPath)) {
        const setup = fs.readFileSync(setupPath, 'utf-8');
        if (!setup.includes('buildCombatStack')) {
            errors.push('setup.ts missing buildCombatStack — composition contract broken');
        }
        if (!setup.includes('STARTER-OWNED SYSTEMS')) {
            errors.push('setup.ts missing starter-owned systems section');
        }
        if (!setup.includes('COMPOSITION CONTRACT')) {
            errors.push('setup.ts missing composition contract header');
        }
    }

    // Check no template placeholders remain
    const placeholders = ['YOURNAME', 'YOUR GAME TITLE'];
    for (const f of requiredFiles) {
        const filePath = path.join(dir, f);
        if (!fs.existsSync(filePath)) continue;
        const content = fs.readFileSync(filePath, 'utf-8');
        for (const ph of placeholders) {
            if (content.includes(ph)) {
                errors.push(`Unreplaced placeholder "${ph}" in ${f}`);
            }
        }
    }

    return errors;
}

/** CLI entry point */
export function runCreateStarter(args: string[]): void {
    const name = args.find((a) => !a.startsWith('-'));
    const force = args.includes('--force');
    const outDir = args.find((a) => a.startsWith('--out='))?.split('=')[1];

    if (!name) {
        console.log('Usage: ai-rpg-engine create-starter <name> [--force] [--out=<dir>]');
        console.log('');
        console.log('Creates a new starter from the template.');
        console.log('');
        console.log('Examples:');
        console.log('  ai-rpg-engine create-starter western');
        console.log('  ai-rpg-engine create-starter space-opera --out=./my-project');
        console.log('');
        console.log('The generated starter uses buildCombatStack by default');
        console.log('and includes a marked starter-owned systems section.');
        process.exit(1);
    }

    try {
        // validate:true makes createStarter clean up on validation failure, so a
        // failed run never leaves a half-written scaffold behind (CLI-005).
        const targetDir = createStarter({
            name,
            force,
            outDir: outDir ? path.resolve(outDir) : undefined,
            validate: true,
        });

        console.log(`✓ Created starter-${name} at ${path.relative(process.cwd(), targetDir)}`);
        console.log('');
        console.log('Next steps:');
        console.log(`  1. cd ${path.relative(process.cwd(), targetDir)}`);
        console.log('  2. Edit src/ruleset.ts — define your stats and resources');
        console.log('  3. Edit src/content.ts — add your entities and zones');
        console.log('  4. Edit src/setup.ts — wire your custom modules');
        console.log('  5. npm install && npx tsc --noEmit');
        console.log('  6. npx vitest run');
    } catch (err) {
        console.error(`✗ ${(err as Error).message}`);
        process.exit(1);
    }
}
