// The perception filter reads THIS pack's stat, not a fallback.
//
// `createPerceptionFilter()` defaults to an 'instinct' stat. This pack declares
// ledger / tongue / standing and no 'instinct' at all, so a bare call in setup.ts
// would silently fall back to a flat statValue of 5 for every entity — AI
// perception would be identical for a sharp-eyed assayer and a distracted clerk,
// and nothing would fail. setup.ts must pass `{ perceptionStat: 'ledger' }`.
//
// Method (mirrors gladiator's F-bed426aa test): give one observer CONFLICTING
// stats — ledger high / instinct low, then the reverse — against a hidden target
// in a pitch-dark zone. The visual-movement layer's threshold there is
// baseDifficulty(30) + dark(10) + hidden(20) = 60, and score = statValue*7 +
// roll(1-50). At statValue 20 the minimum score (140+) always clears 60; at 1 the
// maximum (57) never does. So the outcome is unambiguous whatever the
// deterministic per-entity roll, which is what lets a single entity prove which
// stat name the filter actually read.

import { describe, it, expect } from 'vitest';
import type { EntityState } from '@ai-rpg-engine/core';
import { getCognition, believes } from '@ai-rpg-engine/modules';
import { createGame } from './setup.js';

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
    ai: { profileId: 'aggressive', goals: [], fears: [], alertLevel: 0, knowledge: {} },
  };
}

describe('merchant setup — perception filter reads `ledger`', () => {
  it('detects the factor when ledger is high, even though instinct is low', () => {
    const engine = createGame(71);
    const zoneId = engine.store.state.locationId;
    engine.store.state.zones[zoneId].light = 0;
    engine.store.state.entities['factor'].visibility = { hidden: true };

    // ledger=20 always clears the threshold; instinct=1 never would. Detection
    // is only possible if the filter read 'ledger'.
    engine.store.addEntity(makeObserver('perception-sharp', { ledger: 20, instinct: 1 }, zoneId));

    engine.store.emitEvent('world.zone.entered', { zoneId }, { actorId: 'factor' });

    const cog = getCognition(engine.world, 'perception-sharp');
    expect(believes(cog, 'factor', 'present', true)).toBe(true);
  });

  it('fails to detect the factor when ledger is low, even though instinct is high', () => {
    const engine = createGame(71);
    const zoneId = engine.store.state.locationId;
    engine.store.state.zones[zoneId].light = 0;
    engine.store.state.entities['factor'].visibility = { hidden: true };

    // The converse. Undetected only if the filter ignored the high 'instinct'.
    engine.store.addEntity(makeObserver('perception-dull', { ledger: 1, instinct: 20 }, zoneId));

    engine.store.emitEvent('world.zone.entered', { zoneId }, { actorId: 'factor' });

    const cog = getCognition(engine.world, 'perception-dull');
    expect(believes(cog, 'factor', 'present', true)).toBe(false);
  });
});
