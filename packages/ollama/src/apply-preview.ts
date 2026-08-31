// apply-preview — safe file write with visible preview
// Shows what would be written, where, and how big.
// OVERWRITE previews a unified diff against the existing file.
// Writes only with explicit --confirm: sibling .bak then atomic tmp+rename.

import { readFile, writeFile, mkdir, rename, copyFile, unlink, access, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export type ApplyPreviewInput = {
  content: string;
  targetPath: string;
  label?: string;
  projectRoot?: string;
};

export type ApplyPreviewResult = {
  targetPath: string;
  contentLength: number;
  existingFile: boolean;
  existingLength: number;
  delta: number;
  preview: string;
};

/**
 * Confirmed write: success lands a file, failure never does.
 * `deleted` (F-2d9f6b18) is set only by restoreFromBackup/undoLastApply when
 * undoing a CREATE removed the file rather than restoring a backup body --
 * ordinary applyConfirmed writes never set it.
 */
export type ApplyWriteResult =
  | { ok: true; path: string; bytes: number; backupPath?: string; deleted?: boolean }
  | { ok: false; error: string };

const PREVIEW_LINE_CAP = 40;

/**
 * True when `resolved` is the project root or a descendant of it.
 * Exported as THE sandbox predicate for every path that lands AI output on
 * disk (applyConfirmed, generatePreview, and the CLI's emit --write branch) —
 * one guard, one behavior.
 */
export function withinRoot(resolved: string, projectRoot?: string): boolean {
  const root = resolve(projectRoot ?? process.cwd());
  return resolved === root || resolved.startsWith(root + '/') || resolved.startsWith(root + '\\');
}

/**
 * Resolve a caller-supplied target against the sandbox root.
 * Relative paths land under `projectRoot` (default: process.cwd());
 * absolute paths replace the base (path.resolve already does this).
 */
export function resolveUnderRoot(targetPath: string, projectRoot?: string): string {
  return resolve(projectRoot ?? process.cwd(), targetPath);
}

type DiffOp = { kind: 'eq' | 'del' | 'ins'; line: string };

/** Line-level LCS ops (YAML drafts are small; O(n*m) is fine). */
export function diffLines(oldText: string, newText: string): DiffOp[] {
  const a = oldText.split('\n');
  const b = newText.split('\n');
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ kind: 'eq', line: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ kind: 'del', line: a[i] });
      i++;
    } else {
      ops.push({ kind: 'ins', line: b[j] });
      j++;
    }
  }
  while (i < n) ops.push({ kind: 'del', line: a[i++] });
  while (j < m) ops.push({ kind: 'ins', line: b[j++] });
  return ops;
}

/** Unified diff (single hunk) of existing vs new payload. */
export function formatUnifiedDiff(oldText: string, newText: string, fileLabel: string): string {
  const a = oldText.split('\n');
  const b = newText.split('\n');
  const ops = diffLines(oldText, newText);
  const lines = [
    `--- ${fileLabel}`,
    `+++ ${fileLabel}`,
    `@@ -1,${a.length} +1,${b.length} @@`,
  ];
  let changed = false;
  for (const op of ops) {
    if (op.kind === 'eq') lines.push(` ${op.line}`);
    else if (op.kind === 'del') {
      lines.push(`-${op.line}`);
      changed = true;
    } else {
      lines.push(`+${op.line}`);
      changed = true;
    }
  }
  if (!changed) lines.push(' (no line changes)');
  return lines.join('\n');
}

function capPreviewBody(body: string): string {
  const lines = body.split('\n');
  if (lines.length <= PREVIEW_LINE_CAP) return body;
  return lines.slice(0, PREVIEW_LINE_CAP).join('\n')
    + `\n... (${lines.length - PREVIEW_LINE_CAP} more lines)`;
}

