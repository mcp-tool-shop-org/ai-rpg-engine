// create-starter — scaffold a new starter from the published template

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';

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

/** One value-flag: space form (`--flag value`) or equals form (`--flag=value`).
 *  Same shape as sidecar/validate `readFlag` — `indexOf('=')` on a bare `--out`
 *  used to treat the next argv slot as missing (F-25af9571). */
function readFlag(args: string[], flag: string): {
    present: boolean;
    raw: string | undefined;
    valueSlot: number;
} {
    const eq = `${flag}=`;
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === flag) return { present: true, raw: args[i + 1], valueSlot: i + 1 };
        if (arg.startsWith(eq)) return { present: true, raw: arg.slice(eq.length), valueSlot: -1 };
    }
    return { present: false, raw: undefined, valueSlot: -1 };
}

function samePath(a: string, b: string): boolean {
    const na = path.resolve(a);
    const nb = path.resolve(b);
    return process.platform === 'win32' ? na.toLowerCase() === nb.toLowerCase() : na === nb;
}

/** True when `targetDir` is cwd or an ancestor of cwd (`--out=.` / `--out=..`). */
function isCwdOrAncestor(targetDir: string): boolean {
    const resolved = path.resolve(targetDir);
    const cwd = path.resolve(process.cwd());
    if (samePath(resolved, cwd)) return true;
    const rel = path.relative(resolved, cwd);
    if (rel === '') return true;
    if (path.isAbsolute(rel)) return false;
    return rel.split(/[\\/]/)[0] !== '..';
}

function looksLikeStarterScaffold(dir: string): boolean {
    return fs.existsSync(path.join(dir, 'src/setup.ts'));
}

function isEmptyDir(dir: string): boolean {
    try {
        return fs.readdirSync(dir).length === 0;
    } catch {
        return false;
    }
}

/**
 * CS-F1f: locate the starter template from ANY working directory.
 *
 * The old resolver only checked the monorepo-relative path and the CWD's
 * node_modules — so `npx @ai-rpg-engine/cli create-starter my-game` from a
 * clean directory failed with "Cannot locate starter template": npx installs
 * the CLI (and its dependencies) into its own cache, not the user's cwd.
 *
 * The load-bearing fix is step 2: resolve @ai-rpg-engine/starter-template
 * through Node's own resolution ANCHORED AT THIS FILE (createRequire), which
 * walks up from wherever the CLI package is actually installed — npx cache,
 * global install, or a project's node_modules. The CLI declares
 * starter-template as a dependency, so it is always installed alongside.
 *
 * `resolve` is injectable for tests (simulating an npx-style layout without
 * publishing anything).
 */
