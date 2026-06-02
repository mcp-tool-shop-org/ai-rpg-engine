// scaffold — write a minimal VALID content stub for an author to fill in.
//
// `ai-rpg-engine scaffold <kind> <name>` produces a JSON content pack containing one
// stub of the requested kind. "Valid" is the load-bearing contract: every stub passes
// `ai-rpg-engine validate` (it round-trips through loadContent + validateGameContent
// with zero errors). It reuses create-starter's safe-write discipline — name
// validation, refuse-overwrite-without-force, structured errors — so the two scaffolders
// behave consistently.
//
// Determinism: the output is a pure function of (kind, name). No clock, no RNG, no
// network — JSON.stringify with a fixed 2-space indent yields byte-identical bytes.

import * as fs from 'node:fs';
import * as path from 'node:path';

/** The five content kinds the CLI advertises in its metadata + help. */
export const SCAFFOLD_KINDS = ['ability', 'zone', 'quest', 'status', 'dialogue'] as const;
export type ScaffoldKind = (typeof SCAFFOLD_KINDS)[number];

export interface ScaffoldOptions {
  kind: ScaffoldKind;
  name: string;
  /** Explicit output path. Defaults to `<name>.json` in the current working directory. */
  outFile?: string;
  /** Overwrite an existing file. Without this, an existing target is refused. */
  force?: boolean;
}

/**
 * The same name rule create-starter enforces (CLI-003): a run of lowercase-alphanumeric
 * segments separated by single hyphens. No leading/trailing/consecutive hyphens, no
 * uppercase, no leading digit. Keeping the rule identical means an author who learned it
 * for `create-starter` already knows it here. (Duplicated rather than imported because
 * create-starter.ts is owned by another concern and inlines the regex; the contract is
 * pinned by tests in both files.)
 */
function assertValidName(name: string): void {
  if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)) {
    throw new Error(
      `Invalid content name "${name}". Use lowercase letters and numbers in hyphen-separated segments (e.g. "fire-bolt"). No leading, trailing, or consecutive hyphens, and no leading digit.`,
    );
  }
}

/**
 * Turn a hyphenated id into a human Title Case display name, e.g.
 * "fire-bolt" → "Fire Bolt". Used only for the `name` field of stubs.
 */
function titleCase(s: string): string {
  return s
    .split('-')
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/**
 * Build the content-pack object for one stub. Each stub is the MINIMAL shape that passes
 * the corresponding content-schema validator AND validateGameContent's cross-reference
 * pass — so a freshly scaffolded file validates clean before the author touches it.
 *
 * Returns a ContentPack-shaped plain object (a record keyed by the relevant collection).
 */
export function buildStub(kind: ScaffoldKind, name: string): Record<string, unknown> {
  const display = titleCase(name);

  switch (kind) {
    case 'ability':
      // AbilityDefinition requires id/name/verb/tags/target/effects. effects is a
      // required array; one no-op "log" effect keeps it valid and shows the author the
      // shape. target uses the simplest scope ('self').
      return {
        abilities: [
          {
            id: name,
            name: display,
            verb: 'cast',
            tags: ['ability'],
            target: { type: 'self' },
            effects: [
              { type: 'log', params: { message: `${display} resolves.` } },
            ],
            cooldown: 0,
          },
        ],
      };

    case 'zone':
      // ZoneDefinition requires only id + name. neighbors left empty so the cross-ref
      // pass has nothing dangling to flag.
      return {
        zones: [
          {
            id: name,
            name: display,
            tags: ['zone'],
            neighbors: [],
            description: [{ text: `${display} — describe this zone.` }],
          },
        ],
      };

    case 'quest':
      // QuestDefinition requires id/name/stages[]. A single self-contained stage with no
      // nextStage/failStage keeps cross-references clean.
      return {
        quests: [
          {
            id: name,
            name: display,
            stages: [
              {
                id: 'start',
                name: 'Begin',
                description: `The first stage of ${display}.`,
                objectives: ['Describe the objective here.'],
              },
            ],
          },
        ],
      };

    case 'status':
      // StatusDefinition requires id/name/tags[]/stacking. 'refresh' is the safest
      // default stacking policy for an authored stub.
      return {
        statuses: [
          {
            id: name,
            name: display,
            tags: ['status'],
            stacking: 'refresh',
            duration: { type: 'ticks', value: 3 },
          },
        ],
      };

    case 'dialogue': {
      // DialogueDefinition requires id/speakers[]/entryNodeId/nodes{}. The entry node
      // must exist and every node must be reachable (reachability is advisory, but we
      // make the stub clean anyway). Crucially, validateRefs flags any speaker that is
      // not a known ENTITY — so the stub also ships the speaker entity, making the pack
      // self-consistent and validate-clean out of the box.
      const speakerId = `${name}-speaker`;
      return {
        entities: [
          { id: speakerId, type: 'npc', name: titleCase(speakerId) },
        ],
        dialogues: [
          {
            id: name,
            speakers: [speakerId],
            entryNodeId: 'start',
            nodes: {
              start: {
                id: 'start',
                speaker: speakerId,
                text: 'Replace this with the opening line.',
                choices: [
                  { id: 'continue', text: 'Continue.', nextNodeId: 'end' },
                ],
              },
              end: {
                id: 'end',
                speaker: speakerId,
                text: 'Replace this with the closing line.',
              },
            },
          },
        ],
      };
    }

    default: {
      // Exhaustiveness guard — unreachable if SCAFFOLD_KINDS and the switch stay in sync.
      const never: never = kind;
      throw new Error(`unknown content kind "${String(never)}"`);
    }
  }
}

/**
 * Write a stub to disk. Returns the path written. Throws structured Errors on a bad
 * kind, a bad name, or an existing file without `force`.
 */
export function scaffoldContent(opts: ScaffoldOptions): string {
  const { kind, name, force = false } = opts;

  // Validate kind first so a typo'd kind fails before touching the filesystem.
  if (!SCAFFOLD_KINDS.includes(kind)) {
    throw new Error(
      `Invalid scaffold kind "${String(kind)}". Must be one of: ${SCAFFOLD_KINDS.join(', ')}.`,
    );
  }

  assertValidName(name);

  const outFile = opts.outFile ?? path.resolve(`${name}.json`);

  // Safe-write: refuse to clobber an existing file unless --force (mirrors create-starter).
  if (fs.existsSync(outFile) && !force) {
    throw new Error(`File already exists: ${outFile}\nUse --force to overwrite.`);
  }

  const pack = buildStub(kind, name);
  // Fixed 2-space indent + trailing newline → deterministic, diff-friendly bytes.
  const json = JSON.stringify(pack, null, 2) + '\n';

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, json, 'utf-8');

  return outFile;
}

