// intake.test.ts — the content → runtime seam, with its negative controls.
//
// C0 proved four ways that no route existed from a loaded pack into a
// WorldStore (docs/c0-alignment/REPORT.md §3.3). This file proves the route
// exists, converts what it claims to convert, and — the part that matters most —
// NAMES what it does not.
//
// The controls are here because the audit's headline failure was not lost data.
// It was data lost SILENTLY while an instrument reported losslessPercent: 100 on
// an export that dropped 194 fields. A converter that drops without reporting
// rebuilds that exact failure one layer down, and would pass a test suite that
// only checked what it carried.

import { describe, it, expect } from 'vitest';
import { Engine, type GameManifest, type ZoneState, type EntityState } from '@ai-rpg-engine/core';
import {
  applyContentPack,
  zoneDefinitionToState,
  entityBlueprintToState,
  extractSessionContent,
  MODULE_INTAKE_KEYS,
  SESSION_SCOPED_KEYS,
  CORE_INTAKE_KEYS,
  EVALUATED_NOT_MAPPED_KEYS,
  UNROUTED_DECLARED_KEYS,
  ALLOWED_PACK_KEYS,
  type ContentPack,
  type DroppedField,
  type IntakeChannel,
} from './index.js';

const MANIFEST: GameManifest = {
  id: 'intake-test',
  title: 'Intake Test',
  version: '1.0.0',
  engineVersion: '3.8.0',
  ruleset: 'standard-v1',
  modules: [],
  contentPacks: [],
};

function bootEngine(): Engine {
  return new Engine({ manifest: MANIFEST, seed: 71 });
}

function pathsOf(dropped: DroppedField[]): string[] {
  return dropped.map((d) => d.path).sort();
}

// --- The converters -------------------------------------------------------

