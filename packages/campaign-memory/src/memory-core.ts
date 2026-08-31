// memory-core — the live write side of campaign-memory (F-6594b19b).
//
// NpcMemoryBank, applyRelationshipEffect, and CampaignJournal shipped as a
// complete, tested library with ZERO production callers: the CLI rebuilds a
// throwaway journal from the event log at endgame (witnesses always []), and
// remember() / applyRelationshipEffect appear only in this package's tests.
// This module is the missing EngineModule — same inject-and-persist pattern
// as createItemChronicleCore.
//
// OPT-IN. Subscribe to combat/kill/gift/rescue/betrayal events, journal.record
// with zone occupants as witnesses, bank.remember + applyRelationshipEffect
// per witness/target, persist via registerNamespace so Engine.serialize
// round-trips it.
//
// Distinct from still-open F-c1949ae0 (consolidate overwrites MemoryFragment.tick)
// — this file never calls consolidate.

import type { EngineModule, EntityState, ResolvedEvent, WorldState } from '@ai-rpg-engine/core';
import type { CampaignMemoryConfig, NpcMemoryState, RecordCategory, SerializedJournal } from './types.js';
import { CAMPAIGN_MEMORY_VERSION } from './types.js';
import { CampaignJournal } from './journal.js';
import { NpcMemoryBank } from './memory-bank.js';
import { applyRelationshipEffect } from './relationship-effects.js';

/** Persisted module-state namespace key (world.modules[CAMPAIGN_MEMORY_STATE_KEY]). */
export const CAMPAIGN_MEMORY_STATE_KEY = 'campaign-memory';

export type CampaignMemoryModuleState = {
  journal: SerializedJournal;
  banks: Record<string, NpcMemoryState>;
};

export type CampaignMemoryCoreConfig = {
  /** Optional decay/cap config forwarded to each NpcMemoryBank. */
  memory?: CampaignMemoryConfig;
};

const EVENT_CATEGORY: Record<string, RecordCategory> = {
  'combat.entity.defeated': 'kill',
  'campaign.kill': 'kill',
  'campaign.gift': 'gift',
  'item.gifted': 'gift',
  'social.gift': 'gift',
  'campaign.rescue': 'rescue',
  'social.rescue': 'rescue',
  'campaign.betrayal': 'betrayal',
  'social.betrayal': 'betrayal',
};

const EMPTY_JOURNAL: SerializedJournal = { version: CAMPAIGN_MEMORY_VERSION, records: [] };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function peekState(world: WorldState): CampaignMemoryModuleState | undefined {
  const ns = world.modules[CAMPAIGN_MEMORY_STATE_KEY];
  if (!isPlainObject(ns)) return undefined;
  return ns as CampaignMemoryModuleState;
}

function emptyState(): CampaignMemoryModuleState {
  return { journal: { ...EMPTY_JOURNAL, records: [] }, banks: {} };
}

function readState(world: WorldState): CampaignMemoryModuleState {
  const existing = peekState(world);
  if (!existing) return emptyState();
  const journal =
    existing.journal && isPlainObject(existing.journal)
      ? existing.journal
      : { ...EMPTY_JOURNAL, records: [] };
  const banks = isPlainObject(existing.banks) ? existing.banks : {};
  return { journal, banks };
}

function writeState(world: WorldState, state: CampaignMemoryModuleState): void {
  world.modules[CAMPAIGN_MEMORY_STATE_KEY] = state;
}

/** Live journal restored from the namespace. Snapshot — mutating it does not write back. */
export function getCampaignJournal(world: WorldState): CampaignJournal {
  const state = peekState(world);
  if (!state?.journal) return new CampaignJournal();
  return CampaignJournal.deserialize(state.journal);
}

/** One NPC's memory bank, or undefined when they have never remembered anything. */
export function getNpcMemory(world: WorldState, entityId: string): NpcMemoryBank | undefined {
  const raw = peekState(world)?.banks?.[entityId];
  if (!raw) return undefined;
  return NpcMemoryBank.deserialize(raw);
}

function loadJournal(state: CampaignMemoryModuleState): CampaignJournal {
  try {
    return CampaignJournal.deserialize(state.journal);
  } catch {
    return new CampaignJournal();
  }
}

function loadBank(
  state: CampaignMemoryModuleState,
  entityId: string,
  config?: CampaignMemoryConfig,
): NpcMemoryBank {
  const raw = state.banks[entityId];
  if (!raw) return new NpcMemoryBank(entityId, config);
  try {
    return NpcMemoryBank.deserialize(raw, config);
  } catch {
    return new NpcMemoryBank(entityId, config);
  }
}

