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
  getDistrictEconomy,
  getDistrictState,
  getSupplyLevel,
  type OpportunityKind,
  type OpportunityState,
  type SupplyCategory,
} from '@ai-rpg-engine/modules';
import { allPacks, type PackInfo } from './packs.js';
import { runHostileRound } from './bin.js';
import {
  POR_SEED,
  POR_ROUNDS,
  playSession,
  playerHalfRound,
  type SessionProfile,
} from './packs-opportunity-reachability.test.js';

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
  return playUntilOfferedAt(pack, kind, profile);
}

/** As `playUntilOffered`, and also reports WHERE in the session it stopped, so
 *  a caller that wants to keep playing resumes the same walk instead of
 *  restarting it. */
function playUntilOfferedAt(
  pack: PackInfo,
  kind: OpportunityKind,
  profile: SessionProfile = 'wandering',
): { engine: Engine; offer: OpportunityState; round: number } {
  const engine = pack.createGame(POR_SEED);
  const fullHp = engine.world.entities[engine.world.playerId]?.resources?.hp ?? 0;
  const visits = new Map<string, number>();

  for (let round = 0; round < POR_ROUNDS; round++) {
    const me = engine.world.entities[engine.world.playerId];
    if (!me) break;
    if (fullHp > 0 && me.resources) me.resources.hp = fullHp;

    // The SAME player POR-1 drives, via its exported half-round — so the two
    // suites can never drift about what a played session is.
    playerHalfRound(engine, round, profile, visits);
    runHostileRound(engine, pack, { log: NOOP });

    const offer = getPersistedOpportunities(engine.world).find(
      (o) => o.kind === kind && o.status === 'available',
    );
    if (offer) return { engine, offer, round: round + 1 };
  }
  throw new Error(
    `${pack.meta.id} never offered a \`${kind}\` in ${POR_ROUNDS} rounds — POR-1 says it should. ` +
      'If POR-1 is green and this is not, the two suites disagree about what a played session is.',
  );
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

function supplyOf(engine: Engine, districtId: string, category: SupplyCategory): number {
  const economy = getDistrictEconomy(engine.world, districtId);
  expect(economy, `district ${districtId} has no economy`).toBeDefined();
  return getSupplyLevel(economy!, category);
}

/** Keep playing without touching the offer, until the world tick expires it. */
function playUntilExpired(engine: Engine, pack: PackInfo, offer: OpportunityState, fromRound: number): void {
  const visits = new Map<string, number>();
  const fullHp = engine.world.entities[engine.world.playerId]?.resources?.hp ?? 0;
  for (let round = fromRound; round < fromRound + 30; round++) {
    const me = engine.world.entities[engine.world.playerId];
    if (!me) break;
    if (fullHp > 0 && me.resources) me.resources.hp = fullHp;
    playerHalfRound(engine, round, 'wandering', visits);
    runHostileRound(engine, pack, { log: NOOP });
    const still = getPersistedOpportunities(engine.world).find((o) => o.id === offer.id);
    if (!still || still.status === 'expired') return;
  }
  throw new Error(`\`${offer.kind}\` never expired — its deadline was ${String(offer.turnsRemaining)}`);
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

  describe('`supply-run` — salt-road-ledger', () => {
    it('completing a supply run EASES the shortage that caused it', () => {
      // The strongest consequence in the whole set: `economy-shift` is one of
      // the few fallout effect types with a real persisted sink, so the
      // district the offer was about measurably improves.
      const { engine, offer } = playUntilOffered(packById('salt-road-ledger'), 'supply-run');

      const districtId = offer.linkedDistrictId!;
      const reward = offer.rewards.find((r) => r.type === 'economy-shift');
      expect(reward, 'the supply run promised no economy shift — nothing to verify').toBeDefined();
      if (reward?.type !== 'economy-shift') throw new Error('unreachable');

      const before = supplyOf(engine, districtId, reward.category);
      const repBefore = reputationOf(engine, offer.sourceFactionId!);
      const legitimacyBefore = leverageOf(engine).legitimacy;

      accept(engine, offer);
      complete(engine, offer);

      expect(supplyOf(engine, districtId, reward.category)).toBe(before + reward.delta);
      expect(reputationOf(engine, offer.sourceFactionId!)).toBe(repBefore + 10);
      expect(leverageOf(engine).legitimacy).toBe(legitimacyBefore + 5);
    });

    it('letting a supply run LAPSE makes the district worse — expiry fallout, on real content', () => {
      // world-tick step 5b-i. Every `getXFallout` has an authored `expired`
      // case and the array they run on used to be discarded, so a deadline was
      // cosmetic. `supply-run` carries the richest one — reputation AND a
      // district that goes hungrier — and it is the reason expiry reads as
      // consequence rather than as a menu entry timing out.
      const pack = packById('salt-road-ledger');
      const { engine, offer, round } = playUntilOfferedAt(pack, 'supply-run');

      const districtId = offer.linkedDistrictId!;
      const foodBefore = supplyOf(engine, districtId, 'food');
      const repBefore = reputationOf(engine, offer.sourceFactionId!);

      playUntilExpired(engine, pack, offer, round);

      expect(reputationOf(engine, offer.sourceFactionId!)).toBe(repBefore - 3);
      expect(
        supplyOf(engine, districtId, 'food'),
        'the district ate the cost of the lapse — food should have dropped by 5',
      ).toBeLessThan(foodBefore);
    });
  });

  describe('`bounty` — black-flag-requiem', () => {
    // P1(bounty-on-ramp), recorded at v3.10 — see the FSC-1 skip block in
    // packs-fallout-sink-consequence.test.ts for the full story. This POC-1
    // test needs a natural-session bounty offer, which fires in 0/12 packs
    // since the wave-4 listener deletion shifted the event stream. UNSKIP in
    // the commit that restores bounty reachability.
    it.skip('P1(bounty-on-ramp): collecting the Brethren bounty pays standing and blackmail leverage', () => {
      // The deepest of the eight to reach: it needs the player to have made a
      // real enemy AND to have made a friend worth being hired by.
      const { engine, offer } = playUntilOffered(packById('black-flag-requiem'), 'bounty', 'engaged');

      // The Navy issues the pressure; the BRETHREN offer the work. A bounty
      // paid by the faction that wants you dead would be nonsense, and the
      // rule is explicitly written to find a rival — which only means anything
      // in a world with more than one faction.
      expect(offer.sourceFactionId).toBe('brethren-of-the-coast');

      const repBefore = reputationOf(engine, 'brethren-of-the-coast');
      const blackmailBefore = leverageOf(engine).blackmail;

      accept(engine, offer);
      complete(engine, offer);

      expect(reputationOf(engine, 'brethren-of-the-coast')).toBeGreaterThan(repBefore);
      expect(leverageOf(engine).blackmail).toBeGreaterThan(blackmailBefore);
    });

    it('the Navy has to actually want the captain dead — clear the grudge and it goes dark', () => {
      // Fix-site proof. The authored -35 baseline is what puts the
      // `bounty-issued` gate (rep <= -50) within reach of the two navy kills a
      // real session lands, instead of the five a flat zero would demand.
      const stripped = playSession(packById('black-flag-requiem'), {
        profile: 'engaged',
        hold: (engine) => {
          const navy = engine.world.factions['colonial-navy'];
          if (navy) navy.reputation = 0;
        },
      });
      expect(
        stripped.kindsFired.has('bounty'),
        'a bounty was issued with the Navy at neutral standing — the proof is not reading the reputation gate',
      ).toBe(false);
    });
  });

  describe('`recovery` — salt-road-ledger', () => {
    it('recovering the lost goods pays the Crown standing and legitimacy', () => {
      const { engine, offer } = playUntilOffered(packById('salt-road-ledger'), 'recovery');

      const repBefore = reputationOf(engine, offer.sourceFactionId!);
      const legitimacyBefore = leverageOf(engine).legitimacy;

      accept(engine, offer);
      complete(engine, offer);

      expect(reputationOf(engine, offer.sourceFactionId!)).toBe(repBefore + 8);
      expect(leverageOf(engine).legitimacy).toBe(legitimacyBefore + 5);
    });

    it('recovery needs a district that has stopped trading — restore commerce and it goes dark', () => {
      // Fix-site proof, and it took two drafts to aim correctly.
      //
      // The first control reopened the district's black market, on the theory
      // that `investigation` wins the district rule whenever one is open. That
      // is true of the FIRST branch and not of the rule: when an investigation
      // from the same source is already live the pair-conflict guard falls
      // THROUGH to recovery, which then only needs trade volume under 30. So
      // reopening the market left recovery firing and the control red for a
      // reason that had nothing to do with the fix.
      //
      // The load-bearing half is the trade volume, and behind it the authored
      // `commerce: 8`. Put commerce back to the default every district in the
      // catalog was silently using and the kind is unreachable again.
      const stripped = playSession(packById('salt-road-ledger'), {
        profile: 'wandering',
        hold: (engine) => {
          const district = getDistrictState(engine.world, 'high-counting-house');
          if (district) district.commerce = 50;
        },
      });
      expect(
        stripped.kindsFired.has('recovery'),
        'recovery still fired with commerce restored — the proof is not reading the trade-volume gate',
      ).toBe(false);
    });
  });
});