describe('C1/P1 — ZoneDefinition → ZoneState', () => {
  it('carries every field C0 measured as alive, and derives roomId', () => {
    const state = zoneDefinitionToState({
      id: 'zone-yard',
      name: 'Surface Yard',
      tags: ['outdoor', 'safe'],
      neighbors: ['zone-vault'],
      light: 9,
      noise: 4,
      hazards: ['loose cobbles'],
      interactables: ['well'],
    });

    // The four fields the C0 sweep measured alive-as-rules across the catalog:
    // light 12/12, noise 12/12, neighbors 11/12, tags 8+3/12.
    expect(state.light).toBe(9);
    expect(state.noise).toBe(4);
    expect(state.neighbors).toEqual(['zone-vault']);
    expect(state.tags).toEqual(['outdoor', 'safe']);

    // roomId is DERIVED (CONTRACT §2.2): the store requires it, the definition
    // has no counterpart, and C0 measured it stored-inert in 12 of 12 worlds.
    expect(state.roomId).toBe('zone-yard');
  });

  it('defaults the two required array fields rather than emitting undefined', () => {
    const state = zoneDefinitionToState({ id: 'z', name: 'Z' });
    expect(state.tags).toEqual([]);
    expect(state.neighbors).toEqual([]);
    // Optional scalars stay absent — an explicit `undefined` would serialize
    // differently from a pack-authored zone and break byte-identical saves.
    expect('light' in state).toBe(false);
    expect('noise' in state).toBe(false);
  });

  it('leaves `stability` unset — it is alive AND unauthorable', () => {
    // C0's finding I did not expect (REPORT §6.1): stability moves 4 of 12
    // worlds and has four readers, but ZoneDefinition has no such field. C1 does
    // not invent one; making it authorable is a schema change, not a wire change.
    const state = zoneDefinitionToState({ id: 'z', name: 'Z' }) as ZoneState;
    expect(state.stability).toBeUndefined();
    expect(state.authority).toBeUndefined();
  });

  it('CONTROL: names every field it drops, with a reason', () => {
    const dropped: DroppedField[] = [];
    zoneDefinitionToState(
      {
        id: 'z',
        name: 'Z',
        description: [{ text: 'prose' }],
        exits: [{ targetZoneId: 'other', condition: { type: 'has-item', params: { id: 'rope' } } }],
        entities: ['npc-1'],
        hazards: ['loose cobbles'],
      },
      dropped,
    );

    expect(pathsOf(dropped)).toEqual([
      'zones(z).description',
      'zones(z).entities',
      'zones(z).exits',
      'zones(z).hazards',
    ]);
    for (const d of dropped) {
      expect(d.detail.length, `${d.path} needs an actionable detail`).toBeGreaterThan(20);
    }
  });

  it('does not alias the definition — the converter is clean without a store', () => {
    // This control found a real bug in the first draft: `tags: def.tags ?? []`
    // handed the definition's own array to the state. It was invisible through
    // `applyContentPack` because `addZone` structuredClones on the way in — so
    // the "store detaches" test below passed for the STORE's reason, not the
    // converter's. These functions are exported and callable without a store.
    const def = { id: 'z', name: 'Z', tags: ['a'], neighbors: ['n'] };
    const state = zoneDefinitionToState(def);
    state.tags.push('b');
    state.neighbors.push('m');
    expect(def.tags).toEqual(['a']);
    expect(def.neighbors).toEqual(['n']);
  });

  it('does not spread a string hazardRefs into character ids', () => {
    const state = zoneDefinitionToState({
      id: 'z',
      name: 'Z',
      hazardRefs: 'hazard-void-drop',
    } as unknown as Parameters<typeof zoneDefinitionToState>[0]);
    expect(state.hazardRefs).toBeUndefined();
  });

  it('copies an array hazardRefs without aliasing', () => {
    const def = { id: 'z', name: 'Z', hazardRefs: ['hazard-void-drop'] };
    const state = zoneDefinitionToState(def);
    expect(state.hazardRefs).toEqual(['hazard-void-drop']);
    state.hazardRefs!.push('other');
    expect(def.hazardRefs).toEqual(['hazard-void-drop']);
  });

  it('CONTROL: a zone with nothing droppable reports NOTHING dropped', () => {
    // The other half of the previous control. A reporter that always fires is as
    // useless as one that never does — this is what makes the drop list evidence
    // rather than decoration.
    const dropped: DroppedField[] = [];
    zoneDefinitionToState({ id: 'z', name: 'Z', tags: [], neighbors: [], light: 5 }, dropped);
    expect(dropped).toEqual([]);
  });

  it('hazards are carried AND reported inert — the sharpest C0 measurement', () => {
    // Same field, two mutations, twelve worlds: 'unstable floor' moves
    // starter-fantasy because a pack closure matches it at setup.ts:137;
    // 'loose cobbles' moves nothing anywhere. Hazard meaning is JavaScript the
    // pack ships. So the converter carries the strings faithfully and says so.
    const dropped: DroppedField[] = [];
    const state = zoneDefinitionToState({ id: 'z', name: 'Z', hazards: ['loose cobbles'] }, dropped);

    expect(state.hazards).toEqual(['loose cobbles']);
    const entry = dropped.find((d) => d.path.endsWith('.hazards'));
    expect(entry?.reason).toBe('inert-without-pack-code');
  });
});

describe('C1/P1 — EntityBlueprint → EntityState', () => {
  it('carries stats, resources and identity', () => {
    const state = entityBlueprintToState({
      id: 'npc-warden',
      type: 'npc',
      name: 'Warden',
      tags: ['guard'],
      baseStats: { might: 6 },
      baseResources: { hp: 20 },
      inventory: ['item-key'],
      equipment: { hand: 'item-spear' },
    });

    expect(state.id).toBe('npc-warden');
    expect(state.blueprintId).toBe('npc-warden');
    expect(state.stats).toEqual({ might: 6 });
    expect(state.resources).toEqual({ hp: 20 });
    expect(state.statuses).toEqual([]);
    expect(state.inventory).toEqual(['item-key']);
  });

  it('does not alias the blueprint — mutating the state leaves the source clean', () => {
    const bp = { id: 'e', type: 'npc', name: 'E', baseStats: { might: 1 }, tags: ['a'] };
    const state = entityBlueprintToState(bp);
    state.stats.might = 99;
    state.tags.push('b');
    expect(bp.baseStats.might).toBe(1);
    expect(bp.tags).toEqual(['a']);
  });

  it('CONTROL: names the three fields that need module vocabulary', () => {
    const dropped: DroppedField[] = [];
    entityBlueprintToState(
      {
        id: 'e',
        type: 'npc',
        name: 'E',
        startingStatuses: ['status-wary'],
        aiProfile: 'cautious',
        scripts: ['on-enter'],
      },
      dropped,
    );
    expect(pathsOf(dropped)).toEqual([
      'entities(e).aiProfile',
      'entities(e).scripts',
      'entities(e).startingStatuses',
    ]);
  });

  it('F-cf3fc257: copies relations/custom/resistances/faction/ruleProfileId', () => {
    const bp = {
      id: 'aldric',
      type: 'npc',
      name: 'Aldric',
      relations: { 'player-trust': 15 },
      custom: { companionRole: 'healer' },
      resistances: { holy: 'immune' as const },
      faction: 'chapel-order',
      ruleProfileId: 'healer',
    };
    const state = entityBlueprintToState(bp);
    expect(state.relations).toEqual({ 'player-trust': 15 });
    expect(state.custom).toEqual({ companionRole: 'healer' });
    expect(state.resistances).toEqual({ holy: 'immune' });
    expect(state.faction).toBe('chapel-order');
    expect(state.ruleProfileId).toBe('healer');
    state.relations!['player-trust'] = 0;
    expect(bp.relations['player-trust']).toBe(15);
  });

  it('F-cf3fc257: unknown resistance names land in dropped[] and do not skip the entity', () => {
    const dropped: DroppedField[] = [];
    const state = entityBlueprintToState(
      {
        id: 'ghoul',
        type: 'enemy',
        name: 'Ghoul',
        resistances: { holy: 'immune', fire: 'wet' as 'immune' },
      },
      dropped,
    );
    expect(state.resistances).toEqual({ holy: 'immune' });
    expect(dropped.some((d) => d.path.includes('resistances.fire') && d.reason === 'needs-module-vocabulary')).toBe(true);
  });
});

