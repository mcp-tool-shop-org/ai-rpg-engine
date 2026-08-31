// c3-entry-gates.test.ts — C3/P2's proof: a gate REFUSES, with the authored reason.
//
// The third noun in C4's sentence: "an entry gate refuses without the ability".
//
// C0 measured the gate as `no-channel` — "The Godot lane consumes it; the engine
// lane has no field for it" — and noted the deeper problem: the SpawnCondition
// grammar had "a parser, thirteen operand families, an editor, and no intact
// channel anywhere. One grammar, three broken paths." C1 fixed one path (exits).
// C3/P1 fixed the second (entity spawn conditions). This is the third.
//
// The instrument discipline is C1's `light` lesson, and this file applies it in
// the strongest available form: the gate is not asserted to be PRESENT, it is
// asserted to CHANGE WHAT A MOVE DOES, through the real `move` verb, with the
// authored message rendered by the real terminal renderer.

import { describe, it, expect } from 'vitest';
import {
  applyContentPack,
  loadContentFromFile,
  type ContentPack,
} from '@ai-rpg-engine/content-schema';
import {
  createStandardChannels,
  evaluateCondition,
  evaluateConditions,
  KNOWN_CONDITION_TYPES,
  UNEVALUABLE_OPERANDS,
  GATE_REFUSED_OPERANDS,
} from '@ai-rpg-engine/modules';
import { formatEventLine } from '@ai-rpg-engine/terminal-ui';
import type { Engine, ZoneState } from '@ai-rpg-engine/core';
import { allPacks, type PackInfo } from './packs.js';
import { FIXTURE_PACK_PATH } from './c0/fixture-path.js';

const SEED = 71;
const HOST_PACK_ID = 'chapel-threshold';

/** The forge fixture's three authored gates, read from the pack rather than retyped. */
const GATED = {
  /** hard: item:rope + class:delver + member:npc-quartermaster */
  vault: 'zone-under-vault',
  /** soft: party-size:>=3 + flag:bridge-repaired */
  yard: 'zone-surface-yard',
  /** hard, and contains `party-level` — an operand this engine has NO input for */
  gantry: 'zone-sky-gantry',
} as const;

function hostPack(): PackInfo {
  const p = allPacks.find((x) => x.meta.id === HOST_PACK_ID);
  if (!p) throw new Error(`pack ${HOST_PACK_ID} not found`);
  return p;
}

function fixturePack(): ContentPack {
  const r = loadContentFromFile(FIXTURE_PACK_PATH);
  if (!r.ok) throw new Error(`fixture pack failed to load: ${r.summary}`);
  return r.pack;
}

function bootWithExport(): Engine {
  const engine = hostPack().createGame(SEED);
  const r = applyContentPack(engine, fixturePack(), {
    channels: createStandardChannels(),
    prevalidated: true,
  });
  if (!r.ok) throw new Error(`intake failed: ${JSON.stringify(r.errors)}`);
  return engine;
}

/** Attempt a move through the REAL verb and report what the engine did. */
function attemptMove(engine: Engine, from: string, to: string): {
  moved: boolean;
  refused: boolean;
  warned: boolean;
  reason?: string;
  lines: string[];
  unmet: Array<{ type: string; reason: string; unevaluable: boolean }>;
} {
  const player = engine.store.getEntity(engine.world.playerId)!;
  engine.store.addEntity({ ...player, zoneId: from });
  const before = engine.world.eventLog.length;
  engine.submitAction('move', { targetIds: [to] });
  const produced = engine.world.eventLog.slice(before);

  const refusal = produced.find((e) => e.type === 'world.zone.gate.refused');
  const warning = produced.find((e) => e.type === 'world.zone.gate.warned');
  const gateEvent = refusal ?? warning;

  return {
    moved: engine.world.entities[engine.world.playerId].zoneId === to,
    refused: refusal !== undefined,
    warned: warning !== undefined,
    reason: gateEvent ? String((gateEvent.payload as { reason?: unknown }).reason) : undefined,
    lines: produced.map((e) => formatEventLine(e)).filter((l): l is string => l !== null),
    unmet: gateEvent
      ? ((gateEvent.payload as { unmet?: Array<{ type: string; reason: string; unevaluable: boolean }> }).unmet ?? [])
      : [],
  };
}

// --- The fixture authors gates, and they crossed --------------------------

