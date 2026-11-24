import { describe, it, expect, beforeAll } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { ENGINE_EVENT_TYPES, type EngineEventType } from './index.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const SOURCE_ROOTS = ['packages', 'templates'] as const;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage']);

interface EventSinkSpec {
  readonly fnName: string;
  readonly declFile: string;
  readonly typeArgIndex: number;
  readonly scope: 'global' | 'file';
}

/**
 * Exhaustive registry of simulation event-creating / emitting sink functions.
 * Any new helper that accepts a `type` string or type parameter and returns or
 * emits a `ResolvedEvent` or `PendingEffect` fails the unregistered-sink guard
 * until it is registered here and scanned.
 */
const REGISTERED_EVENT_SINKS: readonly EventSinkSpec[] = [
  { fnName: 'emitEvent', declFile: 'packages/core/src/world.ts', typeArgIndex: 0, scope: 'global' },
  { fnName: 'makeEvent', declFile: 'packages/modules/src/make-event.ts', typeArgIndex: 1, scope: 'global' },
  { fnName: 'makeEvent', declFile: 'packages/equipment/src/equipment-core.ts', typeArgIndex: 1, scope: 'file' },
  { fnName: 'makeEvent', declFile: 'packages/starter-merchant/src/contract-core.ts', typeArgIndex: 1, scope: 'file' },
  { fnName: 'base', declFile: 'packages/starter-merchant/src/contract-core.ts', typeArgIndex: 0, scope: 'file' },
  { fnName: 'makeCognitionEvent', declFile: 'packages/modules/src/cognition-core.ts', typeArgIndex: 0, scope: 'file' },
  { fnName: 'makeStatusEvent', declFile: 'packages/modules/src/status-core.ts', typeArgIndex: 0, scope: 'file' },
  { fnName: 'makePeriodicEvent', declFile: 'packages/modules/src/status-effects.ts', typeArgIndex: 0, scope: 'file' },
  { fnName: 'makeTriggerEvent', declFile: 'packages/modules/src/status-effects.ts', typeArgIndex: 0, scope: 'file' },
  { fnName: 'emitHidden', declFile: 'packages/modules/src/combat-recovery.ts', typeArgIndex: 2, scope: 'file' },
  { fnName: 'emit', declFile: 'packages/modules/src/defeat-fallout.ts', typeArgIndex: 2, scope: 'file' },
  { fnName: 'emitQuestEvent', declFile: 'packages/modules/src/quest-core.ts', typeArgIndex: 2, scope: 'file' },
  { fnName: 'emitPressureEvent', declFile: 'packages/modules/src/world-tick.ts', typeArgIndex: 1, scope: 'file' },
  { fnName: 'event', declFile: 'packages/starter-bounty-hunter/src/pursuit-core.ts', typeArgIndex: 1, scope: 'file' },
];

/**
 * Explicit runtime pattern entries (e.g. `status.periodic.<effect>`) for any
 * dynamic event expression that cannot be resolved via TypeScript's TypeChecker
 * to a finite string-literal union. Currently empty because every dynamic
 * production site resolves finitely through TypeChecker.
 */
const REGISTERED_EVENT_PATTERNS: readonly string[] = [];

function normalizeRelPath(absPath: string): string {
  return relative(repoRoot, absPath).replace(/\\/g, '/');
}

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
      out.push(fullPath.replace(/\\/g, '/'));
    }
  }
  return out;
}

function loadCompilerOptions(): ts.CompilerOptions {
  const tsconfigPath = resolve(repoRoot, 'tsconfig.tests.json');
  const raw = ts.readConfigFile(tsconfigPath, (path) => readFileSync(path, 'utf8'));
  const parsed = ts.parseJsonConfigFileContent(raw.config, ts.sys, repoRoot);
  return { ...parsed.options, noEmit: true };
}

function createWorkspaceProgram(): { program: ts.Program; scannedFiles: string[] } {
  const scannedFiles = SOURCE_ROOTS.flatMap((root) =>
    collectNonTestTsFiles(resolve(repoRoot, root)),
  ).sort();
  const options = loadCompilerOptions();
  const program = ts.createProgram(scannedFiles, options);
  return { program, scannedFiles };
}

