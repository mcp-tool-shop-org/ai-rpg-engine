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
