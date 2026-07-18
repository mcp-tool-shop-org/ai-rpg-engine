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
  buildActionList,
  textBar,
  DIALOGUE_LOOKBACK,
  SCREEN_WIDTH,
} from './renderer.js';
import { detectColorEnabled, makePalette, stripAnsi } from './styles.js';

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

// ---------------------------------------------------------------------------
// Stage C behavioral fixes — the render loop must give the player feedback.
// ---------------------------------------------------------------------------

function cev(type: string, payload: Record<string, unknown> = {}, extra: Partial<ResolvedEvent> = {}): ResolvedEvent {
  return { id: `e-${type}`, tick: 1, type, payload, ...extra };
}

// CS-C-002: action.rejected / ability.rejected used to render null — a typo,
// "not enough stamina", "cannot reach X from Y", "on cooldown until tick N",
// or attacking a corpse all redrew an identical screen with zero feedback,
// even though the modules author player-grade `reason` strings.
describe('formatEvent — rejections surface their reason (CS-C-002)', () => {
  it('renders the module-authored reason for each rejection kind', () => {
    const reasons = [
      'not enough stamina',
      'cannot reach back-alley from town-square',
      'target is already defeated',
      'no target specified',
      'nothing to inspect: ghost',
    ];
    for (const reason of reasons) {
      const text = renderEventLog([cev('action.rejected', { reason })]);
      expect(text).toContain("You can't do that");
      expect(text).toContain(reason);
    }
  });

  it('falls back to a generic line when reason is missing (never prints undefined)', () => {
    const text = renderEventLog([cev('action.rejected', {})]);
    expect(text).toContain("You can't do that");
    expect(text).not.toContain('undefined');
  });

  it('renders ability.rejected with the ability name and reason', () => {
    const text = renderEventLog([
      cev('ability.rejected', { abilityId: 'fireball', abilityName: 'Fireball', reason: 'on cooldown until tick 12' }),
    ]);
    expect(text).toContain('Fireball');
    expect(text).toContain('on cooldown until tick 12');
  });

  it('renders ability.check.failed as a visible failure', () => {
    const text = renderEventLog([
      cev('ability.check.failed', { abilityId: 'fireball', abilityName: 'Fireball', aborted: true }),
    ]);
    expect(text).toContain('Fireball');
    expect(text.toLowerCase()).toContain('fail');
  });
});

// CS-C-003: the renderer's own menu items "[7] Look around" and
// "[N] Inspect X" emit world.zone.inspected / world.entity.inspected with
// rich payloads — and then rendered null, a visible no-op.
describe('formatEvent — inspect and look produce output (CS-C-003)', () => {
  it('renders world.zone.inspected with zone name, other entities, and interactables', () => {
    const text = renderEventLog([
      cev('world.zone.inspected', {
        zoneId: 'town-square',
        zoneName: 'Town Square',
        tags: ['safe'],
        entities: [
          { id: 'hero', name: 'Hero', type: 'player', tags: ['player'] },
          { id: 'merchant_bram', name: 'Merchant Bram', type: 'npc', tags: ['npc'] },
          { id: 'wolf', name: 'Wolf', type: 'enemy', tags: ['enemy'] },
        ],
        interactables: ['fountain'],
        exits: ['back-alley'],
        hazards: [],
      }, { actorId: 'hero' }),
    ]);
    expect(text).toContain('Town Square');
    expect(text).toContain('Merchant Bram');
    expect(text).toContain('Wolf');
    expect(text).toContain('fountain');
    // The inspecting actor is not listed among the things they "see"
    expect(text).not.toContain('Hero');
  });

  it('renders zone hazards when present', () => {
    const text = renderEventLog([
      cev('world.zone.inspected', {
        zoneId: 'crypt', zoneName: 'Crypt', tags: [], entities: [],
        interactables: [], exits: [], hazards: ['unstable-floor'],
      }, { actorId: 'hero' }),
    ]);
    expect(text).toContain('Crypt');
    expect(text.toLowerCase()).toContain('hazard');
  });

  it('renders world.entity.inspected with name, HP, and humanized statuses', () => {
    const text = renderEventLog([
      cev('world.entity.inspected', {
        entityId: 'wolf', name: 'Wolf', type: 'enemy', tags: ['enemy'],
        stats: {}, resources: { hp: 8, maxHp: 10 },
        statuses: ['combat:off_balance'],
      }),
    ]);
    expect(text).toContain('Wolf');
    expect(text).toContain('HP: 8/10');
    expect(text).toContain('Off Balance');
    expect(text).not.toContain('combat:off_balance');
  });

  it('renders a defeated inspect target as defeated, not as a raw HP: 0 line', () => {
    const text = renderEventLog([
      cev('world.entity.inspected', {
        entityId: 'warden', name: 'Crypt Warden', type: 'enemy', tags: ['enemy'],
        stats: {}, resources: { hp: 0, maxHp: 12 }, statuses: ['combat:fleeing'],
      }),
    ]);
    expect(text).toContain('Crypt Warden');
    expect(text.toLowerCase()).toContain('defeated');
    expect(text).not.toContain('combat:fleeing');
  });
});

