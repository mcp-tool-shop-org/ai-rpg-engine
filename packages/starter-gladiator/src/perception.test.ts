// Perception filter wiring — F-bed426aa regression test
//
// createPerceptionFilter() defaults perceptionStat to the literal string
// 'instinct' (packages/modules/src/perception-filter.ts). This pack does not
// declare an 'instinct' stat, so a bare createPerceptionFilter() call in
// setup.ts silently falls back to a flat statValue of 5 for every entity —
// the pack's real 'agility' stat (the precision half of gladiatorMinimalRuleset's
// combat/ability statMapping) would never influence AI perception. setup.ts
// must pass `{ perceptionStat: 'agility' }` explicitly.

import { describe, it, expect } from 'vitest';
import type { EntityState } from '@ai-rpg-engine/core';
import { getCognition, believes } from '@ai-rpg-engine/modules';
import { createGame } from './setup.js';

// Threshold for the built-in visual-movement layer against a hidden target
// in a pitch-dark zone: baseDifficulty(30) + darkAdjustment(10, light=0) +
// hidden(20) = 60. score = statValue*7 + roll(1-50). At statValue=20 the
// minimum possible score (141) always clears 60; at statValue=1 the maximum
// possible score (57) never does — so the outcome is unambiguous regardless
// of the deterministic per-entity roll, which lets a single conflicting-stat
// entity prove which stat name the filter actually reads.

function makeObserver(id: string, stats: Record<string, number>, zoneId: string): EntityState {
  return {
    id,
    blueprintId: id,
    type: 'enemy',
    name: id,
    tags: ['enemy'],
    stats,
    resources: { hp: 10, stamina: 5 },
    statuses: [],
    zoneId,
    ai: { profileId: 'test', goals: [], fears: [], alertLevel: 0, knowledge: {} },
  };
}

describe('gladiator setup — perception filter reads the real stat (F-bed426aa)', () => {
  it('detects the player when agility is high, even though instinct is low', () => {
    const engine = createGame(42);
    const zoneId = engine.store.state.locationId;
    engine.store.state.zones[zoneId].light = 0;
    engine.store.state.entities['player'].visibility = { hidden: true };

    // agility=20 (always clears threshold), instinct=1 (never would).
    // Detected only if the filter reads 'agility', not the 'instinct' fallback.
    engine.store.addEntity(makeObserver('perception-test-sharp', { agility: 20, instinct: 1 }, zoneId));

    engine.store.emitEvent('world.zone.entered', { zoneId }, { actorId: 'player' });

    const cog = getCognition(engine.world, 'perception-test-sharp');
    expect(believes(cog, 'player', 'present', true)).toBe(true);
  });

  it('fails to detect the player when agility is low, even though instinct is high', () => {
    const engine = createGame(42);
    const zoneId = engine.store.state.locationId;
    engine.store.state.zones[zoneId].light = 0;
    engine.store.state.entities['player'].visibility = { hidden: true };

    // agility=1 (never clears threshold), instinct=20 (always would).
    // Undetected only if the filter reads 'agility', not the 'instinct' fallback.
    engine.store.addEntity(makeObserver('perception-test-dull', { agility: 1, instinct: 20 }, zoneId));

    engine.store.emitEvent('world.zone.entered', { zoneId }, { actorId: 'player' });

    const cog = getCognition(engine.world, 'perception-test-dull');
    expect(believes(cog, 'player', 'present', true)).toBe(false);
  });
});