// --- The seam -------------------------------------------------------------

describe('C1/P1 — applyContentPack routes content into a booted world', () => {
  const PACK: ContentPack = {
    zones: [
      { id: 'zone-a', name: 'A', tags: ['safe'], neighbors: ['zone-b'], light: 8, noise: 3 },
      { id: 'zone-b', name: 'B', tags: [], neighbors: ['zone-a'], light: 1, noise: 1 },
    ],
    entities: [{ id: 'npc-1', type: 'npc', name: 'One', baseStats: { might: 3 } }],
  };

  it('zones reach the WorldStore and are readable as ZoneState', () => {
    const engine = bootEngine();
    expect(Object.keys(engine.world.zones)).toHaveLength(0);

    const r = applyContentPack(engine, PACK);

    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.applied.zones).toBe(2);
    expect(Object.keys(engine.world.zones).sort()).toEqual(['zone-a', 'zone-b']);

    const a = engine.world.zones['zone-a'] as ZoneState;
    expect(a.roomId).toBe('zone-a');
    expect(a.light).toBe(8);
  });

  it('entities reach the WorldStore', () => {
    const engine = bootEngine();
    applyContentPack(engine, PACK);
    const npc = engine.world.entities['npc-1'] as EntityState;
    expect(npc.name).toBe('One');
    expect(npc.stats.might).toBe(3);
  });

  it('the store detaches what it ingests (no aliasing back to the pack)', () => {
    const engine = bootEngine();
    applyContentPack(engine, PACK);
    (engine.world.zones['zone-a'] as ZoneState).tags.push('mutated');
    expect(PACK.zones![0].tags).toEqual(['safe']);
  });

  it('RED: a malformed zone is refused with a structured error, never a throw', () => {
    const engine = bootEngine();
    const bad = { zones: [{ name: 'no id' }] } as unknown as ContentPack;

    let threw: unknown;
    let r!: ReturnType<typeof applyContentPack>;
    try {
      r = applyContentPack(engine, bad);
    } catch (e) {
      threw = e;
    }

    expect(threw, 'the seam must not raw-throw at its boundary').toBeUndefined();
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors[0].path).toContain('zones[0]');
    // …and the bad zone did NOT land.
    expect(Object.keys(engine.world.zones)).toHaveLength(0);
  });

  it('RED: a non-array collection is refused, not iterated into a TypeError', () => {
    const engine = bootEngine();
    const r = applyContentPack(engine, { zones: 'not-an-array' } as unknown as ContentPack);
    expect(r.ok).toBe(false);
    expect(r.errors[0].path).toBe('pack.zones');
  });

  it('RED: a non-object pack is refused', () => {
    const engine = bootEngine();
    for (const bad of [null, 42, [], 'pack']) {
      const r = applyContentPack(engine, bad as unknown as ContentPack);
      expect(r.ok).toBe(false);
      expect(r.errors[0].path).toBe('pack');
    }
  });

  it('one bad zone does not block the good ones, and both facts are reported', () => {
    const engine = bootEngine();
    const r = applyContentPack(engine, {
      zones: [{ id: 'good', name: 'Good' }, { name: 'bad' }],
    } as unknown as ContentPack);

    expect(r.ok).toBe(false);
    expect(r.applied.zones).toBe(1);
    expect(engine.world.zones.good).toBeDefined();
  });

  it('THE CONTRACT: every dropped field is named, never silently eaten', () => {
    const engine = bootEngine();
    const r = applyContentPack(engine, {
      zones: [{ id: 'z', name: 'Z', description: [{ text: 'prose' }], entities: ['x'] }],
      entities: [{ id: 'e', type: 'npc', name: 'E', aiProfile: 'cautious' }],
      quests: [{ id: 'q', name: 'Q', stages: [] }],
      verbs: [{ id: 'v' }],
    } as unknown as ContentPack);

    const paths = pathsOf(r.dropped);
    expect(paths).toContain('zones[0](z).description');
    expect(paths).toContain('zones[0](z).entities');
    expect(paths).toContain('entities[0](e).aiProfile');
    // Declared, validated, real content — and still unrouted at this rung.
    expect(paths).toContain('pack.quests');
    expect(paths).toContain('pack.verbs');
    // Unresolved aiProfile is named in dropped[] (F-035ac806). Overlay packs
    // without profiles still load (sidecar --content / C3 fixture).
    expect(r.ok).toBe(true);
    expect(r.dropped.some((d) => d.path.includes('aiProfile'))).toBe(true);
  });

  it('CLOSED BY C3/P1: the placement hole is a channel now, not an advisory', () => {
    // ⚠ FLIPPED BY C3/P1 (the pinned-test rule). C1 asserted the advisory:
    // "reports the placement hole rather than silently placing entities
    // nowhere" — `pack.entities` carried a note containing "zoneId" and
    // `npc-1.zoneId` was undefined on every single ingestion. C0 called it "the
    // single most consequential drop in the lane" (REPORT §2) and C1 could only
    // report it, because `EntityBlueprint` has no location field.
    //
    // It has a channel now. The advisory that lived on `pack.entities` is GONE,
    // and what remains is the honest remainder: a pack whose entities have no
    // placements is told so once, from the placements pass, with the count and
    // the names.
    const engine = bootEngine();
    const r = applyContentPack(engine, PACK);

    // The old advisory is gone from where it used to be.
    expect(r.advisories.find((a) => a.path === 'pack.entities')).toBeUndefined();

    // This pack authors no placements, so the remainder advisory fires instead —
    // naming the count and the entity, which the old blanket note never did.
    const note = r.advisories.find((a) => a.path === 'pack.placements');
    expect(note?.message).toContain('no placement');
    expect(note?.message).toContain('npc-1');
    expect(engine.world.entities['npc-1'].zoneId).toBeUndefined();
  });

  it('C3/P1: a placement PLACES the entity, and the remainder advisory falls silent', () => {
    // The other half of the flip, and the claim that actually matters: not "the
    // gap is reported differently" but "the gap is closed". Same pack, plus a
    // placement.
    const engine = bootEngine();
    const r = applyContentPack(engine, {
      ...PACK,
      placements: [{ entityId: 'npc-1', zoneId: 'zone-a' }],
    });

    expect(r.ok).toBe(true);
    expect(r.applied.placements).toBe(1);
    expect(engine.world.entities['npc-1'].zoneId).toBe('zone-a');
    // Nothing left unplaced ⇒ no advisory at all. An advisory that fires when
    // there is nothing to report is noise, and noise is how a real one gets
    // ignored.
    expect(r.advisories.find((a) => a.path === 'pack.placements')).toBeUndefined();
  });

  it('C3/P1 RED: a placement into a nonexistent zone is REFUSED, not narrated', () => {
    // The exporter already WARNS about an entity placed in a deleted zone. A
    // warning at export time is narration; arriving at the runtime the same fact
    // is refusable, and refusing it is the difference between "the NPC is
    // missing" and "the pack told you which NPC and which zone".
    const engine = bootEngine();
    const r = applyContentPack(engine, {
      ...PACK,
      placements: [{ entityId: 'npc-1', zoneId: 'no-such-zone' }],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes('no-such-zone'))).toBe(true);
    expect(engine.world.entities['npc-1'].zoneId).toBeUndefined();
  });

  it('C3/P1 RED: a placement of an unknown entity is REFUSED', () => {
    const engine = bootEngine();
    const r = applyContentPack(engine, {
      ...PACK,
      placements: [{ entityId: 'ghost', zoneId: 'zone-a' }],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes('ghost'))).toBe(true);
  });

  it('C3/P1: a spawnCondition is CARRIED and reported unevaluated, never silently applied', () => {
    // Intake is not a tick: there is no actor, no party and no tick to evaluate
    // `party-level:>=10` against. Carrying it and saying so is honest; evaluating
    // it at the wrong moment, or dropping it silently, are the two ways to be
    // wrong here.
    const engine = bootEngine();
    const r = applyContentPack(engine, {
      ...PACK,
      placements: [
        { entityId: 'npc-1', zoneId: 'zone-a', spawnCondition: { type: 'has-item', params: { id: 'rope' } } },
      ],
    });
    expect(r.ok).toBe(true);
    // Placed unconditionally…
    expect(engine.world.entities['npc-1'].zoneId).toBe('zone-a');
    // …and the deferral is NAMED.
    const drop = r.dropped.find((d) => d.path.includes('spawnCondition'));
    expect(drop?.reason).toBe('needs-module-vocabulary');
    expect(drop?.detail).toContain('NOT evaluated at intake');
  });

  it('CONTROL: an empty declared key produces no drop noise', () => {
    const engine = bootEngine();
    const r = applyContentPack(engine, { zones: [], entities: [], quests: [] });
    expect(r.dropped).toEqual([]);
    expect(r.applied).toEqual({});
  });
});