// CS-C-004: renderEventLog sliced the last N events BEFORE filtering, so the
// killing blow "X defeated!" was pushed out of the window by unrenderable
// defeat.fallout/aftermath bookkeeping — the fight climax rendered as an
// empty divider.
describe('renderEventLog — filter first, then window (CS-C-004)', () => {
  it('keeps the defeat line visible when bookkeeping events follow it', () => {
    const bookkeeping = Array.from({ length: 10 }, (_, i) =>
      cev(`defeat.fallout.step${i}`, { detail: i }),
    );
    const text = renderEventLog([
      cev('combat.entity.defeated', { entityId: 'wolf', entityName: 'Wolf' }),
      ...bookkeeping,
    ]);
    expect(text).toContain('Wolf defeated!');
  });

  it('returns "" (not a lone newline) when no event is renderable — no empty divider', () => {
    const bookkeeping = Array.from({ length: 5 }, (_, i) => cev(`world.flag.changed`, { i }));
    expect(renderEventLog(bookkeeping)).toBe('');
  });

  it('still caps output at the limit, counting renderable lines only', () => {
    const hits = Array.from({ length: 12 }, (_, i) =>
      cev('combat.damage.applied', { damage: i, currentHp: 20 - i }),
    );
    const text = renderEventLog(hits, 8);
    const lines = text.split('\n').filter(l => l.trim().length > 0);
    expect(lines).toHaveLength(8);
    // The newest events win the window
    expect(text).toContain('11 damage dealt');
    expect(text).not.toContain('> 0 damage dealt');
  });

  it('renderFullScreen shows the killing blow even through the CLI\'s raw slice(-8) window', () => {
    // The CLI passes world.eventLog.slice(-8) — a RAW window. With ≥8
    // bookkeeping events after the defeat, the defeat event never reaches
    // renderEventLog via the argument. renderFullScreen owns the fix: it
    // renders from world.eventLog itself.
    const world = makeWorld();
    const bookkeeping = Array.from({ length: 9 }, (_, i) =>
      cev(`defeat.fallout.step${i}`, { detail: i }),
    );
    (world as { eventLog: ResolvedEvent[] }).eventLog = [
      cev('combat.entity.defeated', { entityId: 'wolf', entityName: 'Wolf' }),
      ...bookkeeping,
    ];
    const cliStyleWindow = world.eventLog.slice(-8);
    const text = renderFullScreen(world, cliStyleWindow);
    expect(text).toContain('Wolf defeated!');
  });
});

