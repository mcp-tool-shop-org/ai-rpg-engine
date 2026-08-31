// memory-core — the live write side of campaign-memory (F-6594b19b).
//
// NpcMemoryBank, applyRelationshipEffect, and CampaignJournal shipped as a
// complete, tested library with ZERO production callers: the CLI rebuilds a
// throwaway journal from the event log at endgame (witnesses always []), and
// remember() / applyRelationshipEffect appear only in this package's tests.
// This module is the missing EngineModule — same inject-and-persist pattern
// as createItemChronicleCore.
//
// OPT-IN. Subscribe to combat/kill/gift/rescue/betrayal plus the live engine
// events that already exist (item.acquired/item.lost, companion join/leave,
// opportunity.*, death on combat.entity.defeated), journal.record with zone
// occupants as witnesses, bank.remember + applyRelationshipEffect per
// witness/target, copy attitude onto EntityState.relations, persist via
// registerNamespace so Engine.serialize round-trips it.
//
// Distinct from still-open F-c1949ae0 (consolidate overwrites MemoryFragment.tick)
// — this file never calls consolidate.

import type { EngineModule, EntityState, ResolvedEvent, ScalarValue, WorldState } from '@ai-rpg-engine/core';
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

/**
 * Live engine events → RecordCategory. combat.entity.defeated journals both
 * kill (killer's deed) and death (victim's fate for buildFinaleOutline).
 * item.acquired with a fromEntityId is a give (inventory-core), which must
 * move gift-trust; a bare pickup is item-acquired.
 * world.zone.entered → discovery and progression.node.unlocked → action so
 * first-visits and tree unlocks reach the live journal (F-0df0c914).
 *
 * F-c1949ae0 (consolidate) is still not called from this file.
 */
const EVENT_CATEGORY: Record<string, RecordCategory | readonly RecordCategory[]> = {
  'combat.entity.defeated': ['kill', 'death'],
  'campaign.kill': 'kill',
  'campaign.gift': 'gift',
  'item.gifted': 'gift',
  'social.gift': 'gift',
  'item.acquired': 'item-acquired',
  'item.lost': 'item-lost',
  'campaign.rescue': 'rescue',
  'social.rescue': 'rescue',
  'campaign.betrayal': 'betrayal',
  'social.betrayal': 'betrayal',
  'companion.recruited': 'companion-joined',
  'companion.joined': 'companion-joined',
  'companion.departed': 'companion-departed',
  'opportunity.accepted': 'opportunity-accepted',
  'opportunity.completed': 'opportunity-completed',
  'opportunity.abandoned': 'opportunity-abandoned',
  'opportunity.expired': 'opportunity-failed',
  'opportunity.failed': 'opportunity-failed',
  'world.zone.entered': 'discovery',
  'progression.node.unlocked': 'action',
};

function categoriesFor(event: ResolvedEvent): RecordCategory[] {
  if (event.type === 'item.acquired') {
    const fromId = event.payload?.fromEntityId;
    return [typeof fromId === 'string' && fromId.length > 0 ? 'gift' : 'item-acquired'];
  }
  const mapped = EVENT_CATEGORY[event.type];
  if (!mapped) return [];
  return typeof mapped === 'string' ? [mapped] : [...mapped];
}

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
  if (category === 'death') return `${targetName ?? 'someone'} died`;
  if (category === 'gift') return `${actorName} gave a gift${targetName ? ` to ${targetName}` : ''}`;
  if (category === 'rescue') return `${actorName} rescued ${targetName ?? 'someone'}`;
  if (category === 'betrayal') return `${actorName} betrayed ${targetName ?? 'someone'}`;
  if (category === 'companion-joined') return `${targetName ?? actorName} joined the party`;
  if (category === 'companion-departed') return `${targetName ?? actorName} left the party`;
  if (category === 'item-acquired') return `${actorName} acquired an item`;
  if (category === 'item-lost') return `${actorName} lost an item`;
  if (category === 'discovery') return `${actorName} entered ${targetName ?? 'a new place'}`;
  if (category === 'action') return `${actorName} unlocked ${targetName ?? 'an advancement'}`;
  return `${actorName} — ${category}`;
}

function significanceFor(category: RecordCategory): number {
  if (category === 'kill' || category === 'betrayal' || category === 'death') return 0.9;
  if (category === 'rescue' || category === 'companion-joined' || category === 'companion-departed') return 0.8;
  if (category === 'gift' || category === 'opportunity-completed') return 0.6;
  return 0.5;
}

function emotionalCharge(category: RecordCategory, perspective: 'target' | 'witness'): number {
  const base =
    category === 'kill' || category === 'betrayal' || category === 'death' || category === 'companion-departed'
      ? -0.8
      : category === 'rescue' || category === 'gift' || category === 'companion-joined' || category === 'opportunity-completed'
        ? 0.6
        : 0;
  return perspective === 'witness' ? base * 0.5 : base;
}