describe('C3/P2 — CLOSES C0 §2: the entry gate reached the runtime', () => {
  const engine = bootWithExport();

  it('every authored gate is on the ZoneState, with a non-empty AND-array', () => {
    for (const zoneId of Object.values(GATED)) {
      const zone = engine.world.zones[zoneId] as ZoneState;
      expect(zone, `zone ${zoneId} must exist after intake`).toBeDefined();
      expect(zone.entryGate, `zone ${zoneId} must carry its gate`).toBeDefined();
      // Empty conditions are vacuously TRUE — the one shape that silently
      // unlocks. Asserted here as well as at the exporter and the validator.
      expect(zone.entryGate!.conditions.length).toBeGreaterThan(0);
      expect(['hard', 'soft']).toContain(zone.entryGate!.mode);
    }
  });

  it('the converter DETACHED the gate from the pack (no aliasing)', () => {
    // C1's ledger entry 3: both converters aliased their source arrays, and the
    // store's structuredClone hid it — so a passing test was passing for the
    // STORE's reason, not the converter's. Same control, same reason.
    const pack = fixturePack() as unknown as { zones: Array<{ id: string; entryGate?: { reason?: string } }> };
    const source = pack.zones.find((z) => z.id === GATED.vault)!;
    const zone = engine.world.zones[GATED.vault] as ZoneState;
    zone.entryGate!.conditions.push({ type: 'never' });
    zone.entryGate!.reason = 'mutated';
    expect(source.entryGate!.reason).not.toBe('mutated');
  });
});

// --- The hard gate refuses -------------------------------------------------

describe('C3/P2 — a HARD gate refuses the move, and says why', () => {
  it('the move is REFUSED, the player does not move, and the authored reason is rendered', () => {
    const engine = bootWithExport();
    const r = attemptMove(engine, GATED.yard, GATED.vault);

    expect(r.refused, 'a hard unmet gate must refuse').toBe(true);
    expect(r.moved, 'the player must NOT have moved').toBe(false);
    // The AUTHORED message, verbatim — not a paraphrase, not a generic string.
    expect(r.reason).toBe('No one goes down without rope and a delver.');

    // …and it reaches a PLAYER. This is the clause's proof: the real terminal
    // renderer turns the event into a line a human reads. An event nobody
    // renders is the "unproduced" way to be dead.
    expect(r.lines).toContain('> No one goes down without rope and a delver.');
  });

  it('the refusal names WHICH conditions were unmet, individually', () => {
    // All three, not just the first: an author fixing a gate should see the whole
    // reason it refused. The same argument as the load gate running all four
    // checks even after one fails.
    const engine = bootWithExport();
    const r = attemptMove(engine, GATED.yard, GATED.vault);
    const types = r.unmet.map((u) => u.type).sort();
    expect(types).toEqual(['has-item', 'party-class', 'party-member']);
    for (const u of r.unmet) {
      expect(u.reason.length, `${u.type} must carry a reason`).toBeGreaterThan(0);
    }
  });

  it('GREEN: satisfying the conditions OPENS the gate — same zone, same move', () => {
    // ⚠ THE CONTROL THAT MAKES EVERY REFUSAL ABOVE MEAN SOMETHING. A gate that
    // has only ever refused is as unproven as one that has only ever passed: it
    // could be refusing because the evaluator returns false unconditionally.
    // Same pack, same move, conditions met.
    const engine = bootWithExport();
    const player = engine.store.getEntity(engine.world.playerId)!;

    // `item:rope` — note the id: the GATE asks for `rope`, and that is what has
    // to be in the inventory. (The pack's item catalog calls the same object
    // `item-rope`; see the dangling-reference test below, which is a real defect
    // this fixture demonstrates rather than a typo in this test.)
    // party-member:npc-quartermaster + party-class:delver — the quartermaster is
    // recruited as an ACTIVE companion and tagged `delver`, satisfying both from
    // one member, which is exactly how the grammar is meant to compose.
    engine.store.addEntity({ ...player, zoneId: GATED.yard, inventory: ['rope'] });
    const qm = engine.store.getEntity('npc-quartermaster')!;
    engine.store.addEntity({ ...qm, tags: [...qm.tags, 'delver'] });
    engine.world.modules['companion-core'] = {
      companions: [{
        npcId: 'npc-quartermaster', role: 'scout', joinedAtTick: 0,
        abilityTags: [], morale: 60, active: true,
      }],
      maxSize: 3,
      cohesion: 60,
    };

    const r = attemptMove(engine, GATED.yard, GATED.vault);
    expect(r.refused, 'a MET gate must not refuse').toBe(false);
    expect(r.moved, 'the player must have moved').toBe(true);
    // A met gate is silent — no event at all, so an opened door reads exactly
    // like an ungated one.
    expect(r.lines.some((l) => l.includes('No one goes down'))).toBe(false);
  });

  it('RED: an UNGATED move is never refused', () => {
    // The instrument's own failure mode, checked. If ungated moves also refused,
    // "the gate refused" would be evidence of nothing.
    const engine = bootWithExport();
    const zone = engine.world.zones[GATED.vault] as ZoneState;
    delete zone.entryGate;
    const r = attemptMove(engine, GATED.yard, GATED.vault);
    expect(r.refused).toBe(false);
    expect(r.warned).toBe(false);
    expect(r.moved).toBe(true);
  });
});

