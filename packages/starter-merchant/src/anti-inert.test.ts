// THE ANTI-INERT AUDIT (P8) — every headline mechanic traced through a REAL
// played session on shipped content.
//
// The v3.0 Phase-9 discipline, applied to this pack. A green unit suite proves a
// mechanism works when called; it does not prove anything ever calls it, that a
// player can reach it, or that its stated consequence can occur. This file exists
// because the audit found FIVE things that were wired, schema-valid, unit-green
// and dead:
//
//   1. `encumbered` — a status definition with no producer anywhere
//   2. `writ-of-passage` / `deed-of-the-longshore` — catalog items with no
//      acquisition path, and they are the NFT-transfer and burn showcase targets
//   3. `underwrite`'s claim — `claimed` written false at issue, never set true,
//      so the documented downside could not occur and the verb was pure upside
//   4. `haggle`'s margin — a percentage emitted into the log that nothing read
//   5. that same margin, once wired, rounding away to nothing on common goods
//
// Each `it` below is the trace that would have caught one of them. They assert on
// OBSERVABLE CONSEQUENCE — a status on the entity, an item in the inventory, a
// resource that moved — never on "the function returns something".

import { describe, it, expect } from 'vitest';
import type { Engine } from '@ai-rpg-engine/core';
import { getPartyState, getPersistedOpportunities, runWorldTick } from '@ai-rpg-engine/modules';
import { createGame } from './setup.js';
import { itemCatalog, merchantStatusDefinitions, merchantAbilities, buildCatalog } from './content.js';
import {
  getContractState,
  getOpenObligations,
  defaultObligation,
  SEIZURE_THRESHOLD,
} from './contract-core.js';

const events = (engine: Engine, type: string) => engine.world.eventLog.filter((e) => e.type === type);

/** Register with the Guild — the seal lands and `consign` becomes possible. */
function openTheBooks(engine: Engine): void {
  engine.submitAction('speak', { targetIds: ['assay-master-corvane'] });
  engine.submitAction('choose', { parameters: { choiceId: 'register' } });
}

/** Walk to the Warrens, where Broker Inaya takes consignments. */
function toTheWarrens(engine: Engine): void {
  engine.submitAction('move', { targetIds: ['long-quay'] });
  engine.submitAction('move', { targetIds: ['crooked-stair'] });
}

describe('anti-inert: every declared status has a producer', () => {
  it('`encumbered` is APPLIED to a factor who crosses the seizure threshold', () => {
    // Finding 1. This status shipped in content.ts at P3 and nothing applied it
    // until the audit. contract-core now takes injected status ops and marks the
    // factor on the obligation clock.
    const engine = createGame(71);
    openTheBooks(engine);
    toTheWarrens(engine);
    engine.submitAction('consign', { parameters: { itemId: 'bale-of-flax' }, targetIds: ['broker-inaya'] });

    engine.world.entities.factor.resources.lien = SEIZURE_THRESHOLD;
    engine.submitAction('move', { targetIds: ['long-quay'] });

    expect(engine.world.entities.factor.statuses.map((s) => s.statusId)).toContain('encumbered');
    expect(events(engine, 'merchant.factor.encumbered')).toHaveLength(1);
  });

  it('every status this pack defines is reachable from some producer', () => {
    // The generalised check. `sharp-eyed` and `called-out` come from abilities;
    // `encumbered` from the obligation clock. A status with no producer is dead
    // weight that reads like a feature.
    const applied = new Set<string>();
    for (const ability of merchantAbilities) {
      for (const effect of ability.effects ?? []) {
        if (effect.type !== 'apply-status') continue;
        applied.add(String((effect.params as { statusId?: unknown }).statusId));
      }
    }
    // Produced by contract-core rather than by an ability.
    applied.add('encumbered');

    for (const status of merchantStatusDefinitions) {
      expect(applied.has(status.id), `status '${status.id}' has no producer`).toBe(true);
    }
  });
});

