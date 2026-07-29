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

import type { Engine } from '@ai-rpg-engine/core';
import type { IntakeChannel, ChannelReport } from '@ai-rpg-engine/content-schema';
import { ingestDistrictDefinitions, type DistrictDefinition } from './district-core.js';

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
 * Every module-owned intake channel this package ships. Pass to
 * `applyContentPack(engine, pack, { channels: createStandardChannels() })`.
 *
 * One entry today. It is a list rather than a single export because the C3 rung
 * grows this surface (typed hazards, entry gates, economyProfile), and a caller
 * that already spreads a list does not change when it does.
 */
export function createStandardChannels(): IntakeChannel[] {
  return [districtsChannel()];
}