// --- Channels -------------------------------------------------------------

describe('C1/P1 — module-owned channels', () => {
  it('an unhandled module key is REPORTED, not silently skipped', () => {
    const engine = bootEngine();
    const r = applyContentPack(engine, { districts: [{ id: 'd', name: 'D', zoneIds: [], tags: [] }] });
    const note = r.advisories.find((a) => a.path === 'pack.districts');
    expect(note?.message).toContain('no intake channel supplied');
    expect(r.applied.districts).toBeUndefined();
  });

  it('a supplied channel receives its slice and its count is reported', () => {
    const engine = bootEngine();
    const seen: unknown[] = [];
    const channel: IntakeChannel = {
      key: 'districts',
      apply(_e, data) {
        seen.push(data);
        return { applied: (data as unknown[]).length };
      },
    };
    const r = applyContentPack(
      engine,
      { districts: [{ id: 'd', name: 'D', zoneIds: ['zone-a'], tags: [] }] },
      { channels: [channel] },
    );
    expect(r.applied.districts).toBe(1);
    expect(seen).toHaveLength(1);
  });

  it('a channel for an unrecognised key is called out, not quietly ignored', () => {
    const engine = bootEngine();
    const r = applyContentPack(engine, { zones: [] }, {
      channels: [{ key: 'typo-districts', apply: () => ({ applied: 0 }) }],
    });
    expect(r.advisories.some((a) => a.path === 'channels.typo-districts')).toBe(true);
  });

  it('a channel error surfaces as a pack error', () => {
    const engine = bootEngine();
    const r = applyContentPack(
      engine,
      { districts: 'nope' as unknown as ContentPack['districts'] },
      { channels: [{ key: 'districts', apply: () => ({ applied: 0, errors: [{ path: 'pack.districts', message: 'bad' }] }) }] },
    );
    expect(r.ok).toBe(false);
  });

  it('F-f7358f53: a throwing channel does not rethrow and rolls back core writes', () => {
    const engine = bootEngine();
    let result!: ReturnType<typeof applyContentPack>;
    expect(() => {
      result = applyContentPack(
        engine,
        {
          zones: [{ id: 'z', name: 'Z' }],
          districts: [{ id: 'd', name: 'D', zoneIds: ['z'], tags: [] }],
        },
        {
          channels: [{
            key: 'districts',
            apply: () => {
              throw new Error('garbage district');
            },
          }],
        },
      );
    }).not.toThrow();
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.path === 'pack.districts' && e.message.includes('threw') && e.message.includes('districts'))).toBe(true);
    expect(engine.world.zones.z).toBeUndefined();
    expect(result.applied.zones).toBeUndefined();
  });

  it('F-f7358f53: duplicate channel keys warn and keep the first handler', () => {
    const engine = bootEngine();
    const order: string[] = [];
    const r = applyContentPack(
      engine,
      { districts: [{ id: 'd', name: 'D', zoneIds: [], tags: [] }] },
      {
        channels: [
          { key: 'districts', apply: () => { order.push('first'); return { applied: 1 }; } },
          { key: 'districts', apply: () => { order.push('second'); return { applied: 99 }; } },
        ],
      },
    );
    expect(order).toEqual(['first']);
    expect(r.applied.districts).toBe(1);
    expect(r.advisories.some((a) => a.path === 'channels.districts' && a.message.includes('duplicate intake channel key'))).toBe(true);
  });
});