function resolveActorTarget(
  event: ResolvedEvent,
  category: RecordCategory,
): { actorId: string | undefined; targetId: string | undefined } {
  const payload = event.payload ?? {};
  const npcId = stringPayload(payload, 'npcId');
  const fromId = stringPayload(payload, 'fromEntityId');
  const toId = stringPayload(payload, 'toEntityId');
  const entityId = stringPayload(payload, 'entityId');

  if (category === 'kill' || category === 'death') {
    return {
      actorId: stringPayload(payload, 'defeatedBy') ?? event.actorId ?? stringPayload(payload, 'actorId'),
      targetId: entityId ?? stringPayload(payload, 'targetId'),
    };
  }

  if (category === 'gift' || category === 'item-acquired' || category === 'item-lost') {
    if (fromId) {
      return { actorId: fromId, targetId: entityId ?? toId ?? event.actorId };
    }
    if (category === 'item-lost') {
      return { actorId: entityId ?? event.actorId ?? stringPayload(payload, 'actorId'), targetId: toId };
    }
    return {
      actorId: event.actorId ?? stringPayload(payload, 'actorId') ?? entityId,
      targetId: stringPayload(payload, 'targetId') ?? toId,
    };
  }

  if (category === 'companion-joined' || category === 'companion-departed') {
    return {
      actorId: event.actorId ?? stringPayload(payload, 'actorId'),
      targetId: npcId ?? stringPayload(payload, 'targetId'),
    };
  }

  // Zone-enter / node-unlock: the mover/unlocker is the actor. Live
  // world.zone.entered sometimes stamps entityId as the player — that is
  // not a journal target (F-0df0c914).
  if (category === 'discovery' || category === 'action') {
    return {
      actorId: event.actorId ?? stringPayload(payload, 'actorId') ?? entityId,
      targetId: stringPayload(payload, 'targetId') ?? npcId,
    };
  }

  return {
    actorId: event.actorId ?? stringPayload(payload, 'actorId') ?? stringPayload(payload, 'defeatedBy'),
    targetId: stringPayload(payload, 'targetId') ?? npcId ?? entityId,
  };
}

/**
 * Mirror four-axis NPC attitude onto EntityState so cognition/HUD can read
 * it without importing this package (F-d1973aae). Compact: relations[subject]
 * is trust; the other axes live under custom['rel.<subject>.<axis>'].
 */
function copyAttitude(bank: NpcMemoryBank, world: WorldState): void {
  const entity = world.entities[bank.entityId];
  if (!entity) return;
  const relations: Record<string, ScalarValue> = { ...(entity.relations ?? {}) };
  const custom: Record<string, ScalarValue> = { ...(entity.custom ?? {}) };
  for (const subjectId of bank.knownSubjects()) {
    const rel = bank.getRelationship(subjectId);
    relations[subjectId] = rel.trust;
    custom[`rel.${subjectId}.trust`] = rel.trust;
    custom[`rel.${subjectId}.fear`] = rel.fear;
    custom[`rel.${subjectId}.admiration`] = rel.admiration;
    custom[`rel.${subjectId}.familiarity`] = rel.familiarity;
  }
  entity.relations = relations;
  entity.custom = custom;
}

/** Compact PEOPLE lines: "Guard → Aldric: trust -0.15, fear 0.25". */
export function formatNpcAttitudes(world: WorldState): string[] {
  const state = peekState(world);
  if (!state) return [];
  const lines: string[] = [];
  for (const entityId of Object.keys(state.banks).sort()) {
    const bank = getNpcMemory(world, entityId);
    if (!bank) continue;
    const name = world.entities[entityId]?.name ?? entityId;
    for (const subjectId of bank.knownSubjects().sort()) {
      const rel = bank.getRelationship(subjectId);
      const subject = world.entities[subjectId]?.name ?? subjectId;
      lines.push(
        `${name} → ${subject}: trust ${rel.trust.toFixed(2)}, fear ${rel.fear.toFixed(2)}, admiration ${rel.admiration.toFixed(2)}, familiarity ${rel.familiarity.toFixed(2)}`,
      );
    }
  }
  return lines;
}

function recordLiveEvent(
  world: WorldState,
  event: ResolvedEvent,
  category: RecordCategory,
  config: CampaignMemoryCoreConfig,
): void {
  const payload = event.payload ?? {};
  const { actorId, targetId } = resolveActorTarget(event, category);
  if (!actorId) return;

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
    category === 'discovery'
      ? (stringPayload(payload, 'zoneName') ?? stringPayload(payload, 'zoneId') ?? target?.name)
      : category === 'action'
        ? (stringPayload(payload, 'nodeId') ?? stringPayload(payload, 'treeId') ?? target?.name)
        : (category === 'kill' || category === 'death' ? stringPayload(payload, 'entityName') : undefined) ??
          stringPayload(payload, 'npcName') ??
          stringPayload(payload, 'toName') ??
          target?.name ??
          targetId;

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
    copyAttitude(bank, world);
    persistBank(bank);
  }

  for (const witnessId of witnesses) {
    const bank = loadBank(state, witnessId, config.memory);
    bank.remember(record, record.significance * 0.8, emotionalCharge(category, 'witness'));
    applyRelationshipEffect(bank, record, 'witness');
    copyAttitude(bank, world);
    persistBank(bank);
  }

  writeState(world, { journal: journal.serialize(), banks });
}

/**
 * Live campaign-memory EngineModule. Opt-in: a pack adds this to its module
 * list to journal kills/gifts/rescues/betrayals plus live item/companion/
 * opportunity/death/discovery/unlock events with zone witnesses and to move
 * the four-axis relationship model during play.
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
        ctx.events.on(type, (event, world) => {
          for (const category of categoriesFor(event)) {
            recordLiveEvent(world, event, category, config);
          }
        });
      }
    },
  };
}
