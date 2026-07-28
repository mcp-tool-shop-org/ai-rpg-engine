// POC-1 — opportunity CONSEQUENCE on authored content.
//
// POR-1 (packs-opportunity-reachability.test.ts) proves a kind can SPAWN in a
// played session. That is necessary and not sufficient: an offer the player
// can accept and complete for no observable result is a roster entry, not a
// strategic layer. This file plays each lit kind through its whole arc —
// spawn, accept, complete — and asserts the world CHANGED in a way a player
// could notice.
//
// SHAPE — before/after on real world state, read through the same accessors
// the game reads. Not the returned event's payload: the fallout event
// describes what the engine intended, and this suite is here to check what it
// actually wrote. `contract` is the case that proves the distinction matters —
// its authored `obligation` reward has no persisted sink at all (a documented
// ceiling in opportunity-resolution.ts), so the event announces a debt the
// ledger never records. Asserting on the payload would have called that green.

import { describe, it, expect } from 'vitest';
import type { Engine } from '@ai-rpg-engine/core';
import {
  getLeverageState,
  getPersistedOpportunities,
  type OpportunityKind,
  type OpportunityState,
} from '@ai-rpg-engine/modules';
import { allPacks, type PackInfo } from './packs.js';
import { runHostileRound } from './bin.js';
import { POR_SEED, POR_ROUNDS, playSession, type SessionProfile } from './packs-opportunity-reachability.test.js';

const NOOP = (): void => {};

/**
 * Play the pinned session until `kind` is offered, then STOP — leaving the
 * engine mid-session with the offer live, so the caller can act on it exactly
 * as a player would.
 *
 * Reuses POR-1's own player behaviour rather than re-deriving it: if the way
 * this catalog gets played changes, both suites move together.
 */
function playUntilOffered(
  pack: PackInfo,
  kind: OpportunityKind,
  profile: SessionProfile = 'wandering',
): { engine: Engine; offer: OpportunityState } {
  const engine = pack.createGame(POR_SEED);
  const fullHp = engine.world.entities[engine.world.playerId]?.resources?.hp ?? 0;

  for (let round = 0; round < POR_ROUNDS; round++) {
    const me = engine.world.entities[engine.world.playerId];
    if (!me) break;
    if (fullHp > 0 && me.resources) me.resources.hp = fullHp;

    // One round of the SAME behaviour POR-1 drives, via its exported driver.
    playOneRound(engine, pack, round, profile);

    const offer = getPersistedOpportunities(engine.world).find(
      (o) => o.kind === kind && o.status === 'available',
    );
    if (offer) return { engine, offer };
  }
  throw new Error(
    `${pack.meta.id} never offered a \`${kind}\` in ${POR_ROUNDS} rounds — POR-1 says it should. ` +
      'If POR-1 is green and this is not, the two suites disagree about what a played session is.',
  );
}

// POR-1 owns the player behaviour; this replays one round of it. Kept as a
// thin wrapper (rather than exporting the private half-round) so the two files
// share the DRIVER — createGame + runHostileRound — which is the part that
// matters, without POR-1 having to expose its internals.
function playOneRound(engine: Engine, pack: PackInfo, round: number, profile: SessionProfile): void {
  const me = engine.world.entities[engine.world.playerId];
  const exits = [...(engine.world.zones[me?.zoneId ?? '']?.neighbors ?? [])].sort();
  if (profile !== 'wandering') {
    const hostile = Object.values(engine.world.entities).find(
      (e) => e.id !== engine.world.playerId && e.zoneId === me?.zoneId && e.type === 'enemy' && (e.resources?.hp ?? 0) > 0,
    );
    if (hostile) {
      engine.submitAction('attack', { targetIds: [hostile.id] });
      runHostileRound(engine, pack, { log: NOOP });
      return;
    }
  }
  if (round % 3 === 2) {
    const neighbour = Object.values(engine.world.entities).find(
      (e) => e.id !== engine.world.playerId && e.zoneId === me?.zoneId && e.type === 'npc',
    );
    if (neighbour) {
      engine.submitAction('speak', { targetIds: [neighbour.id] });
      runHostileRound(engine, pack, { log: NOOP });
      return;
    }
  }
  if (exits.length > 0) engine.submitAction('move', { targetIds: [exits[round % exits.length]] });
  else engine.submitAction('wait', {});
  runHostileRound(engine, pack, { log: NOOP });
}