describe('anti-inert: every catalog item is obtainable', () => {
  it('the writ of passage is granted by completing The Late Caravan', () => {
    // Finding 2a. Traced through real movement, not by reading the quest table.
    const engine = createGame(71);
    engine.submitAction('move', { targetIds: ['long-quay'] });
    engine.submitAction('move', { targetIds: ['customs-shed'] });
    engine.submitAction('move', { targetIds: ['long-quay'] });
    engine.submitAction('move', { targetIds: ['crooked-stair'] });

    expect(engine.world.quests['the-late-caravan']?.status).toBe('completed');
    expect(engine.world.entities.factor.inventory).toContain('writ-of-passage');
  });

  it('the longshore deed is granted by surviving the audit', () => {
    // Finding 2b. The deed is the pack's burn/seizure showcase target, so an
    // unobtainable deed meant that half of the showcase had nothing real to take.
    const engine = createGame(71);
    engine.submitAction('move', { targetIds: ['long-quay'] });
    engine.submitAction('move', { targetIds: ['customs-shed'] });
    engine.submitAction('move', { targetIds: ['audit-chamber'] });
    for (let i = 0; i < 600; i++) {
      if ((engine.world.entities['the-standing-account']?.resources.hp ?? 0) <= 0) break;
      engine.submitAction('attack', { targetIds: ['the-standing-account'] });
      const f = engine.world.entities.factor;
      f.resources.stamina = 20;
      f.resources.liquidity = 60;
    }

    expect(engine.world.quests['the-standing-account']?.status).toBe('completed');
    expect(engine.world.entities.factor.inventory).toContain('deed-of-the-longshore');
  });

  it('EVERY catalog item has an acquisition path in shipped content', () => {
    // The generalised check that would have caught finding 2 at authoring time.
    //
    // Obtainability is OBSERVED, not listed: a single session opens the books,
    // completes both item-granting quests, and buys from the market, and the
    // union of what actually reached the inventory is the evidence. An earlier
    // draft used a hardcoded allowlist and immediately flagged `guild-seal` —
    // which IS obtainable, via the dialogue-driven grant in setup.ts, a fifth
    // acquisition path the list had simply forgotten. A hand-maintained
    // allowlist tests the list, not the game.
    const engine = createGame(71);
    const seen = new Set<string>(engine.world.entities.factor.inventory ?? []);
    const record = () => {
      for (const id of engine.world.entities.factor.inventory ?? []) seen.add(id);
    };

    // The seal, via registration.
    openTheBooks(engine);
    record();

    // The writ, via The Late Caravan.
    engine.submitAction('move', { targetIds: ['long-quay'] });
    engine.submitAction('move', { targetIds: ['customs-shed'] });
    engine.submitAction('move', { targetIds: ['long-quay'] });
    engine.submitAction('move', { targetIds: ['crooked-stair'] });
    record();

    // Everything the market sells (GENRE_BUYABLE_STOCK.merchant), bought for real.
    engine.submitAction('move', { targetIds: ['long-quay'] });
    engine.submitAction('move', { targetIds: ['customs-shed'] });
    engine.submitAction('move', { targetIds: ['weighing-floor'] });
    for (const item of itemCatalog.items) {
      engine.world.entities.factor.resources.coin = 400;
      engine.submitAction('buy', { toolId: item.id });
    }
    record();

    // The deed, via the audit.
    engine.submitAction('move', { targetIds: ['customs-shed'] });
    engine.submitAction('move', { targetIds: ['audit-chamber'] });
    for (let i = 0; i < 600; i++) {
      if ((engine.world.entities['the-standing-account']?.resources.hp ?? 0) <= 0) break;
      engine.submitAction('attack', { targetIds: ['the-standing-account'] });
      const f = engine.world.entities.factor;
      f.resources.stamina = 20;
      f.resources.liquidity = 60;
    }
    record();

    // Plus what a created character can start with (character creation is a real
    // path even though this scripted session uses the authored player).
    for (const id of buildCatalog.archetypes.flatMap((a) => a.startingInventory ?? [])) seen.add(id);

    const unobtainable = itemCatalog.items.map((i) => i.id).filter((id) => !seen.has(id));
    expect(unobtainable, 'these catalog items can never reach a player').toEqual([]);
  });

  it('a purchased good really lands in the inventory (the market path is live)', () => {
    // Proves the buyable-stock half of the claim above rather than asserting it.
    // `buy` reads toolId, not parameters.itemId.
    const engine = createGame(71);
    openTheBooks(engine);
    engine.submitAction('move', { targetIds: ['weighing-floor'] });
    engine.submitAction('buy', { toolId: 'saffron-brick' });

    expect(engine.world.entities.factor.inventory).toContain('saffron-brick');
    expect(events(engine, 'item.bought')).toHaveLength(1);
  });
});

