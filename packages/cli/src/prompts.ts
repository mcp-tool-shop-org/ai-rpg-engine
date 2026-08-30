// Readline-based prompt utilities for CLI menus
//
// F1 hardening: input lines are QUEUED, not raced. `rl.question` only
// consumes a line while its one-shot listener is attached — when input is
// piped (a scripted drive, `printf ... | ai-rpg-engine run`), the whole
// script arrives in one chunk and readline emits every line synchronously;
// all lines after the currently-pending question landed with NO listener and
// were silently dropped, so any promise-based prompt flow (character
// creation, the session loop) starved and the process fell off the end of
// stdin. A permanent 'line' listener now buffers everything; ask() serves
// from the buffer or awaits the next line. Interactive TTY behavior is
// unchanged (a human can't outtype a pending prompt).

import * as readline from 'node:readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

/** Thrown when input ends (EOF) while a prompt is waiting — a scripted drive
 *  under-supplied lines, or the terminal went away. Callers must NOT retry
 *  (the old retry-loops would spin forever on a closed stdin). */
export class InputEndedError extends Error {
  constructor() {
    super('Input ended while a prompt was waiting (EOF on stdin).');
    this.name = 'InputEndedError';
  }
}

const lineQueue: string[] = [];
let pendingResolve: ((line: string) => void) | null = null;
let pendingReject: ((err: Error) => void) | null = null;
let inputClosed = false;

rl.on('line', (line) => {
  if (pendingResolve) {
    // Piped (non-TTY) input is not echoed by the terminal — write it so
    // transcripts read like an interactive session (same as the queue-served
    // branch in promptLine; a real TTY echoes keystrokes itself).
    if (!process.stdin.isTTY) process.stdout.write(line + '\n');
    const resolve = pendingResolve;
    pendingResolve = null;
    pendingReject = null;
    resolve(line);
  } else {
    lineQueue.push(line);
  }
});

rl.on('close', () => {
  inputClosed = true;
  if (pendingReject) {
    const reject = pendingReject;
    pendingResolve = null;
    pendingReject = null;
    reject(new InputEndedError());
  }
});

export function getReadline(): readline.Interface {
  return rl;
}

export function closeReadline(): void {
  rl.close();
}

/** Queue a line as if the user typed it. Exported so tests can drive promptMenu
 *  without racing stdin (the same buffer promptLine already serves). */
export function queueInputLine(line: string): void {
  lineQueue.push(line);
}

/** Drop queued lines between tests so one suite cannot feed the next. */
export function drainInputQueue(): void {
  lineQueue.length = 0;
}

/**
 * Whole-token digits only, matching parseExtraSelection / parseActionSelection
 * (F-7d5f3da9). `parseInt('1a', 10) === 1` must not select item 1.
 * Returns a 0-based index, or null to re-prompt.
 */
export function parseMenuIndex(answer: string, itemCount: number): number | null {
  if (!/^\d+$/.test(answer)) return null;
  const n = parseInt(answer, 10);
  if (n >= 1 && n <= itemCount) return n - 1;
  return null;
}

/**
 * Per-token whole-digit parse for multi-select. Any suffix token (`1a`, `foo`)
 * rejects the whole answer so `1,foo` cannot count as a legal pick of 1.
 */
export function parseMultiSelectIndices(answer: string, itemCount: number): number[] | null {
  const tokens = answer.split(/[\s,]+/).filter((t) => t.length > 0);
  if (tokens.length === 0) return null;
  const indices: number[] = [];
  for (const token of tokens) {
    if (!/^\d+$/.test(token)) return null;
    const n = parseInt(token, 10);
    if (n < 1 || n > itemCount) return null;
    indices.push(n - 1);
  }
  return [...new Set(indices)];
}

/**
 * Print `prompt` and read one line — from the buffer when scripted input has
 * already arrived, else awaiting the next line. Rejects with InputEndedError
 * on EOF so prompt loops fail loudly instead of spinning.
 */