// --- The session-scoped split (a correction this cycle earned) -------------

describe('C1/P1 — session-scoped keys are not pretended to be routable', () => {
  it('the three "cheap wire gaps" are NOT one class — only districts is routable', () => {
    // C0 filed districts/buildCatalog/progressionTrees together as "the cheapest
    // thing on this whole list to close" (REPORT §3.1). Right about SHAPE, wrong
    // about INGESTION — and C1's definition of "real" (reaches a runtime) is what
    // exposes it. Pinned here so the split cannot quietly re-merge.
    //
    // ⚠ WIDENED BY C3/P1. `encounterAnchors` joins the module-intake keys, for
    // the SAME reason districts qualifies and its two siblings do not:
    // `encounter-spawn` holds its content in a module-side registry it reads at
    // tick time, so a registration after boot is seen by every later roll. The
    // split itself is unchanged — this is a third key on the routable side, not
    // a softening of the rule. The session-scoped pair is untouched, which is
    // the part that would signal a re-merge.
    expect([...MODULE_INTAKE_KEYS]).toEqual(['districts', 'encounterAnchors', 'hazardDefinitions']);
    expect([...SESSION_SCOPED_KEYS]).toEqual(['buildCatalog', 'archetypes', 'backgrounds', 'progressionTrees', 'ruleset']);
  });

  it('every ALLOWED_PACK_KEYS key is either applied or named', () => {
    const named = new Set<string>([
      ...CORE_INTAKE_KEYS,
      ...MODULE_INTAKE_KEYS,
      ...SESSION_SCOPED_KEYS,
      ...Object.keys(EVALUATED_NOT_MAPPED_KEYS),
      ...UNROUTED_DECLARED_KEYS.map(([k]) => k),
      'schemaVersion',
      'meta',
      'manifest',
    ]);
    for (const key of ALLOWED_PACK_KEYS) {
      expect(named.has(key), `${key} is neither applied nor named`).toBe(true);
    }
  });

  it('applyContentPack reports them as session-scoped, with the reason', () => {
    const engine = bootEngine();
    const r = applyContentPack(engine, {
      buildCatalog: { archetypes: [] },
      archetypes: [{ id: 'gravewalker' }],
      backgrounds: [{ id: 'oath-breaker' }],
      progressionTrees: [{ id: 'tree' }],
    });

    const drops = r.dropped.filter((d) => d.reason === 'session-scoped');
    expect(pathsOf(drops)).toEqual([
      'pack.archetypes',
      'pack.backgrounds',
      'pack.buildCatalog',
      'pack.progressionTrees',
    ]);
    // The detail names the mechanism, not just the verdict — this is the
    // difference between a user who can act and a user who files an issue.
    expect(drops.find((d) => d.path === 'pack.progressionTrees')?.detail)
      .toContain('closure-captures');
    expect(drops.find((d) => d.path === 'pack.archetypes')?.detail).toContain('character creation');
  });

  it('extractSessionContent is the seam that DOES serve them', () => {
    const session = extractSessionContent({
      buildCatalog: { archetypes: [{ id: 'a' }] },
      archetypes: [{ id: 'gravewalker' }],
      backgrounds: [{ id: 'oath-breaker' }],
      progressionTrees: [{ id: 'tree-1' }, { id: 'tree-2' }],
    } as unknown as ContentPack);

    expect(session.buildCatalog).toEqual({ archetypes: [{ id: 'a' }] });
    expect(session.archetypes).toEqual([{ id: 'gravewalker' }]);
    expect(session.backgrounds).toEqual([{ id: 'oath-breaker' }]);
    expect(session.progressionTrees).toHaveLength(2);
    expect(session.advisories).toEqual([]);
  });

  it('RED: extractSessionContent refuses malformed slices instead of passing them on', () => {
    const session = extractSessionContent({
      buildCatalog: 'not-an-object',
      progressionTrees: 'not-an-array',
    } as unknown as ContentPack);

    expect(session.buildCatalog).toBeUndefined();
    expect(session.progressionTrees).toBeUndefined();
    expect(session.advisories.map((a) => a.path).sort()).toEqual([
      'pack.buildCatalog',
      'pack.progressionTrees',
    ]);
  });

  it('CONTROL: a pack carrying neither key produces no advisories', () => {
    const session = extractSessionContent({ zones: [] });
    expect(session.advisories).toEqual([]);
    expect(session.buildCatalog).toBeUndefined();
  });

  it('F-53fd73dc: extractSessionContent surfaces pack.ruleset', () => {
    const session = extractSessionContent({
      ruleset: { id: 'r', name: 'R', version: '1', stats: [], resources: [], verbs: [], formulas: [], defaultModules: [], progressionModels: [] },
    } as unknown as ContentPack);
    expect(session.ruleset).toBeDefined();
    expect((session.ruleset as { id: string }).id).toBe('r');
  });

  it('F-82b17cb3: extractSessionContent surfaces dialogues/quests/abilities/statuses/items', () => {
    const session = extractSessionContent({
      dialogues: [{ id: 'd' }],
      quests: [{ id: 'q' }],
      abilities: [{ id: 'a' }],
      statuses: [{ id: 's' }],
      items: [{ id: 'i' }],
    } as unknown as ContentPack);
    expect(session.dialogues).toEqual([{ id: 'd' }]);
    expect(session.quests).toEqual([{ id: 'q' }]);
    expect(session.abilities).toEqual([{ id: 'a' }]);
    expect(session.statuses).toEqual([{ id: 's' }]);
    expect(session.items).toEqual([{ id: 'i' }]);
    expect(session.advisories).toEqual([]);
  });

  it('F-82b17cb3: malformed construction-time slices are advisory-skipped', () => {
    const session = extractSessionContent({
      dialogues: 'nope',
      quests: {},
      abilities: 1,
      statuses: null,
      items: 'nope',
    } as unknown as ContentPack);
    expect(session.dialogues).toBeUndefined();
    expect(session.quests).toBeUndefined();
    expect(session.abilities).toBeUndefined();
    expect(session.statuses).toBeUndefined();
    expect(session.items).toBeUndefined();
    expect(session.advisories.map((a) => a.path).sort()).toEqual([
      'pack.abilities',
      'pack.dialogues',
      'pack.items',
      'pack.quests',
      'pack.statuses',
    ]);
  });

  it('F-82b17cb3: applyContentPack stays UNROUTED for dialogues/quests/abilities/statuses', () => {
    const engine = bootEngine();
    const r = applyContentPack(engine, {
      dialogues: [{ id: 'd' }],
      quests: [{ id: 'q' }],
      abilities: [{ id: 'a' }],
      statuses: [{ id: 's' }],
    } as unknown as ContentPack);
    expect(r.ok).toBe(true);
    const paths = r.dropped.map((d) => d.path).sort();
    expect(paths).toEqual(['pack.abilities', 'pack.dialogues', 'pack.quests', 'pack.statuses']);
    expect(r.dropped.every((d) => d.reason === 'needs-module-vocabulary')).toBe(true);
  });
});

