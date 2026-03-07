// Readline-based prompt utilities for CLI menus

import * as readline from 'node:readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

export function getReadline(): readline.Interface {
  return rl;
}

export function closeReadline(): void {
  rl.close();
}

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
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

/** Prompt for multiple selections from a numbered menu. Returns array of 0-based indices. */
export async function promptMultiSelect(
  items: { label: string; detail?: string }[],
  opts: { min?: number; max?: number } = {},
): Promise<number[]> {
  const min = opts.min ?? 0;
  const max = opts.max ?? items.length;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    console.log(`  [${i + 1}] ${item.label}`);
    if (item.detail) console.log(`      ${item.detail}`);
  }
  console.log();
  console.log(`  Enter numbers separated by spaces (${min}-${max} selections):`);

  while (true) {
    const answer = await ask('  > ');
    const nums = answer.split(/[\s,]+/).map((s) => parseInt(s, 10));
    const valid = nums.filter((n) => !isNaN(n) && n >= 1 && n <= items.length);
    const unique = [...new Set(valid)];

    if (unique.length >= min && unique.length <= max) {
      return unique.map((n) => n - 1);
    }
    console.log(`  Please select ${min}-${max} items.`);
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
