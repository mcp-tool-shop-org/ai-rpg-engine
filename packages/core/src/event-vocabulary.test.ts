import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { ENGINE_EVENT_TYPES, type EngineEventType } from './index.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const SOURCE_ROOTS = ['packages', 'templates'] as const;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage']);

const HELPER_TYPE_ARG_INDEX = new Map<string, number>([
  ['makeEvent', 1],
  ['makeCognitionEvent', 0],
  ['makeStatusEvent', 0],
]);

/**
 * Dynamic call sites passed to `makeEvent`, `makeCognitionEvent`, or
 * `makeStatusEvent` rather than a plain string literal:
 * - `` `opportunity.${resolutionType}` `` in
 *   `packages/modules/src/opportunity-resolution.ts` interpolates
 *   `resolutionType: OpportunityResolutionType`
 *   (`'completed' | 'betrayed' | 'abandoned'`).
 */
const DYNAMIC_HELPER_EVENT_TYPES: Record<string, readonly string[]> = {
  '`opportunity.${resolutionType}`': [
    'opportunity.abandoned',
    'opportunity.betrayed',
    'opportunity.completed',
  ],
};

function collectNonTestTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectNonTestTsFiles(fullPath, out);
    } else if (
      entry.isFile() &&
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.d.ts')
    ) {
      out.push(fullPath);
    }
  }
  return out;
}

