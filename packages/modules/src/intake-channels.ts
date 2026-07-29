// intake-channels.ts — the module-owned half of the content → runtime seam.
//
// @ai-rpg-engine/content-schema owns the wire mechanism (`applyContentPack`) but
// sits BELOW this package, so it cannot reach district-core's state shape. That
// split is deliberate (DECOMPOSE_BY_SECRETS): what changes when a module changes
// its state lives with the module; the stable wire mechanism lives with the wire.
//
// A channel writes a module's namespace the same way that module's constructor
// would have seeded it. It never re-derives the shape by hand — the seeding logic
// is exported from the module itself so there is exactly one definition of what
// "a district in world state" means.

import type { Engine, EntityState } from '@ai-rpg-engine/core';
import type { IntakeChannel, ChannelReport } from '@ai-rpg-engine/content-schema';
import { ingestDistrictDefinitions, type DistrictDefinition } from './district-core.js';
import {
  mergeEncounterSpawnContent,
  validateEncounterSpawnContent,
  BOSS_ROLE_TAG,
} from './encounter-spawn.js';
import type { EncounterDefinition, EncounterComposition } from './combat-roles.js';
import { registerTypedHazards, type HazardSpec } from './hazard-interpreter.js';

/**
 * Route exported `districts` into a booted world.
 *
 * This is the ONE of C0's three "cheap wire gaps" that a post-boot write can
 * actually reach. district-core reads its definitions out of world state
 * (`district-core.ts`, `getModuleState(world)` → `world.modules['district-core']`),
 * so writing there lands and every reader sees it.
 *
 * Its two siblings cannot be served this way and are not pretended to be:
 * `progressionTrees` is closure-captured at module construction, and
 * `buildCatalog` is consumed by character creation before a session exists. Both
 * are session-scoped — see `extractSessionContent` in @ai-rpg-engine/content-schema.
 */
export function districtsChannel(): IntakeChannel {
  return {
    key: 'districts',
    apply(engine: Engine, data: unknown): ChannelReport {
      if (!Array.isArray(data)) {
        return {
          applied: 0,
          errors: [{ path: 'pack.districts', message: 'must be an array of DistrictDefinition.' }],
        };
      }

      const errors: ChannelReport['errors'] = [];
      const valid: DistrictDefinition[] = [];

      for (let i = 0; i < data.length; i++) {
        const d = data[i] as Record<string, unknown> | null;
        const label = `districts[${i}]`;
        if (d === null || typeof d !== 'object' || Array.isArray(d)) {
          errors.push({ path: label, message: 'must be an object.' });
          continue;
        }
        if (typeof d.id !== 'string' || d.id.length === 0) {
          errors.push({ path: `${label}.id`, message: 'must be a non-empty string.' });
          continue;
        }
        if (typeof d.name !== 'string') {
          errors.push({ path: `${label}(${d.id}).name`, message: 'must be a string.' });
          continue;
        }
        if (!Array.isArray(d.zoneIds)) {
          errors.push({ path: `${label}(${d.id}).zoneIds`, message: 'must be an array of zone ids.' });
          continue;
        }
        if (d.tags !== undefined && !Array.isArray(d.tags)) {
          errors.push({ path: `${label}(${d.id}).tags`, message: 'must be an array if provided.' });
          continue;
        }
        valid.push({
          id: d.id,
          name: d.name,
          zoneIds: d.zoneIds as string[],
          tags: (d.tags as string[] | undefined) ?? [],
          ...(typeof d.controllingFaction === 'string' ? { controllingFaction: d.controllingFaction } : {}),
          ...(d.baseMetrics !== null && typeof d.baseMetrics === 'object' && !Array.isArray(d.baseMetrics)
            ? { baseMetrics: d.baseMetrics as DistrictDefinition['baseMetrics'] }
            : {}),
        });
      }

      const applied = ingestDistrictDefinitions(engine.store, valid);
      return { applied, ...(errors.length > 0 ? { errors } : {}) };
    },
  };
}

