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
 * Every module-owned intake channel this package ships. Pass to
 * `applyContentPack(engine, pack, { channels: createStandardChannels() })`.
 *
 * It is a list rather than a single export because the C3 rung grows this
 * surface — `encounterAnchors` joined at C3/P1, and typed hazards and entry
 * gates follow — and a caller that already spreads a list does not change when
 * it does.
 */
export function createStandardChannels(): IntakeChannel[] {
  return [districtsChannel(), encounterAnchorsChannel()];
}