// Item 4: guard, disengage, interception, and the DoT/HoT lifecycle were all
// silent — visible state changes with no text.
describe('formatEvent — combat maneuver events render (CS-C amend)', () => {
  it('renders combat.guard.start', () => {
    const text = renderEventLog([cev('combat.guard.start', { entityId: 'hero', entityName: 'Hero' })]);
    expect(text).toContain('Hero');
    expect(text.toLowerCase()).toContain('guard');
  });

  it('renders combat.guard.absorbed with the damage reduction', () => {
    const text = renderEventLog([
      cev('combat.guard.absorbed', { entityId: 'hero', entityName: 'Hero', originalDamage: 6, reducedDamage: 3 }),
    ]);
    expect(text).toContain('Hero');
    expect(text).toContain('6');
    expect(text).toContain('3');
  });

  it('renders combat.guard.broken', () => {
    const text = renderEventLog([
      cev('combat.guard.broken', { attackerId: 'wolf', attackerName: 'Wolf', targetId: 'hero', targetName: 'Hero' }),
    ]);
    expect(text).toContain('Wolf');
    expect(text).toContain('Hero');
    expect(text.toLowerCase()).toContain('guard');
  });

  it('renders combat.counter.off_balance', () => {
    const text = renderEventLog([
      cev('combat.counter.off_balance', { entityId: 'wolf', entityName: 'Wolf', causedBy: 'hero', causedByName: 'Hero' }),
    ]);
    expect(text).toContain('Wolf');
    expect(text.toLowerCase()).toContain('off balance');
  });

  it('renders combat.companion.intercepted', () => {
    const text = renderEventLog([
      cev('combat.companion.intercepted', {
        interceptorId: 'ally', interceptorName: 'Mira', targetId: 'hero', targetName: 'Hero', damage: 4,
      }),
    ]);
    expect(text).toContain('Mira');
    expect(text).toContain('Hero');
    expect(text.toLowerCase()).toContain('intercept');
  });

  it('renders disengage success and failure distinctly', () => {
    const ok = renderEventLog([cev('combat.disengage.success', { entityId: 'hero', entityName: 'Hero', fromZoneId: 'a', toZoneId: 'b' })]);
    expect(ok).toContain('Hero');
    expect(ok.toLowerCase()).toContain('break');

    const fail = renderEventLog([cev('combat.disengage.fail', { entityId: 'hero', entityName: 'Hero', roll: 90, needed: 40 })]);
    expect(fail).toContain('Hero');
    expect(fail.toLowerCase()).toContain('fail');
  });
});

describe('formatEvent — DoT/HoT lifecycle renders (CS-C amend)', () => {
  it('renders status.periodic.damage as "Burning: -3 HP"', () => {
    const text = renderEventLog([
      cev('status.periodic.damage', { statusId: 'burning', amount: 3, hpBefore: 10, hpAfter: 7 }),
    ]);
    expect(text).toContain('Burning');
    expect(text).toContain('-3 HP');
  });

  it('renders status.periodic.heal as "Regenerating: +2 HP"', () => {
    const text = renderEventLog([
      cev('status.periodic.heal', { statusId: 'regenerating', amount: 2, actual: 2, resource: 'hp' }),
    ]);
    expect(text).toContain('Regenerating');
    expect(text).toContain('+2 HP');
  });

  it('renders non-hp periodic heals with their resource name', () => {
    const text = renderEventLog([
      cev('status.periodic.heal', { statusId: 'second-wind', amount: 2, actual: 2, resource: 'stamina' }),
    ]);
    expect(text).toContain('+2 stamina');
  });

  it('renders status.periodic.expired as "X wore off"', () => {
    const text = renderEventLog([
      cev('status.periodic.expired', { statusId: 'burning', appliedAtTick: 1, durationTicks: 3 }),
    ]);
    expect(text).toContain('Burning');
    expect(text).toContain('wore off');
  });

  it('prefers module-authored description metadata when present', () => {
    const text = renderEventLog([
      cev('status.periodic.damage', { statusId: 'burning', amount: 3, description: 'The flames gnaw deeper.' }),
    ]);
    expect(text).toContain('The flames gnaw deeper.');
  });

  it('humanizes status ids in the applied/removed/expired lines', () => {
    const applied = renderEventLog([cev('status.applied', { statusId: 'combat:guarded', stacks: 1 })]);
    expect(applied).toContain('Guarded');
    expect(applied).not.toContain('combat:guarded');

    const expired = renderEventLog([cev('status.expired', { statusId: 'engagement:isolated', stacks: 1 })]);
    expect(expired).toContain('Isolated');
    expect(expired).not.toContain('engagement:isolated');
  });
});

