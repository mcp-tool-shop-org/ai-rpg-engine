// ENG-006 (second half) — inspect-save goes through the load authorities.
//
// What these tests pin:
//  - a valid save (synthesized through the REAL serialize path) renders the
//    full report byte-for-byte, exit 0
//  - every authority rejection surfaces: malformed JSON, shape violation,
//    newer save version — each as `Cannot load save [CODE]: message` + Hint,
//    exit 1, never a stack — and for the shape/version cases the code+message
//    are asserted VERBATIM against what restoreSessionFromSave (run → Continue's
//    load authority) throws for the same bytes: same gate, same verdict
//  - globals bounding (top GLOBALS_SHOWN by key sort, "+K more" tail,
//    per-value truncation)
//  - the RECENT EVENTS tail is renderEventLog's output (formatEventLine
//    inside, filter-first per CS-C-004 — bookkeeping events consume no slots)
//  - exit codes: 0 valid / 1 for every failure class, including missing file

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Engine, WorldStore, SaveLoadError, type ResolvedEvent } from '@ai-rpg-engine/core';
import { renderEventLog } from '@ai-rpg-engine/terminal-ui';
import {
  runInspectSave,
  renderSaveReport,
  DEFAULT_SAVE_FILE,
  GLOBALS_SHOWN,
  EVENT_TAIL,
  type InspectDeps,
} from './inspect.js';
import { restoreSessionFromSave } from './bin.js';
import { allPacks } from './packs.js';

// --- Fixtures ----------------------------------------------------------------

const testManifest = {
  id: 'test-game',
  title: 'Test Game',
  version: '0.1.0',
  engineVersion: '0.1.0',
  ruleset: 'test',
  modules: [],
  contentPacks: [],
};

/** Small deterministic engine (bin.test's makeEngine shape): a named player
 *  with hp/maxHp in a named zone, so every report line has real content. */
function makeEngine(): Engine {
  const engine = new Engine({ manifest: testManifest, seed: 7 });
  engine.store.state.zones = {
    cell: { id: 'cell', roomId: 'r1', name: 'Cell', tags: [], neighbors: ['hall'] },
    hall: { id: 'hall', roomId: 'r1', name: 'Hall', tags: [], neighbors: ['cell'] },
  };
  engine.store.state.locationId = 'cell';
  engine.store.addEntity({
    id: 'hero',
    blueprintId: 'bp',
    type: 'player',
    name: 'Hero',
    tags: [],
    stats: {},
    resources: { hp: 7, maxHp: 10 },
    statuses: [],
    zoneId: 'cell',
  });
  engine.store.state.playerId = 'hero';
  return engine;
}

function ev(id: string, tick: number, type: string, payload: Record<string, unknown> = {}): ResolvedEvent {
  return { id, tick, type, actorId: 'hero', payload } as ResolvedEvent;
}

/** Capturing sink: joined stdout/stderr for content asserts. */
function makeDeps(): { deps: InspectDeps; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { deps: { log: (m) => out.push(m), error: (m) => err.push(m) }, out, err };
}

/** Round-trip a serialized engine save through the SAME authority call
 *  runInspectSave makes, returning the post-validation state for pure-render
 *  comparisons. */
function stateFromSave(saved: string) {
  const envelope = JSON.parse(saved) as { world: unknown };
  return WorldStore.deserialize(JSON.stringify(envelope.world)).state;
}

// --- Pure render: the pinned report -------------------------------------------