describe('anti-inert: every verb has an observable consequence', () => {
  it('UNDERWRITE’s stated downside can actually occur', () => {
    // Finding 3. `claimed` was written false and never set true, so "lien later
    // if the claim fires" described an unreachable branch and the verb was free
    // liquidity. Policies now mature on the obligation clock and fire iff the
    // guaranteed party actually defaulted.
    const engine = createGame(71);
    openTheBooks(engine);
    toTheWarrens(engine);
    engine.submitAction('underwrite', { targetIds: ['broker-inaya'] });
    engine.submitAction('consign', { parameters: { itemId: 'bale-of-flax' }, targetIds: ['broker-inaya'] });

    const obligation = getOpenObligations(engine.world)[0];
    defaultObligation(engine.world, obligation.id, engine.world.meta.tick);
    const lienBefore = engine.world.entities.factor.resources.lien;

    // Let the policy mature.
    engine.world.meta.tick += 40;
    engine.submitAction('move', { targetIds: ['long-quay'] });

    const policy = getContractState(engine.world).underwritten[0];
    expect(policy.claimed).toBe(true);
    expect(events(engine, 'merchant.risk.claimed')).toHaveLength(1);
    expect(engine.world.entities.factor.resources.lien).toBeGreaterThan(lienBefore);
  });

  it('a policy on a party who stayed good LAPSES harmlessly', () => {
    // The other branch — otherwise "the claim fires" would just be "underwriting
    // always costs you", which is a different and equally wrong mechanic.
    const engine = createGame(71);
    openTheBooks(engine);
    toTheWarrens(engine);
    engine.submitAction('underwrite', { targetIds: ['broker-inaya'] });
    engine.submitAction('consign', { parameters: { itemId: 'bale-of-flax' }, targetIds: ['broker-inaya'] });

    engine.world.meta.tick += 40;
    engine.submitAction('move', { targetIds: ['long-quay'] });

    expect(events(engine, 'merchant.risk.lapsed')).toHaveLength(1);
    expect(events(engine, 'merchant.risk.claimed')).toHaveLength(0);
  });

  it('HAGGLE changes the value of the next consignment', () => {
    // Findings 4 and 5. The margin used to be a number in the event log that no
    // consumer read; now it is banked against the counterparty and consumed by
    // the next consign with them.
    const consignedValue = (withHaggle: boolean): number => {
      const engine = createGame(71);
      openTheBooks(engine);
      toTheWarrens(engine);
      if (withHaggle) engine.submitAction('haggle', { targetIds: ['broker-inaya'] });
      engine.submitAction('consign', { parameters: { itemId: 'bale-of-flax' }, targetIds: ['broker-inaya'] });
      return Number(events(engine, 'merchant.contract.consigned').pop()!.payload.value);
    };

    const plain = consignedValue(false);
    const haggled = consignedValue(true);
    // Finding 5: a 4% margin on a base-10 lot rounds back to 10, so the mechanic
    // was invisible on exactly the goods a new factor carries. A won negotiation
    // is now worth at least one coin.
    expect(haggled).toBeGreaterThan(plain);
  });

  it('RECRUIT reaches a real companion, and she changes the PRICE', () => {
    // F-merchant-A. This pack shipped `recruit` in its help table with zero
    // entities tagged `recruitable` anywhere in the world — the only pack in
    // the catalog in that state. Verb-honesty passed the whole time, because
    // companion-core registers the handler in every world regardless of whether
    // the content gives it anything to act on.
    //
    // The assertion is deliberately the CONSEQUENCE, not the roster. A
    // companion who joins the party and changes no number is the decorative
    // failure this cycle exists to prevent, so what is measured here is the
    // margin `haggle` banks and `consign` pays out.
    // BOTH arms walk the identical route — counting-house → weighing-floor
    // (where Vessa works) → back → long-quay → crooked-stair — and differ only
    // in whether `recruit` is submitted. An earlier draft skipped the detour
    // entirely in the control arm, which left the two runs at different tick
    // counts and would have credited the companion for any tick-dependent
    // difference.
    const marginWith = (recruit: boolean): number => {
      const engine = createGame(71);
      openTheBooks(engine);
      engine.submitAction('move', { targetIds: ['weighing-floor'] });
      if (recruit) {
        const recruited = engine.submitAction('recruit', { targetIds: ['tally-clerk-vessa'] });
        expect(
          recruited.some((e) => e.type === 'action.rejected'),
          'the recruit was rejected — the content gate is still closed',
        ).toBe(false);
      }
      engine.submitAction('move', { targetIds: ['counting-house'] });
      toTheWarrens(engine);
      engine.submitAction('haggle', { targetIds: ['broker-inaya'] });
      return Number(events(engine, 'merchant.price.haggled').pop()!.payload.marginPercent);
    };

    const alone = marginWith(false);
    const withClerk = marginWith(true);
    expect(withClerk).toBeGreaterThan(alone);
  });

  it('the recruit dual-writes all land — party, tags, and a shared faction', () => {
    // companion-core commits three separate mirrors on a successful recruit and
    // every downstream consumer reads a different one. A recruit that updated
    // only the party roster would look fine in the menu and resolve the
    // companion as an ENEMY in combat targeting.
    const engine = createGame(71);
    openTheBooks(engine);
    engine.submitAction('move', { targetIds: ['weighing-floor'] });
    engine.submitAction('recruit', { targetIds: ['tally-clerk-vessa'] });

    const party = getPartyState(engine.world);
    expect(party.companions.map((c) => c.npcId)).toContain('tally-clerk-vessa');

    const vessa = engine.world.entities['tally-clerk-vessa'];
    const factor = engine.world.entities['factor'];
    expect(vessa.tags, 'entity tags mirror not written').toContain('companion');
    expect(vessa.faction, 'companion has no faction — targeting reads her as an enemy').toBeTruthy();
    expect(vessa.faction, 'companion is not on the player\'s side').toBe(factor.faction);
    expect(events(engine, 'companion.recruited')).toHaveLength(1);
  });

  it('USE does something — the tincture moves a resource', () => {
    // F-merchant-USE. This pack wired `createInventoryCore([])` while
    // advertising `use`, and inventory-core emits `item.used` and consumes the
    // item whether or not an effect is registered. So every `use` in Salt Road
    // Ledger destroyed a saleable good and did nothing, indistinguishable from
    // a working item unless you look for the effect's OWN events.
    const engine = createGame(71);
    const factor = engine.world.entities['factor'];
    factor.resources.hp = 6;
    factor.inventory = [...(factor.inventory ?? []), 'apothecary-tincture'];

    const before = factor.resources.hp;
    engine.submitAction('use', { toolId: 'apothecary-tincture' });

    expect(engine.world.entities['factor'].resources.hp).toBeGreaterThan(before);
    expect(
      engine.world.entities['factor'].inventory,
      'the tincture was drunk — the stock is gone',
    ).not.toContain('apothecary-tincture');
  });

  it('the banked margin is CONSUMED — haggling once does not pay forever', () => {
    const engine = createGame(71);
    openTheBooks(engine);
    engine.submitAction('move', { targetIds: ['weighing-floor'] });
    engine.submitAction('buy', { toolId: 'salt-block' });
    engine.submitAction('buy', { toolId: 'grain-sack' });
    engine.submitAction('move', { targetIds: ['counting-house'] });
    engine.submitAction('move', { targetIds: ['long-quay'] });
    engine.submitAction('move', { targetIds: ['crooked-stair'] });

    engine.submitAction('haggle', { targetIds: ['broker-inaya'] });
    engine.submitAction('consign', { parameters: { itemId: 'salt-block' }, targetIds: ['broker-inaya'] });
    engine.submitAction('consign', { parameters: { itemId: 'grain-sack' }, targetIds: ['broker-inaya'] });

    const consigned = events(engine, 'merchant.contract.consigned');
    expect(consigned).toHaveLength(2);
    expect(Number(consigned[0].payload.haggledMarginPercent)).not.toBe(0);
    expect(Number(consigned[1].payload.haggledMarginPercent)).toBe(0);
  });

  it('APPRAISE reports a band that a better ledger narrows', () => {
    const engine = createGame(71);
    engine.submitAction('appraise', { parameters: { itemId: 'ledger-book' } });
    const report = events(engine, 'merchant.item.appraised').pop()!;
    expect(Number(report.payload.estimateHigh)).toBeGreaterThanOrEqual(Number(report.payload.estimateLow));
    expect(Number(report.payload.accuracy)).toBeGreaterThan(0);
  });

  it('AUDIT reports real numbers off real obligations', () => {
    const engine = createGame(71);
    openTheBooks(engine);
    toTheWarrens(engine);
    engine.submitAction('consign', { parameters: { itemId: 'bale-of-flax' }, targetIds: ['broker-inaya'] });
    engine.submitAction('audit');

    const report = events(engine, 'merchant.audit.requested').pop()!;
    expect(report.payload.openCount).toBe(1);
    expect(Number(report.payload.receivable)).toBeGreaterThan(0);
  });
});