export function resolveTemplateDir(
    opts: { resolve?: (spec: string) => string; monorepoDir?: string } = {},
): string {
    // 1. Monorepo-relative path (dev mode: running from packages/cli/{src,dist}).
    //    `monorepoDir` is injectable so tests can force the fallback chain.
    const monoRepo = opts.monorepoDir ?? path.resolve(import.meta.dirname, '../../../templates/starter');
    if (fs.existsSync(path.join(monoRepo, 'src/setup.ts'))) {
        return monoRepo;
    }

    // 2. Node resolution anchored at the CLI package itself — works from any
    //    cwd because it searches the CLI's OWN node_modules chain, exactly
    //    where npm/npx placed the dependency. starter-template has no
    //    "exports" map, so its package.json is a resolvable subpath.
    const resolvePkg = opts.resolve ?? ((spec: string) => createRequire(import.meta.url).resolve(spec));
    try {
        const pkgJson = resolvePkg('@ai-rpg-engine/starter-template/package.json');
        const dir = path.dirname(pkgJson);
        if (fs.existsSync(path.join(dir, 'src/setup.ts'))) {
            return dir;
        }
    } catch { /* not resolvable from the CLI's install — try the cwd */ }

    // 3. Last resort: the working directory's node_modules (a project that
    //    installed starter-template directly but runs a globally-linked CLI
    //    whose own tree lacks it).
    const cwdPkgJson = path.resolve('node_modules/@ai-rpg-engine/starter-template/package.json');
    if (fs.existsSync(cwdPkgJson)) {
        return path.dirname(cwdPkgJson);
    }

    throw new Error(
        'Cannot locate starter template. Reinstall the CLI (npm i -g @ai-rpg-engine/cli or use npx) so ' +
        '@ai-rpg-engine/starter-template is installed with it, run from the ai-rpg-engine monorepo, or ' +
        'npm install @ai-rpg-engine/starter-template in the current project.',
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

    // F-6394381d: --force must not rmSync cwd / a parent of cwd / an occupied
    // project tree. Prefer replacing TEMPLATE_FILES only, and only when the
    // target already looks like a starter scaffold (has src/setup.ts).
    if (targetExisted && force) {
        if (isCwdOrAncestor(targetDir)) {
            throw new Error(
                `--force refuses to wipe "${targetDir}" because it is the current working directory or a parent of it.\n` +
                'Hint: pass --out <dir> or --out=<dir> to a dedicated folder, not "." or "..".',
            );
        }
        if (!isEmptyDir(targetDir) && !looksLikeStarterScaffold(targetDir)) {
            throw new Error(
                `--force refuses to wipe "${targetDir}" — it is not an empty directory or an existing starter scaffold (missing src/setup.ts).\n` +
                'Hint: --force only replaces template files in a previous scaffold. Pass --out <dir> or --out=<dir> to an empty folder.',
            );
        }
        for (const relPath of TEMPLATE_FILES) {
            const dest = path.join(targetDir, relPath);
            if (fs.existsSync(dest)) fs.rmSync(dest, { force: true });
        }
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

function printCreateStarterHelp(): void {
    console.log('Usage: ai-rpg-engine create-starter <name> [--force] [--out <dir>]');
    console.log('');
    console.log('Creates a new starter from the template.');
    console.log('');
    console.log('Examples:');
    console.log('  ai-rpg-engine create-starter western');
    console.log('  ai-rpg-engine create-starter space-opera --out ./my-project');
    console.log('  ai-rpg-engine create-starter space-opera --out=./my-project');
    console.log('');
    console.log('The generated starter uses buildCombatStack by default');
    console.log('and includes a marked starter-owned systems section.');
}

/** CLI entry point */
export function runCreateStarter(args: string[]): void {
    // CLI-011: `create-starter --help` is an explicit help request — print this
    // command's own help and exit 0 (help is not an error).
    if (args.includes('--help') || args.includes('-h')) {
        printCreateStarterHelp();
        return;
    }

    const force = args.includes('--force');

    // CLI-012: an --out token that is present but carries no value (`--out=`,
    // `--out=   `, or a bare `--out` with no following token) is a likely
    // mistake — a shell that dropped the value, say. Space form (`--out dir`)
    // AND equals form (`--out=dir`) are both accepted, matching sidecar/validate.
    const out = readFlag(args, '--out');
    let outDir: string | undefined;
    if (out.present) {
        const rawValue = out.raw;
        if (rawValue === undefined || rawValue.trim().length === 0 || rawValue.startsWith('-')) {
            console.error('✗ [CLI_OUT_EMPTY] --out was given but its value is empty.');
            console.error('  Hint: pass a target directory, e.g. --out ./my-project or --out=./my-project — or omit --out to scaffold into packages/.');
            process.exit(1);
            return; // unreachable in production; lets tests that stub process.exit stop here
        }
        outDir = rawValue;
    }

    const name = args.find((a, i) => !a.startsWith('-') && i !== out.valueSlot);

    if (!name) {
        printCreateStarterHelp();
        process.exit(1);
        return; // unreachable in production; guards tests that stub process.exit
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