function createOverlayProgram(
  baseProgram: ts.Program,
  virtualFilePath: string,
  virtualSourceText: string,
): ts.Program {
  const normalizedVirtual = virtualFilePath.replace(/\\/g, '/');
  const options = baseProgram.getCompilerOptions();
  const host = ts.createCompilerHost(options, true);
  const virtualSf = ts.createSourceFile(normalizedVirtual, virtualSourceText, ts.ScriptTarget.Latest, true);
  const origGetSourceFile = host.getSourceFile.bind(host);
  const origFileExists = host.fileExists.bind(host);
  const origReadFile = host.readFile.bind(host);

  host.fileExists = (fileName) =>
    fileName.replace(/\\/g, '/') === normalizedVirtual || origFileExists(fileName);
  host.readFile = (fileName) =>
    fileName.replace(/\\/g, '/') === normalizedVirtual ? virtualSourceText : origReadFile(fileName);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNew) => {
    const norm = fileName.replace(/\\/g, '/');
    if (norm === normalizedVirtual) return virtualSf;
    return baseProgram.getSourceFile(fileName) ?? origGetSourceFile(fileName, languageVersion, onError, shouldCreateNew);
  };

  const rootNames = [...baseProgram.getRootFileNames()];
  if (!rootNames.some((n) => n.replace(/\\/g, '/') === normalizedVirtual)) {
    rootNames.push(normalizedVirtual);
  }
  return ts.createProgram(rootNames, options, host, baseProgram);
}

function expandTypeToStringLiterals(type: ts.Type): string[] | null {
  if (type.isStringLiteral()) return [type.value];
  if (type.isUnion()) {
    const out: string[] = [];
    for (const member of type.types) {
      const expanded = expandTypeToStringLiterals(member);
      if (!expanded) return null;
      out.push(...expanded);
    }
    return out;
  }
  return null;
}

function resolveEventTypeExpression(
  checker: ts.TypeChecker,
  expr: ts.Expression,
  registeredPatterns: Readonly<Record<string, string>>,
): { kind: 'resolved'; values: string[] } | { kind: 'pattern'; pattern: string } | { kind: 'unresolved'; exprText: string } {
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
    return { kind: 'resolved', values: [expr.text] };
  }

  const exprType = checker.getTypeAtLocation(expr);
  const directUnion = expandTypeToStringLiterals(exprType);
  if (directUnion && directUnion.length > 0) {
    return { kind: 'resolved', values: [...new Set(directUnion)].sort() };
  }

  if (ts.isTemplateExpression(expr)) {
    let prefixes = [expr.head.text];
    const patternParts = [expr.head.text];
    let finite = true;
    for (const span of expr.templateSpans) {
      const spanType = checker.getTypeAtLocation(span.expression);
      const vals = expandTypeToStringLiterals(spanType);
      if (!vals || vals.length === 0) {
        finite = false;
      } else if (finite) {
        const next: string[] = [];
        for (const p of prefixes) {
          for (const v of vals) {
            next.push(p + v + span.literal.text);
          }
        }
        prefixes = next;
      }
      const placeholder = ts.isIdentifier(span.expression)
        ? `<${span.expression.text.replace(/Id$/i, '')}>`
        : '<expr>';
      patternParts.push(placeholder, span.literal.text);
    }
    if (finite) {
      return { kind: 'resolved', values: [...new Set(prefixes)].sort() };
    }
    const candidatePattern = registeredPatterns[expr.getText()] ?? patternParts.join('');
    return { kind: 'pattern', pattern: candidatePattern };
  }

  return { kind: 'unresolved', exprText: expr.getText() };
}

function isPendingEffectType(checker: ts.TypeChecker, type: ts.Type | undefined): boolean {
  if (!type) return false;
  const text = checker.typeToString(type);
  if (text === 'PendingEffect' || text.startsWith('PendingEffect ')) return true;
  if (type.isUnion()) return type.types.some((t) => isPendingEffectType(checker, t));
  return false;
}