describe('F-035ac806 — aiProfile resolves through profiles / entityAi', () => {
  it('writes EntityState.ai when options.profiles names the authored profile', () => {
    const engine = bootEngine();
    const r = applyContentPack(
      engine,
      {
        entities: [{ id: 'grunt', type: 'npc', name: 'Grunt', tags: ['enemy'], aiProfile: 'aggressive' }],
      },
      { profiles: [{ id: 'aggressive' }] },
    );
    expect(r.ok).toBe(true);
    expect(r.dropped.find((d) => d.path.includes('aiProfile'))).toBeUndefined();
    expect(engine.world.entities['grunt'].ai?.profileId).toBe('aggressive');
    expect(r.applied.entityAi).toBe(1);
  });

  it('writes EntityState.ai from ContentPack.entityAi (goals/fears survive)', () => {
    const engine = bootEngine();
    const r = applyContentPack(engine, {
      entities: [{ id: 'grunt', type: 'npc', name: 'Grunt', aiProfile: 'aggressive' }],
      entityAi: {
        grunt: { profileId: 'aggressive', goals: ['guard-zone'], fears: ['fire'], alertLevel: 2, knowledge: { seen: true } },
      },
    });
    expect(r.ok).toBe(true);
    expect(engine.world.entities['grunt'].ai).toEqual({
      profileId: 'aggressive',
      goals: ['guard-zone'],
      fears: ['fire'],
      alertLevel: 2,
      knowledge: { seen: true },
    });
  });

  it('unresolved aiProfile is a structured error, not a silent stand-still', () => {
    const engine = bootEngine();
    const r = applyContentPack(
      engine,
      { entities: [{ id: 'grunt', type: 'npc', name: 'Grunt', aiProfile: 'ghost-brain' }] },
      { profiles: [{ id: 'aggressive' }] },
    );
    expect(r.ok).toBe(true);
    expect(r.dropped.some((d) => d.path.includes('aiProfile') && d.detail?.includes('ghost-brain'))).toBe(true);
    expect(engine.world.entities['grunt'].ai).toBeUndefined();
  });

  it('F-cf3fc257: unknown resistance names stay dropped[] only — do not flip ok', () => {
    const engine = bootEngine();
    const r = applyContentPack(engine, {
      entities: [{
        id: 'warden',
        type: 'enemy',
        name: 'Warden',
        resistances: { holy: 'immune', fire: 'soggy' as 'immune' },
        relations: { 'player-trust': 1 },
      }],
    });
    expect(r.ok).toBe(true);
    expect(engine.world.entities['warden'].resistances).toEqual({ holy: 'immune' });
    expect(engine.world.entities['warden'].relations).toEqual({ 'player-trust': 1 });
    expect(r.dropped.some((d) => d.path.includes('resistances.fire'))).toBe(true);
  });
});

