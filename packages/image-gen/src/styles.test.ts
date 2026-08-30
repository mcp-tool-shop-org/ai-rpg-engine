import { describe, it, expect } from 'vitest';
import { STYLE_PRESETS, getStylePreset, GENERIC_STYLE } from './styles.js';

describe('STYLE_PRESETS (F-20680edf)', () => {
  it('lists pursuit and mercantile as first-genre presets, not the generic fallback', () => {
    const genres = STYLE_PRESETS.map((p) => p.genre);
    expect(genres).toContain('pursuit');
    expect(genres).toContain('mercantile');

    const pursuit = getStylePreset('pursuit');
    const mercantile = getStylePreset('mercantile');
    expect(pursuit.style).not.toBe(GENERIC_STYLE);
    expect(mercantile.style).not.toBe(GENERIC_STYLE);
    expect(pursuit.style).toMatch(/warrant|frontier coat|dust/i);
    expect(mercantile.style).toMatch(/ledger|caravanserai|trade-road/i);
  });

  it('still returns the generic fallback for an unknown genre', () => {
    const unknown = getStylePreset('steampunk-underwater');
    expect(unknown.style).toBe(GENERIC_STYLE);
    expect(unknown.genre).toBe('steampunk-underwater');
  });
});
