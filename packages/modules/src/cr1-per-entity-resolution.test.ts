// CR-1 — per-entity rule resolution (the marquee mixed-playstyle proof).
//
// A `might` fighter (attack → brawn) and a `will` mystic (attack → psyche)
// resolve combat in ONE fight, each reading its OWN stat mapping. The SAME
// formula set yields different-but-correct damage purely from the data each
// entity reads — no per-archetype formula duplication (feature-architecture §C,
// finding 1: Source-vs-Target stat resolution).
//
// This file is the acceptance criterion for the slice. Design lock:
//   - RuleProfile is DATA (statMapping), referenced by id, serialized with state.
//   - Fallback chain is `entity profile → world/passed mapping → DEFAULT`, so an
//     entity with no ruleProfileId is byte-identical to today, and custom-mapping
//     starters (e.g. weird-west attack→grit) keep working (the world mapping is
//     the fallback, NOT a bare DEFAULT_STAT_MAPPING).
//   - Both stat-read paths are covered: the built-in `defaultDamage`/`getStat`
//     path AND the pluggable `buildCombatStack` closure path (every shipped
//     starter uses the latter — the inertness trap).

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestEngine, Engine } from '@ai-rpg-engine/core';
import type { EntityState, ResolvedEvent, RuleProfile } from '@ai-rpg-engine/core';
import { createCombatCore } from './combat-core.js';
import type { CombatStatMapping } from './combat-core.js';
import { statusCore } from './status-core.js';
import { buildCombatStack } from './combat-builders.js';
import { clearStatusRegistry } from './status-semantics.js';

// --- shared fixtures -------------------------------------------------------

/** might: attack derives from brawn; will: attack derives from psyche. Both map
 *  precision → reflex so a high reflex guarantees the deterministic hit roll
 *  lands regardless of which profile is active. */
const MIGHT: RuleProfile = { statMapping: { attack: 'brawn', precision: 'reflex', resolve: 'grit' } };
const WILL: RuleProfile = { statMapping: { attack: 'psyche', precision: 'reflex', resolve: 'calm' } };

const ZONE = { id: 'z', roomId: 'r', name: 'Z', tags: [], neighbors: [] };

const makeEntity = (id: string, overrides: Partial<EntityState> = {}): EntityState => ({
  id,
  blueprintId: id,
  type: 'enemy',
  name: id,
  tags: ['enemy'],
  stats: {},
  resources: { hp: 100, maxHp: 100, stamina: 5 },
  statuses: [],
  zoneId: 'z',
  ...overrides,
});

/** Pull the applied damage from an attack's events; throws (with a clear message)
 *  if the attack missed, so a stray miss surfaces as a named failure not a silent
 *  `undefined`. */
const damageOf = (events: ResolvedEvent[]): number => {
  const e = events.find((ev) => ev.type === 'combat.damage.applied');
  if (!e) throw new Error('attack did not land (no combat.damage.applied event)');
  return e.payload.damage as number;
};

beforeEach(() => {
  clearStatusRegistry();
});

