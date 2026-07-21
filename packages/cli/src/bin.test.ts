import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Engine, type EntityState, type RulesetDefinition } from '@ai-rpg-engine/core';
import { createGame as createFantasyGame } from '@ai-rpg-engine/starter-fantasy';
import {
  runGuardedAction,
  replayGame,
  handlePlayerInput,
  saveGameGuarded,
  formatGameHelp,
  readSaveSummary,
  restoreSessionFromSave,
  renderFrame,
  installCreatedPlayer,
} from './bin.js';
import { allPacks } from './packs.js';
import { runNpcTurns } from './turns.js';

// --- Shared fixtures for the interactive-loop tests -------------------------

const testManifest = {
  id: 'test-game',
  title: 'Test Game',
  version: '0.1.0',
  engineVersion: '0.1.0',
  ruleset: 'test',
  modules: [],
  contentPacks: [],
};

/**
 * Bare but playable engine: a player in a zone with one exit, and a real
 * `move` verb — enough for parseActionSelection to map input '1' to
 * `move -> hall` so tests can prove an action actually EXECUTED (the
 * 'test.moved' event) rather than just "something was submitted".
 */
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
    resources: { hp: 10 },
    statuses: [],
    zoneId: 'cell',
  });
  engine.store.state.playerId = 'hero';
  engine.dispatcher.registerVerb('move', (action) => [
    {
      id: '',
      tick: action.issuedAtTick,
      type: 'test.moved',
      actorId: action.actorId,
      payload: { to: action.targetIds?.[0] ?? '' },
    },
  ]);
  return engine;
}

function eventTypes(engine: Engine): string[] {
  return engine.world.eventLog.map((e) => e.type);
}

// CLI-010 — the interactive loop must never crash an unsaved session when a
// buggy custom module throws inside submitAction/submitActionAs. The guarded
// wrapper swallows the throw, prints a bounded structured message, and reports
// failure so the caller can keep prompting.
describe('runGuardedAction (CLI-010)', () => {
  it('returns true and does not log when the action succeeds', () => {
    const log = vi.fn();
    const ok = runGuardedAction(() => [{ type: 'noop' }], log);
    expect(ok).toBe(true);
    expect(log).not.toHaveBeenCalled();
  });

  it('swallows a thrown Error, returns false, and prints a bounded reason', () => {
    const log = vi.fn();
    const ok = runGuardedAction(() => {
      throw new Error('module blew up');
    }, log);
    expect(ok).toBe(false);
    expect(log).toHaveBeenCalledTimes(1);
    const msg = log.mock.calls[0][0] as string;
    expect(msg).toContain('That action could not be completed');
    expect(msg).toContain('module blew up');
  });

  it('includes a structured error code when the thrown value carries one', () => {
    const log = vi.fn();
    const err = Object.assign(new Error('bad status'), { code: 'STATUS_UNKNOWN' });
    runGuardedAction(() => {
      throw err;
    }, log);
    const msg = log.mock.calls[0][0] as string;
    expect(msg).toContain('STATUS_UNKNOWN');
    expect(msg).toContain('bad status');
  });

  it('bounds the message length so a huge error cannot flood the terminal', () => {
    const log = vi.fn();
    runGuardedAction(() => {
      throw new Error('x'.repeat(5000));
    }, log);
    const msg = log.mock.calls[0][0] as string;
    // The whole line stays well under the 5000-char payload.
    expect(msg.length).toBeLessThanOrEqual(300);
  });

  it('collapses multi-line error messages onto a single line', () => {
    const log = vi.fn();
    runGuardedAction(() => {
      throw new Error('line one\nline two\nline three');
    }, log);
    const msg = log.mock.calls[0][0] as string;
    // No interior newlines — a stack-ish multi-line message becomes one line.
    expect(msg.split('\n')).toHaveLength(1);
  });

  it('handles a thrown non-Error value without crashing', () => {
    const log = vi.fn();
    const ok = runGuardedAction(() => {
      throw 'plain string failure';
    }, log);
    expect(ok).toBe(false);
    const msg = log.mock.calls[0][0] as string;
    expect(msg).toContain('plain string failure');
  });
});