export function promptLine(prompt: string): Promise<string> {
  process.stdout.write(prompt);
  if (lineQueue.length > 0) {
    const line = lineQueue.shift() as string;
    // Echo scripted input so transcripts read like an interactive session.
    if (!process.stdin.isTTY) process.stdout.write(line + '\n');
    return Promise.resolve(line);
  }
  if (inputClosed) {
    return Promise.reject(new InputEndedError());
  }
  return new Promise<string>((resolve, reject) => {
    pendingResolve = resolve;
    pendingReject = reject;
  });
}

async function ask(question: string): Promise<string> {
  const answer = await promptLine(question);
  return answer.trim();
}

/** Prompt for free-form text input. Returns trimmed string. */
export async function promptText(label: string): Promise<string> {
  while (true) {
    const answer = await ask(`  ${label} `);
    if (answer.length > 0) return answer;
    console.log('  Please enter a value.');
  }
}

/** Right-aligned `[ 9]` / `[10]` — same padStart width P8-PS-005 uses in-game. */
export function paddedMenuIndex(index: number, count: number): string {
  const width = String(Math.max(count, 1)).length;
  return `[${String(index + 1).padStart(width)}]`;
}

function printMenuItems(
  items: { label: string; detail?: string; group?: string }[],
): void {
  let prevGroup: string | undefined;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.group !== undefined && item.group !== prevGroup) {
      if (prevGroup !== undefined) console.log();
      console.log(`  [${item.group}]`);
      prevGroup = item.group;
    }
    console.log(`  ${paddedMenuIndex(i, items.length)} ${item.label}`);
    if (item.detail) console.log(`      ${item.detail}`);
  }
}

/**
 * Prompt for a single selection from a numbered menu. Returns the 0-based index.
 * `opts.footer` renders a pre-formatted block between the item list and the
 * prompt (the adventure select's "Recent runs" panel) — display only, never
 * part of the numbered range.
 */
export async function promptMenu(
  items: { label: string; detail?: string; group?: string }[],
  opts: { footer?: string } = {},
): Promise<number> {
  printMenuItems(items);
  if (opts.footer) {
    console.log();
    console.log(opts.footer);
  }
  console.log();

  while (true) {
    const answer = await ask('  > ');
    const idx = parseMenuIndex(answer, items.length);
    if (idx !== null) return idx;
    console.log(`  Please enter a number between 1 and ${items.length}.`);
  }
}

/**
 * Prompt for multiple selections from a numbered menu. Returns array of
 * 0-based indices.
 *
 * CS-C-004: `hint` lets the caller state the REAL selection rule (e.g.
 * "include at least 1 flaw") alongside the generic count constraint — the
 * bare count ("select 1-3 items") let a zero-flaw trait pick look valid and
 * fail only at end-of-wizard validation.
 */
export async function promptMultiSelect(
  items: { label: string; detail?: string; group?: string }[],
  opts: { min?: number; max?: number; hint?: string } = {},
): Promise<number[]> {
  const min = opts.min ?? 0;
  const max = opts.max ?? items.length;
  const hint = opts.hint ? ` — ${opts.hint}` : '';

  printMenuItems(items);
  console.log();
  console.log(`  Enter numbers separated by spaces (${min}-${max} selections${hint}):`);

  while (true) {
    const answer = await ask('  > ');
    const unique = parseMultiSelectIndices(answer, items.length);
    if (unique !== null && unique.length >= min && unique.length <= max) {
      return unique;
    }
    console.log(`  Please select ${min}-${max} items${hint}.`);
  }
}

/** Prompt for yes/no confirmation. Returns true for yes. */
export async function promptConfirm(question: string, defaultYes = true): Promise<boolean> {
  const hint = defaultYes ? '[Y/n]' : '[y/N]';
  const answer = await ask(`  ${question} ${hint} `);
  if (answer === '') return defaultYes;
  return answer.toLowerCase().startsWith('y');
}

/** Prompt for optional selection (Enter to skip). Returns 0-based index or -1 for skip. */
export async function promptOptionalMenu(
  items: { label: string; detail?: string; group?: string }[],
): Promise<number> {
  printMenuItems(items);
  console.log();
  console.log('  Press Enter to skip.');

  while (true) {
    const answer = await ask('  > ');
    if (answer === '') return -1;
    const idx = parseMenuIndex(answer, items.length);
    if (idx !== null) return idx;
    console.log(`  Enter a number (1-${items.length}) or press Enter to skip.`);
  }
}