export async function generatePreview(input: ApplyPreviewInput): Promise<ApplyPreviewResult> {
  const resolved = resolveUnderRoot(input.targetPath, input.projectRoot);

  // Security: preview shares the same sandbox as the confirmed write. A
  // model/user-supplied targetPath that escapes the project root must NOT be
  // read here — otherwise preview becomes a file-existence/size oracle for
  // arbitrary on-disk paths outside the project. Block BEFORE any readFile.
  if (!withinRoot(resolved, input.projectRoot)) {
    return {
      targetPath: resolved,
      contentLength: input.content.length,
      existingFile: false,
      existingLength: 0,
      delta: input.content.length,
      preview:
        `--- Apply Preview${input.label ? `: ${input.label}` : ''} ---\n` +
        `Target: ${resolved}\n` +
        `Status: BLOCKED — target path escapes project root\n\n` +
        `No preview generated (out-of-sandbox path).`,
    };
  }

  let existingContent = '';
  let existingFile = false;

  try {
    existingContent = await readFile(resolved, 'utf-8');
    existingFile = true;
  } catch {
    // File doesn't exist — that's fine
  }

  const contentLength = input.content.length;
  const existingLength = existingContent.length;
  const delta = contentLength - existingLength;

  const lines: string[] = [];
  lines.push(`--- Apply Preview${input.label ? `: ${input.label}` : ''} ---`);
  lines.push(`Target: ${resolved}`);
  lines.push(`Status: ${existingFile ? 'OVERWRITE' : 'CREATE'}`);
  lines.push(`Size: ${contentLength} bytes${existingFile ? ` (${delta >= 0 ? '+' : ''}${delta} from existing)` : ''}`);
  lines.push('');

  if (existingFile) {
    const diff = formatUnifiedDiff(existingContent, input.content, resolved);
    lines.push(capPreviewBody(diff));
  } else {
    const contentLines = input.content.split('\n');
    const previewLines = contentLines.slice(0, PREVIEW_LINE_CAP);
    for (const line of previewLines) {
      lines.push(`  ${line}`);
    }
    if (contentLines.length > PREVIEW_LINE_CAP) {
      lines.push(`  ... (${contentLines.length - PREVIEW_LINE_CAP} more lines)`);
    }
  }

  lines.push('');
  lines.push('To apply: re-run with --confirm');

  return {
    targetPath: resolved,
    contentLength,
    existingFile,
    existingLength,
    delta,
    preview: lines.join('\n'),
  };
}

async function atomicReplace(tmpPath: string, destPath: string): Promise<void> {
  try {
    await rename(tmpPath, destPath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | null)?.code;
    // Windows cannot rename over an existing dest (EPERM/EEXIST).
    if (code === 'EEXIST' || code === 'EPERM' || code === 'EACCES') {
      await copyFile(tmpPath, destPath);
      await unlink(tmpPath);
      return;
    }
    throw err;
  }
}

export async function applyConfirmed(input: ApplyPreviewInput): Promise<ApplyWriteResult> {
  const resolved = resolveUnderRoot(input.targetPath, input.projectRoot);
  if (!withinRoot(resolved, input.projectRoot)) {
    return { ok: false, error: `Error: target path escapes project root (${resolved})` };
  }
  await mkdir(dirname(resolved), { recursive: true });

  let backupPath: string | undefined;
  try {
    await access(resolved);
    const existing = await readFile(resolved, 'utf-8');
    backupPath = `${resolved}.bak`;
    await writeFile(backupPath, existing, 'utf-8');
  } catch {
    // no existing file — CREATE, no backup
  }

  const tmpPath = `${resolved}.tmp`;
  await writeFile(tmpPath, input.content, 'utf-8');
  if (backupPath) {
    try { await unlink(resolved); } catch { /* dest already gone */ }
  }
  await atomicReplace(tmpPath, resolved);
  return { ok: true, path: resolved, bytes: input.content.length, backupPath };
}

/**
 * Restore `targetPath` from a sibling `.bak` (or an explicit backupPath), or
 * DELETE it when `wasCreate` says the write being undone had no backup
 * because it created the file (F-2d9f6b18). Used by optional session undo
 * of the last content_applied event.
 */
export async function restoreFromBackup(input: {
  targetPath: string;
  backupPath?: string;
  projectRoot?: string;
  /**
   * True when the content_applied write being undone was a CREATE: there is
   * no backup to restore from because none was ever written (applyConfirmed
   * only backs up a target that already existed). Undo instead removes the
   * file the write created. False/undefined preserves the pre-fix
   * behavior (probe backupPath, else `${resolved}.bak`) for OVERWRITE
   * undos and for legacy history details recorded before this field
   * existed.
   */
  wasCreate?: boolean;
}): Promise<ApplyWriteResult> {
  const resolved = resolveUnderRoot(input.targetPath, input.projectRoot);
  if (!withinRoot(resolved, input.projectRoot)) {
    return { ok: false, error: `Error: target path escapes project root (${resolved})` };
  }

  if (input.wasCreate) {
    let bytes: number;
    try {
      bytes = (await stat(resolved)).size;
    } catch {
      return { ok: false, error: `Error: nothing to undo -- ${resolved} does not exist` };
    }
    await unlink(resolved);
    return { ok: true, path: resolved, bytes, deleted: true };
  }

  const bak = input.backupPath
    ? resolveUnderRoot(input.backupPath, input.projectRoot)
    : `${resolved}.bak`;
  if (!withinRoot(bak, input.projectRoot)) {
    return { ok: false, error: `Error: backup path escapes project root (${bak})` };
  }
  let body: string;
  try {
    body = await readFile(bak, 'utf-8');
  } catch {
    return { ok: false, error: `Error: backup not found (${bak})` };
  }
  return applyConfirmed({ content: body, targetPath: resolved, projectRoot: input.projectRoot });
}

