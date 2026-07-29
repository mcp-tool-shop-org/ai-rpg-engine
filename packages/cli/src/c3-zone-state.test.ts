// c3-zone-state.test.ts — C3/P4's proof: A SHOCK RE-DRESSES THE TOWN.
//
// The fourth and last noun in C4's sentence, and the one the charter calls the
// moat (§4 Pillar 2):
//
//   "districts, rosters, living economies, pursuit, and persistent consequences
//    are exactly what the genre's most-loved towns are made of — and no exemplar
//    simulates them. Zone-state versioning is the bridge that lets five cycles of
//    invisible depth become VISIBLE life: the town that really changes because the
//    economy really moved."
//
// So the test is not "the field exists" or "the enum has five members". It is:
// move something the engine ALREADY simulates, and watch a zone the FORGE authored
// change what a client would render — end to end, through the sidecar's own
// event contract.

import { describe, it, expect } from 'vitest';
import { applyContentPack, loadContentFromFile, type ContentPack } from '@ai-rpg-engine/content-schema';
import {
  createStandardChannels,
  runZoneStateStep,
  getZoneCondition,
  deriveZoneConditionWithReason,
  resolveSceneDescriptor,
  variantTagsFor,
  modifyDistrictMetric,
  getDistrictForZone,
  ZONE_CONDITIONS,
  ZONE_STATE_THRESHOLDS,
} from '@ai-rpg-engine/modules';
import { toWireEvent } from '@ai-rpg-engine/sidecar';
import type { Engine } from '@ai-rpg-engine/core';
import { allPacks, type PackInfo } from './packs.js';
import { FIXTURE_PACK_PATH } from './c0/fixture-path.js';

const SEED = 71;
const HOST_PACK_ID = 'chapel-threshold';
/** The forge-authored zone we shock, and the district it belongs to. */
const TOWN_ZONE = 'zone-surface-yard';

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

// ── The descriptor crossed, and it carries only what it should ─────────────

describe('C3/P4 — the scene descriptor reaches the runtime', () => {
  const engine = bootWithExport();

  it('the forge-authored descriptor is on the ZoneState', () => {
    for (const zoneId of ['zone-surface-yard', 'zone-under-vault', 'zone-sky-gantry']) {
      const scene = engine.world.zones[zoneId].scene;
      expect(scene, `zone ${zoneId} must carry a descriptor`).toBeDefined();
      expect(typeof scene!.timeOfDay).toBe('string');
      expect(['sparse', 'normal', 'dense']).toContain(scene!.dressingDensity);
    }
    // `timeOfDay` is the field C0 filed `no-channel` while noting the grammar had a
    // `time:` operand "the engine could gate on". Both halves closed by one field.
    expect(engine.world.zones[TOWN_ZONE].scene!.timeOfDay).toBe('dusk');
  });

  it('and it carries NO layout — the constraint, asserted rather than trusted', () => {
    // Triangle Strategy's rule: state flags swap lighting and dressing variants,
    // NEVER layout. The vocabulary is supposed to make that impossible, so this
    // checks the vocabulary rather than the intent — a future field that broke the
    // rule would fail here.
    const forbidden = [
      'gridX', 'gridY', 'gridWidth', 'gridHeight', 'elevation', 'collisionType',
      'parallaxLayers', 'skylineRef', 'physicsMode', 'gravityOverride',
      'skyAtmosphereRef', 'directionalLightYaw',
    ];
    for (const zone of Object.values(engine.world.zones)) {
      if (!zone.scene) continue;
      for (const key of Object.keys(zone.scene)) {
        expect(forbidden, `scene must not carry layout key "${key}"`).not.toContain(key);
      }
    }
  });

  it('resolveSceneDescriptor MERGES the authored keys with the state-derived ones', () => {
    // What a client actually reads. Authored and derived arrive in one object, so
    // the client never has to know which came from where — and they cannot drift,
    // because the derived half is not stored beside the authored half.
    const resolved = resolveSceneDescriptor(engine.world, TOWN_ZONE)!;
    expect(resolved.timeOfDay).toBe('dusk');       // authored
    expect(resolved.condition).toBe('intact');     // derived
    expect(resolved.variantTags).toContain('dressing:intact'); // derived
  });
});

// ── THE SHOCK ──────────────────────────────────────────────────────────────

