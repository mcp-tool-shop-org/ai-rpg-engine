/**
 * Canonical list of simulation event types emitted via `makeEvent`,
 * `makeCognitionEvent`, and `makeStatusEvent` across package and template
 * source, matching docs/handbook/appendix-a-event-vocabulary.md.
 *
 * This list is complete for those three emission helpers because the
 * source-scan test in packages/core/src/event-vocabulary.test.ts enforces
 * exact parity against the codebase and both appendix tables.
 */
export const ENGINE_EVENT_TYPES = [
  // World & action (traversal-core, dialogue-core, action rejection)
  'action.rejected',
  'world.entity.inspected',
  'world.flag.changed',
  'world.zone.entered',
  'world.zone.gate.refused',
  'world.zone.gate.warned',
  'world.zone.inspected',
  // Combat & resources (combat-core, combat-tactics, cognition-core, ability-core)
  'combat.brace.stabilized',
  'combat.brace.start',
  'combat.companion.intercepted',
  'combat.contact.hit',
  'combat.contact.miss',
  'combat.counter.off_balance',
  'combat.damage.applied',
  'combat.disengage.fail',
  'combat.disengage.success',
  'combat.entity.defeated',
  'combat.guard.absorbed',
  'combat.guard.broken',
  'combat.guard.start',
  'combat.morale.flee',
  'combat.morale.rout',
  'combat.morale.shift',
  'combat.reposition.fail',
  'combat.reposition.guard_broken',
  'combat.reposition.outflank',
  'combat.reposition.success',
  'combat.will.hold',
  'resource.changed',
  // Abilities (ability-core, ability-effects)
  'ability.check.failed',
  'ability.damage.applied',
  'ability.effect.unknown',
  'ability.heal.applied',
  'ability.rejected',
  'ability.resolved',
  'ability.resource.modified',
  'ability.stat.modified',
  'ability.status.applied',
  'ability.status.immune',
  'ability.status.removed',
  'ability.status.resisted',
  'ability.status.unregistered',
  'ability.status.vulnerable',
  'ability.used',
  // Statuses (status-core)
  'status.applied',
  'status.expired',
  'status.removed',
  'status.stacked',
  // Dialogue, reputation & leverage (dialogue-core, player-leverage)
  'dialogue.choice.selected',
  'dialogue.effect.unknown',
  'dialogue.ended',
  'dialogue.node.entered',
  'dialogue.started',
  'leverage.adjusted',
  'leverage.resolved',
  'reputation.adjusted',
  'rumor.seeded',
  // Inventory, equipment, crafting & trade (inventory-core, equipment-core, crafting-recipes, trade-core, item-recognition)
  'inventory.item.received',
  'item.acquired',
  'item.already-equipped',
  'item.bought',
  'item.crafted',
  'item.equipped',
  'item.given',
  'item.lost',
  'item.modified',
  'item.recognized',
  'item.repaired',
  'item.salvaged',
  'item.sold',
  'item.unequipped',
  'item.used',
  // Companions (companion-core, item-recognition, player-leverage, world-tick)
  'companion.departed',
  'companion.reaction',
  'companion.recruited',
  // Opportunities & pressures (opportunity-resolution, player-leverage, world-tick)
  // opportunity.abandoned / .betrayed / .completed are emitted dynamically via
  // `opportunity.${resolutionType}` over OpportunityResolutionType in opportunity-resolution.ts.
  'opportunity.abandoned',
  'opportunity.accepted',
  'opportunity.betrayed',
  'opportunity.completed',
  'pressure.resolved',
  'pressure.spawned',
  // Merchant contracts (starter-merchant contract-core)
  'merchant.audit.requested',
  'merchant.contract.consigned',
  'merchant.item.appraised',
  'merchant.price.haggled',
  'merchant.risk.underwritten',
] as const;

export type EngineEventType = (typeof ENGINE_EVENT_TYPES)[number];