describe('formatEvent — ability.used renders with flavor text (CS-C amend)', () => {
  it('renders actor, ability name, and targets', () => {
    const text = renderEventLog([
      cev('ability.used', {
        abilityId: 'fireball', abilityName: 'Fireball', actorId: 'hero', actorName: 'Hero',
        targetIds: ['wolf'], targetNames: ['Wolf'],
      }),
    ]);
    expect(text).toContain('Hero');
    expect(text).toContain('Fireball');
    expect(text).toContain('Wolf');
  });

  it('appends ui flavor text when authored', () => {
    const text = renderEventLog([
      cev('ability.used', {
        abilityId: 'fireball', abilityName: 'Fireball', actorId: 'hero', actorName: 'Hero',
        targetIds: [], targetNames: [],
        ui: { text: 'A roaring gout of flame.' },
      }),
    ]);
    expect(text).toContain('A roaring gout of flame.');
  });
});

// MEDIUM: raw state ids leaked into the HUD ("Status: engagement:isolated",
// "! Crypt Warden (HP: 0) [combat:fleeing]" for a corpse).
describe('renderScene — humanized state labels, no corpse statuses (CS-C amend)', () => {
  it('humanizes the player status line', () => {
    const world = makeWorld();
    world.entities['hero'].statuses = [
      { id: 's1', statusId: 'engagement:isolated', appliedAtTick: 0 },
    ];
    const text = renderScene(world);
    expect(text).toContain('Isolated');
    expect(text).not.toContain('engagement:isolated');
  });

  it('humanizes entity status tags in the scene list', () => {
    const world = makeWorld();
    world.entities['wolf'].statuses = [
      { id: 's2', statusId: 'combat:off_balance', appliedAtTick: 0 },
    ];
    const text = renderScene(world);
    expect(text).toContain('Off Balance');
    expect(text).not.toContain('combat:off_balance');
  });

  it('suppresses statuses on defeated entities and marks them defeated', () => {
    const world = makeWorld();
    world.entities['wolf'].resources.hp = 0;
    world.entities['wolf'].statuses = [
      { id: 's3', statusId: 'combat:fleeing', appliedAtTick: 0 },
    ];
    const text = renderScene(world);
    expect(text).toContain('Wolf');
    expect(text).toContain('defeated');
    expect(text).not.toContain('Fleeing');
    expect(text).not.toContain('combat:fleeing');
    expect(text).not.toContain('(HP: 0)');
  });
});

// ---------------------------------------------------------------------------
// Stage D — visual composition. The screen is the product's only "screen":
// labeled section rules, a glanceable HUD, a grouped/aligned menu, and an
// optional color layer that degrades to byte-identical plain text.
// ---------------------------------------------------------------------------

const PLAIN = { color: false } as const;
const COLORED = { color: true } as const;

/** Rule lines are every line made of `─` (plain or labeled). */
function ruleLines(screen: string): string[] {
  return screen.split('\n').filter(l => l.startsWith('─'));
}

