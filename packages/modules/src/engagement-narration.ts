/**
 * Engagement Narration — enriches engagement status events with human-readable text.
 *
 * Listens for status.applied, status.removed, and status.expired on the
 * 4 engagement states and patches description text + narrator channel
 * onto the event. Purely additive — engagement-core works without this module.
 */

import type {
  EngineModule,
  ResolvedEvent,
  WorldState,
} from '@ai-rpg-engine/core';
import { ENGAGEMENT_STATES } from './engagement-core.js';

// ---------------------------------------------------------------------------
// Text templates (genre-neutral, factual)
// ---------------------------------------------------------------------------

const STATE_TEXT: Record<string, { applied: string; removed: string; expired: string }> = {
  [ENGAGEMENT_STATES.ENGAGED]: {
    applied: 'closes to melee range',
    removed: 'breaks free from melee',
    expired: 'disengages from close combat',
  },
  [ENGAGEMENT_STATES.PROTECTED]: {
    applied: 'is shielded by an ally',
    removed: 'loses their protector',
    expired: 'protection fades',
  },
  [ENGAGEMENT_STATES.BACKLINE]: {
    applied: 'holds the backline',
    removed: 'is pulled from the backline',
    expired: 'backline position shifts',
  },
  [ENGAGEMENT_STATES.ISOLATED]: {
    applied: 'is cut off from allies',
    removed: 'rejoins their allies',
    expired: 'isolation ends',
  },
};

// ---------------------------------------------------------------------------
// Module factory
// ---------------------------------------------------------------------------

export function createEngagementNarration(): EngineModule {
  return {
    id: 'engagement-narration',
    version: '1.0.0',
    dependsOn: ['status-core', 'engagement-core'],

    register(ctx) {
      const handler = (eventType: 'applied' | 'removed' | 'expired') =>
        (event: ResolvedEvent, world: WorldState) => {
          const statusId = event.payload.statusId as string;
          const text = STATE_TEXT[statusId];
          if (!text) return; // not an engagement state — ignore

          const entityId = event.actorId ?? (event.payload.entityId as string);
          const entity = entityId ? world.entities[entityId] : undefined;
          const name = entity?.name ?? entityId ?? 'Unknown';

          event.payload.description = `${name} ${text[eventType]}`;
          event.presentation = {
            channels: ['narrator'],
            priority: 'low',
          };
        };

      ctx.events.on('status.applied', handler('applied'));
      ctx.events.on('status.removed', handler('removed'));
      ctx.events.on('status.expired', handler('expired'));
    },
  };
}