describe('renderSaveReport — valid-save render pinned (real serialize path)', () => {
  it('renders the full report byte-for-byte for a small synthesized save', () => {
    const engine = makeEngine();
    engine.store.state.meta.tick = 3;
    engine.store.state.globals = { gamma: true, alpha: 1, beta: 'two' };
    engine.store.state.eventLog.push(
      ev('ev_1', 1, 'world.zone.entered', { zoneId: 'hall', zoneName: 'Hall' }),
      ev('ev_2', 2, 'combat.contact.hit'),
      ev('ev_3', 3, 'custom.bookkeeping'), // unrenderable — must not surface
    );

    const state = stateFromSave(engine.serialize());
    const report = renderSaveReport(state, { packName: null, actionLog: [], color: false });

    const RULE = '─'.repeat(60);
    expect(report).toBe(
      [
        '',
        `  ${RULE}`,
        '  SAVE SUMMARY',
        `  ${RULE}`,
        '',
        '  Game: test-game (pack not installed)',
        '  Save Version: 1.0.0',
        '  Seed: 7',
        '  Tick: 3',
        '',
        '  Player: Hero — HP 7/10 — Cell — Level 1',
        '',
        `  ${RULE}`,
        '  THE WORLD IN NUMBERS',
        `  ${RULE}`,
        '',
        '  Entities: 1',
        '  Zones: 2',
        '  Events Logged: 3',
        '  Actions Logged: 0',
        '',
        `  ${RULE}`,
        '  GLOBALS (3)',
        `  ${RULE}`,
        '',
        '  alpha: 1',
        '  beta: "two"',
        '  gamma: true',
        '',
        `  ${RULE}`,
        '  RECENT EVENTS',
        `  ${RULE}`,
        '',
        '  > Entered Hall',
        '  > Hit!',
      ].join('\n'),
    );
  });

  it('renders the pack name when installed, and Saved At only when present', () => {
    const state = stateFromSave(makeEngine().serialize());
    const named = renderSaveReport(state, { packName: 'Chapel Threshold', color: false });
    expect(named).toContain('  Game: Chapel Threshold (test-game)');
    expect(named).not.toContain('Saved At:');

    const stamped = renderSaveReport(state, { savedAt: '2026-07-21T12:00:00Z', color: false });
    expect(stamped).toContain('  Saved At: 2026-07-21T12:00:00Z');
    // Numeric stamps render as ISO time.
    const epoch = renderSaveReport(state, { savedAt: 0, color: false });
    expect(epoch).toContain('  Saved At: 1970-01-01T00:00:00.000Z');
  });

  it('a save with no player entity yet says so instead of printing undefined', () => {
    const engine = new Engine({ manifest: testManifest, seed: 7 });
    // Fresh store, playerId '' — the pre-player constructor default that
    // assertSaveStateShape documents as a legitimate save.
    const state = stateFromSave(engine.serialize());
    const report = renderSaveReport(state, { color: false });
    expect(report).toContain('  Player: (none — no player entity in this save)');
    expect(report).not.toContain('undefined');
  });

  it('a present-but-non-array actionLog is called out, not counted as zero', () => {
    const state = stateFromSave(makeEngine().serialize());
    const report = renderSaveReport(state, { actionLog: 42, color: false });
    expect(report).toContain('  Actions Logged: (invalid — actionLog is not an array)');
    // Absent degrades to 0 exactly like restoreSessionFromSave tolerates it.
    expect(renderSaveReport(state, { color: false })).toContain('  Actions Logged: 0');
  });
});

describe('renderSaveReport — globals bounding pinned', () => {
  it(`shows the top ${GLOBALS_SHOWN} by key sort with a "+K more" tail`, () => {
    const engine = makeEngine();
    const globals: Record<string, number> = {};
    // 14 keys, inserted out of order — g01..g14.
    for (const n of [9, 3, 14, 1, 12, 5, 7, 2, 11, 4, 13, 6, 10, 8]) {
      globals[`g${String(n).padStart(2, '0')}`] = n;
    }
    engine.store.state.globals = globals;
    const report = renderSaveReport(stateFromSave(engine.serialize()), { color: false });

    expect(report).toContain('  GLOBALS (14)');
    for (let n = 1; n <= GLOBALS_SHOWN; n++) {
      expect(report).toContain(`  g${String(n).padStart(2, '0')}: ${n}`);
    }
    expect(report).not.toContain('g11:');
    expect(report).not.toContain('g14:');
    expect(report).toContain(`  +${14 - GLOBALS_SHOWN} more`);
  });

  it('bounds a single huge global value with an ellipsis — no unbounded dump', () => {
    const engine = makeEngine();
    engine.store.state.globals = { wall_of_text: 'x'.repeat(500) };
    const report = renderSaveReport(stateFromSave(engine.serialize()), { color: false });
    const line = report.split('\n').find((l) => l.includes('wall_of_text'));
    expect(line).toBeDefined();
    expect(line!.length).toBeLessThan(120);
    expect(line).toContain('…');
  });

  it('renders (none) when the save has no globals', () => {
    const report = renderSaveReport(stateFromSave(makeEngine().serialize()), { color: false });
    expect(report).toContain('  GLOBALS (0)');
    expect(report).toContain('  (none)');
  });
});