describe('F-4ed3d82e — pack.items apply onto entity inventory/equipment', () => {
  it('copies inventory/equipment ids that resolve against pack.items and does not ANDON pack.items', () => {
    const engine = bootEngine();
    const r = applyContentPack(engine, {
      entities: [{
        id: 'hero',
        type: 'player',
        name: 'Hero',
        inventory: ['worn-blade', 'torch'],
        equipment: { hand: 'worn-blade' },
      }],
      items: [
        { id: 'worn-blade', name: 'Worn Blade' },
        { id: 'torch', name: 'Torch' },
      ],
    });
    expect(r.ok).toBe(true);
    expect(r.dropped.find((d) => d.path === 'pack.items')).toBeUndefined();
    expect(r.applied.items).toBe(2);
    expect(engine.world.entities['hero'].inventory).toEqual(['worn-blade', 'torch']);
    expect(engine.world.entities['hero'].equipment).toEqual({ hand: 'worn-blade' });
    expect(engine.store.state.modules['content-pack-items']).toBeDefined();
  });

  it('itemPlacements give a catalog item onto an existing entity', () => {
    const engine = bootEngine();
    const r = applyContentPack(engine, {
      entities: [{ id: 'hero', type: 'player', name: 'Hero', inventory: [] }],
      items: [{ id: 'healing-draught', name: 'Healing Draught' }],
      itemPlacements: [{ itemId: 'healing-draught', entityId: 'hero' }],
    });
    expect(r.ok).toBe(true);
    expect(r.applied.itemPlacements).toBe(1);
    expect(engine.world.entities['hero'].inventory).toEqual(['healing-draught']);
  });

  it('ANDON remains on a hypothetical zone.items field', () => {
    const dropped: DroppedField[] = [];
    zoneDefinitionToState(
      { id: 'z', name: 'Z', items: ['crate'] } as unknown as Parameters<typeof zoneDefinitionToState>[0],
      dropped,
    );
    const entry = dropped.find((d) => d.path.endsWith('.items'));
    expect(entry?.reason).toBe('evaluated-not-mapped');
    expect(entry?.detail).toContain('ANDON');
  });

  it('an inventory id missing from pack.items is a structured error', () => {
    const engine = bootEngine();
    const r = applyContentPack(engine, {
      entities: [{ id: 'hero', type: 'player', name: 'Hero', inventory: ['ghost-item'] }],
      items: [{ id: 'worn-blade' }],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes('ghost-item'))).toBe(true);
  });
});

