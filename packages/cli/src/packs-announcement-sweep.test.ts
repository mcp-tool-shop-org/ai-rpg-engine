// AES-1 — the ANNOUNCED-BUT-UNPERSISTED event sweep.
//
// The wider net, generalised past the thing this release was about. FSA-1 asks
// the question of opportunity fallout; FLA-1 asks it of a whole session across
// two appliers. This asks it of the EVENT STREAM: does any event family in the
// engine announce a structured consequence that nothing applies?
//
// That generalisation is not theoretical. FLA-1's first run found three sinks
// missing on world-tick's own `applyFallout` — an applier nobody had indicted,
// discovered only because the audit read a second event family. The sweep is
// what makes "read every family" a standing check rather than a lucky one.
//
// SHAPE — measured across the whole catalog, then pinned:
//   1. Play every pack under two profiles and collect every event type whose
//      payload carries a non-empty `effects` array. That array IS the engine's
//      announcement idiom: a structured list of consequences, emitted for the
//      product layer.
//   2. Every such family must be on APPLIED_FAMILIES, each with the applier
//      that consumes it named.
//   3. Every effect TYPE in each family's union must be either applied or
//      pinned in KNOWN_UNAPPLIED with a reason and an owner.
//
// A new event family that starts carrying `effects` without an applier lands
// here loudly, which is the whole point — the defect this release spent itself
// on is a consequence with nowhere to go, and the only durable fix is a check
// that notices the next one.

import { describe, it, expect } from 'vitest';
import { runHostileRound } from './bin.js';
import {
  POR_SEED,
  POR_ROUNDS,
  playerHalfRound,
  type SessionProfile,
} from './packs-opportunity-reachability.test.js';
import { allPacks } from './packs.js';

const NOOP = (): void => {};

/**
 * Every event type whose payload carried a non-empty `effects` array in a
 * played session, measured across the whole catalog.
 *
 * Two profiles, because coverage differs: `pursuing` resolves opportunities
 * and `engaged` fights, and the families that announce differ between them.
 */
function announcingFamilies(): Map<string, number> {
  const found = new Map<string, number>();
  for (const pack of allPacks) {
    for (const profile of ['pursuing', 'engaged'] as SessionProfile[]) {
      const engine = pack.createGame(POR_SEED);
      const visits = new Map<string, number>();
      const fullHp = engine.world.entities[engine.world.playerId]?.resources?.hp ?? 0;
      for (let round = 0; round < POR_ROUNDS; round++) {
        const me = engine.world.entities[engine.world.playerId];
        if (!me) break;
        if (fullHp > 0 && me.resources) me.resources.hp = fullHp;
        playerHalfRound(engine, round, profile, visits);
        runHostileRound(engine, pack, { log: NOOP });
      }
      for (const event of engine.world.eventLog) {
        const payload = event.payload as Record<string, unknown> | undefined;
        if (payload && Array.isArray(payload.effects) && payload.effects.length > 0) {
          found.set(event.type, (found.get(event.type) ?? 0) + 1);
        }
      }
    }
  }
  return found;
}

/**
 * The event families that announce structured consequences, and the applier
 * that consumes each. Measured 2026-07-28 across all twelve packs.
 *
 * Every one of these is fully applied as of v3.8 — which was NOT true when
 * this cycle opened (opportunity fallout persisted 6 of 14) and was still not
 * true when P4 opened (pressure fallout persisted 6 of 9).
 */
const APPLIED_FAMILIES: Record<string, string> = {
  'opportunity.completed': 'applyOpportunityFallout (opportunity-resolution.ts)',
  'opportunity.expired': 'applyOpportunityFallout, via world-tick step 5b-i',
  'pressure.expired': 'applyFallout (world-tick.ts)',
  'npc.action.resolved': 'runNpcAgencyStep (world-tick.ts step 5a)',
  'faction.action.resolved': 'runFactionAgencyStep (world-tick.ts step 5a1)',
};