describe('Stage D — labeled section rules frame the screen', () => {
  it('renders zone name, Status, and Actions as labeled rules', () => {
    const world = makeWorld();
    const screen = renderFullScreen(world, [], PLAIN);
    expect(screen).toContain('── Town Square ');
    expect(screen).toContain('── Status ');
    expect(screen).toContain('── Actions ');
  });

  it('every rule line is exactly SCREEN_WIDTH characters wide', () => {
    const world = makeWorld();
    const screen = renderFullScreen(world, [], PLAIN);
    const rules = ruleLines(screen);
    expect(rules.length).toBeGreaterThanOrEqual(4); // zone, Status, Actions, closer
    for (const line of rules) {
      expect(line).toHaveLength(SCREEN_WIDTH);
    }
  });

  it('closes the screen with a plain full-width rule directly under the menu', () => {
    const world = makeWorld();
    const screen = renderFullScreen(world, [], PLAIN);
    const lines = screen.split('\n');
    expect(lines[lines.length - 1]).toBe('─'.repeat(SCREEN_WIDTH));
    // Tight: no blank line between the last action and the closing rule.
    expect(lines[lines.length - 2]).toContain('Look around');
  });

  it('skips the Log section entirely when no event is renderable — no lone divider', () => {
    const world = makeWorld();
    const screen = renderFullScreen(world, [], PLAIN);
    expect(screen).not.toContain('── Log ');
  });

  it('shows the Log section when a renderable event exists', () => {
    const world = makeWorld();
    (world as { eventLog: ResolvedEvent[] }).eventLog = [
      { id: 'e1', tick: 1, type: 'combat.contact.hit', payload: {} },
    ];
    const screen = renderFullScreen(world, [], PLAIN);
    expect(screen).toContain('── Log ');
    expect(screen).toContain('> Hit!');
  });

  it('shows a labeled Dialogue section when dialogue is active', () => {
    const world = makeWorld();
    world.modules['dialogue-core'] = { activeDialogue: 'bram-talk' };
    (world as { eventLog: ResolvedEvent[] }).eventLog = [
      {
        id: 'e1', tick: 1, type: 'dialogue.node.entered',
        payload: { speaker: 'Bram', text: 'Well met.', choices: [{ id: 'c1', text: 'And you.', index: 0 }] },
      },
    ];
    const screen = renderFullScreen(world, [], PLAIN);
    expect(screen).toContain('── Dialogue ');
    expect(screen).toContain('Bram: "Well met."');
    expect(screen).toContain('[1] And you.');
  });

  it('never emits double blank lines or two rules back to back', () => {
    const worlds = [makeWorld(), makeWorld()];
    // Second world: stress edge states — defeated enemy, statuses, events.
    worlds[1].entities['wolf'].resources.hp = 0;
    worlds[1].entities['hero'].statuses = [{ id: 's', statusId: 'burning', appliedAtTick: 0 }];
    (worlds[1] as { eventLog: ResolvedEvent[] }).eventLog = [
      { id: 'e1', tick: 1, type: 'combat.entity.defeated', payload: { entityName: 'Wolf' } },
    ];
    for (const world of worlds) {
      const screen = renderFullScreen(world, [], PLAIN);
      expect(screen).not.toContain('\n\n\n');
      const lines = screen.split('\n');
      for (let i = 1; i < lines.length; i++) {
        const both = lines[i - 1].startsWith('─') && lines[i].startsWith('─');
        expect(both).toBe(false);
      }
    }
  });

  it('composes the nowhere edge state cleanly', () => {
    const world = makeWorld();
    (world.locationId as string) = 'does-not-exist';
    const screen = renderFullScreen(world, [], PLAIN);
    expect(screen).toContain('── Scene ');
    expect(screen).toContain('You are nowhere.');
    // Look around stays reachable even from nowhere, and parse agrees.
    expect(screen).toContain('[1] Look around');
    expect(parseActionSelection('1', world)).toEqual({ verb: 'inspect' });
  });

  it('a zone name longer than the rule width still renders without throwing', () => {
    const world = makeWorld();
    world.zones['town-square'].name = 'The Extraordinarily Long-Named Grand Plaza of the Ancient Merchant Republic';
    const screen = renderFullScreen(world, [], PLAIN);
    expect(screen).toContain('Grand Plaza');
  });
});