function scanEmittedEventTypes(): {
  scannedFiles: string[];
  emittedTypes: Set<string>;
  seenDynamicExprs: Set<string>;
  unexpectedDynamicCalls: string[];
} {
  const scannedFiles = SOURCE_ROOTS.flatMap((root) =>
    collectNonTestTsFiles(resolve(repoRoot, root)),
  ).sort();

  const emittedTypes = new Set<string>();
  const seenDynamicExprs = new Set<string>();
  const unexpectedDynamicCalls: string[] = [];

  for (const filePath of scannedFiles) {
    const sourceText = readFileSync(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
    const relPath = relative(repoRoot, filePath).replace(/\\/g, '/');

    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const argIndex = HELPER_TYPE_ARG_INDEX.get(node.expression.text);
        if (argIndex !== undefined) {
          const arg = node.arguments[argIndex];
          if (!arg) {
            const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
            unexpectedDynamicCalls.push(`${relPath}:${line} (${node.expression.text}): missing type arg`);
          } else if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) {
            emittedTypes.add(arg.text);
          } else {
            const exprText = arg.getText(sourceFile);
            const expanded = DYNAMIC_HELPER_EVENT_TYPES[exprText];
            if (expanded) {
              seenDynamicExprs.add(exprText);
              for (const eventType of expanded) {
                emittedTypes.add(eventType);
              }
            } else {
              const line = sourceFile.getLineAndCharacterOfPosition(arg.getStart(sourceFile)).line + 1;
              unexpectedDynamicCalls.push(`${relPath}:${line} (${node.expression.text}): ${exprText}`);
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  return { scannedFiles, emittedTypes, seenDynamicExprs, unexpectedDynamicCalls };
}

function parseAppendixTableRows(markdown: string): {
  dataRowCount: number;
  events: string[];
  unbacktickedRows: string[];
} {
  const events: string[] = [];
  const unbacktickedRows: string[] = [];
  let dataRowCount = 0;
  let inCodeFence = false;

  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence) continue;

    const trimmed = line.trim();
    if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) continue;

    // Skip markdown table delimiter rows like `|-------|--------|-------------|`.
    if (/^\|\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)+\|$/.test(trimmed)) continue;

    const firstCell = trimmed.slice(1, trimmed.indexOf('|', 1)).trim();
    // Skip table header rows (`| Event | Source | Description |`).
    if (firstCell.toLowerCase() === 'event') continue;

    dataRowCount++;
    const backtickMatch = /^`([^`]+)`$/.exec(firstCell);
    if (backtickMatch) {
      events.push(backtickMatch[1]);
    } else {
      unbacktickedRows.push(trimmed);
    }
  }

  return { dataRowCount, events, unbacktickedRows };
}

describe('ENGINE_EVENT_TYPES vocabulary contract', () => {
  it('matches every simulation event type emitted via makeEvent, makeCognitionEvent, and makeStatusEvent', () => {
    const { scannedFiles, emittedTypes, seenDynamicExprs, unexpectedDynamicCalls } =
      scanEmittedEventTypes();

    expect(scannedFiles.length).toBeGreaterThan(0);
    expect(unexpectedDynamicCalls).toEqual([]);
    expect([...seenDynamicExprs].sort()).toEqual(Object.keys(DYNAMIC_HELPER_EVENT_TYPES).sort());

    expect(emittedTypes.size).toBeGreaterThan(0);
    expect(new Set(ENGINE_EVENT_TYPES).size).toBe(ENGINE_EVENT_TYPES.length);
    expect(ENGINE_EVENT_TYPES).toHaveLength(emittedTypes.size);
    expect([...ENGINE_EVENT_TYPES].sort()).toEqual([...emittedTypes].sort());

    expect(ENGINE_EVENT_TYPES).toContain('combat.contact.miss');
    expect(ENGINE_EVENT_TYPES).toContain('combat.guard.broken');
    expect(ENGINE_EVENT_TYPES).toContain('combat.counter.off_balance');
    expect(ENGINE_EVENT_TYPES).toContain('resource.changed');
    expect(ENGINE_EVENT_TYPES).not.toContain('combat.contact.missed');
    expect(ENGINE_EVENT_TYPES).not.toContain('world.zone.exited');

    const sample: EngineEventType = ENGINE_EVENT_TYPES[0];
    expect(emittedTypes.has(sample)).toBe(true);
  });

  it('matches all data rows in docs/handbook/appendix-a-event-vocabulary.md without skipping unbackticked rows', () => {
    const raw = readFileSync(
      resolve(repoRoot, 'docs/handbook/appendix-a-event-vocabulary.md'),
      'utf8',
    );
    const parsed = parseAppendixTableRows(raw);

    expect(parsed.dataRowCount).toBeGreaterThan(0);
    expect(parsed.unbacktickedRows).toEqual([]);
    expect(parsed.events).toHaveLength(parsed.dataRowCount);
    expect(parsed.events).toHaveLength(ENGINE_EVENT_TYPES.length);
    expect(parsed.events).toEqual([...ENGINE_EVENT_TYPES]);
  });

  it('keeps the Starlight handbook mirror in exact parity with ENGINE_EVENT_TYPES and the canonical appendix', () => {
    const canonical = parseAppendixTableRows(
      readFileSync(resolve(repoRoot, 'docs/handbook/appendix-a-event-vocabulary.md'), 'utf8'),
    );
    const mirror = parseAppendixTableRows(
      readFileSync(
        resolve(repoRoot, 'site/src/content/docs/handbook/appendix-a-event-vocabulary.md'),
        'utf8',
      ),
    );

    expect(mirror.dataRowCount).toBeGreaterThan(0);
    expect(mirror.unbacktickedRows).toEqual([]);
    expect(mirror.events).toHaveLength(mirror.dataRowCount);
    expect(mirror.events).toEqual(canonical.events);
    expect(mirror.events).toEqual([...ENGINE_EVENT_TYPES]);
  });

  it('counts and flags table data rows that omit a backticked first cell', () => {
    const synthetic = [
      '| Event | Source | Description |',
      '|-------|--------|-------------|',
      '| `world.zone.entered` | traversal-core | Valid row |',
      '| unbackticked.event | traversal-core | Missing backticks |',
    ].join('\n');

    const parsed = parseAppendixTableRows(synthetic);
    expect(parsed.dataRowCount).toBe(2);
    expect(parsed.events).toEqual(['world.zone.entered']);
    expect(parsed.events.length).toBeLessThan(parsed.dataRowCount);
    expect(parsed.unbacktickedRows).toEqual([
      '| unbackticked.event | traversal-core | Missing backticks |',
    ]);
  });
});