describe('C3/P4 — A SHOCK RE-DRESSES THE TOWN (the moat bridge)', () => {
  it('an economy/stability shock flips zone state and changes what the client renders', () => {
    const engine = bootWithExport();
    const districtId = getDistrictForZone(engine.world, TOWN_ZONE)!;
    expect(districtId, 'the forge-authored zone must belong to a district').toBe('district-harbourside');

    // Baseline: prime the ledger, then confirm the town is intact and nothing fired.
    runZoneStateStep(engine);
    expect(getZoneCondition(engine.world, TOWN_ZONE)).toBe('intact');
    const beforeDressing = resolveSceneDescriptor(engine.world, TOWN_ZONE)!.variantTags;
    expect(beforeDressing).toContain('dressing:intact');

    // ── THE SHOCK. Not a poke at a zone field: a move in the DISTRICT layer that
    // five cycles of work already simulate. `modifyDistrictMetric` is
    // district-core's own mutator, the same one defeat-fallout and the world tick
    // use, so this is the shape a real consequence has.
    //
    // Expressed as a DROP, because condition derives from movement away from the
    // district's own baseline rather than from an absolute cut-off — see
    // ZONE_STATE_THRESHOLDS for the measurement that forced that. The baseline was
    // captured by the priming step above, which is why the order matters.
    modifyDistrictMetric(engine.world, districtId, 'stability', -ZONE_STATE_THRESHOLDS.damagedStabilityDrop);

    const before = engine.world.eventLog.length;
    const changes = runZoneStateStep(engine);

    // ── THE RE-DRESS.
    expect(changes.length, 'the shock must have moved at least one zone').toBeGreaterThan(0);
    const change = changes.find((c) => c.zoneId === TOWN_ZONE)!;
    expect(change, `${TOWN_ZONE} must have changed`).toBeDefined();
    expect(change.from).toBe('intact');
    expect(change.to).toBe('damaged');
    // The CAUSE is named — a state change with no cause is a mystery a player
    // reads as a bug.
    expect(change.cause).toContain('stability');

    expect(getZoneCondition(engine.world, TOWN_ZONE)).toBe('damaged');
    const afterDressing = resolveSceneDescriptor(engine.world, TOWN_ZONE)!.variantTags;
    expect(afterDressing).not.toEqual(beforeDressing);
    expect(afterDressing).toContain('dressing:damaged');
    expect(afterDressing).toContain('props:rubble');

    // …and the AUTHORED half is untouched. The state swapped the DRESSING, not the
    // scene — which is the whole constraint.
    expect(resolveSceneDescriptor(engine.world, TOWN_ZONE)!.timeOfDay).toBe('dusk');

    // ── THROUGH THE SIDECAR. The event rides the existing wire contract with no
    // sidecar change — additive event types on a contract C1 already proved
    // byte-identical across a process boundary. Serialising it here is the check
    // that a client would receive the re-dress, not just that the sim recorded it.
    const emitted = engine.world.eventLog.slice(before).find((e) => e.type === 'world.zone.state.changed');
    expect(emitted, 'the change must be emitted, not only returned').toBeDefined();
    const wire = toWireEvent(emitted!);
    expect(wire.type).toBe('world.zone.state.changed');
    const payload = wire.payload as { zoneId: string; from: string; to: string; variantTags: string[] };
    expect(payload.zoneId).toBe(TOWN_ZONE);
    expect(payload.from).toBe('intact');
    expect(payload.to).toBe('damaged');
    expect(payload.variantTags).toContain('dressing:damaged');
  });

  it('RED: a shock too SMALL to cross a threshold emits NOTHING', () => {
    // ⚠ THE CONTROL THAT MAKES THE ABOVE A STATE RATHER THAN A ROUNDED SCALAR. A
    // condition that flips on every point of drift is not a state, and a client
    // re-dressing a town every round is worse than one that never re-dresses.
    const engine = bootWithExport();
    const districtId = getDistrictForZone(engine.world, TOWN_ZONE)!;
    runZoneStateStep(engine);

    const before = engine.world.eventLog.length;
    modifyDistrictMetric(engine.world, districtId, 'stability', -5); // 45 → 40, still > 25
    const changes = runZoneStateStep(engine);

    expect(changes).toEqual([]);
    expect(getZoneCondition(engine.world, TOWN_ZONE)).toBe('intact');
    expect(engine.world.eventLog.slice(before).filter((e) => e.type === 'world.zone.state.changed')).toEqual([]);
  });

  it('RED: re-running the step with NO change emits nothing (idempotent)', () => {
    // A step that re-emits on every call would flood the wire and make the
    // "changed" event meaningless.
    const engine = bootWithExport();
    const districtId = getDistrictForZone(engine.world, TOWN_ZONE)!;
    runZoneStateStep(engine);
    modifyDistrictMetric(engine.world, districtId, 'stability', -40);
    expect(runZoneStateStep(engine).length).toBeGreaterThan(0);
    // Second and third passes: same state, no events.
    expect(runZoneStateStep(engine)).toEqual([]);
    expect(runZoneStateStep(engine)).toEqual([]);
  });

  it('the derivation is severity-ORDERED — a ruined zone is never merely strained', () => {
    const engine = bootWithExport();
    const districtId = getDistrictForZone(engine.world, TOWN_ZONE)!;
    // Prime FIRST so the baseline is the unshocked state. Deliberately explicit:
    // baselines are captured at first observation, so shocking before observing
    // would record the shocked value as normal — a real footgun, tested below.
    runZoneStateStep(engine);
    // Both a ruin-sized stability drop AND an occupation-sized morale drop, so this
    // checks that SEVERITY wins rather than declaration order.
    modifyDistrictMetric(engine.world, districtId, 'stability', -ZONE_STATE_THRESHOLDS.ruinedStabilityDrop);
    modifyDistrictMetric(engine.world, districtId, 'morale', -ZONE_STATE_THRESHOLDS.occupiedMoraleDrop);
    const { condition } = deriveZoneConditionWithReason(engine.world, TOWN_ZONE);
    expect(condition).toBe('ruined');
    expect(ZONE_CONDITIONS.indexOf('ruined')).toBeGreaterThan(ZONE_CONDITIONS.indexOf('occupied'));
  });

  it('morale alone produces `occupied` — so the two inputs are separable', () => {
    // Without this, "stability drives everything" would be indistinguishable from
    // the implementation actually reading both.
    const engine = bootWithExport();
    const districtId = getDistrictForZone(engine.world, TOWN_ZONE)!;
    runZoneStateStep(engine);
    modifyDistrictMetric(engine.world, districtId, 'morale', -ZONE_STATE_THRESHOLDS.occupiedMoraleDrop);
    expect(deriveZoneConditionWithReason(engine.world, TOWN_ZONE).condition).toBe('occupied');
  });

  it('the BASELINE is captured at first observation and never re-captured', () => {
    // The property the deviation design rests on, and its footgun. If a reload
    // re-baselined, a district that had already fallen would silently read intact
    // again — the town would repair itself by being saved.
    const engine = bootWithExport();
    const districtId = getDistrictForZone(engine.world, TOWN_ZONE)!;
    runZoneStateStep(engine);
    modifyDistrictMetric(engine.world, districtId, 'stability', -ZONE_STATE_THRESHOLDS.damagedStabilityDrop);
    expect(runZoneStateStep(engine).length).toBeGreaterThan(0);
    expect(getZoneCondition(engine.world, TOWN_ZONE)).toBe('damaged');

    // Many more passes over the fallen district: the baseline must not drift toward
    // the new value, so the zone must STAY damaged.
    for (let i = 0; i < 5; i++) runZoneStateStep(engine);
    expect(getZoneCondition(engine.world, TOWN_ZONE)).toBe('damaged');
    expect(deriveZoneConditionWithReason(engine.world, TOWN_ZONE).condition).toBe('damaged');
  });

  it('NO shipped pack reports a change on its first tick — the flood control', () => {
    // ⚠ THE CONTROL THAT CAUGHT MY OWN THRESHOLD ERROR, kept as a permanent gate.
    // The first draft used absolute cut-offs calibrated against the forge fixture's
    // authored stability of 45; run against the catalog it declared EVERY ZONE IN
    // EVERY PACK `ruined` on tick one — 62 events — and that flood broke `bounty`
    // opportunity reachability catalog-wide. Measured cause: all 27 districts
    // across all 12 shipped packs sit at the DEFAULTS (stability 5, morale 50);
    // not one authors `baseMetrics`. I had calibrated against a single fixture,
    // which is C0's ledger entry 3 in a new costume.
    //
    // A world nobody has shocked must be quiet. Asserted for the WHOLE catalog, so
    // no future threshold change can reintroduce the flood.
    for (const pack of allPacks) {
      const engine = pack.createGame(SEED);
      const changes = runZoneStateStep(engine);
      expect(changes, `${pack.meta.id} emitted on its first tick: ${JSON.stringify(changes)}`).toEqual([]);
    }
  });

  it('a zone in NO district derives `intact` and SAYS WHY', () => {
    // Not a bug, and worth stating: zone state rides the district layer, so a zone
    // outside it has nothing to ride. Reported rather than silently defaulted.
    const engine = bootWithExport();
    engine.store.addZone({ id: 'orphan', roomId: 'orphan', name: 'Orphan', tags: [], neighbors: [] });
    const { condition, cause } = deriveZoneConditionWithReason(engine.world, 'orphan');
    expect(condition).toBe('intact');
    expect(cause).toContain('no district');
  });

  it('the derivation is PURE — repeated calls neither differ nor mutate', () => {
    const engine = bootWithExport();
    const before = JSON.stringify(engine.world.modules['district-core']);
    const a = deriveZoneConditionWithReason(engine.world, TOWN_ZONE);
    const b = deriveZoneConditionWithReason(engine.world, TOWN_ZONE);
    expect(a).toEqual(b);
    expect(JSON.stringify(engine.world.modules['district-core'])).toBe(before);
  });

  it('variantTags are STABLE KEYS, never asset paths', () => {
    // What the client binds to. A path or an extension here would mean the sim was
    // choosing art, which is the boundary violation this whole pillar avoids.
    for (const condition of ZONE_CONDITIONS) {
      for (const tag of variantTagsFor(condition)) {
        expect(tag).toMatch(/^[a-z]+:[a-z-]+$/);
        expect(tag).not.toContain('/');
        expect(tag).not.toContain('.');
      }
    }
  });
});
