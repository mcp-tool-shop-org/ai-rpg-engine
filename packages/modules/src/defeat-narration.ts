/**
 * Defeat Narration — enriches defeat-related events with human-readable text.
 *
 * Listens for combat.entity.defeated, combat.morale.flee, combat.morale.rout,
 * and combat.frontline.collapsed, patching description text + narrator channel
 * onto each event. Purely additive — combat works without this module.
 */

import type {
  EngineModule,
  ResolvedEvent,
  WorldState,
} from '@ai-rpg-engine/core';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export type DefeatNarrationConfig = {
  /** Map entity tags to custom defeat text arrays. First matching tag wins. */
  packFlavor?: Record<string, string[]>;
};

// ---------------------------------------------------------------------------
// Default text templates (genre-neutral, factual)
// ---------------------------------------------------------------------------

const DEFEAT_TEXT = [
  '{name} falls',
  '{name} crumples',
  '{name} is defeated',
];

const FLEE_TEXT = [
  '{name} breaks under pressure and flees',
  '{name} panics and tries to run',
  '{name} loses their nerve and retreats',
];

const ROUT_TEXT = [
  '{name} panics, alone and surrounded',
  '{name} is overwhelmed with no allies in sight',
];

const COLLAPSE_TEXT = [
  'The front line crumbles — backliners are exposed',
  'The last defender falls — the backline is unprotected',
];

// ---------------------------------------------------------------------------
// Module factory
// ---------------------------------------------------------------------------

export function createDefeatNarration(config: DefeatNarrationConfig = {}): EngineModule {
  const { packFlavor = {} } = config;

  return {
    id: 'defeat-narration',
    version: '1.0.0',
    dependsOn: ['combat-core'],

    register(ctx) {
      ctx.events.on('combat.entity.defeated', (event: ResolvedEvent, world: WorldState) => {
        const name = (event.payload.entityName as string) ?? 'Unknown';
        const entityId = event.payload.entityId as string;
        const entity = entityId ? world.entities[entityId] : undefined;

        // Check pack flavor first
        let templates = DEFEAT_TEXT;
        if (entity) {
          for (const tag of entity.tags) {
            if (packFlavor[tag]) {
              templates = packFlavor[tag];
              break;
            }
          }
        }

        const template = templates[event.tick % templates.length];
        event.payload.description = template.replace('{name}', name);
        event.presentation = {
          ...event.presentation,
          channels: ['narrator', 'objective'],
          priority: 'critical',
        };
      });

      ctx.events.on('combat.morale.flee', (event: ResolvedEvent, world: WorldState) => {
        const name = (event.payload.entityName as string) ?? 'Unknown';
        const template = FLEE_TEXT[event.tick % FLEE_TEXT.length];
        event.payload.description = template.replace('{name}', name);
        event.presentation = {
          channels: ['narrator'],
          priority: 'high',
        };
      });

      ctx.events.on('combat.morale.rout', (event: ResolvedEvent, world: WorldState) => {
        const name = (event.payload.entityName as string) ?? 'Unknown';
        const template = ROUT_TEXT[event.tick % ROUT_TEXT.length];
        event.payload.description = template.replace('{name}', name);
        event.presentation = {
          channels: ['narrator'],
          priority: 'high',
        };
      });

      ctx.events.on('combat.frontline.collapsed', (event: ResolvedEvent) => {
        const template = COLLAPSE_TEXT[event.tick % COLLAPSE_TEXT.length];
        event.payload.description = template;
        event.presentation = {
          channels: ['narrator', 'objective'],
          priority: 'high',
        };
      });
    },
  };
}