function isResolvedOrPendingReturnType(checker: ts.TypeChecker, type: ts.Type | undefined): boolean {
  if (!type) return false;
  const text = checker.typeToString(type);
  if (text.includes('ResolvedEvent') || text.includes('PendingEffect')) return true;
  if (type.isUnion()) return type.types.some((t) => isResolvedOrPendingReturnType(checker, t));
  return false;
}

function isFileExportedDeclaration(node: ts.Node): boolean {
  if (ts.canHaveModifiers(node)) {
    const mods = ts.getModifiers(node);
    if (mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) return true;
  }
  if (
    ts.isVariableDeclaration(node) &&
    ts.isVariableDeclarationList(node.parent) &&
    ts.isVariableStatement(node.parent.parent)
  ) {
    const mods = ts.getModifiers(node.parent.parent);
    if (mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) return true;
  }
  return false;
}

type FunctionLike =
  | ts.FunctionDeclaration
  | ts.MethodDeclaration
  | ts.FunctionExpression
  | ts.ArrowFunction;

function getFunctionName(fn: FunctionLike, sf: ts.SourceFile): string | null {
  if ((ts.isFunctionDeclaration(fn) || ts.isMethodDeclaration(fn) || ts.isFunctionExpression(fn)) && fn.name) {
    return fn.name.getText(sf);
  }
  if (ts.isVariableDeclaration(fn.parent) && ts.isIdentifier(fn.parent.name)) {
    return fn.parent.name.text;
  }
  return null;
}

function collectSinkMap(registeredSinks: readonly EventSinkSpec[]): Map<string, EventSinkSpec[]> {
  const map = new Map<string, EventSinkSpec[]>();
  for (const spec of registeredSinks) {
    const arr = map.get(spec.fnName) ?? [];
    arr.push(spec);
    map.set(spec.fnName, arr);
  }
  return map;
}

function matchSinkForCall(
  calleeName: string,
  relPath: string,
  sinkMap: Map<string, EventSinkSpec[]>,
): EventSinkSpec | undefined {
  const candidates = sinkMap.get(calleeName);
  if (!candidates) return undefined;
  const fileMatch = candidates.find((s) => s.declFile === relPath);
  if (fileMatch) return fileMatch;
  return candidates.find((s) => s.scope === 'global');
}

function formatEmitterSource(relPath: string): string {
  const m = /^packages\/([^/]+)\/src\/([^.]+)\.ts$/.exec(relPath);
  if (!m) {
    const tm = /^templates\/([^/]+)\/src\/([^.]+)\.ts$/.exec(relPath);
    return tm ? `template-${tm[1]} (${tm[2]})` : relPath;
  }
  if (m[1] === 'core') return `core (${m[2]})`;
  if (m[1] === 'modules' || m[1] === 'equipment') return m[2];
  return `${m[1]} (${m[2]})`;
}

function getPropertyExprMap(obj: ts.ObjectLiteralExpression): Map<string, ts.Expression> {
  const map = new Map<string, ts.Expression>();
  for (const prop of obj.properties) {
    if (ts.isPropertyAssignment(prop) && (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name))) {
      map.set(prop.name.text, prop.initializer);
    } else if (ts.isShorthandPropertyAssignment(prop)) {
      map.set(prop.name.text, prop.name);
    }
  }
  return map;
}

const EXCLUDED_LITERAL_TYPE_NAMES = new Set(['WireEvent', 'Memory', 'TraceStep', 'DefeatEntry', 'ProgressionEvent']);

function isExcludedContextType(checker: ts.TypeChecker, type: ts.Type | undefined): boolean {
  if (!type) return false;
  const str = checker.typeToString(type);
  for (const excluded of EXCLUDED_LITERAL_TYPE_NAMES) {
    if (str === excluded || str.startsWith(`${excluded} `)) return true;
  }
  return false;
}

function isEventObjectLiteral(
  checker: ts.TypeChecker,
  obj: ts.ObjectLiteralExpression,
  props: Map<string, ts.Expression>,
): boolean {
  if (!props.has('type')) return false;
  if (!props.has('payload') && !props.has('executeAtTick')) return false;
  const ctx = checker.getContextualType(obj);
  if (isExcludedContextType(checker, ctx)) return false;
  if (ctx) {
    const ctxStr = checker.typeToString(ctx);
    if (ctxStr.includes('ResolvedEvent') || ctxStr.includes('PendingEffect')) return true;
  }
  return props.has('id') && (props.has('tick') || props.has('executeAtTick'));
}