describe('Stage D — HUD vitals: HP bar and resource readout', () => {
  it('renders HP cur/max with a filled text bar when maxHp is known', () => {
    const world = makeWorld();
    world.entities['hero'].resources = { hp: 18, maxHp: 20, stamina: 10 };
    const text = renderScene(world, PLAIN);
    expect(text).toContain('HP 18/20 [#########-]');
  });

  it('renders a full bar at full HP and an empty bar at 0 HP', () => {
    expect(textBar(20, 20)).toBe('[##########]');
    expect(textBar(0, 20)).toBe('[----------]');
  });

  it('never shows an empty bar while alive, never a full bar while damaged', () => {
    expect(textBar(1, 100)).toBe('[#---------]'); // alive → at least one tick
    expect(textBar(19, 20)).toBe('[#########-]'); // damaged → never reads untouched
  });

  it('appends a plain-text (low) marker at or below 25% — the warning is words, not color', () => {
    const world = makeWorld();
    world.entities['hero'].resources = { hp: 5, maxHp: 20, stamina: 10 };
    expect(renderScene(world, PLAIN)).toContain('(low)');
    world.entities['hero'].resources = { hp: 6, maxHp: 20, stamina: 10 };
    expect(renderScene(world, PLAIN)).not.toContain('(low)');
  });

  it('shows a bare HP value and NO bar when the world does not track maxHp', () => {
    const world = makeWorld(); // hero: hp 20, stamina 10, no maxHp
    const text = renderScene(world, PLAIN);
    const vitals = text.split('\n').find(l => l.startsWith('  HP '));
    expect(vitals).toBeDefined();
    expect(vitals).toBe('  HP 20  Stamina 10');
  });

  it('lists every tracked resource, with cur/max when a max exists', () => {
    const world = makeWorld();
    world.entities['hero'].resources = { hp: 20, maxHp: 20, stamina: 8, maxStamina: 12, mana: 4 };
    const text = renderScene(world, PLAIN);
    expect(text).toContain('Stamina 8/12');
    expect(text).toContain('Mana 4');
    expect(text).not.toContain('MaxStamina'); // max* keys are denominators, not resources
  });

  it('falls back to stats.maxHp (legacy convention) for the bar denominator', () => {
    const world = makeWorld();
    world.entities['hero'].stats = { maxHp: 40 };
    world.entities['hero'].resources = { hp: 10, stamina: 10 };
    expect(renderScene(world, PLAIN)).toContain('HP 10/40');
  });
});

describe('Stage D — scene entity lines', () => {
  it('shows HP for enemies (with max when known) but not for NPCs', () => {
    const world = makeWorld();
    world.entities['wolf'].resources = { hp: 8, maxHp: 10 };
    const text = renderScene(world, PLAIN);
    expect(text).toContain('! Wolf · HP 8/10');
    const bramLine = text.split('\n').find(l => l.includes('Merchant Bram'));
    expect(bramLine).toBe('  ? Merchant Bram');
  });

  it('marks companions with a + icon and shows their HP', () => {
    const world = makeWorld();
    world.entities['mira'] = {
      id: 'mira', blueprintId: 'companion', type: 'npc', name: 'Mira',
      tags: ['npc', 'companion'], stats: {}, resources: { hp: 12, maxHp: 15 },
      statuses: [], zoneId: 'town-square',
    };
    const text = renderScene(world, PLAIN);
    expect(text).toContain('+ Mira · HP 12/15');
  });

  it('appends humanized statuses after the HP readout', () => {
    const world = makeWorld();
    world.entities['wolf'].statuses = [
      { id: 's1', statusId: 'combat:off_balance', appliedAtTick: 0 },
      { id: 's2', statusId: 'burning', appliedAtTick: 0 },
    ];
    const text = renderScene(world, PLAIN);
    expect(text).toContain('! Wolf · HP 8 · Off Balance, Burning');
  });

  it('renders a defeated entity as a single quiet line', () => {
    const world = makeWorld();
    world.entities['wolf'].resources.hp = 0;
    const text = renderScene(world, PLAIN);
    expect(text).toContain('! Wolf · defeated');
    expect(text).not.toContain('Wolf · HP');
  });
});

