// social-consequence contract tests (PM-2 coverage)
//
// Stance cascade, reputation → mechanics mapping, and title evolution feed
// NPC dialogue bias and the player's rumorized identity. Pure functions —
// pins the priority-cascade boundaries.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  deriveStance,
  getReputationConsequence,
  evolveTitle,
  buildPlayerDescriptor,
} from './social-consequence.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const calmCog = { morale: 50, suspicion: 0 };

describe('deriveStance priority cascade', () => {
  it('hostile at reputation ≤ -60 (highest priority)', () => {
    expect(deriveStance(-60, { morale: 0, suspicion: 100 }, 100)).toBe('hostile');
  });

  it('fearful at suspicion ≥ 80 (before awe)', () => {
    expect(deriveStance(80, { morale: 50, suspicion: 80 }, 0)).toBe('fearful');
  });

  it('awed at reputation ≥ 60', () => {
    expect(deriveStance(60, calmCog, 0)).toBe('awed');
  });

  it('pitying at morale ≤ 20', () => {
    expect(deriveStance(0, { morale: 20, suspicion: 0 }, 0)).toBe('pitying');
  });

  it('opportunistic at alert ≥ 50 with negative reputation', () => {
    expect(deriveStance(-1, calmCog, 50)).toBe('opportunistic');
    expect(deriveStance(0, calmCog, 50)).toBe('neutral'); // rep must be < 0
  });

  it('kinship at reputation ≥ 30, else neutral', () => {
    expect(deriveStance(30, calmCog, 0)).toBe('kinship');
    expect(deriveStance(29, calmCog, 0)).toBe('neutral');
  });
});

describe('getReputationConsequence bands', () => {
  it('maps reputation to price/access tiers', () => {
    expect(getReputationConsequence(-60)).toMatchObject({ priceModifier: 1.5, accessLevel: 'denied' });
    expect(getReputationConsequence(-20)).toMatchObject({ priceModifier: 1.3, accessLevel: 'restricted' });
    expect(getReputationConsequence(0)).toMatchObject({ priceModifier: 1.0, accessLevel: 'normal' });
    expect(getReputationConsequence(20)).toMatchObject({ priceModifier: 0.9, accessLevel: 'normal' });
    expect(getReputationConsequence(60)).toMatchObject({ priceModifier: 0.7, accessLevel: 'privileged' });
  });

  // F-4684385c: single pricing truth. priceModifier is not deleted (no
  // production caller ever read it, so there's nothing to migrate off it),
  // but it must carry a deprecation note pointing at trade-value.ts's
  // computeItemValue as the one live reputation→price mapping, so a future
  // reader never wires a SECOND pricing formula off this field.
  // accessLevel/dialogueBias are untouched by this finding (no behavior
  // change anywhere) — pinned unchanged by the band test above.
  it('priceModifier carries a deprecation note pointing at trade-value.ts computeItemValue', () => {
    const source = readFileSync(resolve(__dirname, 'social-consequence.ts'), 'utf-8');
    const fieldBlock = source.slice(source.indexOf('export type ReputationConsequence'), source.indexOf('priceModifier: number;'));
    expect(fieldBlock).toContain('@deprecated');
    expect(fieldBlock).toContain('computeItemValue');
  });

  it('behavior is unchanged: getReputationConsequence still returns priceModifier at every band', () => {
    // Re-pins the SAME band table as the test above — the deprecation note is
    // documentation-only, never a behavior change (F-4684385c's own contract).
    expect(getReputationConsequence(-60).priceModifier).toBe(1.5);
    expect(getReputationConsequence(60).priceModifier).toBe(0.7);
  });
});

describe('evolveTitle', () => {
  const evolutions = [
    { replace: 'the Bounty-Breaker', requiredTags: ['bounty-survivor'] },
    { prefix: 'Iron', requiredTags: ['survival'], minCount: 2 },
    { suffix: 'of the Docks', requiredTags: ['trade-broker'] },
  ];

  it('replace wins outright when tags qualify', () => {
    expect(evolveTitle('Wanderer', ['bounty-survivor'], evolutions)).toBe('the Bounty-Breaker');
    // replace applies even without a current title
    expect(evolveTitle(undefined, ['bounty-survivor'], evolutions)).toBe('the Bounty-Breaker');
  });

  it('enforces minCount on required tags', () => {
    expect(evolveTitle('Wanderer', ['survival'], evolutions)).toBe('Wanderer');
    expect(evolveTitle('Wanderer', ['survival', 'survival'], evolutions)).toBe('Iron Wanderer');
  });

  it('prefix/suffix require an existing title', () => {
    expect(evolveTitle(undefined, ['trade-broker'], evolutions)).toBeUndefined();
    expect(evolveTitle('Wanderer', ['trade-broker'], evolutions)).toBe('Wanderer of the Docks');
  });

  it('returns the current title when nothing qualifies', () => {
    expect(evolveTitle('Wanderer', ['unrelated'], evolutions)).toBe('Wanderer');
  });
});

describe('buildPlayerDescriptor', () => {
  it('renders name, title, archetype, level, and injuries', () => {
    expect(buildPlayerDescriptor('Rook', 'duelist', 4, ['a limp'], 'the Bounty-Breaker'))
      .toBe('Rook "the Bounty-Breaker", a level 4 duelist, bearing a limp');
    expect(buildPlayerDescriptor('Rook', 'duelist', 1, []))
      .toBe('Rook, a level 1 duelist');
  });
});