describe('anti-inert: opportunities emerge and resolve on shipped content', () => {
  // F-merchant-B. opportunity-core is EMERGENT-ONLY — no pack authors
  // opportunity content anywhere in the catalog; the only lever a pack has is
  // its OpportunityInputs (pressures, NPC goals, faction needs, companion
  // asks). So "does Salt Road Ledger ever offer the player work?" is an
  // empirical question, and it had never been asked.
  //
  // The load-bearing detail, and the reason this went unproven for a release:
  // `runWorldTick` is NOT a verb and NOT an event subscription. It is a
  // per-round function the CLI calls after the player's action and the NPC
  // round (bin.ts's runHostileRound). A test that only calls submitAction
  // drives the player's half of a round and never the world's, so it sees zero
  // opportunities forever and concludes the feature is dead. It is not dead —
  // it was never being run. Every assertion below drives the round the way the
  // CLI does.
  const round = (engine: Engine, verb: string, opts?: Parameters<Engine['submitAction']>[1]) => {
    engine.submitAction(verb, opts);
    runWorldTick(engine, { genre: 'mercantile', log: () => {} });
  };

  it('a played session SPAWNS an opportunity, and the player can accept and complete it', () => {
    const engine = createGame(71);
    const circuit = ['weighing-floor', 'counting-house', 'long-quay', 'crooked-stair', 'long-quay', 'counting-house'];

    let acceptedId: string | undefined;
    let completed = false;

    outer: for (let lap = 0; lap < 8; lap++) {
      for (const zone of circuit) {
        round(engine, 'move', { targetIds: [zone] });

        if (!acceptedId) {
          const available = getPersistedOpportunities(engine.world).find((o) => o.status === 'available');
          if (available) {
            const ev = engine.submitAction('opportunity', { parameters: { op: 'accept' }, toolId: available.id });
            expect(
              ev.some((e) => e.type === 'action.rejected'),
              `accepting ${available.id} was rejected`,
            ).toBe(false);
            acceptedId = available.id;
          }
          continue;
        }

        const accepted = getPersistedOpportunities(engine.world).find((o) => o.id === acceptedId && o.status === 'accepted');
        if (accepted) {
          const ev = engine.submitAction('opportunity', { parameters: { op: 'complete' }, toolId: accepted.id });
          expect(ev.some((e) => e.type === 'action.rejected'), `completing ${accepted.id} was rejected`).toBe(false);
          completed = true;
          break outer;
        }
      }
    }

    // Observable consequence, not a return value: the events a player would
    // see, and the status the world actually carries afterwards.
    expect(events(engine, 'opportunity.spawned').length, 'no opportunity ever spawned').toBeGreaterThan(0);
    expect(acceptedId, 'nothing was ever available to accept').toBeTruthy();
    expect(completed, 'the accepted opportunity never completed').toBe(true);
    expect(events(engine, 'opportunity.accepted')).toHaveLength(1);
    expect(events(engine, 'opportunity.completed')).toHaveLength(1);
    expect(
      getPersistedOpportunities(engine.world).find((o) => o.id === acceptedId)?.status,
    ).toBe('completed');
  });

  it('meta: without the world tick, the same session sees NOTHING', () => {
    // The negative control for the test above, and a permanent record of why
    // this was invisible: identical session, player half only.
    const engine = createGame(71);
    const circuit = ['weighing-floor', 'counting-house', 'long-quay', 'crooked-stair', 'long-quay', 'counting-house'];
    for (let lap = 0; lap < 8; lap++) {
      for (const zone of circuit) engine.submitAction('move', { targetIds: [zone] });
    }
    expect(getPersistedOpportunities(engine.world)).toHaveLength(0);
    expect(events(engine, 'opportunity.spawned')).toHaveLength(0);
  });
});

