/**
 * Canonical list of core and built-in module simulation event types
 * documented in docs/handbook/appendix-a-event-vocabulary.md.
 */
export const ENGINE_EVENT_TYPES = [
  // Core (traversal)
  'world.zone.entered',
  'world.zone.exited',
  // Combat (combat-core / cognition-core)
  'combat.contact.hit',
  'combat.contact.missed',
  'combat.damage.applied',
  'combat.entity.defeated',
  'combat.guard.start',
  'combat.guard.absorbed',
  'combat.disengage.success',
  'combat.disengage.fail',
  'combat.companion.intercepted',
  'combat.morale.shift',
  'combat.will.hold',
  // Status (status-core)
  'status.applied',
  'status.tick',
  'status.expired',
  // Dialogue (dialogue-core)
  'dialogue.started',
  'dialogue.node.entered',
  'dialogue.choice.selected',
  'dialogue.ended',
  // Environment (environment-core)
  'environment.noise.changed',
  'environment.hazard.triggered',
  'environment.tick',
  // Cognition (cognition-core)
  'cognition.belief.updated',
  'cognition.intent.selected',
  // Perception (perception-filter)
  'perception.detected',
  'perception.missed',
  // Progression (progression-core)
  'progression.currency.earned',
  'progression.node.unlocked',
  // Faction (faction-cognition)
  'faction.belief.updated',
  'faction.alert.changed',
  // Rumor (rumor-propagation)
  'rumor.belief.propagated',
  'rumor.scheduled',
  // District (district-core)
  'district.metric.changed',
  'district.alert.triggered',
  // Presentation (channels / narrative-authority)
  'audio.cue.requested',
  'narrative.concealed',
  'narrative.distorted',
  'narrative.revealed',
] as const;

export type EngineEventType = (typeof ENGINE_EVENT_TYPES)[number];