/**
 * The authored `encounterType` values an anchor may carry, and the engine
 * composition each names.
 *
 * A CLOSED map, and an unmapped value is REFUSED rather than defaulted. C0
 * measured the silent-fallback shape four separate times in this lane — `slot`,
 * `rarity`, `difficulty` and `genre` all quietly became something else — and
 * every one of them turned an authoring mistake into a behaviour change nobody
 * could see. `boss-fight` and `solo` are deliberately absent: this module
 * refuses boss compositions from random tables for a stated reason (the CLI's
 * victory check live-scans `role:boss` hostiles, so a cloned boss can un-win a
 * won game), and `solo` has no table semantics distinct from a one-participant
 * patrol.
 */
const ENCOUNTER_TYPE_TO_COMPOSITION: Readonly<Record<string, EncounterComposition>> = {
  ambush: 'ambush',
  patrol: 'patrol',
  horde: 'horde',
  duel: 'duel',
};

/**
 * Route exported `encounterAnchors` into a booted world's spawn system (C3/P1).
 *
 * ⚠ THIS REGISTERS INTO `encounter-spawn`; it does not reimplement it. The engine
 * already owns a complete spawn system — deterministic `spawnRoll` off
 * seed+tick+zone, weight-is-repetition tables keyed by zone, a
 * one-live-encounter-per-zone ledger in persisted state, safety modulation, and
 * one renderable `encounter.spawned` event. An anchor is authored content for
 * THAT system, so the channel translates and merges (see
 * `mergeEncounterSpawnContent`). A second roll, a second ledger or a second
 * event type would be the parallel-system failure C0's phantom module ids and
 * the exporter's duplicated content hash are both examples of.
 *
 * What an anchor supplies that the module had no expression for: a per-anchor
 * `probability` and a `cooldownTurns`. Those are the real delta, and both are
 * added to the module's own structures.
 *
 * Boss safety is enforced by calling the module's OWN
 * `validateEncounterSpawnContent` rather than re-deriving the rule here.
 */
