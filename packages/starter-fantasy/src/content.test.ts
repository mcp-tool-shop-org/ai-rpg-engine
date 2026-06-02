// Fantasy content determinism tests
//
// DETERMINISM: the healing-draught item-use effect previously minted its
// resource.changed event id from the deprecated process-global nextId(), which
// breaks the "same seed + same actions => byte-identical event ids" guarantee
// (two engines share the global counter; a reloaded game restarts it and
// collides with existing ids). The effect now leaves the id falsy so the
// per-instance WorldStore.recordEvent choke point assigns a deterministic id
// from state.meta.idCounter. This test proves the resulting id is non-empty
// and identical across two same-seed engines, and pins it against regression.

import { describe, it, expect } from 'vitest';
import { createGame } from './setup.js';

function useHealingDraught() {
  const engine = createGame(42);
  // Put the player below max HP so the heal produces an observable delta, and
  // give them the consumable to use.
  const player = engine.store.state.entities['player'];
  player.resources.hp = 5;
  player.inventory = ['healing-draught'];

  const events = engine.submitAction('use', { toolId: 'healing-draught' });
  return events.find((e) => e.type === 'resource.changed');
}

describe('fantasy content — healing-draught event id determinism', () => {
  it('emits a resource.changed event with a non-empty id', () => {
    const evt = useHealingDraught();
    expect(evt).toBeDefined();
    expect(evt!.id).toBeTruthy();
    expect(evt!.id.length).toBeGreaterThan(0);
  });

  it('produces byte-identical event ids across two same-seed engines', () => {
    const a = useHealingDraught();
    const b = useHealingDraught();
    expect(a!.id).toBe(b!.id);
  });

  it('does not reference the deprecated global counter format collision', () => {
    // The id must be drawn from the per-instance counter via recordEvent's
    // genId; it should be a prefixed counter token, not an empty string.
    const evt = useHealingDraught();
    expect(evt!.id).toMatch(/^evt_/);
  });
});