// F-7650e39d — the `--replay` re-simulation branch read `data.actionLog ?? []`
// straight from a hand-crafted/corrupted save with no shape validation, then
// did `for (const action of actionLog)`. The `??` only substitutes for
// null/undefined; a corrupted save with actionLog set to any other
// non-iterable JSON value (number/boolean/plain object) raw-throws an
// unstructured TypeError out of the for..of loop, unlike the immediately
// adjacent default-load branch in the same function, which wraps
// WorldStore.deserialize in try/catch and prints a friendly
// `[code] message` + hint on SaveLoadError.
class ProcessExitSignal extends Error {
  constructor(public code: number | undefined) {
    super(`process.exit(${code})`);
  }
}

describe('replayGame --replay (F-7650e39d: actionLog must be validated before iterating)', () => {
  let tmpDir: string;
  let originalCwd: string;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-rpg-replay-test-'));
    fs.mkdirSync(path.join(tmpDir, '.ai-rpg-engine'), { recursive: true });
    originalCwd = process.cwd();
    process.chdir(tmpDir);
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new ProcessExitSignal(code);
    }) as never);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function writeSave(actionLogValue: unknown, includeActionLog = true) {
    const save: Record<string, unknown> = {
      world: { state: { meta: { gameId: 'chapel-threshold', seed: 1 } } },
    };
    if (includeActionLog) save.actionLog = actionLogValue;
    fs.writeFileSync(path.join(tmpDir, '.ai-rpg-engine', 'save.json'), JSON.stringify(save), 'utf-8');
  }

  it('a non-array actionLog (number) is rejected with a structured message, not a raw TypeError', () => {
    writeSave(42);
    expect(() => replayGame(['--replay'])).toThrow(ProcessExitSignal);
    expect(exitSpy).toHaveBeenCalledWith(1);
    const allErrorText = errorSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allErrorText.toLowerCase()).toContain('actionlog');
  });

  it('a non-array actionLog (plain object) is rejected the same way', () => {
    writeSave({ not: 'an array' });
    expect(() => replayGame(['--replay'])).toThrow(ProcessExitSignal);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('a non-array actionLog (boolean) is rejected the same way', () => {
    writeSave(true);
    expect(() => replayGame(['--replay'])).toThrow(ProcessExitSignal);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('a missing actionLog defaults to empty and replays cleanly (pre-existing behavior)', () => {
    writeSave(undefined, false);
    expect(() => replayGame(['--replay'])).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('a valid empty-array actionLog replays cleanly (control)', () => {
    writeSave([]);
    expect(() => replayGame(['--replay'])).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
  });
});

// CS-C-001 (the false-save half) — meta commands must match on the FIRST word,
// not the exact string. Previously 'save game' bypassed the exact-match meta
// check, was parsed by parseTextInput into pseudo-verb 'save', submitted to
// the engine, rejected, and rendered as NOTHING: the player believed they
// saved and they had not. Same trap for 'quit now' / 'help me' / 'SAVE'.
describe('handlePlayerInput — first-word meta command routing (CS-C-001)', () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-rpg-input-test-'));
    originalCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('"save game" actually saves — the file exists on disk and nothing was submitted to the engine', () => {
    const engine = makeEngine();
    const log = vi.fn();

    const result = handlePlayerInput(engine, 'save game', { log });

    expect(result).toEqual({ kind: 'save', ok: true });
    const savePath = path.join(tmpDir, '.ai-rpg-engine', 'save.json');
    expect(fs.existsSync(savePath)).toBe(true);
    // A real save, not an empty touch: it round-trips as the engine's state.
    const data = JSON.parse(fs.readFileSync(savePath, 'utf-8'));
    expect(data.world.state.meta.gameId).toBe('test-game');
    // The input never reached the engine as an action — no declared/rejected
    // pair, which is exactly what the old false-save produced.
    expect(eventTypes(engine)).not.toContain('action.declared');
    expect(eventTypes(engine)).not.toContain('action.rejected');
    // The player is told where the save went (CS-C-009).
    const logged = log.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('Game saved to');
    expect(logged).toContain(path.resolve(path.join('.ai-rpg-engine', 'save.json')));
  });

  it('"quit now" routes to quit instead of being submitted as a bogus verb', () => {
    const engine = makeEngine();
    const result = handlePlayerInput(engine, 'quit now', { log: vi.fn() });
    expect(result).toEqual({ kind: 'quit' });
    expect(engine.world.eventLog).toHaveLength(0);
  });

  it('meta commands are case-insensitive: SAVE saves, Exit quits', () => {
    const engine = makeEngine();
    const log = vi.fn();
    expect(handlePlayerInput(engine, 'SAVE', { log })).toEqual({ kind: 'save', ok: true });
    expect(handlePlayerInput(engine, 'Exit', { log })).toEqual({ kind: 'quit' });
    expect(eventTypes(engine)).not.toContain('action.declared');
  });

  it('"help me" shows help with trailing words present', () => {
    const engine = makeEngine();
    const log = vi.fn();
    const result = handlePlayerInput(engine, 'help me', { log });
    expect(result).toEqual({ kind: 'help' });
    expect(log).toHaveBeenCalled();
    expect(engine.world.eventLog).toHaveLength(0);
  });

  it('a word merely STARTING with a meta verb ("saved") is not hijacked — it goes to the engine as a normal action', () => {
    const engine = makeEngine();
    const result = handlePlayerInput(engine, 'saved', { log: vi.fn() });
    expect(result).toEqual({ kind: 'action', via: 'text' });
    // It reached the engine (and was rejected there as an unknown verb).
    expect(eventTypes(engine)).toContain('action.declared');
  });

  it('empty and whitespace-only input is a no-op', () => {
    const engine = makeEngine();
    expect(handlePlayerInput(engine, '', { log: vi.fn() })).toEqual({ kind: 'empty' });
    expect(handlePlayerInput(engine, '   ', { log: vi.fn() })).toEqual({ kind: 'empty' });
    expect(engine.world.eventLog).toHaveLength(0);
  });
});

// CS-C-008 — saveGame's bare mkdirSync/writeFileSync ran inside the readline
// callback, OUTSIDE main()'s promise chain: an EACCES/EROFS/ENOSPC was an
// uncaught raw stack that killed the process and the unsaved session with it.
// The guarded save must report a structured failure and keep the session
// alive (return false, never throw).
describe('saveGameGuarded (CS-C-008)', () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-rpg-save-test-'));
    originalCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('saves successfully and reports the resolved path', () => {
    const engine = makeEngine();
    const log = vi.fn();

    const ok = saveGameGuarded(engine, log);

    expect(ok).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.ai-rpg-engine', 'save.json'))).toBe(true);
    const logged = log.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('Game saved to');
    expect(logged).toContain(tmpDir);
  });

  it('an unwritable save location returns false with a structured [SAVE_WRITE_FAILED] + hint — and does NOT throw', () => {
    // A regular FILE squatting on the save DIRECTORY path makes both
    // mkdirSync and writeFileSync fail on every platform (ENOTDIR/ENOENT).
    fs.writeFileSync(path.join(tmpDir, '.ai-rpg-engine'), 'not a directory', 'utf-8');
    const engine = makeEngine();
    const log = vi.fn();

    let ok = true;
    expect(() => {
      ok = saveGameGuarded(engine, log);
    }).not.toThrow();

    expect(ok).toBe(false);
    const logged = log.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('[SAVE_WRITE_FAILED]');
    expect(logged).toContain('Hint');
  });

  it('the interactive loop survives a failed save: handlePlayerInput reports ok:false instead of crashing', () => {
    fs.writeFileSync(path.join(tmpDir, '.ai-rpg-engine'), 'not a directory', 'utf-8');
    const engine = makeEngine();
    const log = vi.fn();

    let result: ReturnType<typeof handlePlayerInput> | undefined;
    expect(() => {
      result = handlePlayerInput(engine, 'save', { log });
    }).not.toThrow();

    expect(result).toEqual({ kind: 'save', ok: false });
    // The session is intact — the same engine can still act afterwards.
    const after = handlePlayerInput(engine, '1', { log });
    expect(after).toEqual({ kind: 'action', via: 'menu' });
    expect(eventTypes(engine)).toContain('test.moved');
  });
});

// Dialogue-trap amplifier — while dialogue-core reports an active dialogue,
// every numeric input was hijacked into `choose`; when `choose` is rejected
// (no choices on the node), the rejection rendered as nothing and the
// numbered ACTION menu on screen was dead. The router must fall through to
// normal number/text handling when the hijacked `choose` is rejected
// (defense-in-depth alongside the modules-side dialogue.ended fix).
describe('handlePlayerInput — dialogue choose rejection falls through (CS-C-001 amplifier)', () => {
  it('a rejected choose falls through and the numbered menu action executes', () => {
    const engine = makeEngine(); // no `choose` verb registered -> always rejected
    engine.world.modules['dialogue-core'] = { activeDialogue: 'stuck-dialogue' };

    const result = handlePlayerInput(engine, '1', { log: vi.fn() });

    // The doomed choose was recorded and rejected...
    const rejected = engine.world.eventLog.filter(
      (e) => e.type === 'action.rejected' && (e.payload as { verb?: unknown }).verb === 'choose',
    );
    expect(rejected.length).toBe(1);
    // ...and the input still did what the on-screen menu promised.
    expect(result).toEqual({ kind: 'action', via: 'menu' });
    expect(eventTypes(engine)).toContain('test.moved');
  });

  it('a SUCCESSFUL choose is consumed as the dialogue choice — no fall-through double action', () => {
    const engine = makeEngine();
    engine.dispatcher.registerVerb('choose', (action) => [
      {
        id: '',
        tick: action.issuedAtTick,
        type: 'test.chosen',
        actorId: action.actorId,
        payload: { choiceIndex: action.parameters?.choiceIndex ?? -1 },
      },
    ]);
    engine.world.modules['dialogue-core'] = { activeDialogue: 'live-dialogue' };

    const result = handlePlayerInput(engine, '1', { log: vi.fn() });

    expect(result).toEqual({ kind: 'action', via: 'dialogue-choice' });
    expect(eventTypes(engine)).toContain('test.chosen');
    expect(eventTypes(engine)).not.toContain('test.moved');
  });

  it('a choose that THROWS (buggy module) also falls through instead of leaving the player stuck', () => {
    const engine = makeEngine();
    engine.dispatcher.registerVerb('choose', () => {
      throw new Error('dialogue module blew up');
    });
    engine.world.modules['dialogue-core'] = { activeDialogue: 'broken-dialogue' };

    const result = handlePlayerInput(engine, '1', { log: vi.fn() });

    expect(result).toEqual({ kind: 'action', via: 'menu' });
    expect(eventTypes(engine)).toContain('test.moved');
  });

  it('without an active dialogue, numeric input goes straight to the menu (control)', () => {
    const engine = makeEngine();
    const result = handlePlayerInput(engine, '1', { log: vi.fn() });
    expect(result).toEqual({ kind: 'action', via: 'menu' });
    expect(
      engine.world.eventLog.some(
        (e) => e.type === 'action.rejected' && (e.payload as { verb?: unknown }).verb === 'choose',
      ),
    ).toBe(false);
  });
});

// F1c — resume-from-save. `run` never detected a save and `replay` restored
// then EXITED without playing. Now: readSaveSummary powers the Continue/New
// offer, restoreSessionFromSave is the shared load authority (EventBus reuse +
// ruleset bounds + rebindStore + actionLog restore), and replayGame RETURNS
// the live session so main() can enter the shared prompt loop.
describe('resume-from-save (F1c)', () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-rpg-resume-test-'));
    originalCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  /** A fantasy session with visible progress: moved to the nave, took damage. */
  function makeProgressedGame() {
    const engine = createFantasyGame(42);
    engine.submitAction('move', { targetIds: ['chapel-nave'] });
    engine.store.state.entities['player'].resources.hp = 13;
    return engine;
  }

  it('readSaveSummary: null without a save, null on corrupt JSON, summary on a real save', () => {
    expect(readSaveSummary()).toBeNull();

    fs.mkdirSync('.ai-rpg-engine', { recursive: true });
    fs.writeFileSync(path.join('.ai-rpg-engine', 'save.json'), '{corrupt', 'utf-8');
    expect(readSaveSummary()).toBeNull();

    const engine = makeProgressedGame();
    expect(saveGameGuarded(engine, vi.fn())).toBe(true);
    const summary = readSaveSummary();
    expect(summary).not.toBeNull();
    expect(summary!.gameId).toBe('chapel-threshold');
    expect(summary!.tick).toBe(engine.tick);
  });

  it('restoreSessionFromSave restores state AND the session is live (actions + NPC turns work)', () => {
    const original = makeProgressedGame();
    expect(saveGameGuarded(original, vi.fn())).toBe(true);

    const pack = allPacks.find((p) => p.meta.id === 'chapel-threshold')!;
    const { engine: restored } = restoreSessionFromSave(pack);

    // The saved facts survived the load.
    expect(restored.world.locationId).toBe('chapel-nave');
    expect(restored.world.entities['player'].resources.hp).toBe(13);
    expect(restored.tick).toBe(original.tick);

    // The restored session is PLAYABLE: a real action executes and its events
    // land in the LIVE event log (bus reuse + rebindStore, not an orphan store).
    const logLenBefore = restored.world.eventLog.length;
    const result = handlePlayerInput(restored, '1', { log: vi.fn() });
    expect(result.kind).toBe('action');
    expect(restored.world.eventLog.length).toBeGreaterThan(logLenBefore);

    // And the NPC turn driver runs against it without complaint.
    expect(() => runNpcTurns(restored, { log: vi.fn() })).not.toThrow();
  });

  it('a save taken after resuming keeps the FULL action history (actionLog restored)', () => {
    const original = makeProgressedGame();
    const actionsBefore = original.getActionLog().length;
    expect(actionsBefore).toBeGreaterThan(0);
    saveGameGuarded(original, vi.fn());

    const pack = allPacks.find((p) => p.meta.id === 'chapel-threshold')!;
    const { engine: restored } = restoreSessionFromSave(pack);
    expect(restored.getActionLog().length).toBe(actionsBefore);

    // Act once more, save again — history is prior + new, not a fork.
    handlePlayerInput(restored, '1', { log: vi.fn() });
    saveGameGuarded(restored, vi.fn());
    const reloaded = JSON.parse(
      fs.readFileSync(path.join('.ai-rpg-engine', 'save.json'), 'utf-8'),
    ) as { actionLog: unknown[] };
    expect(reloaded.actionLog.length).toBe(actionsBefore + 1);
  });

  it('replayGame (default load) returns the live session for the prompt loop', () => {
    const original = makeProgressedGame();
    saveGameGuarded(original, vi.fn());
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const session = replayGame([]);
    expect(session).toBeDefined();
    expect(session!.pack.meta.id).toBe('chapel-threshold');
    expect(session!.engine.world.locationId).toBe('chapel-nave');

    // Playable, not a print-and-exit dead end.
    const result = handlePlayerInput(session!.engine, '1', { log: vi.fn() });
    expect(result.kind).toBe('action');
  });

  it('replayGame --replay (re-simulation) also returns a playable session', () => {
    const original = makeProgressedGame();
    saveGameGuarded(original, vi.fn());
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const session = replayGame(['--replay']);
    expect(session).toBeDefined();
    // Re-simulated through the real pack: the logged move re-executed.
    expect(session!.engine.world.locationId).toBe('chapel-nave');
  });
});

// CS-C-005 — in-game help was a hardcoded seven-verb line; pack-defining
// mechanics (vampire's feed/enthrall, universal guard/disengage) and the
// authored ruleset.verbs[].description strings were rendered nowhere. Help is
// now generated from the active pack's ruleset, with meta commands appended.
describe('formatGameHelp (CS-C-005)', () => {
  const packRuleset: RulesetDefinition = {
    id: 'r',
    name: 'R',
    version: '1.0.0',
    stats: [],
    resources: [],
    verbs: [
      { id: 'move', name: 'Move', description: 'Travel to an adjacent zone' },
      { id: 'attack', name: 'Attack', description: 'Strike a target' },
      { id: 'guard', name: 'Guard', description: 'Brace for incoming attacks, reducing damage taken' },
      { id: 'disengage', name: 'Disengage', description: 'Attempt to break from combat and withdraw' },
      { id: 'enthrall', name: 'Enthrall', description: 'Bend a mortal mind to your will' },
      { id: 'feed', name: 'Feed', description: 'Drink blood to sate the hunger' },
      { id: 'bare', name: 'Bare Verb' }, // no description -> falls back to name
    ],
    formulas: [],
    defaultModules: [],
    progressionModels: [],
  };

  it('lists every pack verb with its authored description', () => {
    const help = formatGameHelp(makeEngine(), packRuleset);
    expect(help).toContain('enthrall');
    expect(help).toContain('Bend a mortal mind to your will');
    expect(help).toContain('feed');
    expect(help).toContain('Drink blood to sate the hunger');
    expect(help).toContain('guard');
    expect(help).toContain('disengage');
  });

  it('appends the session meta commands so help remains the one complete list', () => {
    const help = formatGameHelp(makeEngine(), packRuleset);
    expect(help).toContain('save');
    expect(help).toContain('quit');
    expect(help).toContain('help');
    expect(help).toContain('number');
  });

  it('a verb without a description falls back to its display name', () => {
    const help = formatGameHelp(makeEngine(), packRuleset);
    expect(help).toContain('Bare Verb');
  });

  it('without a ruleset it falls back to the engine-registered verbs', () => {
    const engine = makeEngine();
    const help = formatGameHelp(engine);
    expect(help).toContain('move');
    expect(help).toContain('save');
  });

  it('handlePlayerInput "help" prints the pack-aware help', () => {
    const engine = makeEngine();
    const log = vi.fn();
    const result = handlePlayerInput(engine, 'help', { ruleset: packRuleset, log });
    expect(result).toEqual({ kind: 'help' });
    const logged = log.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('enthrall');
    expect(logged).toContain('Drink blood to sate the hunger');
  });
});

// T0-menu-collisions — two live-reproduced collisions: (a) during active
// dialogue the base action menu rendered its own [1]/[2] column under the
// dialogue choices' numbers; (b) the defeat/ending frame offered the corpse
// the full [1]-[7] action menu above the DEFEAT banner. Both frames now
// suppress the menu layers while keeping the scene/HUD/log panels.
describe('renderFrame — menu suppression (T0-menu-collisions)', () => {
  function capture() {
    const lines: string[] = [];
    return { lines, print: (line: string) => lines.push(line) };
  }

  function packFor(engine: Engine) {
    return { meta: { id: 'test-game', name: 'Test Game' }, createGame: () => engine };
  }

  it('a session-end frame ({ menu: false }) keeps scene/HUD/log but offers NO action menu', () => {
    const engine = makeEngine();
    engine.submitAction('move', { targetIds: ['hall'] }); // a renderable-ish log entry
    engine.store.emitEvent('combat.contact.hit', {}, { actorId: 'hero' });
    const { lines, print } = capture();

    renderFrame(engine, packFor(engine), { menu: false, print });

    const frame = lines.join('\n');
    expect(frame).toContain('── Cell ');       // scene panel survives
    expect(frame).toContain('── Status ');     // HUD panel survives
    expect(frame).toContain('── Log ');        // log panel survives
    expect(frame).not.toContain('── Actions ');
    expect(frame).not.toContain('Move to Hall');
    expect(frame).not.toMatch(/\[\s*\d+\]/);   // no numbered entries at all
  });

  it('an active-dialogue frame renders only the dialogue choice numbers — no base menu below', () => {
    const engine = makeEngine();
    engine.world.modules['dialogue-core'] = { activeDialogue: 'bram-talk' };
    engine.store.emitEvent('dialogue.node.entered', {
      speaker: 'Bram',
      text: 'Well met.',
      choices: [{ id: 'c1', text: 'And you.', index: 0 }],
    }, { actorId: 'hero' });
    const { lines, print } = capture();

    renderFrame(engine, packFor(engine), { print });

    const frame = lines.join('\n');
    expect(frame).toContain('── Dialogue ');
    expect(frame).toContain('[1] And you.');
    expect(frame).not.toContain('── Actions ');
    expect(frame).not.toContain('Move to Hall');
    // Exactly ONE numbered column on screen: the dialogue's.
    expect(frame.match(/\[1\]/g)).toHaveLength(1);
  });

  it('a normal frame still renders the numbered menu (control)', () => {
    const engine = makeEngine();
    const { lines, print } = capture();

    renderFrame(engine, packFor(engine), { print });

    const frame = lines.join('\n');
    expect(frame).toContain('── Actions ');
    expect(frame).toContain('[1] Move to Hall');
    expect(frame).toContain('Look around');
  });
});

// F-1049b518 — the created-character replacement was the ONE ingestion point
// still writing a caller-owned object straight into store state
// (`state.entities[playerId] = playerEntity`), bypassing the store's
// detach-at-ingestion contract (structuredClone, F-71ec5dcd). It now routes
// through store.addEntity; the id/zone merge semantics (CLI-001) are unchanged.
describe('installCreatedPlayer (F-1049b518) — detached ingestion', () => {
  function createdEntity(): EntityState {
    return {
      id: 'created',
      blueprintId: 'custom',
      type: 'player',
      name: 'Kael',
      tags: ['player'],
      stats: { might: 3 },
      resources: { hp: 30, maxHp: 30 },
      statuses: [],
    };
  }

  it('re-keys to the pack playerId and preserves the default player zone (CLI-001 semantics)', () => {
    const engine = makeEngine(); // playerId 'hero', default player in 'cell'
    installCreatedPlayer(engine, createdEntity());

    const installed = engine.store.state.entities['hero'];
    expect(installed).toBeDefined();
    expect(installed.name).toBe('Kael');
    expect(installed.id).toBe('hero');
    expect(installed.zoneId).toBe('cell');
    expect(installed.resources.hp).toBe(30);
  });

  it('mutating the caller object after installation never reaches store state', () => {
    const engine = makeEngine();
    const playerEntity = createdEntity();
    installCreatedPlayer(engine, playerEntity);

    playerEntity.resources.hp = 999;
    playerEntity.tags.push('tainted');
    playerEntity.statuses.push({ id: 's', statusId: 'doomed', appliedAtTick: 0 });
    playerEntity.stats.might = -1;

    const installed = engine.store.state.entities['hero'];
    expect(installed.resources.hp).toBe(30);
    expect(installed.tags).not.toContain('tainted');
    expect(installed.statuses).toHaveLength(0);
    expect(installed.stats.might).toBe(3);
  });

  it('store mutations never bleed back into the caller object either', () => {
    const engine = makeEngine();
    const playerEntity = createdEntity();
    installCreatedPlayer(engine, playerEntity);

    engine.store.state.entities['hero'].resources.hp = 1;
    engine.store.state.entities['hero'].tags.push('wounded');

    expect(playerEntity.resources.hp).toBe(30);
    expect(playerEntity.tags).not.toContain('wounded');
  });
});
