// T0-verb-honesty-content — the help table and the registered handlers agree.
//
// Both directions matter, and the catalog has been bitten by each:
//   - advertising a verb with no handler (colony shipped `scan`/`allocate` as
//     flavour rows that rejected on use)
//   - registering a verb the help table never mentions (V3R-MENU-3b: 21 leverage
//     verbs were reachable by free text but untaught, so no player found them)
//
// This is the first test in the pack that needs a live engine, so it is also the
// first that can catch a wiring mistake in setup.ts.

import { describe, it, expect } from 'vitest';
import { createGame, merchantIntentProfiles } from './setup.js';
import { merchantMinimalRuleset } from './ruleset.js';
import { buildCatalog, itemCatalog, player } from './content.js';

/** Engine-internal verbs no pack advertises: per-tick drivers plus the two
 *  menu-driven surfaces (progression's `unlock`, opportunity-core's
 *  `opportunity`), which players reach through their own screens rather than by
 *  typing. Every other starter omits exactly these. */
const INTERNAL = new Set([
  'cognition-tick', 'environment-tick', 'faction-tick', 'district-tick',
  'unlock', 'opportunity',
]);

describe('T0-verb-honesty-content', () => {
  it('every advertised verb resolves to a registered handler', () => {
    const registered = new Set(createGame(71).getAvailableActions());
    for (const verb of merchantMinimalRuleset.verbs) {
      expect(registered.has(verb.id), `help advertises unregistered verb '${verb.id}'`).toBe(true);
    }
  });

  it('every registered player-facing verb appears in the help table', () => {
    const helped = new Set(merchantMinimalRuleset.verbs.map((v) => v.id));
    const registered = createGame(71).getAvailableActions();
    const untaught = registered.filter((v) => !helped.has(v) && !INTERNAL.has(v));
    expect(untaught, 'these verbs work but no player can discover them').toEqual([]);
  });

  it('buy and sell are taught — this is a trade pack', () => {
    // Most starters leave the world-stack trade verbs off the help table. That
    // is defensible for a gladiator and indefensible here.
    const helped = new Set(merchantMinimalRuleset.verbs.map((v) => v.id));
    expect(helped.has('buy')).toBe(true);
    expect(helped.has('sell')).toBe(true);
  });

  it('the five commerce verbs resolve through the real engine', () => {
    const registered = new Set(createGame(71).getAvailableActions());
    for (const verb of ['appraise', 'haggle', 'consign', 'underwrite', 'audit']) {
      expect(registered.has(verb), `contract-core did not register '${verb}'`).toBe(true);
    }
  });

  it('creation archetypes and disciplines grant no unregistered verb', () => {
    const registered = new Set(createGame(71).getAvailableActions());
    for (const a of buildCatalog.archetypes) {
      for (const v of a.grantedVerbs ?? []) {
        expect(registered.has(v), `archetype '${a.id}' grants unregistered '${v}'`).toBe(true);
      }
    }
    for (const d of buildCatalog.disciplines) {
      if (d.grantedVerb) {
        expect(registered.has(d.grantedVerb), `discipline '${d.id}' grants unregistered '${d.grantedVerb}'`).toBe(true);
      }
    }
  });

  it('item-granted verbs resolve too — the seal and the book are real affordances', () => {
    const registered = new Set(createGame(71).getAvailableActions());
    for (const item of itemCatalog.items) {
      for (const v of item.grantedVerbs ?? []) {
        expect(registered.has(v), `item '${item.id}' grants unregistered '${v}'`).toBe(true);
      }
    }
  });
});

describe('the wired game matches the authored content', () => {
  it('boots with the authored player in the authored start zone', () => {
    const engine = createGame(71);
    expect(engine.world.playerId).toBe('factor');
    expect(engine.world.entities.factor).toBeDefined();
    expect(engine.world.entities.factor.zoneId).toBe(player.zoneId);
  });

  it('every authored entity reaches the world', () => {
    const engine = createGame(71);
    for (const id of [
      'factor', 'assay-master-corvane', 'harbourmaster-drell', 'broker-inaya',
      'exchequer-null', 'collections-enforcer', 'warren-cutpurse', 'bonded-clerk-thrall', 'the-standing-account',
    ]) {
      expect(engine.world.entities[id], `entity '${id}' missing from the wired world`).toBeDefined();
    }
  });

  it('every hostile’s declared ai.profileId has a supplied intent profile', () => {
    // With an unresolved profile id an enemy never resolves an intent and simply
    // never acts — a fight that silently does nothing, which no combat assertion
    // would necessarily catch.
    //
    // The supplied set is read from `merchantIntentProfiles` — the ACTUAL array
    // setup.ts hands to the cognition config. An earlier draft of this test built
    // that set from a hardcoded literal, which meant it compared the content's
    // declarations against a list in the test file rather than against the wiring:
    // deleting a profile from setup.ts would have left it green.
    const engine = createGame(71);
    const supplied = new Set(merchantIntentProfiles.map((p) => p.id));
    expect(supplied.size).toBeGreaterThan(0);

    for (const id of ['collections-enforcer', 'warren-cutpurse', 'bonded-clerk-thrall', 'the-standing-account']) {
      const declared = engine.world.entities[id]?.ai?.profileId;
      expect(declared, `'${id}' declares no ai.profileId`).toBeTruthy();
      expect(supplied.has(String(declared)), `'${id}' declares unsupplied profile '${declared}'`).toBe(true);
    }
  });

  it('same-seed boots are byte-identical', () => {
    expect(createGame(71).serialize()).toBe(createGame(71).serialize());
  });
});
