// FU-2 — narration drives shipped play. runSession holds ONE TurnPresenter for
// the whole session and, after each action round (the player's action plus the
// NPC responses it provoked), presents the round's eventLog delta once and
// prints the styled narration line. narrateRound is that step, extracted with
// an injected print sink; these tests pin its contract: delta-exact
// presentation, empty-delta silence, one line per round, styledNarration
// pass-through, and presenter persistence across rounds.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { Engine } from '@ai-rpg-engine/core';
import { TurnPresenter, QUIET_TURN_TEXT, stripAnsi } from '@ai-rpg-engine/terminal-ui';
import { narrateRound } from './bin.js';

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
 * Bare engine with a player and one hostile, plus verbs that emit REAL
 * renderable event types (the ones formatEventLine narrates) carrying the
 * presentation metadata modules attach — so tone/urgency derivation sees them:
 *   wander → world.zone.entered      "Entered Hall"            (calm)
 *   strike → combat.damage.applied   "4 damage dealt (HP: 6)"  (combat/elevated)
 *   slay   → combat.entity.defeated  "Gnasher defeated!"       (triumph/critical)
 *   ponder → world.flag.changed      (bookkeeping — renders null)
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
    tags: ['player'],
    stats: {},
    resources: { hp: 10 },
    statuses: [],
    zoneId: 'cell',
  });
  engine.store.addEntity({
    id: 'gnasher',
    blueprintId: 'bp',
    type: 'enemy',
    name: 'Gnasher',
    tags: ['enemy'],
    stats: {},
    resources: { hp: 6 },
    statuses: [],
    zoneId: 'cell',
  });
  engine.store.state.playerId = 'hero';

  engine.dispatcher.registerVerb('wander', (action) => [
    {
      id: '',
      tick: action.issuedAtTick,
      type: 'world.zone.entered',
      actorId: action.actorId,
      payload: { zoneId: 'hall', zoneName: 'Hall' },
      presentation: { channels: ['objective'], priority: 'normal', soundCues: ['scene.enter'] },
    },
  ]);
  engine.dispatcher.registerVerb('strike', (action) => [
    {
      id: '',
      tick: action.issuedAtTick,
      type: 'combat.damage.applied',
      actorId: action.actorId,
      payload: { attackerId: action.actorId, targetId: 'hero', damage: 4, currentHp: 6 },
      presentation: { channels: ['objective'], priority: 'high', soundCues: ['combat.hit'] },
    },
  ]);
  engine.dispatcher.registerVerb('slay', (action) => [
    {
      id: '',
      tick: action.issuedAtTick,
      type: 'combat.entity.defeated',
      actorId: action.actorId,
      payload: { entityId: 'gnasher', entityName: 'Gnasher', defeatedBy: 'hero' },
      presentation: {
        channels: ['objective', 'narrator'],
        priority: 'critical',
        soundCues: ['combat.defeat'],
      },
    },
  ]);
  engine.dispatcher.registerVerb('ponder', (action) => [
    {
      id: '',
      tick: action.issuedAtTick,
      type: 'world.flag.changed',
      actorId: action.actorId,
      payload: { flag: 'pondered', value: true },
    },
  ]);
  return engine;
}

describe('narrateRound (FU-2) — the run loop narration step', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('presents exactly the round delta — events before logLenBefore are excluded', () => {
    const engine = makeEngine();
    engine.submitAction('wander', {}); // a PRIOR round: "Entered Hall"
    const logLenBefore = engine.world.eventLog.length;
    engine.submitAction('strike', {}); // this round

    const print = vi.fn();
    narrateRound(new TurnPresenter(), engine, logLenBefore, print);

    expect(print).toHaveBeenCalledTimes(1);
    const line = stripAnsi(String(print.mock.calls[0][0]));
    expect(line).toContain('4 damage dealt');
    expect(line).not.toContain('Entered Hall');
  });

  it('an empty delta prints nothing', () => {
    const engine = makeEngine();
    engine.submitAction('wander', {});

    const print = vi.fn();
    narrateRound(new TurnPresenter(), engine, engine.world.eventLog.length, print);

    expect(print).not.toHaveBeenCalled();
  });

  it('a round with player + NPC events produces ONE narration line covering both', () => {
    const engine = makeEngine();
    const logLenBefore = engine.world.eventLog.length;
    engine.submitAction('wander', {}); // the player's half of the round
    engine.submitActionAs('gnasher', 'strike', {}); // the NPC response (runNpcTurns path)

    const print = vi.fn();
    narrateRound(new TurnPresenter(), engine, logLenBefore, print);

    // One present for the whole round — a single line carrying both halves,
    // with the join punctuated (F-b1b81929: no more run-on fragment mash).
    expect(print).toHaveBeenCalledTimes(1);
    const line = stripAnsi(String(print.mock.calls[0][0]));
    expect(line).toContain('Entered Hall. 4 damage dealt');
  });

  it('prints the presenter styledNarration, indented two spaces — tone/urgency styling comes through', () => {
    // Deterministic color: NO_COLOR cleared, FORCE_COLOR beats the VITEST
    // plain-text default (precedence pinned in terminal-ui's styles).
    vi.stubEnv('NO_COLOR', '');
    vi.stubEnv('FORCE_COLOR', '1');

    const engine = makeEngine();
    const logLenBefore = engine.world.eventLog.length;
    engine.submitAction('slay', {}); // hostile defeated → tone triumph, urgency critical

    const print = vi.fn();
    narrateRound(new TurnPresenter(), engine, logLenBefore, print);

    const line = String(print.mock.calls[0][0]);
    // Green + bold — the triumph tier of renderNarrationLine: proof the line
    // is styledNarration, not the plain narrationText.
    expect(line).toContain('[32m');
    expect(line).toContain('[1m');
    // Color stays redundant emphasis: the plain text is intact underneath.
    expect(stripAnsi(line)).toBe('  Gnasher defeated!');
    // Verbatim pass-through: a fresh presenter over the same delta styles
    // identically (presented output is a pure function of event content).
    const parity = new TurnPresenter().present(
      engine.world,
      engine.world.eventLog.slice(logLenBefore),
    );
    expect(line).toBe(`  ${parity.styledNarration}`);
  });

  it('presenter state persists across rounds — one shared instance narrates round after round', () => {
    const engine = makeEngine();
    const presenter = new TurnPresenter(); // the runSession-lifetime instance
    const print = vi.fn();

    const beforeFirst = engine.world.eventLog.length;
    engine.submitAction('strike', {});
    narrateRound(presenter, engine, beforeFirst, print);

    const beforeSecond = engine.world.eventLog.length;
    engine.submitAction('wander', {});
    narrateRound(presenter, engine, beforeSecond, print);

    expect(print).toHaveBeenCalledTimes(2);
    const [first, second] = print.mock.calls.map((c) => stripAnsi(String(c[0])));
    expect(first).toContain('4 damage dealt');
    expect(second).toContain('Entered Hall');
    expect(second).not.toContain('damage dealt'); // rounds stay isolated
  });

  it('a non-empty delta with no renderable events still narrates once — the quiet fallback', () => {
    const engine = makeEngine();
    const logLenBefore = engine.world.eventLog.length;
    engine.submitAction('ponder', {}); // bookkeeping only — formatEventLine renders null

    const print = vi.fn();
    narrateRound(new TurnPresenter(), engine, logLenBefore, print);

    expect(print).toHaveBeenCalledTimes(1);
    expect(stripAnsi(String(print.mock.calls[0][0]))).toBe(`  ${QUIET_TURN_TEXT}`);
  });
});
