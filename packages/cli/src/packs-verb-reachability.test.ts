// PVR-1 — catalog-wide VERB REACHABILITY.
//
// The catalog already has a verb-honesty gate (every pack's own
// `content-truth.test.ts`): it proves an advertised verb resolves to a
// registered HANDLER, and that every registered handler is advertised. Both
// directions pass for a pack whose `recruit` can never succeed, because
// companion-core registers the handler unconditionally in every world — the
// gate that actually decides whether a player can recruit anyone lives in the
// pack's CONTENT (an entity tagged `recruitable` / `companion-ready`), and no
// suite in this repo looked there.
//
// So v2.9 fixed "five worlds shipped recruit with no one to recruit" by hand,
// catalog-wide, and v3.5.0 shipped an eleventh world with exactly the same
// defect — an advertised verb, a live handler, and zero valid targets anywhere
// in the world. A handler-level check cannot see that. This one can.
//
// SHAPE — outcome, not implementation. Each axis SUBMITS the verb through the
// real engine and asks whether any target in the booted world produces
// something other than `action.rejected`. It does not re-implement the gate
// (`isCompanionRecruitable`, the dialogue registry, the item catalog) in this
// file: a check that compares content against a literal in the test file is
// the vacuity mode that bit three validators in the v3.5.0 cycle. If the
// engine's rule for a valid target changes, this suite follows it for free.
//
// POSITIONING — `prepare` co-locates the player with the candidate before
// submitting. Zone separation and not-yet-carrying are legitimate GAMEPLAY
// gates: three packs (weird-west, colony, ronin) ship recruitable NPCs one
// zone away from the spawn tile, and a probe that ran at tick 0 without moving
// would have reported them dead alongside merchant. The question this suite
// asks is "can a player who walks over there reach a valid target," not "is
// one standing on the spawn tile."

import { describe, it, expect } from 'vitest';
import type { Engine, ResolvedEvent } from '@ai-rpg-engine/core';
import { allPacks, type PackInfo } from './packs.js';

/** Pinned — every probe in this file boots the same world (PIN_PER_STEP). */
const SEED = 71;

type ReachabilityAxis = {
  verb: string;
  /** What a valid target IS, in content terms — the thing a pack author must ship. */
  requires: string;
  /** Candidate target ids drawn from a booted world and the pack's content. */
  candidates: (engine: Engine, pack: PackInfo) => string[];
  /**
   * Put the player in a position where the verb COULD legally resolve, then
   * submit it. Each axis owns its own submission shape because the engine's
   * verbs do not share one: `use` reads the item from `toolId ?? targetIds[0]`
   * and passes `targetIds[0]` on to the item's effect as the thing being acted
   * UPON. An earlier draft submitted the item id as the only target, which made
   * every target-taking item (cyberpunk's ice-breaker hacks a specified entity)
   * look inert — the effect got the item's own id, found no such entity, and
   * bailed. Zone separation and not-yet-carrying are gameplay gates, not
   * content defects, so this also walks the player over and hands them the item.
   */
  attempt: (engine: Engine, candidateId: string) => ResolvedEvent[];
  /**
   * Did the submission actually reach a valid target?
   *
   * Defaults to "the engine did not reject it", which is right for verbs that
   * reject an invalid target outright. It is NOT right for every verb, and the
   * negative controls below are what forced this field to exist: `use` accepts
   * ANY id sitting in the player's inventory — `useHandler` looks the item up
   * in its effect map, gets nothing, and still emits `item.used` and consumes
   * it. Absence-of-rejection there means "the player was holding a string",
   * not "the world contains a usable item", so that axis supplies its own
   * stricter reading. A default that silently fits nine cases and lies about
   * the tenth is the vacuity this suite exists to prevent.
   */
  accepted?: (events: ResolvedEvent[]) => boolean;
};

function otherEntityIds(engine: Engine): string[] {
  return Object.values(engine.world.entities)
    .filter((e) => e.id !== engine.world.playerId)
    .map((e) => e.id);
}

/** Walk the player to the candidate — co-location is a gameplay gate. */
function coLocate(engine: Engine, candidateId: string): void {
  const target = engine.world.entities[candidateId];
  const player = engine.world.entities[engine.world.playerId];
  if (target?.zoneId) player.zoneId = target.zoneId;
}

/** Submit `verb` against an entity the player has walked over to. */
function againstEntity(verb: string) {
  return (engine: Engine, candidateId: string): ResolvedEvent[] => {
    coLocate(engine, candidateId);
    return engine.submitAction(verb, { targetIds: [candidateId] });
  };
}

