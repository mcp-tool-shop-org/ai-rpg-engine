import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Engine, SaveLoadError, type EngineModule, type EntityState, type RulesetDefinition } from '@ai-rpg-engine/core';
import { createGame as createFantasyGame } from '@ai-rpg-engine/starter-fantasy';
import { createDialogueCore } from '@ai-rpg-engine/modules';
import type { DialogueDefinition } from '@ai-rpg-engine/content-schema';
import { buildActionList } from '@ai-rpg-engine/terminal-ui';
import { ABILITY_CATALOG_FORMULA } from '@ai-rpg-engine/modules';
import {
  runGuardedAction,
  replayGame,
  handlePlayerInput,
  saveGameGuarded,
  formatGameHelp,
  readSaveSummary,
  restoreSessionFromSave,
  runHostileRound,
  renderFrame,
  computeExtras,
  installCreatedPlayer,
  parseRunArgs,
  formatSeedLine,
  mintSeed,
  createNewSession,
} from './bin.js';
import { allPacks } from './packs.js';
import type { LoadedPack } from './external-pack.js';
import { runNpcTurns } from './turns.js';
import { buildExtraActions } from './menu.js';

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

// P8-WL-001/P8-PS-004 — `--replay` re-simulation is RETIRED (v2.7): the resim
// loop replayed only the actionLog through pack.createGame(seed), which was
// structurally divergent — character creation is not an action (the resim
// played the pack DEFAULT, not the created character the save holds), and
// world-tick/encounter-spawn mutate state outside the action log — all while
// printing 'Replay complete' with no warning. `--replay` now restores through
// the SAME authority as run → Continue and prints one structured notice.
// Resim PARITY is documented v2.8 work (see replayGame's doc block).
class ProcessExitSignal extends Error {
  constructor(public code: number | undefined) {
    super(`process.exit(${code})`);
  }
}

