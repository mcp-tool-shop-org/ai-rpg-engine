/**
 * Composition Examples — compile + behavior proof
 *
 * The handbook (Chapter 57) and the root README both point readers at the
 * files in docs/examples as "runnable TypeScript examples". Nothing compiled
 * or ran them, so they drifted: a stale `targetId` comment, and combatants
 * that never set `zoneId`/`stamina` — which means a copied-out attack is
 * silently rejected ("target not in same zone" / "not enough stamina") and
 * the example looks like it does nothing.
 *
 * This test imports every example (so `vitest run` and the docs/examples
 * tsconfig both fail if an example stops type-checking) and drives a real
 * attack through the from-scratch game to prove the documented combat loop
 * actually resolves end to end.
 *
 * The mixed-party and shared-profiles blocks below are the flagship proof
 * for per-entity rule resolution (CR-1): every damage assertion pins the
 * exact stat each entity's OWN mapping reads, so they FAIL on an engine
 * that resolves one shared mapping for the whole fight.
 */

import { describe, it, expect } from 'vitest';
import { Engine } from '@ai-rpg-engine/core';
import type { ResolvedEvent } from '@ai-rpg-engine/core';
import { validateProfileSet } from '@ai-rpg-engine/modules';
import { createFromScratchGame } from './from-scratch.js';
import { createTundraWorld, createDesertWorld } from './cross-world.js';
import {
  createMixedPartyGame, createMixedPartyModules, RULE_PROFILES,
} from './mixed-party.js';
import {
  buildPartyProfiles, buildIroncladRival, createSharedProfilesWorld,
} from './shared-profiles.js';
import { createMultiEncounterGame } from './multi-encounter.js';

/** Pull the applied damage from an attack's events; throws (with a clear
 *  message) if the attack missed, so a stray miss surfaces as a named failure
 *  not a silent `undefined`. */
const damageOf = (events: ResolvedEvent[]): number => {
  const e = events.find((ev) => ev.type === 'combat.damage.applied');
  if (!e) throw new Error('attack did not land (no combat.damage.applied event)');
  return e.payload.damage as number;
};

describe('docs/examples — boot proof', () => {
  it('from-scratch boots with combat verbs registered', () => {
    const engine = createFromScratchGame(0);
    expect(engine.tick).toBe(0);
    expect(engine.getAvailableActions()).toContain('attack');
  });

  it('cross-world builds two worlds from one combat identity', () => {
    expect(createTundraWorld(1).tick).toBe(0);
    expect(createDesertWorld(2).tick).toBe(0);
  });

  it('mixed-party and multi-encounter boot', () => {
    expect(createMixedPartyGame(0).tick).toBe(0);
    expect(createMultiEncounterGame(0).tick).toBe(0);
  });
});

describe('docs/examples — from-scratch combat actually resolves', () => {
  it('a player attack against a co-located enemy is NOT rejected', () => {
    const engine = createFromScratchGame(0);

    // The exact call the from-scratch.ts footer documents.
    const events = engine.submitAction('attack', { targetIds: ['rat'] });

    // The bug this guards: if entities lack a matching zoneId, combat-core
    // rejects with 'target not in same zone'; if they lack stamina, it
    // rejects with 'not enough stamina'. Either way the attack no-ops.
    const rejected = events.find((e) => e.type === 'action.rejected');
    expect(rejected, `attack was rejected: ${rejected?.payload?.reason as string}`).toBeUndefined();

    // A resolved attack emits a hit or a miss against the rat.
    const contact = events.find(
      (e) => e.type.startsWith('combat.contact.') || e.type === 'combat.contact.miss',
    );
    expect(contact).toBeDefined();
  });

  it('placing the enemy in a different zone DOES get rejected (proves the zone gate is real)', () => {
    const engine = createFromScratchGame(0);
    // Move the rat out of the arena — combat must now refuse.
    engine.store.state.entities['rat'].zoneId = 'somewhere-else';

    const events = engine.submitAction('attack', { targetIds: ['rat'] });
    const rejected = events.find((e) => e.type === 'action.rejected');
    expect(rejected?.payload?.reason).toBe('target not in same zone');
  });
});

