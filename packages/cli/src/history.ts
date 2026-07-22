// Run history — one JSON line per COMPLETED session (victory or defeat; a
// mid-session quit records nothing), appended to runs.jsonl in the CLI's save
// directory. The adventure select surfaces the last few as a "Recent runs"
// block, so the table remembers how the last stories ended.
//
// Failure posture mirrors saveGameGuarded (CS-C-008): every fs touch is
// guarded — a history write/read failure prints one structured line (or
// silently yields no history for reads) and NEVER crashes or blocks the
// session. History is a nicety; the game is the point.

import * as fs from 'node:fs';
import * as path from 'node:path';

/** One completed session, as recorded in runs.jsonl. */
export type RunRecord = {
  /** ISO timestamp of the session end. */
  ts: string;
  /** The pack's manifest id (world.meta.gameId's authority). */
  packId: string;
  outcome: 'victory' | 'defeat';
  /** The campaign-layer trigger id, when evaluateEndgame's thresholds fired. */
  endingId?: string;
  /** Rounds survived (world.meta.tick). */
  rounds: number;
  /** Enemies defeated. */
  kills: number;
  /** XP earned (see computeSessionStats). */
  xp: number;
};

export const RUNS_FILE_NAME = 'runs.jsonl';

/** How many history entries the adventure select shows. */
export const RECENT_RUNS_SHOWN = 3;

/**
 * Append one run record to `<saveDir>/runs.jsonl` (creating the directory on
 * first write, same as the save path). Returns false — never throws — when
 * the filesystem refuses; the caller keeps the session flow either way.
 */
export function appendRunRecord(
  record: RunRecord,
  saveDir: string,
  log: (msg: string) => void = console.log,
): boolean {
  const filePath = path.join(saveDir, RUNS_FILE_NAME);
  try {
    if (!fs.existsSync(saveDir)) {
      fs.mkdirSync(saveDir, { recursive: true });
    }
    fs.appendFileSync(filePath, JSON.stringify(record) + '\n', 'utf-8');
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    log(`  [HISTORY_WRITE_FAILED] Could not record this run in ${path.resolve(filePath)}: ${reason}`);
    return false;
  }
  return true;
}

/** Shape guard for one parsed history line — foreign/corrupt lines are skipped. */
function isRunRecord(value: unknown): value is RunRecord {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.ts === 'string' &&
    typeof r.packId === 'string' &&
    (r.outcome === 'victory' || r.outcome === 'defeat') &&
    typeof r.rounds === 'number' &&
    typeof r.kills === 'number' &&
    typeof r.xp === 'number'
  );
}

/**
 * Read the most recent `limit` completed runs, NEWEST FIRST. Missing file,
 * unreadable file, and corrupt lines all degrade to "less history" — never
 * a throw (the adventure select must render with or without a past).
 */
export function readRunHistory(saveDir: string, limit = RECENT_RUNS_SHOWN): RunRecord[] {
  const filePath = path.join(saveDir, RUNS_FILE_NAME);
  let raw: string;
  try {
    if (!fs.existsSync(filePath)) return [];
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }

  const records: RunRecord[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (isRunRecord(parsed)) records.push(parsed);
    } catch {
      // Corrupt line — skip it; the rest of the history still counts.
    }
  }
  return records.slice(-limit).reverse();
}

/**
 * The "Recent runs" block for the adventure select — '' when there is no
 * history so the caller can skip the section cleanly. `packNames` maps pack
 * ids to display names; unknown
 * ids (a pack no longer installed) fall back to the raw id.
 */
export function formatRecentRuns(
  records: RunRecord[],
  packNames: Map<string, string> = new Map(),
): string {
  if (records.length === 0) return '';
  const lines: string[] = ['  Recent runs:'];
  for (const r of records) {
    const mark = r.outcome === 'victory' ? '✓ Victory' : '✗ Defeat';
    const name = packNames.get(r.packId) ?? r.packId;
    const rounds = `${r.rounds} round${r.rounds === 1 ? '' : 's'}`;
    const kills = `${r.kills} kill${r.kills === 1 ? '' : 's'}`;
    const day = r.ts.slice(0, 10);
    lines.push(`    ${mark} — ${name} · ${rounds}, ${kills} · ${day}`);
  }
  return lines.join('\n');
}
