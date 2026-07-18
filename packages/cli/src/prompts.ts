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

/** Prompt for a single selection from a numbered menu. Returns the 0-based index. */
export async function promptMenu(
  items: { label: string; detail?: string }[],
): Promise<number> {
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    console.log(`  [${i + 1}] ${item.label}`);
    if (item.detail) console.log(`      ${item.detail}`);
  }
  console.log();

  while (true) {
    const answer = await ask('  > ');
    const n = parseInt(answer, 10);
    if (!isNaN(n) && n >= 1 && n <= items.length) return n - 1;
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
  items: { label: string; detail?: string }[],
  opts: { min?: number; max?: number; hint?: string } = {},
): Promise<number[]> {
  const min = opts.min ?? 0;
  const max = opts.max ?? items.length;
  const hint = opts.hint ? ` — ${opts.hint}` : '';

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    console.log(`  [${i + 1}] ${item.label}`);
    if (item.detail) console.log(`      ${item.detail}`);
  }
  console.log();
  console.log(`  Enter numbers separated by spaces (${min}-${max} selections${hint}):`);

  while (true) {
    const answer = await ask('  > ');
    const nums = answer.split(/[\s,]+/).map((s) => parseInt(s, 10));
    const valid = nums.filter((n) => !isNaN(n) && n >= 1 && n <= items.length);
    const unique = [...new Set(valid)];

    if (unique.length >= min && unique.length <= max) {
      return unique.map((n) => n - 1);
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
  items: { label: string; detail?: string }[],
): Promise<number> {
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    console.log(`  [${i + 1}] ${item.label}`);
    if (item.detail) console.log(`      ${item.detail}`);
  }
  console.log();
  console.log('  Press Enter to skip.');

  while (true) {
    const answer = await ask('  > ');
    if (answer === '') return -1;
    const n = parseInt(answer, 10);
    if (!isNaN(n) && n >= 1 && n <= items.length) return n - 1;
    console.log(`  Enter a number (1-${items.length}) or press Enter to skip.`);
  }
}