describe('renderSaveReport — event tail is the game\'s own log truth', () => {
  it(`renders the last ${EVENT_TAIL} renderable lines via renderEventLog/formatEventLine`, () => {
    const engine = makeEngine();
    const events = [
      ev('e1', 1, 'world.zone.entered', { zoneName: 'Hall' }),
      ev('e2', 2, 'combat.contact.hit'),
      ev('e3', 3, 'combat.contact.miss'),
      ev('e4', 4, 'combat.damage.applied', { damage: 4, currentHp: 6 }),
      ev('e5', 5, 'combat.entity.defeated', { entityName: 'Rat' }),
      ev('e6', 6, 'world.zone.entered', { zoneName: 'Cell' }),
    ];
    engine.store.state.eventLog.push(...events);
    const state = stateFromSave(engine.serialize());
    const report = renderSaveReport(state, { color: false });

    // The tail is EXACTLY what the in-game log panel would render for the
    // same slice — same function, same filter-first discipline.
    const expected = renderEventLog(state.eventLog, EVENT_TAIL, { color: false }).replace(/\n$/, '');
    expect(report.endsWith(expected)).toBe(true);
    // 6 renderable events, tail of 5 — the oldest falls off.
    expect(report).not.toContain('> Entered Hall');
    expect(report).toContain('> Entered Cell');
    expect(report).toContain('> Rat defeated!');
  });

  it('unrenderable bookkeeping events consume no tail slots (CS-C-004)', () => {
    const engine = makeEngine();
    engine.store.state.eventLog.push(
      ev('e1', 1, 'combat.entity.defeated', { entityName: 'Rat' }),
      // Five silent bookkeeping events AFTER the killing blow.
      ev('e2', 2, 'world.flag.changed'),
      ev('e3', 3, 'audio.cue.requested'),
      ev('e4', 4, 'custom.one'),
      ev('e5', 5, 'custom.two'),
      ev('e6', 6, 'custom.three'),
    );
    const report = renderSaveReport(stateFromSave(engine.serialize()), { color: false });
    expect(report).toContain('> Rat defeated!');
  });

  it('says so when nothing in the log is renderable', () => {
    const report = renderSaveReport(stateFromSave(makeEngine().serialize()), { color: false });
    expect(report).toContain('  (no renderable events)');
  });
});

// --- The command: authorities, exit codes, live file handling ------------------

