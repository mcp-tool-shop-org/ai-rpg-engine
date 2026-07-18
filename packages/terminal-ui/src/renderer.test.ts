// terminal-ui's first test file. This package (the CLI's freeform-text input
// path — packages/cli depends on it) shipped with zero test coverage. Focus
// is parseTextInput (F-1de46432's dead blank-input guard), with baseline
// smoke coverage for the render* functions and parseActionSelection so the
// package has a real regression net going forward.

import { describe, it, expect } from 'vitest';
import { createTestEngine } from '@ai-rpg-engine/core';
import type { EntityState, ResolvedEvent, ZoneState } from '@ai-rpg-engine/core';
import {
  parseTextInput,
  parseActionSelection,
  renderScene,
  renderEventLog,
  renderActions,
  renderDialogue,
  renderFullScreen,
  DIALOGUE_LOOKBACK,
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

// F-4b7e6f01: renderDialogue used to do up to three full
// `[...world.eventLog].reverse().find(...)` passes per render — each one
// copying and reversing the ENTIRE unbounded event log (core never caps or
// trims it), on every single turn via the CLI's render(), whether or not
// dialogue was active. renderEventLog's caller already demonstrated the
// bounded pattern (`eventLog.slice(-8)`); renderDialogue reached past it into
// the full log, so every turn's render cost grew with total session length —
// a silent session-long slowdown. These tests pin the bounded-scan contract.
describe('renderDialogue — bounded event-log scan (F-4b7e6f01)', () => {
  function ev(type: string, tick: number, payload: Record<string, unknown> = {}): ResolvedEvent {
    return { id: `e${tick}-${type}`, tick, type, payload };
  }

  function withEventLog(world: ReturnType<typeof makeWorld>, log: ResolvedEvent[], activeDialogue: string | null) {
    world.modules['dialogue-core'] = { activeDialogue };
    (world as { eventLog: ResolvedEvent[] }).eventLog = log;
    return world;
  }

  it('finds the active dialogue node within the recent window of a huge log', () => {
    const filler = Array.from({ length: 5000 }, (_, i) => ev('combat.contact.hit', i));
    const log = [
      ...filler,
      ev('dialogue.node.entered', 5000, {
        speaker: 'Bram',
        text: 'Well met.',
        choices: [{ id: 'c1', text: 'And you.', index: 0 }],
      }),
    ];
    const world = withEventLog(makeWorld(), log, 'bram-talk');

    const out = renderDialogue(world);
    expect(out).toContain('Bram');
    expect(out).toContain('Well met.');
    expect(out).toContain('[1] And you.');
  });

  it('does not scan past the lookback window — a node buried deeper than DIALOGUE_LOOKBACK is out of reach', () => {
    const buried = ev('dialogue.node.entered', 1, { speaker: 'Ghost', text: 'You cannot hear me.' });
    const filler = Array.from({ length: DIALOGUE_LOOKBACK + 50 }, (_, i) => ev('combat.contact.hit', i + 2));
    const world = withEventLog(makeWorld(), [buried, ...filler], 'ghost-talk');

    // Bounded work means the ancient node is genuinely out of reach: the
    // dialogue box degrades to null instead of paying a full-log scan.
    expect(renderDialogue(world)).toBeNull();
  });

  it('performs bounded work per render regardless of total log length', () => {
    // Worst old case: the no-active-dialogue branch copied + reversed the
    // whole log via [...world.eventLog] on every turn. Count element reads
    // through a Proxy — the read count must be a function of the lookback
    // window, not of the 50k-event session log.
    const filler = Array.from({ length: 50_000 }, (_, i) => ev('combat.contact.hit', i));
    let reads = 0;
    const proxied = new Proxy(filler, {
      get(target, prop, receiver) {
        if (typeof prop === 'string' && /^\d+$/.test(prop)) reads++;
        return Reflect.get(target, prop, receiver);
      },
    });
    const world = withEventLog(makeWorld(), proxied as unknown as ResolvedEvent[], null);

    renderDialogue(world);
    expect(reads).toBeLessThanOrEqual(DIALOGUE_LOOKBACK * 3);
  });

  it('still renders the just-ended dialogue line when it is recent (regression guard)', () => {
    const world = makeWorld();
    world.meta.tick = 6;
    withEventLog(world, [
      ev('dialogue.node.entered', 4, { speaker: 'Bram', text: 'Farewell, friend.' }),
      ev('dialogue.ended', 5),
    ], null);

    expect(renderDialogue(world)).toContain('Farewell, friend.');
  });

  it('does not render a stale ended-dialogue line from earlier ticks', () => {
    const world = makeWorld();
    world.meta.tick = 20;
    withEventLog(world, [
      ev('dialogue.node.entered', 4, { speaker: 'Bram', text: 'Farewell, friend.' }),
      ev('dialogue.ended', 5),
    ], null);

    expect(renderDialogue(world)).toBeNull();
  });
});