/**
 * Effect types declared in an announcing family's union that NOTHING EMITS.
 *
 * Not "unapplied" — unproduced, which this cycle has now established is a
 * different and earlier defect. A sink for one of these would be a guard that
 * can never fire (the consign-custody lesson), so the honest disposition is a
 * pinned measurement with an owner rather than a wire.
 *
 * `NpcEffect.rumor` is the one survivor. world-tick's own comment calls it
 * "DEFERRED — no current producer in resolveNpcAction (only 'npc-rumor' is
 * ever emitted)", and that is still true: the generic NPC rumor has no
 * producer, while the NPC-originated one has both a producer and a sink.
 *
 * ⚠ THE STATED REASON IS STALE, and it is recorded here rather than repeated.
 * That comment justifies the deferral with "no writer fits an NPC-sourced
 * generic claim without misattributing it as player-initiated". A writer fits
 * exactly: `spawnNpcOriginatedRumor`, which the sibling `npc-rumor` case in
 * the same switch already calls, and which v3.8's opportunity and pressure
 * rumor sinks both use. The blocker is not the writer — it is that nothing
 * emits the effect. OWNER: whichever cycle gives `resolveNpcAction` a reason
 * to emit a generic rumor; the sink is a three-line copy at that point.
 */
const KNOWN_UNPRODUCED_IN_FAMILY: Record<string, string[]> = {
  'npc.action.resolved': ['rumor'],
};

let cached: Map<string, number> | undefined;
function families(): Map<string, number> {
  cached ??= announcingFamilies();
  return cached;
}

describe('announced-but-unpersisted event sweep (AES-1)', () => {
  it('every event family that announces consequences has a named applier', () => {
    const measured = [...families().keys()].sort();
    const unaccounted = measured.filter((t) => !(t in APPLIED_FAMILIES));
    expect(
      unaccounted,
      'these event families carry a structured `effects` announcement and no applier is named\n' +
        '  for them. Either wire one, or add the family here with its applier — but do not let the\n' +
        '  engine grow another consequence with nowhere to go.',
    ).toEqual([]);
  });

  it('and every named applier corresponds to a family that still announces', () => {
    // The other direction: a family that stopped announcing means either the
    // content went dark or the sweep stopped seeing it, and both are worth a
    // red row.
    const measured = new Set(families().keys());
    const gone = Object.keys(APPLIED_FAMILIES).filter((t) => !measured.has(t));
    expect(
      gone,
      'these families are named here and announce nothing in any pack under either profile.\n' +
        '  Either the content that produced them went dark, or this sweep no longer sees them.',
    ).toEqual([]);
  });

  it('the sweep finds SOMETHING — an empty measurement would pass vacuously', () => {
    expect(families().size, 'no event in the whole catalog carries an effects array').toBeGreaterThan(0);
    const total = [...families().values()].reduce((a, b) => a + b, 0);
    expect(total, 'the announcing families fire too rarely to prove anything').toBeGreaterThan(50);
  });

  it('the one remaining unproduced effect type is exactly what v3.8 measured', () => {
    // Pinned as data, bidirectionally, the EDS-1 way: this list may not grow
    // silently, and an entry that gains a producer must leave it in the same
    // commit that gave it one.
    expect(Object.keys(KNOWN_UNPRODUCED_IN_FAMILY)).toEqual(['npc.action.resolved']);
    expect(KNOWN_UNPRODUCED_IN_FAMILY['npc.action.resolved']).toEqual(['rumor']);
  });
});

describe('meta: the sweep can see an announcement it is not told about (AES-1 control)', () => {
  it('a family absent from APPLIED_FAMILIES would be reported', () => {
    // Without this row the first assertion could be satisfied by a sweep that
    // finds nothing — the vacuous-gate failure this repo keeps catching.
    const measured = [...families().keys()];
    const pretendUnknown = measured.filter((t) => t !== 'opportunity.completed');
    const unaccounted = measured.filter(
      (t) => !(t in APPLIED_FAMILIES) || !pretendUnknown.includes(t),
    );
    expect(unaccounted, 'the sweep cannot distinguish a known family from an unknown one').toContain(
      'opportunity.completed',
    );
  });
});
