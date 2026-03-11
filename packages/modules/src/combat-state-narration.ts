/**
 * Combat State Narration — enriches status events with human-readable text.
 *
 * Listens for status.applied, status.removed, and status.expired on the
 * 4 visible combat states and patches description text + narrator channel
 * onto the event. Purely additive — combat works without this module.
 */

import type {
  EngineModule,
  ResolvedEvent,
  WorldState,
} from '@ai-rpg-engine/core';
import { COMBAT_STATES } from './combat-core.js';

// ---------------------------------------------------------------------------
// Text templates (genre-neutral, factual)
// ---------------------------------------------------------------------------

const STATE_TEXT: Record<string, { applied: string; removed: string; expired: string }> = {
  [COMBAT_STATES.GUARDED]: {
    applied: 'raises their guard',
    removed: 'guard drops',
    expired: 'guard stance fades',
  },
  [COMBAT_STATES.OFF_BALANCE]: {
    applied: 'is thrown off balance',
    removed: 'recovers their footing',
    expired: 'steadies themselves',
  },
  [COMBAT_STATES.EXPOSED]: {
    applied: 'is left exposed',
    removed: 'is no longer exposed',
    expired: 'regains composure',
  },
  [COMBAT_STATES.FLEEING]: {
    applied: 'breaks away and flees',
    removed: 'stops fleeing',
    expired: 'slows their retreat',
  },
};

// ---------------------------------------------------------------------------
// Module factory
// ---------------------------------------------------------------------------

export function createCombatStateNarration(): EngineModule {
  return {
    id: 'combat-state-narration',
    version: '1.0.0',
    dependsOn: ['status-core', 'combat-core'],

    register(ctx) {
      const handler = (eventType: 'applied' | 'removed' | 'expired') =>
        (event: ResolvedEvent, world: WorldState) => {
          const statusId = event.payload.statusId as string;
          const text = STATE_TEXT[statusId];
          if (!text) return; // not a combat state — ignore

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

      // Companion interception narration
      const INTERCEPT_TEXT = [
        'steps in front of {target}, taking the blow',
        'throws themselves between {target} and the attack',
      ];
      const HEROIC_INTERCEPT_TEXT = [
        'staggers forward to shield {target}, barely standing',
        'throws their battered body in the way, protecting {target}',
      ];
      ctx.events.on('combat.companion.intercepted', (event: ResolvedEvent) => {
        const interceptorName = (event.payload.interceptorName as string) ?? 'Unknown';
        const targetName = (event.payload.targetName as string) ?? 'Unknown';
        const hpBefore = event.payload.interceptorHpBefore as number;
        const maxHp = (event.payload.interceptorMaxHp as number) ?? 20;
        const heroic = maxHp > 0 && hpBefore / maxHp < 0.3;
        const templates = heroic ? HEROIC_INTERCEPT_TEXT : INTERCEPT_TEXT;
        const template = templates[event.tick % templates.length];
        event.payload.description = `${interceptorName} ${template.replace('{target}', targetName)}`;
        event.presentation = {
          channels: ['narrator'],
          priority: heroic ? 'high' : 'normal',
        };
      });

      // Guard breakthrough: brute force smashes through defense
      const GUARD_BREAK_TEXT = [
        'smashes through {target}\'s guard',
        'overpowers {target}\'s defense with brute force',
      ];
      ctx.events.on('combat.guard.broken', (event: ResolvedEvent) => {
        const attackerName = (event.payload.attackerName as string) ?? 'Unknown';
        const targetName = (event.payload.targetName as string) ?? 'Unknown';
        const template = GUARD_BREAK_TEXT[event.tick % GUARD_BREAK_TEXT.length];
        event.payload.description = `${attackerName} ${template.replace('{target}', targetName)}`;
        event.presentation = { channels: ['narrator'], priority: 'high' };
      });
    },
  };
}