// --- The soft gate warns AND permits --------------------------------------

describe('C3/P2 — a SOFT gate warns and permits', () => {
  it('unmet + soft ⇒ warned AND moved, with the reason rendered', () => {
    // The distinction `mode` exists to carry. A soft gate that BLOCKED would be
    // as wrong as a hard gate that did not.
    const engine = bootWithExport();
    const r = attemptMove(engine, GATED.vault, GATED.yard);

    expect(r.warned, 'a soft unmet gate must warn').toBe(true);
    expect(r.refused, 'a soft gate must NOT refuse').toBe(false);
    expect(r.moved, 'a soft gate must PERMIT the move').toBe(true);
    expect(r.reason).toBe('The yard gate needs three hands on the winch.');
    expect(r.lines).toContain('> The yard gate needs three hands on the winch. (you press on anyway)');
  });

  it('the warning precedes the entry it did not prevent', () => {
    // Causal order. A warning emitted after the entry reads as a comment on a
    // move that already happened.
    const engine = bootWithExport();
    const player = engine.store.getEntity(engine.world.playerId)!;
    engine.store.addEntity({ ...player, zoneId: GATED.vault });
    const before = engine.world.eventLog.length;
    engine.submitAction('move', { targetIds: [GATED.yard] });
    const types = engine.world.eventLog.slice(before).map((e) => e.type);
    expect(types.indexOf('world.zone.gate.warned')).toBeLessThan(types.indexOf('world.zone.entered'));
  });
});

// --- The honest limit: operands with no input -----------------------------

describe('C3/P2 — operands this engine cannot evaluate are NAMED, not silently false', () => {
  it('the unevaluable set is exactly what was measured against a booted world', () => {
    // Measured before the evaluator was written (condition-eval.ts header):
    // player-level and party-level have no level concept to read, and nothing
    // tracks time of day. Pinned as data so the prose cannot drift from it.
    expect(Object.keys(UNEVALUABLE_OPERANDS).sort()).toEqual(['party-level', 'player-level']);
    expect(Object.keys(GATE_REFUSED_OPERANDS)).toEqual(['random-probability']);
    // 18 families; time-of-day (F-ddccdcc7) plus four social arms (F-d7bab077).
    expect(KNOWN_CONDITION_TYPES).toHaveLength(18);
    const evaluable = KNOWN_CONDITION_TYPES.filter(
      (t) => !UNEVALUABLE_OPERANDS[t] && !GATE_REFUSED_OPERANDS[t],
    );
    expect(evaluable).toHaveLength(15);
  });

  it('the sky-gantry gate refuses AND reports its operand as unevaluable', () => {
    // A real authored case, not a contrived one: the fixture's gantry gate is
    // `party-level:>=10` + `party-size:>=3`, and `party-level` has no input.
    //
    // Fail-closed is the right default for a LOCK, and it is also indistinguishable
    // from a met-but-false condition unless the engine SAYS SO — which is the
    // difference between a door an author can fix and a door a player concludes is
    // broken.
    const engine = bootWithExport();
    const r = attemptMove(engine, GATED.vault, GATED.gantry);

    expect(r.refused).toBe(true);
    expect(r.moved).toBe(false);
    const level = r.unmet.find((u) => u.type === 'party-level');
    expect(level, 'party-level must appear in the unmet list').toBeDefined();
    expect(level!.unevaluable, 'and must be flagged UNEVALUABLE, not merely false').toBe(true);
    expect(level!.reason).toContain('no input');

    // The sibling condition in the same gate IS evaluable, and is reported as a
    // plain false — so the two are distinguishable in one payload.
    const size = r.unmet.find((u) => u.type === 'party-size');
    expect(size?.unevaluable).toBe(false);
  });
});

// --- The dangling-reference finding ----------------------------------------

