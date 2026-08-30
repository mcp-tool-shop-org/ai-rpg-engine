// F-85e1d9f1 — wizard/pack-select menus must reject suffix tokens the way
// in-game menus do (parseActionSelection / parseExtraSelection whole-token
// /^\d+$/). parseInt('1a', 10) === 1 must not select item 1.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  parseMenuIndex,
  parseMultiSelectIndices,
  promptMenu,
  promptOptionalMenu,
  promptMultiSelect,
  paddedMenuIndex,
  queueInputLine,
  drainInputQueue,
} from './prompts.js';

describe('parseMenuIndex (F-85e1d9f1)', () => {
  it('accepts a whole-token in-range digit', () => {
    expect(parseMenuIndex('1', 3)).toBe(0);
    expect(parseMenuIndex('3', 3)).toBe(2);
  });

  it('rejects suffix tokens that parseInt would prefix-parse as 1', () => {
    expect(parseMenuIndex('1a', 3)).toBeNull();
    expect(parseMenuIndex('1.5', 3)).toBeNull();
    expect(parseMenuIndex('1e2', 3)).toBeNull();
  });
});

describe('parseMultiSelectIndices (F-85e1d9f1)', () => {
  it('accepts whole-token digits', () => {
    expect(parseMultiSelectIndices('1 2', 4)).toEqual([0, 1]);
    expect(parseMultiSelectIndices('1,3', 4)).toEqual([0, 2]);
  });

  it('rejects a suffix token in the list (1,foo is not a pick of 1)', () => {
    expect(parseMultiSelectIndices('1,foo', 4)).toBeNull();
    expect(parseMultiSelectIndices('1a', 4)).toBeNull();
  });
});

describe('promptMenu suffix tokens (F-85e1d9f1)', () => {
  beforeEach(() => {
    drainInputQueue();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    drainInputQueue();
    vi.restoreAllMocks();
  });

  it("promptMenu('1a') does not return index 0", async () => {
    queueInputLine('1a');
    queueInputLine('2');
    const idx = await promptMenu([{ label: 'Alpha' }, { label: 'Beta' }]);
    expect(idx).toBe(1);
  });

  it('promptOptionalMenu re-prompts on 1a rather than selecting item 1', async () => {
    queueInputLine('1a');
    queueInputLine('');
    const idx = await promptOptionalMenu([{ label: 'Alpha' }, { label: 'Beta' }]);
    expect(idx).toBe(-1);
  });

  it('promptMultiSelect re-prompts on 1a rather than selecting item 1', async () => {
    queueInputLine('1a');
    queueInputLine('1');
    const idx = await promptMultiSelect(
      [{ label: 'Alpha' }, { label: 'Beta' }],
      { min: 1, max: 2 },
    );
    expect(idx).toEqual([0]);
  });
});

describe('promptMenu padStart (F-da435841)', () => {
  beforeEach(() => {
    drainInputQueue();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    drainInputQueue();
    vi.restoreAllMocks();
  });

  it('a 12-item list (selectPack starters) shares a column for [ 1] and [12]', async () => {
    const logs: string[] = [];
    vi.mocked(console.log).mockImplementation((msg?: unknown) => {
      logs.push(String(msg ?? ''));
    });
    queueInputLine('12');
    const items = Array.from({ length: 12 }, (_, i) => ({ label: `Pack ${i + 1}` }));
    await promptMenu(items);
    const text = logs.join('\n');
    expect(text).toContain('[ 1] Pack 1');
    expect(text).toContain('[12] Pack 12');
    expect(paddedMenuIndex(0, 12)).toBe('[ 1]');
    expect(paddedMenuIndex(11, 12)).toBe('[12]');
  });
});

describe('promptMultiSelect group headers (F-3414d208)', () => {
  beforeEach(() => {
    drainInputQueue();
  });

  afterEach(() => {
    drainInputQueue();
    vi.restoreAllMocks();
  });

  it('prints [Perks] above perk numbers and [Flaws] above flaw numbers, never stacked empty', async () => {
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg?: unknown) => {
      logs.push(String(msg ?? ''));
    });
    queueInputLine('1');
    await promptMultiSelect(
      [
        { label: 'Tough', group: 'Perks' },
        { label: 'Frail (flaw)', group: 'Flaws' },
      ],
      { min: 1, max: 2 },
    );
    const text = logs.join('\n');
    expect(text).not.toContain('[Perks]\n  [Flaws]\n');
    const perksAt = text.indexOf('[Perks]');
    const toughAt = text.indexOf('Tough');
    const flawsAt = text.indexOf('[Flaws]');
    const frailAt = text.indexOf('Frail');
    expect(perksAt).toBeGreaterThan(-1);
    expect(flawsAt).toBeGreaterThan(-1);
    expect(perksAt).toBeLessThan(toughAt);
    expect(toughAt).toBeLessThan(flawsAt);
    expect(flawsAt).toBeLessThan(frailAt);
  });

  it('always emits [Flaws] when flaws are offered with no perks', async () => {
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((msg?: unknown) => {
      logs.push(String(msg ?? ''));
    });
    queueInputLine('1');
    await promptMultiSelect(
      [{ label: 'Frail (flaw)', group: 'Flaws' }],
      { min: 1, max: 1 },
    );
    expect(logs.join('\n')).toContain('[Flaws]');
  });
});