describe('replayGame --replay (P8-WL-001/P8-PS-004: restore-then-continue, never a divergent resim)', () => {
  let tmpDir: string;
  let originalCwd: string;
  let exitSpy: MockInstance<typeof process.exit>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-rpg-replay-test-'));
    originalCwd = process.cwd();
    process.chdir(tmpDir);
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new ProcessExitSignal(code);
    }) as never);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function loggedText(): string {
    return logSpy.mock.calls.map((c) => String(c[0])).join('\n');
  }

  /** A save whose truth resim could never reconstruct: the hp mutation and the
   *  renamed player are OUTSIDE the action log — exactly the created-character
   *  and world-state divergence the audit live-proved. */
  function writeDivergentSave(): void {
    const engine = createFantasyGame(42);
    engine.store.state.entities['player'].name = 'Auditor';
    engine.submitAction('move', { targetIds: ['chapel-nave'] });
    engine.store.state.entities['player'].resources.hp = 13;
    expect(saveGameGuarded(engine, vi.fn())).toBe(true);
  }

  it('--replay restores the SAVED world (created character + off-log state), never the pack default', () => {
    writeDivergentSave();
    const session = replayGame(['--replay']);
    expect(session).toBeDefined();
    // The save's truth, byte-restored: the retired resim branch reconstructed
    // the pack's authored default player here (different name, full hp).
    expect(session!.engine.world.entities['player'].name).toBe('Auditor');
    expect(session!.engine.world.entities['player'].resources.hp).toBe(13);
    expect(session!.engine.world.locationId).toBe('chapel-nave');
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('--replay prints the structured notice (code + hint, non-fatal) and no resim lines', () => {
    writeDivergentSave();
    replayGame(['--replay']);
    const text = loggedText();
    expect(text).toContain('[REPLAY_RESIM_UNSUPPORTED]');
    expect(text).toContain('re-simulation is not supported with world-state modules');
    expect(text).toContain('restoring the save instead (same as Continue)');
    expect(text).toContain('Hint:');
    expect(text).not.toContain('Re-simulating');
    expect(text).not.toContain('Replay complete');
  });

  it('replay WITHOUT the flag stays exactly as before: same restore, no notice', () => {
    writeDivergentSave();
    const session = replayGame([]);
    expect(session!.engine.world.entities['player'].name).toBe('Auditor');
    expect(loggedText()).not.toContain('[REPLAY_RESIM_UNSUPPORTED]');
  });

  it('a corrupt (non-array) actionLog no longer crashes --replay: the restore authority tolerates it', () => {
    // The old resim branch iterated the log, so it needed its own shape
    // rejection (F-7650e39d). Restore ignores non-array logs by documented
    // design — the session starts with a clean post-resume history.
    writeDivergentSave();
    const savePath = path.join(tmpDir, '.ai-rpg-engine', 'save.json');
    const data = JSON.parse(fs.readFileSync(savePath, 'utf-8'));
    data.actionLog = 42;
    fs.writeFileSync(savePath, JSON.stringify(data), 'utf-8');

    const session = replayGame(['--replay']);
    expect(session).toBeDefined();
    expect(session!.engine.getActionLog()).toEqual([]);
    expect(session!.engine.world.entities['player'].resources.hp).toBe(13);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('--replay on a MALFORMED world still fails through the shared authority frame, exit 1', () => {
    fs.mkdirSync(path.join(tmpDir, '.ai-rpg-engine'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, '.ai-rpg-engine', 'save.json'),
      JSON.stringify({ world: { state: { meta: { gameId: 'chapel-threshold', seed: 1 } } } }),
      'utf-8',
    );
    expect(() => replayGame(['--replay'])).toThrow(ProcessExitSignal);
    expect(exitSpy).toHaveBeenCalledWith(1);
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

// Dialogue-trap amplifier — REAL dialogue-core module (CS-C-001, real-engine proof)
//
// The amplifier tests ABOVE use a synthetic engine with NO `choose` verb, so the
// DISPATCHER rejects `choose` as an unknown verb — and the dispatcher stamps
// `verb` into its rejection payload. Against the REAL dialogue-core module the
// rejection comes from chooseHandler, whose payload (before the fix) carried
// only `{ reason }` — no verb. bin.ts's `chooseRejected` guard keys on
// `payload.verb === 'choose'`, so a real rejected choose was invisible to it:
// the router returned `{ via: 'dialogue-choice' }` as if a mistyped dialogue
// number were a valid selection, and the fall-through never engaged in real
// gameplay against a real dialogue. These tests wire the REAL module in and
// lock the fall-through against it.
describe('handlePlayerInput — dialogue choose rejection falls through (CS-C-001, REAL dialogue-core module)', () => {
  const trap: DialogueDefinition = {
    id: 'trap',
    speakers: ['npc'],
    entryNodeId: 'entry',
    nodes: {
      entry: {
        id: 'entry',
        speaker: 'npc',
        text: 'Well?',
        choices: [{ id: 'only', text: 'The only option.', nextNodeId: 'nowhere' }],
      },
    },
  };

  // Same bare-but-playable engine as makeEngine() ('1' -> move -> 'test.moved'),
  // but with the REAL dialogue-core module wired, so `choose` runs the real
  // chooseHandler rather than the dispatcher's unknown-verb path.
  function makeRealDialogueEngine(): Engine {
    const engine = new Engine({ manifest: testManifest, seed: 7, modules: [createDialogueCore([trap])] });
    engine.store.state.zones = {
      cell: { id: 'cell', roomId: 'r1', name: 'Cell', tags: [], neighbors: ['hall'] },
      hall: { id: 'hall', roomId: 'r1', name: 'Hall', tags: [], neighbors: ['cell'] },
    };
    engine.store.state.locationId = 'cell';
    engine.store.addEntity({
      id: 'hero', blueprintId: 'bp', type: 'player', name: 'Hero',
      tags: [], stats: {}, resources: { hp: 10 }, statuses: [], zoneId: 'cell',
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

  it('a real chooseHandler rejection (no active node) falls through to the numbered menu', () => {
    const engine = makeRealDialogueEngine();
    // Active flag set but no active node -> the real chooseHandler rejects with
    // "no active dialogue" (the finding's exact reproduction state).
    engine.world.modules['dialogue-core'] = { activeDialogue: 'trap', activeNodeId: null, speakerId: null };

    const result = handlePlayerInput(engine, '1', { log: vi.fn() });

    // The rejection came from the REAL module AND now names the verb...
    const rejected = engine.world.eventLog.filter(
      (e) => e.type === 'action.rejected' && (e.payload as { verb?: unknown }).verb === 'choose',
    );
    expect(rejected).toHaveLength(1);
    // ...so the router fell through instead of faking a dialogue selection.
    expect(result).toEqual({ kind: 'action', via: 'menu' });
    expect(eventTypes(engine)).toContain('test.moved');
  });

  it('an out-of-range choiceIndex on a node that HAS choices also falls through (not a fake dialogue-choice)', () => {
    const engine = makeRealDialogueEngine();
    // Active on the entry node (one visible choice). '99' -> choiceIndex 98 ->
    // out of range -> real "invalid choice" rejection.
    engine.world.modules['dialogue-core'] = { activeDialogue: 'trap', activeNodeId: 'entry', speakerId: 'npc' };

    const result = handlePlayerInput(engine, '99', { log: vi.fn() });

    // A real, verb-named choose rejection was recorded...
    const rejected = engine.world.eventLog.filter(
      (e) => e.type === 'action.rejected' && (e.payload as { verb?: unknown }).verb === 'choose',
    );
    expect(rejected).toHaveLength(1);
    // ...the input was NOT swallowed as a dialogue selection...
    expect(result).not.toEqual({ kind: 'action', via: 'dialogue-choice' });
    expect(eventTypes(engine)).not.toContain('dialogue.choice.selected');
    // ...and '99' is beyond the menu range, so it consumes no turn.
    expect(result).toEqual({ kind: 'unknown' });
  });

  it('a VALID choice on the real module is still consumed as the dialogue selection (the fix does not over-reach)', () => {
    const engine = makeRealDialogueEngine();
    engine.world.modules['dialogue-core'] = { activeDialogue: 'trap', activeNodeId: 'entry', speakerId: 'npc' };

    // '1' -> choiceIndex 0 -> the one visible choice -> real chooseHandler SUCCEEDS.
    const result = handlePlayerInput(engine, '1', { log: vi.fn() });

    expect(result).toEqual({ kind: 'action', via: 'dialogue-choice' });
    expect(eventTypes(engine)).toContain('dialogue.choice.selected');
    expect(eventTypes(engine)).not.toContain('test.moved');
  });
});

// F-7ea8fdaf — runSession built its extras unconditionally every turn
// (bin.ts, `buildExtraActions(engine, pack.progressionTrees ?? [])`), unlike
// renderFrame's own extras (`menu && !dState?.activeDialogue ? ... : []`).
// So a number typed during dialogue that missed the current node's choice
// range (dialogue rejects `choose`, chooseRejected=true — the CS-C-001
// fall-through exercised above) could reach an ability/unlock entry that was
// NEVER shown on screen: handlePlayerInput would submit it as a real action
// via runGuardedAction — silently casting an ability or spending XP on a
// progression unlock. The existing dialogue-trap tests above never exercised
// this because they call handlePlayerInput without an extras option. Fixed
// by threading both renderFrame and runSession through one shared gate:
// computeExtras.
describe('computeExtras — the shared dialogue gate (F-7ea8fdaf)', () => {
  function packFor(engine: Engine): LoadedPack {
    return { meta: { id: 'test-game', name: 'Test Game' }, createGame: () => engine };
  }

  /**
   * makeEngine() (the CS-C-001 fixture above — no `choose` verb registered,
   * so a rejected choose is detected the same PROVEN way: the dispatcher's
   * own "unknown verb" rejection, which DOES stamp verb:'choose', unlike
   * dialogue-core's own internal rejections which stamp only `reason`) PLUS
   * one real, always-ready self-targeted ability registered via the
   * ability-core formula contract (getAbilityCatalog reads
   * ABILITY_CATALOG_FORMULA) and a matching verb handler — so
   * buildExtraActions returns a real 'ability' group entry, and a submission
   * that reaches it is independently observable as an 'ability.used' event.
   */
  function makeAbilityReadyEngine(): Engine {
    const engine = makeEngine();
    engine.formulas.register(ABILITY_CATALOG_FORMULA, () => [
      {
        id: 'test-buff',
        name: 'Test Buff',
        verb: 'use-ability',
        tags: [],
        target: { type: 'self' },
        effects: [],
      },
    ]);
    engine.dispatcher.registerVerb('use-ability', (action) => [
      {
        id: '',
        tick: action.issuedAtTick,
        type: 'ability.used',
        actorId: action.actorId,
        payload: { abilityId: (action.parameters as { abilityId?: unknown } | undefined)?.abilityId },
      },
    ]);
    return engine;
  }

  it('returns [] while dialogue is active, even though a real ability is ready (control: non-empty outside dialogue)', () => {
    const engine = makeAbilityReadyEngine();
    const pack = packFor(engine);

    // Control: outside dialogue, the ability really is offered.
    const outside = computeExtras(engine, pack);
    expect(outside.some((a) => a.label === 'Test Buff')).toBe(true);

    engine.world.modules['dialogue-core'] = { activeDialogue: 'stuck-dialogue' };
    expect(computeExtras(engine, pack)).toEqual([]);
  });

  it('a number that misses the dialogue choice range never falls through to a READY ability — no ability fires, no turn is spent (RED-PROOF: fails pre-fix)', () => {
    const engine = makeAbilityReadyEngine();
    const pack = packFor(engine);

    // Confirm the trap is loaded: rawExtras is exactly what the OLD
    // unconditional buildExtraActions(...) call in runSession used to
    // compute (dialogue or not) — this exact number resolves to the ability.
    const baseCount = buildActionList(engine.world).length;
    const rawExtras = buildExtraActions(engine, pack.progressionTrees ?? []);
    const abilityOffset = rawExtras.findIndex((a) => a.label === 'Test Buff');
    expect(abilityOffset).toBeGreaterThanOrEqual(0);
    const trapNumber = String(baseCount + abilityOffset + 1);

    engine.world.modules['dialogue-core'] = { activeDialogue: 'stuck-dialogue' };
    // The FIXED gate — mirrors exactly what runSession now computes and
    // hands to handlePlayerInput.
    const extras = computeExtras(engine, pack);
    expect(extras).toEqual([]);
    const result = handlePlayerInput(engine, trapNumber, { log: vi.fn(), extras });

    // The doomed `choose` was rejected (the dialogue trap engaged — same
    // detection mechanism the CS-C-001 tests above already pin)...
    expect(
      engine.world.eventLog.some(
        (e) => e.type === 'action.rejected' && (e.payload as { verb?: unknown }).verb === 'choose',
      ),
    ).toBe(true);
    // ...and nothing that looks like an ability cast occurred — the value
    // never rendered on screen was never reachable as a selection.
    expect(engine.world.eventLog.some((e) => e.type === 'ability.used')).toBe(false);
    expect(result).toEqual({ kind: 'unknown' });
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

  it('replayGame --replay also returns a playable session (restore path — resim retired, P8-WL-001)', () => {
    const original = makeProgressedGame();
    saveGameGuarded(original, vi.fn());
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const session = replayGame(['--replay']);
    expect(session).toBeDefined();
    // Restored, not re-simulated: the OFF-LOG hp mutation survives too.
    expect(session!.engine.world.locationId).toBe('chapel-nave');
    expect(session!.engine.world.entities['player'].resources.hp).toBe(13);
  });

  // F-SEED: the restore path round-trips meta.seed — a resumed session keeps
  // the SAVED world's roll stream, never a fresh or default one.
  it('a resumed session keeps the saved meta.seed (42) — the roll stream survives save/load', () => {
    const original = makeProgressedGame(); // createFantasyGame(42)
    expect(original.world.meta.seed).toBe(42);
    saveGameGuarded(original, vi.fn());

    const pack = allPacks.find((p) => p.meta.id === 'chapel-threshold')!;
    const { engine: restored } = restoreSessionFromSave(pack);
    expect(restored.world.meta.seed).toBe(42);
  });

  it('a NON-default saved seed (777) round-trips too — not the createGame fallback leaking through', () => {
    const original = createFantasyGame(777);
    original.submitAction('move', { targetIds: ['chapel-nave'] });
    saveGameGuarded(original, vi.fn());

    const pack = allPacks.find((p) => p.meta.id === 'chapel-threshold')!;
    const { engine: restored } = restoreSessionFromSave(pack);
    expect(restored.world.meta.seed).toBe(777);

    // And replayGame under --replay (the restore path since P8-WL-001) keeps
    // the SAVED seed as well.
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const session = replayGame(['--replay']);
    expect(session!.engine.world.meta.seed).toBe(777);
  });
});

// F-SEED-combat-rolls-seed-blind — CLI seed plumbing. Every fresh run used to
// be byte-identical because createNewSession called pack.createGame() with no
// seed (WorldStore defaulted meta.seed to 0) and the roll layer was seed-free.
// Pinned here: --seed parsing/validation, the printed seed line, minting, the
// pass-through into pack.createGame, and fresh-run parity under a fixed seed.
describe('run seeds (F-SEED-combat-rolls-seed-blind)', () => {
  describe('parseRunArgs', () => {
    it('no args → no path, no seed (bundled interactive flow unchanged)', () => {
      expect(parseRunArgs([])).toEqual({ ok: true, path: null, seed: null });
    });

    it('a bare path still parses as the pack path (F1e regression)', () => {
      expect(parseRunArgs(['./my-pack'])).toEqual({ ok: true, path: './my-pack', seed: null });
    });

    it('--seed <n> parses; the VALUE is never mistaken for the pack path', () => {
      expect(parseRunArgs(['--seed', '42'])).toEqual({ ok: true, path: null, seed: 42 });
    });

    it('--seed=<n> form parses', () => {
      expect(parseRunArgs(['--seed=482913'])).toEqual({ ok: true, path: null, seed: 482913 });
    });

    it('path and seed combine in either order', () => {
      expect(parseRunArgs(['./pack', '--seed', '7'])).toEqual({ ok: true, path: './pack', seed: 7 });
      expect(parseRunArgs(['--seed', '7', './pack'])).toEqual({ ok: true, path: './pack', seed: 7 });
    });

    it('0 and the int32 max are accepted; leading zeros are tolerated', () => {
      expect(parseRunArgs(['--seed', '0'])).toEqual({ ok: true, path: null, seed: 0 });
      expect(parseRunArgs(['--seed', '2147483647'])).toEqual({ ok: true, path: null, seed: 2147483647 });
      expect(parseRunArgs(['--seed', '007'])).toEqual({ ok: true, path: null, seed: 7 });
    });

    it.each([
      ['letters', ['--seed', 'abc']],
      ['negative', ['--seed', '-5']],
      ['float', ['--seed', '1.5']],
      ['empty via =', ['--seed=']],
      ['missing value', ['--seed']],
      ['beyond int32 max', ['--seed', '2147483648']],
    ])('structured rejection with hint: %s', (_label, args) => {
      const parsed = parseRunArgs(args as string[]);
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) {
        expect(parsed.message).toContain('--seed');
        expect(parsed.message).toContain('non-negative integer');
        expect(parsed.hint.length).toBeGreaterThan(0);
      }
    });
  });

  describe('formatSeedLine', () => {
    it('bundled form pairs the seed with the exact replay command', () => {
      expect(formatSeedLine(482913)).toBe(
        '  Seed: 482913 — replay this run with: ai-rpg-engine run --seed 482913',
      );
    });

    it('external form includes the pack path so the printed command works as-is', () => {
      expect(formatSeedLine(7, './my-pack')).toBe(
        '  Seed: 7 — replay this run with: ai-rpg-engine run ./my-pack --seed 7',
      );
    });
  });

  describe('mintSeed', () => {
    it('mints readable non-negative integers (0..999999)', () => {
      for (let i = 0; i < 200; i++) {
        const s = mintSeed();
        expect(Number.isInteger(s)).toBe(true);
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThan(1_000_000);
      }
    });
  });

  describe('createNewSession seed pass-through', () => {
    // A minimal pack with no buildCatalog: the wizard is skipped, so the
    // session constructs without touching readline (the same shape external
    // starter-template packs use).
    function fakePack(captured: { seed?: number }) {
      return {
        meta: { id: 'seed-probe', name: 'Seed Probe' },
        createGame: (s?: number) => {
          captured.seed = s;
          return new Engine({ manifest: testManifest, seed: s });
        },
      } as never;
    }

    it('an explicit seed reaches pack.createGame and lands in world.meta.seed', async () => {
      const captured: { seed?: number } = {};
      const session = await createNewSession(fakePack(captured), 99);
      expect(captured.seed).toBe(99);
      expect(session.engine.world.meta.seed).toBe(99);
    });

    it('with no seed given, a real seed is MINTED — never the old undefined/0-default path', async () => {
      const captured: { seed?: number } = {};
      const session = await createNewSession(fakePack(captured));
      expect(Number.isInteger(captured.seed)).toBe(true);
      expect(captured.seed).toBeGreaterThanOrEqual(0);
      expect(captured.seed).toBeLessThan(1_000_000);
      expect(session.engine.world.meta.seed).toBe(captured.seed);
    });
  });

  describe('fresh-run parity under a fixed seed', () => {
    it('same seed + same actions → byte-identical serialize()', () => {
      const run = () => {
        const engine = createFantasyGame(5);
        engine.submitAction('move', { targetIds: ['chapel-nave'] });
        return engine.serialize();
      };
      expect(run()).toBe(run());
    });

    it('different seeds → different worlds (roll-level divergence is pinned in combat-core tests)', () => {
      const a = createFantasyGame(5);
      const b = createFantasyGame(6);
      expect(a.world.meta.seed).toBe(5);
      expect(b.world.meta.seed).toBe(6);
      expect(a.serialize()).not.toBe(b.serialize());
    });
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

// P8-WL-002/P8-SP-001 — the ENG-009 module-migration seam runs on the SHIPPED
// load path. restoreSessionFromSave previously restored via
// WorldStore.deserialize + store swap only, which by documented design skips
// migrateModuleStates and post-swap initializeNamespaces — so a
// version-drifted module slice loaded raw on run → Continue (Engine.deserialize
// had the seam; zero production callers did). These tests drive the CLI's own
// authority with a pack whose module carries a real migrateState hook.
describe('restoreSessionFromSave — module-migration seam on the CLI path (P8-WL-002/P8-SP-001)', () => {
  /** A LoadedPack whose game wires one namespaced module at `version`. */
  function makeDriftPack(
    version: string,
    migrateState?: (slice: unknown, from: string) => unknown,
  ): LoadedPack {
    const mod: EngineModule = {
      id: 'drift-mod',
      version,
      register(ctx) {
        ctx.persistence.registerNamespace('drift-mod', { shape: `authored-at-${version}` });
      },
      ...(migrateState ? { migrateState } : {}),
    };
    return {
      meta: { id: 'drift-game', name: 'Drift Game' },
      createGame: (seed?: number) =>
        new Engine({
          manifest: {
            id: 'drift-game',
            title: 'Drift Game',
            version: '0.0.0',
            engineVersion: '0.1.0',
            ruleset: 'test',
            modules: ['drift-mod'],
            contentPacks: [],
          },
          seed: seed ?? 1,
          modules: [mod],
        }),
    };
  }

  it('a version-drifted module slice is migrated on Continue — the audit-proved dead scenario', () => {
    // Save written at module version 1.0.0…
    const packV1 = makeDriftPack('1.0.0');
    const oldEngine = packV1.createGame(9);
    expect(oldEngine.world.meta.moduleVersions?.['drift-mod']).toBe('1.0.0');
    const saved = JSON.parse(oldEngine.serialize());

    // …restored through the CLI authority by a build whose module is 2.0.0.
    const migrate = vi.fn((slice: unknown, from: string) => ({
      ...(slice as Record<string, unknown>),
      migratedFrom: from,
    }));
    const packV2 = makeDriftPack('2.0.0', migrate);
    const { engine } = restoreSessionFromSave(packV2, saved);

    expect(migrate).toHaveBeenCalledTimes(1);
    expect(migrate).toHaveBeenCalledWith({ shape: 'authored-at-1.0.0' }, '1.0.0');
    expect(engine.world.modules['drift-mod']).toEqual({
      shape: 'authored-at-1.0.0',
      migratedFrom: '1.0.0',
    });
    // The stamp is refreshed in place — the NEXT save is post-seam.
    expect(engine.world.meta.moduleVersions?.['drift-mod']).toBe('2.0.0');
  });

  it('a legacy save with NO meta.moduleVersions loads, migrates from the sentinel, and re-saves stamped', () => {
    const packV1 = makeDriftPack('1.0.0');
    const oldEngine = packV1.createGame(9);
    const saved = JSON.parse(oldEngine.serialize());
    delete saved.world.state.meta.moduleVersions; // the pre-ENG-009 save shape

    const migrate = vi.fn((slice: unknown, from: string) => ({ upgraded: true, from, was: slice }));
    const packV2 = makeDriftPack('2.0.0', migrate);
    const { engine } = restoreSessionFromSave(packV2, saved);

    // Absent stamp means the pre-versioning sentinel — the hook sees 0.0.0.
    expect(migrate).toHaveBeenCalledWith({ shape: 'authored-at-1.0.0' }, '0.0.0');
    expect(engine.world.meta.moduleVersions?.['drift-mod']).toBe('2.0.0');

    // And the save → Continue → save cycle now carries the stamp forever.
    const resaved = JSON.parse(engine.serialize());
    expect(resaved.world.state.meta.moduleVersions['drift-mod']).toBe('2.0.0');
  });

  it('in-sync versions never fire the hook (the seam is drift-gated, not a load tax)', () => {
    const migrate = vi.fn();
    const pack = makeDriftPack('1.0.0', migrate);
    const saved = JSON.parse(pack.createGame(3).serialize());
    restoreSessionFromSave(pack, saved);
    expect(migrate).not.toHaveBeenCalled();
  });

  it('a THROWING hook rejects the load with structured SAVE_MODULE_MIGRATION_FAILED — never a raw stack', () => {
    const packV1 = makeDriftPack('1.0.0');
    const saved = JSON.parse(packV1.createGame(9).serialize());
    const packV2 = makeDriftPack('2.0.0', () => {
      throw new Error('cannot read v1 shard layout');
    });

    let thrown: unknown;
    try {
      restoreSessionFromSave(packV2, saved);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(SaveLoadError);
    const err = thrown as SaveLoadError;
    expect(err.code).toBe('SAVE_MODULE_MIGRATION_FAILED');
    expect(err.message).toContain('drift-mod');
    expect(err.message).toContain('1.0.0');
    expect(err.message).toContain('2.0.0');
    expect(err.message).toContain('cannot read v1 shard layout');
    // The CLI frames SaveLoadError as `Cannot load save [CODE]` + Hint on both
    // callers (maybeOfferResume, replayGame) — the hint is part of the shape.
    expect(err.hint.length).toBeGreaterThan(0);
  });

  it('a REAL pre-v2.7 fantasy save baselines the world-tick cursor to the restored log length (P8-WL-006 on the CLI path)', () => {
    const original = createFantasyGame(42);
    original.submitAction('move', { targetIds: ['chapel-nave'] });
    original.submitAction('move', { targetIds: ['chapel-threshold'] });
    const saved = JSON.parse(original.serialize());
    // Simulate the pre-v2.7 save: no world-tick namespace, no stamp for it.
    delete saved.world.state.modules['world-tick'];
    if (saved.world.state.meta.moduleVersions) {
      delete saved.world.state.meta.moduleVersions['world-tick'];
    }

    const pack = allPacks.find((p) => p.meta.id === 'chapel-threshold')!;
    const { engine } = restoreSessionFromSave(pack, saved);

    const logLen = engine.world.eventLog.length;
    expect(logLen).toBeGreaterThan(0);
    const tickState = engine.world.modules['world-tick'] as { lastEventIndex: number } | undefined;
    // initializeNamespaces ran against the RESTORED store, and the factory
    // default baselined the cursor to the loaded log — not 0, which made the
    // first tick re-consume the entire prior session (the spawn-burst class).
    expect(tickState).toBeDefined();
    expect(tickState!.lastEventIndex).toBe(logLen);
    // And the re-registered module is stamped for the next save.
    expect(engine.world.meta.moduleVersions?.['world-tick']).toBe('1.0.0');
  });
});

// P8-PS-001 — an out-of-range menu number must never reach the engine as a
// bogus verb. Live-reproduced: input '11' (valid on the previous frame) was
// submitted as verb '11', rejected, and because the result was kind 'action'
// every living hostile got a free attack on a mistyped menu number.
describe('handlePlayerInput — out-of-range menu numbers cost nothing (P8-PS-001)', () => {
  it("'99' prints the real menu range and consumes NO turn — nothing reaches the engine", () => {
    const engine = makeEngine(); // base menu: [1] Move to Hall, [2] Look around
    const log = vi.fn();
    const result = handlePlayerInput(engine, '99', { log });

    expect(result).toEqual({ kind: 'unknown' });
    // Nothing was submitted: no declared/rejected pair, no tick consumed.
    expect(engine.world.eventLog).toHaveLength(0);
    expect(engine.tick).toBe(0);
    const logged = log.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('Please enter a number between 1 and 2.');
  });

  it('the guidance range includes the extras — the whole composed menu is one range', () => {
    const engine = makeEngine();
    const log = vi.fn();
    const extras = [{ verb: 'debug-inspect', label: 'Debug', group: 'debug' as const }];
    const result = handlePlayerInput(engine, '99', { log, extras });
    expect(result).toEqual({ kind: 'unknown' });
    expect(log.mock.calls.map((c) => String(c[0])).join('\n')).toContain(
      'Please enter a number between 1 and 3.',
    );
  });

  it("'0' is out of range too (the base parser starts at 1)", () => {
    const engine = makeEngine();
    const log = vi.fn();
    expect(handlePlayerInput(engine, '0', { log })).toEqual({ kind: 'unknown' });
    expect(engine.world.eventLog).toHaveLength(0);
  });

  it('numbers INSIDE the base and extras ranges still route exactly as before (control)', () => {
    const engine = makeEngine();
    const log = vi.fn();
    expect(handlePlayerInput(engine, '1', { log })).toEqual({ kind: 'action', via: 'menu' });
    expect(engine.world.eventLog.map((e) => e.type)).toContain('test.moved');

    const extras = [{ verb: 'debug-inspect', label: 'Debug', group: 'debug' as const }];
    // Base menu is 2 entries → '3' resolves the appended debug entry (kind
    // 'help', the extras' own no-turn contract).
    expect(handlePlayerInput(engine, '3', { log, extras })).toEqual({ kind: 'help' });
  });

  it('non-numeric text still falls through to the free-text parser (control)', () => {
    const engine = makeEngine();
    const result = handlePlayerInput(engine, 'move hall', { log: vi.fn() });
    expect(result).toEqual({ kind: 'action', via: 'text' });
  });
});

// P8-PS-002 (routing half) — a MENU-selected submission the engine refuses is
// the 'menu offered it, engine rejected it' trap: the player made no mistake,
// so the refusal must not forfeit the round to NPC turns + world tick. (The
// menu-side gate — not advertising dialogue-less NPCs at all — needs a
// dialogue-registry read the modules layer does not expose; see bin.ts.)
describe('handlePlayerInput — rejected MENU selections do not forfeit the round (P8-PS-002)', () => {
  /** makeEngine plus an npc whose Speak entry the engine will reject (no
   *  'speak' verb registered — the same action.rejected shape dialogue-core
   *  emits for 'X has nothing to say'). */
  function makeEngineWithDeadSpeak() {
    const engine = makeEngine();
    engine.store.addEntity({
      id: 'brutus',
      blueprintId: 'bp-npc',
      type: 'npc',
      name: 'Lanista Brutus',
      tags: ['npc'],
      stats: {},
      resources: { hp: 10 },
      statuses: [],
      zoneId: 'cell',
    });
    return engine;
  }

  it("a rejected 'Speak to <npc>' menu entry returns kind 'rejected' — the no-NPC-round signal", () => {
    const engine = makeEngineWithDeadSpeak();
    // Menu: [1] Move to Hall, [2] Speak to Lanista Brutus, [3] Inspect …, [4] Look around.
    const result = handlePlayerInput(engine, '2', { log: vi.fn() });

    expect(result).toEqual({ kind: 'rejected' });
    // The engine DID process and reject it (its own tick discipline holds)…
    const rejections = engine.world.eventLog.filter(
      (e) => e.type === 'action.rejected' && (e.payload as { verb?: unknown }).verb === 'speak',
    );
    expect(rejections).toHaveLength(1);
    // …but the kind is non-action: runSession only runs NPC turns + the world
    // tick for kind 'action', so the round is not forfeited.
    expect(result.kind).not.toBe('action');
  });

  it('a SUCCESSFUL menu selection still reports the action kind (control)', () => {
    const engine = makeEngineWithDeadSpeak();
    const result = handlePlayerInput(engine, '1', { log: vi.fn() });
    expect(result).toEqual({ kind: 'action', via: 'menu' });
    expect(engine.world.eventLog.map((e) => e.type)).toContain('test.moved');
  });
});

// P8-WL-010 — the two end-gates around the world's half of the round: no NPC
// block after a round-ending player action, and no world tick after an NPC
// downs the player (the tick could roll a zone-entry ambush over the corpse,
// narrated right before the defeat screen).
describe('runHostileRound — end-gates around NPC turns and the world tick (P8-WL-010)', () => {
  const pack = {
    meta: { id: 'test-game', name: 'Test Game' },
    createGame: () => makeEngine(),
  } as LoadedPack;

  it('a live round runs NPC turns then the world tick (control)', () => {
    const engine = makeEngine();
    const npcTurns = vi.fn();
    const worldTick = vi.fn();
    runHostileRound(engine, pack, { npcTurns, worldTick });
    expect(npcTurns).toHaveBeenCalledTimes(1);
    expect(worldTick).toHaveBeenCalledTimes(1);
  });

  it('an NPC downing the player mid-round stops the world tick — no ambush over the corpse', () => {
    const engine = makeEngine();
    const npcTurns = vi.fn(() => {
      engine.store.state.entities['hero'].resources.hp = 0;
    });
    const worldTick = vi.fn();
    runHostileRound(engine, pack, { npcTurns, worldTick });
    expect(npcTurns).toHaveBeenCalledTimes(1);
    expect(worldTick).not.toHaveBeenCalled();
  });

  it('a session already over at entry runs neither (the F1a gate, unchanged)', () => {
    const engine = makeEngine();
    engine.store.state.entities['hero'].resources.hp = 0;
    const npcTurns = vi.fn();
    const worldTick = vi.fn();
    runHostileRound(engine, pack, { npcTurns, worldTick });
    expect(npcTurns).not.toHaveBeenCalled();
    expect(worldTick).not.toHaveBeenCalled();
  });
});