describe('CR-1 per-entity rule resolution', () => {
  // -------------------------------------------------------------------------
  // Case 1 — the marquee proof, built-in formula path (createCombatCore()).
  // Two attackers, different mappings, one foe, one fight. The mystic's
  // damage derives from `will`→psyche (7), NOT the fallback vigor (3).
  // -------------------------------------------------------------------------
  it('a might fighter and a will mystic deal different-but-correct damage in one fight', () => {
    const fighter = makeEntity('fighter', {
      ruleProfileId: 'might',
      // brawn 9 (might attack) vs vigor 3 (the DEFAULT/world fallback attack)
      stats: { brawn: 9, psyche: 1, reflex: 50, vigor: 3, instinct: 50, will: 0 },
    });
    const mystic = makeEntity('mystic', {
      ruleProfileId: 'will',
      // psyche 7 (will attack) vs vigor 3 (fallback attack) — the distinguishing datum
      stats: { brawn: 1, psyche: 7, reflex: 50, vigor: 3, instinct: 50, will: 0 },
    });
    const foe = makeEntity('foe', { stats: { vigor: 0, instinct: 0, will: 0 } });

    const engine = createTestEngine({
      modules: [statusCore, createCombatCore()],
      entities: [fighter, mystic, foe],
      zones: [ZONE],
      playerId: 'fighter',
    });
    engine.store.state.ruleProfiles = { might: MIGHT, will: WILL };

    const fighterDmg = damageOf(engine.submitActionAs('fighter', 'attack', { targetIds: ['foe'] }));
    const mysticDmg = damageOf(engine.submitActionAs('mystic', 'attack', { targetIds: ['foe'] }));

    // Same formula, per-entity data: fighter reads attack→brawn, mystic reads attack→psyche.
    expect(fighterDmg).toBe(9);
    expect(mysticDmg).toBe(7);
    // The mystic did NOT fall through to the world mapping (vigor 3) — this is the
    // whole point: it resolved its OWN profile.
    expect(mysticDmg).not.toBe(3);
    expect(fighterDmg).not.toBe(mysticDmg);
  });

  // -------------------------------------------------------------------------
  // Case 2 — the SAME proof through the buildCombatStack closure path (Change B).
  // Every shipped starter wires combat via buildCombatStack, whose formula
  // closures read raw stats through one closed-over world mapping. Without
  // routing them through resolveEntityMapping the feature is INERT in every real
  // game (both attackers would read the world attack stat `edge`=2). This case
  // is the inertness trap.
  // -------------------------------------------------------------------------
  it('per-entity resolution also holds through the buildCombatStack path (Change B — inertness trap)', () => {
    const WORLD_MAPPING: CombatStatMapping = { attack: 'edge', precision: 'reflex', resolve: 'lore' };

    const fighter = makeEntity('fighter', {
      ruleProfileId: 'might',
      stats: { brawn: 9, edge: 2, reflex: 50, lore: 0 },
    });
    const mystic = makeEntity('mystic', {
      ruleProfileId: 'will',
      stats: { psyche: 7, edge: 2, reflex: 50, lore: 0 },
    });
    const foe = makeEntity('foe', { stats: { edge: 0, reflex: 0, lore: 0 } });

    const combat = buildCombatStack({ statMapping: WORLD_MAPPING, playerId: 'fighter' });
    const engine = createTestEngine({
      modules: [statusCore, ...combat.modules],
      entities: [fighter, mystic, foe],
      zones: [ZONE],
      playerId: 'fighter',
    });
    engine.store.state.ruleProfiles = { might: MIGHT, will: WILL };

    const fighterDmg = damageOf(engine.submitActionAs('fighter', 'attack', { targetIds: ['foe'] }));
    const mysticDmg = damageOf(engine.submitActionAs('mystic', 'attack', { targetIds: ['foe'] }));

    expect(fighterDmg).toBe(9); // buildCombatFormulas.damage resolved might→brawn
    expect(mysticDmg).toBe(7);  // ...and will→psyche, not the world attack stat
    // The inertness assertion: without Change B both would read edge=2.
    expect(fighterDmg).not.toBe(2);
    expect(mysticDmg).not.toBe(2);
  });

  // -------------------------------------------------------------------------
  // Case 3 — target-side resolution. A might attacker vs a will target: the
  // attacker reads its attack (brawn), the target's guard reduction reads the
  // TARGET's resolve mapping (calm), within one strike (Source-vs-Target split).
  // -------------------------------------------------------------------------
  it('target-side stats resolve through the target profile (guard reduction reads the target mapping)', () => {
    const striker = makeEntity('striker', {
      ruleProfileId: 'might',
      // brawn 9 == vigor 9 so the ATTACKER damage is 9 regardless of resolution;
      // this isolates the change to the TARGET side.
      stats: { brawn: 9, vigor: 9, reflex: 50, instinct: 50 },
    });
    const ward = makeEntity('ward', {
      ruleProfileId: 'will',
      // resolve → calm 20 (huge guard bonus) vs the fallback will 3 (small bonus)
      stats: { calm: 20, will: 3, reflex: 0, instinct: 0 },
    });

    const engine = createTestEngine({
      modules: [statusCore, createCombatCore()],
      entities: [striker, ward],
      zones: [ZONE],
      playerId: 'striker',
    });
    engine.store.state.ruleProfiles = { might: MIGHT, will: WILL };

    engine.submitActionAs('ward', 'guard');
    const events = engine.submitActionAs('striker', 'attack', { targetIds: ['ward'] });

    const absorbed = events.find((e) => e.type === 'combat.guard.absorbed');
    expect(absorbed, 'guarded strike should emit combat.guard.absorbed').toBeTruthy();
    // reduction = min(0.75, 0.5 + (calm 20 − 3)*0.03) = 0.75 → floor(9 * 0.25) = 2.
    // If the target's resolve had fallen through to will=3, reduction would be 0.5
    // → reducedDamage 4. The value 2 proves the target read `calm` via ITS mapping.
    expect(absorbed!.payload.originalDamage).toBe(9);
    expect(absorbed!.payload.reducedDamage).toBe(2);
    expect(absorbed!.payload.reducedDamage).not.toBe(4);
  });

  // -------------------------------------------------------------------------
  // Case 4 — back-compat. An entity with NO ruleProfileId in a CUSTOM-mapping
  // world reads through the WORLD mapping (grit), not a bare DEFAULT_STAT_MAPPING
  // (vigor). This guards the HIGH risk from the build plan: a literal DEFAULT
  // fallback would silently break every custom-mapping starter.
  // -------------------------------------------------------------------------
  it('an entity with no ruleProfileId resolves through the world mapping (not bare DEFAULT)', () => {
    const CUSTOM: CombatStatMapping = { attack: 'grit', precision: 'reflex', resolve: 'lore' };
    const plain = makeEntity('plain', {
      // grit 6 = the custom world attack; vigor 99 = what a bare-DEFAULT bug would read
      stats: { grit: 6, vigor: 99, reflex: 50 },
    });
    const foe = makeEntity('foe', { stats: { grit: 0, reflex: 0, lore: 0 } });

    const engine = createTestEngine({
      // custom statMapping, no formula closures → default path with CUSTOM as the world mapping
      modules: [statusCore, createCombatCore({ statMapping: CUSTOM })],
      entities: [plain, foe],
      zones: [ZONE],
      playerId: 'plain',
      // seed 0 = the legacy stream where this probe attack lands (F-SEED).
      seed: 0,
    });
    // No ruleProfiles registered — pure back-compat world.

    const dmg = damageOf(engine.submitActionAs('plain', 'attack', { targetIds: ['foe'] }));
    expect(dmg).toBe(6);   // read grit via the world mapping
    expect(dmg).not.toBe(99); // did NOT fall through to bare DEFAULT (vigor)
  });

  // -------------------------------------------------------------------------
  // Case 5 — determinism across serialize→deserialize mid-fight. Profiles are
  // data: they must survive the PC-2 deserialize + PC-1 module rebind path and
  // still resolve to byte-identical damage + event ids. Control (no save) vs
  // save-mid-fight must be identical.
  // -------------------------------------------------------------------------
  it('rule profiles survive serialize/deserialize mid-fight with byte-identical resolution', () => {
    const build = () => {
      const fighter = makeEntity('fighter', {
        ruleProfileId: 'might',
        stats: { brawn: 9, psyche: 1, reflex: 50, vigor: 3, instinct: 50 },
      });
      const mystic = makeEntity('mystic', {
        ruleProfileId: 'will',
        stats: { brawn: 1, psyche: 7, reflex: 50, vigor: 3, instinct: 50 },
      });
      const foe = makeEntity('foe', { stats: { vigor: 0, instinct: 0, will: 0 } });
      const engine = createTestEngine({
        modules: [statusCore, createCombatCore()],
        entities: [fighter, mystic, foe],
        zones: [ZONE],
        playerId: 'fighter',
      });
      engine.store.state.ruleProfiles = { might: MIGHT, will: WILL };
      return engine;
    };

    // Control: fighter then mystic, no serialization.
    const control = build();
    control.submitActionAs('fighter', 'attack', { targetIds: ['foe'] });
    const controlMystic = control.submitActionAs('mystic', 'attack', { targetIds: ['foe'] });
    const controlEvt = controlMystic.find((e) => e.type === 'combat.damage.applied')!;

    // Saved: fighter, then SAVE→LOAD mid-fight, then mystic.
    const saved = build();
    saved.submitActionAs('fighter', 'attack', { targetIds: ['foe'] });
    const blob = saved.serialize();
    const restored = Engine.deserialize(blob, { modules: [statusCore, createCombatCore()] });

    // Profiles are data — they rode along the save.
    expect(restored.world.ruleProfiles).toEqual({ might: MIGHT, will: WILL });
    expect(restored.world.entities.mystic.ruleProfileId).toBe('will');

    const restoredMystic = restored.submitActionAs('mystic', 'attack', { targetIds: ['foe'] });
    const restoredEvt = restoredMystic.find((e) => e.type === 'combat.damage.applied')!;

    // Post-load resolution is correct (will→psyche 7)...
    expect(restoredEvt.payload.damage).toBe(7);
    // ...and byte-identical to the never-saved control (damage AND event id).
    expect(restoredEvt.payload.damage).toBe(controlEvt.payload.damage);
    expect(restoredEvt.id).toBe(controlEvt.id);
  });
});