describe('docs/examples — mixed-party resolves per-entity (CR-1)', () => {
  it('fighter, mystic, and wolf deal 9 / 7 / 5 in one fight — each through its own mapping', () => {
    const engine = createMixedPartyGame(0);

    const fighterDmg = damageOf(engine.submitActionAs('fighter', 'attack', { targetIds: ['wolf'] }));
    const mysticDmg = damageOf(engine.submitActionAs('mystic', 'attack', { targetIds: ['wolf'] }));
    const wolfDmg = damageOf(engine.submitActionAs('wolf', 'attack', { targetIds: ['fighter'] }));

    // The load-bearing assertion: the mystic's damage derives from ITS
    // profile's attack stat (will = 7), NOT the shared-mapping fallback (3).
    // On a pre-CR-1 engine — one world mapping (attack → vigor) for every
    // combatant, and neither party member has a vigor stat — both party
    // attacks collapse to the fallback 3 and this test fails.
    expect(mysticDmg).toBe(7);
    expect(mysticDmg).not.toBe(3);

    // The fighter reads its own mapping too (might = 9)...
    expect(fighterDmg).toBe(9);
    // ...and the two playstyles are genuinely different in one fight.
    expect(fighterDmg).not.toBe(mysticDmg);

    // The wolf has NO ruleProfileId: it resolves through the world mapping
    // (attack → vigor = 5) — the unchanged back-compat path.
    expect(wolfDmg).toBe(5);
  });

  it('swapping the mystic onto the fighter profile collapses its damage to the fallback — the mapping drives resolution, not the statline', () => {
    const engine = createMixedPartyGame(0);
    // Same entity, same stats (will 7 untouched) — different profile id.
    engine.store.state.entities['mystic'].ruleProfileId = 'fighter';

    engine.submitActionAs('fighter', 'attack', { targetIds: ['wolf'] });
    const mysticDmg = damageOf(engine.submitActionAs('mystic', 'attack', { targetIds: ['wolf'] }));

    // Under the fighter profile the mystic reads attack → might, a stat it
    // does not have, so damage falls to the formula fallback (3). The raw
    // statline never changed — only the referenced mapping did.
    expect(mysticDmg).toBe(3);
  });

  it('without the profile registry the whole party collapses to the shared world mapping — the pre-CR-1 behavior the 9/7 assertions rule out', () => {
    const engine = createMixedPartyGame(0);
    // Un-register the profiles. Every ruleProfileId now resolves to nothing,
    // so each read falls back to the ONE world mapping (attack → vigor) —
    // exactly how a pre-CR-1 engine treated this scene.
    delete engine.store.state.ruleProfiles;

    const fighterDmg = damageOf(engine.submitActionAs('fighter', 'attack', { targetIds: ['wolf'] }));
    const mysticDmg = damageOf(engine.submitActionAs('mystic', 'attack', { targetIds: ['wolf'] }));

    // Neither party member has a vigor stat: both playstyles flatten to the
    // fallback 3. This is the fight the flagship test's 9 / 7 values are
    // impossible in — proof the per-entity assertions are load-bearing.
    expect(fighterDmg).toBe(3);
    expect(mysticDmg).toBe(3);
  });

  it('profiles are data — they serialize, deserialize, and replay byte-identically', () => {
    // Control: fighter then mystic, no save in between.
    const control = createMixedPartyGame(0);
    control.submitActionAs('fighter', 'attack', { targetIds: ['wolf'] });
    const controlEvt = control
      .submitActionAs('mystic', 'attack', { targetIds: ['wolf'] })
      .find((e) => e.type === 'combat.damage.applied')!;

    // Saved run: fighter, then SAVE → LOAD mid-fight, then mystic. Modules
    // are code, never serialized — the loader re-supplies the same set.
    const saved = createMixedPartyGame(0);
    saved.submitActionAs('fighter', 'attack', { targetIds: ['wolf'] });
    const restored = Engine.deserialize(saved.serialize(), { modules: createMixedPartyModules() });

    // The profile registry and the entity's profile reference rode the save.
    expect(restored.world.ruleProfiles).toEqual(RULE_PROFILES);
    expect(restored.world.entities['mystic'].ruleProfileId).toBe('mystic');

    const restoredEvt = restored
      .submitActionAs('mystic', 'attack', { targetIds: ['wolf'] })
      .find((e) => e.type === 'combat.damage.applied')!;

    // Post-load resolution still reads the mystic's own mapping (will = 7)…
    expect(restoredEvt.payload.damage).toBe(7);
    // …and is byte-identical to the never-saved control (damage AND event id).
    expect(restoredEvt.payload.damage).toBe(controlEvt.payload.damage);
    expect(restoredEvt.id).toBe(controlEvt.id);
  });
});

describe('docs/examples — shared-profiles: many playstyles, one world', () => {
  it('the party profiles build clean and validateProfileSet accepts the set', () => {
    const { bulwark, hexweaver, warnings } = buildPartyProfiles();
    // Per-profile validation: no unknown stats/resources, no suspicious abilities.
    expect(warnings).toEqual([]);

    // Cross-profile lint: no duplicate ability ids, no cap conflicts, no
    // stat-name drift (both map resolve → grit, the SAME dimension).
    const set = validateProfileSet([bulwark, hexweaver]);
    expect(set.ok).toBe(true);
    expect(set.errors).toEqual([]);
    expect(set.advisories).toEqual([]);
  });

  it('the set linter catches a cross-profile ability-id collision that per-profile validation cannot see', () => {
    const { bulwark } = buildPartyProfiles();
    const ironclad = buildIroncladRival();

    // Alone, the rival profile is perfectly valid…
    const aloneSet = validateProfileSet([ironclad]);
    expect(aloneSet.ok).toBe(true);

    // …but together with the bulwark it re-declares 'shield-rush'.
    const set = validateProfileSet([bulwark, ironclad]);
    expect(set.ok).toBe(false);
    expect(set.errors).toHaveLength(1);
    expect(set.errors[0].path).toBe('ProfileSet.abilities.shield-rush');
    expect(set.errors[0].message).toContain('bulwark, ironclad');
  });

  it('both profiles resolve per-entity in ONE world', () => {
    const engine = createSharedProfilesWorld(0);

    const wardenDmg = damageOf(engine.submitActionAs('warden', 'attack', { targetIds: ['golem'] }));
    const occultistDmg = damageOf(engine.submitActionAs('occultist', 'attack', { targetIds: ['golem'] }));

    // The warden reads bulwark (attack → might = 8), the occultist reads
    // hexweaver (attack → will = 6) — in the same world, off one formula
    // set. Neither has the world attack stat (mass), so on a pre-CR-1
    // engine both would deal the fallback 3.
    expect(wardenDmg).toBe(8);
    expect(occultistDmg).toBe(6);
    expect(wardenDmg).not.toBe(3);
    expect(occultistDmg).not.toBe(3);
    expect(wardenDmg).not.toBe(occultistDmg);
  });
});
