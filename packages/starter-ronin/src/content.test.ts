// Ronin content integrity tests
//
// ST-05: the pack applies an 'off-balance' status. The engine combat layer also
// has an "off balance" combat state, but it is namespaced as
// COMBAT_STATES.OFF_BALANCE ('combat:off_balance'). These are distinct status
// ids and must NOT shadow or collide — applying the pack status must not
// register the engine combat state, and vice versa. This test pins that
// separation so a future rename of either side cannot silently collide.

import { describe, it, expect } from 'vitest';
import type { EntityState } from '@ai-rpg-engine/core';
import { COMBAT_STATES, applyStatus, hasStatus } from '@ai-rpg-engine/modules';
import { roninStatusDefinitions } from './content.js';

function makeEntity(): EntityState {
  return {
    id: 'subject', blueprintId: 'subject', type: 'enemy', name: 'Subject',
    tags: [], stats: {}, resources: { hp: 10 }, statuses: [], zoneId: 'z',
  };
}

describe('ronin content — off-balance status disambiguation (ST-05)', () => {
  const packOffBalance = roninStatusDefinitions.find((s) => s.id === 'off-balance');

  it('declares an "off-balance" pack status', () => {
    expect(packOffBalance).toBeDefined();
  });

  it('pack "off-balance" id is distinct from the engine COMBAT_STATES.OFF_BALANCE id', () => {
    expect(packOffBalance!.id).toBe('off-balance');
    expect(COMBAT_STATES.OFF_BALANCE).toBe('combat:off_balance');
    expect(packOffBalance!.id).not.toBe(COMBAT_STATES.OFF_BALANCE);
  });

  it('applying the pack "off-balance" status does not register the engine combat state', () => {
    const e = makeEntity();
    applyStatus(e, 'off-balance', 0, { duration: 2 });
    expect(hasStatus(e, 'off-balance')).toBe(true);
    expect(hasStatus(e, COMBAT_STATES.OFF_BALANCE)).toBe(false);
  });

  it('applying the engine combat state does not register the pack "off-balance" status', () => {
    const e = makeEntity();
    applyStatus(e, COMBAT_STATES.OFF_BALANCE, 0, { duration: 2 });
    expect(hasStatus(e, COMBAT_STATES.OFF_BALANCE)).toBe(true);
    expect(hasStatus(e, 'off-balance')).toBe(false);
  });
});