const AXES: ReachabilityAxis[] = [
  {
    verb: 'recruit',
    requires: 'an entity tagged `recruitable` or `companion-ready`',
    candidates: otherEntityIds,
    attempt: againstEntity('recruit'),
  },
  {
    verb: 'speak',
    requires: 'an entity some authored dialogue names as a speaker',
    candidates: otherEntityIds,
    attempt: againstEntity('speak'),
  },
  {
    verb: 'use',
    requires: 'an item whose definition carries a usable effect (not merely a carried id)',
    // The pack's DEFINED items, not the ones it happens to place at boot. An
    // earlier draft of this axis scanned starting inventories and zone
    // interactables, and reported eight healthy packs dead: every one of their
    // usable items is acquired in play, so none was present at tick 0. That
    // draft was measuring placement and calling it usability.
    candidates: (_engine, pack) => pack.itemCatalog.items.map((i) => i.id),
    attempt: (engine, itemId) => {
      const player = engine.world.entities[engine.world.playerId];
      // Holding it is a gameplay gate — acquisition is a different axis.
      if (!(player.inventory ?? []).includes(itemId)) {
        player.inventory = [...(player.inventory ?? []), itemId];
      }
      // Item in `toolId`; a co-located entity in `targetIds` for the effects
      // that act on something (self-targeting effects simply ignore it).
      const subject = otherEntityIds(engine).find(
        (id) => engine.world.entities[id]?.zoneId === player.zoneId,
      );
      return engine.submitAction('use', {
        toolId: itemId,
        targetIds: subject ? [subject] : [],
      });
    },
    // `item.used` alone proves only that the player was holding something.
    // A real usable item also produces the events its effect emits, so that
    // is what this axis requires: at least one item in the world that DOES
    // something when used.
    accepted: (events) =>
      !events.some((e) => e.type === 'action.rejected') &&
      events.some((e) => e.type !== 'item.used'),
  },
];

type ProbeResult = { reachable: boolean; candidates: number; firstRejection: string };

/** Submit `axis.verb` against each candidate in a FRESH world until one is
 *  accepted. Fresh per candidate so a partially-applied earlier attempt cannot
 *  make a later one look reachable (or unreachable). */
function probe(pack: PackInfo, axis: ReachabilityAxis, mutate?: (engine: Engine) => string[]): ProbeResult {
  const boot = pack.createGame(SEED);
  const candidates = mutate ? mutate(boot) : axis.candidates(boot, pack);
  let firstRejection = '';

  for (const candidateId of candidates) {
    const engine = pack.createGame(SEED);
    if (mutate) mutate(engine);
    const events = axis.attempt(engine, candidateId);
    const accepted = axis.accepted
      ? axis.accepted(events)
      : !events.some((e) => e.type === 'action.rejected');
    if (accepted) return { reachable: true, candidates: candidates.length, firstRejection: '' };
    if (!firstRejection) {
      const rejection = events.find((e) => e.type === 'action.rejected');
      firstRejection = rejection
        ? String(rejection.payload?.reason ?? 'no reason given')
        : `resolved but inertly (${events.map((e) => e.type).join(', ') || 'no events'})`;
    }
  }
  return { reachable: false, candidates: candidates.length, firstRejection };
}

describe('verb reachability × real catalog (PVR-1)', () => {
  for (const pack of allPacks) {
    const advertised = new Set(pack.ruleset.verbs.map((v) => v.id));
    for (const axis of AXES) {
      // An unadvertised verb is verb-honesty's business, not reachability's.
      if (!advertised.has(axis.verb)) continue;

      it(`${pack.meta.id}: \`${axis.verb}\` has at least one reachable target`, () => {
        const result = probe(pack, axis);
        expect(
          result.reachable,
          `${pack.meta.id} advertises \`${axis.verb}\` but no target in the booted world accepts it.\n` +
            `  needs: ${axis.requires}\n` +
            `  tried: ${result.candidates} candidate(s)\n` +
            `  engine said: "${result.firstRejection}"`,
        ).toBe(true);
      });
    }
  }
});

// --- Mutation meta-tests -------------------------------------------------
//
// Every predicate above ships with a committed proof that it can FAIL. Three
// validators written in the v3.5.0 cycle were vacuous on first draft — one
// skipped exactly the malformed input it existed to catch — so "the check
// passes" is not evidence the check works.

describe('meta: the reachability probe can fail (PVR-1 negative controls)', () => {
  // A pack that PASSES every axis, so a red result below is caused by the
  // mutation and nothing else.
  const control = allPacks.find((p) => p.meta.id === 'black-flag-requiem')!;

  for (const axis of AXES) {
    it(`\`${axis.verb}\`: an entity with no supporting content is NOT reachable`, () => {
      // Inject a target that satisfies nothing: no recruitable tag, named by no
      // dialogue, defined by no item catalog. Probing ONLY it must go red.
      const injected = '__pvr_probe_target';
      const result = probe(control, axis, (engine) => {
        const player = engine.world.entities[engine.world.playerId];
        engine.world.entities[injected] = {
          id: injected,
          blueprintId: injected,
          type: 'npc',
          name: 'Audit Probe Target',
          tags: [],
          stats: {},
          resources: {},
          statuses: [],
          inventory: [],
          zoneId: player.zoneId,
        };
        return [injected];
      });
      expect(
        result.reachable,
        `the \`${axis.verb}\` probe accepted a target with no supporting content — it cannot detect a dead verb`,
      ).toBe(false);
    });
  }

  it('`recruit`: stripping the recruitable tags kills a pack that passes', () => {
    // The exact historical defect, reproduced on a pack that is currently
    // healthy: v2.9 found five worlds in this state, v3.5.0 shipped a sixth.
    const result = probe(control, AXES[0], (engine) => {
      const ids: string[] = [];
      for (const entity of Object.values(engine.world.entities)) {
        if (entity.id === engine.world.playerId) continue;
        entity.tags = entity.tags.filter((t) => t !== 'recruitable' && t !== 'companion-ready');
        ids.push(entity.id);
      }
      return ids;
    });
    expect(
      result.reachable,
      'recruit stayed reachable with every recruitable tag stripped — the probe is not reading the content gate',
    ).toBe(false);
  });
});
