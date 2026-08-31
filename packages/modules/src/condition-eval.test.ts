// condition-eval.ts — closed, total evaluator. Pins the C3/P2 contract
// including F-ddccdcc7: time-of-day reads Zone.scene.timeOfDay.

import { describe, it, expect } from 'vitest';
import { createTestEngine } from '@ai-rpg-engine/core';
import type { EntityState, ZoneState } from '@ai-rpg-engine/core';
import { evaluateCondition, UNEVALUABLE_OPERANDS } from './condition-eval.js';
import { createObligation, setPersistedNpcState } from './npc-agency.js';
import type { NpcObligationLedger } from './npc-agency.js';

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

describe('social operands (F-d7bab077)', () => {
  it('leverage-at-least favor>=20 is ok when the actor holds favor 20', () => {
    const world = worldAt('dusk');
    world.entities.player.custom = { 'leverage.favor': 20 };
    const verdict = evaluateCondition(
      { type: 'leverage-at-least', params: { currency: 'favor', amount: 20 } },
      world,
      'player',
    );
    expect(verdict).toEqual({ ok: true, evaluable: true });
  });

  it('leverage-at-least is ok:false when favor is short', () => {
    const world = worldAt('dusk');
    world.entities.player.custom = { 'leverage.favor': 5 };
    const verdict = evaluateCondition(
      { type: 'leverage-at-least', params: { currency: 'favor', amount: 20 } },
      world,
      'player',
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.evaluable).toBe(true);
  });

  it('reputation-at-least merges faction baseline + accrued global', () => {
    const world = worldAt('dusk');
    world.factions['guild'] = { id: 'guild', name: 'Guild', reputation: 6, disposition: 'neutral' };
    world.globals['reputation_guild'] = 5;
    const verdict = evaluateCondition(
      { type: 'reputation-at-least', params: { factionId: 'guild', amount: 10 } },
      world,
      'player',
    );
    expect(verdict).toEqual({ ok: true, evaluable: true });
  });

  it('npc-relationship-at-least reads stored player-trust', () => {
    const world = worldAt('dusk');
    world.entities['merchant'] = {
      ...player,
      id: 'merchant',
      type: 'npc',
      name: 'Merchant',
      tags: ['npc'],
      relations: { 'player-trust': 60 },
    };
    const verdict = evaluateCondition(
      { type: 'npc-relationship-at-least', params: { npcId: 'merchant', axis: 'trust', amount: 50 } },
      world,
      'player',
    );
    expect(verdict).toEqual({ ok: true, evaluable: true });
  });

  it('obligation-exists is ok when a player-owes-npc ledger is planted', () => {
    const world = worldAt('dusk');
    const ledger: NpcObligationLedger = {
      obligations: [createObligation('debt', 'player-owes-npc', 'merchant', 'player', 3, 'test', 0, null)],
    };
    setPersistedNpcState(world, [], [], new Map([['merchant', ledger]]));
    const verdict = evaluateCondition(
      { type: 'obligation-exists', params: { npcId: 'merchant', direction: 'player-owes-npc' } },
      world,
      'player',
    );
    expect(verdict).toEqual({ ok: true, evaluable: true });
  });

  it('unknown types still fail-closed; player-level stays unevaluable', () => {
    const world = worldAt('dusk');
    const unknown = evaluateCondition({ type: 'not-a-real-operand', params: {} }, world, 'player');
    expect(unknown.ok).toBe(false);
    expect(unknown.evaluable).toBe(false);
    const level = evaluateCondition(
      { type: 'party-level', params: { op: '>=', value: 3 } },
      world,
      'player',
    );
    expect(level.ok).toBe(false);
    expect(level.evaluable).toBe(false);
  });
});