function stringPayload(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function zoneOccupants(world: WorldState, zoneId: string | undefined): EntityState[] {
  if (!zoneId) return [];
  return Object.values(world.entities)
    .filter((e) => e.zoneId === zoneId)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function isAlive(entity: EntityState | undefined): boolean {
  if (!entity) return false;
  return (entity.resources.hp ?? 1) > 0;
}

function describeEvent(category: RecordCategory, actorName: string, targetName: string | undefined): string {
  if (category === 'kill') return `${actorName} killed ${targetName ?? 'someone'}`;
  if (category === 'gift') return `${actorName} gave a gift${targetName ? ` to ${targetName}` : ''}`;
  if (category === 'rescue') return `${actorName} rescued ${targetName ?? 'someone'}`;
  if (category === 'betrayal') return `${actorName} betrayed ${targetName ?? 'someone'}`;
  return `${actorName} — ${category}`;
}

function significanceFor(category: RecordCategory): number {
  if (category === 'kill' || category === 'betrayal') return 0.9;
  if (category === 'rescue') return 0.8;
  if (category === 'gift') return 0.6;
  return 0.5;
}

function emotionalCharge(category: RecordCategory, perspective: 'target' | 'witness'): number {
  const base =
    category === 'kill' || category === 'betrayal' ? -0.8 : category === 'rescue' || category === 'gift' ? 0.6 : 0;
  return perspective === 'witness' ? base * 0.5 : base;
}

function recordLiveEvent(
  world: WorldState,
  event: ResolvedEvent,
  category: RecordCategory,
  config: CampaignMemoryCoreConfig,
): void {
  const payload = event.payload ?? {};
  const actorId =
    (category === 'kill' ? stringPayload(payload, 'defeatedBy') : undefined) ??
    event.actorId ??
    stringPayload(payload, 'actorId');
  if (!actorId) return;

  const targetId =
    (category === 'kill' ? stringPayload(payload, 'entityId') : undefined) ?? stringPayload(payload, 'targetId');

  const actor = world.entities[actorId];
  const target = targetId ? world.entities[targetId] : undefined;
  const zoneId =
    stringPayload(payload, 'defeatZoneId') ??
    stringPayload(payload, 'zoneId') ??
    actor?.zoneId ??
    target?.zoneId;

  const exclude = new Set<string>([actorId]);
  if (targetId) exclude.add(targetId);

  const witnesses = zoneOccupants(world, zoneId)
    .filter((e) => !exclude.has(e.id) && isAlive(e))
    .map((e) => e.id);

  const state = readState(world);
  const journal = loadJournal(state);
  const actorName = (stringPayload(payload, 'defeatedByName') ?? actor?.name ?? actorId);
  const targetName =
    (category === 'kill' ? stringPayload(payload, 'entityName') : undefined) ?? target?.name ?? targetId;

  const record = journal.record({
    tick: event.tick,
    category,
    actorId,
    ...(targetId ? { targetId } : {}),
    ...(zoneId ? { zoneId } : {}),
    description: describeEvent(category, actorName, targetName),
    significance: significanceFor(category),
    witnesses,
    data: { eventType: event.type },
  });

  const banks: Record<string, NpcMemoryState> = { ...state.banks };

  const persistBank = (bank: NpcMemoryBank) => {
    banks[bank.entityId] = bank.serialize();
  };

  if (targetId && target && target.type !== 'player') {
    const bank = loadBank(state, targetId, config.memory);
    bank.remember(record, record.significance, emotionalCharge(category, 'target'));
    applyRelationshipEffect(bank, record, 'target');
    persistBank(bank);
  }

  for (const witnessId of witnesses) {
    const bank = loadBank(state, witnessId, config.memory);
    bank.remember(record, record.significance * 0.8, emotionalCharge(category, 'witness'));
    applyRelationshipEffect(bank, record, 'witness');
    persistBank(bank);
  }

  writeState(world, { journal: journal.serialize(), banks });
}

/**
 * Live campaign-memory EngineModule. Opt-in: a pack adds this to its module
 * list to journal kills/gifts/rescues/betrayals with zone witnesses and to
 * move the four-axis relationship model during play.
 *
 * Does NOT call consolidate (F-c1949ae0 — decay-clock overwrite — left to a
 * later health amend).
 */
export function createCampaignMemoryCore(config: CampaignMemoryCoreConfig = {}): EngineModule {
  return {
    id: 'campaign-memory-core',
    version: '1.0.0',

    register(ctx) {
      ctx.persistence.registerNamespace(CAMPAIGN_MEMORY_STATE_KEY, {
        journal: { version: CAMPAIGN_MEMORY_VERSION, records: [] },
        banks: {},
      } satisfies CampaignMemoryModuleState);

      for (const type of Object.keys(EVENT_CATEGORY)) {
        const category = EVENT_CATEGORY[type]!;
        ctx.events.on(type, (event, world) => {
          recordLiveEvent(world, event, category, config);
        });
      }
    },
  };
}
