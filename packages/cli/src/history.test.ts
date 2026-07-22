// T0-run-history — one JSON line per COMPLETED session (victory/defeat, never
// a mid-session quit) appended to runs.jsonl under the CLI's save directory,
// surfaced as a "Recent runs" block on the adventure select. The failure
// posture mirrors saveGameGuarded (CS-C-008): every fs touch is guarded — a
// write failure reports one structured line and returns false, a read failure
// degrades to "no history"; nothing here may crash or block the session.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  appendRunRecord,
  readRunHistory,
  formatRecentRuns,
  RUNS_FILE_NAME,
  RECENT_RUNS_SHOWN,
  type RunRecord,
} from './history.js';

function record(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    ts: '2026-07-21T04:05:06.000Z',
    packId: 'chapel-threshold',
    outcome: 'defeat',
    rounds: 12,
    kills: 3,
    xp: 20,
    ...overrides,
  };
}

describe('appendRunRecord / readRunHistory (T0-run-history)', () => {
  let tmpDir: string;
  let saveDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-rpg-history-test-'));
    saveDir = path.join(tmpDir, '.ai-rpg-engine');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('appends one JSON line per run, creating the save directory on first write', () => {
    expect(fs.existsSync(saveDir)).toBe(false);

    expect(appendRunRecord(record(), saveDir)).toBe(true);
    expect(appendRunRecord(record({ outcome: 'victory', endingId: 'martyrdom', rounds: 30 }), saveDir)).toBe(true);

    const raw = fs.readFileSync(path.join(saveDir, RUNS_FILE_NAME), 'utf-8');
    const lines = raw.trim().split('\n');
    expect(lines).toHaveLength(2);
    // Each line is standalone JSON with the record schema.
    const first = JSON.parse(lines[0]);
    expect(first).toEqual(record());
    const second = JSON.parse(lines[1]);
    expect(second.outcome).toBe('victory');
    expect(second.endingId).toBe('martyrdom');
  });

  it('a write failure returns false with a structured [HISTORY_WRITE_FAILED] line — and does NOT throw', () => {
    // A regular FILE squatting on the save DIRECTORY path makes both
    // mkdirSync and appendFileSync fail on every platform (same fixture as
    // the saveGameGuarded CS-C-008 test).
    fs.writeFileSync(saveDir, 'not a directory', 'utf-8');
    const log = vi.fn();

    let ok = true;
    expect(() => {
      ok = appendRunRecord(record(), saveDir, log);
    }).not.toThrow();

    expect(ok).toBe(false);
    const logged = log.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('[HISTORY_WRITE_FAILED]');
  });

  it('readRunHistory returns [] when no history exists, and never throws on unreadable state', () => {
    expect(readRunHistory(saveDir)).toEqual([]);
    // A directory squatting on the runs FILE path makes readFileSync throw.
    fs.mkdirSync(path.join(saveDir, RUNS_FILE_NAME), { recursive: true });
    expect(() => readRunHistory(saveDir)).not.toThrow();
    expect(readRunHistory(saveDir)).toEqual([]);
  });

  it('returns the most recent runs NEWEST FIRST, capped at the limit', () => {
    for (let i = 1; i <= 5; i++) {
      appendRunRecord(record({ rounds: i }), saveDir);
    }

    const recent = readRunHistory(saveDir);
    expect(recent).toHaveLength(RECENT_RUNS_SHOWN);
    expect(recent.map((r) => r.rounds)).toEqual([5, 4, 3]);

    expect(readRunHistory(saveDir, 2).map((r) => r.rounds)).toEqual([5, 4]);
  });

  it('skips corrupt and foreign lines instead of dying on them', () => {
    appendRunRecord(record({ rounds: 1 }), saveDir);
    fs.appendFileSync(path.join(saveDir, RUNS_FILE_NAME), '{corrupt json\n', 'utf-8');
    fs.appendFileSync(path.join(saveDir, RUNS_FILE_NAME), JSON.stringify({ foreign: true }) + '\n', 'utf-8');
    appendRunRecord(record({ rounds: 2 }), saveDir);

    const recent = readRunHistory(saveDir);
    expect(recent.map((r) => r.rounds)).toEqual([2, 1]);
  });
});

describe('formatRecentRuns — the adventure-select block', () => {
  const names = new Map([['chapel-threshold', 'Chapel Threshold']]);

  it('renders nothing when there is no history (the section is skipped cleanly)', () => {
    expect(formatRecentRuns([])).toBe('');
  });

  it('renders outcome mark, pack name, rounds/kills, and the date per run', () => {
    const block = formatRecentRuns(
      [
        record({ outcome: 'victory', rounds: 30, kills: 9, ts: '2026-07-20T10:00:00.000Z' }),
        record({ outcome: 'defeat', rounds: 12, kills: 3, ts: '2026-07-19T10:00:00.000Z' }),
      ],
      names,
    );
    expect(block).toContain('Recent runs:');
    expect(block).toContain('✓ Victory — Chapel Threshold · 30 rounds, 9 kills · 2026-07-20');
    expect(block).toContain('✗ Defeat — Chapel Threshold · 12 rounds, 3 kills · 2026-07-19');
  });

  it('singular counts read as prose, and unknown pack ids fall back to the raw id', () => {
    const block = formatRecentRuns([record({ packId: 'gone-pack', rounds: 1, kills: 1 })], names);
    expect(block).toContain('gone-pack');
    expect(block).toContain('1 round, 1 kill ·');
  });
});
