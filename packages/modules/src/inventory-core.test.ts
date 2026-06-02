import { describe, it, expect } from 'vitest';
import { createTestEngine } from '@ai-rpg-engine/core';
import type { EntityState } from '@ai-rpg-engine/core';
import { giveItem } from './inventory-core.js';

const makePlayer = (zoneId: string): EntityState => ({
  id: 'player',
  blueprintId: 'player',
  type: 'player',
  name: 'Hero',
  tags: ['player'],
  stats: { vigor: 5, instinct: 5 },
  resources: { hp: 20, stamina: 5 },
  statuses: [],
  zoneId,
});

describe('giveItem determinism (nextId → recordEvent)', () => {
  it('returns an event with an empty id (recordEvent assigns the deterministic id)', () => {
    const player = makePlayer('a');
    const ev = giveItem(player, 'potion', 1);
    expect(ev.id).toBe('');
    expect(player.inventory).toContain('potion');
  });

  it('mints byte-identical ids across two same-seed instances via recordEvent', () => {
    const mk = () => {
      const engine = createTestEngine({
        modules: [],
        entities: [makePlayer('a')],
        zones: [{ id: 'a', roomId: 'r', name: 'A', tags: [], neighbors: [] }],
      });
      const player = engine.store.state.entities['player'];
      const ev = giveItem(player, 'potion', engine.store.tick);
      engine.store.recordEvent(ev);
      return ev.id;
    };
    const idA = mk();
    const idB = mk();
    expect(idA).not.toBe('');
    expect(idA).toBe(idB); // no shared global counter; per-instance + serialized
  });
});