function enclosingFunctionTypeParamNames(
  node: ts.Node,
  relPath: string,
  sinkMap: Map<string, EventSinkSpec[]>,
): Set<string> {
  const names = new Set<string>();
  let cur: ts.Node | undefined = node.parent;
  while (cur) {
    if (
      ts.isFunctionDeclaration(cur) ||
      ts.isMethodDeclaration(cur) ||
      ts.isFunctionExpression(cur) ||
      ts.isArrowFunction(cur)
    ) {
      const sf = cur.getSourceFile();
      const fnName = getFunctionName(cur, sf);
      if (fnName) {
        const spec = matchSinkForCall(fnName, relPath, sinkMap);
        if (spec) {
          const p = cur.parameters[spec.typeArgIndex];
          if (p && ts.isIdentifier(p.name)) {
            names.add(p.name.text);
          }
        }
      }
      break;
    }
    cur = cur.parent;
  }
  return names;
}

function findUnregisteredEventSinks(
  program: ts.Program,
  files: readonly string[],
  registeredSinks: readonly EventSinkSpec[],
): string[] {
  const checker = program.getTypeChecker();
  const sinkMap = collectSinkMap(registeredSinks);
  const violations: string[] = [];

  for (const filePath of files) {
    const sf = program.getSourceFile(filePath);
    if (!sf) continue;
    const relPath = normalizeRelPath(filePath);

    // Ensure every 'file'-scoped sink declared in this file is NOT exported.
    for (const sink of registeredSinks) {
      if (sink.scope === 'file' && sink.declFile === relPath) {
        const visitExportCheck = (node: ts.Node): void => {
          if (
            (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isVariableDeclaration(node)) &&
            node.name &&
            node.name.getText(sf) === sink.fnName &&
            isFileExportedDeclaration(node)
          ) {
            const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
            violations.push(`${relPath}:${line} file-scoped sink "${sink.fnName}" must not be exported`);
          }
          ts.forEachChild(node, visitExportCheck);
        };
        visitExportCheck(sf);
      }
    }

    const inspectFn = (node: ts.Node): void => {
      if (
        ts.isFunctionDeclaration(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node)
      ) {
        const fnName = getFunctionName(node, sf);
        const alreadyRegistered =
          fnName !== null &&
          registeredSinks.some(
            (s) => s.fnName === fnName && s.declFile === relPath,
          );

        if (!alreadyRegistered && node.body) {
          const candidateParamNames = new Set<string>();
          for (const param of node.parameters) {
            if (!ts.isIdentifier(param.name)) continue;
            const pt = checker.getTypeAtLocation(param);
            const hasStringOrTypeParam =
              (pt.flags & ts.TypeFlags.String) !== 0 ||
              (pt.flags & ts.TypeFlags.TypeParameter) !== 0 ||
              (pt.isUnion() &&
                pt.types.some(
                  (u) => (u.flags & ts.TypeFlags.String) !== 0 || (u.flags & ts.TypeFlags.TypeParameter) !== 0,
                ));
            const explicitTypeParam =
              param.type !== undefined &&
              (param.type.kind === ts.SyntaxKind.StringKeyword ||
                (ts.isTypeReferenceNode(param.type) &&
                  node.typeParameters?.some((tp) => tp.name.text === param.type!.getText(sf)) === true));
            if (hasStringOrTypeParam || explicitTypeParam) {
              candidateParamNames.add(param.name.text);
            }
          }

          if (candidateParamNames.size > 0) {
            const sig = checker.getSignatureFromDeclaration(node);
            const retType = sig ? checker.getReturnTypeOfSignature(sig) : undefined;
            const returnsEvent = isResolvedOrPendingReturnType(checker, retType);

            let usesParamAsEventType = false;
            let emitsEvent = false;
            const visitBody = (b: ts.Node): void => {
              if (
                b !== node &&
                (ts.isFunctionDeclaration(b) ||
                  ts.isMethodDeclaration(b) ||
                  ts.isFunctionExpression(b) ||
                  ts.isArrowFunction(b))
              ) {
                return;
              }

              if (ts.isObjectLiteralExpression(b)) {
                const props = getPropertyExprMap(b);
                if (isEventObjectLiteral(checker, b, props)) {
                  const typeExpr = props.get('type')!;
                  const refsCandidateParam = (n: ts.Node): boolean => {
                    if (ts.isIdentifier(n) && candidateParamNames.has(n.text)) return true;
                    let hit = false;
                    ts.forEachChild(n, (c) => {
                      if (refsCandidateParam(c)) hit = true;
                    });
                    return hit;
                  };
                  if (refsCandidateParam(typeExpr)) {
                    usesParamAsEventType = true;
                  }
                }
              }

              if (ts.isCallExpression(b)) {
                let callee: string | null = null;
                let isEventsEmit = false;
                if (ts.isIdentifier(b.expression)) callee = b.expression.text;
                else if (ts.isPropertyAccessExpression(b.expression)) {
                  callee = b.expression.name.text;
                  const receiver = b.expression.expression.getText(sf);
                  if (callee === 'emit' && (receiver.endsWith('.events') || receiver === 'events')) {
                    isEventsEmit = true;
                  }
                }

                if (isEventsEmit && b.arguments[0] && ts.isObjectLiteralExpression(b.arguments[0])) {
                  const props = getPropertyExprMap(b.arguments[0]);
                  if (isEventObjectLiteral(checker, b.arguments[0], props)) {
                    emitsEvent = true;
                  }
                } else if (callee) {
                  const sink = matchSinkForCall(callee, relPath, sinkMap);
                  if (sink) {
                    const arg = b.arguments[sink.typeArgIndex];
                    if (arg && ts.isIdentifier(arg) && candidateParamNames.has(arg.text)) {
                      usesParamAsEventType = true;
                      emitsEvent = true;
                    }
                  }
                }
              }

              ts.forEachChild(b, visitBody);
            };
            visitBody(node.body);

            if (usesParamAsEventType && (returnsEvent || emitsEvent)) {
              const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
              violations.push(
                `${relPath}:${line} unregistered event sink "${fnName ?? '<anonymous>'}" takes dynamic event type parameter`,
              );
            }
          }
        }
      }
      ts.forEachChild(node, inspectFn);
    };

    inspectFn(sf);
  }

  return violations;
}