describe('Stage D — action menu grouping, alignment, and parse sync', () => {
  it('separates travel / interact / items / system groups with blank lines', () => {
    const world = makeWorld();
    const text = renderActions(world, PLAIN);
    expect(text).toContain('Move to Back Alley\n\n  [2] Speak to Merchant Bram');
    expect(text).toContain('Use healing-draught\n\n  [7] Look around');
  });

  it('right-aligns numbers when the menu reaches double digits', () => {
    const world = makeWorld();
    // Widen the menu past 9 entries with extra exits.
    for (let i = 0; i < 6; i++) {
      const id = `road-${i}`;
      world.zones[id] = { id, roomId: 'test', name: `Road ${i}`, tags: [], neighbors: [] };
      world.zones['town-square'].neighbors.push(id);
    }
    const text = renderActions(world, PLAIN);
    expect(text).toContain('[ 1] Move to Back Alley');
    expect(text).toContain('[10]');
    // Single-digit menus stay unpadded.
    expect(renderActions(makeWorld(), PLAIN)).toContain('[1] Move to Back Alley');
  });

  it('parseActionSelection agrees with buildActionList for EVERY index — display and input cannot drift', () => {
    const world = makeWorld();
    world.entities['wolf'].statuses = [{ id: 's', statusId: 'burning', appliedAtTick: 0 }];
    const list = buildActionList(world);
    expect(list.length).toBeGreaterThanOrEqual(7);
    list.forEach((opt, i) => {
      const parsed = parseActionSelection(String(i + 1), world);
      expect(parsed).not.toBeNull();
      expect(parsed!.verb).toBe(opt.verb);
      expect(parsed!.targetIds).toEqual(opt.targetIds);
      expect(parsed!.toolId).toEqual(opt.toolId);
    });
    expect(parseActionSelection(String(list.length + 1), world)).toBeNull();
  });

  it('renders exactly one numbered line per action option', () => {
    const world = makeWorld();
    const list = buildActionList(world);
    const numbered = renderActions(world, PLAIN)
      .split('\n')
      .filter(l => /^ {2}\[\s*\d+\]/.test(l));
    expect(numbered).toHaveLength(list.length);
  });
});

describe('Stage D — color layer detection (NO_COLOR / TTY contract)', () => {
  it('NO_COLOR wins over everything, including FORCE_COLOR and a live TTY', () => {
    expect(detectColorEnabled({ NO_COLOR: '1', FORCE_COLOR: '1' }, { isTTY: true })).toBe(false);
  });

  it('an empty NO_COLOR is ignored per the no-color.org spec', () => {
    expect(detectColorEnabled({ NO_COLOR: '' }, { isTTY: true })).toBe(true);
  });

  it('FORCE_COLOR enables color even when piped; FORCE_COLOR=0 does not force', () => {
    expect(detectColorEnabled({ FORCE_COLOR: '1' }, { isTTY: false })).toBe(true);
    expect(detectColorEnabled({ FORCE_COLOR: '0' }, { isTTY: false })).toBe(false);
  });

  it('disables color for dumb terminals, piped output, and missing streams', () => {
    expect(detectColorEnabled({ TERM: 'dumb' }, { isTTY: true })).toBe(false);
    expect(detectColorEnabled({}, { isTTY: false })).toBe(false);
    expect(detectColorEnabled({}, undefined)).toBe(false);
    expect(detectColorEnabled({}, { isTTY: true })).toBe(true);
  });

  it('disables color under a test runner even with a TTY', () => {
    expect(detectColorEnabled({ VITEST: 'true' }, { isTTY: true })).toBe(false);
  });

  it('a disabled palette is pure identity; an enabled one wraps and empty strings pass through', () => {
    const off = makePalette(false);
    expect(off.red('x')).toBe('x');
    expect(off.bold('x')).toBe('x');
    const on = makePalette(true);
    expect(on.red('x')).toBe('\u001b[31mx\u001b[39m');
    expect(on.bold('x')).toBe('\u001b[1mx\u001b[22m');
    expect(on.red('')).toBe('');
    expect(stripAnsi(on.dim(on.cyan('hi')))).toBe('hi');
  });
});