export function encounterAnchorsChannel(): IntakeChannel {
  return {
    key: 'encounterAnchors',
    apply(engine: Engine, data: unknown): ChannelReport {
      if (!Array.isArray(data)) {
        return {
          applied: 0,
          errors: [{ path: 'pack.encounterAnchors', message: 'must be an array of EncounterAnchor.' }],
        };
      }

      const errors: ChannelReport['errors'] = [];
      const dropped: ChannelReport['dropped'] = [];
      const world = engine.store.state;

      const encounters: EncounterDefinition[] = [];
      const templates: EntityState[] = [];
      const zoneTables: Record<string, string[]> = {};
      const zoneChance: Record<string, number> = {};
      const zoneCooldown: Record<string, number> = {};
      const seenTemplateIds = new Set<string>();
      let applied = 0;

      for (let i = 0; i < data.length; i++) {
        const a = data[i] as Record<string, unknown> | null;
        const label = `encounterAnchors[${i}]`;
        if (a === null || typeof a !== 'object' || Array.isArray(a)) {
          errors.push({ path: label, message: 'must be an object.' });
          continue;
        }
        const id = typeof a.id === 'string' ? a.id : undefined;
        const zoneId = typeof a.zoneId === 'string' ? a.zoneId : undefined;
        if (!id || !zoneId) {
          errors.push({ path: label, message: 'requires non-empty `id` and `zoneId` strings.' });
          continue;
        }
        const at = `${label}(${id})`;

        if (!world.zones[zoneId]) {
          errors.push({
            path: `${at}.zoneId`,
            message: `no zone "${zoneId}" in the booted world — the anchor's table would be unreachable.`,
          });
          continue;
        }

        const composition = ENCOUNTER_TYPE_TO_COMPOSITION[String(a.encounterType)];
        if (!composition) {
          errors.push({
            path: `${at}.encounterType`,
            message:
              `unknown encounterType "${String(a.encounterType)}" — expected one of ` +
              `${Object.keys(ENCOUNTER_TYPE_TO_COMPOSITION).join(', ')}. Refused rather than ` +
              'defaulted: a silent fallback turns an authoring mistake into a behaviour change.',
          });
          continue;
        }

        // Participants are cloned from entities already in the booted world —
        // the same templates-are-cloned discipline the module uses, so an
        // authored NPC placed by `placements` is never itself dragged into a
        // random spawn.
        const enemyIds = Array.isArray(a.enemyIds) ? a.enemyIds.filter((e): e is string => typeof e === 'string') : [];
        if (enemyIds.length === 0) {
          errors.push({ path: `${at}.enemyIds`, message: 'requires at least one entity id.' });
          continue;
        }
        let resolvable = true;
        for (const enemyId of enemyIds) {
          const template = world.entities[enemyId];
          if (!template) {
            errors.push({
              path: `${at}.enemyIds`,
              message: `no entity "${enemyId}" in the booted world to clone a participant from.`,
            });
            resolvable = false;
            continue;
          }
          if (!seenTemplateIds.has(enemyId)) {
            seenTemplateIds.add(enemyId);
            templates.push(template);
          }
        }
        if (!resolvable) continue;

        const probability = typeof a.probability === 'number' ? a.probability : undefined;
        const cooldownTurns = typeof a.cooldownTurns === 'number' ? a.cooldownTurns : undefined;

        encounters.push({
          id,
          name: id,
          participants: enemyIds.map((entityId) => ({ entityId })),
          composition,
          validZoneIds: [zoneId],
          ...(Array.isArray(a.tags) && a.tags.length > 0
            ? { narrativeHooks: { tone: String(a.tags[0]) } }
            : {}),
        });

        // Weight is repetition, and one anchor is one entry. An anchor per
        // encounter keeps the authored table readable; authors wanting 2:1 add
        // two anchors, which is the idiom the string[] table already affords.
        (zoneTables[zoneId] ??= []).push(id);
        if (probability !== undefined) zoneChance[zoneId] = probability;
        if (cooldownTurns !== undefined && cooldownTurns > 0) zoneCooldown[zoneId] = cooldownTurns;
        applied++;
      }

      if (applied === 0) {
        return { applied: 0, ...(errors.length > 0 ? { errors } : {}) };
      }

      // The module's OWN content validator, not a re-derivation: boss-fight
      // refusal, role:boss participants, missing templates and
      // validZoneIds/validZoneTags all live there and stay there.
      const contentErrors = validateEncounterSpawnContent(
        { encounters, entityTemplates: templates, zoneTables },
        Object.values(world.zones).map((z) => ({ id: z.id, tags: z.tags })),
      );
      if (contentErrors.length > 0) {
        return {
          applied: 0,
          errors: [
            ...(errors ?? []),
            ...contentErrors.map((message) => ({ path: 'pack.encounterAnchors', message })),
          ],
        };
      }

      // A boss template reaching this point would already have been refused
      // above; asserted here as a second, cheap gate because cloning a unique
      // boss can un-win a won game and the cost of being wrong is asymmetric.
      for (const t of templates) {
        if (t.tags.includes(BOSS_ROLE_TAG)) {
          return {
            applied: 0,
            errors: [
              ...(errors ?? []),
              {
                path: 'pack.encounterAnchors',
                message: `entity "${t.id}" carries ${BOSS_ROLE_TAG} — unique bosses are placed set-pieces, never random spawns.`,
              },
            ],
          };
        }
      }

      const merged = mergeEncounterSpawnContent(world.meta.gameId, {
        encounters,
        entityTemplates: templates,
        zoneTables,
        zoneChance,
        zoneCooldown,
      });
      for (const id of merged.skippedEncounterIds) {
        dropped.push({
          path: `pack.encounterAnchors(${id})`,
          reason: 'needs-module-vocabulary',
          detail:
            `encounter id "${id}" was already registered by pack CODE, which wins — code can carry ` +
            'closures a data record cannot express. Rename the anchor to add a distinct encounter.',
        });
      }

      return {
        applied,
        ...(errors.length > 0 ? { errors } : {}),
        ...(dropped.length > 0 ? { dropped } : {}),
      };
    },
  };
}

