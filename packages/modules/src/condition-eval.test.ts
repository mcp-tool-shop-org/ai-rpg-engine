// condition-eval.ts — closed, total evaluator. Pins the C3/P2 contract
// including F-ddccdcc7: time-of-day reads Zone.scene.timeOfDay.

import { describe, it, expect } from 'vitest';
import { createTestEngine } from '@ai-rpg-engine/core';
import type { EntityState, ZoneState } from '@ai-rpg-engine/core';
import { evaluateCondition, UNEVALUABLE_OPERANDS } from './condition-eval.js';

const player: EntityState = {
  id: 'player',
  blueprintId: 'player',
  type: 'player',
  name: 'Hero',
  tags: ['player'],
  stats: { vigor: 5, instinct: 5, will: 3 },
  resources: { hp: 20 },
  statuses: [],
  zoneId: 'chapel',
};

function zoneWithTime(timeOfDay?: string): ZoneState {
  return {
    id: 'chapel',
    roomId: 'chapel',
    name: 'Chapel',
    tags: [],
    neighbors: [],
    ...(timeOfDay !== undefined ? { scene: { timeOfDay } } : {}),
  };
}

function worldAt(timeOfDay?: string) {
  return createTestEngine({
    modules: [],
    entities: [player],
    zones: [zoneWithTime(timeOfDay)],
  }).world;
}

describe('UNEVALUABLE_OPERANDS', () => {
  it('player-level and party-level stay unevaluable; time-of-day is not in the set', () => {
    expect(Object.keys(UNEVALUABLE_OPERANDS).sort()).toEqual(['party-level', 'player-level']);
  });
});

describe('time-of-day (F-ddccdcc7)', () => {
  const duskGate = { type: 'time-of-day', params: { equals: 'dusk' } };

  it('an authored dusk gate on a zone whose scene.timeOfDay is dusk returns ok:true', () => {
    const verdict = evaluateCondition(duskGate, worldAt('dusk'), 'player');
    expect(verdict).toEqual({ ok: true, evaluable: true });
  });

  it('the same gate on morning is ok:false evaluable:true', () => {
    const verdict = evaluateCondition(duskGate, worldAt('morning'), 'player');
    expect(verdict.ok).toBe(false);
    expect(verdict.evaluable).toBe(true);
    expect(verdict.reason).toMatch(/morning/);
  });

  it('params.value is accepted as the expected time of day', () => {
    const verdict = evaluateCondition(
      { type: 'time-of-day', params: { value: 'dusk' } },
      worldAt('dusk'),
      'player',
    );
    expect(verdict.ok).toBe(true);
    expect(verdict.evaluable).toBe(true);
  });

  it('missing scene.timeOfDay fail-closes with a named reason', () => {
    const verdict = evaluateCondition(duskGate, worldAt(undefined), 'player');
    expect(verdict.ok).toBe(false);
    expect(verdict.evaluable).toBe(false);
    expect(verdict.reason).toMatch(/timeOfDay/);
  });

  it('player-level remains unevaluable', () => {
    const verdict = evaluateCondition(
      { type: 'player-level', params: { op: '>=', value: 5 } },
      worldAt('dusk'),
      'player',
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.evaluable).toBe(false);
    expect(verdict.reason).toMatch(/player-level/);
  });
});