describe('runInspectSave — the load authorities render the verdict', () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-rpg-inspect-test-'));
    fs.mkdirSync(path.join(tmpDir, '.ai-rpg-engine'), { recursive: true });
    originalCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function writeSave(content: string): void {
    fs.writeFileSync(path.join(tmpDir, '.ai-rpg-engine', 'save.json'), content, 'utf-8');
  }

  it('DEFAULT_SAVE_FILE mirrors the bin\'s save location', () => {
    expect(DEFAULT_SAVE_FILE).toBe(path.join('.ai-rpg-engine', 'save.json'));
  });

  it('a valid save through the real serialize path: exit 0 and the full report', () => {
    const pack = allPacks[0];
    const engine = pack.createGame(7);
    writeSave(engine.serialize());

    const { deps, out, err } = makeDeps();
    const code = runInspectSave(undefined, deps);

    expect(code).toBe(0);
    expect(err).toHaveLength(0);
    const report = out.join('\n');
    expect(report).toContain('  SAVE SUMMARY');
    expect(report).toContain(`  Game: ${pack.meta.name} (${pack.meta.id})`);
    expect(report).toContain('  Save Version: 1.0.0');
    expect(report).toContain('  Seed: 7');
    expect(report).toContain('  Player: ');
    expect(report).toContain('  THE WORLD IN NUMBERS');
    expect(report).toContain('  GLOBALS');
    expect(report).toContain('  RECENT EVENTS');
    expect(report).not.toContain('undefined');
  });

  it('inspects an explicit path instead of the default save', () => {
    const other = path.join(tmpDir, 'elsewhere', 'backup.json');
    fs.mkdirSync(path.dirname(other), { recursive: true });
    fs.writeFileSync(other, makeEngine().serialize(), 'utf-8');

    const { deps, out } = makeDeps();
    expect(runInspectSave(other, deps)).toBe(0);
    expect(out.join('\n')).toContain('  Game: test-game (pack not installed)');
  });

  it('missing save file: structured message + hint, exit 1', () => {
    const { deps, err } = makeDeps();
    const code = runInspectSave(undefined, deps);
    expect(code).toBe(1);
    const text = err.join('\n');
    expect(text).toContain('No save file found at');
    expect(text).toContain('Hint:');
  });

  // P8-SEC-002: existsSync passes for a DIRECTORY, then readFileSync threw a
  // raw EISDIR out of the function — an unstructured Node error for a
  // foreseeable input, against the module's own 'never a stack' contract.
  it('a directory at the save path: structured [SAVE_UNREADABLE] + hint, exit 1, no raw throw', () => {
    const dirPath = path.join(tmpDir, 'a-directory');
    fs.mkdirSync(dirPath, { recursive: true });

    const { deps, err } = makeDeps();
    let code: number | undefined;
    expect(() => {
      code = runInspectSave(dirPath, deps);
    }).not.toThrow();
    expect(code).toBe(1);
    const text = err.join('\n');
    expect(text).toContain('Cannot load save [SAVE_UNREADABLE]:');
    expect(text).toContain('Hint:');
    expect(text).toContain('not a directory');
  });

  it('malformed JSON: the authority\'s own SAVE_MALFORMED verdict, verbatim', () => {
    const garbage = 'not json {{{';
    writeSave(garbage);

    // The verdict inspect-save must print is whatever THE authority throws
    // for these bytes — capture it straight from WorldStore.deserialize.
    let authority: SaveLoadError | null = null;
    try {
      WorldStore.deserialize(garbage);
    } catch (e) {
      authority = e as SaveLoadError;
    }
    expect(authority).toBeInstanceOf(SaveLoadError);

    const { deps, err } = makeDeps();
    expect(runInspectSave(undefined, deps)).toBe(1);
    const text = err.join('\n');
    expect(text).toContain(`Cannot load save [${authority!.code}]: ${authority!.message}`);
    expect(text).toContain(`Hint: ${authority!.hint}`);
    expect(text).not.toContain('at '); // no stack frames
  });

  it('shape violation: the SAME structured error run → Continue\'s authority throws', () => {
    const pack = allPacks[0];
    const engine = pack.createGame(7);
    const broken = JSON.parse(engine.serialize()) as {
      world: { state: { playerId: string } };
    };
    broken.world.state.playerId = 'ghost-no-such-entity';
    writeSave(JSON.stringify(broken));

    // run → Continue's load authority rejects this save with a structured
    // SaveLoadError — capture it for the verbatim cross-check.
    let authority: SaveLoadError | null = null;
    try {
      restoreSessionFromSave(pack, broken);
    } catch (e) {
      authority = e as SaveLoadError;
    }
    expect(authority).toBeInstanceOf(SaveLoadError);
    expect(authority!.code).toBe('SAVE_MALFORMED');

    const { deps, err } = makeDeps();
    expect(runInspectSave(undefined, deps)).toBe(1);
    const text = err.join('\n');
    expect(text).toContain(`Cannot load save [${authority!.code}]: ${authority!.message}`);
    expect(text).toContain(`Hint: ${authority!.hint}`);
  });

  it('newer save version: SAVE_VERSION_UNSUPPORTED, same verdict as the restore path', () => {
    const pack = allPacks[0];
    const engine = pack.createGame(7);
    const newer = JSON.parse(engine.serialize()) as {
      world: { state: { meta: { saveVersion: string } } };
    };
    newer.world.state.meta.saveVersion = '99.0.0';
    writeSave(JSON.stringify(newer));

    let authority: SaveLoadError | null = null;
    try {
      restoreSessionFromSave(pack, newer);
    } catch (e) {
      authority = e as SaveLoadError;
    }
    expect(authority).toBeInstanceOf(SaveLoadError);
    expect(authority!.code).toBe('SAVE_VERSION_UNSUPPORTED');

    const { deps, err } = makeDeps();
    expect(runInspectSave(undefined, deps)).toBe(1);
    const text = err.join('\n');
    expect(text).toContain(`Cannot load save [SAVE_VERSION_UNSUPPORTED]: ${authority!.message}`);
    expect(text).toContain(`Hint: ${authority!.hint}`);
  });

  it('an envelope with no world payload fails through the authority, exit 1', () => {
    writeSave(JSON.stringify({ notWorld: true }));
    const { deps, err } = makeDeps();
    expect(runInspectSave(undefined, deps)).toBe(1);
    expect(err.join('\n')).toContain('Cannot load save [SAVE_MALFORMED]');
  });

  it('a literal-null save file fails structured, never a raw TypeError', () => {
    writeSave('null');
    const { deps, err } = makeDeps();
    expect(runInspectSave(undefined, deps)).toBe(1);
    expect(err.join('\n')).toContain('Cannot load save [SAVE_MALFORMED]');
  });

  it('savedAt riding the envelope surfaces in the header', () => {
    const envelope = JSON.parse(makeEngine().serialize()) as Record<string, unknown>;
    envelope.savedAt = '2026-07-21T09:30:00Z';
    writeSave(JSON.stringify(envelope));
    const { deps, out } = makeDeps();
    expect(runInspectSave(undefined, deps)).toBe(0);
    expect(out.join('\n')).toContain('  Saved At: 2026-07-21T09:30:00Z');
  });

  it('module namespaces surface when present: pressures, encounters, loadout', () => {
    const engine = makeEngine();
    // P8-SP-002: pressures live in world-tick's namespace (the real writer's
    // slice shape) — the old planted 'pressure-system' namespace had no
    // production writer, so this line under-reported every live save.
    engine.store.state.modules['world-tick'] = {
      pressures: [{ id: 'p1' }, { id: 'p2' }],
      lastHeat: 0,
      quietRounds: 0,
      lastEventIndex: 0,
      milestones: [],
    };
    engine.store.state.modules['encounter-spawn'] = {
      cursor: 0,
      liveByZone: { hall: { encounterId: 'enc1', entityIds: ['rat_1'] } },
    };
    engine.store.state.modules['equipment-core'] = {
      loadouts: {
        hero: { equipped: { weapon: 'iron_sword', armor: null }, inventory: ['torch', 'rope'] },
      },
    };
    writeSave(engine.serialize());

    const { deps, out } = makeDeps();
    expect(runInspectSave(undefined, deps)).toBe(0);
    const report = out.join('\n');
    expect(report).toContain('  Active Pressures: 2');
    expect(report).toContain('  Live Encounters: 1');
    expect(report).toContain('  Loadout: weapon: iron_sword (+2 carried)');
  });

  it('a wired pressure system with nothing brewing renders 0 — absent-vs-zero (hasWorldTickState)', () => {
    const engine = makeEngine();
    engine.store.state.modules['world-tick'] = {
      pressures: [],
      lastHeat: 0,
      quietRounds: 0,
      lastEventIndex: 0,
      milestones: [],
    };
    writeSave(engine.serialize());
    const { deps, out } = makeDeps();
    expect(runInspectSave(undefined, deps)).toBe(0);
    expect(out.join('\n')).toContain('  Active Pressures: 0');
  });

  it('module lines stay silent when the namespaces never wired', () => {
    writeSave(makeEngine().serialize());
    const { deps, out } = makeDeps();
    expect(runInspectSave(undefined, deps)).toBe(0);
    const report = out.join('\n');
    expect(report).not.toContain('Active Pressures:');
    expect(report).not.toContain('Live Encounters:');
    expect(report).not.toContain('Loadout:');
  });

  it('inspecting never mutates the save file (read-only authorities)', () => {
    const saved = makeEngine().serialize();
    writeSave(saved);
    const { deps } = makeDeps();
    expect(runInspectSave(undefined, deps)).toBe(0);
    expect(fs.readFileSync(path.join(tmpDir, '.ai-rpg-engine', 'save.json'), 'utf-8')).toBe(saved);
  });
});
