// Detective content integrity tests
//
// ST-05: the pack applies an 'exposed' status. The engine combat layer also
// has an "exposed" combat state, but it is namespaced as COMBAT_STATES.EXPOSED
// ('combat:exposed'). These are distinct status ids and must NOT shadow or
// collide with one another — applying the pack status must not register the
// engine combat state, and vice versa. This test pins that separation so a
// future rename of either side cannot silently introduce a collision.

import { describe, it, expect } from 'vitest';
import type { EntityState } from '@ai-rpg-engine/core';
import { COMBAT_STATES, applyStatus, hasStatus } from '@ai-rpg-engine/modules';
import { detectiveStatusDefinitions } from './content.js';

function makeEntity(): EntityState {
  return {
    id: 'subject', blueprintId: 'subject', type: 'enemy', name: 'Subject',
    tags: [], stats: {}, resources: { hp: 10 }, statuses: [], zoneId: 'z',
  };
}

describe('detective content — exposed status disambiguation (ST-05)', () => {
  const packExposed = detectiveStatusDefinitions.find((s) => s.id === 'exposed');

  it('declares an "exposed" pack status', () => {
    expect(packExposed).toBeDefined();
  });

  it('pack "exposed" id is distinct from the engine COMBAT_STATES.EXPOSED id', () => {
    expect(packExposed!.id).toBe('exposed');
    expect(COMBAT_STATES.EXPOSED).toBe('combat:exposed');
    expect(packExposed!.id).not.toBe(COMBAT_STATES.EXPOSED);
  });

  it('applying the pack "exposed" status does not register the engine combat state', () => {
    const e = makeEntity();
    applyStatus(e, 'exposed', 0, { duration: 2 });
    expect(hasStatus(e, 'exposed')).toBe(true);
    // The engine's combat "exposed" state is a different id and must be absent.
    expect(hasStatus(e, COMBAT_STATES.EXPOSED)).toBe(false);
  });

  it('applying the engine combat state does not register the pack "exposed" status', () => {
    const e = makeEntity();
    applyStatus(e, COMBAT_STATES.EXPOSED, 0, { duration: 2 });
    expect(hasStatus(e, COMBAT_STATES.EXPOSED)).toBe(true);
    expect(hasStatus(e, 'exposed')).toBe(false);
  });
});
