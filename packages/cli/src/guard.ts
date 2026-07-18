// Shared action guard — extracted from bin.ts (CLI-010) so the NPC turn
// driver (turns.ts) can reuse it without a bin ⇄ turns import cycle.
// bin.ts re-exports runGuardedAction, so existing imports/tests are unchanged.

/**
 * CLI-010: run an engine action (submitAction / submitActionAs / choose) under a
 * guard so a buggy custom module that throws mid-turn cannot crash an unsaved
 * interactive session. On success returns true. On any throw it swallows the
 * error, prints a single bounded, actionable line, and returns false so the
 * caller can keep prompting (the player can still `save` / `quit`).
 *
 * The message is deliberately bounded: a single line (interior newlines from a
 * raw stack are collapsed) and length-capped so a pathological error string
 * cannot flood the terminal. Structured errors that carry a `code` are surfaced
 * as `[CODE] message` to match the engine's error shape.
 *
 * Exported for unit testing — the interactive `prompt()` loop itself is driven by
 * readline and is awkward to drive in a test.
 */
export function runGuardedAction(
  submit: () => unknown,
  log: (msg: string) => void = console.log,
): boolean {
  try {
    submit();
    return true;
  } catch (err) {
    const reason = describeActionError(err);
    log(`  That action could not be completed: ${reason}`);
    return false;
  }
}

/** Extract a single-line, length-bounded reason from an unknown thrown value. */
export function describeActionError(err: unknown): string {
  let code: string | undefined;
  let message: string;

  if (err instanceof Error) {
    message = err.message;
    const maybeCode = (err as { code?: unknown }).code;
    if (typeof maybeCode === 'string' && maybeCode.length > 0) code = maybeCode;
  } else if (typeof err === 'string') {
    message = err;
  } else {
    message = String(err);
  }

  // Collapse any interior whitespace/newlines (e.g. a raw stack) to single spaces.
  let line = message.replace(/\s+/g, ' ').trim();
  if (!line) line = 'unknown error';
  if (code) line = `[${code}] ${line}`;

  // Bound the total length so a huge error cannot flood the terminal.
  const MAX = 240;
  if (line.length > MAX) line = line.slice(0, MAX - 1) + '…';
  return line;
}
