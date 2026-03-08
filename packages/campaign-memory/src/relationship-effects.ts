// Default relationship effects — maps event categories to relationship deltas

import type { RecordCategory, RelationshipAxes, CampaignRecord } from './types.js';
import type { NpcMemoryBank } from './memory-bank.js';

/** Default relationship deltas per event category (from target's perspective) */
export const DEFAULT_RELATIONSHIP_EFFECTS: Record<RecordCategory, Partial<RelationshipAxes>> = {
  action:    {},
  combat:    { trust: -0.1, fear: 0.2 },
  kill:      { trust: -0.3, fear: 0.5, admiration: -0.1 },
  betrayal:  { trust: -0.5, admiration: -0.2 },
  gift:      { trust: 0.2, admiration: 0.1, familiarity: 0.1 },
  theft:     { trust: -0.3 },
  debt:      { trust: -0.1 },
  discovery: {},
  alliance:  { trust: 0.3, familiarity: 0.2 },
  insult:    { trust: -0.1, admiration: -0.2 },
  rescue:    { trust: 0.4, admiration: 0.3, fear: -0.1 },
  death:     { fear: 0.3 },
  'companion-joined':       { trust: 0.2, familiarity: 0.2, admiration: 0.1 },
  'companion-departed':     { trust: -0.2, familiarity: 0.1 },
  'companion-betrayed':     { trust: -0.5, admiration: -0.2, fear: 0.1 },
  'companion-saved-player': { trust: 0.4, admiration: 0.4, familiarity: 0.2 },
  'companion-died':         { fear: 0.2, admiration: 0.1 },
  'item-acquired':          {},
  'item-lost':              {},
  'item-recognized':        { familiarity: 0.1 },
  'item-transformed':       { admiration: 0.1 },
  'opportunity-accepted':   { trust: 0.1, familiarity: 0.1 },
  'opportunity-completed':  { trust: 0.2, admiration: 0.2 },
  'opportunity-failed':     { trust: -0.1 },
  'opportunity-abandoned':  { trust: -0.2, admiration: -0.1 },
  'endgame-detected':       {},
  'campaign-concluded':     {},
};

/**
 * Apply default relationship effects for a campaign event.
 *
 * The `perspective` parameter controls how the deltas are applied:
 * - `actor`: This NPC performed the action → familiarity increases
 * - `target`: This NPC was the target → full default deltas apply
 * - `witness`: This NPC observed the action → reduced deltas (50%)
 */
export function applyRelationshipEffect(
  bank: NpcMemoryBank,
  record: CampaignRecord,
  perspective: 'actor' | 'target' | 'witness',
): void {
  const baseDelta = DEFAULT_RELATIONSHIP_EFFECTS[record.category];
  if (!baseDelta || Object.keys(baseDelta).length === 0) return;

  // Determine whose relationship is being affected
  const subjectId = perspective === 'actor'
    ? record.targetId
    : record.actorId;

  if (!subjectId) return;

  // Scale deltas by perspective
  const scale = perspective === 'witness' ? 0.5 : 1.0;
  const scaled: Partial<RelationshipAxes> = {};

  for (const [key, value] of Object.entries(baseDelta)) {
    if (value !== undefined) {
      (scaled as any)[key] = value * scale;
    }
  }

  // For actors, always increase familiarity slightly
  if (perspective === 'actor') {
    scaled.familiarity = (scaled.familiarity ?? 0) + 0.05;
  }

  bank.adjustRelationship(subjectId, scaled);
}