describe('anti-inert: the world systems fire on shipped content', () => {
  it('the boss phase listener transitions on real damage', () => {
    const engine = createGame(71);
    engine.submitAction('move', { targetIds: ['long-quay'] });
    engine.submitAction('move', { targetIds: ['customs-shed'] });
    engine.submitAction('move', { targetIds: ['audit-chamber'] });
    const boss = engine.world.entities['the-standing-account'];
    boss.resources.hp = Math.floor(boss.resources.maxHp * 0.7);

    engine.submitAction('attack', { targetIds: ['the-standing-account'] });

    expect(events(engine, 'boss.phase.transition').length).toBeGreaterThan(0);
    expect(boss.tags).toContain('foreclosing');
  });

  it('the authored hazards move real resources', () => {
    // tide-slick on the quay drains liquidity; no-recourse in the cellar adds
    // lien. A hazard whose condition never matches a zone's `hazards` array is
    // the classic silent no-op.
    const engine = createGame(71);
    const before = engine.world.entities.factor.resources.liquidity;
    engine.submitAction('move', { targetIds: ['long-quay'] });
    expect(engine.world.entities.factor.resources.liquidity).toBeLessThan(before);

    const lienBefore = engine.world.entities.factor.resources.lien;
    engine.submitAction('move', { targetIds: ['crooked-stair'] });
    engine.submitAction('move', { targetIds: ['unlit-cellar'] });
    expect(engine.world.entities.factor.resources.lien).toBeGreaterThan(lienBefore);
  });

  it('combat COSTS liquidity — the inverted resource profile is live', () => {
    // The pack's central claim about combat. The CombatResourceProfile has an
    // empty `gains` array, so if any row rewarded violence this would rise.
    const engine = createGame(71);
    engine.submitAction('move', { targetIds: ['long-quay'] });
    engine.submitAction('move', { targetIds: ['crooked-stair'] });
    engine.submitAction('move', { targetIds: ['unlit-cellar'] });
    const before = engine.world.entities.factor.resources.liquidity;

    engine.submitAction('attack', { targetIds: ['warren-cutpurse'] });

    expect(engine.world.entities.factor.resources.liquidity).toBeLessThan(before);
  });
});