describe('C3/P2 — a gate naming content the pack lacks is REPORTED', () => {
  it('the C0 fixture ships a gate that can never open, and the refs pass now says so', () => {
    // ⚠ A REAL DEFECT IN COMMITTED CONTENT, found by measurement while building
    // the GREEN control above. The fixture authors `item:rope` on
    // `zone-under-vault`; its item catalog calls the same object `item-rope`. So
    // `has-item` looks for an id no item in the pack has, and the door can never
    // open. Nothing caught it — the same phantom-id shape as C0 §5's nine module
    // ids: plausible, and dead.
    //
    // Advisory rather than error: an id can legitimately come from pack code, a
    // reward, or another pack. But it is SAID, which is the whole difference
    // between a door an author can fix and a door a player calls a bug.
    const r = loadContentFromFile(FIXTURE_PACK_PATH);
    expect(r.ok, 'the pack still loads — this is an advisory, not a refusal').toBe(true);

    const gateAdvisories = r.advisories.filter((a) => a.message.includes('has-item'));
    expect(gateAdvisories.length, 'the dangling gate item must be reported').toBeGreaterThan(0);
    expect(gateAdvisories[0].message).toContain('rope');
    expect(gateAdvisories[0].message).toContain('item-rope');
    expect(gateAdvisories[0].path).toContain('zone-under-vault');
  });

  it('CONTROL: a gate whose item DOES resolve produces no advisory', () => {
    // Proves the check discriminates rather than flagging every gate.
    const pack = fixturePack() as unknown as {
      zones: Array<{ id: string; entryGate?: { conditions: Array<{ type: string; params?: Record<string, unknown> }> } }>;
      items: Array<{ id: string }>;
    };
    const fixed = structuredClone(pack);
    const gate = fixed.zones.find((z) => z.id === GATED.vault)!.entryGate!;
    const hasItem = gate.conditions.find((c) => c.type === 'has-item')!;
    hasItem.params = { id: fixed.items[0].id };

    const engine = hostPack().createGame(SEED);
    const r = applyContentPack(engine, fixed as unknown as ContentPack, {
      channels: createStandardChannels(),
    });
    expect(r.advisories.filter((a) => a.message.includes('has-item'))).toEqual([]);
  });
});

// --- The evaluator's own properties (Lane 2) ------------------------------

describe('C3/P2 — the evaluator is closed, total and pure', () => {
  const engine = bootWithExport();
  const world = engine.world;
  const actorId = world.playerId;

  it('TOTAL: never throws, for any input', () => {
    const garbage: unknown[] = [
      null, undefined, 0, '', 'always', [], [{ type: 'always' }],
      {}, { type: '' }, { type: 7 }, { type: 'always', params: 'no' },
      { type: 'has-item' }, { type: 'has-item', params: {} },
      { type: 'party-size', params: { op: '~=', value: 1 } },
      { type: 'faction-rep', params: { id: 'x', op: '>', value: Number.NaN } },
      { type: 'not-a-family' },
    ];
    for (const g of garbage) {
      expect(() => evaluateCondition(g, world, actorId), JSON.stringify(g)).not.toThrow();
      const v = evaluateCondition(g, world, actorId);
      expect(typeof v.ok).toBe('boolean');
      // Anything not decidable carries a reason — a bare false is never enough.
      if (!v.ok) expect(v.reason, JSON.stringify(g)).toBeTruthy();
    }
  });

  it('CLOSED: an unknown type is refused, and the refusal names the vocabulary', () => {
    const v = evaluateCondition({ type: 'sudo-open-sesame' }, world, actorId);
    expect(v.ok).toBe(false);
    expect(v.evaluable).toBe(false);
    expect(v.reason).toContain('has-item');
  });

  it('PURE: the same condition evaluates identically on repeat, with no state change', () => {
    const before = JSON.stringify(world.globals);
    const spec = { type: 'has-item', params: { id: 'item-rope' } };
    const a = evaluateCondition(spec, world, actorId);
    const b = evaluateCondition(spec, world, actorId);
    expect(a).toEqual(b);
    expect(JSON.stringify(world.globals)).toBe(before);
  });

  it('a flag set to a FALSEY value is not set', () => {
    // Presence-is-truth would make `flag:x` unclearable, which is the kind of
    // one-way door that turns into a stuck quest.
    const w = bootWithExport().world;
    w.globals['gate-flag'] = false;
    expect(evaluateCondition({ type: 'has-flag', params: { id: 'gate-flag' } }, w, w.playerId).ok).toBe(false);
    w.globals['gate-flag'] = 0;
    expect(evaluateCondition({ type: 'has-flag', params: { id: 'gate-flag' } }, w, w.playerId).ok).toBe(false);
    w.globals['gate-flag'] = true;
    expect(evaluateCondition({ type: 'has-flag', params: { id: 'gate-flag' } }, w, w.playerId).ok).toBe(true);
  });

  it('an EMPTY AND-array is vacuously true — which is why nothing may emit one', () => {
    // Stated as an executable fact rather than left implicit, because three
    // separate places now refuse to produce this shape (the exporter, the
    // validator, and the importer) and a reader needs to know what they are
    // protecting against.
    expect(evaluateConditions([], world, actorId).met).toBe(true);
  });
});
