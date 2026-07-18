// narrative-authority — the narrator can lie, conceal, and distort

import type {
  EngineModule,
  ResolvedEvent,
  EventChannel,
} from '@ai-rpg-engine/core';
import { PresentationChannels, type ChannelFilter, type PresentedEvent } from '@ai-rpg-engine/core';

export type NarratorPersonality = {
  /** Narrator voice name */
  voice: string;
  /** Base distortion level 0-1. 0 = truthful, 1 = fully unreliable */
  distortion: number;
  /** Event types the narrator will try to conceal */
  conceals?: string[];
  /** Event types the narrator will distort */
  distorts?: string[];
  /** Custom filter for narrator channel */
  filter?: ChannelFilter;
};

export type NarrativeAuthorityState = {
  objectiveLog: ResolvedEvent[];
  presentedLog: PresentedEvent[];
  contradictions: Contradiction[];
  revealedTruths: string[];
};

export type Contradiction = {
  eventId: string;
  objectiveType: string;
  presentedType: string;
  field?: string;
  objectiveValue: unknown;
  presentedValue: unknown;
  discovered: boolean;
  discoveredAtTick?: number;
};

/**
 * Objective log ring-buffer cap. Every other comparable trace log in this
 * package caps its buffer (combat-review.ts's `traces`, ability-review.ts's
 * `traces`); objectiveLog previously had none and grew unboundedly for the
 * life of the process (F-fe16be5e).
 */
const DEFAULT_MAX_OBJECTIVE_LOG = 500;

export function createNarrativeAuthority(
  channels: PresentationChannels,
  personality?: NarratorPersonality,
): EngineModule {
  // Registration-time default only — NEVER mutated directly by game logic.
  // The live, per-world copy is world.modules['narrative-authority'], a
  // structuredClone taken from this object when the namespace initializes
  // (see ModuleManager.initializeNamespaces). Every event handler below
  // re-fetches that live copy fresh instead of closing over this reference,
  // matching the pattern every other stateful module in this package uses
  // (rumor-propagation.ts's getRumorState, district-core.ts's
  // getModuleState, ...). Writing to this closure directly instead — as this
  // module used to — silently diverged from world.modules from the very
  // first event (registerNamespace clones, it doesn't alias), and a
  // save/reload made the divergence permanent (F-fe16be5e).
  const defaultState: NarrativeAuthorityState = {
    objectiveLog: [],
    presentedLog: [],
    contradictions: [],
    revealedTruths: [],
  };

  return {
    id: 'narrative-authority',
    version: '0.1.0',

    register(ctx) {
      ctx.persistence.registerNamespace('narrative-authority', defaultState);

      // Install narrator filter on the narrator channel
      if (personality?.filter) {
        channels.addFilter('narrator', personality.filter);
      }

      // Default concealment: suppress events the narrator wants hidden
      if (personality?.conceals?.length) {
        channels.addFilter('narrator', (event) => {
          if (personality.conceals!.includes(event.type)) {
            return null; // Suppressed — the narrator hides this
          }
          return event;
        });
      }

      // Default distortion: modify events the narrator wants to twist
      if (personality?.distorts?.length) {
        channels.addFilter('narrator', (event) => {
          if (!personality.distorts!.includes(event.type)) return event;

          // Apply distortion: clone and mark as distorted
          return {
            ...event,
            payload: { ...event.payload, _narratorDistorted: true },
            tags: [...(event.tags ?? []), 'narrator-distorted'],
          };
        });
      }

      // Listen to all events and track objective truth. Re-fetch the LIVE
      // state from world.modules on every event (F-fe16be5e) — see the note
      // on defaultState above for why.
      ctx.events.on('*', (event, world) => {
        const state = (world.modules['narrative-authority'] ?? defaultState) as NarrativeAuthorityState;
        state.objectiveLog.push(event);
        if (state.objectiveLog.length > DEFAULT_MAX_OBJECTIVE_LOG) {
          state.objectiveLog.shift();
        }
      });
    },

    init() {
      // After all modules registered, nothing extra needed
    },
  };
}

/** Record what the player was shown vs what really happened */
export function recordPresentation(
  state: NarrativeAuthorityState,
  objective: ResolvedEvent,
  presented: PresentedEvent[],
): void {
  state.presentedLog.push(...presented);

  // Detect contradictions
  for (const p of presented) {
    if (p._filtered && p._channel === 'narrator') {
      const contradiction: Contradiction = {
        eventId: objective.id,
        objectiveType: objective.type,
        presentedType: p.type,
        objectiveValue: objective.payload,
        presentedValue: p.payload,
        discovered: false,
      };

      // Check if payload was actually changed
      if (JSON.stringify(objective.payload) !== JSON.stringify(p.payload)) {
        state.contradictions.push(contradiction);
      }
    }
  }
}

/** Reveal a truth — mark a contradiction as discovered */
export function revealTruth(
  state: NarrativeAuthorityState,
  eventId: string,
  tick: number,
): Contradiction | undefined {
  const contradiction = state.contradictions.find(
    (c) => c.eventId === eventId && !c.discovered,
  );
  if (contradiction) {
    contradiction.discovered = true;
    contradiction.discoveredAtTick = tick;
    state.revealedTruths.push(eventId);
  }
  return contradiction;
}

/** Get all undiscovered contradictions */
export function getHiddenTruths(state: NarrativeAuthorityState): Contradiction[] {
  return state.contradictions.filter((c) => !c.discovered);
}

/** Get all discovered contradictions */
export function getRevealedTruths(state: NarrativeAuthorityState): Contradiction[] {
  return state.contradictions.filter((c) => c.discovered);
}