interface ScanResult {
  scannedFiles: string[];
  emittedTypes: Set<string>;
  emittersByType: Map<string, Set<string>>;
  countsBySink: Map<string, Set<string>>;
  seenPatterns: Set<string>;
  unresolvedDynamicCalls: string[];
  unregisteredSinks: string[];
}

function scanEmittedEventTypes(
  program: ts.Program,
  scannedFiles: readonly string[],
  options: {
    registeredSinks?: readonly EventSinkSpec[];
    registeredPatterns?: readonly string[];
    patternAliases?: Readonly<Record<string, string>>;
  } = {},
): ScanResult {
  const checker = program.getTypeChecker();
  const registeredSinks = options.registeredSinks ?? REGISTERED_EVENT_SINKS;
  const registeredPatterns = new Set(options.registeredPatterns ?? REGISTERED_EVENT_PATTERNS);
  const patternAliases = options.patternAliases ?? {};
  const sinkMap = collectSinkMap(registeredSinks);

  const emittedTypes = new Set<string>();
  const emittersByType = new Map<string, Set<string>>();
  const countsBySink = new Map<string, Set<string>>();
  const seenPatterns = new Set<string>();
  const unresolvedDynamicCalls: string[] = [];

  const recordType = (sinkLabel: string, relPath: string, eventType: string): void => {
    emittedTypes.add(eventType);
    const srcs = emittersByType.get(eventType) ?? new Set<string>();
    srcs.add(formatEmitterSource(relPath));
    emittersByType.set(eventType, srcs);

    const sinkSet = countsBySink.get(sinkLabel) ?? new Set<string>();
    sinkSet.add(eventType);
    countsBySink.set(sinkLabel, sinkSet);
  };

  const resolveAndRecord = (
    sf: ts.SourceFile,
    relPath: string,
    sinkLabel: string,
    expr: ts.Expression,
  ): void => {
    const res = resolveEventTypeExpression(checker, expr, patternAliases);
    if (res.kind === 'resolved') {
      for (const evt of res.values) {
        recordType(sinkLabel, relPath, evt);
      }
    } else if (res.kind === 'pattern' && registeredPatterns.has(res.pattern)) {
      seenPatterns.add(res.pattern);
      recordType(sinkLabel, relPath, res.pattern);
    } else {
      const line = sf.getLineAndCharacterOfPosition(expr.getStart(sf)).line + 1;
      unresolvedDynamicCalls.push(
        `${relPath}:${line} (${sinkLabel}): ${res.kind === 'pattern' ? res.pattern : res.exprText}`,
      );
    }
  };

  for (const filePath of scannedFiles) {
    const sf = program.getSourceFile(filePath);
    if (!sf) continue;
    const relPath = normalizeRelPath(filePath);

    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        let calleeName: string | null = null;
        let isEventsBusEmit = false;
        if (ts.isIdentifier(node.expression)) {
          calleeName = node.expression.text;
        } else if (ts.isPropertyAccessExpression(node.expression)) {
          calleeName = node.expression.name.text;
          const recv = node.expression.expression.getText(sf);
          if (calleeName === 'emit' && (recv === 'events' || recv.endsWith('.events'))) {
            isEventsBusEmit = true;
          }
        }

        if (calleeName && !isEventsBusEmit) {
          const sink = matchSinkForCall(calleeName, relPath, sinkMap);
          if (sink) {
            const sinkLabel =
              sink.fnName === 'emitEvent'
                ? 'store.emitEvent'
                : sink.fnName === 'makeEvent'
                  ? `makeEvent (${sink.declFile.split('/')[1]})`
                  : sink.fnName;
            const arg = node.arguments[sink.typeArgIndex];
            const forwardedParamNames = enclosingFunctionTypeParamNames(node, relPath, sinkMap);
            if (!arg) {
              const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
              unresolvedDynamicCalls.push(`${relPath}:${line} (${sink.fnName}): missing type arg`);
            } else if (ts.isIdentifier(arg) && forwardedParamNames.has(arg.text)) {
              // Internal forwarding of a registered sink's own `type` parameter
            } else if (
              ts.isPropertyAccessExpression(arg) &&
              arg.name.text === 'type' &&
              isPendingEffectType(checker, checker.getTypeAtLocation(arg.expression))
            ) {
              // Relay of scheduled PendingEffect instances created via scanned PendingEffect literals
            } else {
              resolveAndRecord(sf, relPath, sinkLabel, arg);
            }
          }
        }
      }

      if (ts.isObjectLiteralExpression(node)) {
        const props = getPropertyExprMap(node);
        if (isEventObjectLiteral(checker, node, props)) {
          const typeExpr = props.get('type')!;
          const forwardedParamNames = enclosingFunctionTypeParamNames(node, relPath, sinkMap);
          if (ts.isIdentifier(typeExpr) && forwardedParamNames.has(typeExpr.text)) {
            // Parameterized body of a registered sink function
          } else {
            const sinkLabel = props.has('executeAtTick')
              ? 'PendingEffect literal'
              : 'ResolvedEvent literal';
            resolveAndRecord(sf, relPath, sinkLabel, typeExpr);
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sf);
  }

  const unregisteredSinks = findUnregisteredEventSinks(program, scannedFiles, registeredSinks);

  return {
    scannedFiles: [...scannedFiles],
    emittedTypes,
    emittersByType,
    countsBySink,
    seenPatterns,
    unresolvedDynamicCalls,
    unregisteredSinks,
  };
}

interface AppendixRow {
  event: string;
  source: string;
  description: string;
}

function parseAppendixTableRows(markdown: string): {
  dataRowCount: number;
  rows: AppendixRow[];
  events: string[];
  unbacktickedRows: string[];
} {
  const rows: AppendixRow[] = [];
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
    if (/^\|\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)+\|$/.test(trimmed)) continue;

    const cells = trimmed.slice(1, -1).split('|').map((c) => c.trim());
    const firstCell = cells[0] ?? '';
    if (firstCell.toLowerCase() === 'event') continue;

    dataRowCount++;
    const backtickMatch = /^`([^`]+)`$/.exec(firstCell);
    if (backtickMatch) {
      const evt = backtickMatch[1];
      events.push(evt);
      rows.push({
        event: evt,
        source: cells[1] ?? '',
        description: cells[2] ?? '',
      });
    } else {
      unbacktickedRows.push(trimmed);
    }
  }

  return { dataRowCount, rows, events, unbacktickedRows };
}

describe('ENGINE_EVENT_TYPES full-sink vocabulary contract', () => {
  let workspaceProgram: ts.Program;
  let scannedFiles: string[];
  let workspaceScan: ScanResult;

  beforeAll(() => {
    const built = createWorkspaceProgram();
    workspaceProgram = built.program;
    scannedFiles = built.scannedFiles;
    workspaceScan = scanEmittedEventTypes(workspaceProgram, scannedFiles);
  }, 60_000);

  it('captures every emitted event type across all sinks, ResolvedEvent/PendingEffect literals, and TypeChecker-expanded unions', () => {
    expect(scannedFiles.length).toBeGreaterThan(0);
    expect(workspaceScan.unregisteredSinks).toEqual([]);
    expect(workspaceScan.unresolvedDynamicCalls).toEqual([]);
    expect([...workspaceScan.seenPatterns].sort()).toEqual([...REGISTERED_EVENT_PATTERNS].sort());

    expect(workspaceScan.emittedTypes.size).toBeGreaterThan(0);
    expect(new Set(ENGINE_EVENT_TYPES).size).toBe(ENGINE_EVENT_TYPES.length);
    expect(ENGINE_EVENT_TYPES).toHaveLength(workspaceScan.emittedTypes.size);
    expect([...ENGINE_EVENT_TYPES].sort()).toEqual([...workspaceScan.emittedTypes].sort());

    // Restored & full-sink types must all be present
    for (const required of [
      'progression.node.unlocked',
      'rumor.belief.propagated',
      'audio.cue.requested',
      'combat.contact.miss',
      'combat.guard.broken',
      'combat.counter.off_balance',
      'resource.changed',
      'module.init.failed',
      'module.round.failed',
      'module.teardown.failed',
      'opportunity.abandoned',
      'opportunity.betrayed',
      'opportunity.completed',
      'combat.aftermath.started',
      'defeat.fallout.triggered',
      'quest.offered',
      'pressure.escalated',
      'pursuit.bounty.posted',
      'merchant.contract.honoured',
    ]) {
      expect(ENGINE_EVENT_TYPES).toContain(required);
    }

    expect(ENGINE_EVENT_TYPES).not.toContain('combat.contact.missed');
    expect(ENGINE_EVENT_TYPES).not.toContain('world.zone.exited');

    const sample: EngineEventType = ENGINE_EVENT_TYPES[0];
    expect(workspaceScan.emittedTypes.has(sample)).toBe(true);
  });

  it('fails the unregistered-sink guard on a fixture emitter taking a type parameter or string and returning/emitting ResolvedEvent', () => {
    const fixtureFile = resolve(repoRoot, 'packages/core/src/__fixture_unregistered_sink__.ts').replace(/\\/g, '/');
    const fixtureCode = `
      import type { ResolvedEvent } from './types.js';
      export function emitCustomWidgetEvent(type: string, tick: number): ResolvedEvent {
        return { id: 'e1', type, tick, payload: {} };
      }
      export function forwardGenericEvent<T extends string>(store: { emitEvent(type: T, p: Record<string, unknown>): ResolvedEvent }, eventType: T): ResolvedEvent {
        return store.emitEvent(eventType, {});
      }
    `;
    const fxProgram = createOverlayProgram(workspaceProgram, fixtureFile, fixtureCode);
    const fxViolations = findUnregisteredEventSinks(fxProgram, [fixtureFile], REGISTERED_EVENT_SINKS);
    expect(fxViolations).toEqual(
      expect.arrayContaining([
        expect.stringContaining('emitCustomWidgetEvent'),
        expect.stringContaining('forwardGenericEvent'),
      ]),
    );
  });

  it('expands new union members automatically via TypeChecker and fails on unresolved non-finite dynamic expressions unless registered as a pattern', () => {
    const unionFixture = resolve(repoRoot, 'packages/core/src/__fixture_union_event__.ts').replace(/\\/g, '/');
    const unionCode = `
      import type { ActionIntent, ResolvedEvent } from './types.js';
      type ExtendedResolution = 'completed' | 'abandoned' | 'betrayed' | 'forfeited';
      declare function makeEvent(action: ActionIntent, type: string, payload: Record<string, unknown>): ResolvedEvent;
      export function resolveCustom(action: ActionIntent, res: ExtendedResolution): ResolvedEvent {
        return makeEvent(action, \`opportunity.\${res}\`, {});
      }
    `;
    const unionProgram = createOverlayProgram(workspaceProgram, unionFixture, unionCode);
    const unionScan = scanEmittedEventTypes(unionProgram, [unionFixture]);
    expect(unionScan.unresolvedDynamicCalls).toEqual([]);
    expect([...unionScan.emittedTypes].sort()).toEqual([
      'opportunity.abandoned',
      'opportunity.betrayed',
      'opportunity.completed',
      'opportunity.forfeited',
    ]);
    expect(ENGINE_EVENT_TYPES).not.toContain('opportunity.forfeited');

    const dynFixture = resolve(repoRoot, 'packages/core/src/__fixture_dynamic_event__.ts').replace(/\\/g, '/');
    const dynCode = `
      import type { ActionIntent, ResolvedEvent } from './types.js';
      declare function makeEvent(action: ActionIntent, type: string, payload: Record<string, unknown>): ResolvedEvent;
      export function tickCustom(action: ActionIntent, effect: string): ResolvedEvent {
        return makeEvent(action, \`status.periodic.\${effect}\`, {});
      }
    `;
    const dynProgram = createOverlayProgram(workspaceProgram, dynFixture, dynCode);
    const failScan = scanEmittedEventTypes(dynProgram, [dynFixture]);
    expect(failScan.unresolvedDynamicCalls).toEqual([
      expect.stringContaining('status.periodic.<effect>'),
    ]);

    const okScan = scanEmittedEventTypes(dynProgram, [dynFixture], {
      registeredPatterns: ['status.periodic.<effect>'],
    });
    expect(okScan.unresolvedDynamicCalls).toEqual([]);
    expect([...okScan.emittedTypes]).toEqual(['status.periodic.<effect>']);
  });

  it('matches all data rows and full Source attribution in docs/handbook/appendix-a-event-vocabulary.md', () => {
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

    for (const row of parsed.rows) {
      const expectedSources = [...(workspaceScan.emittersByType.get(row.event) ?? [])].sort().join(', ');
      expect(row.source, `Source mismatch for ${row.event}`).toBe(expectedSources);
    }

    expect(parsed.events).toContain('progression.node.unlocked');
    expect(parsed.events).toContain('rumor.belief.propagated');
    expect(parsed.events).toContain('audio.cue.requested');
    const resourceChangedRow = parsed.rows.find((r) => r.event === 'resource.changed');
    expect(resourceChangedRow?.source).toContain('hazard-interpreter');
    expect(resourceChangedRow?.source).toContain('status-effects');
    expect(resourceChangedRow?.source).toContain('starter-fantasy (content)');
  });

  it('keeps the Starlight handbook mirror in exact parity with ENGINE_EVENT_TYPES, row count, and Source column', () => {
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
    expect(mirror.rows.map((r) => r.source)).toEqual(canonical.rows.map((r) => r.source));
    expect(mirror.events).toContain('progression.node.unlocked');
    expect(mirror.events).toContain('rumor.belief.propagated');
    expect(mirror.events).toContain('audio.cue.requested');
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