export type ParsedContentAppliedDetail = {
  targetPath: string;
  backupPath?: string;
  /**
   * True: the write was a CREATE (undo deletes). False: an OVERWRITE with a
   * real backupPath (undo restores from it). Undefined: a detail string
   * predating this field (F-2d9f6b18) or one this package never produces
   * itself (hand-written history) -- callers fall back to the legacy
   * backupPath-or-`.bak` probe rather than assume either direction.
   */
  wasCreate?: boolean;
  /**
   * True when this detail records the effect of an UNDO that deleted a
   * CREATE (formatUndoResultDetail's `(deleted by undo)` tag) -- there is
   * nothing left on disk and no backup to chain a further undo from, so
   * callers should refuse cleanly instead of guessing.
   */
  deletedByUndo?: boolean;
};

/**
 * Parse a `content_applied` history detail of the form
 * `path`, `path (create)`, `path (backup: path.bak)`, or
 * `path (deleted by undo)`.
 */
export function parseContentAppliedDetail(detail: string): ParsedContentAppliedDetail {
  const backupMatch = detail.match(/^(.*) \(backup: (.+)\)$/);
  if (backupMatch) {
    return { targetPath: backupMatch[1].trim(), backupPath: backupMatch[2].trim(), wasCreate: false };
  }
  const createMatch = detail.match(/^(.*) \(create\)$/);
  if (createMatch) {
    return { targetPath: createMatch[1].trim(), wasCreate: true };
  }
  const deletedMatch = detail.match(/^(.*) \(deleted by undo\)$/);
  if (deletedMatch) {
    return { targetPath: deletedMatch[1].trim(), deletedByUndo: true };
  }
  return { targetPath: detail.trim() };
}

/**
 * Build the `content_applied` history detail for a successful write
 * (F-2d9f6b18) -- the single producer `parseContentAppliedDetail` parses.
 * Explicitly tags CREATE vs OVERWRITE rather than letting readers infer it
 * from backup-suffix presence/absence.
 */
export function formatContentAppliedDetail(result: { path: string; backupPath?: string }): string {
  return result.backupPath
    ? `${result.path} (backup: ${result.backupPath})`
    : `${result.path} (create)`;
}

/**
 * Build the `content_applied` history detail for the RESULT of an undo
 * (F-2d9f6b18). A restore-from-backup undo produces an ordinary
 * ApplyWriteResult (backupPath set the same way a fresh OVERWRITE's would,
 * since restoreFromBackup's non-delete path runs through applyConfirmed) so
 * formatContentAppliedDetail already describes it correctly, and a further
 * /undo can restore right back to the content this one replaced. A
 * CREATE-undo instead DELETED the file (`result.deleted`): there is no
 * backup and no new content, so tag it distinctly rather than let it be
 * misparsed as a fresh CREATE (which a further /undo would then try to
 * delete again, based on a file that no longer exists).
 */
export function formatUndoResultDetail(result: { path: string; backupPath?: string; deleted?: boolean }): string {
  if (result.deleted) return `${result.path} (deleted by undo)`;
  return formatContentAppliedDetail(result);
}

/** Restore the last `content_applied` target from its backup (or target.bak). */
export async function undoLastApply(input: {
  history: ReadonlyArray<{ kind: string; detail: string }>;
  projectRoot?: string;
  targetPath?: string;
}): Promise<ApplyWriteResult> {
  const last = [...input.history].reverse().find((event) => event.kind === 'content_applied');
  const parsed = last ? parseContentAppliedDetail(last.detail) : undefined;
  const targetPath = input.targetPath ?? parsed?.targetPath;
  if (!targetPath) {
    return { ok: false, error: 'Error: nothing to undo (no content_applied event and no --write path)' };
  }
  if (parsed?.deletedByUndo) {
    return { ok: false, error: `Error: nothing to undo -- the last change already removed ${targetPath}` };
  }
  return restoreFromBackup({
    targetPath,
    backupPath: parsed?.backupPath,
    wasCreate: parsed?.wasCreate,
    projectRoot: input.projectRoot,
  });
}