/**
 * Route exported `hazardDefinitions` into a booted world (C3/P3).
 *
 * ⚠ CLOSES THE ARC'S SHARPEST MEASUREMENT. C0 §3.2 swept one zone field two ways
 * across twelve worlds: `'unstable floor'` moved the simulation because
 * starter-fantasy ships a closure that matches it; `'loose cobbles'` moved nothing
 * anywhere, because no closure references it. "Hazard strings carry no engine
 * semantics; their meaning is JavaScript the pack ships" — so a data-only export
 * was inert BY CONSTRUCTION, and C0 §9 called this "the highest-value single item,
 * because it closes a structural hole rather than a wire hole."
 *
 * The zone→hazard binding comes from `ZoneState.hazardRefs`, which the zone
 * converter carries, so this channel reads the world it is writing into rather
 * than requiring the pack to repeat the mapping.
 */
export function hazardDefinitionsChannel(): IntakeChannel {
  return {
    key: 'hazardDefinitions',
    apply(engine: Engine, data: unknown): ChannelReport {
      if (!Array.isArray(data)) {
        return {
          applied: 0,
          errors: [{ path: 'pack.hazardDefinitions', message: 'must be an array of HazardSpec.' }],
        };
      }

      const errors: ChannelReport['errors'] = [];
      const dropped: ChannelReport['dropped'] = [];
      const world = engine.store.state;
      const specs: HazardSpec[] = [];

      const TRIGGERS = ['on-enter', 'per-turn', 'on-exit', 'timed'];
      const KINDS = ['damage', 'status', 'instakill', 'ignite'];

      for (let i = 0; i < data.length; i++) {
        const h = data[i] as Record<string, unknown> | null;
        const label = `hazardDefinitions[${i}]`;
        if (h === null || typeof h !== 'object' || Array.isArray(h)) {
          errors.push({ path: label, message: 'must be an object.' });
          continue;
        }
        const id = typeof h.id === 'string' ? h.id : undefined;
        if (!id) {
          errors.push({ path: `${label}.id`, message: 'must be a non-empty string.' });
          continue;
        }
        const at = `${label}(${id})`;
        if (typeof h.trigger !== 'string' || !TRIGGERS.includes(h.trigger)) {
          errors.push({
            path: `${at}.trigger`,
            message: `must be one of ${TRIGGERS.join(', ')} — refused rather than defaulted.`,
          });
          continue;
        }
        if (!Array.isArray(h.effects)) {
          errors.push({ path: `${at}.effects`, message: 'must be an array (empty is legal for a terrain-only hazard).' });
          continue;
        }
        let effectsOk = true;
        for (const [j, e] of (h.effects as unknown[]).entries()) {
          const kind = (e as { kind?: unknown } | null)?.kind;
          if (typeof kind !== 'string' || !KINDS.includes(kind)) {
            errors.push({
              path: `${at}.effects[${j}].kind`,
              message: `must be one of ${KINDS.join(', ')} — the effect union is CLOSED, so content selects a kind rather than defining one.`,
            });
            effectsOk = false;
          }
        }
        if (!effectsOk) continue;

        specs.push({
          id,
          name: typeof h.name === 'string' ? h.name : id,
          effects: h.effects as HazardSpec['effects'],
          trigger: h.trigger as HazardSpec['trigger'],
          ...(typeof h.moveCostDelta === 'number' ? { moveCostDelta: h.moveCostDelta } : {}),
          ...(typeof h.passable === 'string' ? { passable: h.passable as HazardSpec['passable'] } : {}),
          ...(typeof h.blocksVision === 'boolean' ? { blocksVision: h.blocksVision } : {}),
          ...(Array.isArray(h.weatherConditions) ? { weatherConditions: h.weatherConditions as string[] } : {}),
          ...(Array.isArray(h.immuneTags) ? { immuneTags: h.immuneTags as string[] } : {}),
          tags: Array.isArray(h.tags) ? (h.tags as string[]) : [],
        });
      }

      if (specs.length === 0) {
        return { applied: 0, ...(errors.length > 0 ? { errors } : {}) };
      }

      // The zone binding, read off the world the zones already landed in.
      const byZone: Record<string, string[]> = {};
      const declared = new Set(specs.map((s) => s.id));
      for (const zone of Object.values(world.zones)) {
        const refs = (zone as { hazardRefs?: unknown }).hazardRefs;
        if (!Array.isArray(refs) || refs.length === 0) continue;
        const resolved: string[] = [];
        for (const ref of refs) {
          if (typeof ref !== 'string') continue;
          if (!declared.has(ref)) {
            // A dangling ref is the phantom-module-id shape again: plausible, and
            // dead. Named, not silently skipped.
            dropped.push({
              path: `zones(${zone.id}).hazardRefs`,
              reason: 'needs-module-vocabulary',
              detail: `hazardRef "${ref}" matches no hazardDefinition in this pack — the zone will not carry that hazard.`,
            });
            continue;
          }
          resolved.push(ref);
        }
        if (resolved.length > 0) byZone[zone.id] = resolved;
      }

      // ⚠ `statusId` LIVE RESOLUTION IS BUILT AND NOT WIRED — stated rather than
      // implied, because the interpreter's check is fail-OPEN when the known set is
      // empty, and an unwired check that LOOKS wired is worse than no check at all.
      //
      // The interpreter resolves `statusId` against a registered set, exactly as
      // C1's gate resolves module ids against a booted `ModuleManager`. The set is
      // empty here because `IntakeChannel.apply(engine, data)` receives only its own
      // slice of the pack, not the pack — so this channel cannot see
      // `pack.statuses`. Widening that signature touches `districtsChannel` and
      // `encounterAnchorsChannel` too, and that is a contract change this phase
      // does not authorise on the way past.
      //
      // Consequence, recorded: a hazard naming a status no pack declares applies an
      // unknown id rather than being refused. `registerTypedHazards` already accepts
      // the set, so wiring it is one argument once the channel can see the pack.
      const knownStatusIds: string[] = [];

      const { skippedIds } = registerTypedHazards(world.meta.gameId, specs, byZone, knownStatusIds);
      for (const id of skippedIds) {
        dropped.push({
          path: `pack.hazardDefinitions(${id})`,
          reason: 'needs-module-vocabulary',
          detail: `hazard id "${id}" was already registered by pack CODE, which wins — a closure can express meaning a data record cannot.`,
        });
      }

      if (Object.keys(byZone).length === 0) {
        dropped.push({
          path: 'pack.hazardDefinitions',
          reason: 'no-runtime-field',
          detail:
            `${specs.length} typed hazard${specs.length === 1 ? '' : 's'} registered, but NO zone references any of them ` +
            'via `hazardRefs` — so none of them can ever fire. Add hazardRefs to the zones they belong to.',
        });
      }

      return {
        applied: specs.length,
        ...(errors.length > 0 ? { errors } : {}),
        ...(dropped.length > 0 ? { dropped } : {}),
      };
    },
  };
}

/**
 * Every module-owned intake channel this package ships. Pass to
 * `applyContentPack(engine, pack, { channels: createStandardChannels() })`.
 *
 * It is a list rather than a single export because the C3 rung grows this
 * surface — `encounterAnchors` joined at C3/P1, and typed hazards and entry
 * gates follow — and a caller that already spreads a list does not change when
 * it does.
 */
export function createStandardChannels(): IntakeChannel[] {
  return [districtsChannel(), encounterAnchorsChannel(), hazardDefinitionsChannel()];
}