function reputationOf(engine: Engine, factionId: string): number {
  return (
    (engine.world.factions?.[factionId]?.reputation ?? 0) +
    Number(engine.world.globals[`reputation_${factionId}`] ?? 0)
  );
}

function leverageOf(engine: Engine): ReturnType<typeof getLeverageState> {
  const player = engine.world.entities[engine.world.playerId];
  return getLeverageState((player?.custom ?? {}) as Record<string, string | number | boolean>);
}

function accept(engine: Engine, offer: OpportunityState): void {
  const events = engine.submitAction('opportunity', { toolId: offer.id, parameters: { op: 'accept' } });
  const rejected = events.find((e) => e.type === 'action.rejected');
  expect(rejected, `accepting ${offer.kind} was rejected: ${String(rejected?.payload?.reason)}`).toBeUndefined();
}

function complete(engine: Engine, offer: OpportunityState): void {
  const events = engine.submitAction('opportunity', { toolId: offer.id, parameters: { op: 'complete' } });
  const rejected = events.find((e) => e.type === 'action.rejected');
  expect(rejected, `completing ${offer.kind} was rejected: ${String(rejected?.payload?.reason)}`).toBeUndefined();
}

function packById(id: string): PackInfo {
  return allPacks.find((p) => p.meta.id === id)!;
}

describe('opportunity consequence on authored content (POC-1)', () => {
  describe('`contract` — salt-road-ledger', () => {
    it('completing a contract Corvane offered moves reputation AND leverage', () => {
      const { engine, offer } = playUntilOffered(packById('salt-road-ledger'), 'contract');

      // The offer came from the person, not from thin air — a contract with no
      // source NPC would still spawn and would pay no faction.
      expect(offer.sourceNpcId).toBe('assay-master-corvane');
      expect(offer.sourceFactionId).toBe('assay-guild');

      const repBefore = reputationOf(engine, 'assay-guild');
      const favorBefore = leverageOf(engine).favor;

      accept(engine, offer);
      complete(engine, offer);

      // getContractFallout('completed'): +10 reputation with the source
      // faction, +5 favor. Both are real writes — `addGlobal` and
      // `adjustLeverage` — so both are readable off world state.
      expect(reputationOf(engine, 'assay-guild')).toBe(repBefore + 10);
      expect(leverageOf(engine).favor).toBe(favorBefore + 5);
    });

    it('abandoning the same contract costs reputation instead of paying it', () => {
      // The negative control for the assertion above: if the numbers moved for
      // any reason other than THIS resolution, they would move the same way
      // here. They move the other way.
      const { engine, offer } = playUntilOffered(packById('salt-road-ledger'), 'contract');
      const repBefore = reputationOf(engine, 'assay-guild');

      accept(engine, offer);
      engine.submitAction('opportunity', { toolId: offer.id, parameters: { op: 'abandon' } });

      expect(reputationOf(engine, 'assay-guild')).toBe(repBefore - 8);
    });

    it('the contract only exists because Corvane is allied AND greedy', () => {
      // Fix-site proof, not defect proof. `favorable` requires greed < 50 and
      // the `bargain` goal requires greed > 60, so ALLIED is the only
      // breakpoint that can carry this kind — strip either half of Corvane's
      // authored standing and the whole axis goes dark again.
      const stripped = playSession(packById('salt-road-ledger'), {
        profile: 'wandering',
        hold: (engine) => {
          const corvane = engine.world.entities['assay-master-corvane'];
          if (corvane) corvane.custom = { ...(corvane.custom ?? {}), greed: 20 };
        },
      });
      expect(
        stripped.kindsFired.has('contract'),
        'a contract spawned from an un-greedy Corvane — the proof above is not reading the gate it claims',
      ).toBe(false);
    });
  });
});