describe('Stage D — colored output degrades to byte-identical plain text', () => {
  /** A world exercising every visual path at once. */
  function richWorld() {
    const world = makeWorld();
    world.entities['hero'].resources = { hp: 4, maxHp: 20, stamina: 3, maxStamina: 10 };
    world.entities['hero'].statuses = [{ id: 's1', statusId: 'burning', appliedAtTick: 0 }];
    world.entities['wolf'].resources = { hp: 8, maxHp: 10 };
    world.entities['wolf'].statuses = [{ id: 's2', statusId: 'combat:off_balance', appliedAtTick: 0 }];
    world.entities['mira'] = {
      id: 'mira', blueprintId: 'companion', type: 'npc', name: 'Mira',
      tags: ['companion'], stats: {}, resources: { hp: 0 }, statuses: [], zoneId: 'town-square',
    };
    (world as { eventLog: ResolvedEvent[] }).eventLog = [
      { id: 'e1', tick: 1, type: 'combat.damage.applied', payload: { damage: 3, currentHp: 5 } },
      { id: 'e2', tick: 1, type: 'status.periodic.heal', payload: { statusId: 'regenerating', amount: 2, actual: 2, resource: 'hp' } },
      { id: 'e3', tick: 1, type: 'combat.entity.defeated', payload: { entityName: 'Bandit' } },
      { id: 'e4', tick: 1, type: 'action.rejected', payload: { reason: 'not enough stamina' } },
      { id: 'e5', tick: 1, type: 'combat.contact.miss', payload: {} },
    ];
    return world;
  }

  it('stripAnsi(colored screen) === plain screen, byte for byte', () => {
    const colored = renderFullScreen(richWorld(), [], COLORED);
    const plain = renderFullScreen(richWorld(), [], PLAIN);
    expect(colored).toContain('\u001b[');
    expect(stripAnsi(colored)).toBe(plain);
  });

  it('rule lines stay exactly SCREEN_WIDTH visible characters in color mode', () => {
    const colored = renderFullScreen(richWorld(), [], COLORED);
    for (const line of ruleLines(stripAnsi(colored))) {
      expect(line).toHaveLength(SCREEN_WIDTH);
    }
  });

  it('the plain path emits zero escape codes from every render function', () => {
    const world = richWorld();
    world.modules['dialogue-core'] = { activeDialogue: 'talk' };
    (world as { eventLog: ResolvedEvent[] }).eventLog.push({
      id: 'e6', tick: 1, type: 'dialogue.node.entered',
      payload: { speaker: 'Bram', text: 'Hm.', choices: [{ id: 'c', text: 'Yes.', index: 0 }] },
    });
    const outputs = [
      renderScene(world, PLAIN),
      renderEventLog(world.eventLog, 8, PLAIN),
      renderActions(world, PLAIN),
      renderDialogue(world, PLAIN) ?? '',
      renderFullScreen(world, [], PLAIN),
    ];
    for (const out of outputs) {
      expect(out).not.toContain('\u001b');
    }
  });

  it('classifies event lines semantically: damage red, heal green, rejection yellow, defeat bold, miss dim', () => {
    const log = richWorld().eventLog;
    const colored = renderEventLog(log, 8, COLORED);
    const lineFor = (needle: string) =>
      colored.split('\n').find(l => stripAnsi(l).includes(needle)) ?? '';
    expect(lineFor('damage dealt')).toContain('\u001b[31m');
    expect(lineFor('Regenerating')).toContain('\u001b[32m');
    expect(lineFor("can't do that")).toContain('\u001b[33m');
    expect(lineFor('defeated!')).toContain('\u001b[1m');
    expect(lineFor('Miss.')).toContain('\u001b[2m');
  });

  it('event text is identical with and without color — color is never the message', () => {
    const log = richWorld().eventLog;
    expect(stripAnsi(renderEventLog(log, 8, COLORED))).toBe(renderEventLog(log, 8, PLAIN));
  });

  it('renders plain by default under the test runner (auto-detection path)', () => {
    // vitest sets env.VITEST and pipes worker stdout; both independently
    // disable auto-color, keeping every assertion in this file deterministic.
    const screen = renderFullScreen(richWorld(), []);
    expect(screen).not.toContain('\u001b');
  });
});