function printScaffoldHelp(): void {
  console.log('Usage: ai-rpg-engine scaffold <kind> <name> [--force] [--out=<file>]');
  console.log('');
  console.log('Writes a minimal, valid content stub you can fill in.');
  console.log(`The stub passes "ai-rpg-engine validate" out of the box.`);
  console.log('');
  console.log(`Kinds: ${SCAFFOLD_KINDS.join(', ')}`);
  console.log('');
  console.log('Examples:');
  console.log('  ai-rpg-engine scaffold ability fire-bolt');
  console.log('  ai-rpg-engine scaffold zone harbor-district --out=./content/harbor.json');
  console.log('  ai-rpg-engine scaffold status on-fire --force');
}

/**
 * CLI entry point. Parses argv-style args, validates them, prints structured errors, and
 * exits nonzero on failure (mirrors runCreateStarter so the two commands feel the same).
 */
export function runScaffold(args: string[]): void {
  if (args.includes('--help') || args.includes('-h')) {
    printScaffoldHelp();
    return;
  }

  const force = args.includes('--force');

  // Collect positionals (non-flag tokens): <kind> <name>.
  const positionals = args.filter((a) => !a.startsWith('-'));
  const kind = positionals[0];
  const name = positionals[1];

  // --out=<file> (same empty-value guard as create-starter's CLI-012): a present-but-empty
  // value is a likely shell mishap and must fail loudly rather than defaulting silently.
  const outToken = args.find((a) => a === '--out' || a.startsWith('--out='));
  let outFile: string | undefined;
  if (outToken !== undefined) {
    const eq = outToken.indexOf('=');
    const rawValue = eq === -1 ? '' : outToken.slice(eq + 1);
    if (rawValue.trim().length === 0) {
      console.error('✗ [CLI_OUT_EMPTY] --out was given but its value is empty.');
      console.error('  Hint: pass a target file, e.g. --out=./content/fire.json — or omit --out to write <name>.json.');
      process.exit(1);
      return; // unreachable in production; lets tests that stub process.exit stop here
    }
    outFile = path.resolve(rawValue);
  }

  if (!kind) {
    console.error('✗ [SCAFFOLD_KIND_MISSING] Missing <kind>.');
    console.error(`  Hint: choose one of: ${SCAFFOLD_KINDS.join(', ')}.`);
    printScaffoldHelp();
    process.exit(1);
    return;
  }

  if (!SCAFFOLD_KINDS.includes(kind as ScaffoldKind)) {
    console.error(`✗ [SCAFFOLD_KIND_UNKNOWN] Unknown kind "${kind}".`);
    console.error(`  Hint: choose one of: ${SCAFFOLD_KINDS.join(', ')}.`);
    process.exit(1);
    return;
  }

  if (!name) {
    console.error('✗ [SCAFFOLD_NAME_MISSING] Missing <name>.');
    console.error('  Hint: provide a lowercase, hyphen-separated id, e.g. "fire-bolt".');
    printScaffoldHelp();
    process.exit(1);
    return;
  }

  try {
    const written = scaffoldContent({ kind: kind as ScaffoldKind, name, outFile, force });
    console.log(`✓ Scaffolded ${kind} "${name}" → ${path.relative(process.cwd(), written)}`);
    console.log('');
    console.log('Next steps:');
    console.log(`  1. Edit ${path.relative(process.cwd(), written)} — fill in the stub.`);
    console.log(`  2. ai-rpg-engine validate ${path.relative(process.cwd(), written)}`);
  } catch (err) {
    console.error(`✗ ${(err as Error).message}`);
    process.exit(1);
  }
}
