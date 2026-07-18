// terminal-ui's first test file. This package (the CLI's freeform-text input
// path — packages/cli depends on it) shipped with zero test coverage. Focus
// is parseTextInput (F-1de46432's dead blank-input guard), with baseline
// smoke coverage for the render* functions and parseActionSelection so the
// package has a real regression net going forward.

import { describe, it, expect } from 'vitest';
import { createTestEngine } from '@ai-rpg-engine/core';
import type { EntityState, ZoneState } from '@ai-rpg-engine/core';
import {
  parseTextInput,
  parseActionSelection,
  renderScene,
  renderEventLog,
  renderActions,
  renderDialogue,
  renderFullScreen,
} from './renderer.js';

function makeWorld() {
  const zones: ZoneState[] = [
    { id: 'town-square', roomId: 'test', name: 'Town Square', tags: ['safe'], neighbors: ['back-alley'], interactables: ['fountain'] },
    { id: 'back-alley', roomId: 'test', name: 'Back Alley', tags: ['dark'], neighbors: ['town-square'] },
  ];
  const player: EntityState = {
    id: 'hero', blueprintId: 'hero', type: 'player', name: 'Hero',
    tags: ['player'], stats: {}, resources: { hp: 20, stamina: 10 },
    statuses: [], inventory: ['healing-draught'], zoneId: 'town-square',
  };
  const merchant: EntityState = {
    id: 'merchant_bram', blueprintId: 'merchant', type: 'npc', name: 'Merchant Bram',
    tags: ['npc'], stats: {}, resources: { hp: 10 }, statuses: [], zoneId: 'town-square',
  };
  const wolf: EntityState = {
    id: 'wolf', blueprintId: 'wolf', type: 'enemy', name: 'Wolf',
    tags: ['enemy'], stats: {}, resources: { hp: 8 }, statuses: [], zoneId: 'town-square',
  };
  const engine = createTestEngine({
    modules: [],
    zones,
    entities: [player, merchant, wolf],
    playerId: 'hero',
    startZone: 'town-square',
  });
  return engine.world;
}

describe('parseTextInput — blank input (F-1de46432)', () => {
  it('returns null for an empty string', () => {
    const world = makeWorld();
    expect(parseTextInput('', world)).toBeNull();
  });

  it('returns null for whitespace-only input', () => {
    const world = makeWorld();
    expect(parseTextInput('   ', world)).toBeNull();
    expect(parseTextInput('\t\n', world)).toBeNull();
  });

  it('does not return a real action object with an empty verb', () => {
    // Pin the specific regression: before the fix, blank input fell through
    // to `return { verb: '' }` instead of `null`, because
    // ''.split(/\s+/) === [''] (length 1, never length 0), so the old
    // `parts.length === 0` guard never fired.
    const world = makeWorld();
    const result = parseTextInput('', world);
    expect(result).not.toEqual({ verb: '' });
  });
});

describe('parseTextInput — special verbs', () => {
  it('resolves "look" and its "l" shorthand to inspect', () => {
    const world = makeWorld();
    expect(parseTextInput('look', world)).toEqual({ verb: 'inspect' });
    expect(parseTextInput('l', world)).toEqual({ verb: 'inspect' });
  });

  it('resolves "save"', () => {
    const world = makeWorld();
    expect(parseTextInput('save', world)).toEqual({ verb: 'save' });
  });

  it('resolves "quit" and "exit"', () => {
    const world = makeWorld();
    expect(parseTextInput('quit', world)).toEqual({ verb: 'quit' });
    expect(parseTextInput('exit', world)).toEqual({ verb: 'quit' });
  });
});

describe('parseTextInput — target resolution', () => {
  it('resolves an exact entity name match, case-insensitively', () => {
    const world = makeWorld();
    expect(parseTextInput('speak Merchant Bram', world)).toEqual({ verb: 'speak', targetIds: ['merchant_bram'] });
  });

  it('resolves an exact entity id match', () => {
    const world = makeWorld();
    expect(parseTextInput('attack wolf', world)).toEqual({ verb: 'attack', targetIds: ['wolf'] });
  });

  it('resolves a prefix match on entity name', () => {
    const world = makeWorld();
    expect(parseTextInput('speak merch', world)).toEqual({ verb: 'speak', targetIds: ['merchant_bram'] });
  });

  it('resolves a substring match on entity name when no prefix matches', () => {
    const world = makeWorld();
    expect(parseTextInput('speak bram', world)).toEqual({ verb: 'speak', targetIds: ['merchant_bram'] });
  });

  it('resolves "use" against inventory, returning toolId not targetIds', () => {
    const world = makeWorld();
    expect(parseTextInput('use healing-draught', world)).toEqual({ verb: 'use', toolId: 'healing-draught' });
  });

  it('resolves "use" via a prefix match on an inventory item', () => {
    const world = makeWorld();
    expect(parseTextInput('use healing', world)).toEqual({ verb: 'use', toolId: 'healing-draught' });
  });

  it('resolves a neighbor zone by name for movement', () => {
    const world = makeWorld();
    expect(parseTextInput('move back alley', world)).toEqual({ verb: 'move', targetIds: ['back-alley'] });
  });

  it('falls back to a bare verb when nothing matches the target text', () => {
    const world = makeWorld();
    expect(parseTextInput('attack nonexistent', world)).toEqual({ verb: 'attack' });
  });

  it('returns a bare verb when there is no target text at all', () => {
    const world = makeWorld();
    expect(parseTextInput('inspect', world)).toEqual({ verb: 'inspect' });
  });
});

describe('parseActionSelection', () => {
  it('maps a valid 1-based index to the corresponding action', () => {
    const world = makeWorld();
    const first = parseActionSelection('1', world);
    expect(first).not.toBeNull();
    expect(first!.verb).toBeTruthy();
  });

  it('returns null for an out-of-range index', () => {
    const world = makeWorld();
    expect(parseActionSelection('999', world)).toBeNull();
  });

  it('returns null for non-numeric input', () => {
    const world = makeWorld();
    expect(parseActionSelection('look', world)).toBeNull();
  });
});

describe('render functions — smoke coverage', () => {
  it('renderScene includes the zone name, entities, and exits', () => {
    const world = makeWorld();
    const text = renderScene(world);
    expect(text).toContain('Town Square');
    expect(text).toContain('Merchant Bram');
    expect(text).toContain('Wolf');
    expect(text).toContain('Back Alley');
  });

  it('renderScene reports "nowhere" when the current zone does not exist', () => {
    const world = makeWorld();
    (world.locationId as string) = 'does-not-exist';
    expect(renderScene(world)).toContain('nowhere');
  });

  it('renderActions lists movement, NPC, and enemy options', () => {
    const world = makeWorld();
    const text = renderActions(world);
    expect(text).toContain('Move to Back Alley');
    expect(text).toContain('Speak to Merchant Bram');
    expect(text).toContain('Attack Wolf');
  });

  it('renderEventLog renders known event types and returns "" for none', () => {
    const world = makeWorld();
    expect(renderEventLog([])).toBe('');
    const text = renderEventLog([
      { id: 'e1', tick: 0, type: 'combat.contact.hit', payload: {} },
    ] as never);
    expect(text).toContain('Hit!');
  });

  it('renderDialogue returns null when there is no active dialogue', () => {
    const world = makeWorld();
    expect(renderDialogue(world)).toBeNull();
  });

  it('renderFullScreen composes scene, actions, and dividers without throwing', () => {
    const world = makeWorld();
    const text = renderFullScreen(world, []);
    expect(text).toContain('Town Square');
    expect(text.length).toBeGreaterThan(0);
  });
});
